import { useEffect, useState, type MouseEvent } from 'react';

export type AdminThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'csl_admin_theme';
const THEME_EVENT = 'csl-admin-theme-change';
const ANIMATIONS_STORAGE_KEY = 'csl_advanced_animations';
const ANIMATIONS_EVENT = 'csl-advanced-animations-change';
export const THEME_RIPPLE_SWAP_DELAY_MS = 400;
export const THEME_RIPPLE_CLEANUP_MS = 1200;
export const THEME_RIPPLE_DURATION_MS = 1000;

export const THEME_RIPPLE_CIRCLES = [
  { size: 150, opacity: '12', delay: 50, duration: 1000 },
  { size: 100, opacity: '20', delay: 0, duration: 800 },
  { size: 60, opacity: '15', delay: 100, duration: 900 },
] as const;

let activeRippleContainer: HTMLDivElement | null = null;
let activeFlipTimer: ReturnType<typeof setTimeout> | null = null;
let activeCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let activeCircleTimers: Array<ReturnType<typeof setTimeout>> = [];
let pendingThemeTarget: AdminThemeMode | null = null;

function clearActiveThemeTransition(): void {
  if (activeFlipTimer !== null) {
    window.clearTimeout(activeFlipTimer);
    activeFlipTimer = null;
  }
  if (activeCleanupTimer !== null) {
    window.clearTimeout(activeCleanupTimer);
    activeCleanupTimer = null;
  }
  for (const tid of activeCircleTimers) {
    window.clearTimeout(tid);
  }
  activeCircleTimers = [];
  if (activeRippleContainer) {
    activeRippleContainer.remove();
    activeRippleContainer = null;
  }
  pendingThemeTarget = null;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function computeRippleMaxRadius(
  originX: number,
  originY: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  const maxX = Math.max(originX, Math.max(0, viewportWidth - originX));
  const maxY = Math.max(originY, Math.max(0, viewportHeight - originY));
  return Math.ceil(Math.hypot(maxX, maxY));
}

function applyThemeToRoot(mode: AdminThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.cslTheme = mode;
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.classList.add('csl-dark-transition');
}

function applyAnimationsToRoot(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.cslAnimations = enabled ? 'enabled' : 'disabled';
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

export function getStoredAdvancedAnimations(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem(ANIMATIONS_STORAGE_KEY);
  return raw === null ? true : raw === 'true';
}

export function setStoredAdvancedAnimations(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ANIMATIONS_STORAGE_KEY, enabled ? 'true' : 'false');
  applyAnimationsToRoot(enabled);
  window.dispatchEvent(new CustomEvent<boolean>(ANIMATIONS_EVENT, { detail: enabled }));
}

/**
 * Recreates the RAISE Centre multi-circle ripple expanding from the button center,
 * while swapping the actual theme at 400ms and tearing down the container at 1200ms.
 */
export function playRaiseCentreRippleEffect(
  originX: number,
  originY: number,
  currentlyDark: boolean
): void {
  if (typeof document === 'undefined' || !document.body) return;

  const viewportWidth = Math.max(window.innerWidth, document.documentElement?.clientWidth || 0);
  const viewportHeight = Math.max(window.innerHeight, document.documentElement?.clientHeight || 0);
  const maxRadius = computeRippleMaxRadius(originX, originY, viewportWidth, viewportHeight);

  const rippleContainer = document.createElement('div');
  rippleContainer.className = 'ripple-container csl-ripple-container';
  rippleContainer.setAttribute('aria-hidden', 'true');
  rippleContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
  `;

  // Tint determined BEFORE the dark-mode flip: '#f8f9fa' when leaving dark mode, '#000000' when entering dark mode
  const baseColor = currentlyDark ? '#f8f9fa' : '#000000';

  const circlePairs = THEME_RIPPLE_CIRCLES.map((ripple) => {
    const circle = document.createElement('div');
    circle.setAttribute('data-ripple-size', String(ripple.size));
    circle.setAttribute('data-ripple-duration', String(ripple.duration));
    circle.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle, ${baseColor}${ripple.opacity} 0%, transparent 70%);
      transform: translate(-50%, -50%) scale(0);
      left: ${originX}px;
      top: ${originY}px;
      width: ${ripple.size}px;
      height: ${ripple.size}px;
      transition: transform ${ripple.duration}ms cubic-bezier(0.4, 0.0, 0.2, 1);
      will-change: transform;
    `;
    rippleContainer.appendChild(circle);
    return { circle, ripple };
  });

  document.body.appendChild(rippleContainer);
  activeRippleContainer = rippleContainer;

  // Allow initial scale(0) frame to paint cleanly before triggering staggered expansion
  window.requestAnimationFrame(() => {
    for (const { circle, ripple } of circlePairs) {
      const targetScale = Math.max(50, Math.ceil((maxRadius * 2) / ripple.size) + 2);
      const tid = window.setTimeout(() => {
        if (activeRippleContainer === rippleContainer) {
          circle.style.transform = `translate(-50%, -50%) scale(${targetScale})`;
        }
      }, ripple.delay);
      activeCircleTimers.push(tid);
    }
  });
}

export function useAdvancedAnimations() {
  const [enabled, setEnabled] = useState<boolean>(() => getStoredAdvancedAnimations());

  useEffect(() => {
    applyAnimationsToRoot(enabled);
  }, [enabled]);

  useEffect(() => {
    const onAnimChange = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      if (typeof custom.detail === 'boolean') {
        setEnabled(custom.detail);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ANIMATIONS_STORAGE_KEY) {
        setEnabled(e.newValue === null ? true : e.newValue === 'true');
      }
    };
    window.addEventListener(ANIMATIONS_EVENT, onAnimChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(ANIMATIONS_EVENT, onAnimChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return {
    advancedAnimationsEnabled: enabled,
    setAdvancedAnimations: setStoredAdvancedAnimations,
  };
}

export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminThemeMode>(() => getStoredAdminTheme());
  const { advancedAnimationsEnabled, setAdvancedAnimations } = useAdvancedAnimations();

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

  const toggleTheme = (event?: MouseEvent<HTMLElement>) => {
    const baseTheme = pendingThemeTarget ?? theme;
    const currentlyDark = baseTheme === 'dark';
    const next: AdminThemeMode = currentlyDark ? 'light' : 'dark';
    const shouldAnimate = advancedAnimationsEnabled && !prefersReducedMotion();

    clearActiveThemeTransition();

    if (!shouldAnimate || typeof window === 'undefined' || typeof document === 'undefined') {
      setStoredAdminTheme(next);
      return;
    }

    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const originX = rect ? Math.round(rect.left + rect.width / 2) : Math.max(0, window.innerWidth - 28);
    const originY = rect ? Math.round(rect.top + rect.height / 2) : 28;

    pendingThemeTarget = next;
    playRaiseCentreRippleEffect(originX, originY, currentlyDark);

    activeFlipTimer = window.setTimeout(() => {
      activeFlipTimer = null;
      pendingThemeTarget = null;
      setStoredAdminTheme(next);
    }, THEME_RIPPLE_SWAP_DELAY_MS);

    activeCleanupTimer = window.setTimeout(() => {
      activeCleanupTimer = null;
      for (const tid of activeCircleTimers) {
        window.clearTimeout(tid);
      }
      activeCircleTimers = [];
      if (activeRippleContainer) {
        activeRippleContainer.remove();
        activeRippleContainer = null;
      }
    }, THEME_RIPPLE_CLEANUP_MS);
  };

  return {
    theme,
    isDark: theme === 'dark',
    advancedAnimationsEnabled,
    setAdvancedAnimations,
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
