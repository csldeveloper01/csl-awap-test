-- ==============================================================================
-- CSL ASSESSMENT PLATFORM — PHASE 2.2.3 DATABASE MIGRATION 0020 DDL SCRIPT
-- Application: assessments
-- Migration: 0020_assessment_is_standalone_drive_drive_code_and_more
-- ==============================================================================

BEGIN;

-- 1. Assessment is_standalone flag
ALTER TABLE assessments_assessment
ADD COLUMN IF NOT EXISTS is_standalone boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS assessments_assessment_is_standalone_idx
ON assessments_assessment (is_standalone);

-- 2. Drive 8-digit numeric drive_code
ALTER TABLE assessments_drive
ADD COLUMN IF NOT EXISTS drive_code varchar(8) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assessments_drive_drive_code_key'
    ) THEN
        ALTER TABLE assessments_drive ADD CONSTRAINT assessments_drive_drive_code_key UNIQUE (drive_code);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS assessments_drive_drive_code_idx
ON assessments_drive (drive_code);

-- Populate 8-digit numeric drive_code for any existing drives that lack one
UPDATE assessments_drive
SET drive_code = LPAD((FLOOR(RANDOM() * 90000000) + 10000000)::text, 8, '0')
WHERE drive_code IS NULL;

-- 3. AssessmentRegistration table (Direct Student-to-Assessment relationship)
CREATE TABLE IF NOT EXISTS assessments_assessmentregistration (
    id uuid NOT NULL PRIMARY KEY,
    registered_at timestamp with time zone NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    assessment_id uuid NOT NULL REFERENCES assessments_assessment(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    candidate_id uuid NOT NULL REFERENCES assessments_candidate(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    drive_id uuid NULL REFERENCES assessments_drive(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT uniq_assessment_candidate_reg UNIQUE (assessment_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS assessments_assessmentregistration_assessment_id_idx ON assessments_assessmentregistration (assessment_id);
CREATE INDEX IF NOT EXISTS assessments_assessmentregistration_candidate_id_idx ON assessments_assessmentregistration (candidate_id);
CREATE INDEX IF NOT EXISTS assessments_assessmentregistration_drive_id_idx ON assessments_assessmentregistration (drive_id);
CREATE INDEX IF NOT EXISTS assessments_assessmentregistration_registered_at_idx ON assessments_assessmentregistration (registered_at);
CREATE INDEX IF NOT EXISTS assessments_assessmentregistration_is_active_idx ON assessments_assessmentregistration (is_active);

-- 4. ProgrammingQuestion table (Phase 3 Coding Playground)
CREATE TABLE IF NOT EXISTS assessments_programmingquestion (
    id uuid NOT NULL PRIMARY KEY,
    problem_statement text NOT NULL,
    constraints text NOT NULL DEFAULT '',
    input_format text NOT NULL DEFAULT '',
    output_format text NOT NULL DEFAULT '',
    allowed_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
    boilerplate_code jsonb NOT NULL DEFAULT '{}'::jsonb,
    time_limit_seconds double precision NOT NULL DEFAULT 2.0,
    memory_limit_mb integer NOT NULL DEFAULT 256,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    question_id bigint NOT NULL UNIQUE REFERENCES assessments_questionbank(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS assessments_programmingquestion_question_id_idx ON assessments_programmingquestion (question_id);

-- 5. ProgrammingTestCase table
CREATE TABLE IF NOT EXISTS assessments_programmingtestcase (
    id uuid NOT NULL PRIMARY KEY,
    is_public boolean NOT NULL DEFAULT false,
    input_text text NOT NULL DEFAULT '',
    expected_output text NOT NULL,
    marks_weightage double precision NOT NULL DEFAULT 1.0,
    explanation text NOT NULL DEFAULT '',
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL,
    programming_question_id uuid NOT NULL REFERENCES assessments_programmingquestion(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS assessments_programmingtestcase_prog_q_id_idx ON assessments_programmingtestcase (programming_question_id);
CREATE INDEX IF NOT EXISTS assessments_programmingtestcase_is_public_idx ON assessments_programmingtestcase (is_public);

-- 6. CodeSubmission table
CREATE TABLE IF NOT EXISTS assessments_codesubmission (
    id uuid NOT NULL PRIMARY KEY,
    language varchar(50) NOT NULL,
    source_code text NOT NULL,
    verdict varchar(30) NOT NULL DEFAULT 'PENDING',
    score_awarded double precision NOT NULL DEFAULT 0.0,
    total_test_cases integer NOT NULL DEFAULT 0,
    passed_test_cases integer NOT NULL DEFAULT 0,
    execution_time_ms double precision NOT NULL DEFAULT 0.0,
    memory_used_kb integer NOT NULL DEFAULT 0,
    compile_output text NOT NULL DEFAULT '',
    created_at timestamp with time zone NOT NULL,
    attempt_id uuid NOT NULL REFERENCES assessments_assessmentattempt(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    candidate_id uuid NOT NULL REFERENCES assessments_candidate(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    programming_question_id uuid NOT NULL REFERENCES assessments_programmingquestion(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS assessments_codesubmission_attempt_id_idx ON assessments_codesubmission (attempt_id);
CREATE INDEX IF NOT EXISTS assessments_codesubmission_candidate_id_idx ON assessments_codesubmission (candidate_id);
CREATE INDEX IF NOT EXISTS assessments_codesubmission_prog_q_id_idx ON assessments_codesubmission (programming_question_id);
CREATE INDEX IF NOT EXISTS assessments_codesubmission_verdict_idx ON assessments_codesubmission (verdict);
CREATE INDEX IF NOT EXISTS assessments_codesubmission_created_at_idx ON assessments_codesubmission (created_at);

-- 7. CodeTestResult table
CREATE TABLE IF NOT EXISTS assessments_codetestresult (
    id uuid NOT NULL PRIMARY KEY,
    status varchar(30) NOT NULL,
    actual_output text NOT NULL DEFAULT '',
    error_message text NOT NULL DEFAULT '',
    execution_time_ms double precision NOT NULL DEFAULT 0.0,
    memory_used_kb integer NOT NULL DEFAULT 0,
    passed boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL,
    submission_id uuid NOT NULL REFERENCES assessments_codesubmission(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    test_case_id uuid NOT NULL REFERENCES assessments_programmingtestcase(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS assessments_codetestresult_submission_id_idx ON assessments_codetestresult (submission_id);
CREATE INDEX IF NOT EXISTS assessments_codetestresult_test_case_id_idx ON assessments_codetestresult (test_case_id);

-- 8. Record migration in django_migrations table
INSERT INTO django_migrations (app, name, applied)
VALUES ('assessments', '0020_assessment_is_standalone_drive_drive_code_and_more', NOW())
ON CONFLICT DO NOTHING;

COMMIT;
