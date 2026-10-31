import React, { useState, useEffect } from 'react';
import { formatApiError } from '../../utils/errorFormatter';
import { OdometerCard } from '../../components/admin/OdometerCard';
import {
  getAdminColleges,
  createAdminCollege,
  updateAdminCollege,
  mergeAdminCollege,
  toggleAdminCollegeStatus,
  deleteAdminCollege,
  bulkDeleteAdminColleges,
  importAdminCollegeCandidates,
  getAdminCollegeDetail,
  importAdminCollegeDirectory,
  type AdminCollege,
  type AdminCollegeDetail,
} from '../../api/admin';

export function AdminCollegesView() {
  const [colleges, setColleges] = useState<AdminCollege[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all');
  const districtFilter = '';
  const [expandedCollegeId, setExpandedCollegeId] = useState<number | null>(null);
  const [showDirectoryImportModal, setShowDirectoryImportModal] = useState(false);
  const [directoryFile, setDirectoryFile] = useState<File | null>(null);
  const [directoryImporting, setDirectoryImporting] = useState(false);
  const [directoryImportResult, setDirectoryImportResult] = useState<{
    message: string;
    total_processed: number;
    created_count: number;
    updated_count: number;
    errors: string[];
  } | null>(null);

  // Bulk Selection & Deletion State
  const [selectedCollegeIds, setSelectedCollegeIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Selected college for import or detail
  const [selectedCollege, setSelectedCollege] = useState<AdminCollege | null>(null);
  const [collegeDetail, setCollegeDetail] = useState<AdminCollegeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Edit Form State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCollege, setEditingCollege] = useState<AdminCollege | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    district: '',
    city: '',
    institution_type: 'Engineering',
    affiliation: 'Anna University',
    website: '',
    location: '',
    address: '',
    admin_contact_name: '',
    contact_email: '',
    contact_phone: '',
    is_verified: true,
  });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Duplicate Merge State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceCollege, setMergeSourceCollege] = useState<AdminCollege | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');

  // Create Form State
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    district: '',
    city: '',
    institution_type: 'Engineering',
    affiliation: 'Anna University',
    website: '',
    location: '',
    address: '',
    admin_contact_name: '',
    contact_email: '',
    contact_phone: '',
  });
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCsvText, setImportCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total_rows: number;
    created_count: number;
    updated_count: number;
    errors: string[];
  } | null>(null);
  const [importError, setImportError] = useState('');

  const handleImportDirectory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directoryFile) {
      alert('Please select an institution directory CSV file.');
      return;
    }
    setDirectoryImporting(true);
    setDirectoryImportResult(null);
    try {
      const res = await importAdminCollegeDirectory(directoryFile);
      setDirectoryImportResult(res);
      fetchColleges();
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.response?.data?.detail || 'Directory import failed.');
    } finally {
      setDirectoryImporting(false);
    }
  };

  const handleOpenEdit = (college: AdminCollege) => {
    setEditingCollege(college);
    setEditForm({
      name: college.name || '',
      code: college.code || '',
      district: college.district || '',
      city: college.city || '',
      institution_type: college.institution_type || 'Engineering',
      affiliation: college.affiliation || 'Anna University',
      website: college.website || '',
      location: college.location || '',
      address: college.address || '',
      admin_contact_name: college.admin_contact_name || '',
      contact_email: college.contact_email || '',
      contact_phone: college.contact_phone || '',
      is_verified: college.is_verified ?? true,
    });
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollege) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      const updated = await updateAdminCollege(editingCollege.id, editForm);
      setColleges((prev) => prev.map((c) => (c.id === editingCollege.id ? { ...c, ...updated } : c)));
      setShowEditModal(false);
      setEditingCollege(null);
    } catch (err: any) {
      setEditError(formatApiError(err, 'Failed to update institution details.'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenMerge = (college: AdminCollege) => {
    setMergeSourceCollege(college);
    setMergeTargetId('');
    setMergeError('');
    setShowMergeModal(true);
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSourceCollege || !mergeTargetId) {
      setMergeError('Please select a target authoritative college.');
      return;
    }
    const targetCol = colleges.find((c) => String(c.id) === String(mergeTargetId));
    const confirmText = `Are you sure you want to merge '${mergeSourceCollege.name}' (${mergeSourceCollege.code}) into '${targetCol?.name || mergeTargetId}'?\n\nThis will transfer all registered candidates, update assigned assessments, add aliases to the target college, and permanently delete the duplicate entry.`;
    if (!window.confirm(confirmText)) return;

    setMerging(true);
    setMergeError('');
    try {
      const res = await mergeAdminCollege(mergeSourceCollege.id, Number(mergeTargetId));
      alert(res.message);
      setShowMergeModal(false);
      setMergeSourceCollege(null);
      fetchColleges();
    } catch (err: any) {
      setMergeError(formatApiError(err, 'Failed to merge institution.'));
    } finally {
      setMerging(false);
    }
  };

  const fetchColleges = async () => {
    setLoading(true);
    try {
      const data = await getAdminColleges({
        search: search.trim() || undefined,
        district: districtFilter || undefined,
        is_active: statusFilter === 'all' ? undefined : statusFilter,
      });
      setColleges(data);
    } catch (err: unknown) {
      console.error('Failed to fetch colleges:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, [search, statusFilter, districtFilter]);

  const handleToggleStatus = async (college: AdminCollege) => {
    try {
      const res = await toggleAdminCollegeStatus(college.id);
      setColleges((prev) =>
        prev.map((c) => (c.id === college.id ? { ...c, is_active: res.is_active } : c))
      );
    } catch (err: any) {
      const msg = formatApiError(err, 'Failed to toggle status.');
      alert(`Error toggling status: ${msg}`);
      console.error('Failed to toggle status:', err);
    }
  };

  const handleDeleteCollege = async (college: AdminCollege) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete '${college.name}' (${college.code})?\n\nThis will also remove student registrations belonging to this institution if they haven't taken an assessment.`
    );
    if (!confirmed) return;

    try {
      await deleteAdminCollege(college.id);
      setColleges((prev) => prev.filter((c) => c.id !== college.id));
      setSelectedCollegeIds((prev) => prev.filter((id) => id !== college.id));
      if (selectedCollege?.id === college.id) {
        setShowDetailModal(false);
        setSelectedCollege(null);
      }
    } catch (err: any) {
      const msg = formatApiError(err, 'Failed to delete college.');
      alert(`Delete Error: ${msg}`);
    }
  };

  const handleToggleSelectAllColleges = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedCollegeIds(colleges.map((c) => c.id));
    } else {
      setSelectedCollegeIds([]);
    }
  };

  const handleToggleSelectCollege = (id: number) => {
    setSelectedCollegeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteColleges = async () => {
    if (selectedCollegeIds.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedCollegeIds.length} selected institution(s)?\n\nInstitutions with existing candidate assessment attempts cannot be deleted and must be deactivated instead.`
    );
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const res = await bulkDeleteAdminColleges(selectedCollegeIds);
      alert(res.message);
      setSelectedCollegeIds([]);
      fetchColleges();
    } catch (err: any) {
      alert(formatApiError(err, 'Failed to perform bulk deletion of institutions.'));
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleOpenDetail = async (college: AdminCollege) => {
    setSelectedCollege(college);
    setShowDetailModal(true);
    setLoadingDetail(true);
    try {
      const detail = await getAdminCollegeDetail(college.id);
      setCollegeDetail(detail);
    } catch (err) {
      console.error('Failed to fetch college detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenImport = (college: AdminCollege) => {
    setSelectedCollege(college);
    setImportFile(null);
    setImportCsvText('');
    setImportResult(null);
    setImportError('');
    setShowImportModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!createForm.name.trim()) {
      setCreateError('Institution name is required.');
      return;
    }
    if (!createForm.code.trim()) {
      setCreateError('Institution code is required.');
      return;
    }
    setCreateSubmitting(true);
    try {
      await createAdminCollege({
        ...createForm,
        code: createForm.code.trim().toUpperCase(),
      });
      setShowCreateModal(false);
      setCreateForm({
        name: '',
        code: '',
        district: '',
        city: '',
        institution_type: 'Engineering',
        affiliation: 'Anna University',
        website: '',
        location: '',
        address: '',
        admin_contact_name: '',
        contact_email: '',
        contact_phone: '',
      });
      fetchColleges();
    } catch (err: any) {
      setCreateError(formatApiError(err, 'Failed to create college.'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollege) return;
    setImportError('');
    setImportResult(null);

    if (!importFile && !importCsvText.trim()) {
      setImportError('Please select a CSV file or paste CSV text.');
      return;
    }

    setImporting(true);
    try {
      const res = await importAdminCollegeCandidates(
        selectedCollege.id,
        importFile || undefined,
        importCsvText || undefined
      );
      setImportResult(res);
      fetchColleges();
    } catch (err: any) {
      setImportError(formatApiError(err, 'Failed to import candidates.'));
    } finally {
      setImporting(false);
    }
  };

  // Metrics
  const totalCount = colleges.length;
  const activeCount = colleges.filter((c) => c.is_active).length;
  const totalCandidates = colleges.reduce((acc, c) => acc + (c.candidates_count || 0), 0);

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* ─── PAGE TITLE & ACTIONS (Mockup 2) ─────────────────────────── */}
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
          Colleges
        </h1>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowDirectoryImportModal(true)}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#0D52D6',
              border: '1.5px solid #0D52D6',
              borderRadius: '20px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Import TN Directory
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: '#0D52D6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '20px',
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(13,82,214,0.3)',
            }}
          >
            Add New Institution
          </button>
        </div>
      </div>

      {/* ─── 3 ODOMETER COUNTERS (Mockup 2) ─────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <OdometerCard label="Colleges" value={totalCount} />
        <OdometerCard label="Active" value={activeCount} />
        <OdometerCard label="Students" value={totalCandidates} />
      </div>

      {/* ─── SEARCH & FILTER PILL BAR (Mockup 2) ─────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        {/* Pill Search Input: Search by College Name */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="Search by College Name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          <div
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
        </div>

        {/* All Statuses Pill Dropdown */}
        <div style={{ position: 'relative' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
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
            <option value="all">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
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

      {/* Bulk Action Bar */}
      {selectedCollegeIds.length > 0 && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '16px',
            padding: '10px 18px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1D4ED8' }}>
            {selectedCollegeIds.length} Colleges Selected
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSelectedCollegeIds([])}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Deselect All
            </button>
            <button
              onClick={handleBulkDeleteColleges}
              disabled={bulkDeleting}
              style={{
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: bulkDeleting ? 'not-allowed' : 'pointer',
              }}
            >
              {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedCollegeIds.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ─── COLLEGES TABLE CONTAINER (Mockup 2) ────────────────────── */}
      <div
        style={{
          backgroundColor: '#0D52D6',
          borderRadius: '24px',
          padding: '12px 14px 16px',
          boxShadow: '0 6px 18px rgba(13, 82, 214, 0.15)',
        }}
      >
        {/* Table Header Row (Mockup 2) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 2.4fr 1.2fr 1.2fr 0.9fr 1fr 1fr 1fr 36px',
            padding: '10px 16px',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 800,
            alignItems: 'center',
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={colleges.length > 0 && selectedCollegeIds.length === colleges.length}
              onChange={handleToggleSelectAllColleges}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
          </div>
          <div>Institution Name</div>
          <div>Location</div>
          <div>Contact</div>
          <div style={{ textAlign: 'center' }}>Students</div>
          <div style={{ textAlign: 'center' }}>Assessments</div>
          <div>Status</div>
          <div style={{ textAlign: 'center' }}>Action</div>
          <div></div>
        </div>

        {/* College Row Cards (Mockup 2) */}
        {loading ? (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
            Loading colleges directory...
          </div>
        ) : colleges.length === 0 ? (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
            No colleges found matching the criteria.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
            {colleges.map((col) => {
              const isSelected = selectedCollegeIds.includes(col.id);
              const isExpanded = expandedCollegeId === col.id;

              return (
                <div
                  key={col.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: isSelected ? '1.5px solid #0D52D6' : '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top Grid Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 2.4fr 1.2fr 1.2fr 0.9fr 1fr 1fr 1fr 36px',
                      alignItems: 'center',
                      padding: '14px 18px',
                    }}
                  >
                    <div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectCollege(col.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </div>

                    {/* Institution Name */}
                    <div style={{ paddingRight: '8px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                        {col.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontFamily: 'monospace' }}>
                        {col.code} {col.is_verified ? '• Verified' : ''}
                      </div>
                    </div>

                    {/* Location */}
                    <div style={{ fontSize: '13px', color: '#334155' }}>
                      {col.city || col.district || col.location || '—'}
                    </div>

                    {/* Contact */}
                    <div style={{ fontSize: '12px', color: '#334155' }}>
                      {col.contact_phone || col.contact_email || col.admin_contact_name || '—'}
                    </div>

                    {/* Students */}
                    <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>
                      {String(col.candidates_count || 0).padStart(2, '0')}
                    </div>

                    {/* Assessments */}
                    <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>
                      {String(col.assigned_assessments_count || 0).padStart(2, '0')}
                    </div>

                    {/* Status */}
                    <div>
                      <span
                        style={{
                          backgroundColor: col.is_active ? '#DCFCE7' : '#F1F5F9',
                          color: col.is_active ? '#15803D' : '#64748B',
                          padding: '3px 12px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        {col.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* View Button (Mockup 2) */}
                    <div style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenDetail(col)}
                        style={{
                          backgroundColor: '#0D52D6',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '16px',
                          padding: '5px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        View
                      </button>
                    </div>

                    {/* Expand Chevron Toggle (Mockup 2) */}
                    <div style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => setExpandedCollegeId(isExpanded ? null : col.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0D52D6',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px',
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                          }}
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expandable Drawer (Mockup 2) */}
                  {isExpanded && (
                    <div
                      style={{
                        backgroundColor: '#CBD5E1',
                        borderTop: '1px solid #E2E8F0',
                        padding: '10px 24px',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <button
                        onClick={() => handleOpenEdit(col)}
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: '#1E293B',
                          border: '1px solid #94A3B8',
                          borderRadius: '16px',
                          padding: '6px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleOpenMerge(col)}
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: '#1E293B',
                          border: '1px solid #94A3B8',
                          borderRadius: '16px',
                          padding: '6px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Merge
                      </button>
                      <button
                        onClick={() => handleOpenImport(col)}
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: '#1E293B',
                          border: '1px solid #94A3B8',
                          borderRadius: '16px',
                          padding: '6px 18px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Export Data
                      </button>
                      <button
                        onClick={() => handleToggleStatus(col)}
                        style={{
                          backgroundColor: '#F87171',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '16px',
                          padding: '6px 18px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {col.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteCollege(col)}
                        style={{
                          backgroundColor: '#DC2626',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '16px',
                          padding: '6px 18px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── CREATE COLLEGE MODAL ────────────────────────────────────── */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '28px',
              width: '560px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                Register Participating Institution
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div style={{ padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Institution Official Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Coimbatore Institute of Technology"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Unique Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CIT"
                    value={createForm.code}
                    onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box', textTransform: 'uppercase' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    City / Campus Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Coimbatore, Tamil Nadu"
                    value={createForm.location}
                    onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    TPO / Faculty In-Charge Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Rajesh Kumar"
                    value={createForm.admin_contact_name}
                    onChange={(e) => setCreateForm({ ...createForm, admin_contact_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Official Contact Email
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. placement@cit.edu.in"
                    value={createForm.contact_email}
                    onChange={(e) => setCreateForm({ ...createForm, contact_email: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9876543210"
                    value={createForm.contact_phone}
                    onChange={(e) => setCreateForm({ ...createForm, contact_phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Campus Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Street, Campus, Pincode"
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '6px', padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  style={{ backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {createSubmitting ? 'Registering...' : 'Save Institution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── IMPORT CANDIDATES MODAL ─────────────────────────────────── */}
      {showImportModal && selectedCollege && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '28px',
              width: '620px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Import Candidates for {selectedCollege.name}
                </h2>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Code: {selectedCollege.code}</span>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#0369A1' }}>
              <strong>Required CSV Headers:</strong> <br />
              <code style={{ background: '#E0F2FE', padding: '2px 4px', borderRadius: '4px' }}>
                full_name, register_number, email, department, year_of_study, phone_number
              </code>
              <br />
              Duplicates within {selectedCollege.name} will update existing records automatically.
            </div>

            {importError && (
              <div style={{ padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                {importError}
              </div>
            )}

            {importResult && (
              <div style={{ padding: '14px', backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, color: '#15803D', fontSize: '14px', marginBottom: '6px' }}>
                  CSV Import Complete
                </div>
                <div style={{ fontSize: '13px', color: '#166534' }}>
                  Processed <strong>{importResult.total_rows}</strong> rows: Created <strong>{importResult.created_count}</strong> new, Updated <strong>{importResult.updated_count}</strong>.
                </div>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#FFF7ED', borderRadius: '4px', fontSize: '12px', color: '#C2410C' }}>
                    <strong>{importResult.errors.length} Warnings/Errors:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {importResult.errors.slice(0, 5).map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleImportSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Option A: Upload CSV File
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  style={{ fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Option B: Or Paste CSV Text
                </label>
                <textarea
                  rows={5}
                  placeholder={`full_name,register_number,email,department,year_of_study,phone_number\nArun Kumar,717821L101,arun@cit.edu.in,ECE,Final Year,9876543210`}
                  value={importCsvText}
                  onChange={(e) => setImportCsvText(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  style={{ backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '6px', padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  style={{ backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {importing ? 'Processing CSV...' : 'Start Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── COLLEGE DETAIL MODAL ───────────────────────────────────── */}
      {showDetailModal && selectedCollege && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '28px',
              width: '740px',
              maxWidth: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                    {selectedCollege.name}
                  </h2>
                  <span style={{ backgroundColor: '#EEF2FF', color: '#3730A3', fontWeight: 700, fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
                    {selectedCollege.code}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                  {selectedCollege.location || 'Campus'} • Status: {selectedCollege.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>Loading institution details...</div>
            ) : collegeDetail ? (
              <div>
                {/* Contact Card */}
                <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px', fontSize: '13px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Administrative Contact</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div><strong>Representative:</strong> {collegeDetail.admin_contact_name || '—'}</div>
                    <div><strong>Email:</strong> {collegeDetail.contact_email || '—'}</div>
                    <div><strong>Phone:</strong> {collegeDetail.contact_phone || '—'}</div>
                  </div>
                  {collegeDetail.address && (
                    <div style={{ marginTop: '8px' }}><strong>Address:</strong> {collegeDetail.address}</div>
                  )}
                </div>

                {/* Assigned Assessments Section */}
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '10px' }}>
                    Assigned Assessments ({collegeDetail.assigned_assessments?.length || 0})
                  </h3>
                  {collegeDetail.assigned_assessments && collegeDetail.assigned_assessments.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      {collegeDetail.assigned_assessments.map((a) => (
                        <div key={a.id} style={{ border: '1px solid #E2E8F0', borderRadius: '6px', padding: '10px 14px', backgroundColor: '#FFFFFF' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0B2E6F' }}>{a.title}</span>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: a.is_open ? '#DCFCE7' : '#F1F5F9', color: a.is_open ? '#15803D' : '#64748B' }}>
                              {a.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                            Code: <strong>{a.code}</strong> • {a.duration_minutes} mins • {a.total_marks} marks
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#94A3B8', fontStyle: 'italic' }}>
                      No assessments currently assigned to this institution.
                    </div>
                  )}
                </div>

                {/* Registered Candidates Preview */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                      Registered Student Roster ({collegeDetail.candidates?.length || 0})
                    </h3>
                    <button
                      onClick={() => {
                        setShowDetailModal(false);
                        handleOpenImport(selectedCollege);
                      }}
                      style={{ fontSize: '12px', color: '#0B2E6F', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                    >
                      + Import More Students
                    </button>
                  </div>

                  {collegeDetail.candidates && collegeDetail.candidates.length > 0 ? (
                    <div style={{ border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ padding: '8px 12px', fontWeight: 700 }}>Reg No</th>
                            <th style={{ padding: '8px 12px', fontWeight: 700 }}>Name</th>
                            <th style={{ padding: '8px 12px', fontWeight: 700 }}>Email</th>
                            <th style={{ padding: '8px 12px', fontWeight: 700 }}>Department</th>
                            <th style={{ padding: '8px 12px', fontWeight: 700 }}>Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {collegeDetail.candidates.map((cand) => (
                            <tr key={cand.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{cand.register_number}</td>
                              <td style={{ padding: '8px 12px' }}>{cand.full_name}</td>
                              <td style={{ padding: '8px 12px', color: '#64748B' }}>{cand.email}</td>
                              <td style={{ padding: '8px 12px' }}>{cand.department}</td>
                              <td style={{ padding: '8px 12px' }}>{cand.phone_number || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#94A3B8', fontStyle: 'italic' }}>
                      No students registered yet. Click "Import More Students" to upload a CSV.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{ backgroundColor: '#0B2E6F', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
          {/* ─── DIRECTORY IMPORT MODAL (PHASE 2.1) ────────────────────── */}
      {/* ─── EDIT COLLEGE MODAL ─────────────────────────────────────── */}
      {showEditModal && editingCollege && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '560px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                Edit Institution Details
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              {editError && (
                <div style={{ backgroundColor: '#FEF2F2', color: '#DC2626', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
                  {editError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Institution Name *
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    College Code *
                  </label>
                  <input
                    type="text"
                    value={editForm.code}
                    onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', textTransform: 'uppercase' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    District *
                  </label>
                  <input
                    type="text"
                    value={editForm.district}
                    onChange={(e) => setEditForm({ ...editForm, district: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    City / Town
                  </label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Institution Type
                  </label>
                  <select
                    value={editForm.institution_type}
                    onChange={(e) => setEditForm({ ...editForm, institution_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Arts and Science">Arts and Science</option>
                    <option value="Polytechnic">Polytechnic</option>
                    <option value="University">University</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Affiliation
                  </label>
                  <input
                    type="text"
                    value={editForm.affiliation}
                    onChange={(e) => setEditForm({ ...editForm, affiliation: e.target.value })}
                    placeholder="e.g. Anna University, Autonomous"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Official Website
                </label>
                <input
                  type="text"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  placeholder="e.g. www.institution.edu.in"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={editForm.contact_email}
                    onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Contact Phone / TPO
                  </label>
                  <input
                    type="text"
                    value={editForm.contact_phone}
                    onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="is_verified_check"
                  checked={editForm.is_verified}
                  onChange={(e) => setEditForm({ ...editForm, is_verified: e.target.checked })}
                  style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#059669' }}
                />
                <label htmlFor="is_verified_check" style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                  Mark as Verified Institution
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#0B2E6F', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: editSubmitting ? 'not-allowed' : 'pointer' }}
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MERGE DUPLICATE COLLEGE MODAL ─────────────────────────── */}
      {showMergeModal && mergeSourceCollege && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '24px',
              width: '540px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🔀</span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Merge Institution Entry
                </h3>
              </div>
              <button
                onClick={() => setShowMergeModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '12.5px', color: '#92400E', lineHeight: 1.5 }}>
              <strong>Caution:</strong> You are about to merge the provisional / duplicate entry:
              <div style={{ fontWeight: 800, marginTop: '4px', color: '#78350F' }}>
                {mergeSourceCollege.name} ({mergeSourceCollege.code})
              </div>
              <div style={{ marginTop: '6px' }}>
                All registered candidates and assessment allocations will be transferred to the target institution. The source name and code will be recorded as aliases on the target for future candidate auto-resolution.
              </div>
            </div>

            <form onSubmit={handleMergeSubmit}>
              {mergeError && (
                <div style={{ backgroundColor: '#FEF2F2', color: '#DC2626', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
                  {mergeError}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Target Authoritative Institution *
                </label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                >
                  <option value="">Select Target Authoritative College...</option>
                  {colleges
                    .filter((c) => c.id !== mergeSourceCollege.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.is_verified ? '✓ ' : ''}{c.name} ({c.code}) - {c.district || c.location || 'TN'}
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={merging || !mergeTargetId}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: merging || !mergeTargetId ? '#94A3B8' : '#D97706',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: merging || !mergeTargetId ? 'not-allowed' : 'pointer',
                  }}
                >
                  {merging ? 'Merging...' : 'Confirm & Merge →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {showDirectoryImportModal && (
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
              maxWidth: '560px',
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 20px 35px -10px rgba(11, 46, 111, 0.15)',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
                  Import Tamil Nadu Institution Directory
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Bulk import verified colleges with districts, type, and affiliations.
                </span>
              </div>
              <button
                onClick={() => setShowDirectoryImportModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94A3B8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportDirectory}>
              <div
                style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '10px',
                  padding: '24px',
                  textAlign: 'center',
                  marginBottom: '16px',
                  backgroundColor: '#FAF7F3',
                }}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setDirectoryFile(e.target.files?.[0] || null)}
                  style={{ display: 'block', margin: '0 auto' }}
                />
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px' }}>
                  Accepted CSV columns: <code>code, name, district, city, institution_type, affiliation, website</code>
                </div>
              </div>

              {directoryImportResult && (
                <div
                  style={{
                    backgroundColor: directoryImportResult.errors?.length > 0 ? '#FEF2F2' : '#F0FDF4',
                    border: `1px solid ${directoryImportResult.errors?.length > 0 ? '#FECACA' : '#BBF7D0'}`,
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '13px',
                  }}
                >
                  <strong style={{ color: directoryImportResult.errors?.length > 0 ? '#DC2626' : '#16A34A' }}>
                    {directoryImportResult.message}
                  </strong>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#475569' }}>
                    Processed: {directoryImportResult.total_processed} | Created: {directoryImportResult.created_count} | Updated: {directoryImportResult.updated_count}
                  </div>
                  {directoryImportResult.errors?.length > 0 && (
                    <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: '11.5px', color: '#DC2626' }}>
                      {directoryImportResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowDirectoryImportModal(false)}
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
                  Close
                </button>
                <button
                  type="submit"
                  disabled={directoryImporting || !directoryFile}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: directoryImporting || !directoryFile ? '#94A3B8' : '#1455B8',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: directoryImporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {directoryImporting ? 'Importing Directory...' : 'Import Directory →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
</div>
  );
}
