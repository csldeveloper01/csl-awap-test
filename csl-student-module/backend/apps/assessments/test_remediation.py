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
        self.pool = QuestionPool.objects.create(name="Core Aptitude Pool", code="CORE-APT", question_type="MCQ")
        self.coding_pool = QuestionPool.objects.create(name="Core Coding Pool", code="CORE-COD", question_type="CODING")
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
        url = f"/api/csl-admin/question-pools/{self.coding_pool.id}/questions/"
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
        self.assertTrue(QuestionPoolItem.objects.filter(pool=self.coding_pool, question=q).exists())

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

    def test_repeat_admin_test_run(self):
        assessment = Assessment.objects.create(
            code="REPEAT-TEST-01",
            title="Repeat Test Run Assessment",
            aptitude_count=5,
            coding_count=0,
            max_attempts=1,
        )
        url = f"/api/csl-admin/assessments/{assessment.id}/test-run/"
        
        # First test run launch
        res1 = self.client.post(url)
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res1.data["is_simulation"])
        attempt_id_1 = res1.data["attempt_id"]

        # Finalize the first attempt to simulate a completed test run
        attempt1 = AssessmentAttempt.objects.get(id=attempt_id_1)
        attempt1.state = AssessmentAttempt.State.SUBMITTED
        attempt1.save(update_fields=["state"])

        # Second test run launch on the same assessment - MUST NOT fail with max attempts or deactivation error
        res2 = self.client.post(url)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res2.data["is_simulation"])
        attempt_id_2 = res2.data["attempt_id"]
        self.assertNotEqual(attempt_id_1, attempt_id_2)

    def test_deactivated_candidate_diagnostics(self):
        deact_cand = Candidate.objects.create(
            full_name="Deactivated Candidate",
            register_number="DEACT001",
            email="deact@csl.local",
            phone_number="9123456780",
            college="Engineering College",
            is_active=False,
            is_simulation=False,
        )
        unauthed_client = APIClient()

        # Login endpoint returns 403 deactivated
        res_login = unauthed_client.post("/api/assessment/login/", {"identifier": deact_cand.register_number})
        self.assertEqual(res_login.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("candidate profile has been deactivated", res_login.data["detail"].lower())

        # Recovery endpoint returns 403 deactivated
        res_rec = unauthed_client.post("/api/assessment/recover/", {
            "register_number": deact_cand.register_number,
            "verification_factor": deact_cand.email,
        })
        self.assertEqual(res_rec.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("candidate profile has been deactivated", res_rec.data["detail"].lower())

        # Drive link endpoint returns 403 deactivated
        res_link = unauthed_client.post("/api/assessment/drives/link-candidate/", {
            "register_number": deact_cand.register_number,
            "verification_factor": deact_cand.email,
            "drive_code": self.drive.drive_code,
        })
        self.assertEqual(res_link.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("candidate profile has been deactivated", res_link.data["detail"].lower())

    def test_seb_toggle_and_default_optional(self):
        assessment = Assessment.objects.create(
            code="SEB-TEST-01",
            title="SEB Optional Assessment",
            aptitude_count=5,
            coding_count=0,
        )
        # Default must be False (Safe Exam Browser is NOT required by default)
        self.assertFalse(assessment.is_seb_required)

        # Admin toggle endpoint
        url = f"/api/csl-admin/assessments/{assessment.id}/toggle-seb/"
        res = self.client.post(url, {"is_seb_required": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_seb_required"])
        assessment.refresh_from_db()
        self.assertTrue(assessment.is_seb_required)

        # Toggle back off
        res2 = self.client.post(url, {"is_seb_required": False}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertFalse(res2.data["is_seb_required"])
        assessment.refresh_from_db()
        self.assertFalse(assessment.is_seb_required)

    def test_eight_digit_drive_access_code(self):
        drive = Drive.objects.create(name="Campus Drive 2026", code="CAMPUS-2026")
        self.assertEqual(len(drive.drive_code), 8)
        self.assertTrue(drive.drive_code.isdigit())

        # PublicDriveDetailView resolves by 8-digit access code
        res_detail = self.client.get(f"/api/assessment/drives/{drive.drive_code}/public/")
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_detail.data["id"], str(drive.id))
        self.assertEqual(res_detail.data["eight_digit_code"], drive.drive_code)

        # ResolveAccessCodeView resolves by 8-digit access code
        res_resolve = self.client.post("/api/assessment/resolve-code/", {"code": drive.drive_code}, format="json")
        self.assertEqual(res_resolve.status_code, status.HTTP_200_OK)
        self.assertEqual(res_resolve.data["type"], "DRIVE")
        self.assertEqual(res_resolve.data["drive_id"], str(drive.id))
        self.assertEqual(res_resolve.data["eight_digit_code"], drive.drive_code)

        # DriveLinkCandidateView links candidate using 8-digit code
        cand = Candidate.objects.create(
            full_name="Eligible Candidate",
            register_number="ELIGIBLE001",
            email="eligible@csl.local",
            phone_number="9876543211",
            college="Test Engineering College",
            college_ref=self.college,
            is_active=True,
        )
        res_link = self.client.post("/api/assessment/drives/link-candidate/", {
            "register_number": cand.register_number,
            "verification_factor": cand.email,
            "drive_code": drive.drive_code,
        }, format="json")
        self.assertEqual(res_link.status_code, status.HTTP_200_OK)
        self.assertTrue(res_link.data["success"])
        self.assertEqual(res_link.data["eight_digit_code"], drive.drive_code)

    def test_proctoring_calibration_validation(self):
        cand = Candidate.objects.create(
            full_name="Proctor Student",
            register_number="PROC001",
            email="proc@csl.local",
            college="Test Engineering College",
            is_active=True,
        )
        assessment = Assessment.objects.create(
            code="PROC-ASSESS",
            title="Proctored Assessment",
            aptitude_count=5,
            coding_count=0,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            assessment=assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
        )
        from apps.assessments.models import ProctoringSession
        session = ProctoringSession.objects.create(
            assessment_session=attempt,
            student=cand,
            assessment=assessment,
            status=ProctoringSession.SessionStatus.ACTIVE,
        )

        token = generate_candidate_token(str(cand.id), str(attempt.id))
        student_client = APIClient()
        student_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Reject out of bounds baseline angles
        res_bad_angle = student_client.post(
            f"/api/assessment/proctoring/{session.id}/calibration/",
            {
                "baseline_orientation": {"yaw": 120.0, "pitch": 5.0, "roll": 0.0},
                "calibration_results": [{"step": "LOOK_STRAIGHT", "passed": True}],
                "calibration_completed": True,
            },
            format="json",
        )
        self.assertEqual(res_bad_angle.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("physiological range", res_bad_angle.data["detail"])

        # Accept valid 6-pose calibration
        res_good = student_client.post(
            f"/api/assessment/proctoring/{session.id}/calibration/",
            {
                "baseline_orientation": {"yaw": 2.1, "pitch": -1.4, "roll": 0.5},
                "calibration_results": [
                    {"step": "LOOK_STRAIGHT", "passed": True},
                    {"step": "TURN_RIGHT", "passed": True},
                    {"step": "TURN_LEFT", "passed": True},
                    {"step": "LOOK_UP", "passed": True},
                    {"step": "LOOK_DOWN", "passed": True},
                    {"step": "RETURN_CENTER", "passed": True},
                ],
                "calibration_completed": True,
            },
            format="json",
        )
        self.assertEqual(res_good.status_code, status.HTTP_200_OK)
        self.assertTrue(res_good.data["calibration_completed"])

    def test_coding_execution_and_grading_end_to_end(self):
        # 1. Create a Coding Problem with public and hidden test cases
        q = QuestionBank.objects.create(
            prompt="Write a program to calculate the factorial of a positive integer.",
            section_type=QuestionBank.SectionType.CODING,
            assessment_type="CODING",
            difficulty=QuestionBank.Difficulty.MEDIUM,
            marks=10,
            is_active=True,
        )
        prog_q = ProgrammingQuestion.objects.create(
            question=q,
            problem_statement="Given integer N from standard input, print N!.",
            time_limit_seconds=3.0,
            memory_limit_mb=256,
            allowed_languages=["python", "java"],
        )
        # Public sample test case (N=5 -> 120)
        tc_pub = prog_q.test_cases.create(
            input_text="5\n",
            expected_output="120",
            is_public=True,
            marks_weightage=4.0,
            order=1,
            is_active=True,
        )
        # Hidden test case (N=7 -> 5040)
        tc_hid = prog_q.test_cases.create(
            input_text="7\n",
            expected_output="5040",
            is_public=False,
            marks_weightage=6.0,
            order=2,
            is_active=True,
        )

        assessment = Assessment.objects.create(
            code="CODING-EVAL-01",
            title="Coding Assessment",
            assessment_type="CODING",
            aptitude_count=0,
            coding_count=1,
            total_marks=10,
        )
        cand = Candidate.objects.create(
            full_name="Coder Student",
            register_number="CODE2026",
            email="coder@csl.local",
            college="Test Engineering College",
            is_active=True,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            assessment=assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            snapshot_total_marks=10,
        )
        from apps.assessments.models import AttemptQuestionSnapshot
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
            correct_option_key="",
            programming_data={
                "problem_statement": prog_q.problem_statement,
                "time_limit_seconds": 3.0,
                "memory_limit_mb": 256,
                "allowed_languages": ["python", "java"],
                "test_cases": [
                    {
                        "id": str(tc_pub.id),
                        "input_text": tc_pub.input_text,
                        "expected_output": tc_pub.expected_output,
                        "is_public": True,
                        "marks_weightage": 4.0,
                    },
                    {
                        "id": str(tc_hid.id),
                        "input_text": tc_hid.input_text,
                        "expected_output": tc_hid.expected_output,
                        "is_public": False,
                        "marks_weightage": 6.0,
                    },
                ]
            }
        )

        token = generate_candidate_token(str(cand.id), str(attempt.id))
        student_client = APIClient()
        student_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Correct Python solution
        python_solution = (
            "import sys, math\n"
            "data = sys.stdin.read().strip()\n"
            "if data:\n"
            "    n = int(data)\n"
            "    print(math.factorial(n))\n"
        )

        # 2. Test Run View (Sample Cases)
        res_run = student_client.post(
            "/api/assessment/code/run/",
            {
                "attempt_id": str(attempt.id),
                "question_id": q.id,
                "language": "python",
                "source_code": python_solution,
            },
            format="json",
        )
        self.assertEqual(res_run.status_code, status.HTTP_200_OK)
        self.assertEqual(res_run.data["mode"], "SAMPLE_CASES")
        self.assertEqual(res_run.data["verdict"], "ACCEPTED")
        self.assertEqual(res_run.data["passed_samples"], 1)

        # 3. Test Submit View (Authoritative Evaluation)
        res_submit = student_client.post(
            "/api/assessment/code/submit/",
            {
                "attempt_id": str(attempt.id),
                "question_id": q.id,
                "language": "python",
                "source_code": python_solution,
            },
            format="json",
        )
        self.assertEqual(res_submit.status_code, status.HTTP_200_OK)
        self.assertEqual(res_submit.data["verdict"], "ACCEPTED")
        self.assertEqual(res_submit.data["passed_test_cases"], 2)
        self.assertEqual(res_submit.data["score_awarded"], 10.0)

        # Verify hidden test case output is strictly protected
        results = res_submit.data["results"]
        self.assertEqual(len(results), 2)
        hidden_res = next(r for r in results if not r["is_public"])
        self.assertIsNone(hidden_res["expected_output"])
        self.assertIsNone(hidden_res["actual_output"])
        self.assertIsNone(hidden_res["input_text"])
        self.assertTrue(hidden_res["passed"])

        # Check attempt updated scores
        attempt.refresh_from_db()
        self.assertEqual(attempt.coding_score, 10)
        self.assertEqual(attempt.total_score, 10)
        self.assertEqual(attempt.percentage, 100.0)
