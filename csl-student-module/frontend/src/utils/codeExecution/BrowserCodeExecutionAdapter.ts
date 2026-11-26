import type {
  BrowserExecutionRequest,
  BrowserExecutionResult,
  BrowserRuntimeState,
  EvaluationPipelineResult,
  LanguageExecutionDriver,
  OutputComparisonMode,
  SampleSuiteExecutionResult,
  SampleTestCaseSpec,
  SampleTestExecutionResult,
} from './types';

export const DEFAULT_MAX_INPUT_CHARS = 256_000;
export const DEFAULT_MAX_OUTPUT_CHARS = 100_000;
export const DEFAULT_EXECUTION_TIMEOUT_MS = 5_000;
export const RUNTIME_INIT_GRACE_MS = 35_000;
export const JAVA_COMPILE_GRACE_MS = 25_000;
export const DEFAULT_COMPARISON_MODE: OutputComparisonMode = 'TRIMMED';
export const BROWSER_ENGINE_VERSIONS = {
  python: 'pyodide-worker-v1',
  java: 'teavm-wasm-0.14.1',
} as const;

/**
 * Authoritative output comparison normalizer (default TRIMMED policy):
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

/**
 * Strict, configurable output comparator supporting:
 * - EXACT: LF-normalized only (no trimming or whitespace collapse)
 * - TRIMMED (default): trims trailing horizontal spaces per line & leading/trailing empty lines
 * - WHITESPACE_NORMALIZED: collapses horizontal space/tab runs per line while preserving line breaks
 */
