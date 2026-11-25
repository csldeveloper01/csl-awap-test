import io
import json
import uuid
from datetime import timedelta

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assessments.models import (
    Assessment,
    AssessmentAttempt,
    AssessmentConfig,
    AssessmentPoolSource,
    AssessmentSection,
    AssessmentSectionAllocation,
    AttemptQuestionSnapshot,
    Candidate,
    College,
    Drive,
    DriveAssessment,
    IntegrityEvent,
    ProctoringEvent,
    ProctoringSession,
    ProgrammingQuestion,
    ProgrammingTestCase,
    QuestionBank,
    QuestionPool,
    QuestionPoolItem,
)
from apps.assessments.services import start_assessment_for_candidate
from apps.assessments.tokens import generate_candidate_token
from apps.users.models import User


class BaseWorkflowRepairTestCase(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username=f"admin_{uuid.uuid4().hex[:6]}",
            email=f"admin_{uuid.uuid4().hex[:6]}@csl.test",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
            status=User.AccountStatus.ACTIVE,
            is_staff=True,
            is_superuser=True,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin_user)

        self.college = College.objects.create(
            name="Repair Test Engineering College",
            code=f"RTEC{uuid.uuid4().hex[:4].upper()}",
            is_active=True,
            is_verified=True,
        )

        self.config = AssessmentConfig.objects.create(
            title="Default Repair Config",
            duration_minutes=60,
            total_marks=50,
            aptitude_count=25,
            coding_count=25,
            max_attempts=1,
            is_active=True,
        )

        self.mcq_section, _ = AssessmentSection.objects.get_or_create(
            code="APTITUDE",
            defaults={
                "name": "Aptitude & Logic",
                "is_active": True,
                "order": 1,
            },
        )
        self.coding_section, _ = AssessmentSection.objects.get_or_create(
            code="ALGO_CODING",
            defaults={
                "name": "Algorithmic Coding",
                "is_active": True,
                "order": 2,
            },
        )

    def _create_candidate(self, *, reg_suffix="001", is_simulation=False):
        uid = uuid.uuid4().hex[:6]
        return Candidate.objects.create(
            full_name=f"{'Sim' if is_simulation else 'Student'} {reg_suffix}",
            register_number=f"REG_{reg_suffix}_{uid}".upper(),
            college=self.college.name,
            college_ref=self.college,
            email=f"{'sim' if is_simulation else 'stu'}_{uid}@college.test",
            department="CSE",
            year_of_study="Final Year",
            phone_number="9876543210",
            is_active=True,
            is_simulation=is_simulation,
        )


