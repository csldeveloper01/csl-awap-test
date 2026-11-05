"""
Phase 2.2.3 Integration and Verification Tests:
- Test A: Standalone assessment creation, college eligibility, open student registration discovery, attempt creation.
- Test B: Drive-based assessment with 8-digit numeric code, college validation, candidate registration and attempt.
- Test C: College exclusion test: candidate from excluded college is rejected with 403.
- Test D: Multiple assessments in Drive: candidate sees list and registers for ONE assessment.
- Test E: Multiple drives sharing an assessment: candidate identity and attempts are not duplicated.
- Test F: Question assignment: Global -> Pool A -> Assessment allocation, sufficiency check, attempt snapshot stability.
- Test G: Coding playground: Python question and Java question, public & hidden test cases, run sample code, submit final solution, grading and score verification.
"""

import uuid
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.assessments.models import (
    College,
    Assessment,
    AssessmentAttempt,
    AssessmentRegistration,
    AttemptQuestionSnapshot,
    Candidate,
    Drive,
    DriveAssessment,
    QuestionBank,
    QuestionPool,
    QuestionPoolItem,
    AssessmentPoolSource,
    ProgrammingQuestion,
    ProgrammingTestCase,
    CodeSubmission,
    CodeTestResult,
)
from apps.assessments.tokens import generate_candidate_token

User = get_user_model()


