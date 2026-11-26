import React from 'react';
import { useAdminTheme } from '../../utils/adminTheme';

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  rightText?: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  height?: number;
  style?: React.CSSProperties;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  rightText,
  tone = 'primary',
  height = 8,
  style,
}: ProgressBarProps) {
  const { tokens } = useAdminTheme();
  const safeMax = max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));

  const fillMap = {
    primary: tokens.cslBlue,
    success: tokens.success,
    warning: tokens.warning,
    danger: tokens.danger,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', ...style }}>
      {(label || rightText) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {label && (
            <span style={{ fontSize: '13px', fontWeight: 400, color: tokens.textSecondary }}>
              {label}
            </span>
          )}
          {rightText && (
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: tokens.textPrimary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {rightText}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: '100%',
          height: `${height}px`,
          borderRadius: '9999px',
          backgroundColor: tokens.surfaceElevated,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: '9999px',
            backgroundColor: fillMap[tone],
            transition: 'width 200ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        />
      </div>
    </div>
  );
}
