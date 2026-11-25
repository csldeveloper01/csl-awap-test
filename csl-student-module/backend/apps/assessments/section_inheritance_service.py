"""
Assessment Section Inheritance & Allocation Reconciliation Service.

When QuestionPools are linked to an Assessment via AssessmentPoolSource:
- Retrieves active questions inside linked pools (and distinct curriculum sections).
- Resolves each question's section against AssessmentSection (never flattening distinct
  sections like PYTHON / DSA / JAVA into generic CODING).
- Creates missing AssessmentSectionAllocation records and preserves existing manually
  configured allocations cleanly.
- Computes available question counts per section from both direct questions and pool sources.
"""

from collections import OrderedDict
from typing import Any, Dict, List, Optional
from django.db import transaction
from django.db.models import Q

from .models import (
    Assessment,
    AssessmentPoolSource,
    AssessmentSection,
    AssessmentSectionAllocation,
    QuestionBank,
    QuestionPoolItem,
)
from .section_resolution_service import SectionDirectoryLookup


def _resolve_question_section(
    question: QuestionBank,
    lookup: SectionDirectoryLookup,
    explicit_source_section: Optional[AssessmentSection] = None,
) -> Optional[AssessmentSection]:
    if explicit_source_section is not None:
        return explicit_source_section
    if question.section is not None:
        return question.section
    if question.section_type:
        matched = lookup.match(question.section_type)
        if matched:
            return matched
    return None


def get_section_question_count_for_assessment(
    assessment: Assessment,
    section: AssessmentSection,
) -> int:
    """
    Returns exact available active question count for an AssessmentSection within
    an Assessment, checking linked QuestionPoolSources and direct assessment.questions.
    """
    from .services import get_assessment_available_questions_qs

    if not assessment or not assessment.pk or not section:
        return 0

    available_qs = get_assessment_available_questions_qs(assessment)
    has_direct = assessment.questions.exists()
    has_pools = assessment.pool_sources.exists()

    if has_direct or has_pools:
        base_qs = available_qs
    else:
        base_qs = QuestionBank.objects.filter(is_active=True, is_global=True)

    sec_filter = (
        Q(section=section)
        | Q(section__code__iexact=section.code)
        | Q(section_type__iexact=section.code)
        | Q(section__name__iexact=section.name)
        | Q(section_type__iexact=section.name)
    )
    return base_qs.filter(sec_filter, is_active=True).distinct().count()


def inspect_pool_sections(pool) -> List[Dict[str, Any]]:
    """
    Inspects all active questions inside a QuestionPool and returns a summary
    of distinct resolved AssessmentSections + available question counts.
    """
    lookup = SectionDirectoryLookup(include_inactive=False)
    items = list(
        QuestionPoolItem.objects.filter(pool=pool, question__is_active=True)
        .select_related("question", "question__section")
        .order_by("order", "added_at")
    )

    section_stats: "OrderedDict[int, Dict[str, Any]]" = OrderedDict()
    for item in items:
        q = item.question
        sec = _resolve_question_section(q, lookup)
        if not sec:
            continue
        if sec.id not in section_stats:
            section_stats[sec.id] = {
                "section": sec,
                "section_id": sec.id,
                "section_name": sec.name,
                "section_code": sec.code,
                "available_questions_count": 0,
                "sample_marks": q.marks or 1,
            }
        section_stats[sec.id]["available_questions_count"] += 1

    return list(section_stats.values())


