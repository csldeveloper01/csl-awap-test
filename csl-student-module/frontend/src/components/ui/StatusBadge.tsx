import React from 'react';
import { useAdminTheme } from '../../utils/adminTheme';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'coding';

const STATUS_TO_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  OPEN: 'info',
  AUTHORIZED: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  SUBMITTED: 'success',
  ACCEPTED: 'success',
  SUFFICIENT: 'success',
  CONNECTED: 'success',
  CLEAN: 'success',
  VERIFIED: 'success',
  PASSED: 'success',
  REVIEWED: 'success',
  OK: 'success',
  PUBLIC: 'info',
  SCHEDULED: 'info',
  UPCOMING: 'info',
  IN_PROGRESS: 'info',
  'IN PROGRESS': 'info',
  DRAFT: 'warning',
  PENDING: 'warning',
  'PENDING REVIEW': 'warning',
  PENDING_REVIEW: 'warning',
  RECONNECTING: 'warning',
  DISCONNECTED: 'warning',
  WARNING: 'warning',
  'ACTION REQUIRED': 'warning',
  INSUFFICIENT: 'warning',
  INVITE_ONLY: 'neutral',
  ARCHIVED: 'neutral',
  CLOSED: 'neutral',
  INACTIVE: 'neutral',
  REJECTED: 'danger',
  FAILED: 'danger',
  FLAGGED: 'danger',
  CRITICAL: 'danger',
  TIMED_OUT: 'warning',
  'TIMED OUT': 'warning',
  BLOCKED: 'danger',
  INTERRUPTED: 'danger',
  CODING: 'coding',
};

export interface StatusBadgeProps {
  status?: string | null;
  label?: string;
  variant?: BadgeVariant;
  dot?: boolean;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export function StatusBadge({
  status,
  label,
  variant,
  dot = false,
  size = 'md',
  style,
}: StatusBadgeProps) {
  const { tokens } = useAdminTheme();

  const resolvedText = label ?? (status || 'Unknown');
  const key = (status || resolvedText || '').trim().toUpperCase().replace(/_/g, ' ');
  const keyUnderscore = (status || resolvedText || '').trim().toUpperCase().replace(/\s+/g, '_');

  const resolvedVariant: BadgeVariant =
    variant ||
    STATUS_TO_VARIANT[key] ||
    STATUS_TO_VARIANT[keyUnderscore] ||
    (key.includes('FLAG') || key.includes('FAIL') || key.includes('REJECT') || key.includes('CRITICAL')
      ? 'danger'
      : key.includes('REQUIRE') || key.includes('WARN') || key.includes('PEND') || key.includes('DRAFT')
      ? 'warning'
      : key.includes('ACTIVE') || key.includes('SUFFICIENT') || key.includes('COMPLET') || key.includes('ACCEPT') || key.includes('CLEAN')
      ? 'success'
      : key.includes('OPEN') || key.includes('SCHEDUL') || key.includes('PROGRESS') || key.includes('UPCOMING')
      ? 'info'
      : 'neutral');

  const paletteMap: Record<BadgeVariant, { bg: string; fg: string; border: string; dotColor: string }> = {
    success: {
      bg: tokens.successBg,
      fg: tokens.successText,
      border: 'transparent',
      dotColor: tokens.success,
    },
    warning: {
      bg: tokens.warningBg,
      fg: tokens.warningText,
      border: 'transparent',
      dotColor: tokens.warning,
    },
    danger: {
      bg: tokens.dangerBg,
      fg: tokens.dangerText,
      border: 'transparent',
      dotColor: tokens.danger,
    },
    info: {
      bg: tokens.infoBg,
      fg: tokens.infoText,
      border: 'transparent',
      dotColor: tokens.info,
    },
    coding: {
      bg: tokens.codingBg,
      fg: tokens.codingText,
      border: tokens.codingBorder,
      dotColor: tokens.codingText,
    },
    neutral: {
      bg: tokens.surfaceElevated,
      fg: tokens.textSecondary,
      border: tokens.border,
      dotColor: tokens.textMuted,
    },
  };

  const palette = paletteMap[resolvedVariant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: size === 'sm' ? '1px 7px' : '2px 8px',
        borderRadius: '6px',
        backgroundColor: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        fontFamily: tokens.fontFamily,
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: 500,
        lineHeight: size === 'sm' ? '15px' : '18px',
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '9999px',
            backgroundColor: palette.dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {resolvedText}
    </span>
  );
}
