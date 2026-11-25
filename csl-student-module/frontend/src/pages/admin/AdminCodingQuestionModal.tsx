import React, { useState, useEffect, useRef } from 'react';
import {
  type AdminQuestion,
  type AdminAssessment,
  type AdminSection,
  type AdminProgrammingDetails,
  type AdminProgrammingTestCase,
  getAdminSections,
  fetchAdminQuestionCoding,
  deleteAdminProgrammingTestCase,
} from '../../api/admin';
import { formatApiError } from '../../utils/errorFormatter';

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
}

const EMPTY_ASSESSMENTS: AdminAssessment[] = [];
const EMPTY_SECTIONS: AdminSection[] = [];

const SUPPORTED_CODING_LANGUAGES: { key: string; label: string; ext: string }[] = [
  { key: 'python', label: 'Python 3', ext: 'py' },
  { key: 'java', label: 'Java', ext: 'java' },
  { key: 'c', label: 'C', ext: 'c' },
  { key: 'cpp', label: 'C++', ext: 'cpp' },
  { key: 'javascript', label: 'JavaScript', ext: 'js' },
];

const DEFAULT_BOILERPLATES: Record<string, string> = {
  python: "# Write your Python solution here\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()\n",
  java: "import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n    }\n}\n",
  c: "#include <stdio.h>\n\nint main() {\n    return 0;\n}\n",
  cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n",
  javascript: "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim();\n",
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
}: AdminCodingQuestionModalProps) {
  const isEditMode = Boolean(question && question.id);

  // Core metadata state
  const [assessmentId, setAssessmentId] = useState<string>('');
  const [prompt, setPrompt] = useState(''); // Problem Title
  const [problemStatement, setProblemStatement] = useState(''); // Full Markdown/Text Problem Statement
  const [sectionType, setSectionType] = useState<string>('CODING');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [marks, setMarks] = useState<number>(10);
  const [category, setCategory] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isArchived, setIsArchived] = useState<boolean>(false);

  const [loadedSections, setLoadedSections] = useState<AdminSection[]>(sections);

  // Coding execution & specification fields
  const [timeLimit, setTimeLimit] = useState<number>(2.0);
  const [memoryLimit, setMemoryLimit] = useState<number>(256);
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(['python', 'java']);
  const [activeBoilerplateLang, setActiveBoilerplateLang] = useState<string>('python');
  const [boilerplateCode, setBoilerplateCode] = useState<Record<string, string>>({ ...DEFAULT_BOILERPLATES });
  const [inputFormat, setInputFormat] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<string>('');
  const [constraints, setConstraints] = useState<string>('');

  // Sample (is_public = true) & Hidden (is_public = false) Test Cases
  const [testCases, setTestCases] = useState<AdminProgrammingTestCase[]>([]);
  const [loadingCodingDetails, setLoadingCodingDetails] = useState<boolean>(false);
  const [previewLang, setPreviewLang] = useState<string>('python');

  // New Sample Test Case draft state
  const [newSampleInput, setNewSampleInput] = useState('');
  const [newSampleOutput, setNewSampleOutput] = useState('');
  const [newSampleExplanation, setNewSampleExplanation] = useState('');
  const [newSampleWeight, setNewSampleWeight] = useState<number>(1.0);

  // New Hidden Test Case draft state
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
    const langs =
      details.allowed_languages && details.allowed_languages.length > 0
        ? details.allowed_languages
        : ['python', 'java'];
    const stmt = details.problem_statement || fallbackTitle || '';
    const bp = { ...DEFAULT_BOILERPLATES, ...(details.boilerplate_code || {}) };
    const tcs = Array.isArray(details.test_cases) ? details.test_cases : [];

    setProblemStatement(stmt);
    setConstraints(details.constraints || '');
    setInputFormat(details.input_format || '');
    setOutputFormat(details.output_format || '');
    setTimeLimit(Number(details.time_limit_seconds) || 2.0);
    setMemoryLimit(Number(details.memory_limit_mb) || 256);
    setAllowedLanguages(langs);
    setActiveBoilerplateLang(langs[0] || 'python');
    setPreviewLang(langs[0] || 'python');
    setBoilerplateCode(bp);
    setTestCases(tcs);

    return {
      problemStatement: stmt,
      constraints: details.constraints || '',
      inputFormat: details.input_format || '',
      outputFormat: details.output_format || '',
      timeLimit: Number(details.time_limit_seconds) || 2.0,
      memoryLimit: Number(details.memory_limit_mb) || 256,
      allowedLanguages: langs,
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
      setErrorMsg('Coding Question Title is required.');
      return;
    }
    if (!problemStatement.trim()) {
      setErrorMsg('Problem Statement / Description is required.');
      return;
    }
    if (allowedLanguages.length === 0) {
      setErrorMsg('Select at least one allowed programming language.');
      return;
    }
    if (Number(marks) <= 0) {
      setErrorMsg('Marks must be greater than 0.');
      return;
    }
    if (testCases.length === 0) {
      setErrorMsg('Add at least one evaluation test case (sample or hidden) for this coding question.');
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
      marks_weightage: Number(tc.marks_weightage) || 1.0,
      explanation: tc.explanation || '',
      order: idx + 1,
    }));

    const payload: Partial<AdminQuestion> & {
      assessment_id?: string;
      question_type: 'CODING';
      coding_details: Record<string, unknown>;
    } = {
      ...(assessmentId.trim() ? { assessment_id: assessmentId.trim() } : {}),
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
        time_limit_seconds: Math.max(0.5, Number(timeLimit) || 2.0),
        memory_limit_mb: Math.max(32, Number(memoryLimit) || 256),
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

  return (
    <div
      data-testid="coding-question-editor-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1100,
        padding: '20px',
        boxSizing: 'border-box',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleAttemptClose();
      }}
    >
      <div
        style={{
          width: '96vw',
          maxWidth: '1440px',
          height: '92vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '18px',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.45)',
          border: '1.5px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ─── HEADER BAR (DISTINCT CODING STUDIO THEME) ───────────────────────── */}
        <div
          style={{
            padding: '16px 26px',
            backgroundColor: '#0F172A',
            borderBottom: '2px solid #0EA5E9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            color: '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#0EA5E9',
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: 900,
                fontFamily: 'monospace',
              }}
            >
              &lt;/&gt;
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                  {isEditMode ? `Edit Coding Problem #${question!.id}` : 'Create Coding Problem'}
                </h2>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '3px 9px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(14, 165, 233, 0.2)',
                    color: '#38BDF8',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                  }}
                >
                  Dedicated Coding Studio
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: '2px 0 0 0' }}>
                Configure problem title, full statement, language templates, constraints, public samples, and hidden grading test cases.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setIsActive((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 13px',
                borderRadius: '9999px',
                border: `1px solid ${isActive ? '#22C55E' : '#64748B'}`,
                backgroundColor: isActive ? 'rgba(34, 197, 94, 0.16)' : 'rgba(100, 116, 139, 0.2)',
                color: isActive ? '#86EFAC' : '#CBD5E1',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: isActive ? '#4ADE80' : '#94A3B8',
                }}
              />
              {isActive ? 'Active' : 'Inactive'}
            </button>

            <button
              type="button"
              onClick={() => setIsArchived((prev) => !prev)}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                border: `1px solid ${isArchived ? '#F59E0B' : '#475569'}`,
                backgroundColor: isArchived ? 'rgba(245, 158, 11, 0.18)' : 'transparent',
                color: isArchived ? '#FCD34D' : '#94A3B8',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isArchived ? 'Archived' : 'Not Archived'}
            </button>

            <button
              type="button"
              onClick={handleAttemptClose}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                border: '1px solid #475569',
                backgroundColor: '#1E293B',
                color: '#CBD5E1',
                fontSize: '16px',
                cursor: 'pointer',
              }}
              aria-label="Close coding editor"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ─── ERROR BANNER ───────────────────────────────────────── */}
        {errorMsg && (
          <div
            style={{
              margin: '12px 26px 0 26px',
              backgroundColor: '#FEF2F2',
              border: '1.5px solid #FCA5A5',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              color: '#991B1B',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <span>⚠️ {errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              style={{ background: 'none', border: 'none', color: '#991B1B', fontWeight: 800, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ─── MAIN WORKSPACE BODY ────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '22px 26px',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.55fr) minmax(350px, 1fr)',
              gap: '22px',
              alignItems: 'start',
            }}
          >
            {/* ─── LEFT COLUMN: DEDICATED CODING AUTHORING FORM ────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {loadingCodingDetails && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    color: '#1D4ED8',
                    fontSize: '12.5px',
                    fontWeight: 700,
                  }}
                >
                  Loading persisted programming specifications and test cases...
                </div>
              )}

              {/* 1. Problem Title & Core Metadata */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #CBD5E1',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <label
                    htmlFor="coding-question-title"
                    style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}
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
                    style={{
                      width: '100%',
                      padding: '10px 13px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#0F172A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
                  <div>
                    <label
                      htmlFor="coding-section-select"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Section *
                    </label>
                    <select
                      id="coding-section-select"
                      value={sectionType}
                      onChange={(e) => setSectionType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        backgroundColor: '#FFFFFF',
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
                          <option value="CODING">Coding Fundamentals (CODING)</option>
                          <option value="APTITUDE">Aptitude (APTITUDE)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="coding-difficulty-select"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Difficulty *
                    </label>
                    <select
                      id="coding-difficulty-select"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="coding-marks-input"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
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
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="coding-category-input"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Topic / Category
                    </label>
                    <input
                      id="coding-category-input"
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g., Arrays, DP"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {!isPoolScoped && assessments.length > 0 && (
                  <div>
                    <label
                      htmlFor="coding-target-assessment"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Assign to Assessment Directly (Optional — Independent Bank if left empty)
                    </label>
                    <select
                      id="coding-target-assessment"
                      value={assessmentId}
                      onChange={(e) => setAssessmentId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <option value="">Independent Bank Only (Assign via Question Pools)</option>
                      {assessments.map((a) => (
                        <option key={a.id} value={a.id}>
                          [{a.code}] {a.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 2. Problem Statement + I/O Formats + Constraints */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #CBD5E1',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <label
                    htmlFor="coding-problem-statement"
                    style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}
                  >
                    Problem Statement / Description *
                  </label>
                  <textarea
                    id="coding-problem-statement"
                    data-testid="coding-statement-textarea"
                    rows={5}
                    value={problemStatement}
                    onChange={(e) => setProblemStatement(e.target.value)}
                    placeholder="Describe the problem requirements, expected behavior, edge cases, and examples..."
                    style={{
                      width: '100%',
                      padding: '10px 13px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '13px',
                      lineHeight: 1.55,
                      color: '#0F172A',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label
                      htmlFor="coding-input-format"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Input Format
                    </label>
                    <textarea
                      id="coding-input-format"
                      rows={2}
                      value={inputFormat}
                      onChange={(e) => setInputFormat(e.target.value)}
                      placeholder="First line contains integer N, followed by N integers..."
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="coding-output-format"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Output Format
                    </label>
                    <textarea
                      id="coding-output-format"
                      rows={2}
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value)}
                      placeholder="Print a single integer representing..."
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="coding-constraints"
                    style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                  >
                    Constraints
                  </label>
                  <textarea
                    id="coding-constraints"
                    rows={2}
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="1 <= N <= 10^5&#10;-10^9 <= A[i] <= 10^9"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12.5px',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* 3. Execution Limits, Allowed Languages & Starter Boilerplate */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #CBD5E1',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label
                      htmlFor="coding-time-limit"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Time Limit (Seconds) *
                    </label>
                    <input
                      id="coding-time-limit"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="30"
                      value={timeLimit}
                      onChange={(e) => setTimeLimit(Number(e.target.value) || 2.0)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="coding-memory-limit"
                      style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}
                    >
                      Memory Limit (MB) *
                    </label>
                    <input
                      id="coding-memory-limit"
                      type="number"
                      step="16"
                      min="32"
                      max="1024"
                      value={memoryLimit}
                      onChange={(e) => setMemoryLimit(Number(e.target.value) || 256)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Allowed Programming Languages *
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
                            border: `1.5px solid ${checked ? '#0EA5E9' : '#CBD5E1'}`,
                            backgroundColor: checked ? '#F0F9FF' : '#FFFFFF',
                            color: checked ? '#0369A1' : '#475569',
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
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                        Starter Code Template ({activeBoilerplateLang.toUpperCase()})
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {allowedLanguages.map((langKey) => (
                          <button
                            key={langKey}
                            type="button"
                            onClick={() => setActiveBoilerplateLang(langKey)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: `1px solid ${activeBoilerplateLang === langKey ? '#0EA5E9' : '#CBD5E1'}`,
                              backgroundColor: activeBoilerplateLang === langKey ? '#0F172A' : '#FFFFFF',
                              color: activeBoilerplateLang === langKey ? '#38BDF8' : '#475569',
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
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#F8FAFC',
                            color: '#475569',
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
                        fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, monospace",
                        fontSize: '12px',
                        lineHeight: 1.5,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* 4A. Sample Test Cases (is_public = true) */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1.5px solid #BBF7D0',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#166534' }}>
                      Sample Test Cases — Visible to Students ({sampleCasesWithIndex.length})
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#475569' }}>
                      Candidates see inputs, outputs, and explanations in the playground to validate logic.
                    </div>
                  </div>
                </div>

                {sampleCasesWithIndex.map(({ tc, idx }, visibleIdx) => (
                  <div
                    key={tc.id || `sample-${idx}`}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #DCFCE7',
                      backgroundColor: '#F0FDF4',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#166534' }}>
                        Sample Case #{visibleIdx + 1}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
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
                              width: '56px',
                              marginLeft: '5px',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveTestCase(idx)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #FECACA',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
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
                      <div>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>Input (stdin)</span>
                        <textarea
                          rows={2}
                          value={tc.input_text}
                          onChange={(e) => handleUpdateTestCaseField(idx, 'input_text', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            fontFamily: 'monospace',
                            fontSize: '11.5px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>Expected Output (stdout)</span>
                        <textarea
                          rows={2}
                          value={tc.expected_output}
                          onChange={(e) => handleUpdateTestCaseField(idx, 'expected_output', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            fontFamily: 'monospace',
                            fontSize: '11.5px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={tc.explanation || ''}
                      onChange={(e) => handleUpdateTestCaseField(idx, 'explanation', e.target.value)}
                      placeholder="Optional sample walkthrough shown to student..."
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '11.5px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}

                {/* Add New Sample Case */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px dashed #86EFAC',
                    backgroundColor: '#F8FAFC',
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
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <textarea
                      data-testid="sample-tc-output"
                      rows={2}
                      value={newSampleOutput}
                      onChange={(e) => setNewSampleOutput(e.target.value)}
                      placeholder="Sample Expected Output (stdout) *..."
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={newSampleExplanation}
                      onChange={(e) => setNewSampleExplanation(e.target.value)}
                      placeholder="Sample explanation (optional)"
                      style={{
                        flex: 1,
                        minWidth: '180px',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                      }}
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={newSampleWeight}
                      onChange={(e) => setNewSampleWeight(Number(e.target.value) || 1.0)}
                      title="Marks Weight"
                      style={{
                        width: '72px',
                        padding: '7px 8px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                      }}
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
                      + Add Sample Test Case
                    </button>
                  </div>
                </div>
              </div>

              {/* 4B. Hidden Evaluation Test Cases (is_public = false) */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1.5px solid #FDE68A',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#92400E' }}>
                    Hidden Evaluation Test Cases — Automated Grading Only ({hiddenCasesWithIndex.length})
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#475569' }}>
                    Hidden cases are strictly withheld from candidate attempt endpoints and evaluated only on server-side execution.
                  </div>
                </div>

                {hiddenCasesWithIndex.map(({ tc, idx }, hIdx) => (
                  <div
                    key={tc.id || `hidden-${idx}`}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #FDE68A',
                      backgroundColor: '#FFFBEB',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#92400E' }}>
                        🔒 Hidden Case #{hIdx + 1}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
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
                              width: '56px',
                              marginLeft: '5px',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveTestCase(idx)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #FECACA',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
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
                      <div>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>Hidden Input (stdin)</span>
                        <textarea
                          rows={2}
                          value={tc.input_text}
                          onChange={(e) => handleUpdateTestCaseField(idx, 'input_text', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            fontFamily: 'monospace',
                            fontSize: '11.5px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>Hidden Expected Output (stdout)</span>
                        <textarea
                          rows={2}
                          value={tc.expected_output}
                          onChange={(e) => handleUpdateTestCaseField(idx, 'expected_output', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            fontFamily: 'monospace',
                            fontSize: '11.5px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add New Hidden Case */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px dashed #FBBF24',
                    backgroundColor: '#F8FAFC',
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
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <textarea
                      data-testid="hidden-tc-output"
                      rows={2}
                      value={newHiddenOutput}
                      onChange={(e) => setNewHiddenOutput(e.target.value)}
                      placeholder="Hidden Expected Output (stdout) *..."
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569' }}>
                      Weight:
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={newHiddenWeight}
                        onChange={(e) => setNewHiddenWeight(Number(e.target.value) || 1.0)}
                        style={{
                          width: '68px',
                          marginLeft: '6px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                        }}
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
                      + Add Hidden Test Case
                    </button>
                  </div>
                </div>
              </div>

              {/* 5. Optional Editorial / Grading Notes */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #CBD5E1',
                  padding: '16px 20px',
                }}
              >
                <label
                  htmlFor="coding-editorial-notes"
                  style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}
                >
                  Admin Editorial / Solution Approach Notes (Optional)
                </label>
                <textarea
                  id="coding-editorial-notes"
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Optional reference complexity & algorithm notes for reviewers..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* ─── RIGHT COLUMN: LIVE STUDENT PLAYGROUND PREVIEW ───── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: 0 }}>
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #CBD5E1',
                  padding: '18px 20px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #E2E8F0',
                    paddingBottom: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                    Student Coding Playground Preview
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
                    {marks} pts • {difficulty}
                  </span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
                  {prompt.trim() || 'Untitled Coding Problem'}
                </h3>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#F1F5F9', color: '#334155' }}>
                    Time: {timeLimit}s
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#F1F5F9', color: '#334155' }}>
                    Memory: {memoryLimit} MB
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#E0F2FE', color: '#0369A1' }}>
                    {allowedLanguages.join(', ').toUpperCase() || 'No languages selected'}
                  </span>
                  {selectedAssessmentObj && (
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#EEF2FF', color: '#4338CA' }}>
                      {selectedAssessmentObj.code}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                  {problemStatement.trim() || 'Enter the problem statement to see how candidates read this prompt.'}
                </div>

                {(inputFormat.trim() || outputFormat.trim() || constraints.trim()) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', fontSize: '11.5px' }}>
                    {inputFormat.trim() && (
                      <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <strong style={{ color: '#0F172A' }}>Input Format:</strong>
                        <div style={{ color: '#475569', whiteSpace: 'pre-wrap', marginTop: '2px' }}>{inputFormat}</div>
                      </div>
                    )}
                    {outputFormat.trim() && (
                      <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <strong style={{ color: '#0F172A' }}>Output Format:</strong>
                        <div style={{ color: '#475569', whiteSpace: 'pre-wrap', marginTop: '2px' }}>{outputFormat}</div>
                      </div>
                    )}
                    {constraints.trim() && (
                      <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <strong style={{ color: '#0F172A' }}>Constraints:</strong>
                        <div style={{ color: '#475569', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginTop: '2px' }}>{constraints}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sample Cases visible in student preview (Hidden cases intentionally omitted) */}
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#166534', marginBottom: '6px' }}>
                  Visible Sample Cases ({sampleCasesWithIndex.length})
                </div>
                {sampleCasesWithIndex.length === 0 ? (
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic', marginBottom: '10px' }}>
                    No public sample cases added yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                    {sampleCasesWithIndex.slice(0, 2).map(({ tc, idx }, i) => (
                      <div
                        key={tc.id || `prev-sample-${idx}`}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          backgroundColor: '#F0FDF4',
                          border: '1px solid #DCFCE7',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                        }}
                      >
                        <div>
                          <strong>Sample {i + 1} In:</strong> {tc.input_text || '(empty)'}
                        </div>
                        <div>
                          <strong>Out:</strong> {tc.expected_output}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    color: '#92400E',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    marginBottom: '12px',
                  }}
                >
                  🔒 {hiddenCasesWithIndex.length} Hidden Grading Test Case(s) — Never shown to students
                </div>

                {allowedLanguages.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                      {allowedLanguages.map((langKey) => (
                        <button
                          key={langKey}
                          type="button"
                          onClick={() => setPreviewLang(langKey)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: previewLang === langKey ? '#0F172A' : '#F8FAFC',
                            color: previewLang === langKey ? '#FFFFFF' : '#475569',
                            fontSize: '10.5px',
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
                        backgroundColor: '#0F172A',
                        color: '#E2E8F0',
                        fontSize: '11px',
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

          {/* ─── FOOTER ACTIONS ────────────────────────────────────── */}
          <div
            style={{
              padding: '14px 26px',
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
              {sampleCasesWithIndex.length} Public Sample • {hiddenCasesWithIndex.length} Hidden Grading Cases
            </span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={handleAttemptClose}
                disabled={saving}
                style={{
                  padding: '9px 20px',
                  borderRadius: '9px',
                  border: '1.5px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
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
                  padding: '9px 24px',
                  borderRadius: '9px',
                  border: 'none',
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: saving ? 'wait' : 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                }}
              >
                {saving
                  ? 'Saving Coding Problem...'
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
