from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.assessments.models import (
    Assessment,
    AssessmentAttempt,
    AssessmentConfig,
    AttemptQuestionSnapshot,
    Candidate,
    CodeSubmission,
    College,
    ProctoringEvent,
    ProctoringSession,
    ProgrammingQuestion,
    QuestionBank,
)
from apps.assessments.tokens import generate_candidate_token
from apps.users.models import User


class ProctoringEngineAndConfigTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="proctor_admin",
            email="padmin@csl.test",
            password="pass12345!",
            role=User.Role.ADMIN,
        )
        self.college = College.objects.create(name="Proctor Tech", code="PROCT01")
        self.config = AssessmentConfig.objects.create(
            title="Default Config",
            proctoring_auto_submit_enabled=True,
            max_devtools_incidents=1,
            max_camera_violations=2,
            max_face_absence_seconds=10,
            multiple_face_threshold=2,
            enable_advanced_animations=False,
        )
        self.assessment = Assessment.objects.create(
            code="PROCEXAM1",
            title="Proctoring Enforcement Exam",
            status=Assessment.Status.OPEN,
            duration_minutes=30,
            total_marks=15,
            aptitude_count=1,
            coding_count=1,
            proctoring_auto_submit_enabled=True,
            max_devtools_incidents=1,
            max_camera_violations=2,
        )
        self.candidate = Candidate.objects.create(
            full_name="Arjun Proctor",
            register_number="REGP001",
            college=self.college.name,
            college_ref=self.college,
            email="arjun@proctor.test",
            department="CSE",
            year_of_study="3",
            phone_number="9876543210",
        )
        self.attempt = AssessmentAttempt.objects.create(
            candidate=self.candidate,
            config=self.config,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            snapshot_duration_minutes=30,
            snapshot_total_marks=15,
        )
        self.token = generate_candidate_token(str(self.candidate.id), attempt_id=str(self.attempt.id))
        self.session = ProctoringSession.objects.create(
            assessment_session=self.attempt,
            student=self.candidate,
            assessment=self.assessment,
            status=ProctoringSession.SessionStatus.ACTIVE,
            camera_status=ProctoringSession.CameraStatus.ACTIVE,
        )
        # Saved MCQ + coding submission to verify violation auto-submission preserves candidate work
        q1 = QuestionBank.objects.create(
            section_type="APTITUDE",
            prompt="2 + 2 = ?",
            option_a="3",
            option_b="4",
            option_c="5",
            option_d="6",
            correct_option="B",
        )
        q2 = QuestionBank.objects.create(
            section_type="CODING",
            prompt="Echo Line",
        )
        self.prog_q = ProgrammingQuestion.objects.create(
            question=q2,
            problem_statement="Echo input",
            comparison_mode=ProgrammingQuestion.ComparisonMode.TRIMMED,
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=self.attempt,
            question=q1,
            question_order=1,
            section_type="APTITUDE",
            prompt=q1.prompt,
            option_a_text="3",
            option_b_text="4",
            option_c_text="5",
            option_d_text="6",
            correct_option_key="B",
            selected_option="B",
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=self.attempt,
            question=q2,
            question_order=2,
            section_type="CODING",
            prompt=q2.prompt,
            option_a_text="",
            option_b_text="",
            option_c_text="",
            option_d_text="",
            correct_option_key="A",
            programming_data={"question_id": q2.id, "max_marks": 10},
        )
        CodeSubmission.objects.create(
            attempt=self.attempt,
            candidate=self.candidate,
            programming_question=self.prog_q,
            language="python",
            source_code="print('saved draft')",
            review_status=CodeSubmission.ReviewStatus.AUTO_BROWSER_EVALUATED,
            score_awarded=5.0,
            submission_sequence=1,
        )

    def test_public_appearance_config_reflects_saved_setting(self):
        resp = self.client.get("/api/assessment/appearance-config/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["enable_advanced_animations"])

    def test_devtools_two_strike_warns_then_idempotently_auto_submits_preserving_drafts(self):
        headers = {"HTTP_X_ASSESSMENT_TOKEN": self.token}

        # Strike 1 -> warning only, attempt stays IN_PROGRESS
        r1 = self.client.post(
            f"/api/assessment/proctoring/{self.session.id}/events/",
            {
                "event_type": "DEVTOOLS_DETECTED",
                "severity": "CRITICAL",
                "event_id": "dt_1",
                "metadata": {"signals": ["DOCKED_VIEWPORT_DELTA", "CONSOLE_INSPECTOR_PROBE"]},
            },
            format="json",
            **headers,
        )
        self.assertEqual(r1.status_code, 201)
        self.assertFalse(r1.data["auto_submitted"])
        self.assertEqual(r1.data["attempt_state"], AssessmentAttempt.State.IN_PROGRESS)
        self.assertEqual(r1.data["occurrence_count"], 1)

        # Strike 2 -> auto-submits to AUTO_SUBMITTED and preserves scores
        r2 = self.client.post(
            f"/api/assessment/proctoring/{self.session.id}/events/",
            {
                "event_type": "DEVTOOLS_DETECTED",
                "severity": "CRITICAL",
                "event_id": "dt_2",
                "metadata": {"signals": ["DOCKED_VIEWPORT_DELTA", "DEVTOOLS_SHORTCUT_RECENT"]},
            },
            format="json",
            **headers,
        )
        self.assertEqual(r2.status_code, 201)
        self.assertTrue(r2.data["auto_submitted"])
        self.assertEqual(r2.data["attempt_state"], AssessmentAttempt.State.AUTO_SUBMITTED)
        self.assertIn("DEVTOOLS_POLICY_EXCEEDED", r2.data["auto_submitted_reason"])

        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.state, AssessmentAttempt.State.AUTO_SUBMITTED)
        self.assertEqual(self.attempt.auto_submitted_trigger_event, "DEVTOOLS_DETECTED")
        self.assertTrue(self.attempt.is_flagged)
        # Saved coding draft & MCQ answer preserved during auto-submit
        self.assertGreaterEqual(self.attempt.total_score, 5)
        self.assertTrue(self.attempt.code_submissions.exists())

        # Repeated Strike 3 -> idempotent without error
        r3 = self.client.post(
            f"/api/assessment/proctoring/{self.session.id}/events/",
            {
                "event_type": "DEVTOOLS_DETECTED",
                "severity": "CRITICAL",
                "event_id": "dt_3",
            },
            format="json",
            **headers,
        )
        self.assertEqual(r3.status_code, 201)
        self.assertTrue(r3.data["auto_submitted"])
        self.assertEqual(r3.data["attempt_state"], AssessmentAttempt.State.AUTO_SUBMITTED)

        # Admin Incident Timeline lists events with occurrence count and supports review update
        self.client.force_authenticate(user=self.admin)
        tl = self.client.get(
            f"/api/csl-admin/proctoring/incidents/?attempt_id={self.attempt.id}&event_type=DEVTOOLS_DETECTED"
        )
        self.assertEqual(tl.status_code, 200)
        self.assertEqual(tl.data["count"], 3)
        self.assertEqual(tl.data["incidents"][0]["occurrence_count"], 3)

        target_ev_id = tl.data["incidents"][0]["id"]
        rev = self.client.post(
            f"/api/csl-admin/proctoring/incidents/{target_ev_id}/review/",
            {"review_status": "CONFIRMED"},
            format="json",
        )
        self.assertEqual(rev.status_code, 200)
        self.assertEqual(rev.data["review_status"], "CONFIRMED")

    def test_camera_disconnect_limit_triggers_auto_submission(self):
        headers = {"HTTP_X_ASSESSMENT_TOKEN": self.token}
        # First camera violation
        r1 = self.client.post(
            f"/api/assessment/proctoring/{self.session.id}/events/",
            {"event_type": "FACE_NOT_DETECTED", "severity": "WARNING", "event_id": "cam_1"},
            format="json",
            **headers,
        )
        self.assertEqual(r1.status_code, 201)
        self.assertFalse(r1.data["auto_submitted"])

        # Second camera violation reaches max_camera_violations=2 -> AUTO_SUBMITTED
        r2 = self.client.post(
            f"/api/assessment/proctoring/{self.session.id}/camera-status/",
            {"status": "DISCONNECTED"},
            format="json",
            **headers,
        )
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.data["auto_submitted"])
        self.assertEqual(r2.data["attempt_state"], AssessmentAttempt.State.AUTO_SUBMITTED)
