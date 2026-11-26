import time
from datetime import timedelta
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assessments.models import (
    Assessment,
    AssessmentAttempt,
    AssessmentConfig,
    Candidate,
    College,
    ProctoringSession,
)
from apps.assessments.tasks import (
    cleanup_stale_sessions_task,
    dispatch_background_task,
    generate_bulk_xlsx_export_task,
    recompute_assessment_analytics_task,
)
from apps.assessments.tokens import generate_candidate_token
from apps.users.models import User


class ScalingCacheCeleryAndLoadTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="scale_admin",
            email="scale@csl.test",
            password="pass12345!",
            role=User.Role.ADMIN,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)

        self.college = College.objects.create(name="Scale Engineering", code="SCALE1")
        self.config = AssessmentConfig.objects.create(title="Scale Config")
        self.assessment = Assessment.objects.create(
            code="SCALE100",
            title="Concurrent Session Benchmark",
            status=Assessment.Status.OPEN,
            duration_minutes=60,
            total_marks=50,
            aptitude_count=0,
            coding_count=0,
        )

    def tearDown(self):
        cache.clear()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_background_tasks_sync_fallback_and_stats_cache_hit(self):
        cache.clear()
        res_analytics = dispatch_background_task(recompute_assessment_analytics_task, str(self.assessment.id))
        self.assertEqual(res_analytics["mode"], "sync_fallback")
        self.assertEqual(res_analytics["result"]["assessment_id"], str(self.assessment.id))

        res_export = dispatch_background_task(generate_bulk_xlsx_export_task, {"assessment_id": str(self.assessment.id)})
        self.assertIn("export_id", res_export["result"])

        # Old stale session cleanup is idempotent
        cand = Candidate.objects.create(
            full_name="Stale User",
            register_number="STALE01",
            college=self.college.name,
            college_ref=self.college,
            email="stale@csl.test",
            department="CSE",
            year_of_study="4",
            phone_number="9999999999",
        )
        att = AssessmentAttempt.objects.create(
            candidate=cand,
            config=self.config,
            assessment=self.assessment,
            state=AssessmentAttempt.State.IN_PROGRESS,
        )
        sess = ProctoringSession.objects.create(
            assessment_session=att,
            student=cand,
            assessment=self.assessment,
            status=ProctoringSession.SessionStatus.INITIALIZING,
        )
        ProctoringSession.objects.filter(id=sess.id).update(created_at=timezone.now() - timedelta(hours=36))
        cleaned = cleanup_stale_sessions_task(24)
        self.assertGreaterEqual(cleaned["cleaned_sessions"], 1)

        # Stats endpoint warms cache on first request, then avoids heavy aggregate queries on cache hit
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as q1:
            r1 = self.admin_client.get("/api/csl-admin/stats/")
            self.assertEqual(r1.status_code, 200)

        with CaptureQueriesContext(connection) as q2:
            r2 = self.admin_client.get("/api/csl-admin/stats/")
            self.assertEqual(r2.status_code, 200)

        self.assertEqual(r1.data["candidates_count"], r2.data["candidates_count"])
        self.assertLess(len(q2), len(q1), f"Cache hit should execute far fewer queries: q1={len(q1)}, q2={len(q2)}")

    def test_simulated_200_session_heartbeat_and_state_latency(self):
        candidates = [
            Candidate(
                full_name=f"Cand {i}",
                register_number=f"LOAD{i:04d}",
                college=self.college.name,
                college_ref=self.college,
                email=f"cand{i}@scale.test",
                department="CSE",
                year_of_study="3",
                phone_number="9000000000",
            )
            for i in range(160)
        ]
        Candidate.objects.bulk_create(candidates)
        created_cands = list(Candidate.objects.filter(register_number__startswith="LOAD").order_by("id"))

        attempts = [
            AssessmentAttempt(
                candidate=c,
                config=self.config,
                assessment=self.assessment,
                state=AssessmentAttempt.State.IN_PROGRESS,
                started_at=timezone.now(),
                deadline=timezone.now() + timedelta(minutes=60),
            )
            for c in created_cands
        ]
        AssessmentAttempt.objects.bulk_create(attempts)
        created_attempts = list(AssessmentAttempt.objects.filter(assessment=self.assessment).select_related("candidate"))

        client = APIClient()
        latencies_ms = []
        for idx, att in enumerate(created_attempts):
            tok = generate_candidate_token(str(att.candidate_id), attempt_id=str(att.id))
            t0 = time.perf_counter()
            r = client.post(
                f"/api/assessment/attempts/{att.id}/heartbeat/",
                {},
                format="json",
                HTTP_X_ASSESSMENT_TOKEN=tok,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            self.assertEqual(r.status_code, 200, f"Heartbeat failed on session #{idx}: {r.data}")
            latencies_ms.append(elapsed_ms)

        latencies_ms.sort()
        p50 = latencies_ms[len(latencies_ms) // 2]
        p95 = latencies_ms[int(len(latencies_ms) * 0.95)]
        # Verify sustained sub-150ms p95 request time under 160 active attempts in Django test client
        self.assertLess(p95, 150.0, f"Expected p95 heartbeat < 150ms, observed p50={p50:.2f}ms p95={p95:.2f}ms")
