/**
 * CSL Assessment Platform - Phase 2.2.1 Design Tokens
 * Aligned with Figma specifications and original geometric visual language.
 */

export const colors = {
  // Brand Blues
  primaryBlue: '#0D52D6',
  darkBlue: '#072C77',
  royalAccent: '#0052CC',
  deepNavy: '#0A192F',
  lightBlueSurface: '#EFF6FF',
  softBlueBorder: '#BFDBFE',

  // Top Header Amber / Gold
  topBarGold: '#C59A27',
  goldHover: '#B38B21',
  goldTextDark: '#1E293B',

  // Scoreboard / LCD Elements
  lcdFrame: '#BCC3CF',
  lcdBorder: '#939CA9',
  lcdScreen: '#94A3B8',
  lcdDigits: '#0F172A',

  // Surface & Neutrals
  pageBg: '#FAF9F5',
  contentBg: '#F8F9FA',
  panelBg: '#DDE2EB',
  cardWhite: '#FFFFFF',
  borderLight: '#E2E8F0',
  borderMuted: '#CBD5E1',

  // Text Hierarchy
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textLight: '#94A3B8',
  textWhite: '#FFFFFF',

  // Semantic Status
  statusSuccess: '#16A34A',
  statusSuccessBg: '#DCFCE7',
  statusWarning: '#D97706',
  statusWarningBg: '#FEF3C7',
  statusDanger: '#DC2626',
  statusDangerBg: '#FEE2E2',
  statusInfo: '#2563EB',
  statusInfoBg: '#DBEAFE',
} as const;

export const motion = {
  transitionFast: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  transitionNormal: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  transitionSlow: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
} as const;

export const shadows = {
  card: '0 4px 12px rgba(0, 0, 0, 0.04)',
  elevated: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
  modal: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
  recessed: 'inset 0 2px 4px rgba(0, 0, 0, 0.2)',
  glowGreen: '0 0 8px #22C55E',
} as const;

export const radii = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '22px',
  full: '9999px',
} as const;
