# CSL Assessment Platform — End-to-End Workflow Repair Audit

**Date:** 2026-11-25  
**Primary Implementation Target:** `testing` (`csldeveloper01/csl-awap-test`, branch `phase-1-testing`, baseline commit `b476fbf`)  
**Production Baseline (Read-Only Reference):** `production` (`csldeveloper01/csl-assessment-wapp`, branch `master`, commit `43626b4` / merge-base `7af1bd7`)

---

## 1. Repository & Branch Divergence Comparison

- `production/master` (`43626b4`) and merge-base `7af1bd7` have identical trees and stop at migration `0014_assessmentpdfdocument_s3_bucket_and_more` (legacy PDF coding mode, heartbeat hardening, fixed Aptitude/Coding baseline).
- `testing/phase-1-testing` (`b476fbf`) is ahead by 22 commits (+42,930 / -6,578 lines across 100 files, migrations `0015` through `0025`), introducing:
  - Dynamic reusable sections (`AssessmentSection`, `AssessmentSectionAllocation`)
  - Independent Question Pools (`QuestionPool`, `QuestionPoolItem`, `AssessmentPoolSource`)
  - Drives & 8-digit invite codes (`Drive`, `DriveAssessment`, `DriveRegistration`, `DriveInvitation`)
  - Interactive Coding Playground & Test Case grading (`ProgrammingQuestion`, `ProgrammingTestCase`, `CodeSubmission`, `CodeTestResult`)
  - CSL Sentinel Proctoring (`ProctoringSession`, `ProctoringCalibration`, `ProctoringEvent`, `ProctoringEvidence`)
  - Admin Test Run simulation (`Candidate.is_simulation`, `AssessmentAttempt.is_simulation`)
  - XLSX export (`AdminAdvancedStudentExportView`) & SEB toggle/config (`is_seb_required`)
- Because `testing/phase-1-testing` rapidly evolved across these phases, several UI flows, backend endpoints, and boundary guards regressed or remained partially wired.

---

## 2. Root-Cause Audit Inventory (Phases 1–7)

### Phase 1 — Student Camera Calibration & Screen Share Stream Handoff
- **Files:**
  - `frontend/src/pages/assessment/AssessmentInstructionsPage.tsx` (Slides 1–4, `handleStart`, lines 42–281, 555–580)
  - `frontend/src/components/assessment/ProctoringInitializer.tsx` (lines 1–792)
  - `frontend/src/pages/assessment/AssessmentExamPage.tsx` (lines 113–183, 2530–2612)
  - `frontend/src/components/assessment/ProctoringStatusPanel.tsx` (lines 1–556)
  - `frontend/src/utils/proctoringStreamStore.ts` (lines 1–47)
- **Current Broken Behavior:**
  1. `AssessmentInstructionsPage.tsx` Slide 2 prompts the browser for **both** camera (`getUserMedia`) and screen share (`getDisplayMedia`) purely for preview. Slide 4 then shows a static 7-step text checklist. When clicking **Start Assessment**, `handleStart` **stops and destroys** both preview `MediaStream`s, calls `startAssessment()`, and then opens `<ProctoringInitializer>` which requests camera + runs 6-pose calibration + requests screen share a **second** time.
  2. `AssessmentExamPage.tsx` passes `screenStream={proctoringScStream || proctoringCamStream}` to `<ProctoringStatusPanel>` — silently substituting the webcam stream as a fake screen stream if screen sharing is missing.
  3. `AssessmentExamPage.tsx` renders its own `showScreenRecovery` modal alongside `ProctoringStatusPanel`'s internal `showScreenRecovery` modal (duplicate modals).
  4. `AssessmentExamPage.tsx` unconditionally invokes `initProctoringSession(attemptId)` on mount when `cached.session` is empty — including during `?simulation=true` Test Runs.
  5. `ProctoringInitializer.tsx` requires `cam && sc` inside `handleAuthorizeAndEnter` even when `bypassGranted=true`, lacks explicit retry/error alert UI when `sessionInitStatus === 'FAILED'`, and leaks tracks if unmounted mid-calibration.