class Phase223WorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="admin223@csl.edu",
            email="admin223@csl.edu",
            password="AdminPassword123!",
            first_name="Admin",
            last_name="223",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=self.admin)

        self.college1 = College.objects.create(
            name="College of Engineering Guindy",
            code="CEG-01",
            location="Chennai",
            is_active=True,
        )
        self.college2 = College.objects.create(
            name="Madras Institute of Technology",
            code="MIT-02",
            location="Chromepet",
            is_active=True,
        )

    def test_a_standalone_assessment_workflow(self):
        """
        Test A: Standalone assessment creation (Mode A), college eligibility,
        open candidate discovery, registration and attempt creation.
        """
        # 1. Admin creates standalone assessment
        res = self.client.post(
            "/api/csl-admin/assessments/",
            {
                "title": "Standalone Technical Evaluation",
                "code": "STE-2026",
                "duration_minutes": 60,
                "total_marks": 1,
                "aptitude_count": 1,
                "coding_count": 0,
                "delivery_mode": "MCQ",
                "eligible_college_ids": [self.college1.id],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        assessment_id = res.data["id"]
        assessment = Assessment.objects.get(id=assessment_id)
        assessment.status = Assessment.Status.OPEN
        assessment.save()
        self.assertTrue(assessment.is_standalone)

        # Seed 1 question so attempt can start
        q = QuestionBank.objects.create(
            section_type=QuestionBank.SectionType.APTITUDE,
            prompt="Sample Standalone Question",
            option_a="A",
            option_b="B",
            option_c="C",
            option_d="D",
            correct_option="A",
            is_active=True,
        )
        assessment.questions.add(q)

        # 2. Candidate from eligible college views standalone assessments
        cand_client = APIClient()
        cand_res = cand_client.get(f"/api/assessment/candidate-assessments/?college_id={self.college1.id}")
        self.assertEqual(cand_res.status_code, status.HTTP_200_OK)
        assessments_list = cand_res.data.get("assessments", [])
        self.assertTrue(any(a["id"] == str(assessment_id) for a in assessments_list))

        # 3. Candidate registers for standalone assessment
        reg_res = cand_client.post(
            "/api/assessment/register/",
            {
                "full_name": "Alice Green",
                "email": "alice.green@ceg.edu",
                "register_number": "CEG2026001",
                "phone_number": "9876543210",
                "college_id": self.college1.id,
                "assessment_id": assessment_id,
            },
            format="json",
        )
        self.assertIn(reg_res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        cand_token = reg_res.data["assessment_token"]
        self.assertTrue(bool(cand_token))

        # 4. Start assessment attempt
        cand_client.credentials(HTTP_AUTHORIZATION=f"Bearer {cand_token}")
        start_res = cand_client.post("/api/assessment/start/", {"assessment_id": str(assessment_id)}, format="json")
        self.assertEqual(start_res.status_code, status.HTTP_200_OK)
        self.assertIn("remaining_seconds", start_res.data)

        # 5. Verify attempt ownership
        attempt = AssessmentAttempt.objects.filter(candidate__email="alice.green@ceg.edu").first()
        self.assertIsNotNone(attempt)
        self.assertEqual(attempt.assessment.id, assessment.id)

    def test_b_drive_based_workflow_with_8_digit_code(self):
        """
        Test B: Drive-based assessment (Mode B) with 8-digit numeric drive_code,
        candidate registration, eight_digit_code generation, and attempt creation.
        """
        # 1. Create Drive
        drive = Drive.objects.create(
            name="Mega Tech Hiring 2026",
            code="MTH-2026",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
            created_by=self.admin,
        )
        drive.eligible_colleges.add(self.college1)
        self.assertIsNotNone(drive.drive_code)
        self.assertEqual(len(drive.drive_code), 8)
        self.assertTrue(drive.drive_code.isdigit())

        # 2. Create Assessment linked to Drive
        assessment = Assessment.objects.create(
            title="Drive Coding Challenge",
            code="DCC-01",
            duration_minutes=90,
            aptitude_count=1,
            coding_count=0,
            total_marks=1,
            status=Assessment.Status.OPEN,
            is_standalone=False,
        )
        DriveAssessment.objects.create(
            drive=drive,
            assessment=assessment,
            status="ACTIVE",
        )

        # 3. Candidate queries assessments via 8-digit drive code
        cand_client = APIClient()
        query_res = cand_client.get(f"/api/assessment/candidate-assessments/?drive_code={drive.drive_code}")
        self.assertEqual(query_res.status_code, status.HTTP_200_OK)
        drive_assessments = query_res.data.get("assessments", [])
        self.assertTrue(any(a["id"] == str(assessment.id) for a in drive_assessments))

        # 4. Candidate registers using 8-digit drive_code
        reg_res = cand_client.post(
            "/api/assessment/register/",
            {
                "full_name": "Bob Stone",
                "email": "bob.stone@ceg.edu",
                "register_number": "CEG2026002",
                "phone_number": "9876543211",
                "college_id": self.college1.id,
                "drive_code": drive.drive_code,
                "assessment_id": str(assessment.id),
            },
            format="json",
        )
        self.assertIn(reg_res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertIn("eight_digit_code", reg_res.data)
        self.assertEqual(reg_res.data["eight_digit_code"], drive.drive_code)

        # 5. Verify AssessmentRegistration model persistence
        reg_entry = AssessmentRegistration.objects.filter(
            candidate__email="bob.stone@ceg.edu",
            assessment=assessment,
        ).first()
        self.assertIsNotNone(reg_entry)
        self.assertEqual(reg_entry.drive, drive)

    def test_c_college_exclusion_enforcement(self):
        """
        Test C: Candidate from an excluded college is rejected with HTTP 403.
        """
        drive = Drive.objects.create(
            name="Exclusive Drive",
            code="EXCL-2026",
            status=Drive.Status.ACTIVE,
            created_by=self.admin,
        )
        # Restricted strictly to college1
        drive.eligible_colleges.add(self.college1)

        assessment = Assessment.objects.create(
            title="Exclusive Assessment",
            code="EXCL-A1",
            duration_minutes=45,
            aptitude_count=1,
            coding_count=0,
            total_marks=1,
            status=Assessment.Status.OPEN,
            is_standalone=False,
        )
        DriveAssessment.objects.create(drive=drive, assessment=assessment, status="ACTIVE")

        # Candidate from college2 attempts to register for this drive
        cand_client = APIClient()
        reg_res = cand_client.post(
            "/api/assessment/register/",
            {
                "full_name": "Eve Excluded",
                "email": "eve@mit.edu",
                "register_number": "MIT2026999",
                "phone_number": "9876543212",
                "college_id": self.college2.id,  # MIT-02 is excluded!
                "drive_code": drive.drive_code,
                "assessment_id": str(assessment.id),
            },
            format="json",
        )
        self.assertEqual(reg_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("not eligible", str(reg_res.data).lower())

    def test_d_multiple_assessments_in_drive_single_registration(self):
        """
        Test D: Multiple assessments exist in a Drive. Candidate discovers them,
        registers for ONE assessment, and the attempt is scoped strictly to that assessment.
        """
        drive = Drive.objects.create(
            name="Multi Assessment Drive",
            code="MAD-2026",
            status=Drive.Status.ACTIVE,
            created_by=self.admin,
        )
        drive.eligible_colleges.add(self.college1)

        a1 = Assessment.objects.create(
            title="Frontend Specialist Exam",
            code="FE-2026",
            duration_minutes=60,
            aptitude_count=1,
            coding_count=0,
            total_marks=1,
            status=Assessment.Status.OPEN,
            is_standalone=False,
        )
        a2 = Assessment.objects.create(
            title="Backend Specialist Exam",
            code="BE-2026",
            duration_minutes=60,
            aptitude_count=1,
            coding_count=0,
            total_marks=1,
            status=Assessment.Status.OPEN,
            is_standalone=False,
        )
        DriveAssessment.objects.create(drive=drive, assessment=a1, status="ACTIVE")
        DriveAssessment.objects.create(drive=drive, assessment=a2, status="ACTIVE")

        # Assign 1 question to a1 so attempt starts successfully
        q = QuestionBank.objects.create(
            section_type=QuestionBank.SectionType.APTITUDE,
            prompt="FE Question",
            option_a="A",
            option_b="B",
            option_c="C",
            option_d="D",
            correct_option="A",
            is_active=True,
        )
        a1.questions.add(q)

        cand_client = APIClient()
        query_res = cand_client.get(f"/api/assessment/candidate-assessments/?drive_code={drive.drive_code}")
        self.assertEqual(len(query_res.data["assessments"]), 2)

        # Candidate registers for A1 only
        reg_res = cand_client.post(
            "/api/assessment/register/",
            {
                "full_name": "Charlie Brown",
                "email": "charlie@ceg.edu",
                "register_number": "CEG2026003",
                "phone_number": "9876543213",
                "college_id": self.college1.id,
                "drive_code": drive.drive_code,
                "assessment_id": str(a1.id),
            },
            format="json",
        )
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        cand_token = reg_res.data["assessment_token"]

        cand_client.credentials(HTTP_AUTHORIZATION=f"Bearer {cand_token}")
        start_res = cand_client.post("/api/assessment/start/", {"assessment_id": str(a1.id)}, format="json")
        self.assertEqual(start_res.status_code, status.HTTP_200_OK)

        # Verify only 1 attempt exists, and it is for a1
        candidate = Candidate.objects.get(email="charlie@ceg.edu")
        attempts = AssessmentAttempt.objects.filter(candidate=candidate)
        self.assertEqual(attempts.count(), 1)
        self.assertEqual(attempts.first().assessment.id, a1.id)

    def test_e_multiple_drives_sharing_assessment(self):
        """
        Test E: Multiple drives share an assessment. Candidate identity is preserved,
        no duplicate Candidate objects are spawned within an assessment.
        """
        d1 = Drive.objects.create(name="Drive Alpha", code="DA-01", status=Drive.Status.ACTIVE, created_by=self.admin)
        d2 = Drive.objects.create(name="Drive Beta", code="DB-02", status=Drive.Status.ACTIVE, created_by=self.admin)
        d1.eligible_colleges.add(self.college1)
        d2.eligible_colleges.add(self.college1)

        shared_assessment = Assessment.objects.create(
            title="Shared Core Assessment",
            code="SHARED-01",
            duration_minutes=45,
            aptitude_count=1,
            coding_count=0,
            total_marks=1,
            status=Assessment.Status.OPEN,
            is_standalone=False,
        )
        DriveAssessment.objects.create(drive=d1, assessment=shared_assessment, status="ACTIVE")
        DriveAssessment.objects.create(drive=d2, assessment=shared_assessment, status="ACTIVE")

        cand_client = APIClient()
        reg1 = cand_client.post(
            "/api/assessment/register/",
            {
                "full_name": "Dan Wilson",
                "email": "dan@ceg.edu",
                "register_number": "CEG2026004",
                "phone_number": "9876543214",
                "college_id": self.college1.id,
                "drive_code": d1.drive_code,
                "assessment_id": str(shared_assessment.id),
            },
            format="json",
        )
        self.assertEqual(reg1.status_code, status.HTTP_201_CREATED)

        # Candidate registers again with same credentials under d2 for same assessment
        reg2 = cand_client.post(
            "/api/assessment/register/",
            {
                "full_name": "Dan Wilson",
                "email": "dan@ceg.edu",
                "register_number": "CEG2026004",
                "phone_number": "9876543214",
                "college_id": self.college1.id,
                "drive_code": d2.drive_code,
                "assessment_id": str(shared_assessment.id),
            },
            format="json",
        )
        self.assertEqual(reg2.status_code, status.HTTP_200_OK)

        # Candidate count with this email must be exactly 1
        cand_count = Candidate.objects.filter(email="dan@ceg.edu").count()
        self.assertEqual(cand_count, 1)

    def test_f_question_assignment_and_no_fallback(self):
        """
        Test F: Question assignment: Global -> Pool A -> Assessment allocation.
        Empty assessment must NOT fall back to global QuestionBank and must report pool_sufficient=False.
        """
        # Create 10 global questions
        for i in range(10):
            QuestionBank.objects.create(
                section_type=QuestionBank.SectionType.APTITUDE,
                prompt=f"Global Question {i+1}",
                option_a="Option A",
                option_b="Option B",
                option_c="Option C",
                option_d="Option D",
                correct_option="A",
                is_active=True,
            )

        # Create assessment requiring 6 questions (6 aptitude + 0 coding)
        assessment = Assessment.objects.create(
            title="Strict Pool Assessment",
            code="SPA-01",
            duration_minutes=30,
            aptitude_count=6,
            coding_count=0,
            total_marks=6,
            status=Assessment.Status.DRAFT,
        )

        # Check detail serializer via admin API: MUST BE INSUFFICIENT with 0 questions!
        detail_res = self.client.get(f"/api/csl-admin/assessments/{assessment.id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertFalse(detail_res.data["pool_sufficient"])
        self.assertEqual(detail_res.data["pool_questions_count"], 0)

        # Create a Question Pool with 3 questions
        pool = QuestionPool.objects.create(
            name="Logic Pool",
            code="LOGIC-01",
        )
        global_qs = list(QuestionBank.objects.all()[:3])
        for q in global_qs:
            QuestionPoolItem.objects.create(pool=pool, question=q)

        # Link pool to assessment with count 3
        AssessmentPoolSource.objects.create(
            assessment=assessment,
            pool=pool,
            question_count=3,
        )

        # Still insufficient (3 < 6)
        detail_res2 = self.client.get(f"/api/csl-admin/assessments/{assessment.id}/")
        self.assertFalse(detail_res2.data["pool_sufficient"])
        self.assertEqual(detail_res2.data["pool_questions_count"], 3)

        # Assign 3 more directly to assessment
        for q in QuestionBank.objects.all()[3:6]:
            assessment.questions.add(q)

        # Now pool is sufficient (3 from pool + 3 direct = 6 >= 6)
        detail_res3 = self.client.get(f"/api/csl-admin/assessments/{assessment.id}/")
        self.assertTrue(detail_res3.data["pool_sufficient"])
        self.assertEqual(detail_res3.data["pool_questions_count"], 6)

    def test_g_coding_playground_execution_and_evaluation(self):
        """
        Test G: Coding playground: Question creation, test cases, code run execution
        and automated submission evaluation.
        """
        # 1. Create a coding question
        q = QuestionBank.objects.create(
            section_type=QuestionBank.SectionType.CODING,
            prompt="Given two integers A and B separated by space, output their sum.",
            option_a="",
            option_b="",
            option_c="",
            option_d="",
            correct_option="A",
            is_active=True,
        )

        # 2. Attach programming details via admin API
        prog_res = self.client.post(
            f"/api/csl-admin/questions/{q.id}/coding/",
            {
                "input_format": "Two space-separated integers",
                "output_format": "A single integer",
                "allowed_languages": ["python", "java"],
                "boilerplate_code": {
                    "python": "import sys\ndef solve():\n    data = sys.stdin.read().split()\n    if data:\n        print(int(data[0]) + int(data[1]))\nsolve()",
                    "java": "import java.util.*;\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt();\n        int b = sc.nextInt();\n        System.out.println(a + b);\n    }\n}",
                },
                "time_limit_seconds": 2.0,
                "memory_limit_mb": 256,
            },
            format="json",
        )
        self.assertIn(prog_res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])

        # 3. Add test cases (1 public, 1 hidden)
        tc1_res = self.client.post(
            f"/api/csl-admin/questions/{q.id}/coding/test-cases/",
            {
                "input_text": "3 5\n",
                "expected_output": "8\n",
                "is_public": True,
                "weight": 50,
            },
            format="json",
        )
        self.assertEqual(tc1_res.status_code, status.HTTP_201_CREATED)

        tc2_res = self.client.post(
            f"/api/csl-admin/questions/{q.id}/coding/test-cases/",
            {
                "input_text": "100 250\n",
                "expected_output": "350\n",
                "is_public": False,
                "weight": 50,
            },
            format="json",
        )
        self.assertEqual(tc2_res.status_code, status.HTTP_201_CREATED)

        # 4. Create an attempt for student
        assessment = Assessment.objects.create(
            title="Coding Test",
            code="CODE-01",
            duration_minutes=30,
            aptitude_count=0,
            coding_count=1,
            total_marks=1,
            status=Assessment.Status.OPEN,
        )
        assessment.questions.add(q)

        candidate = Candidate.objects.create(
            full_name="Grace Hopper",
            email="grace@compiler.org",
            register_number="GH-1944",
            college="College of Engineering Guindy",
            college_ref=self.college1,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=candidate,
            assessment=assessment,
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=q,
            question_order=1,
            section_type="CODING",
            prompt=q.prompt,
            option_a_text="",
            option_b_text="",
            option_c_text="",
            option_d_text="",
            correct_option_key="A",
        )

        cand_token = generate_candidate_token(str(candidate.id), str(attempt.id))
        cand_client = APIClient()
        cand_client.credentials(HTTP_AUTHORIZATION=f"Bearer {cand_token}")

        # 5. Run sample code
        run_res = cand_client.post(
            "/api/assessment/code/run/",
            {
                "attempt_id": str(attempt.id),
                "question_id": q.id,
                "language": "python",
                "source_code": "import sys\nd = sys.stdin.read().split()\nprint(int(d[0]) + int(d[1]))",
                "stdin": "10 20\n",
            },
            format="json",
        )
        self.assertEqual(run_res.status_code, status.HTTP_200_OK)
        self.assertEqual(run_res.data["stdout"].strip(), "30")
        self.assertEqual(run_res.data["status"], "ACCEPTED")

        # 6. Submit final code for evaluation against all test cases
        submit_res = cand_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(attempt.id),
                "question_id": q.id,
                "language": "python",
                "source_code": "import sys\nd = sys.stdin.read().split()\nprint(int(d[0]) + int(d[1]))",
            },
            format="json",
        )
        self.assertEqual(submit_res.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_res.data["status"], "ACCEPTED")
        self.assertEqual(submit_res.data["score"], 1.0)
        self.assertEqual(submit_res.data["passed_count"], 2)
        self.assertEqual(submit_res.data["total_test_cases"], 2)

        # Verify CodeSubmission and CodeTestResult persistence
        submission = CodeSubmission.objects.filter(attempt=attempt, programming_question__question=q).first()
        self.assertIsNotNone(submission)
        self.assertEqual(submission.verdict, "ACCEPTED")
        self.assertEqual(submission.score_awarded, 1.0)
        self.assertEqual(submission.test_results.count(), 2)
