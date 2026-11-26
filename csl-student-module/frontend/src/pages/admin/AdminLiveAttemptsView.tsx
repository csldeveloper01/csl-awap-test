import { useState, useEffect, useCallback } from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { PageContainer, SectionHeader, StatusBadge, SearchToolbar, EmptyState, ProgressBar } from '../../components/ui';
import {
  getAdminLiveAttempts,
  deleteAdminAttempt,
  type AdminLiveAttempt,
} from '../../api/admin';

interface AdminLiveAttemptsViewProps {
  onReviewAttempt: (attemptId: string) => void;
}

export function AdminLiveAttemptsView({ onReviewAttempt }: AdminLiveAttemptsViewProps) {
  const { tokens } = useAdminTheme();
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

  const activeCount = attempts.filter((a) => a.state === 'IN_PROGRESS').length;
  const submittedCount = attempts.filter((a) => a.state === 'SUBMITTED').length;
  const flaggedCount = attempts.filter((a) => a.is_flagged).length;
  const totalAnomalies = attempts.reduce(
    (sum, a) => sum + (Number(a.tab_switch_count) || 0) + (Number(a.fullscreen_exit_count) || 0),
    0
  );

  return (
    <PageContainer>
      <SectionHeader
        title="Live Sessions Monitor"
        description="Real-time view of candidate attempt progression, remaining time, tab switches, and proctoring integrity status."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: tokens.textSecondary, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ accentColor: tokens.cslBlue, cursor: 'pointer', width: '15px', height: '15px' }}
              />
              Auto-refresh (10s)
            </label>
            <button
              onClick={() => loadAttempts()}
              className="csl-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              🔄 Refresh
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: '16px',
        }}
      >
        <OdometerCard label="Tracked Sessions" value={attempts.length} subtitle="Loaded attempts" />
        <OdometerCard label="In Progress" value={activeCount} subtitle="Live active now" accent="blue" />
        <OdometerCard label="Submitted" value={submittedCount} subtitle="Completed sessions" accent="green" />
        <OdometerCard label="Flagged" value={flaggedCount} subtitle="Integrity alerts" accent="red" />
        <OdometerCard label="Tab / FS Events" value={totalAnomalies} subtitle="Focus anomalies" accent="amber" />
      </div>

      {/* Search & Status Filter */}
      <SearchToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search candidate, roll number, or college..."
        filters={
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{
              backgroundColor: tokens.inputBg,
              border: `1px solid ${tokens.border}`,
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              color: tokens.textPrimary,
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
        }
      />

      {/* Live Sessions Table / Cards */}
      <div
        className="csl-card"
        style={{
          padding: 0,
          overflowX: 'auto',
        }}
      >
        <div style={{ minWidth: '880px' }}>
          {/* Table Header Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 2.2fr 1.1fr 1.1fr 0.9fr 0.9fr 1.1fr',
              padding: '12px 18px',
              backgroundColor: tokens.surfaceElevated,
              borderBottom: `1px solid ${tokens.border}`,
              color: tokens.textMuted,
              fontSize: '11.5px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              alignItems: 'center',
            }}
          >
            <div>
              <input
                type="checkbox"
                checked={attempts.length > 0 && selectedAttemptIds.length === attempts.length}
                onChange={handleToggleSelectAllAttempts}
                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
              />
            </div>
            <div>Candidate</div>
            <div>Status</div>
            <div>Time Remaining</div>
            <div style={{ textAlign: 'center' }}>Tab Switches</div>
            <div style={{ textAlign: 'center' }}>Fullscreen Exits</div>
            <div>Integrity Status</div>
          </div>

          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted, fontWeight: 500 }}>
              Loading candidate attempts...
            </div>
          ) : attempts.length === 0 ? (
            <div style={{ padding: '24px' }}>
              <EmptyState
                title="No live assessment attempts found"
                description="No candidate sessions match the selected state or search query."
              />
            </div>
          ) : (
            <div>
              {attempts.map((att) => {
                const totalQ = att.total_questions || 50;
                const progressPct = Math.min(100, Math.round((att.answered_count / totalQ) * 100));
                const isSelected = selectedAttemptIds.includes(att.id);

                return (
                  <div
                    key={att.id}
                    style={{
                      padding: '14px 18px',
                      borderBottom: `1px solid ${tokens.borderLight}`,
                      backgroundColor: isSelected ? tokens.cslBlueSoftBg : 'transparent',
                    }}
                  >
                    {/* Top Grid Row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 2.2fr 1.1fr 1.1fr 0.9fr 0.9fr 1.1fr',
                        alignItems: 'center',
                        marginBottom: '12px',
                      }}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectAttempt(att.id)}
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: tokens.textPrimary }}>
                          {att.candidate_name}
                        </div>
                        <div style={{ fontSize: '12px', color: tokens.textMuted, marginTop: '2px', fontFamily: tokens.monoFamily }}>
                          {att.register_number}
                        </div>
                        <div style={{ fontSize: '12px', color: tokens.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                          {att.college || 'Academic Institution'}
                        </div>
                      </div>

                      <div>
                        <StatusBadge
                          status={att.state}
                          label={att.state === 'SUBMITTED' ? 'Submitted' : att.state === 'IN_PROGRESS' ? 'In Progress' : att.state === 'TIMED_OUT' ? 'Timed Out' : 'Flagged'}
                          size="sm"
                        />
                      </div>

                      <div className="csl-tabular" style={{ fontSize: '13px', fontWeight: 600, color: tokens.textPrimary, fontFamily: tokens.monoFamily }}>
                        {att.state === 'SUBMITTED' || att.state === 'TIMED_OUT' ? (
                          <span style={{ color: tokens.textMuted, fontFamily: tokens.fontFamily }}>Session Finished</span>
                        ) : (
                          formatSeconds(att.remaining_seconds)
                        )}
                      </div>

                      <div className="csl-tabular" style={{ textAlign: 'center', fontSize: '15px', fontWeight: 700, color: (att.tab_switch_count || 0) > 0 ? tokens.warningText : tokens.textPrimary }}>
                        {String(att.tab_switch_count || 0).padStart(2, '0')}
                      </div>

                      <div className="csl-tabular" style={{ textAlign: 'center', fontSize: '15px', fontWeight: 700, color: (att.fullscreen_exit_count || 0) > 0 ? tokens.dangerText : tokens.textPrimary }}>
                        {String(att.fullscreen_exit_count || 0).padStart(2, '0')}
                      </div>

                      <div>
                        <StatusBadge
                          status={att.is_flagged ? 'FLAGGED' : 'ACTIVE'}
                          label={att.is_flagged ? 'Flagged' : 'Normal'}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Bottom Row: Question Progress Bar & Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                        borderTop: `1px solid ${tokens.borderLight}`,
                        paddingTop: '10px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: '240px', maxWidth: '420px' }}>
                        <ProgressBar
                          label="Question Progress"
                          rightText={`${att.answered_count}/${totalQ} (${progressPct}%)`}
                          value={progressPct}
                          tone={att.is_flagged ? 'warning' : 'success'}
                          height={6}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => onReviewAttempt(att.id)}
                          className="csl-btn-primary"
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                          Inspect Review
                        </button>
                        <button
                          onClick={() => handleDeleteAttempt(att)}
                          style={{
                            backgroundColor: tokens.dangerBg,
                            color: tokens.dangerText,
                            border: `1px solid ${tokens.dangerBorder}`,
                            borderRadius: '8px',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
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
    </PageContainer>
  );
}
