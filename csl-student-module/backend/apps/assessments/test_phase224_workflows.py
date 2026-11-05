import uuid
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User
from apps.assessments.models import (
    Assessment,
    Drive,
    DriveAssessment,
    College,
    QuestionPool,
    QuestionPoolItem,
    AssessmentPoolSource,
    QuestionBank,
    AssessmentAuditLog,
    AssessmentSection,
    AssessmentAttempt,
    Candidate,
    AssessmentRegistration,
)


class Phase224WorkflowTests(TestCase):
    """
    Acceptance and Regression Test Suite for Phase 2.2.4:
    - Drive -> Assessment assignment and removal persistence
    - Drive editing with PUT/PATCH and assessment_ids / eligible_college_ids persistence
    - Assessment hierarchy (Standalone vs Drive-based college inheritance)
    - Question Pool linking, quota, sufficiency, and lifecycle configuration locks
    - Student institution request validation, duplicate handling, and audit trail persistence
    - Assessment list/detail/patch access verification
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="phase224_admin",
            email="admin224@csl.com",
            password="Password123!",
            role="ADMIN",
        )
        self.client.force_authenticate(user=self.admin)

        # Standard colleges
        self.college_a = College.objects.create(name="College Alpha", code="COL-A", is_active=True)
        self.college_b = College.objects.create(name="College Beta", code="COL-B", is_active=True)

        # Standard sections
        self.sec_apt, _ = AssessmentSection.objects.get_or_create(code="APTITUDE", defaults={"name": "Aptitude Section"})
        self.sec_cod, _ = AssessmentSection.objects.get_or_create(code="CODING", defaults={"name": "Coding Section"})

    def test_drive_assessment_assignment_and_removal(self):
        """
        Drive assignment:
        1. Create two assessments.
        2. Create a Drive.
        3. Attach both assessments.
        4. Re-query: Confirm both associations persist.
        5. Edit/Remove one assessment association via PATCH / DELETE.
        6. Confirm the remaining assessment persists and the removed assessment is NOT deleted from db.
        """
        a1 = Assessment.objects.create(
            code="ASSESS-101",
            title="Assessment 101",
            duration_minutes=45,
            total_marks=50,
            status=Assessment.Status.OPEN,
            is_standalone=True,
        )
        a2 = Assessment.objects.create(
            code="ASSESS-102",
            title="Assessment 102",
            duration_minutes=60,
            total_marks=100,
            status=Assessment.Status.OPEN,
            is_standalone=True,
        )

        drive = Drive.objects.create(
            name="Recruitment Drive 2026",
            code="DRIVE-2026",
            status=Drive.Status.ACTIVE,
        )

        # Attach assessment 1
        r_add1 = self.client.post(
            f"/api/csl-admin/drives/{drive.id}/assessments/",
            {"assessment_id": str(a1.id), "is_required": True},
            format="json",
        )
        self.assertIn(r_add1.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        # Verify serialized response matches frontend expected fields
        self.assertIn("assessment_duration", r_add1.data)
        self.assertIn("assessment_total_marks", r_add1.data)
        self.assertEqual(r_add1.data["assessment_duration"], 45)
        self.assertEqual(r_add1.data["assessment_total_marks"], 50)

        # Attach assessment 2
        r_add2 = self.client.post(
            f"/api/csl-admin/drives/{drive.id}/assessments/",
            {"assessment_id": str(a2.id), "is_required": False},
            format="json",
        )
        self.assertIn(r_add2.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])

        # Reload drive detail
        r_detail = self.client.get(f"/api/csl-admin/drives/{drive.id}/")
        self.assertEqual(r_detail.status_code, status.HTTP_200_OK)
        linked_ass_ids = [str(da["assessment"]) for da in r_detail.data["drive_assessments"]]
        self.assertIn(str(a1.id), linked_ass_ids)
        self.assertIn(str(a2.id), linked_ass_ids)
        self.assertEqual(len(linked_ass_ids), 2)

        # Remove assessment 1 from drive
        r_del = self.client.delete(
            f"/api/csl-admin/drives/{drive.id}/assessments/",
            {"assessment_id": str(a1.id)},
            format="json",
        )
        self.assertEqual(r_del.status_code, status.HTTP_200_OK)

        # Confirm a2 remains associated, a1 removed from drive
        r_detail_after = self.client.get(f"/api/csl-admin/drives/{drive.id}/")
        remaining_ids = [str(da["assessment"]) for da in r_detail_after.data["drive_assessments"]]
        self.assertNotIn(str(a1.id), remaining_ids)
        self.assertIn(str(a2.id), remaining_ids)

        # CRITICAL: Confirm a1 model record was NOT deleted
        self.assertTrue(Assessment.objects.filter(id=a1.id).exists())

    def test_drive_editing_put_and_patch_persistence(self):
        """
        Drive editing:
        Verify PUT and PATCH both work on AdminDriveDetailView.
        Verify updating assessment_ids via PUT/PATCH persists correctly.
        """
        a1 = Assessment.objects.create(code="AS-P1", title="Assessment P1", duration_minutes=30, total_marks=30)
        a2 = Assessment.objects.create(code="AS-P2", title="Assessment P2", duration_minutes=30, total_marks=30)
        drive = Drive.objects.create(name="Original Drive", code="DRV-ORIG", status=Drive.Status.ACTIVE)

        # Test PUT with assessment_ids and eligible_college_ids
        put_data = {
            "name": "Updated Drive Via PUT",
            "code": "DRV-PUT",
            "status": "ACTIVE",
            "visibility": "PUBLIC",
            "assessment_ids": [str(a1.id), str(a2.id)],
            "eligible_college_ids": [self.college_a.id],
        }
        r_put = self.client.put(f"/api/csl-admin/drives/{drive.id}/", put_data, format="json")
        self.assertEqual(r_put.status_code, status.HTTP_200_OK)
        self.assertEqual(r_put.data["name"], "Updated Drive Via PUT")
        self.assertEqual(len(r_put.data["drive_assessments"]), 2)
        self.assertEqual(len(r_put.data["eligible_colleges"]), 1)

        # Test PATCH to update assessment_ids to only a2
        patch_data = {
            "assessment_ids": [str(a2.id)],
        }
        r_patch = self.client.patch(f"/api/csl-admin/drives/{drive.id}/", patch_data, format="json")
        self.assertEqual(r_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(len(r_patch.data["drive_assessments"]), 1)
        self.assertEqual(str(r_patch.data["drive_assessments"][0]["assessment"]), str(a2.id))

    def test_assessment_hierarchy_standalone_vs_drive(self):
        """
        Assessment hierarchy:
        1. Standalone assessment: direct college eligibility.
        2. Drive-based assessment: colleges inherited from linked drive.
        3. Edit assessment: change drive association and verify persistence.
        """
        # 1. Create Standalone Assessment with College A
        r_create_std = self.client.post(
            "/api/csl-admin/assessments/",
            {
                "code": "AS-STD",
                "title": "Standalone Assessment",
                "is_standalone": True,
                "duration_minutes": 60,
                "total_marks": 50,
                "aptitude_count": 25,
                "coding_count": 25,
                "eligible_college_ids": [self.college_a.id],
                "drive_ids": [],
            },
            format="json",
        )
        if r_create_std.status_code != status.HTTP_201_CREATED:
            print("Create Standalone Error:", r_create_std.data)
        self.assertEqual(r_create_std.status_code, status.HTTP_201_CREATED)
        std_id = r_create_std.data["id"]

        std_ass = Assessment.objects.get(id=std_id)
        self.assertTrue(std_ass.is_standalone)
        self.assertIn(self.college_a, std_ass.eligible_colleges.all())

        # 2. Create Drive X with College B
        drive_x = Drive.objects.create(name="Drive X", code="DRV-X", status=Drive.Status.ACTIVE)
        drive_x.eligible_colleges.add(self.college_b)

        # 3. Create Drive-based Assessment linked to Drive X
        r_create_drv = self.client.post(
            "/api/csl-admin/assessments/",
            {
                "code": "AS-DRV",
                "title": "Drive-Based Assessment",
                "is_standalone": False,
                "duration_minutes": 60,
                "total_marks": 50,
                "aptitude_count": 25,
                "coding_count": 25,
                "drive_ids": [str(drive_x.id)],
                "eligible_college_ids": [],
            },
            format="json",
        )
        if r_create_drv.status_code != status.HTTP_201_CREATED:
            print("Create Drive Assessment Error:", r_create_drv.data)
        self.assertEqual(r_create_drv.status_code, status.HTTP_201_CREATED)
        drv_ass_id = r_create_drv.data["id"]

        # Confirm association with Drive X
        self.assertTrue(DriveAssessment.objects.filter(drive=drive_x, assessment_id=drv_ass_id).exists())

        # 4. Edit assessment: switch Drive association to Drive Y
        drive_y = Drive.objects.create(name="Drive Y", code="DRV-Y", status=Drive.Status.ACTIVE)
        r_edit = self.client.patch(
            f"/api/csl-admin/assessments/{drv_ass_id}/",
            {
                "is_standalone": False,
                "drive_ids": [str(drive_y.id)],
            },
            format="json",
        )
        self.assertEqual(r_edit.status_code, status.HTTP_200_OK)
        self.assertFalse(DriveAssessment.objects.filter(drive=drive_x, assessment_id=drv_ass_id).exists())
        self.assertTrue(DriveAssessment.objects.filter(drive=drive_y, assessment_id=drv_ass_id).exists())

    def test_question_pool_linking_and_lifecycle_locks(self):
        """
        Question Pools workflow:
        1. Create a QuestionPool.
        2. Add questions to pool via items endpoint.
        3. Verify linked_assessments in pool detail.
        4. Link pool to assessment with quota and randomize flag.
        5. Verify persistence.
        6. Verify lifecycle locking: closed/archived assessment rejects modifications.
        """
        # Create pool
        pool = QuestionPool.objects.create(name="Algorithm Pool", code="POOL-ALGO", category="Programming")
        q1 = QuestionBank.objects.create(prompt="Binary search complexity?", section=self.sec_cod, section_type=QuestionBank.SectionType.CODING, marks=5)
        q2 = QuestionBank.objects.create(prompt="Merge sort complexity?", section=self.sec_cod, section_type=QuestionBank.SectionType.CODING, marks=5)

        # Add questions via items endpoint
        r_items = self.client.post(
            f"/api/csl-admin/question-pools/{pool.id}/items/",
            {"question_ids": [q1.id, q2.id], "action": "add"},
            format="json",
        )
        self.assertEqual(r_items.status_code, status.HTTP_200_OK)
        self.assertEqual(pool.items.count(), 2)

        # Create assessment in DRAFT
        assessment = Assessment.objects.create(
            code="AS-POOL-TEST",
            title="Pool Test Assessment",
            duration_minutes=30,
            total_marks=20,
            status=Assessment.Status.DRAFT,
            aptitude_count=0,
            coding_count=2,
        )

        # Link pool to assessment
        r_link = self.client.post(
            f"/api/csl-admin/assessments/{assessment.id}/pool-sources/",
            {
                "pool_id": str(pool.id),
                "section_id": self.sec_cod.id,
                "question_count": 2,
                "randomize": True,
            },
            format="json",
        )
        self.assertIn(r_link.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(r_link.data["pool_name"], "Algorithm Pool")
        self.assertEqual(r_link.data["question_count"], 2)

        # Verify pool detail includes linked_assessments
        r_pool_detail = self.client.get(f"/api/csl-admin/question-pools/{pool.id}/")
        self.assertEqual(r_pool_detail.status_code, status.HTTP_200_OK)
        self.assertIn("linked_assessments", r_pool_detail.data)
        linked_info = r_pool_detail.data["linked_assessments"]
        self.assertEqual(len(linked_info), 1)
        self.assertEqual(linked_info[0]["assessment_id"], str(assessment.id))

        # Check sufficiency: pool has 2 questions, assessment needs 2 coding questions
        r_ass_detail = self.client.get(f"/api/csl-admin/assessments/{assessment.id}/")
        self.assertTrue(r_ass_detail.data["pool_sufficient"])

        # Test lifecycle lock: Close assessment and attempt to link a pool
        assessment.status = Assessment.Status.CLOSED
        assessment.save(update_fields=["status"])

        r_lock_post = self.client.post(
            f"/api/csl-admin/assessments/{assessment.id}/pool-sources/",
            {"pool_id": str(pool.id), "question_count": 1},
            format="json",
        )
        self.assertEqual(r_lock_post.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be modified", r_lock_post.data["detail"])

    def test_student_institution_request_workflow(self):
        """
        Student institution request:
        1. Missing name returns 400.
        2. Valid submission returns 200 with success.
        3. Audit log is created with INSTITUTION_REQUESTED action.
        4. No false verified College record is created.
        5. Duplicate request returns 200 with duplicate flag.
        """
        anon_client = APIClient()

        # 1. Missing name
        r_bad = anon_client.post("/api/assessment/request-college/", {}, format="json")
        self.assertEqual(r_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Valid request
        r_valid = anon_client.post(
            "/api/assessment/request-college/",
            {
                "institution_name": "Anna University MIT Campus",
                "email": "student@mit.annauniv.edu",
                "city": "Chennai",
                "state": "Tamil Nadu",
            },
            format="json",
        )
        self.assertEqual(r_valid.status_code, status.HTTP_200_OK)
        self.assertTrue(r_valid.data["success"])

        # 3. Audit log persistence
        log = AssessmentAuditLog.objects.filter(
            entity_type="COLLEGE_REQUEST",
            details__institution_name="Anna University MIT Campus",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.details["email"], "student@mit.annauniv.edu")

        # 4. No College record created
        self.assertFalse(College.objects.filter(name="Anna University MIT Campus").exists())

        # 5. Duplicate request
        r_dup = anon_client.post(
            "/api/assessment/request-college/",
            {
                "institution_name": "Anna University MIT Campus",
                "email": "student@mit.annauniv.edu",
            },
            format="json",
        )
        self.assertEqual(r_dup.status_code, status.HTTP_200_OK)
        self.assertTrue(r_dup.data.get("duplicate"))

    def test_assessment_access_api_contracts(self):
        """
        Assessment and Drive API contract verification:
        - GET assessment list
        - GET assessment detail
        - PATCH assessment
        - GET Drive detail
        - GET Drive assessments
        - GET question pools
        - GET assessment pool sources
        """
        assessment = Assessment.objects.create(
            code="CONTRACT-TEST",
            title="Contract Test",
            duration_minutes=45,
            total_marks=50,
            status=Assessment.Status.DRAFT,
        )
        drive = Drive.objects.create(name="Contract Drive", code="DRV-CTR", status=Drive.Status.ACTIVE)

        # GET assessment list
        r1 = self.client.get("/api/csl-admin/assessments/")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        # GET assessment detail
        r2 = self.client.get(f"/api/csl-admin/assessments/{assessment.id}/")
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertIn("pool_sufficient", r2.data)
        self.assertIn("is_standalone", r2.data)

        # PATCH assessment
        r3 = self.client.patch(
            f"/api/csl-admin/assessments/{assessment.id}/",
            {"title": "Updated Contract Title"},
            format="json",
        )
        self.assertEqual(r3.status_code, status.HTTP_200_OK)
        self.assertEqual(r3.data["title"], "Updated Contract Title")

        # GET Drive detail
        r4 = self.client.get(f"/api/csl-admin/drives/{drive.id}/")
        self.assertEqual(r4.status_code, status.HTTP_200_OK)

        # GET Drive assessments
        r5 = self.client.get(f"/api/csl-admin/drives/{drive.id}/assessments/")
        self.assertEqual(r5.status_code, status.HTTP_200_OK)

        # GET question pools
        r6 = self.client.get("/api/csl-admin/question-pools/")
        self.assertEqual(r6.status_code, status.HTTP_200_OK)

        # GET assessment pool sources
        r7 = self.client.get(f"/api/csl-admin/assessments/{assessment.id}/pool-sources/")
        self.assertEqual(r7.status_code, status.HTTP_200_OK)
