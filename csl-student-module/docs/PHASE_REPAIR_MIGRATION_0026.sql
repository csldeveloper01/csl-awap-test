-- ==============================================================================
-- CSL ASSESSMENT PLATFORM — WORKFLOW REPAIR MIGRATION 0026 POSTGRESQL DDL SCRIPT
-- Application: assessments
-- Migration: 0026_assessmentconfig_enable_alt_row_styling_and_more
-- ==============================================================================

BEGIN;

-- 1. AssessmentConfig Export Spreadsheet (XLSX) Appearance Fields
ALTER TABLE assessments_assessmentconfig
ADD COLUMN IF NOT EXISTS enable_alt_row_styling boolean NOT NULL DEFAULT true;

ALTER TABLE assessments_assessmentconfig
ADD COLUMN IF NOT EXISTS export_alt_row_color varchar(7) NOT NULL DEFAULT '#F8FAFC';

ALTER TABLE assessments_assessmentconfig
ADD COLUMN IF NOT EXISTS export_header_bg_color varchar(7) NOT NULL DEFAULT '#1E293B';

ALTER TABLE assessments_assessmentconfig
ADD COLUMN IF NOT EXISTS export_header_text_color varchar(7) NOT NULL DEFAULT '#FFFFFF';

ALTER TABLE assessments_assessmentconfig
ADD COLUMN IF NOT EXISTS export_score_thresholds jsonb NOT NULL DEFAULT '[{"min": 80.0, "max": 100.0, "color": "#D4EDDA", "label": "Distinction"}, {"min": 60.0, "max": 79.99, "color": "#FFF3CD", "label": "First Class"}, {"min": 40.0, "max": 59.99, "color": "#FFE5D0", "label": "Pass"}, {"min": 0.0, "max": 39.99, "color": "#F8D7DA", "label": "Fail / Action Required"}]'::jsonb;

-- 2. ProctoringSession strict simulation isolation guard
ALTER TABLE assessments_proctoringsession
ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS assessments_proctoringsession_is_simulation_idx
ON assessments_proctoringsession (is_simulation);

-- Backfill any historical proctoring sessions linked to simulation candidates/attempts
UPDATE assessments_proctoringsession ps
SET is_simulation = true
FROM assessments_assessmentattempt aa
JOIN assessments_candidate c ON c.id = aa.candidate_id
WHERE ps.assessment_session_id = aa.id
  AND (aa.is_simulation = true OR c.is_simulation = true)
  AND ps.is_simulation = false;

-- 3. QuestionBank global bank visibility flag (pool-only vs global bank)
ALTER TABLE assessments_questionbank
ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS assessments_questionbank_is_global_idx
ON assessments_questionbank (is_global);

CREATE INDEX IF NOT EXISTS assessments_is_glob_129fe0_idx
ON assessments_questionbank (is_global, is_active);

COMMIT;
