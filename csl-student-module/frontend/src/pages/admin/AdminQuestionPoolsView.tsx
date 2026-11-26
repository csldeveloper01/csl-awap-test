import { useState, useEffect, useCallback } from 'react';
import {
  getAdminQuestionPools,
  createAdminQuestionPool,
  getAdminQuestionPoolDetail,
  updateAdminQuestionPool,
  deleteAdminQuestionPool,
  reconcileAdminQuestionPool,
  manageAdminQuestionPoolItems,
  getAdminQuestions,
  getAdminQuestion,
  getAdminSections,
  archiveAdminQuestion,
  updateAdminQuestion,
  createAdminQuestion,
  createAdminQuestionInPool,
  removeAdminQuestionFromPool,
  previewAdminPoolCSV,
  importAdminPoolCSV,
  type AdminQuestionPool,
  type AdminQuestion,
  type AdminSection,
  type CSVImportPreviewResponse,
  type SectionMappingRule,
  type PoolQuestionType,
} from '../../api/admin';
import { AdminQuestionEditorModal, isCodingQuestion } from './AdminQuestionEditorModal';
import { AdminCodingQuestionModal } from './AdminCodingQuestionModal';
import { ImportCodingJsonModal } from './ImportCodingJsonModal';
import { formatApiError } from '../../utils/errorFormatter';
import { useAdminTheme } from '../../utils/adminTheme';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { PageContainer, SectionHeader } from '../../components/ui';

interface AdminQuestionPoolsViewProps {
  onCreateQuestion?: () => void;
  onCreateMcqQuestion?: () => void;
  onCreateCodingQuestion?: () => void;
  onImportCSV?: () => void;
  onViewCentralBank?: () => void;
  onNavigateToAssessment?: (assessmentId: string) => void;
}

