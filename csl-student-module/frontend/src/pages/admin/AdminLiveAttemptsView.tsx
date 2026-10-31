import { useState, useEffect, useCallback } from 'react';
import {
  getAdminLiveAttempts,
  deleteAdminAttempt,
  type AdminLiveAttempt,
} from '../../api/admin';

interface AdminLiveAttemptsViewProps {
  onReviewAttempt: (attemptId: string) => void;
}

export function AdminLiveAttemptsView({ onReviewAttempt }: AdminLiveAttemptsViewProps) {
  const [attempts, setAttempts] = useState<AdminLiveAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<string[]>([]);

  const loadAttempts = useCallback(async () => {
    try {
      const data = await getAdminLiveAttempts({
        state: stateFilter || undefined,
        search: search || undefined,
      });
      setAttempts(data);
    } catch {
      console.error('Failed to load attempts.');
    } finally {
      setLoading(false);
    }
  }, [stateFilter, search]);

  const handleToggleSelectAllAttempts = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedAttemptIds(attempts.map((a) => a.id));
    } else {
      setSelectedAttemptIds([]);
    }
  };

  const handleToggleSelectAttempt = (id: string) => {
    setSelectedAttemptIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteAttempt = async (att: AdminLiveAttempt) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete the assessment attempt for candidate ${att.candidate_name} (${att.register_number})?`
    );
    if (!confirmed) return;

    try {
      await deleteAdminAttempt(att.id);
      setAttempts((prev) => prev.filter((item) => item.id !== att.id));
      setSelectedAttemptIds((prev) => prev.filter((id) => id !== att.id));
    } catch {
      alert('Failed to delete attempt.');
    }
  };

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadAttempts();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadAttempts]);

  const formatSeconds = (secs: number) => {
    if (secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* ─── PAGE TITLE (Mockup 1) ─── */}
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
          Live Session
        </h1>

        {/* Polling indicator & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: '#0D52D6', cursor: 'pointer' }}
            />
            Auto-refresh
          </label>
          <button
            onClick={() => loadAttempts()}
            style={{
              padding: '6px 14px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              color: '#0F172A',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ─── SEARCH & FILTER PILL BAR (Mockup 1) ─── */}
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by College Name"
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
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
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
            <option value="">All Statuses</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="TIMED_OUT">Timed Out</option>
            <option value="FLAGGED_FOR_REVIEW">Flagged</option>
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

      {/* ─── LIVE SESSIONS TABLE CONTAINER (Mockup 1) ─── */}
      <div
        style={{
          backgroundColor: '#0D52D6',
          borderRadius: '24px',
          padding: '12px 14px 16px',
          boxShadow: '0 6px 18px rgba(13, 82, 214, 0.15)',
        }}
      >
        {/* Table Header Row (Mockup 1) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 2.2fr 1.1fr 1.3fr 1fr 1fr 1.2fr',
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
              checked={attempts.length > 0 && selectedAttemptIds.length === attempts.length}
              onChange={handleToggleSelectAllAttempts}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
          </div>
          <div>Candidate</div>
          <div>Status</div>
          <div>Time Remaining</div>
          <div style={{ textAlign: 'center' }}>Tab Switches</div>
          <div style={{ textAlign: 'center' }}>Fullscreen Exits</div>
          <div>Integrity Status</div>
        </div>

        {/* Candidate Row Cards (Mockup 1) */}
        {loading ? (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
            Loading candidate attempts...
          </div>
        ) : attempts.length === 0 ? (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700 }}>
            No live assessment attempts found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
            {attempts.map((att) => {
              const totalQ = att.total_questions || 50;
              const progressPct = Math.min(100, Math.round((att.answered_count / totalQ) * 100));
              const isSelected = selectedAttemptIds.includes(att.id);

              return (
                <div
                  key={att.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '14px 18px 12px',
                    border: isSelected ? '1.5px solid #0D52D6' : '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
                  }}
                >
                  {/* Top Grid Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 2.2fr 1.1fr 1.3fr 1fr 1fr 1.2fr',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectAttempt(att.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </div>

                    {/* Candidate Info */}
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                        {att.candidate_name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
                        Roll No: {att.register_number}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                        {att.college || 'Academic Institution'}
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div>
                      <span
                        style={{
                          backgroundColor: '#E2E8F0',
                          color: '#1E293B',
                          padding: '3px 12px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {att.state === 'SUBMITTED' ? 'Submitted' : att.state === 'IN_PROGRESS' ? 'In Progress' : att.state === 'TIMED_OUT' ? 'Timed Out' : 'Flagged'}
                      </span>
                    </div>

                    {/* Time Remaining */}
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                      {att.state === 'SUBMITTED' || att.state === 'TIMED_OUT' ? (
                        'Session Finished'
                      ) : (
                        formatSeconds(att.remaining_seconds)
                      )}
                    </div>

                    {/* Tab Switches */}
                    <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>
                      {String(att.tab_switch_count || 0).padStart(2, '0')}
                    </div>

                    {/* Fullscreen Exits */}
                    <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>
                      {String(att.fullscreen_exit_count || 0).padStart(2, '0')}
                    </div>

                    {/* Integrity Status Pill */}
                    <div>
                      <span
                        style={{
                          backgroundColor: att.is_flagged ? '#FEE2E2' : '#CBD5E1',
                          color: att.is_flagged ? '#DC2626' : '#1E293B',
                          padding: '3px 14px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        {att.is_flagged ? 'Flagged' : 'Normal'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Question Progress Bar & Actions (Mockup 1) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #F1F5F9',
                      paddingTop: '10px',
                    }}
                  >
                    {/* Question Progress Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '420px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                        Question Progress:
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                        {att.answered_count}/{totalQ}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: '8px',
                          backgroundColor: '#E2E8F0',
                          borderRadius: '9999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${progressPct}%`,
                            backgroundColor: '#22C55E',
                            borderRadius: '9999px',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>
                        {progressPct}%
                      </span>
                    </div>

                    {/* Actions: Inspect Review (Blue) & Delete (Red) */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => onReviewAttempt(att.id)}
                        style={{
                          backgroundColor: '#0D52D6',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '16px',
                          padding: '6px 18px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Inspect Review
                      </button>
                      <button
                        onClick={() => handleDeleteAttempt(att)}
                        style={{
                          backgroundColor: '#DC2626',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '16px',
                          padding: '6px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
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
        )}
      </div>
    </div>
  );
}
