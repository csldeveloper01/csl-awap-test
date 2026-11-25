import csv
import io
import re
from typing import Dict, List, Any, Tuple, Optional
from django.db import transaction
from django.utils import timezone
from .models import (
    QuestionBank,
    QuestionPool,
    QuestionPoolItem,
    Assessment,
    AssessmentSection,
    ProgrammingQuestion,
    ProgrammingTestCase,
)

SUPPORTED_ENCODINGS = [
    "utf-8-sig",
    "utf-8",
    "utf-16",
    "utf-16-le",
    "utf-16-be",
    "windows-1252",
    "iso-8859-1",
    "cp1252",
    "latin-1",
]

MCQ_ALIAS_MAP = {
    "prompt": ["prompt", "question", "problem", "question_text", "question prompt", "title"],
    "section_type": ["section_type", "section", "category", "subject", "topic"],
    "option_a": ["option_a", "option a", "a", "choice a", "choice_a"],
    "option_b": ["option_b", "option b", "b", "choice b", "choice_b"],
    "option_c": ["option_c", "option c", "c", "choice c", "choice_c"],
    "option_d": ["option_d", "option d", "d", "choice d", "choice_d"],
    "correct_option": ["correct_option", "correct option", "correct answer", "answer", "key", "correct"],
    "marks": ["marks", "mark", "score", "weight", "weightage"],
    "difficulty": ["difficulty", "difficulty_level", "level"],
    "explanation": ["explanation", "solution", "rationale"],
}

CODING_ALIAS_MAP = {
    "prompt": ["prompt", "title", "problem_statement", "problem statement", "question", "problem"],
    "additional_instructions": ["additional_instructions", "instructions", "description", "problem_description"],
    "constraints": ["constraints", "constraint"],
    "input_format": ["input_format", "input format"],
    "output_format": ["output_format", "output format"],
    "section_type": ["section_type", "section", "section_code", "section code", "topic", "category", "domain"],
    "difficulty": ["difficulty", "level"],
    "expected_output": ["expected_output", "expected output", "output"],
    "example_test_case_1": ["example_test_case_1", "example test case 1", "sample_input_1", "sample input 1", "sample 1"],
    "example_output_1": ["example_output_1", "example output 1", "sample_output_1", "sample output 1"],
    "example_test_case_2": ["example_test_case_2", "example test case 2", "sample_input_2", "sample input 2", "sample 2"],
    "example_output_2": ["example_output_2", "example output 2", "sample_output_2", "sample output 2"],
    "hidden_test_case_1": ["hidden_test_case_1", "hidden test case 1", "hidden_input_1", "hidden input 1", "test_case_1", "test case 1"],
    "hidden_output_1": ["hidden_output_1", "hidden output 1", "test_output_1", "test output 1"],
    "hidden_test_case_2": ["hidden_test_case_2", "hidden test case 2", "hidden_input_2", "hidden input 2", "test_case_2", "test case 2"],
    "hidden_output_2": ["hidden_output_2", "hidden output 2", "test_output_2", "test output 2"],
    "hidden_test_case_3": ["hidden_test_case_3", "hidden test case 3", "hidden_input_3", "hidden input 3", "test_case_3", "test case 3"],
    "hidden_output_3": ["hidden_output_3", "hidden output 3", "test_output_3", "test output 3"],
    "hidden_test_case_4": ["hidden_test_case_4", "hidden test case 4", "hidden_input_4", "hidden input 4", "test_case_4", "test case 4"],
    "hidden_output_4": ["hidden_output_4", "hidden output 4", "test_output_4", "test output 4"],
    "marks": ["marks", "mark", "score", "points"],
    "time_limit": ["time_limit", "time_limit_seconds", "time limit", "timeout"],
    "memory_limit": ["memory_limit", "memory_limit_mb", "memory limit", "memory"],
    "allowed_languages": ["allowed_languages", "languages", "language"],
}


