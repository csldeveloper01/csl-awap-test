import { useState, useEffect } from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { PageContainer, SectionHeader, StatusBadge, SearchToolbar, EmptyState } from '../../components/ui';
import {
  getAdminCandidates,
  getAdminCandidateDetail,
  getAdminColleges,
  toggleAdminCandidateStatus,
  deleteAdminCandidate,
  bulkDeleteAdminCandidates,
  grantAdminAttemptRecovery,
  reassignAdminCandidateAttempt,
  exportAdminCandidatesCSV,
  exportAdvancedStudentData,
  type AdminCandidate,
  type AdminCollege,
} from '../../api/admin';

interface AdminCandidatesViewProps {
  onReviewAttempt: (attemptId: string) => void;
}

export function AdminCandidatesView({ onReviewAttempt }: AdminCandidatesViewProps) {
  const { tokens } = useAdminTheme();
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [colleges, setColleges] = useState<AdminCollege[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingXLSX, setExportingXLSX] = useState(false);

  const handleExportXLSX = async () => {
    try {
      setExportingXLSX(true);
      await exportAdvancedStudentData({
        format: 'xlsx',
        search: search.trim() || undefined,
        college_id: selectedCollegeId ? Number(selectedCollegeId) : undefined,
        filename: `csl-candidates-${new Date().toISOString().slice(0, 10)}.xlsx`,
      });
    } catch {
      alert('Failed to export candidate records to XLSX.');
    } finally {
      setExportingXLSX(false);
    }
  };
  // Admin Recovery & Reassignment Dialog States (Phase 2.1)
  const [showGrantRecoveryModal, setShowGrantRecoveryModal] = useState(false);
  const [targetAttemptId, setTargetAttemptId] = useState('');
  const [recoveryReason, setRecoveryReason] = useState('');
  const [grantingRecovery, setGrantingRecovery] = useState(false);

  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignReason, setReassignReason] = useState('');
  const [reassignAssessmentId, setReassignAssessmentId] = useState('');
  const [reassigning, setReassigning] = useState(false);


  // Bulk Selection & Deletion State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const handleExportCSV = async () => {
    try {
      setExportingCSV(true);
      const blob = await exportAdminCandidatesCSV({
        search: search.trim() || undefined,
        college_id: selectedCollegeId || undefined,
      });

      if (!blob || blob.size === 0) {
        alert('No candidate records were found to export.');
        return;
      }

      // Check if blob is actually an error JSON
      if (blob.type.includes('application/json')) {
        const text = await blob.text();
        const parsed = JSON.parse(text);
        alert(`Export failed: ${parsed.detail || text}`);
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `csl-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      let message = 'Failed to export candidate records to CSV.';
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed.detail) message = parsed.detail;
        } catch {
          // ignore
        }
      } else if (err?.message) {
        message = err.message;
      }
      alert(message);
    } finally {
      setExportingCSV(false);
    }
  };

  const handleGrantRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryReason.trim()) {
      alert('Mandatory reason is required to grant an emergency session recovery.');
      return;
    }
    setGrantingRecovery(true);
    try {
      const res = await grantAdminAttemptRecovery(targetAttemptId, recoveryReason.trim());
      alert(res.message);
      setShowGrantRecoveryModal(false);
      setRecoveryReason('');
      if (selectedCandidate) {
        handleSelectCandidate(selectedCandidate.id);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to grant recovery.');
    } finally {
      setGrantingRecovery(false);
    }
  };

  const handleReassignAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    if (!reassignReason.trim()) {
      alert('Mandatory reason is required to authorize a candidate reassignment.');
      return;
    }
    setReassigning(true);
    try {
      const res = await reassignAdminCandidateAttempt(
        selectedCandidate.id,
        reassignReason.trim(),
        reassignAssessmentId || undefined
      );
      alert(res.message);
      setShowReassignModal(false);
      setReassignReason('');
      handleSelectCandidate(selectedCandidate.id);
      loadCandidates();
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to authorize reassignment.');
    } finally {
      setReassigning(false);
    }
  };

  const loadCandidates = async () => {
    try {
      setLoading(true);
      const data = await getAdminCandidates({
        search: search.trim() || undefined,
        college_id: selectedCollegeId || undefined,
      });
      setCandidates(data);
    } catch {
      alert('Failed to load candidate list.');
    } finally {
      setLoading(false);
    }
  };

  const loadColleges = async () => {
    try {
      const data = await getAdminColleges();
      setColleges(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadColleges();
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [selectedCollegeId]);

  const handleToggleCandidate = async (candId: string) => {
    try {
      const res = await toggleAdminCandidateStatus(candId);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candId ? { ...c, is_active: res.is_active } : c))
      );
    } catch {
      alert('Failed to toggle candidate status.');
    }
  };

  const handleSelectCandidate = async (candidateId: string) => {
    try {
      const detail = await getAdminCandidateDetail(candidateId);
      setSelectedCandidate(detail);
    } catch {
      alert('Failed to load candidate details.');
    }
  };

  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(candidates.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteCandidate = async (cand: AdminCandidate) => {
    const hasAttempts = (cand.attempts_count || 0) > 0;
    const confirmPrompt = hasAttempts
      ? `Candidate "${cand.full_name}" (${cand.register_number}) has ${cand.attempts_count} recorded assessment attempt(s).\n\nTo preserve historical audit records and cohort performance metrics, deleting this candidate will permanently anonymize their personal identifying information (PII) and deactivate their account.\n\nAre you sure you wish to proceed?`
      : `Are you sure you want to permanently delete candidate "${cand.full_name}" (${cand.register_number})?\n\nThis action cannot be undone.`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setDeleting(true);
      const res = await deleteAdminCandidate(cand.id);
      alert(res.message);
      setSelectedIds((prev) => prev.filter((id) => id !== cand.id));
      if (selectedCandidate?.id === cand.id) {
        setSelectedCandidate(null);
      }
      loadCandidates();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Failed to delete candidate.');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmPrompt = `Are you sure you want to delete ${selectedIds.length} selected candidate(s)?\n\n- Candidates with NO assessment attempts will be permanently erased.\n- Candidates WITH existing attempts will have their PII safely anonymized and accounts deactivated to preserve assessment analytics.\n\nDo you want to proceed?`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setDeleting(true);
      const res = await bulkDeleteAdminCandidates(selectedIds);
      alert(res.message);
      setSelectedIds([]);
      loadCandidates();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Failed to perform bulk candidate deletion.');
    } finally {
      setDeleting(false);
    }
  };

  const isAllSelected = candidates.length > 0 && selectedIds.length === candidates.length;
  const isPartiallySelected = selectedIds.length > 0 && selectedIds.length < candidates.length;

  const activeCandidatesCount = candidates.filter((c) => c.is_active).length;
  const attemptedCandidatesCount = candidates.filter((c) => (c.attempts_count || 0) > 0).length;
  const submittedCandidatesCount = candidates.filter((c) => c.latest_state === 'SUBMITTED').length;
  const inProgressCandidatesCount = candidates.filter((c) => c.latest_state === 'IN_PROGRESS').length;

  return (
    <PageContainer>
      <SectionHeader
        title="Registered Candidates"
        description="Inspect candidate enrollment, institutional affiliations, attempt history, recovery authorizations, and finalized scores."
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={exportingCSV}
              className="csl-btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: exportingCSV ? 'not-allowed' : 'pointer',
              }}
              title="Download candidate details as CSV"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exportingCSV ? 'Exporting CSV...' : 'Export CSV'}
            </button>
            <button
              type="button"
              onClick={handleExportXLSX}
              disabled={exportingXLSX}
              className="csl-btn-primary"
              style={{
                backgroundColor: '#16A34A',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: exportingXLSX ? 'not-allowed' : 'pointer',
              }}
              title="Download candidate details & results as styled Excel workbook"
            >
              {exportingXLSX ? 'Exporting XLSX...' : 'Export XLSX'}
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '16px',
        }}
      >
        <OdometerCard label="Total Candidates" value={candidates.length} subtitle="Registered directory" />
        <OdometerCard label="Active Accounts" value={activeCandidatesCount} subtitle="Eligible to test" accent="green" />
        <OdometerCard label="With Attempts" value={attemptedCandidatesCount} subtitle="Engaged candidates" accent="blue" />
        <OdometerCard label="Submitted" value={submittedCandidatesCount} subtitle="Completed latest" accent="green" />
        <OdometerCard label="In Progress" value={inProgressCandidatesCount} subtitle="Active sessions" accent="amber" />
      </div>

      {/* Search & Institution Filter Toolbar */}
      <SearchToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search candidate, roll no, college..."
        onSubmitSearch={() => loadCandidates()}
        filters={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={selectedCollegeId}
              onChange={(e) => setSelectedCollegeId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: `1px solid ${tokens.border}`,
                fontSize: '13px',
                backgroundColor: tokens.inputBg,
                color: tokens.textPrimary,
                outlineColor: tokens.cslBlue,
                cursor: 'pointer',
                maxWidth: '240px',
              }}
            >
              <option value="">All Institutions</option>
              {colleges.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.code} — {col.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => loadCandidates()}
              className="csl-btn-primary"
              style={{ padding: '8px 16px' }}
            >
              Search
            </button>
            {(search || selectedCollegeId) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCollegeId('');
                }}
                className="csl-btn-secondary"
                style={{ padding: '8px 12px' }}
              >
                Clear
              </button>
            )}
          </div>
        }
      />

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div
          style={{
            backgroundColor: tokens.cslBlueSoftBg,
            border: `1px solid ${tokens.cslBlueSoftBorder}`,
            borderRadius: '10px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              className="csl-tabular"
              style={{
                backgroundColor: tokens.cslBlue,
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '3px 10px',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {selectedIds.length} Selected
            </span>
            <span style={{ fontSize: '13px', color: tokens.cslBlueSoftText, fontWeight: 500 }}>
              Batch actions: unreferenced candidates are deleted permanently; candidates with attempts are anonymized.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedIds([])}
              className="csl-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Deselect All
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              style={{
                padding: '6px 14px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: deleting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>{deleting ? 'Deleting...' : `Delete Selected (${selectedIds.length})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div
        className="csl-card"
        style={{
          overflowX: 'auto',
          padding: 0,
        }}
      >
        <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: tokens.surfaceElevated, borderBottom: `1px solid ${tokens.border}`, color: tokens.textMuted }}>
              <th style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isPartiallySelected;
                  }}
                  onChange={handleToggleSelectAll}
                  style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                  title="Select / Deselect All Candidates"
                />
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Candidate Name</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Roll / Register No</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>College / Institution</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Department & Year</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Attempts</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Latest Status</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Latest Score</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted }}>
                  Loading candidates from database...
                </td>
              </tr>
            ) : candidates.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '24px' }}>
                  <EmptyState
                    title="No candidates found"
                    description="No registered candidates match the current search or institution filter."
                  />
                </td>
              </tr>
            ) : (
              candidates.map((cand) => {
                const isSelected = selectedIds.includes(cand.id);
                return (
                  <tr
                    key={cand.id}
                    style={{
                      borderBottom: `1px solid ${tokens.borderLight}`,
                      backgroundColor: isSelected ? tokens.cslBlueSoftBg : 'transparent',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = tokens.surfaceHover;
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(cand.id)}
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: tokens.textPrimary }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{cand.full_name}</span>
                        <StatusBadge status={cand.is_active ? 'ACTIVE' : 'INACTIVE'} label={cand.is_active ? 'Active' : 'Inactive'} size="sm" dot={false} />
                      </div>
                      <div style={{ fontSize: '12px', color: tokens.textMuted, fontWeight: 400, marginTop: '2px' }}>
                        {cand.email} {cand.phone_number && `• ${cand.phone_number}`}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: tokens.monoFamily, fontWeight: 600, color: tokens.textPrimary }}>
                      {cand.register_number}
                    </td>
                    <td style={{ padding: '12px 16px', color: tokens.textSecondary }}>
                      {cand.college_code && (
                        <span style={{ backgroundColor: tokens.surfaceElevated, border: `1px solid ${tokens.border}`, color: tokens.textPrimary, fontFamily: tokens.monoFamily, fontWeight: 600, fontSize: '11px', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
                          {cand.college_code}
                        </span>
                      )}
                      {cand.college}
                    </td>
                    <td style={{ padding: '12px 16px', color: tokens.textSecondary }}>
                      {cand.department}
                      <div style={{ fontSize: '11.5px', color: tokens.textMuted, marginTop: '2px' }}>{cand.year_of_study}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                      <span
                        className="csl-tabular"
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: tokens.surfaceElevated,
                          border: `1px solid ${tokens.border}`,
                          color: tokens.textPrimary,
                        }}
                      >
                        {cand.attempts_count}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {cand.latest_state ? (
                        <StatusBadge status={cand.latest_state} size="sm" />
                      ) : (
                        <span style={{ color: tokens.textMuted, fontSize: '12px' }}>Registered</span>
                      )}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', fontWeight: 700, color: tokens.textPrimary }}>
                      {cand.latest_score !== null && cand.latest_score !== undefined
                        ? `${cand.latest_score} / 50`
                        : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          onClick={() => handleSelectCandidate(cand.id)}
                          className="csl-btn-secondary"
                          style={{
                            padding: '5px 10px',
                            fontSize: '12px',
                            color: tokens.cslBlue,
                          }}
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleToggleCandidate(cand.id)}
                          title={cand.is_active ? 'Deactivate candidate' : 'Activate candidate'}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: cand.is_active ? tokens.dangerBg : tokens.successBg,
                            border: `1px solid ${cand.is_active ? tokens.dangerBorder : tokens.successBorder}`,
                            borderRadius: '6px',
                            color: cand.is_active ? tokens.dangerText : tokens.successText,
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {cand.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDeleteCandidate(cand)}
                          title="Delete candidate record or anonymize PII"
                          style={{
                            padding: '5px 10px',
                            backgroundColor: tokens.dangerBg,
                            color: tokens.dangerText,
                            border: `1px solid ${tokens.dangerBorder}`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Candidate Detail Modal */}
      {selectedCandidate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              borderRadius: '12px',
              padding: '28px',
              boxShadow: tokens.modalShadow,
              border: `1px solid ${tokens.border}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <StatusBadge label="Candidate Profile" variant="info" size="sm" dot={false} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                    {selectedCandidate.full_name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setReassignReason('');
                      setShowReassignModal(true);
                    }}
                    className="csl-btn-secondary"
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      color: tokens.cslBlue,
                    }}
                    title="Authorize a genuinely new attempt for this student"
                  >
                    + Authorize New Attempt
                  </button>
                </div>
                <p style={{ fontSize: '13px', color: tokens.textMuted, margin: '4px 0 0 0' }}>
                  {selectedCandidate.email} • <span style={{ fontFamily: tokens.monoFamily }}>{selectedCandidate.register_number}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="csl-btn-secondary"
                style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            {/* Candidate Metadata Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                backgroundColor: tokens.surfaceElevated,
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '24px',
                fontSize: '13px',
                border: `1px solid ${tokens.border}`,
              }}
            >
              <div>
                <span style={{ color: tokens.textMuted }}>College:</span>{' '}
                <strong style={{ color: tokens.textPrimary }}>{selectedCandidate.college}</strong>
              </div>
              <div>
                <span style={{ color: tokens.textMuted }}>Department:</span>{' '}
                <strong style={{ color: tokens.textPrimary }}>{selectedCandidate.department}</strong>
              </div>
              <div>
                <span style={{ color: tokens.textMuted }}>Year of Study:</span>{' '}
                <strong style={{ color: tokens.textPrimary }}>{selectedCandidate.year_of_study}</strong>
              </div>
              <div>
                <span style={{ color: tokens.textMuted }}>Phone:</span>{' '}
                <strong style={{ color: tokens.textPrimary }}>{selectedCandidate.phone_number || 'N/A'}</strong>
              </div>
            </div>

            {/* Assessment Attempts List */}
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: tokens.textPrimary, margin: '0 0 12px 0' }}>
              Associated Assessment Attempts ({selectedCandidate.attempts?.length || 0})
            </h4>

            {selectedCandidate.attempts && selectedCandidate.attempts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedCandidate.attempts.map((att: any) => (
                  <div
                    key={att.id}
                    style={{
                      border: `1px solid ${tokens.border}`,
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                      backgroundColor: tokens.surfaceElevated,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <StatusBadge status={att.state} size="sm" />
                        <strong className="csl-tabular" style={{ fontSize: '14px', color: tokens.textPrimary }}>
                          Score: {att.total_score}{att.total_questions ? ` / ${att.total_questions}` : ''} ({att.percentage}%)
                        </strong>
                        {att.is_flagged && <StatusBadge status="FLAGGED" size="sm" />}
                      </div>
                      <div className="csl-tabular" style={{ fontSize: '12px', color: tokens.textMuted, marginTop: '4px' }}>
                        Total Marks: {att.total_score} • Percentage: {att.percentage}% • Tab Switches: {att.tab_switch_count}
                        {att.recovery_count > 0 && <span style={{ marginLeft: '8px', color: tokens.warningText, fontWeight: 600 }}>• Recoveries: {att.recovery_count}</span>}
                        {att.admin_recovery_granted && <span style={{ marginLeft: '8px', color: tokens.successText, fontWeight: 600 }}>• Admin Recovery Granted</span>}
                        {att.is_reassigned && <span style={{ marginLeft: '8px', color: tokens.textMuted, fontStyle: 'italic' }}>• (Reassigned)</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {(att.state === 'IN_PROGRESS' || att.state === 'CREATED') && (
                        <button
                          type="button"
                          onClick={() => {
                            setTargetAttemptId(att.id);
                            setRecoveryReason('');
                            setShowGrantRecoveryModal(true);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: tokens.warningBg,
                            color: tokens.warningText,
                            border: `1px solid ${tokens.warningBorder}`,
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Grant 1 extra session recovery on this in-flight attempt"
                        >
                          Grant Recovery (+1)
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedCandidate(null);
                          onReviewAttempt(att.id);
                        }}
                        className="csl-btn-primary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 14px',
                          fontSize: '12px',
                        }}
                      >
                        <span>Inspect Review</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: tokens.textMuted, margin: 0 }}>
                This candidate has not started any attempts yet.
              </p>
            )}

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="csl-btn-secondary"
                style={{ padding: '8px 18px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── GRANT RECOVERY MODAL ─────────────────────────────────── */}
      {showGrantRecoveryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 120,
            padding: '20px',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.border}`,
              borderRadius: '12px',
              padding: '24px',
              boxShadow: tokens.modalShadow,
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: tokens.textPrimary, margin: '0 0 8px 0' }}>
              Grant Emergency Recovery Allowance
            </h3>
            <p style={{ fontSize: '13px', color: tokens.textSecondary, lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Authorizes +1 session recovery on this active attempt. The student can resume their current exam with preserved timer and responses. Mandatory audit reason required.
            </p>
            <form onSubmit={handleGrantRecovery}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Reason for Granting Recovery *
                </label>
                <textarea
                  value={recoveryReason}
                  onChange={(e) => setRecoveryReason(e.target.value)}
                  required
                  placeholder="e.g. Campus power disruption, network reconnect approved by lab proctor..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${tokens.border}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowGrantRecoveryModal(false)}
                  className="csl-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grantingRecovery || !recoveryReason.trim()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#D97706',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: grantingRecovery ? 'not-allowed' : 'pointer',
                  }}
                >
                  {grantingRecovery ? 'Granting...' : 'Grant Recovery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── REASSIGN CANDIDATE ATTEMPT MODAL ──────────────────────── */}
      {showReassignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 120,
            padding: '20px',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.border}`,
              borderRadius: '12px',
              padding: '24px',
              boxShadow: tokens.modalShadow,
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: tokens.textPrimary, margin: '0 0 8px 0' }}>
              Authorize Reassignment / New Attempt
            </h3>
            <p style={{ fontSize: '13px', color: tokens.textSecondary, lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Creates a genuinely new assessment attempt for candidate <strong>{selectedCandidate?.full_name}</strong>. Previous attempts are preserved for audit records and marked as reassigned.
            </p>
            <form onSubmit={handleReassignAttempt}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Target Assessment (Optional - Leave blank for default active)
                </label>
                <input
                  type="text"
                  value={reassignAssessmentId}
                  onChange={(e) => setReassignAssessmentId(e.target.value)}
                  placeholder="Optional Assessment UUID..."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${tokens.border}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Mandatory Reassignment Reason *
                </label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  required
                  placeholder="e.g. Device hardware crash verified by proctor, sanctioned retake..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${tokens.border}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  className="csl-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassigning || !reassignReason.trim()}
                  className="csl-btn-primary"
                  style={{ cursor: reassigning ? 'not-allowed' : 'pointer' }}
                >
                  {reassigning ? 'Authorizing...' : 'Authorize New Attempt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
