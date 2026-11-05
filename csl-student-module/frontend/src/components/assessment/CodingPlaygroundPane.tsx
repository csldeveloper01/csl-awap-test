import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  runCode,
  submitCode,
  type QuestionSnapshot,
  type CodeRunResult,
  type CodeSubmitResult,
} from '../../api/assessment';

interface CodingPlaygroundPaneProps {
  attemptId: string;
  question: QuestionSnapshot;
  onAnswerSaved?: (code: string) => void;
}

export const CodingPlaygroundPane: React.FC<CodingPlaygroundPaneProps> = ({
  attemptId,
  question,
  onAnswerSaved,
}) => {
  const details = question.programming_details;
  const allowedLanguages = details?.allowed_languages && details.allowed_languages.length > 0
    ? details.allowed_languages
    : ['python', 'java'];

  const [language, setLanguage] = useState<string>(allowedLanguages[0] || 'python');

  // Boilerplate templates
  const defaultBoilerplates: Record<string, string> = {
    python: '# Write your Python solution here\ndef solve():\n    # Read input from stdin\n    import sys\n    input_data = sys.stdin.read().split()\n    if not input_data:\n        return\n    # Process and print output\n    print("Hello from Python")\n\nif __name__ == "__main__":\n    solve()\n',
    java: 'import java.util.*;\nimport java.io.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Read input and print output\n        System.out.println("Hello from Java");\n    }\n}\n',
  };

  const getInitialCode = (lang: string) => {
    if (details?.boilerplate_code && details.boilerplate_code[lang]) {
      return details.boilerplate_code[lang];
    }
    return defaultBoilerplates[lang] || '# Write code here';
  };

  const [sourceCode, setSourceCode] = useState<string>(() => getInitialCode(language));
  const [activeConsoleTab, setActiveConsoleTab] = useState<'sample' | 'custom' | 'output'>('sample');
  const [customInput, setCustomInput] = useState<string>('');

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<CodeSubmitResult | null>(null);

  // Update code when question or language changes
  useEffect(() => {
    setSourceCode(getInitialCode(language));
    setRunResult(null);
    setSubmitResult(null);
  }, [question.question_order, language]);

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setSourceCode(getInitialCode(newLang));
  };

  const handleResetBoilerplate = () => {
    if (window.confirm('Reset code to initial boilerplate template?')) {
      setSourceCode(getInitialCode(language));
    }
  };

  const handleRun = async (useCustom: boolean) => {
    setIsRunning(true);
    setActiveConsoleTab('output');
    try {
      const qId = question.question_id || question.question_order;
      const res = await runCode({
        attempt_id: attemptId,
        question_id: qId,
        language,
        source_code: sourceCode,
        custom_input: useCustom ? customInput : undefined,
      });
      setRunResult(res);
      if (onAnswerSaved) {
        onAnswerSaved(sourceCode);
      }
    } catch (err: any) {
      setRunResult({
        mode: useCustom ? 'CUSTOM_INPUT' : 'SAMPLE_TEST_CASES',
        verdict: 'INTERNAL_ERROR',
        stderr: err?.response?.data?.detail || err.message || 'Execution failed',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setActiveConsoleTab('output');
    try {
      const qId = question.question_id || question.question_order;
      const res = await submitCode({
        attempt_id: attemptId,
        question_id: qId,
        language,
        source_code: sourceCode,
      });
      setSubmitResult(res);
      if (onAnswerSaved) {
        onAnswerSaved(sourceCode);
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to submit solution for grading.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '42% 58%', height: '100%', gap: '14px', boxSizing: 'border-box' }}>
      {/* ─── LEFT PANE: PROBLEM STATEMENT & SAMPLES ─── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
            Problem Statement
          </h2>
          <span style={{ fontSize: '11px', color: '#64748B' }}>
            Time limit: {details?.time_limit_seconds || 2.0}s • Memory: {details?.memory_limit_mb || 256}MB
          </span>
        </div>

        <div style={{ padding: '18px', overflowY: 'auto', flex: 1, fontSize: '13px', lineHeight: 1.6, color: '#1E293B' }}>
          <div style={{ whiteSpace: 'pre-wrap', marginBottom: '16px' }}>
            {details?.problem_statement || question.prompt}
          </div>

          {details?.constraints && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Constraints</h3>
              <pre style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', margin: 0, border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>
                {details.constraints}
              </pre>
            </div>
          )}

          {details?.input_format && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Input Format</h3>
              <div style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>
                {details.input_format}
              </div>
            </div>
          )}

          {details?.output_format && (
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>Output Format</h3>
              <div style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>
                {details.output_format}
              </div>
            </div>
          )}

          {/* Public Sample Test Cases */}
          {details?.sample_test_cases && details.sample_test_cases.length > 0 && (
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>Sample Test Cases</h3>
              {details.sample_test_cases.map((sample, idx) => (
                <div key={sample.id || idx} style={{ marginBottom: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#F1F5F9', padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                    Sample Case {idx + 1}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Input:</div>
                    <pre style={{ backgroundColor: '#F8FAFC', padding: '6px', borderRadius: '4px', margin: '0 0 6px 0', fontSize: '11px' }}>
                      {sample.input_text || '(empty)'}
                    </pre>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Expected Output:</div>
                    <pre style={{ backgroundColor: '#F8FAFC', padding: '6px', borderRadius: '4px', margin: 0, fontSize: '11px' }}>
                      {sample.expected_output}
                    </pre>
                    {sample.explanation && (
                      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
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

      {/* ─── RIGHT PANE: MONACO EDITOR & TERMINAL CONSOLE ─── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1E1E1E',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #334155',
        }}
      >
        {/* Editor Toolbar */}
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: '#252526',
            borderBottom: '1px solid #333333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#CCCCCC', fontWeight: 700 }}>Language:</span>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              style={{
                backgroundColor: '#3C3C3C',
                color: '#FFFFFF',
                border: '1px solid #555555',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {allowedLanguages.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase() === 'PYTHON' ? 'Python 3' : l.toUpperCase() === 'JAVA' ? 'Java 17' : l}
                </option>
              ))}
            </select>

            <button
              onClick={handleResetBoilerplate}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #555555',
                color: '#AAAAAA',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              ↺ Reset
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => handleRun(activeConsoleTab === 'custom')}
              disabled={isRunning || isSubmitting}
              style={{
                backgroundColor: isRunning ? '#555555' : '#0D9488',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isRunning ? 'Running...' : '▶ Run Code'}
            </button>

            <button
              onClick={handleSubmit}
              disabled={isRunning || isSubmitting}
              style={{
                backgroundColor: isSubmitting ? '#555555' : '#1455B8',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Evaluating...' : '✓ Submit Solution'}
            </button>
          </div>
        </div>

        {/* Monaco Editor Container */}
        <div style={{ flex: 1, minHeight: '300px' }}>
          <Editor
            height="100%"
            language={language.toLowerCase() === 'python' ? 'python' : 'java'}
            value={sourceCode}
            onChange={(val) => setSourceCode(val || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              formatOnType: true,
              lineNumbers: 'on',
            }}
          />
        </div>

        {/* Console / Output Tabs */}
        <div
          style={{
            height: '200px',
            backgroundColor: '#181818',
            borderTop: '1px solid #2D2D2D',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Tab Headers */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2D2D2D', backgroundColor: '#222222' }}>
            <button
              onClick={() => setActiveConsoleTab('sample')}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                color: activeConsoleTab === 'sample' ? '#38BDF8' : '#888888',
                backgroundColor: activeConsoleTab === 'sample' ? '#181818' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderTop: activeConsoleTab === 'sample' ? '2px solid #38BDF8' : '2px solid transparent',
              }}
            >
              Sample Tests
            </button>
            <button
              onClick={() => setActiveConsoleTab('custom')}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                color: activeConsoleTab === 'custom' ? '#38BDF8' : '#888888',
                backgroundColor: activeConsoleTab === 'custom' ? '#181818' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderTop: activeConsoleTab === 'custom' ? '2px solid #38BDF8' : '2px solid transparent',
              }}
            >
              Custom Input
            </button>
            <button
              onClick={() => setActiveConsoleTab('output')}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                color: activeConsoleTab === 'output' ? '#38BDF8' : '#888888',
                backgroundColor: activeConsoleTab === 'output' ? '#181818' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderTop: activeConsoleTab === 'output' ? '2px solid #38BDF8' : '2px solid transparent',
              }}
            >
              Execution Output {submitResult ? `(${submitResult.verdict})` : ''}
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, padding: '10px 14px', overflowY: 'auto', color: '#D4D4D4', fontSize: '12px', fontFamily: 'Consolas, monospace' }}>
            {activeConsoleTab === 'custom' && (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#888888', marginBottom: '4px' }}>Provide standard input (stdin):</span>
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Enter custom test input here..."
                  style={{
                    flex: 1,
                    backgroundColor: '#1E1E1E',
                    color: '#E2E8F0',
                    border: '1px solid #333333',
                    borderRadius: '6px',
                    padding: '8px',
                    fontFamily: 'Consolas, monospace',
                    fontSize: '12px',
                    resize: 'none',
                  }}
                />
              </div>
            )}

            {activeConsoleTab === 'sample' && (
              <div>
                <span style={{ color: '#888888', display: 'block', marginBottom: '6px' }}>
                  Click "Run Code" to test against public sample cases:
                </span>
                {details?.sample_test_cases?.map((stc, idx) => (
                  <div key={stc.id || idx} style={{ marginBottom: '8px', padding: '6px 8px', backgroundColor: '#222222', borderRadius: '4px' }}>
                    <span style={{ color: '#38BDF8', fontWeight: 700 }}>Case {idx + 1}: </span>
                    <span style={{ color: '#AAAAAA' }}>Input: "{stc.input_text}" → Expected: "{stc.expected_output}"</span>
                  </div>
                ))}
              </div>
            )}

            {activeConsoleTab === 'output' && (
              <div>
                {/* Submit Result */}
                {submitResult && (
                  <div style={{ marginBottom: '10px', padding: '10px', borderRadius: '6px', backgroundColor: submitResult.verdict === 'ACCEPTED' ? '#064E3B' : '#7F1D1D' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginBottom: '4px' }}>
                      Verdict: {submitResult.verdict}
                    </div>
                    <div style={{ fontSize: '12px', color: '#E2E8F0' }}>
                      Score Awarded: <strong>{submitResult.score_awarded} pts</strong> • Passed: {submitResult.passed_test_cases} / {submitResult.total_test_cases} test cases ({submitResult.execution_time_ms.toFixed(1)}ms)
                    </div>
                  </div>
                )}

                {/* Sample Run Result */}
                {runResult?.sample_results && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {runResult.sample_results.map((sr, idx) => (
                      <div key={sr.test_case_id || idx} style={{ padding: '8px', borderRadius: '6px', backgroundColor: sr.passed ? '#064E3B' : '#450A0A', border: sr.passed ? '1px solid #059669' : '1px solid #DC2626' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: '#FFFFFF' }}>Sample Case {idx + 1}</span>
                          <span style={{ fontWeight: 800, color: sr.passed ? '#34D399' : '#F87171' }}>
                            {sr.passed ? '✓ PASSED' : '✗ FAILED'} ({sr.execution_time_ms.toFixed(1)}ms)
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#D1D5DB' }}>
                          Input: <code>{sr.input_text}</code> | Expected: <code>{sr.expected_output}</code> | Output: <code>{sr.actual_output?.trim()}</code>
                        </div>
                        {sr.stderr && <pre style={{ color: '#FCA5A5', margin: '4px 0 0 0', fontSize: '11px' }}>{sr.stderr}</pre>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Direct stdout / stderr */}
                {runResult?.stdout && (
                  <div style={{ marginTop: '6px' }}>
                    <span style={{ color: '#38BDF8', fontWeight: 700 }}>Stdout:</span>
                    <pre style={{ margin: '2px 0 6px 0', color: '#E2E8F0' }}>{runResult.stdout}</pre>
                  </div>
                )}

                {(runResult?.stderr || runResult?.compile_output) && (
                  <div style={{ marginTop: '6px' }}>
                    <span style={{ color: '#F87171', fontWeight: 700 }}>Errors / Diagnostic:</span>
                    <pre style={{ margin: '2px 0 0 0', color: '#FCA5A5' }}>
                      {runResult.compile_output || runResult.stderr}
                    </pre>
                  </div>
                )}

                {!runResult && !submitResult && !isRunning && !isSubmitting && (
                  <span style={{ color: '#777777' }}>Ready. Click "Run Code" or "Submit Solution".</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