@transaction.atomic
def inherit_sections_from_pool_source(
    assessment: Assessment,
    pool_source: AssessmentPoolSource,
) -> Dict[str, Any]:
    """
    Reconciles an Assessment's AssessmentSectionAllocations when a QuestionPool
    is attached via AssessmentPoolSource.
    - Discovers all distinct sections represented by questions in the pool
      (or the explicitly bound source.section if specified).
    - Preserves all existing manual AssessmentSectionAllocation quotas & marks.
    - Creates missing AssessmentSectionAllocation records cleanly without duplicates.
    """
    lookup = SectionDirectoryLookup(include_inactive=False)
    existing_allocs = {
        alloc.section_id: alloc
        for alloc in assessment.section_allocations.select_related("section").order_by("order", "id")
    }
    max_order = max((alloc.order for alloc in existing_allocs.values()), default=0)

    discovered: "OrderedDict[int, Dict[str, Any]]" = OrderedDict()
    pool_items_qs = (
        QuestionPoolItem.objects.filter(pool=pool_source.pool, question__is_active=True)
        .select_related("question", "question__section")
        .order_by("order", "added_at")
    )
    if pool_source.section_id:
        sec_obj = pool_source.section
        matching_count = get_section_question_count_for_assessment(assessment, sec_obj)
        discovered[sec_obj.id] = {
            "section": sec_obj,
            "pool_question_count": pool_items_qs.filter(
                Q(question__section=sec_obj)
                | Q(question__section_type__iexact=sec_obj.code)
                | Q(question__section__code__iexact=sec_obj.code)
            ).distinct().count(),
            "assessment_available_count": matching_count,
            "default_marks": 1,
        }
    else:
        for item in pool_items_qs:
            q = item.question
            sec_obj = _resolve_question_section(q, lookup)
            if not sec_obj:
                continue
            if sec_obj.id not in discovered:
                discovered[sec_obj.id] = {
                    "section": sec_obj,
                    "pool_question_count": 0,
                    "assessment_available_count": get_section_question_count_for_assessment(assessment, sec_obj),
                    "default_marks": q.marks or 1,
                }
            discovered[sec_obj.id]["pool_question_count"] += 1

    inherited_summary = []
    created_any = False

    for sec_id, info in discovered.items():
        sec_obj = info["section"]
        pool_cnt = info["pool_question_count"]
        avail_cnt = info["assessment_available_count"] or pool_cnt

        existing = existing_allocs.get(sec_id)
        if existing:
            inherited_summary.append({
                "section_id": sec_obj.id,
                "section_name": sec_obj.name,
                "section_code": sec_obj.code,
                "pool_questions_count": pool_cnt,
                "available_questions_count": avail_cnt,
                "allocated_question_count": existing.question_count,
                "marks_per_question": existing.marks_per_question,
                "inherited_action": "RECONCILED_EXISTING",
            })
        else:
            max_order += 1
            requested_quota = int(pool_source.question_count or 0)
            if len(discovered) == 1 and requested_quota > 0:
                initial_quota = min(avail_cnt, requested_quota) if avail_cnt > 0 else requested_quota
            else:
                initial_quota = min(avail_cnt, requested_quota) if (requested_quota > 0 and avail_cnt > 0) else max(1, avail_cnt)

            default_marks = max(1, int(info.get("default_marks") or 1))
            if pool_source.pool.question_type == "MCQ":
                default_marks = 1

            alloc = AssessmentSectionAllocation.objects.create(
                assessment=assessment,
                section=sec_obj,
                question_count=initial_quota,
                marks_per_question=default_marks,
                order=max_order,
            )
            existing_allocs[sec_id] = alloc
            created_any = True
            inherited_summary.append({
                "section_id": sec_obj.id,
                "section_name": sec_obj.name,
                "section_code": sec_obj.code,
                "pool_questions_count": pool_cnt,
                "available_questions_count": avail_cnt,
                "allocated_question_count": alloc.question_count,
                "marks_per_question": alloc.marks_per_question,
                "inherited_action": "CREATED",
            })

    if created_any:
        recalculated_marks = sum(
            max(0, int(a.question_count or 0)) * max(1, int(a.marks_per_question or 1))
            for a in existing_allocs.values()
        )
        if recalculated_marks > 0:
            assessment.total_marks = recalculated_marks
            assessment.save(update_fields=["total_marks", "updated_at"])

    return {
        "inherited_sections": inherited_summary,
        "total_allocations": len(existing_allocs),
        "created_count": sum(1 for item in inherited_summary if item["inherited_action"] == "CREATED"),
        "reconciled_count": sum(1 for item in inherited_summary if item["inherited_action"] == "RECONCILED_EXISTING"),
    }
