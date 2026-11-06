import os
import sys
import time
import tempfile
import subprocess
import logging
from typing import Dict, Any, List, Optional
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Judge0 language ID mappings (standard Judge0 CE language IDs)
JUDGE0_LANGUAGE_IDS = {
    "python": 71,  # Python (3.8.1) / Python 3
    "python3": 71,
    "java": 62,    # Java (OpenJDK 13/17)
    "javascript": 63,  # JavaScript (Node.js 12.14.0)
    "js": 63,
    "node": 63,
    "cpp": 54,     # C++ (GCC 9.2.0)
    "c++": 54,
    "c": 50,       # C (GCC 9.2.0)
    "sql": 82,     # SQL (SQLite 3.27.2)
}


def is_safe_local_execution_permitted() -> bool:
    """
    Determines if running candidate code directly on the host using LocalExecutionAdapter
    is permitted. In production environments (DEBUG=False, not running automated tests),
    untrusted candidate code MUST NOT run unsandboxed on the host application server.
    """
    return bool(
        getattr(settings, "DEBUG", False)
        or getattr(settings, "TESTING", False)
        or ("test" in sys.argv)
    )


def normalize_code_output(text: Optional[str], mode: str = "trimmed") -> str:
    """
    Authoritative output comparison normalization policy:
    1. Line endings: CRLF (\r\n) and CR (\r) are converted to LF (\n).
    2. In 'trimmed' mode: Trailing whitespace is stripped from each line,
       and leading/trailing blank lines are stripped, preserving internal indentation.
    3. In 'exact' mode: Only line ending normalization is performed.
    """
    if text is None:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if mode == "exact":
        return text

    lines = [line.rstrip() for line in text.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


class Judge0Client:
    """
    Client for Judge0 code execution engine.
    Active when settings.JUDGE0_API_URL is configured.
    """
    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        self.api_url = (api_url or getattr(settings, "JUDGE0_API_URL", "")).rstrip("/")
        self.api_key = api_key or getattr(settings, "JUDGE0_API_KEY", "")

    def is_configured(self) -> bool:
        return bool(self.api_url)

    def execute(self, language: str, source_code: str, stdin: str = "", time_limit: float = 2.0, memory_limit_mb: int = 256) -> Dict[str, Any]:
        import requests
        lang_key = language.lower().strip()
        lang_id = JUDGE0_LANGUAGE_IDS.get(lang_key, 71)

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-Auth-Token"] = self.api_key
            headers["X-RapidAPI-Key"] = self.api_key

        payload = {
            "source_code": source_code,
            "language_id": lang_id,
            "stdin": stdin,
            "cpu_time_limit": time_limit,
            "memory_limit": memory_limit_mb * 1024,
        }

        try:
            resp = requests.post(f"{self.api_url}/submissions?wait=true", json=payload, headers=headers, timeout=15)
            if resp.status_code in [200, 201]:
                data = resp.json()
                status_id = data.get("status", {}).get("id", 0)
                # Judge0 Status IDs:
                # 3: Accepted, 4: Wrong Answer, 5: Time Limit Exceeded, 6: Compilation Error,
                # 7-12: Runtime Error
                verdict = "ACCEPTED"
                if status_id == 3:
                    verdict = "ACCEPTED"
                elif status_id == 4:
                    verdict = "WRONG_ANSWER"
                elif status_id == 5:
                    verdict = "TIME_LIMIT_EXCEEDED"
                elif status_id == 6:
                    verdict = "COMPILATION_ERROR"
                elif status_id in [7, 8, 9, 10, 11, 12]:
                    verdict = "RUNTIME_ERROR"
                elif status_id == 13:
                    verdict = "INTERNAL_ERROR"

                return {
                    "verdict": verdict,
                    "stdout": data.get("stdout") or "",
                    "stderr": data.get("stderr") or "",
                    "compile_output": data.get("compile_output") or "",
                    "execution_time_ms": float(data.get("time") or 0.0) * 1000.0,
                    "memory_used_kb": int(data.get("memory") or 0),
                    "is_sandboxed": True,
                }
            else:
                logger.warning("Judge0 submission failed with HTTP %s: %s", resp.status_code, resp.text)
                return {
                    "verdict": "INTERNAL_ERROR",
                    "stdout": "",
                    "stderr": f"Execution service error (HTTP {resp.status_code})",
                    "compile_output": "",
                    "execution_time_ms": 0.0,
                    "memory_used_kb": 0,
                    "is_sandboxed": True,
                }
        except Exception as e:
            logger.error("Error communicating with Judge0: %s", e)
            return {
                "verdict": "INTERNAL_ERROR",
                "stdout": "",
                "stderr": f"Execution service connection failure: {str(e)}",
                "compile_output": "",
                "execution_time_ms": 0.0,
                "memory_used_kb": 0,
                "is_sandboxed": False,
            }


class LocalExecutionAdapter:
    """
    Local runner for Python 3, Node.js, and Java execution in development/test environments.
    Executes in isolated temporary directories with strict timeouts.
    """

    @classmethod
    def execute_python(cls, source_code: str, stdin: str = "", time_limit: float = 2.0) -> Dict[str, Any]:
        with tempfile.TemporaryDirectory() as temp_dir:
            script_path = os.path.join(temp_dir, "solution.py")
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(source_code)

            start_t = time.perf_counter()
            try:
                proc = subprocess.run(
                    [sys.executable, script_path],
                    input=stdin,
                    text=True,
                    capture_output=True,
                    timeout=time_limit,
                    cwd=temp_dir,
                )
                elapsed_ms = (time.perf_counter() - start_t) * 1000.0

                if proc.returncode != 0:
                    stderr = proc.stderr or ""
                    if "SyntaxError" in stderr or "IndentationError" in stderr or "TabError" in stderr:
                        return {
                            "verdict": "COMPILATION_ERROR",
                            "stdout": proc.stdout or "",
                            "stderr": stderr,
                            "compile_output": stderr,
                            "execution_time_ms": elapsed_ms,
                            "memory_used_kb": 1024,
                            "is_sandboxed": False,
                        }
                    return {
                        "verdict": "RUNTIME_ERROR",
                        "stdout": proc.stdout or "",
                        "stderr": stderr,
                        "compile_output": "",
                        "execution_time_ms": elapsed_ms,
                        "memory_used_kb": 1024,
                        "is_sandboxed": False,
                    }

                return {
                    "verdict": "ACCEPTED",
                    "stdout": proc.stdout or "",
                    "stderr": proc.stderr or "",
                    "compile_output": "",
                    "execution_time_ms": elapsed_ms,
                    "memory_used_kb": 1024,
                    "is_sandboxed": False,
                }
            except subprocess.TimeoutExpired:
                elapsed_ms = (time.perf_counter() - start_t) * 1000.0
                return {
                    "verdict": "TIME_LIMIT_EXCEEDED",
                    "stdout": "",
                    "stderr": f"Time limit exceeded ({time_limit}s)",
                    "compile_output": "",
                    "execution_time_ms": elapsed_ms,
                    "memory_used_kb": 1024,
                    "is_sandboxed": False,
                }
            except Exception as e:
                return {
                    "verdict": "INTERNAL_ERROR",
                    "stdout": "",
                    "stderr": str(e),
                    "compile_output": "",
                    "execution_time_ms": 0.0,
                    "memory_used_kb": 0,
                    "is_sandboxed": False,
                }

    @classmethod
    def execute_java(cls, source_code: str, stdin: str = "", time_limit: float = 3.0) -> Dict[str, Any]:
        with tempfile.TemporaryDirectory() as temp_dir:
            import re
            match = re.search(r'public\s+class\s+([A-Za-z0-9_]+)', source_code)
            class_name = match.group(1) if match else "Solution"

            java_file = os.path.join(temp_dir, f"{class_name}.java")
            with open(java_file, "w", encoding="utf-8") as f:
                f.write(source_code)

            # Compile step
            compile_start = time.perf_counter()
            try:
                compile_proc = subprocess.run(
                    ["javac", "-J-Xmx256m", java_file],
                    capture_output=True,
                    text=True,
                    timeout=10,
                    cwd=temp_dir,
                )
                if compile_proc.returncode != 0:
                    return {
                        "verdict": "COMPILATION_ERROR",
                        "stdout": "",
                        "stderr": compile_proc.stderr or "",
                        "compile_output": compile_proc.stderr or "",
                        "execution_time_ms": (time.perf_counter() - compile_start) * 1000.0,
                        "memory_used_kb": 2048,
                        "is_sandboxed": False,
                    }
            except FileNotFoundError:
                return {
                    "verdict": "INTERNAL_ERROR",
                    "stdout": "",
                    "stderr": "Java SDK (javac) is not installed on host.",
                    "compile_output": "",
                    "execution_time_ms": 0.0,
                    "memory_used_kb": 0,
                    "is_sandboxed": False,
                }

            # Run step
            run_start = time.perf_counter()
            try:
                proc = subprocess.run(
                    ["java", "-Xmx256m", class_name],
                    input=stdin,
                    text=True,
                    capture_output=True,
                    timeout=time_limit,
                    cwd=temp_dir,
                )
                elapsed_ms = (time.perf_counter() - run_start) * 1000.0

                if proc.returncode != 0:
                    return {
                        "verdict": "RUNTIME_ERROR",
                        "stdout": proc.stdout or "",
                        "stderr": proc.stderr or "",
                        "compile_output": "",
                        "execution_time_ms": elapsed_ms,
                        "memory_used_kb": 4096,
                        "is_sandboxed": False,
                    }

                return {
                    "verdict": "ACCEPTED",
                    "stdout": proc.stdout or "",
                    "stderr": proc.stderr or "",
                    "compile_output": "",
                    "execution_time_ms": elapsed_ms,
                    "memory_used_kb": 4096,
                    "is_sandboxed": False,
                }
            except subprocess.TimeoutExpired:
                elapsed_ms = (time.perf_counter() - run_start) * 1000.0
                return {
                    "verdict": "TIME_LIMIT_EXCEEDED",
                    "stdout": "",
                    "stderr": f"Time limit exceeded ({time_limit}s)",
                    "compile_output": "",
                    "execution_time_ms": elapsed_ms,
                    "memory_used_kb": 4096,
                    "is_sandboxed": False,
                }
            except Exception as e:
                return {
                    "verdict": "INTERNAL_ERROR",
                    "stdout": "",
                    "stderr": str(e),
                    "compile_output": "",
                    "execution_time_ms": 0.0,
                    "memory_used_kb": 0,
                    "is_sandboxed": False,
                }


def execute_single_run(language: str, source_code: str, stdin: str = "", time_limit: float = 2.0, memory_limit_mb: int = 256) -> Dict[str, Any]:
    """
    Executes a single program run against stdin.
    Uses Judge0 if configured; otherwise delegates to LocalExecutionAdapter ONLY in safe dev/test environments.
    In production, fails safely if Judge0 is unavailable.
    """
    judge0 = Judge0Client()
    if judge0.is_configured():
        res = judge0.execute(language, source_code, stdin, time_limit, memory_limit_mb)
        if res.get("verdict") != "INTERNAL_ERROR":
            return res

    # Check whether local unsandboxed execution is allowed on this environment
    if not is_safe_local_execution_permitted():
        logger.error("Execution attempted on host in production without configured sandbox engine.")
        return {
            "verdict": "INTERNAL_ERROR",
            "stdout": "",
            "stderr": "Code execution engine unavailable. Please try again shortly or contact your administrator.",
            "compile_output": "",
            "execution_time_ms": 0.0,
            "memory_used_kb": 0,
            "is_sandboxed": False,
        }

    # Local execution fallback for dev / test
    lang = language.lower().strip()
    if "python" in lang:
        return LocalExecutionAdapter.execute_python(source_code, stdin, time_limit)
    elif "java" in lang:
        return LocalExecutionAdapter.execute_java(source_code, stdin, time_limit)
    else:
        return {
            "verdict": "INTERNAL_ERROR",
            "stdout": "",
            "stderr": f"Unsupported language for local runner: {language}. Please configure Judge0 engine.",
            "compile_output": "",
            "execution_time_ms": 0.0,
            "memory_used_kb": 0,
            "is_sandboxed": False,
        }


def evaluate_submission(
    programming_question,
    candidate,
    attempt,
    language: str,
    source_code: str,
) -> Dict[str, Any]:
    """
    Evaluates a candidate submission against all test cases for a programming question.
    Creates CodeSubmission and CodeTestResult records.
    Updates the candidate score on the attempt and question snapshot atomically.
    """
    from .models import CodeSubmission, CodeTestResult
    from django.db.models import Max

    test_cases = list(programming_question.test_cases.all().order_by("order", "created_at"))
    time_limit = programming_question.time_limit_seconds or 2.0
    memory_limit = programming_question.memory_limit_mb or 256

    submission = CodeSubmission.objects.create(
        attempt=attempt,
        candidate=candidate,
        programming_question=programming_question,
        language=language,
        source_code=source_code,
        verdict=CodeSubmission.Verdict.PENDING,
        total_test_cases=len(test_cases),
    )

    if not test_cases:
        submission.verdict = CodeSubmission.Verdict.INTERNAL_ERROR
        submission.save(update_fields=["verdict"])
        return {
            "submission_id": str(submission.id),
            "verdict": "INTERNAL_ERROR",
            "score_awarded": 0.0,
            "total_test_cases": 0,
            "passed_test_cases": 0,
            "execution_time_ms": 0.0,
            "memory_used_kb": 0,
            "compile_output": "Programming question has no configured test cases.",
            "results": [],
        }

    passed_count = 0
    total_score = 0.0
    max_possible_score = sum(tc.marks_weightage for tc in test_cases) or 1.0
    max_exec_time = 0.0
    max_mem_used = 0
    first_failing_verdict = None
    compile_err_output = ""

    results_data = []

    for tc in test_cases:
        res = execute_single_run(
            language=language,
            source_code=source_code,
            stdin=tc.input_text or "",
            time_limit=time_limit,
            memory_limit_mb=memory_limit,
        )

        exec_verdict = res.get("verdict", "RUNTIME_ERROR")
        stdout = res.get("stdout", "")
        stderr = res.get("stderr", "")
        exec_time = res.get("execution_time_ms", 0.0)
        mem_used = res.get("memory_used_kb", 0)

        max_exec_time = max(max_exec_time, exec_time)
        max_mem_used = max(max_mem_used, mem_used)

        if exec_verdict == "COMPILATION_ERROR":
            compile_err_output = res.get("compile_output") or stderr
            status = CodeSubmission.Verdict.COMPILATION_ERROR
            passed = False
        elif exec_verdict == "TIME_LIMIT_EXCEEDED":
            status = CodeSubmission.Verdict.TIME_LIMIT_EXCEEDED
            passed = False
        elif exec_verdict == "RUNTIME_ERROR":
            status = CodeSubmission.Verdict.RUNTIME_ERROR
            passed = False
        elif exec_verdict == "INTERNAL_ERROR":
            status = CodeSubmission.Verdict.INTERNAL_ERROR
            passed = False
        else:
            # Check normalized output equality
            actual_clean = normalize_code_output(stdout, mode="trimmed")
            expected_clean = normalize_code_output(tc.expected_output, mode="trimmed")
            if actual_clean == expected_clean:
                status = CodeSubmission.Verdict.ACCEPTED
                passed = True
                passed_count += 1
                total_score += tc.marks_weightage
            else:
                status = CodeSubmission.Verdict.WRONG_ANSWER
                passed = False

        if not passed and not first_failing_verdict:
            first_failing_verdict = status

        # Save result to DB: include actual_output and stderr for administrator review
        CodeTestResult.objects.create(
            submission=submission,
            test_case=tc,
            status=status,
            actual_output=stdout,
            error_message=stderr,
            execution_time_ms=exec_time,
            memory_used_kb=mem_used,
            passed=passed,
        )

        # Build candidate-facing result: STRICT SECURITY for hidden test cases
        results_data.append({
            "test_case_id": str(tc.id),
            "is_public": tc.is_public,
            "status": status,
            "passed": passed,
            "execution_time_ms": exec_time,
            "actual_output": stdout if tc.is_public else None,
            "expected_output": tc.expected_output if tc.is_public else None,
            "input_text": tc.input_text if tc.is_public else None,
            "explanation": tc.explanation if tc.is_public else None,
        })

    # Final verdict calculation
    if passed_count == len(test_cases):
        final_verdict = CodeSubmission.Verdict.ACCEPTED
    else:
        final_verdict = first_failing_verdict or CodeSubmission.Verdict.WRONG_ANSWER

    # Calculate question marks proportion
    q_marks = programming_question.question.marks if (programming_question and programming_question.question) else 10
    score_ratio = (total_score / max_possible_score) if max_possible_score > 0 else 0.0
    awarded_marks = min(float(q_marks), round(score_ratio * q_marks, 2))

    submission.verdict = final_verdict
    submission.score_awarded = awarded_marks
    submission.passed_test_cases = passed_count
    submission.execution_time_ms = max_exec_time
    submission.memory_used_kb = max_mem_used
    submission.compile_output = compile_err_output
    submission.save()

    # Authoritatively recalculate attempt coding score
    try:
        best_scores = (
            attempt.code_submissions.values("programming_question")
            .annotate(best=Max("score_awarded"))
        )
        total_coding = sum(int(round(item["best"])) for item in best_scores)
        attempt.coding_score = total_coding
        attempt.total_score = (attempt.aptitude_score or 0) + attempt.coding_score
        total_marks = attempt.snapshot_total_marks or (attempt.assessment.total_marks if attempt.assessment else 50)
        if total_marks > 0:
            attempt.percentage = round((attempt.total_score / total_marks) * 100.0, 2)
        attempt.save(update_fields=["coding_score", "total_score", "percentage", "updated_at"])

        # Mark question snapshot as answered if available
        snapshot = attempt.question_snapshots.filter(question_id=programming_question.question_id).first()
        if snapshot:
            snapshot.is_correct = (final_verdict == CodeSubmission.Verdict.ACCEPTED)
            snapshot.selected_option = "SUBMITTED"
            snapshot.answered_at = timezone.now()
            snapshot.save(update_fields=["is_correct", "selected_option", "answered_at", "updated_at"])
    except Exception as e:
        logger.warning("Could not update attempt scores after coding submission: %s", e)

    return {
        "submission_id": str(submission.id),
        "verdict": final_verdict,
        "score_awarded": awarded_marks,
        "total_test_cases": len(test_cases),
        "passed_test_cases": passed_count,
        "execution_time_ms": max_exec_time,
        "memory_used_kb": max_mem_used,
        "compile_output": compile_err_output,
        "results": results_data,
    }