export function compareOutputs(
  actual?: string | null,
  expected?: string | null,
  mode: OutputComparisonMode = DEFAULT_COMPARISON_MODE
): boolean {
  const actualRaw = (actual ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const expectedRaw = (expected ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (mode === 'EXACT') {
    return actualRaw === expectedRaw;
  }
  if (mode === 'WHITESPACE_NORMALIZED') {
    const normalizeLines = (s: string) =>
      normalizeCodeOutput(s)
        .split('\n')
        .map((line) => line.trim().replace(/[ \t]+/g, ' '))
        .filter((line) => line.length > 0)
        .join('\n');
    return normalizeLines(actualRaw) === normalizeLines(expectedRaw);
  }
  return normalizeCodeOutput(actualRaw) === normalizeCodeOutput(expectedRaw);
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

const setTimeoutCompat = (fn: () => void, ms: number): ReturnType<typeof setTimeout> =>
  (typeof window !== 'undefined' ? window.setTimeout : globalThis.setTimeout)(fn, ms);

const clearTimeoutCompat = (id: ReturnType<typeof setTimeout> | null): void => {
  if (id === null) return;
  (typeof window !== 'undefined' ? window.clearTimeout : globalThis.clearTimeout)(id as any);
};

class PyodideWorkerDriver implements LanguageExecutionDriver {
  public readonly language = 'python';
  private worker: Worker | null = null;
  private workerEpoch = 0;
  private runtimeState: BrowserRuntimeState = 'IDLE';
  private activeRequestId: string | null = null;
  private activeReject: ((res: BrowserExecutionResult) => void) | null = null;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeInitTimer: ReturnType<typeof setTimeout> | null = null;
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
    clearTimeoutCompat(this.activeTimer);
    this.activeTimer = null;
    clearTimeoutCompat(this.activeInitTimer);
    this.activeInitTimer = null;
  }

  private terminateWorker() {
    this.clearTimers();
    this.workerEpoch += 1;
    this.activeRequestId = null;
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
    if (this.runtimeState === 'READY' || this.runtimeState === 'LOADING_RUNTIME' || this.runtimeState === 'EXECUTING') {
      onStateChange?.(this.runtimeState);
      return;
    }
    const worker = this.ensureWorker();
    const epoch = this.workerEpoch;
    if (this.runtimeState === 'IDLE') {
      this.setState('LOADING_RUNTIME', 'Loading Python 3 (Pyodide) runtime...');
      worker.onmessage = (evt: MessageEvent) => {
        if (epoch !== this.workerEpoch) return;
        if (evt.data?.type === 'RUNTIME_STATE') {
          this.setState(evt.data.state, evt.data.detail);
        }
      };
      worker.onerror = (err) => {
        if (epoch !== this.workerEpoch) return;
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
    const epoch = this.workerEpoch;
    const requestId = `py_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.activeRequestId = requestId;

    return new Promise<BrowserExecutionResult>((resolve) => {
      let settled = false;
      const finish = (res: BrowserExecutionResult) => {
        if (settled) return;
        settled = true;
        this.clearTimers();
        if (this.activeRequestId === requestId) {
          this.activeRequestId = null;
        }
        this.activeReject = null;
        resolve(res);
      };

      this.activeReject = finish;

      const armExecutionTimer = () => {
        if (this.activeTimer !== null || epoch !== this.workerEpoch || this.activeRequestId !== requestId) return;
        this.activeTimer = setTimeoutCompat(() => {
          if (epoch !== this.workerEpoch || this.activeRequestId !== requestId) return;
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

      this.activeInitTimer = setTimeoutCompat(() => {
        if (epoch !== this.workerEpoch || this.activeRequestId !== requestId) return;
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
        if (epoch !== this.workerEpoch || this.activeRequestId !== requestId) return;
        const data = event.data;
        if (!data) return;

        if (data.type === 'RUNTIME_STATE') {
          this.setState(data.state, data.detail);
          if (data.state === 'EXECUTING') {
            clearTimeoutCompat(this.activeInitTimer);
            this.activeInitTimer = null;
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
        if (epoch !== this.workerEpoch || this.activeRequestId !== requestId) return;
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
        clearTimeoutCompat(this.activeInitTimer);
        this.activeInitTimer = null;
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
 * Separates Worker/WASM init, javac/WasmGC compilation, and candidate execution budgets,
 * correlates every message by requestId + epoch, and reuses the warmed worker across runs.
 */
class JavaWasmWorkerDriver implements LanguageExecutionDriver {
  public readonly language = 'java';
  private worker: Worker | null = null;
  private workerEpoch = 0;
  private runtimeState: BrowserRuntimeState = 'IDLE';
  private initPromise: Promise<void> | null = null;
  private warmupRequested = false;
  private activeRequestId: string | null = null;
  private activePhaseHandler: ((data: any) => void) | null = null;
  private activeResultHandler: ((data: any) => void) | null = null;
  private activeErrorHandler: ((msg: string) => void) | null = null;
  private activeReject: ((res: BrowserExecutionResult) => void) | null = null;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeCompileTimer: ReturnType<typeof setTimeout> | null = null;
  private activeInitTimer: ReturnType<typeof setTimeout> | null = null;
  private activeStateListener: ((state: BrowserRuntimeState, detail?: string) => void) | undefined;
  private executionChain: Promise<void> = Promise.resolve();

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

  private clearRunTimers() {
    clearTimeoutCompat(this.activeTimer);
    this.activeTimer = null;
    clearTimeoutCompat(this.activeCompileTimer);
    this.activeCompileTimer = null;
  }

  private clearAllTimers() {
    this.clearRunTimers();
    clearTimeoutCompat(this.activeInitTimer);
    this.activeInitTimer = null;
  }

  private terminateWorker(nextState: BrowserRuntimeState = 'IDLE') {
    this.clearAllTimers();
    this.workerEpoch += 1;
    this.initPromise = null;
    this.warmupRequested = false;
    this.activeRequestId = null;
    this.activePhaseHandler = null;
    this.activeResultHandler = null;
    this.activeErrorHandler = null;
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

  private attachWorkerHandlers(worker: Worker, epoch: number) {
    worker.onmessage = (evt: MessageEvent) => {
      if (epoch !== this.workerEpoch) return;
      const data = evt.data;
      if (!data) return;

      if (data.type === 'phase') {
        if (this.activeRequestId && data.requestId && data.requestId !== this.activeRequestId) {
          return;
        }
        this.activePhaseHandler?.(data);
        return;
      }

      if (data.type === 'result') {
        if (this.activeRequestId && data.requestId && data.requestId !== this.activeRequestId) {
          return;
        }
        this.activeResultHandler?.(data);
      }
    };

    worker.onerror = (err) => {
      if (epoch !== this.workerEpoch) return;
      const msg = err?.message || 'Unhandled Web Worker crash during Java execution.';
      if (this.activeErrorHandler) {
        this.activeErrorHandler(msg);
      } else {
        this.terminateWorker('ERROR');
        this.activeStateListener?.('ERROR', msg);
      }
    };
  }

  private ensureInitialized(): Promise<void> {
    if (this.worker && (this.runtimeState === 'READY' || this.runtimeState === 'EXECUTING')) {
      return Promise.resolve();
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.setState('LOADING_RUNTIME', 'Loading Java compiler & TeaVM Wasm runtime...');
    const worker = new Worker('/java-wasm/worker-java.js');
    const epoch = this.workerEpoch + 1;
    this.workerEpoch = epoch;
    this.worker = worker;
    this.warmupRequested = false;

    const initReqId = `java_init_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.initPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const failInit = (msg: string) => {
        if (settled) return;
        settled = true;
        this.terminateWorker('ERROR');
        this.activeStateListener?.('ERROR', msg);
        reject(new Error(msg));
      };

      this.activeInitTimer = setTimeoutCompat(() => {
        if (epoch !== this.workerEpoch) return;
        failInit('Timed out while loading the browser Java (TeaVM Wasm) runtime.');
      }, RUNTIME_INIT_GRACE_MS);

      worker.onmessage = (evt: MessageEvent) => {
        if (epoch !== this.workerEpoch) return;
        const data = evt.data;
        if (!data) return;

        if (data.type === 'initialized') {
          if (data.requestId && data.requestId !== initReqId) return;
          if (settled) return;
          settled = true;
          clearTimeoutCompat(this.activeInitTimer);
          this.activeInitTimer = null;
          this.attachWorkerHandlers(worker, epoch);
          this.setState('READY');
          resolve();
        } else if (data.type === 'init-error') {
          if (data.requestId && data.requestId !== initReqId) return;
          failInit(String(data.error || 'Failed to initialize browser Java runtime.'));
        }
      };

      worker.onerror = (err) => {
        if (epoch !== this.workerEpoch) return;
        failInit(err?.message || 'Java Web Worker failed to start.');
      };

      worker.postMessage({
        cmd: 'init',
        requestId: initReqId,
        baseUrl: this.getTeaVmBaseUrl(),
        persistFiles: false,
      });
    });

    return this.initPromise;
  }

  private triggerBackgroundWarmup(worker: Worker) {
    if (this.warmupRequested) return;
    this.warmupRequested = true;
    try {
      worker.postMessage({
        cmd: 'warmup',
        requestId: `java_warm_${Date.now()}`,
      });
    } catch {
      // non-fatal; first run still compiles cleanly under JAVA_COMPILE_GRACE_MS
    }
  }

  warmup(onStateChange?: (state: BrowserRuntimeState, detail?: string) => void): void {
    if (!this.isSupported()) return;
    this.activeStateListener = onStateChange;
    if (this.runtimeState === 'READY' || this.runtimeState === 'LOADING_RUNTIME' || this.runtimeState === 'EXECUTING') {
      onStateChange?.(this.runtimeState);
      return;
    }
    this.ensureInitialized()
      .then(() => {
        if (this.worker && this.runtimeState === 'READY') {
          this.triggerBackgroundWarmup(this.worker);
        }
      })
      .catch(() => {
        // Errors are broadcast through runtimeState listener
      });
  }

  cancel(): void {
    this.clearAllTimers();
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

  execute(req: BrowserExecutionRequest): Promise<BrowserExecutionResult> {
    if (!this.isSupported()) {
      return Promise.resolve({
        status: 'RUNTIME_LOAD_ERROR',
        stdout: '',
        stderr: this.getUnsupportedReason(),
        compilationErrors: '',
        runtimeErrors: this.getUnsupportedReason(),
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

    // Serialize overlapping execute() calls; cancel a currently running user loop if explicitly superseded
    if (this.activeReject) {
      this.cancel();
    }

    const runPromise = this.executionChain.then(() => this.runSerialized(req, stdin, maxOut));
    this.executionChain = runPromise.then(
      () => undefined,
      () => undefined
    );
    return runPromise;
  }

  private async runSerialized(
    req: BrowserExecutionRequest,
    stdin: string,
    maxOut: number
  ): Promise<BrowserExecutionResult> {
    const totalStart = performance.now();
    this.activeStateListener = req.onRuntimeStateChange;
    const initStart = performance.now();
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
    const initMs = Math.round((performance.now() - initStart) * 10) / 10;

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

    const execTimeoutMs = Math.max(500, req.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS);
    const mainClass = extractJavaMainClass(req.sourceCode);
    const epoch = this.workerEpoch;
    const requestId = `java_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.activeRequestId = requestId;
    this.warmupRequested = true; // real compilation also warms Wasm caches

    return new Promise<BrowserExecutionResult>((resolve) => {
      let settled = false;
      let currentPhase: 'COMPILING' | 'GENERATING_WASM' | 'INSTANTIATING' | 'RUNNING' = 'COMPILING';

      const finish = (res: BrowserExecutionResult) => {
        if (settled) return;
        settled = true;
        this.clearRunTimers();
        if (this.activeRequestId === requestId) {
          this.activeRequestId = null;
          this.activePhaseHandler = null;
          this.activeResultHandler = null;
          this.activeErrorHandler = null;
        }
        if (this.activeReject === finish) {
          this.activeReject = null;
        }
        resolve(res);
      };

      const armExecutionBudget = () => {
        if (this.activeTimer !== null || epoch !== this.workerEpoch || this.activeRequestId !== requestId) {
          return;
        }
        clearTimeoutCompat(this.activeCompileTimer);
        this.activeCompileTimer = null;

        this.activeTimer = setTimeoutCompat(() => {
          if (epoch !== this.workerEpoch || this.activeRequestId !== requestId) return;
          // Infinite loops / runaway candidate code must terminate and recreate worker cleanly
          this.terminateWorker('IDLE');
          finish({
            status: 'TIME_LIMIT_EXCEEDED',
            stdout: '',
            stderr: `Java execution timed out after ${(execTimeoutMs / 1000).toFixed(1)}s and the Web Worker was terminated.`,
            compilationErrors: '',
            runtimeErrors: `Java execution timed out after ${(execTimeoutMs / 1000).toFixed(1)}s and the Web Worker was terminated.`,
            executionTimeMs: execTimeoutMs,
            phaseTimings: {
              initMs,
              executionMs: execTimeoutMs,
              totalMs: Math.round((performance.now() - totalStart) * 10) / 10,
            },
          });
        }, execTimeoutMs);
      };

      this.activeReject = finish;
      this.setState('EXECUTING', 'Compiling Java source (javac + TeaVM WasmGC)...');

      // Separate compile + WasmGC generation grace window so cold JIT never falsely triggers program TLE
      this.activeCompileTimer = setTimeoutCompat(() => {
        if (epoch !== this.workerEpoch || this.activeRequestId !== requestId) return;
        this.terminateWorker('IDLE');
        finish({
          status: 'COMPILATION_ERROR',
          stdout: '',
          stderr: `Java compilation/WasmGC generation exceeded ${(JAVA_COMPILE_GRACE_MS / 1000).toFixed(0)}s budget (${currentPhase}) and worker was reset.`,
          compilationErrors: `Java compilation exceeded ${(JAVA_COMPILE_GRACE_MS / 1000).toFixed(0)}s (${currentPhase}).`,
          runtimeErrors: '',
          executionTimeMs: 0,
          phaseTimings: {
            initMs,
            totalMs: Math.round((performance.now() - totalStart) * 10) / 10,
          },
        });
      }, JAVA_COMPILE_GRACE_MS);

      this.activePhaseHandler = (data) => {
        if (data.phase === 'COMPILING') {
          currentPhase = 'COMPILING';
          this.setState('EXECUTING', 'Compiling Java source (javac)...');
        } else if (data.phase === 'GENERATING_WASM') {
          currentPhase = 'GENERATING_WASM';
          this.setState('EXECUTING', 'Generating TeaVM WebAssembly bytecode...');
        } else if (data.phase === 'INSTANTIATING') {
          currentPhase = 'INSTANTIATING';
          this.setState('EXECUTING', 'Preparing Java WebAssembly VM...');
        } else if (data.phase === 'RUNNING') {
          currentPhase = 'RUNNING';
          this.setState('EXECUTING', 'Running Java program...');
          armExecutionBudget();
        }
      };

      this.activeResultHandler = (data) => {
        const compileMs = Number.isFinite(Number(data.compileMs)) ? Math.round(Number(data.compileMs) * 10) / 10 : undefined;
        const generateMs = Number.isFinite(Number(data.generateMs)) ? Math.round(Number(data.generateMs) * 10) / 10 : undefined;
        const runMs = Number.isFinite(Number(data.runMs)) ? Math.round(Number(data.runMs) * 10) / 10 : undefined;
        const timings = {
          initMs,
          compileMs,
          generateMs,
          executionMs: runMs,
          totalMs: Math.round((performance.now() - totalStart) * 10) / 10,
        };

        const outCap = truncateText(String(data.stdout || ''), maxOut, 'Stdout');
        const rawErr = String(data.stderr || data.error || '');
        const errCap = truncateText(rawErr, maxOut, 'Stderr');
        const effectiveRunMs = runMs ?? 0;

        if (data.ok) {
          // Keep warmed worker alive across normal runs
          this.setState('READY');
          finish({
            status: 'ACCEPTED',
            stdout: outCap.value,
            stderr: errCap.value,
            compilationErrors: '',
            runtimeErrors: '',
            executionTimeMs: effectiveRunMs,
            phaseTimings: timings,
            truncated: outCap.truncated || errCap.truncated,
          });
          return;
        }

        const phaseStr = String(data.phase || '');
        const isTimedOut =
          phaseStr === 'TIME_LIMIT_EXCEEDED' || rawErr.toLowerCase().includes('did not finish within');

        if (isTimedOut) {
          this.terminateWorker('IDLE');
          finish({
            status: 'TIME_LIMIT_EXCEEDED',
            stdout: outCap.value,
            stderr: `Java execution timed out after ${(execTimeoutMs / 1000).toFixed(1)}s and the Web Worker was terminated.`,
            compilationErrors: '',
            runtimeErrors: rawErr || `Java execution timed out after ${(execTimeoutMs / 1000).toFixed(1)}s.`,
            executionTimeMs: effectiveRunMs || execTimeoutMs,
            phaseTimings: timings,
            truncated: outCap.truncated || errCap.truncated,
          });
          return;
        }

        const diagnostics: Array<{ severity?: string }> = Array.isArray(data.diagnostics) ? data.diagnostics : [];
        const hasCompileError =
          phaseStr === 'COMPILATION_ERROR' ||
          diagnostics.some((d) => d.severity === 'error') ||
          data.runMs === undefined;

        // Keep worker alive for normal compile/runtime user errors
        this.setState('READY');
        if (hasCompileError) {
          finish({
            status: 'COMPILATION_ERROR',
            stdout: outCap.value,
            stderr: errCap.value,
            compilationErrors: errCap.value || 'Java compilation failed.',
            runtimeErrors: '',
            executionTimeMs: effectiveRunMs,
            phaseTimings: timings,
            truncated: outCap.truncated || errCap.truncated,
          });
        } else {
          finish({
            status: 'RUNTIME_ERROR',
            stdout: outCap.value,
            stderr: errCap.value,
            compilationErrors: '',
            runtimeErrors: errCap.value || 'Java runtime error occurred.',
            executionTimeMs: effectiveRunMs,
            phaseTimings: timings,
            truncated: outCap.truncated || errCap.truncated,
          });
        }
      };

      this.activeErrorHandler = (msg: string) => {
        this.terminateWorker('IDLE');
        finish({
          status: 'RUNTIME_ERROR',
          stdout: '',
          stderr: msg,
          compilationErrors: '',
          runtimeErrors: msg,
          executionTimeMs: 0,
          phaseTimings: {
            initMs,
            totalMs: Math.round((performance.now() - totalStart) * 10) / 10,
          },
        });
      };

      worker.postMessage({
        cmd: 'run',
        requestId,
        source: req.sourceCode,
        input: stdin,
        mainClass,
        platform: 'posix',
        timeoutMs: execTimeoutMs,
        emitPhases: true,
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

  getEngineVersion(language: string): string {
    const canonical = normalizeCanonicalLanguage(language);
    if (canonical === 'python') return BROWSER_ENGINE_VERSIONS.python;
    if (canonical === 'java') return BROWSER_ENGINE_VERSIONS.java;
    return `browser-${canonical || 'unknown'}-v1`;
  }

  private resolveEffectiveComparisonMode(
    caseMode?: OutputComparisonMode | 'INHERIT',
    questionMode: OutputComparisonMode = DEFAULT_COMPARISON_MODE
  ): OutputComparisonMode {
    if (caseMode === 'EXACT' || caseMode === 'TRIMMED' || caseMode === 'WHITESPACE_NORMALIZED') {
      return caseMode;
    }
    return questionMode;
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

        const mode = this.resolveEffectiveComparisonMode(tc.comparison_mode, DEFAULT_COMPARISON_MODE);
        const passed = execRes.status === 'ACCEPTED' && compareOutputs(execRes.stdout, tc.expected_output, mode);
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
          visibilityScope: tc.visibility_scope || (tc.is_public ? 'SAMPLE' : 'SAMPLE'),
          isPublic: tc.is_public ?? true,
          inputText: tc.input_text || '',
          expectedOutput: tc.expected_output || '',
          actualOutput: execRes.stdout,
          stderr: execRes.stderr,
          compilationErrors: execRes.compilationErrors,
          runtimeErrors: execRes.runtimeErrors,
          status: caseStatus,
          passed,
          executionTimeMs: execRes.executionTimeMs,
          marksWeightage: tc.marks_weightage ?? 1.0,
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
            failedCount: sampleCases.length - passedCount,
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
      failedCount: sampleCases.length - passedCount,
      totalCount: sampleCases.length,
      results,
    };
  }

  /**
   * Executes ALL configured assessment test cases (Sample + Additional + Hidden) in the browser
   * and computes bounded weighted marks. Client results remain non-authoritative telemetry until
   * validated & bounded by Django.
   */
  async evaluateTestCases(
    req: Omit<BrowserExecutionRequest, 'stdin'>,
    testCases: SampleTestCaseSpec[],
    questionComparisonMode: OutputComparisonMode = DEFAULT_COMPARISON_MODE,
    maxMarks = 1
  ): Promise<EvaluationPipelineResult> {
    const engineVersion = this.getEngineVersion(req.language);
    const safeMaxMarks = Math.max(0, Number(maxMarks) || 0);

    if (!req.sourceCode || !req.sourceCode.trim()) {
      return {
        overallStatus: 'COMPILATION_ERROR',
        passedCount: 0,
        failedCount: testCases.length,
        totalCount: testCases.length,
        scoreAwarded: 0,
        maxMarks: safeMaxMarks,
        comparisonMode: questionComparisonMode,
        engineVersion,
        totalExecutionTimeMs: 0,
        compilationErrors: 'Source code cannot be empty.',
        runtimeErrors: '',
        results: [],
      };
    }

    const driver = this.getDriver(req.language);
    if (!driver || !driver.isSupported()) {
      const reason = this.getUnsupportedReason(req.language);
      return {
        overallStatus: 'BROWSER_RUNTIME_UNSUPPORTED',
        passedCount: 0,
        failedCount: testCases.length,
        totalCount: testCases.length,
        scoreAwarded: 0,
        maxMarks: safeMaxMarks,
        comparisonMode: questionComparisonMode,
        engineVersion,
        totalExecutionTimeMs: 0,
        compilationErrors: '',
        runtimeErrors: reason,
        results: [],
      };
    }

    if (testCases.length === 0) {
      return {
        overallStatus: 'ACCEPTED',
        passedCount: 0,
        failedCount: 0,
        totalCount: 0,
        scoreAwarded: 0,
        maxMarks: safeMaxMarks,
        comparisonMode: questionComparisonMode,
        engineVersion,
        totalExecutionTimeMs: 0,
        compilationErrors: '',
        runtimeErrors: '',
        results: [],
      };
    }

    this.cancelledFlag = false;
    this.activeDriver = driver;
    const results: SampleTestExecutionResult[] = [];
    let passedCount = 0;
    let passedWeight = 0;
    let totalWeight = 0;
    let totalMs = 0;
    let compilationErrors = '';
    let runtimeErrors = '';

    for (const tc of testCases) {
      totalWeight += Math.max(0.01, Number(tc.marks_weightage ?? 1.0) || 1.0);
    }

    try {
      for (let idx = 0; idx < testCases.length; idx++) {
        if (this.cancelledFlag) {
          return {
            overallStatus: 'CANCELLED',
            passedCount,
            failedCount: testCases.length - passedCount,
            totalCount: testCases.length,
            scoreAwarded: 0,
            maxMarks: safeMaxMarks,
            comparisonMode: questionComparisonMode,
            engineVersion,
            totalExecutionTimeMs: Math.round(totalMs * 10) / 10,
            compilationErrors,
            runtimeErrors: 'Evaluation cancelled by user or proctoring termination.',
            results,
          };
        }

        const tc = testCases[idx];
        const caseWeight = Math.max(0.01, Number(tc.marks_weightage ?? 1.0) || 1.0);
        const execRes = await driver.execute({
          ...req,
          stdin: tc.input_text || '',
        });
        totalMs += execRes.executionTimeMs || 0;

        const effectiveMode = this.resolveEffectiveComparisonMode(tc.comparison_mode, questionComparisonMode);
        const passed = execRes.status === 'ACCEPTED' && compareOutputs(execRes.stdout, tc.expected_output, effectiveMode);
        const caseStatus =
          execRes.status === 'ACCEPTED'
            ? passed
              ? 'ACCEPTED'
              : 'WRONG_ANSWER'
            : execRes.status;

        if (passed) {
          passedCount += 1;
          passedWeight += caseWeight;
        }
        if (execRes.compilationErrors && !compilationErrors) {
          compilationErrors = execRes.compilationErrors;
        }
        if (execRes.runtimeErrors && !runtimeErrors) {
          runtimeErrors = execRes.runtimeErrors;
        }

        results.push({
          testCaseId: tc.id,
          index: idx + 1,
          visibilityScope: tc.visibility_scope || (tc.is_public ? 'SAMPLE' : 'HIDDEN'),
          isPublic: Boolean(tc.is_public || tc.visibility_scope === 'SAMPLE'),
          inputText: tc.input_text || '',
          expectedOutput: tc.expected_output || '',
          actualOutput: execRes.stdout,
          stderr: execRes.stderr,
          compilationErrors: execRes.compilationErrors,
          runtimeErrors: execRes.runtimeErrors,
          status: caseStatus,
          passed,
          executionTimeMs: execRes.executionTimeMs,
          marksWeightage: caseWeight,
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
            failedCount: testCases.length - passedCount,
            totalCount: testCases.length,
            scoreAwarded: 0,
            maxMarks: safeMaxMarks,
            comparisonMode: questionComparisonMode,
            engineVersion,
            totalExecutionTimeMs: Math.round(totalMs * 10) / 10,
            compilationErrors,
            runtimeErrors,
            results,
          };
        }
      }
    } finally {
      if (this.activeDriver === driver) {
        this.activeDriver = null;
      }
    }

    const rawScore = totalWeight > 0 ? (passedWeight / totalWeight) * safeMaxMarks : 0;
    const boundedScore = Math.min(safeMaxMarks, Math.max(0, Math.round(rawScore * 100) / 100));
    const firstFailure = results.find((r) => !r.passed);

    return {
      overallStatus: firstFailure ? firstFailure.status : 'ACCEPTED',
      passedCount,
      failedCount: testCases.length - passedCount,
      totalCount: testCases.length,
      scoreAwarded: boundedScore,
      maxMarks: safeMaxMarks,
      comparisonMode: questionComparisonMode,
      engineVersion,
      totalExecutionTimeMs: Math.round(totalMs * 10) / 10,
      compilationErrors,
      runtimeErrors,
      results,
    };
  }
}

export const sharedBrowserExecutionAdapter = new BrowserCodeExecutionAdapter();
