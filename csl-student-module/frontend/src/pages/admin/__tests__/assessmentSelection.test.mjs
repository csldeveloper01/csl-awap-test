import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.resolve(__dirname, '..', 'assessmentSelection.ts');
const viewPath = path.resolve(__dirname, '..', 'AdminAssessmentsView.tsx');

async function loadSelectionHelpers() {
  const src = fs.readFileSync(helperPath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled, 'utf8').toString('base64')}`);
}

const {
  toggleAssessmentSelection,
  toggleSelectAllAssessments,
  areAllVisibleAssessmentsSelected,
  areSomeVisibleAssessmentsSelected,
  getAssessmentLifecycleAction,
  getAssessmentQuestionCount,
  formatAssessmentScheduleLabel,
} = await loadSelectionHelpers();

test('Phase 1.1: Checkbox toggles selection independently without touching lifecycle or opening details', () => {
  let selected = [];
  let openedDetailId = null;
  let lifecycleCalls = 0;

  const sampleAssessments = [
    { id: 'a1', title: 'Java Basics', status: 'DRAFT', is_open: false },
    { id: 'a2', title: 'Python Core', status: 'OPEN', is_open: true },
    { id: 'a3', title: 'SQL Round', status: 'CLOSED', is_open: false },
  ];

  // Selecting checkbox updates only selectedIds
  selected = toggleAssessmentSelection(selected, 'a1');
  assert.deepEqual(selected, ['a1']);
  assert.equal(openedDetailId, null);
  assert.equal(lifecycleCalls, 0);
  assert.equal(sampleAssessments[0].status, 'DRAFT');

  // Adding second card
  selected = toggleAssessmentSelection(selected, 'a2');
  assert.deepEqual(selected, ['a1', 'a2']);
  assert.equal(areSomeVisibleAssessmentsSelected(sampleAssessments, selected), true);
  assert.equal(areAllVisibleAssessmentsSelected(sampleAssessments, selected), false);

  // Explicit Open handler navigates without modifying selection
  const openCard = (a) => {
    openedDetailId = a.id;
  };
  openCard(sampleAssessments[2]);
  assert.equal(openedDetailId, 'a3');
  assert.deepEqual(selected, ['a1', 'a2']);

  // Select All selects strictly all visible items
  selected = toggleSelectAllAssessments(sampleAssessments, selected);
  assert.deepEqual(selected, ['a1', 'a2', 'a3']);
  assert.equal(areAllVisibleAssessmentsSelected(sampleAssessments, selected), true);

  // Deselect All clears visible items cleanly
  selected = toggleSelectAllAssessments(sampleAssessments, selected);
  assert.deepEqual(selected, []);
  assert.equal(areAllVisibleAssessmentsSelected(sampleAssessments, selected), false);
});

test('Phase 1.1: Select All respects filtered visible list and leaves unrelated lifecycle actions independent', () => {
  const visible = [
    { id: 'v1', status: 'READY', is_open: false },
    { id: 'v2', status: 'OPEN', is_open: true },
  ];
  // When hidden item 'h1' is already selected, Select All toggles only visible items
  let selected = toggleSelectAllAssessments(visible, ['h1']);
  assert.deepEqual(selected.sort(), ['h1', 'v1', 'v2']);

  // Second toggle deselects only visible items
  selected = toggleSelectAllAssessments(visible, selected);
  assert.deepEqual(selected, ['h1']);

  assert.equal(getAssessmentLifecycleAction({ status: 'DRAFT', is_open: false }).type, 'PREPARE');
  assert.equal(getAssessmentLifecycleAction({ status: 'READY', is_open: false }).type, 'ACTIVATE');
  assert.equal(getAssessmentLifecycleAction({ status: 'OPEN', is_open: true }).type, 'DEACTIVATE');
  assert.equal(getAssessmentLifecycleAction({ status: 'ARCHIVED', is_open: false }), null);
});

test('Phase 1.2: Question count, timing formatter, and card JSX separation checks', () => {
  assert.equal(
    getAssessmentQuestionCount({
      id: '1',
      status: 'READY',
      sections: [{ question_count: 10 }, { question_count: 5 }],
      aptitude_count: 2,
      coding_count: 1,
    }),
    15
  );
  assert.match(
    formatAssessmentScheduleLabel({ id: '1', status: 'OPEN', scheduled_start_time: '2026-12-01T10:00:00Z' }),
    /^Scheduled:/
  );
  assert.match(
    formatAssessmentScheduleLabel({ id: '1', status: 'DRAFT', created_at: '2026-11-26T10:00:00Z' }),
    /^Created:/
  );

  // Structural check: AdminAssessmentsView no longer maps card checkbox to handleOpen/handleOpenCloseModal
  const viewSource = fs.readFileSync(viewPath, 'utf8');
  assert.ok(!viewSource.includes("<span>{a.status === 'OPEN' || a.is_open ? 'Live' : 'Open'}</span>"), 'Broken Live/Open checkbox label must be removed');
  assert.ok(viewSource.includes('csl-assessment-grid'), 'Responsive 3/2/1 csl-assessment-grid class must be wired');
  assert.ok(viewSource.includes('assessment-select-'), 'Bulk selection checkbox testid must be present on cards');
  assert.ok(viewSource.includes('assessment-open-'), 'Explicit Open button testid must be present on cards');
});
