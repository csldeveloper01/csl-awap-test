-- ==============================================================================
-- CSL ASSESSMENT PLATFORM — PHASE 2.1 DATABASE SCHEMA VERIFICATION SCRIPT
-- Target: PostgreSQL (Neon / Render)
-- Run this in your database SQL console to inspect the current state of Phase 2.1 tables and constraints.
-- ==============================================================================

-- 1. Check applied migration record
SELECT id, app, name, applied 
FROM django_migrations 
WHERE app = 'assessments' AND name LIKE '%0017%'
ORDER BY id DESC;

-- 2. Check existence of Phase 2.1 tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'assessments_questionpool',
    'assessments_questionpoolitem',
    'assessments_assessmentpoolsource',
    'assessments_adminaccessgrant',
    'assessments_recoveryevent'
  )
ORDER BY table_name;

-- 3. Check AssessmentAttempt snapshot columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'assessments_assessmentattempt'
  AND column_name IN (
    'snapshot_duration_minutes',
    'snapshot_tab_switch_limit',
    'snapshot_total_marks',
    'config_id'
  );

-- 4. Check foreign keys on Phase 2.1 tables
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN (
    'assessments_questionpool',
    'assessments_questionpoolitem',
    'assessments_assessmentpoolsource',
    'assessments_adminaccessgrant',
    'assessments_recoveryevent'
  );
