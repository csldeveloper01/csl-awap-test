"""
Phase 2.2.2 Integration and Verification Tests:
- Drive and Assessment Many-to-Many Relationships & Association Independence
- Standalone Assessment Creation & Subsequent Drive Association
- Drive Analytics with Strict Candidate Deduplication Across Assessments
- Public Drive Landing & Account-Free Candidate Registration
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
    Candidate,
    Drive,
    DriveAssessment,
    DriveRegistration,
    QuestionBank,
)
from apps.assessments.tokens import generate_candidate_token

User = get_user_model()


class Phase222WorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="admin222@csl.edu",
            email="admin222@csl.edu",
            password="AdminPassword123!",
            first_name="Admin",
            last_name="222",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=self.admin)

        self.college1, _ = College.objects.get_or_create(
            code="PSGCT",
            defaults={"name": "PSG College of Technology", "location": "Coimbatore", "is_active": True},
        )
        self.college2, _ = College.objects.get_or_create(
            code="CIT",
            defaults={"name": "Coimbatore Institute of Technology", "location": "Coimbatore", "is_active": True},
        )

        # Base Drive 1
        self.drive1 = Drive.objects.create(
            name="Annual Campus Drive 2026",
            code="ACD-2026",
            description="Engineering placement drive",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
            created_by=self.admin,
        )
        self.drive1.eligible_colleges.add(self.college1, self.college2)

        # Base Drive 2
        self.drive2 = Drive.objects.create(
            name="Lateral Recruitment Drive 2026",
            code="LRD-2026",
            description="Off-campus drive",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
            created_by=self.admin,
        )

    def test_drive_and_assessment_m2m_relationship_and_safe_removal(self):
        """
        Verify that an Assessment can belong to multiple Drives simultaneously.
        Verify that removing an Assessment from a Drive does not delete the Assessment or candidate data.
        """
        # Create Assessment 1
        a1 = Assessment.objects.create(
            code="CSL-TEST-A1",
            title="Aptitude & Logical Reasoning",
            duration_minutes=60,
            total_marks=50,
            status=Assessment.Status.OPEN,
            created_by=self.admin,
        )
        # Create Assessment 2
        a2 = Assessment.objects.create(
            code="CSL-TEST-A2",
            title="Core Technical Assessment",
            duration_minutes=90,
            total_marks=100,
            status=Assessment.Status.OPEN,
            created_by=self.admin,
        )

        # Link a1 to both Drive 1 and Drive 2
        DriveAssessment.objects.create(drive=self.drive1, assessment=a1, display_order=1)
        DriveAssessment.objects.create(drive=self.drive2, assessment=a1, display_order=1)

        # Link a2 to Drive 1 only
        DriveAssessment.objects.create(drive=self.drive1, assessment=a2, display_order=2)

        # Verify many-to-many presence
        self.assertEqual(a1.drives.count(), 2)
        self.assertIn(self.drive1, a1.drives.all())
        self.assertIn(self.drive2, a1.drives.all())

        self.assertEqual(self.drive1.assessments.count(), 2)
        self.assertEqual(self.drive2.assessments.count(), 1)

        # Record a candidate attempt on a1
        candidate = Candidate.objects.create(
            full_name="Arun Kumar",
            register_number="710022104001",
            college=self.college1.name,
            college_ref=self.college1,
            email="arun.kumar@psgct.edu",
            phone_number="9876543210",
        )
        attempt = AssessmentAttempt.objects.create(
            assessment=a1,
            candidate=candidate,
            state=AssessmentAttempt.State.SUBMITTED,
            total_score=42,
        )

        # Admin removes a1 from Drive 1 via API
        resp = self.client.delete(
            f"/api/csl-admin/drives/{self.drive1.id}/assessments/",
            data={"assessment_id": str(a1.id)},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Verify a1 is removed from Drive 1, but STILL exists in Drive 2
        self.assertEqual(self.drive1.assessments.count(), 1)
        self.assertEqual(self.drive2.assessments.count(), 1)
        self.assertIn(self.drive2, a1.drives.all())

        # Verify the underlying Assessment record and Candidate attempt are NOT deleted
        self.assertTrue(Assessment.objects.filter(id=a1.id).exists())
        self.assertTrue(AssessmentAttempt.objects.filter(id=attempt.id).exists())

    def test_standalone_assessment_creation_and_drive_assignment(self):
        """
        Verify that an Assessment can be created as Standalone, and later linked or unlinked to Drives.
        """
        # 1. Create Standalone assessment via API
        payload = {
            "code": "STANDALONE-01",
            "title": "Standalone Aptitude Challenge",
            "duration_minutes": 45,
            "total_marks": 50,
            "aptitude_count": 25,
            "coding_count": 25,
            "delivery_mode": "MCQ",
        }
        res = self.client.post("/api/csl-admin/assessments/", data=payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        assessment_id = res.data["id"]

        # Check detail serializer
        get_res = self.client.get(f"/api/csl-admin/assessments/{assessment_id}/")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertTrue(get_res.data["is_standalone"])
        self.assertEqual(len(get_res.data["drives"]), 0)

        # 2. Modify to assign to Drive 1
        patch_res = self.client.patch(
            f"/api/csl-admin/assessments/{assessment_id}/",
            data={"drive_ids": [str(self.drive1.id)]},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertFalse(patch_res.data["is_standalone"])
        self.assertEqual(len(patch_res.data["drives"]), 1)
        self.assertEqual(patch_res.data["drives"][0]["code"], self.drive1.code)

        # 3. Unassign back to Standalone
        patch_res2 = self.client.patch(
            f"/api/csl-admin/assessments/{assessment_id}/",
            data={"drive_ids": []},
            format="json",
        )
        self.assertEqual(patch_res2.status_code, status.HTTP_200_OK)
        self.assertTrue(patch_res2.data["is_standalone"])
        self.assertEqual(len(patch_res2.data["drives"]), 0)

    def test_drive_analytics_strict_candidate_deduplication(self):
        """
        Verify that a candidate who attempts multiple assessments in a Drive is counted as ONE unique candidate.
        Verify completion rate and breakdown metrics.
        """
        a1 = Assessment.objects.create(
            code="DRV-A1",
            title="General Aptitude",
            duration_minutes=30,
            total_marks=30,
            status=Assessment.Status.OPEN,
            created_by=self.admin,
        )
        a2 = Assessment.objects.create(
            code="DRV-A2",
            title="Coding Assessment",
            duration_minutes=60,
            total_marks=70,
            status=Assessment.Status.OPEN,
            created_by=self.admin,
        )
        DriveAssessment.objects.create(drive=self.drive1, assessment=a1, display_order=1)
        DriveAssessment.objects.create(drive=self.drive1, assessment=a2, display_order=2)

        # Student 1: registers for drive and takes BOTH assessments
        c1 = Candidate.objects.create(
            full_name="Priya Dharshini",
            register_number="710022104002",
            college=self.college1.name,
            college_ref=self.college1,
            email="priya@psgct.edu",
            phone_number="9876543211",
        )
        DriveRegistration.objects.create(drive=self.drive1, candidate=c1)

        AssessmentAttempt.objects.create(
            assessment=a1,
            candidate=c1,
            state=AssessmentAttempt.State.SUBMITTED,
            total_score=28,
        )
        AssessmentAttempt.objects.create(
            assessment=a2,
            candidate=c1,
            state=AssessmentAttempt.State.SUBMITTED,
            total_score=62,
        )

        # Student 2: takes Assessment 1 only (in progress)
        c2 = Candidate.objects.create(
            full_name="Karthik Raja",
            register_number="710022104003",
            college=self.college2.name,
            college_ref=self.college2,
            email="karthik@cit.edu",
            phone_number="9876543212",
        )
        DriveRegistration.objects.create(drive=self.drive1, candidate=c2)

        AssessmentAttempt.objects.create(
            assessment=a1,
            candidate=c2,
            state=AssessmentAttempt.State.IN_PROGRESS,
            total_score=0,
        )

        # Request analytics for Drive 1
        res = self.client.get(f"/api/csl-admin/drives/{self.drive1.id}/analytics/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data["total_associated_assessments"], 2)
        # Deduplication check: Candidate 1 took 2 assessments, Candidate 2 took 1. Total unique candidates MUST BE 2.
        self.assertEqual(data["total_unique_candidates"], 2)
        self.assertEqual(data["total_attempts"], 3)
        self.assertEqual(data["completed_attempts"], 2)
        self.assertEqual(data["in_progress_attempts"], 1)

        # Check per-assessment breakdown
        self.assertEqual(len(data["assessments_breakdown"]), 2)
        self.assertEqual(len(data["college_participation"]), 2)

    def test_public_drive_landing_and_account_free_registration(self):
        """
        Verify public drive endpoint and account-free candidate registration.
        """
        a1 = Assessment.objects.create(
            code="PUB-A1",
            title="Placement Diagnostic 1",
            duration_minutes=45,
            total_marks=50,
            status=Assessment.Status.OPEN,
            created_by=self.admin,
        )
        DriveAssessment.objects.create(drive=self.drive1, assessment=a1, display_order=1)

        # Unauthenticated client (student)
        public_client = APIClient()

        # 1. Fetch public drive info
        pub_res = public_client.get(f"/api/assessment/drives/{self.drive1.code}/public/")
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pub_res.data["code"], self.drive1.code)
        self.assertTrue(pub_res.data["is_registration_open"])
        self.assertEqual(len(pub_res.data["assessments"]), 1)
        self.assertEqual(pub_res.data["assessments"][0]["code"], "PUB-A1")

        # 2. Register candidate WITHOUT username/password
        reg_payload = {
            "drive_code": self.drive1.code,
            "full_name": "Suresh Raina",
            "register_number": "710022104099",
            "college_id": self.college1.id,
            "email": "suresh.raina@psgct.edu",
            "phone_number": "9123456780",
            "department": "Computer Science & Engineering",
            "year_of_study": "Final Year",
            "assessment_id": str(a1.id),
        }
        reg_res = public_client.post("/api/assessment/register/", data=reg_payload, format="json")
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        self.assertIn("assessment_token", reg_res.data)
        self.assertEqual(reg_res.data["full_name"], "Suresh Raina")

        # 3. Re-registration / Returning Candidate: same details must return active token without duplicate candidate
        reg_res2 = public_client.post("/api/assessment/register/", data=reg_payload, format="json")
        self.assertEqual(reg_res2.status_code, status.HTTP_200_OK)
        self.assertIn("assessment_token", reg_res2.data)

        # Verify database has exactly 1 candidate record
        self.assertEqual(
            Candidate.objects.filter(email="suresh.raina@psgct.edu").count(),
            1,
        )