- **Expected Behavior:**
  - Single canonical Sentinel calibration + screen-share workflow on first encounter (after device/rule checks): request camera permission + run MediaPipe 6-pose calibration once (`LOOK_STRAIGHT`, `TURN_RIGHT`, `TURN_LEFT`, `LOOK_UP`, `LOOK_DOWN`, `RETURN_CENTER`), request screen sharing once, initialize Sentinel session, submit calibration + initial evidence, hand off live `MediaStream` tracks cleanly via `proctoringStreamStore` into `AssessmentExamPage` without stopping/re-requesting streams, bypass camera calibration cleanly when `bypassGranted=true` without fabricating calibration, never substitute camera stream as screen stream, deduplicate recovery UI, and clean up tracks on exit/cancel/submit.

### Phase 2 — Direct CSV Question Import Inside Question Pools
- **Files:**
  - `frontend/src/pages/admin/AdminQuestionPoolsView.tsx` (lines 634–657, 1165–1270)
  - `frontend/src/pages/admin/AdminQuestionsView.tsx` (lines 603–677, 766–774, 2370–2560)
  - `backend/apps/assessments/csv_importer.py` (lines 1–490)
  - `backend/apps/assessments/admin_views.py` (`AdminQuestionListView`, duplicates at lines 1710–1875 & 1877–2069, `AdminQuestionPoolQuestionsView`)
  - `backend/apps/assessments/models.py` (`QuestionBank`)
- **Current Broken Behavior:**
  1. `AdminQuestionPoolsView` top-level `Import CSV` calls `onImportCSV()` which opens `AdminQuestionsView`'s global import modal with no target pool selected (or `alert()`s if standalone). The pool management drawer (`managingPool`) has `+ Create MCQ`, `+ Create Coding`, `+ Add from Bank`, and zero CSV import support.
  2. `QuestionBank` has no field distinguishing pool-scoped questions from Global Question Bank questions (`is_global`); all CSV-imported questions land directly in the global bank (`is_active=True`).
  3. `admin_views.py` defines `AdminQuestionArchiveView`, `AdminQuestionImportPreviewView`, and `AdminQuestionImportCSVView` twice verbatim (lines 1684–2069).
  4. `AdminQuestionImportPreviewView` returns `raw_section`, `count`, `matched_section_name`, while `AdminQuestionsView.tsx` expects `detected_name` and `row_count`.
  5. `csv_importer.py` ignores `section_mapping` for coding rows and lacks explicit `is_global` control for pool-scoped imports.
- **Expected Behavior:**
  - Dedicated CSV Import flow inside Question Pools (per pool card & pool detail drawer) locked to target pool ID, showing encoding/delimiter/header validation preview and explicit section/row mapping.
  - Pool-scoped by default (`is_global=False`), with an explicit **unchecked by default** checkbox `"Also add to Global Question Bank"` (`is_global=True`).
  - Transactional/explicit error reporting, deduplicated backend views, preview field normalization, and immediate pool refresh after import.

### Phase 3 — Coding Question Creation & Editing Across All Entry Points
- **Files:**
  - `frontend/src/pages/admin/AdminQuestionEditorModal.tsx` (lines 25–190)
  - `frontend/src/pages/admin/AdminQuestionsView.tsx` (lines 555–600, 1965–1985)
  - `frontend/src/pages/admin/AdminQuestionPoolsView.tsx` (lines 219–285, 1840–1877)
  - `frontend/src/pages/admin/AdminAssessmentsView.tsx` (lines 308–353, 1930–1970, 6970–6983)
  - `backend/apps/assessments/admin_serializers.py` (`AdminQuestionSerializer`, lines 1063–1170)
  - `backend/apps/assessments/admin_views.py` (`AdminQuestionDetailView.put` line 1546, `AdminQuestionListView.post` line 1456, `AdminQuestionPoolQuestionsView` line 3624)
