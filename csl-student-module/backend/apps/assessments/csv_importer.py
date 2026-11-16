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
    "additional_instructions": ["additional_instructions", "instructions", "description", "constraints"],
    "expected_output": ["expected_output", "expected output", "output"],
    "example_test_case_1": ["example_test_case_1", "example test case 1", "sample_input_1", "sample input 1", "sample 1"],
    "example_test_case_2": ["example_test_case_2", "example test case 2", "sample_input_2", "sample input 2", "sample 2"],
    "hidden_test_case_1": ["hidden_test_case_1", "hidden test case 1", "test_case_1", "test case 1"],
    "hidden_test_case_2": ["hidden_test_case_2", "hidden test case 2", "test_case_2", "test case 2"],
    "hidden_test_case_3": ["hidden_test_case_3", "hidden test case 3", "test_case_3", "test case 3"],
    "hidden_test_case_4": ["hidden_test_case_4", "hidden test case 4", "test_case_4", "test case 4"],
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


def parse_and_validate_csv(
    csv_text: str,
    target_assessment: Optional[Assessment] = None,
    target_pools: Optional[List[QuestionPool]] = None,
    section_mapping: Optional[Dict[str, Any]] = None,
    commit: bool = False,
) -> Dict[str, Any]:
    """
    Robust CSV parser and validator:
    - Normalizes delimiters and encodings
    - Maps headers
    - Validates each row
    - If commit=True, persists inside transaction.atomic()
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

    rows_data = []
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
            # Validate coding question
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

            expected_output = row_clean.get(header_mapping.get("expected_output", ""), "")
            instructions = row_clean.get(header_mapping.get("additional_instructions", ""), "")

            # Test cases
            ex1 = row_clean.get(header_mapping.get("example_test_case_1", ""), "")
            ex2 = row_clean.get(header_mapping.get("example_test_case_2", ""), "")
            hid1 = row_clean.get(header_mapping.get("hidden_test_case_1", ""), "")
            hid2 = row_clean.get(header_mapping.get("hidden_test_case_2", ""), "")
            hid3 = row_clean.get(header_mapping.get("hidden_test_case_3", ""), "")
            hid4 = row_clean.get(header_mapping.get("hidden_test_case_4", ""), "")

            test_cases = []
            if ex1:
                test_cases.append({"input_text": ex1, "expected_output": expected_output or "Output", "is_public": True, "weightage": 1.0})
            if ex2:
                test_cases.append({"input_text": ex2, "expected_output": expected_output or "Output", "is_public": True, "weightage": 1.0})
            if hid1:
                test_cases.append({"input_text": hid1, "expected_output": expected_output or "Output", "is_public": False, "weightage": 2.0})
            if hid2:
                test_cases.append({"input_text": hid2, "expected_output": expected_output or "Output", "is_public": False, "weightage": 2.0})
            if hid3:
                test_cases.append({"input_text": hid3, "expected_output": expected_output or "Output", "is_public": False, "weightage": 2.0})
            if hid4:
                test_cases.append({"input_text": hid4, "expected_output": expected_output or "Output", "is_public": False, "weightage": 2.0})

            # If no test cases explicitly extracted, create default sample test case
            if not test_cases and expected_output:
                test_cases.append({"input_text": "", "expected_output": expected_output, "is_public": True, "weightage": 1.0})

            valid_rows.append({
                "type": "CODING",
                "row_number": row_idx,
                "prompt": prompt_val,
                "marks": marks,
                "time_limit": time_limit,
                "memory_limit": memory_limit,
                "instructions": instructions,
                "test_cases": test_cases,
                "section_obj": default_coding_sec,
                "section": default_coding_sec.name if default_coding_sec else "Coding",
            })

        else:
            # Validate MCQ question
            opt_a = row_clean.get(header_mapping.get("option_a", ""), "")
            opt_b = row_clean.get(header_mapping.get("option_b", ""), "")
            opt_c = row_clean.get(header_mapping.get("option_c", ""), "")
            opt_d = row_clean.get(header_mapping.get("option_d", ""), "")
            corr = row_clean.get(header_mapping.get("correct_option", ""), "").upper()

            if not opt_a or not opt_b:
                error_rows.append({"row": row_idx, "error": "Option A and Option B are mandatory for MCQ questions."})
                continue

            if corr not in ["A", "B", "C", "D"]:
                # Try to match option text to key
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

            sec_raw = row_clean.get(header_mapping.get("section_type", ""), "APTITUDE").strip().upper()
            sec_code = re.sub(r"[^A-Z0-9_]", "_", sec_raw).strip("_")[:50]
            sec_name = sec_raw.replace("_", " ").title()

            sec_obj = None
            sec_mapping_rule = (section_mapping or {}).get(sec_raw) or (section_mapping or {}).get(sec_code)
            if sec_mapping_rule:
                action = sec_mapping_rule.get("action")
                if action == "skip":
                    continue
                elif action == "map":
                    target_id = sec_mapping_rule.get("target_section_id") or sec_mapping_rule.get("section_id")
                    if target_id:
                        sec_obj = AssessmentSection.objects.filter(id=target_id).first()
                elif action == "create":
                    created_name = sec_mapping_rule.get("target_section_name") or sec_mapping_rule.get("name") or sec_name
                    if commit:
                        sec_obj, _ = AssessmentSection.objects.get_or_create(
                            code=sec_code,
                            defaults={"name": created_name, "is_active": True}
                        )
                        existing_sections[sec_code] = sec_obj

            if not sec_obj:
                if commit:
                    sec_obj, _ = AssessmentSection.objects.get_or_create(
                        code=sec_code,
                        defaults={"name": sec_name, "is_active": True}
                    )
                    existing_sections[sec_code] = sec_obj
                else:
                    sec_obj = existing_sections.get(sec_code) or existing_names.get(sec_raw.lower()) or default_mcq_sec

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

    if not commit:
        preview = [{k: v for k, v in r.items() if k != "section_obj"} for r in valid_rows[:5]]
        return {
            "success": True,
            "detected_type": detected_type,
            "delimiter": delimiter,
            "total_rows": total_rows,
            "valid_count": len(valid_rows),
            "error_count": len(error_rows),
            "errors": error_rows[:50],
            "unmapped_headers": unmapped_headers,
            "preview_samples": preview,
        }

    # Commit execution
    created_questions = []
    with transaction.atomic():
        for item in valid_rows:
            sec_to_assign = item.get("section_obj")
            if item["type"] == "CODING":
                q = QuestionBank.objects.create(
                    prompt=item["prompt"],
                    section_type=QuestionBank.SectionType.CODING,
                    section=sec_to_assign,
                    marks=item["marks"],
                    option_a="N/A",
                    option_b="N/A",
                    option_c="N/A",
                    option_d="N/A",
                    correct_option="A",
                    is_active=True,
                )
                prog = ProgrammingQuestion.objects.create(
                    question=q,
                    problem_statement=item.get("instructions") or item["prompt"],
                    time_limit_seconds=item["time_limit"],
                    memory_limit_mb=item["memory_limit"],
                    allowed_languages=["python", "java"],
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
                    section_type=item["section_type"],
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
                )

            # Link to assessment if provided
            if target_assessment:
                target_assessment.questions.add(q)

            # Link to question pools if provided
            if target_pools:
                for pool in target_pools:
                    QuestionPoolItem.objects.get_or_create(pool=pool, question=q)

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
    }