def decode_csv_bytes(file_bytes: bytes, preferred_encoding: Optional[str] = None) -> Tuple[str, str]:
    """
    Decodes raw CSV file bytes using either a specified encoding or an intelligent fallback chain.
    Returns (decoded_text, detected_encoding).
    """
    if preferred_encoding:
        try:
            return file_bytes.decode(preferred_encoding), preferred_encoding
        except Exception:
            pass

    # Try chardet if available
    try:
        import chardet
        detected = chardet.detect(file_bytes)
        if detected and detected.get("encoding"):
            enc = detected["encoding"].lower()
            try:
                return file_bytes.decode(enc), enc
            except Exception:
                pass
    except ImportError:
        pass

    # Fallback cascade
    for enc in SUPPORTED_ENCODINGS:
        try:
            return file_bytes.decode(enc), enc
        except (UnicodeDecodeError, LookupError):
            continue

    # Absolute fallback
    return file_bytes.decode("utf-8", errors="replace"), "utf-8 (lossy)"


def sanitize_csv_text(raw_text: str) -> str:
    """
    Cleans non-breaking spaces, typographic quotes, and normalizes line breaks.
    """
    if not raw_text:
        return ""
    # Normalize line breaks
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    # Replace non-breaking spaces
    text = text.replace("\u00a0", " ").replace("\ufeff", "")
    # Normalize smart quotes and typographic characters
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    text = text.replace("—", "-").replace("–", "-")
    return text


def detect_delimiter(text: str) -> str:
    """
    Detects delimiter (comma, semicolon, tab, pipe) by inspecting the first non-empty lines.
    """
    sample_lines = [line for line in text.split("\n")[:10] if line.strip()]
    if not sample_lines:
        return ","

    counts = {",": 0, ";": 0, "\t": 0, "|": 0}
    for line in sample_lines:
        for delim in counts:
            counts[delim] += line.count(delim)

    # Return delimiter with highest count
    best_delim = max(counts, key=counts.get)
    return best_delim if counts[best_delim] > 0 else ","


def normalize_header(header: str) -> str:
    """
    Normalizes a CSV column header: trimmed, lowercased, spaces/underscores consolidated.
    """
    if not header:
        return ""
    clean = header.strip().lower()
    clean = re.sub(r"[\s\-_]+", "_", clean)
    return clean


def map_headers(fieldnames: List[str]) -> Tuple[Dict[str, str], List[str], str]:
    """
    Maps raw CSV field names to canonical names.
    Returns (mapping: {canonical_name: raw_name}, unmapped: [raw_names], detected_type: 'MCQ' | 'CODING').
    """
    raw_normalized = {normalize_header(fn): fn for fn in fieldnames if fn}

    # Detect if file is Coding or MCQ based on matching columns
    coding_hits = 0
    for key, aliases in CODING_ALIAS_MAP.items():
        if any(normalize_header(a) in raw_normalized for a in aliases):
            coding_hits += 1

    mcq_hits = 0
    for key, aliases in MCQ_ALIAS_MAP.items():
        if any(normalize_header(a) in raw_normalized for a in aliases):
            mcq_hits += 1

    is_coding = coding_hits >= 3 and ("option_a" not in raw_normalized and "option_b" not in raw_normalized)
    alias_map = CODING_ALIAS_MAP if is_coding else MCQ_ALIAS_MAP

    mapping = {}
    mapped_raw_headers = set()

    for canonical, aliases in alias_map.items():
        for alias in aliases:
            norm_alias = normalize_header(alias)
            if norm_alias in raw_normalized:
                raw_col = raw_normalized[norm_alias]
                mapping[canonical] = raw_col
                mapped_raw_headers.add(raw_col)
                break

    unmapped = [fn for fn in fieldnames if fn not in mapped_raw_headers]
    return mapping, unmapped, "CODING" if is_coding else "MCQ"


