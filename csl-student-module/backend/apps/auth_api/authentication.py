import logging
import re
from urllib.parse import urlparse
from django.conf import settings
from django.contrib.auth import get_user_model, load_backend
from django.contrib.auth import HASH_SESSION_KEY, SESSION_KEY, BACKEND_SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from rest_framework import exceptions
from rest_framework.authentication import SessionAuthentication

logger = logging.getLogger(__name__)
User = get_user_model()

SESSION_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def _extract_origin(request) -> str:
    raw = request.META.get("HTTP_ORIGIN") or ""
    if raw:
        return raw.strip().rstrip("/")
    referer = request.META.get("HTTP_REFERER") or ""
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return ""


def _is_trusted_origin(request, origin: str) -> bool:
    trusted = {
        *(o.rstrip("/") for o in getattr(settings, "CORS_ALLOWED_ORIGINS", [])),
        *(o.rstrip("/") for o in getattr(settings, "CSRF_TRUSTED_ORIGINS", [])),
    }
    try:
        same_origin = f"{request.scheme}://{request.get_host()}".rstrip("/")
        trusted.add(same_origin)
    except Exception:
        pass
    return origin in trusted


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    SessionAuthentication subclass for decoupled frontend-backend SPAs.

    - Supports `X-Session-ID` custom header fallback when third-party cookies are blocked.
    - When authenticating via cookie (not `X-Session-ID`), enforces Origin/Referer allowlist
      and rejects untrusted cross-site unsafe requests instead of blindly skipping all CSRF checks.
    """

    def enforce_csrf(self, request):
        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return

        # Requests authenticated explicitly via custom X-Session-ID header require CORS preflight
        # in browsers and cannot be forged via cross-site HTML forms.
        if getattr(request, "_authenticated_via_session_header", False):
            return

        sec_fetch_site = (request.META.get("HTTP_SEC_FETCH_SITE") or "").strip().lower()
        origin = _extract_origin(request)
        if origin:
            if not _is_trusted_origin(request, origin):
                raise exceptions.PermissionDenied("Untrusted request origin for cookie-authenticated session.")
            return

        if sec_fetch_site == "cross-site":
            raise exceptions.PermissionDenied("Cross-site cookie request rejected without trusted origin.")

    def authenticate(self, request):
        # 1. Standard Django session authentication via cookie (with enforce_csrf verifying Origin)
        user_auth = super().authenticate(request)
        if user_auth is not None:
            return user_auth

        # 2. Cross-origin session fallback via validated X-Session-ID header
        session_key = (
            request.headers.get("X-Session-ID")
            or request.headers.get("x-session-id")
            or request.META.get("HTTP_X_SESSION_ID")
        )
        if not session_key or not isinstance(session_key, str):
            return None
        session_key = session_key.strip()
        if not SESSION_KEY_RE.match(session_key):
            return None

        try:
            session = SessionStore(session_key=session_key)
            if not session.exists(session_key):
                return None

            user_id = session.get(SESSION_KEY)
            backend_path = session.get(BACKEND_SESSION_KEY)
            if not user_id or not backend_path:
                return None

            backend = load_backend(backend_path)
            user = backend.get_user(user_id)
            if not user or not user.is_active:
                return None

            # Verify session auth hash if set
            session_hash = session.get(HASH_SESSION_KEY)
            if session_hash:
                user_hash = user.get_session_auth_hash()
                if session_hash != user_hash:
                    return None

            # Attach session and user to underlying Django HttpRequest
            request._request.session = session
            request._request.user = user
            request._authenticated_via_session_header = True
            return (user, None)
        except Exception as e:
            logger.warning(f"Failed to authenticate session from header: {e}")
            return None

