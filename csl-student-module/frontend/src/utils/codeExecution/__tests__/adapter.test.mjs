import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterPath = path.resolve(__dirname, '..', 'BrowserCodeExecutionAdapter.ts');

function loadAdapterModule() {
  const source = fs.readFileSync(adapterPath, 'utf8');
  // Replace Vite's import.meta.url worker constructor pattern only in transpiled output?
  // PyodideWorkerDriver does not instantiate Worker during module load or Java/empty-code calls.
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(transpiled.outputText, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const adapterMod = await loadAdapterModule();
const {
  normalizeCodeOutput,
  compareOutputs,
  normalizeCanonicalLanguage,
  extractJavaMainClass,
  BrowserCodeExecutionAdapter,
} = adapterMod;

test('normalizeCodeOutput aligns CRLF/CR, trailing spaces, and leading/trailing blank lines', () => {
  assert.equal(normalizeCodeOutput(null), '');
  assert.equal(normalizeCodeOutput(undefined), '');
  assert.equal(normalizeCodeOutput('\r\n\r\nhello   \r\nworld\t \r\n\r\n'), 'hello\nworld');
  assert.equal(normalizeCodeOutput('42\n'), '42');
});

test('normalizeCanonicalLanguage maps python and java aliases cleanly', () => {
  assert.equal(normalizeCanonicalLanguage('python3'), 'python');
  assert.equal(normalizeCanonicalLanguage('Python 3'), 'python');
  assert.equal(normalizeCanonicalLanguage('PY'), 'python');
  assert.equal(normalizeCanonicalLanguage('Java '), 'java');
  assert.equal(normalizeCanonicalLanguage('java17'), 'java');
  assert.equal(normalizeCanonicalLanguage('Java 21'), 'java');
  assert.equal(normalizeCanonicalLanguage('javascript'), 'javascript');
});

test('extractJavaMainClass resolves public class or main class cleanly', () => {
  assert.equal(extractJavaMainClass('public class Solution { public static void main(String[] a) {} }'), 'Solution');
  assert.equal(extractJavaMainClass('import java.util.*;\nclass Helper {}\npublic class Main { public static void main(String[] args) {} }'), 'Main');
  assert.equal(extractJavaMainClass('class Entry { public static void main(String[] a) {} }'), 'Entry');
});

test('BrowserCodeExecutionAdapter marks Java as supported via TeaVM WASM worker driver', async () => {
  const adapter = new BrowserCodeExecutionAdapter();
  const originalWorker = globalThis.Worker;
  try {
    // When Web Worker + WebAssembly exist (browser environment), both Python & Java are supported
    globalThis.Worker = class {};
    assert.equal(adapter.isBrowserExecutionSupported('java'), true);
    assert.equal(adapter.isBrowserExecutionSupported('java17'), true);
    assert.equal(adapter.isBrowserExecutionSupported('python'), true);
    assert.equal(adapter.getUnsupportedReason('java'), '');
    assert.equal(adapter.getRuntimeState('java'), 'IDLE');
  } finally {
    if (originalWorker === undefined) {
      delete globalThis.Worker;
    } else {
      globalThis.Worker = originalWorker;
    }
  }

  // In Node without Web Worker global, execution fails cleanly with RUNTIME_LOAD_ERROR instead of throwing
  const customRes = await adapter.runCustomInput({
    sourceCode: 'public class Main { public static void main(String[] a) {} }',
    language: 'java',
    stdin: '5',
  });
  assert.equal(customRes.status, 'RUNTIME_LOAD_ERROR');

  const sampleRes = await adapter.runSampleTests(
    {
      sourceCode: 'public class Main { public static void main(String[] a) {} }',
      language: 'java',
    },
    [{ id: 'tc1', input_text: '1', expected_output: '1' }]
  );
  assert.equal(sampleRes.overallStatus, 'BROWSER_RUNTIME_UNSUPPORTED');
  assert.equal(sampleRes.passedCount, 0);
  assert.equal(sampleRes.totalCount, 1);
});

test('BrowserCodeExecutionAdapter rejects empty source code locally with COMPILATION_ERROR', async () => {
  const adapter = new BrowserCodeExecutionAdapter();
  for (const language of ['python', 'java']) {
    const res = await adapter.runCustomInput({
      sourceCode: '   \n  ',
      language,
      stdin: '',
    });
    assert.equal(res.status, 'COMPILATION_ERROR');
    assert.match(res.compilationErrors, /empty/i);
  }
});

test('Phase 2.3: compareOutputs supports EXACT, TRIMMED, and WHITESPACE_NORMALIZED without ignoring meaningful differences', () => {
  // EXACT rejects leading/trailing whitespace differences
  assert.equal(compareOutputs('42\n', '42', 'EXACT'), false);
  assert.equal(compareOutputs('42\r\n', '42\n', 'EXACT'), true);
  assert.equal(compareOutputs('hello', 'Hello', 'EXACT'), false);

  // TRIMMED (default) strips trailing spaces & boundary blank lines cleanly, preserves internal meaning
  assert.equal(compareOutputs('  42\r\n\n', '  42\n', 'TRIMMED'), true);
  assert.equal(compareOutputs('1 2', '1  2', 'TRIMMED'), false);
  assert.equal(compareOutputs('hello', 'Hello', 'TRIMMED'), false);

  // WHITESPACE_NORMALIZED collapses internal horizontal spaces, keeps line structure & token boundaries
  assert.equal(compareOutputs('1   2\n3   4\n', '1 2\n3 4', 'WHITESPACE_NORMALIZED'), true);
  assert.equal(compareOutputs('12', '1 2', 'WHITESPACE_NORMALIZED'), false);
});

test('Phase 2.2: evaluateTestCases computes weighted score and stops cleanly on empty/unsupported runtimes', async () => {
  const adapter = new BrowserCodeExecutionAdapter();
  const emptyEval = await adapter.evaluateTestCases(
    { sourceCode: '   ', language: 'python' },
    [{ id: 'tc1', input_text: '1', expected_output: '1' }],
    'TRIMMED',
    10
  );
  assert.equal(emptyEval.overallStatus, 'COMPILATION_ERROR');
  assert.equal(emptyEval.scoreAwarded, 0);
  assert.equal(emptyEval.failedCount, 1);

  const customDriverRes = await adapter.evaluateTestCases(
    { sourceCode: 'print(1)', language: 'ruby' },
    [{ id: 'tc1', input_text: '1', expected_output: '1' }],
    'TRIMMED',
    10
  );
  assert.equal(customDriverRes.overallStatus, 'BROWSER_RUNTIME_UNSUPPORTED');
  assert.equal(customDriverRes.scoreAwarded, 0);
});
