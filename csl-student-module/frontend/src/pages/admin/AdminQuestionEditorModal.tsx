import React, { useState, useEffect, useRef } from 'react';
import {
  type AdminQuestion,
  type AdminAssessment,
  type AdminSection,
  type AdminProgrammingTestCase,
  getAdminSections,
  fetchAdminQuestionCoding,
  deleteAdminProgrammingTestCase,
} from '../../api/admin';
import { formatApiError } from '../../utils/errorFormatter';

interface AdminQuestionEditorModalProps {
  question: AdminQuestion | null; // null if creating, populated if editing
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<AdminQuestion> & { assessment_id?: string }) => Promise<void>;
  saving: boolean;
  assessments?: AdminAssessment[];
  defaultAssessmentId?: string;
  sections?: AdminSection[];
}

export function AdminQuestionEditorModal({
  question,
  isOpen,
  onClose,
  onSave,
  saving,
  assessments = [],
  defaultAssessmentId = '',
  sections = [],
}: AdminQuestionEditorModalProps) {
  const isEditMode = Boolean(question && question.id);

  // Form fields
  const [assessmentId, setAssessmentId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [sectionType, setSectionType] = useState<string>('APTITUDE');
  const [loadedSections, setLoadedSections] = useState<AdminSection[]>(sections);

  useEffect(() => {
    if (sections && sections.length > 0) {
      setLoadedSections(sections);
    } else if (isOpen) {
      getAdminSections().then(setLoadedSections).catch(() => {});
    }
  }, [sections, isOpen]);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctOption, setCorrectOption] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [explanation, setExplanation] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [marks, setMarks] = useState<number>(1);
  const [isArchived, setIsArchived] = useState(false);

  // Coding Question State (Phase 3.1)
  const [codingConstraints, setCodingConstraints] = useState('');
  const [codingInputFormat, setCodingInputFormat] = useState('');
  const [codingOutputFormat, setCodingOutputFormat] = useState('');
  const [codingTimeLimit, setCodingTimeLimit] = useState<number>(2.0);
  const [codingMemoryLimit, setCodingMemoryLimit] = useState<number>(256);
  const [codingAllowedLanguages, setCodingAllowedLanguages] = useState<string[]>(['python', 'java']);
  const [codingBoilerplate, setCodingBoilerplate] = useState<Record<string, string>>({
    python: "# Write your Python solution here\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()\n",
    java: "import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n    }\n}\n"
  });
  const [codingTestCases, setCodingTestCases] = useState<AdminProgrammingTestCase[]>([]);
  const [newTcInput, setNewTcInput] = useState('');
  const [newTcOutput, setNewTcOutput] = useState('');
  const [newTcIsPublic, setNewTcIsPublic] = useState(false);
  const [newTcWeight, setNewTcWeight] = useState<number>(1.0);

  // Validation error state
  const [errorMsg, setErrorMsg] = useState('');

  // Initial state tracking for unsaved changes detection
  const initialStateRef = useRef<string>('');

  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize state when question prop changes
  useEffect(() => {
    if (question) {
      const existingAssessmentId =
        question.assessment_id ||
        (question.assigned_assessments && question.assigned_assessments.length > 0
          ? question.assigned_assessments[0].id
          : '') ||
        defaultAssessmentId ||
        '';

      setAssessmentId(existingAssessmentId);
      setPrompt(question.prompt || '');
      setSectionType(question.section_type || 'APTITUDE');
      setDifficulty(question.difficulty || 'MEDIUM');
      setOptionA(question.option_a || '');
      setOptionB(question.option_b || '');
      setOptionC(question.option_c || '');
      setOptionD(question.option_d || '');
      setCorrectOption(question.correct_option || 'A');
      setExplanation(question.explanation || '');
      setIsActive(question.is_active ?? true);
      setMarks(question.marks ?? (question.section_type === 'CODING' ? 10 : 1));
      setIsArchived(question.is_archived ?? false);

      if (question.id && question.section_type === 'CODING') {
        fetchAdminQuestionCoding(question.id)
          .then((details) => {
            if (details) {
              setCodingConstraints(details.constraints || '');
              setCodingInputFormat(details.input_format || '');
              setCodingOutputFormat(details.output_format || '');
              setCodingTimeLimit(details.time_limit_seconds || 2.0);
              setCodingMemoryLimit(details.memory_limit_mb || 256);
              setCodingAllowedLanguages(details.allowed_languages || ['python', 'java']);
              setCodingBoilerplate(details.boilerplate_code || {});
              setCodingTestCases(details.test_cases || []);
            }
          })
          .catch(() => {});
      }

      initialStateRef.current = JSON.stringify({
        assessmentId: existingAssessmentId,
        prompt: question.prompt || '',
        sectionType: question.section_type || 'APTITUDE',
        difficulty: question.difficulty || 'MEDIUM',
        optionA: question.option_a || '',
        optionB: question.option_b || '',
        optionC: question.option_c || '',
        optionD: question.option_d || '',
        correctOption: question.correct_option || 'A',
        explanation: question.explanation || '',
        isActive: question.is_active ?? true,
      });
    } else {
      // Create mode defaults
      const initialNewAssessmentId =
        defaultAssessmentId ||
        (assessments && assessments.length > 0 ? assessments[0].id : '');

      setAssessmentId(initialNewAssessmentId);
      setPrompt('');
      setSectionType('APTITUDE');
      setDifficulty('MEDIUM');
      setOptionA('');
      setOptionB('');
      setOptionC('');
      setOptionD('');
      setCorrectOption('A');
      setExplanation('');
      setIsActive(true);
      setMarks(1);
      setIsArchived(false);

      initialStateRef.current = JSON.stringify({
        assessmentId: initialNewAssessmentId,
        prompt: '',
        sectionType: 'APTITUDE',
        difficulty: 'MEDIUM',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctOption: 'A',
        explanation: '',
        isActive: true,
      });
    }
    setErrorMsg('');
  }, [question, isOpen, defaultAssessmentId, assessments]);

  if (!isOpen) return null;

  // Unsaved changes check
  const hasUnsavedChanges = () => {
    const currentState = JSON.stringify({
      assessmentId,
      prompt,
      sectionType,
      difficulty,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption,
      explanation,
      isActive,
    });
    return currentState !== initialStateRef.current;
  };

  const handleAttemptClose = () => {
    if (hasUnsavedChanges()) {
      const confirmDiscard = window.confirm(
        'You have unsaved changes in this question editor. Are you sure you want to discard your edits?'
      );
      if (!confirmDiscard) return;
    }
    onClose();
  };

  // Helper: Insert code block template into prompt
  const handleInsertCodeBlock = () => {
    const codeTemplate = `\n\`\`\`python\ndef example_solution(data):\n    # Process elements in linear time\n    count = 250\n    return [x for x in data if x % 2 == 0]\n\`\`\`\n`;

    if (promptTextareaRef.current) {
      const start = promptTextareaRef.current.selectionStart || 0;
      const end = promptTextareaRef.current.selectionEnd || 0;
      const currentVal = prompt;
      const newVal =
        currentVal.substring(0, start) + codeTemplate + currentVal.substring(end);
      setPrompt(newVal);

      setTimeout(() => {
        if (promptTextareaRef.current) {
          promptTextareaRef.current.focus();
          promptTextareaRef.current.selectionStart = start + codeTemplate.length;
          promptTextareaRef.current.selectionEnd = start + codeTemplate.length;
        }
      }, 50);
    } else {
      setPrompt((prev) => prev + codeTemplate);
    }
  };

  // Helper: Shuffle options without losing designated correct answer
  const handleShuffleOptions = () => {
    const currentOptions = [
      { key: 'A', text: optionA },
      { key: 'B', text: optionB },
      { key: 'C', text: optionC },
      { key: 'D', text: optionD },
    ];

    // Identify which text is currently the correct answer
    const correctText = currentOptions.find((o) => o.key === correctOption)?.text || '';

    // Shuffle the items
    const shuffledTexts = [optionA, optionB, optionC, optionD];
    for (let i = shuffledTexts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTexts[i], shuffledTexts[j]] = [shuffledTexts[j], shuffledTexts[i]];
    }

    setOptionA(shuffledTexts[0]);
    setOptionB(shuffledTexts[1]);
    setOptionC(shuffledTexts[2]);
    setOptionD(shuffledTexts[3]);

    // Find new position of the correct text
    const keys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const newCorrectIdx = shuffledTexts.findIndex((t) => t === correctText);
    if (newCorrectIdx !== -1) {
      setCorrectOption(keys[newCorrectIdx]);
    }
  };

  // Submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Field validations
    if (!prompt.trim()) {
      setErrorMsg('Question prompt / problem statement is required.');
      return;
    }

    if (sectionType === 'CODING') {
      if (codingTestCases.length === 0) {
        setErrorMsg('At least one evaluation test case is required for coding questions.');
        return;
      }
      if (Number(marks) <= 0) {
        setErrorMsg('Question marks must be a positive number (> 0).');
        return;
      }
    } else {
      if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
        setErrorMsg('All four answer options (A, B, C, D) must be provided.');
        return;
      }
      if (!['A', 'B', 'C', 'D'].includes(correctOption)) {
        setErrorMsg('A valid correct option key (A, B, C, or D) must be selected.');
        return;
      }
    }

    const payload: Partial<AdminQuestion> & { assessment_id?: string; coding_details?: any } = {
      assessment_id: assessmentId.trim() || undefined,
      marks: Number(marks) || (sectionType === 'CODING' ? 10 : 1),
      is_archived: isArchived,
      prompt: prompt.trim(),
      section_type: sectionType,
      difficulty,
      option_a: sectionType === 'CODING' ? 'N/A (Coding Question)' : optionA.trim(),
      option_b: sectionType === 'CODING' ? 'N/A (Coding Question)' : optionB.trim(),
      option_c: sectionType === 'CODING' ? 'N/A (Coding Question)' : optionC.trim(),
      option_d: sectionType === 'CODING' ? 'N/A (Coding Question)' : optionD.trim(),
      correct_option: sectionType === 'CODING' ? 'A' : correctOption,
      explanation: explanation.trim(),
      is_active: isActive,
      coding_details: sectionType === 'CODING' ? {
        problem_statement: prompt.trim(),
        constraints: codingConstraints.trim(),
        input_format: codingInputFormat.trim(),
        output_format: codingOutputFormat.trim(),
        time_limit_seconds: Number(codingTimeLimit) || 2.0,
        memory_limit_mb: Number(codingMemoryLimit) || 256,
        allowed_languages: codingAllowedLanguages,
        boilerplate_code: codingBoilerplate,
        test_cases: codingTestCases,
      } : undefined,
    };

    try {
      await onSave(payload);
    } catch (err: unknown) {
      setErrorMsg(formatApiError(err, 'Failed to save question.'));
    }
  };

  const handleAddTestCase = () => {
    if (newTcOutput === '') {
      setErrorMsg('Expected output is required for the test case.');
      return;
    }
    setErrorMsg('');
    const tc: AdminProgrammingTestCase = {
      input_text: newTcInput,
      expected_output: newTcOutput,
      is_public: newTcIsPublic,
      marks_weightage: Number(newTcWeight) || 1.0,
      explanation: '',
      order: codingTestCases.length + 1,
    };
    setCodingTestCases([...codingTestCases, tc]);
    setNewTcInput('');
    setNewTcOutput('');
    setNewTcIsPublic(false);
    setNewTcWeight(1.0);
  };

  const handleRemoveTestCase = async (index: number, tcId?: string) => {
    if (tcId && question?.id) {
      try {
        await deleteAdminProgrammingTestCase(question.id, tcId);
      } catch (err) {
        console.warn('Failed to delete test case via API:', err);
      }
    }
    setCodingTestCases(codingTestCases.filter((_, i) => i !== index));
  };

  // Extract code blocks and prose for live preview
  const parsePromptForPreview = (text: string) => {
    if (!text || !text.trim()) {
      return { codeBlock: '', prose: 'Enter question prompt to view live preview here.' };
    }

    const codeRegex = /```(?:[a-zA-Z]*)\n([\s\S]*?)```/;
    const match = text.match(codeRegex);
    if (match) {
      const codeBlock = match[1].trim();
      const prose = text.replace(codeRegex, '').trim();
      return { codeBlock, prose };
    }

    // If starts with def or contains typical python code
    if (text.includes('def ') || text.includes('return ') || text.includes('class ')) {
      const lines = text.split('\n');
      const codeLines: string[] = [];
      const proseLines: string[] = [];
      let inCode = false;

      lines.forEach((line) => {
        if (
          line.startsWith('def ') ||
          line.startsWith('    ') ||
          line.startsWith('\t') ||
          line.includes('return ') ||
          line.includes('import ')
        ) {
          inCode = true;
          codeLines.push(line);
        } else if (inCode && line.trim() === '') {
          codeLines.push(line);
        } else {
          inCode = false;
          proseLines.push(line);
        }
      });

      if (codeLines.length >= 2) {
        return {
          codeBlock: codeLines.join('\n').trim(),
          prose: proseLines.join('\n').trim(),
        };
      }
    }

    return { codeBlock: '', prose: text };
  };

  const { codeBlock: previewCode, prose: previewProse } = parsePromptForPreview(prompt);

  const promptLinesCount = prompt ? prompt.split('\n').length : 0;
  const promptCharsCount = prompt.length;

  const selectedAssessmentObj =
    assessments?.find((a) => a.id === assessmentId) ||
    question?.assigned_assessments?.find((a) => a.id === assessmentId) ||
    null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(11, 46, 111, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px 16px',
        boxSizing: 'border-box',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleAttemptClose();
      }}
    >
      <div
        style={{
          width: '95vw',
          maxWidth: '1280px',
          height: '92vh',
          maxHeight: '92vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid rgba(245, 184, 61, 0.4)',
          boxShadow: '0 25px 60px -15px rgba(11, 46, 111, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* ─── MODAL HEADER ────────────────────────────────────────── */}
        <div
          style={{
            padding: '18px 28px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          {/* Left: Icon, Title & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: '#EFF6FF',
                border: '1.5px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                color: '#1455B8',
                flexShrink: 0,
              }}
            >
              📝
            </div>
            <div>
              <h2
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: '#0B2E6F',
                  margin: '0 0 2px 0',
                  letterSpacing: '-0.01em',
                }}
              >
                {isEditMode ? `Edit Question #${question!.id}` : 'Create New Question'}
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0 }}>
                {isEditMode
                  ? 'Update the question details. Changes will apply to future assessments.'
                  : 'Compose a new diagnostic question for the initial assessment pool.'}
              </p>
            </div>
          </div>

          {/* Right: Active Status Toggle & Close Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              onClick={() => setIsActive((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '9999px',
                border: `1.5px solid ${isActive ? '#86EFAC' : '#CBD5E1'}`,
                backgroundColor: isActive ? '#DCFCE7' : '#F1F5F9',
                color: isActive ? '#166534' : '#64748B',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Click to toggle question active status in assessment generation"
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isActive ? '#16A34A' : '#94A3B8',
                }}
              />
              <span>{isActive ? 'Active' : 'Inactive'}</span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>▾</span>
            </button>

            <button
              type="button"
              onClick={handleAttemptClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1.5px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#64748B',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
              title="Close editor"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ─── ERROR BANNER ────────────────────────────────────────── */}
        {errorMsg && (
          <div
            style={{
              margin: '16px 28px 0 28px',
              backgroundColor: '#FEF2F2',
              border: '1.5px solid #FECACA',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              color: '#991B1B',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>⚠️ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg('')}
              style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ─── MAIN CONTENT BODY (2 COLUMNS) ───────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 28px',
            backgroundColor: '#FCFAF5',
            boxSizing: 'border-box',
          }}
        >
          <form id="question-editor-form" onSubmit={handleSubmit}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.8fr) minmax(360px, 1.2fr)',
                gap: '24px',
                alignItems: 'start',
              }}
            >
              {/* ────────────────────────────────────────────────────────
                  LEFT COLUMN: THE FORM EDITOR (approx 65%)
                  ──────────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 0. Target Assessment / Question Pool Selector */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1.5px solid #1455B8',
                    padding: '16px 20px',
                    boxShadow: '0 2px 8px rgba(11, 46, 111, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <label
                      htmlFor="question-assessment-selector"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        color: '#0B2E6F',
                      }}
                    >
                      <span>🏛️</span>
                      <span>Target Assessment (Optional - Independent Question Bank)</span>
                    </label>
                    {selectedAssessmentObj && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 10px',
                          borderRadius: '9999px',
                          backgroundColor: '#EFF6FF',
                          color: '#1455B8',
                          border: '1px solid #BFDBFE',
                        }}
                      >
                        Code: {selectedAssessmentObj.code}
                      </span>
                    )}
                  </div>

                  <select
                    id="question-assessment-selector"
                    value={assessmentId}
                    onChange={(e) => setAssessmentId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: '#0F172A',
                      backgroundColor: '#F8FAFC',
                      boxSizing: 'border-box',
                      outlineColor: '#1455B8',
                    }}
                  >
                    <option value="">-- Standalone Question Bank (No Assessment Assigned) --</option>
                    {assessments && assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.title} ({a.pool_questions_count ?? 0} questions in pool)
                      </option>
                    ))}
                    {/* Fallback if editing a question whose assigned assessment isn't in assessments array */}
                    {question?.assigned_assessments?.map((a) => {
                      if (!assessments?.some((item) => item.id === a.id)) {
                        return (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.title} (Currently Assigned)
                          </option>
                        );
                      }
                      return null;
                    })}
                  </select>

                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B', lineHeight: 1.4 }}>
                    {isEditMode
                      ? 'Reassigning moves this question to the selected assessment pool upon saving.'
                      : 'Assigns this question directly to the designated assessment pool for exam generation.'}
                  </p>
                </div>

                {/* 1. Metadata Selector Bar */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid rgba(245, 184, 61, 0.25)',
                    padding: '16px 20px',
                    boxShadow: '0 2px 6px rgba(11, 46, 111, 0.03)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '16px',
                  }}
                >
                  {/* Section Type */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#0B2E6F',
                        marginBottom: '6px',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>&lt;/&gt;</span>
                      <span>Section Type *</span>
                    </label>
                    <select
                      value={sectionType}
                      onChange={(e) => setSectionType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1E293B',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                        outlineColor: '#1455B8',
                      }}
                    >
                      {loadedSections.length > 0 ? (
                        <>
                          {loadedSections.map((sec) => (
                            <option key={sec.id} value={sec.code}>
                              {sec.name} ({sec.code})
                            </option>
                          ))}
                          {!loadedSections.some((s) => s.code.toUpperCase() === sectionType.toUpperCase()) && (
                            <option value={sectionType}>{sectionType}</option>
                          )}
                        </>
                      ) : (
                        <>
                          <option value="APTITUDE">Aptitude</option>
                          <option value="CODING">Coding Fundamentals</option>
                          {sectionType !== 'APTITUDE' && sectionType !== 'CODING' && (
                            <option value={sectionType}>{sectionType}</option>
                          )}
                        </>
                      )}
                    </select>
                  </div>

                  {/* Difficulty */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#0B2E6F',
                        marginBottom: '6px',
                      }}
                    >
                      <span>📊</span>
                      <span>Difficulty *</span>
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1E293B',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                        outlineColor: '#1455B8',
                      }}
                    >
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </div>

                  {/* Marks / Points */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#0B2E6F',
                        marginBottom: '6px',
                      }}
                    >
                      <span>🎯</span>
                      <span>Marks / Points *</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={marks}
                      onChange={(e) => setMarks(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1E293B',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                        outlineColor: '#1455B8',
                      }}
                    />
                  </div>
                </div>

                {/* 2. Question Prompt / Problem Statement Card */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid rgba(245, 184, 61, 0.25)',
                    padding: '20px 22px',
                    boxShadow: '0 2px 6px rgba(11, 46, 111, 0.03)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '10px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '14px',
                          fontWeight: 800,
                          color: '#0B2E6F',
                        }}
                      >
                        <span>📄</span>
                        <span>Question Prompt / Problem Statement *</span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                        Enter the complete question text, including code snippets, context, and instructions.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleInsertCodeBlock}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #BFDBFE',
                        backgroundColor: '#EFF6FF',
                        color: '#1455B8',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DBEAFE')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
                      title="Insert formatted python code block snippet"
                    >
                      <span style={{ fontFamily: 'monospace' }}>{'{}'}</span>
                      <span>Insert Code Block</span>
                    </button>
                  </div>

                  {/* Multiline Prompt Textarea with Monospace Support */}
                  <textarea
                    ref={promptTextareaRef}
                    required
                    rows={8}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Consider the code pattern illustrating Encapsulation and Abstraction:\n\ndef process_node(data):\n    count = 250\n    return [x for x in data if x % 2 == 0]\n\nWhat is the asymptotic behavior or output contract of this logic?"
                    style={{
                      width: '100%',
                      minHeight: '170px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
                      fontSize: '13px',
                      lineHeight: '1.55',
                      color: '#0F172A',
                      backgroundColor: '#FAF7F3',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                      outlineColor: '#1455B8',
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '16px',
                      fontSize: '11px',
                      color: '#64748B',
                      marginTop: '6px',
                    }}
                  >
                    <span>Lines: {promptLinesCount}</span>
                    <span>Characters: {promptCharsCount}</span>
                  </div>
                </div>

                {sectionType === 'CODING' ? (
                  /* ─── CODING QUESTION SPECIFICATION & TEST CASES CARD (Phase 3.1) ─── */
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '14px',
                      border: '1.5px solid #CBD5E1',
                      padding: '20px 22px',
                      boxShadow: '0 2px 6px rgba(11, 46, 111, 0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                          💻 Programming Problem Specification
                        </h4>
                        <span style={{ fontSize: '11px', color: '#1455B8', fontWeight: 700, backgroundColor: '#EFF6FF', padding: '2px 8px', borderRadius: '4px' }}>
                          Monaco Playground Active
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                        Configure problem statement, constraints, input/output specifications, execution limits, and evaluation test cases.
                      </p>
                    </div>

                    {/* Constraints */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '4px' }}>
                        Constraints
                      </label>
                      <textarea
                        rows={2}
                        value={codingConstraints}
                        onChange={(e) => setCodingConstraints(e.target.value)}
                        placeholder="e.g. 1 <= n <= 10^5, -10^9 <= a[i] <= 10^9"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Input Format & Output Format */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '4px' }}>
                          Input Format
                        </label>
                        <textarea
                          rows={2}
                          value={codingInputFormat}
                          onChange={(e) => setCodingInputFormat(e.target.value)}
                          placeholder="e.g. First line contains integer n. Second line contains n space-separated integers."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '4px' }}>
                          Output Format
                        </label>
                        <textarea
                          rows={2}
                          value={codingOutputFormat}
                          onChange={(e) => setCodingOutputFormat(e.target.value)}
                          placeholder="e.g. Print a single integer representing the maximum subarray sum."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Time & Memory Limits */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '4px' }}>
                          Time Limit (Seconds) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.5"
                          max="10.0"
                          value={codingTimeLimit}
                          onChange={(e) => setCodingTimeLimit(Number(e.target.value))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '4px' }}>
                          Memory Limit (MB) *
                        </label>
                        <input
                          type="number"
                          min="64"
                          max="1024"
                          value={codingMemoryLimit}
                          onChange={(e) => setCodingMemoryLimit(Number(e.target.value))}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Evaluation Test Cases Section */}
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0B2E6F' }}>
                            Evaluation Test Cases ({codingTestCases.length})
                          </span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: '#EFF6FF', color: '#1455B8', fontWeight: 700 }}>
                            Public Samples: {codingTestCases.filter(t => t.is_public).length}
                          </span>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>
                            Hidden Evaluation: {codingTestCases.filter(t => !t.is_public).length}
                          </span>
                        </div>
                      </div>

                      {/* Existing Test Cases Table */}
                      {codingTestCases.length === 0 ? (
                        <div style={{ padding: '16px', backgroundColor: '#FEF2F2', border: '1px dashed #FCA5A5', borderRadius: '8px', textAlign: 'center', color: '#991B1B', fontSize: '12px' }}>
                          ⚠️ At least one test case is required before this problem can be evaluated. Add a sample test case below.
                        </div>
                      ) : (
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                              <tr>
                                <th style={{ padding: '8px 10px', color: '#475569' }}>#</th>
                                <th style={{ padding: '8px 10px', color: '#475569' }}>Visibility</th>
                                <th style={{ padding: '8px 10px', color: '#475569' }}>Input (stdin)</th>
                                <th style={{ padding: '8px 10px', color: '#475569' }}>Expected Output</th>
                                <th style={{ padding: '8px 10px', color: '#475569' }}>Weight</th>
                                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {codingTestCases.map((tc, idx) => (
                                <tr key={tc.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{idx + 1}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span style={{
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      backgroundColor: tc.is_public ? '#EFF6FF' : '#FEF3C7',
                                      color: tc.is_public ? '#1455B8' : '#B45309',
                                    }}>
                                      {tc.is_public ? 'PUBLIC' : 'HIDDEN'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tc.input_text || '(empty)'}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tc.expected_output}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{tc.marks_weightage || 1.0}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTestCase(idx, tc.id)}
                                      style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '13px' }}
                                      title="Remove Test Case"
                                    >
                                      🗑️
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Add New Test Case Inline Form */}
                      <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0B2E6F', display: 'block', marginBottom: '8px' }}>
                          + Add Test Case
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                              Standard Input (stdin)
                            </label>
                            <textarea
                              rows={2}
                              value={newTcInput}
                              onChange={(e) => setNewTcInput(e.target.value)}
                              placeholder="Input passed to stdin..."
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>
                              Expected Output (stdout) *
                            </label>
                            <textarea
                              rows={2}
                              value={newTcOutput}
                              onChange={(e) => setNewTcOutput(e.target.value)}
                              placeholder="Exact expected stdout..."
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={newTcIsPublic}
                                onChange={(e) => setNewTcIsPublic(e.target.checked)}
                                style={{ accentColor: '#1455B8' }}
                              />
                              <span>Public Sample Case</span>
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Weight:</label>
                              <input
                                type="number"
                                min="0.1"
                                step="0.5"
                                value={newTcWeight}
                                onChange={(e) => setNewTcWeight(Number(e.target.value))}
                                style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleAddTestCase}
                            style={{
                              padding: '6px 14px',
                              backgroundColor: '#1455B8',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Add to Test Cases
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 3. Answer Options Card */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid rgba(245, 184, 61, 0.25)',
                    padding: '20px 22px',
                    boxShadow: '0 2px 6px rgba(11, 46, 111, 0.03)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '14px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '14px',
                          fontWeight: 800,
                          color: '#0B2E6F',
                        }}
                      >
                        <span>📑</span>
                        <span>Answer Options *</span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                        Provide four options. Click any option badge (A/B/C/D) to designate it as the correct answer.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleShuffleOptions}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #BFDBFE',
                        backgroundColor: '#EFF6FF',
                        color: '#1455B8',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DBEAFE')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
                      title="Shuffle options while preserving correct answer mapping"
                    >
                      <span>🔀</span>
                      <span>Shuffle Options</span>
                    </button>
                  </div>

                  {/* 4 Option Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { key: 'A', value: optionA, setter: setOptionA },
                      { key: 'B', value: optionB, setter: setOptionB },
                      { key: 'C', value: optionC, setter: setOptionC },
                      { key: 'D', value: optionD, setter: setOptionD },
                    ].map((opt) => {
                      const isCorrect = correctOption === opt.key;

                      return (
                        <div
                          key={opt.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 10px',
                            borderRadius: '10px',
                            border: `1.5px solid ${isCorrect ? '#F5B83D' : '#E2E8F0'}`,
                            backgroundColor: isCorrect ? '#FFFDF5' : '#FFFFFF',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {/* Drag handle icon */}
                          <span
                            style={{
                              color: '#94A3B8',
                              fontSize: '15px',
                              cursor: 'grab',
                              userSelect: 'none',
                              padding: '0 4px',
                            }}
                            title="Option drag handle"
                          >
                            ⠿
                          </span>

                          {/* Letter Badge (Clicking toggles as correct option) */}
                          <button
                            type="button"
                            onClick={() => setCorrectOption(opt.key as any)}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              border: `1.5px solid ${isCorrect ? '#D97706' : '#CBD5E1'}`,
                              backgroundColor: isCorrect ? '#FFD45C' : '#F1F5F9',
                              color: isCorrect ? '#0B2E6F' : '#475569',
                              fontSize: '13px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                            title={`Mark Option ${opt.key} as the correct answer`}
                          >
                            {opt.key}
                          </button>

                          {/* Editable Input */}
                          <input
                            type="text"
                            required
                            value={opt.value}
                            onChange={(e) => opt.setter(e.target.value)}
                            placeholder={`Enter text for Option ${opt.key}...`}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              fontSize: '13px',
                              color: '#1E293B',
                              backgroundColor: '#FFFFFF',
                              boxSizing: 'border-box',
                              outlineColor: '#1455B8',
                            }}
                          />

                          {/* Clear text button */}
                          <button
                            type="button"
                            onClick={() => opt.setter('')}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: 'transparent',
                              color: '#EF4444',
                              fontSize: '14px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title={`Clear Option ${opt.key}`}
                          >
                            🗑️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Correct Answer & Explanation Card */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid rgba(245, 184, 61, 0.25)',
                    padding: '20px 22px',
                    boxShadow: '0 2px 6px rgba(11, 46, 111, 0.03)',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1fr) minmax(280px, 2.5fr)',
                    gap: '18px',
                  }}
                >
                  {/* Correct Option Key Selector */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 800,
                        color: '#0B2E6F',
                        marginBottom: '6px',
                      }}
                    >
                      <span>🎯</span>
                      <span>Correct Option Key *</span>
                    </label>
                    <select
                      value={correctOption}
                      onChange={(e) => setCorrectOption(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #F5B83D',
                        backgroundColor: '#FFFDF5',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#0B2E6F',
                        boxSizing: 'border-box',
                        outlineColor: '#1455B8',
                      }}
                    >
                      <option value="A">Option A</option>
                      <option value="B">Option B</option>
                      <option value="C">Option C</option>
                      <option value="D">Option D</option>
                    </select>
                    <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0 0' }}>
                      Designates which choice awards 1 mark upon evaluation.
                    </p>
                  </div>

                  {/* Administrative Explanation */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 800,
                        color: '#0B2E6F',
                        marginBottom: '6px',
                      }}
                    >
                      <span>📖</span>
                      <span>Explanation (For Admin Review)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      placeholder="e.g. This uses a list comprehension that iterates over the input once, so the time complexity is O(N). It filters even numbers and does not mutate the sequence."
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '12.5px',
                        color: '#1E293B',
                        backgroundColor: '#FFFFFF',
                        boxSizing: 'border-box',
                        outlineColor: '#1455B8',
                      }}
                    />
                  </div>
                </div>
              </>
            )}
              </div>

            {/* ────────────────────────────────────────────────────────
                  RIGHT COLUMN: LIVE PREVIEW & METADATA (approx 35%)
                  ──────────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. Live Question Preview Card */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1.5px solid rgba(245, 184, 61, 0.35)',
                    padding: '20px',
                    boxShadow: '0 4px 14px rgba(11, 46, 111, 0.05)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        fontWeight: 800,
                        color: '#0B2E6F',
                      }}
                    >
                      <span>👁️</span>
                      <span>Question Preview</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {selectedAssessmentObj && (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: '#E0E7FF',
                            color: '#3730A3',
                            border: '1px solid #C7D2FE',
                          }}
                        >
                          {selectedAssessmentObj.code}
                        </span>
                      )}
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 800,
                          backgroundColor: sectionType === 'CODING' ? '#FEF3C7' : '#EFF6FF',
                          color: sectionType === 'CODING' ? '#B45309' : '#1455B8',
                          border: `1px solid ${sectionType === 'CODING' ? '#FDE68A' : '#BFDBFE'}`,
                        }}
                      >
                        {sectionType === 'CODING' ? 'Coding Fundamentals' : 'Aptitude'}
                      </span>
                    </div>
                  </div>

                  {/* Preview Code Snippet (if any) */}
                  {previewCode ? (
                    <div
                      style={{
                        backgroundColor: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
                        fontSize: '12px',
                        lineHeight: 1.5,
                        color: '#0F172A',
                        marginBottom: '12px',
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                      }}
                    >
                      {previewCode}
                    </div>
                  ) : null}

                  {/* Preview Question Prompt Prose */}
                  <div
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: '#0F172A',
                      lineHeight: 1.5,
                      marginBottom: '16px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {previewProse}
                  </div>

                  {/* Preview 4 Options with Correct Answer Highlight */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { key: 'A', text: optionA },
                      { key: 'B', text: optionB },
                      { key: 'C', text: optionC },
                      { key: 'D', text: optionD },
                    ].map((opt) => {
                      const isCorrectAnswer = correctOption === opt.key;

                      return (
                        <div
                          key={opt.key}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: `1.5px solid ${isCorrectAnswer ? '#16A34A' : '#E2E8F0'}`,
                            backgroundColor: isCorrectAnswer ? '#DCFCE7' : '#FFFFFF',
                            color: isCorrectAnswer ? '#166534' : '#334155',
                            fontSize: '13px',
                            fontWeight: isCorrectAnswer ? 700 : 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              border: `1.5px solid ${isCorrectAnswer ? '#16A34A' : '#94A3B8'}`,
                              backgroundColor: isCorrectAnswer ? '#16A34A' : 'transparent',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isCorrectAnswer && (
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#FFFFFF' }} />
                            )}
                          </span>

                          <span style={{ flex: 1, wordBreak: 'break-word' }}>
                            {opt.text || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Option {opt.key} placeholder</span>}
                          </span>

                          {isCorrectAnswer && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                backgroundColor: '#166534',
                                color: '#FFFFFF',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}
                            >
                              Correct
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Question Metadata Information Card */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid rgba(245, 184, 61, 0.25)',
                    padding: '20px',
                    boxShadow: '0 2px 8px rgba(11, 46, 111, 0.03)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#0B2E6F',
                      marginBottom: '14px',
                    }}
                  >
                    <span>ℹ️</span>
                    <span>Question Metadata</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B' }}>Question ID</span>
                      <strong style={{ color: '#0B2E6F', fontFamily: 'monospace' }}>
                        {isEditMode ? `#${question!.id}` : 'Unassigned (New)'}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B' }}>Status</span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 800,
                          backgroundColor: isActive ? '#DCFCE7' : '#F1F5F9',
                          color: isActive ? '#166534' : '#64748B',
                        }}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B' }}>Target Pool</span>
                      <strong
                        style={{
                          color: '#0B2E6F',
                          fontSize: '12px',
                          textAlign: 'right',
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={selectedAssessmentObj ? `${selectedAssessmentObj.code} - ${selectedAssessmentObj.title}` : 'None Selected'}
                      >
                        {selectedAssessmentObj ? selectedAssessmentObj.code : 'None Selected'}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B' }}>Difficulty</span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor:
                            difficulty === 'EASY'
                              ? '#EFF6FF'
                              : difficulty === 'MEDIUM'
                              ? '#FEF3C7'
                              : '#FEE2E2',
                          color:
                            difficulty === 'EASY'
                              ? '#1455B8'
                              : difficulty === 'MEDIUM'
                              ? '#B45309'
                              : '#DC2626',
                        }}
                      >
                        {difficulty}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B' }}>Last Updated</span>
                      <span style={{ color: '#334155' }}>
                        {question?.created_at
                          ? new Date(question.created_at).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Just now'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748B' }}>Created By</span>
                      <span style={{ color: '#334155', fontWeight: 600 }}>csladmin</span>
                    </div>
                  </div>
                </div>

                {/* 3. Action Buttons Area */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    marginTop: 'auto',
                    paddingTop: '10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleAttemptClose}
                    disabled={saving}
                    style={{
                      padding: '10px 22px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                  >
                    ✕ Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '10px 28px',
                      borderRadius: '10px',
                      border: '1.5px solid #F5B83D',
                      backgroundColor: '#0B2E6F',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(11, 46, 111, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: saving ? 0.75 : 1,
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) e.currentTarget.style.backgroundColor = '#1455B8';
                    }}
                    onMouseLeave={(e) => {
                      if (!saving) e.currentTarget.style.backgroundColor = '#0B2E6F';
                    }}
                  >
                    <span>{isEditMode ? '💾' : '+'}</span>
                    <span>{saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Question'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
