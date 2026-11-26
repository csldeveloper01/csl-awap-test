import os
from rest_framework.throttling import SimpleRateThrottle


def _client_ident(request):
    """Extract client IP respecting reverse-proxy headers cleanly."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        first_ip = xff.split(",")[0].strip()
        if first_ip:
            return first_ip[:64]
    return (request.META.get("REMOTE_ADDR") or "unknown")[:64]


class CandidateAuthBurstThrottle(SimpleRateThrottle):
    """Protects public candidate register / code-resolve / institution-request endpoints against floods."""
    scope = "candidate_auth"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": _client_ident(request),
        }

    def get_rate(self):
        return os.getenv("DJANGO_THROTTLE_CANDIDATE_AUTH", "120/min")


class CandidateRecoveryThrottle(SimpleRateThrottle):
    """Protects student login / attempt recovery endpoints against credential/identity brute-force."""
    scope = "candidate_recovery"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": _client_ident(request),
        }

    def get_rate(self):
        return os.getenv("DJANGO_THROTTLE_CANDIDATE_RECOVERY", "45/min")


class CandidatePublicReadThrottle(SimpleRateThrottle):
    """Protects high-volume public directory / assessment list endpoints."""
    scope = "candidate_public_read"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": _client_ident(request),
        }

    def get_rate(self):
        return os.getenv("DJANGO_THROTTLE_PUBLIC_READ", "240/min")
