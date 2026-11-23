import uuid
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.assessments.models import (
    College,
    Drive,
    DriveInvitation,
    Assessment,
    Candidate,
)
from apps.assessments.tokens import generate_candidate_token


class CollegeDisplayRemediationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cit, _ = College.objects.get_or_create(
            code="CIT",
            defaults={
                "name": "Coimbatore Institute of Technology",
                "location": "Coimbatore",
                "city": "Coimbatore",
                "is_active": True,
                "is_verified": True,
            },
        )
        self.cit.is_active = True
        self.cit.is_verified = True
        self.cit.name = "Coimbatore Institute of Technology"
        self.cit.location = "Coimbatore"
        self.cit.city = "Coimbatore"
        self.cit.save()

        self.psg, _ = College.objects.get_or_create(
            code="PSGTECH",
            defaults={
                "name": "PSG College of Technology",
                "location": "Coimbatore",
                "city": "Coimbatore",
                "is_active": True,
                "is_verified": True,
            },
        )
        self.legacy_col, _ = College.objects.get_or_create(
            code="LGC001",
            defaults={
                "name": "Legacy Unverified College",
                "location": "Madurai",
                "is_active": False,
                "is_verified": False,
            },
        )

    def test_student_colleges_list_basic(self):
        """Test that active colleges are returned ordered by name."""
        res = self.client.get("/api/assessment/colleges/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = [c["name"] for c in res.json()]
        self.assertIn("Coimbatore Institute of Technology", names)
        self.assertIn("PSG College of Technology", names)

    def test_student_colleges_list_root_and_v1_aliases(self):
        """Verify root alias /api/colleges/ and /api/v1/assessments/colleges/ work."""
        res_root = self.client.get("/api/colleges/")
        self.assertEqual(res_root.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res_root.json()) >= 2)

        res_v1 = self.client.get("/api/v1/assessments/colleges/")
        self.assertEqual(res_v1.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res_v1.json()) >= 2)

    def test_student_colleges_search(self):
        """Test search query parameter in StudentCollegesListView."""
        res = self.client.get("/api/assessment/colleges/?search=cit")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["code"], "CIT")

        res_location = self.client.get("/api/assessment/colleges/?search=Coimbatore")
        self.assertEqual(res_location.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_location.json()), 2)

    def test_student_colleges_drive_scoping(self):
        """Test scoping colleges by drive_code."""
        drive = Drive.objects.create(
            name="CIT Campus Drive 2026",
            code="DRV-CIT-2026",
            drive_code="88997711",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.PUBLIC,
        )
        drive.eligible_colleges.add(self.cit)

        res = self.client.get(f"/api/assessment/colleges/?drive_code={drive.drive_code}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.cit.id)

    def test_student_colleges_fallback_when_all_inactive(self):
        """If all colleges were marked inactive by accident, fallback ensures students are not blocked."""
        College.objects.all().update(is_active=False)
        res = self.client.get("/api/assessment/colleges/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.json()) >= 3)

    def test_resolve_access_code_returns_valid_and_colleges(self):
        """Test that ResolveAccessCodeView returns valid: True and eligible_colleges."""
        drive = Drive.objects.create(
            name="Exclusive Tech Drive",
            code="DRV-TECH-01",
            drive_code="12345678",
            status=Drive.Status.ACTIVE,
            visibility=Drive.Visibility.INVITE_ONLY,
        )
        drive.eligible_colleges.add(self.cit)

        # 1. Direct drive code resolution
        res = self.client.post("/api/resolve-code/", {"code": "12345678"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data.get("valid"))
        self.assertEqual(data.get("type"), "DRIVE")
        self.assertEqual(data.get("name"), "Exclusive Tech Drive")
        self.assertEqual(data.get("eight_digit_code"), "12345678")
        self.assertIn("eligible_colleges", data)
        self.assertEqual(len(data["eligible_colleges"]), 1)
        self.assertEqual(data["eligible_colleges"][0]["id"], self.cit.id)

        # 2. Drive Invitation code resolution
        inv = DriveInvitation.objects.create(
            drive=drive,
            access_code="INV-CIT-88",
            token_hash="hash88",
            max_uses=10,
            usage_count=0,
            is_active=True,
        )
        res_inv = self.client.post("/api/resolve-code/", {"code": "INV-CIT-88"}, format="json")
        self.assertEqual(res_inv.status_code, status.HTTP_200_OK)
        inv_data = res_inv.json()
        self.assertTrue(inv_data.get("valid"))
        self.assertEqual(inv_data.get("type"), "DRIVE_INVITATION")
        self.assertEqual(len(inv_data["eligible_colleges"]), 1)

        # 3. Invalid code
        res_bad = self.client.post("/api/resolve-code/", {"code": "NONEXISTENT"}, format="json")
        self.assertEqual(res_bad.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(res_bad.json().get("valid"))

    def test_candidate_registration_with_college_id(self):
        """Candidate registers with college_id: institution name is returned and stored."""
        payload = {
            "full_name": "Siddharth Raman",
            "register_number": "710022104050",
            "college_id": self.cit.id,
            "email": "siddharth@cit.edu.in",
            "department": "Computer Science",
            "year_of_study": "3rd Year",
            "phone_number": "9876543210",
        }
        res = self.client.post("/api/assessment/register/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data.get("college"), "Coimbatore Institute of Technology")
        self.assertEqual(data.get("college_id"), self.cit.id)

        # Verify candidate entity in DB
        candidate = Candidate.objects.get(register_number="710022104050")
        self.assertEqual(candidate.college, "Coimbatore Institute of Technology")
        self.assertEqual(candidate.college_ref, self.cit)

        # Candidate assessment listing returns non-empty college
        auth_client = APIClient()
        auth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['assessment_token']}")
        res_eligible = auth_client.get("/api/assessment/candidate-assessments/")
        self.assertEqual(res_eligible.status_code, status.HTTP_200_OK)
        cand_info = res_eligible.json()["candidate"]
        self.assertEqual(cand_info["college"], "Coimbatore Institute of Technology")
        self.assertEqual(cand_info["college_id"], self.cit.id)

    def test_candidate_registration_with_college_name_only(self):
        """Candidate registers with college name (text) only: resolves correctly."""
        payload = {
            "full_name": "Ananya Krishnan",
            "register_number": "710022104099",
            "college": "PSG College of Technology",
            "email": "ananya@psg.edu",
            "department": "Information Technology",
            "year_of_study": "Final Year",
            "phone_number": "9123456789",
        }
        res = self.client.post("/api/assessment/register/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data.get("college"), "PSG College of Technology")
        self.assertEqual(data.get("college_id"), self.psg.id)
