import json
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.assessments.models import (
    College,
    Candidate,
    Assessment,
    AssessmentConfig,
    AssessmentSection,
    QuestionBank,
    AssessmentAttempt,
    AttemptQuestionSnapshot,
)

User = get_user_model()


class Phase21WorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin, _ = User.objects.get_or_create(
            username="admin@csl.com",
            defaults={"email": "admin@csl.com", "is_superuser": True, "is_staff": True},
        )
        self.admin.set_password("adminpassword123")
        self.admin.save()
        self.client.force_authenticate(user=self.admin)

        self.config, _ = AssessmentConfig.objects.get_or_create(
            id=1,
            defaults={"title": "Default Assessment Config", "duration_minutes": 60},
        )

        self.section_apt, _ = AssessmentSection.objects.get_or_create(
            code="APTITUDE",
            defaults={"name": "Aptitude", "is_active": True},
        )
        self.section_cod, _ = AssessmentSection.objects.get_or_create(
            code="CODING",
            defaults={"name": "Coding", "is_active": True},
        )

        self.college, _ = College.objects.get_or_create(
            code="PSGTECH",
            defaults={
                "name": "PSG College of Technology",
                "district": "Coimbatore",
                "city": "Coimbatore",
                "institution_type": "Engineering",
                "affiliation": "Anna University",
            },
        )

        self.candidate, _ = Candidate.objects.get_or_create(
            register_number="710021104001",
            defaults={
                "full_name": "Anand Kumar",
                "college": "PSG College of Technology",
                "college_ref": self.college,
                "email": "anand@psgtech.ac.in",
                "phone_number": "9876543210",
                "department": "CSE",
                "year_of_study": "3rd Year",
            },
        )

    # =========================================================================
    # Workstream 1: Independent Question Bank
    # =========================================================================
    def test_independent_question_creation_and_archiving(self):
        """Questions exist independently, support marks, and can be archived/unarchived."""
        res = self.client.post("/api/csl-admin/questions/", {
            "prompt": "What is the worst-case time complexity of QuickSort?",
            "section_type": "CODING",
            "difficulty": "MEDIUM",
            "marks": 2,
            "option_a": "O(N)",
            "option_b": "O(N log N)",
            "option_c": "O(N^2)",
            "option_d": "O(1)",
            "correct_option": "C",
            "explanation": "When the partition is unbalanced, QuickSort degrades to O(N^2).",
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        q_id = res.data["id"]
        self.assertEqual(res.data["marks"], 2)
        self.assertFalse(res.data["is_archived"])

        # Archive question
        arc_res = self.client.post(f"/api/csl-admin/questions/{q_id}/archive/", {"archive": True})
        self.assertEqual(arc_res.status_code, status.HTTP_200_OK)
        self.assertTrue(arc_res.data["is_archived"])

        # Question shows as archived in DB
        q = QuestionBank.objects.get(id=q_id)
        self.assertTrue(q.is_archived)

        # Unarchive
        unarc_res = self.client.post(f"/api/csl-admin/questions/{q_id}/archive/", {"archive": False})
        self.assertEqual(unarc_res.status_code, status.HTTP_200_OK)
        self.assertFalse(unarc_res.data["is_archived"])

    def test_safe_deletion_prevented_for_referenced_questions(self):
        """Questions referenced in candidate attempt snapshots cannot be permanently deleted."""
        q = QuestionBank.objects.create(
            prompt="Immutable question in attempt snapshot",
            section_type="APTITUDE",
            difficulty="EASY",
            option_a="1",
            option_b="2",
            option_c="3",
            option_d="4",
            correct_option="A",
        )
        assessment = Assessment.objects.create(
            code="SAFE-DEL",
            title="Safe Deletion Test",
            duration_minutes=30,
            status=Assessment.Status.OPEN,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=self.candidate,
            assessment=assessment,
            config=self.config,
            state=AssessmentAttempt.State.SUBMITTED,
        )
        AttemptQuestionSnapshot.objects.create(
            attempt=attempt,
            question=q,
            question_order=1,
            section_type=q.section_type,
        )

        self.assertFalse(q.can_be_deleted)

        # Deleting should safely archive/deactivate instead of hard deleting
        del_res = self.client.delete(f"/api/csl-admin/questions/{q.id}/")
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertTrue(del_res.data["archived"])
        self.assertFalse(del_res.data["deleted"])
        q.refresh_from_db()
        self.assertTrue(q.is_archived)

    # =========================================================================
    # Workstream 2: Assessment-First Architecture (No College Dependency)
    # =========================================================================
    def test_assessment_create_prepare_open_without_colleges(self):
        """Assessments can be created, prepared, and opened without any assigned colleges."""
        res = self.client.post("/api/csl-admin/assessments/", {
            "code": "COLLEGE-FREE",
            "title": "Autonomous Assessment",
            "duration_minutes": 45,
            "total_marks": 5,
            "sections": [
                {"section_id": self.section_apt.id, "question_count": 5, "marks_per_question": 1},
            ],
            "eligible_college_ids": [],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        assessment_id = res.data["id"]

        # Add 5 questions to pool
        for i in range(5):
            QuestionBank.objects.create(
                prompt=f"Aptitude Question {i}",
                section=self.section_apt,
                section_type="APTITUDE",
                difficulty="MEDIUM",
                option_a="A",
                option_b="B",
                option_c="C",
                option_d="D",
                correct_option="A",
            )
        assessment = Assessment.objects.get(id=assessment_id)
        assessment.questions.set(QuestionBank.objects.filter(section=self.section_apt))

        # Prepare assessment without colleges
        prep_res = self.client.post(f"/api/csl-admin/assessments/{assessment_id}/prepare/")
        self.assertEqual(prep_res.status_code, status.HTTP_200_OK)
        self.assertEqual(prep_res.data["status"], "READY")

        # Open assessment without colleges
        open_res = self.client.post(f"/api/csl-admin/assessments/{assessment_id}/open/")
        self.assertEqual(open_res.status_code, status.HTTP_200_OK)
        self.assertEqual(open_res.data["status"], "OPEN")
        assessment.refresh_from_db()
        self.assertTrue(assessment.is_currently_open())

    def test_direct_candidate_assignment_to_assessment(self):
        """Admin can directly assign specific candidates to an assessment."""
        assessment = Assessment.objects.create(
            code="DIRECT-CAND",
            title="Direct Assignment Assessment",
            duration_minutes=30,
        )
        res = self.client.post(f"/api/csl-admin/assessments/{assessment.id}/assign-candidates/", {
            "candidate_ids": [str(self.candidate.id)],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["assigned_count"], 1)
        self.assertTrue(assessment.eligible_candidates.filter(id=self.candidate.id).exists())

    # =========================================================================
    # Workstream 3: Two-Step Explicit Section Mapping
    # =========================================================================
    def test_two_step_csv_preview_and_explicit_mapping(self):
        """Preview detects sections, and confirmation strictly maps them without silent auto-creation."""
        csv_data = (
            "prompt,section_type,difficulty,option_a,option_b,option_c,option_d,correct_option,marks\n"
            "Question 1,RAW_SEC_A,EASY,A,B,C,D,A,1\n"
            "Question 2,RAW_SEC_B,HARD,A,B,C,D,B,2\n"
        )
        # Step 1: Preview
        prev_res = self.client.post("/api/csl-admin/questions/import-preview/", {
            "csv_content": csv_data,
        })
        self.assertEqual(prev_res.status_code, status.HTTP_200_OK)
        self.assertEqual(prev_res.data["total_rows"], 2)
        codes = [s["code"] for s in prev_res.data["detected_sections"]]
        self.assertIn("RAW_SEC_A", codes)
        self.assertIn("RAW_SEC_B", codes)

        # Step 2: Confirm with explicit mapping rule (map RAW_SEC_A to Aptitude, create RAW_SEC_B)
        mapping_rules = {
            "RAW_SEC_A": {"action": "map", "target_section_id": self.section_apt.id},
            "RAW_SEC_B": {"action": "create", "target_section_name": "Raw Section B (Created)"},
        }
        imp_res = self.client.post("/api/csl-admin/questions/import-csv/", {
            "csv_content": csv_data,
            "section_mapping": json.dumps(mapping_rules),
        })
        self.assertEqual(imp_res.status_code, status.HTTP_200_OK)
        self.assertEqual(imp_res.data["success_count"], 2)

        # Verify Q1 was mapped to Aptitude section
        q1 = QuestionBank.objects.get(prompt="Question 1")
        self.assertEqual(q1.section.code, self.section_apt.code)

        # Verify RAW_SEC_B section was explicitly created
        self.assertTrue(AssessmentSection.objects.filter(code="RAW_SEC_B").exists())

    # =========================================================================
    # Workstream 4: Student One-Time Interrupted Attempt Recovery
    # =========================================================================
    def test_student_one_time_self_service_recovery(self):
        """Interrupted active attempt can be recovered with reg number + email; 2nd attempt is blocked."""
        assessment = Assessment.objects.create(
            code="RECOVER-TEST",
            title="Recovery Assessment",
            duration_minutes=60,
            status=Assessment.Status.OPEN,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=self.candidate,
            assessment=assessment,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
        )

        student_client = APIClient()
        rec_res = student_client.post("/api/assessment/recover/", {
            "register_number": self.candidate.register_number,
            "verification_factor": self.candidate.email,
        })
        self.assertEqual(rec_res.status_code, status.HTTP_200_OK)
        self.assertEqual(rec_res.data["attempt_id"], str(attempt.id))
        self.assertEqual(rec_res.data["recovery_count"], 1)

        attempt.refresh_from_db()
        self.assertEqual(attempt.recovery_count, 1)

        # Attempting a second self-service recovery must be rejected with 403
        rec2_res = student_client.post("/api/assessment/recover/", {
            "register_number": self.candidate.register_number,
            "verification_factor": self.candidate.phone_number,
        })
        self.assertEqual(rec2_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("exhausted", rec2_res.data["detail"])

    # =========================================================================
    # Workstream 5: Admin Recovery Grant & Reassignment
    # =========================================================================
    def test_admin_grant_recovery_and_reassignment(self):
        """Admin can grant an extra recovery and authorize a genuinely new reassigned attempt."""
        assessment = Assessment.objects.create(
            code="ADMIN-REC",
            title="Admin Recovery Assessment",
            duration_minutes=60,
            status=Assessment.Status.OPEN,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=self.candidate,
            assessment=assessment,
            config=self.config,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            recovery_count=1,
        )

        grant_res = self.client.post(f"/api/csl-admin/attempts/{attempt.id}/grant-recovery/", {
            "reason": "Campus electrical surge caused workstation reboot",
        })
        self.assertEqual(grant_res.status_code, status.HTTP_200_OK)
        self.assertTrue(grant_res.data["admin_recovery_granted"])

        # Student recovers again
        student_client = APIClient()
        rec_res = student_client.post("/api/assessment/recover/", {
            "register_number": self.candidate.register_number,
            "verification_factor": self.candidate.email,
        })
        self.assertEqual(rec_res.status_code, status.HTTP_200_OK)
        attempt.refresh_from_db()
        self.assertEqual(attempt.recovery_count, 2)

        # Admin Reassignment (genuinely new attempt)
        attempt.state = AssessmentAttempt.State.SUBMITTED
        attempt.save()

        reassign_res = self.client.post(f"/api/csl-admin/candidates/{self.candidate.id}/reassign/", {
            "reason": "Retake authorized due to severe medical emergency during first sitting",
            "assessment_id": str(assessment.id),
        })
        self.assertEqual(reassign_res.status_code, status.HTTP_200_OK)
        self.assertIn("Successfully authorized new attempt", reassign_res.data["message"])

        attempt.refresh_from_db()
        self.assertTrue(attempt.is_reassigned)

    # =========================================================================
    # Workstream 6 & 10: TN College Directory & Clear Cache
    # =========================================================================
    def test_tamil_nadu_directory_import_and_cache_clear(self):
        """Directory import accepts verified TN colleges with district and city; cache clear operates."""
        csv_directory = (
            "code,name,district,city,institution_type,affiliation,website\n"
            "CIT_CBE,Coimbatore Institute of Technology,Coimbatore,Coimbatore,Engineering,Anna University,https://www.cit.edu.in\n"
            "GCT_CBE,Government College of Technology,Coimbatore,Coimbatore,Engineering,Anna University,https://gct.ac.in\n"
        )
        dir_res = self.client.post("/api/csl-admin/colleges/import-directory/", {
            "csv_content": csv_directory,
        })
        self.assertEqual(dir_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dir_res.data["created_count"], 2)
        self.assertTrue(College.objects.filter(code="CIT_CBE", district="Coimbatore").exists())

        # Clear Cache API (Workstream 10)
        cache_res = self.client.post("/api/csl-admin/system/clear-cache/")
        self.assertEqual(cache_res.status_code, status.HTTP_200_OK)
        self.assertIn("timestamp", cache_res.data)
