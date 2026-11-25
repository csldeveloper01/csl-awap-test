# CSL Assessment Platform — End-to-End Workflow Repair & Admin UX Consolidation Report

**Date:** 2026-11-25  
**Target Branch:** `testing` (`csldeveloper01/csl-awap-test`, branch `phase-1-testing`, starting from commit `b476fbf`)  
**Production Reference (Read-Only):** `production` (`csldeveloper01/csl-assessment-wapp`, branch `master`, commit `43626b4` / merge-base `7af1bd7`)  

---

## 1. Executive Summary

All seven workflow repair and UX consolidation phases—plus seven additional broken/disconnected workflows uncovered during the repository audit—have been implemented across the Django backend, PostgreSQL/SQLite migrations (`0026`), and React/TypeScript frontend, verified with automated Django regression tests, TypeScript/Vite production builds, and live headless Chrome Playwright end-to-end tests.

---

## 2. Implemented Changes by Phase

### Phase 1 — Consolidated Single-Pass Student Proctoring & Live Stream Handoff
- **Removed Duplicate Hardware Prompts:** Simplified `AssessmentInstructionsPage.tsx` from 4 slides (which previously prompted for `getUserMedia` + `getDisplayMedia` on Slide 2 and destroyed those tracks in `handleStart`) into 2 concise preparation slides (`External Devices` -> `System Readiness & Rules`), followed directly by one live `<ProctoringInitializer>` verification gate.
- **Live MediaStream Handoff:** Extended `utils/proctoringStreamStore.ts` (`setProctoringStreams`, `updateCachedScreenStream`, `clearProctoringStreams`) to preserve nullable `MediaStream | null` tracks across route transitions into `AssessmentExamPage.tsx` without closing or re-requesting camera/screen hardware permissions.
- **No Camera-as-Screen Fallback & Single Recovery Modal:** Removed `screenStream={proctoringScStream || proctoringCamStream}` and the duplicate `showScreenRecovery` modal from `AssessmentExamPage.tsx`; updated `ProctoringStatusPanel.tsx` to act as the single screen-share recovery authority with null-safe camera handling (`cameraBypassed` pill when waived by administrator).
- **Retryable Sentinel Handshake & Track Cleanup:** Updated `ProctoringInitializer.tsx` with unmount/cancel stream cleanup (`handedOffRef`), explicit `Retry Sentinel Handshake` recovery button in `SCREEN_SHARE` when the screen stream is live (`sessionInitStatus === 'FAILED'`), and strict `bypassGranted` direct-to-screen-share support without fabricating webcam state.

### Phase 2 — Direct CSV Question Import Inside Question Pools
- **Model & Service Isolation:** Added `QuestionBank.is_global` (`default=True`, indexed with `is_active` in migration `0026`). Updated global fallback queries in `apps/assessments/services.py` and default `/api/csl-admin/questions/` list filtering in `admin_views.py` to scope central bank queries to `is_global=True` (opt-in `?include_pool_only=true`).
- **Backend Pool CSV Endpoints & Deduplication:** Removed duplicate CSV/archive views in `admin_views.py`, extracted shared `_build_csv_preview_response` and `_execute_csv_import_commit` helpers, and added `AdminQuestionPoolImportPreviewView` (`/api/csl-admin/question-pools/<uuid:pk>/import-preview/`) and `AdminQuestionPoolImportCSVView` (`/api/csl-admin/question-pools/<uuid:pk>/import-csv/`). Enhanced `csv_importer.py` (`is_global`, coding/MCQ section resolution via case-insensitive codes/mapping rules, `hidden_input_1..4` aliases).
- **Question Pools Import Modal:** Added a dedicated per-pool CSV import workflow inside `AdminQuestionPoolsView.tsx` (accessible from toolbar, cards, list rows, and drawer) featuring an **unchecked by default** checkbox `"Also add imported questions to the Global Question Bank"`, two-step validation + section mapping, structured row error rendering, and immediate pool/drawer refresh.

