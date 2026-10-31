import { useState, useEffect } from 'react';
import {
  getAdminQuestions,
  createAdminQuestion,
  updateAdminQuestion,
  toggleAdminQuestion,
  bulkUpdateAdminQuestions,
  deleteAdminQuestion,
  bulkDeleteAdminQuestions,
  archiveAdminQuestion,
  previewAdminQuestionsCSV,
  importAdminQuestionsCSV,
  getAdminAssessments,
  getAdminSections,
  createAdminSection,
  assignAdminAssessmentQuestions,
  getAdminQuestionPools,
  manageAdminQuestionPoolItems,
  type AdminQuestion,
  type AdminAssessment,
  type AdminSection,
  type AdminQuestionPool,
  type CSVImportPreviewResponse,
  type SectionMappingRule,
} from '../../api/admin';
import { AdminQuestionEditorModal } from './AdminQuestionEditorModal';
import { AdminQuestionPoolsView } from './AdminQuestionPoolsView';

interface AdminQuestionsViewProps {
  initialAssessmentId?: string;
}

/**
 * Resolves the display name for a question's section.
 * Priority:
 * 1. Direct section_name from the API serializer (e.g. "Section A", "Coding Fundamentals", "Aptitude").
 * 2. Matched name from loaded sections by section_id.
 * 3. Matched name from loaded sections by section_type (section code, e.g. "SECA" -> "Section A").
 * 4. Standard fallback labels for legacy codes: "APTITUDE" -> "Aptitude", "CODING" -> "Coding".
 * 5. Clean custom code string if not matched.
 * 6. "Unassigned" fallback when no section exists.
 */
function getQuestionSectionDisplay(q: AdminQuestion, sectionsList: AdminSection[]): string {
  if (q.section_name && q.section_name.trim()) {
    return q.section_name.trim();
  }

  if (q.section_id) {
    const matchedById = sectionsList.find((s) => s.id === q.section_id);
    if (matchedById?.name?.trim()) {
      return matchedById.name.trim();
    }
  }

  if (q.section_type && q.section_type.trim()) {
    const rawCode = q.section_type.trim();
    const upperCode = rawCode.toUpperCase();
    const matchedByCode = sectionsList.find((s) => s.code.toUpperCase() === upperCode);
    if (matchedByCode?.name?.trim()) {
      return matchedByCode.name.trim();
    }

    if (upperCode === 'APTITUDE') return 'Aptitude';
    if (upperCode === 'CODING') return 'Coding';

    return rawCode;
  }

  return 'Unassigned';
}

/**
 * Returns distinct badge styles for question sections:
 * - Unassigned: Slate / Gray
 * - Coding: Emerald / Green
 * - Aptitude: Blue
 * - Custom Sections: Purple / Indigo (distinguishable from default sections)
 */
function getSectionBadgeStyle(sectionDisplay: string, sectionType?: string): {
  backgroundColor: string;
  color: string;
  border: string;
} {
  const norm = (sectionDisplay || '').toLowerCase();
  const normType = (sectionType || '').toLowerCase();

  if (norm === 'unassigned' || !sectionDisplay) {
    return {
      backgroundColor: '#F1F5F9',
      color: '#64748B',
      border: '1px solid #CBD5E1',
    };
  }

  if (norm.includes('coding') || normType === 'coding') {
    return {
      backgroundColor: '#ECFDF5',
      color: '#059669',
      border: '1px solid #A7F3D0',
    };
  }

  if (norm.includes('aptitude') || normType === 'aptitude') {
    return {
      backgroundColor: '#EFF6FF',
      color: '#1455B8',
      border: '1px solid #BFDBFE',
    };
  }

  // Custom sections: distinctive purple badge
  return {
    backgroundColor: '#F5F3FF',
    color: '#6D28D9',
    border: '1px solid #DDD6FE',
  };
}

