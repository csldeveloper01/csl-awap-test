import { useAdminTheme } from '../../utils/adminTheme';

export function MetricCardSkeleton({ minWidth = '150px' }: { minWidth?: string }) {
  const { tokens } = useAdminTheme();
  return (
    <div
      className="animate-pulse"
      style={{
        backgroundColor: tokens.surfaceCard,
        border: `1px solid ${tokens.border}`,
        borderRadius: '10px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '12px',
        minWidth,
        flex: 1,
        height: '112px',
        boxShadow: tokens.cardShadow,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: '55%', height: '12px', backgroundColor: tokens.surfaceElevated, borderRadius: '4px' }} />
        <div style={{ width: '18px', height: '18px', backgroundColor: tokens.surfaceElevated, borderRadius: '4px' }} />
      </div>
      <div style={{ width: '40%', height: '28px', backgroundColor: tokens.surfaceElevated, borderRadius: '6px' }} />
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
      className="animate-pulse"
      style={{
        backgroundColor: tokens.surfaceCard,
        borderRadius: '10px',
        border: `1px solid ${tokens.border}`,
        padding: '24px',
        minHeight: '210px',
        boxShadow: tokens.cardShadow,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ width: '65%', height: '20px', backgroundColor: tokens.surfaceElevated, borderRadius: '6px' }} />
        <div style={{ width: '40%', height: '14px', backgroundColor: tokens.surfaceElevated, borderRadius: '4px' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', padding: '12px 0', borderTop: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}` }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: '32px', backgroundColor: tokens.surfaceElevated, borderRadius: '6px' }} />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: '96px', height: '28px', backgroundColor: tokens.surfaceElevated, borderRadius: '6px' }} />
        <div style={{ width: '96px', height: '28px', backgroundColor: tokens.surfaceElevated, borderRadius: '6px' }} />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  const { tokens } = useAdminTheme();
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="animate-pulse" style={{ borderBottom: `1px solid ${tokens.border}` }}>
          {Array.from({ length: columns }).map((__, cIdx) => (
            <td key={cIdx} style={{ padding: '14px 16px' }}>
              <div
                style={{
                  height: '14px',
                  backgroundColor: tokens.surfaceElevated,
                  borderRadius: '4px',
                  width: cIdx === 0 ? '75%' : cIdx === columns - 1 ? '50%' : '60%',
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
          className="animate-pulse"
          style={{
            backgroundColor: tokens.surfaceCard,
            border: `1px solid ${tokens.border}`,
            borderRadius: '10px',
            padding: '18px 20px',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ width: '20%', height: '14px', backgroundColor: tokens.surfaceElevated, borderRadius: '4px' }} />
            <div style={{ width: '80px', height: '22px', backgroundColor: tokens.surfaceElevated, borderRadius: '6px' }} />
          </div>
          <div style={{ width: '85%', height: '18px', backgroundColor: tokens.surfaceElevated, borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <div style={{ height: '32px', backgroundColor: tokens.pageBg, borderRadius: '6px', border: `1px solid ${tokens.border}` }} />
            <div style={{ height: '32px', backgroundColor: tokens.pageBg, borderRadius: '6px', border: `1px solid ${tokens.border}` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
