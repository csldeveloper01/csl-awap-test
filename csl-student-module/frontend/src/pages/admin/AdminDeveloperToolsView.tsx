import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { PageContainer, SectionHeader, StatusBadge, InformationPanel } from '../../components/ui';
import { useAdminTheme } from '../../utils/adminTheme';
import {
  BrowserCodeExecutionAdapter,
  BROWSER_ENGINE_VERSIONS,
  normalizeCanonicalLanguage,
} from '../../utils/codeExecution/BrowserCodeExecutionAdapter';
import type { BrowserExecutionStatus, BrowserRuntimeState } from '../../utils/codeExecution/types';

interface AdminDeveloperToolsViewProps {
  isAuthorizedAdmin: boolean;
}

interface TerminalEntry {
  id: string;
  timestamp: string;
  title: string;
  language: string;
  status: BrowserExecutionStatus;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  compilationErrors: string;
  runtimeErrors: string;
}

interface DiagnosticTestResult {
  id: string;
  name: string;
  language: 'python' | 'java';
  passed: boolean;
  status: BrowserExecutionStatus;
  durationMs: number;
  detail: string;
}

const TEMPLATES: Record<'python' | 'java', { code: string; stdin: string }> = {
  python: {
    code: `# CSL Admin Developer CodeSpace — Browser-Only Pyodide Runtime\nimport sys\n\ndef main():\n    data = sys.stdin.read().strip().splitlines()\n    print("Python Runtime OK", "| lines:", len(data))\n    if data:\n        print("Echo:", " / ".join(data))\n\nif __name__ == "__main__":\n    main()\n`,
    stdin: 'line-one\nline-two\n',
  },
  java: {
    code: `// CSL Admin Developer CodeSpace — Browser-Only TeaVM Wasm Runtime\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        List<String> lines = new ArrayList<>();\n        while (sc.hasNextLine()) {\n            String line = sc.nextLine().trim();\n            if (!line.isEmpty()) lines.add(line);\n        }\n        System.out.println("Java Runtime OK | lines: " + lines.size());\n        if (!lines.isEmpty()) {\n            System.out.println("Echo: " + String.join(" / ", lines));\n        }\n    }\n}\n`,
    stdin: 'line-one\nline-two\n',
  },
};

function inferExitCode(status: BrowserExecutionStatus): number {
  if (status === 'ACCEPTED') return 0;
  if (status === 'TIME_LIMIT_EXCEEDED') return 124;
  if (status === 'CANCELLED') return 130;
  return 1;
}

