import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  submitCode,
  recordProctoringEvent,
  type QuestionSnapshot,
  type CodeSubmitResult,
} from '../../api/assessment';
import {
  normalizeCanonicalLanguage,
  sharedBrowserExecutionAdapter,
} from '../../utils/codeExecution/BrowserCodeExecutionAdapter';
import type {
  BrowserExecutionResult,
  BrowserRuntimeState,
  SampleSuiteExecutionResult,
} from '../../utils/codeExecution/types';

interface CodingPlaygroundPaneProps {
  attemptId: string;
  question: QuestionSnapshot;
  onAnswerSaved?: (code: string) => void;
  proctoringSessionId?: string;
}

type ConsoleTab = 'output' | 'custom' | 'sample' | 'submission';

const DEFAULT_BOILERPLATES: Record<string, string> = {
  python:
    '# Write your Python 3 solution here\n' +
    'import sys\n\n' +
    'def solve():\n' +
    '    data = sys.stdin.read()\n' +
    '    # Process input and print result\n' +
    '    pass\n\n' +
    'if __name__ == "__main__":\n' +
    '    solve()\n',
  java:
    'import java.util.*;\nimport java.io.*;\n\n' +
    'public class Solution {\n' +
    '    public static void main(String[] args) {\n' +
    '        Scanner sc = new Scanner(System.in);\n' +
    '        // Write your Java 17 solution here\n' +
    '    }\n' +
    '}\n',
};

function formatLanguageLabel(lang: string): string {
  const canonical = normalizeCanonicalLanguage(lang);
  if (canonical === 'python') return 'Python 3';
  if (canonical === 'java') return 'Java 17';
  if (canonical === 'javascript' || canonical === 'js') return 'JavaScript (Legacy)';
  if (canonical === 'cpp') return 'C++ (Legacy)';
  if (canonical === 'c') return 'C (Legacy)';
  return lang.toUpperCase();
}

function toMonacoLanguage(lang: string): string {
  const canonical = normalizeCanonicalLanguage(lang);
  if (canonical === 'python') return 'python';
  if (canonical === 'java') return 'java';
  if (canonical === 'javascript' || canonical === 'js') return 'javascript';
  if (canonical === 'cpp') return 'cpp';
  if (canonical === 'c') return 'c';
  return 'python';
}

