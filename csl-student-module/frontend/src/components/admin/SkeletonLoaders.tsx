import { useAdminTheme } from '../../utils/adminTheme';

export function MetricCardSkeleton({ minWidth = '150px' }: { minWidth?: string }) {
  const { tokens } = useAdminTheme();
  return (
    <div
      style={{
        backgroundColor: tokens.surfaceCard,
        border: `1px solid ${tokens.border}`,
        borderRadius: '10px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        flex: `1 1 ${minWidth}`,
        minHeight: '112px',
      }}
    >
      <div className="csl-skeleton-shimmer" style={{ height: '12px', width: '40%', borderRadius: '4px' }} />
      <div className="csl-skeleton-shimmer" style={{ height: '28px', width: '55%', borderRadius: '6px' }} />
      <div className="csl-skeleton-shimmer" style={{ height: '10px', width: '30%', borderRadius: '4px' }} />
    </div>
  );
}

export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', width: '100%' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <MetricCardSkeleton key={idx} />
      ))}
    </div>
  );
}

export function FoldedCardSkeleton() {
  const { tokens } = useAdminTheme();
  return (
    <div
      style={{
        backgroundColor: tokens.surfaceCard,
        borderRadius: '10px',
        border: `1px solid ${tokens.border}`,
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        <div className="csl-skeleton-shimmer" style={{ height: '16px', width: '32%', borderRadius: '4px' }} />
        <div className="csl-skeleton-shimmer" style={{ height: '12px', width: '58%', borderRadius: '4px' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div className="csl-skeleton-shimmer" style={{ height: '32px', width: '80px', borderRadius: '8px' }} />
        <div className="csl-skeleton-shimmer" style={{ height: '32px', width: '80px', borderRadius: '8px' }} />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  const { tokens } = useAdminTheme();
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} style={{ borderBottom: `1px solid ${tokens.border}` }}>
          {Array.from({ length: columns }).map((__, cIdx) => (
            <td key={cIdx} style={{ padding: '14px 16px' }}>
              <div
                className="csl-skeleton-shimmer"
                style={{
                  height: '14px',
                  width: cIdx === 0 ? '70%' : cIdx === columns - 1 ? '45%' : '85%',
                  borderRadius: '4px',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function QuestionCardSkeleton({ count = 3 }: { count?: number }) {
  const { tokens } = useAdminTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            backgroundColor: tokens.surfaceCard,
            border: `1px solid ${tokens.border}`,
            borderRadius: '10px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="csl-skeleton-shimmer" style={{ height: '12px', width: '18%', borderRadius: '4px' }} />
            <div className="csl-skeleton-shimmer" style={{ height: '20px', width: '64px', borderRadius: '9999px' }} />
          </div>
          <div className="csl-skeleton-shimmer" style={{ height: '16px', width: '80%', borderRadius: '4px' }} />
          <div className="csl-skeleton-shimmer" style={{ height: '14px', width: '55%', borderRadius: '4px' }} />
        </div>
      ))}
    </div>
  );
}