export function AdminQuestionPoolsView({
  onCreateMcqQuestion,
  onCreateCodingQuestion,
  onViewCentralBank,
  onNavigateToAssessment,
}: AdminQuestionPoolsViewProps = {}) {
  const { tokens } = useAdminTheme();

  const [pools, setPools] = useState<AdminQuestionPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');

  // Layout & Filters
  const [viewLayout, setViewLayout] = useState<'GRID' | 'LIST'>('GRID');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'MCQ' | 'CODING' | 'UNCLASSIFIED'>('ALL');

  // Create / Edit Pool Modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPool, setEditingPool] = useState<AdminQuestionPool | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    code: string;
    question_type: PoolQuestionType;
    category: string;
    description: string;
    is_active: boolean;
  }>({
    name: '',
    code: '',
    question_type: 'MCQ',
    category: '',
    description: '',
    is_active: true,
  });
  const [submittingForm, setSubmittingForm] = useState(false);
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [formError, setFormError] = useState('');

  // Standalone Question Creation Fallback Modal (when component used without parent callbacks)
  const [standaloneQuestionModal, setStandaloneQuestionModal] = useState<'MCQ' | 'CODING' | null>(null);
  const [savingStandaloneQuestion, setSavingStandaloneQuestion] = useState(false);

  // Manage Pool Drawer / Modal
  const [managingPool, setManagingPool] = useState<AdminQuestionPool | null>(null);
  const [poolDetailLoading, setPoolDetailLoading] = useState(false);
  const [drawerNotice, setDrawerNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [reconciling, setReconciling] = useState(false);

  // Pool-scoped Question Authoring (MCQ or Coding strictly by pool type)
  const [showPoolQuestionModal, setShowPoolQuestionModal] = useState(false);
  const [poolQuestionType, setPoolQuestionType] = useState<PoolQuestionType>('MCQ');
  const [editingQuestionInPool, setEditingQuestionInPool] = useState<AdminQuestion | null>(null);
  const [savingPoolQuestion, setSavingPoolQuestion] = useState(false);

  // Pool-Scoped MCQ CSV Import Modal
  const [showPoolCsvModal, setShowPoolCsvModal] = useState(false);
  const [targetCsvPoolId, setTargetCsvPoolId] = useState<string>('');
  const [poolCsvStep, setPoolCsvStep] = useState<'UPLOAD' | 'PREVIEW' | 'RESULT'>('UPLOAD');
  const [poolCsvFile, setPoolCsvFile] = useState<File | null>(null);
  const [poolCsvText, setPoolCsvText] = useState('');
  const [poolCsvAddToGlobal, setPoolCsvAddToGlobal] = useState(false);
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

  // Pool-Scoped Coding JSON Import Modal
  const [codingImportPool, setCodingImportPool] = useState<AdminQuestionPool | null>(null);

  // Drawer Filters
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerSectionFilter, setDrawerSectionFilter] = useState('');
  const [drawerDifficultyFilter, setDrawerDifficultyFilter] = useState('');

  // Add Questions from Bank Picker Modal
  const [showAddQuestionsModal, setShowAddQuestionsModal] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<AdminQuestion[]>([]);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [bankSectionFilter, setBankSectionFilter] = useState('');
  const [showIncompatibleBank, setShowIncompatibleBank] = useState(false);
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<number[]>([]);
  const [addingToPool, setAddingToPool] = useState(false);
  const [bankModalError, setBankModalError] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? '' : prev)), 4000);
  };

  const loadPools = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: {
        q?: string;
        is_active?: boolean;
        question_type?: PoolQuestionType | 'UNCLASSIFIED';
      } = {};
      if (search.trim()) params.q = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = true;
      if (statusFilter === 'ARCHIVED') params.is_active = false;
      if (typeFilter !== 'ALL') params.question_type = typeFilter;

      const data = await getAdminQuestionPools(params);
      setPools(data);
    } catch (err: unknown) {
      setError(formatApiError(err, 'Failed to load question pools.'));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    loadPools();
    getAdminSections().then(setSections).catch(() => {});
  }, [loadPools]);

  const generatePoolCode = (name: string) =>
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 28);

  const handleOpenCreateModal = () => {
    setEditingPool(null);
    setFormData({
      name: '',
      code: '',
      question_type: 'MCQ',
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
      question_type: pool.question_type || ((pool.coding_count || 0) > 0 && (pool.mcq_count || 0) === 0 ? 'CODING' : 'MCQ'),
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
    if (formData.question_type !== 'MCQ' && formData.question_type !== 'CODING') {
      setFormError('Please select whether this pool holds MCQ or CODING questions.');
      return;
    }

    try {
      setSubmittingForm(true);
      setFormError('');

      if (editingPool) {
        const updated = await updateAdminQuestionPool(editingPool.id, formData);
        if (managingPool && managingPool.id === updated.id) {
          const detail = await getAdminQuestionPoolDetail(updated.id);
          setManagingPool(detail);
        }
        showToast(`Pool "${updated.name}" updated.`);
      } else {
        const created = await createAdminQuestionPool(formData);
        showToast(`Created ${created.question_type} pool "${created.name}".`);
      }

      setShowFormModal(false);
      await loadPools();
    } catch (err: unknown) {
      setFormError(formatApiError(err, 'Failed to save question pool.'));
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleClassifyOrReconcilePool = async (pool: AdminQuestionPool, targetType: PoolQuestionType) => {
    const isMixed = Boolean(pool.is_mixed) || ((pool.mcq_count || 0) > 0 && (pool.coding_count || 0) > 0);
    if (isMixed) {
      const incompatibleCount = targetType === 'MCQ' ? (pool.coding_count || 0) : (pool.mcq_count || 0);
      const ok = window.confirm(
        `Classify "${pool.name}" as a ${targetType} pool and detach ${incompatibleCount} incompatible question(s) from this pool?\n\nDetached questions remain safely stored in the Global Question Bank.`
      );
      if (!ok) return;
    }
    try {
      setReconciling(true);
      setDrawerNotice(null);
      const res = await reconcileAdminQuestionPool(pool.id, targetType, true);
      setManagingPool(res.pool);
      await loadPools();
      setDrawerNotice({
        type: 'success',
        text:
          res.detached_count > 0
            ? `Pool classified as ${targetType}; ${res.detached_count} incompatible item(s) detached cleanly.`
            : `Pool classified as ${targetType}.`,
      });
    } catch (err: unknown) {
      setDrawerNotice({ type: 'error', text: formatApiError(err, 'Failed to classify pool.') });
    } finally {
      setReconciling(false);
    }
  };

  const handleToggleArchive = async (pool: AdminQuestionPool) => {
    const action = pool.is_active ? 'archive' : 'restore';
    if (!window.confirm(`Are you sure you want to ${action} pool "${pool.name}"?`)) {
      return;
    }
    try {
      await updateAdminQuestionPool(pool.id, { is_active: !pool.is_active });
      await loadPools();
      showToast(`Pool "${pool.name}" ${action}d.`);
    } catch (err: unknown) {
      setError(formatApiError(err, `Failed to ${action} pool.`));
    }
  };

  const handleDeletePool = async (pool: AdminQuestionPool) => {
    if (pool.assessments_count > 0) {
      setError(`Cannot delete pool "${pool.name}" because it is linked to ${pool.assessments_count} assessment(s).`);
      return;
    }
    if (!window.confirm(`Delete question pool "${pool.name}" (${pool.code})?\n\nQuestions inside remain safely in the Question Bank.`)) {
      return;
    }
    try {
      await deleteAdminQuestionPool(pool.id);
      if (managingPool?.id === pool.id) setManagingPool(null);
      await loadPools();
      showToast(`Deleted pool "${pool.name}".`);
    } catch (err: unknown) {
      setError(formatApiError(err, 'Failed to delete question pool.'));
    }
  };

  const handleOpenManageQuestions = async (pool: AdminQuestionPool) => {
    setManagingPool(pool);
    setDrawerNotice(null);
    setDrawerSearch('');
    setDrawerSectionFilter('');
    setDrawerDifficultyFilter('');
    try {
      setPoolDetailLoading(true);
      const detail = await getAdminQuestionPoolDetail(pool.id);
      setManagingPool(detail);
    } catch {
      // keep summary
    } finally {
      setPoolDetailLoading(false);
    }
  };

  const handleRemoveQuestionFromPool = async (questionId: number) => {
    if (!managingPool) return;
    try {
      const updated = await removeAdminQuestionFromPool(managingPool.id, questionId);
      setManagingPool(updated);
      await loadPools();
      setDrawerNotice({ type: 'success', text: `Removed question #${questionId} from pool (preserved in Question Bank).` });
    } catch (err: unknown) {
      setDrawerNotice({ type: 'error', text: formatApiError(err, 'Failed to remove question from pool.') });
    }
  };

  const handleOpenCreateMCQInPool = () => {
    if (!managingPool || managingPool.question_type !== 'MCQ') return;
    setEditingQuestionInPool(null);
    setPoolQuestionType('MCQ');
    setShowPoolQuestionModal(true);
  };

  const handleOpenCreateCodingInPool = () => {
    if (!managingPool || managingPool.question_type !== 'CODING') return;
    setEditingQuestionInPool(null);
    setPoolQuestionType('CODING');
    setShowPoolQuestionModal(true);
  };

  // Unified Import Handler (B1): chooses CSV or Coding JSON strictly by Pool Type
  const handleOpenUnifiedImport = async (pool?: AdminQuestionPool | null) => {
    const target = pool || managingPool || pools.find((p) => p.question_type !== null) || pools[0] || null;
    if (!target) {
      setError('Create a Question Pool first before importing questions.');
      return;
    }
    if (!target.question_type) {
      await handleOpenManageQuestions(target);
      setDrawerNotice({
        type: 'error',
        text: 'Classify this pool as MCQ or CODING before importing questions.',
      });
      return;
    }
    if (target.question_type === 'CODING') {
      setCodingImportPool(target);
      return;
    }
    // MCQ Pool -> CSV Import
    setTargetCsvPoolId(target.id);
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
      setPoolCsvError('Please select a target MCQ Question Pool first.');
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
      if ((preview.detected_type || '').toUpperCase() === 'CODING') {
        setPoolCsvError('Detected CODING CSV content. MCQ pools accept only MCQ CSV files.');
        setPoolCsvPreview(null);
        return;
      }
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

  const hasUnresolvedPoolCsvSections = Boolean(
    poolCsvPreview?.detected_sections?.some((sec) => {
      if (sec.matched_section_id) return false;
      const rule = poolCsvSectionMapping[sec.code];
      if (!rule) return true;
      if (rule.action === 'skip') return false;
      if (rule.action === 'map') return !rule.target_section_id;
      if (rule.action === 'create') return !((rule.target_section_name || '').trim() && (rule.target_section_code || '').trim());
      return true;
    })
  );

  const handleCommitPoolCsv = async () => {
    if (!targetCsvPoolId || !poolCsvPreview) return;
    if ((poolCsvPreview.valid_count ?? poolCsvPreview.total_rows ?? 0) === 0) {
      setPoolCsvError('No valid rows detected. Fix CSV errors before importing.');
      return;
    }
    if (hasUnresolvedPoolCsvSections) {
      setPoolCsvError('Please resolve every unmatched section (Map to Existing, Create New, or Skip) before committing.');
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
        imported_count: res.imported_count || res.success_count || 0,
        error_count: res.error_count || 0,
        errors: res.errors || [],
        add_to_global_bank: Boolean(res.add_to_global_bank),
      });
      setPoolCsvStep('RESULT');
      await loadPools();
      if (managingPool && managingPool.id === targetCsvPoolId) {
        const detail = await getAdminQuestionPoolDetail(targetCsvPoolId);
        setManagingPool(detail);
      }
    } catch (err: unknown) {
      setPoolCsvError(formatApiError(err, 'Failed to import CSV into pool.'));
    } finally {
      setPoolCsvLoading(false);
    }
  };

  const handleEditQuestionInPool = async (questionId: number) => {
    try {
      setPoolDetailLoading(true);
      const match = await getAdminQuestion(questionId);
      setEditingQuestionInPool(match);
      setPoolQuestionType(isCodingQuestion(match) ? 'CODING' : 'MCQ');
      setShowPoolQuestionModal(true);
    } catch (err: unknown) {
      setDrawerNotice({ type: 'error', text: formatApiError(err, 'Failed to load question details for editing.') });
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
      await loadPools();
    } catch (err: unknown) {
      setDrawerNotice({ type: 'error', text: formatApiError(err, 'Failed to update archive status.') });
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
      await loadPools();
      setDrawerNotice({
        type: 'success',
        text: editingQuestionInPool ? 'Question updated.' : 'Question created and added to pool.',
      });
    } finally {
      setSavingPoolQuestion(false);
    }
  };

  const handleSaveStandaloneQuestion = async (data: any) => {
    try {
      setSavingStandaloneQuestion(true);
      await createAdminQuestion(data);
      setStandaloneQuestionModal(null);
      showToast('New question saved to Global Question Bank.');
    } finally {
      setSavingStandaloneQuestion(false);
    }
  };

  const handleOpenAddQuestions = async () => {
    if (!managingPool || !managingPool.question_type) return;
    setShowAddQuestionsModal(true);
    setSelectedBankQuestionIds([]);
    setBankModalError('');
    setShowIncompatibleBank(false);
    try {
      setBankLoading(true);
      const data = await getAdminQuestions({ is_active: 'true' });
      const existingQIds = new Set((managingPool.items || []).map((it) => it.question));
      setBankQuestions(data.filter((q) => !existingQIds.has(q.id)));
    } catch (err: unknown) {
      setBankModalError(formatApiError(err, 'Failed to load Global Question Bank.'));
    } finally {
      setBankLoading(false);
    }
  };

  const handleAddSelectedQuestionsToPool = async () => {
    if (!managingPool || selectedBankQuestionIds.length === 0) return;
    try {
      setAddingToPool(true);
      setBankModalError('');
      const updated = await manageAdminQuestionPoolItems(
        managingPool.id,
        selectedBankQuestionIds,
        'add'
      );
      setManagingPool(updated);
      setShowAddQuestionsModal(false);
      setSelectedBankQuestionIds([]);
      await loadPools();
      setDrawerNotice({ type: 'success', text: `Added ${selectedBankQuestionIds.length} question(s) to pool.` });
    } catch (err: unknown) {
      setBankModalError(formatApiError(err, 'Failed to add questions to pool.'));
    } finally {
      setAddingToPool(false);
    }
  };

  const poolTargetType = managingPool?.question_type || null;

  const filteredBankQuestions = bankQuestions.filter((q) => {
    const qIsCoding = isCodingQuestion(q);
    const compatible =
      !poolTargetType ||
      (poolTargetType === 'CODING' && qIsCoding) ||
      (poolTargetType === 'MCQ' && !qIsCoding);
    if (!showIncompatibleBank && !compatible) return false;

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

  const compatibleFilteredIds = filteredBankQuestions
    .filter((q) => {
      const qIsCoding = isCodingQuestion(q);
      return (
        poolTargetType === 'CODING' ? qIsCoding : poolTargetType === 'MCQ' ? !qIsCoding : false
      );
    })
    .map((q) => q.id);

  // Summary Metrics
  const totalPoolsCount = pools.length;
  const mcqPoolsCount = pools.filter((p) => p.question_type === 'MCQ').length;
  const codingPoolsCount = pools.filter((p) => p.question_type === 'CODING').length;
  const attentionCount = pools.filter((p) => p.is_mixed || !p.question_type || (p.questions_count || 0) === 0).length;

  const renderPoolTypeBadge = (pool: AdminQuestionPool) => {
    if (pool.is_mixed) {
      return (
        <span
          style={{
            fontSize: '10.5px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: tokens.dangerBg,
            color: tokens.dangerText,
            border: `1px solid ${tokens.dangerBorder}`,
          }}
        >
          Mixed Types
        </span>
      );
    }
    if (pool.question_type === 'CODING') {
      return (
        <span
          style={{
            fontSize: '10.5px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: tokens.codingBg,
            color: tokens.codingText,
            border: `1px solid ${tokens.codingBorder}`,
          }}
        >
          CODING Pool
        </span>
      );
    }
    if (pool.question_type === 'MCQ') {
      return (
        <span
          style={{
            fontSize: '10.5px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: tokens.cslBlueSoftBg,
            color: tokens.cslBlueSoftText,
            border: `1px solid ${tokens.cslBlueSoftBorder}`,
          }}
        >
          MCQ Pool
        </span>
      );
    }
    return (
      <span
        style={{
          fontSize: '10.5px',
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: '6px',
          backgroundColor: tokens.cslYellowSoftBg,
          color: tokens.cslYellowSoftText,
        }}
      >
        Unclassified
      </span>
    );
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${tokens.borderStrong}`,
    backgroundColor: tokens.inputBg,
    color: tokens.textPrimary,
    fontSize: '13px',
    fontFamily: tokens.fontFamily,
    boxSizing: 'border-box',
  };

  const mcqPoolsOnly = pools.filter((p) => p.question_type === 'MCQ');

  return (
    <PageContainer>
      <SectionHeader
        title="Question Pools"
        description="Curate strictly typed MCQ and Coding pools, enforce format boundaries, and link pools to assessments."
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {onViewCentralBank && (
              <button
                type="button"
                onClick={onViewCentralBank}
                className="csl-btn-secondary"
                style={{ color: tokens.cslBlueSoftText, borderColor: tokens.cslBlueSoftBorder }}
              >
                Global Question Bank →
              </button>
            )}
            <button
              type="button"
              data-testid="pools-create-mcq-btn"
              onClick={() => {
                if (onCreateMcqQuestion) onCreateMcqQuestion();
                else setStandaloneQuestionModal('MCQ');
              }}
              className="csl-btn-secondary"
            >
              + Create MCQ
            </button>
            <button
              type="button"
              data-testid="pools-create-coding-btn"
              onClick={() => {
                if (onCreateCodingQuestion) onCreateCodingQuestion();
                else setStandaloneQuestionModal('CODING');
              }}
              style={{
                padding: '8px 14px',
                backgroundColor: tokens.codingBg,
                color: tokens.codingText,
                border: `1px solid ${tokens.codingBorder}`,
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              &lt;/&gt; + Create Coding
            </button>
            <button
              type="button"
              data-testid="create-pool-btn"
              onClick={handleOpenCreateModal}
              className="csl-btn-primary"
            >
              + Create Pool
            </button>
          </div>
        }
      />

      {/* Feedback Banners */}
      {toastMsg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: tokens.successBg,
            border: `1px solid ${tokens.successBorder}`,
            color: tokens.successText,
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>✓ {toastMsg}</span>
          <button type="button" onClick={() => setToastMsg('')} style={{ background: 'none', border: 'none', color: tokens.successText, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: tokens.dangerBg,
            border: `1px solid ${tokens.dangerBorder}`,
            color: tokens.dangerText,
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', color: tokens.dangerText, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '16px',
        }}
      >
        <OdometerCard label="Total Pools" value={totalPoolsCount} subtitle="All curated pools" />
        <OdometerCard label="MCQ Pools" value={mcqPoolsCount} subtitle="Objective aptitude & core" accent="blue" />
        <OdometerCard label="Coding Pools" value={codingPoolsCount} subtitle="Programming challenges" accent="indigo" />
        <OdometerCard label="Needs Attention" value={attentionCount} subtitle="Empty or unclassified" accent="amber" />
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          padding: '12px 14px',
          backgroundColor: tokens.surfaceCard,
          border: `1px solid ${tokens.border}`,
          borderRadius: '12px',
          boxShadow: tokens.cardShadow,
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setViewLayout('GRID')}
            title="Grid View"
            style={{
              padding: '7px 11px',
              borderRadius: '7px',
              border: `1px solid ${viewLayout === 'GRID' ? tokens.cslBlue : tokens.borderStrong}`,
              backgroundColor: viewLayout === 'GRID' ? tokens.cslBlue : tokens.surfaceElevated,
              color: viewLayout === 'GRID' ? '#FFFFFF' : tokens.textSecondary,
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewLayout('LIST')}
            title="Table View"
            style={{
              padding: '7px 11px',
              borderRadius: '7px',
              border: `1px solid ${viewLayout === 'LIST' ? tokens.cslBlue : tokens.borderStrong}`,
              backgroundColor: viewLayout === 'LIST' ? tokens.cslBlue : tokens.surfaceElevated,
              color: viewLayout === 'LIST' ? '#FFFFFF' : tokens.textSecondary,
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            List
          </button>
        </div>

        <input
          type="text"
          placeholder="Search pools by name, code, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              loadPools();
            }
          }}
          style={{ ...inputStyle, flex: 1, minWidth: '210px' }}
        />

        <select
          aria-label="Filter by pool type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'MCQ' | 'CODING' | 'UNCLASSIFIED')}
          style={inputStyle}
        >
          <option value="ALL">All Pool Types</option>
          <option value="MCQ">MCQ Pools</option>
          <option value="CODING">Coding Pools</option>
          <option value="UNCLASSIFIED">Unclassified / Mixed</option>
        </select>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'ARCHIVED')}
          style={inputStyle}
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <button
          type="button"
          onClick={loadPools}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: `1px solid ${tokens.borderStrong}`,
            backgroundColor: tokens.surfaceElevated,
            color: tokens.textPrimary,
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Pools Grid / List */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: tokens.textSecondary, fontWeight: 600 }}>
          Loading Question Pools...
        </div>
      ) : pools.length === 0 ? (
        <div
          style={{
            backgroundColor: tokens.surfaceCard,
            borderRadius: '14px',
            border: `1px solid ${tokens.border}`,
            padding: '48px 24px',
            textAlign: 'center',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ fontSize: '17px', fontWeight: 700, color: tokens.textPrimary, marginBottom: '6px' }}>
            No Question Pools Found
          </div>
          <p style={{ fontSize: '13px', color: tokens.textSecondary, margin: '0 0 18px 0' }}>
            Create an MCQ Question Pool or Coding Question Pool to organize reusable assessment content.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            style={{
              padding: '9px 20px',
              backgroundColor: tokens.cslBlue,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Create Question Pool
          </button>
        </div>
      ) : viewLayout === 'GRID' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '18px',
          }}
        >
          {pools.map((pool) => {
            const count = pool.questions_count || 0;
            const healthOk = pool.pool_health === 'VALID' || (!pool.is_mixed && Boolean(pool.question_type));
            return (
              <div
                key={pool.id}
                data-testid={`pool-card-${pool.code}`}
                style={{
                  backgroundColor: tokens.surfaceCard,
                  borderRadius: '14px',
                  border: `1px solid ${pool.is_mixed || !pool.question_type ? tokens.cslYellow : tokens.border}`,
                  padding: '20px',
                  boxShadow: tokens.cardShadow,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {renderPoolTypeBadge(pool)}
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: pool.is_active ? tokens.successBg : tokens.surfaceMuted,
                          color: pool.is_active ? tokens.successText : tokens.textMuted,
                        }}
                      >
                        {pool.is_active ? 'Active' : 'Archived'}
                      </span>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: tokens.textPrimary, margin: '0 0 4px 0', lineHeight: 1.35 }}>
                    {pool.name}
                  </h3>
                  <div style={{ fontSize: '11.5px', fontFamily: tokens.monoFamily, color: tokens.textSecondary }}>
                    {pool.code} {pool.category ? `• ${pool.category}` : ''}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                      marginTop: '14px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: tokens.surfaceElevated,
                      border: `1px solid ${tokens.border}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: tokens.textSecondary }}>Questions</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: tokens.textPrimary }}>{count}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: tokens.textSecondary }}>Assessments</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: tokens.textPrimary }}>{pool.assessments_count || 0}</div>
                    </div>
                  </div>

                  {!healthOk && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        backgroundColor: tokens.cslYellowSoftBg,
                        color: tokens.cslYellowSoftText,
                        fontSize: '11.5px',
                        fontWeight: 600,
                      }}
                    >
                      {pool.is_mixed
                        ? `Mixed Pool (${pool.mcq_count || 0} MCQ / ${pool.coding_count || 0} Coding) — Open Manage Pool to reconcile`
                        : 'Needs type classification before authoring'}
                    </div>
                  )}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => handleOpenManageQuestions(pool)}
                    style={{
                      width: '100%',
                      padding: '9px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: tokens.cslBlue,
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Manage Pool
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenUnifiedImport(pool)}
                      disabled={!pool.question_type}
                      title={
                        pool.question_type === 'CODING'
                          ? 'Import Coding JSON'
                          : pool.question_type === 'MCQ'
                          ? 'Import MCQ CSV'
                          : 'Classify pool first'
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: !pool.question_type ? tokens.textMuted : tokens.successText,
                        cursor: !pool.question_type ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {pool.question_type === 'CODING' ? 'Import JSON' : 'Import CSV'}
                    </button>
                    <span style={{ color: tokens.borderStrong }}>•</span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(pool)}
                      style={{ background: 'none', border: 'none', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <span style={{ color: tokens.borderStrong }}>•</span>
                    <button
                      type="button"
                      onClick={() => handleToggleArchive(pool)}
                      style={{ background: 'none', border: 'none', fontSize: '11.5px', fontWeight: 700, color: tokens.cslYellowSoftText, cursor: 'pointer' }}
                    >
                      {pool.is_active ? 'Archive' : 'Restore'}
                    </button>
                    <span style={{ color: tokens.borderStrong }}>•</span>
                    <button
                      type="button"
                      onClick={() => handleDeletePool(pool)}
                      disabled={pool.assessments_count > 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: pool.assessments_count > 0 ? tokens.textMuted : tokens.dangerText,
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
        <div
          style={{
            backgroundColor: tokens.surfaceCard,
            borderRadius: '12px',
            border: `1px solid ${tokens.border}`,
            boxShadow: tokens.cardShadow,
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: tokens.surfaceElevated, borderBottom: `1px solid ${tokens.border}` }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: tokens.textSecondary }}>Pool Name & Code</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: tokens.textSecondary }}>Pool Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: tokens.textSecondary }}>Questions</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: tokens.textSecondary }}>Assessments</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: tokens.textSecondary }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: tokens.textSecondary, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => (
                <tr key={pool.id} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: tokens.textPrimary }}>{pool.name}</div>
                    <div style={{ fontFamily: tokens.monoFamily, fontSize: '11px', color: tokens.textSecondary }}>{pool.code}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{renderPoolTypeBadge(pool)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>{pool.questions_count}</td>
                  <td style={{ padding: '12px 16px', color: tokens.textSecondary }}>{pool.assessments_count}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: pool.is_active ? tokens.successBg : tokens.surfaceMuted,
                        color: pool.is_active ? tokens.successText : tokens.textMuted,
                      }}
                    >
                      {pool.is_active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenUnifiedImport(pool)}
                        disabled={!pool.question_type}
                        style={{
                          padding: '6px 11px',
                          backgroundColor: tokens.surfaceElevated,
                          color: tokens.successText,
                          border: `1px solid ${tokens.successBorder}`,
                          borderRadius: '7px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: !pool.question_type ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {pool.question_type === 'CODING' ? 'Import JSON' : 'Import CSV'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenManageQuestions(pool)}
                        style={{
                          padding: '6px 13px',
                          backgroundColor: tokens.cslBlue,
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '7px',
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

      {/* ─── CREATE / EDIT POOL MODAL (REQUIRED QUESTION TYPE) ───────── */}
      {showFormModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submittingForm) setShowFormModal(false);
          }}
        >
          <div
            data-testid="pool-form-modal"
            style={{
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              borderRadius: '14px',
              border: `1px solid ${tokens.borderStrong}`,
              width: '100%',
              maxWidth: '540px',
              padding: '24px',
              boxShadow: tokens.modalShadow,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                {editingPool ? 'Edit Question Pool' : 'Create Question Pool'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: tokens.textSecondary }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: tokens.dangerBg,
                  border: `1px solid ${tokens.dangerBorder}`,
                  borderRadius: '8px',
                  color: tokens.dangerText,
                  fontSize: '12.5px',
                  fontWeight: 600,
                  marginBottom: '14px',
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSavePool} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                  Pool Name *
                </label>
                <input
                  data-testid="pool-name-input"
                  type="text"
                  required
                  placeholder="e.g. Core Java Assessment Pool"
                  value={formData.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      name: val,
                      code: useCustomCode ? prev.code : generatePoolCode(val),
                    }));
                  }}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: tokens.textSecondary }}>Unique Code *</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: tokens.cslBlueSoftText, cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={useCustomCode}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseCustomCode(checked);
                        if (!checked) {
                          setFormData((prev) => ({ ...prev, code: generatePoolCode(prev.name) }));
                        }
                      }}
                    />
                    Custom
                  </label>
                </div>
                <input
                  data-testid="pool-code-input"
                  type="text"
                  required
                  placeholder="e.g. POOL_JAVA_01"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                  style={{ ...inputStyle, width: '100%', fontFamily: tokens.monoFamily }}
                />
              </div>

              {/* Required Pool Type Selection (Workstream A2) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Question Pool Format Type *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {(
                    [
                      {
                        type: 'MCQ' as PoolQuestionType,
                        title: 'MCQ Question Pool',
                        desc: 'Permits multiple-choice questions and bulk CSV import.',
                      },
                      {
                        type: 'CODING' as PoolQuestionType,
                        title: 'Coding Question Pool',
                        desc: 'Permits coding problems with test cases and Coding JSON import.',
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = formData.question_type === opt.type;
                    const typeLocked =
                      Boolean(editingPool) &&
                      (editingPool?.questions_count || 0) > 0 &&
                      editingPool?.question_type !== null;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        data-testid={`pool-type-${opt.type.toLowerCase()}`}
                        disabled={typeLocked && !selected}
                        onClick={() => {
                          if (!typeLocked) {
                            setFormData((prev) => ({ ...prev, question_type: opt.type }));
                          }
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '11px 12px',
                          borderRadius: '10px',
                          border: `2px solid ${selected ? tokens.cslBlue : tokens.borderStrong}`,
                          backgroundColor: selected ? tokens.cslBlueSoftBg : tokens.surfaceElevated,
                          opacity: typeLocked && !selected ? 0.45 : 1,
                          cursor: typeLocked && !selected ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: selected ? tokens.cslBlueSoftText : tokens.textPrimary }}>
                          {opt.title}
                        </div>
                        <div style={{ fontSize: '11px', color: tokens.textSecondary, marginTop: '3px', lineHeight: 1.4 }}>
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {editingPool && (editingPool.questions_count || 0) > 0 && editingPool.question_type !== null && (
                  <div style={{ fontSize: '11px', color: tokens.cslYellowSoftText, marginTop: '5px', fontWeight: 600 }}>
                    Pool type cannot be modified while {editingPool.questions_count} question(s) are inside.
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                  Category (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Aptitude, Algorithms, DBMS"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe pool contents and intended assessment usage..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: tokens.textPrimary, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <span>Active (Available for assessment selection)</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: tokens.surfaceElevated,
                    color: tokens.textPrimary,
                    border: `1px solid ${tokens.borderStrong}`,
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="pool-save-submit-btn"
                  disabled={submittingForm}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: tokens.cslBlue,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: submittingForm ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingForm ? 'Saving...' : editingPool ? 'Save Pool' : 'Create Pool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MANAGE POOL MODAL ─────────────────────────────────────────── */}
      {managingPool && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            data-testid="manage-pool-modal"
            style={{
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              borderRadius: '14px',
              border: `1px solid ${tokens.borderStrong}`,
              width: '100%',
              maxWidth: '960px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: tokens.modalShadow,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 22px',
                borderBottom: `1px solid ${tokens.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                backgroundColor: tokens.surfaceElevated,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                    {managingPool.name}
                  </h3>
                  <span style={{ fontFamily: tokens.monoFamily, fontSize: '11px', backgroundColor: tokens.surfaceMuted, color: tokens.textSecondary, padding: '2px 7px', borderRadius: '5px' }}>
                    {managingPool.code}
                  </span>
                  {renderPoolTypeBadge(managingPool)}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '5px',
                      backgroundColor: managingPool.is_active ? tokens.successBg : tokens.surfaceMuted,
                      color: managingPool.is_active ? tokens.successText : tokens.textMuted,
                    }}
                  >
                    {managingPool.is_active ? 'Active' : 'Archived'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: tokens.textSecondary, marginTop: '4px' }}>
                  {managingPool.questions_count} question(s) • Linked to {managingPool.assessments_count} assessment(s)
                </div>
              </div>

              {/* Type-Strict Action Buttons (Workstream A4 + B1) */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {managingPool.question_type === 'MCQ' && !managingPool.is_mixed && (
                  <>
                    <button
                      type="button"
                      data-testid="pool-create-mcq-btn"
                      onClick={handleOpenCreateMCQInPool}
                      style={{
                        padding: '8px 13px',
                        backgroundColor: tokens.cslBlue,
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Create MCQ Question
                    </button>
                    <button
                      type="button"
                      data-testid="pool-import-btn"
                      onClick={() => handleOpenUnifiedImport(managingPool)}
                      style={{
                        padding: '8px 13px',
                        backgroundColor: tokens.successBg,
                        color: tokens.successText,
                        border: `1px solid ${tokens.successBorder}`,
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Import MCQ CSV
                    </button>
                    <button
                      type="button"
                      data-testid="pool-add-from-bank-btn"
                      onClick={handleOpenAddQuestions}
                      style={{
                        padding: '8px 13px',
                        backgroundColor: tokens.surfaceCard,
                        color: tokens.textPrimary,
                        border: `1px solid ${tokens.borderStrong}`,
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Add MCQs from Bank
                    </button>
                  </>
                )}

                {managingPool.question_type === 'CODING' && !managingPool.is_mixed && (
                  <>
                    <button
                      type="button"
                      data-testid="pool-create-coding-btn"
                      onClick={handleOpenCreateCodingInPool}
                      style={{
                        padding: '8px 13px',
                        backgroundColor: '#7C3AED',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Create Coding Question
                    </button>
                    <button
                      type="button"
                      data-testid="pool-import-btn"
                      onClick={() => handleOpenUnifiedImport(managingPool)}
                      style={{
                        padding: '8px 13px',
                        backgroundColor: tokens.cslBlueSoftBg,
                        color: tokens.cslBlueSoftText,
                        border: `1px solid ${tokens.cslBlueSoftBorder}`,
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Import Coding JSON
                    </button>
                    <button
                      type="button"
                      data-testid="pool-add-from-bank-btn"
                      onClick={handleOpenAddQuestions}
                      style={{
                        padding: '8px 13px',
                        backgroundColor: tokens.surfaceCard,
                        color: tokens.textPrimary,
                        border: `1px solid ${tokens.borderStrong}`,
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Add Coding from Bank
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setManagingPool(null)}
                  aria-label="Close pool manager"
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: tokens.textSecondary }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
              {drawerNotice && (
                <div
                  style={{
                    marginBottom: '14px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: drawerNotice.type === 'error' ? tokens.dangerBg : tokens.successBg,
                    border: `1px solid ${drawerNotice.type === 'error' ? tokens.dangerBorder : tokens.successBorder}`,
                    color: drawerNotice.type === 'error' ? tokens.dangerText : tokens.successText,
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                >
                  {drawerNotice.text}
                </div>
              )}

              {/* Legacy Unclassified / Mixed Reconciliation Banner */}
              {(managingPool.is_mixed || !managingPool.question_type) && (
                <div
                  data-testid="pool-reconciliation-banner"
                  style={{
                    marginBottom: '16px',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    backgroundColor: tokens.cslYellowSoftBg,
                    border: `1px solid ${tokens.cslYellow}`,
                    color: tokens.cslYellowSoftText,
                  }}
                >
                  <div style={{ fontSize: '13.5px', fontWeight: 700, marginBottom: '4px' }}>
                    {managingPool.is_mixed
                      ? `Mixed Pool Detected (${managingPool.mcq_count || 0} MCQ, ${managingPool.coding_count || 0} Coding)`
                      : 'Pool Classification Required'}
                  </div>
                  <p style={{ fontSize: '12.5px', margin: '0 0 12px 0', color: tokens.textPrimary }}>
                    {managingPool.is_mixed
                      ? 'Choose whether this pool should keep only MCQ or only Coding questions. Incompatible items are detached from this pool without deleting them from the Question Bank.'
                      : 'Classify this pool as either an MCQ Pool or Coding Pool before creating, importing, or adding questions.'}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {(!managingPool.is_mixed && (managingPool.coding_count || 0) === 0) || managingPool.is_mixed ? (
                      <button
                        type="button"
                        disabled={reconciling}
                        onClick={() => handleClassifyOrReconcilePool(managingPool, 'MCQ')}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '7px',
                          border: 'none',
                          backgroundColor: tokens.cslBlue,
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {managingPool.is_mixed ? 'Classify as MCQ (Detach Coding)' : 'Classify as MCQ Pool'}
                      </button>
                    ) : null}
                    {(!managingPool.is_mixed && (managingPool.mcq_count || 0) === 0) || managingPool.is_mixed ? (
                      <button
                        type="button"
                        disabled={reconciling}
                        onClick={() => handleClassifyOrReconcilePool(managingPool, 'CODING')}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '7px',
                          border: 'none',
                          backgroundColor: '#7C3AED',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {managingPool.is_mixed ? 'Classify as CODING (Detach MCQ)' : 'Classify as Coding Pool'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Linked Assessments */}
              {managingPool.linked_assessments && managingPool.linked_assessments.length > 0 && (
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '12px 14px',
                    backgroundColor: tokens.surfaceElevated,
                    borderRadius: '10px',
                    border: `1px solid ${tokens.border}`,
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '8px' }}>
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
                          padding: '7px 10px',
                          backgroundColor: tokens.surfaceCard,
                          border: `1px solid ${tokens.border}`,
                          borderRadius: '7px',
                          fontSize: '12px',
                        }}
                      >
                        <div>
                          <strong>{la.assessment_title}</strong>{' '}
                          <span style={{ fontFamily: tokens.monoFamily, color: tokens.textSecondary }}>({la.assessment_code})</span>
                          <span style={{ marginLeft: '8px', color: tokens.cslBlueSoftText, fontSize: '11.5px', fontWeight: 600 }}>
                            Section: {la.section_name} • Quota: {la.question_count} Qs
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToAssessment) onNavigateToAssessment(la.assessment_id);
                            else window.location.href = `/csl-admin/?tab=assessments&assessmentId=${la.assessment_id}`;
                          }}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: tokens.cslBlue,
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '5px',
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
                <div style={{ padding: '40px', textAlign: 'center', color: tokens.textSecondary }}>
                  Loading pool questions...
                </div>
              ) : !managingPool.items || managingPool.items.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: tokens.textPrimary, marginBottom: '4px' }}>
                    This pool currently has no questions
                  </div>
                  <p style={{ fontSize: '13px', color: tokens.textSecondary, margin: '0 0 16px 0' }}>
                    {managingPool.question_type === 'CODING'
                      ? 'Create coding problems, import structured JSON, or add compatible coding questions from the Global Bank.'
                      : managingPool.question_type === 'MCQ'
                      ? 'Create MCQ questions, import CSV rows, or add compatible MCQs from the Global Bank.'
                      : 'Classify this pool above to enable authoring and import actions.'}
                  </p>
                  {managingPool.question_type && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {managingPool.question_type === 'MCQ' ? (
                        <button
                          type="button"
                          onClick={handleOpenCreateMCQInPool}
                          style={{ padding: '8px 14px', backgroundColor: tokens.cslBlue, color: '#FFFFFF', border: 'none', borderRadius: '7px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          + Create MCQ Question
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleOpenCreateCodingInPool}
                          style={{ padding: '8px 14px', backgroundColor: '#7C3AED', color: '#FFFFFF', border: 'none', borderRadius: '7px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          + Create Coding Question
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenUnifiedImport(managingPool)}
                        style={{ padding: '8px 14px', backgroundColor: '#16A34A', color: '#FFFFFF', border: 'none', borderRadius: '7px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {managingPool.question_type === 'CODING' ? 'Import Coding JSON' : 'Import MCQ CSV'}
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenAddQuestions}
                        style={{ padding: '8px 14px', backgroundColor: tokens.surfaceElevated, color: tokens.textPrimary, border: `1px solid ${tokens.borderStrong}`, borderRadius: '7px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Add from Bank
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Drawer Filter Controls */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Filter pool questions..."
                      value={drawerSearch}
                      onChange={(e) => setDrawerSearch(e.target.value)}
                      style={{ ...inputStyle, flex: 1, minWidth: '180px', fontSize: '12.5px' }}
                    />
                    <select
                      value={drawerSectionFilter}
                      onChange={(e) => setDrawerSectionFilter(e.target.value)}
                      style={{ ...inputStyle, fontSize: '12.5px' }}
                    >
                      <option value="">All Sections</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.code}>
                          {s.name || s.code}
                        </option>
                      ))}
                      <option value="CODING">Coding</option>
                    </select>
                    <select
                      value={drawerDifficultyFilter}
                      onChange={(e) => setDrawerDifficultyFilter(e.target.value)}
                      style={{ ...inputStyle, fontSize: '12.5px' }}
                    >
                      <option value="">All Difficulties</option>
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: tokens.surfaceElevated, borderBottom: `1px solid ${tokens.border}` }}>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: tokens.textSecondary, width: '40px' }}>#</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: tokens.textSecondary }}>Question</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: tokens.textSecondary }}>Section</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: tokens.textSecondary }}>Difficulty</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: tokens.textSecondary }}>Marks</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: tokens.textSecondary }}>Status</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: tokens.textSecondary, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(managingPool.items || [])
                        .filter((item) => {
                          if (drawerSearch.trim()) {
                            const s = drawerSearch.toLowerCase();
                            if (
                              !(item.question_prompt || '').toLowerCase().includes(s) &&
                              !(item.question_category || '').toLowerCase().includes(s)
                            ) {
                              return false;
                            }
                          }
                          if (drawerSectionFilter && (item.question_section || '').toUpperCase() !== drawerSectionFilter.toUpperCase()) {
                            return false;
                          }
                          if (drawerDifficultyFilter && (item.question_difficulty || '').toUpperCase() !== drawerDifficultyFilter.toUpperCase()) {
                            return false;
                          }
                          return true;
                        })
                        .map((item, idx) => (
                          <tr key={item.id} style={{ borderBottom: `1px solid ${tokens.border}` }}>
                            <td style={{ padding: '10px 12px', color: tokens.textMuted, fontWeight: 600 }}>{idx + 1}</td>
                            <td style={{ padding: '10px 12px', maxWidth: '300px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {(item.question_type === 'CODING' || item.has_programming_details) && (
                                  <span style={{ backgroundColor: tokens.codingBg, color: tokens.codingText, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                                    CODING
                                  </span>
                                )}
                                <span style={{ fontWeight: 600, color: tokens.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.question_prompt}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ backgroundColor: tokens.surfaceElevated, color: tokens.textSecondary, padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 600 }}>
                                {item.question_section}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '11.5px', fontWeight: 700 }}>
                              {item.question_difficulty}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{item.question_marks}</td>
                            <td style={{ padding: '10px 12px', fontSize: '11.5px', fontWeight: 700, color: item.question_is_archived ? tokens.textMuted : tokens.successText }}>
                              {item.question_is_archived ? 'Archived' : 'Active'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => handleEditQuestionInPool(item.question)}
                                  style={{ padding: '4px 8px', backgroundColor: tokens.cslBlueSoftBg, border: `1px solid ${tokens.cslBlueSoftBorder}`, color: tokens.cslBlueSoftText, borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleArchiveQuestionInPool(item.question)}
                                  style={{ padding: '4px 8px', backgroundColor: tokens.surfaceElevated, border: `1px solid ${tokens.borderStrong}`, color: tokens.textSecondary, borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  {item.question_is_archived ? 'Unarchive' : 'Archive'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveQuestionFromPool(item.question)}
                                  style={{ padding: '4px 8px', backgroundColor: tokens.dangerBg, border: `1px solid ${tokens.dangerBorder}`, color: tokens.dangerText, borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
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

            <div
              style={{
                padding: '12px 22px',
                borderTop: `1px solid ${tokens.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: tokens.surfaceElevated,
              }}
            >
              <button
                type="button"
                onClick={() => setManagingPool(null)}
                style={{
                  padding: '8px 18px',
                  backgroundColor: tokens.surfaceCard,
                  color: tokens.textPrimary,
                  border: `1px solid ${tokens.borderStrong}`,
                  borderRadius: '8px',
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

      {/* ─── ADD COMPATIBLE QUESTIONS FROM BANK PICKER MODAL ────────── */}
      {showAddQuestionsModal && managingPool && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            data-testid="add-from-bank-modal"
            style={{
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.borderStrong}`,
              borderRadius: '14px',
              width: '100%',
              maxWidth: '840px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: tokens.modalShadow,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${tokens.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: tokens.surfaceElevated,
              }}
            >
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  Add Compatible {managingPool.question_type} Questions to "{managingPool.name}"
                </h4>
                <div style={{ fontSize: '12px', color: tokens.textSecondary, marginTop: '2px' }}>
                  Only {managingPool.question_type} questions are eligible for this pool.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddQuestionsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: tokens.textSecondary }}
              >
                ✕
              </button>
            </div>

            {bankModalError && (
              <div style={{ margin: '12px 20px 0', padding: '10px 14px', borderRadius: '8px', backgroundColor: tokens.dangerBg, border: `1px solid ${tokens.dangerBorder}`, color: tokens.dangerText, fontSize: '12.5px', fontWeight: 600 }}>
                {bankModalError}
              </div>
            )}

            <div
              style={{
                padding: '12px 20px',
                borderBottom: `1px solid ${tokens.border}`,
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                placeholder="Search question prompt..."
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '180px', fontSize: '12.5px' }}
              />
              <select
                value={bankSectionFilter}
                onChange={(e) => setBankSectionFilter(e.target.value)}
                style={{ ...inputStyle, fontSize: '12.5px' }}
              >
                <option value="">All Curriculum Sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: tokens.textSecondary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showIncompatibleBank}
                  onChange={(e) => setShowIncompatibleBank(e.target.checked)}
                />
                <span>Show locked incompatible</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (selectedBankQuestionIds.length === compatibleFilteredIds.length && compatibleFilteredIds.length > 0) {
                    setSelectedBankQuestionIds([]);
                  } else {
                    setSelectedBankQuestionIds(compatibleFilteredIds);
                  }
                }}
                style={{
                  padding: '7px 12px',
                  backgroundColor: tokens.surfaceElevated,
                  border: `1px solid ${tokens.borderStrong}`,
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: tokens.textPrimary,
                }}
              >
                {selectedBankQuestionIds.length === compatibleFilteredIds.length && compatibleFilteredIds.length > 0
                  ? 'Deselect All'
                  : 'Select Compatible'}
              </button>
            </div>

            <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
              {bankLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: tokens.textSecondary }}>
                  Loading available questions...
                </div>
              ) : filteredBankQuestions.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: tokens.textSecondary }}>
                  No compatible {managingPool.question_type} questions found matching your filter.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredBankQuestions.map((q) => {
                    const qIsCoding = isCodingQuestion(q);
                    const compatible =
                      managingPool.question_type === 'CODING' ? qIsCoding : !qIsCoding;
                    const isChecked = selectedBankQuestionIds.includes(q.id);
                    return (
                      <div
                        key={q.id}
                        onClick={() => {
                          if (!compatible) return;
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
                          borderRadius: '8px',
                          border: isChecked ? `1.5px solid ${tokens.cslBlue}` : `1px solid ${tokens.border}`,
                          backgroundColor: !compatible
                            ? tokens.surfaceMuted
                            : isChecked
                            ? tokens.cslBlueSoftBg
                            : tokens.surfaceCard,
                          opacity: compatible ? 1 : 0.6,
                          cursor: compatible ? 'pointer' : 'not-allowed',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!compatible}
                          onChange={() => {}}
                          style={{ marginTop: '3px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: tokens.textPrimary, marginBottom: '4px' }}>
                            {q.prompt}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', backgroundColor: qIsCoding ? tokens.codingBg : tokens.cslBlueSoftBg, color: qIsCoding ? tokens.codingText : tokens.cslBlueSoftText }}>
                              {qIsCoding ? 'CODING' : 'MCQ'}
                            </span>
                            <span style={{ fontSize: '11px', color: tokens.textSecondary }}>
                              {q.section_name || q.section_type} • {q.marks || 1} mark(s) • {q.difficulty}
                            </span>
                            {!compatible && (
                              <span style={{ fontSize: '11px', color: tokens.dangerText, fontWeight: 600 }}>
                                Incompatible with {managingPool.question_type} pool
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: `1px solid ${tokens.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: tokens.surfaceElevated,
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                {selectedBankQuestionIds.length} question(s) selected
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddQuestionsModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: tokens.surfaceCard,
                    color: tokens.textPrimary,
                    border: `1px solid ${tokens.borderStrong}`,
                    borderRadius: '7px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-add-bank-questions-btn"
                  onClick={handleAddSelectedQuestionsToPool}
                  disabled={selectedBankQuestionIds.length === 0 || addingToPool}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: selectedBankQuestionIds.length === 0 || addingToPool ? tokens.borderStrong : tokens.cslBlue,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '7px',
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

      {/* Pool-Scoped MCQ / Coding Editors */}
      {showPoolQuestionModal && poolQuestionType === 'CODING' && (
        <AdminCodingQuestionModal
          question={editingQuestionInPool}
          isOpen={showPoolQuestionModal}
          onClose={() => {
            setShowPoolQuestionModal(false);
            setEditingQuestionInPool(null);
          }}
          onSave={handleSaveQuestionInPool}
          saving={savingPoolQuestion}
          sections={sections}
          isPoolScoped={true}
          targetPool={managingPool}
        />
      )}
      {showPoolQuestionModal && poolQuestionType === 'MCQ' && (
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
          targetPool={managingPool}
        />
      )}

      {/* Standalone Bank Creation Editors (when rendered without parent callbacks) */}
      <AdminQuestionEditorModal
        question={null}
        isOpen={standaloneQuestionModal === 'MCQ'}
        onClose={() => setStandaloneQuestionModal(null)}
        onSave={handleSaveStandaloneQuestion}
        saving={savingStandaloneQuestion}
        sections={sections}
      />
      <AdminCodingQuestionModal
        question={null}
        isOpen={standaloneQuestionModal === 'CODING'}
        onClose={() => setStandaloneQuestionModal(null)}
        onSave={handleSaveStandaloneQuestion}
        saving={savingStandaloneQuestion}
        sections={sections}
      />

      {/* Coding Pool JSON Importer */}
      {codingImportPool && (
        <ImportCodingJsonModal
          targetPool={codingImportPool}
          poolId={codingImportPool.id}
          pools={pools}
          onClose={() => setCodingImportPool(null)}
          onSuccess={async () => {
            await loadPools();
            if (managingPool && managingPool.id === codingImportPool.id) {
              const detail = await getAdminQuestionPoolDetail(codingImportPool.id);
              setManagingPool(detail);
            }
          }}
        />
      )}

      {/* Pool-Scoped MCQ CSV Import Modal */}
      {showPoolCsvModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '16px',
          }}
        >
          <div
            data-testid="pool-csv-import-modal"
            style={{
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.borderStrong}`,
              borderRadius: '14px',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: tokens.modalShadow,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: tokens.textPrimary }}>
                  Import MCQ Questions (CSV) to Pool
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: tokens.textSecondary }}>
                  Scoped to the selected MCQ pool by default; optionally mirror into Global Question Bank below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPoolCsvModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: tokens.textSecondary, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {poolCsvError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: tokens.dangerBg, border: `1px solid ${tokens.dangerBorder}`, color: tokens.dangerText, fontSize: '12.5px', fontWeight: 600, marginBottom: '14px' }}>
                {poolCsvError}
              </div>
            )}

            {poolCsvStep === 'UPLOAD' && (
              <form onSubmit={handlePreviewPoolCsv} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                    Target MCQ Pool *
                  </label>
                  <select
                    value={targetCsvPoolId}
                    onChange={(e) => setTargetCsvPoolId(e.target.value)}
                    required
                    style={{ ...inputStyle, width: '100%' }}
                  >
                    <option value="">-- Select MCQ Pool --</option>
                    {mcqPoolsOnly.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name} ({p.questions_count} Qs)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                    Upload CSV File (.csv)
                  </label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setPoolCsvFile(e.target.files?.[0] || null)}
                    style={{ ...inputStyle, width: '100%', borderStyle: 'dashed' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '6px' }}>
                    Or Paste CSV Content Directly
                  </label>
                  <textarea
                    rows={5}
                    value={poolCsvText}
                    onChange={(e) => setPoolCsvText(e.target.value)}
                    placeholder="prompt,section_type,difficulty,option_a,option_b,option_c,option_d,correct_option,marks"
                    style={{ ...inputStyle, width: '100%', fontFamily: tokens.monoFamily, fontSize: '12px' }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${tokens.border}`, backgroundColor: tokens.surfaceElevated, fontSize: '12.5px', fontWeight: 600, color: tokens.textPrimary, cursor: 'pointer' }}>
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
                    style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.surfaceCard, color: tokens.textPrimary, fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={poolCsvLoading}
                    style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: tokens.cslBlue, color: '#FFFFFF', fontWeight: 700, fontSize: '13px', cursor: poolCsvLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {poolCsvLoading ? 'Analyzing CSV...' : 'Preview & Validate →'}
                  </button>
                </div>
              </form>
            )}

            {poolCsvStep === 'PREVIEW' && poolCsvPreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: tokens.cslBlueSoftBg, border: `1px solid ${tokens.cslBlueSoftBorder}`, fontSize: '13px', color: tokens.cslBlueSoftText }}>
                  <strong>{poolCsvPreview.valid_count ?? poolCsvPreview.total_rows}</strong> valid of{' '}
                  <strong>{poolCsvPreview.total_rows}</strong> row(s) • Detected Type:{' '}
                  <strong>{poolCsvPreview.detected_type || 'MCQ'}</strong> • Scope:{' '}
                  <strong>{poolCsvAddToGlobal ? 'Pool + Global Bank' : 'Pool-Scoped Only'}</strong>
                </div>

                {poolCsvPreview.errors && poolCsvPreview.errors.length > 0 && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: tokens.dangerBg, border: `1px solid ${tokens.dangerBorder}`, fontSize: '12px', color: tokens.dangerText }}>
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
                      const rule = poolCsvSectionMapping[sec.code];
                      const availableList = poolCsvPreview.available_sections || sections;
                      return (
                        <div key={sec.code} style={{ border: `1px solid ${sec.matched_section_id ? tokens.borderStrong : tokens.cslYellow}`, borderRadius: '8px', padding: '10px 12px', backgroundColor: tokens.surfaceElevated, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '12.5px' }}>
                              <strong>[{sec.code}]</strong> {sec.detected_name || sec.raw_section} ({sec.row_count ?? sec.count} rows)
                              {sec.matched_section_id && (
                                <span style={{ marginLeft: '8px', fontSize: '11px', color: tokens.successText, fontWeight: 700 }}>
                                  ✓ Directory Match
                                </span>
                              )}
                            </div>
                            <select
                              value={rule?.action || ''}
                              onChange={(e) => {
                                const action = e.target.value as '' | 'map' | 'create' | 'skip';
                                if (!action) return;
                                setPoolCsvSectionMapping((prev) => ({
                                  ...prev,
                                  [sec.code]: {
                                    ...prev[sec.code],
                                    action,
                                    target_section_id: action === 'map' ? (sec.matched_section_id || availableList[0]?.id) : undefined,
                                    target_section_code: action === 'create' ? sec.code : undefined,
                                    target_section_name: action === 'create' ? (sec.detected_name || sec.raw_section || sec.code) : undefined,
                                    description: action === 'create' ? '' : undefined,
                                    display_order: action === 'create' ? (availableList.length + 1) : undefined,
                                  },
                                }));
                              }}
                              style={{ ...inputStyle, fontSize: '12px' }}
                            >
                              {!sec.matched_section_id && <option value="">-- Choose Resolution --</option>}
                              <option value="map">Map to Existing Section</option>
                              <option value="create">Create New Directory Entry</option>
                              <option value="skip">Skip Rows</option>
                            </select>
                          </div>

                          {rule?.action === 'map' && !sec.matched_section_id && (
                            <select
                              value={rule.target_section_id || ''}
                              onChange={(e) => {
                                const idVal = Number(e.target.value);
                                const chosen = availableList.find((a) => a.id === idVal);
                                setPoolCsvSectionMapping((prev) => ({
                                  ...prev,
                                  [sec.code]: {
                                    action: 'map',
                                    target_section_id: idVal,
                                    target_section_code: chosen?.code,
                                  },
                                }));
                              }}
                              style={{ ...inputStyle, fontSize: '12px' }}
                            >
                              <option value="">-- Select target section --</option>
                              {availableList.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.code})
                                </option>
                              ))}
                            </select>
                          )}

                          {rule?.action === 'create' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.3fr 80px', gap: '8px' }}>
                              <input
                                type="text"
                                value={rule.target_section_name || ''}
                                onChange={(e) =>
                                  setPoolCsvSectionMapping((prev) => ({
                                    ...prev,
                                    [sec.code]: { ...rule, action: 'create', target_section_name: e.target.value },
                                  }))
                                }
                                placeholder="Section Name *"
                                style={{ ...inputStyle, fontSize: '12px' }}
                              />
                              <input
                                type="text"
                                value={rule.target_section_code || ''}
                                onChange={(e) =>
                                  setPoolCsvSectionMapping((prev) => ({
                                    ...prev,
                                    [sec.code]: { ...rule, action: 'create', target_section_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') },
                                  }))
                                }
                                placeholder="UNIQUE_CODE *"
                                style={{ ...inputStyle, fontSize: '12px' }}
                              />
                              <input
                                type="text"
                                value={rule.description || ''}
                                onChange={(e) =>
                                  setPoolCsvSectionMapping((prev) => ({
                                    ...prev,
                                    [sec.code]: { ...rule, action: 'create', description: e.target.value },
                                  }))
                                }
                                placeholder="Description (optional)"
                                style={{ ...inputStyle, fontSize: '12px' }}
                              />
                              <input
                                type="number"
                                min={0}
                                value={rule.display_order ?? 0}
                                onChange={(e) =>
                                  setPoolCsvSectionMapping((prev) => ({
                                    ...prev,
                                    [sec.code]: { ...rule, action: 'create', display_order: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                placeholder="Order"
                                style={{ ...inputStyle, fontSize: '12px' }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${tokens.border}`, backgroundColor: tokens.surfaceElevated, fontSize: '12.5px', fontWeight: 600, color: tokens.textPrimary, cursor: 'pointer' }}>
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
                    style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.surfaceCard, color: tokens.textPrimary, fontSize: '13px', cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    disabled={poolCsvLoading || hasUnresolvedPoolCsvSections || (poolCsvPreview.valid_count ?? poolCsvPreview.total_rows ?? 0) === 0}
                    onClick={handleCommitPoolCsv}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#16A34A',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: poolCsvLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {poolCsvLoading ? 'Importing...' : 'Confirm & Import to Pool'}
                  </button>
                </div>
              </div>
            )}

            {poolCsvStep === 'RESULT' && poolCsvResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: poolCsvResult.error_count > 0 ? tokens.cslYellowSoftBg : tokens.successBg, border: `1px solid ${poolCsvResult.error_count > 0 ? tokens.cslYellow : tokens.successBorder}`, fontSize: '13px', color: tokens.textPrimary }}>
                  <strong>Imported {poolCsvResult.imported_count} question(s) into pool</strong>
                  <div style={{ fontSize: '12px', color: tokens.textSecondary, marginTop: '4px' }}>
                    Scope: {poolCsvResult.add_to_global_bank ? 'Pool + Global Question Bank' : 'Pool-Scoped Only (isolated from Global Question Bank)'}
                  </div>
                  {poolCsvResult.error_count > 0 && (
                    <ul style={{ margin: '8px 0 0 16px', padding: 0, color: tokens.dangerText, fontSize: '12px' }}>
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
                    style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', backgroundColor: tokens.cslBlue, color: '#FFFFFF', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
