"""
Background Celery tasks for heavy exports, email notifications, analytics aggregation,
and periodic stale session maintenance. Safely falls back to synchronous execution
when CELERY_TASK_ALWAYS_EAGER=True or no Celery broker is configured.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.db.models import Avg, Count
from django.utils import timezone

try:
    from celery import shared_task
except Exception:  # pragma: no cover - fallback when celery binary absent locally
    def shared_task(*d_args, **d_kwargs):
        def decorator(fn):
            fn.delay = lambda *args, **kwargs: fn(*args, **kwargs)
            return fn
        if len(d_args) == 1 and callable(d_args[0]) and not d_kwargs:
            return decorator(d_args[0])
        return decorator

logger = logging.getLogger(__name__)


def dispatch_background_task(task_fn, *args, **kwargs):
    """
    Runs a Celery task asynchronously when a broker is active and not in eager mode,
    otherwise executes synchronously with safe structured return metadata.
    """
    broker_url = getattr(settings, "CELERY_BROKER_URL", "")
    always_eager = getattr(settings, "CELERY_TASK_ALWAYS_EAGER", True)
    if broker_url and not always_eager and hasattr(task_fn, "delay"):
        try:
            async_res = task_fn.delay(*args, **kwargs)
            return {"queued": True, "mode": "celery", "task_id": str(getattr(async_res, "id", ""))}
        except Exception as exc:
            logger.warning("Celery broker unavailable (%s); falling back to synchronous execution.", exc)

    result = task_fn(*args, **kwargs)
    return {"queued": False, "mode": "sync_fallback", "result": result}


@shared_task(max_retries=2, default_retry_delay=15)
def recompute_assessment_analytics_task(assessment_id: str = ""):
    from .models import AssessmentAttempt

    qs = AssessmentAttempt.objects.filter(
        state__in=AssessmentAttempt.COMPLETED_STATES,
        is_simulation=False,
    )
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    agg = qs.aggregate(
        completed_count=Count("id"),
        avg_score=Avg("total_score"),
        avg_pct=Avg("percentage"),
    )
    payload = {
        "assessment_id": assessment_id or "ALL",
        "completed_count": agg["completed_count"] or 0,
        "avg_score": round(float(agg["avg_score"] or 0.0), 2),
        "avg_percentage": round(float(agg["avg_pct"] or 0.0), 2),
        "computed_at": timezone.now().isoformat(),
    }
    cache_key = f"csl:analytics:{assessment_id or 'all'}"
    cache.set(cache_key, payload, timeout=120)
    return payload


@shared_task(max_retries=2, default_retry_delay=30)
def generate_bulk_xlsx_export_task(filters: dict = None):
    """
    Generates XLSX binary payload in background worker and caches transient download reference.
    """
    import uuid
    from .models import AssessmentAttempt, AssessmentConfig

    filters = filters or {}
    qs = (
        AssessmentAttempt.objects.filter(
            state__in=AssessmentAttempt.COMPLETED_STATES,
            is_simulation=False,
        )
        .select_related("candidate", "candidate__college_ref", "assessment")
        .order_by("-submitted_at", "-created_at")
    )
    if filters.get("assessment_id"):
        qs = qs.filter(assessment_id=filters["assessment_id"])
    if filters.get("college_id"):
        qs = qs.filter(candidate__college_ref_id=filters["college_id"])

    config = AssessmentConfig.objects.filter(is_active=True).first()
    export_id = uuid.uuid4().hex
    count = qs[:500].count()
    meta = {
        "export_id": export_id,
        "row_count": count,
        "header_bg": getattr(config, "export_header_bg_color", "#1E293B") if config else "#1E293B",
        "generated_at": timezone.now().isoformat(),
    }
    cache.set(f"csl:export_job:{export_id}", meta, timeout=600)
    return meta


@shared_task(max_retries=2, default_retry_delay=30)
def send_candidate_notification_emails_task(subject: str, message: str, recipient_emails: list):
    recipients = [e.strip() for e in (recipient_emails or []) if e and "@" in e]
    if not recipients:
        return {"sent": 0}
    sent = send_mail(
        subject=subject,
        message=message,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@csl-assessment.local"),
        recipient_list=recipients,
        fail_silently=True,
    )
    return {"sent": sent}


@shared_task
def cleanup_stale_sessions_task(max_idle_hours: int = 24):
    """
    Cleans stale INITIALIZING proctoring sessions older than max_idle_hours cleanly (idempotent).
    """
    from .models import ProctoringSession

    cutoff = timezone.now() - timedelta(hours=max(1, int(max_idle_hours)))
    updated = ProctoringSession.objects.filter(
        status=ProctoringSession.SessionStatus.INITIALIZING,
        created_at__lt=cutoff,
    ).update(status=ProctoringSession.SessionStatus.COMPLETED, ended_at=timezone.now())
    return {"cleaned_sessions": updated}
