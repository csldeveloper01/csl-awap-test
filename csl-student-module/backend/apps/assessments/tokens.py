"""
Candidate Assessment Authentication & Cryptographic Token Utilities.

Provides secure, tamper-proof, time-bound session tokens for passwordless
candidate assessment flows. The token securely encodes candidate_id and (if available) attempt_id,
signed by Django's SECRET_KEY with salt.
"""

from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from .models import Candidate, AssessmentAttempt


SIGNER_SALT = "csl-assessment-candidate-v1"
TOKEN_MAX_AGE_SECONDS = 7200  # 2 hours default lifetime


def generate_candidate_token(candidate_id: str, attempt_id: str = None, is_simulation: bool = False) -> str:
    """
    Generate a cryptographic, timestamped token for a candidate and attempt.
    """
    signer = TimestampSigner(salt=SIGNER_SALT)
    payload = {
        "candidate_id": str(candidate_id),
        "attempt_id": str(attempt_id) if attempt_id else None,
        "is_simulation": bool(is_simulation),
    }
    return signer.sign_object(payload)


def decode_candidate_token(token: str, max_age: int = TOKEN_MAX_AGE_SECONDS) -> dict:
    """
    Decode and verify the cryptographic signature and expiration of the token.
    Raises exceptions.AuthenticationFailed if invalid or expired.
    """
    if not token:
        raise exceptions.AuthenticationFailed("Assessment credential required.")

    signer = TimestampSigner(salt=SIGNER_SALT)
    try:
        data = signer.unsign_object(token, max_age=max_age)
        return data
    except SignatureExpired:
        raise exceptions.AuthenticationFailed("Assessment session has expired. Please re-authenticate.")
    except (BadSignature, Exception):
        raise exceptions.AuthenticationFailed("Invalid assessment credential.")


class CandidateAssessmentAuthentication(BaseAuthentication):
    """
    DRF Authentication scheme for assessment lifecycle endpoints.
    Accepts:
      Header: Authorization: Bearer <assessment_token>
      OR
      Header: X-Assessment-Token: <assessment_token>
    """

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        token = None

        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        elif "X-Assessment-Token" in request.headers:
            token = request.headers["X-Assessment-Token"].strip()

        if not token:
            return None  # Pass to next auth or handle via permission class

        data = decode_candidate_token(token)
        candidate_id = data.get("candidate_id")
        attempt_id = data.get("attempt_id")
        is_simulation = bool(data.get("is_simulation", False))

        try:
            candidate = Candidate.objects.get(id=candidate_id)
        except Candidate.DoesNotExist:
            raise exceptions.AuthenticationFailed("Candidate identity not found.")

        # Ensure simulation flag matches
        if bool(getattr(candidate, "is_simulation", False)) != is_simulation:
            raise exceptions.AuthenticationFailed("Assessment session credential security mismatch.")

        # Attach assessment session metadata to request
        request.candidate = candidate
        request.assessment_token_data = data
        request.authenticated_attempt_id = attempt_id
        request.is_simulation = is_simulation

        # Return (candidate, token) as DRF (user, auth) pair
        return (candidate, token)


def get_authorized_candidate(request):
    """
    Returns candidate from authenticated assessment token or None.
    """
    return getattr(request, "candidate", None)


def verify_attempt_ownership(request, attempt: AssessmentAttempt, allow_staff: bool = False):
    """
    Verifies that the request's authenticated candidate owns the given attempt.
    Staff bypass is disabled by default so admins are never silently treated as candidate
    subjects on active exam or Sentinel proctoring endpoints. Read-only admin views that
    intentionally share a candidate route must pass allow_staff=True explicitly.
    """
    candidate = get_authorized_candidate(request)
    if candidate:
        return str(attempt.candidate_id) == str(candidate.id)

    if allow_staff:
        user = getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False) and getattr(user, "is_staff", False):
            return True

    return False


def is_simulation_or_admin_subject(request, attempt: AssessmentAttempt = None) -> bool:
    """
    Returns True if the caller is acting as an administrative user without a real candidate
    subject OR if the request/attempt/candidate belongs to a Test Run simulation.
    Used to enforce strict isolation of CSL Sentinel candidate recording.
    """
    if getattr(request, "is_simulation", False):
        return True

    candidate = get_authorized_candidate(request)
    if candidate and getattr(candidate, "is_simulation", False):
        return True

    if attempt is not None:
        if getattr(attempt, "is_simulation", False):
            return True
        attempt_candidate = getattr(attempt, "candidate", None)
        if attempt_candidate and getattr(attempt_candidate, "is_simulation", False):
            return True

    if not candidate:
        raw_req = getattr(request, "_request", request)
        raw_user = getattr(raw_req, "user", None)
        if raw_user and getattr(raw_user, "is_authenticated", False) and getattr(raw_user, "is_staff", False):
            return True

    return False

