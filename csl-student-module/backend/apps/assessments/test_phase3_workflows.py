import json
import uuid
from datetime import timedelta
from django.utils import timezone
from django.test import TestCase
from django.urls import reverse
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
    QuestionPool,
    QuestionPoolItem,
    Drive,
    DriveAssessment,
    DriveRegistration,
    DriveInvitation,
    AssessmentRegistration,
    ProgrammingQuestion,
    ProgrammingTestCase,
    CodeSubmission,
    CodeTestResult,
    AssessmentAuditLog,
)
from apps.assessments.coding_service import (
    normalize_code_output,
    is_safe_local_execution_permitted,
    execute_single_run,
    evaluate_submission,
)
from apps.assessments.tokens import generate_candidate_token


class Phase3WorkflowsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin_user = User.objects.create_superuser(
            username="phase3admin",
            email="phase3admin@example.com",
            password="adminpassword123",
            first_name="Phase3",
            last_name="Admin",
            role=User.Role.ADMIN,
        )

        # Active Colleges
        self.college_a = College.objects.create(name="College Alpha", code="COL-ALPHA", is_active=True)
        self.college_b = College.objects.create(name="College Beta", code="COL-BETA", is_active=True)
        self.college_c = College.objects.create(name="College Gamma", code="COL-GAMMA", is_active=True)

        # Section
        self.coding_section, _ = AssessmentSection.objects.get_or_create(
            code="CODING",
            defaults={"name": "Coding Fundamentals", "description": "Programming exercises", "order": 1}
        )

    def test_part1_invite_only_drive_code_resolution_and_registration(self):
        """
        Single registration experience for invite-only Drives:
        8-digit drive_code resolves Drive directly and authorizes registration
        without requiring a separate DriveInvitation row.
        """
        now = timezone.now()
        drive = Drive.objects.create(
            name="Mega Campus Drive 2026",
            code="MCD2026",
            drive_code="88776655",
            visibility=Drive.Visibility.INVITE_ONLY,
            status=Drive.Status.ACTIVE,
            registration_start=now - timedelta(days=1),
            registration_end=now + timedelta(days=5),
        )
        drive.eligible_colleges.add(self.college_a)

        # 1. Resolve code via ResolveAccessCodeView
        res = self.client.post("/api/resolve-code/", {"code": "88776655"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["type"], "DRIVE")
        self.assertEqual(res.data["drive_id"], str(drive.id))
        self.assertEqual(res.data["visibility"], Drive.Visibility.INVITE_ONLY)

        # 2. Register candidate using 8-digit access_code
        payload = {
            "full_name": "Alice Candidate",
            "email": "alice@alpha.edu",
            "register_number": "REG-ALICE-01",
            "phone_number": "9876543210",
            "college_id": self.college_a.id,
            "access_code": "88776655",
        }
        reg_res = self.client.post("/api/assessment/register/", payload, format="json")
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(reg_res.data["drive_id"], str(drive.id))
        self.assertTrue(DriveRegistration.objects.filter(drive=drive, candidate__email="alice@alpha.edu").exists())

        # 3. Test ineligible college rejection
        ineligible_payload = {
            "full_name": "Bob Ineligible",
            "email": "bob@beta.edu",
            "register_number": "REG-BOB-02",
            "phone_number": "9876543211",
            "college_id": self.college_b.id,
            "access_code": "88776655",
        }
        bad_res = self.client.post("/api/assessment/register/", ineligible_payload, format="json")
        self.assertEqual(bad_res.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Idempotent candidate re-registration (prevent duplicates)
        re_res = self.client.post("/api/assessment/register/", payload, format="json")
        self.assertEqual(re_res.status_code, status.HTTP_200_OK)
        self.assertEqual(Candidate.objects.filter(register_number="REG-ALICE-01").count(), 1)
        self.assertEqual(DriveRegistration.objects.filter(drive=drive).count(), 1)

    def test_part1_dual_college_eligibility_and_standalone_isolation(self):
        """
        Drive-based assessment inherits Drive's colleges if none specified.
        If assessment specifies restrictions, candidate must satisfy both Drive and Assessment college eligibility.
        Invite-only/Drive mode never falls through to standalone assessments.
        """
        drive = Drive.objects.create(
            name="Tech Hiring Drive",
            code="THD2026",
            drive_code="12345678",
            visibility=Drive.Visibility.PUBLIC,
            status=Drive.Status.ACTIVE,
        )
        drive.eligible_colleges.add(self.college_a, self.college_b)

        # Assessment 1: inherits Drive colleges (no assessment-level college restriction)
        assessment_inherited = Assessment.objects.create(
            title="Drive General Assessment",
            code="DRV-GEN",
            status=Assessment.Status.OPEN,
            is_standalone=False,
            total_marks=20,
        )
        DriveAssessment.objects.create(drive=drive, assessment=assessment_inherited, display_order=1, status="ACTIVE")

        # Assessment 2: restricts to College Alpha only
        assessment_restricted = Assessment.objects.create(
            title="Drive Advanced Coding (Alpha Only)",
            code="DRV-ADV",
            status=Assessment.Status.OPEN,
            is_standalone=False,
            total_marks=30,
        )
        assessment_restricted.eligible_colleges.add(self.college_a)
        DriveAssessment.objects.create(drive=drive, assessment=assessment_restricted, display_order=2, status="ACTIVE")

        # Assessment 3: Standalone assessment (must never leak into drive view)
        assessment_standalone = Assessment.objects.create(
            title="Independent Open Assessment",
            code="IND-OPEN",
            status=Assessment.Status.OPEN,
            is_standalone=True,
            total_marks=50,
        )
        assessment_standalone.eligible_colleges.add(self.college_a, self.college_b)

        # Candidate from College Beta
        cand_beta = Candidate.objects.create(
            full_name="Beta Candidate",
            register_number="REG-BETA-01",
            email="beta@beta.edu",
            college_ref=self.college_b,
            college=self.college_b.name,
            is_active=True,
        )
        token_beta = generate_candidate_token(str(cand_beta.id))

        # Check candidate assessments under Drive context
        client_auth = APIClient()
        client_auth.credentials(HTTP_AUTHORIZATION=f"Bearer {token_beta}")
        res = client_auth.get(f"/api/assessment/candidate-assessments/?drive_code={drive.drive_code}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ass_ids = [a["id"] for a in res.data["assessments"]]

        # Should include DRV-GEN (inherited)
        self.assertIn(str(assessment_inherited.id), ass_ids)
        # Should NOT include DRV-ADV (restricted to College Alpha)
        self.assertNotIn(str(assessment_restricted.id), ass_ids)
        # Should NOT include IND-OPEN (standalone)
        self.assertNotIn(str(assessment_standalone.id), ass_ids)

        # Standalone query (no drive_code) should return ONLY standalone assessments
        res_standalone = client_auth.get("/api/assessment/candidate-assessments/")
        self.assertEqual(res_standalone.status_code, status.HTTP_200_OK)
        standalone_ids = [a["id"] for a in res_standalone.data["assessments"]]
        self.assertIn(str(assessment_standalone.id), standalone_ids)
        self.assertNotIn(str(assessment_inherited.id), standalone_ids)
        self.assertNotIn(str(assessment_restricted.id), standalone_ids)

    def test_part2_coding_question_bulk_json_import(self):
        """
        Tests structured JSON bulk import for coding questions:
        - GET returns template
        - POST preview=true validates schema and test cases without DB changes
        - POST preview=false persists QuestionBank, ProgrammingQuestion, ProgrammingTestCase, QuestionPool
        - Audit log is recorded
        """
        self.client.force_authenticate(user=self.admin_user)

        # 1. GET template
        get_res = self.client.get("/api/csl-admin/questions/import-coding-json/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertIn("template", get_res.data)

        # Target pool
        pool = QuestionPool.objects.create(
            name="Algorithms Level 1",
            code="POOL_ALGO_L1",
            description="Fundamental coding problems",
        )

        payload = {
            "pool_id": str(pool.id),
            "duplicate_policy": "CREATE_NEW",
            "questions": [
                {
                    "title": "Reverse String Challenge",
                    "problem_statement": "Given a string s, return the reversed string.",
                    "constraints": "1 <= s.length <= 10^5",
                    "input_format": "A single string s.",
                    "output_format": "The reversed string.",
                    "difficulty": "EASY",
                    "section_type": "CODING",
                    "marks": 10,
                    "time_limit_seconds": 1.5,
                    "memory_limit_mb": 128,
                    "allowed_languages": ["python", "java"],
                    "boilerplate_code": {
                        "python": "import sys\ndef solve():\n    s = sys.stdin.read().strip()\n    print(s[::-1])\nif __name__ == '__main__':\n    solve()"
                    },
                    "test_cases": [
                        {
                            "input_text": "hello",
                            "expected_output": "olleh",
                            "is_public": True,
                            "marks_weightage": 4.0,
                            "explanation": "'hello' reversed is 'olleh'"
                        },
                        {
                            "input_text": "CSLPlatform",
                            "expected_output": "mroftalPLS",
                            "is_public": False,
                            "marks_weightage": 6.0
                        }
                    ]
                }
            ]
        }

        # 2. Preview mode
        prev_res = self.client.post("/api/csl-admin/questions/import-coding-json/?preview=true", payload, format="json")
        self.assertEqual(prev_res.status_code, status.HTTP_200_OK)
        self.assertTrue(prev_res.data.get("preview_mode"))
        self.assertEqual(prev_res.data["valid_count"], 1)
        self.assertEqual(QuestionBank.objects.filter(prompt="Reverse String Challenge").count(), 0)

        # 3. Commit mode
        commit_res = self.client.post("/api/csl-admin/questions/import-coding-json/", payload, format="json")
        self.assertEqual(commit_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(commit_res.data["imported_count"], 1)

        # Verify DB records
        q = QuestionBank.objects.get(prompt="Reverse String Challenge")
        self.assertEqual(q.section_type, "CODING")
        self.assertEqual(q.marks, 10)

        prog = ProgrammingQuestion.objects.get(question=q)
        self.assertEqual(prog.time_limit_seconds, 1.5)
        self.assertEqual(prog.test_cases.count(), 2)

        public_tc = prog.test_cases.get(is_public=True)
        self.assertEqual(public_tc.input_text, "hello")
        self.assertEqual(public_tc.expected_output, "olleh")

        hidden_tc = prog.test_cases.get(is_public=False)
        self.assertEqual(hidden_tc.marks_weightage, 6.0)

        # Verify QuestionPool association
        self.assertTrue(QuestionPoolItem.objects.filter(pool=pool, question=q).exists())

        # Verify Audit Log
        self.assertTrue(AssessmentAuditLog.objects.filter(action=AssessmentAuditLog.Action.QUESTIONS_IMPORTED).exists())

    def test_part3_output_normalization_and_whitespace_handling(self):
        """
        Tests output comparison policy:
        CRLF and CR are normalized to LF, trailing whitespace and blank lines handled.
        """
        out1 = "hello world  \r\n42\r\n\r\n"
        out2 = "hello world\n42"
        self.assertEqual(normalize_code_output(out1, mode="trimmed"), normalize_code_output(out2, mode="trimmed"))

        # Leading internal indentation preserved
        indented = "  for i in range(10):\n    print(i)  "
        norm = normalize_code_output(indented, mode="trimmed")
        self.assertTrue(norm.startswith("  for i in range(10):"))

    def test_part3_code_execution_grading_and_hidden_test_security(self):
        """
        Tests candidate code evaluation:
        - Evaluates against public and hidden test cases
        - Proportional scoring based on test case weights
        - Hidden test cases NEVER leak input, output, or details to candidate response
        - Attempt coding_score and total_score are updated
        """
        # Create Coding Question
        q = QuestionBank.objects.create(
            prompt="Square Number",
            section_type="CODING",
            marks=10,
            option_a="N/A", option_b="N/A", option_c="N/A", option_d="N/A",
            correct_option="A"
        )
        prog = ProgrammingQuestion.objects.create(
            question=q,
            problem_statement="Read integer n from stdin and print its square.",
            time_limit_seconds=2.0,
            memory_limit_mb=128,
            allowed_languages=["python"],
        )
        tc_pub = ProgrammingTestCase.objects.create(
            programming_question=prog,
            is_public=True,
            input_text="5",
            expected_output="25",
            marks_weightage=4.0,
            order=1,
        )
        tc_hid = ProgrammingTestCase.objects.create(
            programming_question=prog,
            is_public=False,
            input_text="12",
            expected_output="144",
            marks_weightage=6.0,
            order=2,
        )

        cand = Candidate.objects.create(
            full_name="Coder Candidate",
            register_number="REG-CODE-01",
            email="coder@alpha.edu",
            college_ref=self.college_a,
            college=self.college_a.name,
            is_active=True,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(minutes=60),
            snapshot_total_marks=50,
            aptitude_score=15,
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=q,
            question_order=1,
            section_type="CODING",
            prompt=q.prompt,
            option_a_text="N/A", option_b_text="N/A", option_c_text="N/A", option_d_text="N/A",
            correct_option_key="A",
        )

        token = generate_candidate_token(str(cand.id), str(attempt.id))
        cand_client = APIClient()
        cand_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # 1. Run code against sample cases (Run Code API)
        run_payload = {
            "attempt_id": str(attempt.id),
            "question_id": q.id,
            "language": "python",
            "source_code": "import sys\nn = int(sys.stdin.read().strip())\nprint(n * n)",
        }
        run_res = cand_client.post("/api/assessment/code/run/", run_payload, format="json")
        self.assertEqual(run_res.status_code, status.HTTP_200_OK)
        self.assertIn("sample_results", run_res.data)
        self.assertEqual(len(run_res.data["sample_results"]), 1)
        self.assertTrue(run_res.data["sample_results"][0]["passed"])

        # 2. Submit solution for grading
        submit_payload = {
            "attempt_id": str(attempt.id),
            "question_id": q.id,
            "language": "python",
            "source_code": "import sys\nn = int(sys.stdin.read().strip())\nprint(n * n)",
        }
        submit_res = cand_client.post("/api/assessment/code/submit/", submit_payload, format="json")
        self.assertEqual(submit_res.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_res.data["verdict"], "ACCEPTED")
        self.assertEqual(submit_res.data["score_awarded"], 10.0)
        self.assertEqual(submit_res.data["passed_test_cases"], 2)

        # STRICT SECURITY CHECK: Hidden test case must NOT leak expected_output, input_text, or actual_output to student!
        for r in submit_res.data["results"]:
            if not r["is_public"]:
                self.assertIsNone(r.get("input_text"))
                self.assertIsNone(r.get("expected_output"))
                self.assertIsNone(r.get("actual_output"))
                self.assertIsNone(r.get("explanation"))

        # Check attempt updated scores
        attempt.refresh_from_db()
        self.assertEqual(attempt.coding_score, 10)
        self.assertEqual(attempt.total_score, 25) # 15 aptitude + 10 coding

        # 3. Test Partial Credit (Passing only public test case)
        partial_code = "import sys\nn = int(sys.stdin.read().strip())\nif n == 5: print(25)\nelse: print(0)"
        partial_eval = evaluate_submission(
            programming_question=prog,
            candidate=cand,
            attempt=attempt,
            language="python",
            source_code=partial_code,
        )
        self.assertEqual(partial_eval["verdict"], "WRONG_ANSWER")
        self.assertEqual(partial_eval["passed_test_cases"], 1)
        # 4 out of 10 marks weightage -> 4.0 pts
        self.assertEqual(partial_eval["score_awarded"], 4.0)

    def test_part4_admin_attempt_review_breakdown(self):
        """
        Admins can inspect code submissions including full test cases (both public and hidden)
        with actual output, expected output, and execution metrics.
        """
        q = QuestionBank.objects.create(prompt="Admin Review Coding Question", section_type="CODING", marks=10)
        prog = ProgrammingQuestion.objects.create(question=q, problem_statement="Statement")
        tc_hid = ProgrammingTestCase.objects.create(
            programming_question=prog,
            is_public=False,
            input_text="SecretInput",
            expected_output="SecretOutput",
            marks_weightage=10.0,
        )
        cand = Candidate.objects.create(
            full_name="Review Cand",
            register_number="REG-REV-01",
            email="rev@alpha.edu",
            college_ref=self.college_a,
            college=self.college_a.name,
            is_active=True,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            state=AssessmentAttempt.State.SUBMITTED,
            started_at=timezone.now() - timedelta(minutes=30),
            deadline=timezone.now() + timedelta(minutes=30),
            submitted_at=timezone.now(),
            coding_score=0,
            total_score=0,
        )

        sub = CodeSubmission.objects.create(
            attempt=attempt,
            candidate=cand,
            programming_question=prog,
            language="python",
            source_code="print('Wrong')",
            verdict=CodeSubmission.Verdict.WRONG_ANSWER,
            score_awarded=0.0,
            total_test_cases=1,
            passed_test_cases=0,
            execution_time_ms=12.5,
        )
        CodeTestResult.objects.create(
            submission=sub,
            test_case=tc_hid,
            status=CodeSubmission.Verdict.WRONG_ANSWER,
            actual_output="Wrong",
            error_message="",
            execution_time_ms=12.5,
            passed=False,
        )

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f"/api/csl-admin/attempts/{attempt.id}/review/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("code_submissions", res.data)
        self.assertEqual(len(res.data["code_submissions"]), 1)

        sub_data = res.data["code_submissions"][0]
        self.assertEqual(sub_data["verdict"], "WRONG_ANSWER")
        self.assertEqual(len(sub_data["test_results"]), 1)

        tr_data = sub_data["test_results"][0]
        # Admin CAN see hidden test case inputs and outputs for review
        self.assertFalse(tr_data["is_public"])
        self.assertEqual(tr_data["expected_output"], "SecretOutput")
        self.assertEqual(tr_data["actual_output"], "Wrong")

    def test_part4_importer_validation_edge_cases(self):
        """
        Phase 3.1: Importer validation tests:
        1. Reject missing expected_output field.
        2. Accept explicitly empty expected_output ("").
        3. Reject non-positive marks.
        4. Reject non-positive weightage.
        5. Reject unsupported languages.
        6. Protect historical test case results on OVERWRITE duplicate policy.
        """
        self.client.force_authenticate(user=self.admin_user)

        # 1. Reject missing expected_output
        missing_out_payload = {
            "questions": [{
                "title": "Missing Out Q",
                "problem_statement": "Do something",
                "section_type": "CODING",
                "marks": 10,
                "allowed_languages": ["python"],
                "test_cases": [{"input_text": "5"}] # No expected_output
            }]
        }
        res1 = self.client.post("/api/csl-admin/questions/import-coding-json/", missing_out_payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Accept explicitly empty expected_output ("")
        empty_out_payload = {
            "questions": [{
                "title": "Empty Output Q",
                "problem_statement": "Output nothing",
                "section_type": "CODING",
                "marks": 10,
                "allowed_languages": ["python"],
                "test_cases": [{"input_text": "5", "expected_output": "", "marks_weightage": 1.0}]
            }]
        }
        res2 = self.client.post("/api/csl-admin/questions/import-coding-json/", empty_out_payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.data["imported_count"], 1)

        # 3. Reject non-positive marks
        non_pos_marks_payload = {
            "questions": [{
                "title": "Non Pos Marks Q",
                "marks": -5,
                "test_cases": [{"input_text": "5", "expected_output": "5"}]
            }]
        }
        res3 = self.client.post("/api/csl-admin/questions/import-coding-json/", non_pos_marks_payload, format="json")
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Reject non-positive weightage
        non_pos_weight_payload = {
            "questions": [{
                "title": "Non Pos Weight Q",
                "marks": 10,
                "test_cases": [{"input_text": "5", "expected_output": "5", "marks_weightage": 0.0}]
            }]
        }
        res4 = self.client.post("/api/csl-admin/questions/import-coding-json/", non_pos_weight_payload, format="json")
        self.assertEqual(res4.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Reject unsupported languages
        bad_lang_payload = {
            "questions": [{
                "title": "Bad Lang Q",
                "marks": 10,
                "allowed_languages": ["brainfuck_lang"],
                "test_cases": [{"input_text": "5", "expected_output": "5"}]
            }]
        }
        res5 = self.client.post("/api/csl-admin/questions/import-coding-json/", bad_lang_payload, format="json")
        self.assertEqual(res5.status_code, status.HTTP_400_BAD_REQUEST)

        # 6. Historical attempt result protection on OVERWRITE
        # Create candidate attempt with a submission linked to the test case
        q_bank = QuestionBank.objects.filter(prompt="Empty Output Q").first()
        prog = q_bank.programming_details
        original_tc = prog.test_cases.first()

        history_cand = Candidate.objects.create(
            full_name="History Candidate",
            register_number="HIST-001",
            email="hist@alpha.edu",
            college_ref=self.college_a,
            college=self.college_a.name,
            is_active=True,
        )
        hist_assessment = Assessment.objects.create(
            title="History Assess",
                        duration_minutes=60,
            delivery_mode=Assessment.DeliveryMode.CODING,
            status=Assessment.Status.OPEN,
        )

        attempt = AssessmentAttempt.objects.create(
            candidate=history_cand,
            assessment=hist_assessment,
            state=AssessmentAttempt.State.SUBMITTED,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(hours=1),
        )
        submission = CodeSubmission.objects.create(
            attempt=attempt,
            candidate=history_cand,
            programming_question=prog,
            language="python",
            source_code="print()",
            verdict=CodeSubmission.Verdict.ACCEPTED,
        )
        tr = CodeTestResult.objects.create(
            submission=submission,
            test_case=original_tc,
            status=CodeSubmission.Verdict.ACCEPTED,
            passed=True,
        )

        # Now overwrite the question with new test cases
        overwrite_payload = {
            "duplicate_policy": "OVERWRITE",
            "questions": [{
                "title": "Empty Output Q",
                "marks": 15,
                "test_cases": [
                    {"input_text": "new_1", "expected_output": "out_1", "marks_weightage": 1.0},
                    {"input_text": "new_2", "expected_output": "out_2", "marks_weightage": 1.0},
                ]
            }]
        }
        res6 = self.client.post("/api/csl-admin/questions/import-coding-json/", overwrite_payload, format="json")
        self.assertIn(res6.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(res6.data["updated_count"], 1)

        # Verify historical test result was NOT cascade deleted!
        tr.refresh_from_db()
        self.assertTrue(tr.passed)
        # Original test case was archived (is_active=False)
        original_tc.refresh_from_db()
        self.assertFalse(original_tc.is_active)
        # Active test cases count is 2
        self.assertEqual(prog.test_cases.filter(is_active=True).count(), 2)

    def test_part5_immutable_attempt_question_snapshots(self):
        """
        Phase 3.1: Immutable Attempt Question Snapshots
        Starting an attempt creates a frozen snapshot of coding details and test cases.
        Subsequent question edits do not alter the candidate's active attempt questions.
        """
        coding_assessment = Assessment.objects.create(
            title="Coding Snapshot Assess",
            duration_minutes=60,
            aptitude_count=0,
            coding_count=1,
            delivery_mode=Assessment.DeliveryMode.CODING,
            status=Assessment.Status.OPEN,
        )
        coding_assessment.eligible_colleges.add(self.college_a)

        coding_q = QuestionBank.objects.create(
            prompt="Original Statement",
            section_type="CODING",
            marks=10,
            option_a="N/A", option_b="N/A", option_c="N/A", option_d="N/A",
            correct_option="A"
        )
        prog = ProgrammingQuestion.objects.create(
            question=coding_q,
            problem_statement="Original Problem Statement",
            time_limit_seconds=2.0,
            memory_limit_mb=128,
            allowed_languages=["python"],
        )
        ProgrammingTestCase.objects.create(
            programming_question=prog,
            is_public=True,
            input_text="1",
            expected_output="1",
            marks_weightage=1.0,
            order=1,
        )
        ProgrammingTestCase.objects.create(
            programming_question=prog,
            is_public=False,
            input_text="2",
            expected_output="2",
            marks_weightage=1.0,
            order=2,
        )
        coding_assessment.questions.add(coding_q)

        cand = Candidate.objects.create(
            full_name="Snapshot Candidate",
            register_number="SNAP-001",
            email="snap@alpha.edu",
            college_ref=self.college_a,
            college=self.college_a.name,
            is_active=True,
        )

        # Enroll candidate in assessment
        AssessmentRegistration.objects.create(
            candidate=cand,
            assessment=coding_assessment,
        )

        # Start attempt
        token = generate_candidate_token(str(cand.id))
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        start_res = client.post("/api/assessment/start/", {"assessment_id": str(coding_assessment.id)})
        self.assertEqual(start_res.status_code, status.HTTP_200_OK)
        attempt_id = start_res.data["id"]

        attempt = AssessmentAttempt.objects.get(id=attempt_id)
        snapshot = attempt.question_snapshots.filter(question_id=coding_q.id).first()
        self.assertIsNotNone(snapshot)
        self.assertIn("test_cases", snapshot.programming_data)
        self.assertEqual(len(snapshot.programming_data["test_cases"]), 2)
        original_statement = snapshot.programming_data["problem_statement"]

        # Admin edits the original question in the Question Bank
        coding_q.prompt = "MODIFIED PROBLEM STATEMENT BY ADMIN"
        coding_q.save()
        prog.problem_statement = "MODIFIED PROBLEM STATEMENT BY ADMIN"
        prog.save()

        # Retrieve questions as candidate during the attempt
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {generate_candidate_token(str(cand.id), str(attempt.id))}")
        attempt_res = client.get(f"/api/assessment/attempts/{attempt.id}/")
        self.assertEqual(attempt_res.status_code, status.HTTP_200_OK)

        q_item = next(q for q in attempt_res.data["questions"] if q["question_id"] == coding_q.id)
        # Candidate continues to receive the FROZEN snapshot problem statement!
        self.assertEqual(q_item["programming_details"]["problem_statement"], original_statement)