### Phase 3 — Unified Coding Question Authoring & Security
- **Canonical Discriminant & Serialization:** Standardized `question_type` (`'MCQ' | 'CODING'`) across `AdminQuestionSerializer` (`admin_serializers.py`, now including full nested `programming_details`), `AdminQuestionPoolItemSerializer`, `AdminQuestionListView`, `AdminQuestionDetailView`, and `AdminQuestionPoolQuestionsView` via shared `_upsert_coding_details_for_question`.
- **Editor Modal Repairs:** Refactored `AdminQuestionEditorModal.tsx` to eliminate inline default-array `useEffect` reset loops, added explicit MCQ vs Coding switcher, full support for constraints, I/O formats, time/memory limits, `allowed_languages` checkboxes, per-language `boilerplate_code` tabs, public/hidden test cases, Coding Preview panel, and fixed the HTML5 `<input type="number" min="0.1" step="0.5">` (`1.0` step-mismatch) form submission bug using `step="any"`.
- **Candidate Test Case Protection:** Verified that candidate endpoints (`AttemptStateView` / `AssessmentAttemptDetailSerializer`) only expose `is_public=True` sample test cases and never leak hidden test case inputs/outputs.

### Phase 4 — Global Settings Export Appearance & XLSX/CSV Export Wiring
- **Configuration & Validation:** Extended `AssessmentConfig` with `export_header_bg_color`, `export_header_text_color`, `export_alt_row_color`, `enable_alt_row_styling`, and `export_score_thresholds` with regex hex validation (`normalize_hex_color`) in `models.py` and `admin_serializers.py`.
- **UI & Live Swatch Preview:** Added `3. Export Spreadsheet Appearance (Excel / XLSX Only)` to `AdminConfigView.tsx` with color pickers, hex inputs, alternating row toggle, editable 4-band score thresholds, reset button, and live table swatch preview.
- **Spreadsheet Export Generation & Routing Fix:** Wired `AdminAdvancedStudentExportView` (`openpyxl`) to the persisted `AssessmentConfig` styling rules for `.xlsx` while keeping `.csv` plain with formula-injection sanitization; fixed missing `defaultdict` / `re` imports in `admin_views.py`; added `'URL_FORMAT_OVERRIDE': None` to `REST_FRAMEWORK` in `config/settings.py` so `?format=xlsx` / `?format=csv` no longer return HTTP `404`; fixed `AdminExportCandidateDataCSVView` score attribute bugs (`total_score` / `snapshot_total_marks`); exposed XLSX + CSV export actions in `AdminResultsView.tsx`, `AdminCandidatesView.tsx`, `AdminCollegesView.tsx`, and `QuickActionsModals.tsx`.

### Phase 5 — Inline `+ Create New Drive` Inside Assessment Creation & Edit Workflows
- Added inline **+ Create New Drive** modal inside `AdminAssessmentsView.tsx` Wizard Step 1 (`wizard-create-drive-btn`) and Edit Modal, preserving all wizard state upon Drive creation, auto-selecting the new Drive, supporting multi-Drive checkboxes + removable badges, and offering orphan inline-Drive cleanup when abandoning the wizard.

### Phase 6 — Strict Sentinel Admin & Simulation Isolation
- Updated `tokens.py` (`verify_attempt_ownership` now disables staff bypass by default; added `is_simulation_or_admin_subject`) and `views.py` (`_authorize_proctoring_attempt`) to return HTTP `403` whenever staff users or `is_simulation=True` subjects hit Sentinel candidate/proctoring routes (`ProctoringSession*View`, `CandidateAttemptCalibrationView`).
- Updated `RecordIntegrityEventView` to ignore simulation events cleanly without writing `IntegrityEvent` rows, and added `ProctoringSession.is_simulation` plus default exclusion (`include_simulations=true` opt-in) across `AdminProctoringSessionsListView`, `AdminProctoringSessionDetailView`, `AdminIntegrityEventsView`, and `AdminStatsView`.
- Updated `AssessmentExamPage.tsx` `?simulation=true` handling to skip Sentinel init, fullscreen lock, tab/context-menu telemetry, `ProctoringStatusPanel` mount, and `localStorage` token writes while displaying an explicit simulation banner.

