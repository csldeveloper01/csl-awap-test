import { useState, useEffect } from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { PageContainer, StatusBadge } from '../../components/ui';
import {
  getAdminAttemptReview,
  updateAdminAttemptReviewStatus,
  reviewAdminIntegrityEvent,
  reviewAdminCodeSubmission,
  deleteAdminAttempt,
  fetchAdminAssessmentPdfBlob,
  type AdminAttemptReview,
  type AdminIntegrityEvent,
} from '../../api/admin';

interface AdminAttemptReviewViewProps {
  attemptId: string;
  onBack: () => void;
}

export function AdminAttemptReviewView({ attemptId, onBack }: AdminAttemptReviewViewProps) {
  const { tokens } = useAdminTheme();
  const [review, setReview] = useState<AdminAttemptReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingAttempt, setDeletingAttempt] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CORRECT' | 'INCORRECT' | 'UNANSWERED'>('ALL');

  // Flag action modal
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [pendingFlagAction, setPendingFlagAction] = useState<'FLAG' | 'CLEAR_FLAG'>('FLAG');
  const [flagNotes, setFlagNotes] = useState('');
  const [updatingFlag, setUpdatingFlag] = useState(false);

  // Integrity event review modal
  const [selectedEvent, setSelectedEvent] = useState<AdminIntegrityEvent | null>(null);
  const [eventIsReviewed, setEventIsReviewed] = useState(true);
  const [eventReviewNotes, setEventReviewNotes] = useState('');
  const [savingEventReview, setSavingEventReview] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Coding submission manual evaluation state (keyed by submission ID)
  const [codeReviewDrafts, setCodeReviewDrafts] = useState<
    Record<string, { review_status: string; score_awarded: string; review_notes: string }>
  >({});
  const [savingCodeReviewId, setSavingCodeReviewId] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    if (!review?.assessment_id) return;
    try {
      setDownloadingPdf(true);
      const blob = await fetchAdminAssessmentPdfBlob(review.assessment_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = review.pdf_filename || 'question_paper.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      alert('Failed to download question paper PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const loadReview = async () => {
    try {
      setLoading(true);
      const data = await getAdminAttemptReview(attemptId);
      setReview(data);
      if (data.code_submissions) {
        const nextDrafts: Record<string, { review_status: string; score_awarded: string; review_notes: string }> = {};
        data.code_submissions.forEach((sub) => {
          nextDrafts[sub.id] = {
            review_status: sub.review_status || 'PENDING_REVIEW',
            score_awarded: String(sub.score_awarded ?? 0),
            review_notes: sub.review_notes || '',
          };
        });
        setCodeReviewDrafts(nextDrafts);
      }
    } catch {
      alert('Failed to load attempt snapshot and review data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCodeReview = async (
    submissionId: string,
    overrideStatus?: 'PENDING_REVIEW' | 'UNDER_REVIEW' | 'MANUALLY_ACCEPTED' | 'MANUALLY_REJECTED' | 'MANUALLY_SCORED',
    overrideScore?: number
  ) => {
    const draft = codeReviewDrafts[submissionId] || {
      review_status: 'PENDING_REVIEW',
      score_awarded: '0',
      review_notes: '',
    };
    const statusToSave = (overrideStatus || draft.review_status) as
      | 'PENDING_REVIEW'
      | 'UNDER_REVIEW'
      | 'MANUALLY_ACCEPTED'
      | 'MANUALLY_REJECTED'
      | 'MANUALLY_SCORED';
    const numericScore =
      overrideScore !== undefined
        ? overrideScore
        : draft.score_awarded.trim() === ''
        ? undefined
        : Number(draft.score_awarded);

    try {
      setSavingCodeReviewId(submissionId);
      await reviewAdminCodeSubmission(submissionId, {
        review_status: statusToSave,
        score_awarded: numericScore,
        review_notes: draft.review_notes,
      });
      await loadReview();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to save coding submission evaluation.');
    } finally {
      setSavingCodeReviewId(null);
    }
  };

  useEffect(() => {
    loadReview();
  }, [attemptId]);

  const openFlagModal = (action: 'FLAG' | 'CLEAR_FLAG') => {
    setPendingFlagAction(action);
    setFlagNotes(review?.flag_reason || '');
    setShowFlagModal(true);
  };

  const handleConfirmFlagAction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdatingFlag(true);
      await updateAdminAttemptReviewStatus(attemptId, pendingFlagAction, flagNotes);
      setShowFlagModal(false);
      loadReview();
    } catch {
      alert('Failed to update attempt integrity flag status.');
    } finally {
      setUpdatingFlag(false);
    }
  };

  const openEventReviewModal = (ev: AdminIntegrityEvent) => {
    setSelectedEvent(ev);
    setEventIsReviewed(ev.is_reviewed ?? true);
    setEventReviewNotes(ev.review_notes || '');
  };

  const handleSaveEventReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    try {
      setSavingEventReview(true);
      await reviewAdminIntegrityEvent(selectedEvent.id, eventIsReviewed, eventReviewNotes);
      setSelectedEvent(null);
      loadReview();
    } catch {
      alert('Failed to update integrity event review.');
    } finally {
      setSavingEventReview(false);
    }
  };

  const handleDeleteAttempt = async () => {
    if (!review) return;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete this assessment attempt for candidate ${review.candidate.full_name} (${review.candidate.register_number})?\n\nThis action cannot be undone and will permanently remove all answer snapshots, scoring records, and proctoring logs for this session.`
    );
    if (!confirmed) return;

    try {
      setDeletingAttempt(true);
      await deleteAdminAttempt(attemptId);
      alert('Assessment attempt deleted successfully.');
      onBack();
    } catch {
      alert('Failed to delete assessment attempt.');
      setDeletingAttempt(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          color: '#64748B',
          fontFamily: "'Manrope', 'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1455B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.5s linear infinite' }}>
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0B2E6F' }}>
          Loading authoritative attempt snapshot and question telemetry...
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div
        style={{
          padding: '32px',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1.5px solid #FCA5A5',
          textAlign: 'center',
          maxWidth: '500px',
          margin: '40px auto',
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#991B1B', margin: '0 0 8px 0' }}>
          Assessment Attempt Not Found
        </h3>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
          Unable to locate the specified attempt ID ({attemptId}).
        </p>
        <button
          onClick={onBack}
          style={{
            padding: '8px 18px',
            backgroundColor: '#0B2E6F',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ← Return to Attempts
        </button>
      </div>
    );
  }

  const sections = review ? Array.from(new Set(review.questions.map((q) => q.section_type).filter(Boolean))) : [];

  const filteredQuestions = review.questions.filter((q) => {
    if (sectionFilter !== 'ALL' && q.section_type !== sectionFilter) return false;
    if (statusFilter === 'CORRECT' && q.is_correct !== true) return false;
    if (statusFilter === 'INCORRECT' && (q.is_correct === true || !q.selected_option)) return false;
    if (statusFilter === 'UNANSWERED' && (q.selected_option && q.selected_option.trim())) return false;
    return true;
  });

  return (
    <PageContainer>
      {/* Top Navigation & Action Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <button
          onClick={onBack}
          className="csl-btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          ← Back to Previous List
        </button>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {review.is_flagged ? (
            <button
              onClick={() => openFlagModal('CLEAR_FLAG')}
              className="csl-btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#16A34A',
              }}
            >
              ✓ Clear Integrity Flag
            </button>
          ) : (
            <button
              onClick={() => openFlagModal('FLAG')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚠️ Flag for Proctoring Review
            </button>
          )}

          <button
            onClick={handleDeleteAttempt}
            disabled={deletingAttempt}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: tokens.dangerBg,
              color: tokens.dangerText,
              border: `1px solid ${tokens.dangerBorder}`,
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: deletingAttempt ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>{deletingAttempt ? 'Deleting...' : 'Delete Attempt'}</span>
          </button>
        </div>
      </div>

      {/* Candidate & Attempt Banner */}
      <div className="csl-card" style={{ padding: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '20px',
          }}
        >
          {/* Candidate Info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <StatusBadge
                status={review.state === 'COMPLETED_PENDING_MANUAL_EVALUATION' ? 'PENDING' : review.state}
                label={review.state === 'COMPLETED_PENDING_MANUAL_EVALUATION' ? 'Pending Manual Evaluation' : review.state}
              />
              {review.delivery_mode === 'PDF_CODING' && (
                <StatusBadge label="📄 PDF Assessment Mode" variant="coding" />
              )}
              {review.is_flagged && (
                <StatusBadge status="FLAGGED" label="⚠️ Flagged for Integrity" />
              )}
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 700, color: tokens.textPrimary, margin: '0 0 6px 0' }}>
              {review.candidate.full_name}
            </h2>
            <div style={{ fontSize: '13px', color: tokens.textSecondary, marginBottom: '4px' }}>
              Register / Roll No: <strong style={{ color: tokens.textPrimary, fontFamily: tokens.monoFamily }}>{review.candidate.register_number}</strong> • College:{' '}
              <strong style={{ color: tokens.textPrimary }}>{review.candidate.college}</strong>
            </div>
            <div style={{ fontSize: '12px', color: tokens.textMuted }}>
              {review.candidate.department} • {review.candidate.year_of_study} • {review.candidate.email}
            </div>
          </div>

          {/* Scorecards */}
          <div style={{ display: 'flex', gap: '12px', textAlign: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                backgroundColor: tokens.surfaceElevated,
                padding: '14px 20px',
                borderRadius: '10px',
                border: `1px solid ${tokens.border}`,
                minWidth: '110px',
              }}
            >
              <div style={{ fontSize: '11px', color: tokens.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>
                Total Score
              </div>
              {review.delivery_mode === 'PDF_CODING' || review.is_manual_evaluation_pending ? (
                <>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: tokens.warningText, margin: '6px 0' }}>
                    {review.delivery_mode === 'PDF_CODING' ? 'Paper Eval' : 'Manual Eval'}
                  </div>
                  <div style={{ fontSize: '11px', color: tokens.textMuted, fontWeight: 700 }}>
                    {review.delivery_mode === 'PDF_CODING' ? 'Pending Score' : `MCQ Score: ${review.aptitude_score} · Coding Pending`}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: '#0B2E6F', margin: '2px 0' }}>
                    {review.total_score} <span style={{ fontSize: '14px', color: '#94A3B8' }}>/ {review.total_questions || review.questions.length}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#16A34A', fontWeight: 800 }}>{review.percentage}%</div>
                </>
              )}
            </div>

            {/* Dynamic Section Score Cards */}
            {sections.length > 0 ? (
              sections.map((sec, idx) => {
                const secQuestions = review.questions.filter((q) => q.section_type === sec);
                const secCorrect = secQuestions.filter((q) => q.is_correct === true).length;
                return (
                  <div
                    key={sec}
                    style={{
                      backgroundColor: '#FAF7F3',
                      padding: '14px 20px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      minWidth: '100px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                      {sec}
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: idx % 2 === 0 ? '#1455B8' : '#059669', margin: '2px 0' }}>
                      {secCorrect} <span style={{ fontSize: '13px', color: '#94A3B8' }}>/ {secQuestions.length}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>Section {idx + 1}</div>
                  </div>
                );
              })
            ) : (review.aptitude_score !== undefined || review.coding_score !== undefined) ? (
              <>
                <div
                  style={{
                    backgroundColor: '#FAF7F3',
                    padding: '14px 20px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    minWidth: '100px',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                    Aptitude
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#1455B8', margin: '2px 0' }}>
                    {review.aptitude_score}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Section 1</div>
                </div>

                <div
                  style={{
                    backgroundColor: '#FAF7F3',
                    padding: '14px 20px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    minWidth: '100px',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                    Coding
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669', margin: '2px 0' }}>
                    {review.coding_score}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Section 2</div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Telemetry Row */}
        <div
          style={{
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            gap: '24px',
            fontSize: '12px',
            color: '#475569',
            flexWrap: 'wrap',
          }}
        >
          <div>
            Started: <strong>{new Date(review.started_at).toLocaleString()}</strong>
          </div>
          <div>
            Submitted:{' '}
            <strong>
              {review.submitted_at ? new Date(review.submitted_at).toLocaleString() : 'In Progress'}
            </strong>
          </div>
          <div>
            Tab Switches Recorded:{' '}
            <strong style={{ color: review.tab_switch_count >= 2 ? '#DC2626' : '#0B2E6F' }}>
              {review.tab_switch_count}
            </strong>
          </div>
          <div>
            Fullscreen Exits: <strong>{review.fullscreen_exit_count}</strong>
          </div>
          <div>
            Questions Answered:{' '}
            <strong>
              {review.answered_count} / {review.total_questions || 50}
            </strong>
          </div>
        </div>

        {review.flag_reason && (
          <div
            style={{
              marginTop: '16px',
              backgroundColor: '#FEF2F2',
              border: '1.5px solid #FECACA',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              color: '#991B1B',
            }}
          >
            <strong>Proctoring Audit Log / Reason:</strong> {review.flag_reason}
          </div>
        )}
      </div>

      {/* Proctoring & Integrity Events Section */}
      {review.integrity_events && review.integrity_events.length > 0 && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid rgba(245, 184, 61, 0.25)',
            padding: '20px 24px',
            marginBottom: '24px',
            boxShadow: '0 4px 12px rgba(11, 46, 111, 0.03)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
              Recorded Session Telemetry & Integrity Events ({review.integrity_events.length})
            </h3>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Client Visibility Transitions & Fullscreen Events
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {review.integrity_events.map((ev) => {
              const isViolation =
                ev.event_type.includes('HIDDEN') ||
                ev.event_type.includes('EXIT') ||
                ev.event_type.includes('EXCEEDED');

              return (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    backgroundColor: '#FAF7F3',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        backgroundColor: isViolation ? '#FEF2F2' : '#EFF6FF',
                        color: isViolation ? '#DC2626' : '#1455B8',
                        border: `1px solid ${isViolation ? '#FECACA' : '#BFDBFE'}`,
                      }}
                    >
                      {ev.event_type}
                    </span>

                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <span style={{ color: '#475569', fontFamily: 'monospace' }}>
                        {JSON.stringify(ev.metadata)}
                      </span>
                    )}

                    {ev.review_notes && (
                      <span style={{ color: '#166534', fontSize: '11px' }}>
                        (Note: {ev.review_notes})
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: '#94A3B8', fontSize: '11px' }}>
                      {new Date(ev.created_at || (ev as any).timestamp).toLocaleTimeString()}
                    </span>

                    {ev.is_reviewed ? (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#166534',
                          fontWeight: 700,
                          backgroundColor: '#DCFCE7',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                        }}
                      >
                        ✓ Reviewed
                      </span>
                    ) : (
                      <button
                        onClick={() => openEventReviewModal(ev)}
                        style={{
                          padding: '3px 10px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#0B2E6F',
                          cursor: 'pointer',
                        }}
                      >
                        Review Event
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Coding Submissions & Administrator Manual Evaluation */}
      {review.code_submissions && review.code_submissions.length > 0 && (
        <div
          className="csl-card"
          style={{
            backgroundColor: tokens.surfaceCard,
            borderRadius: '14px',
            border: `1px solid ${tokens.border}`,
            padding: '24px',
            marginBottom: '20px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: tokens.textPrimary, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                💻 Candidate Code Submissions &amp; Manual Evaluation
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: tokens.textMuted }}>
                All chronological submissions are preserved. Browser sample execution telemetry is unverified until evaluated by an administrator.
              </p>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: tokens.textSecondary }}>
              {review.code_submissions.length} submission{review.code_submissions.length > 1 ? 's' : ''} recorded
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {review.code_submissions.map((sub, sIdx) => {
              const draft = codeReviewDrafts[sub.id] || {
                review_status: sub.review_status || 'PENDING_REVIEW',
                score_awarded: String(sub.score_awarded ?? 0),
                review_notes: sub.review_notes || '',
              };
              const maxMarks = sub.max_marks ?? 1;
              const isSavingThis = savingCodeReviewId === sub.id;
              const browserMeta = sub.browser_execution_metadata;

              return (
              <div
                key={sub.id || sIdx}
                style={{
                  border: `1px solid ${tokens.border}`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: tokens.surfaceMuted,
                }}
              >
                <div
                  style={{
                    padding: '12px 18px',
                    backgroundColor: '#171717',
                    color: '#F8FAFC',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>
                      {sub.question_title || `Programming Question #${sIdx + 1}`}
                    </span>
                    <span style={{ marginLeft: '12px', fontSize: '12px', color: '#CBD5E1' }}>
                      Language: <strong>{sub.language.toUpperCase()}</strong>
                    </span>
                    {sub.created_at && (
                      <span style={{ marginLeft: '12px', fontSize: '11px', color: '#94A3B8' }}>
                        Submitted: {new Date(sub.created_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <StatusBadge status={sub.review_status || sub.verdict || 'PENDING_REVIEW'} size="sm" />
                    <span className="csl-tabular" style={{ fontSize: '13px', fontWeight: 700, color: '#FACC15' }}>
                      {sub.score_awarded} / {maxMarks} pts
                    </span>
                  </div>
                </div>

                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Non-Authoritative Browser Telemetry Notice */}
                  {browserMeta && Object.keys(browserMeta).length > 0 && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: tokens.warningBg,
                        border: `1px solid ${tokens.warningBorder}`,
                        color: tokens.warningText,
                        fontSize: '12px',
                      }}
                    >
                      <strong>Unverified Browser Run Telemetry (Non-Authoritative):</strong>{' '}
                      Runtime: {browserMeta.runtime_name || 'Browser'} · Status: <strong>{browserMeta.browser_status || 'N/A'}</strong>
                      {typeof browserMeta.public_samples_attempted === 'number' && browserMeta.public_samples_attempted > 0
                        ? ` · Public Samples Passed: ${browserMeta.public_samples_passed ?? 0}/${browserMeta.public_samples_attempted}`
                        : ''}
                      {typeof browserMeta.execution_time_ms === 'number' && browserMeta.execution_time_ms > 0
                        ? ` · Time: ${browserMeta.execution_time_ms}ms`
                        : ''}
                    </div>
                  )}

                  {/* Source Code View */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: tokens.textSecondary }}>
                        Submitted Source Code (Submission ID: <code>{sub.id}</code>):
                      </span>
                    </div>
                    <pre
                      style={{
                        backgroundColor: '#0F172A',
                        color: '#E2E8F0',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: tokens.monoFamily,
                        margin: 0,
                        overflowX: 'auto',
                        maxHeight: '280px',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {sub.source_code}
                    </pre>
                  </div>

                  {/* Administrator Manual Evaluation Controls */}
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      backgroundColor: tokens.surfaceCard,
                      border: `1px solid ${tokens.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <strong style={{ fontSize: '13px', color: tokens.textPrimary }}>
                        Administrator Evaluation &amp; Scoring
                      </strong>
                      {sub.reviewed_by && sub.reviewed_at && (
                        <span style={{ fontSize: '11.5px', color: tokens.textMuted }}>
                          Last reviewed by <strong>{sub.reviewed_by}</strong> on {new Date(sub.reviewed_at).toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'end' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                          Review Status
                        </label>
                        <select
                          value={draft.review_status}
                          onChange={(e) =>
                            setCodeReviewDrafts((prev) => ({
                              ...prev,
                              [sub.id]: { ...draft, review_status: e.target.value },
                            }))
                          }
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '7px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.inputBg,
                            color: tokens.textPrimary,
                            fontSize: '12.5px',
                            fontWeight: 600,
                          }}
                        >
                          <option value="PENDING_REVIEW">Pending Review</option>
                          <option value="UNDER_REVIEW">Under Review</option>
                          <option value="MANUALLY_ACCEPTED">Manually Accepted (Full Marks)</option>
                          <option value="MANUALLY_SCORED">Manually Scored</option>
                          <option value="MANUALLY_REJECTED">Manually Rejected (0 Marks)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                          Marks Awarded (Max: {maxMarks})
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={maxMarks}
                          step="0.5"
                          value={draft.score_awarded}
                          onChange={(e) =>
                            setCodeReviewDrafts((prev) => ({
                              ...prev,
                              [sub.id]: {
                                ...draft,
                                score_awarded: e.target.value,
                                review_status: draft.review_status === 'PENDING_REVIEW' || draft.review_status === 'UNDER_REVIEW' ? 'MANUALLY_SCORED' : draft.review_status,
                              },
                            }))
                          }
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '7px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.inputBg,
                            color: tokens.textPrimary,
                            fontSize: '12.5px',
                            fontFamily: tokens.monoFamily,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={isSavingThis}
                          onClick={() => handleSaveCodeReview(sub.id, 'UNDER_REVIEW', 0)}
                          style={{
                            padding: '7px 11px',
                            borderRadius: '7px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.surfaceElevated,
                            color: tokens.textPrimary,
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Under Review
                        </button>
                        <button
                          type="button"
                          disabled={isSavingThis}
                          onClick={() => handleSaveCodeReview(sub.id, 'MANUALLY_ACCEPTED', maxMarks)}
                          style={{
                            padding: '7px 11px',
                            borderRadius: '7px',
                            border: 'none',
                            backgroundColor: '#16A34A',
                            color: '#FFFFFF',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Accept ({maxMarks})
                        </button>
                        <button
                          type="button"
                          disabled={isSavingThis}
                          onClick={() => handleSaveCodeReview(sub.id, 'MANUALLY_REJECTED', 0)}
                          style={{
                            padding: '7px 11px',
                            borderRadius: '7px',
                            border: 'none',
                            backgroundColor: '#DC2626',
                            color: '#FFFFFF',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Reject (0)
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '4px' }}>
                          Review Notes (Optional)
                        </label>
                        <input
                          type="text"
                          value={draft.review_notes}
                          placeholder="Feedback on algorithm complexity, edge cases, style..."
                          onChange={(e) =>
                            setCodeReviewDrafts((prev) => ({
                              ...prev,
                              [sub.id]: { ...draft, review_notes: e.target.value },
                            }))
                          }
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '7px',
                            border: `1px solid ${tokens.borderStrong}`,
                            backgroundColor: tokens.inputBg,
                            color: tokens.textPrimary,
                            fontSize: '12.5px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isSavingThis}
                        onClick={() => handleSaveCodeReview(sub.id)}
                        className="csl-btn-primary"
                        style={{ padding: '8px 16px', fontSize: '12.5px' }}
                      >
                        {isSavingThis ? 'Saving...' : 'Save Evaluation'}
                      </button>
                    </div>
                  </div>

                  {sub.compile_output && (
                    <div style={{ backgroundColor: tokens.dangerBg, border: `1px solid ${tokens.dangerBorder}`, padding: '10px 14px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: tokens.dangerText }}>Compilation / Diagnostic Output:</span>
                      <pre style={{ margin: '4px 0 0 0', fontSize: '11px', color: tokens.dangerText, whiteSpace: 'pre-wrap' }}>
                        {sub.compile_output}
                      </pre>
                    </div>
                  )}

                  {/* Legacy Stored Test Results Breakdown (if any historical records exist) */}
                  {sub.test_results && sub.test_results.length > 0 && (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: tokens.textSecondary, marginBottom: '8px' }}>
                        Historical Test Case Evaluation Breakdown:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {sub.test_results.map((tr, trIdx) => (
                          <div
                            key={tr.id || trIdx}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: `1px solid ${tr.passed ? tokens.successBorder : tokens.dangerBorder}`,
                              backgroundColor: tr.passed ? tokens.successBg : tokens.dangerBg,
                              fontSize: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 700, color: tr.passed ? tokens.successText : tokens.dangerText }}>
                                {tr.is_public ? `Sample Case ${trIdx + 1} (Public)` : `Test Case ${trIdx + 1} (Hidden Evaluation)`}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '11px', color: tr.passed ? tokens.successText : tokens.dangerText }}>
                                {tr.passed ? '✓ PASSED' : `✗ ${tr.status || 'FAILED'}`} ({tr.execution_time_ms.toFixed(1)}ms)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Questions Filter Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSectionFilter('ALL')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: sectionFilter === 'ALL' ? 'none' : '1px solid #CBD5E1',
              backgroundColor: sectionFilter === 'ALL' ? '#0B2E6F' : '#FFFFFF',
              color: sectionFilter === 'ALL' ? '#FFFFFF' : '#475569',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            All Questions ({review.questions.length})
          </button>
          {sections.length > 0 ? (
            sections.map((sec, idx) => {
              const count = review.questions.filter((q) => q.section_type === sec).length;
              const isSelected = sectionFilter === sec;
              return (
                <button
                  key={sec}
                  onClick={() => setSectionFilter(sec)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: isSelected ? 'none' : '1px solid #CBD5E1',
                    backgroundColor: isSelected ? (idx % 2 === 0 ? '#1455B8' : '#059669') : '#FFFFFF',
                    color: isSelected ? '#FFFFFF' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {sec} ({count})
                </button>
              );
            })
          ) : (
            <>
              <button
                onClick={() => setSectionFilter('APTITUDE')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: sectionFilter === 'APTITUDE' ? 'none' : '1px solid #CBD5E1',
                  backgroundColor: sectionFilter === 'APTITUDE' ? '#1455B8' : '#FFFFFF',
                  color: sectionFilter === 'APTITUDE' ? '#FFFFFF' : '#475569',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Aptitude
              </button>
              <button
                onClick={() => setSectionFilter('CODING')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: sectionFilter === 'CODING' ? 'none' : '1px solid #CBD5E1',
                  backgroundColor: sectionFilter === 'CODING' ? '#059669' : '#FFFFFF',
                  color: sectionFilter === 'CODING' ? '#FFFFFF' : '#475569',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Coding
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Filter by Outcome:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="ALL">All Outcomes</option>
            <option value="CORRECT">Correct Only</option>
            <option value="INCORRECT">Incorrect Only</option>
            <option value="UNANSWERED">Unanswered Only</option>
          </select>
        </div>
      </div>

      {/* Question Snapshots List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {review.delivery_mode === 'PDF_CODING' ? (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '36px',
              textAlign: 'center',
              color: '#64748B',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📄</div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 6px 0' }}>
              Paper-Based Coding Assessment
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '480px', margin: '0 auto 16px', lineHeight: 1.5 }}>
              Candidate read questions on-screen and authored solutions on physical paper. Digital question answer logs and automated MCQ scoring are not applicable.
            </p>
            {review.assessment_id && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#7C3AED',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {downloadingPdf ? 'Downloading...' : '⬇ Download Question Paper PDF'}
              </button>
            )}
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '36px',
              textAlign: 'center',
              color: '#64748B',
              border: '1px solid #E2E8F0',
            }}
          >
            No questions match the current filter selection.
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const isCorrect = q.is_correct === true;
            const isUnanswered = !q.selected_option || !q.selected_option.trim();
            const isIncorrect = !isUnanswered && !isCorrect;
            const marksAwarded = q.marks_awarded !== undefined ? q.marks_awarded : isCorrect ? 1 : 0;

            const optionsMap = [
              { key: 'A', text: q.option_a_text },
              { key: 'B', text: q.option_b_text },
              { key: 'C', text: q.option_c_text },
              { key: 'D', text: q.option_d_text },
            ];

            return (
              <div
                key={q.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: `1.5px solid ${
                    isCorrect ? '#86EFAC' : isIncorrect ? '#FCA5A5' : '#E2E8F0'
                  }`,
                  padding: '20px 24px',
                  boxShadow: '0 2px 8px rgba(11, 46, 111, 0.03)',
                }}
              >
                {/* Question Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: '#0B2E6F' }}>
                      Question #{q.question_order}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: q.section_type === 'APTITUDE' ? '#EFF6FF' : '#ECFDF5',
                        color: q.section_type === 'APTITUDE' ? '#1455B8' : '#059669',
                      }}
                    >
                      {q.section_type}
                    </span>
                  </div>

                  <div>
                    {isCorrect ? (
                      <span
                        style={{
                          padding: '3px 12px',
                          borderRadius: '9999px',
                          backgroundColor: '#DCFCE7',
                          color: '#166534',
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        ✓ Correct (+{marksAwarded} Mark)
                      </span>
                    ) : isIncorrect ? (
                      <span
                        style={{
                          padding: '3px 12px',
                          borderRadius: '9999px',
                          backgroundColor: '#FEE2E2',
                          color: '#991B1B',
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        ✕ Incorrect (0 Marks)
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '3px 12px',
                          borderRadius: '9999px',
                          backgroundColor: '#F1F5F9',
                          color: '#64748B',
                          fontWeight: 700,
                          fontSize: '11px',
                        }}
                      >
                        Unanswered (0 Marks)
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Prompt */}
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#111111',
                    marginBottom: '16px',
                    lineHeight: 1.5,
                  }}
                >
                  {q.prompt}
                </div>

                {/* Shuffled Options for this attempt */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginBottom: '14px',
                  }}
                >
                  {optionsMap.map((opt) => {
                    const isCandidateSelected = q.selected_option === opt.key;
                    const isCorrectAnswer = Boolean(q.correct_option_key && q.correct_option_key === opt.key);

                    let optBg = '#FFFFFF';
                    let optBorder = '1px solid #E2E8F0';
                    let optColor = '#334155';

                    if (isCorrectAnswer) {
                      optBg = '#F0FDF4';
                      optBorder = '1.5px solid #16A34A';
                      optColor = '#166534';
                    } else if (isCandidateSelected && !isCorrectAnswer) {
                      optBg = '#FEF2F2';
                      optBorder = '1.5px solid #DC2626';
                      optColor = '#991B1B';
                    }

                    return (
                      <div
                        key={opt.key}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: optBorder,
                          backgroundColor: optBg,
                          color: optColor,
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>{opt.key}:</strong>
                        <span>{opt.text}</span>

                        {isCorrectAnswer && (
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontWeight: 800,
                              fontSize: '11px',
                              backgroundColor: '#DCFCE7',
                              color: '#166534',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            Correct Answer
                          </span>
                        )}

                        {isCandidateSelected && (
                          <span
                            style={{
                              marginLeft: isCorrectAnswer ? '4px' : 'auto',
                              fontWeight: 800,
                              fontSize: '11px',
                              backgroundColor: isCorrectAnswer ? '#DCFCE7' : '#FEE2E2',
                              color: isCorrectAnswer ? '#166534' : '#991B1B',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            Candidate Selected
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {q.explanation && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#475569',
                      backgroundColor: '#FAF7F3',
                      border: '1px solid #E2E8F0',
                      padding: '10px 14px',
                      borderRadius: '8px',
                    }}
                  >
                    <strong style={{ color: '#0B2E6F' }}>Explanation:</strong> {q.explanation}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Flag / Clear Flag Modal */}
      {showFlagModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 46, 111, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1.5px solid rgba(245, 184, 61, 0.4)',
              boxShadow: '0 16px 36px rgba(11, 46, 111, 0.2)',
              width: '100%',
              maxWidth: '520px',
              padding: '26px',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 8px 0' }}>
              {pendingFlagAction === 'FLAG'
                ? 'Flag Attempt for Integrity Review'
                : 'Clear Attempt Integrity Flag'}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
              {pendingFlagAction === 'FLAG'
                ? 'Record an administrative flag and justification note for suspicious activity.'
                : 'Confirm that this attempt has been reviewed and cleared of integrity violations.'}
            </p>

            <form onSubmit={handleConfirmFlagAction}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '6px' }}>
                  Administrative Review Notes
                </label>
                <textarea
                  rows={3}
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                  placeholder="Enter audit notes..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outlineColor: '#1455B8',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowFlagModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F1F5F9',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingFlag}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: pendingFlagAction === 'FLAG' ? '#DC2626' : '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {updatingFlag ? 'Saving...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Event Modal from Attempt Review Screen */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 46, 111, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1.5px solid rgba(245, 184, 61, 0.4)',
              boxShadow: '0 16px 36px rgba(11, 46, 111, 0.2)',
              width: '100%',
              maxWidth: '500px',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 12px 0' }}>
              Review Integrity Event
            </h3>

            <form onSubmit={handleSaveEventReview}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0B2E6F', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={eventIsReviewed}
                    onChange={(e) => setEventIsReviewed(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#16A34A' }}
                  />
                  <span>Mark as Reviewed</span>
                </label>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E6F', marginBottom: '6px' }}>
                  Review Notes
                </label>
                <textarea
                  rows={3}
                  value={eventReviewNotes}
                  onChange={(e) => setEventReviewNotes(e.target.value)}
                  placeholder="Audit justification..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F1F5F9',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEventReview}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {savingEventReview ? 'Saving...' : 'Save Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
