try:
    from .celery import app as celery_app
except Exception:
    # Safe fallback when Celery package is not installed in stripped environments
    celery_app = None

__all__ = ("celery_app",)
