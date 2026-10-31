-- ==============================================================================
-- CSL ASSESSMENT PLATFORM — PHASE 2.1 DATABASE MIGRATION SCRIPT
-- Migration: assessments.0017_phase21_core_architecture
-- Target: PostgreSQL (Neon / Render)
-- Execute this directly in your database SQL console.
-- ==============================================================================

BEGIN;

-- 1. Snapshot and Decoupling Columns on AssessmentAttempt
ALTER TABLE assessments_assessmentattempt
    ADD COLUMN IF NOT EXISTS snapshot_duration_minutes integer NOT NULL DEFAULT 60;

ALTER TABLE assessments_assessmentattempt
    ADD COLUMN IF NOT EXISTS snapshot_tab_switch_limit integer NOT NULL DEFAULT 2;

ALTER TABLE assessments_assessmentattempt
    ADD COLUMN IF NOT EXISTS snapshot_total_marks integer NOT NULL DEFAULT 50;

ALTER TABLE assessments_assessmentattempt
    ALTER COLUMN config_id DROP NOT NULL;

-- 2. Independent Question Pool
CREATE TABLE IF NOT EXISTS assessments_questionpool (
    id uuid PRIMARY KEY,
    name varchar(150) NOT NULL UNIQUE,
    code varchar(50) NOT NULL UNIQUE,
    description text NOT NULL DEFAULT '',
    category varchar(100) NOT NULL DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS assessments_code_e66988_idx ON assessments_questionpool (code);
CREATE INDEX IF NOT EXISTS assessments_categor_4c8cb1_idx ON assessments_questionpool (category, is_active);

-- 3. Question Pool Items (Join between Pool and QuestionBank)
CREATE TABLE IF NOT EXISTS assessments_questionpoolitem (
    id bigserial PRIMARY KEY,
    "order" integer NOT NULL DEFAULT 0,
    added_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pool_id uuid NOT NULL REFERENCES assessments_questionpool(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    question_id bigint NOT NULL REFERENCES assessments_questionbank(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT uniq_pool_question UNIQUE (pool_id, question_id)
);

CREATE INDEX IF NOT EXISTS assessments_questionpoolitem_pool_id_idx ON assessments_questionpoolitem (pool_id);
CREATE INDEX IF NOT EXISTS assessments_questionpoolitem_question_id_idx ON assessments_questionpoolitem (question_id);

-- 4. Assessment Pool Sources (Linking Assessment to QuestionPool)
CREATE TABLE IF NOT EXISTS assessments_assessmentpoolsource (
    id bigserial PRIMARY KEY,
    question_count integer NOT NULL DEFAULT 0,
    randomize boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assessment_id uuid NOT NULL REFERENCES assessments_assessment(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    pool_id uuid NOT NULL REFERENCES assessments_questionpool(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    section_id bigint NULL REFERENCES assessments_assessmentsection(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT uniq_assessment_pool_section UNIQUE (assessment_id, pool_id, section_id)
);

CREATE INDEX IF NOT EXISTS assessments_assessmentpoolsource_assessment_id_idx ON assessments_assessmentpoolsource (assessment_id);
CREATE INDEX IF NOT EXISTS assessments_assessmentpoolsource_pool_id_idx ON assessments_assessmentpoolsource (pool_id);

-- 5. Admin Access Grants
CREATE TABLE IF NOT EXISTS assessments_adminaccessgrant (
    id uuid PRIMARY KEY,
    grant_type varchar(40) NOT NULL,
    reason text NOT NULL,
    is_used boolean NOT NULL DEFAULT false,
    used_at timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assessment_id uuid NOT NULL REFERENCES assessments_assessment(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    authorized_by_id bigint NULL REFERENCES users_user(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    candidate_id uuid NOT NULL REFERENCES assessments_candidate(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS assessments_candida_2e7761_idx ON assessments_adminaccessgrant (candidate_id, assessment_id, is_used);
CREATE INDEX IF NOT EXISTS assessments_grant_t_b60cf1_idx ON assessments_adminaccessgrant (grant_type, created_at);

-- 6. Structured Recovery Events
CREATE TABLE IF NOT EXISTS assessments_recoveryevent (
    id uuid PRIMARY KEY,
    recovery_type varchar(30) NOT NULL,
    session_key varchar(100) NOT NULL DEFAULT '',
    ip_address inet NULL,
    user_agent text NOT NULL DEFAULT '',
    timer_remaining_seconds integer NOT NULL DEFAULT 0,
    answers_restored_count integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempt_id uuid NOT NULL REFERENCES assessments_assessmentattempt(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    grant_id uuid NULL REFERENCES assessments_adminaccessgrant(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS assessments_attempt_ebc806_idx ON assessments_recoveryevent (attempt_id, recovery_type);
CREATE INDEX IF NOT EXISTS assessments_created_d12570_idx ON assessments_recoveryevent (created_at);

-- 7. Record Migration in Django Migration Table
INSERT INTO django_migrations (app, name, applied)
VALUES ('assessments', '0017_phase21_core_architecture', CURRENT_TIMESTAMP)
ON CONFLICT (app, name) DO NOTHING;

COMMIT;
