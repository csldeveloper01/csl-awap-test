/**
 * Metric Card Skeleton (Matches OdometerCard dimensions and geometry)
 */
export function MetricCardSkeleton({ minWidth = '130px' }: { minWidth?: string }) {
  return (
    <div
      style={{
        backgroundColor: '#BCC3CF',
        border: '1px solid #A6AFBD',
        borderRadius: '20px',
        padding: '12px 14px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth,
        flex: 1,
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.04)',
        boxSizing: 'border-box',
        height: '92px',
        opacity: 0.85,
      }}
    >
      {/* Recessed display screen */}
      <div
        className="animate-pulse"
        style={{
          width: '100%',
          backgroundColor: '#939CA9',
          border: '1.5px solid #7E8795',
          borderRadius: '12px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          boxSizing: 'border-box',
          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.18)',
        }}
      >
        <div style={{ width: '20px', height: '18px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '4px' }} />
        <div style={{ width: '48px', height: '26px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px' }} />
      </div>

      {/* Label line */}
      <div
        className="animate-pulse"
        style={{
          width: '65%',
          height: '11px',
          backgroundColor: 'rgba(0,0,0,0.2)',
          borderRadius: '6px',
          marginTop: '8px',
        }}
      />
    </div>
  );
}

/**
 * Grid of metric card skeletons
 */
export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <MetricCardSkeleton key={idx} />
      ))}
    </div>
  );
}

/**
 * Card Skeleton with folded blue corner ribbon (Matches Assessments / Pools / Drives)
 */
export function FoldedCardSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        position: 'relative',
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        border: '1px solid #E2E8F0',
        padding: '24px 20px 20px',
        minHeight: '190px',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      {/* Decorative top-right folded corner ribbon */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '52px',
          height: '52px',
          backgroundColor: '#0052CC',
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          opacity: 0.8,
        }}
      />

      {/* Card Header */}
      <div>
        <div style={{ width: '70%', height: '22px', backgroundColor: '#E2E8F0', borderRadius: '6px', marginBottom: '8px' }} />
        <div style={{ width: '40%', height: '14px', backgroundColor: '#F1F5F9', borderRadius: '4px' }} />
      </div>

      {/* Middle metric preview */}
      <div style={{ display: 'flex', gap: '16px', margin: '14px 0' }}>
        <div style={{ width: '70px', height: '48px', backgroundColor: '#F1F5F9', borderRadius: '10px' }} />
        <div style={{ width: '70px', height: '48px', backgroundColor: '#F1F5F9', borderRadius: '10px' }} />
        <div style={{ width: '70px', height: '48px', backgroundColor: '#F1F5F9', borderRadius: '10px' }} />
      </div>

      {/* Footer buttons placeholder */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
        <div style={{ width: '90px', height: '32px', backgroundColor: '#E2E8F0', borderRadius: '8px' }} />
        <div style={{ width: '110px', height: '32px', backgroundColor: '#0052CC', borderRadius: '8px', opacity: 0.3 }} />
      </div>
    </div>
  );
}

/**
 * Table Row Skeleton (Customizable column count)
 */
export function TableRowSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="animate-pulse" style={{ borderBottom: '1px solid #F1F5F9' }}>
          {Array.from({ length: columns }).map((__, cIdx) => (
            <td key={cIdx} style={{ padding: '16px 14px' }}>
              <div
                style={{
                  height: '16px',
                  backgroundColor: cIdx === 0 ? '#CBD5E1' : '#E2E8F0',
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

/**
 * Question List Item Skeleton
 */
export function QuestionCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="animate-pulse"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ width: '20%', height: '14px', backgroundColor: '#E2E8F0', borderRadius: '4px' }} />
            <div style={{ width: '80px', height: '22px', backgroundColor: '#F1F5F9', borderRadius: '12px' }} />
          </div>
          <div style={{ width: '85%', height: '18px', backgroundColor: '#CBD5E1', borderRadius: '6px', marginBottom: '12px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <div style={{ height: '32px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #EDF2F7' }} />
            <div style={{ height: '32px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #EDF2F7' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
