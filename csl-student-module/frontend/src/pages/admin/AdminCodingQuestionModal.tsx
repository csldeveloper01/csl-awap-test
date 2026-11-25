import React, { useState, useEffect, useRef } from 'react';
import {
  type AdminQuestion,
  type AdminAssessment,
  type AdminSection,
  type AdminQuestionPool,
  type AdminProgrammingDetails,
  type AdminProgrammingTestCase,
  getAdminSections,
  fetchAdminQuestionCoding,
  deleteAdminProgrammingTestCase,
} from '../../api/admin';
import { formatApiError } from '../../utils/errorFormatter';
import { useAdminTheme } from '../../utils/adminTheme';

export interface AdminCodingQuestionModalProps {
  question: AdminQuestion | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    data: Partial<AdminQuestion> & {
      assessment_id?: string;
      pool_id?: string;
      question_type: 'CODING';
      coding_details: Record<string, unknown>;
    }
  ) => Promise<void>;
  saving: boolean;
  assessments?: AdminAssessment[];
  defaultAssessmentId?: string;
  sections?: AdminSection[];
  isPoolScoped?: boolean;
  targetPool?: AdminQuestionPool | null;
}

const EMPTY_ASSESSMENTS: AdminAssessment[] = [];
const EMPTY_SECTIONS: AdminSection[] = [];

const SUPPORTED_CODING_LANGUAGES: { key: string; label: string }[] = [
  { key: 'python', label: 'Python 3' },
  { key: 'java', label: 'Java' },
];

const DEFAULT_BOILERPLATES: Record<string, string> = {
  python: "# Write your Python 3 solution here\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()\n",
  java: "import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n    }\n}\n",
};

function resolveDefaultCodingSection(sectionsList: AdminSection[], currentCode?: string): string {
  if (currentCode && currentCode.trim()) return currentCode;
  const codingSec = sectionsList.find(
    (s) => s.code.toUpperCase() === 'CODING' || s.name.toUpperCase().includes('CODING')
  );
  return codingSec ? codingSec.code : 'CODING';
}

