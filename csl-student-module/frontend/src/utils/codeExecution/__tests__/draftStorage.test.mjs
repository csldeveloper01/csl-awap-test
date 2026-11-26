import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterPath = path.resolve(__dirname, '..', 'BrowserCodeExecutionAdapter.ts');
const draftPath = path.resolve(__dirname, '..', 'draftStorage.ts');

async function loadDraftStorageModule() {
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  const adapterJs = ts.transpileModule(adapterSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const adapterUrl = `data:text/javascript;base64,${Buffer.from(adapterJs, 'utf8').toString('base64')}`;

  const draftSource = fs
    .readFileSync(draftPath, 'utf8')
    .replace("from './BrowserCodeExecutionAdapter'", `from '${adapterUrl}'`);
  const draftJs = ts.transpileModule(draftSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(draftJs, 'utf8').toString('base64')}`);
}

const {
  CODING_DRAFT_PREFIX,
  resolveDraftQuestionKey,
  buildCodingDraftKey,
  loadCodingDraft,
  saveCodingDraft,
  resetCodingDraft,
  clearAttemptCodingDrafts,
} = await loadDraftStorageModule();

function createMockSessionStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(idx) {
      return Array.from(store.keys())[idx] ?? null;
    },
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
  };
}

test('Section 12 draft preservation: 19-step lifecycle across languages, questions, reloads, resets, and attempts', () => {
  const storage = createMockSessionStorage();
  const attempt1 = '11111111-1111-4111-8111-111111111111';
  const attempt2 = '22222222-2222-4222-8222-222222222222';
  const q1 = resolveDraftQuestionKey(101, 1);
  const q2 = resolveDraftQuestionKey(202, 2);

  // 1-2. Stable key construction & fallback order resolution
  assert.equal(CODING_DRAFT_PREFIX, 'csl_coding_draft_v1');
  assert.equal(q1, '101');
  assert.equal(resolveDraftQuestionKey(undefined, 4), 'order_4');
  assert.equal(buildCodingDraftKey(attempt1, q1, 'python3'), `csl_coding_draft_v1:${attempt1}:101:python`);
  assert.equal(buildCodingDraftKey(attempt1, q1, 'java17'), `csl_coding_draft_v1:${attempt1}:101:java`);

  // 3-4. Initial Question 1 Python draft loads empty/null -> falls back to boilerplate cleanly
  assert.equal(loadCodingDraft(attempt1, q1, 'python', storage), null);
  const pyCodeQ1 = 'print("python-q1-custom")';
  saveCodingDraft(attempt1, q1, 'python', pyCodeQ1, storage);
  assert.equal(loadCodingDraft(attempt1, q1, 'python', storage), pyCodeQ1);

  // 5-6. Switching Q1 -> Java before Java edits loads Java boilerplate cleanly without overwriting Python
  assert.equal(loadCodingDraft(attempt1, q1, 'java', storage), null);
  const javaCodeQ1 = 'public class Main { public static void main(String[] a) { System.out.println("java-q1"); } }';
  saveCodingDraft(attempt1, q1, 'java', javaCodeQ1, storage);

  // 7-8. Switching back Q1 Java -> Python restores Python draft intact, and back to Java keeps Java intact
  assert.equal(loadCodingDraft(attempt1, q1, 'python', storage), pyCodeQ1);
  assert.equal(loadCodingDraft(attempt1, q1, 'java', storage), javaCodeQ1);

  // 9-11. Navigating Q1 -> Q2 loads Q2 defaults cleanly and saves independent Q2 drafts
  assert.equal(loadCodingDraft(attempt1, q2, 'python', storage), null);
  assert.equal(loadCodingDraft(attempt1, q2, 'java', storage), null);
  const pyCodeQ2 = 'print("python-q2-custom")';
  saveCodingDraft(attempt1, q2, 'python', pyCodeQ2, storage);

  // 12-13. Returning Q2 -> Q1 restores both Q1 Python & Java drafts, while Q2 remains preserved
  assert.equal(loadCodingDraft(attempt1, q1, 'python', storage), pyCodeQ1);
  assert.equal(loadCodingDraft(attempt1, q1, 'java', storage), javaCodeQ1);
  assert.equal(loadCodingDraft(attempt1, q2, 'python', storage), pyCodeQ2);

  // 14. Simulating component remount / browser page reload (same sessionStorage backing instance, fresh adapter reads)
  const pyQ1AfterReload = loadCodingDraft(attempt1, q1, 'python', storage);
  const javaQ1AfterReload = loadCodingDraft(attempt1, q1, 'java', storage);
  assert.equal(pyQ1AfterReload, pyCodeQ1);
  assert.equal(javaQ1AfterReload, javaCodeQ1);

  // 15-16. Resetting Java boilerplate on Q1 resets ONLY Q1 Java and preserves Q1 Python & Q2 Python
  const javaBoilerplate = 'public class Main {}';
  const resetResult = resetCodingDraft(attempt1, q1, 'java', javaBoilerplate, storage);
  assert.equal(resetResult, javaBoilerplate);
  assert.equal(loadCodingDraft(attempt1, q1, 'java', storage), javaBoilerplate);
  assert.equal(loadCodingDraft(attempt1, q1, 'python', storage), pyCodeQ1);
  assert.equal(loadCodingDraft(attempt1, q2, 'python', storage), pyCodeQ2);

  // 17-19. Per-attempt isolation & finalize cleanup (attempt1 cleared, attempt2 untouched)
  saveCodingDraft(attempt2, q1, 'python', 'print("attempt2-isolated")', storage);
  clearAttemptCodingDrafts(attempt1, storage);
  assert.equal(loadCodingDraft(attempt1, q1, 'python', storage), null);
  assert.equal(loadCodingDraft(attempt1, q1, 'java', storage), null);
  assert.equal(loadCodingDraft(attempt1, q2, 'python', storage), null);
  assert.equal(loadCodingDraft(attempt2, q1, 'python', storage), 'print("attempt2-isolated")');
});
