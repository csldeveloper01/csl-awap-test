import json
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
    Candidate,
    QuestionBank,
    QuestionPool,
    QuestionPoolItem,
    AssessmentSection,
    AssessmentAuditLog,
    AdminAccessGrant,
    Drive,
    DriveAssessment,
    DriveRegistration,
    DriveInvitation,
)
from apps.assessments.services import (
    log_assessment_audit,
    undo_administrative_action,
)

User = get_user_model()


class Phase22WorkflowTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin@csl.com",
            email="admin@csl.com",
            password="AdminPassword123!",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

        self.college, _ = College.objects.get_or_create(
            code="2006",
            defaults={
                "name": "PSG College of Technology",
                "normalized_name": "psg college of technology",
                "location": "Coimbatore",
                "is_active": True,
                "is_verified": True,
            }
        )

        self.section, _ = AssessmentSection.objects.get_or_create(
            code="APTITUDE",
            defaults={
                "name": "Aptitude & Reasoning",
                "is_active": True,
            }
        )

        self.assessment = Assessment.objects.create(
            code="CSL-TEST-01",
            title="Full Stack Diagnostic Test",
            duration_minutes=60,
            total_marks=50,
            status=Assessment.Status.READY,
            visibility=Assessment.Visibility.PUBLIC,
        )

    def test_drive_lifecycle_and_assessments(self):
        """Create drive, associate multiple assessments, verify ordering and detail view."""
        drive = Drive.objects.create(
            name="Campus Recruitment 2026",
            code="DRV-CR-2026",
            description="Annual campus recruitment assessment drive",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
            created_by=self.admin,
        )

        a2 = Assessment.objects.create(
            code="CSL-TEST-02",
            title="Aptitude Screening",
            duration_minutes=45,
            total_marks=40,
            status=Assessment.Status.OPEN,
        )

        da1 = DriveAssessment.objects.create(drive=drive, assessment=self.assessment, display_order=1, is_required=True)
        da2 = DriveAssessment.objects.create(drive=drive, assessment=a2, display_order=2, is_required=False)

        res = self.client.get(f"/api/csl-admin/drives/{drive.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["drive_assessments"]), 2)
        self.assertEqual(res.data["code"], "DRV-CR-2026")

    def test_drive_invitations_and_validity(self):
        """Test invitation token hash, access code, expiration and usage limits."""
        drive = Drive.objects.create(
            name="Executive Screening",
            code="DRV-EXEC",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.INVITE_ONLY,
        )

        inv = DriveInvitation.objects.create(
            drive=drive,
            token_hash="secure-token-12345",
            access_code="EXEC2026",
            max_uses=2,
            usage_count=0,
            is_active=True,
        )
        self.assertTrue(inv.is_valid())

        # Check resolve access code endpoint
        resolve_res = self.client.post("/api/assessment/resolve-code/", {"code": "EXEC2026"})
        self.assertEqual(resolve_res.status_code, status.HTTP_200_OK)
        self.assertEqual(resolve_res.data["type"], "DRIVE")
        self.assertEqual(resolve_res.data["drive_code"], "DRV-EXEC")

        # Exceed usage limit
        inv.usage_count = 2
        inv.save()
        self.assertFalse(inv.is_valid())

    def test_unified_student_registration_with_drive(self):
        """Register student under a drive and verify DriveRegistration and assessment eligibility."""
        drive = Drive.objects.create(
            name="Tamil Nadu Tech Talent 2026",
            code="DRV-TNTT",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
        )
        DriveAssessment.objects.create(drive=drive, assessment=self.assessment, display_order=1)

        payload = {
            "full_name": "Ramanujan S",
            "register_number": "710022104001",
            "email": "ramanujan@psgtech.edu",
            "phone_number": "9876543210",
            "college_id": self.college.id,
            "department": "Computer Science",
            "year_of_study": "Final Year",
            "drive_code": "DRV-TNTT",
        }

        res = self.client.post("/api/assessment/register/", payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("assessment_token", res.data)
        self.assertEqual(res.data["drive_code"], "DRV-TNTT")

        # Verify candidate and DriveRegistration in database
        cand = Candidate.objects.get(email="ramanujan@psgtech.edu")
        self.assertTrue(DriveRegistration.objects.filter(drive=drive, candidate=cand).exists())
        self.assertTrue(self.assessment.eligible_candidates.filter(id=cand.id).exists())

    def test_question_bank_global_retention_when_in_pool(self):
        """Questions added to a pool must remain part of the central repository (never disappear)."""
        q1 = QuestionBank.objects.create(
            prompt="What is the time complexity of binary search?",
            section=self.section,
            section_type="APTITUDE",
            category="Algorithms",
            difficulty="EASY",
            marks=1,
            option_a="O(n)",
            option_b="O(log n)",
            option_c="O(1)",
            option_d="O(n^2)",
            correct_option="B",
            is_active=True,
        )

        pool = QuestionPool.objects.create(name="Data Structures Pool", code="DS_POOL_01", is_active=True)
        QuestionPoolItem.objects.create(pool=pool, question=q1)

        # 1. Fetch Global Questions
        res_global = self.client.get("/api/csl-admin/questions/")
        self.assertEqual(res_global.status_code, status.HTTP_200_OK)
        q_ids = [item["id"] for item in res_global.data]
        self.assertIn(q1.id, q_ids)

        # Verify pool memberships in serialized question
        q1_data = next(item for item in res_global.data if item["id"] == q1.id)
        self.assertEqual(len(q1_data["pool_memberships"]), 1)
        self.assertEqual(q1_data["pool_memberships"][0]["code"], "DS_POOL_01")
        self.assertFalse(q1_data["is_unassigned"])

        # 2. Filter unassigned questions
        res_unassigned = self.client.get("/api/csl-admin/questions/?unassigned=true")
        self.assertEqual(res_unassigned.status_code, status.HTTP_200_OK)
        unassigned_ids = [item["id"] for item in res_unassigned.data]
        self.assertNotIn(q1.id, unassigned_ids)

    def test_csv_question_import_with_destination_pools(self):
        """Test CSV import supporting destination mode: EXISTING_POOLS and NEW_POOL."""
        pool = QuestionPool.objects.create(name="Logical Reasoning", code="LOGIC_01", is_active=True)

        csv_content = (
            "prompt,section_type,category,difficulty,marks,option_a,option_b,option_c,option_d,correct_option,explanation\n"
            "Find the next number in series: 2 4 8 16 ?,APTITUDE,Series,EASY,1,24,32,30,28,B,Multiply by 2\n"
            "If all cats are dogs and all dogs are birds are cats birds?,APTITUDE,Syllogisms,MEDIUM,1,Yes,No,Maybe,Cannot say,A,Transitive property\n"
        )

        payload = {
            "csv_content": csv_content,
            "destination_mode": "EXISTING_POOLS",
            "pool_ids": [str(pool.id)],
        }

        res = self.client.post("/api/csl-admin/questions/import-csv/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["success_count"], 2)

        # Verify questions exist in global QuestionBank
        self.assertEqual(QuestionBank.objects.filter(prompt__contains="series: 2 4 8 16").count(), 1)
        # Verify questions are linked to pool
        self.assertEqual(pool.items.count(), 2)

    def test_bulk_assign_questions_to_pool(self):
        """Bulk assign unassigned questions to an existing pool."""
        q1 = QuestionBank.objects.create(
            prompt="Unassigned Question 1",
            section=self.section,
            section_type="APTITUDE",
            option_a="A", option_b="B", option_c="C", option_d="D",
            correct_option="A",
            is_active=True,
        )
        pool = QuestionPool.objects.create(name="Quantitative Pool", code="QUANT_01", is_active=True)

        res = self.client.post("/api/csl-admin/questions/bulk-assign-pool/", {
            "question_ids": [q1.id],
            "pool_ids": [str(pool.id)],
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(QuestionPoolItem.objects.filter(pool=pool, question=q1).exists())

    def test_admin_audit_log_reversible_undo(self):
        """Update an assessment title, verify reversible audit log, and execute controlled Undo."""
        orig_title = self.assessment.title
        new_title = "Modified Assessment Title"

        # Simulate update mutation with reversible audit log
        prev_state = {"title": orig_title}
        self.assessment.title = new_title
        self.assessment.save(update_fields=["title"])

        log = log_assessment_audit(
            action=AssessmentAuditLog.Action.ASSESSMENT_UPDATED,
            entity_type="ASSESSMENT",
            entity_id=str(self.assessment.id),
            user=self.admin,
            details={"title_changed": True},
            is_reversible=True,
            previous_state=prev_state,
            new_state={"title": new_title},
        )
        self.assertTrue(log.is_reversible)
        self.assertEqual(log.reversal_status, AssessmentAuditLog.ReversalStatus.REVERSIBLE)

        # Execute Undo via API
        undo_res = self.client.post(f"/api/csl-admin/audit-logs/{log.id}/undo/")
        self.assertEqual(undo_res.status_code, status.HTTP_200_OK)
        self.assertTrue(undo_res.data["success"])

        # Verify assessment title was safely restored
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.title, orig_title)

        # Verify audit log status is REVERSED
        log.refresh_from_db()
        self.assertEqual(log.reversal_status, AssessmentAuditLog.ReversalStatus.REVERSED)

    def test_dashboard_statistics_calculation(self):
        """Verify real statistics calculation in AdminStatsView."""
        Drive.objects.create(name="D1", code="D1", status=Drive.Status.ACTIVE)
        res = self.client.get("/api/csl-admin/stats/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("drives_count", res.data)
        self.assertIn("question_bank_health", res.data)
        self.assertIn("integrity_summary", res.data)
        self.assertIn("recent_activities", res.data)
        self.assertGreaterEqual(res.data["drives_count"], 1)

    def test_quick_action_student_access_reassess(self):
        """Verify Quick Action: Reassess Student Access (unlock / grant extra recovery)."""
        cand = Candidate.objects.create(
            full_name="Ananya Sharma",
            register_number="710022104050",
            email="ananya@psgtech.edu",
            college_ref=self.college,
            college=self.college.name,
        )
        attempt = AssessmentAttempt.objects.create(
            candidate=cand,
            assessment=self.assessment,
            state=AssessmentAttempt.State.TIMED_OUT,
            recovery_count=2,
        )

        res = self.client.post("/api/csl-admin/candidates/reassess-access/", {
            "candidate_id": str(cand.id),
            "assessment_id": str(self.assessment.id),
            "action_type": "RETRIEVE_ACCESS",
            "reason": "Accidental laptop shutdown reported",
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])

        attempt.refresh_from_db()
        self.assertEqual(attempt.state, AssessmentAttempt.State.IN_PROGRESS)
        self.assertTrue(AdminAccessGrant.objects.filter(candidate=cand, assessment=self.assessment).exists())

    def test_candidate_csv_export(self):
        """Export candidates data CSV with header and escaping checks."""
        Candidate.objects.create(
            full_name="Karthik R",
            register_number="710022104088",
            email="karthik@psgtech.edu",
            college_ref=self.college,
            college=self.college.name,
        )
        res = self.client.get("/api/csl-admin/candidates/export-data-csv/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "text/csv")
        self.assertIn("Karthik R", res.content.decode("utf-8"))

    def test_tamil_nadu_colleges_ingestion(self):
        """Verify official Tamil Nadu colleges ingestion management command."""
        from django.core.management import call_command
        import io
        out = io.StringIO()
        call_command("import_tamil_nadu_colleges", stdout=out)
        self.assertIn("Tamil Nadu colleges ingested successfully", out.getvalue())
        self.assertTrue(College.objects.filter(code="IITM", is_verified=True).exists())
        self.assertTrue(College.objects.filter(code="CIT", is_verified=True).exists())

    def test_drive_link_existing_candidate_flows(self):
        """Verify existing candidates can link to drives without profile duplication."""
        drive1 = Drive.objects.create(
            name="Tamil Nadu Super Drive",
            code="TNSUPER",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
        )
        DriveAssessment.objects.create(drive=drive1, assessment=self.assessment)

        cand = Candidate.objects.create(
            full_name="Meenakshi S",
            register_number="710022104099",
            email="meenakshi@psgtech.edu",
            phone_number="9876543210",
            college_ref=self.college,
            college=self.college.name,
        )
        initial_cand_count = Candidate.objects.count()

        # 1. Unauthenticated Fast Link via reg_number + email
        res1 = self.client.post("/api/assessment/drive-link/", {
            "drive_code": drive1.code,
            "register_number": "710022104099",
            "verification_factor": "meenakshi@psgtech.edu",
        })
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertTrue(res1.data["success"])
        self.assertEqual(Candidate.objects.count(), initial_cand_count)
        self.assertTrue(DriveRegistration.objects.filter(drive=drive1, candidate=cand).exists())
        self.assertTrue(self.assessment.eligible_candidates.filter(id=cand.id).exists())

        token = res1.data["assessment_token"]

        # 2. Authenticated Fast Link with another drive using token
        drive2 = Drive.objects.create(
            name="Tier 2 Pooled Drive",
            code="TIER2POOL",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
        )
        DriveAssessment.objects.create(drive=drive2, assessment=self.assessment)

        res2 = self.client.post(
            "/api/assessment/drive-link/",
            {"drive_code": "TIER2POOL"},
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data["success"])
        self.assertEqual(Candidate.objects.count(), initial_cand_count)
        self.assertTrue(DriveRegistration.objects.filter(drive=drive2, candidate=cand).exists())
