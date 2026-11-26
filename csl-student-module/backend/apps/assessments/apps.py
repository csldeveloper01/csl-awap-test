from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.assessments'

    def ready(self):
        from .signals import register_cache_invalidation_signals
        register_cache_invalidation_signals()
