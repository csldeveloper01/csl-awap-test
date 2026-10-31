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

export function AdminQuestionPoolsView() {
  const [pools, setPools] = useState<AdminQuestionPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');

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
      const params: { category?: string; search?: string; is_active?: boolean } = {};
      if (search.trim()) params.search = search.trim();
      if (categoryFilter.trim()) params.category = categoryFilter.trim();
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
  }, [categoryFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPools();
  };

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
  const totalLinkedAssessments = pools.reduce((acc, p) => acc + (p.assessments_count || 0), 0);

  return (
    <div>
      {/* ─── HEADER ─── */}
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
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
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
              Independent Question Pools
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
              Curate reusable pools of questions and link them across multiple assessments with customized quota rules.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            backgroundColor: '#1455B8',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(20, 85, 184, 0.2)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Create Question Pool</span>
        </button>
      </div>

      {/* ─── STATS CARDS ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Pools
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0B2E6F', marginTop: '4px' }}>
            {totalPoolsCount}
          </div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Active Pools
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
            {activePoolsCount}
          </div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Questions in Pools
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#6366F1', marginTop: '4px' }}>
            {totalQuestionsInPools}
          </div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Linked Assessments
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            {totalLinkedAssessments}
          </div>
        </div>
      </div>

      {/* ─── FILTERS & SEARCH ─── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          padding: '14px 16px',
          marginBottom: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1 1 300px' }}>
          <input
            type="text"
            placeholder="Search pool name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '13px',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 14px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Category filter..."
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              outline: 'none',
              width: '140px',
              backgroundColor: '#FFFFFF',
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'ARCHIVED')}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              outline: 'none',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="ACTIVE">Status: Active</option>
            <option value="ARCHIVED">Status: Archived</option>
            <option value="ALL">Status: All</option>
          </select>

          <button
            type="button"
            onClick={loadPools}
            title="Refresh pools"
            style={{
              padding: '8px 12px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#64748B',
            }}
          >
            ↺
          </button>
        </div>
      </div>

      {/* ─── POOLS TABLE ─── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
            Loading question pools...
          </div>
        ) : error ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#DC2626', fontSize: '14px' }}>
            {error}
          </div>
        ) : pools.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
              No Question Pools Found
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
              Create your first question pool to bundle curriculum items for assessments.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              style={{
                padding: '9px 16px',
                backgroundColor: '#1455B8',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Create Question Pool
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Pool Name & Code</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Category</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Questions</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Linked Assessments</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((pool) => (
                  <tr
                    key={pool.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '14px' }}>
                        {pool.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid #E2E8F0',
                          }}
                        >
                          {pool.code}
                        </span>
                        {pool.description && (
                          <span style={{ fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>
                            — {pool.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      {pool.category ? (
                        <span style={{ backgroundColor: '#EEF2FF', color: '#4338CA', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                          {pool.category}
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>General</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: pool.questions_count > 0 ? '#ECFDF5' : '#F1F5F9',
                          color: pool.questions_count > 0 ? '#059669' : '#64748B',
                          border: `1px solid ${pool.questions_count > 0 ? '#A7F3D0' : '#E2E8F0'}`,
                        }}
                      >
                        {pool.questions_count} Questions
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: pool.assessments_count > 0 ? '#1455B8' : '#94A3B8',
                        }}
                      >
                        {pool.assessments_count} Assessments
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: pool.is_active ? '#DCFCE7' : '#F1F5F9',
                          color: pool.is_active ? '#15803D' : '#64748B',
                          border: `1px solid ${pool.is_active ? '#BBF7D0' : '#CBD5E1'}`,
                        }}
                      >
                        {pool.is_active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenManageQuestions(pool)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#1455B8',
                            cursor: 'pointer',
                          }}
                        >
                          Manage Questions ({pool.questions_count})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(pool)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(pool)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: pool.is_active ? '#D97706' : '#059669',
                            cursor: 'pointer',
                          }}
                        >
                          {pool.is_active ? 'Archive' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePool(pool)}
                          disabled={pool.assessments_count > 0}
                          title={pool.assessments_count > 0 ? 'Cannot delete pool linked to assessments' : 'Delete pool'}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #FECACA',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: pool.assessments_count > 0 ? '#94A3B8' : '#DC2626',
                            cursor: pool.assessments_count > 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
