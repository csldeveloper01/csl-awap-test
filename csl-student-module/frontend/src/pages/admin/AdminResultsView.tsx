import { useState, useEffect } from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { OdometerCard } from '../../components/admin/OdometerCard';
import { PageContainer, SectionHeader, StatusBadge, SearchToolbar, EmptyState, ProgressBar } from '../../components/ui';
import {
  getAdminResults,
  deleteAdminAttempt,
  bulkDeleteAdminAttempts,
  exportAdvancedStudentData,
  type AdminResult,
} from '../../api/admin';

interface AdminResultsViewProps {
  onReviewAttempt: (attemptId: string) => void;
}

export function AdminResultsView({ onReviewAttempt }: AdminResultsViewProps) {
  const { tokens } = useAdminTheme();
  const [results, setResults] = useState<AdminResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exportingFormat, setExportingFormat] = useState<'xlsx' | 'csv' | null>(null);

  const handleExportResults = async (format: 'xlsx' | 'csv') => {
    try {
      setExportingFormat(format);
      await exportAdvancedStudentData({
        format,
        search: search.trim() || undefined,
        filename: `csl_results_export_${new Date().toISOString().split('T')[0]}.${format}`,
      });
    } catch {
      alert(`Failed to export results to ${format.toUpperCase()}.`);
    } finally {
      setExportingFormat(null);
    }
  };

  // Bulk and Selection state
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadResults = async (query = '') => {
    try {
      setLoading(true);
      const data = await getAdminResults(query ? { search: query } : undefined);
      setResults(data);
    } catch {
      alert('Failed to load assessment results.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAllAttempts = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedAttemptIds(results.map((r) => r.id));
    } else {
      setSelectedAttemptIds([]);
    }
  };

  const handleToggleSelectAttempt = (id: string) => {
    setSelectedAttemptIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteAttempt = async (res: AdminResult) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete the scorecard and attempt records for ${res.candidate_name} (${res.register_number})?\n\nThis will permanently delete this attempt, its answers, and its integrity events.`
    );
    if (!confirmed) return;

    try {
      await deleteAdminAttempt(res.id);
      setResults((prev) => prev.filter((item) => item.id !== res.id));
      setSelectedAttemptIds((prev) => prev.filter((id) => id !== res.id));
    } catch {
      alert('Failed to delete scorecard and attempt record.');
    }
  };

  const handleBulkDeleteAttempts = async () => {
    if (selectedAttemptIds.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${selectedAttemptIds.length} selected candidate attempt record(s)?\n\nAll historical answers and score logs will be permanently deleted.`
    );
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const resp = await bulkDeleteAdminAttempts(selectedAttemptIds);
      alert(resp.message);
      setSelectedAttemptIds([]);
      loadResults(search);
    } catch {
      alert('Failed to bulk delete selected attempts.');
    } finally {
      setBulkDeleting(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  // Metrics & Score Distribution
  const evaluatedResults = results.filter((r) => r.delivery_mode !== 'PDF_CODING' && !r.is_manual_evaluation_pending);
  const avgPct = evaluatedResults.length > 0
    ? Math.round(evaluatedResults.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0) / evaluatedResults.length)
    : 0;
  const passCount = evaluatedResults.filter((r) => (Number(r.percentage) || 0) >= 50).length;
  const passRatePct = evaluatedResults.length > 0 ? Math.round((passCount / evaluatedResults.length) * 100) : 0;
  const topScorersCount = evaluatedResults.filter((r) => (Number(r.percentage) || 0) >= 80).length;
  const pendingEvalCount = results.filter((r) => r.delivery_mode === 'PDF_CODING' || r.is_manual_evaluation_pending).length;

  const bands = [
    { label: '0–20%', min: 0, max: 20, tone: 'danger' as const },
    { label: '21–40%', min: 20.01, max: 40, tone: 'warning' as const },
    { label: '41–60%', min: 40.01, max: 60, tone: 'warning' as const },
    { label: '61–80%', min: 60.01, max: 80, tone: 'primary' as const },
    { label: '81–100%', min: 80.01, max: 100, tone: 'success' as const },
  ].map((b) => {
    const count = evaluatedResults.filter((r) => {
      const p = Number(r.percentage) || 0;
      return p >= b.min && p <= b.max;
    }).length;
    const share = evaluatedResults.length > 0 ? Math.round((count / evaluatedResults.length) * 100) : 0;
    return { ...b, count, share };
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Assessment Results & Scorecards"
        description="Authoritative results, section breakdowns, score distributions, and proctoring summaries for finalized attempts."
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleExportResults('csv')}
              disabled={exportingFormat !== null}
              className="csl-btn-secondary"
              style={{ cursor: exportingFormat !== null ? 'not-allowed' : 'pointer' }}
              title="Download plain standards-compliant CSV"
            >
              {exportingFormat === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
            </button>
            <button
              type="button"
              onClick={() => handleExportResults('xlsx')}
              disabled={exportingFormat !== null}
              className="csl-btn-primary"
              style={{
                backgroundColor: '#16A34A',
                cursor: exportingFormat !== null ? 'not-allowed' : 'pointer',
              }}
              title="Download styled Excel workbook using Global Export Appearance settings"
            >
              {exportingFormat === 'xlsx' ? 'Exporting XLSX...' : 'Export XLSX'}
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
        <OdometerCard label="Total Scorecards" value={results.length} subtitle="Completed submissions" />
        <OdometerCard label="Average Score" value={avgPct} suffix="%" subtitle="Evaluated candidates" accent="blue" />
        <OdometerCard label="Pass Rate" value={passRatePct} suffix="%" subtitle={`${passCount} qualified (≥50%)`} accent="green" />
        <OdometerCard label="Top Performers" value={topScorersCount} subtitle="Scored 80%+" accent="indigo" />
        <OdometerCard label="Pending Manual Eval" value={pendingEvalCount} subtitle="Paper / manual coding" accent="amber" />
      </div>

      {/* Score Distribution Panel */}
      {evaluatedResults.length > 0 && (
        <div className="csl-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: tokens.textPrimary }}>
              Score Distribution ({evaluatedResults.length} Evaluated)
            </h3>
            <span className="csl-tabular" style={{ fontSize: '12px', color: tokens.textMuted }}>
              Pass threshold: 50%
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
            {bands.map((b) => (
              <div key={b.label} style={{ backgroundColor: tokens.surfaceElevated, border: `1px solid ${tokens.borderLight}`, borderRadius: '8px', padding: '10px 12px' }}>
                <ProgressBar
                  label={b.label}
                  rightText={`${b.count} (${b.share}%)`}
                  value={b.share}
                  tone={b.tone}
                  height={6}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Toolbar */}
      <SearchToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search candidate, roll no, college..."
        onSubmitSearch={() => loadResults()}
        filters={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => loadResults()} className="csl-btn-primary">
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  loadResults('');
                }}
                className="csl-btn-secondary"
              >
                Clear
              </button>
            )}
          </div>
        }
      />

      {/* Bulk Action Bar */}
      {selectedAttemptIds.length > 0 && (
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
              {selectedAttemptIds.length}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: tokens.cslBlueSoftText }}>
              {selectedAttemptIds.length} scorecard attempt{selectedAttemptIds.length === 1 ? '' : 's'} selected
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setSelectedAttemptIds([])}
              className="csl-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Deselect All
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteAttempts}
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
              <span>{bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedAttemptIds.length})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div
        className="csl-card"
        style={{
          padding: 0,
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: tokens.surfaceElevated, borderBottom: `1px solid ${tokens.border}`, color: tokens.textMuted }}>
              <th style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={results.length > 0 && selectedAttemptIds.length === results.length}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedAttemptIds.length > 0 && selectedAttemptIds.length < results.length;
                  }}
                  onChange={handleToggleSelectAllAttempts}
                  style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                  title="Select / Deselect All Results"
                />
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Candidate Details</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Register / Roll No</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Institution</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Aptitude</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Coding</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Total Score</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Percentage</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted }}>
                  Loading assessment results from database...
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '24px' }}>
                  <EmptyState
                    title="No assessment scorecards found"
                    description="No finalized attempt scorecards match your search criteria."
                  />
                </td>
              </tr>
            ) : (
              results.map((res) => {
                const pct = res.percentage || 0;
                const isPass = pct >= 50;
                const isSelected = selectedAttemptIds.includes(res.id);

                return (
                  <tr
                    key={res.id}
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
                        onChange={() => handleToggleSelectAttempt(res.id)}
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: tokens.cslBlue }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: tokens.textPrimary }}>{res.candidate_name}</div>
                      <div style={{ fontSize: '12px', color: tokens.textMuted, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{res.department} • {res.year_of_study}</span>
                        {res.delivery_mode === 'PDF_CODING' && (
                          <StatusBadge label="PDF Mode" variant="coding" size="sm" dot={false} />
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: tokens.monoFamily, fontWeight: 600, color: tokens.textPrimary }}>
                      {res.register_number}
                    </td>
                    <td style={{ padding: '12px 16px', color: tokens.textSecondary }}>
                      {res.assessment_code && (
                        <span style={{ backgroundColor: tokens.surfaceElevated, border: `1px solid ${tokens.border}`, color: tokens.textPrimary, fontFamily: tokens.monoFamily, fontWeight: 600, fontSize: '11px', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
                          {res.assessment_code}
                        </span>
                      )}
                      {res.college}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: tokens.cslBlueSoftText }}>
                      {res.delivery_mode === 'PDF_CODING' || res.is_manual_evaluation_pending ? (
                        <span style={{ color: tokens.textMuted }}>—</span>
                      ) : (
                        <span style={{ backgroundColor: tokens.cslBlueSoftBg, padding: '2px 8px', borderRadius: '6px' }}>
                          {res.aptitude_score}
                        </span>
                      )}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: tokens.successText }}>
                      {res.delivery_mode === 'PDF_CODING' || res.is_manual_evaluation_pending ? (
                        <span style={{ color: tokens.textMuted }}>—</span>
                      ) : (
                        <span style={{ backgroundColor: tokens.successBg, padding: '2px 8px', borderRadius: '6px' }}>
                          {res.coding_score}
                        </span>
                      )}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: tokens.textPrimary, fontSize: '14px' }}>
                      {res.delivery_mode === 'PDF_CODING' || res.is_manual_evaluation_pending ? (
                        <span style={{ fontSize: '12px', color: tokens.warningText, fontWeight: 600 }}>Paper Eval</span>
                      ) : (
                        <>{res.total_score} <span style={{ fontSize: '11.5px', color: tokens.textMuted, fontWeight: 500 }}>/ {res.assessment_total_marks ?? 50}</span></>
                      )}
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {res.delivery_mode === 'PDF_CODING' || res.is_manual_evaluation_pending ? (
                        <StatusBadge status="PENDING" label="Pending" size="sm" dot={false} />
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            backgroundColor: isPass ? tokens.successBg : tokens.dangerBg,
                            color: isPass ? tokens.successText : tokens.dangerText,
                          }}
                        >
                          {res.percentage}%
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {res.state === 'COMPLETED_PENDING_MANUAL_EVALUATION' || res.is_manual_evaluation_pending ? (
                        <StatusBadge status="PENDING" label="Pending Manual Eval" size="sm" />
                      ) : (
                        <StatusBadge status={res.state} size="sm" />
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => onReviewAttempt(res.id)}
                          className="csl-btn-primary"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            fontSize: '12px',
                          }}
                        >
                          <span>Inspect Review</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteAttempt(res)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: tokens.dangerBg,
                            color: tokens.dangerText,
                            border: `1px solid ${tokens.dangerBorder}`,
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Delete scorecard and attempt record"
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
    </PageContainer>
  );
}