class SentinelIsolationAndAuthTests(BaseWorkflowRepairTestCase):
    def setUp(self):
        super().setUp()
        self.assessment = Assessment.objects.create(
            code=f"ASMT_{uuid.uuid4().hex[:6].upper()}",
            title="Sentinel Isolation Assessment",
            status=Assessment.Status.OPEN,
            delivery_mode=Assessment.DeliveryMode.MCQ,
            duration_minutes=45,
            total_marks=10,
        )
        self.real_candidate = self._create_candidate(reg_suffix="REAL", is_simulation=False)
        self.sim_candidate = self._create_candidate(reg_suffix="SIM", is_simulation=True)

        self.real_attempt = AssessmentAttempt.objects.create(
            candidate=self.real_candidate,
            assessment=self.assessment,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
            snapshot_duration_minutes=45,
            snapshot_total_marks=10,
            is_simulation=False,
        )
        self.sim_attempt = AssessmentAttempt.objects.create(
            candidate=self.sim_candidate,
            assessment=self.assessment,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
            snapshot_duration_minutes=45,
            snapshot_total_marks=10,
            is_simulation=True,
        )

    def _candidate_client(self, candidate):
        client = APIClient()
        token = generate_candidate_token(candidate.id, is_simulation=candidate.is_simulation)
        client.credentials(HTTP_X_ASSESSMENT_TOKEN=token)
        return client

    def test_staff_and_simulation_subjects_blocked_on_sentinel_endpoints(self):
        sim_client = self._candidate_client(self.sim_candidate)

        # Admin / staff session must receive 403 on all student Sentinel endpoints
        admin_init = self.admin_client.post(
            "/api/assessment/proctoring/init/",
            {"attempt_id": str(self.real_attempt.id)},
            format="json",
        )
        self.assertEqual(admin_init.status_code, 403)

        admin_cal = self.admin_client.post(
            f"/api/assessment/attempts/{self.real_attempt.id}/calibration/",
            {"status": "COMPLETED", "poses": []},
            format="json",
        )
        self.assertEqual(admin_cal.status_code, 403)

        # Simulation candidate must receive 403 on Sentinel init and calibration
        sim_init = sim_client.post(
            "/api/assessment/proctoring/init/",
            {"attempt_id": str(self.sim_attempt.id)},
            format="json",
        )
        self.assertEqual(sim_init.status_code, 403)

        sim_cal = sim_client.post(
            f"/api/assessment/attempts/{self.sim_attempt.id}/calibration/",
            {"status": "COMPLETED", "poses": []},
            format="json",
        )
        self.assertEqual(sim_cal.status_code, 403)

        # Even if a simulation ProctoringSession row existed historically, all session endpoints return 403
        legacy_sim_session = ProctoringSession.objects.create(
            assessment_session=self.sim_attempt,
            student=self.sim_candidate,
            assessment=self.assessment,
            is_simulation=True,
        )
        for method, url, payload in [
            ("post", f"/api/assessment/proctoring/{legacy_sim_session.id}/camera-status/", {"status": "ACTIVE"}),
            ("post", f"/api/assessment/proctoring/{legacy_sim_session.id}/calibration/", {"calibration_completed": True}),
            ("post", f"/api/assessment/proctoring/{legacy_sim_session.id}/screen-share-status/", {"status": "ACTIVE"}),
            ("post", f"/api/assessment/proctoring/{legacy_sim_session.id}/events/", {"event_type": "TAB_SWITCHED"}),
            ("post", f"/api/assessment/proctoring/{legacy_sim_session.id}/evidence/", {"evidence_type": "WEBCAM_SNAPSHOT", "image_data": "data:image/jpeg;base64,/9j/"}),
            ("get", f"/api/assessment/proctoring/{legacy_sim_session.id}/status/", None),
            ("post", f"/api/assessment/proctoring/{legacy_sim_session.id}/end/", {}),
        ]:
            resp = getattr(sim_client, method)(url, payload, format="json") if payload is not None else getattr(sim_client, method)(url)
            self.assertEqual(resp.status_code, 403, f"Expected 403 for sim candidate on {url}")

            admin_resp = getattr(self.admin_client, method)(url, payload, format="json") if payload is not None else getattr(self.admin_client, method)(url)
            self.assertEqual(admin_resp.status_code, 403, f"Expected 403 for admin on {url}")

    def test_simulation_records_excluded_from_sentinel_and_stats_views(self):
        # Legitimate student initializes Sentinel cleanly
        real_client = self._candidate_client(self.real_candidate)
        init_res = real_client.post(
            "/api/assessment/proctoring/init/",
            {"attempt_id": str(self.real_attempt.id)},
            format="json",
        )
        self.assertIn(init_res.status_code, (200, 201))
        real_session_id = init_res.data["id"]

        # Create a simulation session + events + integrity events to verify filtering
        sim_session = ProctoringSession.objects.create(
            assessment_session=self.sim_attempt,
            student=self.sim_candidate,
            assessment=self.assessment,
            is_simulation=True,
        )
        ProctoringEvent.objects.create(
            proctoring_session=sim_session,
            event_type="FACE_NOT_DETECTED",
            severity="WARNING",
        )
        IntegrityEvent.objects.create(
            attempt=self.real_attempt,
            event_type="TAB_HIDDEN",
            metadata={},
        )
        IntegrityEvent.objects.create(
            attempt=self.sim_attempt,
            event_type="TAB_HIDDEN",
            metadata={},
        )

        # RecordIntegrityEventView must ignore simulation attempt events without creating DB rows
        sim_client = self._candidate_client(self.sim_candidate)
        before_cnt = IntegrityEvent.objects.filter(attempt=self.sim_attempt).count()
        rec_res = sim_client.post(
            f"/api/assessment/attempts/{self.sim_attempt.id}/integrity-event/",
            {"event_type": "TAB_HIDDEN", "event_id": f"ev_{uuid.uuid4().hex[:6]}"},
            format="json",
        )
        self.assertEqual(rec_res.status_code, 200)
        self.assertEqual(rec_res.data.get("status"), "simulation_ignored")
        self.assertEqual(IntegrityEvent.objects.filter(attempt=self.sim_attempt).count(), before_cnt)

        # AdminProctoringSessionsListView excludes simulation by default
        sessions_res = self.admin_client.get("/api/csl-admin/proctoring/sessions/")
        self.assertEqual(sessions_res.status_code, 200)
        sessions_list = sessions_res.data["results"] if isinstance(sessions_res.data, dict) else sessions_res.data
        session_ids = [s["id"] for s in sessions_list]
        self.assertIn(str(real_session_id), session_ids)
        self.assertNotIn(str(sim_session.id), session_ids)

        # Opt-in include_simulations=true includes simulation session
        sessions_all = self.admin_client.get("/api/csl-admin/proctoring/sessions/?include_simulations=true")
        all_list = sessions_all.data["results"] if isinstance(sessions_all.data, dict) else sessions_all.data
        all_ids = [s["id"] for s in all_list]
        self.assertIn(str(sim_session.id), all_ids)

        # Detail endpoint returns 404 for simulation session unless opted in
        sim_detail_404 = self.admin_client.get(f"/api/csl-admin/proctoring/sessions/{sim_session.id}/")
        self.assertEqual(sim_detail_404.status_code, 404)
        sim_detail_200 = self.admin_client.get(
            f"/api/csl-admin/proctoring/sessions/{sim_session.id}/?include_simulations=true"
        )
        self.assertEqual(sim_detail_200.status_code, 200)

        # AdminIntegrityEventsView excludes simulation attempts
        int_res = self.admin_client.get("/api/csl-admin/integrity-events/")
        self.assertEqual(int_res.status_code, 200)
        events_list = int_res.data["results"] if isinstance(int_res.data, dict) else int_res.data
        att_ids = {str(ev["attempt_id"]) for ev in events_list}
        self.assertIn(str(self.real_attempt.id), att_ids)
        self.assertNotIn(str(self.sim_attempt.id), att_ids)

        # AdminStatsView includes both status & overall_status in question_bank_health and excludes simulation events
        stats_res = self.admin_client.get("/api/csl-admin/stats/")
        self.assertEqual(stats_res.status_code, 200)
        self.assertEqual(stats_res.data["integrity_events_count"], 1)
        self.assertIn("status", stats_res.data["question_bank_health"])
        self.assertIn("overall_status", stats_res.data["question_bank_health"])


