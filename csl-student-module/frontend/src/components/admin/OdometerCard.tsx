import React from 'react';

interface OdometerCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function OdometerCard({ label, value, suffix, onClick, style }: OdometerCardProps) {
  const formattedValue =
    typeof value === 'number'
      ? String(value).padStart(2, '0')
      : String(value);

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#BCC3CF',
        border: '1px solid #A6AFBD',
        borderRadius: '20px',
        padding: '12px 14px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '130px',
        flex: 1,
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        userSelect: 'none',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 14px rgba(0, 0, 0, 0.08)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.04)';
        }
      }}
    >
      {/* Recessed Digital Display Screen */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#939CA9',
          border: '1.5px solid #7E8795',
          borderRadius: '12px',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.18)',
        }}
      >
        {/* Decorative LCD meter indicator notch */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            opacity: 0.5,
          }}
        >
          <div
            style={{
              width: '12px',
              height: '18px',
              border: '2px solid #334155',
              borderRadius: '3px',
            }}
          />
          <div
            style={{
              width: '4px',
              height: '10px',
              backgroundColor: '#334155',
              borderRadius: '1px',
            }}
          />
        </div>

        {/* Digital Value */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '4px',
          }}
        >
          <span
            style={{
              fontSize: '32px',
              fontWeight: 900,
              color: '#0B0F19',
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}
          >
            {formattedValue}
          </span>
          {suffix && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#1E293B',
                letterSpacing: '-0.01em',
              }}
            >
              {suffix}
            </span>
          )}
        </div>
      </div>

      {/* Label Underneath */}
      <div
        style={{
          marginTop: '8px',
          fontSize: '13px',
          fontWeight: 800,
          color: '#111827',
          textAlign: 'center',
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </div>
    </div>
  );
}
