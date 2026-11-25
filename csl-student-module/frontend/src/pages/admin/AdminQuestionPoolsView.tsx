import { useState, useEffect } from 'react';
import {
  getAdminQuestionPools,
  createAdminQuestionPool,
  getAdminQuestionPoolDetail,
  updateAdminQuestionPool,
  deleteAdminQuestionPool,
  manageAdminQuestionPoolItems,
  getAdminQuestions,
  getAdminQuestion,
  getAdminSections,
  archiveAdminQuestion,
  updateAdminQuestion,
  createAdminQuestionInPool,
  removeAdminQuestionFromPool,
  previewAdminPoolCSV,
  importAdminPoolCSV,
  type AdminQuestionPool,
  type AdminQuestion,
  type AdminSection,
  type CSVImportPreviewResponse,
  type SectionMappingRule,
} from '../../api/admin';
import { AdminQuestionEditorModal } from './AdminQuestionEditorModal';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { generateCodeFromTitle } from '../../utils/codeGenerator';
import { formatApiError } from '../../utils/errorFormatter';

interface AdminQuestionPoolsViewProps {
  onCreateQuestion?: () => void;
  onImportCSV?: () => void;
  onViewCentralBank?: () => void;
  onNavigateToAssessment?: (assessmentId: string) => void;
}

