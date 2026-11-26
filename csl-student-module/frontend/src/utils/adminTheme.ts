import { useEffect, useState } from 'react';

export type AdminThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'csl_admin_theme';
const THEME_EVENT = 'csl-admin-theme-change';

function applyThemeToRoot(mode: AdminThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.cslTheme = mode;
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

export function getStoredAdminTheme(): AdminThemeMode {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function setStoredAdminTheme(mode: AdminThemeMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, mode);
  applyThemeToRoot(mode);
  window.dispatchEvent(new CustomEvent<AdminThemeMode>(THEME_EVENT, { detail: mode }));
}

export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminThemeMode>(() => getStoredAdminTheme());

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  useEffect(() => {
    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<AdminThemeMode>;
      if (custom.detail === 'dark' || custom.detail === 'light') {
        setTheme(custom.detail);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setTheme(e.newValue === 'dark' ? 'dark' : 'light');
      }
    };
    window.addEventListener(THEME_EVENT, onThemeChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggleTheme = () => {
    const next: AdminThemeMode = theme === 'dark' ? 'light' : 'dark';
    setStoredAdminTheme(next);
  };

  return {
    theme,
    isDark: theme === 'dark',
    setTheme: setStoredAdminTheme,
    toggleTheme,
    tokens: getAdminThemeTokens(theme === 'dark'),
  };
}

export function getAdminThemeTokens(isDark: boolean) {
  return {
    fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    monoFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    // Global Stitch Surfaces
    pageBg: isDark ? '#101318' : '#F5F7FA',
    surfaceCard: isDark ? '#1A2029' : '#FFFFFF',
    surfaceElevated: isDark ? '#222B38' : '#EEF2F7',
    surfaceMuted: isDark ? '#141922' : '#F8FAFC',
    surfaceHover: isDark ? '#222B38' : '#EEF2F7',
    inputBg: isDark ? '#101318' : '#F5F7FA',
    // Sidebar Stitch Charcoal Palette (consistent across themes)
    sidebarBg: '#171717',
    sidebarSurface: '#222222',
    sidebarActive: '#292929',
    sidebarBorder: '#262626',
    sidebarText: '#F5F5F5',
    sidebarMuted: '#A3A3A3',
    sidebarAccent: '#FACC15',
    sidebarIndicator: '#EAB308',
    // Text Hierarchy
    textPrimary: isDark ? '#F8FAFC' : '#111827',
    textSecondary: isDark ? '#A3AFBF' : '#4B5563',
    textMuted: isDark ? '#94A3B8' : '#6B7280',
    // Borders & Subtle SaaS Shadows
    border: isDark ? '#303B49' : '#E2E8F0',
    borderLight: isDark ? '#26303D' : '#F1F5F9',
    borderStrong: isDark ? '#475569' : '#CBD5E1',
    cardShadow: isDark
      ? '0 1px 3px rgba(0, 0, 0, 0.35)'
      : '0 1px 2px rgba(15, 23, 42, 0.05)',
    modalShadow: isDark
      ? '0 24px 48px rgba(0, 0, 0, 0.6)'
      : '0 20px 44px rgba(15, 23, 42, 0.16)',
    // CSL Primary & Brand Accent
    cslBlue: isDark ? '#3B82F6' : '#1455D9',
    cslBlueHover: isDark ? '#2563EB' : '#0B2E6F',
    onPrimary: isDark ? '#101318' : '#FFFFFF',
    cslBlueSoftBg: isDark ? '#1E3A8A' : '#DBEAFE',
    cslBlueSoftBorder: isDark ? '#3B82F6' : '#BFDBFE',
    cslBlueSoftText: isDark ? '#DBEAFE' : '#0B2E6F',
    cslNavy: isDark ? '#DBEAFE' : '#0B2E6F',
    cslCharcoal: '#171717',
    cslYellow: isDark ? '#FACC15' : '#EAB308',
    cslYellowSoftBg: isDark ? '#451A03' : '#FEF3C7',
    cslYellowSoftBorder: isDark ? '#F59E0B' : '#FDE68A',
    cslYellowSoftText: isDark ? '#FCD34D' : '#78350F',
    // Semantic Containers
    success: isDark ? '#22C55E' : '#16A34A',
    successBg: isDark ? '#052E16' : '#DCFCE7',
    successBorder: isDark ? '#166534' : '#86EFAC',
    successText: isDark ? '#86EFAC' : '#14532D',
    warning: isDark ? '#F59E0B' : '#D97706',
    warningBg: isDark ? '#451A03' : '#FEF3C7',
    warningBorder: isDark ? '#B45309' : '#FDE68A',
    warningText: isDark ? '#FCD34D' : '#78350F',
    danger: isDark ? '#EF4444' : '#DC2626',
    dangerBg: isDark ? '#450A0A' : '#FEE2E2',
    dangerBorder: isDark ? '#991B1B' : '#FECACA',
    dangerText: isDark ? '#FCA5A5' : '#7F1D1D',
    info: isDark ? '#3B82F6' : '#1455D9',
    infoBg: isDark ? '#172554' : '#DBEAFE',
    infoBorder: isDark ? '#1D4ED8' : '#BFDBFE',
    infoText: isDark ? '#93C5FD' : '#0B2E6F',
    codingBg: isDark ? '#1E1B4B' : '#EEF2FF',
    codingBorder: isDark ? '#4338CA' : '#C7D2FE',
    codingText: isDark ? '#C7D2FE' : '#3730A3',
    // Consistent Spacing & Radii
    radii: {
      sm: '6px',
      md: '8px',
      lg: '10px',
      xl: '12px',
      full: '9999px',
    },
  };
}

export type AdminThemeTokens = ReturnType<typeof getAdminThemeTokens>;
