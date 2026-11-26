import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { PageContainer, SectionHeader, StatusBadge, EmptyState } from '../../components/ui';
import {
  getAdminProctoringSessions,
  getAdminProctoringSessionDetail,
  reviewAdminProctoringSession,
  fetchAdminProctoringEvidenceBlob,
  type AdminProctoringSessionSummary,
  type AdminProctoringSessionDetail,
  type AdminAssessment,
} from '../../api/admin';

interface AdminSentinelViewProps {
  assessments?: AdminAssessment[];
  onReviewAttempt?: (attemptId: string) => void;
}

// Helper component to securely load and render evidence snapshot blobs with Bearer auth
const EvidenceThumbnail: React.FC<{
  evidenceId: string;
  trigger: string;
  capturedAt: string;
  onClick: () => void;
}> = ({ evidenceId, trigger, capturedAt, onClick }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setLoading(true);
    setFailed(false);

    fetchAdminProctoringEvidenceBlob(evidenceId)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [evidenceId]);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #E2E8F0',
        backgroundColor: '#0F172A',
        cursor: 'pointer',
        aspectRatio: '4 / 3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = '0 6px 14px rgba(13, 82, 214, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
      }}
    >
      {loading && (
        <div style={{ color: '#94A3B8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #38BDF8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          Loading...
        </div>
      )}
      {failed && (
        <div style={{ color: '#EF4444', fontSize: '11px', textAlign: 'center', padding: '8px' }}>
          Failed to load snapshot
        </div>
      )}
      {imageUrl && !loading && !failed && (
        <img
          src={imageUrl}
          alt={`Snapshot ${trigger}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* Snapshot Trigger Pill */}
      <div
        style={{
          position: 'absolute',
          bottom: '6px',
          left: '6px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          color: '#38BDF8',
          fontSize: '9px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '4px',
          letterSpacing: '0.02em',
        }}
      >
        {trigger}
      </div>

      <div
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          color: '#E2E8F0',
          fontSize: '8px',
          fontWeight: 600,
          padding: '2px 5px',
          borderRadius: '4px',
        }}
      >
        {new Date(capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
    </div>
  );
};

export const AdminSentinelView: React.FC<AdminSentinelViewProps> = ({
  assessments = [],
  onReviewAttempt,
}) => {
  const { tokens } = useAdminTheme();
  const [sessions, setSessions] = useState<AdminProctoringSessionSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Filters
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('');
  const [selectedReviewStatus, setSelectedReviewStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [flaggedOnly, setFlaggedOnly] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Active Dossier Modal
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<AdminProctoringSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Review Form in Dossier
  const [reviewDecision, setReviewDecision] = useState<'CLEARED' | 'NEEDS_REVIEW' | 'CONFIRMED_VIOLATION'>('CLEARED');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [savingReview, setSavingReview] = useState<boolean>(false);
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string>('');

  // Lightbox for Evidence Preview
  const [lightboxEvidence, setLightboxEvidence] = useState<{ id: string; trigger: string; timestamp: string } | null>(null);
  const [lightboxBlobUrl, setLightboxBlobUrl] = useState<string | null>(null);

  // Load Sessions List
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAdminProctoringSessions({
        assessment_id: selectedAssessment || undefined,
        status: selectedStatus || undefined,
        risk_level: selectedRiskLevel || undefined,
        review_status: selectedReviewStatus || undefined,
        flagged: flaggedOnly ? true : undefined,
        search: searchQuery || undefined,
      });
      setSessions(data);
    } catch (err: any) {
      console.error('Failed to load sentinel proctoring sessions:', err);
      setError(err?.response?.data?.detail || 'Failed to load proctoring sessions.');
    } finally {
      setLoading(false);
    }
  }, [selectedAssessment, selectedStatus, selectedRiskLevel, selectedReviewStatus, flaggedOnly, searchQuery]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Periodic Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadSessions();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadSessions]);

  // Load Session Dossier Detail
  const handleOpenDossier = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setLoadingDetail(true);
    setReviewSuccessMsg('');
    try {
      const detail = await getAdminProctoringSessionDetail(sessionId);
      setSessionDetail(detail);
      setReviewDecision(detail.review_status === 'PENDING' ? 'CLEARED' : detail.review_status);
      setReviewNotes(detail.review_notes || '');
    } catch (err) {
      console.error('Failed to load session dossier detail:', err);
      alert('Failed to load session details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseDossier = () => {
    setActiveSessionId(null);
    setSessionDetail(null);
  };

  // Submit Review Decision
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSessionId) return;
    try {
      setSavingReview(true);
      await reviewAdminProctoringSession(activeSessionId, reviewDecision, reviewNotes);
      setReviewSuccessMsg('Review status updated successfully.');
      setTimeout(() => setReviewSuccessMsg(''), 3000);
      // Refresh detail and list
      const updated = await getAdminProctoringSessionDetail(activeSessionId);
      setSessionDetail(updated);
      loadSessions();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to submit review decision.');
    } finally {
      setSavingReview(false);
    }
  };

  // Lightbox Image Loader
  useEffect(() => {
    if (!lightboxEvidence) {
      if (lightboxBlobUrl) URL.revokeObjectURL(lightboxBlobUrl);
      setLightboxBlobUrl(null);
      return;
    }
    let active = true;
    fetchAdminProctoringEvidenceBlob(lightboxEvidence.id)
      .then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setLightboxBlobUrl(url);
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [lightboxEvidence]);

  // Aggregated Metric Cards
  const metrics = useMemo(() => {
    const total = sessions.length;
    const active = sessions.filter((s) => s.status === 'ACTIVE').length;
    const highRisk = sessions.filter((s) => s.risk_score >= 60 || s.risk_level === 'HIGH' || s.risk_level === 'CRITICAL').length;
    const flagged = sessions.filter((s) => s.review_status === 'NEEDS_REVIEW' || s.review_status === 'CONFIRMED_VIOLATION' || s.status === 'TERMINATED_VIOLATION').length;
    return { total, active, highRisk, flagged };
  }, [sessions]);

  // Helpers for Risk Pills
  const getRiskBadge = (score: number, level: string) => {
    if (score >= 60 || level === 'HIGH' || level === 'CRITICAL') {
      return { bg: '#FEF2F2', text: '#DC2626', border: '#FCA5A5', label: `${score} — HIGH` };
    }
    if (score >= 30 || level === 'MEDIUM') {
      return { bg: '#FEFCE8', text: '#D97706', border: '#FDE047', label: `${score} — MODERATE` };
    }
    return { bg: '#F0FDF4', text: '#16A34A', border: '#86EFAC', label: `${score} — LOW` };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { bg: '#ECFDF5', text: '#059669', label: 'ACTIVE' };
      case 'INITIALIZING':
        return { bg: '#EFF6FF', text: '#2563EB', label: 'INITIALIZING' };
      case 'SUSPENDED':
        return { bg: '#FFFBEB', text: '#D97706', label: 'SUSPENDED' };
      case 'COMPLETED':
        return { bg: '#F8FAFC', text: '#475569', label: 'COMPLETED' };
      case 'TERMINATED_VIOLATION':
        return { bg: '#FEF2F2', text: '#DC2626', label: 'TERMINATED' };
      default:
        return { bg: '#F1F5F9', text: '#64748B', label: status };
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title="CSL Sentinel — AI Integrity & Proctoring"
        description="Live proctoring telemetry, 3D head pose calibration verification, screen-share monitoring, and evidence audit dossiers."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 500,
                color: tokens.textSecondary,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: tokens.cslBlue }}
              />
              Auto-refresh (15s)
            </label>
            <button
              onClick={() => loadSessions()}
              disabled={loading}
              className="csl-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span style={{ display: 'inline-block', transform: loading ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s ease' }}>
                🔄
              </span>
              Refresh
            </button>
          </div>
        }
      />

      {/* Telemetry Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '16px' }}>
        <OdometerCard label="Total Sessions" value={metrics.total} subtitle="Monitored sessions" />
        <OdometerCard label="Live Active" value={metrics.active} subtitle="Streaming cameras & screens" accent="green" />
        <OdometerCard label="High Risk Detected" value={metrics.highRisk} subtitle="Risk score ≥ 60" accent="red" />
        <OdometerCard label="Review Required" value={metrics.flagged} subtitle="Awaiting auditor action" accent="amber" />
      </div>

      {/* ─── 2. FILTERS & SEARCH BAR ─────────────────────────────────────── */}
      <div
        className="csl-card"
        style={{
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
        }}
      >
        {/* Search */}
        <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
          <input
            type="text"
            placeholder="Search candidate name, reg no, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              borderRadius: '8px',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Assessment Select */}
        <div style={{ flex: '0 1 200px' }}>
          <select
            value={selectedAssessment}
            onChange={(e) => setSelectedAssessment(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Assessments</option>
            {assessments.map((ass) => (
              <option key={ass.id} value={ass.id}>
                {ass.title} ({ass.code})
              </option>
            ))}
          </select>
        </div>

        {/* Status Select */}
        <div style={{ flex: '0 1 150px' }}>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INITIALIZING">Initializing</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="COMPLETED">Completed</option>
            <option value="TERMINATED_VIOLATION">Terminated</option>
          </select>
        </div>

        {/* Risk Level */}
        <div style={{ flex: '0 1 140px' }}>
          <select
            value={selectedRiskLevel}
            onChange={(e) => setSelectedRiskLevel(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Risk Levels</option>
            <option value="LOW">Low Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="CRITICAL">Critical Risk</option>
          </select>
        </div>

        {/* Review Status */}
        <div style={{ flex: '0 1 160px' }}>
          <select
            value={selectedReviewStatus}
            onChange={(e) => setSelectedReviewStatus(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Review States</option>
            <option value="PENDING">Pending Review</option>
            <option value="CLEARED">Cleared</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
            <option value="CONFIRMED_VIOLATION">Violation Confirmed</option>
          </select>
        </div>

        {/* Flagged Only Toggle Button */}
        <button
          onClick={() => setFlaggedOnly(!flaggedOnly)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            border: flaggedOnly ? `1px solid ${tokens.dangerBorder}` : `1px solid ${tokens.border}`,
            backgroundColor: flaggedOnly ? tokens.dangerBg : tokens.surfaceCard,
            color: flaggedOnly ? tokens.dangerText : tokens.textSecondary,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          🚩 Flagged Only
        </button>
      </div>

      {/* ─── 3. SESSIONS TABLE ───────────────────────────────────────────── */}
      <div className="csl-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: tokens.textMuted }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                border: `3px solid ${tokens.border}`,
                borderTopColor: tokens.cslBlue,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px',
              }}
            />
            Loading Sentinel integrity sessions...
          </div>
        )}

        {error && (
          <div style={{ padding: '20px', textAlign: 'center', color: tokens.dangerText, backgroundColor: tokens.dangerBg }}>
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div style={{ padding: '24px' }}>
            <EmptyState
              title="No proctoring sessions found"
              description="Adjust your filters or initiate an assessment session with Sentinel security gates."
            />
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: tokens.surfaceElevated, borderBottom: `1px solid ${tokens.border}`, color: tokens.textMuted, fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px' }}>Candidate</th>
                  <th style={{ padding: '12px 16px' }}>Assessment</th>
                  <th style={{ padding: '12px 16px' }}>Streams & Calibration</th>
                  <th style={{ padding: '12px 16px' }}>Session Status</th>
                  <th style={{ padding: '12px 16px' }}>Risk Score</th>
                  <th style={{ padding: '12px 16px' }}>Telemetry Events</th>
                  <th style={{ padding: '12px 16px' }}>Auditor Review</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess) => {
                  const riskBadge = getRiskBadge(sess.risk_score, sess.risk_level);
                  const statusBadge = getStatusBadge(sess.status);

                  return (
                    <tr
                      key={sess.id}
                      style={{
                        borderBottom: `1px solid ${tokens.borderLight}`,
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = tokens.surfaceHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Candidate */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: tokens.textPrimary }}>{sess.candidate_name}</div>
                        <div style={{ fontSize: '11.5px', color: tokens.textMuted, fontFamily: tokens.monoFamily }}>
                          {sess.register_number || 'N/A'} • {sess.college_name || 'CSL Portal'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: tokens.textMuted }}>{sess.candidate_email}</div>
                      </td>

                      {/* Assessment */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: tokens.textPrimary }}>{sess.assessment_title}</div>
                        <div style={{ fontSize: '11.5px', color: tokens.textMuted, fontFamily: tokens.monoFamily }}>{sess.assessment_code}</div>
                      </td>

                      {/* Streams & Calibration */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
                            <span
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                backgroundColor: sess.camera_status === 'ACTIVE' ? '#10B981' : '#EF4444',
                              }}
                            />
                            <span style={{ color: tokens.textSecondary }}>Cam: {sess.camera_status}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
                            <span
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                backgroundColor: sess.screen_share_status === 'ACTIVE' ? '#10B981' : '#EF4444',
                              }}
                            />
                            <span style={{ color: tokens.textSecondary }}>Screen: {sess.screen_share_status}</span>
                          </div>

                          <div style={{ fontSize: '11.5px', color: sess.face_calibration_status === 'COMPLETED' ? tokens.successText : tokens.warningText, fontWeight: 600 }}>
                            {sess.face_calibration_status === 'COMPLETED' ? '✓ Head Calibrated' : `⏳ Pose: ${sess.face_calibration_status}`}
                          </div>
                        </div>
                      </td>

                      {/* Session Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <StatusBadge status={sess.status} label={statusBadge.label} size="sm" />
                        {sess.started_at && (
                          <div className="csl-tabular" style={{ fontSize: '11px', color: tokens.textMuted, marginTop: '4px' }}>
                            Started: {new Date(sess.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>

                      {/* Risk Score */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          className="csl-tabular"
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: riskBadge.bg,
                            color: riskBadge.text,
                            border: `1px solid ${riskBadge.border}`,
                          }}
                        >
                          {riskBadge.label}
                        </span>
                      </td>

                      {/* Events Count & Latest */}
                      <td style={{ padding: '14px 16px' }}>
                        <div className="csl-tabular" style={{ fontWeight: 600, color: tokens.textPrimary }}>
                          {sess.events_count} events • {sess.evidences_count} snapshots
                        </div>
                        {sess.latest_event && (
                          <div style={{ fontSize: '11px', color: tokens.dangerText, marginTop: '2px', fontWeight: 600 }}>
                            Latest: {sess.latest_event.event_type}
                          </div>
                        )}
                      </td>

                      {/* Auditor Review */}
                      <td style={{ padding: '14px 16px' }}>
                        <StatusBadge
                          status={sess.review_status}
                          variant={
                            sess.review_status === 'CLEARED'
                              ? 'success'
                              : sess.review_status === 'CONFIRMED_VIOLATION'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        />
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          {onReviewAttempt && (
                            <button
                              onClick={() => onReviewAttempt(sess.assessment_session_id)}
                              title="Review Attempt Paper & Questions"
                              className="csl-btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '11.5px' }}
                            >
                              Attempt
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenDossier(sess.id)}
                            className="csl-btn-primary"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            Inspect Dossier
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── 4. DETAILED DOSSIER INSPECTION MODAL ────────────────────────── */}
      {activeSessionId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
          onClick={handleCloseDossier}
        >
          <div
            style={{
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.border}`,
              borderRadius: '12px',
              width: '100%',
              maxWidth: '960px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: tokens.modalShadow,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: `1px solid ${tokens.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: tokens.surfaceElevated,
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🛡️</span>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                    CSL Sentinel — Candidate Integrity Dossier
                  </h2>
                </div>
                <div style={{ fontSize: '12px', color: tokens.textMuted, marginTop: '2px' }}>
                  Session ID: <code style={{ backgroundColor: tokens.surfaceCard, border: `1px solid ${tokens.border}`, padding: '1px 6px', borderRadius: '4px', fontFamily: tokens.monoFamily }}>{activeSessionId}</code>
                </div>
              </div>

              <button
                onClick={handleCloseDossier}
                className="csl-btn-secondary"
                style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {loadingDetail && (
              <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    border: '3px solid #E2E8F0',
                    borderTopColor: '#0D52D6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px',
                  }}
                />
                Loading comprehensive candidate dossier...
              </div>
            )}

            {!loadingDetail && sessionDetail && (
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* 1. Candidate & Assessment Banner */}
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Candidate Identity
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', marginTop: '4px' }}>
                      {sessionDetail.candidate?.full_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                      Reg No: <strong>{sessionDetail.candidate?.register_number || 'N/A'}</strong> • {sessionDetail.candidate?.college_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>{sessionDetail.candidate?.email}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Assessment Details
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>
                      {sessionDetail.assessment_details?.title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                      Code: <strong>{sessionDetail.assessment_details?.code}</strong> • Mode: {sessionDetail.assessment_details?.delivery_mode}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      Duration: {sessionDetail.assessment_details?.duration_minutes} mins
                    </div>
                  </div>
                </div>

                {/* 2. Explainable Risk Breakdown Card */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '18px 20px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E6F' }}>
                      Deterministic Risk Score & Infraction Breakdown
                    </div>
                    <div
                      style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 800,
                        backgroundColor:
                          sessionDetail.risk_score >= 60 ? '#FEF2F2' : sessionDetail.risk_score >= 30 ? '#FEFCE8' : '#F0FDF4',
                        color:
                          sessionDetail.risk_score >= 60 ? '#DC2626' : sessionDetail.risk_score >= 30 ? '#D97706' : '#16A34A',
                        border: `1px solid ${
                          sessionDetail.risk_score >= 60 ? '#FCA5A5' : sessionDetail.risk_score >= 30 ? '#FDE047' : '#86EFAC'
                        }`,
                      }}
                    >
                      Risk Score: {sessionDetail.risk_score} / 100 ({sessionDetail.risk_level})
                    </div>
                  </div>

                  {sessionDetail.risk_breakdown && Object.keys(sessionDetail.risk_breakdown).length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Infraction Type</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Detected Count</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Unit Weight</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Score Impact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(sessionDetail.risk_breakdown).map(([type, item]: any) => (
                            <tr key={type} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1E293B' }}>{type}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', color: '#475569' }}>{item.count}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748B' }}>+{item.weight} pts</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#DC2626' }}>
                                +{item.contribution} pts
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#16A34A', fontWeight: 600, padding: '8px 0' }}>
                      ✓ No weighted infractions recorded. Clean session integrity.
                    </div>
                  )}
                </div>

                {/* 3. 3D Head Pose Calibration Baseline */}
                {sessionDetail.calibration && (
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E6F', marginBottom: '10px' }}>
                      Mandatory 3D Head Pose Calibration Baseline
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>Baseline Yaw (Left/Right)</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', marginTop: '2px' }}>
                          {sessionDetail.calibration.baseline_orientation?.yaw?.toFixed(1) ?? '0.0'}°
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>Baseline Pitch (Up/Down)</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', marginTop: '2px' }}>
                          {sessionDetail.calibration.baseline_orientation?.pitch?.toFixed(1) ?? '0.0'}°
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>Baseline Roll (Tilt)</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', marginTop: '2px' }}>
                          {sessionDetail.calibration.baseline_orientation?.roll?.toFixed(1) ?? '0.0'}°
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '8px' }}>
                      Calibrated at: {sessionDetail.calibration.calibrated_at ? new Date(sessionDetail.calibration.calibrated_at).toLocaleString() : 'N/A'} • Tolerance window: ±25° Yaw, ±20° Pitch
                    </div>
                  </div>
                )}

                {/* 4. Evidence Snapshots Gallery */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E6F', marginBottom: '12px' }}>
                    Evidence Snapshot Gallery ({sessionDetail.evidences?.length || 0} captured)
                  </div>

                  {(!sessionDetail.evidences || sessionDetail.evidences.length === 0) ? (
                    <div style={{ fontSize: '12px', color: '#94A3B8', padding: '16px 0', textAlign: 'center' }}>
                      No visual evidence snapshots stored for this session.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      {sessionDetail.evidences.map((ev) => (
                        <EvidenceThumbnail
                          key={ev.id}
                          evidenceId={ev.id}
                          trigger={ev.evidence_type}
                          capturedAt={ev.captured_at}
                          onClick={() => setLightboxEvidence({ id: ev.id, trigger: ev.evidence_type, timestamp: ev.captured_at })}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Chronological Event Timeline */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E6F', marginBottom: '12px' }}>
                    Chronological Anomaly & Event Timeline ({sessionDetail.events?.length || 0})
                  </div>

                  {(!sessionDetail.events || sessionDetail.events.length === 0) ? (
                    <div style={{ fontSize: '12px', color: '#10B981', padding: '12px 0' }}>
                      ✓ Zero integrity infractions or anomalies recorded.
                    </div>
                  ) : (
                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {sessionDetail.events.map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            padding: '10px 14px',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 800, color: ev.severity === 'CRITICAL' || ev.severity === 'HIGH' ? '#DC2626' : '#1E293B' }}>
                              {ev.event_type}
                            </span>
                            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                              <span style={{ color: '#64748B', marginLeft: '8px', fontSize: '11px' }}>
                                ({JSON.stringify(ev.metadata)})
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                backgroundColor:
                                  ev.severity === 'CRITICAL'
                                    ? '#FEF2F2'
                                    : ev.severity === 'HIGH'
                                    ? '#FFF1F2'
                                    : ev.severity === 'MEDIUM'
                                    ? '#FEFCE8'
                                    : '#F1F5F9',
                                color:
                                  ev.severity === 'CRITICAL' || ev.severity === 'HIGH'
                                    ? '#DC2626'
                                    : ev.severity === 'MEDIUM'
                                    ? '#D97706'
                                    : '#475569',
                              }}
                            >
                              {ev.severity}
                            </span>
                            <span style={{ color: '#94A3B8', fontSize: '11px' }}>
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Auditor Review Action Form */}
                <form
                  onSubmit={handleSubmitReview}
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    padding: '18px 20px',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E6F', marginBottom: '8px' }}>
                    Auditor Review Decision
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 14px' }}>
                    Record manual investigation outcome. AI scores prioritize inspection; human auditors hold final authority.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'flex-start' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                        Review Status Decision:
                      </label>
                      <select
                        value={reviewDecision}
                        onChange={(e) => setReviewDecision(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          backgroundColor: '#FFFFFF',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <option value="CLEARED">✓ CLEARED (No Infraction)</option>
                        <option value="NEEDS_REVIEW">⏳ NEEDS REVIEW (Investigating)</option>
                        <option value="CONFIRMED_VIOLATION">🚩 CONFIRMED VIOLATION</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                        Auditor Review Notes:
                      </label>
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Document observations, rationale for cleared or confirmed violations..."
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          fontSize: '12px',
                          outline: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
                    {reviewSuccessMsg && (
                      <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 700 }}>
                        {reviewSuccessMsg}
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={savingReview}
                      style={{
                        padding: '9px 20px',
                        backgroundColor: '#0D52D6',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(13, 82, 214, 0.25)',
                      }}
                    >
                      {savingReview ? 'Saving...' : 'Submit Review Decision'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 5. FULLSCREEN EVIDENCE LIGHTBOX ────────────────────────────── */}
      {lightboxEvidence && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '24px',
          }}
          onClick={() => setLightboxEvidence(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '85vh',
              backgroundColor: '#0F172A',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxBlobUrl ? (
              <img
                src={lightboxBlobUrl}
                alt="Enlarged Evidence"
                style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <div style={{ padding: '60px', color: '#94A3B8', textAlign: 'center' }}>
                Loading high-resolution evidence snapshot...
              </div>
            )}

            <div
              style={{
                padding: '12px 18px',
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#FFFFFF',
                fontSize: '13px',
              }}
            >
              <div>
                <strong>Trigger:</strong> <span style={{ color: '#38BDF8' }}>{lightboxEvidence.trigger}</span> •{' '}
                <strong>Captured:</strong> {new Date(lightboxEvidence.timestamp).toLocaleString()}
              </div>
              <button
                onClick={() => setLightboxEvidence(null)}
                style={{
                  backgroundColor: '#334155',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
