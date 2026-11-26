from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.assessments.models import (
    College,
    Candidate,
    Assessment,
    AssessmentSection,
    AssessmentSectionAllocation,
    AssessmentAttempt,
    AttemptQuestionSnapshot,
    QuestionBank,
    ProgrammingQuestion,
    ProgrammingTestCase,
    CodeSubmission,
    CodeTestResult,
    AssessmentAuditLog,
)
from apps.assessments.tokens import generate_candidate_token


class BrowserFirstCodingWorkflowTestCase(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            username="bf_admin",
            email="bf_admin@example.com",
            password="adminpassword123",
            first_name="BF",
            last_name="Admin",
            role=User.Role.ADMIN,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin_user)

        self.college = College.objects.create(name="CSL Tech College", code="CSLTC", is_active=True)

        self.coding_sec, _ = AssessmentSection.objects.get_or_create(
            code="CODING",
            defaults={"name": "Coding", "order": 1},
        )
        self.apt_sec, _ = AssessmentSection.objects.get_or_create(
            code="APTITUDE",
            defaults={"name": "Aptitude", "order": 2},
        )

        # Questions: 1 Coding (10 marks) + 1 MCQ (5 marks) => Total 15 marks
        self.coding_q = QuestionBank.objects.create(
            prompt="Print sum of two numbers",
            section_type=QuestionBank.SectionType.CODING,
            marks=10,
            is_active=True,
        )
        self.prog_q = ProgrammingQuestion.objects.create(
            question=self.coding_q,
            problem_statement="Read two integers and print their sum.",
            allowed_languages=["python", "java"],
            boilerplate_code={"python": "# py", "java": "public class Main {}"},
        )
        ProgrammingTestCase.objects.create(
            programming_question=self.prog_q,
            is_public=True,
            input_text="2 3\n",
            expected_output="5\n",
            marks_weightage=5.0,
        )

        self.mcq_q = QuestionBank.objects.create(
            prompt="What is 2 + 2?",
            section_type=QuestionBank.SectionType.APTITUDE,
            option_a="3",
            option_b="4",
            option_c="5",
            option_d="6",
            correct_option="B",
            marks=5,
            is_active=True,
        )

        self.assessment = Assessment.objects.create(
            title="Browser-First Coding Assessment",
            code="BF-CODE-01",
            duration_minutes=60,
            total_marks=15,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=self.assessment,
            section=self.coding_sec,
            question_count=1,
            marks_per_question=10,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=self.assessment,
            section=self.apt_sec,
            question_count=1,
            marks_per_question=5,
        )

        self.cand1 = Candidate.objects.create(
            full_name="Candidate One",
            register_number="BF-001",
            email="cand1@csl.test",
            college_ref=self.college,
            college=self.college.name,
            is_active=True,
        )
        self.cand2 = Candidate.objects.create(
            full_name="Candidate Two",
            register_number="BF-002",
            email="cand2@csl.test",
            college_ref=self.college,
            college=self.college.name,
            is_active=True,
        )

        self.attempt = self._create_active_attempt(self.cand1)
        self.cand1_client = APIClient()
        self.cand1_client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {generate_candidate_token(str(self.cand1.id), attempt_id=str(self.attempt.id))}"
        )

        self.cand2_client = APIClient()
        self.cand2_client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {generate_candidate_token(str(self.cand2.id))}"
        )

    def _create_active_attempt(self, candidate):
        attempt = AssessmentAttempt.objects.create(
            candidate=candidate,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(minutes=60),
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=self.coding_q,
            question_order=1,
            section_type="CODING",
            prompt=self.coding_q.prompt,
            option_a_text="",
            option_b_text="",
            option_c_text="",
            option_d_text="",
            correct_option_key="A",
            programming_data={
                "problem_statement": self.prog_q.problem_statement,
                "allowed_languages": ["python", "java"],
                "boilerplate_code": self.prog_q.boilerplate_code,
            },
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=self.mcq_q,
            question_order=2,
            section_type="APTITUDE",
            prompt=self.mcq_q.prompt,
            option_a_text="3",
            option_b_text="4",
            option_c_text="5",
            option_d_text="6",
            correct_option_key="B",
            selected_option="B",
            answered_at=timezone.now(),
        )
        return attempt

    @override_settings(DEBUG=False, TESTING=False, JUDGE0_API_URL="")
    def test_valid_submission_persists_without_judge0_and_flags_untrusted_metadata(self):
        with patch("apps.assessments.coding_service.evaluate_submission", side_effect=AssertionError("Judge0/evaluate_submission must never be called")):
            res = self.cand1_client.post(
                "/api/assessment/code/submit/",
                {
                    "attempt_id": str(self.attempt.id),
                    "question_id": self.coding_q.id,
                    "language": "java17",
                    "source_code": "public class Main { public static void main(String[] args) { System.out.println(5); } }",
                    "browser_execution_metadata": {
                        "runtime_name": "Java 17 (TeaVM WASM)",
                        "runtime_version": "0.1.0",
                        "browser_status": "SUCCESS",
                        "public_samples_attempted": 1,
                        "public_samples_passed": 1,
                        "execution_time_ms": 14,
                        # Tampering attempt by client: must always be ignored/overridden server-side
                        "is_authoritative": True,
                        "is_verified": True,
                        "score_awarded": 100.0,
                    },
                },
                format="json",
            )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["review_status"], CodeSubmission.ReviewStatus.PENDING_REVIEW)
        self.assertEqual(res.data["verdict"], CodeSubmission.Verdict.PENDING)
        self.assertEqual(res.data["score_awarded"], 0.0)
        self.assertEqual(res.data["max_marks"], 10.0)
        self.assertTrue(res.data["requires_manual_evaluation"])
        self.assertEqual(res.data["language"], "java")

        sub = CodeSubmission.objects.get(id=res.data["submission_id"])
        self.assertEqual(sub.score_awarded, 0.0)
        self.assertEqual(sub.max_marks, 10.0)
        self.assertEqual(sub.review_status, CodeSubmission.ReviewStatus.PENDING_REVIEW)
        self.assertFalse(sub.browser_execution_metadata["is_authoritative"])
        self.assertFalse(sub.browser_execution_metadata["is_verified"])
        self.assertTrue(sub.browser_execution_metadata["untrusted_telemetry"])
        self.assertNotIn("score_awarded", sub.browser_execution_metadata)
        self.assertEqual(CodeTestResult.objects.filter(submission=sub).count(), 0)

    def test_multiple_submissions_preserve_history_and_attempt_finalizes_pending_review(self):
        # First submission (Python)
        r1 = self.cand1_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "python",
                "source_code": "print('v1')",
            },
            format="json",
        )
        # Second submission (Java)
        r2 = self.cand1_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "java",
                "source_code": "public class Main { public static void main(String[] a) { System.out.println(\"v2\"); } }",
            },
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(r1.data["submission_id"], r2.data["submission_id"])

        history = CodeSubmission.objects.filter(attempt=self.attempt).order_by("created_at")
        self.assertEqual(history.count(), 2)
        self.assertEqual(history[0].source_code, "print('v1')")
        self.assertIn('System.out.println("v2")', history[1].source_code)

        # Finalize attempt -> MCQ (5/5) scored, coding stays pending manual review -> COMPLETED_PENDING_MANUAL_EVALUATION
        fin_res = self.cand1_client.post(
            f"/api/assessment/attempts/{self.attempt.id}/finalize/",
            {},
            format="json",
        )
        self.assertEqual(fin_res.status_code, status.HTTP_200_OK, fin_res.data)
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.state, AssessmentAttempt.State.COMPLETED_PENDING_MANUAL_EVALUATION)
        self.assertEqual(self.attempt.aptitude_score, 5)
        self.assertEqual(self.attempt.coding_score, 0)
        self.assertEqual(self.attempt.total_score, 5)

    def test_submission_validation_and_authorization_guards(self):
        # 1. Unauthenticated rejected (401/403)
        anon_res = APIClient().post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "python",
                "source_code": "print(1)",
            },
            format="json",
        )
        self.assertIn(anon_res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

        # 2. Wrong candidate token rejected (403)
        other_res = self.cand2_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "python",
                "source_code": "print(1)",
            },
            format="json",
        )
        self.assertEqual(other_res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Non-coding MCQ question rejected (400)
        mcq_res = self.cand1_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.mcq_q.id,
                "language": "python",
                "source_code": "print(1)",
            },
            format="json",
        )
        self.assertEqual(mcq_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Disallowed language rejected (400)
        lang_res = self.cand1_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "cpp",
                "source_code": "int main() { return 0; }",
            },
            format="json",
        )
        self.assertEqual(lang_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Empty source code rejected (400)
        empty_res = self.cand1_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "python",
                "source_code": "   \n\t ",
            },
            format="json",
        )
        self.assertEqual(empty_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 6. Expired attempt rejected (403)
        self.attempt.deadline = timezone.now() - timedelta(minutes=1)
        self.attempt.save(update_fields=["deadline"])
        exp_res = self.cand1_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "python",
                "source_code": "print(1)",
            },
            format="json",
        )
        self.assertEqual(exp_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_manual_review_validates_bounds_recalculates_scores_and_finalizes_state(self):
        sub_res = self.cand1_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(self.attempt.id),
                "question_id": self.coding_q.id,
                "language": "java",
                "source_code": "public class Main { public static void main(String[] a) { System.out.println(5); } }",
                "browser_execution_metadata": {"runtime_name": "Java 17", "browser_status": "SUCCESS"},
            },
            format="json",
        )
        self.assertEqual(sub_res.status_code, status.HTTP_201_CREATED)
        sub_id = sub_res.data["submission_id"]

        # Finalize attempt -> COMPLETED_PENDING_MANUAL_EVALUATION
        fin_res = self.cand1_client.post(
            f"/api/assessment/attempts/{self.attempt.id}/finalize/",
            {},
            format="json",
        )
        self.assertEqual(fin_res.status_code, status.HTTP_200_OK)

        # Candidate cannot call admin review endpoint
        forbidden_review = self.cand1_client.post(
            f"/api/csl-admin/code-submissions/{sub_id}/review/",
            {"review_status": "MANUALLY_ACCEPTED", "score_awarded": 10},
            format="json",
        )
        self.assertEqual(forbidden_review.status_code, status.HTTP_403_FORBIDDEN)

        # Invalid score bounds rejected (<0 and >max_marks=10)
        too_high = self.admin_client.post(
            f"/api/csl-admin/code-submissions/{sub_id}/review/",
            {"review_status": "MANUALLY_SCORED", "score_awarded": 15.0},
            format="json",
        )
        self.assertEqual(too_high.status_code, status.HTTP_400_BAD_REQUEST)

        too_low = self.admin_client.post(
            f"/api/csl-admin/code-submissions/{sub_id}/review/",
            {"review_status": "MANUALLY_SCORED", "score_awarded": -1.0},
            format="json",
        )
        self.assertEqual(too_low.status_code, status.HTTP_400_BAD_REQUEST)

        # Transition UNDER_REVIEW keeps attempt pending manual evaluation
        under_rev = self.admin_client.post(
            f"/api/csl-admin/code-submissions/{sub_id}/review/",
            {"review_status": "UNDER_REVIEW", "review_notes": "Checking edge cases"},
            format="json",
        )
        self.assertEqual(under_rev.status_code, status.HTTP_200_OK)
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.state, AssessmentAttempt.State.COMPLETED_PENDING_MANUAL_EVALUATION)

        # Authorized admin scores 8/10 -> attempt transitions to SUBMITTED and updates total_score = 5 + 8 = 13
        scored = self.admin_client.post(
            f"/api/csl-admin/code-submissions/{sub_id}/review/",
            {"review_status": "MANUALLY_SCORED", "score_awarded": 8.0, "review_notes": "Clean Java solution"},
            format="json",
        )
        self.assertEqual(scored.status_code, status.HTTP_200_OK, scored.data)

        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.state, AssessmentAttempt.State.SUBMITTED)
        self.assertEqual(self.attempt.coding_score, 8)
        self.assertEqual(self.attempt.total_score, 13)
        self.assertGreaterEqual(self.attempt.percentage, 50.0)

        # Admin detail serializer returns complete review payload & untrusted telemetry
        detail_res = self.admin_client.get(f"/api/csl-admin/attempts/{self.attempt.id}/review/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail_res.data["code_submissions"]), 1)
        rev_item = detail_res.data["code_submissions"][0]
        self.assertEqual(rev_item["review_status"], CodeSubmission.ReviewStatus.MANUALLY_SCORED)
        self.assertEqual(rev_item["score_awarded"], 8.0)
        self.assertFalse(rev_item["browser_execution_metadata"]["is_verified"])

        # Audit log created
        self.assertTrue(
            AssessmentAuditLog.objects.filter(
                action=AssessmentAuditLog.Action.CODE_SUBMISSION_REVIEWED,
                entity_id=str(sub_id),
            ).exists()
        )

    def test_mcq_only_attempt_still_finalizes_to_submitted_immediately(self):
        mcq_assessment = Assessment.objects.create(
            title="MCQ Only Assessment",
            code="BF-MCQ-01",
            duration_minutes=30,
            total_marks=5,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=mcq_assessment,
            section=self.apt_sec,
            question_count=1,
            marks_per_question=5,
        )
        mcq_attempt = AssessmentAttempt.objects.create(
            candidate=self.cand2,
            assessment=mcq_assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(minutes=30),
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=mcq_attempt,
            question=self.mcq_q,
            question_order=1,
            section_type="APTITUDE",
            prompt=self.mcq_q.prompt,
            option_a_text="3",
            option_b_text="4",
            option_c_text="5",
            option_d_text="6",
            correct_option_key="B",
            selected_option="B",
            answered_at=timezone.now(),
        )

        fin_res = self.cand2_client.post(
            f"/api/assessment/attempts/{mcq_attempt.id}/finalize/",
            {},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {generate_candidate_token(str(self.cand2.id), attempt_id=str(mcq_attempt.id))}",
        )
        self.assertEqual(fin_res.status_code, status.HTTP_200_OK, fin_res.data)
        mcq_attempt.refresh_from_db()
        self.assertEqual(mcq_attempt.state, AssessmentAttempt.State.SUBMITTED)
        self.assertEqual(mcq_attempt.aptitude_score, 5)
        self.assertEqual(mcq_attempt.total_score, 5)
        self.assertEqual(mcq_attempt.percentage, 100.0)
