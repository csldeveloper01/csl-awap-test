import uuid
import base64
from datetime import timedelta
from django.test import TestCase, Client
from django.utils import timezone
from apps.users.models import User
from apps.assessments.models import (
    College,
    Assessment,
    Candidate,
    AssessmentAttempt,
    ProctoringSession,
    ProctoringCalibration,
    ProctoringEvent,
    ProctoringEvidence,
    AdminAccessGrant,
)
from apps.assessments.tokens import generate_candidate_token


class CSLSentinelProctoringTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_user(
            username="sentinel_admin",
            email="sentinel_admin@csl.com",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
            status=User.AccountStatus.ACTIVE,
            is_staff=True,
            is_superuser=True,
        )

        self.college = College.objects.create(
            name="Apex Institute of Technology",
            code="AIT-TEST",
            location="Bangalore",
            is_active=True,
        )

        self.assessment = Assessment.objects.create(
            title="Sentinel Diagnostics Assessment",
            code="SENTINEL-101",
            duration_minutes=45,
            total_marks=50,
            status=Assessment.Status.OPEN,
            max_tab_switches_warning=2,
            auto_submit_on_tab_limit=True,
        )
        self.assessment.eligible_colleges.add(self.college)

        self.candidate1 = Candidate.objects.create(
            full_name="Alice Sentinel",
            email="alice@apex.edu",
            register_number="AIT-2026-001",
            college_ref=self.college,
            is_active=True,
        )
        self.attempt1 = AssessmentAttempt.objects.create(
            candidate=self.candidate1,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(minutes=45),
            snapshot_duration_minutes=45,
            snapshot_total_marks=50,
            snapshot_tab_switch_limit=2,
        )
        self.token1 = generate_candidate_token(self.candidate1.id, self.attempt1.id)
        self.auth1 = {"HTTP_AUTHORIZATION": f"Bearer {self.token1}"}

        self.candidate2 = Candidate.objects.create(
            full_name="Bob Unauthorized",
            email="bob@apex.edu",
            register_number="AIT-2026-002",
            college_ref=self.college,
            is_active=True,
        )
        self.attempt2 = AssessmentAttempt.objects.create(
            candidate=self.candidate2,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
            started_at=timezone.now(),
            deadline=timezone.now() + timedelta(minutes=45),
        )
        self.token2 = generate_candidate_token(self.candidate2.id, self.attempt2.id)
        self.auth2 = {"HTTP_AUTHORIZATION": f"Bearer {self.token2}"}

    def test_01_proctoring_session_initialization(self):
        """Candidate initializes proctoring session for their active attempt."""
        res = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["status"], "INITIALIZING")
        self.assertEqual(data["camera_status"], "PENDING")
        self.assertEqual(data["face_calibration_status"], "PENDING")
        self.assertIn("id", data)

        # Idempotent call returns existing session with HTTP 200
        res2 = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["id"], data["id"])

    def test_02_ownership_isolation(self):
        """Candidate B cannot initialize or mutate Candidate A's session."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        # Bob attempts to access Alice's session
        res_bob = self.client.post(
            f"/api/assessment/proctoring/{session_id}/camera-status/",
            data={"status": "ACTIVE"},
            content_type="application/json",
            **self.auth2,
        )
        self.assertEqual(res_bob.status_code, 403)

    def test_03_camera_status_and_event_logging(self):
        """Camera status changes log appropriate telemetry events."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        # 1. Camera becomes ACTIVE
        res = self.client.post(
            f"/api/assessment/proctoring/{session_id}/camera-status/",
            data={"status": "ACTIVE"},
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["camera_status"], "ACTIVE")

        # 2. Camera drops / DISCONNECTED
        res_disc = self.client.post(
            f"/api/assessment/proctoring/{session_id}/camera-status/",
            data={"status": "DISCONNECTED", "metadata": {"reason": "stream ended"}},
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res_disc.status_code, 200)
        session = ProctoringSession.objects.get(id=session_id)
        self.assertEqual(session.camera_status, "DISCONNECTED")
        self.assertTrue(session.events.filter(event_type="CAMERA_DISCONNECTED").exists())

    def test_04_mediapipe_head_pose_calibration(self):
        """Submitting 6-pose head calibration stores baseline orientation and updates flags."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        cal_payload = {
            "baseline_orientation": {"yaw": 0.5, "pitch": -1.2, "roll": 0.1, "confidence": 0.99},
            "calibration_results": [
                {"pose": "LOOK_STRAIGHT", "passed": True, "yaw": 0.5, "confidence": 0.99},
                {"pose": "TURN_LEFT", "passed": True, "yaw": -22.4, "confidence": 0.96},
                {"pose": "TURN_RIGHT", "passed": True, "yaw": 24.1, "confidence": 0.95},
                {"pose": "LOOK_UP", "passed": True, "pitch": 18.2, "confidence": 0.94},
                {"pose": "LOOK_DOWN", "passed": True, "pitch": -16.8, "confidence": 0.95},
                {"pose": "RETURN_CENTER", "passed": True, "yaw": 0.2, "confidence": 0.98},
            ],
            "calibration_completed": True,
        }
        res_cal = self.client.post(
            f"/api/assessment/proctoring/{session_id}/calibration/",
            data=cal_payload,
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res_cal.status_code, 200)
        self.assertEqual(res_cal.json()["face_calibration_status"], "COMPLETED")

        # Verify database record
        cal_obj = ProctoringCalibration.objects.get(proctoring_session_id=session_id)
        self.assertTrue(cal_obj.calibration_completed)
        self.assertEqual(cal_obj.baseline_orientation["yaw"], 0.5)

        # Verify attempt level flag sync
        self.attempt1.refresh_from_db()
        self.assertTrue(self.attempt1.camera_calibrated)

    def test_05_screen_sharing_status_and_interruption(self):
        """Screen sharing interruptions log events and update session state."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        # Started
        self.client.post(
            f"/api/assessment/proctoring/{session_id}/screen-share-status/",
            data={"status": "ACTIVE"},
            content_type="application/json",
            **self.auth1,
        )
        # Interrupted
        res_int = self.client.post(
            f"/api/assessment/proctoring/{session_id}/screen-share-status/",
            data={"status": "INTERRUPTED", "metadata": {"error": "track_onended"}},
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res_int.status_code, 200)
        session = ProctoringSession.objects.get(id=session_id)
        self.assertEqual(session.screen_share_status, "INTERRUPTED")
        self.assertTrue(session.events.filter(event_type="SCREEN_SHARE_INTERRUPTED").exists())
        self.assertGreater(session.risk_score, 0)

    def test_06_telemetry_event_deduplication_and_rate_limiting(self):
        """Telemetry events support client deduplication token and enforce rate limits."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        event_token = "unique_dedup_xyz_123"
        # 1. First event
        res1 = self.client.post(
            f"/api/assessment/proctoring/{session_id}/events/",
            data={
                "event_type": "FACE_NOT_DETECTED",
                "severity": "WARNING",
                "event_id": event_token,
                "metadata": {"duration_ms": 2500},
            },
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res1.status_code, 201)

        # 2. Duplicate event with same event_id
        res2 = self.client.post(
            f"/api/assessment/proctoring/{session_id}/events/",
            data={
                "event_type": "FACE_NOT_DETECTED",
                "severity": "WARNING",
                "event_id": event_token,
            },
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["status"], "duplicate_ignored")
        self.assertEqual(ProctoringEvent.objects.filter(event_id=event_token).count(), 1)

    def test_07_tab_switch_integration_and_auto_submit(self):
        """Tab switches via Sentinel synchronize attempt count and auto-submit at limit."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        # Limit is 2. Tab switch 1
        self.client.post(
            f"/api/assessment/proctoring/{session_id}/events/",
            data={"event_type": "TAB_SWITCHED", "severity": "WARNING", "event_id": "tab1"},
            content_type="application/json",
            **self.auth1,
        )
        self.attempt1.refresh_from_db()
        self.assertEqual(self.attempt1.tab_switch_count, 1)
        self.assertEqual(self.attempt1.state, AssessmentAttempt.State.IN_PROGRESS)

        # Tab switch 2
        self.client.post(
            f"/api/assessment/proctoring/{session_id}/events/",
            data={"event_type": "TAB_SWITCHED", "severity": "WARNING", "event_id": "tab2"},
            content_type="application/json",
            **self.auth1,
        )
        self.attempt1.refresh_from_db()
        self.assertEqual(self.attempt1.tab_switch_count, 2)
        self.assertEqual(self.attempt1.state, AssessmentAttempt.State.IN_PROGRESS)

        # Tab switch 3 (Exceeds limit -> auto-submit to FLAGGED_FOR_REVIEW)
        self.client.post(
            f"/api/assessment/proctoring/{session_id}/events/",
            data={"event_type": "TAB_SWITCHED", "severity": "CRITICAL", "event_id": "tab3"},
            content_type="application/json",
            **self.auth1,
        )
        self.attempt1.refresh_from_db()
        self.assertEqual(self.attempt1.tab_switch_count, 3)
        self.assertTrue(self.attempt1.is_flagged)
        self.assertEqual(self.attempt1.state, AssessmentAttempt.State.FLAGGED_FOR_REVIEW)

    def test_08_coding_playground_clipboard_restriction_event(self):
        """Blocked clipboard paste attempts are logged and factor into risk score."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        res = self.client.post(
            f"/api/assessment/proctoring/{session_id}/events/",
            data={
                "event_type": "CLIPBOARD_PASTE_ATTEMPT",
                "severity": "WARNING",
                "metadata": {"key": "Ctrl+V", "target": "MonacoEditor"},
            },
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res.status_code, 201)
        session = ProctoringSession.objects.get(id=session_id)
        self.assertIn("CLIPBOARD_PASTE_ATTEMPT", session.risk_breakdown)
        self.assertGreaterEqual(session.risk_score, 15)

    def test_09_evidence_snapshot_upload_and_admin_view(self):
        """Snapshot frame uploads via base64 or file and can be viewed by authorized admin."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        # 1x1 dummy JPEG image bytes in base64
        dummy_jpeg_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

        res_upload = self.client.post(
            f"/api/assessment/proctoring/{session_id}/evidence/",
            data={
                "frame_base64": dummy_jpeg_b64,
                "evidence_type": "WEBCAM_SNAPSHOT",
                "metadata": {"reason": "periodic_snapshot"},
            },
            content_type="application/json",
            **self.auth1,
        )
        self.assertEqual(res_upload.status_code, 201)
        evidence_id = res_upload.json()["evidence_id"]

        # Admin logs in and views evidence
        self.client.force_login(self.admin)
        res_view = self.client.get(f"/api/csl-admin/proctoring/evidence/{evidence_id}/view/")
        self.assertEqual(res_view.status_code, 200)
        self.assertEqual(res_view["Content-Type"], "image/jpeg")

    def test_10_admin_session_management_and_manual_review(self):
        """Admin views list of sessions, gets detailed dossier, and records manual review."""
        res_init = self.client.post(
            "/api/assessment/proctoring/init/",
            data={"attempt_id": str(self.attempt1.id)},
            content_type="application/json",
            **self.auth1,
        )
        session_id = res_init.json()["id"]

        self.client.force_login(self.admin)

        # 1. List sessions
        res_list = self.client.get("/api/csl-admin/proctoring/sessions/")
        self.assertEqual(res_list.status_code, 200)
        self.assertTrue(any(s["id"] == session_id for s in res_list.json()))

        # 2. Detail view
        res_detail = self.client.get(f"/api/csl-admin/proctoring/sessions/{session_id}/")
        self.assertEqual(res_detail.status_code, 200)
        self.assertEqual(res_detail.json()["candidate"]["full_name"], "Alice Sentinel")

        # 3. Record review decision: CONFIRMED_VIOLATION
        res_rev = self.client.post(
            f"/api/csl-admin/proctoring/sessions/{session_id}/review/",
            data={
                "review_status": "CONFIRMED_VIOLATION",
                "review_notes": "Multiple unauthorized individuals detected and repeated clipboard attempts.",
            },
            content_type="application/json",
        )
        self.assertEqual(res_rev.status_code, 200)
        session = ProctoringSession.objects.get(id=session_id)
        self.assertEqual(session.review_status, "CONFIRMED_VIOLATION")
        self.attempt1.refresh_from_db()
        self.assertTrue(self.attempt1.is_flagged)
        self.assertIn("PROCTORING_VIOLATION_CONFIRMED", self.attempt1.flag_reason)
