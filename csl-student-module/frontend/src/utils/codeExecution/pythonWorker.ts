/// <reference lib="webworker" />

interface WorkerRunMessage {
  type: 'RUN';
  requestId: string;
  sourceCode: string;
  stdin: string;
  maxOutputChars: number;
}

interface WorkerInitMessage {
  type: 'INIT';
  indexUrl?: string;
}

type WorkerInboundMessage = WorkerInitMessage | WorkerRunMessage;

type PyodideInterface = {
  runPythonAsync: (code: string, options?: { globals?: unknown }) => Promise<unknown>;
  globals: {
    get: (name: string) => unknown;
    set: (name: string, val: unknown) => void;
  };
  toPy: (val: unknown) => unknown;
};

let pyodideInstance: PyodideInterface | null = null;
let initPromise: Promise<PyodideInterface> | null = null;

async function ensurePyodide(indexUrl = '/pyodide/'): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;
  if (initPromise) return initPromise;

  self.postMessage({ type: 'RUNTIME_STATE', state: 'LOADING_RUNTIME', detail: 'Loading Python 3 (Pyodide) runtime...' });

  initPromise = (async () => {
    try {
      const normalizedBase = indexUrl.endsWith('/') ? indexUrl : `${indexUrl}/`;
      // Load local Pyodide ESM bundle dynamically from public/pyodide/
      const pyodideModule = (await import(/* @vite-ignore */ `${normalizedBase}pyodide.mjs`)) as {
        loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInterface>;
      };
      const instance = await pyodideModule.loadPyodide({
        indexURL: normalizedBase,
      });
      pyodideInstance = instance;
      self.postMessage({ type: 'RUNTIME_STATE', state: 'READY' });
      return instance;
    } catch (err) {
      initPromise = null;
      const msg = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'RUNTIME_STATE', state: 'ERROR', detail: msg });
      throw new Error(`Failed to initialize Python 3 (Pyodide) Web Worker runtime: ${msg}`);
    }
  })();

  return initPromise;
}

const PYTHON_RUNNER_HARNESS = `
import sys, io, ast, traceback, time

def _csl_run_user_code(source_code, stdin_text, max_output_chars):
    max_chars = int(max_output_chars or 100000)

    # 1. Syntax / Compilation validation
    try:
        compiled = compile(source_code, "<solution.py>", "exec")
    except SyntaxError as exc:
        err_line = traceback.format_exception_only(type(exc), exc)
        diag = "".join(err_line)
        return {
            "status": "COMPILATION_ERROR",
            "stdout": "",
            "stderr": diag,
            "compilationErrors": diag,
            "runtimeErrors": "",
            "executionTimeMs": 0.0,
            "truncated": False,
        }

    # 2. Prepare isolated streams with strict I/O caps
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    orig_stdin, orig_stdout, orig_stderr = sys.stdin, sys.stdout, sys.stderr
    sys.stdin = io.StringIO(stdin_text or "")
    sys.stdout = stdout_buf
    sys.stderr = stderr_buf

    exec_globals = {"__name__": "__main__", "__builtins__": __builtins__}
    start_t = time.perf_counter()
    status = "ACCEPTED"
    runtime_err = ""

    try:
        exec(compiled, exec_globals, exec_globals)
    except SystemExit as sysex:
        if sysex.code not in (None, 0):
            status = "RUNTIME_ERROR"
            runtime_err = f"SystemExit: {sysex.code}"
    except Exception:
        status = "RUNTIME_ERROR"
        runtime_err = traceback.format_exc()
    finally:
        elapsed_ms = (time.perf_counter() - start_t) * 1000.0
        sys.stdin = orig_stdin
        sys.stdout = orig_stdout
        sys.stderr = orig_stderr

    out_val = stdout_buf.getvalue()
    err_val = stderr_buf.getvalue()
    if runtime_err:
        err_val = f"{err_val}\\n{runtime_err}".strip() if err_val else runtime_err

    truncated = False
    if len(out_val) > max_chars:
        out_val = out_val[:max_chars] + f"\\n... [Output truncated at {max_chars} characters]"
        truncated = True
    if len(err_val) > max_chars:
        err_val = err_val[:max_chars] + f"\\n... [Stderr truncated at {max_chars} characters]"
        truncated = True

    return {
        "status": status,
        "stdout": out_val,
        "stderr": err_val,
        "compilationErrors": "",
        "runtimeErrors": runtime_err,
        "executionTimeMs": float(round(elapsed_ms, 2)),
        "truncated": truncated,
    }
`;

let harnessLoaded = false;

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;
  if (msg.type === 'INIT') {
    try {
      await ensurePyodide(msg.indexUrl);
    } catch {
      // Handled via RUNTIME_STATE ERROR message
    }
    return;
  }

  if (msg.type === 'RUN') {
    const { requestId, sourceCode, stdin, maxOutputChars } = msg;
    try {
      const py = await ensurePyodide();
      if (!harnessLoaded) {
        await py.runPythonAsync(PYTHON_RUNNER_HARNESS);
        harnessLoaded = true;
      }

      self.postMessage({ type: 'RUNTIME_STATE', state: 'EXECUTING' });
      py.globals.set('_csl_req_code', sourceCode);
      py.globals.set('_csl_req_stdin', stdin ?? '');
      py.globals.set('_csl_req_max_chars', maxOutputChars);

      const jsonResultStr = (await py.runPythonAsync(
        'import json; json.dumps(_csl_run_user_code(_csl_req_code, _csl_req_stdin, _csl_req_max_chars))'
      )) as string;
      const parsed = JSON.parse(jsonResultStr);

      self.postMessage({ type: 'RUNTIME_STATE', state: 'READY' });
      self.postMessage({
        type: 'RUN_RESULT',
        requestId,
        result: parsed,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      self.postMessage({
        type: 'RUN_RESULT',
        requestId,
        result: {
          status: pyodideInstance ? 'RUNTIME_ERROR' : 'RUNTIME_LOAD_ERROR',
          stdout: '',
          stderr: errMsg,
          compilationErrors: '',
          runtimeErrors: errMsg,
          executionTimeMs: 0,
          truncated: false,
        },
      });
    }
  }
};
