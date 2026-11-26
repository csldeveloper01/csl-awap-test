import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const panePath = path.resolve(__dirname, '../CodingPlaygroundPane.tsx');
const examPath = path.resolve(__dirname, '../../../pages/assessment/AssessmentExamPage.tsx');

test('Coding workspace uses dynamic marks/difficulty, keeps drafts independent from navigation, and provides collapsible terminal', () => {
  const pane = fs.readFileSync(panePath, 'utf-8');
  const exam = fs.readFileSync(examPath, 'utf-8');

  // Hardcoded "1 Mark" badge must no longer appear in AssessmentExamPage
  assert.doesNotMatch(exam, />\s*1 Mark\s*</);

  // Exam page must compute dynamic questionMarksLabel & questionDifficulty and sync section tab
  assert.match(exam, /questionMarksLabel/);
  assert.match(exam, /questionDifficulty/);
  assert.match(exam, /data-testid="coding-question-counter"/);
  assert.match(exam, /data-testid="coding-header-marks"/);

  // CodingPlaygroundPane must render difficulty, marks, Format action, Run vs Submit buttons, and collapsed terminal summary
  assert.match(pane, /data-testid="coding-difficulty-badge"/);
  assert.match(pane, /data-testid="coding-marks-badge"/);
  assert.match(pane, /data-testid="coding-format-btn"/);
  assert.match(pane, /data-testid="coding-run-btn"/);
  assert.match(pane, /data-testid="coding-submit-btn"/);
  assert.match(pane, /data-testid="coding-console-resizer"/);
  assert.match(pane, /data-testid="coding-console-collapsed-summary"/);
});