export const AdminDeveloperToolsView: React.FC<AdminDeveloperToolsViewProps> = ({ isAuthorizedAdmin }) => {
  const { isDark, tokens } = useAdminTheme();

  // Dedicated isolated adapter instance so admin testing never touches candidate assessment state or APIs
  const adapterRef = useRef<BrowserCodeExecutionAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = new BrowserCodeExecutionAdapter();
  }

  const editorRef = useRef<any>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const [language, setLanguage] = useState<'python' | 'java'>('python');
  const [drafts, setDrafts] = useState<Record<'python' | 'java', string>>({
    python: TEMPLATES.python.code,
    java: TEMPLATES.java.code,
  });
  const [stdin, setStdin] = useState<string>(TEMPLATES.python.stdin);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [timeoutMs, setTimeoutMs] = useState<number>(5000);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);

  const [pyState, setPyState] = useState<BrowserRuntimeState>('IDLE');
  const [pyDetail, setPyDetail] = useState<string>('');
  const [javaState, setJavaState] = useState<BrowserRuntimeState>('IDLE');
  const [javaDetail, setJavaDetail] = useState<string>('');

  const [runningDiagnostics, setRunningDiagnostics] = useState<boolean>(false);
  const [diagnosticResults, setDiagnosticResults] = useState<DiagnosticTestResult[]>([]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current && typeof terminalEndRef.current.scrollIntoView === 'function') {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [terminalEntries, autoScroll]);

  const activeCode = drafts[language];
  const pySupported = useMemo(() => adapterRef.current?.isBrowserExecutionSupported('python') ?? false, []);
  const javaSupported = useMemo(() => adapterRef.current?.isBrowserExecutionSupported('java') ?? false, []);

  if (!isAuthorizedAdmin) {
    return (
      <PageContainer maxWidth="680px">
        <InformationPanel
          tone="danger"
          title="Administrator Access Required"
          description="Developer Tools is restricted strictly to authorized CSL administrators."
        />
      </PageContainer>
    );
  }

  const pushTerminalEntry = (entry: Omit<TerminalEntry, 'id' | 'timestamp'>) => {
    setTerminalEntries((prev) => [
      ...prev,
      {
        ...entry,
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const updateRuntimeStatus = (lang: 'python' | 'java', st: BrowserRuntimeState, detail?: string) => {
    if (lang === 'python') {
      setPyState(st);
      setPyDetail(detail || '');
    } else {
      setJavaState(st);
      setJavaDetail(detail || '');
    }
  };

  const handleWarmup = (targetLang: 'python' | 'java') => {
    adapterRef.current?.warmup(targetLang, (st, detail) => updateRuntimeStatus(targetLang, st, detail));
  };

  const handleLanguageChange = (nextLang: 'python' | 'java') => {
    setLanguage(nextLang);
    if (!stdin.trim()) {
      setStdin(TEMPLATES[nextLang].stdin);
    }
  };

  const handleFormatCode = () => {
    try {
      editorRef.current?.getAction?.('editor.action.formatDocument')?.run?.();
    } catch {
      // ignore if language formatter unavailable
    }
  };

  const handleResetEditor = () => {
    setDrafts((prev) => ({ ...prev, [language]: TEMPLATES[language].code }));
    setStdin(TEMPLATES[language].stdin);
  };

  const handleClearEditor = () => {
    setDrafts((prev) => ({ ...prev, [language]: '' }));
  };

  const handleRunCode = async (override?: { code?: string; lang?: 'python' | 'java'; input?: string; label?: string; customTimeoutMs?: number }) => {
    const adapter = adapterRef.current;
    if (!adapter || isRunning) return;

    const targetLang = override?.lang ?? language;
    const targetCode = override?.code ?? activeCode;
    const targetInput = override?.input ?? stdin;
    const targetTimeout = override?.customTimeoutMs ?? timeoutMs;

    setIsRunning(true);
    try {
      const res = await adapter.runCustomInput({
        sourceCode: targetCode,
        language: targetLang,
        stdin: targetInput,
        timeoutMs: targetTimeout,
        onRuntimeStateChange: (st, detail) => updateRuntimeStatus(targetLang, st, detail),
      });
      pushTerminalEntry({
        title: override?.label || `Run ${targetLang === 'java' ? 'Java (TeaVM Wasm)' : 'Python 3 (Pyodide)'}`,
        language: targetLang,
        status: res.status,
        exitCode: inferExitCode(res.status),
        durationMs: res.executionTimeMs,
        stdout: res.stdout,
        stderr: res.stderr,
        compilationErrors: res.compilationErrors,
        runtimeErrors: res.runtimeErrors,
      });
      return res;
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancelRun = () => {
    adapterRef.current?.cancelCurrentRun();
    setIsRunning(false);
  };

  const executeSingleDiagnostic = async (spec: {
    id: string;
    name: string;
    lang: 'python' | 'java';
    code: string;
    input: string;
    timeoutMs?: number;
    validate: (res: Awaited<ReturnType<BrowserCodeExecutionAdapter['runCustomInput']>>) => { ok: boolean; detail: string };
  }): Promise<DiagnosticTestResult> => {
    const adapter = adapterRef.current!;
    const res = await adapter.runCustomInput({
      sourceCode: spec.code,
      language: spec.lang,
      stdin: spec.input,
      timeoutMs: spec.timeoutMs ?? 6000,
      onRuntimeStateChange: (st, detail) => updateRuntimeStatus(spec.lang, st, detail),
    });
    const check = spec.validate(res);
    pushTerminalEntry({
      title: `[Diagnostic] ${spec.name}`,
      language: spec.lang,
      status: res.status,
      exitCode: inferExitCode(res.status),
      durationMs: res.executionTimeMs,
      stdout: res.stdout,
      stderr: res.stderr,
      compilationErrors: res.compilationErrors,
      runtimeErrors: res.runtimeErrors,
    });
    return {
      id: spec.id,
      name: spec.name,
      language: spec.lang,
      passed: check.ok,
      status: res.status,
      durationMs: res.executionTimeMs,
      detail: check.detail,
    };
  };

  const handleRunDiagnosticsSuite = async (mode: 'single-python' | 'single-java' | 'stdin' | 'multiline' | 'errors' | 'timeout' | 'full') => {
    if (runningDiagnostics || isRunning) return;
    setRunningDiagnostics(true);

    const allSpecs = [
      {
        id: 'py-basic',
        name: 'Python Runtime Test',
        lang: 'python' as const,
        code: 'print("PY_WASM_READY", 6 * 7)',
        input: '',
        validate: (r: any) => ({
          ok: r.status === 'ACCEPTED' && r.stdout.trim() === 'PY_WASM_READY 42',
          detail: r.stdout.trim() || r.runtimeErrors || r.status,
        }),
      },
      {
        id: 'java-basic',
        name: 'Java Runtime Test (TeaVM WasmGC)',
        lang: 'java' as const,
        code: 'public class Main { public static void main(String[] args) { System.out.println("JAVA_WASM_READY " + (6 * 7)); } }',
        input: '',
        validate: (r: any) => ({
          ok: r.status === 'ACCEPTED' && r.stdout.trim() === 'JAVA_WASM_READY 42',
          detail: r.stdout.trim() || r.compilationErrors || r.runtimeErrors || r.status,
        }),
      },
      {
        id: 'stdin-io',
        name: 'Standard Input / Output (Java Scanner)',
        lang: 'java' as const,
        code: 'import java.util.*; public class Solution { public static void main(String[] a) { Scanner sc = new Scanner(System.in); System.out.println(sc.nextInt() + sc.nextInt()); } }',
        input: '19 23\n',
        validate: (r: any) => ({
          ok: r.status === 'ACCEPTED' && r.stdout.trim() === '42',
          detail: `stdout="${r.stdout.trim()}"`,
        }),
      },
      {
        id: 'multiline-io',
        name: 'Multi-line Stdin Test (Python + Buffered)',
        lang: 'python' as const,
        code: 'import sys\nlines = [l.strip() for l in sys.stdin.read().splitlines() if l.strip()]\nprint(",".join(lines))',
        input: 'alpha\nbeta\ngamma\n',
        validate: (r: any) => ({
          ok: r.status === 'ACCEPTED' && r.stdout.trim() === 'alpha,beta,gamma',
          detail: `stdout="${r.stdout.trim()}"`,
        }),
      },
      {
        id: 'error-handling',
        name: 'Error Handling Test (Compile + Runtime)',
        lang: 'java' as const,
        code: 'public class Main { public static void main(String[] a) { int broken = "type_error"; } }',
        input: '',
        validate: (r: any) => ({
          ok: r.status === 'COMPILATION_ERROR' && Boolean(r.compilationErrors),
          detail: r.status === 'COMPILATION_ERROR' ? 'Caught javac compilation error cleanly' : `Unexpected status ${r.status}`,
        }),
      },
      {
        id: 'timeout-guard',
        name: 'Infinite Loop Timeout Termination Test',
        lang: 'python' as const,
        code: 'while True:\n    pass\n',
        input: '',
        timeoutMs: 1200,
        validate: (r: any) => ({
          ok: r.status === 'TIME_LIMIT_EXCEEDED',
          detail: r.status === 'TIME_LIMIT_EXCEEDED' ? `Terminated cleanly at ${r.executionTimeMs} ms` : `Status ${r.status}`,
        }),
      },
      {
        id: 'compat-collections',
        name: 'Compatibility Suite (OOP + Collections + Sorting)',
        lang: 'java' as const,
        code: 'import java.util.*; interface F { int f(int x); } public class Main { public static void main(String[] args) { F sq = x -> x * x; List<Integer> xs = Arrays.asList(3, 1, 2); Collections.sort(xs); System.out.println(xs + " " + sq.f(5)); } }',
        input: '',
        validate: (r: any) => ({
          ok: r.status === 'ACCEPTED' && r.stdout.trim() === '[1, 2, 3] 25',
          detail: r.stdout.trim() || r.compilationErrors || r.runtimeErrors,
        }),
      },
    ];

    const selected =
      mode === 'single-python'
        ? allSpecs.filter((s) => s.id === 'py-basic')
        : mode === 'single-java'
        ? allSpecs.filter((s) => s.id === 'java-basic')
        : mode === 'stdin'
        ? allSpecs.filter((s) => s.id === 'stdin-io')
        : mode === 'multiline'
        ? allSpecs.filter((s) => s.id === 'multiline-io')
        : mode === 'errors'
        ? allSpecs.filter((s) => s.id === 'error-handling')
        : mode === 'timeout'
        ? allSpecs.filter((s) => s.id === 'timeout-guard')
        : allSpecs;

    try {
      const outcomes: DiagnosticTestResult[] = [];
      for (const spec of selected) {
        const res = await executeSingleDiagnostic(spec);
        outcomes.push(res);
      }
      setDiagnosticResults((prev) => {
        if (mode === 'full') return outcomes;
        const map = new Map(prev.map((p) => [p.id, p]));
        for (const o of outcomes) map.set(o.id, o);
        return Array.from(map.values());
      });
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const canonicalLang = normalizeCanonicalLanguage(language);

  return (
    <PageContainer>
      <SectionHeader
        title="Developer Tools — Browser WASM CodeSpace"
        description="Test Python (Pyodide) and Java (TeaVM WasmGC) workers locally inside the browser. Completely isolated from candidate attempt data and submission endpoints."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <StatusBadge
              label={`Python (${BROWSER_ENGINE_VERSIONS.python}): ${pySupported ? pyState : 'UNSUPPORTED'}`}
              variant={pyState === 'READY' ? 'success' : pyState === 'ERROR' ? 'danger' : 'info'}
              dot
            />
            <StatusBadge
              label={`Java (${BROWSER_ENGINE_VERSIONS.java}): ${javaSupported ? javaState : 'UNSUPPORTED'}`}
              variant={javaState === 'READY' ? 'success' : javaState === 'ERROR' ? 'danger' : 'info'}
              dot
            />
          </div>
        }
      />

      {/* Runtime Controls & Built-in Diagnostic Test Suite */}
      <section
        style={{
          backgroundColor: tokens.surfaceCard,
          border: `1px solid ${tokens.border}`,
          borderRadius: '10px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          boxShadow: tokens.cardShadow,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong style={{ fontSize: '13.5px', color: tokens.textPrimary }}>
              Browser Runtime Test Suite &amp; Worker Diagnostics
            </strong>
            <span style={{ fontSize: '11.5px', color: tokens.textMuted }}>
              Executes purely in dedicated Web Workers with zero backend calls.
              {(pyDetail || javaDetail) && ` Status: ${javaDetail || pyDetail}`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleWarmup('python')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '5px 10px' }}>
              Warm Up Python
            </button>
            <button type="button" onClick={() => handleWarmup('java')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '5px 10px' }}>
              Warm Up Java
            </button>
            <button
              type="button"
              disabled={runningDiagnostics || isRunning}
              onClick={() => handleRunDiagnosticsSuite('full')}
              className="csl-btn-primary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
              data-testid="devtools-run-compat-suite"
            >
              {runningDiagnostics ? 'Running Diagnostics...' : '▶ Run Full Compatibility Suite'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button type="button" disabled={runningDiagnostics || isRunning} onClick={() => handleRunDiagnosticsSuite('single-python')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 10px' }}>
            Python Test
          </button>
          <button type="button" disabled={runningDiagnostics || isRunning} onClick={() => handleRunDiagnosticsSuite('single-java')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 10px' }}>
            Java Test
          </button>
          <button type="button" disabled={runningDiagnostics || isRunning} onClick={() => handleRunDiagnosticsSuite('stdin')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 10px' }}>
            Stdin/Stdout Test
          </button>
          <button type="button" disabled={runningDiagnostics || isRunning} onClick={() => handleRunDiagnosticsSuite('multiline')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 10px' }}>
            Multi-line Input Test
          </button>
          <button type="button" disabled={runningDiagnostics || isRunning} onClick={() => handleRunDiagnosticsSuite('errors')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 10px' }}>
            Error Handling Test
          </button>
          <button type="button" disabled={runningDiagnostics || isRunning} onClick={() => handleRunDiagnosticsSuite('timeout')} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 10px' }}>
            Timeout / Loop Test
          </button>
        </div>

        {diagnosticResults.length > 0 && (
          <div
            data-testid="devtools-diagnostic-results"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '8px',
              paddingTop: '6px',
            }}
          >
            {diagnosticResults.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: `1px solid ${item.passed ? tokens.successBorder : tokens.dangerBorder}`,
                  backgroundColor: item.passed ? tokens.successBg : tokens.dangerBg,
                  color: item.passed ? tokens.successText : tokens.dangerText,
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ fontSize: '12px' }}>{item.passed ? '✓' : '✕'} {item.name}</strong>
                  <span style={{ fontSize: '10.5px', fontFamily: tokens.monoFamily }}>{item.durationMs.toFixed(0)}ms</span>
                </div>
                <div style={{ fontSize: '11px', opacity: 0.9 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main Split CodeSpace: Monaco Editor + Stdin + Output Terminal */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          alignItems: 'stretch',
        }}
      >
        {/* Left/Top: CodeSpace Editor */}
        <div
          style={{
            backgroundColor: tokens.surfaceCard,
            border: `1px solid ${tokens.border}`,
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '470px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${tokens.border}`,
              backgroundColor: tokens.surfaceElevated,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                aria-label="Developer tools language selector"
                data-testid="devtools-language-select"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as 'python' | 'java')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.inputBg,
                  color: tokens.textPrimary,
                  fontSize: '12.5px',
                  fontWeight: 600,
                }}
              >
                <option value="python">Python 3 (Pyodide)</option>
                <option value="java">Java (TeaVM WasmGC)</option>
              </select>

              <label style={{ fontSize: '11.5px', color: tokens.textSecondary, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Timeout (ms):
                <input
                  type="number"
                  min={500}
                  max={30000}
                  step={500}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Math.max(500, Number(e.target.value) || 5000))}
                  style={{
                    width: '72px',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: `1px solid ${tokens.border}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontSize: '12px',
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleFormatCode} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 9px' }}>
                Format
              </button>
              <button type="button" onClick={handleResetEditor} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 9px' }}>
                Reset
              </button>
              <button type="button" onClick={handleClearEditor} className="csl-btn-secondary" style={{ fontSize: '11.5px', padding: '4px 9px' }}>
                Clear
              </button>
              {isRunning ? (
                <button
                  type="button"
                  onClick={handleCancelRun}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: tokens.danger,
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ■ Cancel
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="devtools-run-btn"
                  disabled={runningDiagnostics}
                  onClick={() => handleRunCode()}
                  className="csl-btn-primary"
                  style={{ fontSize: '12px', padding: '5px 12px' }}
                >
                  ▶ Run Code
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: '320px' }}>
            <Editor
              height="100%"
              language={canonicalLang === 'java' ? 'java' : 'python'}
              theme={isDark ? 'vs-dark' : 'light'}
              value={activeCode}
              onChange={(val) => setDrafts((prev) => ({ ...prev, [language]: val ?? '' }))}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 13.5,
                lineNumbers: 'on',
                autoIndent: 'full',
                formatOnPaste: true,
                formatOnType: true,
                tabSize: canonicalLang === 'java' ? 4 : 4,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          {/* Standard Input Box */}
          <div
            style={{
              padding: '10px 14px',
              borderTop: `1px solid ${tokens.border}`,
              backgroundColor: tokens.surfaceMuted,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <label htmlFor="devtools-stdin" style={{ fontSize: '11.5px', fontWeight: 600, color: tokens.textSecondary }}>
              Standard Input (stdin)
            </label>
            <textarea
              id="devtools-stdin"
              rows={3}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Enter custom stdin lines..."
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '7px',
                border: `1px solid ${tokens.border}`,
                backgroundColor: tokens.inputBg,
                color: tokens.textPrimary,
                fontFamily: tokens.monoFamily,
                fontSize: '12px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Right/Bottom: Integrated Output Terminal */}
        <div
          data-testid="devtools-terminal"
          style={{
            backgroundColor: '#0F172A',
            color: '#E2E8F0',
            border: `1px solid ${tokens.border}`,
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '470px',
            maxHeight: '640px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#1E293B',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '12.5px', color: '#F8FAFC', fontFamily: tokens.monoFamily }}>
                OUTPUT TERMINAL
              </strong>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                ({terminalEntries.length} run{terminalEntries.length === 1 ? '' : 's'})
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#CBD5E1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                Auto-scroll
              </label>
              <button
                type="button"
                onClick={() => setTerminalEntries([])}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #475569',
                  backgroundColor: '#0F172A',
                  color: '#CBD5E1',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Clear Terminal
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '12px 14px',
              fontFamily: tokens.monoFamily,
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {terminalEntries.length === 0 ? (
              <div style={{ color: '#64748B', padding: '16px 4px', lineHeight: 1.6 }}>
                Ready. Click <strong>Run Code</strong> or trigger any diagnostic check above to inspect browser WASM execution output, exit codes, and timings.
              </div>
            ) : (
              terminalEntries.map((entry) => {
                const isSuccess = entry.status === 'ACCEPTED';
                return (
                  <div
                    key={entry.id}
                    style={{
                      borderRadius: '8px',
                      border: `1px solid ${isSuccess ? '#14532D' : '#7F1D1D'}`,
                      backgroundColor: isSuccess ? 'rgba(20, 83, 45, 0.25)' : 'rgba(127, 29, 29, 0.25)',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontWeight: 700, color: isSuccess ? '#86EFAC' : '#FCA5A5' }}>
                        [{entry.timestamp}] {entry.title}
                      </span>
                      <span style={{ fontSize: '11px', color: '#CBD5E1' }}>
                        Status: <strong>{entry.status}</strong> • Exit: <strong>{entry.exitCode}</strong> • {entry.durationMs.toFixed(1)} ms
                      </span>
                    </div>

                    {entry.stdout && (
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#F8FAFC' }}>
                        {entry.stdout}
                      </pre>
                    )}

                    {(entry.compilationErrors || entry.runtimeErrors || entry.stderr) && (
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#FDA4AF' }}>
                        {entry.compilationErrors || entry.runtimeErrors || entry.stderr}
                      </pre>
                    )}

                    {!entry.stdout && !entry.compilationErrors && !entry.runtimeErrors && !entry.stderr && (
                      <div style={{ color: '#94A3B8', fontStyle: 'italic' }}>(Process produced empty output)</div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </section>
    </PageContainer>
  );
};
