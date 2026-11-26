import type {
  BrowserExecutionRequest,
  BrowserExecutionResult,
  BrowserRuntimeState,
  LanguageExecutionDriver,
  SampleSuiteExecutionResult,
  SampleTestCaseSpec,
  SampleTestExecutionResult,
} from './types';

export const DEFAULT_MAX_INPUT_CHARS = 256_000;
export const DEFAULT_MAX_OUTPUT_CHARS = 100_000;
export const DEFAULT_EXECUTION_TIMEOUT_MS = 5_000;
export const RUNTIME_INIT_GRACE_MS = 30_000;

/**
 * Authoritative output comparison normalizer aligned with backend coding_service.py:
 * - Normalizes CRLF/CR -> LF
 * - Strips trailing whitespace per line and leading/trailing blank lines
 */
export function normalizeCodeOutput(text?: string | null): string {
  if (!text) return '';
  const unified = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = unified.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export function normalizeCanonicalLanguage(lang: string): 'python' | 'java' | string {
  const raw = (lang || '').trim().toLowerCase();
  const compact = raw.replace(/[\s_-]+/g, '');
  if (compact === 'python' || compact === 'python3' || compact === 'py') return 'python';
  if (compact === 'java' || compact === 'java17' || compact === 'java21' || compact === 'java8') return 'java';
  return raw;
}

/**
 * Resolves the Java entry class name so both `public class Solution` (CSL boilerplate)
 * and `public class Main` compile cleanly with javac in browser TeaVM.
 */
export function extractJavaMainClass(sourceCode: string): string {
  const stripped = (sourceCode || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const pubMatch = stripped.match(/\bpublic\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (pubMatch?.[1]) return pubMatch[1];
  const anyClass = stripped.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (anyClass?.[1]) return anyClass[1];
  return 'Main';
}

function truncateText(text: string, maxChars: number, label: string): { value: string; truncated: boolean } {
  if (!text || text.length <= maxChars) {
    return { value: text || '', truncated: false };
  }
  return {
    value: `${text.slice(0, maxChars)}\n... [${label} truncated at ${maxChars} characters]`,
    truncated: true,
  };
}

class PyodideWorkerDriver implements LanguageExecutionDriver {
  public readonly language = 'python';
  private worker: Worker | null = null;
  private runtimeState: BrowserRuntimeState = 'IDLE';
  private activeReject: ((res: BrowserExecutionResult) => void) | null = null;
  private activeTimer: number | null = null;
  private activeInitTimer: number | null = null;
  private activeStateListener: ((state: BrowserRuntimeState, detail?: string) => void) | undefined;

  isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  getRuntimeState(): BrowserRuntimeState {
    return this.runtimeState;
  }

  private setState(state: BrowserRuntimeState, detail?: string) {
    this.runtimeState = state;
    this.activeStateListener?.(state, detail);
  }

  private clearTimers() {
    if (this.activeTimer !== null) {
      window.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.activeInitTimer !== null) {
      window.clearTimeout(this.activeInitTimer);
      this.activeInitTimer = null;
    }
  }

  private terminateWorker() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore termination cleanup error
      }
      this.worker = null;
    }
    this.setState('IDLE');
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./pythonWorker.ts', import.meta.url), { type: 'module' });
    this.worker = w;
    return w;
  }

  warmup(onStateChange?: (state: BrowserRuntimeState, detail?: string) => void): void {
    if (!this.isSupported()) return;
    this.activeStateListener = onStateChange;
    if (this.runtimeState === 'READY' || this.runtimeState === 'LOADING_RUNTIME') {
      onStateChange?.(this.runtimeState);
      return;
    }
    const worker = this.ensureWorker();
    if (this.runtimeState === 'IDLE') {
      worker.onmessage = (evt: MessageEvent) => {
        if (evt.data?.type === 'RUNTIME_STATE') {
          this.setState(evt.data.state, evt.data.detail);
        }
      };
      worker.onerror = (err) => {
        this.setState('ERROR', err.message || 'Python worker error');
      };
      worker.postMessage({ type: 'INIT', indexUrl: '/pyodide/' });
    }
  }

  cancel(): void {
    this.clearTimers();
    if (this.activeReject) {
      const resolveAsCancelled = this.activeReject;
      this.activeReject = null;
      this.terminateWorker();
      resolveAsCancelled({
        status: 'CANCELLED',
        stdout: '',
        stderr: 'Execution cancelled cleanly (Web Worker terminated).',
        compilationErrors: '',
        runtimeErrors: 'Execution cancelled cleanly (Web Worker terminated).',
        executionTimeMs: 0,
      });
    } else {
      this.terminateWorker();
    }
  }

  execute(req: BrowserExecutionRequest): Promise<BrowserExecutionResult> {
    if (!this.isSupported()) {
      return Promise.resolve({
        status: 'RUNTIME_LOAD_ERROR',
        stdout: '',
        stderr: 'Web Workers are not available in this browser environment.',
        compilationErrors: '',
        runtimeErrors: 'Web Workers are not available in this browser environment.',
        executionTimeMs: 0,
      });
    }

    const maxIn = req.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
    const maxOut = req.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const stdin = req.stdin ?? '';
    if (stdin.length > maxIn) {
      return Promise.resolve({
        status: 'RUNTIME_ERROR',
        stdout: '',
        stderr: `Input exceeds maximum browser limit of ${maxIn} characters.`,
        compilationErrors: '',
        runtimeErrors: `Input exceeds maximum browser limit of ${maxIn} characters.`,
        executionTimeMs: 0,
      });
    }

    if (this.activeReject) {
      this.cancel();
    }

    const timeoutMs = Math.max(500, req.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS);
    this.activeStateListener = req.onRuntimeStateChange;
    const worker = this.ensureWorker();
    const requestId = `py_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<BrowserExecutionResult>((resolve) => {
      let settled = false;
      const finish = (res: BrowserExecutionResult) => {
        if (settled) return;
        settled = true;
        this.clearTimers();
        this.activeReject = null;
        resolve(res);
      };

      this.activeReject = finish;

      const armExecutionTimer = () => {
        if (this.activeTimer !== null) return;
        this.activeTimer = window.setTimeout(() => {
          this.terminateWorker();
          finish({
            status: 'TIME_LIMIT_EXCEEDED',
            stdout: '',
            stderr: `Execution timed out after ${(timeoutMs / 1000).toFixed(1)}s and the Python Web Worker was terminated.`,
            compilationErrors: '',
            runtimeErrors: `Execution timed out after ${(timeoutMs / 1000).toFixed(1)}s and the Python Web Worker was terminated.`,
            executionTimeMs: timeoutMs,
          });
        }, timeoutMs);
      };

      this.activeInitTimer = window.setTimeout(() => {
        if (this.runtimeState !== 'READY' && this.runtimeState !== 'EXECUTING') {
          this.terminateWorker();
          finish({
            status: 'RUNTIME_LOAD_ERROR',
            stdout: '',
            stderr: 'Timed out while loading the Python 3 (Pyodide) Web Worker runtime.',
            compilationErrors: '',
            runtimeErrors: 'Timed out while loading the Python 3 (Pyodide) Web Worker runtime.',
            executionTimeMs: 0,
          });
        }
      }, RUNTIME_INIT_GRACE_MS);

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data) return;

        if (data.type === 'RUNTIME_STATE') {
          this.setState(data.state, data.detail);
          if (data.state === 'EXECUTING') {
            if (this.activeInitTimer !== null) {
              window.clearTimeout(this.activeInitTimer);
              this.activeInitTimer = null;
            }
            armExecutionTimer();
          } else if (data.state === 'ERROR') {
            this.terminateWorker();
            finish({
              status: 'RUNTIME_LOAD_ERROR',
              stdout: '',
              stderr: data.detail || 'Failed to initialize Python 3 runtime.',
              compilationErrors: '',
              runtimeErrors: data.detail || 'Failed to initialize Python 3 runtime.',
              executionTimeMs: 0,
            });
          }
          return;
        }

        if (data.type === 'RUN_RESULT' && data.requestId === requestId) {
          finish(data.result as BrowserExecutionResult);
        }
      };

      worker.onerror = (err) => {
        this.terminateWorker();
        finish({
          status: 'RUNTIME_ERROR',
          stdout: '',
          stderr: err.message || 'Unhandled Web Worker crash during Python execution.',
          compilationErrors: '',
          runtimeErrors: err.message || 'Unhandled Web Worker crash during Python execution.',
          executionTimeMs: 0,
        });
      };

      if (this.runtimeState === 'READY') {
        armExecutionTimer();
      }

      worker.postMessage({
        type: 'RUN',
        requestId,
        sourceCode: req.sourceCode,
        stdin,
        maxOutputChars: maxOut,
      });
    });
  }
}

/**
 * Browser-side Java execution driver powered by @live-codes/java-wasm
 * (OpenJDK javac + TeaVM WasmGC running offline in a dedicated Web Worker).
 * Supports System.in / Scanner, collections, generics, classes, and worker timeout termination.
 */
class JavaWasmWorkerDriver implements LanguageExecutionDriver {
  public readonly language = 'java';
  private worker: Worker | null = null;
  private runtimeState: BrowserRuntimeState = 'IDLE';
  private initPromise: Promise<void> | null = null;
  private activeReject: ((res: BrowserExecutionResult) => void) | null = null;
  private activeTimer: number | null = null;
  private activeInitTimer: number | null = null;
  private activeStateListener: ((state: BrowserRuntimeState, detail?: string) => void) | undefined;

  isSupported(): boolean {
    return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
  }

  getRuntimeState(): BrowserRuntimeState {
    return this.runtimeState;
  }

  getUnsupportedReason(): string {
    return 'Web Workers or WebAssembly are unavailable in this browser environment.';
  }

  private setState(state: BrowserRuntimeState, detail?: string) {
    this.runtimeState = state;
    this.activeStateListener?.(state, detail);
  }

  private clearTimers() {
    if (this.activeTimer !== null) {
      window.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.activeInitTimer !== null) {
      window.clearTimeout(this.activeInitTimer);
      this.activeInitTimer = null;
    }
  }

  private terminateWorker(nextState: BrowserRuntimeState = 'IDLE') {
    this.clearTimers();
    this.initPromise = null;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore termination error
      }
      this.worker = null;
    }
    this.setState(nextState);
  }

  private getTeaVmBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return new URL('/java-wasm/teavm/', window.location.origin).href;
    }
    return '/java-wasm/teavm/';
  }

  private ensureInitialized(): Promise<void> {
    if (this.worker && this.runtimeState === 'READY') {
      return Promise.resolve();
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.setState('LOADING_RUNTIME', 'Loading Java compiler & TeaVM Wasm runtime...');
    const worker = new Worker('/java-wasm/worker-java.js');
    this.worker = worker;

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.activeInitTimer = window.setTimeout(() => {
        const msg = 'Timed out while loading the browser Java (TeaVM Wasm) runtime.';
        this.terminateWorker('ERROR');
        this.activeStateListener?.('ERROR', msg);
        reject(new Error(msg));
      }, RUNTIME_INIT_GRACE_MS);

      worker.onmessage = (evt: MessageEvent) => {
        const data = evt.data;
        if (!data) return;
        if (data.type === 'initialized') {
          if (this.activeInitTimer !== null) {
            window.clearTimeout(this.activeInitTimer);
            this.activeInitTimer = null;
          }
          this.setState('READY');
          resolve();
        } else if (data.type === 'init-error') {
          if (this.activeInitTimer !== null) {
            window.clearTimeout(this.activeInitTimer);
            this.activeInitTimer = null;
          }
          const msg = String(data.error || 'Failed to initialize browser Java runtime.');
          this.terminateWorker('ERROR');
          this.activeStateListener?.('ERROR', msg);
          reject(new Error(msg));
        }
      };

      worker.onerror = (err) => {
        if (this.activeInitTimer !== null) {
          window.clearTimeout(this.activeInitTimer);
          this.activeInitTimer = null;
        }
        const msg = err.message || 'Java Web Worker failed to start.';
        this.terminateWorker('ERROR');
        this.activeStateListener?.('ERROR', msg);
        reject(new Error(msg));
      };

      worker.postMessage({
        cmd: 'init',
        baseUrl: this.getTeaVmBaseUrl(),
        persistFiles: false,
      });
    });

    return this.initPromise;
  }

  warmup(onStateChange?: (state: BrowserRuntimeState, detail?: string) => void): void {
    if (!this.isSupported()) return;
    this.activeStateListener = onStateChange;
    if (this.runtimeState === 'READY' || this.runtimeState === 'LOADING_RUNTIME') {
      onStateChange?.(this.runtimeState);
      return;
    }
    this.ensureInitialized().catch(() => {
      // Errors are broadcast through runtimeState listener
    });
  }

  cancel(): void {
    this.clearTimers();
    if (this.activeReject) {
      const resolveAsCancelled = this.activeReject;
      this.activeReject = null;
      this.terminateWorker('IDLE');
      resolveAsCancelled({
        status: 'CANCELLED',
        stdout: '',
        stderr: 'Java execution cancelled cleanly (Web Worker terminated).',
        compilationErrors: '',
        runtimeErrors: 'Java execution cancelled cleanly (Web Worker terminated).',
        executionTimeMs: 0,
      });
    } else {
      this.terminateWorker('IDLE');
    }
  }

  async execute(req: BrowserExecutionRequest): Promise<BrowserExecutionResult> {
    if (!this.isSupported()) {
      return {
        status: 'RUNTIME_LOAD_ERROR',
        stdout: '',
        stderr: this.getUnsupportedReason(),
        compilationErrors: '',
        runtimeErrors: this.getUnsupportedReason(),
        executionTimeMs: 0,
      };
    }

    const maxIn = req.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
    const maxOut = req.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const stdin = req.stdin ?? '';
    if (stdin.length > maxIn) {
      return {
        status: 'RUNTIME_ERROR',
        stdout: '',
        stderr: `Input exceeds maximum browser limit of ${maxIn} characters.`,
        compilationErrors: '',
        runtimeErrors: `Input exceeds maximum browser limit of ${maxIn} characters.`,
        executionTimeMs: 0,
      };
    }

    if (this.activeReject) {
      this.cancel();
    }

    this.activeStateListener = req.onRuntimeStateChange;
    try {
      await this.ensureInitialized();
    } catch (initErr) {
      const msg = initErr instanceof Error ? initErr.message : String(initErr);
      return {
        status: 'RUNTIME_LOAD_ERROR',
        stdout: '',
        stderr: msg,
        compilationErrors: '',
        runtimeErrors: msg,
        executionTimeMs: 0,
      };
    }

    const worker = this.worker;
    if (!worker) {
      return {
        status: 'RUNTIME_LOAD_ERROR',
        stdout: '',
        stderr: 'Java runtime worker is unavailable.',
        compilationErrors: '',
        runtimeErrors: 'Java runtime worker is unavailable.',
        executionTimeMs: 0,
      };
    }

    const timeoutMs = Math.max(500, req.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS);
    const mainClass = extractJavaMainClass(req.sourceCode);

    return new Promise<BrowserExecutionResult>((resolve) => {
      let settled = false;
      const finish = (res: BrowserExecutionResult) => {
        if (settled) return;
        settled = true;
        this.clearTimers();
        this.activeReject = null;
        resolve(res);
      };

      this.activeReject = finish;
      this.setState('EXECUTING', 'Compiling and running Java in browser...');

      this.activeTimer = window.setTimeout(() => {
        this.terminateWorker('IDLE');
        finish({
          status: 'TIME_LIMIT_EXCEEDED',
          stdout: '',
          stderr: `Java execution timed out after ${(timeoutMs / 1000).toFixed(1)}s and the Web Worker was terminated.`,
          compilationErrors: '',
          runtimeErrors: `Java execution timed out after ${(timeoutMs / 1000).toFixed(1)}s and the Web Worker was terminated.`,
          executionTimeMs: timeoutMs,
        });
      }, timeoutMs);

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.type !== 'result') return;

        this.setState('READY');
        const outCap = truncateText(String(data.stdout || ''), maxOut, 'Stdout');
        const rawErr = String(data.stderr || data.error || '');
        const errCap = truncateText(rawErr, maxOut, 'Stderr');
        const elapsedMs = Number(
          data.runMs ??
            ((Number(data.compileMs || 0) + Number(data.generateMs || 0)) || 0)
        );

        if (data.ok) {
          finish({
            status: 'ACCEPTED',
            stdout: outCap.value,
            stderr: errCap.value,
            compilationErrors: '',
            runtimeErrors: '',
            executionTimeMs: Math.round(elapsedMs * 10) / 10,
            truncated: outCap.truncated || errCap.truncated,
          });
          return;
        }

        const diagnostics: Array<{ severity?: string }> = Array.isArray(data.diagnostics) ? data.diagnostics : [];
        const hasCompileError =
          diagnostics.some((d) => d.severity === 'error') || data.runMs === undefined;

        if (hasCompileError) {
          finish({
            status: 'COMPILATION_ERROR',
            stdout: outCap.value,
            stderr: errCap.value,
            compilationErrors: errCap.value || 'Java compilation failed.',
            runtimeErrors: '',
            executionTimeMs: Math.round(elapsedMs * 10) / 10,
            truncated: outCap.truncated || errCap.truncated,
          });
        } else {
          finish({
            status: 'RUNTIME_ERROR',
            stdout: outCap.value,
            stderr: errCap.value,
            compilationErrors: '',
            runtimeErrors: errCap.value || 'Java runtime error occurred.',
            executionTimeMs: Math.round(elapsedMs * 10) / 10,
            truncated: outCap.truncated || errCap.truncated,
          });
        }
      };

      worker.onerror = (err) => {
        this.terminateWorker('IDLE');
        const msg = err.message || 'Unhandled Web Worker crash during Java execution.';
        finish({
          status: 'RUNTIME_ERROR',
          stdout: '',
          stderr: msg,
          compilationErrors: '',
          runtimeErrors: msg,
          executionTimeMs: 0,
        });
      };

      worker.postMessage({
        cmd: 'run',
        source: req.sourceCode,
        input: stdin,
        mainClass,
        platform: 'posix',
      });
    });
  }
}

export class BrowserCodeExecutionAdapter {
  private drivers: Record<string, LanguageExecutionDriver>;
  private activeDriver: LanguageExecutionDriver | null = null;
  private cancelledFlag = false;

  constructor() {
    this.drivers = {
      python: new PyodideWorkerDriver(),
      java: new JavaWasmWorkerDriver(),
    };
  }

  getDriver(language: string): LanguageExecutionDriver | null {
    const canonical = normalizeCanonicalLanguage(language);
    return this.drivers[canonical] || null;
  }

  getRuntimeState(language: string): BrowserRuntimeState {
    const driver = this.getDriver(language);
    return driver?.getRuntimeState?.() ?? 'IDLE';
  }

  isBrowserExecutionSupported(language: string): boolean {
    const driver = this.getDriver(language);
    return Boolean(driver && driver.isSupported());
  }

  getUnsupportedReason(language: string): string {
    const canonical = normalizeCanonicalLanguage(language);
    const driver = this.drivers[canonical];
    if (!driver) {
      return `Language '${language}' is not configured for local browser execution.`;
    }
    if (driver.isSupported()) {
      return '';
    }
    return driver.getUnsupportedReason?.() || `Browser execution unavailable for '${language}'.`;
  }

  warmup(language: string, onStateChange?: (state: BrowserRuntimeState, detail?: string) => void): void {
    const driver = this.getDriver(language);
    if (
      driver &&
      'warmup' in driver &&
      typeof (driver as PyodideWorkerDriver | JavaWasmWorkerDriver).warmup === 'function'
    ) {
      (driver as PyodideWorkerDriver | JavaWasmWorkerDriver).warmup(onStateChange);
    }
  }

  cancelCurrentRun(): void {
    this.cancelledFlag = true;
    if (this.activeDriver) {
      this.activeDriver.cancel();
      this.activeDriver = null;
    }
  }

  async runCustomInput(req: BrowserExecutionRequest): Promise<BrowserExecutionResult> {
    if (!req.sourceCode || !req.sourceCode.trim()) {
      return {
        status: 'COMPILATION_ERROR',
        stdout: '',
        stderr: 'Source code cannot be empty.',
        compilationErrors: 'Source code cannot be empty.',
        runtimeErrors: '',
        executionTimeMs: 0,
      };
    }

    const driver = this.getDriver(req.language);
    if (!driver) {
      const msg = this.getUnsupportedReason(req.language);
      return {
        status: 'BROWSER_RUNTIME_UNSUPPORTED',
        stdout: '',
        stderr: msg,
        compilationErrors: '',
        runtimeErrors: msg,
        executionTimeMs: 0,
        unsupportedReason: msg,
      };
    }

    if (!driver.isSupported()) {
      return driver.execute(req);
    }

    this.cancelledFlag = false;
    this.activeDriver = driver;
    try {
      return await driver.execute(req);
    } finally {
      if (this.activeDriver === driver) {
        this.activeDriver = null;
      }
    }
  }

  async runSampleTests(
    req: Omit<BrowserExecutionRequest, 'stdin'>,
    sampleCases: SampleTestCaseSpec[]
  ): Promise<SampleSuiteExecutionResult> {
    if (!req.sourceCode || !req.sourceCode.trim()) {
      return {
        overallStatus: 'COMPILATION_ERROR',
        passedCount: 0,
        totalCount: sampleCases.length,
        compilationErrors: 'Source code cannot be empty.',
        results: [],
      };
    }

    const driver = this.getDriver(req.language);
    if (!driver || !driver.isSupported()) {
      const reason = this.getUnsupportedReason(req.language);
      return {
        overallStatus: 'BROWSER_RUNTIME_UNSUPPORTED',
        passedCount: 0,
        totalCount: sampleCases.length,
        unsupportedReason: reason,
        runtimeErrors: reason,
        results: [],
      };
    }

    if (sampleCases.length === 0) {
      const single = await this.runCustomInput({ ...req, stdin: '' });
      return {
        overallStatus: single.status,
        passedCount: single.status === 'ACCEPTED' ? 1 : 0,
        totalCount: 0,
        compilationErrors: single.compilationErrors || undefined,
        runtimeErrors: single.runtimeErrors || undefined,
        results: [],
      };
    }

    this.cancelledFlag = false;
    this.activeDriver = driver;
    const results: SampleTestExecutionResult[] = [];
    let passedCount = 0;

    try {
      for (let idx = 0; idx < sampleCases.length; idx++) {
        if (this.cancelledFlag) {
          return {
            overallStatus: 'CANCELLED',
            passedCount,
            totalCount: sampleCases.length,
            runtimeErrors: 'Sample test run cancelled.',
            results,
          };
        }

        const tc = sampleCases[idx];
        const execRes = await driver.execute({
          ...req,
          stdin: tc.input_text || '',
        });

        const actualClean = normalizeCodeOutput(execRes.stdout);
        const expectedClean = normalizeCodeOutput(tc.expected_output);
        const passed = execRes.status === 'ACCEPTED' && actualClean === expectedClean;
        const caseStatus =
          execRes.status === 'ACCEPTED'
            ? passed
              ? 'ACCEPTED'
              : 'WRONG_ANSWER'
            : execRes.status;

        if (passed) passedCount += 1;

        results.push({
          testCaseId: tc.id,
          index: idx + 1,
          inputText: tc.input_text || '',
          expectedOutput: tc.expected_output || '',
          actualOutput: execRes.stdout,
          stderr: execRes.stderr,
          compilationErrors: execRes.compilationErrors,
          runtimeErrors: execRes.runtimeErrors,
          status: caseStatus,
          passed,
          executionTimeMs: execRes.executionTimeMs,
          explanation: tc.explanation,
          truncated: execRes.truncated,
        });

        if (
          caseStatus === 'COMPILATION_ERROR' ||
          caseStatus === 'RUNTIME_LOAD_ERROR' ||
          caseStatus === 'CANCELLED'
        ) {
          return {
            overallStatus: caseStatus,
            passedCount,
            totalCount: sampleCases.length,
            compilationErrors: execRes.compilationErrors || undefined,
            runtimeErrors: execRes.runtimeErrors || undefined,
            results,
          };
        }
      }
    } finally {
      if (this.activeDriver === driver) {
        this.activeDriver = null;
      }
    }

    const firstFailure = results.find((r) => !r.passed);
    return {
      overallStatus: firstFailure ? firstFailure.status : 'ACCEPTED',
      passedCount,
      totalCount: sampleCases.length,
      results,
    };
  }
}

export const sharedBrowserExecutionAdapter = new BrowserCodeExecutionAdapter();