export function AdminQuestionsView({ initialAssessmentId }: AdminQuestionsViewProps) {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [assessments, setAssessments] = useState<AdminAssessment[]>([]);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Sub-navigation: Question Bank vs Reusable Question Pools (Phase 2.1)
  const [activeSubTab, setActiveSubTab] = useState<'BANK' | 'POOLS'>('BANK');
  const [questionPools, setQuestionPools] = useState<AdminQuestionPool[]>([]);

  // Phase 2.1 Question Bank modals state
  const [previewQuestion, setPreviewQuestion] = useState<AdminQuestion | null>(null);
  const [showCreateSectionModal, setShowCreateSectionModal] = useState(false);
  const [createSectionForm, setCreateSectionForm] = useState({ name: '', code: '', description: '' });
  const [creatingSection, setCreatingSection] = useState(false);
  const [createSectionError, setCreateSectionError] = useState('');

  // Pool Assignment Modal state
  const [showPoolAssignModal, setShowPoolAssignModal] = useState(false);
  const [targetQuestionIdsForPool, setTargetQuestionIdsForPool] = useState<number[]>([]);
  const [selectedAssessmentIdsForPool, setSelectedAssessmentIdsForPool] = useState<string[]>([]);
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [poolAssignTargetType, setPoolAssignTargetType] = useState<'POOLS' | 'ASSESSMENTS'>('POOLS');
  const [assigningToPool, setAssigningToPool] = useState(false);
  const [poolAssignError, setPoolAssignError] = useState('');

  // Selected assessment state
  const [selectedAssessment, setSelectedAssessment] = useState<AdminAssessment | null>(null);
  const [importAssessmentId, setImportAssessmentId] = useState<string>(initialAssessmentId || '');

  // Filters
  const [sectionFilter, setSectionFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'ALL' | 'ACTIVE_ONLY' | 'ARCHIVED_ONLY'>('ACTIVE_ONLY');
  const [importStep, setImportStep] = useState<'UPLOAD' | 'MAP' | 'RESULT'>('UPLOAD');
  const [importPreview, setImportPreview] = useState<CSVImportPreviewResponse | null>(null);
  const [sectionMapping, setSectionMapping] = useState<Record<string, SectionMappingRule>>({});
  const [importCsvText, setImportCsvText] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [assessmentFilter, setAssessmentFilter] = useState(initialAssessmentId || '');
  const [search, setSearch] = useState('');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Bulk edit field checkboxes & values
  const [bulkFields, setBulkFields] = useState({
    section_type: false,
    category: false,
    difficulty: false,
    is_active: false,
  });
  const [bulkValues, setBulkValues] = useState<{
    section_type: string;
    category: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    is_active: boolean;
  }>({
    section_type: 'APTITUDE',
    category: '',
    difficulty: 'MEDIUM',
    is_active: true,
  });

  // Dedicated Editor Modal state
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<AdminQuestion | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // CSV Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{
    success_count: number;
    error_count: number;
    errors: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // Pagination state (client-side for smooth UX)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const data = await getAdminQuestions({
        section_type: sectionFilter || undefined,
        difficulty: difficultyFilter || undefined,
        is_active: activeFilter || undefined,
        search: search || undefined,
        assessment_id: assessmentFilter || undefined,
      });

      // Ensure frontend filter matches custom sections accurately
      const filteredData = sectionFilter
        ? data.filter((q) => {
            const filterUpper = sectionFilter.trim().toUpperCase();
            const qType = (q.section_type || '').trim().toUpperCase();
            const qName = (q.section_name || '').trim().toUpperCase();
            const matchedSec = sections.find((s) => s.code.toUpperCase() === filterUpper);
            const targetSecName = matchedSec?.name.trim().toUpperCase();
            return (
              qType === filterUpper ||
              qName === filterUpper ||
              (targetSecName && qName === targetSecName)
            );
          })
        : data;

      setQuestions(filteredData);
      setCurrentPage(1);
    } catch {
      alert('Failed to load question bank.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAdminAssessments().then((list) => {
      setAssessments(list);
      if (initialAssessmentId) {
        const match = list.find((a) => a.id === initialAssessmentId);
        if (match) {
          setSelectedAssessment(match);
          setAssessmentFilter(match.id);
          setImportAssessmentId(match.id);
        }
      }
    }).catch(() => {});
    loadSections();
    getAdminQuestionPools().then(setQuestionPools).catch(() => {});
  }, [initialAssessmentId]);

  const loadSections = async () => {
    try {
      const data = await getAdminSections();
      setSections(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [sectionFilter, difficultyFilter, activeFilter, assessmentFilter]);

  const handleOpenCreateSection = () => {
    setCreateSectionForm({ name: '', code: '', description: '' });
    setCreateSectionError('');
    setShowCreateSectionModal(true);
  };

  const handleCreateSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSectionForm.name.trim() || !createSectionForm.code.trim()) {
      setCreateSectionError('Section name and code are required.');
      return;
    }
    setCreatingSection(true);
    setCreateSectionError('');
    try {
      await createAdminSection({
        name: createSectionForm.name.trim(),
        code: createSectionForm.code.trim().toUpperCase(),
        description: createSectionForm.description.trim(),
        is_active: true,
      });
      setShowCreateSectionModal(false);
      loadSections();
    } catch (err: any) {
      setCreateSectionError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to create reusable section.');
    } finally {
      setCreatingSection(false);
    }
  };

  const handleOpenPoolAssign = (questionIds: number[]) => {
    setTargetQuestionIdsForPool(questionIds);
    setSelectedAssessmentIdsForPool([]);
    setSelectedPoolIds([]);
    setPoolAssignError('');
    setShowPoolAssignModal(true);
    getAdminQuestionPools().then(setQuestionPools).catch(() => {});
  };

  const handlePoolAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (poolAssignTargetType === 'POOLS') {
      if (selectedPoolIds.length === 0 || targetQuestionIdsForPool.length === 0) {
        setPoolAssignError('Please select at least one reusable question pool.');
        return;
      }
      setAssigningToPool(true);
      setPoolAssignError('');
      try {
        for (const poolId of selectedPoolIds) {
          await manageAdminQuestionPoolItems(poolId, targetQuestionIdsForPool, 'add');
        }
        alert(`Successfully added ${targetQuestionIdsForPool.length} question(s) to ${selectedPoolIds.length} question pool(s).`);
        setShowPoolAssignModal(false);
        getAdminQuestionPools().then(setQuestionPools).catch(() => {});
      } catch (err: any) {
        setPoolAssignError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to add questions to question pools.');
      } finally {
        setAssigningToPool(false);
      }
    } else {
      if (selectedAssessmentIdsForPool.length === 0 || targetQuestionIdsForPool.length === 0) {
        setPoolAssignError('Please select at least one assessment delivery round.');
        return;
      }
      setAssigningToPool(true);
      setPoolAssignError('');
      try {
        for (const assId of selectedAssessmentIdsForPool) {
          await assignAdminAssessmentQuestions(assId, {
            question_ids: targetQuestionIdsForPool,
            action: 'assign',
          });
        }
        alert(`Successfully assigned ${targetQuestionIdsForPool.length} question(s) to ${selectedAssessmentIdsForPool.length} assessment pool(s).`);
        setShowPoolAssignModal(false);
        loadQuestions();
      } catch (err: any) {
        setPoolAssignError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to assign questions to assessment pools.');
      } finally {
        setAssigningToPool(false);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadQuestions();
  };

  // Pagination computations with Archive Filter (Phase 2.1)
  const questionsFilteredByArchive = questions.filter((q) => {
    if (archiveFilter === 'ACTIVE_ONLY') return !q.is_archived;
    if (archiveFilter === 'ARCHIVED_ONLY') return q.is_archived;
    return true;
  });
  const totalQuestions = questionsFilteredByArchive.length;
  const totalPages = Math.max(1, Math.ceil(totalQuestions / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalQuestions);
  const paginatedQuestions = questionsFilteredByArchive.slice(startIndex, endIndex);

  // Selection handlers
  const handleSelectAllCurrentPage = (checked: boolean) => {
    if (checked) {
      const pageIds = paginatedQuestions.map((q) => q.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIds = new Set(paginatedQuestions.map((q) => q.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    }
  };

  const isCurrentPageAllSelected =
    paginatedQuestions.length > 0 &&
    paginatedQuestions.every((q) => selectedIds.includes(q.id));
  const isCurrentPagePartiallySelected =
    paginatedQuestions.some((q) => selectedIds.includes(q.id)) && !isCurrentPageAllSelected;

  const handleToggleSelectRow = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleActive = async (id: number) => {
    try {
      const res = await toggleAdminQuestion(id);
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, is_active: res.is_active } : q))
      );
    } catch {
      alert('Failed to toggle question status.');
    }
  };

  const handleQuickBulkActive = async (newStatus: boolean) => {
    if (selectedIds.length === 0) return;
    const confirmMsg = `Are you sure you want to ${
      newStatus ? 'activate' : 'deactivate'
    } ${selectedIds.length} question(s)?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setBulkUpdating(true);
      const res = await bulkUpdateAdminQuestions(selectedIds, { is_active: newStatus });
      alert(res.message);
      setSelectedIds([]);
      loadQuestions();
    } catch {
      alert('Failed to apply bulk status update.');
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleToggleArchive = async (q: AdminQuestion) => {
    const targetState = !q.is_archived;
    const confirmMsg = targetState
      ? `Archive question #${q.id}? It will be hidden from new assessments but preserved for past attempt history.`
      : `Restore / Unarchive question #${q.id}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await archiveAdminQuestion(q.id, targetState);
      alert(res.message);
      setQuestions((prev) =>
        prev.map((item) => (item.id === q.id ? { ...item, is_archived: res.is_archived } : item))
      );
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to update archive status.');
    }
  };

  const handleDeleteQuestion = async (q: AdminQuestion) => {
    if (q.can_be_deleted === false) {
      const confirmArchive = window.confirm(
        `Question #${q.id} cannot be permanently deleted because candidates have already answered it in past assessment attempts.\n\nWould you like to ARCHIVE this question instead?\nArchived questions remain preserved for historical attempts but will not be used in future assessments.`
      );
      if (confirmArchive) {
        handleToggleArchive(q);
      }
      return;
    }

    const confirmMsg = `Are you sure you want to permanently delete question #${q.id}?\nThis cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await deleteAdminQuestion(q.id, {
        assessment_id: assessmentFilter || undefined,
      });
      alert(res.message || 'Question processed successfully.');
      loadQuestions();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string; detail?: string } } };
      alert(axErr?.response?.data?.error || axErr?.response?.data?.detail || 'Failed to delete question.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmMsg = `Are you sure you want to delete ${selectedIds.length} selected question(s)?\n\nReferenced questions will be safely archived to protect candidate attempt history.`;
    if (!window.confirm(confirmMsg)) return;

    setBulkUpdating(true);
    try {
      const res = await bulkDeleteAdminQuestions(selectedIds, assessmentFilter || undefined);
      alert(res.message || `Processed ${res.deleted_count} deleted and ${res.archived_count} archived.`);
      setSelectedIds([]);
      loadQuestions();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string; detail?: string } } };
      alert(axErr?.response?.data?.error || axErr?.response?.data?.detail || 'Failed to delete selected questions.');
    } finally {
      setBulkUpdating(false);
    }
  };

  const openBulkModal = (initialField?: 'section_type' | 'difficulty' | 'category' | 'is_active') => {
    setBulkFields({
      section_type: initialField === 'section_type',
      category: initialField === 'category',
      difficulty: initialField === 'difficulty',
      is_active: initialField === 'is_active',
    });
    setBulkValues({
      section_type: sections.length > 0 ? sections[0].code : 'APTITUDE',
      category: '',
      difficulty: 'MEDIUM',
      is_active: true,
    });
    setShowBulkModal(true);
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasField =
      bulkFields.section_type ||
      bulkFields.category ||
      bulkFields.difficulty ||
      bulkFields.is_active;

    if (!hasField) {
      alert('Please check at least one field to update across the selected questions.');
      return;
    }

    const payload: {
      section_type?: string;
      category?: string;
      difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
      is_active?: boolean;
    } = {};

    if (bulkFields.section_type) payload.section_type = bulkValues.section_type;
    if (bulkFields.category) payload.category = bulkValues.category;
    if (bulkFields.difficulty) payload.difficulty = bulkValues.difficulty;
    if (bulkFields.is_active) payload.is_active = bulkValues.is_active;

    try {
      setBulkUpdating(true);
      const res = await bulkUpdateAdminQuestions(selectedIds, payload);
      alert(res.message);
      setShowBulkModal(false);
      setSelectedIds([]);
      loadQuestions();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axErr = err as { response?: { data?: Record<string, string[]> } };
        alert(`Bulk update error: ${JSON.stringify(axErr.response?.data || 'Failed')}`);
      } else {
        alert('Failed to execute bulk update.');
      }
    } finally {
      setBulkUpdating(false);
    }
  };

  // Editor Modal actions
  const openCreateModal = () => {
    setEditingQuestion(null);
    setShowEditorModal(true);
  };

  const openEditModal = (q: AdminQuestion) => {
    setEditingQuestion(q);
    setShowEditorModal(true);
  };

  const handleSaveQuestion = async (formData: Partial<AdminQuestion> & { assessment_id?: string }) => {
    try {
      setSavingQuestion(true);
      if (editingQuestion) {
        await updateAdminQuestion(editingQuestion.id, formData);
        alert('Question updated successfully. Changes will apply to future assessments.');
      } else {
        await createAdminQuestion(formData);
        alert('New question created successfully.');
      }
      setShowEditorModal(false);
      setEditingQuestion(null);
      await loadQuestions();
      const freshAssessments = await getAdminAssessments();
      setAssessments(freshAssessments);
      if (selectedAssessment) {
        const updated = freshAssessments.find((a) => a.id === selectedAssessment.id);
        if (updated) {
          setSelectedAssessment(updated);
        }
      }
    } finally {
      setSavingQuestion(false);
    }
  };

  // Phase 2.1 Two-Step CSV Preview and Explicit Section Mapping Handlers
  const handlePreviewCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile && !importCsvText.trim()) {
      alert('Please select a CSV file or enter CSV content.');
      return;
    }

    setImporting(true);
    setImportResult(null);
    try {
      const preview = await previewAdminQuestionsCSV(importFile || undefined, importCsvText || undefined);
      setImportPreview(preview);

      // Initialize default mappings for detected sections
      const initialMapping: Record<string, SectionMappingRule> = {};
      preview.detected_sections.forEach((sec) => {
        if (sec.matched_section_id) {
          initialMapping[sec.code] = {
            action: 'map',
            target_section_id: sec.matched_section_id,
            target_section_name: sec.matched_section_name || sec.code,
          };
        } else {
          initialMapping[sec.code] = {
            action: 'create',
            target_section_code: sec.code,
            target_section_name: sec.detected_name || sec.code,
          };
        }
      });
      setSectionMapping(initialMapping);
      setImportStep('MAP');
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to parse CSV preview.');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    try {
      const res = await importAdminQuestionsCSV(
        importAssessmentId || undefined,
        importFile || undefined,
        importCsvText || undefined,
        sectionMapping
      );
      setImportResult({
        success_count: res.success_count,
        error_count: res.error_count,
        errors: res.errors || [],
      });
      setImportStep('RESULT');
      if (res.success_count > 0) {
        loadQuestions();
        const freshAssessments = await getAdminAssessments();
        setAssessments(freshAssessments);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.response?.data?.detail || 'Import execution failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleResetImportModal = () => {
    setImportStep('UPLOAD');
    setImportFile(null);
    setImportCsvText('');
    setImportPreview(null);
    setSectionMapping({});
    setImportResult(null);
    setShowImportModal(false);
  };

  return (
    <div>
      {/* ─── PHASE 2.1 SUB-NAVIGATION: BANK VS REUSABLE POOLS ───────────── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '12px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('BANK')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            backgroundColor: activeSubTab === 'BANK' ? '#1455B8' : '#F8FAFC',
            color: activeSubTab === 'BANK' ? '#FFFFFF' : '#475569',
            border: activeSubTab === 'BANK' ? 'none' : '1px solid #CBD5E1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeSubTab === 'BANK' ? '0 2px 4px rgba(20, 85, 184, 0.2)' : 'none',
          }}
        >
          <span>📚 Question Bank</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('POOLS')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            backgroundColor: activeSubTab === 'POOLS' ? '#1455B8' : '#F8FAFC',
            color: activeSubTab === 'POOLS' ? '#FFFFFF' : '#475569',
            border: activeSubTab === 'POOLS' ? 'none' : '1px solid #CBD5E1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeSubTab === 'POOLS' ? '0 2px 4px rgba(20, 85, 184, 0.2)' : 'none',
          }}
        >
          <span>📦 Reusable Question Pools</span>
          {questionPools.length > 0 && (
            <span
              style={{
                backgroundColor: activeSubTab === 'POOLS' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                color: activeSubTab === 'POOLS' ? '#FFFFFF' : '#334155',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '11px',
              }}
            >
              {questionPools.length}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === 'POOLS' ? (
        <AdminQuestionPoolsView />
      ) : (
        <>
          {/* ─── PHASE 2.1 INDEPENDENT QUESTION BANK HEADER ─────────────────── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: 'rgba(20, 85, 184, 0.08)',
              border: '1px solid rgba(20, 85, 184, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1455B8',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div>
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: '#0B2E6F',
                margin: '0 0 2px 0',
                letterSpacing: '-0.02em',
              }}
            >
              Independent Question Bank
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
              Central repository of reusable curriculum items across dynamic sections. Questions can be assigned to multiple assessment pools.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleOpenCreateSection}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#0B2E6F',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <span>+ Create Reusable Section</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setImportResult(null);
              setShowImportModal(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#0B2E6F',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Import CSV</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 20px',
              backgroundColor: '#1455B8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(20, 85, 184, 0.25)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>+ Create Question</span>
          </button>
        </div>
      </div>

      {/* ─── METRICS CARDS ────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Bank Questions
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0B2E6F', marginTop: '4px' }}>
            {questions.length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
            Available across all curriculum tracks
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Active Questions
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
            {questions.filter((q) => q.is_active && !q.is_archived).length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
            Live for assignment & delivery
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Reusable Sections
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#7C3AED', marginTop: '4px' }}>
            {sections.length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
            Categorized section buckets
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Archived Questions
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#EA580C', marginTop: '4px' }}>
            {questions.filter((q) => q.is_archived).length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
            Safely retained historical items
          </div>
        </div>
      </div>

      {/* ─── SECTION NAVIGATION TAB PILLS (PHASE 2.1) ───────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          overflowX: 'auto',
          paddingBottom: '12px',
          marginBottom: '14px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setSectionFilter('');
          }}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: !sectionFilter ? '2px solid #1455B8' : '1px solid #CBD5E1',
            backgroundColor: !sectionFilter ? '#EFF6FF' : '#FFFFFF',
            color: !sectionFilter ? '#1D4ED8' : '#475569',
            fontWeight: !sectionFilter ? 800 : 600,
            fontSize: '13px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
        >
          All Questions ({questions.length})
        </button>

        {sections.map((sec) => {
          const count = questions.filter(
            (q) => (q.section_type || '').toUpperCase() === sec.code.toUpperCase() || q.section_id === sec.id
          ).length;
          const isSelected = sectionFilter.toUpperCase() === sec.code.toUpperCase();

          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => {
                setSectionFilter(sec.code);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: isSelected ? '2px solid #7C3AED' : '1px solid #CBD5E1',
                backgroundColor: isSelected ? '#F5F3FF' : '#FFFFFF',
                color: isSelected ? '#6D28D9' : '#475569',
                fontWeight: isSelected ? 800 : 600,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {sec.name} ({count})
            </button>
          );
        })}
      </div>

      {/* ─── FILTER TOOLBAR ────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search question prompt..."
              style={{
                padding: '9px 12px 9px 36px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                width: '100%',
                boxSizing: 'border-box',
                outlineColor: '#1455B8',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '9px 16px',
              backgroundColor: '#1455B8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(20, 85, 184, 0.2)',
            }}
          >
            Filter
          </button>
        </form>

        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          style={{
            padding: '9px 12px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            fontSize: '13px',
            backgroundColor: '#FFFFFF',
            fontWeight: 600,
            color: '#1E293B',
            outlineColor: '#1455B8',
          }}
        >
          <option value="">All Sections</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.code}>
              {sec.name} ({sec.code})
            </option>
          ))}
          {!sections.some((s) => s.code === 'APTITUDE') && <option value="APTITUDE">Aptitude</option>}
          {!sections.some((s) => s.code === 'CODING') && <option value="CODING">Coding Fundamentals</option>}
        </select>

        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          style={{
            padding: '9px 12px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            fontSize: '13px',
            backgroundColor: '#FFFFFF',
            fontWeight: 600,
            color: '#1E293B',
            outlineColor: '#1455B8',
          }}
        >
          <option value="">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          style={{
            padding: '9px 12px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            fontSize: '13px',
            backgroundColor: '#FFFFFF',
            fontWeight: 600,
            color: '#1E293B',
            outlineColor: '#1455B8',
          }}
        >
          <option value="">All Statuses</option>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
        </select>

        {/* Phase 2.1 Archive Status Filter */}
        <select
          value={archiveFilter}
          onChange={(e) => setArchiveFilter(e.target.value as any)}
          style={{
            padding: '9px 12px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            fontSize: '13px',
            backgroundColor: '#FFFFFF',
            fontWeight: 600,
            color: '#1E293B',
            outlineColor: '#1455B8',
          }}
        >
          <option value="ACTIVE_ONLY">Active Library (Hide Archived)</option>
          <option value="ARCHIVED_ONLY">Archived Library Only</option>
          <option value="ALL">All (Active & Archived)</option>
        </select>

        <select
          value={assessmentFilter}
          onChange={(e) => setAssessmentFilter(e.target.value)}
          style={{
            padding: '9px 12px',
            borderRadius: '8px',
            border: '1px solid #CBD5E1',
            fontSize: '13px',
            backgroundColor: '#FFFFFF',
            fontWeight: 600,
            color: '#1E293B',
            outlineColor: '#1455B8',
          }}
        >
          <option value="">All Assessments</option>
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.title}
            </option>
          ))}
        </select>

        {(sectionFilter || difficultyFilter || activeFilter || assessmentFilter || search) && (
          <button
            onClick={() => {
              setSectionFilter('');
              setDifficultyFilter('');
              setActiveFilter('');
              setAssessmentFilter('');
              setSearch('');
              loadQuestions();
            }}
            style={{
              padding: '9px 12px',
              backgroundColor: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* ─── BULK ACTIONS BAR (DURING SELECTION) ───────────────────── */}
      {selectedIds.length > 0 && (
        <div
          style={{
            backgroundColor: '#FFFDF5',
            border: '1.5px solid #F5B83D',
            borderRadius: '12px',
            padding: '12px 20px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(245, 184, 61, 0.15)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#FFD45C',
                color: '#0B2E6F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0B2E6F' }}>
                {selectedIds.length} questions selected
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                You can apply bulk actions to the selected questions.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleOpenPoolAssign(selectedIds)}
              disabled={bulkUpdating}
              style={{
                padding: '7px 14px',
                backgroundColor: '#7C3AED',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>🎯 Assign to Pool ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => openBulkModal('section_type')}
              disabled={bulkUpdating}
              style={{
                padding: '7px 14px',
                backgroundColor: '#FFFFFF',
                color: '#0B2E6F',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg>
              <span>Change Section</span>
            </button>

            <button
              onClick={() => openBulkModal('difficulty')}
              disabled={bulkUpdating}
              style={{
                padding: '7px 14px',
                backgroundColor: '#FFFFFF',
                color: '#0B2E6F',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              <span>Change Difficulty</span>
            </button>

            <button
              onClick={() => handleQuickBulkActive(true)}
              disabled={bulkUpdating}
              style={{
                padding: '7px 14px',
                backgroundColor: '#DCFCE7',
                color: '#166534',
                border: '1px solid #86EFAC',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Activate</span>
            </button>

            <button
              onClick={() => handleQuickBulkActive(false)}
              disabled={bulkUpdating}
              style={{
                padding: '7px 14px',
                backgroundColor: '#FEE2E2',
                color: '#991B1B',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
              <span>Deactivate</span>
            </button>

            <button
              onClick={handleBulkDelete}
              disabled={bulkUpdating}
              style={{
                padding: '7px 14px',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Delete or safely archive selected questions"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete ({selectedIds.length})</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              style={{
                padding: '7px 12px',
                backgroundColor: 'transparent',
                color: '#64748B',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* ─── QUESTIONS TABLE ───────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1.5px solid rgba(245, 184, 61, 0.25)',
          overflow: 'hidden',
          boxShadow: '0 4px 14px rgba(11, 46, 111, 0.04)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAF7F3', borderBottom: '1.5px solid #E2E8F0', color: '#475569' }}>
              <th style={{ padding: '12px 14px', width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isCurrentPageAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isCurrentPagePartiallySelected;
                  }}
                  onChange={(e) => handleSelectAllCurrentPage(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#1455B8', cursor: 'pointer' }}
                  title="Select all on this page"
                />
              </th>
              <th style={{ padding: '12px 14px', width: '60px' }}>ID ↕</th>
              <th style={{ padding: '12px 14px', minWidth: '130px', width: '130px' }}>Section ↕</th>
              <th style={{ padding: '12px 14px' }}>Question Prompt</th>
              <th style={{ padding: '12px 14px', width: '70px', textAlign: 'center' }}>Correct ↕</th>
              <th style={{ padding: '12px 14px', width: '90px', textAlign: 'center' }}>Difficulty ↕</th>
              <th style={{ padding: '12px 14px', width: '60px', textAlign: 'center' }}>Marks</th>
              <th style={{ padding: '12px 14px', width: '130px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '12px 14px', width: '180px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: '36px', textAlign: 'center', color: '#6B7280' }}>
                  Loading questions from bank...
                </td>
              </tr>
            ) : paginatedQuestions.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ maxWidth: '420px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1455B8' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                      {selectedAssessment ? `No questions in "${selectedAssessment.title}" pool` : 'No questions found'}
                    </div>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                      {selectedAssessment
                        ? 'This assessment pool is currently empty. Add individual questions or import questions in bulk via CSV to satisfy section quotas.'
                        : 'No questions match the current filter criteria or the question bank is empty.'}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <button
                        onClick={openCreateModal}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#1455B8',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        + Add Question
                      </button>
                      <button
                        onClick={() => {
                          if (selectedAssessment) setImportAssessmentId(selectedAssessment.id);
                          setShowImportModal(true);
                        }}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#FFFFFF',
                          color: '#0B2E6F',
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Import CSV
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedQuestions.map((q) => {
                const isSelected = selectedIds.includes(q.id);

                return (
                  <tr
                    key={q.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: isSelected ? 'rgba(20, 85, 184, 0.05)' : 'transparent',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(q.id)}
                        style={{ width: '16px', height: '16px', accentColor: '#1455B8', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#64748B', fontWeight: 600 }}>
                      #{q.id}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {(() => {
                        const sectionDisplay = getQuestionSectionDisplay(q, sections);
                        const badgeStyle = getSectionBadgeStyle(sectionDisplay, q.section_type);
                        return (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              ...badgeStyle,
                            }}
                          >
                            {sectionDisplay}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#0F172A' }}>
                      <div style={{ fontWeight: 600, marginBottom: '2px', lineHeight: 1.45 }}>
                        {q.prompt.length > 110 ? `${q.prompt.slice(0, 110)}...` : q.prompt}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        A: {q.option_a.slice(0, 24)} | B: {q.option_b.slice(0, 24)} | C: {q.option_c.slice(0, 24)} | D: {q.option_d.slice(0, 24)}
                      </div>
                      {q.assigned_assessments && q.assigned_assessments.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {q.assigned_assessments.map((ass) => (
                            <span
                              key={ass.id}
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                backgroundColor: '#F5F8FF',
                                color: '#0B2E6F',
                                border: '1px solid #DCE4F2',
                                padding: '1px 6px',
                                borderRadius: '4px',
                              }}
                              title={ass.title}
                            >
                              {ass.code}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          backgroundColor: '#DCFCE7',
                          color: '#166534',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          border: '1px solid #86EFAC',
                        }}
                      >
                        {q.correct_option}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor:
                            q.difficulty === 'EASY'
                              ? '#EFF6FF'
                              : q.difficulty === 'MEDIUM'
                              ? '#FEF3C7'
                              : '#FEE2E2',
                          color:
                            q.difficulty === 'EASY'
                              ? '#1455B8'
                              : q.difficulty === 'MEDIUM'
                              ? '#B45309'
                              : '#DC2626',
                        }}
                      >
                        {q.difficulty}
                      </span>
                    </td>
                    {/* Phase 2.1 Marks */}
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800, color: '#0B2E6F' }}>
                      {q.marks ?? 1}
                    </td>

                    {/* Phase 2.1 Status Badges */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                        <button
                          onClick={() => handleToggleActive(q.id)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            border: 'none',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            backgroundColor: q.is_active ? '#DCFCE7' : '#F1F5F9',
                            color: q.is_active ? '#166534' : '#64748B',
                            cursor: 'pointer',
                          }}
                          title="Toggle Active/Inactive"
                        >
                          {q.is_active ? 'Active' : 'Inactive'}
                        </button>
                        {q.is_archived && (
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: '#FEF3C7',
                              color: '#92400E',
                              border: '1px solid #FDE68A',
                            }}
                          >
                            Archived
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Phase 2.1 Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => setPreviewQuestion(q)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          color: '#0B2E6F',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Preview question options and details"
                      >
                        👁️ Preview
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenPoolAssign([q.id])}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          backgroundColor: '#F5F3FF',
                          border: '1px solid #DDD6FE',
                          borderRadius: '6px',
                          color: '#6D28D9',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Assign to one or more assessment pools"
                      >
                        🎯 Pool
                      </button>

                      <button
                        onClick={() => openEditModal(q)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          color: '#0B2E6F',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Edit question"
                      >
                        ✏️ Edit
                      </button>

                      <button
                        onClick={() => handleToggleArchive(q)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          backgroundColor: q.is_archived ? '#EFF6FF' : '#FFFBEB',
                          border: `1px solid ${q.is_archived ? '#BFDBFE' : '#FDE68A'}`,
                          borderRadius: '6px',
                          color: q.is_archived ? '#1E40AF' : '#92400E',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          marginLeft: '4px',
                        }}
                        title={q.is_archived ? 'Restore / Unarchive question' : 'Archive question'}
                      >
                        {q.is_archived ? 'Unarchive' : 'Archive'}
                      </button>

                      <button
                        onClick={() => handleDeleteQuestion(q)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #FECACA',
                          borderRadius: '6px',
                          color: '#DC2626',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          marginLeft: '4px',
                          opacity: q.can_be_deleted === false ? 0.7 : 1,
                        }}
                        title={q.can_be_deleted === false ? 'Locked: used in student attempts. Click to archive instead.' : 'Delete question permanently'}
                      >
                        🗑️ {q.can_be_deleted === false ? 'Locked' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* ─── PAGINATION FOOTER ─────────────────────────────────────── */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#FAF7F3',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12.5px',
            color: '#64748B',
          }}
        >
          <div>
            Showing <strong>{totalQuestions > 0 ? startIndex + 1 : 0}</strong> to{' '}
            <strong>{endIndex}</strong> of <strong>{totalQuestions}</strong> questions
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: currentPage === 1 ? '#94A3B8' : '#0B2E6F',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              &lt;
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                // Show first, last, and window around current
                return (
                  page === 1 ||
                  page === totalPages ||
                  Math.abs(page - currentPage) <= 2
                );
              })
              .map((page, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev && page - prev > 1;

                return (
                  <span key={page} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {showEllipsis && <span style={{ color: '#94A3B8' }}>...</span>}
                    <button
                      onClick={() => setCurrentPage(page)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: page === currentPage ? 'none' : '1px solid #CBD5E1',
                        backgroundColor: page === currentPage ? '#0B2E6F' : '#FFFFFF',
                        color: page === currentPage ? '#FFFFFF' : '#475569',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: page === currentPage ? 800 : 600,
                      }}
                    >
                      {page}
                    </button>
                  </span>
                );
              })}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: currentPage === totalPages ? '#94A3B8' : '#0B2E6F',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      {/* ─── DEDICATED SPACIOUS QUESTION EDITOR MODAL ─────────────── */}
      <AdminQuestionEditorModal
        isOpen={showEditorModal}
        question={editingQuestion}
        assessments={assessments}
        sections={sections}
        defaultAssessmentId={selectedAssessment?.id || assessmentFilter || ''}
        onClose={() => {
          setShowEditorModal(false);
          setEditingQuestion(null);
        }}
        onSave={handleSaveQuestion}
        saving={savingQuestion}
      />

      {/* ─── BULK EDIT PROPERTIES MODAL ────────────────────────────── */}
      {showBulkModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 46, 111, 0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 20px 40px -10px rgba(11, 46, 111, 0.25)',
              border: '1.5px solid rgba(245, 184, 61, 0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 2px 0' }}>
                  Bulk Edit {selectedIds.length} Question(s)
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                  Select which properties to update. Only checked fields will be modified.
                </p>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Field 1: Section Type */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1.5px solid ${bulkFields.section_type ? '#1455B8' : '#E2E8F0'}`,
                  backgroundColor: bulkFields.section_type ? 'rgba(20, 85, 184, 0.03)' : '#FAF7F3',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0B2E6F', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bulkFields.section_type}
                      onChange={(e) => setBulkFields({ ...bulkFields, section_type: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#1455B8' }}
                    />
                    <span>Update Section Type</span>
                  </label>
                </div>
                <select
                  disabled={!bulkFields.section_type}
                  value={bulkValues.section_type}
                  onChange={(e) => setBulkValues({ ...bulkValues, section_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: bulkFields.section_type ? '#FFFFFF' : '#F1F5F9',
                  }}
                >
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.code}>
                      {sec.name} ({sec.code})
                    </option>
                  ))}
                  {!sections.some((s) => s.code === 'APTITUDE') && <option value="APTITUDE">Aptitude</option>}
                  {!sections.some((s) => s.code === 'CODING') && <option value="CODING">Coding Fundamentals</option>}
                </select>
              </div>

              {/* Field 2: Category */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1.5px solid ${bulkFields.category ? '#1455B8' : '#E2E8F0'}`,
                  backgroundColor: bulkFields.category ? 'rgba(20, 85, 184, 0.03)' : '#FAF7F3',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0B2E6F', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bulkFields.category}
                      onChange={(e) => setBulkFields({ ...bulkFields, category: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#1455B8' }}
                    />
                    <span>Update Category / Sub-topic</span>
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Quantitative Ability, Data Structures, General"
                  disabled={!bulkFields.category}
                  value={bulkValues.category}
                  onChange={(e) => setBulkValues({ ...bulkValues, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: bulkFields.category ? '#FFFFFF' : '#F1F5F9',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1.5px solid ${bulkFields.difficulty ? '#1455B8' : '#E2E8F0'}`,
                  backgroundColor: bulkFields.difficulty ? 'rgba(20, 85, 184, 0.03)' : '#FAF7F3',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0B2E6F', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bulkFields.difficulty}
                      onChange={(e) => setBulkFields({ ...bulkFields, difficulty: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#1455B8' }}
                    />
                    <span>Update Difficulty Level</span>
                  </label>
                </div>
                <select
                  disabled={!bulkFields.difficulty}
                  value={bulkValues.difficulty}
                  onChange={(e) => setBulkValues({ ...bulkValues, difficulty: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: bulkFields.difficulty ? '#FFFFFF' : '#F1F5F9',
                  }}
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>

              {/* Field 4: Status */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1.5px solid ${bulkFields.is_active ? '#1455B8' : '#E2E8F0'}`,
                  backgroundColor: bulkFields.is_active ? 'rgba(20, 85, 184, 0.03)' : '#FAF7F3',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0B2E6F', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bulkFields.is_active}
                      onChange={(e) => setBulkFields({ ...bulkFields, is_active: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#1455B8' }}
                    />
                    <span>Update Active Status</span>
                  </label>
                </div>
                <select
                  disabled={!bulkFields.is_active}
                  value={bulkValues.is_active ? 'true' : 'false'}
                  onChange={(e) => setBulkValues({ ...bulkValues, is_active: e.target.value === 'true' })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: bulkFields.is_active ? '#FFFFFF' : '#F1F5F9',
                  }}
                >
                  <option value="true">Active (Eligible for tests)</option>
                  <option value="false">Inactive (Excluded from tests)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkUpdating}
                  style={{
                    padding: '8px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#0B2E6F',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: bulkUpdating ? 0.7 : 1,
                  }}
                >
                  {bulkUpdating ? 'Applying Updates...' : `Apply to ${selectedIds.length} Question(s)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── PHASE 2.1 TWO-STEP CSV IMPORT MODAL ───────────────────────── */}
      {showImportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 46, 111, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            style={{
              maxWidth: importStep === 'MAP' ? '720px' : '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 20px 35px -10px rgba(11, 46, 111, 0.15)',
              border: '1.5px solid rgba(245, 184, 61, 0.3)',
              transition: 'max-width 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Bulk Question Import (CSV)
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {importStep === 'UPLOAD' && 'Step 1 of 2: Upload CSV File & Choose Optional Assessment'}
                  {importStep === 'MAP' && 'Step 2 of 2: Explicit Section Mapping & Rule Confirmation'}
                  {importStep === 'RESULT' && 'Import Completed'}
                </span>
              </div>
              <button
                onClick={handleResetImportModal}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* ─── STEP 1: UPLOAD & PREVIEW ─── */}
            {importStep === 'UPLOAD' && (
              <form onSubmit={handlePreviewCSV}>
                <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Upload a CSV file containing questions. Section codes will be analyzed so you can explicitly map, auto-create, or skip sections before importing.
                </p>

                {/* Optional Assessment Pool Selector */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '6px' }}>
                    Assign Directly to Assessment Pool (Optional)
                  </label>
                  <select
                    value={importAssessmentId}
                    onChange={(e) => setImportAssessmentId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Independent Question Bank (No Specific Assessment) --</option>
                    {assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* File Upload Box */}
                <div
                  style={{
                    border: '2px dashed #CBD5E1',
                    borderRadius: '10px',
                    padding: '20px',
                    textAlign: 'center',
                    marginBottom: '16px',
                    backgroundColor: '#FAF7F3',
                  }}
                >
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    style={{ display: 'block', margin: '0 auto' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px' }}>
                    Columns expected: prompt, section_type, difficulty, option_a, option_b, option_c, option_d, correct_option, marks, explanation
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleResetImportModal}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importing || (!importFile && !importCsvText.trim())}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: importing || (!importFile && !importCsvText.trim()) ? '#94A3B8' : '#1455B8',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: importing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {importing ? 'Analyzing CSV...' : 'Analyze CSV & Preview Sections →'}
                  </button>
                </div>
              </form>
            )}

            {/* ─── STEP 2: EXPLICIT SECTION MAPPING ─── */}
            {importStep === 'MAP' && importPreview && (
              <div>
                <div
                  style={{
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    fontSize: '13px',
                    color: '#1E40AF',
                  }}
                >
                  <strong>{importPreview.total_rows} total question row(s) detected</strong> across{' '}
                  <strong>{importPreview.detected_sections.length} section(s)</strong>.
                  <div style={{ fontSize: '11.5px', color: '#3B82F6', marginTop: '2px' }}>
                    Confirm or customize how each section code from your CSV maps to platform sections. No automatic or silent creation will occur.
                  </div>
                </div>

                {importPreview.errors && importPreview.errors.length > 0 && (
                  <div
                    style={{
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      marginBottom: '16px',
                      fontSize: '12px',
                      color: '#DC2626',
                    }}
                  >
                    <strong>Warnings detected in CSV preview:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {importPreview.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  {importPreview.detected_sections.map((sec) => {
                    const rule = sectionMapping[sec.code] || { action: 'create' };
                    return (
                      <div
                        key={sec.code}
                        style={{
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          padding: '14px',
                          backgroundColor: '#F8FAFC',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0B2E6F', fontSize: '13px' }}>
                              [{sec.code}]
                            </span>{' '}
                            <strong style={{ fontSize: '13px', color: '#1E293B' }}>{sec.detected_name}</strong>
                          </div>
                          <span
                            style={{
                              backgroundColor: '#E2E8F0',
                              color: '#334155',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                            }}
                          >
                            {sec.row_count} question(s)
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px', alignItems: 'center' }}>
                          <select
                            value={rule.action}
                            onChange={(e) => {
                              const action = e.target.value as 'map' | 'create' | 'skip';
                              setSectionMapping((prev) => ({
                                ...prev,
                                [sec.code]: {
                                  ...prev[sec.code],
                                  action,
                                  target_section_id: action === 'map' ? (sections[0]?.id || undefined) : undefined,
                                  target_section_code: action === 'create' ? sec.code : undefined,
                                  target_section_name: action === 'create' ? sec.detected_name : undefined,
                                },
                              }));
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              fontSize: '12px',
                              fontWeight: 700,
                              backgroundColor: '#FFFFFF',
                            }}
                          >
                            <option value="map">Map to Section</option>
                            <option value="create">Create New Section</option>
                            <option value="skip">Skip These Rows</option>
                          </select>

                          {rule.action === 'map' && (
                            <select
                              value={rule.target_section_id || ''}
                              onChange={(e) => {
                                const id = parseInt(e.target.value, 10);
                                setSectionMapping((prev) => ({
                                  ...prev,
                                  [sec.code]: {
                                    ...prev[sec.code],
                                    action: 'map',
                                    target_section_id: id,
                                  },
                                }));
                              }}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '12px',
                                backgroundColor: '#FFFFFF',
                              }}
                            >
                              {sections.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.code})
                                </option>
                              ))}
                            </select>
                          )}

                          {rule.action === 'create' && (
                            <input
                              type="text"
                              value={rule.target_section_name || sec.detected_name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSectionMapping((prev) => ({
                                  ...prev,
                                  [sec.code]: {
                                    ...prev[sec.code],
                                    action: 'create',
                                    target_section_code: sec.code,
                                    target_section_name: val,
                                  },
                                }));
                              }}
                              placeholder="New Section Name"
                              style={{
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '12px',
                                backgroundColor: '#FFFFFF',
                              }}
                            />
                          )}

                          {rule.action === 'skip' && (
                            <span style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                              All {sec.row_count} question(s) with section [{sec.code}] will be omitted during import.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setImportStep('UPLOAD')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    ← Back to File Upload
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={importing}
                    style={{
                      padding: '8px 22px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: importing ? '#94A3B8' : '#1455B8',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: importing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {importing ? 'Importing Questions...' : 'Confirm & Execute Import →'}
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 3: RESULT ─── */}
            {importStep === 'RESULT' && importResult && (
              <div>
                <div
                  style={{
                    backgroundColor: importResult.error_count > 0 ? '#FEF2F2' : '#F0FDF4',
                    border: `1px solid ${importResult.error_count > 0 ? '#FECACA' : '#BBF7D0'}`,
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '13px',
                  }}
                >
                  <strong style={{ color: importResult.error_count > 0 ? '#DC2626' : '#16A34A', fontSize: '14px' }}>
                    Import Result: {importResult.success_count} question(s) successfully imported.
                  </strong>
                  {importResult.error_count > 0 && (
                    <div style={{ marginTop: '8px', color: '#991B1B' }}>
                      Errors ({importResult.error_count}):
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '12px' }}>
                        {importResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleResetImportModal}
                    style={{
                      padding: '8px 22px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#0B2E6F',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ─── QUESTION PREVIEW MODAL (PHASE 2.1) ────────────────────── */}
      {previewQuestion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '640px',
              maxWidth: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: '#EEF2FF', color: '#3730A3', fontWeight: 800, fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
                    #{previewQuestion.id}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>
                    Section: <strong>{getQuestionSectionDisplay(previewQuestion, sections)}</strong>
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0B2E6F' }}>
                    • {previewQuestion.marks || 1} Marks
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: previewQuestion.difficulty === 'EASY' ? '#DCFCE7' : previewQuestion.difficulty === 'MEDIUM' ? '#FEF3C7' : '#FEE2E2',
                      color: previewQuestion.difficulty === 'EASY' ? '#166534' : previewQuestion.difficulty === 'MEDIUM' ? '#92400E' : '#991B1B',
                    }}
                  >
                    {previewQuestion.difficulty}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQuestion(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '16px', lineHeight: 1.5, backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              {previewQuestion.prompt}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {[
                { key: 'A', text: previewQuestion.option_a },
                { key: 'B', text: previewQuestion.option_b },
                { key: 'C', text: previewQuestion.option_c },
                { key: 'D', text: previewQuestion.option_d },
              ].map(({ key, text }) => {
                const isCorrect = (previewQuestion.correct_option || '').toUpperCase() === key;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: isCorrect ? '2px solid #16A34A' : '1px solid #E2E8F0',
                      backgroundColor: isCorrect ? '#F0FDF4' : '#FFFFFF',
                    }}
                  >
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: isCorrect ? '#16A34A' : '#E2E8F0',
                        color: isCorrect ? '#FFFFFF' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '12px',
                      }}
                    >
                      {isCorrect ? '✓' : key}
                    </span>
                    <span style={{ fontSize: '13.5px', color: isCorrect ? '#14532D' : '#334155', fontWeight: isCorrect ? 700 : 500 }}>
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>

            {previewQuestion.explanation && (
              <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                <strong style={{ color: '#1D4ED8' }}>Explanation:</strong>
                <div style={{ color: '#1E3A8A', marginTop: '4px', lineHeight: 1.4 }}>{previewQuestion.explanation}</div>
              </div>
            )}

            {previewQuestion.assigned_assessments && previewQuestion.assigned_assessments.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <strong style={{ fontSize: '12px', color: '#64748B', textTransform: 'uppercase' }}>Assigned to Assessment Pools:</strong>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {previewQuestion.assigned_assessments.map((ass) => (
                    <span
                      key={ass.id}
                      style={{
                        backgroundColor: '#EEF2FF',
                        color: '#3730A3',
                        border: '1px solid #C7D2FE',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {ass.code} — {ass.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setPreviewQuestion(null);
                  handleOpenPoolAssign([previewQuestion.id]);
                }}
                style={{ padding: '8px 18px', backgroundColor: '#7C3AED', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                🎯 Assign to Pool
              </button>
              <button
                type="button"
                onClick={() => setPreviewQuestion(null)}
                style={{ padding: '8px 18px', backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE REUSABLE SECTION MODAL (PHASE 2.1) ───────────────── */}
      {showCreateSectionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '520px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                Create Reusable Assessment Section
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateSectionModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSectionSubmit}>
              {createSectionError && (
                <div style={{ backgroundColor: '#FEF2F2', color: '#DC2626', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
                  {createSectionError}
                </div>
              )}

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Section Name *
                </label>
                <input
                  type="text"
                  value={createSectionForm.name}
                  onChange={(e) => setCreateSectionForm({ ...createSectionForm, name: e.target.value })}
                  placeholder="e.g. Logical Reasoning, System Design, SQL"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Section Code *
                </label>
                <input
                  type="text"
                  value={createSectionForm.code}
                  onChange={(e) => setCreateSectionForm({ ...createSectionForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. LOGICAL, SYS_DESIGN, SQL_QUERY"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', textTransform: 'uppercase' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Description
                </label>
                <textarea
                  value={createSectionForm.description}
                  onChange={(e) => setCreateSectionForm({ ...createSectionForm, description: e.target.value })}
                  placeholder="Optional section curriculum details..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateSectionModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSection}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#0B2E6F', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: creatingSection ? 'not-allowed' : 'pointer' }}
                >
                  {creatingSection ? 'Creating...' : 'Create Section →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ASSIGN TO ASSESSMENT POOL MODAL (PHASE 2.1) ─────────────── */}
      {showPoolAssignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '560px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Assign to Assessment Pools
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Assigning {targetQuestionIdsForPool.length} question(s) to assessment delivery rounds.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPoolAssignModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePoolAssignSubmit}>
              {poolAssignError && (
                <div style={{ backgroundColor: '#FEF2F2', color: '#DC2626', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
                  {poolAssignError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPoolAssignTargetType('POOLS')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: poolAssignTargetType === 'POOLS' ? '#1455B8' : '#F1F5F9',
                    color: poolAssignTargetType === 'POOLS' ? '#FFFFFF' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Reusable Question Pools ({questionPools.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPoolAssignTargetType('ASSESSMENTS')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: poolAssignTargetType === 'ASSESSMENTS' ? '#1455B8' : '#F1F5F9',
                    color: poolAssignTargetType === 'ASSESSMENTS' ? '#FFFFFF' : '#475569',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Assessment Rounds ({assessments.length})
                </button>
              </div>

              {poolAssignTargetType === 'POOLS' ? (
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px', marginBottom: '16px' }}>
                  {questionPools.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                      No reusable question pools found. Switch to the "Question Pools" tab to create one.
                    </div>
                  ) : (
                    questionPools.map((p) => {
                      const isChecked = selectedPoolIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: isChecked ? '#F0F7FF' : 'transparent',
                            cursor: 'pointer',
                            marginBottom: '4px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPoolIds((prev) => [...prev, p.id]);
                              } else {
                                setSelectedPoolIds((prev) => prev.filter((id) => id !== p.id));
                              }
                            }}
                            style={{ width: '16px', height: '16px', accentColor: '#1455B8' }}
                          />
                          <div>
                            <span style={{ fontWeight: 700, color: '#0B2E6F', fontSize: '13px' }}>
                              [{p.code}] {p.name}
                            </span>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              Category: {p.category || 'General'} • Questions: {p.questions_count || 0}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              ) : (
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px', marginBottom: '16px' }}>
                  {assessments.map((a) => {
                    const isChecked = selectedAssessmentIdsForPool.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          backgroundColor: isChecked ? '#F0F7FF' : 'transparent',
                          cursor: 'pointer',
                          marginBottom: '4px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAssessmentIdsForPool((prev) => [...prev, a.id]);
                            } else {
                              setSelectedAssessmentIdsForPool((prev) => prev.filter((id) => id !== a.id));
                            }
                          }}
                          style={{ width: '16px', height: '16px', accentColor: '#1455B8' }}
                        />
                        <div>
                          <span style={{ fontWeight: 700, color: '#0B2E6F', fontSize: '13px' }}>
                            [{a.code}] {a.title}
                          </span>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            Status: {a.status} • Questions in pool: {a.pool_questions_count || 0}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPoolAssignModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    assigningToPool ||
                    (poolAssignTargetType === 'POOLS' ? selectedPoolIds.length === 0 : selectedAssessmentIdsForPool.length === 0)
                  }
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background:
                      assigningToPool ||
                      (poolAssignTargetType === 'POOLS' ? selectedPoolIds.length === 0 : selectedAssessmentIdsForPool.length === 0)
                        ? '#94A3B8'
                        : '#7C3AED',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor:
                      assigningToPool ||
                      (poolAssignTargetType === 'POOLS' ? selectedPoolIds.length === 0 : selectedAssessmentIdsForPool.length === 0)
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {assigningToPool
                    ? 'Assigning...'
                    : poolAssignTargetType === 'POOLS'
                    ? `Add to ${selectedPoolIds.length} Question Pool(s) →`
                    : `Assign to ${selectedAssessmentIdsForPool.length} Round(s) →`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}