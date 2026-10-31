-- ==============================================================================
-- CSL ASSESSMENT PLATFORM — PHASE 2.1 DATABASE ROLLBACK SCRIPT
-- Rollback for: assessments.0017_phase21_core_architecture
-- Target: PostgreSQL (Neon / Render)
-- Use this script ONLY if you need to revert Phase 2.1 schema changes back to 0016.
-- ==============================================================================

BEGIN;

-- 1. Remove Structured Recovery Events
DROP TABLE IF EXISTS assessments_recoveryevent CASCADE;

-- 2. Remove Admin Access Grants
DROP TABLE IF EXISTS assessments_adminaccessgrant CASCADE;

-- 3. Remove Assessment Pool Sources
DROP TABLE IF EXISTS assessments_assessmentpoolsource CASCADE;

-- 4. Remove Question Pool Items
DROP TABLE IF EXISTS assessments_questionpoolitem CASCADE;

-- 5. Remove Question Pool Table
DROP TABLE IF EXISTS assessments_questionpool CASCADE;

-- 6. Revert columns on AssessmentAttempt if desired (safe fallback)
-- Note: Leaving snapshot columns causes no harm, but we can drop them if strictly reverting
ALTER TABLE assessments_assessmentattempt
    DROP COLUMN IF EXISTS snapshot_duration_minutes,
    DROP COLUMN IF EXISTS snapshot_tab_switch_limit,
    DROP COLUMN IF EXISTS snapshot_total_marks;

-- 7. Remove migration record from django_migrations
DELETE FROM django_migrations
WHERE app = 'assessments' AND name = '0017_phase21_core_architecture';

COMMIT;