### Phase 7 — Additional Repaired Workflows
- Fixed `AdminCollegesView.tsx` row `"Export Data"` button (previously calling candidate CSV import modal) into separated `Export XLSX` and `Import Students` actions.
- Fixed `AdminStudentAccessReassessView` in `admin_views.py` to accept both `register_number`/`identifier` and `action`/`action_type` while excluding simulation candidates.
- Fixed `QuickActionsModals.tsx` `ImportQuestionsCSVModal` positional argument bug in `importAdminQuestionsCSV(...)`.
- Fixed `AdminStatsView` to include both `status` and `overall_status` inside `question_bank_health`.
- Mounted Wizard `<AdminQuestionEditorModal>` outside the early `if (isCreatingWizard)` return in `AdminAssessmentsView.tsx` and isolated `handleTestRun` token handoff from `localStorage`.

---

## 3. Database Migration & Production Compatibility (`master` vs `phase-1-testing`)

- **New Migration Added:** `backend/apps/assessments/migrations/0026_assessmentconfig_enable_alt_row_styling_and_more.py` (with PostgreSQL reference DDL in `docs/PHASE_REPAIR_MIGRATION_0026.sql`).
- **Cumulative Delta vs `production/master` (`43626b4`, stops at `0014`):** `testing/phase-1-testing` carries migrations `0015` through `0026`. All fields added in `0026` have safe server/model defaults (`is_global=True`, `is_simulation=False`, default hex palette), allowing backward-compatible rollout and safe rollback (`python manage.py migrate assessments 0025`).

---

## 4. Verification Summary (Observed Outputs After Edits)

1. **Django Migrations Check (`DB_ENGINE=sqlite`):**
   - `python manage.py makemigrations --check --dry-run` -> `No changes detected` (exit code `0`).
2. **Backend Automated Test Suite (`DB_ENGINE=sqlite`):**
   - Targeted repair suite: `python manage.py test apps.assessments.test_workflow_repairs --verbosity=2` -> **Ran 7 tests -> OK** (exit code `0`).
   - Full suite: `python manage.py test --verbosity=1` -> **Ran 345 tests: 344 passed, 1 pre-existing failure** in `apps.assessments.test_phase22_workflows.Phase22WorkflowTests.test_drive_invitations_and_validity` line `120` (`'DRIVE_INVITATION' != 'DRIVE'`, reflecting intentional `ResolveAccessCodeView` response consumed by `frontend/src/api/assessment.ts`).
3. **Frontend Static Checks & Production Build (run after final `.tsx` edit):**
   - `npm run lint` (`oxlint`) -> **0 errors**, 94 pre-existing warnings (exit code `0`).
   - `npm run build` (`tsc -b && vite build`) -> **Passed** (`200 modules transformed`, `built in 844ms`, exit code `0`).
4. **Live Browser Playwright E2E Verification (`--use-fake-ui-for-media-stream`, real Django `8000` + Vite `5173` servers):**
   - Admin login -> Global Config XLSX hex persistence across reload (`#123456`/`#234567`) -> Results `Export XLSX` HTTP `200` -> Question Pool CSV import with unchecked `"Also add imported questions to the Global Question Bank"` checkbox verified isolated from Global Bank -> Coding Question creation & reload persistence (`201 Created`) -> Wizard inline `+ Create New Drive` retaining Wizard title -> `?simulation=true` Test Run banner with zero Sentinel calls and zero `localStorage` pollution -> Student registration -> 2-slide prep without duplicate camera/screen buttons -> Single canonical `CSL SENTINEL` gate launch: **All 8 E2E checks passed (exit code `0`)**. Temporary test DB state was restored cleanly afterward.
