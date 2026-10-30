import uuid
import json
import io
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User
from apps.assessments.models import (
    College,
    Candidate,
    Assessment,
    AssessmentConfig,
    AssessmentSection,
    AssessmentSectionAllocation,
    QuestionBank,
    AssessmentAttempt,
    IntegrityEvent,
    AssessmentAuditLog,
    normalize_college_name,
)
from apps.assessments.services import (
    resolve_or_create_college,
    finalize_assessment_attempt,
    get_or_create_default_config,
)
from apps.assessments.admin_serializers import (
    AdminAssessmentCreateUpdateSerializer,
    AdminAssessmentListSerializer,
    AdminCollegeListSerializer,
    AdminCandidateSerializer,
)


class Phase2DynamicAssessmentTests(TestCase):
    def setUp(self):
        # Admin user
        self.admin_user = User.objects.create_superuser(
            username="phase2_admin",
            email="admin_phase2@csl.internal",
            password="adminpassword123",
            role=User.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)

        # Standard reusable sections (seeded by migration or created)
        self.sec_apt, _ = AssessmentSection.objects.get_or_create(code="APTITUDE", defaults={"name": "Aptitude", "order": 1})
        self.sec_cod, _ = AssessmentSection.objects.get_or_create(code="CODING", defaults={"name": "Coding Fundamentals", "order": 2})
        self.sec_db, _ = AssessmentSection.objects.get_or_create(code="DB_DESIGN", defaults={"name": "Database Design", "order": 3})

        self.config = get_or_create_default_config()

        # College
        self.college = College.objects.create(
            name="PSG College of Technology",
            code="PSGTECH",
            location="Coimbatore",
            aliases=["PSG", "PSG Tech"],
            is_verified=True,
        )

        # Questions in bank
        self._populate_bank_questions(self.sec_apt, count=10)
        self._populate_bank_questions(self.sec_cod, count=10)
        self._populate_bank_questions(self.sec_db, count=10)

    def _populate_bank_questions(self, section, count):
        for i in range(count):
            QuestionBank.objects.create(
                prompt=f"Question {i+1} for {section.name}",
                section=section,
                section_type=section.code,
                option_a="A",
                option_b="B",
                option_c="C",
                option_d="D",
                correct_option="A",
                difficulty=QuestionBank.Difficulty.MEDIUM,
                is_active=True,
            )

    # ==========================================
    # Workstream A: Assessment Editing & Validation
    # ==========================================
    def test_assessment_creation_and_auto_total_marks_sync(self):
        """Creating an assessment with sections auto-calculates total marks."""
        payload = {
            "code": "TEST-DYN-01",
            "title": "3-Section Diagnostic",
            "duration_minutes": 90,
            "sections": [
                {"section_id": self.sec_apt.id, "question_count": 5, "marks_per_question": 1},
                {"section_id": self.sec_cod.id, "question_count": 5, "marks_per_question": 2},
                {"section_id": self.sec_db.id, "question_count": 5, "marks_per_question": 1},
            ],
        }
        serializer = AdminAssessmentCreateUpdateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        assessment = serializer.save()

        # 5*1 + 5*2 + 5*1 = 20
        self.assertEqual(assessment.total_marks, 20)
        self.assertEqual(assessment.section_allocations.count(), 3)

    def test_assessment_patch_without_sections_preserves_allocations(self):
        """Updating duration or title without passing 'sections' must not fail or revert marks."""
        assessment = Assessment.objects.create(
            code="TEST-PATCH-01",
            title="Initial Title",
            duration_minutes=60,
            total_marks=20,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment, section=self.sec_apt, question_count=10, marks_per_question=2
        )

        # PATCH title only
        serializer = AdminAssessmentCreateUpdateSerializer(
            instance=assessment, data={"title": "Updated Title"}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        self.assertEqual(updated.title, "Updated Title")
        self.assertEqual(updated.total_marks, 20)
        self.assertEqual(updated.section_allocations.count(), 1)

    def test_insufficient_questions_blocks_ready_status(self):
        """Marking assessment READY when QuestionBank lacks required count raises validation error."""
        assessment = Assessment.objects.create(
            code="TEST-INSUFF-01",
            title="Needs 50 Questions",
            duration_minutes=60,
            total_marks=50,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment, section=self.sec_db, question_count=50, marks_per_question=1
        )

        from apps.assessments.services import prepare_assessment
        from rest_framework.exceptions import ValidationError as DRFValidationError
        with self.assertRaises((ValidationError, DRFValidationError)) as cm:
            prepare_assessment(assessment, user=self.admin_user)
        self.assertTrue("Insufficient questions" in str(cm.exception) or "bank_error" in str(cm.exception))

    def test_cannot_modify_sections_when_attempts_active(self):
        """Cannot reconfigure section allocations if candidate attempts are in progress."""
        assessment = Assessment.objects.create(
            code="TEST-ACTIVE-01",
            title="Active Assessment",
            duration_minutes=60,
            total_marks=10,
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment, section=self.sec_apt, question_count=10, marks_per_question=1
        )
        cand = Candidate.objects.create(
            full_name="Active Student", register_number="REG100", email="act@psg.edu", college="PSG"
        )
        AssessmentAttempt.objects.create(
            candidate=cand,
            assessment=assessment,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
        )

        serializer = AdminAssessmentCreateUpdateSerializer(
            instance=assessment,
            data={
                "sections": [{"section_id": self.sec_cod.id, "question_count": 10, "marks_per_question": 1}]
            },
            partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("sections", serializer.errors)
        self.assertIn("Cannot reconfigure sections while", serializer.errors["sections"][0])

    # ==========================================
    # Workstream B: Dynamic Section Scoring
    # ==========================================
    def test_dynamic_section_scoring_breakdown(self):
        """Finalizing an attempt produces complete per-section breakdown in section_scores."""
        assessment = Assessment.objects.create(
            code="TEST-SCORE-01",
            title="3-Section Scoring Test",
            duration_minutes=60,
            total_marks=7,  # 2*1 + 2*2 + 1*1 = 7
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment, section=self.sec_apt, question_count=2, marks_per_question=1
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment, section=self.sec_cod, question_count=2, marks_per_question=2
        )
        AssessmentSectionAllocation.objects.create(
            assessment=assessment, section=self.sec_db, question_count=1, marks_per_question=1
        )

        cand = Candidate.objects.create(
            full_name="Scoring Student", register_number="REG200", email="score@psg.edu", college="PSG"
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            assessment=assessment,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=10),
            deadline=timezone.now() + timedelta(minutes=50),
        )

        from apps.assessments.models import AttemptQuestionSnapshot
        q_apt = QuestionBank.objects.filter(section=self.sec_apt).first()
        q_cod = QuestionBank.objects.filter(section=self.sec_cod).first()
        q_db = QuestionBank.objects.filter(section=self.sec_db).first()

        # Create snapshots: correct for apt and cod, incorrect for db
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=q_apt,
            question_order=1,
            section_type="APTITUDE",
            prompt="Prompt Apt",
            option_a_text="A", option_b_text="B", option_c_text="C", option_d_text="D",
            correct_option_key="A",
            selected_option="A",  # Correct (1 mark)
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=q_cod,
            question_order=2,
            section_type="CODING",
            prompt="Prompt Cod",
            option_a_text="A", option_b_text="B", option_c_text="C", option_d_text="D",
            correct_option_key="B",
            selected_option="B",  # Correct (2 marks)
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=q_db,
            question_order=3,
            section_type="DB_DESIGN",
            prompt="Prompt DB",
            option_a_text="A", option_b_text="B", option_c_text="C", option_d_text="D",
            correct_option_key="C",
            selected_option="D",  # Incorrect (0 marks)
        )

        finalized = finalize_assessment_attempt(attempt)
        self.assertEqual(finalized.state, AssessmentAttempt.State.SUBMITTED)
        self.assertEqual(finalized.aptitude_score, 1)
        self.assertEqual(finalized.coding_score, 2)
        self.assertEqual(finalized.total_score, 3)

        # Inspect dynamic section_scores
        scores = finalized.section_scores
        self.assertIn("APTITUDE", scores)
        self.assertIn("CODING", scores)
        self.assertIn("DB_DESIGN", scores)

        self.assertEqual(scores["APTITUDE"]["score"], 1)
        self.assertEqual(scores["APTITUDE"]["correct"], 1)
        self.assertEqual(scores["CODING"]["score"], 2)
        self.assertEqual(scores["CODING"]["correct"], 1)
        self.assertEqual(scores["DB_DESIGN"]["score"], 0)
        self.assertEqual(scores["DB_DESIGN"]["correct"], 0)

    # ==========================================
    # Workstream C: Question Bank CSV Import
    # ==========================================
    def test_csv_import_without_assessment_id(self):
        """CSV import without assessment_id populates the reusable QuestionBank directly."""
        csv_data = (
            "prompt,section_type,difficulty,option_a,option_b,option_c,option_d,correct_option,explanation\n"
            "What is an index?,DB_DESIGN,MEDIUM,Index A,Index B,Index C,Index D,A,Database index\n"
            "What is a pointer?,C_LANGUAGE,EASY,Ptr A,Ptr B,Ptr C,Ptr D,B,Pointer expl\n"
        )
        res = self.client.post(
            "/api/csl-admin/questions/import-csv/",
            {"csv_content": csv_data},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["success_count"], 2)
        self.assertEqual(res.data["imported_to"], "QUESTION_BANK")
        self.assertIsNone(res.data["assessment_id"])

        # Auto-created section for custom C_LANGUAGE
        self.assertTrue(AssessmentSection.objects.filter(code="C_LANGUAGE").exists())
        self.assertTrue(QuestionBank.objects.filter(prompt="What is an index?").exists())

    # ==========================================
    # Workstream D: College Resolution & Merge
    # ==========================================
    def test_college_resolution_and_alias_matching(self):
        """Matches normalized name and aliases without creating duplicate records."""
        # 1. Alias match
        col1 = resolve_or_create_college("psg tech")
        self.assertEqual(col1.id, self.college.id)

        # 2. Normalized name match with punctuation/spacing
        col2 = resolve_or_create_college("  P.S.G. College of Technology! ")
        self.assertEqual(col2.id, self.college.id)

        # 3. New student entry marked provisional
        col3 = resolve_or_create_college("Sri Krishna College", is_student_entry=True)
        self.assertFalse(col3.is_verified)
        self.assertTrue(col3.is_active)

    def test_college_merge_action(self):
        """Merging duplicate provisional college updates candidates and adds alias."""
        provisional = College.objects.create(
            name="PSG College of Engg",
            code="PSGCE",
            is_verified=False,
        )
        cand = Candidate.objects.create(
            full_name="Merge Cand",
            register_number="M100",
            email="mcand@psg.edu",
            college_ref=provisional,
            college=provisional.name,
        )

        res = self.client.post(
            f"/api/csl-admin/colleges/{provisional.id}/merge/",
            {"target_college_id": self.college.id},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        cand.refresh_from_db()
        self.assertEqual(cand.college_ref_id, self.college.id)
        self.assertEqual(cand.college, self.college.name)

        # Verify source deleted and aliases updated
        self.assertFalse(College.objects.filter(id=provisional.id).exists())
        self.college.refresh_from_db()
        self.assertIn("PSG College of Engg", self.college.aliases)

    # ==========================================
    # Workstream E: Attempt Lifecycle & Revocation
    # ==========================================
    def test_attempt_revocation_endpoint(self):
        """Admin can revoke an attempt with audit logging."""
        cand = Candidate.objects.create(
            full_name="Revoke Cand", register_number="REV100", email="rev@psg.edu", college="PSG"
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
        )

        res = self.client.post(
            f"/api/csl-admin/attempts/{attempt.id}/revoke/",
            {"reason": "Caught using external device."},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        attempt.refresh_from_db()
        self.assertEqual(attempt.state, AssessmentAttempt.State.REVOKED)
        self.assertIn("Caught using external device.", attempt.flag_reason)

        # Verify audit log
        self.assertTrue(
            AssessmentAuditLog.objects.filter(
                action=AssessmentAuditLog.Action.ATTEMPT_REVOKED,
                entity_id=str(attempt.id),
            ).exists()
        )

    # ==========================================
    # Workstream F: Integrity Event & Flood Protection
    # ==========================================
    def test_integrity_event_rate_limiting(self):
        """Integrity event endpoint throttles when client floods > 30 events in 60s."""
        cand = Candidate.objects.create(
            full_name="Flood Cand", register_number="FL100", email="flood@psg.edu", college="PSG"
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
        )

        # Pre-seed 30 events in the last minute
        for i in range(30):
            IntegrityEvent.objects.create(
                attempt=attempt,
                event_type=IntegrityEvent.EventType.WINDOW_BLUR,
                server_timestamp=timezone.now(),
            )

        client_student = APIClient()
        # Authenticate student attempt token
        from apps.assessments.tokens import generate_candidate_token
        token = generate_candidate_token(str(cand.id), str(attempt.id))
        client_student.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        res = client_student.post(
            f"/api/assessment/attempts/{attempt.id}/integrity-event/",
            {"event_type": "WINDOW_BLUR"},
        )
        self.assertEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
