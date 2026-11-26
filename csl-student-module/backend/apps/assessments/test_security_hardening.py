import base64
import io
import os
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Assessment,
    AssessmentAttempt,
    AssessmentSection,
    AssessmentSectionAllocation,
    AttemptQuestionSnapshot,
    Candidate,
    College,
    ProctoringEvidence,
    ProctoringSession,
    ProgrammingQuestion,
    ProgrammingTestCase,
    QuestionBank,
)
from .storage_service import ProctoringEvidenceStorageService
from .tokens import generate_candidate_token

User = get_user_model()


def _make_valid_png_bytes(width: int = 32, height: int = 32) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(24, 96, 208)).save(buf, format="PNG")
    return buf.getvalue()


class SecurityAndHardeningTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.college, _ = College.objects.get_or_create(
            code="CSI",
            defaults={"name": "CSL Security Institute", "is_active": True},
        )
        self.section, _ = AssessmentSection.objects.get_or_create(
            code="CODING",
            defaults={"name": "Coding", "is_active": True},
        )

        self.assessment = Assessment.objects.create(
            title="Security Audit Assessment",
            code="SEC-001",
            status=Assessment.Status.OPEN,
            duration_minutes=60,
            is_standalone=True,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=self.assessment,
            section=self.section,
            question_count=1,
            marks_per_question=10,
            order=1,
        )

        self.question = QuestionBank.objects.create(
            section=self.section,
            section_type=QuestionBank.SectionType.CODING,
            prompt="Print Sum",
            marks=10,
            is_active=True,
        )
        self.prog_q = ProgrammingQuestion.objects.create(
            question=self.question,
            problem_statement="Add two numbers.",
            allowed_languages=["python", "java"],
            comparison_mode="TRIMMED",
        )
        self.tc = ProgrammingTestCase.objects.create(
            programming_question=self.prog_q,
            input_text="2 3",
            expected_output="5",
            is_public=True,
            visibility_scope="SAMPLE",
            order=1,
        )

        self.candidate = Candidate.objects.create(
            full_name="Alice Candidate",
            register_number="SEC1001",
            email="alice.sec@example.com",
            phone_number="9999900001",
            college=self.college.name,
            college_ref=self.college,
        )
        self.other_candidate = Candidate.objects.create(
            full_name="Bob Intruder",
            register_number="SEC1002",
            email="bob.sec@example.com",
            phone_number="9999900002",
            college=self.college.name,
            college_ref=self.college,
        )

        self.attempt1 = AssessmentAttempt.objects.create(
            candidate=self.candidate,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(minutes=60),
        )
        self.attempt2 = AssessmentAttempt.objects.create(
            candidate=self.candidate,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(minutes=60),
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=self.attempt1,
            question=self.question,
            question_order=1,
            section_type="CODING",
            prompt="Print Sum",
            option_a_text="",
            option_b_text="",
            option_c_text="",
            option_d_text="",
            programming_data={
                "question_id": self.question.id,
                "allowed_languages": ["python", "java"],
                "marks": 10,
                "comparison_mode": "TRIMMED",
                "test_cases": [
                    {
                        "id": str(self.tc.id),
                        "input_text": "2 3",
                        "expected_output": "5",
                        "is_public": True,
                        "visibility_scope": "SAMPLE",
                        "marks_weightage": 1.0,
                    }
                ],
            },
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=self.attempt2,
            question=self.question,
            question_order=1,
            section_type="CODING",
            prompt="Print Sum",
            option_a_text="",
            option_b_text="",
            option_c_text="",
            option_d_text="",
            programming_data={
                "question_id": self.question.id,
                "allowed_languages": ["python", "java"],
                "marks": 10,
                "comparison_mode": "TRIMMED",
                "test_cases": [],
            },
        )

        self.token_attempt1 = generate_candidate_token(str(self.candidate.id), str(self.attempt1.id))
        self.token_candidate_wide = generate_candidate_token(str(self.candidate.id), None)

    def test_attempt_scoped_token_blocks_cross_attempt_access(self):
        # Attempt-1 token works on attempt 1
        res_ok = self.client.get(
            f"/api/assessment/attempts/{self.attempt1.id}/",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)

        # Attempt-1 token MUST be rejected on attempt 2 (even same candidate) across all endpoints
        res_state = self.client.get(
            f"/api/assessment/attempts/{self.attempt2.id}/",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_state.status_code, status.HTTP_403_FORBIDDEN)

        res_eval = self.client.get(
            f"/api/assessment/code/evaluation-cases/?attempt_id={self.attempt2.id}&question_id={self.question.id}",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_eval.status_code, status.HTTP_403_FORBIDDEN)

        res_submit = self.client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt2.id),
                "question_id": self.question.id,
                "language": "python",
                "source_code": "print(5)",
            },
            format="json",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_submit.status_code, status.HTTP_403_FORBIDDEN)

        # Candidate-wide token (attempt_id=None) works for owned attempts, never other candidates
        other_attempt = AssessmentAttempt.objects.create(
            candidate=self.other_candidate,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
        )
        self.assertEqual(
            self.client.get(
                f"/api/assessment/attempts/{self.attempt2.id}/",
                HTTP_X_ASSESSMENT_TOKEN=self.token_candidate_wide,
            ).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(
                f"/api/assessment/attempts/{other_attempt.id}/",
                HTTP_X_ASSESSMENT_TOKEN=self.token_candidate_wide,
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_csrf_origin_guard_and_session_header_hardening(self):
        admin = User.objects.create_superuser(
            username="secadmin",
            email="secadmin@example.com",
            password="StrongPass!123",
        )
        self.client.force_login(admin)

        # Untrusted cross-site Origin MUST be blocked on cookie-authenticated POST
        res_evil = self.client.post(
            "/api/csl-admin/colleges/",
            {"name": "Evil College", "code": "EVL"},
            format="json",
            HTTP_ORIGIN="https://evil-phishing.example",
        )
        self.assertEqual(res_evil.status_code, status.HTTP_403_FORBIDDEN)

        # Untrusted Sec-Fetch-Site without trusted Origin MUST also be blocked
        res_fetch = self.client.post(
            "/api/csl-admin/colleges/",
            {"name": "Evil College 2", "code": "EVL2"},
            format="json",
            HTTP_SEC_FETCH_SITE="cross-site",
        )
        self.assertEqual(res_fetch.status_code, status.HTTP_403_FORBIDDEN)

        # Trusted CORS origin succeeds
        res_ok = self.client.post(
            "/api/csl-admin/colleges/",
            {"name": "Trusted College", "code": "TRST"},
            format="json",
            HTTP_ORIGIN="http://localhost:5173",
        )
        self.assertIn(res_ok.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))

        # Spoofed/invalid X-Session-ID header cannot authenticate
        self.client.logout()
        res_bad_sess = self.client.get(
            "/api/csl-admin/colleges/",
            HTTP_X_SESSION_ID="../../invalid/session",
        )
        self.assertIn(res_bad_sess.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_code_submit_validates_payload_limits_clamps_scores_and_sequences_atomically(self):
        # 1. Oversized source code (>200KB) rejected
        huge_code = "a = 1\n" * 40000  # ~240KB
        res_huge = self.client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt1.id),
                "question_id": self.question.id,
                "language": "python",
                "source_code": huge_code,
            },
            format="json",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_huge.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Tampered score_awarded is strictly clamped to [0, max_marks] & sequential order increments
        for idx, raw_score in enumerate((999.0, -25.0), start=1):
            res = self.client.post(
                "/api/assessment/code/submit/",
                {
                    "attempt_id": str(self.attempt1.id),
                    "question_id": self.question.id,
                    "language": "python",
                    "source_code": f"print({idx})",
                    "evaluation_summary": {
                        "verdict": "ACCEPTED",
                        "score_awarded": raw_score,
                        "total_test_cases": 1,
                        "passed_count": 1,
                    },
                },
                format="json",
                HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
            )
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(res.data["submission_sequence"], idx)
            self.assertFalse(res.data["is_authoritative_score"])
            expected_clamped = 10.0 if raw_score > 10 else 0.0
            self.assertEqual(res.data["score_awarded"], expected_clamped)

    def test_proctoring_evidence_validates_image_size_type_and_blocks_path_traversal(self):
        proc_session = ProctoringSession.objects.create(
            assessment_session=self.attempt1,
            student=self.candidate,
            assessment=self.assessment,
            status=ProctoringSession.SessionStatus.ACTIVE,
        )

        # 1. Non-image SVG/HTML payload rejected
        bad_b64 = base64.b64encode(b"<svg onload='alert(1)'></svg>").decode("ascii")
        res_svg = self.client.post(
            f"/api/assessment/proctoring/{proc_session.id}/evidence/",
            {"frame_base64": bad_b64, "evidence_type": ProctoringEvidence.EvidenceType.WEBCAM_SNAPSHOT},
            format="json",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_svg.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Unlisted evidence_type rejected
        valid_b64 = base64.b64encode(_make_valid_png_bytes(64, 48)).decode("ascii")
        res_bad_type = self.client.post(
            f"/api/assessment/proctoring/{proc_session.id}/evidence/",
            {"frame_base64": valid_b64, "evidence_type": "../../PWNED"},
            format="json",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_bad_type.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Valid PNG snapshot stored cleanly with image metadata
        res_ok = self.client.post(
            f"/api/assessment/proctoring/{proc_session.id}/evidence/",
            {"frame_base64": valid_b64, "evidence_type": ProctoringEvidence.EvidenceType.WEBCAM_SNAPSHOT},
            format="json",
            HTTP_X_ASSESSMENT_TOKEN=self.token_attempt1,
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        ev = ProctoringEvidence.objects.get(id=res_ok.data["evidence_id"])
        self.assertEqual(ev.metadata.get("validated_format"), "PNG")
        self.assertEqual(ev.metadata.get("width"), 64)
        self.assertEqual(ev.metadata.get("height"), 48)

        # 4. Path traversal on snapshot read returns empty bytes
        self.assertEqual(
            ProctoringEvidenceStorageService.get_snapshot_bytes("../../config/settings.py", "LOCAL"),
            b"",
        )

    def test_public_recovery_endpoint_rate_limiting(self):
        cache.clear()
        with patch.dict(os.environ, {"DJANGO_THROTTLE_CANDIDATE_RECOVERY": "2/min"}):
            for _ in range(2):
                r = self.client.post(
                    "/api/assessment/recover/",
                    {"register_number": "SEC1001", "verification_factor": "wrong@example.com"},
                    format="json",
                )
                self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

            r_throttled = self.client.post(
                "/api/assessment/recover/",
                {"register_number": "SEC1001", "verification_factor": "wrong@example.com"},
                format="json",
            )
            self.assertEqual(r_throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        cache.clear()
