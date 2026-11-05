-- ==============================================================================
-- CSL ASSESSMENT PLATFORM — PHASE 2.2.2 DATABASE MIGRATION 0019 DDL SCRIPT
-- Application: assessments
-- Migration: 0019_driveassessment_created_by_driveassessment_status
-- ==============================================================================

BEGIN;

-- 1. Add created_by_id foreign key column to assessments_driveassessment
ALTER TABLE assessments_driveassessment
ADD COLUMN IF NOT EXISTS created_by_id bigint NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assessments_driveassessment_created_by_id_fk_users_user_id'
    ) THEN
        ALTER TABLE assessments_driveassessment
        ADD CONSTRAINT assessments_driveassessment_created_by_id_fk_users_user_id
        FOREIGN KEY (created_by_id) REFERENCES users_user(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS assessments_driveassessment_created_by_id_idx
ON assessments_driveassessment (created_by_id);

-- 2. Add status column to assessments_driveassessment
ALTER TABLE assessments_driveassessment
ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS assessments_driveassessment_status_idx
ON assessments_driveassessment (status);

-- 3. Record migration in django_migrations table
INSERT INTO django_migrations (app, name, applied)
VALUES ('assessments', '0019_driveassessment_created_by_driveassessment_status', NOW())
ON CONFLICT DO NOTHING;

COMMIT;