def _resolve_section_for_row(
    sec_raw: str,
    section_mapping: Optional[Dict[str, Any]],
    existing_sections: Dict[str, AssessmentSection],
    existing_names: Dict[str, AssessmentSection],
    fallback_section: Optional[AssessmentSection],
    commit: bool,
) -> Tuple[Optional[AssessmentSection], bool]:
    """
    Resolve an AssessmentSection for a CSV row, honoring explicit admin section_mapping rules.
    Returns (section_obj, should_skip_row).
    """
    sec_clean = (sec_raw or "").strip().upper()
    sec_code = re.sub(r"[^A-Z0-9_]", "_", sec_clean).strip("_")[:50]
    sec_name = sec_clean.replace("_", " ").title() if sec_clean else "General"

    sec_obj = None
    normalized_mapping = {
        str(k).strip().upper(): v for k, v in (section_mapping or {}).items()
    }
    sec_mapping_rule = (
        normalized_mapping.get(sec_clean)
        or normalized_mapping.get(sec_code)
    )
    if isinstance(sec_mapping_rule, str):
        sec_obj = (
            existing_sections.get(sec_mapping_rule.strip().upper())
            or AssessmentSection.objects.filter(code__iexact=sec_mapping_rule.strip()).first()
        )
    elif isinstance(sec_mapping_rule, dict):
        action = sec_mapping_rule.get("action")
        if action == "skip":
            return None, True
        elif action == "map":
            target_id = sec_mapping_rule.get("target_section_id") or sec_mapping_rule.get("section_id")
            if target_id:
                sec_obj = AssessmentSection.objects.filter(id=target_id).first()
        elif action == "create":
            created_name = sec_mapping_rule.get("target_section_name") or sec_mapping_rule.get("name") or sec_name
            if commit and sec_code:
                sec_obj, _ = AssessmentSection.objects.get_or_create(
                    code=sec_code,
                    defaults={"name": created_name, "is_active": True},
                )
                existing_sections[sec_code] = sec_obj

    if not sec_obj:
        sec_obj = existing_sections.get(sec_code) or existing_names.get(sec_clean.lower())
        if not sec_obj and commit and sec_code:
            sec_obj, _ = AssessmentSection.objects.get_or_create(
                code=sec_code,
                defaults={"name": sec_name, "is_active": True},
            )
            existing_sections[sec_code] = sec_obj
        elif not sec_obj:
            sec_obj = fallback_section

    return sec_obj, False


def _parse_allowed_languages(raw_val: str) -> List[str]:
    """Normalize comma/pipe/semicolon separated programming language names."""
    if not raw_val:
        return ["python", "java"]
    tokens = [t.strip().lower() for t in re.split(r"[,;|]+", raw_val) if t.strip()]
    valid = [t for t in tokens if t in ("python", "java", "c", "cpp", "javascript", "js")]
    normalized = ["javascript" if t == "js" else t for t in valid]
    return list(dict.fromkeys(normalized)) or ["python", "java"]


