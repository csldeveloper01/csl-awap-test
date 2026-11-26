/**
 * CSL Assessment Platform — Unified Global Design Tokens
 * Aligned with Stitch CSL Console visual language.
 */

export const colors = {
  // Charcoal Sidebar (preserved in light & dark modes)
  sidebarBg: '#171717',
  sidebarSurface: '#222222',
  sidebarActive: '#292929',
  sidebarBorder: '#262626',
  sidebarText: '#F5F5F5',
  sidebarMuted: '#A3A3A3',
  sidebarAccent: '#FACC15',
  sidebarIndicator: '#EAB308',

  // Light Mode Palette
  primaryBlue: '#1455D9',
  darkBlue: '#0B2E6F',
  royalAccent: '#1455D9',
  deepNavy: '#0B2E6F',
  lightBlueSurface: '#DBEAFE',
  softBlueBorder: '#BFDBFE',

  topBarGold: '#EAB308',
  goldHover: '#CA8A04',
  goldTextDark: '#111827',

  // Surfaces & Neutrals
  pageBg: '#F5F7FA',
  contentBg: '#FFFFFF',
  panelBg: '#EEF2F7',
  cardWhite: '#FFFFFF',
  borderLight: '#E2E8F0',
  borderMuted: '#CBD5E1',

  // Text Hierarchy
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',
  textWhite: '#FFFFFF',

  // Semantic Status
  statusSuccess: '#16A34A',
  statusSuccessBg: '#DCFCE7',
  statusSuccessText: '#14532D',
  statusWarning: '#D97706',
  statusWarningBg: '#FEF3C7',
  statusWarningText: '#78350F',
  statusDanger: '#DC2626',
  statusDangerBg: '#FEE2E2',
  statusDangerText: '#7F1D1D',
  statusInfo: '#1455D9',
  statusInfoBg: '#DBEAFE',
  statusInfoText: '#0B2E6F',
} as const;

export const typography = {
  fontSans: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  metricLg: { fontSize: '32px', lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: 600 },
  headlineLg: { fontSize: '28px', lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: 600 },
  headlineMd: { fontSize: '18px', lineHeight: '26px', letterSpacing: '-0.015em', fontWeight: 600 },
  headlineSm: { fontSize: '16px', lineHeight: '22px', letterSpacing: '-0.01em', fontWeight: 600 },
  titleSm: { fontSize: '14px', lineHeight: '20px', letterSpacing: '0px', fontWeight: 600 },
  bodyMd: { fontSize: '14px', lineHeight: '20px', fontWeight: 400 },
  bodySm: { fontSize: '13px', lineHeight: '18px', fontWeight: 400 },
  labelLg: { fontSize: '14px', lineHeight: '20px', fontWeight: 500 },
  labelMd: { fontSize: '12px', lineHeight: '16px', letterSpacing: '0.01em', fontWeight: 500 },
  labelSm: { fontSize: '11px', lineHeight: '14px', letterSpacing: '0.02em', fontWeight: 500 },
  codeSm: { fontSize: '12px', lineHeight: '16px', fontWeight: 500 },
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
} as const;

export const motion = {
  transitionFast: 'all 120ms ease-out',
  transitionNormal: 'all 180ms cubic-bezier(0.2, 0, 0, 1)',
  transitionSlow: 'all 240ms cubic-bezier(0.2, 0, 0, 1)',
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
} as const;

export const shadows = {
  card: '0 1px 2px rgba(15, 23, 42, 0.05)',
  elevated: '0 4px 12px rgba(15, 23, 42, 0.06)',
  modal: '0 20px 44px rgba(15, 23, 42, 0.16)',
  recessed: 'inset 0 1px 2px rgba(15, 23, 42, 0.08)',
  glowGreen: '0 0 6px rgba(34, 197, 94, 0.5)',
} as const;

export const radii = {
  sm: '6px',
  md: '8px',
  lg: '10px',
  xl: '12px',
  full: '9999px',
} as const;

export const zIndex = {
  header: 30,
  backdrop: 40,
  sidebar: 50,
  modal: 9999,
  toast: 10000,
} as const;
