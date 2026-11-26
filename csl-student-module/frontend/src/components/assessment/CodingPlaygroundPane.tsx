import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  submitCode,
  fetchEvaluationCases,
  recordProctoringEvent,
  type QuestionSnapshot,
  type CodeSubmitPayload,
  type CodeSubmitResult,
} from '../../api/assessment';
import {
  normalizeCanonicalLanguage,
  sharedBrowserExecutionAdapter,
} from '../../utils/codeExecution/BrowserCodeExecutionAdapter';
import {
  buildCodingDraftKey,
  loadCodingDraft,
  resetCodingDraft,
  resolveDraftQuestionKey,
  saveCodingDraft,
} from '../../utils/codeExecution/draftStorage';
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
type MaximizedPane = 'none' | 'problem' | 'editor';

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

function getIdeTokens(ideDark: boolean) {
  return {
    bgSurface: ideDark ? '#111827' : '#FFFFFF',
    bgHeader: ideDark ? '#182234' : '#F8FAFC',
    bgSubtle: ideDark ? '#0B1220' : '#F8FAFC',
    bgCode: ideDark ? '#090F1A' : '#F1F5F9',
    bgInput: ideDark ? '#1E293B' : '#FFFFFF',
    border: ideDark ? '#2B394F' : '#E2E8F0',
    borderStrong: ideDark ? '#3B4D6B' : '#CBD5E1',
    textMain: ideDark ? '#F1F5F9' : '#0F172A',
    textSecondary: ideDark ? '#CBD5E1' : '#334155',
    textMuted: ideDark ? '#94A3B8' : '#64748B',
    accentBlue: ideDark ? '#3B82F6' : '#1455D9',
    accentBlueHover: ideDark ? '#2563EB' : '#0B2E6F',
    accentBlueSoft: ideDark ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF',
    accentBlueText: ideDark ? '#93C5FD' : '#1455D9',
    runTeal: '#0D9488',
    runTealHover: '#0F766E',
    successBg: ideDark ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5',
    successBorder: ideDark ? 'rgba(16, 185, 129, 0.4)' : '#86EFAC',
    successText: ideDark ? '#34D399' : '#15803D',
    dangerBg: ideDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
    dangerBorder: ideDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
    dangerText: ideDark ? '#FCA5A5' : '#B91C1C',
    warnBg: ideDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
    warnBorder: ideDark ? 'rgba(245, 158, 11, 0.4)' : '#FDE68A',
    warnText: ideDark ? '#FCD34D' : '#92400E',
    shadow: ideDark
      ? '0 2px 10px rgba(0, 0, 0, 0.35)'
      : '0 1px 3px rgba(15, 23, 42, 0.06)',
  };
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

  const draftQuestionKey = resolveDraftQuestionKey(question.question_id, question.question_order);
  const draftKey = buildCodingDraftKey(attemptId, draftQuestionKey, language);

  const persistedDraft = loadCodingDraft(attemptId, draftQuestionKey, language);
  const sourceCode =
    codeDrafts[draftKey] ??
    (persistedDraft !== null ? persistedDraft : getInitialCode(language));

  const setSourceCode = useCallback(
    (next: string) => {
      saveCodingDraft(attemptId, draftQuestionKey, language, next);
      setCodeDrafts((prev) => ({ ...prev, [draftKey]: next }));
    },
    [attemptId, draftQuestionKey, language, draftKey]
  );

  // Cohesive Light Stitch IDE default with 1-click Dark IDE toggle
  const [ideDark, setIdeDark] = useState<boolean>(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<ConsoleTab>('sample');
  const [selectedSampleIdx, setSelectedSampleIdx] = useState<number>(0);
  const [customInput, setCustomInput] = useState<string>('');
  const [consoleOpen, setConsoleOpen] = useState<boolean>(true);
  const [consoleHeight, setConsoleHeight] = useState<number>(215);
  const [splitPercent, setSplitPercent] = useState<number>(40);
  const [maximizedPane, setMaximizedPane] = useState<MaximizedPane>('none');
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 980 : false
  );

  const [runtimeState, setRuntimeState] = useState<BrowserRuntimeState>('IDLE');
  const [runtimeDetail, setRuntimeDetail] = useState<string>('');

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [customRunResult, setCustomRunResult] = useState<BrowserExecutionResult | null>(null);
  const [sampleSuiteResult, setSampleSuiteResult] = useState<SampleSuiteExecutionResult | null>(null);
  const [lastRunKind, setLastRunKind] = useState<'custom' | 'sample' | null>(null);
  const inFlightSubmitRef = useRef<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<CodeSubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string>('');
  const [showPasteWarning, setShowPasteWarning] = useState<boolean>(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{
    layout: () => void;
    getAction?: (id: string) => { run?: () => Promise<void> | void } | null;
  } | null>(null);
  const runShortcutRef = useRef<() => void>(() => {});
  const submitShortcutRef = useRef<() => void>(() => {});

  // Track responsive layout cleanly without nested scrollbars
  useEffect(() => {
    const el = rootRef.current;
    const syncCompact = (w?: number) => {
      const containerW = w ?? el?.getBoundingClientRect().width ?? window.innerWidth;
      setIsCompactViewport(window.innerWidth < 980 || Math.round(containerW) < 960);
    };
    syncCompact();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        syncCompact(entry.contentRect.width);
        editorRef.current?.layout();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Trigger Monaco relayout whenever split, maximize, console height, or collapse state changes
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    return () => window.cancelAnimationFrame(id);
  }, [consoleHeight, consoleOpen, splitPercent, maximizedPane, isCompactViewport]);

  // Reset per-question execution results & selected sample on question switch
  useEffect(() => {
    const firstLang = selectableLanguages[0] || 'python';
    setLanguage(firstLang);
    setSelectedSampleIdx(0);
    setCustomRunResult(null);
    setSampleSuiteResult(null);
    setLastRunKind(null);
    setSubmitResult(null);
    setSubmitError('');
  }, [question.question_id, question.question_order]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canonical = normalizeCanonicalLanguage(language);
    if (canonical === 'python' || canonical === 'java') {
      sharedBrowserExecutionAdapter.warmup(canonical, (st, detail) => {
        setRuntimeState(st);
        setRuntimeDetail(detail || '');
      });
    } else {
      setRuntimeState('IDLE');
      setRuntimeDetail('');
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

    // Keyboard shortcuts: Ctrl/Cmd + Enter => Run, Ctrl/Cmd + Shift + Enter => Submit
    try {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        runShortcutRef.current();
      });
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => {
          submitShortcutRef.current();
        }
      );
    } catch {
      // ignore shortcut registration errors
    }

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
      const initial = resetCodingDraft(
        attemptId,
        draftQuestionKey,
        language,
        getInitialCode(language)
      );
      setCodeDrafts((prev) => ({ ...prev, [draftKey]: initial }));
    }
  };

  const handleStartSplitResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = rootRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMouseMove = (moveEvt: MouseEvent) => {
      const rawPct = ((moveEvt.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(62, Math.max(26, rawPct));
      setSplitPercent(clamped);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      editorRef.current?.layout();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleStartConsoleResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = consoleHeight;
    const maxHeight = Math.max(280, (rightPaneRef.current?.clientHeight || 600) - 180);

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

    const canonicalLang = normalizeCanonicalLanguage(language);
    const timeoutMs =
      canonicalLang === 'java'
        ? Math.max(5000, Math.round(((details?.time_limit_seconds || 2.0) + 4.0) * 1000))
        : Math.max(2500, Math.round(((details?.time_limit_seconds || 2.0) + 2.0) * 1000));

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

  // ── BROWSER-FIRST EVALUATION + DJANGO SUBMISSION PERSISTENCE ──
  const handleSubmit = async () => {
    if (inFlightSubmitRef.current || isSubmitting) return;
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

    // Step 2: Save current draft immediately before locking UI
    saveCodingDraft(attemptId, draftQuestionKey, language, sourceCode);

    // Step 3: Lock UI against duplicate / racing submissions
    inFlightSubmitRef.current = true;
    setIsSubmitting(true);
    setConsoleOpen(true);
    setActiveConsoleTab('submission');
    setSubmitError('');

    const canonical = normalizeCanonicalLanguage(language);
    const timeoutMs =
      canonical === 'java'
        ? Math.max(5000, Math.round(((details?.time_limit_seconds || 2.0) + 4.0) * 1000))
        : Math.max(2500, Math.round(((details?.time_limit_seconds || 2.0) + 2.0) * 1000));
    let questionMaxMarks = Math.max(1, Number(question.marks) || 10);
    let questionComparisonMode = details?.comparison_mode || 'TRIMMED';
    let configuredCases = details?.sample_test_cases || [];

    // Step 4: Load full assessment test-case configuration (Sample + Additional + Hidden) on Submit
    try {
      const evalConfig = await fetchEvaluationCases(attemptId, authoritativeQuestionId);
      if (evalConfig && Array.isArray(evalConfig.test_cases) && evalConfig.test_cases.length > 0) {
        configuredCases = evalConfig.test_cases;
      }
      if (evalConfig?.comparison_mode) {
        questionComparisonMode = evalConfig.comparison_mode;
      }
      if (evalConfig?.max_marks) {
        questionMaxMarks = Math.max(1, Number(evalConfig.max_marks));
      }
    } catch {
      // Fallback cleanly to snapshot sample cases if evaluation-cases fetch fails
    }

    let evalPayload: CodeSubmitPayload['evaluation_summary'] | undefined;
    let testCaseResultsPayload: CodeSubmitPayload['test_case_results'] | undefined;
    let engineVersion = sharedBrowserExecutionAdapter.getEngineVersion(language);
    let evalStatusForMeta =
      lastRunKind === 'sample' && sampleSuiteResult
        ? sampleSuiteResult.overallStatus
        : lastRunKind === 'custom' && customRunResult
        ? customRunResult.status
        : 'NOT_RUN_LOCALLY';
    let evalDurationMs =
      lastRunKind === 'sample' && sampleSuiteResult
        ? sampleSuiteResult.results.reduce((acc, r) => acc + (r.executionTimeMs || 0), 0)
        : lastRunKind === 'custom' && customRunResult
        ? customRunResult.executionTimeMs || 0
        : 0;

    try {
      // Steps 4–9: Execute configured test-case suite in browser worker & calculate bounded score
      if (configuredCases.length > 0 && sharedBrowserExecutionAdapter.isBrowserExecutionSupported(language)) {
        const pipelineRes = await sharedBrowserExecutionAdapter.evaluateTestCases(
          {
            sourceCode,
            language,
            timeoutMs,
            onRuntimeStateChange: (st, detail) => {
              setRuntimeState(st);
              setRuntimeDetail(detail || '');
            },
          },
          configuredCases.map((tc, idx) => ({
            id: tc.id || String(idx + 1),
            input_text: tc.input_text || '',
            expected_output: tc.expected_output || '',
            explanation: tc.explanation,
            marks_weightage: tc.marks_weightage ?? 1.0,
            is_public: tc.is_public,
            visibility_scope: tc.visibility_scope,
            comparison_mode: tc.comparison_mode,
          })),
          questionComparisonMode,
          questionMaxMarks
        );

        engineVersion = pipelineRes.engineVersion;
        evalStatusForMeta = pipelineRes.overallStatus;
        evalDurationMs = pipelineRes.totalExecutionTimeMs;
        evalPayload = {
          total_test_cases: pipelineRes.totalCount,
          passed_count: pipelineRes.passedCount,
          failed_count: pipelineRes.failedCount,
          score_awarded: pipelineRes.scoreAwarded,
          max_marks: questionMaxMarks,
          comparison_mode: pipelineRes.comparisonMode,
          verdict: pipelineRes.overallStatus,
          execution_time_ms: pipelineRes.totalExecutionTimeMs,
          engine_version: pipelineRes.engineVersion,
          compilation_errors: pipelineRes.compilationErrors || '',
        };
        testCaseResultsPayload = pipelineRes.results.map((r) => ({
          test_case_id: r.testCaseId,
          status: r.status,
          passed: r.passed,
          actual_output: r.actualOutput,
          error_message: r.compilationErrors || r.runtimeErrors || r.stderr || '',
          execution_time_ms: r.executionTimeMs,
        }));
      }

      const browserMeta = {
        runtime_name: canonical === 'java' ? 'TeaVM Wasm (javac OpenJDK 25)' : canonical === 'python' ? 'Pyodide WebAssembly' : canonical,
        runtime_version: engineVersion,
        browser_status: evalStatusForMeta,
        public_samples_attempted: sampleSuiteResult ? sampleSuiteResult.totalCount : configuredCases.filter((c) => c.is_public || c.visibility_scope === 'SAMPLE').length,
        public_samples_passed: sampleSuiteResult
          ? sampleSuiteResult.passedCount
          : testCaseResultsPayload
          ? testCaseResultsPayload.filter((r, i) => (configuredCases[i]?.is_public || configuredCases[i]?.visibility_scope === 'SAMPLE') && r.passed).length
          : 0,
        execution_time_ms: Math.round(evalDurationMs * 10) / 10,
        is_authoritative: false,
        is_verified: false,
      };

      // Steps 10–13: Store validated source code, evaluation summary, and scores in Django
      const res = await submitCode({
        attempt_id: attemptId,
        question_id: authoritativeQuestionId,
        language: canonical,
        source_code: sourceCode,
        engine_version: engineVersion,
        evaluation_summary: evalPayload,
        test_case_results: testCaseResultsPayload,
        browser_execution_metadata: browserMeta,
      });
      setSubmitResult(res);
      onAnswerSaved?.(sourceCode);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail ||
          err?.message ||
          'Failed to submit solution. Your code draft remains safely saved locally.'
      );
    } finally {
      inFlightSubmitRef.current = false;
      setIsSubmitting(false);
    }
  };

  runShortcutRef.current = () => {
    if (!isRunning && !isSubmitting) {
      handleRun(activeConsoleTab === 'custom');
    }
  };
  submitShortcutRef.current = () => {
    if (!isRunning && !isSubmitting) {
      handleSubmit();
    }
  };

  const handleTrySampleInCustomInput = (stdinText: string) => {
    setCustomInput(stdinText || '');
    setConsoleOpen(true);
    setActiveConsoleTab('custom');
  };

  const isPythonSelected = normalizeCanonicalLanguage(language) === 'python';
  const isJavaSelected = normalizeCanonicalLanguage(language) === 'java';
  const t = getIdeTokens(ideDark);
  const sampleCases = details?.sample_test_cases || [];
  const activeSampleIdx = Math.min(selectedSampleIdx, Math.max(0, sampleCases.length - 1));
  const questionMarks = Math.max(1, Number(question.marks) || 1);
  const difficultyLabel = (question.difficulty || '').trim().toUpperCase();
  const difficultyPalette =
    difficultyLabel === 'HARD'
      ? { bg: t.dangerBg, text: t.dangerText, border: t.dangerBorder }
      : difficultyLabel === 'MEDIUM'
      ? { bg: t.warnBg, text: t.warnText, border: t.warnBorder }
      : { bg: t.successBg, text: t.successText, border: t.successBorder };

  const handleFormatCode = () => {
    try {
      const action = editorRef.current?.getAction?.('editor.action.formatDocument');
      if (action && typeof action.run === 'function') {
        void action.run();
      }
    } catch {
      // Formatting unavailable for language/worker; keep code untouched
    }
  };

  const showProblemPane = maximizedPane !== 'editor';
  const showEditorPane = maximizedPane !== 'problem';

  return (
    <div
      ref={rootRef}
      data-testid="coding-workspace"
      style={{
        display: 'flex',
        flexDirection: isCompactViewport ? 'column' : 'row',
        flex: 1,
        minHeight: 0,
        height: '100%',
        gap: isCompactViewport ? '10px' : '0px',
        boxSizing: 'border-box',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ─── LEFT PANE: EDITORIAL PROBLEM STATEMENT ─── */}
      {showProblemPane && (
        <section
          data-testid="coding-problem-pane"
          style={{
            width: isCompactViewport
              ? '100%'
              : maximizedPane === 'problem'
              ? '100%'
              : `${splitPercent}%`,
            minWidth: isCompactViewport ? 0 : maximizedPane === 'problem' ? 0 : '300px',
            height: isCompactViewport ? '42%' : '100%',
            minHeight: isCompactViewport ? '220px' : 0,
            backgroundColor: t.bgSurface,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            boxShadow: t.shadow,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* Problem Header */}
          <div
            style={{
              padding: '12px 18px',
              borderBottom: `1px solid ${t.border}`,
              backgroundColor: t.bgHeader,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {question.category && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: t.accentBlueSoft,
                      color: t.accentBlueText,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {question.category}
                  </span>
                )}
                {difficultyLabel && (
                  <span
                    data-testid="coding-difficulty-badge"
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: difficultyPalette.bg,
                      color: difficultyPalette.text,
                      border: `1px solid ${difficultyPalette.border}`,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {difficultyLabel}
                  </span>
                )}
                <span
                  data-testid="coding-marks-badge"
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: t.warnBg,
                    color: t.warnText,
                    border: `1px solid ${t.warnBorder}`,
                  }}
                >
                  {questionMarks} {questionMarks === 1 ? 'Mark' : 'Marks'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 700,
                    color: t.textMain,
                    lineHeight: 1.3,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {question.prompt}
                </h2>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '6px',
                  flexWrap: 'wrap',
                  fontSize: '11.5px',
                  color: t.textMuted,
                  fontWeight: 500,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>⏱</span> Time Limit: <strong style={{ color: t.textSecondary }}>{details?.time_limit_seconds || 2.0}s</strong>
                </span>
                <span style={{ color: t.borderStrong }}>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>💾</span> Memory: <strong style={{ color: t.textSecondary }}>{details?.memory_limit_mb || 256} MB</strong>
                </span>
                <span style={{ color: t.borderStrong }}>•</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '1px 8px',
                    borderRadius: '9999px',
                    backgroundColor: t.accentBlueSoft,
                    color: t.accentBlueText,
                  }}
                >
                  {selectableLanguages.map(formatLanguageLabel).join(' / ')}
                </span>
              </div>
            </div>

            {!isCompactViewport && (
              <button
                type="button"
                onClick={() => setMaximizedPane((p) => (p === 'problem' ? 'none' : 'problem'))}
                title={maximizedPane === 'problem' ? 'Restore split view' : 'Expand problem view'}
                aria-label={maximizedPane === 'problem' ? 'Restore split view' : 'Expand problem view'}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: `1px solid ${t.border}`,
                  backgroundColor: t.bgSurface,
                  color: t.textMuted,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontSize: '13px',
                }}
              >
                {maximizedPane === 'problem' ? '↙' : '⛶'}
              </button>
            )}
          </div>

          {/* Scrollable Editorial Body */}
          <div
            style={{
              padding: '18px 20px',
              overflowY: 'auto',
              flex: 1,
              minHeight: 0,
              fontSize: '13.5px',
              lineHeight: 1.7,
              color: t.textMain,
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            {/* Statement */}
            <div style={{ whiteSpace: 'pre-wrap', userSelect: 'none', color: t.textMain }}>
              {details?.problem_statement || question.prompt}
            </div>

            {/* Input & Output Formats with clean editorial left rail */}
            {(details?.input_format || details?.output_format) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {details?.input_format && (
                  <div
                    style={{
                      paddingLeft: '12px',
                      borderLeft: `3px solid ${t.accentBlue}`,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: t.textMuted,
                        margin: '0 0 4px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Input Format
                    </h3>
                    <div
                      style={{
                        fontSize: '13px',
                        color: t.textSecondary,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.55,
                      }}
                    >
                      {details.input_format}
                    </div>
                  </div>
                )}

                {details?.output_format && (
                  <div
                    style={{
                      paddingLeft: '12px',
                      borderLeft: `3px solid ${t.runTeal}`,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: t.textMuted,
                        margin: '0 0 4px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Output Format
                    </h3>
                    <div
                      style={{
                        fontSize: '13px',
                        color: t.textSecondary,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.55,
                      }}
                    >
                      {details.output_format}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Constraints */}
            {details?.constraints && (
              <div>
                <h3
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: t.textMuted,
                    margin: '0 0 6px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Constraints
                </h3>
                <pre
                  style={{
                    backgroundColor: t.bgCode,
                    color: t.textMain,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    margin: 0,
                    border: `1px solid ${t.border}`,
                    whiteSpace: 'pre-wrap',
                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                    lineHeight: 1.55,
                  }}
                >
                  {details.constraints}
                </pre>
              </div>
            )}

            {/* Sample Examples */}
            {sampleCases.length > 0 && (
              <div>
                <h3
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: t.textMuted,
                    margin: '0 0 10px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Sample Test Cases ({sampleCases.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {sampleCases.map((sample, idx) => (
                    <div
                      key={sample.id || idx}
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: '10px',
                        overflow: 'hidden',
                        backgroundColor: t.bgSubtle,
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: t.bgHeader,
                          padding: '7px 12px',
                          borderBottom: `1px solid ${t.border}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span style={{ fontSize: '12px', fontWeight: 700, color: t.textMain }}>
                          Example {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTrySampleInCustomInput(sample.input_text || '')}
                          style={{
                            border: `1px solid ${t.border}`,
                            backgroundColor: t.bgSurface,
                            color: t.accentBlueText,
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Use as Custom Input ↗
                        </button>
                      </div>

                      <div
                        style={{
                          padding: '12px',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                          gap: '10px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, marginBottom: '4px' }}>
                            Input
                          </div>
                          <pre
                            style={{
                              backgroundColor: t.bgSurface,
                              color: t.textMain,
                              padding: '8px 10px',
                              borderRadius: '7px',
                              margin: 0,
                              fontSize: '12px',
                              fontFamily: "'JetBrains Mono', Consolas, monospace",
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              border: `1px solid ${t.border}`,
                            }}
                          >
                            {sample.input_text || '(No input)'}
                          </pre>
                        </div>

                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, marginBottom: '4px' }}>
                            Expected Output
                          </div>
                          <pre
                            style={{
                              backgroundColor: t.bgSurface,
                              color: t.textMain,
                              padding: '8px 10px',
                              borderRadius: '7px',
                              margin: 0,
                              fontSize: '12px',
                              fontFamily: "'JetBrains Mono', Consolas, monospace",
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              border: `1px solid ${t.border}`,
                            }}
                          >
                            {sample.expected_output}
                          </pre>
                        </div>
                      </div>

                      {sample.explanation && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderTop: `1px solid ${t.border}`,
                            fontSize: '12px',
                            color: t.textMuted,
                            backgroundColor: t.bgSurface,
                          }}
                        >
                          <strong style={{ color: t.textSecondary }}>Explanation:</strong> {sample.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── HORIZONTAL SPLIT RESIZER HANDLE ─── */}
      {!isCompactViewport && maximizedPane === 'none' && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize problem and editor panes"
          data-testid="coding-split-resizer"
          onMouseDown={handleStartSplitResize}
          title="Drag to resize problem & editor split"
          style={{
            width: '10px',
            flexShrink: 0,
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '3px',
              height: '44px',
              borderRadius: '9999px',
              backgroundColor: t.borderStrong,
            }}
          />
        </div>
      )}

      {/* ─── RIGHT PANE: MONACO CODE EDITOR + TABBED RUN CONSOLE ─── */}
      {showEditorPane && (
        <section
          ref={rightPaneRef}
          data-testid="coding-editor-pane"
          style={{
            flex: 1,
            minWidth: 0,
            height: isCompactViewport ? '58%' : '100%',
            minHeight: isCompactViewport ? '340px' : 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: t.bgSurface,
            borderRadius: '12px',
            overflow: 'hidden',
            border: `1px solid ${t.border}`,
            boxShadow: t.shadow,
            boxSizing: 'border-box',
          }}
        >
          {/* Sleek Single-Row IDE Toolbar */}
          <div
            style={{
              padding: '8px 14px',
              backgroundColor: t.bgHeader,
              borderBottom: `1px solid ${t.border}`,
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
                  backgroundColor: t.bgInput,
                  color: t.textMain,
                  border: `1px solid ${t.borderStrong}`,
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

              {(isPythonSelected || isJavaSelected) && (
                <span
                  data-testid={isPythonSelected ? 'python-runtime-status' : 'java-runtime-status'}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 9px',
                    borderRadius: '9999px',
                    border: `1px solid ${
                      runtimeState === 'ERROR'
                        ? t.dangerBorder
                        : runtimeState === 'READY'
                        ? t.successBorder
                        : t.border
                    }`,
                    backgroundColor:
                      runtimeState === 'ERROR'
                        ? t.dangerBg
                        : runtimeState === 'READY'
                        ? t.successBg
                        : t.accentBlueSoft,
                    color:
                      runtimeState === 'ERROR'
                        ? t.dangerText
                        : runtimeState === 'READY'
                        ? t.successText
                        : t.accentBlueText,
                  }}
                >
                  {isPythonSelected
                    ? runtimeState === 'LOADING_RUNTIME'
                      ? '⏳ Loading Python 3...'
                      : runtimeState === 'READY'
                      ? '● Python 3 Ready'
                      : runtimeState === 'EXECUTING'
                      ? '⚡ Running Python...'
                      : runtimeState === 'ERROR'
                      ? '⚠ Runtime Error'
                      : '● Python 3 Worker'
                    : runtimeState === 'LOADING_RUNTIME'
                    ? '⏳ Loading Java (TeaVM)...'
                    : runtimeState === 'READY'
                    ? '● Java Browser Ready'
                    : runtimeState === 'EXECUTING'
                    ? '⚡ Compiling & Running Java...'
                    : runtimeState === 'ERROR'
                    ? '⚠ Java Load Error'
                    : '● Java Worker'}
                </span>
              )}

              <button
                type="button"
                data-testid="coding-format-btn"
                onClick={handleFormatCode}
                title="Format code"
                style={{
                  backgroundColor: t.bgSurface,
                  border: `1px solid ${t.border}`,
                  color: t.textSecondary,
                  borderRadius: '7px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✨ Format
              </button>

              <button
                type="button"
                onClick={handleResetBoilerplate}
                title="Reset code to initial template"
                style={{
                  backgroundColor: t.bgSurface,
                  border: `1px solid ${t.border}`,
                  color: t.textSecondary,
                  borderRadius: '7px',
                  padding: '5px 10px',
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
                title={ideDark ? 'Switch IDE to Light Theme' : 'Switch IDE to Dark Theme'}
                style={{
                  backgroundColor: t.bgSurface,
                  border: `1px solid ${t.border}`,
                  color: t.textSecondary,
                  borderRadius: '7px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {ideDark ? '☀ Light IDE' : '☾ Dark IDE'}
              </button>

              {!isCompactViewport && (
                <button
                  type="button"
                  onClick={() => setMaximizedPane((p) => (p === 'editor' ? 'none' : 'editor'))}
                  title={maximizedPane === 'editor' ? 'Restore split view' : 'Maximize editor'}
                  aria-label={maximizedPane === 'editor' ? 'Restore split view' : 'Maximize editor'}
                  style={{
                    backgroundColor: t.bgSurface,
                    border: `1px solid ${t.border}`,
                    color: t.textMuted,
                    borderRadius: '7px',
                    padding: '5px 8px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {maximizedPane === 'editor' ? '↙ Split' : '⛶ Focus'}
                </button>
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
                  activeConsoleTab === 'custom'
                    ? 'Run in browser with Custom Input (Ctrl+Enter)'
                    : 'Run in browser against Sample Tests (Ctrl+Enter)'
                }
                style={{
                  backgroundColor: isRunning ? '#64748B' : t.runTeal,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                {isRunning
                  ? 'Running...'
                  : activeConsoleTab === 'custom'
                  ? '▶ Run Custom'
                  : '▶ Run Code'}
              </button>

              <button
                type="button"
                data-testid="coding-submit-btn"
                onClick={handleSubmit}
                disabled={isRunning || isSubmitting}
                title="Submit Solution for Grading (Ctrl+Shift+Enter)"
                style={{
                  backgroundColor: isSubmitting ? '#64748B' : t.accentBlue,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: isSubmitting ? 'none' : '0 2px 6px rgba(20, 85, 217, 0.25)',
                }}
              >
                {isSubmitting ? 'Grading...' : '✓ Submit Solution'}
              </button>
            </div>
          </div>

          {/* Generous Monaco Editor Surface */}
          <div style={{ flex: 1, minHeight: '200px', position: 'relative' }}>
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
                lineHeight: 21,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                padding: { top: 12, bottom: 12 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                formatOnType: true,
                lineNumbers: 'on',
                wordWrap: 'on',
                renderLineHighlight: 'all',
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
              }}
            />
          </div>

          {/* Vertical Drag Splitter for Console */}
          {consoleOpen && (
            <div
              data-testid="coding-console-resizer"
              onMouseDown={handleStartConsoleResize}
              title="Drag to resize test console"
              style={{
                height: '6px',
                cursor: 'row-resize',
                backgroundColor: t.bgHeader,
                borderTop: `1px solid ${t.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '2px',
                  borderRadius: '9999px',
                  backgroundColor: t.borderStrong,
                }}
              />
            </div>
          )}

          {/* Resizable & Collapsible Test / Execution Console */}
          <div
            data-testid="coding-execution-console"
            style={{
              height: consoleOpen ? `${consoleHeight}px` : '38px',
              minHeight: consoleOpen ? '130px' : '38px',
              backgroundColor: t.bgSubtle,
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Console Tabs Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: consoleOpen ? `1px solid ${t.border}` : 'none',
                backgroundColor: t.bgHeader,
                paddingRight: '10px',
              }}
            >
              <div style={{ display: 'flex', overflowX: 'auto' }}>
                {(
                  [
                    {
                      id: 'sample',
                      label: sampleSuiteResult
                        ? `Sample Tests (${sampleSuiteResult.passedCount}/${sampleSuiteResult.totalCount})`
                        : `Sample Tests (${sampleCases.length})`,
                      statusColor: sampleSuiteResult
                        ? sampleSuiteResult.overallStatus === 'ACCEPTED'
                          ? t.successText
                          : t.dangerText
                        : undefined,
                    },
                    { id: 'custom', label: 'Custom Input' },
                    {
                      id: 'output',
                      label: 'Output',
                      statusColor: customRunResult
                        ? customRunResult.status === 'ACCEPTED'
                          ? t.successText
                          : t.dangerText
                        : undefined,
                    },
                    {
                      id: 'submission',
                      label: submitResult
                        ? `Submission (${submitResult.review_status || submitResult.status || 'PENDING_REVIEW'})`
                        : 'Submission Status',
                      statusColor: submitResult ? t.warnText : undefined,
                    },
                  ] as Array<{ id: ConsoleTab; label: string; statusColor?: string }>
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
                        padding: '9px 14px',
                        fontSize: '12px',
                        fontWeight: active ? 700 : 600,
                        color: active ? t.accentBlueText : t.textMuted,
                        backgroundColor: active ? t.bgSubtle : 'transparent',
                        border: 'none',
                        borderTop: active
                          ? `2px solid ${t.accentBlue}`
                          : '2px solid transparent',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {tab.statusColor && (
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: tab.statusColor,
                          }}
                        />
                      )}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!consoleOpen && (
                  <span
                    data-testid="coding-console-collapsed-summary"
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color:
                        submitResult
                          ? t.successText
                          : sampleSuiteResult
                          ? sampleSuiteResult.overallStatus === 'ACCEPTED'
                            ? t.successText
                            : t.dangerText
                          : t.textMuted,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: t.bgSurface,
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    {submitResult
                      ? `Submitted (${submitResult.review_status || submitResult.status})`
                      : sampleSuiteResult
                      ? `Sample Tests: ${sampleSuiteResult.passedCount}/${sampleSuiteResult.totalCount}`
                      : customRunResult
                      ? `Output: ${customRunResult.status}`
                      : 'Terminal Collapsed'}
                  </span>
                )}
                <span style={{ fontSize: '11px', color: t.textMuted }}>
                  Ctrl+Enter to Run
                </span>
                <button
                  type="button"
                  data-testid="toggle-console-btn"
                  onClick={() => setConsoleOpen((o) => !o)}
                  style={{
                    backgroundColor: t.bgSurface,
                    border: `1px solid ${t.border}`,
                    color: t.textSecondary,
                    borderRadius: '6px',
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {consoleOpen ? '▾ Collapse' : '▴ Expand'}
                </button>
              </div>
            </div>

            {/* Console Tab Body */}
            {consoleOpen && (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  padding: '12px 14px',
                  overflowY: 'auto',
                  color: t.textMain,
                  fontSize: '12px',
                  fontFamily: "'JetBrains Mono', Consolas, monospace",
                }}
              >
                {/* TAB 1: SAMPLE TESTS */}
                {activeConsoleTab === 'sample' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {runtimeState === 'ERROR' && runtimeDetail && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: '7px',
                          backgroundColor: t.warnBg,
                          border: `1px solid ${t.warnBorder}`,
                          color: t.warnText,
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '12px',
                        }}
                      >
                        Browser runtime failed to initialize ({runtimeDetail}). You can still write your code and use{' '}
                        <strong>Submit Solution</strong> safely.
                      </div>
                    )}

                    {sampleSuiteResult && lastRunKind === 'sample' && (
                      <div
                        data-testid="browser-sample-verdict"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          backgroundColor:
                            sampleSuiteResult.overallStatus === 'ACCEPTED'
                              ? t.successBg
                              : t.dangerBg,
                          border: `1px solid ${
                            sampleSuiteResult.overallStatus === 'ACCEPTED'
                              ? t.successBorder
                              : t.dangerBorder
                          }`,
                          color:
                            sampleSuiteResult.overallStatus === 'ACCEPTED'
                              ? t.successText
                              : t.dangerText,
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 700,
                          fontSize: '12.5px',
                        }}
                      >
                        Public Sample Result (Local Browser): {sampleSuiteResult.overallStatus} ({sampleSuiteResult.passedCount}/{sampleSuiteResult.totalCount} passed)
                      </div>
                    )}

                    {sampleCases.length === 0 ? (
                      <div style={{ color: t.textMuted, fontFamily: "'Inter', sans-serif" }}>
                        No public sample cases attached. Use <strong>Custom Input</strong> or <strong>Submit Solution</strong>.
                      </div>
                    ) : (
                      <>
                        {/* Case Selector Pills */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {sampleCases.map((stc, idx) => {
                            const matchedRes = sampleSuiteResult?.results?.find(
                              (r) => r.index === idx + 1 || r.testCaseId === String(stc.id)
                            );
                            const isCaseActive = idx === activeSampleIdx;
                            return (
                              <button
                                key={stc.id || idx}
                                type="button"
                                onClick={() => setSelectedSampleIdx(idx)}
                                style={{
                                  padding: '4px 11px',
                                  borderRadius: '7px',
                                  fontFamily: "'Inter', sans-serif",
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  border: `1px solid ${
                                    isCaseActive
                                      ? t.accentBlue
                                      : matchedRes
                                      ? matchedRes.passed
                                        ? t.successBorder
                                        : t.dangerBorder
                                      : t.border
                                  }`,
                                  backgroundColor: isCaseActive
                                    ? t.accentBlueSoft
                                    : t.bgSurface,
                                  color: isCaseActive
                                    ? t.accentBlueText
                                    : matchedRes
                                    ? matchedRes.passed
                                      ? t.successText
                                      : t.dangerText
                                    : t.textSecondary,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                {matchedRes && (
                                  <span>{matchedRes.passed ? '✓' : '✗'}</span>
                                )}
                                <span>Case {idx + 1}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Active Sample Case Detail */}
                        {(() => {
                          const stc = sampleCases[activeSampleIdx];
                          if (!stc) return null;
                          const matchedRes = sampleSuiteResult?.results?.find(
                            (r) =>
                              r.index === activeSampleIdx + 1 ||
                              r.testCaseId === String(stc.id)
                          );
                          return (
                            <div
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${
                                  matchedRes
                                    ? matchedRes.passed
                                      ? t.successBorder
                                      : t.dangerBorder
                                    : t.border
                                }`,
                                backgroundColor: t.bgSurface,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                              }}
                            >
                              {matchedRes && (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: matchedRes.passed ? t.successText : t.dangerText,
                                  }}
                                >
                                  <span>
                                    Case {activeSampleIdx + 1}: {matchedRes.passed ? '✓ PASSED' : `✗ ${matchedRes.status}`}
                                  </span>
                                  <span>{matchedRes.executionTimeMs.toFixed(1)} ms</span>
                                </div>
                              )}

                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                                  gap: '8px',
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: t.textMuted, marginBottom: '3px', fontFamily: "'Inter', sans-serif" }}>
                                    INPUT
                                  </div>
                                  <pre style={{ margin: 0, padding: '7px 9px', borderRadius: '6px', backgroundColor: t.bgCode, border: `1px solid ${t.border}`, whiteSpace: 'pre-wrap' }}>
                                    {stc.input_text || '(empty)'}
                                  </pre>
                                </div>

                                <div>
                                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: t.textMuted, marginBottom: '3px', fontFamily: "'Inter', sans-serif" }}>
                                    EXPECTED OUTPUT
                                  </div>
                                  <pre style={{ margin: 0, padding: '7px 9px', borderRadius: '6px', backgroundColor: t.bgCode, border: `1px solid ${t.border}`, whiteSpace: 'pre-wrap' }}>
                                    {stc.expected_output}
                                  </pre>
                                </div>

                                {matchedRes && (
                                  <div>
                                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: t.textMuted, marginBottom: '3px', fontFamily: "'Inter', sans-serif" }}>
                                      YOUR OUTPUT
                                    </div>
                                    <pre
                                      style={{
                                        margin: 0,
                                        padding: '7px 9px',
                                        borderRadius: '6px',
                                        backgroundColor: matchedRes.passed ? t.successBg : t.dangerBg,
                                        border: `1px solid ${matchedRes.passed ? t.successBorder : t.dangerBorder}`,
                                        whiteSpace: 'pre-wrap',
                                      }}
                                    >
                                      {matchedRes.actualOutput || '(empty)'}
                                    </pre>
                                  </div>
                                )}
                              </div>

                              {matchedRes?.stderr && (
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '7px 9px',
                                    borderRadius: '6px',
                                    backgroundColor: t.dangerBg,
                                    color: t.dangerText,
                                    border: `1px solid ${t.dangerBorder}`,
                                    whiteSpace: 'pre-wrap',
                                  }}
                                >
                                  {matchedRes.stderr}
                                </pre>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}

                {/* TAB 2: CUSTOM INPUT */}
                {activeConsoleTab === 'custom' && (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11.5px', color: t.textMuted, fontFamily: "'Inter', sans-serif" }}>
                        Custom Standard Input (stdin) for browser execution:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRun(true)}
                        disabled={isRunning || isSubmitting}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: t.runTeal,
                          color: '#FFFFFF',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          fontFamily: "'Inter', sans-serif",
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
                        minHeight: '78px',
                        backgroundColor: t.bgInput,
                        color: t.textMain,
                        border: `1px solid ${t.borderStrong}`,
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontFamily: "'JetBrains Mono', Consolas, monospace",
                        fontSize: '12px',
                        resize: 'none',
                      }}
                    />
                  </div>
                )}

                {/* TAB 3: OUTPUT */}
                {activeConsoleTab === 'output' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {runtimeDetail && runtimeState === 'ERROR' && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: '7px',
                          backgroundColor: t.dangerBg,
                          border: `1px solid ${t.dangerBorder}`,
                          color: t.dangerText,
                        }}
                      >
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
                                ? t.successBg
                                : customRunResult.status === 'BROWSER_RUNTIME_UNSUPPORTED'
                                ? t.warnBg
                                : t.dangerBg,
                            border: `1px solid ${
                              customRunResult.status === 'ACCEPTED'
                                ? t.successBorder
                                : customRunResult.status === 'BROWSER_RUNTIME_UNSUPPORTED'
                                ? t.warnBorder
                                : t.dangerBorder
                            }`,
                            color:
                              customRunResult.status === 'ACCEPTED'
                                ? t.successText
                                : customRunResult.status === 'BROWSER_RUNTIME_UNSUPPORTED'
                                ? t.warnText
                                : t.dangerText,
                          }}
                        >
                          Status: {customRunResult.status} ({customRunResult.executionTimeMs.toFixed(1)} ms)
                        </div>

                        {customRunResult.stdout && (
                          <div>
                            <div style={{ fontWeight: 700, color: t.accentBlueText, marginBottom: '4px', fontFamily: "'Inter', sans-serif" }}>
                              Stdout:
                            </div>
                            <pre
                              data-testid="browser-run-stdout"
                              style={{
                                margin: 0,
                                padding: '9px 11px',
                                borderRadius: '7px',
                                backgroundColor: t.bgSurface,
                                border: `1px solid ${t.border}`,
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
                            <div style={{ fontWeight: 700, color: t.dangerText, marginBottom: '4px', fontFamily: "'Inter', sans-serif" }}>
                              Diagnostics / Stderr:
                            </div>
                            <pre
                              data-testid="browser-run-stderr"
                              style={{
                                margin: 0,
                                padding: '9px 11px',
                                borderRadius: '7px',
                                backgroundColor: t.dangerBg,
                                color: t.dangerText,
                                border: `1px solid ${t.dangerBorder}`,
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
                                ? t.successBg
                                : t.dangerBg,
                            border: `1px solid ${
                              sampleSuiteResult.overallStatus === 'ACCEPTED'
                                ? t.successBorder
                                : t.dangerBorder
                            }`,
                            color:
                              sampleSuiteResult.overallStatus === 'ACCEPTED'
                                ? t.successText
                                : t.dangerText,
                          }}
                        >
                          Browser Sample Suite: {sampleSuiteResult.overallStatus} ({sampleSuiteResult.passedCount}/{sampleSuiteResult.totalCount} passed)
                        </div>

                        {(sampleSuiteResult.compilationErrors || sampleSuiteResult.runtimeErrors || sampleSuiteResult.unsupportedReason) && (
                          <pre
                            style={{
                              margin: 0,
                              padding: '9px 11px',
                              borderRadius: '7px',
                              backgroundColor: t.dangerBg,
                              color: t.dangerText,
                              border: `1px solid ${t.dangerBorder}`,
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {sampleSuiteResult.compilationErrors || sampleSuiteResult.runtimeErrors || sampleSuiteResult.unsupportedReason}
                          </pre>
                        )}
                      </div>
                    )}

                    {!customRunResult && !sampleSuiteResult && !isRunning && (
                      <div style={{ color: t.textMuted, fontFamily: "'Inter', sans-serif" }}>
                        Ready. Click <strong>Run Code</strong> to execute Python 3 against Sample Tests, or switch to <strong>Custom Input</strong> to test your own input.
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: SUBMISSION RESULTS */}
                {activeConsoleTab === 'submission' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {submitError && (
                      <div
                        data-testid="coding-submit-error"
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          backgroundColor: t.dangerBg,
                          border: `1px solid ${t.dangerBorder}`,
                          color: t.dangerText,
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {submitError}
                      </div>
                    )}

                    {submitResult && (
                      <div data-testid="coding-submit-result" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div
                          style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            backgroundColor: t.successBg,
                            border: `1px solid ${t.successBorder}`,
                            color: t.successText,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 800 }}>
                              ✓ Submission Received — Pending Manual Evaluation
                            </div>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                backgroundColor: t.warnBg,
                                color: t.warnText,
                                border: `1px solid ${t.warnBorder}`,
                              }}
                            >
                              {submitResult.review_status || submitResult.status || 'PENDING_REVIEW'}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', marginTop: '6px', color: t.textSecondary }}>
                            Submission ID: <code style={{ fontWeight: 700 }}>{submitResult.submission_id}</code>
                            {submitResult.submission_sequence ? ` • Attempt #${submitResult.submission_sequence}` : ''}
                            {submitResult.language ? ` • Language: ${formatLanguageLabel(submitResult.language)}` : ''}
                            {submitResult.engine_version ? ` • Engine: ${submitResult.engine_version}` : ''}
                          </div>
                          {submitResult.evaluation_summary && typeof submitResult.evaluation_summary.total_test_cases === 'number' && (
                            <div
                              data-testid="submission-eval-summary"
                              style={{
                                marginTop: '8px',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                backgroundColor: t.bgSurface,
                                border: `1px solid ${t.border}`,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '8px',
                                fontSize: '12px',
                                fontFamily: "'Inter', sans-serif",
                              }}
                            >
                              <span>
                                Test Cases Passed:{' '}
                                <strong>
                                  {submitResult.passed_test_cases ?? submitResult.evaluation_summary.passed_count}/
                                  {submitResult.total_test_cases ?? submitResult.evaluation_summary.total_test_cases}
                                </strong>{' '}
                                • Verdict: <strong>{submitResult.verdict}</strong>
                              </span>
                              <span style={{ fontWeight: 700, color: t.accentBlueText }}>
                                Score Recorded: {submitResult.score_awarded ?? 0} / {submitResult.max_marks ?? 10}
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: '11.5px', marginTop: '4px', color: t.textMuted }}>
                            {submitResult.message ||
                              'Your source code and browser evaluation summary have been persisted safely in Django.'}
                          </div>
                        </div>

                        {submitResult.browser_execution_metadata && (
                          <div
                            style={{
                              padding: '8px 12px',
                              borderRadius: '7px',
                              backgroundColor: t.bgSurface,
                              border: `1px solid ${t.border}`,
                              fontSize: '11.5px',
                              color: t.textSecondary,
                              fontFamily: "'Inter', sans-serif",
                            }}
                          >
                            <strong>Preliminary Local Browser Telemetry (Unverified):</strong>{' '}
                            {submitResult.browser_execution_metadata.browser_status || 'N/A'}
                            {typeof submitResult.browser_execution_metadata.public_samples_attempted === 'number' &&
                            submitResult.browser_execution_metadata.public_samples_attempted > 0
                              ? ` • Samples Passed: ${submitResult.browser_execution_metadata.public_samples_passed ?? 0}/${submitResult.browser_execution_metadata.public_samples_attempted}`
                              : ''}
                          </div>
                        )}
                      </div>
                    )}

                    {!submitResult && !submitError && !isSubmitting && (
                      <div style={{ color: t.textMuted, fontFamily: "'Inter', sans-serif" }}>
                        Click <strong>Submit Solution</strong> to save your code for official manual evaluation. Submission works even if you have not executed sample tests locally.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Paste Deterrence Warning Modal */}
      {showPasteWarning && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: t.bgSurface,
              border: '2px solid #EF4444',
              borderRadius: '14px',
              padding: '24px 28px',
              maxWidth: '460px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🛡️</div>
            <span
              style={{
                display: 'inline-block',
                backgroundColor: t.dangerBg,
                color: t.dangerText,
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
            <h3 style={{ margin: '0 0 10px 0', color: t.dangerText, fontSize: '17px', fontWeight: 800, letterSpacing: '0.02em' }}>
              AI PROCTORING ENABLED — CLIPBOARD RESTRICTION ACTIVE
            </h3>
            <p style={{ margin: '0 0 20px 0', color: t.textSecondary, fontSize: '13px', lineHeight: 1.6 }}>
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
