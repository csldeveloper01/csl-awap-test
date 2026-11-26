import React from 'react';
import { useAdminTheme } from '../../utils/adminTheme';

export type MetricAccent = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export interface MetricCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  subtitle?: string;
  subtitleTone?: MetricAccent;
  valueTone?: MetricAccent;
  icon?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function MetricCard({
  label,
  value,
  suffix,
  subtitle,
  subtitleTone = 'default',
  valueTone = 'default',
  icon,
  onClick,
  style,
}: MetricCardProps) {
  const { tokens } = useAdminTheme();

  const toneColorMap: Record<MetricAccent, string> = {
    default: tokens.textPrimary,
    primary: tokens.cslBlue,
    success: tokens.successText,
    warning: tokens.warningText,
    danger: tokens.danger,
  };

  const subtitleColorMap: Record<MetricAccent, string> = {
    default: tokens.textSecondary,
    primary: tokens.cslBlueSoftText,
    success: tokens.successText,
    warning: tokens.warningText,
    danger: tokens.dangerText,
  };

  return (
    <article
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        backgroundColor: tokens.surfaceCard,
        border: `1px solid ${tokens.border}`,
        borderRadius: '10px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '10px',
        boxShadow: tokens.cardShadow,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms ease-out',
        minWidth: 0,
        boxSizing: 'border-box',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = tokens.borderStrong;
          e.currentTarget.style.backgroundColor = tokens.surfaceHover;
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = tokens.border;
          e.currentTarget.style.backgroundColor = tokens.surfaceCard;
        }
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: '12px',
            fontWeight: 500,
            color: tokens.textSecondary,
            letterSpacing: '0.01em',
            lineHeight: '16px',
          }}
        >
          {label}
        </span>
        {icon && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: valueTone === 'default' ? tokens.textMuted : toneColorMap[valueTone],
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px',
            fontFamily: tokens.fontFamily,
            fontSize: '30px',
            fontWeight: 600,
            lineHeight: '36px',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            color: toneColorMap[valueTone],
          }}
        >
          <span>{typeof value === 'number' ? value.toLocaleString() : value}</span>
          {suffix && (
            <span style={{ fontSize: '13px', fontWeight: 500, color: tokens.textMuted }}>
              {suffix}
            </span>
          )}
        </div>
        {subtitle && (
          <span
            style={{
              fontFamily: tokens.fontFamily,
              fontSize: '12px',
              fontWeight: 500,
              color: subtitleColorMap[subtitleTone],
              lineHeight: '16px',
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </article>
  );
}

export const StatCard = MetricCard;
