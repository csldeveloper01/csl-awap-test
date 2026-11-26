import React from 'react';
import { useAdminTheme } from '../../utils/adminTheme';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  style?: React.CSSProperties;
}

export function SectionHeader({ title, description, actions, badge, style }: SectionHeaderProps) {
  const { tokens } = useAdminTheme();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h1
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily,
              fontSize: '26px',
              fontWeight: 600,
              lineHeight: '32px',
              letterSpacing: '-0.02em',
              color: tokens.textPrimary,
            }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p
            style={{
              margin: 0,
              fontFamily: tokens.fontFamily,
              fontSize: '14px',
              fontWeight: 400,
              lineHeight: '20px',
              color: tokens.textSecondary,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}

export interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: string;
  gap?: string;
  style?: React.CSSProperties;
}

export function PageContainer({
  children,
  maxWidth = '1440px',
  gap = '24px',
  style,
}: PageContainerProps) {
  const { tokens } = useAdminTheme();

  return (
    <div
      style={{
        width: '100%',
        maxWidth,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap,
        fontFamily: tokens.fontFamily,
        color: tokens.textPrimary,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface InformationPanelProps {
  title?: string;
  description?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  actions?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function InformationPanel({
  title,
  description,
  tone = 'info',
  actions,
  children,
  style,
}: InformationPanelProps) {
  const { tokens } = useAdminTheme();

  const toneStyles = {
    info: { bg: tokens.infoBg, border: tokens.infoBorder, color: tokens.infoText },
    success: { bg: tokens.successBg, border: tokens.successBorder, color: tokens.successText },
    warning: { bg: tokens.warningBg, border: tokens.warningBorder, color: tokens.warningText },
    danger: { bg: tokens.dangerBg, border: tokens.dangerBorder, color: tokens.dangerText },
    neutral: { bg: tokens.surfaceElevated, border: tokens.border, color: tokens.textPrimary },
  }[tone];

  return (
    <div
      style={{
        backgroundColor: toneStyles.bg,
        border: `1px solid ${toneStyles.border}`,
        borderRadius: '10px',
        padding: '14px 18px',
        color: toneStyles.color,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 260px', minWidth: 0 }}>
        {title && <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{title}</div>}
        {description && <div style={{ fontSize: '13px', opacity: 0.92 }}>{description}</div>}
        {children}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
    </div>
  );
}
