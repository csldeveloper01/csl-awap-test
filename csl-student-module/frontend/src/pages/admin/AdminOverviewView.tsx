import { useState, useEffect } from 'react';
import { getAdminStats, type AdminStats } from '../../api/admin';
import { OdometerCard } from '../../components/admin/OdometerCard';

interface AdminOverviewViewProps {
  onNavigateTab: (tab: string) => void;
}

export function AdminOverviewView({ onNavigateTab }: AdminOverviewViewProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadStats = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAdminStats();
      setStats(data);
    } catch {
      setError('Failed to fetch administrative metrics from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: '#64748B' }}>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>Loading system statistics...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '16px',
          color: '#991B1B',
          maxWidth: '560px',
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: '6px' }}>Database Error</div>
        <div style={{ fontSize: '13px', marginBottom: '12px' }}>{error}</div>
        <button
          onClick={loadStats}
          style={{
            padding: '8px 16px',
            backgroundColor: '#0D52D6',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1080px' }}>
      {/* Page Title (Mockup 4) */}
      <h1
        style={{
          fontSize: '44px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 28px 0',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
        }}
      >
        Welcome<br />Admin
      </h1>

      {/* 8 Odometer Counters in 4x2 Grid (Mockup 4) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        {/* Row 1 */}
        <OdometerCard
          label="Colleges"
          value={stats.colleges_count || 0}
          onClick={() => onNavigateTab('colleges')}
        />
        <OdometerCard
          label="Assessments"
          value={stats.assessments_count || 0}
          onClick={() => onNavigateTab('assessments')}
        />
        <OdometerCard
          label="Submitted"
          value={stats.submitted_count || 0}
          onClick={() => onNavigateTab('results')}
        />
        <OdometerCard
          label="Sessions"
          value={stats.attempts_count || 0}
          onClick={() => onNavigateTab('live')}
        />

        {/* Row 2 */}
        <OdometerCard
          label="Active Assessments"
          value={stats.open_assessments_count || 0}
          onClick={() => onNavigateTab('assessments')}
        />
        <OdometerCard
          label="In Progress"
          value={stats.in_progress_count || 0}
          onClick={() => onNavigateTab('live')}
        />
        <OdometerCard
          label="Timed Out"
          value={stats.timed_out_count || 0}
          onClick={() => onNavigateTab('results')}
        />
        <OdometerCard
          label="Flagged"
          value={stats.flagged_count || 0}
          onClick={() => onNavigateTab('integrity')}
        />
      </div>

      {/* 2 Lower Highlight Cards (Mockup 4) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
        }}
      >
        {/* Left Card: Question Bank Balance & Health */}
        <div
          style={{
            backgroundColor: '#CBD5E1',
            borderRadius: '24px',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', marginBottom: '14px' }}>
              Question Bank Balance<br />& Health
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              {/* Recessed Digital Display */}
              <div
                style={{
                  backgroundColor: '#94A3B8',
                  borderRadius: '12px',
                  padding: '6px 16px',
                  minWidth: '70px',
                  textAlign: 'center',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                }}
              >
                <span style={{ fontSize: '36px', fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>
                  {String(stats.pools_count ?? stats.assessments_count ?? 0).padStart(2, '0')}
                </span>
              </div>

              {/* Status Pill */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#0F172A',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                Status: OK
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('questions')}
            style={{
              backgroundColor: '#0D52D6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '20px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              alignSelf: 'flex-start',
              boxShadow: '0 2px 6px rgba(13, 82, 214, 0.3)',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            View Question Bank
          </button>
        </div>

        {/* Right Card: Integrity Enforcement Audit Trail */}
        <div
          style={{
            backgroundColor: '#CBD5E1',
            borderRadius: '24px',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', marginBottom: '14px' }}>
              Integrity Enforcement<br />Audit Trail
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              {/* Recessed Digital Display */}
              <div
                style={{
                  backgroundColor: '#94A3B8',
                  borderRadius: '12px',
                  padding: '6px 16px',
                  minWidth: '70px',
                  textAlign: 'center',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                }}
              >
                <span style={{ fontSize: '36px', fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>
                  {String(stats.flagged_count ?? 0).padStart(2, '0')}
                </span>
              </div>

              {/* Status Pill */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: stats.flagged_count > 0 ? '#DC2626' : '#16A34A',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                {stats.flagged_count > 0 ? 'Status: Action Required!' : 'Status: OK'}
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('integrity')}
            style={{
              backgroundColor: '#0D52D6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '20px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              alignSelf: 'flex-start',
              boxShadow: '0 2px 6px rgba(13, 82, 214, 0.3)',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            View Integrity Events
          </button>
        </div>
      </div>
    </div>
  );
}