export const CodingPlaygroundPane: React.FC<CodingPlaygroundPaneProps> = ({
  attemptId,
  question,
  onAnswerSaved,
  proctoringSessionId,
}) => {
  const details = question.programming_details;
  const authoritativeQuestionId =
    typeof question.question_id === 'number' && question.question_id > 0
      ? question.question_id
      : null;

  // Compute supported languages cleanly: normalize python3 -> python; prioritize Python 3 & Java
  const rawAllowed =
    details?.allowed_languages && details.allowed_languages.length > 0
      ? details.allowed_languages
      : ['python', 'java'];
  const canonicalAllowed = Array.from(
    new Set(rawAllowed.map((l) => normalizeCanonicalLanguage(l)))
  );
  const preferredModern = canonicalAllowed.filter((l) => l === 'python' || l === 'java');
  const selectableLanguages = preferredModern.length > 0 ? preferredModern : canonicalAllowed;

  const [language, setLanguage] = useState<string>(selectableLanguages[0] || 'python');
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});

  const getInitialCode = useCallback(
    (lang: string) => {
      const canonical = normalizeCanonicalLanguage(lang);
      const bp = details?.boilerplate_code || {};
      if (bp[lang]) return bp[lang];
      if (bp[canonical]) return bp[canonical];
      return DEFAULT_BOILERPLATES[canonical] || '# Write solution here\n';
    },
    [details]
  );

  const draftKey = `${question.question_order}_${language}`;
  const sourceCode = codeDrafts[draftKey] ?? getInitialCode(language);

  const setSourceCode = useCallback(
    (next: string) => {
      setCodeDrafts((prev) => ({ ...prev, [draftKey]: next }));
    },
    [draftKey]
  );

  const [ideDark, setIdeDark] = useState<boolean>(true);
  const [activeConsoleTab, setActiveConsoleTab] = useState<ConsoleTab>('sample');
  const [customInput, setCustomInput] = useState<string>('');
  const [consoleOpen, setConsoleOpen] = useState<boolean>(true);
  const [consoleHeight, setConsoleHeight] = useState<number>(220);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(false);

  const [runtimeState, setRuntimeState] = useState<BrowserRuntimeState>('IDLE');
  const [runtimeDetail, setRuntimeDetail] = useState<string>('');

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [customRunResult, setCustomRunResult] = useState<BrowserExecutionResult | null>(null);
  const [sampleSuiteResult, setSampleSuiteResult] = useState<SampleSuiteExecutionResult | null>(null);
  const [lastRunKind, setLastRunKind] = useState<'custom' | 'sample' | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<CodeSubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string>('');
  const [showPasteWarning, setShowPasteWarning] = useState<boolean>(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{ layout: () => void } | null>(null);

  // Track responsive layout cleanly without nested scrollbars
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompactViewport(entry.contentRect.width < 920);
        editorRef.current?.layout();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Trigger Monaco relayout whenever console height or collapse state changes
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    return () => window.cancelAnimationFrame(id);
  }, [consoleHeight, consoleOpen, isCompactViewport]);

  // Reset language/results cleanly on question switch & warm up Pyodide
  useEffect(() => {
    const firstLang = selectableLanguages[0] || 'python';
    setLanguage(firstLang);
    setCustomRunResult(null);
    setSampleSuiteResult(null);
    setLastRunKind(null);
    setSubmitResult(null);
    setSubmitError('');
  }, [question.question_order]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (normalizeCanonicalLanguage(language) === 'python') {
      sharedBrowserExecutionAdapter.warmup('python', (st, detail) => {
        setRuntimeState(st);
        setRuntimeDetail(detail || '');
      });
    }
  }, [language]);

  const triggerPasteRestrictionNotice = () => {
    setShowPasteWarning(true);
    const activeSessionId = proctoringSessionId || sessionStorage.getItem('csl_proctoring_session_id');
    if (activeSessionId) {
      recordProctoringEvent(activeSessionId, {
        event_type: 'CLIPBOARD_PASTE_ATTEMPT',
        severity: 'WARNING',
        event_id: `paste_${Date.now()}`,
        metadata: {
          key: 'paste',
          target: 'MonacoEditor',
          question_order: question.question_order,
          question_id: authoritativeQuestionId,
        },
      }).catch(console.warn);
    }
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    editor.onKeyDown((e: any) => {
      const isPaste =
        ((e.ctrlKey || e.metaKey) && (e.keyCode === monaco.KeyCode.KeyV || e.code === 'KeyV')) ||
        (e.shiftKey && (e.keyCode === monaco.KeyCode.Insert || e.code === 'Insert'));

      if (isPaste) {
        e.preventDefault();
        e.stopPropagation();
        triggerPasteRestrictionNotice();
      }
    });

    const domNode = editor.getDomNode();
    if (domNode) {
      domNode.addEventListener(
        'paste',
        (e: ClipboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          triggerPasteRestrictionNotice();
        },
        true
      );
    }

    try {
      const pasteAction = editor.getAction('editor.action.clipboardPasteAction');
      if (pasteAction) {
        pasteAction.run = () => {
          triggerPasteRestrictionNotice();
          return Promise.resolve();
        };
      }
    } catch (actErr) {
      console.warn('Monaco clipboard action override notice:', actErr);
    }
  };

  const handleResetBoilerplate = () => {
    if (window.confirm('Reset code to initial boilerplate template?')) {
      setSourceCode(getInitialCode(language));
    }
  };

  const handleStartResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = consoleHeight;
    const maxHeight = Math.max(260, (rightPaneRef.current?.clientHeight || 560) - 170);

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = startY - moveEvt.clientY;
      const clamped = Math.min(maxHeight, Math.max(130, startHeight + delta));
      setConsoleHeight(clamped);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      editorRef.current?.layout();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // ── BROWSER-ONLY RUN CODE (NEVER CALLS /api/assessment/code/run/) ──
  const handleRun = async (useCustom: boolean) => {
    setIsRunning(true);
    setConsoleOpen(true);
    setActiveConsoleTab(useCustom ? 'output' : 'sample');
    setSubmitError('');

    const timeoutMs = Math.max(2500, Math.round(((details?.time_limit_seconds || 2.0) + 2.0) * 1000));

    try {
      if (useCustom) {
        setLastRunKind('custom');
        const res = await sharedBrowserExecutionAdapter.runCustomInput({
          sourceCode,
          language,
          stdin: customInput,
          timeoutMs,
          onRuntimeStateChange: (st, detail) => {
            setRuntimeState(st);
            setRuntimeDetail(detail || '');
          },
        });
        setCustomRunResult(res);
      } else {
        setLastRunKind('sample');
        const samples = details?.sample_test_cases || [];
        const suiteRes = await sharedBrowserExecutionAdapter.runSampleTests(
          {
            sourceCode,
            language,
            timeoutMs,
            onRuntimeStateChange: (st, detail) => {
              setRuntimeState(st);
              setRuntimeDetail(detail || '');
            },
          },
          samples.map((s, idx) => ({
            id: s.id || String(idx + 1),
            input_text: s.input_text || '',
            expected_output: s.expected_output || '',
            explanation: s.explanation,
          }))
        );
        setSampleSuiteResult(suiteRes);
        if (
          suiteRes.overallStatus === 'COMPILATION_ERROR' ||
          suiteRes.overallStatus === 'RUNTIME_LOAD_ERROR' ||
          suiteRes.overallStatus === 'BROWSER_RUNTIME_UNSUPPORTED'
        ) {
          setActiveConsoleTab('output');
        }
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancelRun = () => {
    sharedBrowserExecutionAdapter.cancelCurrentRun();
    setIsRunning(false);
  };

  // ── AUTHORITATIVE SERVER SUBMIT SOLUTION (USES DB question_id ONLY) ──
  const handleSubmit = async () => {
    if (!authoritativeQuestionId) {
      setSubmitError('Authoritative database question ID is missing on this snapshot. Refresh attempt state before submitting.');
      setConsoleOpen(true);
      setActiveConsoleTab('submission');
      return;
    }
    if (!sourceCode.trim()) {
      setSubmitError('Source code cannot be empty before submitting.');
      setConsoleOpen(true);
      setActiveConsoleTab('submission');
      return;
    }

    setIsSubmitting(true);
    setConsoleOpen(true);
    setActiveConsoleTab('submission');
    setSubmitError('');
    try {
      const res = await submitCode({
        attempt_id: attemptId,
        question_id: authoritativeQuestionId,
        language: normalizeCanonicalLanguage(language),
        source_code: sourceCode,
      });
      setSubmitResult(res);
      onAnswerSaved?.(sourceCode);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail ||
          err?.message ||
          'Failed to submit solution for authoritative server evaluation.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPythonSelected = normalizeCanonicalLanguage(language) === 'python';
  const isJavaSelected = normalizeCanonicalLanguage(language) === 'java';

  const paneBg = ideDark ? '#0F172A' : '#FFFFFF';
  const paneCard = ideDark ? '#111827' : '#FFFFFF';
  const paneHeaderBg = ideDark ? '#1E293B' : '#F8FAFC';
  const paneBorder = ideDark ? '#334155' : '#E2E8F0';
  const textMain = ideDark ? '#F1F5F9' : '#0F172A';
  const textSub = ideDark ? '#94A3B8' : '#475569';
  const codeBlockBg = ideDark ? '#0B1120' : '#F8FAFC';

  return (
    <div
      ref={rootRef}
      data-testid="coding-workspace"
      style={{
        display: 'grid',
        gridTemplateColumns: isCompactViewport ? '1fr' : 'minmax(320px, 41%) minmax(0, 59%)',
        gridTemplateRows: isCompactViewport ? 'minmax(220px, 42%) minmax(340px, 58%)' : '1fr',
        flex: 1,
        minHeight: 0,
        height: '100%',
        gap: '12px',
        boxSizing: 'border-box',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ─── LEFT PANE: INDEPENDENTLY SCROLLABLE PROBLEM STATEMENT ─── */}
      <div
        data-testid="coding-problem-pane"
        style={{
          backgroundColor: paneCard,
          borderRadius: '12px',
          border: `1px solid ${paneBorder}`,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${paneBorder}`,
            backgroundColor: paneHeaderBg,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: textMain }}>
              {question.prompt}
            </h2>
            <span style={{ fontSize: '11.5px', color: textSub }}>
              Time limit: {details?.time_limit_seconds || 2.0}s • Memory: {details?.memory_limit_mb || 256}MB
            </span>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '9999px',
              backgroundColor: ideDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
              color: ideDark ? '#93C5FD' : '#1455B8',
            }}
          >
            {selectableLanguages.map(formatLanguageLabel).join(' / ')}
          </span>
        </div>

        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
            fontSize: '13.5px',
            lineHeight: 1.65,
            color: textMain,
          }}
        >
          <div style={{ whiteSpace: 'pre-wrap', marginBottom: '16px', userSelect: 'none' }}>
            {details?.problem_statement || question.prompt}
          </div>

          {details?.constraints && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: textMain, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Constraints
              </h3>
              <pre
                style={{
                  backgroundColor: codeBlockBg,
                  color: textMain,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  margin: 0,
                  border: `1px solid ${paneBorder}`,
                  whiteSpace: 'pre-wrap',
                  fontFamily: "'JetBrains Mono', Consolas, monospace",
                }}
              >
                {details.constraints}
              </pre>
            </div>
          )}

          {details?.input_format && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: textMain, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Input Format
              </h3>
              <div
                style={{
                  backgroundColor: codeBlockBg,
                  color: textMain,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  border: `1px solid ${paneBorder}`,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {details.input_format}
              </div>
            </div>
          )}

          {details?.output_format && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: textMain, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Output Format
              </h3>
              <div
                style={{
                  backgroundColor: codeBlockBg,
                  color: textMain,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  border: `1px solid ${paneBorder}`,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {details.output_format}
              </div>
            </div>
          )}

          {details?.sample_test_cases && details.sample_test_cases.length > 0 && (
            <div>
              <h3 style={{ fontSize: '12.5px', fontWeight: 800, color: textMain, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Public Sample Test Cases
              </h3>
              {details.sample_test_cases.map((sample, idx) => (
                <div
                  key={sample.id || idx}
                  style={{
                    marginBottom: '12px',
                    border: `1px solid ${paneBorder}`,
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundColor: codeBlockBg,
                  }}
                >
                  <div
                    style={{
                      backgroundColor: paneHeaderBg,
                      padding: '6px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: textSub,
                      borderBottom: `1px solid ${paneBorder}`,
                    }}
                  >
                    Sample Case {idx + 1}
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: textSub, marginBottom: '2px' }}>Input:</div>
                      <pre
                        style={{
                          backgroundColor: paneBg,
                          color: textMain,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          margin: 0,
                          fontSize: '11.5px',
                          fontFamily: "'JetBrains Mono', Consolas, monospace",
                          whiteSpace: 'pre-wrap',
                          border: `1px solid ${paneBorder}`,
                        }}
                      >
                        {sample.input_text || '(empty)'}
                      </pre>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: textSub, marginBottom: '2px' }}>Expected Output:</div>
                      <pre
                        style={{
                          backgroundColor: paneBg,
                          color: textMain,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          margin: 0,
                          fontSize: '11.5px',
                          fontFamily: "'JetBrains Mono', Consolas, monospace",
                          whiteSpace: 'pre-wrap',
                          border: `1px solid ${paneBorder}`,
                        }}
                      >
                        {sample.expected_output}
                      </pre>
                    </div>
                    {sample.explanation && (
                      <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: textSub, fontStyle: 'italic' }}>
                        Explanation: {sample.explanation}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── RIGHT PANE: MONACO EDITOR + RESIZABLE CONSOLE ─── */}
      <div
        ref={rightPaneRef}
        data-testid="coding-editor-pane"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          backgroundColor: ideDark ? '#111827' : '#FFFFFF',
          borderRadius: '12px',
          overflow: 'hidden',
          border: `1px solid ${paneBorder}`,
        }}
      >
        {/* Editor Toolbar */}
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: ideDark ? '#1E293B' : '#F8FAFC',
            borderBottom: `1px solid ${paneBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              data-testid="coding-language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                backgroundColor: ideDark ? '#0F172A' : '#FFFFFF',
                color: textMain,
                border: `1px solid ${paneBorder}`,
                borderRadius: '7px',
                padding: '5px 10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {selectableLanguages.map((l) => (
                <option key={l} value={l}>
                  {formatLanguageLabel(l)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleResetBoilerplate}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${paneBorder}`,
                color: textSub,
                borderRadius: '7px',
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ↺ Reset
            </button>

            <button
              type="button"
              data-testid="coding-theme-toggle"
              onClick={() => setIdeDark((v) => !v)}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${paneBorder}`,
                color: textSub,
                borderRadius: '7px',
                padding: '4px 9px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {ideDark ? '☀️ Light' : '🌙 Dark'}
            </button>

            {isPythonSelected && (
              <span
                data-testid="python-runtime-status"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '9999px',
                  backgroundColor:
                    runtimeState === 'ERROR'
                      ? 'rgba(239, 68, 68, 0.16)'
                      : runtimeState === 'READY'
                      ? 'rgba(16, 185, 129, 0.16)'
                      : 'rgba(59, 130, 246, 0.16)',
                  color:
                    runtimeState === 'ERROR'
                      ? '#F87171'
                      : runtimeState === 'READY'
                      ? '#34D399'
                      : '#60A5FA',
                }}
              >
                {runtimeState === 'LOADING_RUNTIME'
                  ? '⏳ Loading Python 3...'
                  : runtimeState === 'READY'
                  ? '● Python 3 Browser Ready'
                  : runtimeState === 'EXECUTING'
                  ? '⚡ Running in Worker...'
                  : runtimeState === 'ERROR'
                  ? '⚠ Pyodide Load Error'
                  : 'Python 3 Worker'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {isRunning && (
              <button
                type="button"
                data-testid="coding-cancel-btn"
                onClick={handleCancelRun}
                style={{
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ■ Stop
              </button>
            )}

            <button
              type="button"
              data-testid="coding-run-btn"
              onClick={() => handleRun(activeConsoleTab === 'custom')}
              disabled={isRunning || isSubmitting}
              title={
                isJavaSelected
                  ? 'Browser Java execution is disabled pending compatibility verification; click to see details or use Submit Solution.'
                  : activeConsoleTab === 'custom'
                  ? 'Run Python 3 in browser against Custom Input'
                  : 'Run Python 3 in browser against Public Sample Tests'
              }
              style={{
                backgroundColor: isRunning ? '#475569' : '#0D9488',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '7px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {isRunning
                ? 'Running...'
                : activeConsoleTab === 'custom'
                ? '▶ Run Custom Input'
                : '▶ Run Code'}
            </button>

            <button
              type="button"
              data-testid="coding-submit-btn"
              onClick={handleSubmit}
              disabled={isRunning || isSubmitting}
              style={{
                backgroundColor: isSubmitting ? '#475569' : '#1455B8',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '7px',
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Grading...' : '✓ Submit Solution'}
            </button>
          </div>
        </div>

        {/* Monaco Editor Region */}
        <div style={{ flex: 1, minHeight: '160px', position: 'relative' }}>
          <Editor
            height="100%"
            onMount={handleEditorDidMount}
            language={toMonacoLanguage(language)}
            value={sourceCode}
            onChange={(val) => setSourceCode(val || '')}
            theme={ideDark ? 'vs-dark' : 'light'}
            options={{
              minimap: { enabled: false },
              fontSize: 13.5,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              formatOnType: true,
              lineNumbers: 'on',
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Resizable Drag Splitter */}
        {consoleOpen && (
          <div
            data-testid="coding-console-resizer"
            onMouseDown={handleStartResize}
            title="Drag to resize execution console"
            style={{
              height: '6px',
              cursor: 'row-resize',
              backgroundColor: ideDark ? '#1E293B' : '#E2E8F0',
              borderTop: `1px solid ${paneBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: '36px', height: '2px', borderRadius: '9999px', backgroundColor: ideDark ? '#475569' : '#94A3B8' }} />
          </div>
        )}

        {/* Resizable & Collapsible Console */}
        <div
          data-testid="coding-execution-console"
          style={{
            height: consoleOpen ? `${consoleHeight}px` : '38px',
            minHeight: consoleOpen ? '130px' : '38px',
            backgroundColor: ideDark ? '#0B1120' : '#F8FAFC',
            borderTop: `1px solid ${paneBorder}`,
            display: 'flex',
            flexDirection: 'column',
            transition: 'height 0.12s ease',
          }}
        >
          {/* Console Tab Header Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: consoleOpen ? `1px solid ${paneBorder}` : 'none',
              backgroundColor: ideDark ? '#1E293B' : '#F1F5F9',
              paddingRight: '10px',
            }}
          >
            <div style={{ display: 'flex', overflowX: 'auto' }}>
              {(
                [
                  { id: 'output', label: 'Output' },
                  { id: 'custom', label: 'Custom Input' },
                  {
                    id: 'sample',
                    label: sampleSuiteResult
                      ? `Sample Tests (${sampleSuiteResult.passedCount}/${sampleSuiteResult.totalCount})`
                      : `Sample Tests (${details?.sample_test_cases?.length || 0})`,
                  },
                  {
                    id: 'submission',
                    label: submitResult
                      ? `Submission Results (${submitResult.verdict})`
                      : 'Submission Results',
                  },
                ] as const
              ).map((tab) => {
                const active = activeConsoleTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`console-tab-${tab.id}`}
                    onClick={() => {
                      setActiveConsoleTab(tab.id);
                      setConsoleOpen(true);
                    }}
                    style={{
                      padding: '8px 13px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: active ? (ideDark ? '#38BDF8' : '#1455B8') : textSub,
                      backgroundColor: active ? (ideDark ? '#0B1120' : '#FFFFFF') : 'transparent',
                      border: 'none',
                      borderTop: active
                        ? `2px solid ${ideDark ? '#38BDF8' : '#1455B8'}`
                        : '2px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="toggle-console-btn"
              onClick={() => setConsoleOpen((o) => !o)}
              style={{
                background: 'none',
                border: `1px solid ${paneBorder}`,
                color: textSub,
                borderRadius: '5px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {consoleOpen ? '▾ Collapse' : '▴ Expand'}
            </button>
          </div>

          {/* Console Tab Body */}
          {consoleOpen && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: '12px 14px',
                overflowY: 'auto',
                color: textMain,
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', Consolas, monospace",
              }}
            >
              {activeConsoleTab === 'custom' && (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: textSub }}>
                      Standard Input (stdin) for browser execution:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRun(true)}
                      disabled={isRunning || isSubmitting}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#0D9488',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ▶ Execute with Input
                    </button>
                  </div>
                  <textarea
                    data-testid="custom-stdin-textarea"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Enter custom stdin lines here..."
                    style={{
                      flex: 1,
                      minHeight: '72px',
                      backgroundColor: ideDark ? '#1E293B' : '#FFFFFF',
                      color: textMain,
                      border: `1px solid ${paneBorder}`,
                      borderRadius: '7px',
                      padding: '8px 10px',
                      fontFamily: "'JetBrains Mono', Consolas, monospace",
                      fontSize: '12px',
                      resize: 'none',
                    }}
                  />
                </div>
              )}

              {activeConsoleTab === 'sample' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {isJavaSelected && (
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(245, 184, 61, 0.14)',
                        border: '1px solid rgba(245, 184, 61, 0.45)',
                        color: ideDark ? '#FCD34D' : '#92400E',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '12px',
                      }}
                    >
                      Browser Java execution is disabled pending full compatibility &amp; GPL-2.0 clearance. Use{' '}
                      <strong>Submit Solution</strong> for server-side Java evaluation.
                    </div>
                  )}

                  {sampleSuiteResult && lastRunKind === 'sample' && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        backgroundColor:
                          sampleSuiteResult.overallStatus === 'ACCEPTED'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        border: `1px solid ${sampleSuiteResult.overallStatus === 'ACCEPTED' ? '#10B981' : '#EF4444'}`,
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      Sample Run Verdict: {sampleSuiteResult.overallStatus} ({sampleSuiteResult.passedCount}/{sampleSuiteResult.totalCount} passed)
                    </div>
                  )}

                  {(details?.sample_test_cases || []).length === 0 ? (
                    <div style={{ color: textSub }}>
                      No public sample cases attached. Use Custom Input or Submit Solution.
                    </div>
                  ) : (
                    (details?.sample_test_cases || []).map((stc, idx) => {
                      const matchedRes = sampleSuiteResult?.results?.find(
                        (r) => r.index === idx + 1 || r.testCaseId === String(stc.id)
                      );
                      return (
                        <div
                          key={stc.id || idx}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '7px',
                            border: `1px solid ${
                              matchedRes
                                ? matchedRes.passed
                                  ? '#10B981'
                                  : '#EF4444'
                                : paneBorder
                            }`,
                            backgroundColor: ideDark ? '#111827' : '#FFFFFF',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <strong style={{ color: textMain }}>Sample Case {idx + 1}</strong>
                            {matchedRes && (
                              <span style={{ fontWeight: 800, color: matchedRes.passed ? '#10B981' : '#EF4444' }}>
                                {matchedRes.passed ? '✓ PASSED' : `✗ ${matchedRes.status}`} ({matchedRes.executionTimeMs.toFixed(1)}ms)
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11.5px', color: textSub, whiteSpace: 'pre-wrap' }}>
                            <div>Input: {stc.input_text || '(empty)'}</div>
                            <div>Expected: {stc.expected_output}</div>
                            {matchedRes && <div>Actual: {matchedRes.actualOutput || '(empty)'}</div>}
                            {matchedRes?.stderr && (
                              <pre style={{ margin: '4px 0 0 0', color: '#F87171', whiteSpace: 'pre-wrap' }}>
                                {matchedRes.stderr}
                              </pre>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeConsoleTab === 'output' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {runtimeDetail && runtimeState === 'ERROR' && (
                    <div style={{ padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.14)', color: '#F87171' }}>
                      Runtime Error: {runtimeDetail}
                    </div>
                  )}

                  {lastRunKind === 'custom' && customRunResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div
                        data-testid="browser-run-verdict"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '7px',
                          fontWeight: 700,
                          fontFamily: "'Inter', sans-serif",
                          backgroundColor:
                            customRunResult.status === 'ACCEPTED'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : customRunResult.status === 'BROWSER_RUNTIME_UNSUPPORTED'
                              ? 'rgba(245, 184, 61, 0.16)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color:
                            customRunResult.status === 'ACCEPTED'
                              ? '#10B981'
                              : customRunResult.status === 'BROWSER_RUNTIME_UNSUPPORTED'
                              ? '#F59E0B'
                              : '#EF4444',
                        }}
                      >
                        Status: {customRunResult.status} ({customRunResult.executionTimeMs.toFixed(1)}ms)
                      </div>

                      {customRunResult.stdout && (
                        <div>
                          <div style={{ fontWeight: 700, color: '#38BDF8', marginBottom: '3px' }}>Stdout:</div>
                          <pre
                            data-testid="browser-run-stdout"
                            style={{
                              margin: 0,
                              padding: '8px',
                              borderRadius: '6px',
                              backgroundColor: ideDark ? '#1E293B' : '#FFFFFF',
                              border: `1px solid ${paneBorder}`,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {customRunResult.stdout}
                          </pre>
                        </div>
                      )}

                      {(customRunResult.compilationErrors || customRunResult.runtimeErrors || customRunResult.stderr) && (
                        <div>
                          <div style={{ fontWeight: 700, color: '#F87171', marginBottom: '3px' }}>Diagnostics / Stderr:</div>
                          <pre
                            data-testid="browser-run-stderr"
                            style={{
                              margin: 0,
                              padding: '8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              color: '#FCA5A5',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {customRunResult.compilationErrors || customRunResult.runtimeErrors || customRunResult.stderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {lastRunKind === 'sample' && sampleSuiteResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div
                        data-testid="browser-sample-verdict"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '7px',
                          fontWeight: 700,
                          fontFamily: "'Inter', sans-serif",
                          backgroundColor:
                            sampleSuiteResult.overallStatus === 'ACCEPTED'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color: sampleSuiteResult.overallStatus === 'ACCEPTED' ? '#10B981' : '#EF4444',
                        }}
                      >
                        Browser Sample Suite: {sampleSuiteResult.overallStatus} ({sampleSuiteResult.passedCount}/{sampleSuiteResult.totalCount} passed)
                      </div>

                      {(sampleSuiteResult.compilationErrors || sampleSuiteResult.runtimeErrors || sampleSuiteResult.unsupportedReason) && (
                        <pre style={{ margin: 0, padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#FCA5A5', whiteSpace: 'pre-wrap' }}>
                          {sampleSuiteResult.compilationErrors || sampleSuiteResult.runtimeErrors || sampleSuiteResult.unsupportedReason}
                        </pre>
                      )}
                    </div>
                  )}

                  {!customRunResult && !sampleSuiteResult && !isRunning && (
                    <div style={{ color: textSub }}>
                      Ready. Click &quot;Run Code&quot; for Python 3 browser execution or switch to &quot;Custom Input&quot; to supply stdin.
                    </div>
                  )}
                </div>
              )}

              {activeConsoleTab === 'submission' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {submitError && (
                    <div
                      data-testid="coding-submit-error"
                      style={{
                        padding: '10px 12px',
                        borderRadius: '7px',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #EF4444',
                        color: '#FCA5A5',
                      }}
                    >
                      {submitError}
                    </div>
                  )}

                  {submitResult && (
                    <div data-testid="coding-submit-result" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          backgroundColor: submitResult.verdict === 'ACCEPTED' ? '#064E3B' : '#7F1D1D',
                          color: '#FFFFFF',
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: 800 }}>
                          Authoritative Verdict: {submitResult.verdict}
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '3px' }}>
                          Score Awarded: <strong>{submitResult.score_awarded} pts</strong> • Passed:{' '}
                          {submitResult.passed_test_cases} / {submitResult.total_test_cases} test cases (
                          {submitResult.execution_time_ms.toFixed(1)}ms)
                        </div>
                      </div>

                      {submitResult.compile_output && (
                        <pre style={{ margin: 0, padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.14)', color: '#FCA5A5', whiteSpace: 'pre-wrap' }}>
                          {submitResult.compile_output}
                        </pre>
                      )}

                      {submitResult.results && submitResult.results.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {submitResult.results.map((r, idx) => (
                            <div
                              key={r.test_case_id || idx}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '6px',
                                backgroundColor: r.passed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                border: `1px solid ${r.passed ? '#059669' : '#DC2626'}`,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, color: textMain }}>
                                  {r.is_public ? `Sample Case ${idx + 1} (Public)` : `Evaluation Case ${idx + 1} (Hidden)`}
                                </span>
                                <span style={{ fontWeight: 800, color: r.passed ? '#10B981' : '#EF4444' }}>
                                  {r.passed ? '✓ PASSED' : `✗ ${r.status || 'FAILED'}`} ({r.execution_time_ms.toFixed(1)}ms)
                                </span>
                              </div>
                              {r.is_public && r.input_text !== null && r.input_text !== undefined && (
                                <div style={{ marginTop: '4px', fontSize: '11px', color: textSub }}>
                                  Input: <code>{r.input_text}</code> | Expected: <code>{r.expected_output}</code>
                                  {r.actual_output !== null && r.actual_output !== undefined && (
                                    <span> | Output: <code>{r.actual_output.trim()}</code></span>
                                  )}
                                </div>
                              )}
                              {!r.is_public && (
                                <div style={{ marginTop: '2px', fontSize: '10.5px', color: textSub, fontStyle: 'italic' }}>
                                  Confidential hidden evaluation case — inputs/outputs withheld
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!submitResult && !submitError && !isSubmitting && (
                    <div style={{ color: textSub }}>
                      Click &quot;Submit Solution&quot; to run authoritative evaluation against public and hidden test cases.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Paste Deterrence Warning Modal */}
      {showPasteWarning && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: '#1E293B',
              border: '2px solid #EF4444',
              borderRadius: '14px',
              padding: '24px 28px',
              maxWidth: '460px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🛡️</div>
            <span
              style={{
                display: 'inline-block',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#EF4444',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              CSL SENTINEL
            </span>
            <h3 style={{ margin: '0 0 10px 0', color: '#F87171', fontSize: '17px', fontWeight: 800, letterSpacing: '0.02em' }}>
              AI PROCTORING ENABLED — CLIPBOARD RESTRICTION ACTIVE
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#CBD5E1', fontSize: '13px', lineHeight: 1.6 }}>
              External clipboard pasting is strictly prohibited during the assessment to preserve examination integrity.
              Please construct and type your solution directly within the Monaco Editor.
            </p>
            <button
              onClick={() => setShowPasteWarning(false)}
              style={{
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              I Understand &amp; Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