class QuestionPoolCsvImportTests(BaseWorkflowRepairTestCase):
    def setUp(self):
        super().setUp()
        self.pool = QuestionPool.objects.create(
            name="DSA Batch Pool",
            code=f"POOL_{uuid.uuid4().hex[:6].upper()}",
            question_type="MCQ",
            description="Targeted pool",
        )
        self.global_baseline = QuestionBank.objects.create(
            prompt="Existing Global Question",
            section_type="APTITUDE",
            option_a="1",
            option_b="2",
            option_c="3",
            option_d="4",
            correct_option="A",
            is_global=True,
        )

    def _csv_file(self, content: str, name="pool_questions.csv"):
        # Prepend UTF-8 BOM + support semicolon/comma tests
        raw = ("\ufeff" + content).encode("utf-8")
        return SimpleUploadedFile(name, raw, content_type="text/csv")

    def test_pool_csv_preview_and_isolated_import_default(self):
        # 1) MCQ CSV with UTF-8 BOM and semicolon delimiter
        mcq_csv = (
            "section;prompt;option_a;option_b;option_c;option_d;correct_option;difficulty\n"
            "Aptitude;What is 2+2?;3;4;5;6;B;EASY\n"
            "Aptitude;What is 3+5?;7;8;9;10;B;MEDIUM\n"
        )
        prev_res = self.admin_client.post(
            f"/api/csl-admin/question-pools/{self.pool.id}/import-preview/",
            {"file": self._csv_file(mcq_csv, "mcq.csv")},
            format="multipart",
        )
        self.assertEqual(prev_res.status_code, 200)
        self.assertEqual(prev_res.data["detected_type"], "MCQ")
        self.assertEqual(prev_res.data["total_rows"], 2)
        self.assertEqual(prev_res.data["valid_count"], 2)
        self.assertEqual(prev_res.data["error_count"], 0)
        self.assertTrue(len(prev_res.data["detected_sections"]) >= 1)
        self.assertIn("detected_name", prev_res.data["detected_sections"][0])
        self.assertIn("raw_section", prev_res.data["detected_sections"][0])

        # Default import must keep add_to_global_bank=False (is_global=False)
        imp_res = self.admin_client.post(
            f"/api/csl-admin/question-pools/{self.pool.id}/import-csv/",
            {
                "file": self._csv_file(mcq_csv, "mcq.csv"),
                "section_mapping": json.dumps({"Aptitude": self.mcq_section.code}),
            },
            format="multipart",
        )
        self.assertEqual(imp_res.status_code, 200, imp_res.data)
        self.assertEqual(imp_res.data["imported_count"], 2)
        self.assertFalse(imp_res.data["add_to_global_bank"])

        # 2) CODING CSV into an MCQ pool MUST be rejected (HTTP 400)
        coding_csv = (
            "section;prompt;instructions;constraints;input_format;output_format;allowed_languages;example_input_1;example_output_1;hidden_input_1;hidden_output_1;difficulty\n"
            "AlgoSection;Print sum of two numbers;Read two integers and print sum;1<=a,b<=1000;Two ints;Single int;python,cpp;2 3;5;10 20;30;MEDIUM\n"
        )
        coding_imp = self.admin_client.post(
            f"/api/csl-admin/question-pools/{self.pool.id}/import-csv/",
            {
                "file": self._csv_file(coding_csv, "coding.csv"),
                "section_mapping": json.dumps({"AlgoSection": self.coding_section.code}),
            },
            format="multipart",
        )
        self.assertEqual(coding_imp.status_code, 400, coding_imp.data)

        # Coding JSON into a CODING pool with add_to_global_bank=false stays isolated
        coding_pool = QuestionPool.objects.create(
            name="DSA Coding Pool",
            code=f"CPOOL_{uuid.uuid4().hex[:6].upper()}",
            question_type="CODING",
        )
        coding_json_res = self.admin_client.post(
            f"/api/csl-admin/questions/import-coding-json/?pool_id={coding_pool.id}",
            {
                "pool_id": str(coding_pool.id),
                "add_to_global_bank": False,
                "questions": [
                    {
                        "title": "Print sum of two numbers",
                        "problem_statement": "Read two integers and print sum",
                        "constraints": "1<=a,b<=1000",
                        "input_format": "Two ints",
                        "output_format": "Single int",
                        "difficulty": "MEDIUM",
                        "section_type": self.coding_section.code,
                        "marks": 10,
                        "allowed_languages": ["python", "cpp"],
                        "test_cases": [
                            {"input_text": "2 3", "expected_output": "5", "is_public": True},
                            {"input_text": "10 20", "expected_output": "30", "is_public": False},
                        ],
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(coding_json_res.status_code, 201, coding_json_res.data)

        pool_items = QuestionPoolItem.objects.filter(pool=self.pool).select_related("question")
        self.assertEqual(pool_items.count(), 2)
        for item in pool_items:
            self.assertFalse(item.question.is_global)

        # Global Question Bank list hides pool-only items by default
        global_list = self.admin_client.get("/api/csl-admin/questions/")
        self.assertEqual(global_list.status_code, 200)
        global_items = global_list.data["results"] if isinstance(global_list.data, dict) else global_list.data
        global_prompts = [q["prompt"] for q in global_items]
        self.assertIn("Existing Global Question", global_prompts)
        self.assertNotIn("What is 2+2?", global_prompts)
        self.assertNotIn("Print sum of two numbers", global_prompts)

        # Opting into include_pool_only reveals all questions
        all_list = self.admin_client.get("/api/csl-admin/questions/?include_pool_only=true")
        all_items = all_list.data["results"] if isinstance(all_list.data, dict) else all_list.data
        all_prompts = [q["prompt"] for q in all_items]
        self.assertIn("What is 2+2?", all_prompts)

        # Coding JSON should have created ProgrammingQuestion details and test cases
        coding_q = QuestionBank.objects.get(prompt="Print sum of two numbers")
        self.assertFalse(coding_q.is_global)
        self.assertEqual(coding_q.section_type, self.coding_section.code)
        self.assertTrue(hasattr(coding_q, "programming_details"))
        self.assertEqual(coding_q.programming_details.test_cases.count(), 2)

    def test_pool_csv_explicit_add_to_global_bank_and_assessment_generation(self):
        csv_text = (
            "section,prompt,option_a,option_b,option_c,option_d,correct_option\n"
            f"{self.mcq_section.code},GlobalOpt Question 1,A1,B1,C1,D1,A\n"
        )
        imp_res = self.admin_client.post(
            f"/api/csl-admin/question-pools/{self.pool.id}/import-csv/",
            {
                "file": self._csv_file(csv_text),
                "add_to_global_bank": "true",
            },
            format="multipart",
        )
        self.assertEqual(imp_res.status_code, 200, imp_res.data)
        self.assertTrue(imp_res.data["add_to_global_bank"])
        q = QuestionBank.objects.get(prompt="GlobalOpt Question 1")
        self.assertTrue(q.is_global)

        # Add a second pool-only question so we can test AssessmentPoolSource allocation
        pool_only_res = self.admin_client.post(
            f"/api/csl-admin/question-pools/{self.pool.id}/questions/",
            {
                "question_type": "MCQ",
                "section_type": self.mcq_section.code,
                "prompt": "Pool Only Question 2",
                "option_a": "X",
                "option_b": "Y",
                "option_c": "Z",
                "option_d": "W",
                "correct_option": "B",
                "is_global": False,
            },
            format="json",
        )
        self.assertEqual(pool_only_res.status_code, 201, pool_only_res.data)

        assessment = Assessment.objects.create(
            code=f"POOLASMT_{uuid.uuid4().hex[:5].upper()}",
            title="Pool Sourced Exam",
            status=Assessment.Status.OPEN,
            duration_minutes=30,
            total_marks=2,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment,
            section=self.mcq_section,
            question_count=2,
            marks_per_question=1,
            order=1,
        )
        AssessmentPoolSource.objects.create(assessment=assessment, pool=self.pool, section=self.mcq_section, question_count=2)
        assessment.eligible_colleges.add(self.college)

        candidate = self._create_candidate(reg_suffix="P1")
        attempt = start_assessment_for_candidate(candidate, assessment=assessment)
        prompts = list(AttemptQuestionSnapshot.objects.filter(attempt=attempt).values_list("question__prompt", flat=True))
        self.assertEqual(len(prompts), 2)
        self.assertIn("Pool Only Question 2", prompts)


class CodingQuestionLifecycleAndSecurityTests(BaseWorkflowRepairTestCase):
    def test_coding_question_crud_and_hidden_testcase_isolation(self):
        # Create canonical CODING question in pool using custom coding section
        create_res = self.admin_client.post(
            "/api/csl-admin/questions/",
            {
                "question_type": "CODING",
                "section_type": self.coding_section.code,
                "prompt": "Reverse Linked List",
                "difficulty": "MEDIUM",
                "coding_details": {
                    "problem_statement": "Given head of a linked list, reverse it.",
                    "constraints": "1 <= N <= 10^5",
                    "input_format": "Space-separated integers",
                    "output_format": "Reversed integers",
                    "allowed_languages": ["python", "cpp"],
                    "boilerplate_code": {
                        "python": "def solve():\n    pass",
                        "cpp": "int main() { return 0; }",
                    },
                    "time_limit_seconds": 2.0,
                    "memory_limit_mb": 256,
                    "test_cases": [
                        {
                            "is_public": True,
                            "input_text": "1 2 3",
                            "expected_output": "3 2 1",
                            "explanation": "Reversed order",
                            "marks_weightage": 1.0,
                        },
                        {
                            "is_public": False,
                            "input_text": "SECRET_HIDDEN_INPUT_987",
                            "expected_output": "SECRET_HIDDEN_OUTPUT_654",
                            "explanation": "",
                            "marks_weightage": 4.0,
                        },
                    ],
                },
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201, create_res.data)
        q_id = create_res.data["id"]
        self.assertEqual(create_res.data["question_type"], "CODING")
        self.assertTrue(create_res.data["has_programming_details"])
        self.assertEqual(create_res.data["programming_details"]["allowed_languages"], ["python", "cpp"])
        self.assertEqual(len(create_res.data["programming_details"]["test_cases"]), 2)

        # Edit question via PUT /questions/<pk>/ updating boilerplate and constraints
        edit_res = self.admin_client.put(
            f"/api/csl-admin/questions/{q_id}/",
            {
                "question_type": "CODING",
                "section_type": self.coding_section.code,
                "prompt": "Reverse Linked List v2",
                "difficulty": "HARD",
                "coding_details": {
                    "problem_statement": "Updated statement",
                    "constraints": "1 <= N <= 2*10^5",
                    "input_format": "Array input",
                    "output_format": "Array output",
                    "allowed_languages": ["python"],
                    "boilerplate_code": {"python": "def solve_v2():\n    pass"},
                    "time_limit_seconds": 3.0,
                    "memory_limit_mb": 512,
                    "test_cases": [
                        {
                            "is_public": True,
                            "input_text": "10 20",
                            "expected_output": "20 10",
                            "explanation": "Sample case",
                            "marks_weightage": 2.0,
                        },
                        {
                            "is_public": False,
                            "input_text": "SECRET_HIDDEN_INPUT_V2",
                            "expected_output": "SECRET_HIDDEN_OUTPUT_V2",
                            "marks_weightage": 8.0,
                        },
                    ],
                },
            },
            format="json",
        )
        self.assertEqual(edit_res.status_code, 200, edit_res.data)
        self.assertEqual(edit_res.data["prompt"], "Reverse Linked List v2")
        self.assertEqual(edit_res.data["programming_details"]["constraints"], "1 <= N <= 2*10^5")
        self.assertEqual(edit_res.data["programming_details"]["allowed_languages"], ["python"])

        # Candidate fetching AttemptStateView must receive ONLY sample test cases
        q_obj = QuestionBank.objects.get(id=q_id)
        assessment = Assessment.objects.create(
            code=f"COD_{uuid.uuid4().hex[:5].upper()}",
            title="Coding Security Assessment",
            status=Assessment.Status.OPEN,
            delivery_mode=Assessment.DeliveryMode.CODING,
            duration_minutes=60,
            total_marks=10,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment,
            section=self.coding_section,
            question_count=1,
            marks_per_question=10,
            order=1,
        )
        assessment.eligible_colleges.add(self.college)
        assessment.questions.add(q_obj)

        candidate = self._create_candidate(reg_suffix="COD")
        attempt = start_assessment_for_candidate(candidate, assessment=assessment)
        cand_client = APIClient()
        cand_client.credentials(HTTP_X_ASSESSMENT_TOKEN=generate_candidate_token(candidate.id))

        state_res = cand_client.get(f"/api/assessment/attempts/{attempt.id}/")
        self.assertEqual(state_res.status_code, 200)
        raw_payload = json.dumps(state_res.data)
        self.assertIn("10 20", raw_payload)
        self.assertNotIn("SECRET_HIDDEN_INPUT_V2", raw_payload)
        self.assertNotIn("SECRET_HIDDEN_OUTPUT_V2", raw_payload)


class ExportAppearanceAndSafetyTests(BaseWorkflowRepairTestCase):
    def setUp(self):
        super().setUp()
        self.assessment = Assessment.objects.create(
            code=f"EXP_{uuid.uuid4().hex[:5].upper()}",
            title="Export Styling Exam",
            status=Assessment.Status.OPEN,
            duration_minutes=30,
            total_marks=100,
        )
        # Candidate with formula-like name to verify CSV formula neutralization
        self.cand = Candidate.objects.create(
            full_name="=CMD('calc')",
            register_number=f"EXP001_{uuid.uuid4().hex[:4]}".upper(),
            college=self.college.name,
            college_ref=self.college,
            email=f"exp_{uuid.uuid4().hex[:6]}@college.test",
            department="IT",
            year_of_study="3rd Year",
            is_active=True,
            is_simulation=False,
        )
        self.attempt = AssessmentAttempt.objects.create(
            candidate=self.cand,
            assessment=self.assessment,
            config=self.config,
            state=AssessmentAttempt.State.SUBMITTED,
            snapshot_duration_minutes=30,
            snapshot_total_marks=100,
            aptitude_score=85,
            coding_score=0,
            total_score=85,
            percentage=85.0,
            submitted_at=timezone.now(),
            is_simulation=False,
        )

    def test_config_hex_validation_and_xlsx_uses_saved_appearance(self):
        # Invalid hex must be rejected cleanly with 400
        bad_res = self.admin_client.put(
            "/api/csl-admin/config/",
            {
                "title": self.config.title,
                "duration_minutes": 60,
                "total_marks": 50,
                "aptitude_count": 25,
                "coding_count": 25,
                "max_attempts": 1,
                "export_header_bg_color": "#ZZZZZZ",
            },
            format="json",
        )
        self.assertEqual(bad_res.status_code, 400)

        # Save valid custom XLSX appearance
        thresholds = [
            {"min": 80, "max": 100, "color": "#112233", "label": "Distinction"},
            {"min": 60, "max": 79.99, "color": "#445566", "label": "Merit"},
            {"min": 40, "max": 59.99, "color": "#778899", "label": "Pass"},
            {"min": 0, "max": 39.99, "color": "#AABBCC", "label": "Needs Improvement"},
        ]
        good_res = self.admin_client.put(
            "/api/csl-admin/config/",
            {
                "title": self.config.title,
                "duration_minutes": 60,
                "total_marks": 50,
                "aptitude_count": 25,
                "coding_count": 25,
                "max_attempts": 1,
                "export_header_bg_color": "#1A2B3C",
                "export_header_text_color": "#F0F1F2",
                "export_alt_row_color": "#E1E2E3",
                "enable_alt_row_styling": True,
                "export_score_thresholds": thresholds,
            },
            format="json",
        )
        self.assertEqual(good_res.status_code, 200, good_res.data)

        # Export XLSX and inspect openpyxl fills and fonts
        xlsx_res = self.admin_client.get("/api/csl-admin/candidates/export-advanced/?format=xlsx")
        self.assertEqual(xlsx_res.status_code, 200)
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_res.content))
        ws = wb.active

        # Row 1 header uses saved header bg and text colors
        header_cell = ws.cell(row=1, column=1)
        self.assertEqual(header_cell.fill.start_color.rgb[-6:], "1A2B3C")
        self.assertEqual(header_cell.font.color.rgb[-6:], "F0F1F2")

        # Find Percentage column and check score threshold band fill (#112233 for 85%)
        headers = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
        pct_col_idx = headers.index("Percentage") + 1
        pct_cell = ws.cell(row=2, column=pct_col_idx)
        self.assertEqual(pct_cell.fill.start_color.rgb[-6:], "112233")

        # CSV export remains plain unstyled CSV and neutralizes leading formula chars
        csv_res = self.admin_client.get("/api/csl-admin/candidates/export-advanced/?format=csv")
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("text/csv", csv_res["Content-Type"])
        csv_body = csv_res.content.decode("utf-8")
        self.assertIn("'=CMD('calc')", csv_body)

        # Legacy AdminExportCandidateDataCSVView uses total_score/snapshot_total_marks cleanly
        legacy_csv = self.admin_client.get(
            f"/api/csl-admin/candidates/export-data-csv/?college_id={self.college.id}"
        )
        self.assertEqual(legacy_csv.status_code, 200)
        legacy_text = legacy_csv.content.decode("utf-8")
        self.assertIn("85", legacy_text)


class DriveInlineAndAdminRepairsTests(BaseWorkflowRepairTestCase):
    def test_inline_drive_link_orphan_cleanup_and_reassess_access(self):
        # Inline Drive creation -> link to new assessment
        drive_res = self.admin_client.post(
            "/api/csl-admin/drives/",
            {
                "name": "Inline Drive 2026",
                "code": f"DRV_{uuid.uuid4().hex[:5].upper()}",
                "status": "ACTIVE",
                "visibility": "PUBLIC",
            },
            format="json",
        )
        self.assertEqual(drive_res.status_code, 201, drive_res.data)
        drive_id = drive_res.data["id"]

        # Orphan Drive created then cleaned up cleanly via DELETE /drives/<pk>/
        orphan_res = self.admin_client.post(
            "/api/csl-admin/drives/",
            {
                "name": "Abandoned Wizard Drive",
                "code": f"ORPH_{uuid.uuid4().hex[:5].upper()}",
                "status": "ACTIVE",
                "visibility": "PUBLIC",
            },
            format="json",
        )
        self.assertEqual(orphan_res.status_code, 201)
        orphan_id = orphan_res.data["id"]
        del_res = self.admin_client.delete(f"/api/csl-admin/drives/{orphan_id}/")
        self.assertIn(del_res.status_code, (200, 204))
        self.assertEqual(Drive.objects.get(id=orphan_id).status, Drive.Status.ARCHIVED)

        # Create assessment attached to first inline Drive
        asmt_res = self.admin_client.post(
            "/api/csl-admin/assessments/",
            {
                "code": f"DRV_ASMT_{uuid.uuid4().hex[:5].upper()}",
                "title": "Drive Linked Assessment",
                "duration_minutes": 45,
                "total_marks": 50,
                "aptitude_count": 25,
                "coding_count": 25,
                "drive_ids": [drive_id],
                "is_standalone": False,
            },
            format="json",
        )
        self.assertEqual(asmt_res.status_code, 201, asmt_res.data)
        self.assertTrue(DriveAssessment.objects.filter(drive_id=drive_id, assessment_id=asmt_res.data["id"]).exists())

        # Test AdminStudentAccessReassessView with register_number + action
        cand = self._create_candidate(reg_suffix="REASSESS")
        asmt = Assessment.objects.get(id=asmt_res.data["id"])
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            assessment=asmt,
            config=self.config,
            state=AssessmentAttempt.State.FLAGGED_FOR_REVIEW,
            snapshot_duration_minutes=45,
            snapshot_total_marks=50,
            is_flagged=True,
            is_simulation=False,
        )
        reassess_res = self.admin_client.post(
            "/api/csl-admin/candidates/reassess-access/",
            {"register_number": cand.register_number, "action": "RETRIEVE_ACCESS"},
            format="json",
        )
        self.assertEqual(reassess_res.status_code, 200, reassess_res.data)
        attempt.refresh_from_db()
        self.assertEqual(attempt.state, AssessmentAttempt.State.IN_PROGRESS)


class PoolTypeEnforcementAndImportTests(BaseWorkflowRepairTestCase):
    def setUp(self):
        super().setUp()
        self.mcq_q = QuestionBank.objects.create(
            prompt="MCQ Only Sample?",
            section=self.mcq_section,
            section_type=self.mcq_section.code,
            option_a="A",
            option_b="B",
            option_c="C",
            option_d="D",
            correct_option="A",
            is_active=True,
        )
        self.coding_q = QuestionBank.objects.create(
            prompt="Coding Only Sample",
            section=self.coding_section,
            section_type=self.coding_section.code,
            assessment_type="CODING",
            option_a="N/A (Coding Question)",
            option_b="N/A (Coding Question)",
            option_c="N/A (Coding Question)",
            option_d="N/A (Coding Question)",
            correct_option="A",
            is_active=True,
        )
        prog = ProgrammingQuestion.objects.create(
            question=self.coding_q,
            problem_statement="Print 42",
            allowed_languages=["python"],
        )
        ProgrammingTestCase.objects.create(
            programming_question=prog,
            input_text="",
            expected_output="42",
            is_public=True,
        )

    def test_pool_creation_requires_type_and_rejects_type_change_when_non_empty(self):
        # Missing question_type rejected
        missing_res = self.admin_client.post(
            "/api/csl-admin/question-pools/",
            {"name": "Untyped Pool", "code": f"UNT_{uuid.uuid4().hex[:6].upper()}"},
            format="json",
        )
        self.assertEqual(missing_res.status_code, 400)

        # Create valid MCQ pool
        mcq_pool_res = self.admin_client.post(
            "/api/csl-admin/question-pools/",
            {"name": "Typed MCQ Pool", "question_type": "MCQ"},
            format="json",
        )
        self.assertEqual(mcq_pool_res.status_code, 201, mcq_pool_res.data)
        self.assertEqual(mcq_pool_res.data["question_type"], "MCQ")
        pool_id = mcq_pool_res.data["id"]

        # While empty, type can be changed safely to CODING
        swap_res = self.admin_client.put(
            f"/api/csl-admin/question-pools/{pool_id}/",
            {"question_type": "CODING"},
            format="json",
        )
        self.assertEqual(swap_res.status_code, 200, swap_res.data)
        self.assertEqual(swap_res.data["question_type"], "CODING")

        # Add coding question -> now changing back to MCQ must be blocked (400)
        add_res = self.admin_client.post(
            f"/api/csl-admin/question-pools/{pool_id}/items/",
            {"question_ids": [self.coding_q.id], "action": "add"},
            format="json",
        )
        self.assertEqual(add_res.status_code, 200, add_res.data)
        blocked_res = self.admin_client.put(
            f"/api/csl-admin/question-pools/{pool_id}/",
            {"question_type": "MCQ"},
            format="json",
        )
        self.assertEqual(blocked_res.status_code, 400)

    def test_incompatible_mutations_and_imports_are_rejected(self):
        mcq_pool = QuestionPool.objects.create(name="Strict MCQ Pool", code=f"SMCQ_{uuid.uuid4().hex[:5].upper()}", question_type="MCQ")
        coding_pool = QuestionPool.objects.create(name="Strict Coding Pool", code=f"SCOD_{uuid.uuid4().hex[:5].upper()}", question_type="CODING")

        # 1. Direct creation mismatch
        r1 = self.admin_client.post(
            f"/api/csl-admin/question-pools/{mcq_pool.id}/questions/",
            {
                "prompt": "Bad coding in MCQ pool",
                "question_type": "CODING",
                "coding_details": {"problem_statement": "x", "test_cases": [{"input_text": "1", "expected_output": "1"}]},
            },
            format="json",
        )
        self.assertEqual(r1.status_code, 400)

        r2 = self.admin_client.post(
            f"/api/csl-admin/question-pools/{coding_pool.id}/questions/",
            {
                "prompt": "Bad MCQ in Coding pool",
                "question_type": "MCQ",
                "option_a": "A", "option_b": "B", "option_c": "C", "option_d": "D",
                "correct_option": "A",
            },
            format="json",
        )
        self.assertEqual(r2.status_code, 400)

        # 2. Items endpoint mismatch
        r3 = self.admin_client.post(
            f"/api/csl-admin/question-pools/{mcq_pool.id}/items/",
            {"question_ids": [self.coding_q.id], "action": "add"},
            format="json",
        )
        self.assertEqual(r3.status_code, 400)

        r4 = self.admin_client.post(
            f"/api/csl-admin/question-pools/{coding_pool.id}/items/",
            {"question_ids": [self.mcq_q.id], "action": "add"},
            format="json",
        )
        self.assertEqual(r4.status_code, 400)

        # 3. Bulk assign mismatch
        r5 = self.admin_client.post(
            "/api/csl-admin/questions/bulk-assign-pool/",
            {"question_ids": [self.mcq_q.id], "pool_ids": [str(coding_pool.id)]},
            format="json",
        )
        self.assertEqual(r5.status_code, 400)

        # 4. CSV import into Coding pool rejected
        r6 = self.admin_client.post(
            f"/api/csl-admin/question-pools/{coding_pool.id}/import-preview/",
            {"csv_content": "prompt,option_a,option_b,option_c,option_d,correct_option\nQ1,1,2,3,4,A"},
            format="json",
        )
        self.assertEqual(r6.status_code, 400)

        # 5. Coding JSON import into MCQ pool rejected (both preview and commit)
        r7 = self.admin_client.post(
            f"/api/csl-admin/questions/import-coding-json/?pool_id={mcq_pool.id}",
            {
                "pool_id": str(mcq_pool.id),
                "questions": [{
                    "title": "Blocked Coding",
                    "problem_statement": "Print 1",
                    "test_cases": [{"input_text": "", "expected_output": "1", "is_public": True}],
                }],
            },
            format="json",
        )
        self.assertEqual(r7.status_code, 400)

        # 6. Silent type flip on edit rejected
        r8 = self.admin_client.put(
            f"/api/csl-admin/questions/{self.mcq_q.id}/",
            {"question_type": "CODING"},
            format="json",
        )
        self.assertEqual(r8.status_code, 400)

    def test_mixed_legacy_pool_reconciliation_preserves_question_bank(self):
        legacy_pool = QuestionPool.objects.create(
            name="Legacy Mixed Pool",
            code=f"MIX_{uuid.uuid4().hex[:5].upper()}",
            question_type=None,
        )
        QuestionPoolItem.objects.create(pool=legacy_pool, question=self.mcq_q, order=1)
        QuestionPoolItem.objects.create(pool=legacy_pool, question=self.coding_q, order=2)

        detail = self.admin_client.get(f"/api/csl-admin/question-pools/{legacy_pool.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.data["is_mixed"])
        self.assertEqual(detail.data["pool_health"], "MIXED_TYPES")

        # Cannot simply PUT question_type=CODING while MCQ remains inside
        fail_put = self.admin_client.put(
            f"/api/csl-admin/question-pools/{legacy_pool.id}/",
            {"question_type": "CODING"},
            format="json",
        )
        self.assertEqual(fail_put.status_code, 400)

        # Reconcile as CODING -> detaches MCQ link without deleting QuestionBank
        rec_res = self.admin_client.post(
            f"/api/csl-admin/question-pools/{legacy_pool.id}/reconcile/",
            {"target_type": "CODING", "detach_incompatible": True},
            format="json",
        )
        self.assertEqual(rec_res.status_code, 200, rec_res.data)
        self.assertEqual(rec_res.data["detached_count"], 1)
        self.assertEqual(rec_res.data["pool"]["question_type"], "CODING")
        self.assertEqual(rec_res.data["pool"]["questions_count"], 1)
        self.assertTrue(QuestionBank.objects.filter(id=self.mcq_q.id).exists())
