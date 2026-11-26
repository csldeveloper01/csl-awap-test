# CSL Assessment Platform — Redis, Celery & Deployment Guide

## 1. Local & Sandbox Behavior (Zero External Services Required)
- When `REDIS_URL` and `CELERY_BROKER_URL` are unset:
  - Django `CACHES['default']` automatically uses `LocMemCache` (5-minute default TTL).
  - `CELERY_TASK_ALWAYS_EAGER` defaults to `True` and `dispatch_background_task()` falls back safely to synchronous execution so local development and automated test suites run without running a Redis or Celery daemon.
- Code execution (`Python 3` via Pyodide, `Java` via TeaVM WASM) runs 100% locally in the candidate/admin browser with **zero** external compiler APIs.

## 2. Production Deployment (Render + Redis + Celery + Vercel)
1. **Frontend (Vercel)**
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Env: `VITE_API_BASE_URL=https://<your-render-api>.onrender.com`
2. **Backend API Web Service (Render)**
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt && python manage.py migrate --noinput && python manage.py collectstatic --noinput`
   - Start Command: `gunicorn config.wsgi:application --workers 4 --threads 4 --bind 0.0.0.0:$PORT`
3. **Redis Instance (Render Key Value / Managed Redis)**
   - Provision Managed Redis and set on both Web & Worker services:
     - `REDIS_URL=rediss://...`
     - `CELERY_BROKER_URL=rediss://...`
     - `CELERY_RESULT_BACKEND=rediss://...`
     - `CELERY_TASK_ALWAYS_EAGER=False`
4. **Celery Background Worker Service (Render Background Worker)**
   - Root Directory: `backend`
   - Start Command: `celery -A config worker -l info --concurrency=2`
   - Optional Periodic Scheduler (Celery Beat): `celery -A config beat -l info`

## 3. Caching & Invalidation Notes
- Administrative overview metrics (`csl:admin:stats:v2`) and analytics aggregates (`csl:analytics:<id>`) are cached via Django's `cache` backend and invalidated/cleared immediately by the Admin Cache Reset action (`POST /api/admin/system/clear-cache/`) or `fresh=true`.
- Frontend Admin modules cache API responses cleanly with `@tanstack/react-query` (`staleTime` + mutation invalidation).