export function AdminQuestionPoolsView({
  onCreateQuestion,
  onViewCentralBank,
  onNavigateToAssessment,
}: AdminQuestionPoolsViewProps = {}) {
  const [pools, setPools] = useState<AdminQuestionPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // View Mode: Grid (Mockup 5) vs List
  const [viewLayout, setViewLayout] = useState<'GRID' | 'LIST'>('GRID');
  const [bulkActionActive, setBulkActionActive] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');

  // Create / Edit Modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPool, setEditingPool] = useState<AdminQuestionPool | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: '',
    description: '',
    is_active: true,
  });
  const [submittingForm, setSubmittingForm] = useState(false);
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [formError, setFormError] = useState('');

  // Manage Questions Modal / Drawer
  const [managingPool, setManagingPool] = useState<AdminQuestionPool | null>(null);
  const [poolDetailLoading, setPoolDetailLoading] = useState(false);
  const [showAddQuestionsModal, setShowAddQuestionsModal] = useState(false);

  // Direct Question Authoring inside Pool Drawer
  const [showPoolQuestionModal, setShowPoolQuestionModal] = useState(false);
  const [poolQuestionType, setPoolQuestionType] = useState<'MCQ' | 'CODING'>('MCQ');
  const [editingQuestionInPool, setEditingQuestionInPool] = useState<AdminQuestion | null>(null);
  const [savingPoolQuestion, setSavingPoolQuestion] = useState(false);

  // Pool-Scoped CSV Import Modal State
  const [showPoolCsvModal, setShowPoolCsvModal] = useState(false);
  const [targetCsvPoolId, setTargetCsvPoolId] = useState<string>('');
  const [poolCsvStep, setPoolCsvStep] = useState<'UPLOAD' | 'PREVIEW' | 'RESULT'>('UPLOAD');
  const [poolCsvFile, setPoolCsvFile] = useState<File | null>(null);
  const [poolCsvText, setPoolCsvText] = useState('');
  const [poolCsvAddToGlobal, setPoolCsvAddToGlobal] = useState(false); // Unchecked by default
  const [poolCsvPreview, setPoolCsvPreview] = useState<CSVImportPreviewResponse | null>(null);
  const [poolCsvSectionMapping, setPoolCsvSectionMapping] = useState<Record<string, SectionMappingRule>>({});
  const [poolCsvLoading, setPoolCsvLoading] = useState(false);
  const [poolCsvError, setPoolCsvError] = useState('');
  const [poolCsvResult, setPoolCsvResult] = useState<{
    success: boolean;
    imported_count: number;
    error_count: number;
    errors: Array<string | { row?: number; error?: string }>;
    add_to_global_bank: boolean;
  } | null>(null);

  // Drawer Filters
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerSectionFilter, setDrawerSectionFilter] = useState('');
  const [drawerDifficultyFilter, setDrawerDifficultyFilter] = useState('');

  // Add questions from bank state
  const [bankQuestions, setBankQuestions] = useState<AdminQuestion[]>([]);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [bankSectionFilter, setBankSectionFilter] = useState('');
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<number[]>([]);
  const [addingToPool, setAddingToPool] = useState(false);

  const loadPools = async () => {
    try {
      setLoading(true);
      setError('');
      const params: { search?: string; is_active?: boolean } = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = true;
      if (statusFilter === 'ARCHIVED') params.is_active = false;

      const data = await getAdminQuestionPools(params);
      setPools(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load question pools.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPools();
    getAdminSections().then(setSections).catch(() => {});
  }, [statusFilter]);

  const handleOpenCreateModal = () => {
    setEditingPool(null);
    setFormData({
      name: '',
      code: '',
      category: '',
      description: '',
      is_active: true,
    });
    setUseCustomCode(false);
    setFormError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (pool: AdminQuestionPool) => {
    setEditingPool(pool);
    setUseCustomCode(true);
    setFormData({
      name: pool.name,
      code: pool.code,
      category: pool.category || '',
      description: pool.description || '',
      is_active: pool.is_active,
    });
    setFormError('');
    setShowFormModal(true);
  };

  const handleSavePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      setFormError('Pool name and unique code are required.');
      return;
    }

    try {
      setSubmittingForm(true);
      setFormError('');

      if (editingPool) {
        await updateAdminQuestionPool(editingPool.id, formData);
      } else {
        await createAdminQuestionPool(formData);
      }

      setShowFormModal(false);
      loadPools();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save question pool.';
      setFormError(msg);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleToggleArchive = async (pool: AdminQuestionPool) => {
    const action = pool.is_active ? 'archive' : 'restore';
    if (!window.confirm(`Are you sure you want to ${action} pool "${pool.name}"?`)) {
      return;
    }
    try {
      await updateAdminQuestionPool(pool.id, { is_active: !pool.is_active });
      loadPools();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} pool.`);
    }
  };

  const handleDeletePool = async (pool: AdminQuestionPool) => {
    if (pool.assessments_count > 0) {
      alert(`Cannot delete pool "${pool.name}" because it is currently linked to ${pool.assessments_count} assessment(s). Unlink it from assessments first.`);
      return;
    }
    if (!window.confirm(`Delete question pool "${pool.name}" (${pool.code})?\n\nThis will remove the pool grouping. Questions inside will safely remain in the Question Bank.`)) {
      return;
    }
    try {
      await deleteAdminQuestionPool(pool.id);
      loadPools();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete question pool.');
    }
  };

  const handleOpenManageQuestions = async (pool: AdminQuestionPool) => {
    setManagingPool(pool);
    try {
      setPoolDetailLoading(true);
      const detail = await getAdminQuestionPoolDetail(pool.id);
      setManagingPool(detail);
    } catch {
      // keep existing
    } finally {
      setPoolDetailLoading(false);
    }
  };

  const handleRemoveQuestionFromPool = async (questionId: number) => {
    if (!managingPool) return;
    try {
      const updated = await removeAdminQuestionFromPool(managingPool.id, questionId);
      setManagingPool(updated);
      loadPools();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove question from pool.');
    }
  };

  const handleOpenCreateMCQInPool = () => {
    setEditingQuestionInPool(null);
    setPoolQuestionType('MCQ');
    setShowPoolQuestionModal(true);
  };

  const handleOpenCreateCodingInPool = () => {
    setEditingQuestionInPool(null);
    setPoolQuestionType('CODING');
    setShowPoolQuestionModal(true);
  };

  const handleOpenPoolCsvImport = (pool?: AdminQuestionPool | null) => {
    const selectedPool = pool || managingPool || pools[0] || null;
    setTargetCsvPoolId(selectedPool ? selectedPool.id : '');
    setPoolCsvStep('UPLOAD');
    setPoolCsvFile(null);
    setPoolCsvText('');
    setPoolCsvAddToGlobal(false);
    setPoolCsvPreview(null);
    setPoolCsvSectionMapping({});
    setPoolCsvError('');
    setPoolCsvResult(null);
    setShowPoolCsvModal(true);
  };

  const handlePreviewPoolCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCsvPoolId) {
      setPoolCsvError('Please select a target Question Pool first.');
      return;
    }
    if (!poolCsvFile && !poolCsvText.trim()) {
      setPoolCsvError('Please select a CSV file or paste CSV text.');
      return;
    }
    setPoolCsvLoading(true);
    setPoolCsvError('');
    try {
      const preview = await previewAdminPoolCSV(
        targetCsvPoolId,
        poolCsvFile || undefined,
        poolCsvText || undefined
      );
      setPoolCsvPreview(preview);
      const initialMapping: Record<string, SectionMappingRule> = {};
      (preview.detected_sections || []).forEach((sec) => {
        const label = sec.detected_name || sec.raw_section || sec.code;
        if (sec.matched_section_id) {
          initialMapping[sec.code] = {
            action: 'map',
            target_section_id: sec.matched_section_id,
            target_section_name: sec.matched_section_name || label,
          };
        } else {
          initialMapping[sec.code] = {
            action: 'create',
            target_section_code: sec.code,
            target_section_name: label,
          };
        }
      });
      setPoolCsvSectionMapping(initialMapping);
      setPoolCsvStep('PREVIEW');
    } catch (err: unknown) {
      setPoolCsvError(formatApiError(err, 'Failed to parse CSV preview for this pool.'));
    } finally {
      setPoolCsvLoading(false);
    }
  };

  const handleCommitPoolCsv = async () => {
    if (!targetCsvPoolId) {
      setPoolCsvError('Please select a target Question Pool.');
      return;
    }
    setPoolCsvLoading(true);
    setPoolCsvError('');
    try {
      const res = await importAdminPoolCSV(targetCsvPoolId, {
        file: poolCsvFile || undefined,
        csvContent: poolCsvText || undefined,
        sectionMapping: poolCsvSectionMapping,
        addToGlobalBank: poolCsvAddToGlobal,
      });
      setPoolCsvResult({
        success: Boolean(res.success),
        imported_count: res.imported_count ?? res.success_count ?? 0,
        error_count: res.error_count ?? 0,
        errors: res.errors || [],
        add_to_global_bank: Boolean(res.add_to_global_bank),
      });
      setPoolCsvStep('RESULT');
      await loadPools();
      if (managingPool && managingPool.id === targetCsvPoolId) {
        const refreshed = await getAdminQuestionPoolDetail(managingPool.id);
        setManagingPool(refreshed);
      }
    } catch (err: unknown) {
      setPoolCsvError(formatApiError(err, 'Pool CSV import failed.'));
    } finally {
      setPoolCsvLoading(false);
    }
  };

  const handleEditQuestionInPool = async (questionId: number) => {
    try {
      setPoolDetailLoading(true);
      const match = await getAdminQuestion(questionId);
      setEditingQuestionInPool(match);
      const isCoding =
        match.question_type === 'CODING' ||
        Boolean(match.has_programming_details) ||
        match.section_type === 'CODING' ||
        match.assessment_type === 'CODING';
      setPoolQuestionType(isCoding ? 'CODING' : 'MCQ');
      setShowPoolQuestionModal(true);
    } catch (err: unknown) {
      alert(formatApiError(err, 'Failed to load question details for editing.'));
    } finally {
      setPoolDetailLoading(false);
    }
  };

  const handleArchiveQuestionInPool = async (questionId: number) => {
    try {
      await archiveAdminQuestion(questionId);
      if (managingPool) {
        const detail = await getAdminQuestionPoolDetail(managingPool.id);
        setManagingPool(detail);
      }
      loadPools();
    } catch {
      alert('Failed to update question archive status.');
    }
  };

  const handleSaveQuestionInPool = async (data: any) => {
    if (!managingPool) return;
    try {
      setSavingPoolQuestion(true);
      if (editingQuestionInPool) {
        await updateAdminQuestion(editingQuestionInPool.id, {
          ...data,
          question_type: data.question_type || poolQuestionType,
        });
      } else {
        await createAdminQuestionInPool(managingPool.id, {
          ...data,
          question_type: data.question_type || poolQuestionType,
        });
      }
      setShowPoolQuestionModal(false);
      setEditingQuestionInPool(null);
      const detail = await getAdminQuestionPoolDetail(managingPool.id);
      setManagingPool(detail);
      loadPools();
    } finally {
      setSavingPoolQuestion(false);
    }
  };

  const handleOpenAddQuestions = async () => {
    if (!managingPool) return;
    setShowAddQuestionsModal(true);
    setSelectedBankQuestionIds([]);
    try {
      setBankLoading(true);
      const data = await getAdminQuestions({ is_active: 'true' });
      // Exclude questions already in the pool
      const existingQIds = new Set((managingPool.items || []).map((it) => it.question));
      setBankQuestions(data.filter((q) => !existingQIds.has(q.id)));
    } catch {
      alert('Failed to load question bank.');
    } finally {
      setBankLoading(false);
    }
  };

  const handleAddSelectedQuestionsToPool = async () => {
    if (!managingPool || selectedBankQuestionIds.length === 0) return;
    try {
      setAddingToPool(true);
      const updated = await manageAdminQuestionPoolItems(
        managingPool.id,
        selectedBankQuestionIds,
        'add'
      );
      setManagingPool(updated);
      setShowAddQuestionsModal(false);
      setSelectedBankQuestionIds([]);
      loadPools();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add questions to pool.');
    } finally {
      setAddingToPool(false);
    }
  };

  // Filter bank questions in picker
  const filteredBankQuestions = bankQuestions.filter((q) => {
    if (bankSectionFilter) {
      const filterUpper = bankSectionFilter.trim().toUpperCase();
      const qType = (q.section_type || '').trim().toUpperCase();
      const qName = (q.section_name || '').trim().toUpperCase();
      if (qType !== filterUpper && qName !== filterUpper) return false;
    }
    if (bankSearch.trim()) {
      const s = bankSearch.toLowerCase();
      return (
        q.prompt.toLowerCase().includes(s) ||
        (q.category || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  // Calculate statistics
  const totalPoolsCount = pools.length;
  const activePoolsCount = pools.filter((p) => p.is_active).length;
  const totalQuestionsInPools = pools.reduce((acc, p) => acc + (p.questions_count || 0), 0);

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* ─── PAGE TITLE (Mockup 5) ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '44px',
            fontWeight: 900,
            color: '#0F172A',
            margin: 0,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          Question Bank
        </h1>

        {onViewCentralBank && (
          <button
            type="button"
            onClick={onViewCentralBank}
            style={{
              padding: '8px 16px',
              backgroundColor: '#FFFFFF',
              color: '#0D52D6',
              border: '1.5px solid #0D52D6',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Central Question Repository →</span>
          </button>
        )}
      </div>

      {/* ─── 4 ODOMETER COUNTERS (Mockup 5) ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <OdometerCard label="Pools" value={totalPoolsCount} />
        <OdometerCard label="Active" value={activePoolsCount} />
        <OdometerCard
          label="Action Required"
          value={pools.filter((p) => (p.questions_count || 0) === 0).length}
        />
        <OdometerCard label="Bank Strength" value={totalQuestionsInPools} />
      </div>

      {/* ─── SEARCH & FILTER PILL BAR (Mockup 5) ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {/* Grid/List View Toggle */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setViewLayout('GRID')}
            title="Grid View"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: viewLayout === 'GRID' ? '#0D52D6' : '#FFFFFF',
              color: viewLayout === 'GRID' ? '#FFFFFF' : '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewLayout('LIST')}
            title="List View"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: viewLayout === 'LIST' ? '#0D52D6' : '#FFFFFF',
              color: viewLayout === 'LIST' ? '#FFFFFF' : '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Pill Search Input with integrated icon */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                loadPools();
              }
            }}
            style={{
              width: '100%',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #CBD5E1',
              borderRadius: '24px',
              padding: '10px 42px 10px 18px',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
              color: '#1E293B',
            }}
          />
          <button
            type="button"
            onClick={loadPools}
            style={{
              position: 'absolute',
              right: '4px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#0D52D6',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>

        {/* All Statuses Pill Dropdown */}
        <div style={{ position: 'relative' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'ARCHIVED')}
            style={{
              appearance: 'none',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #CBD5E1',
              borderRadius: '24px',
              padding: '10px 36px 10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#1E293B',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <div
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: '#0D52D6',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
      </div>

      {/* ─── ACTION BUTTONS ROW (Mockup 5) ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '26px',
        }}
      >
        {/* Bulk Action Toggle */}
        <div
          style={{
            backgroundColor: '#CBD5E1',
            borderRadius: '20px',
            padding: '4px 10px 4px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            fontWeight: 800,
            color: '#1E293B',
          }}
        >
          <span>Bulk Action</span>
          <input
            type="checkbox"
            checked={bulkActionActive}
            onChange={(e) => setBulkActionActive(e.target.checked)}
            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
          />
        </div>

        {/* Create New Question Button (Mockup 5) */}
        <button
          type="button"
          onClick={() => {
            if (onCreateQuestion) {
              onCreateQuestion();
            } else {
              handleOpenCreateModal();
            }
          }}
          style={{
            backgroundColor: '#0D52D6',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '20px',
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(13, 82, 214, 0.25)',
          }}
        >
          Create New Question
        </button>

        {/* Create New Pool Button */}
        <button
          type="button"
          onClick={handleOpenCreateModal}
          style={{
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '20px',
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          + Create Pool
        </button>

        {/* Pool-Scoped Import CSV Button */}
        <button
          type="button"
          onClick={() => handleOpenPoolCsvImport(managingPool || pools[0] || null)}
          style={{
            backgroundColor: '#22C55E',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '20px',
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(34, 197, 94, 0.25)',
          }}
        >
          Import CSV
        </button>
      </div>

      {/* ─── POOLS DISPLAY: GRID (Mockup 5) OR LIST ─── */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
          Loading Question Pools from PostgreSQL...
        </div>
      ) : error ? (
        <div style={{ padding: '24px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '16px', color: '#DC2626' }}>
          {error}
        </div>
      ) : pools.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '24px',
            border: '1px solid #E2E8F0',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
            No Question Pools Created
          </div>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px 0' }}>
            Question Pools organize questions into reusable curriculum modules for assessments.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            style={{
              padding: '10px 22px',
              backgroundColor: '#0D52D6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Create Question Pool
          </button>
        </div>
      ) : viewLayout === 'GRID' ? (
        /* ─── QUESTION POOLS CARD GRID (Mockup 5) ─── */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '20px',
          }}
        >
          {pools.map((pool) => {
            const count = pool.questions_count || 0;
            const statusLabel = count >= 10 ? 'Sufficient' : count > 0 ? 'Insufficient' : 'Empty';
            const statusBg = count >= 10 ? '#D1FAE5' : count > 0 ? '#FEF3C7' : '#F1F5F9';
            const statusColor = count >= 10 ? '#065F46' : count > 0 ? '#92400E' : '#64748B';

            return (
              <div
                key={pool.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '24px',
                  border: '1px solid #CBD5E1',
                  padding: '24px 22px 20px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '230px',
                }}
              >
                {/* Blue Folded Corner Ribbon Accent (Mockup 5) */}
                <svg
                  style={{ position: 'absolute', top: 0, right: 0 }}
                  width="46"
                  height="46"
                  viewBox="0 0 46 46"
                  fill="none"
                >
                  <path d="M0 0 L46 0 L46 46 Z" fill="#0D52D6" />
                </svg>

                {/* Pool Title & Actions */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: '24px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', lineHeight: 1.25 }}>
                      {pool.name}
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>
                    {pool.code} {pool.category ? `• ${pool.category}` : ''}
                  </div>

                  {/* Questions Available Box (Mockup 5) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '16px',
                      marginBottom: '12px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>
                      Questions<br />Available
                    </span>

                    {/* Recessed Digital Display */}
                    <div
                      style={{
                        backgroundColor: '#8C96A6',
                        border: '1.5px solid #788291',
                        borderRadius: '12px',
                        padding: '4px 14px',
                        minWidth: '60px',
                        textAlign: 'center',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '32px',
                          fontWeight: 900,
                          color: '#0F172A',
                          lineHeight: 1,
                        }}
                      >
                        {String(count).padStart(2, '0')}
                      </span>
                    </div>
                  </div>

                  {/* Status Row (Mockup 5) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>
                      Status
                    </span>

                    <span
                      style={{
                        backgroundColor: statusBg,
                        color: statusColor,
                        padding: '4px 14px',
                        borderRadius: '16px',
                        fontSize: '11px',
                        fontWeight: 800,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {/* Manage Pool Button & Auxiliary Actions (Mockup 5) */}
                <div>
                  <button
                    type="button"
                    onClick={() => handleOpenManageQuestions(pool)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0D52D6',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '20px',
                      padding: '10px 0',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: '0 2px 6px rgba(13, 82, 214, 0.25)',
                      transition: 'opacity 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Manage Pool
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenPoolCsvImport(pool)}
                      style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 700, color: '#059669', cursor: 'pointer' }}
                    >
                      Import CSV
                    </button>
                    <span style={{ color: '#CBD5E1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(pool)}
                      style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                    >
                      Edit Details
                    </button>
                    <span style={{ color: '#CBD5E1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => handleToggleArchive(pool)}
                      style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 700, color: pool.is_active ? '#D97706' : '#16A34A', cursor: 'pointer' }}
                    >
                      {pool.is_active ? 'Archive' : 'Restore'}
                    </button>
                    <span style={{ color: '#CBD5E1' }}>•</span>
                    <button
                      type="button"
                      onClick={() => handleDeletePool(pool)}
                      disabled={pool.assessments_count > 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: pool.assessments_count > 0 ? '#CBD5E1' : '#DC2626',
                        cursor: pool.assessments_count > 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── POOLS TABLE (LIST VIEW) ─── */
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#0D52D6', color: '#FFFFFF' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Pool Name & Code</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Category</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Questions</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Linked Assessments</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => (
                <tr key={pool.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A' }}>{pool.name}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>{pool.code}</div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569' }}>{pool.category || 'General'}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 800 }}>{pool.questions_count}</td>
                  <td style={{ padding: '14px 16px', color: '#475569' }}>{pool.assessments_count}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: pool.is_active ? '#DCFCE7' : '#F1F5F9',
                        color: pool.is_active ? '#15803D' : '#64748B',
                      }}
                    >
                      {pool.is_active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenPoolCsvImport(pool)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#ECFDF5',
                          color: '#065F46',
                          border: '1px solid #A7F3D0',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Import CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenManageQuestions(pool)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#0D52D6',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Manage Pool
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── CREATE / EDIT POOL MODAL ─── */}
      {showFormModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                {editingPool ? 'Edit Question Pool' : 'Create Question Pool'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  color: '#DC2626',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSavePool} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Pool Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Core Java Assessment Pool"
                  value={formData.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      name: val,
                      code: useCustomCode ? prev.code : generateCodeFromTitle(val, 24),
                    }));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Unique Code *
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#0052CC', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={useCustomCode}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseCustomCode(checked);
                        if (!checked) {
                          setFormData((prev) => ({ ...prev, code: generateCodeFromTitle(prev.name, 24) }));
                        }
                      }}
                      style={{ accentColor: '#0052CC', cursor: 'pointer' }}
                    />
                    Custom
                  </label>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. POOL-JAVA-01"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                    backgroundColor: useCustomCode ? '#FFFFFF' : '#F8FAFC',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Category (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Technical, Aptitude, Soft Skills"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the topics and purpose of this pool..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="poolActiveCheck"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <label htmlFor="poolActiveCheck" style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                  Active (Available for assessment assignment)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingForm}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: '#1455B8',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: submittingForm ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingForm ? 'Saving...' : editingPool ? 'Update Pool' : 'Create Pool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MANAGE QUESTIONS MODAL ─── */}
      {managingPool && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                    {managingPool.name}
                  </h3>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: '4px' }}>
                    {managingPool.code}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {managingPool.questions_count} questions in this pool • Linked to {managingPool.assessments_count} assessments
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleOpenCreateMCQInPool}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#0D52D6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>+ Create MCQ</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenCreateCodingInPool}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#7C3AED',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>+ Create Coding</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenPoolCsvImport(managingPool)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#ECFDF5',
                    color: '#065F46',
                    border: '1px solid #A7F3D0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Import CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddQuestions}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#F1F5F9',
                    color: '#1E293B',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>+ Add from Bank</span>
                </button>
                <button
                  type="button"
                  onClick={() => setManagingPool(null)}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Questions Table */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              {/* Linked Assessments Section (Phase 2.2.4) */}
              {managingPool.linked_assessments && managingPool.linked_assessments.length > 0 && (
                <div style={{ marginBottom: '16px', padding: '12px 14px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                    Linked Assessments ({managingPool.linked_assessments.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {managingPool.linked_assessments.map((la) => (
                      <div
                        key={la.assessment_id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <div>
                          <strong style={{ color: '#0F172A' }}>{la.assessment_title}</strong>{' '}
                          <span style={{ fontFamily: 'monospace', color: '#64748B' }}>({la.assessment_code})</span>
                          <span style={{ marginLeft: '8px', color: '#0052CC', fontSize: '11px', fontWeight: 600 }}>
                            Section: {la.section_name} • Quota: {la.question_count} Qs
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToAssessment) {
                              onNavigateToAssessment(la.assessment_id);
                            } else {
                              window.location.href = `/csl-admin/?tab=assessments&assessmentId=${la.assessment_id}`;
                            }
                          }}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#0052CC',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Open Assessment ↗
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {poolDetailLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                  Loading pool questions...
                </div>
              ) : !managingPool.items || managingPool.items.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '30px', marginBottom: '8px' }}>📝</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                    This pool currently has no questions
                  </div>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
                    Add questions from the independent Question Bank to populate this pool.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenPoolCsvImport(managingPool)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#16A34A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Import CSV to Pool
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenAddQuestions}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#1455B8',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      + Add Questions from Bank
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Drawer Filters Bar */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Filter by prompt or category..."
                      value={drawerSearch}
                      onChange={(e) => setDrawerSearch(e.target.value)}
                      style={{
                        flex: '1',
                        minWidth: '180px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                      }}
                    />
                    <select
                      value={drawerSectionFilter}
                      onChange={(e) => setDrawerSectionFilter(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <option value="">All Sections</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.code}>{s.name || s.code}</option>
                      ))}
                      <option value="CODING">Coding</option>
                    </select>
                    <select
                      value={drawerDifficultyFilter}
                      onChange={(e) => setDrawerDifficultyFilter(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <option value="">All Difficulties</option>
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                    {(drawerSearch || drawerSectionFilter || drawerDifficultyFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerSearch('');
                          setDrawerSectionFilter('');
                          setDrawerDifficultyFilter('');
                        }}
                        style={{
                          padding: '5px 8px',
                          fontSize: '11px',
                          backgroundColor: '#F1F5F9',
                          border: '1px solid #E2E8F0',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '40px' }}>#</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Prompt</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '110px' }}>Section</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '80px' }}>Difficulty</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '50px' }}>Marks</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '70px' }}>Status</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '190px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(managingPool.items || []).filter((item) => {
                        if (drawerSearch.trim()) {
                          const s = drawerSearch.toLowerCase();
                          const matchPrompt = (item.question_prompt || '').toLowerCase().includes(s);
                          const matchCat = (item.question_category || '').toLowerCase().includes(s);
                          if (!matchPrompt && !matchCat) return false;
                        }
                        if (drawerSectionFilter) {
                          const f = drawerSectionFilter.toUpperCase();
                          if ((item.question_section || '').toUpperCase() !== f) return false;
                        }
                        if (drawerDifficultyFilter) {
                          if ((item.question_difficulty || '').toUpperCase() !== drawerDifficultyFilter.toUpperCase()) return false;
                        }
                        return true;
                      }).map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 12px', color: '#94A3B8', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '10px 12px', color: '#0F172A', fontWeight: 500, maxWidth: '280px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {(item.has_programming_details || item.question_section === 'CODING' || item.question_assessment_type === 'CODING') && (
                                <span style={{ backgroundColor: '#EDE9FE', color: '#7C3AED', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                                  CODING
                                </span>
                              )}
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.question_prompt}
                              </span>
                            </div>
                            {item.question_category && (
                              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                Cat: {item.question_category}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ backgroundColor: '#F1F5F9', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                              {item.question_section}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: item.question_difficulty === 'HARD' ? '#DC2626' : item.question_difficulty === 'MEDIUM' ? '#D97706' : '#16A34A',
                              }}
                            >
                              {item.question_difficulty}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0B2E6F' }}>
                            {item.question_marks}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: item.question_is_archived ? '#94A3B8' : '#16A34A',
                              }}
                            >
                              {item.question_is_archived ? 'Archived' : 'Active'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleEditQuestionInPool(item.question)}
                                title="Edit question details"
                                style={{
                                  padding: '3px 8px',
                                  backgroundColor: '#EFF6FF',
                                  border: '1px solid #BFDBFE',
                                  color: '#1D4ED8',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleArchiveQuestionInPool(item.question)}
                                title={item.question_is_archived ? "Unarchive question" : "Archive question"}
                                style={{
                                  padding: '3px 8px',
                                  backgroundColor: item.question_is_archived ? '#FEF3C7' : '#F1F5F9',
                                  border: '1px solid #CBD5E1',
                                  color: item.question_is_archived ? '#92400E' : '#475569',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {item.question_is_archived ? 'Unarchive' : 'Archive'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveQuestionFromPool(item.question)}
                                title="Remove question from pool (retains in Question Bank)"
                                style={{
                                  padding: '3px 8px',
                                  backgroundColor: '#FEF2F2',
                                  border: '1px solid #FECACA',
                                  color: '#DC2626',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: '#F8FAFC',
              }}
            >
              <button
                type="button"
                onClick={() => setManagingPool(null)}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD QUESTIONS FROM BANK PICKER MODAL ─── */}
      {showAddQuestionsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Add Questions to "{managingPool?.name}"
                </h4>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Select questions from the independent Question Bank to add to this pool.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddQuestionsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {/* Filter controls */}
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
              }}
            >
              <input
                type="text"
                placeholder="Search question prompt..."
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '200px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  outline: 'none',
                }}
              />
              <select
                value={bankSectionFilter}
                onChange={(e) => setBankSectionFilter(e.target.value)}
                style={{
                  padding: '7px 10px',
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="">All Curriculum Sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  if (selectedBankQuestionIds.length === filteredBankQuestions.length) {
                    setSelectedBankQuestionIds([]);
                  } else {
                    setSelectedBankQuestionIds(filteredBankQuestions.map((q) => q.id));
                  }
                }}
                style={{
                  padding: '7px 12px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#334155',
                }}
              >
                {selectedBankQuestionIds.length === filteredBankQuestions.length && filteredBankQuestions.length > 0
                  ? 'Deselect All'
                  : 'Select All Filtered'}
              </button>
            </div>

            {/* Questions list */}
            <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
              {bankLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>
                  Loading available questions...
                </div>
              ) : filteredBankQuestions.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>
                  No available questions found matching your filter.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredBankQuestions.map((q) => {
                    const isChecked = selectedBankQuestionIds.includes(q.id);
                    return (
                      <div
                        key={q.id}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedBankQuestionIds(selectedBankQuestionIds.filter((id) => id !== q.id));
                          } else {
                            setSelectedBankQuestionIds([...selectedBankQuestionIds, q.id]);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: isChecked ? '1.5px solid #1455B8' : '1px solid #E2E8F0',
                          backgroundColor: isChecked ? '#EFF6FF' : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent div
                          style={{ marginTop: '3px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>
                            {q.prompt}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#F1F5F9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                              {q.section_name || q.section_type}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748B' }}>
                              {q.marks || 1} mark(s)
                            </span>
                            <span style={{ fontSize: '11px', color: q.difficulty === 'HARD' ? '#DC2626' : '#16A34A', fontWeight: 600 }}>
                              {q.difficulty}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                {selectedBankQuestionIds.length} question(s) selected
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddQuestionsModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedQuestionsToPool}
                  disabled={selectedBankQuestionIds.length === 0 || addingToPool}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: '#1455B8',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: selectedBankQuestionIds.length === 0 || addingToPool ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addingToPool ? 'Adding...' : `Add (${selectedBankQuestionIds.length}) Questions`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Direct Authoring Modal for Question Pools */}
      {showPoolQuestionModal && (
        <AdminQuestionEditorModal
          question={editingQuestionInPool}
          isOpen={showPoolQuestionModal}
          onClose={() => {
            setShowPoolQuestionModal(false);
            setEditingQuestionInPool(null);
          }}
          onSave={handleSaveQuestionInPool}
          saving={savingPoolQuestion}
          sections={sections}
          forcedType={editingQuestionInPool ? undefined : poolQuestionType}
        />
      )}

      {/* Pool-Scoped CSV Import Modal */}
      {showPoolCsvModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0B2E6F' }}>
                  Import Questions CSV to Pool
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748B' }}>
                  Imported questions are scoped ONLY to the selected pool by default and do not clutter Global Question Bank unless opted in below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPoolCsvModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748B', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {poolCsvError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '12.5px', fontWeight: 600, marginBottom: '14px' }}>
                {poolCsvError}
              </div>
            )}

            {poolCsvStep === 'UPLOAD' && (
              <form onSubmit={handlePreviewPoolCsv} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Target Question Pool *
                  </label>
                  <select
                    value={targetCsvPoolId}
                    onChange={(e) => setTargetCsvPoolId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#F8FAFC' }}
                  >
                    <option value="">-- Select Target Pool --</option>
                    {pools.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name} ({p.questions_count} existing questions)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Upload CSV File (.csv)
                  </label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setPoolCsvFile(e.target.files?.[0] || null)}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px dashed #CBD5E1', backgroundColor: '#F8FAFC', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Or Paste CSV Content Directly
                  </label>
                  <textarea
                    rows={5}
                    value={poolCsvText}
                    onChange={(e) => setPoolCsvText(e.target.value)}
                    placeholder="prompt,section_type,difficulty,option_a,option_b,option_c,option_d,correct_option,marks"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', fontSize: '12.5px', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={poolCsvAddToGlobal}
                    onChange={(e) => setPoolCsvAddToGlobal(e.target.checked)}
                    data-testid="pool-csv-add-global-checkbox"
                  />
                  <span>Also add imported questions to the Global Question Bank</span>
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setShowPoolCsvModal(false)}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={poolCsvLoading}
                    style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#0D52D6', color: '#FFFFFF', fontWeight: 700, fontSize: '13px', cursor: poolCsvLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {poolCsvLoading ? 'Analyzing CSV...' : 'Preview & Validate →'}
                  </button>
                </div>
              </form>
            )}

            {poolCsvStep === 'PREVIEW' && poolCsvPreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '13px', color: '#1E40AF' }}>
                  <strong>{poolCsvPreview.valid_count ?? poolCsvPreview.total_rows}</strong> valid of{' '}
                  <strong>{poolCsvPreview.total_rows}</strong> row(s) • Detected Type:{' '}
                  <strong>{poolCsvPreview.detected_type || 'MCQ'}</strong> • Scope:{' '}
                  <strong>{poolCsvAddToGlobal ? 'Pool + Global Bank' : 'Pool-Scoped Only'}</strong>
                </div>

                {poolCsvPreview.errors && poolCsvPreview.errors.length > 0 && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', fontSize: '12px', color: '#991B1B' }}>
                    <strong>Row Warnings ({poolCsvPreview.error_count ?? poolCsvPreview.errors.length}):</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {poolCsvPreview.errors.map((err, i) => (
                        <li key={i}>
                          {typeof err === 'string'
                            ? err
                            : `Row ${err?.row ?? '?'}: ${err?.error ?? JSON.stringify(err)}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {poolCsvPreview.detected_sections && poolCsvPreview.detected_sections.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {poolCsvPreview.detected_sections.map((sec) => {
                      const rule = poolCsvSectionMapping[sec.code] || { action: 'create' };
                      return (
                        <div key={sec.code} style={{ border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px 12px', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '12.5px' }}>
                            <strong>[{sec.code}]</strong> {sec.detected_name || sec.raw_section} ({sec.row_count ?? sec.count} rows)
                          </div>
                          <select
                            value={rule.action}
                            onChange={(e) => {
                              const action = e.target.value as 'map' | 'create' | 'skip';
                              setPoolCsvSectionMapping((prev) => ({
                                ...prev,
                                [sec.code]: {
                                  ...prev[sec.code],
                                  action,
                                  target_section_id: action === 'map' ? sections[0]?.id : undefined,
                                  target_section_code: action === 'create' ? sec.code : undefined,
                                  target_section_name: action === 'create' ? (sec.detected_name || sec.raw_section || sec.code) : undefined,
                                },
                              }));
                            }}
                            style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', backgroundColor: '#FFFFFF' }}
                          >
                            <option value="map">Map to Existing Section</option>
                            <option value="create">Create Section</option>
                            <option value="skip">Skip Rows</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', fontSize: '12.5px', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={poolCsvAddToGlobal}
                    onChange={(e) => setPoolCsvAddToGlobal(e.target.checked)}
                  />
                  <span>Also add imported questions to the Global Question Bank</span>
                </label>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setPoolCsvStep('UPLOAD')}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    disabled={poolCsvLoading}
                    onClick={handleCommitPoolCsv}
                    style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#16A34A', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: poolCsvLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {poolCsvLoading ? 'Importing...' : 'Confirm & Import to Pool'}
                  </button>
                </div>
              </div>
            )}

            {poolCsvStep === 'RESULT' && poolCsvResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: poolCsvResult.error_count > 0 ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${poolCsvResult.error_count > 0 ? '#FDE68A' : '#BBF7D0'}`, fontSize: '13px', color: '#0F172A' }}>
                  <strong>
                    Imported {poolCsvResult.imported_count} question(s) into pool
                  </strong>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                    Scope: {poolCsvResult.add_to_global_bank ? 'Pool + Global Question Bank' : 'Pool-Scoped Only (isolated from Global Question Bank)'}
                  </div>
                  {poolCsvResult.error_count > 0 && (
                    <ul style={{ margin: '8px 0 0 16px', padding: 0, color: '#991B1B', fontSize: '12px' }}>
                      {poolCsvResult.errors.map((err, i) => (
                        <li key={i}>
                          {typeof err === 'string'
                            ? err
                            : `Row ${err?.row ?? '?'}: ${err?.error ?? JSON.stringify(err)}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowPoolCsvModal(false)}
                    style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#0B2E6F', color: '#FFFFFF', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
