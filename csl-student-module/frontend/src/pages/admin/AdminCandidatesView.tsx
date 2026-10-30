import { useState, useEffect } from 'react';
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
  type AdminCandidate,
  type AdminCollege,
} from '../../api/admin';

interface AdminCandidatesViewProps {
  onReviewAttempt: (attemptId: string) => void;
}

export function AdminCandidatesView({ onReviewAttempt }: AdminCandidatesViewProps) {
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [colleges, setColleges] = useState<AdminCollege[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [exportingCSV, setExportingCSV] = useState(false);
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCandidates();
  };

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

  return (
    <div>
      {/* Header & Search */}
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
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Registered Candidates Directory
          </h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Inspect candidate enrollment, institutional affiliations, attempt history, and finalized scores.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={selectedCollegeId}
            onChange={(e) => setSelectedCollegeId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              backgroundColor: '#FFFFFF',
              outlineColor: '#1455B8',
              cursor: 'pointer',
            }}
          >
            <option value="">All Institutions</option>
            {colleges.map((col) => (
              <option key={col.id} value={col.id}>
                {col.code} — {col.name}
              </option>
            ))}
          </select>

          <div style={{ position: 'relative' }}>
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
              placeholder="Search candidate, roll no, college..."
              style={{
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                width: '260px',
                outlineColor: '#1455B8',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              padding: '8px 16px',
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
            Search
          </button>

          {(search || selectedCollegeId) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedCollegeId('');
              }}
              style={{
                padding: '8px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={exportingCSV}
            style={{
              padding: '8px 14px',
              backgroundColor: '#F8FAFC',
              color: '#0B2E6F',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: exportingCSV ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!exportingCSV) e.currentTarget.style.backgroundColor = '#E8EFFD';
            }}
            onMouseLeave={(e) => {
              if (!exportingCSV) e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            title="Download candidate details as CSV"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {exportingCSV ? 'Exporting...' : 'Export CSV'}
          </button>
        </form>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1.5px solid #BFDBFE',
            borderRadius: '12px',
            padding: '12px 20px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(20, 85, 184, 0.08)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                backgroundColor: '#1455B8',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '3px 9px',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              {selectedIds.length} Selected
            </span>
            <span style={{ fontSize: '13px', color: '#1E3A8A', fontWeight: 600 }}>
              Batch candidate actions: unreferenced candidates will be permanently removed; candidates with attempt history will be safely anonymized.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedIds([])}
              style={{
                padding: '6px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
              }}
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
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
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
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
              <th style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isPartiallySelected;
                  }}
                  onChange={handleToggleSelectAll}
                  style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#1455B8' }}
                  title="Select / Deselect All Candidates"
                />
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Candidate Name</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Roll / Register No</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>College / Institution</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Department & Year</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Attempts</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Latest Status</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Latest Score</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
                  Loading candidates from database...
                </td>
              </tr>
            ) : candidates.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
                  No candidates found matching the query criteria.
                </td>
              </tr>
            ) : (
              candidates.map((cand) => {
                const isSelected = selectedIds.includes(cand.id);
                return (
                  <tr
                    key={cand.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: isSelected ? '#F0F7FF' : 'transparent',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
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
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#1455B8' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0B2E6F' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {cand.full_name}
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '8px',
                            backgroundColor: cand.is_active ? '#DCFCE7' : '#F1F5F9',
                            color: cand.is_active ? '#15803D' : '#64748B',
                          }}
                        >
                          {cand.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                        {cand.email} {cand.phone_number && `• ${cand.phone_number}`}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700 }}>
                      {cand.register_number}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#334155' }}>
                      {cand.college_code && (
                        <span style={{ backgroundColor: '#EEF2FF', color: '#3730A3', fontWeight: 700, fontSize: '11px', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
                          {cand.college_code}
                        </span>
                      )}
                      {cand.college}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {cand.department}
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{cand.year_of_study}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#F1F5F9',
                          color: '#334155',
                        }}
                      >
                        {cand.attempts_count}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {cand.latest_state ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor:
                              cand.latest_state === 'SUBMITTED'
                                ? '#DCFCE7'
                                : cand.latest_state === 'IN_PROGRESS'
                                ? '#FEF3C7'
                                : '#F1F5F9',
                            color:
                              cand.latest_state === 'SUBMITTED'
                                ? '#166534'
                                : cand.latest_state === 'IN_PROGRESS'
                                ? '#B45309'
                                : '#475569',
                          }}
                        >
                          {cand.latest_state}
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '11px' }}>Registered</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0B2E6F' }}>
                      {cand.latest_score !== null && cand.latest_score !== undefined
                        ? `${cand.latest_score} / 50`
                        : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          onClick={() => handleSelectCandidate(cand.id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #1455B8',
                            borderRadius: '6px',
                            color: '#1455B8',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleToggleCandidate(cand.id)}
                          title={cand.is_active ? 'Deactivate candidate' : 'Activate candidate'}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: cand.is_active ? '#FFF1F2' : '#F0FDF4',
                            border: `1px solid ${cand.is_active ? '#FECDD3' : '#BBF7D0'}`,
                            borderRadius: '6px',
                            color: cand.is_active ? '#E11D48' : '#16A34A',
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
                            padding: '6px 10px',
                            backgroundColor: '#FFF1F2',
                            color: '#BE123C',
                            border: '1px solid #FDA4AF',
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
            backgroundColor: 'rgba(11, 46, 111, 0.4)',
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
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 20px 35px -10px rgba(11, 46, 111, 0.15)',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <span
                  style={{
                    backgroundColor: 'rgba(20, 85, 184, 0.08)',
                    color: '#1455B8',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  Candidate Profile
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0B2E6F', margin: '6px 0 2px 0' }}>
                    {selectedCandidate.full_name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setReassignReason('');
                      setShowReassignModal(true);
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      backgroundColor: '#EFF6FF',
                      color: '#1D4ED8',
                      border: '1px solid #BFDBFE',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Authorize a genuinely new attempt for this student (Phase 2.1)"
                  >
                    + Authorize New Attempt
                  </button>
                </div>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                  {selectedCandidate.email} • {selectedCandidate.register_number}
                </p>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '4px',
                }}
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
                backgroundColor: '#F8FAFC',
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '24px',
                fontSize: '13px',
                border: '1px solid #E2E8F0',
              }}
            >
              <div>
                <span style={{ color: '#64748B' }}>College:</span>{' '}
                <strong style={{ color: '#0B2E6F' }}>{selectedCandidate.college}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Department:</span>{' '}
                <strong style={{ color: '#0B2E6F' }}>{selectedCandidate.department}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Year of Study:</span>{' '}
                <strong style={{ color: '#0B2E6F' }}>{selectedCandidate.year_of_study}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Phone:</span>{' '}
                <strong style={{ color: '#0B2E6F' }}>{selectedCandidate.phone_number || 'N/A'}</strong>
              </div>
            </div>

            {/* Assessment Attempts List */}
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 12px 0' }}>
              Associated Assessment Attempts ({selectedCandidate.attempts?.length || 0})
            </h4>

            {selectedCandidate.attempts && selectedCandidate.attempts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedCandidate.attempts.map((att: any) => (
                  <div
                    key={att.id}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor:
                              att.state === 'SUBMITTED' ? '#DCFCE7' : '#FEF3C7',
                            color: att.state === 'SUBMITTED' ? '#166534' : '#B45309',
                          }}
                        >
                          {att.state}
                        </span>
                        <strong style={{ fontSize: '14px', color: '#0B2E6F' }}>
                          Score: {att.total_score}{att.total_questions ? ` / ${att.total_questions}` : ''} ({att.percentage}%)
                        </strong>
                        {att.is_flagged && (
                          <span
                            style={{
                              color: '#DC2626',
                              backgroundColor: '#FEF2F2',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: 700,
                              border: '1px solid #FECACA',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                            Flagged
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                        Total Marks: {att.total_score} • Percentage: {att.percentage}% • Tab Switches: {att.tab_switch_count}
                        {att.recovery_count > 0 && <span style={{ marginLeft: '8px', color: '#D97706', fontWeight: 700 }}>• Recoveries: {att.recovery_count}</span>}
                        {att.admin_recovery_granted && <span style={{ marginLeft: '8px', color: '#16A34A', fontWeight: 700 }}>• Admin Recovery Granted</span>}
                        {att.is_reassigned && <span style={{ marginLeft: '8px', color: '#6B7280', fontStyle: 'italic' }}>• (Reassigned)</span>}
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
                            backgroundColor: '#FEF3C7',
                            color: '#92400E',
                            border: '1px solid #FDE68A',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
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
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
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
              <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
                This candidate has not started any attempts yet.
              </p>
            )}

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#E2E8F0',
                  color: '#334155',
                  border: 'none',
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
          {/* ─── GRANT RECOVERY MODAL (PHASE 2.1) ────────────────────── */}
      {showGrantRecoveryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 46, 111, 0.45)',
            backdropFilter: 'blur(3px)',
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
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 20px 35px -10px rgba(11, 46, 111, 0.2)',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 8px 0' }}>
              Grant Emergency Recovery Allowance
            </h3>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Authorizes +1 session recovery on this active attempt. The student can resume their current exam with preserved timer and responses. Mandatory audit reason required.
            </p>
            <form onSubmit={handleGrantRecovery}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '6px' }}>
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
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowGrantRecoveryModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grantingRecovery || !recoveryReason.trim()}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#D97706',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
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

      {/* ─── REASSIGN CANDIDATE ATTEMPT MODAL (PHASE 2.1) ────────────── */}
      {showReassignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 46, 111, 0.45)',
            backdropFilter: 'blur(3px)',
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
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 20px 35px -10px rgba(11, 46, 111, 0.2)',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 8px 0' }}>
              Authorize Reassignment / New Attempt
            </h3>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Creates a genuinely new assessment attempt for candidate <strong>{selectedCandidate?.full_name}</strong>. Previous attempts are preserved for audit records and marked as reassigned.
            </p>
                        <form onSubmit={handleReassignAttempt}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '6px' }}>
                  Target Assessment (Optional - Leave blank for default active)
                </label>
                <input
                  type="text"
                  value={reassignAssessmentId}
                  onChange={(e) => setReassignAssessmentId(e.target.value)}
                  placeholder="Optional Assessment UUID..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '6px' }}>
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
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassigning || !reassignReason.trim()}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#1D4ED8',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: reassigning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {reassigning ? 'Authorizing...' : 'Authorize New Attempt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
</div>
  );
}