- **Current Broken Behavior:**
  1. `AdminQuestionEditorModal.tsx` has default props `assessments = []`, `sections = []` inside `useEffect` dependencies (creating fresh array references on every render -> constant re-reset on typing!) and two competing `useEffect`s where Effect 2 unconditionally resets `sectionType` to `'APTITUDE'` and `marks` to `1` — overwriting `forcedType='CODING'`.
  2. No canonical `question_type` (`'MCQ' | 'CODING'`) selector exists inside `AdminQuestionEditorModal` when `forcedType` is omitted (e.g., Global Question Bank `+ Create Question`), making CODING indistinguishable unless the user happens to choose section `'CODING'`.
  3. Coding form state (`codingConstraints`, `codingInputFormat`, `codingOutputFormat`, `codingTimeLimit`, `codingMemoryLimit`, `codingAllowedLanguages`, `codingBoilerplate`, `codingTestCases`) is never reset when opening a new question, lacks inputs for `allowed_languages` and per-language `boilerplate_code`, puts HTML `required` on optional assessment `<select>`, and renders MCQ options in Preview even for CODING questions.
  4. `AdminQuestionDetailView.put` does not update `ProgrammingQuestion` or `test_cases` when editing a Coding question (and `AdminQuestionPoolsView.handleSaveQuestionInPool` does not invoke coding detail APIs on edit, nor update marks/prompt cleanly with canonical `question_type`).
  5. `AdminQuestionListView.post` only runs `coding_details` persistence if `assessment_type == "CODING" or section_type == "CODING"` — custom section codes assigned to Coding questions drop coding details.
- **Expected Behavior:**
  - Single canonical `question_type: 'MCQ' | 'CODING'` discriminant across serializers, views, and `AdminQuestionEditorModal`.
  - Cleanly supports creating & editing Coding questions from Global Question Bank, Question Pools, and Assessment Wizard — preserving type, coding statement, constraints, input/output format, limits, allowed languages, starter boilerplate per language, marks, difficulty, public/hidden test cases, and never leaking hidden test cases to candidate APIs.

### Phase 4 — Global Export Appearance Configuration & XLSX/CSV Export Behavior
- **Files:**
  - `backend/apps/assessments/models.py` (`AssessmentConfig`, lines 186–235)
  - `backend/apps/assessments/admin_serializers.py` (`AdminAssessmentConfigSerializer`)
  - `backend/apps/assessments/admin_views.py` (`AdminConfigView`, `AdminAdvancedStudentExportView` lines 5386–5603, `AdminExportCandidateDataCSVView` lines 4345–4414)
  - `frontend/src/pages/admin/AdminConfigView.tsx`
  - `frontend/src/pages/admin/AdminResultsView.tsx`, `AdminCandidatesView.tsx`, `components/admin/QuickActionsModals.tsx`
  - `frontend/src/api/admin.ts`
- **Current Broken Behavior:**
  1. `AssessmentConfig` and `AdminConfigView.tsx` do not store or expose any export formatting settings (header background/text color, alternating row color, border/score/status band colors).
  2. `AdminAdvancedStudentExportView` hardcodes `header_fill = "1E293B"`, `header_font color = "FFFFFF"`, default percentage thresholds, and no alternating row styling; and `exportAdvancedStudentData()` in `api/admin.ts` is completely unused by any admin UI (`AdminResultsView`, `AdminCandidatesView`, `QuickActionsModals`).
  3. `AdminExportCandidateDataCSVView` (line 4398) references nonexistent attributes `last_attempt.score` and `last_attempt.max_score` (real model fields: `total_score`, `snapshot_total_marks`), raising `AttributeError` when attempts exist, and ignores `state` query filter.
- **Expected Behavior:**
  - Global Settings (`AssessmentConfig` + `AdminConfigView` + `AdminConfigView.tsx`) provides validated hex color settings + live swatch preview clearly labeled as **XLSX / Excel Appearance Formatting** (header fill, header text, alternating row fill, distinction/pass/fail band thresholds & colors), leaving CSV exports plain standards-compliant CSV.
  - Wired end-to-end into `AdminAdvancedStudentExportView` `.xlsx` generation (with fallback defaults), fixed `AdminExportCandidateDataCSVView`, and clean XLSX/CSV export actions in `AdminResultsView`, `AdminCandidatesView`, and `ExportStudentDataModal`.

### Phase 5 — Inline `+ Create New Drive` Inside Assessment Creation Wizard
- **Files:**
  - `frontend/src/pages/admin/AdminAssessmentsView.tsx` (lines 1678–1733 Step 1 Drive Association, lines 931–960 Submit, lines 1390–1420 Cancel)
  - `backend/apps/assessments/admin_views.py` (`AdminDriveListCreateView`, `AdminAssessmentListView.post`)
