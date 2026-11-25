from typing import Any, Dict, Iterable, List, Mapping, Optional

from rest_framework.exceptions import ValidationError


POOL_QUESTION_TYPES = ("MCQ", "CODING")


def has_programming_details(question: Any) -> bool:
    """Safely check whether a QuestionBank instance has a linked ProgrammingQuestion record."""
    if question is None:
        return False
    try:
        return getattr(question, "programming_details", None) is not None
    except Exception:
        return False


def get_question_canonical_type(question: Any) -> str:
    """
    Authoritative question-type resolution for persisted QuestionBank rows.
    Considers ProgrammingQuestion relationship first, then assessment_type and section_type.
    """
    if has_programming_details(question):
        return "CODING"
    ass_type = str(getattr(question, "assessment_type", "") or "").strip().upper()
    sec_type = str(getattr(question, "section_type", "") or "").strip().upper()
    if ass_type == "CODING" or sec_type == "CODING":
        return "CODING"
    return "MCQ"


def get_payload_canonical_type(data: Mapping[str, Any], fallback_question: Any = None) -> str:
    """
    Authoritative question-type resolution for incoming API payloads.
    Uses explicit type hints and coding_details payload before falling back to an existing instance.
    """
    raw_qtype = str(data.get("question_type") or "").strip().upper()
    raw_atype = str(data.get("assessment_type") or "").strip().upper()
    raw_stype = str(data.get("section_type") or "").strip().upper()

    if raw_qtype in POOL_QUESTION_TYPES:
        return raw_qtype
    if data.get("coding_details") is not None:
        return "CODING"
    if raw_atype == "CODING" or raw_stype == "CODING":
        return "CODING"
    if raw_atype and raw_atype != "CODING":
        return "MCQ"
    if fallback_question is not None:
        return get_question_canonical_type(fallback_question)
    return "MCQ"


def get_pool_type_breakdown(pool: Any) -> Dict[str, Any]:
    """Inspect all questions currently inside a QuestionPool."""
    items = list(
        pool.items.select_related("question", "question__programming_details").all()
    )
    mcq_ids: List[int] = []
    coding_ids: List[int] = []

    for item in items:
        q = item.question
        if get_question_canonical_type(q) == "CODING":
            coding_ids.append(q.id)
        else:
            mcq_ids.append(q.id)

    mcq_count = len(mcq_ids)
    coding_count = len(coding_ids)
    total = mcq_count + coding_count
    is_mixed = mcq_count > 0 and coding_count > 0

    return {
        "total": total,
        "mcq_count": mcq_count,
        "coding_count": coding_count,
        "mcq_ids": mcq_ids,
        "coding_ids": coding_ids,
        "is_mixed": is_mixed,
        "is_empty": total == 0,
    }


def compute_pool_health(pool: Any, breakdown: Optional[Dict[str, Any]] = None) -> str:
    """
    Return health status for a QuestionPool:
    - 'MIXED_TYPES': contains both MCQ and CODING questions (needs reconciliation)
    - 'EMPTY_UNCLASSIFIED' / 'UNCLASSIFIED': missing pool.question_type
    - 'TYPE_MISMATCH': pool.question_type set, but contains items of the other type
    - 'VALID': classified and consistent
    """
    info = breakdown if breakdown is not None else get_pool_type_breakdown(pool)
    if info["is_mixed"]:
        return "MIXED_TYPES"
    pool_type = getattr(pool, "question_type", None)
    if pool_type not in POOL_QUESTION_TYPES:
        return "EMPTY_UNCLASSIFIED" if info["is_empty"] else "UNCLASSIFIED"
    if pool_type == "MCQ" and info["coding_count"] > 0:
        return "TYPE_MISMATCH"
    if pool_type == "CODING" and info["mcq_count"] > 0:
        return "TYPE_MISMATCH"
    return "VALID"


def ensure_pool_accepts_type(pool: Any, incoming_type: str, context: str = "operation") -> None:
    """
    Enforce pool type compatibility at backend mutation boundaries.
    Raises DRF ValidationError (HTTP 400) if pool is unclassified, mixed, or incompatible.
    """
    normalized = str(incoming_type or "").strip().upper()
    if normalized not in POOL_QUESTION_TYPES:
        raise ValidationError({"question_type": [f"Unsupported question type '{incoming_type}'."]})

    pool_type = getattr(pool, "question_type", None)
    if pool_type not in POOL_QUESTION_TYPES:
        raise ValidationError({
            "pool_id": [
                f"Question pool '{pool.name}' ({pool.code}) has not been classified as MCQ or CODING yet. "
                f"Classify or reconcile the pool before attempting this {context}."
            ]
        })

    if pool_type != normalized:
        raise ValidationError({
            "question_type": [
                f"Incompatible question type: Pool '{pool.name}' ({pool.code}) is a {pool_type} pool "
                f"and cannot accept {normalized} questions."
            ]
        })


def ensure_pool_accepts_questions(pool: Any, questions: Iterable[Any]) -> None:
    """Validate an iterable of QuestionBank objects against a pool's authoritative question_type."""
    pool_type = getattr(pool, "question_type", None)
    if pool_type not in POOL_QUESTION_TYPES:
        raise ValidationError({
            "pool_id": [
                f"Question pool '{pool.name}' ({pool.code}) must be classified as MCQ or CODING before adding questions."
            ]
        })

    incompatible = []
    for q in questions:
        q_type = get_question_canonical_type(q)
        if q_type != pool_type:
            incompatible.append({"id": q.id, "type": q_type, "prompt": q.prompt[:60]})

    if incompatible:
        sample_ids = ", ".join(f"#{item['id']} ({item['type']})" for item in incompatible[:5])
        raise ValidationError({
            "question_ids": [
                f"Cannot add incompatible question(s) to {pool_type} pool '{pool.name}' ({pool.code}): {sample_ids}."
            ],
            "incompatible_questions": incompatible,
        })
