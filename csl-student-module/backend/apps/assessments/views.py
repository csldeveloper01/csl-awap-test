import logging
import time

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from django.http import HttpResponse

from .models import (
    Candidate,
    College,
    Assessment,
    AssessmentAttempt,
    IntegrityEvent,
    AssessmentConfig,
    QuestionBank,
    RecoveryEvent,
    Drive,
    DriveAssessment,
    DriveRegistration,
    DriveInvitation,
    AssessmentAuditLog,
    AdminAccessGrant,
    ProctoringSession,
    ProctoringCalibration,
    ProctoringEvent,
    ProctoringEvidence,
)
from .storage_service import ProctoringEvidenceStorageService
from .serializers import (
    CandidateRegistrationSerializer,
    StudentCollegeOptionSerializer,
    StudentCandidateAssessmentSerializer,
    AssessmentAttemptDetailSerializer,
    AnswerSaveSerializer,
    IntegrityEventSerializer,
    AssessmentResultSerializer,
    ProctoringSessionSerializer,
    ProctoringEventInputSerializer,
    ProctoringEventOutputSerializer,
    ProctoringCalibrationSerializer,
    ProctoringEvidenceOutputSerializer,
)
from .services import (
    start_assessment_for_candidate,
    save_candidate_answer,
    finalize_assessment_attempt,
    get_or_create_default_config,
    get_or_create_default_assessment,
)
from .tokens import (
    CandidateAssessmentAuthentication,
    generate_candidate_token,
    decode_candidate_token,
    get_authorized_candidate,
    verify_attempt_ownership,
)

logger = logging.getLogger(__name__)


