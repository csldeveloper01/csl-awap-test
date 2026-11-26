from django.core.cache import cache
from django.db.models.signals import post_delete, post_save

ADMIN_STATS_CACHE_KEY = "csl:admin:stats:v2"


def invalidate_admin_stats_cache(**kwargs):
    cache.delete(ADMIN_STATS_CACHE_KEY)


def register_cache_invalidation_signals():
    from .models import (
        Assessment,
        AssessmentAttempt,
        AssessmentAuditLog,
        Candidate,
        College,
        Drive,
        IntegrityEvent,
        QuestionBank,
        QuestionPool,
    )

    watched_models = (
        Assessment,
        AssessmentAttempt,
        AssessmentAuditLog,
        Candidate,
        College,
        Drive,
        IntegrityEvent,
        QuestionBank,
        QuestionPool,
    )
    for model_cls in watched_models:
        post_save.connect(invalidate_admin_stats_cache, sender=model_cls, dispatch_uid=f"csl_stats_save_{model_cls.__name__}")
        post_delete.connect(invalidate_admin_stats_cache, sender=model_cls, dispatch_uid=f"csl_stats_del_{model_cls.__name__}")
