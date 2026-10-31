import { useState, useEffect } from 'react';
import {
  getAdminQuestionPools,
  createAdminQuestionPool,
  getAdminQuestionPoolDetail,
  updateAdminQuestionPool,
  deleteAdminQuestionPool,
  manageAdminQuestionPoolItems,
  getAdminQuestions,
  getAdminSections,
  type AdminQuestionPool,
  type AdminQuestion,
  type AdminSection,
} from '../../api/admin';
import { OdometerCard } from '../../components/admin/OdometerCard';

interface AdminQuestionPoolsViewProps {
  onCreateQuestion?: () => void;
  onImportCSV?: () => void;
  onViewCentralBank?: () => void;
}

export function AdminQuestionPoolsView({
  onCreateQuestion,
  onImportCSV,
  onViewCentralBank,
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
  const [formError, setFormError] = useState('');

  // Manage Questions Modal / Drawer
  const [managingPool, setManagingPool] = useState<AdminQuestionPool | null>(null);
  const [poolDetailLoading, setPoolDetailLoading] = useState(false);
  const [showAddQuestionsModal, setShowAddQuestionsModal] = useState(false);

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
    setFormError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (pool: AdminQuestionPool) => {
    setEditingPool(pool);
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
      const updated = await manageAdminQuestionPoolItems(managingPool.id, [questionId], 'remove');
      setManagingPool(updated);
      loadPools();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove question from pool.');
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

        {/* Import CSV Button (Mockup 5) */}
        <button
          type="button"
          onClick={() => {
            if (onImportCSV) {
              onImportCSV();
            } else {
              alert('Please open CSV import from the main Question Bank view.');
            }
          }}
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

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '10px' }}>
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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                  Unique Code *
                </label>
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

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleOpenAddQuestions}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#1455B8',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>+ Add Questions from Bank</span>
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
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '50px' }}>#</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569' }}>Prompt</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '120px' }}>Section</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '90px' }}>Difficulty</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '60px' }}>Marks</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', width: '80px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managingPool.items.map((item, idx) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 12px', color: '#94A3B8', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px', color: '#0F172A', fontWeight: 500, maxWidth: '350px' }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.question_prompt}
                          </div>
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
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestionFromPool(item.question)}
                            title="Remove question from pool (retains in Question Bank)"
                            style={{
                              padding: '4px 8px',
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </div>
  );
}
