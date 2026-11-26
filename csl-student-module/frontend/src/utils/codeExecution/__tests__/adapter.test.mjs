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

test('JavaWasmWorkerDriver separates compilation budget from execution timeout, ignores stale requestIds, and reuses warmed worker across non-timeout runs', async () => {
  const originalWorker = globalThis.Worker;
  let spawnCount = 0;
  let terminateCount = 0;

  class MockJavaWorker {
    constructor() {
      spawnCount += 1;
      this.onmessage = null;
      this.onerror = null;
    }
    terminate() {
      terminateCount += 1;
    }
    postMessage(msg) {
      if (msg.cmd === 'init') {
        setTimeout(() => {
          this.onmessage?.({ data: { type: 'initialized', requestId: msg.requestId, initMs: 12 } });
        }, 10);
        return;
      }
      if (msg.cmd === 'warmup') {
        setTimeout(() => {
          this.onmessage?.({ data: { type: 'warmed', ok: true, requestId: msg.requestId, warmupMs: 15 } });
        }, 10);
        return;
      }
      if (msg.cmd === 'run') {
        if (msg.source.includes('SLOW_COMPILE')) {
          // Simulate slow 700ms compile phase when execution timeout is only 500ms:
          // Must NOT trigger false TIME_LIMIT_EXCEEDED during compile!
          setTimeout(() => {
            this.onmessage?.({ data: { type: 'phase', requestId: msg.requestId, phase: 'COMPILING' } });
          }, 5);
          setTimeout(() => {
            this.onmessage?.({ data: { type: 'phase', requestId: msg.requestId, phase: 'GENERATING_WASM', compileMs: 350 } });
          }, 350);
          setTimeout(() => {
            this.onmessage?.({ data: { type: 'phase', requestId: msg.requestId, phase: 'RUNNING', compileMs: 350, generateMs: 350 } });
          }, 700);
          setTimeout(() => {
            // Also inject a stale response for a different requestId to verify correlation guard
            this.onmessage?.({ data: { type: 'result', requestId: 'stale_id', ok: true, stdout: 'STALE', runMs: 1 } });
            this.onmessage?.({
              data: {
                type: 'result',
                requestId: msg.requestId,
                ok: true,
                phase: 'ACCEPTED',
                compileMs: 350,
                generateMs: 350,
                runMs: 12.4,
                stdout: 'OK_AFTER_COMPILE\n',
                stderr: '',
                diagnostics: [],
              },
            });
          }, 740);
          return;
        }
        if (msg.source.includes('COMPILE_FAIL')) {
          setTimeout(() => {
            this.onmessage?.({
              data: {
                type: 'result',
                requestId: msg.requestId,
                ok: false,
                phase: 'COMPILATION_ERROR',
                compileMs: 80,
                stdout: '',
                stderr: 'Main.java:1: error: cannot find symbol',
                diagnostics: [{ severity: 'error', message: 'cannot find symbol' }],
              },
            });
          }, 15);
          return;
        }
        if (msg.source.includes('INFINITE_LOOP')) {
          setTimeout(() => {
            this.onmessage?.({ data: { type: 'phase', requestId: msg.requestId, phase: 'RUNNING' } });
          }, 10);
          // Never responds -> outer execution budget (500ms) terminates worker
          return;
        }
        setTimeout(() => {
          this.onmessage?.({ data: { type: 'phase', requestId: msg.requestId, phase: 'RUNNING' } });
          this.onmessage?.({
            data: {
              type: 'result',
              requestId: msg.requestId,
              ok: true,
              phase: 'ACCEPTED',
              compileMs: 20,
              generateMs: 25,
              runMs: 5.2,
              stdout: 'RECOVERED_RUN\n',
              stderr: '',
              diagnostics: [],
            },
          });
        }, 15);
      }
    }
  }

  try {
    globalThis.Worker = MockJavaWorker;
    const adapter = new BrowserCodeExecutionAdapter();

    // 1. Slow compile (700ms) must NOT hit TLE when execution timeoutMs is 500ms
    const res1 = await adapter.runCustomInput({
      sourceCode: '// SLOW_COMPILE\npublic class Main { public static void main(String[] a) {} }',
      language: 'java',
      timeoutMs: 500,
    });
    assert.equal(res1.status, 'ACCEPTED');
    assert.equal(res1.stdout.trim(), 'OK_AFTER_COMPILE');
    assert.equal(res1.phaseTimings?.compileMs, 350);
    assert.equal(res1.phaseTimings?.generateMs, 350);
    assert.equal(spawnCount, 1);
    assert.equal(terminateCount, 0);

    // 2. Compile error keeps warmed worker alive (spawnCount remains 1, terminateCount remains 0)
    const resErr = await adapter.runCustomInput({
      sourceCode: '// COMPILE_FAIL\npublic class Main {}',
      language: 'java',
      timeoutMs: 500,
    });
    assert.equal(resErr.status, 'COMPILATION_ERROR');
    assert.equal(spawnCount, 1);
    assert.equal(terminateCount, 0);
    assert.equal(adapter.getRuntimeState('java'), 'READY');

    // 3. Infinite loop triggers TLE and terminates worker (terminateCount -> 1)
    const resTle = await adapter.runCustomInput({
      sourceCode: '// INFINITE_LOOP\npublic class Main {}',
      language: 'java',
      timeoutMs: 500,
    });
    assert.equal(resTle.status, 'TIME_LIMIT_EXCEEDED');
    assert.equal(terminateCount, 1);

    // 4. Subsequent valid run cleanly respawns worker and recovers
    const resRec = await adapter.runCustomInput({
      sourceCode: 'public class Main { public static void main(String[] a) {} }',
      language: 'java',
      timeoutMs: 500,
    });
    assert.equal(resRec.status, 'ACCEPTED');
    assert.equal(resRec.stdout.trim(), 'RECOVERED_RUN');
    assert.equal(spawnCount, 2);
  } finally {
    if (originalWorker === undefined) {
      delete globalThis.Worker;
    } else {
      globalThis.Worker = originalWorker;
    }
  }
});