- **Current Broken Behavior:**
  1. Wizard Step 1 Drive Association has only radio Standalone vs Drive and a single `<select>` (`createSelectedDriveIds[0]`) — no `+ Create New Drive` button/modal, no multi-Drive selection/removal in create wizard (though edit modal supports multi-select and backend accepts `drive_ids` list).
  2. Canceling/abandoning the wizard offers no handling for inline-created Drives.
- **Expected Behavior:**
  - Add `+ Create New Drive` button + modal directly inside Wizard Step 1 (and reuse in Edit modal cleanly) supporting Name, Code (auto-generated/custom), Visibility (`PUBLIC` / `INVITE_ONLY`), Status, Dates, and Eligible Colleges, auto-selecting the new Drive on creation without losing any wizard inputs.
  - Support selecting/removing multiple Drives in the wizard.
  - Track inline-created Drives in wizard state and prompt/clean up orphaned unlinked inline Drives on wizard cancellation unless admin chooses to keep them.

### Phase 6 — Strict Sentinel Boundary for Admins & Simulations
- **Files:**
  - `backend/apps/assessments/tokens.py` (`verify_attempt_ownership`, lines 102–116)
  - `backend/apps/assessments/views.py` (`ProctoringSessionInitView`..`ProctoringSessionEndView`, lines 2305–2728)
  - `backend/apps/assessments/admin_views.py` (`AdminStatsView` lines 165–167, `AdminIntegrityEventsView` line 2568, `AdminProctoringSessionsListView` line 5617)
  - `frontend/src/pages/assessment/AssessmentExamPage.tsx` (lines 154–183, 2544)
- **Current Broken Behavior:**
  1. `tokens.py:107-109` (`verify_attempt_ownership`) blindly returns `True` whenever `request.user.is_staff` is authenticated — violating strict candidate ownership isolation.
  2. `views.py` proctoring endpoints allow admin/staff users (even when `is_simulation=False` or `is_simulation=True`) and simulation attempts (`attempt.is_simulation` / `candidate.is_simulation`) to create and mutate `ProctoringSession`, calibration, events, and webcam snapshots.
  3. `AssessmentExamPage.tsx` automatically initializes `ProctoringSession` and requests webcam/screen-share even when `?simulation=true` is active for Admin Test Run.
  4. `AdminProctoringSessionsListView`, `AdminIntegrityEventsView`, and `AdminStatsView` do not filter out `is_simulation=True` records from real candidate proctoring/integrity totals.
- **Expected Behavior:**
  - Remove staff bypass from `verify_attempt_ownership`; enforce strict candidate-token ownership AND explicitly reject staff/simulation subjects with HTTP `403` on candidate Sentinel endpoints (`ProctoringSessionInitView`, etc.).
  - Update `AssessmentExamPage` so simulation runs (`?simulation=true`) show an isolated Admin Simulation Banner and do NOT invoke Sentinel candidate initialization or calibration/proctoring logging.
  - Exclude simulation attempts/candidates from `AdminProctoringSessionsListView`, `AdminIntegrityEventsView`, and `AdminStatsView` by default (optionally allowing explicit `?include_simulations=true` filter in Sentinel/audit debugging while keeping default KPIs purely real-candidate).

