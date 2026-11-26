import { useState, useEffect } from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { PageContainer, SectionHeader, StatusBadge, SearchToolbar, EmptyState } from '../../components/ui';
import {
  getAdminIntegrityEvents,
  reviewAdminIntegrityEvent,
  deleteAdminIntegrityEvent,
  bulkDeleteAdminIntegrityEvents,
  type AdminIntegrityEvent,
} from '../../api/admin';

interface AdminIntegrityEventsViewProps {
  onReviewAttempt: (attemptId: string) => void;
}

export function AdminIntegrityEventsView({ onReviewAttempt }: AdminIntegrityEventsViewProps) {
  const { tokens } = useAdminTheme();
  const [events, setEvents] = useState<AdminIntegrityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'UNREVIEWED' | 'REVIEWED'>('ALL');
  const [search, setSearch] = useState('');

  // Bulk and Selection state
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Review Modal state
  const [selectedEvent, setSelectedEvent] = useState<AdminIntegrityEvent | null>(null);
  const [modalIsReviewed, setModalIsReviewed] = useState(true);
  const [modalReviewNotes, setModalReviewNotes] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const loadEvents = async () => {
    try {
      setLoading(true);
      let isReviewedParam: boolean | undefined = undefined;
      if (reviewFilter === 'UNREVIEWED') isReviewedParam = false;
      if (reviewFilter === 'REVIEWED') isReviewedParam = true;

      const data = await getAdminIntegrityEvents({
        event_type: eventTypeFilter || undefined,
        is_reviewed: isReviewedParam,
        search: search || undefined,
      });
      setEvents(data);
    } catch {
      alert('Failed to load integrity audit events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [eventTypeFilter, reviewFilter]);

  const openReviewModal = (ev: AdminIntegrityEvent) => {
    setSelectedEvent(ev);
    setModalIsReviewed(ev.is_reviewed ?? true);
    setModalReviewNotes(ev.review_notes || '');
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    try {
      setSavingReview(true);
      const res = await reviewAdminIntegrityEvent(
        selectedEvent.id,
        modalIsReviewed,
        modalReviewNotes
      );

      // Update in local state
      setEvents((prev) =>
        prev.map((ev) => (ev.id === selectedEvent.id ? { ...ev, ...res.event } : ev))
      );
      setSelectedEvent(null);
    } catch {
      alert('Failed to update integrity event review status.');
    } finally {
      setSavingReview(false);
    }
  };

  const handleToggleSelectAllEvents = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedEventIds(events.map((ev) => ev.id));
    } else {
      setSelectedEventIds([]);
    }
  };

  const handleToggleSelectEvent = (id: number) => {
    setSelectedEventIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteEvent = async (ev: AdminIntegrityEvent) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete this integrity audit log (${ev.event_type} for ${ev.candidate_name})?`
    );
    if (!confirmed) return;

    try {
      await deleteAdminIntegrityEvent(ev.id);
      setEvents((prev) => prev.filter((item) => item.id !== ev.id));
      setSelectedEventIds((prev) => prev.filter((id) => id !== ev.id));
    } catch {
      alert('Failed to delete integrity event record.');
    }
  };

  const handleBulkDeleteEvents = async () => {
    if (selectedEventIds.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${selectedEventIds.length} selected integrity log record(s)?`
    );
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const res = await bulkDeleteAdminIntegrityEvents(selectedEventIds);
      alert(res.message);
      setSelectedEventIds([]);
      loadEvents();
    } catch {
      alert('Failed to delete selected integrity audit events.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const pendingCount = events.filter((e) => !e.is_reviewed).length;
  const reviewedCount = events.filter((e) => e.is_reviewed).length;
  const violationCount = events.filter(
    (e) => e.event_type.includes('HIDDEN') || e.event_type.includes('EXIT') || e.event_type.includes('EXCEEDED')
  ).length;

  return (
    <PageContainer>
      <SectionHeader
        title="Proctoring & Integrity Audit Trail"
        description="Monitor tab switches, document visibility changes, and proctoring telemetry with administrative review workflows."
        actions={
          <button
            onClick={loadEvents}
            className="csl-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Refresh Audit Trail</span>
          </button>
        }
      />

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: '16px',
        }}
      >
        <OdometerCard label="Total Logged Events" value={events.length} subtitle="Audit trail records" />
        <OdometerCard label="Pending Review" value={pendingCount} subtitle="Awaiting triage" accent="amber" />
        <OdometerCard label="Reviewed" value={reviewedCount} subtitle="Cleared or annotated" accent="green" />
        <OdometerCard label="Focus / Exit Alerts" value={violationCount} subtitle="Tab or fullscreen exits" accent="red" />
      </div>

      {/* Filter Toolbar */}
      <SearchToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search candidate, roll no, college, or audit notes..."
        onSubmitSearch={() => loadEvents()}
        filters={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => loadEvents()} className="csl-btn-primary">
              Search
            </button>

            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: `1px solid ${tokens.border}`,
                fontSize: '13px',
                color: tokens.textPrimary,
                backgroundColor: tokens.inputBg,
                outlineColor: tokens.cslBlue,
              }}
            >
              <option value="">All Event Types</option>
              <option value="TAB_HIDDEN">TAB_HIDDEN (Tab Switch Out)</option>
              <option value="TAB_VISIBLE">TAB_VISIBLE (Tab Switch In)</option>
              <option value="FULLSCREEN_EXIT">FULLSCREEN_EXIT</option>
              <option value="FULLSCREEN_ENTER">FULLSCREEN_ENTER</option>
              <option value="ATTEMPT_STARTED">ATTEMPT_STARTED</option>
              <option value="SUBMITTED">SUBMITTED</option>
              <option value="TIMED_OUT">TIMED_OUT</option>
            </select>

            <div style={{ display: 'flex', borderRadius: '8px', border: `1px solid ${tokens.border}`, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setReviewFilter('ALL')}
                style={{
                  padding: '8px 14px',
                  backgroundColor: reviewFilter === 'ALL' ? tokens.cslBlue : tokens.surfaceCard,
                  color: reviewFilter === 'ALL' ? '#FFFFFF' : tokens.textSecondary,
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setReviewFilter('UNREVIEWED')}
                style={{
                  padding: '8px 14px',
                  backgroundColor: reviewFilter === 'UNREVIEWED' ? '#D97706' : tokens.surfaceCard,
                  color: reviewFilter === 'UNREVIEWED' ? '#FFFFFF' : tokens.textSecondary,
                  border: 'none',
                  borderLeft: `1px solid ${tokens.border}`,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Pending Review
              </button>
              <button
                type="button"
                onClick={() => setReviewFilter('REVIEWED')}
                style={{
                  padding: '8px 14px',
                  backgroundColor: reviewFilter === 'REVIEWED' ? '#16A34A' : tokens.surfaceCard,
                  color: reviewFilter === 'REVIEWED' ? '#FFFFFF' : tokens.textSecondary,
                  border: 'none',
                  borderLeft: `1px solid ${tokens.border}`,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reviewed
              </button>
            </div>

            {(eventTypeFilter || reviewFilter !== 'ALL' || search) && (
              <button
                type="button"
                onClick={() => {
                  setEventTypeFilter('');
                  setReviewFilter('ALL');
                  setSearch('');
                }}
                className="csl-btn-secondary"
                style={{ fontSize: '12px' }}
              >
                Reset Filters
              </button>
            )}
          </div>
        }
      />

      {/* Bulk Action Bar */}
      {selectedEventIds.length > 0 && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: tokens.cslBlueSoftBg,
            border: `1px solid ${tokens.cslBlueSoftBorder}`,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="csl-tabular"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '24px',
                height: '24px',
                padding: '0 6px',
                borderRadius: '9999px',
                backgroundColor: tokens.cslBlue,
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {selectedEventIds.length}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: tokens.cslBlueSoftText }}>
              {selectedEventIds.length} event log{selectedEventIds.length === 1 ? '' : 's'} selected
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setSelectedEventIds([])}
              className="csl-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Deselect All
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteEvents}
              disabled={bulkDeleting}
              style={{
                padding: '6px 14px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>{bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedEventIds.length})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="csl-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '1020px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: tokens.surfaceElevated, borderBottom: `1px solid ${tokens.border}`, color: tokens.textMuted }}>
              <th style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={events.length > 0 && selectedEventIds.length === events.length}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedEventIds.length > 0 && selectedEventIds.length < events.length;
                  }}
                  onChange={handleToggleSelectAllEvents}
                  style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                  title="Select / Deselect All Events"
                />
              </th>
              <th style={{ padding: '12px 16px', width: '180px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Event Type</th>
              <th style={{ padding: '12px 16px', width: '220px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Candidate Details</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Telemetry & Context</th>
              <th style={{ padding: '12px 16px', width: '140px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Review Status</th>
              <th style={{ padding: '12px 16px', width: '160px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Timestamp</th>
              <th style={{ padding: '12px 16px', width: '240px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted }}>
                  Loading integrity audit trail...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '24px' }}>
                  <EmptyState
                    title="No integrity events recorded"
                    description="No integrity logs match the current event type or review filter."
                  />
                </td>
              </tr>
            ) : (
              events.map((ev) => {
                const isViolation =
                  ev.event_type.includes('HIDDEN') ||
                  ev.event_type.includes('EXIT') ||
                  ev.event_type.includes('EXCEEDED');

                const isReviewed = Boolean(ev.is_reviewed);
                const isSelected = selectedEventIds.includes(ev.id);

                return (
                  <tr
                    key={ev.id}
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
                        onChange={() => handleToggleSelectEvent(ev.id)}
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: isViolation ? tokens.dangerBg : tokens.cslBlueSoftBg,
                          color: isViolation ? tokens.dangerText : tokens.cslBlueSoftText,
                          border: `1px solid ${isViolation ? tokens.dangerBorder : tokens.cslBlueSoftBorder}`,
                          fontFamily: tokens.monoFamily,
                        }}
                      >
                        {ev.event_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: tokens.textPrimary }}>{ev.candidate_name}</div>
                      <div style={{ fontSize: '11.5px', color: tokens.textMuted, marginTop: '2px', fontFamily: tokens.monoFamily }}>
                        {ev.register_number}
                      </div>
                      <div style={{ fontSize: '11.5px', color: tokens.textSecondary }}>{ev.college}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: tokens.textSecondary, fontSize: '12px' }}>
                      {ev.metadata && Object.keys(ev.metadata).length > 0 ? (
                        <div
                          style={{
                            backgroundColor: tokens.surfaceElevated,
                            border: `1px solid ${tokens.border}`,
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontFamily: tokens.monoFamily,
                            fontSize: '11px',
                            color: tokens.textPrimary,
                            maxWidth: '320px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {JSON.stringify(ev.metadata)}
                        </div>
                      ) : (
                        <span style={{ color: tokens.textMuted }}>—</span>
                      )}
                      {ev.review_notes && (
                        <div style={{ marginTop: '6px', fontSize: '11.5px', color: tokens.successText }}>
                          <strong>Audit Note:</strong> {ev.review_notes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {isReviewed ? (
                        <div>
                          <StatusBadge status="ACTIVE" label="Reviewed" size="sm" />
                          {ev.reviewed_by_name && (
                            <div style={{ fontSize: '11px', color: tokens.textMuted, marginTop: '3px' }}>
                              by {ev.reviewed_by_name}
                            </div>
                          )}
                        </div>
                      ) : (
                        <StatusBadge status="PENDING" label="Pending" size="sm" />
                      )}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', color: tokens.textMuted, fontSize: '12px' }}>
                      {new Date(ev.created_at || (ev as any).timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => openReviewModal(ev)}
                          className="csl-btn-secondary"
                          style={{ padding: '5px 12px', fontSize: '12px' }}
                        >
                          {isReviewed ? 'Edit Note' : 'Review'}
                        </button>
                        <button
                          onClick={() => onReviewAttempt(ev.attempt_id)}
                          className="csl-btn-primary"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 12px',
                            fontSize: '12px',
                          }}
                        >
                          <span>Inspect</span>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(ev)}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: tokens.dangerBg,
                            border: `1px solid ${tokens.dangerBorder}`,
                            borderRadius: '6px',
                            color: tokens.dangerText,
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Delete integrity event record"
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

      {/* Review Action Modal */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              borderRadius: '12px',
              border: `1px solid ${tokens.border}`,
              boxShadow: tokens.modalShadow,
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                Review Integrity Event
              </h3>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="csl-btn-secondary"
                style={{ width: '30px', height: '30px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                backgroundColor: tokens.surfaceElevated,
                border: `1px solid ${tokens.border}`,
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '12.5px',
                color: tokens.textSecondary,
              }}
            >
              <div>
                <strong>Candidate:</strong> {selectedEvent.candidate_name} ({selectedEvent.register_number})
              </div>
              <div style={{ marginTop: '4px' }}>
                <strong>Event:</strong>{' '}
                <span style={{ fontFamily: tokens.monoFamily, fontWeight: 700, color: tokens.dangerText }}>
                  {selectedEvent.event_type}
                </span>
              </div>
              <div style={{ marginTop: '4px' }}>
                <strong>Recorded:</strong>{' '}
                {new Date(selectedEvent.created_at || (selectedEvent as any).timestamp).toLocaleString()}
              </div>
            </div>

            <form onSubmit={handleSaveReview}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: tokens.textPrimary, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={modalIsReviewed}
                    onChange={(e) => setModalIsReviewed(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#16A34A' }}
                  />
                  <span>Mark as Administratively Reviewed</span>
                </label>
                <p style={{ fontSize: '12px', color: tokens.textMuted, margin: '4px 0 0 24px' }}>
                  Acknowledge that this violation or telemetry event has been reviewed by staff.
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Audit Review Notes / Justification
                </label>
                <textarea
                  rows={3}
                  value={modalReviewNotes}
                  onChange={(e) => setModalReviewNotes(e.target.value)}
                  placeholder="e.g. Benign tab blur verified. Student re-entered immediately."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${tokens.border}`,
                    backgroundColor: tokens.inputBg,
                    color: tokens.textPrimary,
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outlineColor: tokens.cslBlue,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="csl-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReview}
                  className="csl-btn-primary"
                  style={{
                    backgroundColor: '#16A34A',
                    cursor: savingReview ? 'not-allowed' : 'pointer',
                    opacity: savingReview ? 0.7 : 1,
                  }}
                >
                  {savingReview ? 'Saving...' : 'Save Review Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