class StudentCollegesListView(APIView):
    """
    Student-facing: returns active colleges for registration dropdown.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        colleges = College.objects.filter(is_active=True).order_by("name")
        return Response(StudentCollegeOptionSerializer(colleges, many=True).data)


class CandidateEligibleAssessmentsView(APIView):
    """
    Student-facing: returns assessments assigned to the authenticated candidate's college.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        candidate = get_authorized_candidate(request)
        drive_code = (request.query_params.get("drive_code") or "").strip()
        college_id = request.query_params.get("college_id")
        from django.db.models import Q

        # If drive_code not provided in request but candidate registered through a drive, scope to that drive
        if not drive_code and candidate:
            active_drive_reg = candidate.drive_registrations.filter(
                registration_status="REGISTERED"
            ).select_related("drive").first()
            if active_drive_reg and active_drive_reg.drive:
                drive_code = active_drive_reg.drive.drive_code or active_drive_reg.drive.code

        if drive_code:
            # Mode B: Drive-Based Assessment
            drive = Drive.objects.filter(
                Q(drive_code=drive_code) | Q(code__iexact=drive_code)
            ).first()
            if not drive:
                return Response(
                    {"detail": f"Drive with code '{drive_code}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if drive.status in [Drive.Status.COMPLETED, Drive.Status.ARCHIVED]:
                return Response(
                    {"detail": f"Drive '{drive.name}' is no longer active."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if drive.eligible_colleges.exists():
                if candidate:
                    if not candidate.college_ref or not drive.eligible_colleges.filter(id=candidate.college_ref.id).exists():
                        return Response(
                            {"detail": f"Your institution ({candidate.college}) is not eligible for drive '{drive.name}'."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
                elif college_id:
                    if not drive.eligible_colleges.filter(id=college_id).exists():
                        return Response(
                            {"detail": f"Selected institution is not eligible for drive '{drive.name}'."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
            assessments = (
                drive.assessments.filter(
                    status__in=[
                        Assessment.Status.OPEN,
                        Assessment.Status.SCHEDULED,
                        Assessment.Status.READY,
                        Assessment.Status.CLOSED,
                    ],
                    assessment_drives__status="ACTIVE",
                )
                .distinct()
            )
            # Dual college eligibility: Drive-based assessment with no assessment-level restrictions
            # inherits Drive colleges; if assessment has restrictions, candidate must satisfy both.
            if candidate and candidate.college_ref:
                assessments = assessments.filter(
                    Q(eligible_colleges__isnull=True) | Q(eligible_colleges=candidate.college_ref)
                )
            elif college_id:
                assessments = assessments.filter(
                    Q(eligible_colleges__isnull=True) | Q(eligible_colleges__id=college_id)
                )
            assessments = assessments.order_by("assessment_drives__display_order", "status", "-created_at")
        else:
            # Mode A: Open / Standalone Assessment
            # Authoritatively filter by is_standalone=True so drive-based assessments are never leaked
            base_qs = Assessment.objects.filter(
                status__in=[
                    Assessment.Status.OPEN,
                    Assessment.Status.SCHEDULED,
                    Assessment.Status.READY,
                    Assessment.Status.CLOSED,
                ],
                is_standalone=True,
            )
            if candidate:
                q_filter = Q(eligible_candidates=candidate)
                if candidate.college_ref:
                    q_filter |= Q(eligible_colleges=candidate.college_ref)
                q_filter |= Q(eligible_colleges__isnull=True, eligible_candidates__isnull=True)
                assessments = base_qs.filter(q_filter)
            elif college_id:
                assessments = base_qs.filter(Q(eligible_colleges__id=college_id) | Q(eligible_colleges__isnull=True))
            else:
                assessments = base_qs

            assessments = (
                assessments
                .distinct()
                .order_by("status", "-created_at")
            )

        serializer = StudentCandidateAssessmentSerializer(
            assessments,
            many=True,
            context={"candidate": candidate},
        )
        candidate_data = {
            "id": str(candidate.id),
            "full_name": candidate.full_name,
            "register_number": candidate.register_number,
            "college": candidate.college,
            "college_id": candidate.college_ref_id,
            "department": candidate.department,
            "year_of_study": candidate.year_of_study,
            "is_active": candidate.is_active,
        } if candidate else None

        return Response({
            "candidate": candidate_data,
            "assessments": serializer.data,
        })



class StudentAttemptRecoveryView(APIView):
    """
    Step 4.5: Student Self-Service One-Time Accidental-Exit Recovery.
    Requires registration number + additional verification factor (email or phone).
    Enforces atomic recovery:
    - Attempt must be IN_PROGRESS or CREATED.
    - Attempt must not be expired past disconnection grace.
    - Attempt must not be in a TERMINAL_STATE (SUBMITTED, TIMED_OUT, REVOKED, etc.).
    - self-service recovery_count < (1 + admin_recovery_granted).
    - Increments recovery_count atomically and updates session metadata.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        reg_no = (request.data.get("register_number") or "").strip().upper()
        verification_val = (request.data.get("verification_factor") or request.data.get("email") or request.data.get("phone_number") or "").strip().lower()
        attempt_id = request.data.get("attempt_id")

        if not reg_no or not verification_val:
            return Response(
                {"detail": "Register number and verification factor (email or phone) are both required for recovery."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Match candidate
        from django.db.models import Q
        candidate = Candidate.objects.filter(
            register_number__iexact=reg_no
        ).filter(
            Q(email__iexact=verification_val) | Q(phone_number__iexact=verification_val)
        ).first()

        if not candidate:
            cand_by_reg = Candidate.objects.filter(register_number__iexact=reg_no).first()
            if cand_by_reg:
                if cand_by_reg.is_simulation:
                    return Response(
                        {"detail": "Simulation accounts cannot be accessed via student recovery."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                return Response(
                    {"detail": f"Verification factor does not match our records for register number '{reg_no}'. Please check your registered email or phone."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            return Response(
                {"detail": f"No candidate found with register number '{reg_no}'. Please check your registration number or register first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if candidate.is_simulation:
            return Response(
                {"detail": "Simulation accounts cannot be accessed via student recovery."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            attempts_qs = AssessmentAttempt.objects.select_for_update().filter(candidate=candidate)
            if attempt_id:
                try:
                    attempt = attempts_qs.filter(id=attempt_id).first()
                except Exception:
                    attempt = None
            else:
                # Find latest active or recoverable attempt
                attempt = attempts_qs.filter(
                    state__in=[AssessmentAttempt.State.IN_PROGRESS, AssessmentAttempt.State.CREATED]
                ).order_by("-created_at").first()

            if not attempt:
                return Response(
                    {"detail": "No recoverable active attempt found for this candidate. Completed or submitted attempts cannot be recovered."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Check terminal state
            if attempt.state in AssessmentAttempt.TERMINAL_STATES:
                return Response(
                    {"detail": f"Attempt is in terminal state '{attempt.state}' and cannot be resumed or reopened."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Check expiration
            if attempt.is_expired():
                attempt.transition_to(AssessmentAttempt.State.TIMED_OUT, save=True, reason="Expired prior to recovery.")
                return Response(
                    {"detail": "Attempt duration and disconnection grace period have expired."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Check limit: exactly 1 self-service recovery, plus any admin_recovery_granted
            allowed_recoveries = 1 + attempt.admin_recovery_granted
            if attempt.recovery_count >= allowed_recoveries:
                return Response(
                    {
                        "detail": f"Maximum self-service recoveries ({allowed_recoveries}) exhausted for this attempt. Please contact test administrator.",
                        "recovery_exhausted": True,
                        "recovery_count": attempt.recovery_count,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            now = timezone.now()
            attempt.recovery_count += 1
            attempt.last_recovery_at = now
            meta = attempt.recovery_metadata or {}
            meta[f"recovery_{attempt.recovery_count}"] = {
                "timestamp": now.isoformat(),
                "ip": request.META.get("REMOTE_ADDR"),
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:150],
                "type": "STUDENT_SELF_SERVICE",
            }
            attempt.recovery_metadata = meta

            # Resume if paused
            if attempt.is_paused:
                attempt.resume_attempt(at_time=now)
            else:
                attempt.last_heartbeat = now
                attempt.save(update_fields=["recovery_count", "last_recovery_at", "recovery_metadata", "last_heartbeat", "updated_at"])

            # Create integrity telemetry event
            IntegrityEvent.objects.create(
                attempt=attempt,
                event_type=IntegrityEvent.EventType.RECONNECTED,
                metadata={"recovery_number": attempt.recovery_count, "channel": "SELF_SERVICE_RECOVERY"},
            )

            # Persist structured RecoveryEvent
            RecoveryEvent.objects.create(
                attempt=attempt,
                recovery_type=RecoveryEvent.RecoveryType.STUDENT_SELF_SERVICE,
                session_key=request.session.session_key or "",
                ip_address=request.META.get("REMOTE_ADDR") or None,
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
                timer_remaining_seconds=attempt.get_remaining_seconds(),
                answers_restored_count=attempt.question_snapshots.exclude(selected_option="").count(),
            )

            token = generate_candidate_token(str(candidate.id), str(attempt.id))

        return Response({
            "message": "Attempt successfully recovered.",
            "attempt_id": str(attempt.id),
            "state": attempt.state,
            "recovery_count": attempt.recovery_count,
            "remaining_recoveries": max(0, allowed_recoveries - attempt.recovery_count),
            "token": token,
            "assessment": {
                "id": str(attempt.assessment.id) if attempt.assessment else None,
                "title": attempt.assessment.title if attempt.assessment else (attempt.config.title if attempt.config else ""),
                "delivery_mode": attempt.assessment.delivery_mode if attempt.assessment else "MCQ",
                "remaining_seconds": attempt.get_remaining_seconds(),
            },
        })


class DriveLinkCandidateView(APIView):
    """
    Allows existing registered candidates (either authenticated via candidate session token
    or verified via registration number + email/phone) to link their profile to a Drive
    without creating duplicate candidate records or re-entering registration forms.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        drive_code = (request.data.get("drive_code") or "").strip()
        access_code = (request.data.get("access_code") or "").strip()
        invite_token = (request.data.get("invite_token") or "").strip()
        reg_number = (request.data.get("register_number") or "").strip().upper()
        verification_factor = (request.data.get("verification_factor") or "").strip().lower()
        candidate_token = (request.data.get("token") or "").strip()

        # 1. Resolve Candidate
        candidate = None
        auth_header = request.headers.get("Authorization", "")
        token_to_check = candidate_token
        if auth_header.startswith("Bearer "):
            token_to_check = auth_header.split(" ", 1)[1].strip()
        elif "X-Assessment-Token" in request.headers:
            token_to_check = request.headers["X-Assessment-Token"].strip()

        if token_to_check:
            try:
                data = decode_candidate_token(token_to_check)
                candidate_id = data.get("candidate_id")
                candidate = Candidate.objects.filter(id=candidate_id, is_active=True).first()
            except Exception:
                pass

        if not candidate and reg_number and verification_factor:
            candidate = (
                Candidate.objects.filter(register_number=reg_number, email__iexact=verification_factor, is_active=True).first()
                or Candidate.objects.filter(register_number=reg_number, phone_number=verification_factor, is_active=True).first()
            )

        if not candidate:
            return Response(
                {"detail": "Candidate profile not recognized. Please sign in with your Register Number and registered Email/Mobile."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # 2. Resolve Drive and Invitation
        target_drive = None
        invitation_obj = None

        if invite_token:
            invitation_obj = (
                DriveInvitation.objects.filter(token_hash=invite_token, is_active=True).first()
                or DriveInvitation.objects.filter(access_code__iexact=invite_token, is_active=True).first()
            )
            if not invitation_obj:
                return Response({"detail": "Invalid or inactive invitation token."}, status=status.HTTP_400_BAD_REQUEST)
            if not invitation_obj.is_valid():
                return Response({"detail": "This invitation has expired or reached its maximum usage limit."}, status=status.HTTP_400_BAD_REQUEST)
            target_drive = invitation_obj.drive

        if access_code and not target_drive:
            inv_by_code = DriveInvitation.objects.filter(access_code__iexact=access_code, is_active=True).first()
            if inv_by_code:
                if not inv_by_code.is_valid():
                    return Response({"detail": "This access code has expired or reached its maximum usage limit."}, status=status.HTTP_400_BAD_REQUEST)
                invitation_obj = inv_by_code
                target_drive = inv_by_code.drive
            else:
                from django.db.models import Q
                target_drive = Drive.objects.filter(Q(drive_code=access_code) | Q(code__iexact=access_code)).first()

        if drive_code and not target_drive:
            target_drive = Drive.objects.filter(code__iexact=drive_code).first()

        if not target_drive:
            return Response({"detail": "Recruitment drive not found."}, status=status.HTTP_404_NOT_FOUND)

        # 3. Validate Drive Lifecycle
        now = timezone.now()
        if target_drive.registration_start and now < target_drive.registration_start:
            return Response({"detail": f"Registration for drive '{target_drive.name}' has not opened yet."}, status=status.HTTP_403_FORBIDDEN)
        if target_drive.registration_end and now > target_drive.registration_end:
            return Response({"detail": f"Registration for drive '{target_drive.name}' has closed."}, status=status.HTTP_403_FORBIDDEN)
        if target_drive.status in [Drive.Status.COMPLETED, Drive.Status.ARCHIVED]:
            return Response({"detail": f"Drive '{target_drive.name}' is no longer active."}, status=status.HTTP_403_FORBIDDEN)

        college_obj = candidate.college_ref
        if target_drive.eligible_colleges.exists():
            if not college_obj or not target_drive.eligible_colleges.filter(id=college_obj.id).exists():
                return Response({"detail": f"Your institution is not eligible for drive '{target_drive.name}'."}, status=status.HTTP_403_FORBIDDEN)

        if target_drive.visibility == Drive.Visibility.INVITE_ONLY and not invitation_obj:
            code_matched = (
                (access_code and (access_code == target_drive.drive_code or access_code.lower() == target_drive.code.lower()))
                or (drive_code and (drive_code == target_drive.drive_code or drive_code.lower() == target_drive.code.lower()))
            )
            if not code_matched:
                return Response({"detail": f"Drive '{target_drive.name}' is invite-only. A valid invitation link or access code is required."}, status=status.HTTP_403_FORBIDDEN)

        # 4. Atomically link Candidate to Drive and Drive Assessments
        with transaction.atomic():
            reg_source = DriveRegistration.Source.PUBLIC_URL
            if invitation_obj:
                reg_source = DriveRegistration.Source.INVITE_LINK if invite_token else DriveRegistration.Source.ACCESS_CODE
            drive_reg, created_reg = DriveRegistration.objects.get_or_create(
                drive=target_drive,
                candidate=candidate,
                defaults={"registration_source": reg_source, "registration_status": DriveRegistration.Status.REGISTERED},
            )
            if invitation_obj and created_reg:
                invitation_obj.usage_count += 1
                invitation_obj.save(update_fields=["usage_count"])

            for da in target_drive.drive_assessments.filter(registration_enabled=True).select_related("assessment"):
                a = da.assessment
                if not a.eligible_colleges.exists() or (college_obj and a.eligible_colleges.filter(id=college_obj.id).exists()):
                    a.eligible_candidates.add(candidate)

            token = generate_candidate_token(str(candidate.id))

        return Response({
            "success": True,
            "message": f"Successfully linked your account to {target_drive.name}.",
            "candidate_id": str(candidate.id),
            "full_name": candidate.full_name,
            "register_number": candidate.register_number,
            "college": candidate.college,
            "drive_id": str(target_drive.id),
            "drive_name": target_drive.name,
            "drive_code": target_drive.code,
            "assessment_token": token,
        })


class CandidateRegisterView(APIView):
    """
    Step 1: Student opens assessment portal, enters academic & identity details.
    Selects from managed active Colleges. Enforces mandatory mobile phone number.
    Returns secure, signed assessment token for subsequent requests.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CandidateRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        email = data["email"].strip().lower()
        college_id = data.get("college_id")
        college_name = data.get("college", "").strip()
        reg_no = data["register_number"].strip().upper()
        phone_no = data.get("phone_number", "").strip()
        drive_code = (data.get("drive_code") or "").strip()
        invite_token = (data.get("invite_token") or "").strip()
        access_code = (data.get("access_code") or "").strip()
        target_assessment_id = data.get("assessment_id")

        # Resolve College entity
        college_obj = None
        if college_id:
            college_obj = College.objects.filter(id=college_id, is_active=True).first()
            if not college_obj:
                return Response(
                    {"college_id": ["Selected institution is currently inactive or invalid."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            college_name = college_obj.name
        elif college_name:
            from .services import resolve_or_create_college
            college_obj = resolve_or_create_college(college_name, is_student_entry=True)

        if not college_obj:
            return Response(
                {"college": ["Please select a valid institution from the list."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_drive = None
        invitation_obj = None

        if invite_token:
            invitation_obj = (
                DriveInvitation.objects.filter(token_hash=invite_token, is_active=True).first()
                or DriveInvitation.objects.filter(access_code__iexact=invite_token, is_active=True).first()
            )
            if not invitation_obj:
                return Response({"invite_token": ["Invalid or inactive invitation token."]}, status=status.HTTP_400_BAD_REQUEST)
            if not invitation_obj.is_valid():
                return Response({"invite_token": ["This invitation has expired or reached its maximum usage limit."]}, status=status.HTTP_400_BAD_REQUEST)
            target_drive = invitation_obj.drive

        if access_code:
            inv_by_code = DriveInvitation.objects.filter(access_code__iexact=access_code, is_active=True).first()
            if inv_by_code:
                if not inv_by_code.is_valid():
                    return Response({"access_code": ["This access code has expired or reached its maximum usage limit."]}, status=status.HTTP_400_BAD_REQUEST)
                invitation_obj = inv_by_code
                target_drive = inv_by_code.drive
            else:
                assessment_by_code = Assessment.objects.filter(access_code__iexact=access_code).first()
                if assessment_by_code:
                    target_assessment_id = str(assessment_by_code.id)
                else:
                    from django.db.models import Q
                    drive_by_access = Drive.objects.filter(Q(drive_code=access_code) | Q(code__iexact=access_code)).first()
                    if drive_by_access:
                        target_drive = drive_by_access

        if drive_code and not target_drive:
            from django.db.models import Q
            target_drive = Drive.objects.filter(Q(drive_code=drive_code) | Q(code__iexact=drive_code)).first()
            if not target_drive:
                return Response({"drive_code": [f"Drive with code '{drive_code}' not found."]}, status=status.HTTP_404_NOT_FOUND)

        if target_drive:
            now = timezone.now()
            if target_drive.registration_start and now < target_drive.registration_start:
                return Response({"detail": f"Registration for drive '{target_drive.name}' has not opened yet."}, status=status.HTTP_403_FORBIDDEN)
            if target_drive.registration_end and now > target_drive.registration_end:
                return Response({"detail": f"Registration for drive '{target_drive.name}' has closed."}, status=status.HTTP_403_FORBIDDEN)
            if target_drive.status in [Drive.Status.COMPLETED, Drive.Status.ARCHIVED]:
                return Response({"detail": f"Drive '{target_drive.name}' is no longer active."}, status=status.HTTP_403_FORBIDDEN)

            if target_drive.eligible_colleges.exists():
                if not college_obj or not target_drive.eligible_colleges.filter(id=college_obj.id).exists():
                    return Response({"college": [f"Your institution is not eligible for drive '{target_drive.name}'."]}, status=status.HTTP_403_FORBIDDEN)

            if target_drive.visibility == Drive.Visibility.INVITE_ONLY and not invitation_obj:
                code_matched = (
                    (access_code and (access_code == target_drive.drive_code or access_code.lower() == target_drive.code.lower()))
                    or (drive_code and (drive_code == target_drive.drive_code or drive_code.lower() == target_drive.code.lower()))
                )
                if not code_matched:
                    return Response({"detail": f"Drive '{target_drive.name}' is invite-only. A valid invitation link or access code is required."}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            # Check existing candidate by email, or by college + register number
            existing_candidate = Candidate.objects.select_for_update().filter(email=email).first()
            if not existing_candidate:
                existing_candidate = Candidate.objects.select_for_update().filter(
                    college_ref=college_obj, register_number=reg_no
                ).first()
            if not existing_candidate:
                existing_candidate = Candidate.objects.select_for_update().filter(
                    register_number=reg_no
                ).first()

            if existing_candidate:
                # Active candidate & institution check
                if not existing_candidate.is_active:
                    return Response(
                        {"detail": "Your candidate profile has been deactivated. Please contact your administrator."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                if college_obj and not college_obj.is_active:
                    return Response(
                        {"detail": f"Institutional registration for {college_obj.name} is currently suspended."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                # Keep candidate record updated idempotently
                if not existing_candidate.email:
                    existing_candidate.email = email
                if phone_no:
                    existing_candidate.phone_number = phone_no
                if data.get("department"):
                    existing_candidate.department = data.get("department")
                if data.get("year_of_study"):
                    existing_candidate.year_of_study = data.get("year_of_study")
                if data.get("full_name") and existing_candidate.full_name != data["full_name"]:
                    existing_candidate.full_name = data["full_name"]
                if existing_candidate.college_ref_id != college_obj.id:
                    existing_candidate.college_ref = college_obj
                    existing_candidate.college = college_obj.name
                existing_candidate.save()

                # Determine target assessment if specified or singular
                target_assessment = None
                target_assessment_id = data.get("assessment_id")
                if target_assessment_id:
                    target_assessment = Assessment.objects.filter(id=target_assessment_id).first()
                    if target_assessment:
                        has_colleges = target_assessment.eligible_colleges.exists()
                        has_candidates = target_assessment.eligible_candidates.exists()
                        is_directly_eligible = (
                            target_assessment.eligible_candidates.filter(id=existing_candidate.id).exists()
                            if has_candidates
                            else False
                        )
                        is_college_eligible = (
                            bool(college_obj and target_assessment.eligible_colleges.filter(id=college_obj.id).exists())
                            if has_colleges
                            else bool(target_drive and not has_colleges)
                        )
                        is_open_to_all = (not has_colleges) and (not has_candidates) and (not target_drive)
                        if not (is_directly_eligible or is_college_eligible or is_open_to_all):
                            return Response(
                                {"detail": f"You are not eligible for '{target_assessment.title}'."},
                                status=status.HTTP_400_BAD_REQUEST,
                            )
                if not target_assessment and college_obj:
                    open_assigned = college_obj.assigned_assessments.filter(status=Assessment.Status.OPEN)
                    if open_assigned.count() == 1:
                        target_assessment = open_assigned.first()

                if target_assessment:
                    from .models import AssessmentRegistration
                    AssessmentRegistration.objects.get_or_create(
                        assessment=target_assessment,
                        candidate=existing_candidate,
                        defaults={"drive": target_drive},
                    )

                # Check for active in-progress attempt
                attempt_qs = existing_candidate.attempts.all()
                if target_assessment:
                    active_attempt = attempt_qs.filter(
                        assessment=target_assessment,
                        state__in=[AssessmentAttempt.State.CREATED, AssessmentAttempt.State.IN_PROGRESS],
                    ).order_by("-created_at").first()
                else:
                    active_attempt = attempt_qs.filter(
                        state__in=[AssessmentAttempt.State.CREATED, AssessmentAttempt.State.IN_PROGRESS],
                    ).order_by("-created_at").first()

                if active_attempt and active_attempt.is_expired():
                    finalize_assessment_attempt(active_attempt, final_state=AssessmentAttempt.State.TIMED_OUT)
                    active_attempt = None

                # Check completed attempts against attempt limit
                if target_assessment:
                    completed_attempts = attempt_qs.filter(
                        assessment=target_assessment,
                        state__in=[
                            AssessmentAttempt.State.SUBMITTED,
                            AssessmentAttempt.State.TIMED_OUT,
                            AssessmentAttempt.State.FLAGGED_FOR_REVIEW,
                        ],
                    )
                    already_completed = completed_attempts.count() >= target_assessment.max_attempts
                    last_completed = completed_attempts.order_by("-created_at").first()
                else:
                    open_assigned = college_obj.assigned_assessments.filter(status=Assessment.Status.OPEN) if college_obj else Assessment.objects.none()
                    if open_assigned.exists():
                        eligible_for_any = False
                        for a in open_assigned:
                            done_count = attempt_qs.filter(
                                assessment=a,
                                state__in=[
                                    AssessmentAttempt.State.SUBMITTED,
                                    AssessmentAttempt.State.TIMED_OUT,
                                    AssessmentAttempt.State.FLAGGED_FOR_REVIEW,
                                ],
                            ).count()
                            if done_count < a.max_attempts:
                                eligible_for_any = True
                                break
                        already_completed = not eligible_for_any
                        last_completed = attempt_qs.filter(
                            state__in=[
                                AssessmentAttempt.State.SUBMITTED,
                                AssessmentAttempt.State.TIMED_OUT,
                                AssessmentAttempt.State.FLAGGED_FOR_REVIEW,
                            ]
                        ).order_by("-created_at").first()
                    else:
                        completed_attempts = attempt_qs.filter(
                            state__in=[
                                AssessmentAttempt.State.SUBMITTED,
                                AssessmentAttempt.State.TIMED_OUT,
                                AssessmentAttempt.State.FLAGGED_FOR_REVIEW,
                            ]
                        )
                        already_completed = completed_attempts.exists()
                        last_completed = completed_attempts.order_by("-created_at").first()

                if target_drive:
                    reg_source = DriveRegistration.Source.PUBLIC_URL
                    if invitation_obj:
                        reg_source = DriveRegistration.Source.INVITE_LINK if invite_token else DriveRegistration.Source.ACCESS_CODE
                    drive_reg, created_reg = DriveRegistration.objects.get_or_create(
                        drive=target_drive,
                        candidate=existing_candidate,
                        defaults={"registration_source": reg_source, "registration_status": DriveRegistration.Status.REGISTERED},
                    )
                    if invitation_obj and created_reg:
                        invitation_obj.usage_count += 1
                        invitation_obj.save(update_fields=["usage_count"])
                    for da in target_drive.drive_assessments.filter(registration_enabled=True).select_related("assessment"):
                        a = da.assessment
                        if not a.eligible_colleges.exists() or (college_obj and a.eligible_colleges.filter(id=college_obj.id).exists()):
                            a.eligible_candidates.add(existing_candidate)

                if active_attempt:
                    registration_status = "IN_PROGRESS"
                elif already_completed:
                    registration_status = "COMPLETED"
                else:
                    registration_status = "NOT_STARTED"

                token = generate_candidate_token(
                    str(existing_candidate.id),
                    str(active_attempt.id if active_attempt else (last_completed.id if (already_completed and last_completed) else None)),
                )

                remaining_secs = 0
                if active_attempt and active_attempt.deadline:
                    remaining_secs = max(0, int((active_attempt.deadline - timezone.now()).total_seconds()))

                return Response(
                    {
                        "candidate_id": str(existing_candidate.id),
                        "assessment_token": token,
                        "full_name": existing_candidate.full_name,
                        "college": existing_candidate.college,
                        "college_id": existing_candidate.college_ref_id,
                        "registration_status": registration_status,
                        "drive_id": str(target_drive.id) if target_drive else None,
                        "drive_name": target_drive.name if target_drive else None,
                        "drive_code": target_drive.code if target_drive else None,
                        "eight_digit_code": target_drive.drive_code if target_drive else None,
                        "is_active_attempt": bool(active_attempt),
                        "already_completed": already_completed and not bool(active_attempt),
                        "attempt_id": str(active_attempt.id if active_attempt else (last_completed.id if (already_completed and last_completed) else "")),
                        "attempt_state": active_attempt.state if active_attempt else (last_completed.state if (already_completed and last_completed) else ""),
                        "assessment_title": active_attempt.assessment.title if (active_attempt and active_attempt.assessment) else (last_completed.assessment.title if (already_completed and last_completed and last_completed.assessment) else "Assessment"),
                        "assessment_code": active_attempt.assessment.code if (active_attempt and active_attempt.assessment) else (last_completed.assessment.code if (already_completed and last_completed and last_completed.assessment) else "CSL"),
                        "remaining_seconds": remaining_secs,
                        "message": (
                            "Welcome back. Active session found."
                            if active_attempt
                            else ("Assessment already completed." if already_completed else "Registration verified. You may proceed to your assessment.")
                        ),
                    },
                    status=status.HTTP_200_OK,
                )
            else:
                target_assessment_id = data.get("assessment_id")
                if target_assessment_id:
                    target_assessment = Assessment.objects.filter(id=target_assessment_id).first()
                    if target_assessment:
                        has_colleges = target_assessment.eligible_colleges.exists()
                        has_candidates = target_assessment.eligible_candidates.exists()
                        is_college_eligible = (
                            bool(college_obj and target_assessment.eligible_colleges.filter(id=college_obj.id).exists())
                            if has_colleges
                            else False
                        )
                        is_open_to_all = (not has_colleges) and (not has_candidates)
                        # Check direct eligibility by reg_no or email for pre-assigned candidate
                        is_directly_eligible = (
                            target_assessment.eligible_candidates.filter(
                                models.Q(register_number=reg_no) | models.Q(email=email)
                            ).exists()
                            if has_candidates
                            else False
                        )
                        if not (is_directly_eligible or is_college_eligible or is_open_to_all):
                            return Response(
                                {"detail": f"You are not eligible for '{target_assessment.title}'."},
                                status=status.HTTP_400_BAD_REQUEST,
                            )

                candidate = Candidate.objects.create(
                    full_name=data["full_name"],
                    register_number=reg_no,
                    email=email,
                    college_ref=college_obj,
                    college=college_name,
                    department=data.get("department", "Engineering"),
                    year_of_study=data.get("year_of_study", "Final Year"),
                    phone_number=phone_no,
                    is_active=True,
                )

                if target_drive:
                    reg_source = DriveRegistration.Source.PUBLIC_URL
                    if invitation_obj:
                        reg_source = DriveRegistration.Source.INVITE_LINK if invite_token else DriveRegistration.Source.ACCESS_CODE
                    DriveRegistration.objects.create(
                        drive=target_drive,
                        candidate=candidate,
                        registration_source=reg_source,
                        registration_status=DriveRegistration.Status.REGISTERED,
                    )
                    if invitation_obj:
                        invitation_obj.usage_count += 1
                        invitation_obj.save(update_fields=["usage_count"])
                    for da in target_drive.drive_assessments.filter(registration_enabled=True).select_related("assessment"):
                        a = da.assessment
                        if not a.eligible_colleges.exists() or (college_obj and a.eligible_colleges.filter(id=college_obj.id).exists()):
                            a.eligible_candidates.add(candidate)

                target_assessment_id = data.get("assessment_id")
                if target_assessment_id:
                    target_assessment = Assessment.objects.filter(id=target_assessment_id).first()
                    if target_assessment:
                        from .models import AssessmentRegistration
                        AssessmentRegistration.objects.get_or_create(
                            assessment=target_assessment,
                            candidate=candidate,
                            defaults={"drive": target_drive},
                        )

        token = generate_candidate_token(str(candidate.id))

        return Response(
            {
                "candidate_id": str(candidate.id),
                "assessment_token": token,
                "full_name": candidate.full_name,
                "college": candidate.college,
                "college_id": candidate.college_ref_id,
                "drive_id": str(target_drive.id) if target_drive else None,
                "drive_name": target_drive.name if target_drive else None,
                "drive_code": target_drive.code if target_drive else None,
                "eight_digit_code": target_drive.drive_code if target_drive else None,
                "registration_status": "NEW_REGISTRATION",
                "is_active_attempt": False,
                "already_completed": False,
                "message": "Registration successful. You may proceed to your assessment.",
            },
            status=status.HTTP_201_CREATED,
        )


class PublicDriveDetailView(APIView):
    """
    Public metadata for a drive during registration.
    """
    permission_classes = [AllowAny]

    def get(self, request, code_or_id):
        drive = (
            Drive.objects.filter(code__iexact=code_or_id).first()
            or Drive.objects.filter(id=code_or_id).first()
        )
        if not drive:
            return Response({"detail": "Drive not found."}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        is_registration_open = True
        if drive.status not in [Drive.Status.ACTIVE, Drive.Status.UPCOMING]:
            is_registration_open = False
        if drive.registration_start and now < drive.registration_start:
            is_registration_open = False
        if drive.registration_end and now > drive.registration_end:
            is_registration_open = False

        assessments_list = []
        for da in drive.drive_assessments.filter(registration_enabled=True).select_related("assessment"):
            assessments_list.append({
                "id": str(da.assessment.id),
                "code": da.assessment.code,
                "title": da.assessment.title,
                "duration_minutes": da.assessment.duration_minutes,
                "total_marks": da.assessment.total_marks,
                "is_required": da.is_required,
                "delivery_mode": da.assessment.delivery_mode,
                "assessment_type": da.assessment.assessment_type,
            })

        eligible_colleges_list = [
            {"id": c.id, "name": c.name, "code": c.code}
            for c in drive.eligible_colleges.filter(is_active=True)
        ]

        return Response({
            "id": str(drive.id),
            "code": drive.code,
            "name": drive.name,
            "description": drive.description,
            "status": drive.status,
            "visibility": drive.visibility,
            "start_date": drive.start_date.isoformat() if drive.start_date else None,
            "end_date": drive.end_date.isoformat() if drive.end_date else None,
            "registration_start": drive.registration_start.isoformat() if drive.registration_start else None,
            "registration_end": drive.registration_end.isoformat() if drive.registration_end else None,
            "is_registration_open": is_registration_open,
            "eligible_colleges": eligible_colleges_list,
            "assessments": assessments_list,
        })


class ResolveAccessCodeView(APIView):
    """
    Validates an invite access code or token and returns the corresponding Drive or Assessment.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        code = request.data.get("code", "").strip()
        if not code:
            return Response({"detail": "Access code or token is required."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Check DriveInvitation token or access code
        inv = (
            DriveInvitation.objects.filter(access_code__iexact=code, is_active=True).first()
            or DriveInvitation.objects.filter(token_hash=code, is_active=True).first()
        )
        if inv:
            if not inv.is_valid():
                return Response({"detail": "This invitation has expired or reached its maximum usage limit."}, status=status.HTTP_400_BAD_REQUEST)
            drive = inv.drive
            return Response({
                "type": "DRIVE",
                "drive_id": str(drive.id),
                "drive_code": drive.code,
                "drive_name": drive.name,
                "visibility": drive.visibility,
                "message": f"Invitation verified for {drive.name}.",
            })

        # 2. Check Assessment access code
        assessment = Assessment.objects.filter(access_code__iexact=code).first()
        if assessment:
            return Response({
                "type": "ASSESSMENT",
                "assessment_id": str(assessment.id),
                "assessment_code": assessment.code,
                "assessment_title": assessment.title,
                "visibility": assessment.visibility,
                "message": f"Access code verified for '{assessment.title}'.",
            })

        # 3. Check Drive code directly (both 8-digit numeric code and alphanumeric code)
        from django.db.models import Q
        drive = Drive.objects.filter(Q(drive_code=code) | Q(code__iexact=code)).first()
        if drive:
            if drive.status in [Drive.Status.COMPLETED, Drive.Status.ARCHIVED]:
                return Response({"detail": f"Drive '{drive.name}' is no longer active."}, status=status.HTTP_403_FORBIDDEN)
            # An 8-digit access code or drive code directly authorizes entry to an invite-only drive
            if drive.visibility == Drive.Visibility.INVITE_ONLY and not (code == drive.drive_code or code.lower() == drive.code.lower()):
                return Response({"detail": "This drive is invite-only. A valid invitation token or access code is required."}, status=status.HTTP_403_FORBIDDEN)
            return Response({
                "type": "DRIVE",
                "drive_id": str(drive.id),
                "drive_code": drive.code,
                "eight_digit_code": drive.drive_code,
                "drive_name": drive.name,
                "visibility": drive.visibility,
                "eligible_college_ids": list(drive.eligible_colleges.values_list("id", flat=True)),
                "message": f"Drive verified: {drive.name}.",
            })

        return Response({"detail": "Invalid access code or token."}, status=status.HTTP_404_NOT_FOUND)


class StartAssessmentView(APIView):
    """
    Step 2: Start or resume assessment attempt.
    Requires CandidateAssessmentAuthentication token.
    Accepts optional assessment_id to target a specific independent assessment.
    Enforces Safe Exam Browser (SEB) requirement when enabled on assessment.
    Persists camera calibration and SEB verification status.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        view_started = time.perf_counter()
        candidate = get_authorized_candidate(request)
        if not candidate:
            return Response(
                {"detail": "Authentication required. Valid assessment token must be provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        assessment_id = request.data.get("assessment_id")
        assessment = None
        if assessment_id:
            assessment = (
                Assessment.objects.annotate(
                    has_pool_questions=Exists(
                        Assessment.questions.through.objects.filter(assessment_id=OuterRef("pk"))
                    )
                )
                .prefetch_related(
                    "eligible_colleges",
                    "section_allocations__section",
                )
                .filter(id=assessment_id)
                .first()
            )
            if not assessment:
                return Response(
                    {"detail": f"Assessment '{assessment_id}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Enforce Safe Exam Browser (SEB) if required
        if assessment and assessment.is_seb_required:
            seb_header = (
                request.headers.get("X-SafeExamBrowser-RequestHash")
                or request.META.get("HTTP_X_SAFEEXAMBROWSER_REQUESTHASH")
            )
            user_agent = request.META.get("HTTP_USER_AGENT", "")
            bek_received = (
                request.headers.get("X-SafeExamBrowser-BrowserExamKey")
                or request.META.get("HTTP_X_SAFEEXAMBROWSER_BROWSEREXAMKEY")
                or request.data.get("browser_exam_key")
            )
            is_seb_client = bool(seb_header) or ("SEB" in user_agent.upper()) or ("SAFEEXAMBROWSER" in user_agent.upper())
            if not is_seb_client:
                return Response(
                    {
                        "detail": "This assessment is protected and requires Safe Exam Browser (SEB). Please launch via SEB.",
                        "is_seb_required": True,
                        "seb_config_url": f"/api/assessment/{assessment.id}/seb-config/",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if assessment.seb_browser_exam_key and bek_received:
                if bek_received.strip() != assessment.seb_browser_exam_key.strip():
                    return Response(
                        {
                            "detail": "Invalid Safe Exam Browser Exam Key. The configuration file being used does not match the official exam key for this assessment.",
                            "is_seb_required": True,
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        config = get_or_create_default_config()
        lookup_ms = (time.perf_counter() - view_started) * 1000.0

        try:
            service_started = time.perf_counter()
            attempt = start_assessment_for_candidate(candidate, assessment=assessment, config=config)
            service_ms = (time.perf_counter() - service_started) * 1000.0

            # Update calibration, bypass, and SEB verification
            update_fields = []
            if assessment and assessment.is_seb_required:
                attempt.is_seb_verified = True
                update_fields.append("is_seb_verified")

            # Check admin camera bypass if grant_id provided
            grant_id = request.data.get("bypass_grant_id") or request.data.get("grant_id")
            if grant_id:
                bypass_grant = AdminAccessGrant.objects.filter(
                    id=grant_id,
                    candidate=candidate,
                    grant_type="CAMERA_BYPASS",
                    is_used=False
                ).first()
                if bypass_grant:
                    attempt.camera_calibrated = True
                    update_fields.append("camera_calibrated")
                    bypass_grant.is_used = True
                    bypass_grant.used_at = timezone.now()
                    bypass_grant.save(update_fields=["is_used", "used_at"])
            else:
                if request.data.get("camera_calibrated") is not None:
                    attempt.camera_calibrated = bool(request.data.get("camera_calibrated"))
                    update_fields.append("camera_calibrated")
                if request.data.get("camera_calibration_data"):
                    attempt.camera_calibration_data = request.data.get("camera_calibration_data")
                    update_fields.append("camera_calibration_data")

            if update_fields:
                attempt.save(update_fields=list(set(update_fields)))

            token = generate_candidate_token(str(candidate.id), str(attempt.id))

            prep_started = time.perf_counter()
            if not (
                hasattr(attempt, "_prefetched_objects_cache")
                and "question_snapshots" in attempt._prefetched_objects_cache
            ):
                attempt = (
                    AssessmentAttempt.objects.select_related("candidate", "assessment", "config")
                    .prefetch_related(
                        "question_snapshots__question",
                        "assessment__section_allocations__section",
                    )
                    .get(pk=attempt.pk)
                )
            prep_ms = (time.perf_counter() - prep_started) * 1000.0

            serializer_started = time.perf_counter()
            serializer = AssessmentAttemptDetailSerializer(attempt)
            res_data = dict(serializer.data)
            serializer_ms = (time.perf_counter() - serializer_started) * 1000.0
            total_ms = (time.perf_counter() - view_started) * 1000.0

            logger.info(
                "ASSESSMENT_START_TIMING lookup_ms=%.1f service_ms=%.1f prep_ms=%.1f serializer_ms=%.1f total_ms=%.1f attempt_id=%s",
                lookup_ms,
                service_ms,
                prep_ms,
                serializer_ms,
                total_ms,
                attempt.id,
            )

            res_data["assessment_token"] = token
            return Response(res_data, status=status.HTTP_200_OK)
        
        except ValidationError as e:
            detail_msg = getattr(e, "detail", str(e))
            if isinstance(detail_msg, dict):
                return Response(detail_msg, status=status.HTTP_400_BAD_REQUEST)
            return Response({"detail": str(detail_msg)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"Unexpected assessment generation failure for candidate {candidate.id}: {e}")
            detail_msg = getattr(e, "detail", None)
            if detail_msg:
                if isinstance(detail_msg, dict):
                    return Response(detail_msg, status=status.HTTP_400_BAD_REQUEST)
                return Response({"detail": str(detail_msg)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(
                {"detail": "Assessment generation could not be completed. Please contact your administrator."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class AttemptStateView(APIView):
    """
    Step 3: Retrieve current active attempt (for reconnect / page refresh).
    Strict ownership check.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(
            AssessmentAttempt.objects.select_related(
                "candidate", "candidate__college_ref", "assessment", "config"
            ).prefetch_related(
                "question_snapshots",
                "assessment__section_allocations__section",
            ),
            id=attempt_id,
        )
        if not verify_attempt_ownership(request, attempt):
            return Response({"detail": "Access forbidden: you do not own this attempt."}, status=status.HTTP_403_FORBIDDEN)

        # If attempt was paused, resume it upon reconnection
        if attempt.state == AssessmentAttempt.State.IN_PROGRESS and attempt.is_paused:
            credited = attempt.resume_attempt()
            if credited > 0:
                IntegrityEvent.objects.create(
                    attempt=attempt,
                    event_type=IntegrityEvent.EventType.RECONNECTED,
                    metadata={"credited_seconds": credited, "source": "ATTEMPT_STATE_RECONNECT"},
                )

        # Check timeout server-side
        if attempt.state == AssessmentAttempt.State.IN_PROGRESS and attempt.is_expired():
            attempt = finalize_assessment_attempt(attempt, final_state=AssessmentAttempt.State.TIMED_OUT)

        serializer = AssessmentAttemptDetailSerializer(attempt)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SaveAnswerView(APIView):
    """
    Step 4: Save individual MCQ answer. Validates deadline server-side with strict ownership.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, attempt_id):
        serializer = AnswerSaveSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        q_order = serializer.validated_data["question_order"]
        sel_opt = serializer.validated_data.get("selected_option", "")

        snapshot = save_candidate_answer(attempt_id, q_order, sel_opt, request=request)
        return Response(
            {
                "question_order": snapshot.question_order,
                "selected_option": snapshot.selected_option,
                "saved_at": snapshot.answered_at,
                "status": "saved",
            },
            status=status.HTTP_200_OK,
        )


class AttemptHeartbeatView(APIView):
    """
    Heartbeat and connection health monitor for active candidate attempts.
    - Synchronizes authoritative server timer
    - Resumes paused timer upon reconnect
    - Gracefully pauses timer if explicit disconnect reported
    - Enforces timeout server-side
    - Throttled to prevent request storms
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request, attempt_id):
        attempt = (
            AssessmentAttempt.objects.select_for_update()
            .filter(id=attempt_id)
            .first()
        )
        if not attempt:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        if not verify_attempt_ownership(request, attempt):
            return Response({"detail": "Access forbidden: you do not own this attempt."}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()

        if attempt.state in [
            AssessmentAttempt.State.SUBMITTED,
            AssessmentAttempt.State.COMPLETED_PENDING_MANUAL_EVALUATION,
            AssessmentAttempt.State.TIMED_OUT,
            AssessmentAttempt.State.FLAGGED_FOR_REVIEW,
        ]:
            return Response(
                {
                    "status": "finalized",
                    "attempt_id": str(attempt.id),
                    "state": attempt.state,
                    "remaining_seconds": 0,
                    "server_time": now.isoformat(),
                    "is_paused": False,
                },
                status=status.HTTP_200_OK,
            )

        if attempt.is_expired():
            attempt = finalize_assessment_attempt(attempt, final_state=AssessmentAttempt.State.TIMED_OUT)
            return Response(
                {
                    "status": "expired",
                    "attempt_id": str(attempt.id),
                    "state": attempt.state,
                    "remaining_seconds": 0,
                    "server_time": now.isoformat(),
                    "is_paused": False,
                },
                status=status.HTTP_200_OK,
            )

        action = request.data.get("action", "").lower()
        if action == "pause":
            if not attempt.is_paused:
                attempt.pause_attempt(at_time=now)
                IntegrityEvent.objects.create(
                    attempt=attempt,
                    event_type=IntegrityEvent.EventType.TAB_HIDDEN,
                    metadata={"reason": "CLIENT_OFFLINE_PAUSE", "paused_at": now.isoformat()},
                )
        else:
            if attempt.is_paused:
                credited = attempt.resume_attempt(at_time=now)
                if credited > 0:
                    IntegrityEvent.objects.create(
                        attempt=attempt,
                        event_type=IntegrityEvent.EventType.RECONNECTED,
                        metadata={"credited_seconds": credited, "source": "HEARTBEAT_RESUME"},
                    )
            else:
                attempt.last_heartbeat = now
                attempt.save(update_fields=["last_heartbeat", "updated_at"])

        return Response(
            {
                "status": "ok",
                "attempt_id": str(attempt.id),
                "state": attempt.state,
                "remaining_seconds": attempt.get_remaining_seconds(),
                "server_time": now.isoformat(),
                "is_paused": attempt.is_paused,
                "total_paused_seconds": attempt.total_paused_seconds,
                "max_disconnection_grace_seconds": attempt.max_disconnection_grace_seconds,
                "deadline": attempt.deadline.isoformat() if attempt.deadline else None,
            },
            status=status.HTTP_200_OK,
        )


class SyncAnswersView(APIView):
    """
    Batch answer synchronization for network recovery.
    Applies multiple locally persisted answers idempotently within a single transaction.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(AssessmentAttempt, id=attempt_id)
        if not verify_attempt_ownership(request, attempt):
            return Response({"detail": "Access forbidden: you do not own this attempt."}, status=status.HTTP_403_FORBIDDEN)

        if attempt.state != AssessmentAttempt.State.IN_PROGRESS:
            return Response({"detail": f"Attempt is not active (state: {attempt.state})."}, status=status.HTTP_400_BAD_REQUEST)

        if attempt.assessment and attempt.assessment.delivery_mode == Assessment.DeliveryMode.PDF_CODING:
            return Response(
                {"detail": "Digital answer synchronization is not supported for PDF Coding Assessments. Answers must be written on paper."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if attempt.is_expired():
            finalize_assessment_attempt(attempt, final_state=AssessmentAttempt.State.TIMED_OUT)
            return Response({"detail": "Assessment time has expired."}, status=status.HTTP_400_BAD_REQUEST)

        answers = request.data.get("answers", [])
        if not isinstance(answers, list):
            return Response({"detail": "Answers must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        synced_orders = []
        now = timezone.now()

        with transaction.atomic():
            locked_attempt = (
                AssessmentAttempt.objects.select_for_update()
                .filter(id=attempt.id)
                .first()
            )
            if not locked_attempt or locked_attempt.state != AssessmentAttempt.State.IN_PROGRESS:
                return Response({"detail": "Attempt is no longer active."}, status=status.HTTP_400_BAD_REQUEST)

            snapshots = {s.question_order: s for s in locked_attempt.question_snapshots.select_for_update().all()}
            for item in answers:
                if not isinstance(item, dict):
                    continue
                q_order = item.get("question_order")
                sel_opt = (item.get("selected_option") or "").strip().upper()
                if q_order in snapshots and sel_opt in ("", "A", "B", "C", "D"):
                    snap = snapshots[q_order]
                    snap.selected_option = sel_opt
                    snap.answered_at = now
                    snap.save(update_fields=["selected_option", "answered_at", "updated_at"])
                    synced_orders.append(q_order)

        return Response(
            {
                "status": "synced",
                "synced_count": len(synced_orders),
                "synced_orders": synced_orders,
            },
            status=status.HTTP_200_OK,
        )


class RecordIntegrityEventView(APIView):
    """
    Step 5: Record tab switch, full-screen toggle, reconnect integrity events.
    Enforces the tab switch limit (default 2 warnings; 3rd switch auto-submits).
    Supports event_id deduplication for network idempotency.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, attempt_id):
        serializer = IntegrityEventSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        ev_type = serializer.validated_data["event_type"]
        event_id = serializer.validated_data.get("event_id", "").strip()
        client_ts = serializer.validated_data.get("client_timestamp")
        metadata = serializer.validated_data.get("metadata", {})

        with transaction.atomic():
            attempt = (
                AssessmentAttempt.objects.select_for_update()
                .filter(id=attempt_id)
                .first()
            )
            if not attempt:
                return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

            if not verify_attempt_ownership(request, attempt):
                return Response(
                    {"detail": "Access forbidden: you do not own this attempt."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            allowed = (
                attempt.assessment.max_tab_switches_warning
                if attempt.assessment
                else (attempt.config.max_tab_switches_warning if attempt.config else 2)
            )
            auto_submit = (
                attempt.assessment.auto_submit_on_tab_limit
                if attempt.assessment
                else (attempt.config.auto_submit_on_tab_limit if attempt.config else True)
            )

            # Flood protection: check how many events were recorded in last 60 seconds
            from datetime import timedelta
            one_minute_ago = timezone.now() - timedelta(seconds=60)
            if IntegrityEvent.objects.filter(attempt=attempt, server_timestamp__gte=one_minute_ago).count() >= 30:
                return Response(
                    {"status": "rate_limited", "detail": "Integrity event rate limit exceeded."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            # If attempt is already in a terminal state, return current status
            if attempt.state in AssessmentAttempt.TERMINAL_STATES:
                return Response(
                    {
                        "status": "already_finalized",
                        "event_type": ev_type,
                        "tab_switches": attempt.tab_switch_count,
                        "max_switches": allowed,
                        "remaining_switches": max(0, allowed - attempt.tab_switch_count),
                        "is_finalized": True,
                        "state": attempt.state,
                        "flag_reason": attempt.flag_reason,
                    },
                    status=status.HTTP_200_OK,
                )

            # Deduplication: Check if this event_id was already recorded
            if event_id and IntegrityEvent.objects.filter(attempt=attempt, event_id=event_id).exists():
                return Response(
                    {
                        "status": "duplicate_ignored",
                        "event_type": ev_type,
                        "tab_switches": attempt.tab_switch_count,
                        "max_switches": allowed,
                        "remaining_switches": max(0, allowed - attempt.tab_switch_count),
                        "is_finalized": False,
                        "state": attempt.state,
                        "flag_reason": attempt.flag_reason,
                    },
                    status=status.HTTP_200_OK,
                )

            is_consecutive_hidden = False
            if ev_type == IntegrityEvent.EventType.TAB_HIDDEN:
                last_vis = (
                    IntegrityEvent.objects.filter(
                        attempt=attempt,
                        event_type__in=[
                            IntegrityEvent.EventType.TAB_HIDDEN,
                            IntegrityEvent.EventType.TAB_VISIBLE,
                        ],
                    )
                    .order_by("-server_timestamp", "-id")
                    .first()
                )
                if last_vis and last_vis.event_type == IntegrityEvent.EventType.TAB_HIDDEN:
                    is_consecutive_hidden = True

                if not is_consecutive_hidden:
                    attempt.tab_switch_count += 1

                    if auto_submit and attempt.tab_switch_count > allowed:
                        attempt.is_flagged = True
                        attempt.flag_reason = (
                            f"TAB_SWITCH_LIMIT_EXCEEDED: Exceeded permitted tab switches "
                            f"({attempt.tab_switch_count} switches recorded, limit is {allowed})"
                        )

                    attempt.save(
                        update_fields=[
                            "tab_switch_count",
                            "is_flagged",
                            "flag_reason",
                            "updated_at",
                        ]
                    )

                    if auto_submit and attempt.tab_switch_count > allowed:
                        attempt = finalize_assessment_attempt(
                            attempt, final_state=AssessmentAttempt.State.FLAGGED_FOR_REVIEW
                        )

            elif ev_type == IntegrityEvent.EventType.FULLSCREEN_EXIT:
                attempt.fullscreen_exit_count += 1
                attempt.save(update_fields=["fullscreen_exit_count", "updated_at"])

            IntegrityEvent.objects.create(
                attempt=attempt,
                event_type=ev_type,
                event_id=event_id,
                client_timestamp=client_ts,
                metadata=metadata,
            )

            is_final = attempt.state in [
                AssessmentAttempt.State.SUBMITTED,
                AssessmentAttempt.State.COMPLETED_PENDING_MANUAL_EVALUATION,
                AssessmentAttempt.State.TIMED_OUT,
                AssessmentAttempt.State.FLAGGED_FOR_REVIEW,
            ]

            return Response(
                {
                    "status": "recorded",
                    "event_type": ev_type,
                    "tab_switches": attempt.tab_switch_count,
                    "max_switches": allowed,
                    "remaining_switches": max(0, allowed - attempt.tab_switch_count),
                    "is_finalized": is_final,
                    "state": attempt.state,
                    "flag_reason": attempt.flag_reason,
                },
                status=status.HTTP_200_OK,
            )


class FinalizeAssessmentView(APIView):
    """
    Step 6: Finalize assessment and calculate scores. Strict ownership check.
    """
    authentication_classes = [CandidateAssessmentAuthentication, SessionAuthentication, BasicAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, attempt_id):
        finalized_attempt = finalize_assessment_attempt(attempt_id, request=request)
        serializer = AssessmentResultSerializer(finalized_attempt, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class AssessmentResultView(APIView):
    """
    Step 7: View finalized result. Strict ownership check.
    """
    authentication_classes = [CandidateAssessmentAuthentication, SessionAuthentication, BasicAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(AssessmentAttempt, id=attempt_id)
        if not verify_attempt_ownership(request, attempt):
            return Response({"detail": "Access forbidden: you do not own this attempt."}, status=status.HTTP_403_FORBIDDEN)

        if attempt.state in [AssessmentAttempt.State.CREATED, AssessmentAttempt.State.IN_PROGRESS]:
            if attempt.is_expired():
                finalize_assessment_attempt(attempt, final_state=AssessmentAttempt.State.TIMED_OUT)
            else:
                return Response(
                    {"detail": "Assessment attempt is still in progress."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = AssessmentResultSerializer(attempt, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class QuestionBankSummaryView(APIView):
    """
    Admin-only operational view for Question Bank metrics.
    Provides accurate counts of active, inactive, aptitude, coding, and category breakdowns.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        total = QuestionBank.objects.count()
        active = QuestionBank.objects.filter(is_active=True).count()
        inactive = total - active
        aptitude_active = QuestionBank.objects.filter(section_type=QuestionBank.SectionType.APTITUDE, is_active=True).count()
        coding_active = QuestionBank.objects.filter(section_type=QuestionBank.SectionType.CODING, is_active=True).count()

        config = get_or_create_default_config()

        # Dynamic section breakdown
        from django.db.models import Q
        sections_summary = []
        for sec in AssessmentSection.objects.filter(is_active=True).order_by("order", "name"):
            sec_cnt = QuestionBank.objects.filter(
                Q(section=sec) | Q(section_type__iexact=sec.code) | Q(section_type__iexact=sec.name),
                is_active=True,
            ).distinct().count()
            sections_summary.append({
                "id": sec.id,
                "name": sec.name,
                "code": sec.code,
                "active_questions": sec_cnt,
            })

        return Response({
            "total_questions": total,
            "active_questions": active,
            "inactive_questions": inactive,
            "aptitude_active": aptitude_active,
            "coding_active": coding_active,
            "aptitude_required": config.aptitude_count,
            "coding_required": config.coding_count,
            "is_sufficient": (aptitude_active >= config.aptitude_count and coding_active >= config.coding_count),
            "sections": sections_summary,
        })


class CandidateAttemptPdfDownloadView(APIView):
    """
    Candidate endpoint to stream the assessment question paper PDF.
    Requires CandidateAssessmentAuthentication token or active session.
    Strictly verifies:
    1. Candidate is authenticated
    2. Attempt belongs to the candidate
    3. Assessment delivery_mode is PDF_CODING
    4. Attempt is not expired (auto-times out if expired)
    """
    authentication_classes = [CandidateAssessmentAuthentication, SessionAuthentication, BasicAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(
            AssessmentAttempt.objects.select_related("candidate", "assessment"),
            id=attempt_id,
        )

        if not verify_attempt_ownership(request, attempt):
            return Response(
                {"detail": "Access forbidden: you do not own this attempt."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_pdf_mode = (
            attempt.assessment
            and (
                attempt.assessment.delivery_mode == Assessment.DeliveryMode.PDF_CODING
                or (hasattr(attempt.assessment, "pdf_document") and bool(attempt.assessment.pdf_document))
            )
        )
        if not is_pdf_mode:
            return Response(
                {"detail": "PDF question paper is only available for PDF Coding Assessments."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check timeout server-side
        if attempt.state == AssessmentAttempt.State.IN_PROGRESS and attempt.is_expired():
            finalize_assessment_attempt(attempt, final_state=AssessmentAttempt.State.TIMED_OUT)
            return Response(
                {"detail": "Your assessment attempt has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not hasattr(attempt.assessment, "pdf_document") or not attempt.assessment.pdf_document:
            return Response(
                {"detail": "The assessment question paper PDF is currently unavailable. Please contact your test administrator."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_doc = attempt.assessment.pdf_document
        pdf_bytes = pdf_doc.get_file_bytes()
        if not pdf_bytes:
            return Response(
                {"detail": "The question paper PDF content could not be retrieved from storage."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="{pdf_doc.original_filename}"'
        resp["Content-Length"] = len(pdf_bytes)
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        return resp


class StudentInstitutionRequestView(APIView):
    """
    Allows candidates to submit an institution enrollment request if their college
    is not yet present in the platform's College Directory.
    Preserves directory integrity without automatically injecting unverified entities.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        institution_name = (request.data.get("institution_name") or "").strip()
        student_email = (request.data.get("email") or "").strip().lower()
        city = (request.data.get("city") or "").strip()
        state_name = (request.data.get("state") or "").strip()

        if not institution_name:
            return Response(
                {"institution_name": ["Institution name is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check for duplicate recent request
        existing_request = AssessmentAuditLog.objects.filter(
            entity_type="COLLEGE_REQUEST",
            details__institution_name__iexact=institution_name,
        )
        if student_email:
            existing_request = existing_request.filter(entity_id=student_email)

        if existing_request.exists():
            return Response(
                {
                    "message": f"A request for '{institution_name}' has already been submitted and is currently pending review.",
                    "success": True,
                    "duplicate": True,
                },
                status=status.HTTP_200_OK,
            )

        action_choice = getattr(AssessmentAuditLog.Action, "INSTITUTION_REQUESTED", "INSTITUTION_REQUESTED")
        audit_log = AssessmentAuditLog.objects.create(
            action=action_choice,
            entity_type="COLLEGE_REQUEST",
            entity_id=student_email or "STUDENT",
            details={
                "institution_name": institution_name,
                "email": student_email,
                "city": city,
                "state": state_name,
            },
        )

        return Response(
            {
                "message": f"Your request to add '{institution_name}' has been received. Our administration team has been notified.",
                "success": True,
                "audit_id": audit_log.id,
            },
            status=status.HTTP_200_OK,
        )


class StudentCodeRunView(APIView):
    """
    Candidate executes programming code in Monaco Editor against custom stdin or public sample test cases.
    Provides immediate console output feedback without altering assessment score.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        candidate = get_authorized_candidate(request)
        if not candidate:
            return Response({"detail": "Valid candidate authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        attempt_id = request.data.get("attempt_id")
        question_id = request.data.get("question_id")
        language = (request.data.get("language") or "python").lower().strip()
        source_code = request.data.get("source_code", "")
        custom_input = request.data.get("custom_input")
        if custom_input is None:
            custom_input = request.data.get("stdin", None)

        if not source_code:
            return Response({"detail": "Source code cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        attempt = get_object_or_404(AssessmentAttempt, id=attempt_id, candidate=candidate)
        if attempt.state in AssessmentAttempt.TERMINAL_STATES:
            return Response({"detail": f"Attempt is {attempt.state}; code execution is no longer permitted."}, status=status.HTTP_403_FORBIDDEN)
        if attempt.is_expired():
            return Response({"detail": "Assessment time has expired. Code execution is no longer permitted."}, status=status.HTTP_403_FORBIDDEN)

        # Validate question belongs to this attempt
        snapshot = attempt.question_snapshots.filter(question_id=question_id).first()
        if not snapshot and not attempt.questions.filter(id=question_id).exists():
            return Response({"detail": "This question does not belong to the specified assessment attempt."}, status=status.HTTP_400_BAD_REQUEST)

        from .coding_service import execute_single_run, normalize_code_output
        from .models import ProgrammingQuestion

        prog_q = ProgrammingQuestion.objects.filter(question_id=question_id).first()
        time_limit = (
            snapshot.programming_data.get("time_limit_seconds")
            if (snapshot and snapshot.programming_data)
            else (prog_q.time_limit_seconds if prog_q else 2.0)
        ) or 2.0
        memory_limit = (
            snapshot.programming_data.get("memory_limit_mb")
            if (snapshot and snapshot.programming_data)
            else (prog_q.memory_limit_mb if prog_q else 256)
        ) or 256

        allowed_languages = (
            snapshot.programming_data.get("allowed_languages")
            if (snapshot and snapshot.programming_data)
            else (prog_q.allowed_languages if prog_q else ["python", "java"])
        )
        if allowed_languages and language not in [l.lower() for l in allowed_languages]:
            return Response(
                {"detail": f"Language '{language}' is not permitted for this problem. Allowed languages: {', '.join(allowed_languages)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if custom_input is not None:
            res = execute_single_run(
                language=language,
                source_code=source_code,
                stdin=custom_input,
                time_limit=time_limit,
                memory_limit_mb=memory_limit,
            )
            return Response({
                "mode": "CUSTOM_INPUT",
                "verdict": res.get("verdict"),
                "status": res.get("verdict"),
                "stdout": res.get("stdout"),
                "stderr": res.get("stderr"),
                "compile_output": res.get("compile_output"),
                "execution_time_ms": res.get("execution_time_ms"),
                "memory_used_kb": res.get("memory_used_kb"),
            })
        else:
            sample_results = []
            sample_cases = []
            if snapshot and snapshot.programming_data and snapshot.programming_data.get("test_cases"):
                sample_cases = [tc for tc in snapshot.programming_data["test_cases"] if tc.get("is_public")]
            elif prog_q:
                sample_cases = [
                    {
                        "id": str(tc.id),
                        "input_text": tc.input_text,
                        "expected_output": tc.expected_output,
                    }
                    for tc in prog_q.test_cases.filter(is_public=True, is_active=True).order_by("order", "created_at")
                ]

            for tc in sample_cases:
                tc_in = tc.get("input_text", "")
                tc_exp = tc.get("expected_output", "")
                res = execute_single_run(
                    language=language,
                    source_code=source_code,
                    stdin=tc_in or "",
                    time_limit=time_limit,
                    memory_limit_mb=memory_limit,
                )
                actual = normalize_code_output(res.get("stdout", ""))
                expected = normalize_code_output(tc_exp)
                passed = (res.get("verdict") == "ACCEPTED") and (actual == expected)
                sample_results.append({
                    "test_case_id": str(tc.get("id")),
                    "input_text": tc_in,
                    "expected_output": tc_exp,
                    "actual_output": res.get("stdout"),
                    "passed": passed,
                    "verdict": res.get("verdict"),
                    "execution_time_ms": res.get("execution_time_ms"),
                    "memory_used_kb": res.get("memory_used_kb"),
                })

            all_passed = all(r["passed"] for r in sample_results) if sample_results else False
            first_fail = next((r["verdict"] for r in sample_results if not r["passed"]), "ACCEPTED")
            overall_verdict = "ACCEPTED" if all_passed else first_fail

            return Response({
                "mode": "SAMPLE_CASES",
                "verdict": overall_verdict,
                "status": overall_verdict,
                "total_samples": len(sample_results),
                "passed_samples": sum(1 for r in sample_results if r["passed"]),
                "results": sample_results,
                "sample_results": sample_results,
            })


class StudentCodeSubmitView(APIView):
    """
    Candidate submits programming solution for authoritative grading.
    Evaluates against all configured test cases (public and hidden).
    Saves CodeSubmission and CodeTestResult linked to AssessmentAttempt.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        candidate = get_authorized_candidate(request)
        if not candidate:
            return Response({"detail": "Valid candidate authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        attempt_id = request.data.get("attempt_id")
        question_id = request.data.get("question_id")
        language = (request.data.get("language") or "python").lower().strip()
        source_code = request.data.get("source_code", "")

        if not source_code:
            return Response({"detail": "Source code cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        attempt = get_object_or_404(AssessmentAttempt, id=attempt_id, candidate=candidate)
        if attempt.state in AssessmentAttempt.TERMINAL_STATES:
            return Response({"detail": f"Attempt is {attempt.state}; code submission is no longer permitted."}, status=status.HTTP_403_FORBIDDEN)
        if attempt.is_expired():
            return Response({"detail": "Assessment time has expired. Submission is no longer permitted."}, status=status.HTTP_403_FORBIDDEN)

        # Validate question belongs to this attempt
        snapshot = attempt.question_snapshots.filter(question_id=question_id).first()
        if not snapshot and not attempt.questions.filter(id=question_id).exists():
            return Response({"detail": "This question does not belong to the specified assessment attempt."}, status=status.HTTP_400_BAD_REQUEST)

        from .models import ProgrammingQuestion
        from .coding_service import evaluate_submission

        prog_q = get_object_or_404(ProgrammingQuestion, question_id=question_id)

        allowed_languages = (
            snapshot.programming_data.get("allowed_languages")
            if (snapshot and snapshot.programming_data)
            else (prog_q.allowed_languages if prog_q else ["python", "java"])
        )
        if allowed_languages and language not in [l.lower() for l in allowed_languages]:
            return Response(
                {"detail": f"Language '{language}' is not permitted for this problem. Allowed languages: {', '.join(allowed_languages)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Disallow grading a problem with 0 test cases
        has_cases = False
        if snapshot and snapshot.programming_data and snapshot.programming_data.get("test_cases"):
            has_cases = len(snapshot.programming_data["test_cases"]) > 0
        else:
            has_cases = prog_q.test_cases.filter(is_active=True).exists()

        if not has_cases:
            return Response(
                {"detail": "This coding problem has no configured test cases and cannot be evaluated."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        eval_result = evaluate_submission(
            programming_question=prog_q,
            candidate=candidate,
            attempt=attempt,
            language=language,
            source_code=source_code,
        )

        eval_result["status"] = eval_result.get("verdict")
        eval_result["score"] = eval_result.get("score_awarded")
        eval_result["passed_count"] = eval_result.get("passed_test_cases")
        return Response(eval_result, status=status.HTTP_200_OK)




# ==============================================================================
# PHASE INFINITY EXTENSIONS: STUDENT RE-LOGIN, SEB CONFIG, CAMERA BYPASS & CALIBRATION
# ==============================================================================

class CandidateLoginView(APIView):
    """
    Enables returning students to re-login using Register Number or Email
    without creating duplicate records. Verifies eligibility and returns active
    or previous attempt state with a valid assessment token.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        identifier = (
            request.data.get("identifier")
            or request.data.get("register_number")
            or request.data.get("email")
            or ""
        ).strip()
        assessment_id = request.data.get("assessment_id")
        drive_code = (request.data.get("drive_code") or "").strip()

        if not identifier:
            return Response(
                {"detail": "Please provide your Registration Number or Email address to sign in."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cand = Candidate.objects.filter(
            Q(register_number__iexact=identifier) | Q(email__iexact=identifier.lower())
        ).first()

        if not cand:
            return Response(
                {"detail": f"No candidate record found matching '{identifier}'. Please register first if you are a new candidate."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if cand.is_simulation:
            return Response(
                {"detail": "Simulation accounts cannot be accessed via student login."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not cand.is_active:
            return Response(
                {"detail": "Your candidate account is currently inactive. Please contact your administrator."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check drive if provided
        target_drive = None
        if drive_code:
            target_drive = Drive.objects.filter(Q(drive_code=drive_code) | Q(code__iexact=drive_code)).first()
            if not target_drive:
                return Response({"detail": f"Drive with code '{drive_code}' not found."}, status=status.HTTP_404_NOT_FOUND)

        # Query candidate attempts
        attempt_qs = AssessmentAttempt.objects.filter(candidate=cand)
        if assessment_id:
            attempt_qs = attempt_qs.filter(assessment_id=assessment_id)

        active_attempt = attempt_qs.filter(state=AssessmentAttempt.State.IN_PROGRESS).order_by("-created_at").first()
        last_attempt = attempt_qs.order_by("-created_at").first()

        attempt_for_token = active_attempt or last_attempt
        token = generate_candidate_token(str(cand.id), str(attempt_for_token.id) if attempt_for_token else None)

        return Response({
            "candidate_id": str(cand.id),
            "full_name": cand.full_name,
            "register_number": cand.register_number,
            "email": cand.email,
            "college": cand.college,
            "college_id": cand.college_ref_id,
            "assessment_token": token,
            "active_attempt_id": str(active_attempt.id) if active_attempt else None,
            "last_attempt_state": last_attempt.state if last_attempt else None,
            "is_active_attempt": bool(active_attempt),
            "message": "Sign-in successful. Welcome back!",
        }, status=status.HTTP_200_OK)


class CandidateAssessmentSebConfigView(APIView):
    """
    Candidate / public download endpoint for Safe Exam Browser (.seb) XML configuration.
    """
    permission_classes = [AllowAny]

    def get(self, request, pk):
        assessment = get_object_or_404(Assessment, pk=pk)
        start_url = request.build_absolute_uri(f"/assessment/register?assessment={assessment.id}")
        bek = assessment.seb_browser_exam_key or ""

        seb_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>originatorVersion</key>
    <string>SEB_Win_3.5.0</string>
    <key>startURL</key>
    <string>{start_url}</string>
    <key>sendBrowserExamKey</key>
    <true/>
    <key>browserExamKey</key>
    <string>{bek}</string>
    <key>browserViewMode</key>
    <integer>0</integer>
    <key>allowQuit</key>
    <true/>
    <key>allowPreferencesWindow</key>
    <false/>
    <key>browserWindowAllowReload</key>
    <false/>
    <key>enableAltEsc</key>
    <false/>
    <key>enableAltF4</key>
    <false/>
    <key>enableAltTab</key>
    <false/>
    <key>enableCtrlEsc</key>
    <false/>
    <key>enableEsc</key>
    <false/>
    <key>enableF1</key>
    <false/>
    <key>enableF2</key>
    <false/>
    <key>enableF3</key>
    <false/>
    <key>enableF4</key>
    <false/>
    <key>enableF5</key>
    <false/>
    <key>enableF6</key>
    <false/>
    <key>enableF7</key>
    <false/>
    <key>enableF8</key>
    <false/>
    <key>enableF9</key>
    <false/>
    <key>enableF10</key>
    <false/>
    <key>enableF11</key>
    <false/>
    <key>enableF12</key>
    <false/>
    <key>enableRightMouse</key>
    <false/>
    <key>kioskMode</key>
    <true/>
</dict>
</plist>"""

        response = HttpResponse(seb_xml, content_type="application/seb")
        response["Content-Disposition"] = f'attachment; filename="assessment_{assessment.code.lower()}.seb"'
        return response


class CandidateCameraBypassStatusView(APIView):
    """
    Check whether an administrator has granted a camera calibration bypass
    for the given candidate and assessment.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        candidate_id = request.query_params.get("candidate_id")
        assessment_id = request.query_params.get("assessment_id")
        reg_no = request.query_params.get("register_number")

        qs = AdminAccessGrant.objects.filter(grant_type="CAMERA_BYPASS", is_used=False)
        if candidate_id:
            qs = qs.filter(candidate_id=candidate_id)
        elif reg_no:
            qs = qs.filter(candidate__register_number__iexact=reg_no.strip())
        else:
            return Response({"bypass_granted": False})

        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)

        bypass = qs.order_by("-created_at").first()
        if bypass:
            return Response({
                "bypass_granted": True,
                "reason": bypass.reason,
                "grant_id": str(bypass.id),
            })
        return Response({"bypass_granted": False})


class CandidateAttemptCalibrationView(APIView):
    """
    Save camera calibration data (head movement verification results) to an attempt.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(AssessmentAttempt, id=attempt_id)
        if not verify_attempt_ownership(request, attempt):
            return Response({"detail": "Access forbidden: you do not own this attempt."}, status=status.HTTP_403_FORBIDDEN)

        calibrated = request.data.get("camera_calibrated", True)
        calibration_data = request.data.get("calibration_data", {})

        attempt.camera_calibrated = bool(calibrated)
        attempt.camera_calibration_data = calibration_data
        attempt.save(update_fields=["camera_calibrated", "camera_calibration_data"])

        return Response({
            "success": True,
            "attempt_id": str(attempt.id),
            "camera_calibrated": attempt.camera_calibrated,
        })


# =============================================================================
# CSL SENTINEL PROCTORING CANDIDATE VIEWS
# =============================================================================

class ProctoringSessionInitView(APIView):
    """
    Initializes or retrieves the CSL Sentinel proctoring session for an attempt.
    Enforces candidate attempt ownership and checks for admin bypass grants.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        attempt_id = request.data.get("attempt_id")
        if not attempt_id:
            return Response({"detail": "attempt_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        attempt = get_object_or_404(AssessmentAttempt, id=attempt_id)
        if not verify_attempt_ownership(request, attempt):
            return Response({"detail": "Access forbidden: you do not own this attempt."}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            session, created = ProctoringSession.objects.select_for_update().get_or_create(
                assessment_session=attempt,
                defaults={
                    "student": attempt.candidate,
                    "assessment": attempt.assessment,
                    "status": ProctoringSession.SessionStatus.INITIALIZING,
                    "browser_monitoring_status": ProctoringSession.BrowserMonitoringStatus.ACTIVE,
                },
            )

            # Check for administrative camera bypass
            bypass_qs = AdminAccessGrant.objects.filter(
                grant_type=AdminAccessGrant.GrantType.CAMERA_BYPASS,
                candidate=attempt.candidate,
                is_used=False,
            )
            if attempt.assessment_id:
                from django.db.models import Q
                bypass_qs = bypass_qs.filter(
                    Q(assessment__isnull=True) | Q(assessment_id=attempt.assessment_id)
                )
            if bypass_qs.exists() and session.face_calibration_status == ProctoringSession.FaceCalibrationStatus.PENDING:
                session.face_calibration_status = ProctoringSession.FaceCalibrationStatus.SKIPPED_BY_ADMIN
                session.save(update_fields=["face_calibration_status", "updated_at"])

            if created:
                ProctoringEvent.objects.create(
                    proctoring_session=session,
                    event_type=ProctoringEvent.EventType.SESSION_INITIALIZED,
                    severity=ProctoringEvent.Severity.INFO,
                    metadata={"client_agent": request.headers.get("User-Agent", "")[:150]},
                )

        serializer = ProctoringSessionSerializer(session)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ProctoringCameraStatusView(APIView):
    """
    Updates camera stream connection status and logs disconnect/reconnect events.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(ProctoringSession, id=session_id)
        if not verify_attempt_ownership(request, session.assessment_session):
            return Response({"detail": "Access forbidden."}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get("status")
        valid_statuses = [c[0] for c in ProctoringSession.CameraStatus.choices]
        if new_status not in valid_statuses:
            return Response({"detail": f"Invalid camera status. Valid: {valid_statuses}"}, status=status.HTTP_400_BAD_REQUEST)

        old_status = session.camera_status
        session.camera_status = new_status

        if new_status == ProctoringSession.CameraStatus.DISCONNECTED and old_status == ProctoringSession.CameraStatus.ACTIVE:
            ProctoringEvent.objects.create(
                proctoring_session=session,
                event_type=ProctoringEvent.EventType.CAMERA_DISCONNECTED,
                severity=ProctoringEvent.Severity.WARNING,
                metadata=request.data.get("metadata", {}),
            )
            session.recalculate_risk_score()
        elif new_status == ProctoringSession.CameraStatus.ACTIVE and old_status in (
            ProctoringSession.CameraStatus.DISCONNECTED,
            ProctoringSession.CameraStatus.ERROR,
            ProctoringSession.CameraStatus.PENDING,
        ):
            ProctoringEvent.objects.create(
                proctoring_session=session,
                event_type=ProctoringEvent.EventType.CAMERA_RECONNECTED,
                severity=ProctoringEvent.Severity.INFO,
            )

        session.save(update_fields=["camera_status", "updated_at"])
        return Response({
            "success": True,
            "camera_status": session.camera_status,
            "risk_score": session.risk_score,
        })


class ProctoringCalibrationView(APIView):
    """
    Submits 6-pose MediaPipe face landmarker calibration results and stores baseline pose.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(ProctoringSession, id=session_id)
        if not verify_attempt_ownership(request, session.assessment_session):
            return Response({"detail": "Access forbidden."}, status=status.HTTP_403_FORBIDDEN)

        baseline = request.data.get("baseline_orientation", {})
        results = request.data.get("calibration_results", [])
        completed = request.data.get("calibration_completed", True)

        with transaction.atomic():
            cal, _ = ProctoringCalibration.objects.update_or_create(
                proctoring_session=session,
                defaults={
                    "baseline_orientation": baseline,
                    "calibration_results": results,
                    "calibration_completed": bool(completed),
                    "calibrated_at": timezone.now(),
                },
            )
            session.face_calibration_status = (
                ProctoringSession.FaceCalibrationStatus.COMPLETED
                if completed
                else ProctoringSession.FaceCalibrationStatus.FAILED
            )
            session.save(update_fields=["face_calibration_status", "updated_at"])

            # Sync attempt level flag for backward compatibility
            session.assessment_session.camera_calibrated = bool(completed)
            session.assessment_session.camera_calibration_data = {
                "baseline": baseline,
                "completed": bool(completed),
                "timestamp": str(timezone.now()),
            }
            session.assessment_session.save(update_fields=["camera_calibrated", "camera_calibration_data"])

        return Response({
            "success": True,
            "face_calibration_status": session.face_calibration_status,
            "calibration_id": str(cal.id),
        })


class ProctoringScreenShareStatusView(APIView):
    """
    Updates display capture stream status and logs screen-share lifecycle events.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(ProctoringSession, id=session_id)
        if not verify_attempt_ownership(request, session.assessment_session):
            return Response({"detail": "Access forbidden."}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get("status")
        valid_statuses = [s[0] for s in ProctoringSession.ScreenShareStatus.choices]
        if new_status not in valid_statuses:
            return Response({"detail": f"Invalid screen share status. Valid: {valid_statuses}"}, status=status.HTTP_400_BAD_REQUEST)

        old_status = session.screen_share_status
        session.screen_share_status = new_status

        if new_status == ProctoringSession.ScreenShareStatus.ACTIVE and old_status != ProctoringSession.ScreenShareStatus.ACTIVE:
            ProctoringEvent.objects.create(
                proctoring_session=session,
                event_type=ProctoringEvent.EventType.SCREEN_SHARE_STARTED,
                severity=ProctoringEvent.Severity.INFO,
            )
        elif new_status == ProctoringSession.ScreenShareStatus.INTERRUPTED:
            ProctoringEvent.objects.create(
                proctoring_session=session,
                event_type=ProctoringEvent.EventType.SCREEN_SHARE_INTERRUPTED,
                severity=ProctoringEvent.Severity.WARNING,
                metadata=request.data.get("metadata", {}),
            )
            session.recalculate_risk_score()
        elif new_status == ProctoringSession.ScreenShareStatus.STOPPED:
            ProctoringEvent.objects.create(
                proctoring_session=session,
                event_type=ProctoringEvent.EventType.SCREEN_SHARE_STOPPED,
                severity=ProctoringEvent.Severity.CRITICAL,
                metadata=request.data.get("metadata", {}),
            )
            session.recalculate_risk_score()

        session.save(update_fields=["screen_share_status", "updated_at"])
        return Response({
            "success": True,
            "screen_share_status": session.screen_share_status,
            "risk_score": session.risk_score,
        })


class ProctoringEventIngestView(APIView):
    """
    In-exam telemetry ingestion endpoint for browser integrity, facial presence,
    pose deviations, and clipboard restriction events.
    Enforces deduplication and per-minute rate limiting.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(ProctoringSession, id=session_id)
        if not verify_attempt_ownership(request, session.assessment_session):
            return Response({"detail": "Access forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = ProctoringEventInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        ev_type = serializer.validated_data["event_type"]
        severity = serializer.validated_data.get("severity", ProctoringEvent.Severity.INFO)
        event_id = serializer.validated_data.get("event_id", "").strip()
        ts = serializer.validated_data.get("timestamp", timezone.now())
        metadata = serializer.validated_data.get("metadata", {})

        # Rate limiting: max 40 events per minute
        from datetime import timedelta
        one_min_ago = timezone.now() - timedelta(seconds=60)
        recent_count = session.events.filter(created_at__gte=one_min_ago).count()
        if recent_count >= 40:
            return Response(
                {"status": "rate_limited", "detail": "Telemetry ingestion rate limit exceeded."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Deduplication
        if event_id and session.events.filter(event_id=event_id).exists():
            return Response({
                "status": "duplicate_ignored",
                "risk_score": session.risk_score,
                "risk_level": session.risk_level,
            }, status=status.HTTP_200_OK)

        with transaction.atomic():
            ev = ProctoringEvent.objects.create(
                proctoring_session=session,
                event_type=ev_type,
                severity=severity,
                timestamp=ts,
                event_id=event_id,
                metadata=metadata,
            )
            session.recalculate_risk_score()

            # Synchronize tab-switch events with AssessmentAttempt
            if ev_type == ProctoringEvent.EventType.TAB_SWITCHED:
                attempt = session.assessment_session
                attempt.tab_switch_count += 1
                allowed = (
                    attempt.assessment.max_tab_switches_warning
                    if attempt.assessment
                    else (attempt.config.max_tab_switches_warning if attempt.config else 2)
                )
                auto_submit = (
                    attempt.assessment.auto_submit_on_tab_limit
                    if attempt.assessment
                    else (attempt.config.auto_submit_on_tab_limit if attempt.config else True)
                )
                if auto_submit and attempt.tab_switch_count > allowed:
                    attempt.is_flagged = True
                    attempt.flag_reason = (
                        f"TAB_SWITCH_LIMIT_EXCEEDED: Exceeded permitted tab switches "
                        f"({attempt.tab_switch_count} switches recorded, limit is {allowed})"
                    )
                attempt.save(update_fields=["tab_switch_count", "is_flagged", "flag_reason", "updated_at"])
                if auto_submit and attempt.tab_switch_count > allowed:
                    finalize_assessment_attempt(attempt, final_state=AssessmentAttempt.State.FLAGGED_FOR_REVIEW)

            elif ev_type == ProctoringEvent.EventType.FULLSCREEN_EXITED:
                attempt = session.assessment_session
                attempt.fullscreen_exit_count += 1
                attempt.save(update_fields=["fullscreen_exit_count", "updated_at"])

        return Response({
            "status": "recorded",
            "event_id": ev.id,
            "event_type": ev.event_type,
            "risk_score": session.risk_score,
            "risk_level": session.risk_level,
        }, status=status.HTTP_201_CREATED)


class ProctoringEvidenceUploadView(APIView):
    """
    Receives frame snapshot (JPEG) and uploads it securely to Neon/S3 or local storage.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(ProctoringSession, id=session_id)
        if not verify_attempt_ownership(request, session.assessment_session):
            return Response({"detail": "Access forbidden."}, status=status.HTTP_403_FORBIDDEN)

        raw_bytes = None
        if "frame" in request.FILES:
            raw_bytes = request.FILES["frame"].read()
        elif "frame_base64" in request.data:
            import base64
            b64_str = request.data["frame_base64"]
            if "," in b64_str:
                b64_str = b64_str.split(",", 1)[1]
            try:
                raw_bytes = base64.b64decode(b64_str)
            except Exception:
                return Response({"detail": "Invalid base64 frame encoding."}, status=status.HTTP_400_BAD_REQUEST)

        if not raw_bytes:
            return Response({"detail": "No image frame provided."}, status=status.HTTP_400_BAD_REQUEST)

        evidence_type = request.data.get("evidence_type", ProctoringEvidence.EvidenceType.WEBCAM_SNAPSHOT)
        related_event_id = request.data.get("related_event_id")
        related_event = None
        if related_event_id:
            related_event = session.events.filter(id=related_event_id).first()

        saved = ProctoringEvidenceStorageService.save_snapshot(
            session_id=session.id,
            raw_bytes=raw_bytes,
            filename_prefix=evidence_type.lower(),
        )

        evidence = ProctoringEvidence.objects.create(
            proctoring_session=session,
            related_event=related_event,
            evidence_type=evidence_type,
            storage_path=saved["storage_path"],
            storage_type=saved["storage_type"],
            metadata=request.data.get("metadata", {}),
        )

        return Response({
            "success": True,
            "evidence_id": str(evidence.id),
            "evidence_type": evidence.evidence_type,
            "storage_type": evidence.storage_type,
            "captured_at": evidence.captured_at,
        }, status=status.HTTP_201_CREATED)


class ProctoringSessionStatusView(APIView):
    """
    Returns current proctoring session state, active warnings, and risk score.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, session_id):
        session = get_object_or_404(ProctoringSession, id=session_id)
        if not verify_attempt_ownership(request, session.assessment_session):
            return Response({"detail": "Access forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = ProctoringSessionSerializer(session)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProctoringSessionEndView(APIView):
    """
    Finalizes the proctoring session upon assessment submission.
    """
    authentication_classes = [CandidateAssessmentAuthentication]
    permission_classes = [AllowAny]

    def post(self, request, session_id):
        session = get_object_or_404(ProctoringSession, id=session_id)
        if not verify_attempt_ownership(request, session.assessment_session):
            return Response({"detail": "Access forbidden."}, status=status.HTTP_403_FORBIDDEN)

        session.status = ProctoringSession.SessionStatus.COMPLETED
        session.ended_at = timezone.now()
        session.save(update_fields=["status", "ended_at", "updated_at"])

        ProctoringEvent.objects.create(
            proctoring_session=session,
            event_type=ProctoringEvent.EventType.SESSION_TERMINATED,
            severity=ProctoringEvent.Severity.INFO,
        )

        return Response({
            "success": True,
            "status": session.status,
            "ended_at": session.ended_at,
        }, status=status.HTTP_200_OK)

