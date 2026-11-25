import { useEffect, useState } from 'react';

export type AdminThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'csl_admin_theme';
const THEME_EVENT = 'csl-admin-theme-change';

export function getStoredAdminTheme(): AdminThemeMode {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function setStoredAdminTheme(mode: AdminThemeMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, mode);
  document.documentElement.dataset.cslTheme = mode;
  window.dispatchEvent(new CustomEvent<AdminThemeMode>(THEME_EVENT, { detail: mode }));
}

export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminThemeMode>(() => getStoredAdminTheme());

  useEffect(() => {
    document.documentElement.dataset.cslTheme = theme;
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
    // Surfaces
    pageBg: isDark ? '#0B1120' : '#F8FAFC',
    surfaceCard: isDark ? '#111827' : '#FFFFFF',
    surfaceElevated: isDark ? '#1E293B' : '#F8FAFC',
    surfaceMuted: isDark ? '#0F172A' : '#F1F5F9',
    surfaceHover: isDark ? '#1F2937' : '#F1F5F9',
    inputBg: isDark ? '#0F172A' : '#FFFFFF',
    // Text
    textPrimary: isDark ? '#F1F5F9' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#475569',
    textMuted: isDark ? '#64748B' : '#64748B',
    // Borders & Shadows
    border: isDark ? '#1F2937' : '#E2E8F0',
    borderStrong: isDark ? '#334155' : '#CBD5E1',
    cardShadow: isDark
      ? '0 4px 16px rgba(0, 0, 0, 0.35)'
      : '0 2px 10px rgba(15, 23, 42, 0.05)',
    modalShadow: isDark
      ? '0 24px 56px rgba(0, 0, 0, 0.65)'
      : '0 24px 56px rgba(15, 23, 42, 0.2)',
    // CSL Brand Palette
    cslBlue: '#1455B8',
    cslBlueHover: '#0F4496',
    cslBlueSoftBg: isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF',
    cslBlueSoftBorder: isDark ? 'rgba(59, 130, 246, 0.4)' : '#BFDBFE',
    cslBlueSoftText: isDark ? '#93C5FD' : '#1D4ED8',
    cslNavy: isDark ? '#93C5FD' : '#0B2E6F',
    cslCharcoal: '#1E293B',
    cslYellow: '#F5B83D',
    cslYellowSoftBg: isDark ? 'rgba(245, 184, 61, 0.14)' : '#FEF3C7',
    cslYellowSoftText: isDark ? '#FCD34D' : '#92400E',
    // Semantic badges
    successBg: isDark ? 'rgba(34, 197, 94, 0.15)' : '#DCFCE7',
    successBorder: isDark ? 'rgba(34, 197, 94, 0.35)' : '#86EFAC',
    successText: isDark ? '#86EFAC' : '#166534',
    dangerBg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    dangerBorder: isDark ? 'rgba(239, 68, 68, 0.38)' : '#FECACA',
    dangerText: isDark ? '#FCA5A5' : '#B91C1C',
    codingBg: isDark ? 'rgba(139, 92, 246, 0.16)' : '#F5F3FF',
    codingBorder: isDark ? 'rgba(167, 139, 250, 0.38)' : '#DDD6FE',
    codingText: isDark ? '#C4B5FD' : '#6D28D9',
  };
}