def parse_and_validate_csv(
    csv_text: str,
    target_assessment: Optional[Assessment] = None,
    target_pools: Optional[List[QuestionPool]] = None,
    section_mapping: Optional[Dict[str, Any]] = None,
    commit: bool = False,
    is_global: bool = True,
) -> Dict[str, Any]:
    """
    Robust CSV parser and validator:
    - Normalizes delimiters and encodings
    - Maps headers
    - Validates each row
    - If commit=True, persists inside transaction.atomic()
    - is_global controls whether created questions belong to central Global Question Bank
    """
    cleaned_text = sanitize_csv_text(csv_text)
    if not cleaned_text.strip():
        return {
            "success": False,
            "detail": "CSV content is empty.",
            "total_rows": 0,
            "valid_count": 0,
            "error_count": 0,
            "errors": [],
        }

    delimiter = detect_delimiter(cleaned_text)
    io_string = io.StringIO(cleaned_text)
    reader = csv.DictReader(io_string, delimiter=delimiter)

    if not reader.fieldnames:
        return {
            "success": False,
            "detail": "CSV file contains no valid headers.",
            "total_rows": 0,
            "valid_count": 0,
            "error_count": 0,
            "errors": [],
        }

    header_mapping, unmapped_headers, detected_type = map_headers(reader.fieldnames)

    # Basic header check
    if "prompt" not in header_mapping:
        return {
            "success": False,
            "detail": f"Could not locate a Question / Prompt column in headers: {reader.fieldnames}",
            "unmapped_headers": unmapped_headers,
            "total_rows": 0,
            "valid_count": 0,
            "error_count": 0,
            "errors": [],
        }

    error_rows = []
    valid_rows = []

    # Map existing sections
    existing_sections = {s.code.upper(): s for s in AssessmentSection.objects.filter(is_active=True)}
    existing_names = {s.name.lower(): s for s in AssessmentSection.objects.filter(is_active=True)}
    default_coding_sec = existing_sections.get("CODING")
    default_mcq_sec = existing_sections.get("APTITUDE")

    for row_idx, row in enumerate(reader, start=2):
        row_clean = {k.strip(): (v.strip() if v else "") for k, v in row.items() if k}
        prompt_val = row_clean.get(header_mapping.get("prompt", ""), "")
        if not prompt_val:
            error_rows.append({"row": row_idx, "error": "Question prompt / title cannot be empty."})
            continue

        if detected_type == "CODING":
            marks_raw = row_clean.get(header_mapping.get("marks", ""), "10")
            try:
                marks = int(float(marks_raw)) if marks_raw else 10
                if marks <= 0:
                    marks = 10
            except ValueError:
                marks = 10

            time_limit_raw = row_clean.get(header_mapping.get("time_limit", ""), "2.0")
            try:
                time_limit = float(time_limit_raw) if time_limit_raw else 2.0
                if time_limit <= 0:
                    time_limit = 2.0
            except ValueError:
                time_limit = 2.0

            memory_limit_raw = row_clean.get(header_mapping.get("memory_limit", ""), "256")
            try:
                memory_limit = int(float(memory_limit_raw)) if memory_limit_raw else 256
                if memory_limit <= 0:
                    memory_limit = 256
            except ValueError:
                memory_limit = 256

            diff_raw = row_clean.get(header_mapping.get("difficulty", ""), "MEDIUM").upper()
            if diff_raw not in ["EASY", "MEDIUM", "HARD"]:
                diff_raw = "MEDIUM"

            sec_raw = (row_clean.get(header_mapping.get("section_type", ""), "") or "CODING").strip().upper()
            sec_obj, should_skip = _resolve_section_for_row(
                sec_raw=sec_raw,
                section_mapping=section_mapping,
                existing_sections=existing_sections,
                existing_names=existing_names,
                fallback_section=default_coding_sec,
                commit=commit,
            )
            if should_skip:
                continue

            expected_output = row_clean.get(header_mapping.get("expected_output", ""), "")
            instructions = row_clean.get(header_mapping.get("additional_instructions", ""), "")
            constraints = row_clean.get(header_mapping.get("constraints", ""), "")
            input_format = row_clean.get(header_mapping.get("input_format", ""), "")
            output_format = row_clean.get(header_mapping.get("output_format", ""), "")
            allowed_langs = _parse_allowed_languages(row_clean.get(header_mapping.get("allowed_languages", ""), ""))

            test_cases = []
            for idx_num in (1, 2):
                inp = row_clean.get(header_mapping.get(f"example_test_case_{idx_num}", ""), "")
                out = row_clean.get(header_mapping.get(f"example_output_{idx_num}", ""), "") or expected_output
                if inp or out:
                    if "::" in inp and not row_clean.get(header_mapping.get(f"example_output_{idx_num}", ""), ""):
                        parts = inp.split("::", 1)
                        inp, out = parts[0].strip(), parts[1].strip()
                    test_cases.append({"input_text": inp, "expected_output": out or "Output", "is_public": True, "weightage": 1.0})

            for idx_num in (1, 2, 3, 4):
                inp = row_clean.get(header_mapping.get(f"hidden_test_case_{idx_num}", ""), "")
                out = row_clean.get(header_mapping.get(f"hidden_output_{idx_num}", ""), "") or expected_output
                if inp:
                    if "::" in inp and not row_clean.get(header_mapping.get(f"hidden_output_{idx_num}", ""), ""):
                        parts = inp.split("::", 1)
                        inp, out = parts[0].strip(), parts[1].strip()
                    test_cases.append({"input_text": inp, "expected_output": out or "Output", "is_public": False, "weightage": 2.0})

            if not test_cases and expected_output:
                test_cases.append({"input_text": "", "expected_output": expected_output, "is_public": True, "weightage": 1.0})

            valid_rows.append({
                "type": "CODING",
                "row_number": row_idx,
                "prompt": prompt_val,
                "marks": marks,
                "difficulty": diff_raw,
                "time_limit": time_limit,
                "memory_limit": memory_limit,
                "instructions": instructions,
                "constraints": constraints,
                "input_format": input_format,
                "output_format": output_format,
                "allowed_languages": allowed_langs,
                "test_cases": test_cases,
                "section_obj": sec_obj,
                "section": sec_obj.name if sec_obj else "Coding",
                "section_type": sec_raw,
            })

        else:
            opt_a = row_clean.get(header_mapping.get("option_a", ""), "")
            opt_b = row_clean.get(header_mapping.get("option_b", ""), "")
            opt_c = row_clean.get(header_mapping.get("option_c", ""), "")
            opt_d = row_clean.get(header_mapping.get("option_d", ""), "")
            corr = row_clean.get(header_mapping.get("correct_option", ""), "").upper()

            if not opt_a or not opt_b:
                error_rows.append({"row": row_idx, "error": "Option A and Option B are mandatory for MCQ questions."})
                continue

            if corr not in ["A", "B", "C", "D"]:
                if corr == opt_a.upper():
                    corr = "A"
                elif corr == opt_b.upper():
                    corr = "B"
                elif corr == opt_c.upper():
                    corr = "C"
                elif corr == opt_d.upper():
                    corr = "D"
                else:
                    error_rows.append({"row": row_idx, "error": f"Invalid correct_option '{corr}'. Must be A, B, C, or D."})
                    continue

            marks_raw = row_clean.get(header_mapping.get("marks", ""), "1")
            try:
                marks = int(float(marks_raw)) if marks_raw else 1
                if marks <= 0:
                    marks = 1
            except ValueError:
                marks = 1

            diff_raw = row_clean.get(header_mapping.get("difficulty", ""), "MEDIUM").upper()
            if diff_raw not in ["EASY", "MEDIUM", "HARD"]:
                diff_raw = "MEDIUM"

            sec_raw = (row_clean.get(header_mapping.get("section_type", ""), "") or "APTITUDE").strip().upper()
            sec_obj, should_skip = _resolve_section_for_row(
                sec_raw=sec_raw,
                section_mapping=section_mapping,
                existing_sections=existing_sections,
                existing_names=existing_names,
                fallback_section=default_mcq_sec,
                commit=commit,
            )
            if should_skip:
                continue

            valid_rows.append({
                "type": "MCQ",
                "row_number": row_idx,
                "prompt": prompt_val,
                "option_a": opt_a,
                "option_b": opt_b,
                "option_c": opt_c or "None of the above",
                "option_d": opt_d or "All of the above",
                "correct_option": corr,
                "marks": marks,
                "difficulty": diff_raw,
                "explanation": row_clean.get(header_mapping.get("explanation", ""), ""),
                "section_obj": sec_obj,
                "section": sec_obj.name if sec_obj else (sec_raw or "Aptitude"),
                "section_type": sec_raw,
            })

    total_rows = len(valid_rows) + len(error_rows)

    section_counts = {}
    for r in valid_rows:
        st = r.get("section_type") or ("CODING" if r.get("type") == "CODING" else "APTITUDE")
        section_counts[st] = section_counts.get(st, 0) + 1

    if not commit:
        preview = [{k: v for k, v in r.items() if k != "section_obj"} for r in valid_rows[:10]]
        return {
            "success": len(valid_rows) > 0 or len(error_rows) == 0,
            "detected_type": detected_type,
            "delimiter": delimiter,
            "total_rows": total_rows,
            "valid_count": len(valid_rows),
            "error_count": len(error_rows),
            "errors": error_rows[:50],
            "unmapped_headers": unmapped_headers,
            "preview_samples": preview,
            "section_counts": section_counts,
        }

    if total_rows > 0 and len(valid_rows) == 0:
        return {
            "success": False,
            "detail": "No valid rows could be imported from CSV. Please review row validation errors.",
            "total_rows": total_rows,
            "imported_count": 0,
            "success_count": 0,
            "valid_count": 0,
            "error_count": len(error_rows),
            "errors": error_rows[:50],
            "detected_type": detected_type,
            "unmapped_headers": unmapped_headers,
        }

    # Commit execution inside transaction
    created_questions = []
    with transaction.atomic():
        for item in valid_rows:
            sec_to_assign = item.get("section_obj")
            if item["type"] == "CODING":
                q = QuestionBank.objects.create(
                    prompt=item["prompt"],
                    section_type=sec_to_assign.code if sec_to_assign else item.get("section_type", QuestionBank.SectionType.CODING),
                    section=sec_to_assign,
                    assessment_type="CODING",
                    difficulty=item.get("difficulty", QuestionBank.Difficulty.MEDIUM),
                    marks=item["marks"],
                    option_a="N/A (Coding Question)",
                    option_b="N/A (Coding Question)",
                    option_c="N/A (Coding Question)",
                    option_d="N/A (Coding Question)",
                    correct_option="A",
                    is_active=True,
                    is_global=bool(is_global),
                )
                prog = ProgrammingQuestion.objects.create(
                    question=q,
                    problem_statement=item.get("instructions") or item["prompt"],
                    constraints=item.get("constraints", ""),
                    input_format=item.get("input_format", ""),
                    output_format=item.get("output_format", ""),
                    time_limit_seconds=item["time_limit"],
                    memory_limit_mb=item["memory_limit"],
                    allowed_languages=item.get("allowed_languages") or ["python", "java"],
                )
                for idx, tc in enumerate(item.get("test_cases", []), start=1):
                    ProgrammingTestCase.objects.create(
                        programming_question=prog,
                        input_text=tc["input_text"],
                        expected_output=tc["expected_output"],
                        is_public=tc.get("is_public", True),
                        marks_weightage=tc.get("weightage", 1.0),
                        order=idx,
                        is_active=True,
                    )
            else:
                q = QuestionBank.objects.create(
                    prompt=item["prompt"],
                    section_type=sec_to_assign.code if sec_to_assign else item["section_type"],
                    section=sec_to_assign,
                    option_a=item["option_a"],
                    option_b=item["option_b"],
                    option_c=item["option_c"],
                    option_d=item["option_d"],
                    correct_option=item["correct_option"],
                    marks=item["marks"],
                    difficulty=item["difficulty"],
                    explanation=item.get("explanation", ""),
                    is_active=True,
                    is_global=bool(is_global),
                )

            if target_assessment:
                target_assessment.questions.add(q)

            if target_pools:
                for pool in target_pools:
                    if not QuestionPoolItem.objects.filter(pool=pool, question=q).exists():
                        QuestionPoolItem.objects.create(
                            pool=pool,
                            question=q,
                            order=pool.items.count() + 1,
                        )

            created_questions.append(q)

    return {
        "success": True,
        "total_rows": total_rows,
        "imported_count": len(created_questions),
        "success_count": len(created_questions),
        "valid_count": len(valid_rows),
        "error_count": len(error_rows),
        "errors": error_rows[:50],
        "detected_type": detected_type,
        "unmapped_headers": unmapped_headers,
        "is_global": bool(is_global),
    }
