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
  normalizeCanonicalLanguage,
  BrowserCodeExecutionAdapter,
} = adapterMod;

test('normalizeCodeOutput aligns CRLF/CR, trailing spaces, and leading/trailing blank lines', () => {
  assert.equal(normalizeCodeOutput(null), '');
  assert.equal(normalizeCodeOutput(undefined), '');
  assert.equal(normalizeCodeOutput('\r\n\r\nhello   \r\nworld\t \r\n\r\n'), 'hello\nworld');
  assert.equal(normalizeCodeOutput('42\n'), '42');
});

test('normalizeCanonicalLanguage maps python aliases cleanly', () => {
  assert.equal(normalizeCanonicalLanguage('python3'), 'python');
  assert.equal(normalizeCanonicalLanguage('PY'), 'python');
  assert.equal(normalizeCanonicalLanguage('Java '), 'java');
});

test('BrowserCodeExecutionAdapter reports Java honestly as BROWSER_RUNTIME_UNSUPPORTED without network calls', async () => {
  const adapter = new BrowserCodeExecutionAdapter();
  assert.equal(adapter.isBrowserExecutionSupported('java'), false);
  const reason = adapter.getUnsupportedReason('java');
  assert.match(reason, /199xVM|Java/i);

  const customRes = await adapter.runCustomInput({
    sourceCode: 'public class Main { public static void main(String[] a) {} }',
    language: 'java',
    stdin: '5',
  });
  assert.equal(customRes.status, 'BROWSER_RUNTIME_UNSUPPORTED');
  assert.equal(customRes.executionTimeMs, 0);

  const sampleRes = await adapter.runSampleTests(
    {
      sourceCode: 'public class Main {}',
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
  const res = await adapter.runCustomInput({
    sourceCode: '   \n  ',
    language: 'python',
    stdin: '',
  });
  assert.equal(res.status, 'COMPILATION_ERROR');
  assert.match(res.compilationErrors, /empty/i);
});
