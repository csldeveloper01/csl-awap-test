import { useQuery } from '@tanstack/react-query';
import { getAdminStats, type AdminStats } from '../../api/admin';
import { useAdminTheme } from '../../utils/adminTheme';
import {
  PageContainer,
  SectionHeader,
  MetricCard,
  ProgressBar,
  StatusBadge,
  InformationPanel,
} from '../../components/ui';
import { MetricGridSkeleton } from '../../components/admin/SkeletonLoaders';
import {
  AssessmentsIcon,
  CollegesIcon,
  LiveSessionsIcon,
  QuestionBankIcon,
  IntegrityIcon,
  PlusIcon,
  DrivesIcon,
} from '../../components/common/Icons';

interface AdminOverviewViewProps {
  onNavigateTab: (tab: string) => void;
}

export function AdminOverviewView({ onNavigateTab }: AdminOverviewViewProps) {
  const { tokens } = useAdminTheme();
  const {
    data: stats = null,
    isLoading: loading,
    isError,
    refetch,
  } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => getAdminStats(),
    staleTime: 30_000,
  });
  const error = isError ? 'Failed to fetch administrative metrics from server.' : '';
  const loadStats = () => {
    void refetch();
  };

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader
          title="Overview"
          description="Monitor and manage your assessment operations."
        />
        <MetricGridSkeleton count={8} />
      </PageContainer>
    );
  }

  if (error || !stats) {
    return (
      <PageContainer maxWidth="680px">
        <InformationPanel
          tone="danger"
          title="Unable to Load Administrative Metrics"
          description={error || 'The administrative telemetry endpoint did not respond.'}
          actions={
            <button type="button" onClick={loadStats} className="csl-btn-primary">
              Retry
            </button>
          }
        />
      </PageContainer>
    );
  }

  const totalAttempts = stats.attempts_count || 0;
  const submittedCount = stats.submitted_count || 0;
  const completionRate = totalAttempts > 0 ? Math.round((submittedCount / totalAttempts) * 1000) / 10 : 0;
  const totalQuestions = stats.total_questions_count || 0;
  const unassignedQuestions = stats.unassigned_questions_count || 0;
  const assignedPct =
    totalQuestions > 0 ? Math.max(0, Math.round(((totalQuestions - unassignedQuestions) / totalQuestions) * 100)) : 100;
  const bankHealthText =
    stats.question_bank_health?.overall_status ||
    (unassignedQuestions > 0 ? 'Unassigned Items' : 'OK');
  const flaggedCount = stats.flagged_count || 0;

  return (
    <PageContainer>
      <SectionHeader
        title="Overview"
        description="Monitor and manage your assessment operations across drives, candidates, and Sentinel proctoring."
        actions={
          <button
            type="button"
            onClick={() => onNavigateTab('assessments')}
            className="csl-btn-primary"
          >
            <PlusIcon size={16} color={tokens.onPrimary} />
            <span>Create Assessment</span>
          </button>
        }
      />

      {/* Primary 4 Metrics Row */}
      <section
        aria-label="Primary metrics"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <MetricCard
          label="Total Assessments"
          value={stats.assessments_count || 0}
          subtitle={`${stats.open_assessments_count || 0} open now`}
          subtitleTone="primary"
          icon={<AssessmentsIcon size={18} />}
          onClick={() => onNavigateTab('assessments')}
        />
        <MetricCard
          label="Submitted Attempts"
          value={submittedCount}
          subtitle={`${completionRate}% completion rate`}
          subtitleTone="success"
          icon={<AssessmentsIcon size={18} />}
          onClick={() => onNavigateTab('results')}
        />
        <MetricCard
          label="Active Sessions"
          value={stats.in_progress_count || 0}
          valueTone={stats.in_progress_count > 0 ? 'primary' : 'default'}
          subtitle={`${totalAttempts} total sessions recorded`}
          icon={<LiveSessionsIcon size={18} />}
          onClick={() => onNavigateTab('live')}
        />
        <MetricCard
          label="Participating Colleges"
          value={stats.colleges_count || 0}
          subtitle="Verified institutions"
          icon={<CollegesIcon size={18} />}
          onClick={() => onNavigateTab('colleges')}
        />
      </section>

      {/* Secondary 4 Operational Counters */}
      <section
        aria-label="Operational metrics"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <MetricCard
          label="Open Assessments"
          value={stats.open_assessments_count || 0}
          valueTone="primary"
          onClick={() => onNavigateTab('assessments')}
        />
        <MetricCard
          label="Question Pools"
          value={stats.pools_count ?? 0}
          subtitle={`${totalQuestions} total questions`}
          onClick={() => onNavigateTab('questions')}
        />
        <MetricCard
          label="Timed Out Attempts"
          value={stats.timed_out_count || 0}
          valueTone={stats.timed_out_count > 0 ? 'warning' : 'default'}
          onClick={() => onNavigateTab('results')}
        />
        <MetricCard
          label="Flagged Attempts"
          value={flaggedCount}
          valueTone={flaggedCount > 0 ? 'danger' : 'success'}
          subtitle={flaggedCount > 0 ? 'Action required' : 'All clear'}
          subtitleTone={flaggedCount > 0 ? 'danger' : 'success'}
          onClick={() => onNavigateTab('integrity')}
        />
      </section>

      {/* Lower Summary & Quick Actions Grid */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        {/* Card 1: Question Bank Balance & Health */}
        <article
          style={{
            backgroundColor: tokens.surfaceCard,
            border: `1px solid ${tokens.border}`,
            borderRadius: '10px',
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '18px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QuestionBankIcon size={18} color={tokens.cslBlue} />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: tokens.textPrimary }}>
                  Question Bank &amp; Pools
                </h2>
              </div>
              <StatusBadge
                status={bankHealthText}
                variant={
                  bankHealthText.includes('Required') || unassignedQuestions > 0 ? 'warning' : 'success'
                }
              />
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div
                style={{
                  backgroundColor: tokens.pageBg,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: '11px', color: tokens.textMuted, fontWeight: 500 }}>Questions</div>
                <div className="csl-tabular" style={{ fontSize: '20px', fontWeight: 600, marginTop: '2px' }}>
                  {totalQuestions}
                </div>
              </div>
              <div
                style={{
                  backgroundColor: tokens.pageBg,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: '11px', color: tokens.textMuted, fontWeight: 500 }}>Pools</div>
                <div className="csl-tabular" style={{ fontSize: '20px', fontWeight: 600, marginTop: '2px' }}>
                  {stats.pools_count ?? 0}
                </div>
              </div>
              <div
                style={{
                  backgroundColor: tokens.pageBg,
                  border: `1px solid ${tokens.border}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: '11px', color: tokens.textMuted, fontWeight: 500 }}>Unassigned</div>
                <div
                  className="csl-tabular"
                  style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    marginTop: '2px',
                    color: unassignedQuestions > 0 ? tokens.warningText : tokens.textPrimary,
                  }}
                >
                  {unassignedQuestions}
                </div>
              </div>
            </div>

            <ProgressBar
              label="Pool Allocation Coverage"
              rightText={`${assignedPct}%`}
              value={assignedPct}
              tone={unassignedQuestions > 0 ? 'warning' : 'success'}
            />
          </div>

          <footer
            style={{
              paddingTop: '14px',
              borderTop: `1px solid ${tokens.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '12px', color: tokens.textSecondary }}>
              Manage MCQ &amp; coding pools
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('questions')}
              className="csl-btn-secondary"
            >
              Open Question Bank
            </button>
          </footer>
        </article>

        {/* Card 2: Integrity Enforcement Audit Trail */}
        <article
          style={{
            backgroundColor: tokens.surfaceCard,
            border: `1px solid ${tokens.border}`,
            borderRadius: '10px',
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '18px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IntegrityIcon size={18} color={flaggedCount > 0 ? tokens.danger : tokens.success} />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: tokens.textPrimary }}>
                  Integrity &amp; Sentinel
                </h2>
              </div>
              <StatusBadge
                status={flaggedCount > 0 ? 'Action Required' : 'Sentinel Active'}
                variant={flaggedCount > 0 ? 'danger' : 'success'}
                dot
              />
            </header>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: `1px solid ${tokens.border}`,
                }}
              >
                <span style={{ fontSize: '13.5px', color: tokens.textSecondary }}>Flagged Attempts</span>
                <span
                  className="csl-tabular"
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: flaggedCount > 0 ? tokens.danger : tokens.textPrimary,
                  }}
                >
                  {flaggedCount}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: `1px solid ${tokens.border}`,
                }}
              >
                <span style={{ fontSize: '13.5px', color: tokens.textSecondary }}>In-Progress Sessions</span>
                <span className="csl-tabular" style={{ fontSize: '16px', fontWeight: 600 }}>
                  {stats.in_progress_count || 0}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                }}
              >
                <span style={{ fontSize: '13.5px', color: tokens.textSecondary }}>Completion Rate</span>
                <span className="csl-tabular" style={{ fontSize: '16px', fontWeight: 600 }}>
                  {completionRate}%
                </span>
              </div>
            </div>
          </div>

          <footer
            style={{
              paddingTop: '14px',
              borderTop: `1px solid ${tokens.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              type="button"
              onClick={() => onNavigateTab('sentinel')}
              style={{
                background: 'transparent',
                border: 'none',
                color: tokens.cslBlue,
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Sentinel Sessions →
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('integrity')}
              className="csl-btn-secondary"
            >
              Integrity Logs
            </button>
          </footer>
        </article>

        {/* Card 3: Quick Navigation Actions */}
        <article
          style={{
            backgroundColor: tokens.surfaceCard,
            border: `1px solid ${tokens.border}`,
            borderRadius: '10px',
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: tokens.textPrimary }}>
            Quick Shortcuts
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              {
                tab: 'assessments',
                title: 'Create Assessment',
                sub: 'Configure sections, MCQ & coding pools',
                icon: <AssessmentsIcon size={17} color={tokens.cslBlueSoftText} />,
                badgeBg: tokens.cslBlueSoftBg,
              },
              {
                tab: 'drives',
                title: 'Manage Drives',
                sub: '8-digit invite codes & college access',
                icon: <DrivesIcon size={17} color={tokens.textPrimary} />,
                badgeBg: tokens.surfaceElevated,
              },
              {
                tab: 'questions',
                title: 'Question Pools & Bank',
                sub: 'Author MCQs or coding problems',
                icon: <QuestionBankIcon size={17} color={tokens.textPrimary} />,
                badgeBg: tokens.surfaceElevated,
              },
              {
                tab: 'colleges',
                title: 'Manage Colleges',
                sub: `${stats.colleges_count || 0} participating institutions`,
                icon: <CollegesIcon size={17} color={tokens.textPrimary} />,
                badgeBg: tokens.surfaceElevated,
              },
            ].map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => onNavigateTab(item.tab)}
                style={{
                  border: `1px solid ${tokens.border}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                  backgroundColor: tokens.pageBg,
                  color: tokens.textPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 120ms ease-out',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = tokens.surfaceElevated;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = tokens.pageBg;
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      backgroundColor: item.badgeBg,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{item.title}</span>
                    <span style={{ fontSize: '12px', color: tokens.textSecondary }}>{item.sub}</span>
                  </span>
                </span>
                <span style={{ fontSize: '14px', color: tokens.textMuted }}>→</span>
              </button>
            ))}
          </div>
        </article>
      </section>
    </PageContainer>
  );
}
