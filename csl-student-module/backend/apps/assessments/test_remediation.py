from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.assessments.models import (
    Assessment,
    College,
    Candidate,
    AssessmentAttempt,
    QuestionBank,
    QuestionPool,
    QuestionPoolItem,
    ProgrammingQuestion,
    Drive,
    DriveAssessment,
    AssessmentAuditLog,
)
from apps.assessments.tokens import generate_candidate_token

User = get_user_model()

class RemediationEndToEndTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username="admin_tester",
            email="admin@csl.local",
            password="adminpassword123",
        )
        self.client.force_authenticate(user=self.admin_user)

        self.college = College.objects.create(name="Test Engineering College", code="TEC01")
        self.pool = QuestionPool.objects.create(name="Core Aptitude Pool", code="CORE-APT")
        self.drive = Drive.objects.create(name="Placement Drive 2026", code="DRIVE-2026")

        # Create basic question bank for assessment sampling
        for i in range(15):
            QuestionBank.objects.create(
                prompt=f"Aptitude question {i+1} prompt text?",
                section_type=QuestionBank.SectionType.APTITUDE,
                difficulty=QuestionBank.Difficulty.EASY if i < 5 else (QuestionBank.Difficulty.MEDIUM if i < 10 else QuestionBank.Difficulty.HARD),
                marks=1,
                option_a="Option A",
                option_b="Option B",
                option_c="Option C",
                option_d="Option D",
                correct_option="A",
                is_active=True,
            )

    def test_question_pool_create_mcq_directly(self):
        url = f"/api/csl-admin/question-pools/{self.pool.id}/questions/"
        payload = {
            "prompt": "What is the capital of France?",
            "section_type": "APTITUDE",
            "difficulty": "EASY",
            "marks": 2,
            "option_a": "Paris",
            "option_b": "London",
            "option_c": "Berlin",
            "option_d": "Madrid",
            "correct_option": "A",
            "explanation": "Paris is the capital of France.",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        q_id = res.data["question"]["id"]
        self.assertTrue(QuestionBank.objects.filter(id=q_id).exists())
        self.assertTrue(QuestionPoolItem.objects.filter(pool=self.pool, question_id=q_id).exists())

    def test_question_pool_create_coding_directly(self):
        url = f"/api/csl-admin/question-pools/{self.pool.id}/questions/"
        payload = {
            "prompt": "Reverse a Linked List",
            "section_type": "CODING",
            "difficulty": "MEDIUM",
            "marks": 10,
            "coding_details": {
                "problem_statement": "Given the head of a linked list, reverse it.",
                "constraints": "1 <= N <= 1000",
                "test_cases": [
                    {"input_text": "1 2 3", "expected_output": "3 2 1", "is_public": True, "marks_weightage": 5.0},
                    {"input_text": "4 5", "expected_output": "5 4", "is_public": False, "marks_weightage": 5.0},
                ]
            }
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        q_id = res.data["question"]["id"]
        q = QuestionBank.objects.get(id=q_id)
        self.assertEqual(q.assessment_type, "CODING")
        self.assertTrue(hasattr(q, "programming_details"))
        self.assertEqual(q.programming_details.test_cases.count(), 2)
        self.assertTrue(QuestionPoolItem.objects.filter(pool=self.pool, question=q).exists())

    def test_remove_question_from_pool_does_not_delete_question(self):
        q = QuestionBank.objects.create(
            prompt="Stand-alone question",
            section_type="APTITUDE",
            difficulty="EASY",
            marks=1,
            option_a="A", option_b="B", option_c="C", option_d="D",
            correct_option="A"
        )
        item = QuestionPoolItem.objects.create(pool=self.pool, question=q, order=1)
        url = f"/api/csl-admin/question-pools/{self.pool.id}/questions/{q.id}/"
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Pool item removed, but question remains!
        self.assertFalse(QuestionPoolItem.objects.filter(id=item.id).exists())
        self.assertTrue(QuestionBank.objects.filter(id=q.id).exists())

    def test_drive_regenerate_code(self):
        old_code = self.drive.drive_code
        url = f"/api/csl-admin/drives/{self.drive.id}/regenerate-code/"
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.drive.refresh_from_db()
        self.assertNotEqual(old_code, self.drive.drive_code)
        self.assertEqual(len(self.drive.drive_code), 8)
        self.assertTrue(self.drive.drive_code.isdigit())
        self.assertTrue(AssessmentAuditLog.objects.filter(entity_id=str(self.drive.id)).exists())

    def test_drive_reconcile_orphans(self):
        orphan = Assessment.objects.create(
            code="ORPHAN-01",
            title="Orphaned Drive Assessment",
            is_standalone=False, # Flagged as non-standalone but has no Drive
        )
        self.assertEqual(orphan.drives.count(), 0)
        url = "/api/csl-admin/drives/reconcile-orphans/"
        res = self.client.post(url, {"action": "reset_standalone"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        orphan.refresh_from_db()
        self.assertTrue(orphan.is_standalone)

    def test_simulation_candidate_isolation(self):
        assessment = Assessment.objects.create(
            code="SIM-ASSESS-01",
            title="Simulation Assessment",
            aptitude_count=5,
            coding_count=0,
        )
        url = f"/api/csl-admin/assessments/{assessment.id}/test-run/"
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["is_simulation"])

        sim_cand = Candidate.objects.get(register_number=f"SIM-ADMIN-{self.admin_user.id}")
        self.assertTrue(sim_cand.is_simulation)

        # Simulation candidate MUST NOT appear in normal candidate list
        cand_list_res = self.client.get("/api/csl-admin/candidates/")
        self.assertEqual(cand_list_res.status_code, status.HTTP_200_OK)
        cand_ids = [c["id"] for c in (cand_list_res.data if isinstance(cand_list_res.data, list) else cand_list_res.data.get("results", []))]
        self.assertNotIn(str(sim_cand.id), [str(i) for i in cand_ids])

        # Student login MUST reject simulation accounts
        unauthed_client = APIClient()
        login_res = unauthed_client.post("/api/assessment/login/", {"identifier": sim_cand.register_number})
        self.assertEqual(login_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Simulation accounts cannot be accessed", login_res.data["detail"])

    def test_student_recovery_explicit_diagnostics(self):
        unauthed_client = APIClient()
        # Non-existent register number
        res1 = unauthed_client.post("/api/assessment/recover/", {
            "register_number": "NONEXISTENT999",
            "verification_factor": "test@csl.local"
        })
        self.assertEqual(res1.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("No candidate found with register number", res1.data["detail"])

        # Real candidate but mismatched email/phone
        cand = Candidate.objects.create(
            full_name="Real Student",
            register_number="CSL2026001",
            email="student@college.edu",
            phone_number="9876543210",
            college="Engineering College",
            is_simulation=False,
        )
        res2 = unauthed_client.post("/api/assessment/recover/", {
            "register_number": "CSL2026001",
            "verification_factor": "wrong@college.edu"
        })
        self.assertEqual(res2.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Verification factor does not match our records", res2.data["detail"])