export function AdminCodingQuestionModal({
  question,
  isOpen,
  onClose,
  onSave,
  saving,
  assessments = EMPTY_ASSESSMENTS,
  defaultAssessmentId = '',
  sections = EMPTY_SECTIONS,
  isPoolScoped = false,
  targetPool = null,
}: AdminCodingQuestionModalProps) {
  const { isDark, tokens } = useAdminTheme();
  const isEditMode = Boolean(question && question.id);

  // Section 1: Basic Information
  const [assessmentId, setAssessmentId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [sectionType, setSectionType] = useState<string>('CODING');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [marks, setMarks] = useState<number>(10);
  const [category, setCategory] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isArchived, setIsArchived] = useState<boolean>(false);
  const [loadedSections, setLoadedSections] = useState<AdminSection[]>(sections);

  // Section 2: Problem Statement & Format
  const [problemStatement, setProblemStatement] = useState('');
  const [inputFormat, setInputFormat] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<string>('');
  const [constraints, setConstraints] = useState<string>('');
  const statementRef = useRef<HTMLTextAreaElement>(null);

  // Section 3 & 5: Language & Execution Configuration
  const [timeLimit, setTimeLimit] = useState<number>(2.0);
  const [memoryLimit, setMemoryLimit] = useState<number>(256);
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(['python', 'java']);
  const [activeBoilerplateLang, setActiveBoilerplateLang] = useState<string>('python');
  const [boilerplateCode, setBoilerplateCode] = useState<Record<string, string>>({ ...DEFAULT_BOILERPLATES });

  // Section 4: Test Case Management
  const [testCases, setTestCases] = useState<AdminProgrammingTestCase[]>([]);
  const [loadingCodingDetails, setLoadingCodingDetails] = useState<boolean>(false);
  const [previewLang, setPreviewLang] = useState<string>('python');

  const [newSampleInput, setNewSampleInput] = useState('');
  const [newSampleOutput, setNewSampleOutput] = useState('');
  const [newSampleExplanation, setNewSampleExplanation] = useState('');
  const [newSampleWeight, setNewSampleWeight] = useState<number>(1.0);

  const [newHiddenInput, setNewHiddenInput] = useState('');
  const [newHiddenOutput, setNewHiddenOutput] = useState('');
  const [newHiddenWeight, setNewHiddenWeight] = useState<number>(1.0);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const initialStateRef = useRef<string>('');

  useEffect(() => {
    if (sections.length > 0) {
      setLoadedSections(sections);
    } else if (isOpen) {
      getAdminSections().then(setLoadedSections).catch(() => {});
    }
  }, [sections, isOpen]);

  const applyProgrammingDetails = (
    details: Partial<AdminProgrammingDetails> | null | undefined,
    fallbackTitle: string
  ) => {
    if (!details) return null;
    const rawLangs =
      details.allowed_languages && details.allowed_languages.length > 0
        ? details.allowed_languages
        : ['python', 'java'];
    const langs = rawLangs.filter((l) => l === 'python' || l === 'java');
    const safeLangs = langs.length > 0 ? langs : ['python', 'java'];
    const stmt = details.problem_statement || fallbackTitle || '';
    const bp = { ...DEFAULT_BOILERPLATES, ...(details.boilerplate_code || {}) };
    const tcs = Array.isArray(details.test_cases) ? details.test_cases : [];

    setProblemStatement(stmt);
    setConstraints(details.constraints || '');
    setInputFormat(details.input_format || '');
    setOutputFormat(details.output_format || '');
    setTimeLimit(Number(details.time_limit_seconds) || 2.0);
    setMemoryLimit(Number(details.memory_limit_mb) || 256);
    setAllowedLanguages(isEditMode ? rawLangs : safeLangs);
    setActiveBoilerplateLang(rawLangs[0] || 'python');
    setPreviewLang(safeLangs[0] || 'python');
    setBoilerplateCode(bp);
    setTestCases(tcs);

    return {
      problemStatement: stmt,
      constraints: details.constraints || '',
      inputFormat: details.input_format || '',
      outputFormat: details.output_format || '',
      timeLimit: Number(details.time_limit_seconds) || 2.0,
      memoryLimit: Number(details.memory_limit_mb) || 256,
      allowedLanguages: isEditMode ? rawLangs : safeLangs,
      boilerplateCode: bp,
      testCases: tcs,
    };
  };

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setNewSampleInput('');
    setNewSampleOutput('');
    setNewSampleExplanation('');
    setNewSampleWeight(1.0);
    setNewHiddenInput('');
    setNewHiddenOutput('');
    setNewHiddenWeight(1.0);

    if (question) {
      const existingAssessmentId =
        question.assessment_id ||
        (question.assigned_assessments && question.assigned_assessments.length > 0
          ? question.assigned_assessments[0].id
          : '') ||
        defaultAssessmentId ||
        '';
      const initSection = resolveDefaultCodingSection(sections, question.section_type);
      const initMarks = question.marks ?? 10;
      const initDifficulty = question.difficulty || 'MEDIUM';
      const initCategory = question.category || '';
      const initExplanation = question.explanation || '';
      const initActive = question.is_active ?? true;
      const initArchived = question.is_archived ?? false;

      setAssessmentId(existingAssessmentId);
      setPrompt(question.prompt || '');
      setSectionType(initSection);
      setDifficulty(initDifficulty);
      setMarks(initMarks);
      setCategory(initCategory);
      setExplanation(initExplanation);
      setIsActive(initActive);
      setIsArchived(initArchived);

      const inlineApplied = applyProgrammingDetails(question.programming_details, question.prompt || '');
      if (!inlineApplied) {
        setProblemStatement(question.prompt || '');
        setConstraints('');
        setInputFormat('');
        setOutputFormat('');
        setTimeLimit(2.0);
        setMemoryLimit(256);
        setAllowedLanguages(['python', 'java']);
        setActiveBoilerplateLang('python');
        setPreviewLang('python');
        setBoilerplateCode({ ...DEFAULT_BOILERPLATES });
        setTestCases([]);
      }

      const buildSnapshot = (codingSnap: ReturnType<typeof applyProgrammingDetails>) =>
        JSON.stringify({
          assessmentId: existingAssessmentId,
          prompt: question.prompt || '',
          sectionType: initSection,
          difficulty: initDifficulty,
          marks: initMarks,
          category: initCategory,
          explanation: initExplanation,
          isActive: initActive,
          isArchived: initArchived,
          problemStatement: codingSnap?.problemStatement ?? (question.prompt || ''),
          constraints: codingSnap?.constraints ?? '',
          inputFormat: codingSnap?.inputFormat ?? '',
          outputFormat: codingSnap?.outputFormat ?? '',
          timeLimit: codingSnap?.timeLimit ?? 2.0,
          memoryLimit: codingSnap?.memoryLimit ?? 256,
          allowedLanguages: codingSnap?.allowedLanguages ?? ['python', 'java'],
          boilerplateCode: codingSnap?.boilerplateCode ?? DEFAULT_BOILERPLATES,
          testCases: codingSnap?.testCases ?? [],
        });

      initialStateRef.current = buildSnapshot(inlineApplied);

      if (question.id) {
        let cancelled = false;
        setLoadingCodingDetails(true);
        fetchAdminQuestionCoding(question.id)
          .then((details) => {
            if (cancelled || !details) return;
            const fetchedSnap = applyProgrammingDetails(details, question.prompt || '');
            initialStateRef.current = buildSnapshot(fetchedSnap);
          })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setLoadingCodingDetails(false);
          });
        return () => {
          cancelled = true;
        };
      }
    } else {
      const initAssessment = defaultAssessmentId || '';
      const initSection = resolveDefaultCodingSection(sections);
      setAssessmentId(initAssessment);
      setPrompt('');
      setProblemStatement('');
      setSectionType(initSection);
      setDifficulty('MEDIUM');
      setMarks(10);
      setCategory('');
      setExplanation('');
      setIsActive(true);
      setIsArchived(false);
      setTimeLimit(2.0);
      setMemoryLimit(256);
      setAllowedLanguages(['python', 'java']);
      setActiveBoilerplateLang('python');
      setPreviewLang('python');
      setBoilerplateCode({ ...DEFAULT_BOILERPLATES });
      setTestCases([]);
      setLoadingCodingDetails(false);

      initialStateRef.current = JSON.stringify({
        assessmentId: initAssessment,
        prompt: '',
        sectionType: initSection,
        difficulty: 'MEDIUM',
        marks: 10,
        category: '',
        explanation: '',
        isActive: true,
        isArchived: false,
        problemStatement: '',
        constraints: '',
        inputFormat: '',
        outputFormat: '',
        timeLimit: 2.0,
        memoryLimit: 256,
        allowedLanguages: ['python', 'java'],
        boilerplateCode: DEFAULT_BOILERPLATES,
        testCases: [],
      });
    }
  }, [isOpen, question?.id, defaultAssessmentId, sections]);

  if (!isOpen) return null;

  const hasUnsavedChanges = () => {
    const currentSnapshot = JSON.stringify({
      assessmentId,
      prompt,
      sectionType,
      difficulty,
      marks,
      category,
      explanation,
      isActive,
      isArchived,
      problemStatement,
      constraints,
      inputFormat,
      outputFormat,
      timeLimit,
      memoryLimit,
      allowedLanguages,
      boilerplateCode,
      testCases,
    });
    return currentSnapshot !== initialStateRef.current;
  };

  const handleAttemptClose = () => {
    if (hasUnsavedChanges()) {
      const confirmDiscard = window.confirm(
        'You have unsaved changes in this Coding Problem editor. Discard your edits?'
      );
      if (!confirmDiscard) return;
    }
    onClose();
  };

  const insertStatementSnippet = (snippet: string) => {
    if (!statementRef.current) {
      setProblemStatement((prev) => `${prev}${snippet}`);
      return;
    }
    const start = statementRef.current.selectionStart ?? problemStatement.length;
    const end = statementRef.current.selectionEnd ?? problemStatement.length;
    const updated = problemStatement.slice(0, start) + snippet + problemStatement.slice(end);
    setProblemStatement(updated);
    setTimeout(() => {
      if (statementRef.current) {
        statementRef.current.focus();
        statementRef.current.selectionStart = start + snippet.length;
        statementRef.current.selectionEnd = start + snippet.length;
      }
    }, 20);
  };

  const toggleLanguage = (langKey: string, checked: boolean) => {
    if (checked) {
      const updated = allowedLanguages.includes(langKey)
        ? allowedLanguages
        : [...allowedLanguages, langKey];
      setAllowedLanguages(updated);
      setActiveBoilerplateLang(langKey);
      if (!boilerplateCode[langKey]) {
        setBoilerplateCode((prev) => ({
          ...prev,
          [langKey]: DEFAULT_BOILERPLATES[langKey] || '',
        }));
      }
    } else {
      const updated = allowedLanguages.filter((k) => k !== langKey);
      setAllowedLanguages(updated);
      if (activeBoilerplateLang === langKey && updated.length > 0) {
        setActiveBoilerplateLang(updated[0]);
      }
      if (previewLang === langKey && updated.length > 0) {
        setPreviewLang(updated[0]);
      }
    }
  };

  const handleAddSampleCase = () => {
    if (!newSampleOutput.trim()) {
      setErrorMsg('Sample test case expected output is required.');
      return;
    }
    setErrorMsg('');
    const nextCase: AdminProgrammingTestCase = {
      is_public: true,
      input_text: newSampleInput,
      expected_output: newSampleOutput,
      explanation: newSampleExplanation.trim(),
      marks_weightage: Math.max(0.1, Number(newSampleWeight) || 1.0),
      order: testCases.length + 1,
    };
    setTestCases((prev) => [...prev, nextCase]);
    setNewSampleInput('');
    setNewSampleOutput('');
    setNewSampleExplanation('');
    setNewSampleWeight(1.0);
  };

  const handleAddHiddenCase = () => {
    if (!newHiddenOutput.trim()) {
      setErrorMsg('Hidden test case expected output is required.');
      return;
    }
    setErrorMsg('');
    const nextCase: AdminProgrammingTestCase = {
      is_public: false,
      input_text: newHiddenInput,
      expected_output: newHiddenOutput,
      explanation: '',
      marks_weightage: Math.max(0.1, Number(newHiddenWeight) || 1.0),
      order: testCases.length + 1,
    };
    setTestCases((prev) => [...prev, nextCase]);
    setNewHiddenInput('');
    setNewHiddenOutput('');
    setNewHiddenWeight(1.0);
  };

  const handleUpdateTestCaseField = (
    targetIndex: number,
    field: keyof AdminProgrammingTestCase,
    value: string | number | boolean
  ) => {
    setTestCases((prev) =>
      prev.map((tc, i) => (i === targetIndex ? { ...tc, [field]: value } : tc))
    );
  };

  const handleMoveTestCase = (targetIndex: number, direction: -1 | 1) => {
    const isPublicGroup = testCases[targetIndex]?.is_public;
    const groupIndices = testCases
      .map((tc, idx) => ({ tc, idx }))
      .filter((entry) => entry.tc.is_public === isPublicGroup)
      .map((entry) => entry.idx);
    const posInGroup = groupIndices.indexOf(targetIndex);
    const swapPos = posInGroup + direction;
    if (posInGroup < 0 || swapPos < 0 || swapPos >= groupIndices.length) return;
    const swapIdx = groupIndices[swapPos];

    setTestCases((prev) => {
      const next = [...prev];
      const temp = next[targetIndex];
      next[targetIndex] = next[swapIdx];
      next[swapIdx] = temp;
      return next.map((tc, idx) => ({ ...tc, order: idx + 1 }));
    });
  };

  const handleRemoveTestCase = async (targetIndex: number) => {
    const target = testCases[targetIndex];
    if (target?.id && question?.id) {
      try {
        await deleteAdminProgrammingTestCase(question.id, target.id);
      } catch (err) {
        console.warn('Failed to delete persisted test case via API:', err);
      }
    }
    setTestCases((prev) => prev.filter((_, i) => i !== targetIndex));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!prompt.trim()) {
      setErrorMsg('Question title is required.');
      return;
    }
    if (!problemStatement.trim()) {
      setErrorMsg('Problem statement / description is required.');
      return;
    }
    if (allowedLanguages.length === 0) {
      setErrorMsg('Select at least one permitted programming language.');
      return;
    }
    if (Number(marks) <= 0) {
      setErrorMsg('Marks must be greater than 0.');
      return;
    }
    if (timeLimit < 0.5 || timeLimit > 30) {
      setErrorMsg('Time limit must be between 0.5 and 30 seconds.');
      return;
    }
    if (memoryLimit < 32 || memoryLimit > 1024) {
      setErrorMsg('Memory limit must be between 32 MB and 1024 MB.');
      return;
    }
    if (testCases.length === 0) {
      setErrorMsg('Add at least one evaluation test case (sample or hidden) for this coding question.');
      return;
    }
    const blankOutput = testCases.find((tc) => !String(tc.expected_output || '').trim());
    if (blankOutput) {
      setErrorMsg('Every test case must specify a non-empty expected output.');
      return;
    }

    const filteredBoilerplates: Record<string, string> = {};
    allowedLanguages.forEach((lang) => {
      filteredBoilerplates[lang] = boilerplateCode[lang] ?? DEFAULT_BOILERPLATES[lang] ?? '';
    });

    const normalizedCases = testCases.map((tc, idx) => ({
      ...(tc.id ? { id: tc.id } : {}),
      is_public: Boolean(tc.is_public),
      input_text: tc.input_text ?? '',
      expected_output: tc.expected_output ?? '',
      marks_weightage: Math.max(0.1, Number(tc.marks_weightage) || 1.0),
      explanation: tc.explanation || '',
      order: idx + 1,
    }));

    const payload: Partial<AdminQuestion> & {
      assessment_id?: string;
      pool_id?: string;
      question_type: 'CODING';
      coding_details: Record<string, unknown>;
    } = {
      ...(!isPoolScoped && assessmentId.trim() ? { assessment_id: assessmentId.trim() } : {}),
      ...(targetPool?.id ? { pool_id: targetPool.id } : {}),
      prompt: prompt.trim(),
      section_type: sectionType || 'CODING',
      question_type: 'CODING',
      assessment_type: 'CODING',
      difficulty,
      marks: Number(marks) || 10,
      category: category.trim(),
      option_a: 'N/A (Coding Question)',
      option_b: 'N/A (Coding Question)',
      option_c: 'N/A (Coding Question)',
      option_d: 'N/A (Coding Question)',
      correct_option: 'A',
      explanation: explanation.trim(),
      is_active: isActive,
      is_archived: isArchived,
      coding_details: {
        problem_statement: problemStatement.trim(),
        constraints: constraints.trim(),
        input_format: inputFormat.trim(),
        output_format: outputFormat.trim(),
        time_limit_seconds: Number(timeLimit),
        memory_limit_mb: Number(memoryLimit),
        allowed_languages: allowedLanguages,
        boilerplate_code: filteredBoilerplates,
        test_cases: normalizedCases,
      },
    };

    try {
      await onSave(payload);
    } catch (err: unknown) {
      setErrorMsg(formatApiError(err, 'Failed to save coding question.'));
    }
  };

  const sampleCasesWithIndex = testCases
    .map((tc, idx) => ({ tc, idx }))
    .filter((entry) => entry.tc.is_public);
  const hiddenCasesWithIndex = testCases
    .map((tc, idx) => ({ tc, idx }))
    .filter((entry) => !entry.tc.is_public);

  const selectedAssessmentObj = assessments.find((a) => String(a.id) === String(assessmentId));

  const cardStyle: React.CSSProperties = {
    backgroundColor: tokens.surfaceCard,
    borderRadius: '12px',
    border: `1px solid ${tokens.border}`,
    boxShadow: tokens.cardShadow,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 11px',
    borderRadius: '8px',
    border: `1px solid ${tokens.borderStrong}`,
    backgroundColor: tokens.inputBg,
    color: tokens.textPrimary,
    fontSize: '13px',
    fontWeight: 500,
    boxSizing: 'border-box',
    fontFamily: tokens.fontFamily,
  };

  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: tokens.cslBlueSoftText,
    margin: 0,
  };

  return (
    <div
      data-testid="coding-question-editor-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1100,
        padding: '18px',
        boxSizing: 'border-box',
        fontFamily: tokens.fontFamily,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleAttemptClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1240px',
          maxHeight: '90vh',
          backgroundColor: tokens.surfaceCard,
          color: tokens.textPrimary,
          borderRadius: '14px',
          boxShadow: tokens.modalShadow,
          border: `1px solid ${tokens.borderStrong}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: tokens.cslCharcoal,
            borderBottom: `2px solid ${tokens.cslYellow}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            color: '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: tokens.cslBlue,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 800,
                fontFamily: tokens.monoFamily,
              }}
            >
              &lt;/&gt;
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                  {isEditMode ? `Edit Coding Problem #${question!.id}` : 'Create Coding Problem'}
                </h2>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(245, 184, 61, 0.16)',
                    color: '#F5B83D',
                    border: '1px solid rgba(245, 184, 61, 0.4)',
                  }}
                >
                  Coding Problem Authoring
                </span>
                {targetPool && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(59, 130, 246, 0.25)',
                      color: '#93C5FD',
                    }}
                  >
                    Target Pool: {targetPool.name} ({targetPool.code})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setIsActive((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: `1px solid ${isActive ? '#22C55E' : '#64748B'}`,
                backgroundColor: isActive ? 'rgba(34, 197, 94, 0.16)' : 'rgba(100, 116, 139, 0.2)',
                color: isActive ? '#86EFAC' : '#CBD5E1',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isActive ? '● Active' : '○ Inactive'}
            </button>

            <button
              type="button"
              onClick={() => setIsArchived((prev) => !prev)}
              style={{
                padding: '6px 11px',
                borderRadius: '8px',
                border: `1px solid ${isArchived ? '#F59E0B' : '#475569'}`,
                backgroundColor: isArchived ? 'rgba(245, 158, 11, 0.18)' : 'transparent',
                color: isArchived ? '#FCD34D' : '#CBD5E1',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isArchived ? 'Archived' : 'Archive Status: Live'}
            </button>

            <button
              type="button"
              onClick={handleAttemptClose}
              aria-label="Close coding editor"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #475569',
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: '#CBD5E1',
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Validation Error Banner */}
        {errorMsg && (
          <div
            style={{
              margin: '12px 24px 0 24px',
              backgroundColor: tokens.dangerBg,
              border: `1px solid ${tokens.dangerBorder}`,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12.5px',
              color: tokens.dangerText,
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              style={{ background: 'none', border: 'none', color: tokens.dangerText, fontWeight: 700, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Workspace Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: tokens.pageBg,
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: '20px',
              alignItems: 'start',
            }}
          >
            {/* LEFT COLUMN: 5 AUTHORING SECTIONS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {loadingCodingDetails && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: tokens.cslBlueSoftBg,
                    border: `1px solid ${tokens.cslBlueSoftBorder}`,
                    color: tokens.cslBlueSoftText,
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                >
                  Loading persisted specifications and test cases...
                </div>
              )}

              {/* Section 1 — Basic Information */}
              <div style={cardStyle}>
                <h3 style={sectionHeadingStyle}>1. Basic Information</h3>

                <div>
                  <label
                    htmlFor="coding-question-title"
                    style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '5px' }}
                  >
                    Question Title *
                  </label>
                  <input
                    id="coding-question-title"
                    data-testid="coding-title-input"
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., Two Sum in Linear Time"
                    style={{ ...inputStyle, fontWeight: 700, fontSize: '14px' }}
                  />
                </div>

                {isPoolScoped && targetPool ? (
                  <div
                    style={{
                      padding: '9px 12px',
                      borderRadius: '8px',
                      backgroundColor: tokens.cslBlueSoftBg,
                      border: `1px solid ${tokens.cslBlueSoftBorder}`,
                      color: tokens.cslBlueSoftText,
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>Target Coding Pool: <strong>{targetPool.name}</strong> ({targetPool.code})</span>
                    <span>CODING Pool</span>
                  </div>
                ) : (
                  !isPoolScoped &&
                  assessments.length > 0 && (
                    <div>
                      <label
                        htmlFor="coding-target-assessment"
                        style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '5px' }}
                      >
                        Direct Assessment Link (Optional — leave unassigned for independent bank)
                      </label>
                      <select
                        id="coding-target-assessment"
                        value={assessmentId}
                        onChange={(e) => setAssessmentId(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="">Independent Bank Only</option>
                        {assessments.map((a) => (
                          <option key={a.id} value={a.id}>
                            [{a.code}] {a.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                  <div>
                    <label
                      htmlFor="coding-section-select"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Section *
                    </label>
                    <select
                      id="coding-section-select"
                      value={sectionType}
                      onChange={(e) => setSectionType(e.target.value)}
                      style={inputStyle}
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
                          <option value="CODING">Coding Fundamentals (CODING)</option>
                          <option value="APTITUDE">Aptitude (APTITUDE)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="coding-difficulty-select"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Difficulty *
                    </label>
                    <select
                      id="coding-difficulty-select"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                      style={inputStyle}
                    >
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="coding-marks-input"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Marks *
                    </label>
                    <input
                      id="coding-marks-input"
                      data-testid="coding-marks-input"
                      type="number"
                      min={1}
                      max={100}
                      value={marks}
                      onChange={(e) => setMarks(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="coding-category-input"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Category / Tag
                    </label>
                    <input
                      id="coding-category-input"
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Arrays, DP"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2 — Problem Statement */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={sectionHeadingStyle}>2. Problem Statement & Specifications</h3>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => insertStatementSnippet('**key term**')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: `1px solid ${tokens.borderStrong}`,
                        backgroundColor: tokens.surfaceElevated,
                        color: tokens.textSecondary,
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Bold
                    </button>
                    <button
                      type="button"
                      onClick={() => insertStatementSnippet('`O(n)`')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: `1px solid ${tokens.borderStrong}`,
                        backgroundColor: tokens.surfaceElevated,
                        color: tokens.textSecondary,
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Code
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="coding-problem-statement"
                    style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '5px' }}
                  >
                    Problem Statement (Markdown Supported) *
                  </label>
                  <textarea
                    ref={statementRef}
                    id="coding-problem-statement"
                    data-testid="coding-statement-textarea"
                    rows={5}
                    value={problemStatement}
                    onChange={(e) => setProblemStatement(e.target.value)}
                    placeholder="Describe requirements, edge cases, and expected behavior..."
                    style={{ ...inputStyle, lineHeight: 1.55, resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label
                      htmlFor="coding-input-format"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Input Format
                    </label>
                    <textarea
                      id="coding-input-format"
                      rows={2}
                      value={inputFormat}
                      onChange={(e) => setInputFormat(e.target.value)}
                      placeholder="First line contains N..."
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="coding-output-format"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Output Format
                    </label>
                    <textarea
                      id="coding-output-format"
                      rows={2}
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value)}
                      placeholder="Print a single integer..."
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="coding-constraints"
                    style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                  >
                    Constraints
                  </label>
                  <textarea
                    id="coding-constraints"
                    rows={2}
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="1 <= N <= 10^5&#10;-10^9 <= A[i] <= 10^9"
                    style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Section 3 & 5 — Language & Execution Configuration */}
              <div style={cardStyle}>
                <h3 style={sectionHeadingStyle}>3. Languages & Execution Limits</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label
                      htmlFor="coding-time-limit"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Time Limit (0.5s – 30s) *
                    </label>
                    <input
                      id="coding-time-limit"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="30"
                      value={timeLimit}
                      onChange={(e) => setTimeLimit(Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="coding-memory-limit"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}
                    >
                      Memory Limit (32MB – 1024MB) *
                    </label>
                    <input
                      id="coding-memory-limit"
                      type="number"
                      step="16"
                      min="32"
                      max="1024"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                    Permitted Judge0 Languages *
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {SUPPORTED_CODING_LANGUAGES.map((lang) => {
                      const checked = allowedLanguages.includes(lang.key);
                      return (
                        <label
                          key={lang.key}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 11px',
                            borderRadius: '8px',
                            border: `1px solid ${checked ? tokens.cslBlue : tokens.borderStrong}`,
                            backgroundColor: checked ? tokens.cslBlueSoftBg : tokens.surfaceElevated,
                            color: checked ? tokens.cslBlueSoftText : tokens.textSecondary,
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleLanguage(lang.key, e.target.checked)}
                          />
                          {lang.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {allowedLanguages.length > 0 && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary }}>
                        Starter Boilerplate ({activeBoilerplateLang.toUpperCase()})
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {allowedLanguages.map((langKey) => (
                          <button
                            key={langKey}
                            type="button"
                            onClick={() => setActiveBoilerplateLang(langKey)}
                            style={{
                              padding: '4px 9px',
                              borderRadius: '6px',
                              border: `1px solid ${activeBoilerplateLang === langKey ? tokens.cslBlue : tokens.borderStrong}`,
                              backgroundColor: activeBoilerplateLang === langKey ? tokens.cslBlue : tokens.surfaceElevated,
                              color: activeBoilerplateLang === langKey ? '#FFFFFF' : tokens.textSecondary,
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {langKey.toUpperCase()}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setBoilerplateCode((prev) => ({
                              ...prev,
                              [activeBoilerplateLang]: DEFAULT_BOILERPLATES[activeBoilerplateLang] || '',
                            }))
                          }
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.surfaceElevated,
                            color: tokens.textSecondary,
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Reset Default
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={5}
                      spellCheck={false}
                      value={boilerplateCode[activeBoilerplateLang] ?? ''}
                      onChange={(e) =>
                        setBoilerplateCode((prev) => ({
                          ...prev,
                          [activeBoilerplateLang]: e.target.value,
                        }))
                      }
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #334155',
                        backgroundColor: '#0F172A',
                        color: '#E2E8F0',
                        fontFamily: tokens.monoFamily,
                        fontSize: '12px',
                        lineHeight: 1.5,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Section 4A — Public Sample Test Cases */}
              <div
                style={{
                  ...cardStyle,
                  border: `1px solid ${tokens.successBorder}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ ...sectionHeadingStyle, color: tokens.successText }}>
                      4A. Public Sample Test Cases ({sampleCasesWithIndex.length})
                    </h3>
                    <div style={{ fontSize: '11.5px', color: tokens.textSecondary, marginTop: '2px' }}>
                      Shown to candidates in the playground.
                    </div>
                  </div>
                </div>

                {sampleCasesWithIndex.map(({ tc, idx }, visibleIdx) => (
                  <div
                    key={tc.id || `sample-${idx}`}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: `1px solid ${tokens.successBorder}`,
                      backgroundColor: tokens.successBg,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: tokens.successText }}>
                        Sample Case #{visibleIdx + 1}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleMoveTestCase(idx, -1)}
                          disabled={visibleIdx === 0}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '5px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.surfaceCard,
                            color: tokens.textSecondary,
                            fontSize: '11px',
                            cursor: visibleIdx === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveTestCase(idx, 1)}
                          disabled={visibleIdx === sampleCasesWithIndex.length - 1}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '5px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.surfaceCard,
                            color: tokens.textSecondary,
                            fontSize: '11px',
                            cursor: visibleIdx === sampleCasesWithIndex.length - 1 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          ↓
                        </button>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: tokens.textSecondary }}>
                          Weight:
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={tc.marks_weightage}
                            onChange={(e) =>
                              handleUpdateTestCaseField(idx, 'marks_weightage', Number(e.target.value) || 1.0)
                            }
                            style={{
                              width: '52px',
                              marginLeft: '4px',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: `1px solid ${tokens.borderStrong}`,
                              backgroundColor: tokens.inputBg,
                              color: tokens.textPrimary,
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveTestCase(idx)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${tokens.dangerBorder}`,
                            backgroundColor: tokens.dangerBg,
                            color: tokens.dangerText,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <textarea
                        rows={2}
                        value={tc.input_text}
                        onChange={(e) => handleUpdateTestCaseField(idx, 'input_text', e.target.value)}
                        placeholder="stdin"
                        style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '11.5px' }}
                      />
                      <textarea
                        rows={2}
                        value={tc.expected_output}
                        onChange={(e) => handleUpdateTestCaseField(idx, 'expected_output', e.target.value)}
                        placeholder="stdout *"
                        style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '11.5px' }}
                      />
                    </div>
                    <input
                      type="text"
                      value={tc.explanation || ''}
                      onChange={(e) => handleUpdateTestCaseField(idx, 'explanation', e.target.value)}
                      placeholder="Optional sample explanation..."
                      style={{ ...inputStyle, fontSize: '11.5px' }}
                    />
                  </div>
                ))}

                {/* Add New Sample Case */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: `1px dashed ${tokens.successBorder}`,
                    backgroundColor: tokens.surfaceElevated,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <textarea
                      data-testid="sample-tc-input"
                      rows={2}
                      value={newSampleInput}
                      onChange={(e) => setNewSampleInput(e.target.value)}
                      placeholder="Sample Input (stdin)..."
                      style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '12px' }}
                    />
                    <textarea
                      data-testid="sample-tc-output"
                      rows={2}
                      value={newSampleOutput}
                      onChange={(e) => setNewSampleOutput(e.target.value)}
                      placeholder="Sample Expected Output (stdout) *..."
                      style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '12px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={newSampleExplanation}
                      onChange={(e) => setNewSampleExplanation(e.target.value)}
                      placeholder="Sample explanation (optional)"
                      style={{ ...inputStyle, flex: 1, minWidth: '160px', fontSize: '12px' }}
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={newSampleWeight}
                      onChange={(e) => setNewSampleWeight(Number(e.target.value) || 1.0)}
                      title="Marks Weight"
                      style={{ ...inputStyle, width: '68px', fontSize: '12px' }}
                    />
                    <button
                      type="button"
                      data-testid="add-sample-tc-btn"
                      onClick={handleAddSampleCase}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '7px',
                        border: 'none',
                        backgroundColor: '#16A34A',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Add Sample Case
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 4B — Hidden Evaluation Test Cases */}
              <div
                style={{
                  ...cardStyle,
                  border: `1px solid ${tokens.cslYellow}`,
                }}
              >
                <div>
                  <h3 style={{ ...sectionHeadingStyle, color: tokens.cslYellowSoftText }}>
                    4B. Hidden Grading Test Cases ({hiddenCasesWithIndex.length})
                  </h3>
                  <div style={{ fontSize: '11.5px', color: tokens.textSecondary, marginTop: '2px' }}>
                    Withheld from candidate endpoints; used strictly for automated evaluation.
                  </div>
                </div>

                {hiddenCasesWithIndex.map(({ tc, idx }, hIdx) => (
                  <div
                    key={tc.id || `hidden-${idx}`}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: `1px solid ${tokens.borderStrong}`,
                      backgroundColor: tokens.cslYellowSoftBg,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: tokens.cslYellowSoftText }}>
                        🔒 Hidden Case #{hIdx + 1}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleMoveTestCase(idx, -1)}
                          disabled={hIdx === 0}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '5px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.surfaceCard,
                            color: tokens.textSecondary,
                            fontSize: '11px',
                            cursor: hIdx === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveTestCase(idx, 1)}
                          disabled={hIdx === hiddenCasesWithIndex.length - 1}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '5px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.surfaceCard,
                            color: tokens.textSecondary,
                            fontSize: '11px',
                            cursor: hIdx === hiddenCasesWithIndex.length - 1 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          ↓
                        </button>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: tokens.textSecondary }}>
                          Weight:
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={tc.marks_weightage}
                            onChange={(e) =>
                              handleUpdateTestCaseField(idx, 'marks_weightage', Number(e.target.value) || 1.0)
                            }
                            style={{
                              width: '52px',
                              marginLeft: '4px',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: `1px solid ${tokens.borderStrong}`,
                              backgroundColor: tokens.inputBg,
                              color: tokens.textPrimary,
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveTestCase(idx)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${tokens.dangerBorder}`,
                            backgroundColor: tokens.dangerBg,
                            color: tokens.dangerText,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <textarea
                        rows={2}
                        value={tc.input_text}
                        onChange={(e) => handleUpdateTestCaseField(idx, 'input_text', e.target.value)}
                        style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '11.5px' }}
                      />
                      <textarea
                        rows={2}
                        value={tc.expected_output}
                        onChange={(e) => handleUpdateTestCaseField(idx, 'expected_output', e.target.value)}
                        style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '11.5px' }}
                      />
                    </div>
                  </div>
                ))}

                {/* Add New Hidden Case */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: `1px dashed ${tokens.cslYellow}`,
                    backgroundColor: tokens.surfaceElevated,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <textarea
                      data-testid="hidden-tc-input"
                      rows={2}
                      value={newHiddenInput}
                      onChange={(e) => setNewHiddenInput(e.target.value)}
                      placeholder="Hidden Input (stdin)..."
                      style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '12px' }}
                    />
                    <textarea
                      data-testid="hidden-tc-output"
                      rows={2}
                      value={newHiddenOutput}
                      onChange={(e) => setNewHiddenOutput(e.target.value)}
                      placeholder="Hidden Expected Output (stdout) *..."
                      style={{ ...inputStyle, fontFamily: tokens.monoFamily, fontSize: '12px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary }}>
                      Weight:
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={newHiddenWeight}
                        onChange={(e) => setNewHiddenWeight(Number(e.target.value) || 1.0)}
                        style={{ ...inputStyle, width: '64px', marginLeft: '6px', fontSize: '12px' }}
                      />
                    </label>
                    <button
                      type="button"
                      data-testid="add-hidden-tc-btn"
                      onClick={handleAddHiddenCase}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '7px',
                        border: 'none',
                        backgroundColor: '#D97706',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Add Hidden Case
                    </button>
                  </div>
                </div>
              </div>

              {/* Admin Editorial */}
              <div style={cardStyle}>
                <label
                  htmlFor="coding-editorial-notes"
                  style={{ fontSize: '12px', fontWeight: 700, color: tokens.textSecondary }}
                >
                  Admin Editorial / Approach Notes (Optional, Internal)
                </label>
                <textarea
                  id="coding-editorial-notes"
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Optional complexity / grading notes for reviewers..."
                  style={inputStyle}
                />
              </div>
            </div>

            {/* RIGHT COLUMN: CANDIDATE-FACING PREVIEW */}
            <div style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={cardStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1px solid ${tokens.border}`,
                    paddingBottom: '10px',
                  }}
                >
                  <span style={sectionHeadingStyle}>6. Candidate-Facing Problem Preview</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary }}>
                    {marks} pts • {difficulty}
                  </span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                  {prompt.trim() || 'Untitled Coding Problem'}
                </h3>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', backgroundColor: tokens.surfaceElevated, color: tokens.textSecondary }}>
                    Time: {timeLimit}s
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', backgroundColor: tokens.surfaceElevated, color: tokens.textSecondary }}>
                    Memory: {memoryLimit} MB
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', backgroundColor: tokens.cslBlueSoftBg, color: tokens.cslBlueSoftText }}>
                    {allowedLanguages.join(', ').toUpperCase() || 'None'}
                  </span>
                  {selectedAssessmentObj && !isPoolScoped && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', backgroundColor: tokens.codingBg, color: tokens.codingText }}>
                      {selectedAssessmentObj.code}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '13px', color: tokens.textPrimary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {problemStatement.trim() || 'Enter the problem statement to inspect the candidate view.'}
                </div>

                {(inputFormat.trim() || outputFormat.trim() || constraints.trim()) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                    {inputFormat.trim() && (
                      <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: tokens.surfaceElevated, border: `1px solid ${tokens.border}` }}>
                        <strong>Input Format:</strong>
                        <div style={{ color: tokens.textSecondary, whiteSpace: 'pre-wrap', marginTop: '2px' }}>{inputFormat}</div>
                      </div>
                    )}
                    {outputFormat.trim() && (
                      <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: tokens.surfaceElevated, border: `1px solid ${tokens.border}` }}>
                        <strong>Output Format:</strong>
                        <div style={{ color: tokens.textSecondary, whiteSpace: 'pre-wrap', marginTop: '2px' }}>{outputFormat}</div>
                      </div>
                    )}
                    {constraints.trim() && (
                      <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: tokens.surfaceElevated, border: `1px solid ${tokens.border}` }}>
                        <strong>Constraints:</strong>
                        <div style={{ color: tokens.textSecondary, fontFamily: tokens.monoFamily, whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                          {constraints}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: tokens.successText, marginBottom: '6px' }}>
                    Visible Sample Cases ({sampleCasesWithIndex.length})
                  </div>
                  {sampleCasesWithIndex.length === 0 ? (
                    <div style={{ fontSize: '12px', color: tokens.textMuted, fontStyle: 'italic' }}>
                      No public sample cases added yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {sampleCasesWithIndex.slice(0, 3).map(({ tc, idx }, i) => (
                        <div
                          key={tc.id || `prev-sample-${idx}`}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: tokens.successBg,
                            border: `1px solid ${tokens.successBorder}`,
                            fontFamily: tokens.monoFamily,
                            fontSize: '11.5px',
                            color: tokens.textPrimary,
                          }}
                        >
                          <div><strong>Sample {i + 1} In:</strong> {tc.input_text || '(empty)'}</div>
                          <div><strong>Out:</strong> {tc.expected_output}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: tokens.cslYellowSoftBg,
                    color: tokens.cslYellowSoftText,
                    fontSize: '11.5px',
                    fontWeight: 700,
                  }}
                >
                  🔒 {hiddenCasesWithIndex.length} Hidden Grading Case(s) — Excluded from student view
                </div>

                {allowedLanguages.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      {allowedLanguages.map((langKey) => (
                        <button
                          key={langKey}
                          type="button"
                          onClick={() => setPreviewLang(langKey)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: previewLang === langKey ? tokens.cslBlue : tokens.surfaceElevated,
                            color: previewLang === langKey ? '#FFFFFF' : tokens.textSecondary,
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {langKey.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: '10px',
                        borderRadius: '8px',
                        backgroundColor: isDark ? '#020617' : '#0F172A',
                        color: '#E2E8F0',
                        fontFamily: tokens.monoFamily,
                        fontSize: '11.5px',
                        maxHeight: '140px',
                        overflow: 'auto',
                      }}
                    >
                      {boilerplateCode[previewLang] || DEFAULT_BOILERPLATES[previewLang] || ''}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '14px 24px',
              backgroundColor: tokens.surfaceCard,
              borderTop: `1px solid ${tokens.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: '12px', color: testCases.length === 0 ? tokens.dangerText : tokens.textSecondary, fontWeight: 600 }}>
              {testCases.length === 0
                ? 'Validation: At least 1 evaluation test case required'
                : `${sampleCasesWithIndex.length} Public Sample • ${hiddenCasesWithIndex.length} Hidden Grading Cases`}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handleAttemptClose}
                disabled={saving}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.surfaceElevated,
                  color: tokens.textPrimary,
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="coding-save-btn"
                disabled={saving}
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: tokens.cslBlue,
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving
                  ? 'Saving...'
                  : isEditMode
                  ? 'Save Coding Problem'
                  : 'Create Coding Problem'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