### Phase 7 — Additional Broken/Disconnected Admin Workflows Discovered
1. **Colleges Row `"Export Data"` Button (`frontend/src/pages/admin/AdminCollegesView.tsx:815-827`):** Clicking the button labeled `Export Data` invokes `handleOpenImport(col)` (opens CSV Candidate Import modal!). Must separate into **Export Data** (downloads college-filtered XLSX/CSV via `exportAdvancedStudentData` / `exportCandidateDataCsv`) and **Import Students** (`handleOpenImport(col)`).
2. **Quick Action `ReassessStudentAccessModal` Field Mismatch (`frontend/src/components/admin/QuickActionsModals.tsx:50-56` vs `backend/apps/assessments/admin_views.py:4423-4440`):** Frontend sends `{ register_number, action, ... }`, backend only checks `{ identifier, candidate_id, action_type }`, causing 404/400 errors. Backend should support both `register_number`/`identifier` and `action`/`action_type` cleanly (and exclude `is_simulation=True` candidates), and apply `extra_time_minutes` when requested.
3. **Quick Action `ImportQuestionsCSVModal` Positional Arg Bug (`frontend/src/components/admin/QuickActionsModals.tsx:549-554`):** Passes `{ file, destination_mode, pool_ids, new_pool_name }` as 4th positional argument (`sectionMapping`) to `importAdminQuestionsCSV(assessmentId, file, csvContent, sectionMapping)`, causing broken uploads! Must pass `destination_mode`, `pool_ids`, `new_pool_name`, `add_to_global_bank` cleanly in `api/admin.ts`.
4. **Overview Dashboard Health Key Mismatch (`frontend/src/pages/admin/AdminOverviewView.tsx:219, 223` vs `backend/apps/assessments/admin_views.py:213`):** Frontend reads `stats.question_bank_health?.overall_status`, backend returns `status`.
5. **Admin Test Run Token Collision (`frontend/src/pages/admin/AdminAssessmentsView.tsx:209-212` & `AssessmentExamPage.tsx:39-45`):** Opening simulation writes the simulation JWT into shared `localStorage`/`sessionStorage`, overwriting any live session token if reused in same browser origin; isolate `?simulation=true` token handling via query/attempt-scoped storage cleanly and fix `AssessmentExamPage` simulation handling.
6. **CSV Import Preview Field Mismatch (`frontend/src/pages/admin/AdminQuestionsView.tsx:629, 2423, 2435, 2528` vs `backend/apps/assessments/admin_views.py:1744-1753`):** Backend returns `raw_section` and `count`, frontend reads `detected_name` and `row_count`.
7. **Broken `AdminExportCandidateDataCSVView` Score Attributes (`backend/apps/assessments/admin_views.py:4398`):** Uses nonexistent `last_attempt.score` / `last_attempt.max_score` instead of `total_score` / `snapshot_total_marks`, and ignores `?state=` filter sent by `ExportStudentDataModal`.

---

## 3. Schema Migration & Regression Test Plan

### Minimal Schema Extensions (Migration `0026`)
1. `QuestionBank.is_global = models.BooleanField(default=True, db_index=True)` — keeps all existing rows in Global Bank (`True`), while allowing pool-scoped CSV imports to remain isolated to their pool (`False`) unless `"Also add to Global Question Bank"` is checked.
2. `AssessmentConfig`: add XLSX appearance configuration fields with safe backward-compatible defaults (`export_header_bg_color="#1E293B"`, `export_header_text_color="#FFFFFF"`, `export_alt_row_color="#F8FAFC"`, `export_score_thresholds=[...]`).
3. Keep `ProctoringSession` linked to `AssessmentAttempt` (`is_simulation` enforced through `assessment_session__is_simulation=False` and `student__is_simulation=False`, plus optional `is_simulation = models.BooleanField(default=False, db_index=True)` on `ProctoringSession` for defense-in-depth).

### Regression Verification Suite
- Backend Django test suite (`DB_ENGINE=sqlite python manage.py test`): existing 17 test modules + new comprehensive Phase 9 repair tests covering:
  - Single-pass Sentinel init/calibration/bypass without admin contamination
  - Staff & simulation rejection (`403`) on candidate Sentinel APIs & ownership isolation
  - Pool CSV import (`is_global=False` default, opt-in `is_global=True`, explicit error counts, encoding/delimiter handling)
  - Coding question CRUD across Global Bank, Question Pools, and Assessment Wizard + hidden test case scrubbing for candidates
  - Global Export appearance config validation/persistence + openpyxl XLSX styling + CSV integrity + fixed `AdminExportCandidateDataCSVView`
  - Inline Drive creation, multi-drive attachment, and orphan cleanup logic
  - Quick Actions (`reassess-access`, CSV quick upload) & College row export
- Frontend checks: `npm run lint`, `npm run build` (`tsc -b && vite build`).
- Playwright E2E checks against real Django server + Vite frontend verifying UI flows (Playwright headless Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`).
