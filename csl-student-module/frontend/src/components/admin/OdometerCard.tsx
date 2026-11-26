import React from 'react';
import { MetricCard, type MetricAccent } from '../ui/MetricCard';

type OdometerAccent = MetricAccent | 'blue' | 'green' | 'amber' | 'red' | 'indigo';

interface OdometerCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  subtitle?: string;
  subtitleTone?: MetricAccent;
  valueTone?: MetricAccent;
  accent?: OdometerAccent;
  icon?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const ACCENT_MAP: Record<OdometerAccent, MetricAccent> = {
  default: 'default',
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  blue: 'primary',
  indigo: 'primary',
  green: 'success',
  amber: 'warning',
  red: 'danger',
};

/**
 * Legacy-compatible metric card wrapper upgraded to the Stitch MetricCard design system.
 */
export function OdometerCard({
  label,
  value,
  suffix,
  subtitle,
  subtitleTone = 'default',
  valueTone,
  accent,
  icon,
  onClick,
  style,
}: OdometerCardProps) {
  const resolvedTone: MetricAccent = valueTone ?? (accent ? ACCENT_MAP[accent] : 'default');
  return (
    <MetricCard
      label={label}
      value={value}
      suffix={suffix}
      subtitle={subtitle}
      subtitleTone={subtitleTone}
      valueTone={resolvedTone}
      icon={icon}
      onClick={onClick}
      style={style}
    />
  );
}
