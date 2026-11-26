import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import {
  getAdminMe,
  getAdminStats,
  getAdminAssessments,
  getAdminColleges,
  undoAdminAuditAction,
  type AdminUser,
  type AdminStats,
  type AdminAssessment,
  type AdminCollege,
} from '../../api/admin';
import { queryClient } from '../../main';
import { AdminLoginPage } from './AdminLoginPage';
import { AdminOverviewView } from './AdminOverviewView';
import { AdminCollegesView } from './AdminCollegesView';
import { AdminCandidatesView } from './AdminCandidatesView';
import { AdminAssessmentsView } from './AdminAssessmentsView';
import { AdminQuestionsView } from './AdminQuestionsView';
import { AdminConfigView } from './AdminConfigView';
import { AdminLiveAttemptsView } from './AdminLiveAttemptsView';
import { AdminAttemptReviewView } from './AdminAttemptReviewView';
import { AdminResultsView } from './AdminResultsView';
import { AdminIntegrityEventsView } from './AdminIntegrityEventsView';
import { AdminSentinelView } from './AdminSentinelView';
import { AdminUsersView } from './AdminUsersView';
import { AdminDrivesView } from './AdminDrivesView';
import { AdminDeveloperToolsView } from './AdminDeveloperToolsView';
import { AccessibleModal } from '../../components/admin/AccessibleModal';
import { StatusBadge } from '../../components/ui';
import { useAdminTheme } from '../../utils/adminTheme';
import {
  OverviewIcon,
  CollegesIcon,
  CandidatesIcon,
  AssessmentsIcon,
  DrivesIcon,
  QuestionBankIcon,
  ResultsIcon,
  IntegrityIcon,
  LiveSessionsIcon,
  SettingsIcon,
  LogoutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  DownloadIcon,
  DeviceIcon,
  HomeIcon,
  UndoIcon,
  SearchIcon,
  TerminalIcon,
} from '../../components/common/Icons';
import {
  ReassessStudentAccessModal,
  ExportStudentDataModal,
  ImportQuestionsCSVModal,
} from '../../components/admin/QuickActionsModals';

const CSL_ADMIN_TAB_AUTH_KEY = 'csl_admin_tab_authenticated';

interface NavGroup {
  title: string;
  items: {
    key: string;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
  }[];
}

export function CSLAdminPortalPage() {
  const { isDark, toggleTheme, tokens } = useAdminTheme();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [portalAssessments, setPortalAssessments] = useState<AdminAssessment[]>([]);
  const [portalColleges, setPortalColleges] = useState<AdminCollege[]>([]);

  const loadPortalAssessmentsAndColleges = async () => {
    try {
      const [assData, colData] = await Promise.all([
        getAdminAssessments().catch(() => [] as AdminAssessment[]),
        getAdminColleges().catch(() => [] as AdminCollege[]),
      ]);
      setPortalAssessments(assData);
      setPortalColleges(colData);
    } catch {
      // handled per request
    }
  };

  useEffect(() => {
    if (adminUser) {
      loadPortalAssessmentsAndColleges();
    }
  }, [adminUser]);

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('csl_admin_sidebar_collapsed') === 'true';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('csl_admin_right_collapsed') === 'true';
  });
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('csl_admin_right_width');
    const num = saved ? parseInt(saved, 10) : 272;
    return !isNaN(num) && num >= 230 && num <= 400 ? num : 272;
  });
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobileDrawerMode = viewportWidth < 1024;
  const isCompactPadding = viewportWidth < 768;

  // Quick Command Modal (Ctrl+K)
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isMobileDrawerMode && mobileMenuOpen) {
        e.preventDefault();
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileDrawerMode, mobileMenuOpen]);

  const handleDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDividerPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRight) return;
    const newWidth = Math.max(230, Math.min(400, window.innerWidth - e.clientX));
    setRightPanelWidth(newWidth);
    localStorage.setItem('csl_admin_right_width', String(newWidth));
  };

  const handleDividerPointerUp = (e: React.PointerEvent) => {
    if (isDraggingRight) {
      setIsDraggingRight(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const toggleLeftSidebar = () => {
    setLeftSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('csl_admin_sidebar_collapsed', String(next));
      return next;
    });
  };

  const toggleRightPanel = () => {
    setRightPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('csl_admin_right_collapsed', String(next));
      return next;
    });
  };

  const [showReassessModal, setShowReassessModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const [pendingUndoAct, setPendingUndoAct] = useState<{ id: number; action_display?: string } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const handleOpenUndoConfirm = (act: { id: number; action_display?: string }) => {
    setPendingUndoAct(act);
  };

  const handleConfirmUndo = async () => {
    if (!pendingUndoAct) return;
    setUndoing(true);
    try {
      const res = await undoAdminAuditAction(pendingUndoAct.id);
      setUndoToast(res.message);
      setPendingUndoAct(null);
      setTimeout(() => setUndoToast(null), 4000);
      loadStatsData();
    } catch (err: any) {
      alert(err.response?.data?.error || err.response?.data?.detail || 'Failed to revert action.');
    } finally {
      setUndoing(false);
    }
  };

  const activeTab = searchParams.get('tab') || 'overview';
  const reviewAttemptId = searchParams.get('attemptId');
  const assessmentIdFromQuery = searchParams.get('assessmentId');
  const fromTab = searchParams.get('fromTab') || 'live';

  const loadStatsData = () => {
    getAdminStats()
      .then((data) => setStats(data))
      .catch(() => {});
  };

  useEffect(() => {
    let isTabVerified = false;
    try {
      isTabVerified = sessionStorage.getItem(CSL_ADMIN_TAB_AUTH_KEY) === 'true';
    } catch {
      isTabVerified = false;
    }

    if (!isTabVerified) {
      setAdminUser(null);
      setLoadingAuth(false);
      return;
    }

    getAdminMe()
      .then((data) => {
        if (data && (data.is_staff || data.is_superuser || data.role === 'ADMIN')) {
          setAdminUser(data);
          loadStatsData();
        } else {
          sessionStorage.removeItem(CSL_ADMIN_TAB_AUTH_KEY);
          queryClient.clear();
          setAdminUser(null);
        }
      })
      .catch(() => {
        sessionStorage.removeItem(CSL_ADMIN_TAB_AUTH_KEY);
        queryClient.clear();
        setAdminUser(null);
      })
      .finally(() => {
        setLoadingAuth(false);
      });
  }, []);

  const handleLoginSuccess = (admin: AdminUser) => {
    try {
      sessionStorage.setItem(CSL_ADMIN_TAB_AUTH_KEY, 'true');
    } catch {
      // ignore
    }
    setAdminUser(admin);
    loadStatsData();
  };

  const handleLogout = async () => {
    try {
      await api.post('/logout/');
    } catch {
      // ignore
    } finally {
      try {
        sessionStorage.removeItem(CSL_ADMIN_TAB_AUTH_KEY);
        queryClient.clear();
      } catch {
        // ignore
      }
      setAdminUser(null);
      setSearchParams({ tab: 'overview' });
    }
  };

  const setActiveTab = (tabKey: string) => {
    setSearchParams({ tab: tabKey });
    setMobileMenuOpen(false);
  };

  const handleOpenReview = (attemptId: string) => {
    setSearchParams({
      tab: 'review',
      attemptId,
      fromTab: activeTab !== 'review' ? activeTab : 'live',
    });
  };

  const handleBackFromReview = () => {
    setSearchParams({ tab: fromTab });
  };

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        title: 'Workspace',
        items: [
          { key: 'overview', label: 'Overview', icon: <OverviewIcon size={17} /> },
          { key: 'colleges', label: 'Colleges', icon: <CollegesIcon size={17} /> },
          { key: 'candidates', label: 'Candidates', icon: <CandidatesIcon size={17} /> },
        ],
      },
      {
        title: 'Assessments',
        items: [
          { key: 'assessments', label: 'Assessments', icon: <AssessmentsIcon size={17} /> },
          { key: 'drives', label: 'Drives', icon: <DrivesIcon size={17} /> },
          { key: 'questions', label: 'Question Bank', icon: <QuestionBankIcon size={17} /> },
        ],
      },
      {
        title: 'Monitoring',
        items: [
          {
            key: 'live',
            label: 'Live Sessions',
            icon: <LiveSessionsIcon size={17} />,
            badgeCount: stats?.in_progress_count,
          },
          { key: 'sentinel', label: 'Sentinel AI', icon: <IntegrityIcon size={17} /> },
          { key: 'integrity', label: 'Integrity Logs', icon: <DeviceIcon size={17} /> },
        ],
      },
      {
        title: 'Analytics',
        items: [{ key: 'results', label: 'Results', icon: <ResultsIcon size={17} /> }],
      },
      {
        title: 'System',
        items: [
          { key: 'devtools', label: 'Developer Tools', icon: <TerminalIcon size={17} /> },
          { key: 'config', label: 'Settings', icon: <SettingsIcon size={17} /> },
          { key: 'users', label: 'Admin Users', icon: <CandidatesIcon size={17} /> },
        ],
      },
    ],
    [stats?.in_progress_count]
  );

  const flatNavItems = useMemo(
    () => navGroups.flatMap((g) => g.items.map((item) => ({ ...item, group: g.title }))),
    [navGroups]
  );

  const currentBreadcrumb = useMemo(() => {
    if (activeTab === 'review') return { group: 'Analytics', label: 'Attempt Review' };
    const found = flatNavItems.find(
      (i) => i.key === activeTab || (i.key === 'assessments' && activeTab === 'assessment')
    );
    return found ? { group: found.group, label: found.label } : { group: 'Workspace', label: 'Overview' };
  }, [activeTab, flatNavItems]);

  const adminInitials = useMemo(() => {
    const src = (adminUser?.name || adminUser?.email || 'AD').trim();
    const parts = src.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }, [adminUser]);

  if (loadingAuth) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: tokens.pageBg,
          color: tokens.textPrimary,
          fontFamily: tokens.fontFamily,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: `3px solid ${tokens.border}`,
              borderTopColor: tokens.cslBlue,
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: '14px', fontWeight: 500, color: tokens.textSecondary }}>
            Verifying Administrator Session...
          </div>
        </div>
      </div>
    );
  }

  if (!adminUser) {
    return <AdminLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const sidebarWidth = isMobileDrawerMode ? '250px' : leftSidebarCollapsed ? '68px' : '248px';
  const showLabels = isMobileDrawerMode || !leftSidebarCollapsed;

  return (
    <div
      data-csl-theme={isDark ? 'dark' : 'light'}
      style={{
        display: 'flex',
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        backgroundColor: tokens.pageBg,
        color: tokens.textPrimary,
        fontFamily: tokens.fontFamily,
      }}
    >
      {/* Mobile Sidebar Backdrop */}
      {isMobileDrawerMode && mobileMenuOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close navigation backdrop"
          data-testid="mobile-nav-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setMobileMenuOpen(false);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 23, 23, 0.6)',
            zIndex: 99,
          }}
        />
      )}

      {/* ─── 1. STITCH CHARCOAL SIDEBAR (#171717) ─────────────────────────── */}
      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          maxWidth: sidebarWidth,
          backgroundColor: tokens.sidebarBg,
          color: tokens.sidebarText,
          borderRight: `1px solid ${tokens.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          position: isMobileDrawerMode ? 'fixed' : 'relative',
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
          transform: isMobileDrawerMode && !mobileMenuOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 180ms cubic-bezier(0.2, 0, 0, 1), width 180ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        {/* Brand Header */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div
            style={{
              height: '56px',
              minHeight: '56px',
              padding: showLabels ? '0 16px' : '0 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: showLabels ? 'space-between' : 'center',
              borderBottom: `1px solid ${tokens.sidebarBorder}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: tokens.sidebarAccent,
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                  fontFamily: tokens.monoFamily,
                  flexShrink: 0,
                }}
              >
                {'</>'}
              </div>
              {showLabels && (
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: tokens.sidebarText, lineHeight: '18px' }}>
                    CSL Console
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: tokens.sidebarMuted, lineHeight: '14px' }}>
                    Assessment Platform
                  </span>
                </div>
              )}
            </div>

            {isMobileDrawerMode && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                title="Close navigation"
                aria-label="Close navigation"
                data-testid="mobile-nav-close"
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '6px',
                  border: `1px solid ${tokens.sidebarBorder}`,
                  backgroundColor: tokens.sidebarSurface,
                  color: tokens.sidebarText,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            )}

            {!isMobileDrawerMode && (
              <button
                type="button"
                onClick={toggleLeftSidebar}
                title={leftSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={leftSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: tokens.sidebarMuted,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = tokens.sidebarSurface;
                  e.currentTarget.style.color = tokens.sidebarText;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = tokens.sidebarMuted;
                }}
              >
                {leftSidebarCollapsed ? <ChevronRightIcon size={15} /> : <ChevronLeftIcon size={15} />}
              </button>
            )}
          </div>

          {/* Grouped Navigation */}
          <nav
            aria-label="Primary navigation"
            style={{
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {navGroups.map((group) => (
              <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {showLabels && (
                  <span
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: tokens.sidebarMuted,
                    }}
                  >
                    {group.title}
                  </span>
                )}
                {group.items.map((item) => {
                  const isActive =
                    activeTab === item.key ||
                    (item.key === 'assessments' && activeTab === 'assessment');

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveTab(item.key)}
                      title={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: showLabels ? 'space-between' : 'center',
                        gap: '10px',
                        width: '100%',
                        padding: showLabels ? '8px 10px' : '9px 0',
                        borderRadius: '8px',
                        fontSize: '13.5px',
                        fontWeight: isActive ? 500 : 400,
                        color: isActive ? tokens.sidebarText : tokens.sidebarMuted,
                        backgroundColor: isActive ? tokens.sidebarActive : 'transparent',
                        border: isActive ? `1px solid ${tokens.sidebarBorder}` : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'background-color 120ms ease-out, color 120ms ease-out',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = tokens.sidebarSurface;
                          e.currentTarget.style.color = tokens.sidebarText;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = tokens.sidebarMuted;
                        }
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            color: isActive ? tokens.sidebarAccent : 'currentColor',
                            flexShrink: 0,
                          }}
                        >
                          {item.icon}
                        </span>
                        {showLabels && (
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.label}
                          </span>
                        )}
                      </span>
                      {showLabels && typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            padding: '1px 6px',
                            borderRadius: '6px',
                            backgroundColor: '#052E16',
                            color: '#86EFAC',
                          }}
                        >
                          {item.badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Profile Footer */}
        <div
          style={{
            padding: '12px',
            borderTop: `1px solid ${tokens.sidebarBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: showLabels ? 'space-between' : 'center',
            gap: '8px',
          }}
        >
          {showLabels && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: tokens.sidebarSurface,
                  border: `1px solid ${tokens.sidebarBorder}`,
                  color: tokens.sidebarAccent,
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {adminInitials}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 500,
                    color: tokens.sidebarText,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {adminUser.name || 'Administrator'}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: tokens.sidebarMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {adminUser.email}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            aria-label="Sign Out"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: `1px solid ${tokens.sidebarBorder}`,
              backgroundColor: tokens.sidebarSurface,
              color: tokens.sidebarMuted,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FCA5A5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = tokens.sidebarMuted;
            }}
          >
            <LogoutIcon size={16} />
          </button>
        </div>
      </aside>

      {/* ─── 2. MAIN WORKSPACE COLUMN ───────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          backgroundColor: tokens.pageBg,
        }}
      >
        {/* Minimal Sticky Top Bar (56px) */}
        <header
          style={{
            height: '56px',
            minHeight: '56px',
            backgroundColor: tokens.surfaceCard,
            borderBottom: `1px solid ${tokens.border}`,
            padding: isCompactPadding ? '0 14px' : '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {isMobileDrawerMode && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.border}`,
                  backgroundColor: tokens.surfaceCard,
                  color: tokens.textPrimary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '16px', fontWeight: 700 }}>☰</span>
              </button>
            )}
            <nav
              aria-label="Breadcrumb"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: tokens.textSecondary,
                minWidth: 0,
              }}
            >
              {!isCompactPadding && (
                <>
                  <span>CSL Console</span>
                  <span style={{ color: tokens.textMuted }}>/</span>
                  <span>{currentBreadcrumb.group}</span>
                  <span style={{ color: tokens.textMuted }}>/</span>
                </>
              )}
              <span style={{ fontWeight: 600, color: tokens.textPrimary, whiteSpace: 'nowrap' }}>
                {currentBreadcrumb.label}
              </span>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isCompactPadding && (
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '24px',
                  width: '220px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: tokens.pageBg,
                  border: `1px solid ${tokens.border}`,
                  color: tokens.textSecondary,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SearchIcon size={14} color={tokens.textMuted} />
                  <span>Search console...</span>
                </span>
                <kbd
                  style={{
                    fontFamily: tokens.monoFamily,
                    fontSize: '11px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: tokens.surfaceCard,
                    border: `1px solid ${tokens.border}`,
                    color: tokens.textMuted,
                  }}
                >
                  Ctrl+K
                </kbd>
              </button>
            )}

            {!isMobileDrawerMode && (
              <button
                type="button"
                onClick={toggleRightPanel}
                title={rightPanelCollapsed ? 'Show Quick Actions' : 'Hide Quick Actions'}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: `1px solid ${tokens.border}`,
                  backgroundColor: tokens.surfaceCard,
                  color: tokens.textSecondary,
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {rightPanelCollapsed ? 'Activity & Tools' : 'Hide Panel'}
              </button>
            )}

            <div
              title={adminUser.email}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: tokens.surfaceElevated,
                border: `1px solid ${tokens.border}`,
                color: tokens.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {adminInitials}
            </div>

            <button
              type="button"
              data-testid="admin-theme-toggle"
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                padding: 0,
                borderRadius: '9999px',
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.surfaceCard,
                color: isDark ? '#FACC15' : tokens.cslNavy,
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: tokens.cardShadow,
              }}
            >
              {isDark ? (
                <svg
                  key="sun"
                  className="csl-theme-icon-pop"
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  key="moon"
                  className="csl-theme-icon-pop"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Workspace + Optional Right Panel */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          <main
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflowY: 'auto',
              padding: isCompactPadding ? '16px' : '28px 32px',
              boxSizing: 'border-box',
              backgroundColor: tokens.pageBg,
            }}
          >
            {activeTab === 'overview' && <AdminOverviewView onNavigateTab={(tab) => setActiveTab(tab)} />}
            {activeTab === 'colleges' && <AdminCollegesView />}
            {activeTab === 'candidates' && <AdminCandidatesView onReviewAttempt={handleOpenReview} />}

            {(activeTab === 'assessments' || activeTab === 'assessment') && (
              <AdminAssessmentsView
                initialAssessmentId={assessmentIdFromQuery || undefined}
                onNavigateToQuestions={(assessmentId) => {
                  setSearchParams({ tab: 'questions', ...(assessmentId ? { assessmentId } : {}) });
                }}
                onClearAssessmentId={() => {
                  setSearchParams({ tab: 'assessments' });
                }}
              />
            )}

            {activeTab === 'drives' && (
              <AdminDrivesView
                assessments={portalAssessments}
                colleges={portalColleges}
                onRefreshAssessments={loadPortalAssessmentsAndColleges}
                onNavigateToCreateAssessment={(driveId) => {
                  setSearchParams({ tab: 'assessments', create: 'true', ...(driveId ? { driveId } : {}) });
                }}
              />
            )}

            {activeTab === 'questions' && (
              <AdminQuestionsView initialAssessmentId={searchParams.get('assessmentId') || undefined} />
            )}

            {activeTab === 'config' && <AdminConfigView />}
            {activeTab === 'users' && <AdminUsersView />}
            {activeTab === 'devtools' && (
              <AdminDeveloperToolsView
                isAuthorizedAdmin={Boolean(
                  adminUser && (adminUser.is_staff || adminUser.is_superuser || adminUser.role === 'ADMIN')
                )}
              />
            )}
            {activeTab === 'live' && <AdminLiveAttemptsView onReviewAttempt={handleOpenReview} />}

            {activeTab === 'review' &&
              (reviewAttemptId ? (
                <AdminAttemptReviewView attemptId={reviewAttemptId} onBack={handleBackFromReview} />
              ) : (
                <div
                  style={{
                    backgroundColor: tokens.surfaceCard,
                    border: `1px solid ${tokens.border}`,
                    borderRadius: '10px',
                    padding: '48px 24px',
                    textAlign: 'center',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>No Attempt Selected</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('live')}
                    className="csl-btn-primary"
                  >
                    Go to Live Sessions
                  </button>
                </div>
              ))}

            {activeTab === 'results' && <AdminResultsView onReviewAttempt={handleOpenReview} />}

            {activeTab === 'sentinel' && (
              <AdminSentinelView assessments={portalAssessments} onReviewAttempt={handleOpenReview} />
            )}

            {activeTab === 'integrity' && <AdminIntegrityEventsView onReviewAttempt={handleOpenReview} />}
          </main>

          {/* Resize Handle */}
          {!rightPanelCollapsed && !isMobileDrawerMode && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Quick Access Panel"
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={handleDividerPointerUp}
              onPointerCancel={handleDividerPointerUp}
              title="Drag to resize panel"
              style={{
                width: '6px',
                cursor: 'col-resize',
                backgroundColor: isDraggingRight ? tokens.cslBlue : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                touchAction: 'none',
                zIndex: 25,
              }}
            />
          )}

          {/* Contextual Right Panel: Fixed Quick Actions + Independently Scrollable Recent Activity */}
          {!rightPanelCollapsed && !isMobileDrawerMode && (
            <aside
              data-testid="admin-access-panel"
              style={{
                width: `${rightPanelWidth}px`,
                minWidth: `${rightPanelWidth}px`,
                maxWidth: `${rightPanelWidth}px`,
                height: '100%',
                backgroundColor: tokens.surfaceCard,
                borderLeft: `1px solid ${tokens.border}`,
                padding: '20px 16px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                overflow: 'hidden',
              }}
            >
              {/* Quick Actions (Pinned / Fixed) */}
              <div
                data-testid="admin-quick-actions-section"
                style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}
              >
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: tokens.textPrimary }}>
                  Quick Actions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('assessments')}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${tokens.border}`,
                      backgroundColor: tokens.pageBg,
                      color: tokens.textPrimary,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <PlusIcon size={18} color={tokens.cslBlue} />
                    <span>Assessments</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${tokens.border}`,
                      backgroundColor: tokens.pageBg,
                      color: tokens.textPrimary,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <DownloadIcon size={18} color={tokens.textSecondary} />
                    <span>Export Data</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowReassessModal(true)}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${tokens.border}`,
                      backgroundColor: tokens.pageBg,
                      color: tokens.textPrimary,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <DeviceIcon size={18} color={tokens.textSecondary} />
                    <span>Reassess</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${tokens.border}`,
                      backgroundColor: tokens.pageBg,
                      color: tokens.textPrimary,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <HomeIcon size={18} color={tokens.textSecondary} />
                    <span>Overview</span>
                  </button>
                </div>
              </div>

              {/* Previous Activities (Independently Scrollable) */}
              <div
                style={{
                  borderTop: `1px solid ${tokens.border}`,
                  paddingTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: tokens.textPrimary }}>
                    Recent Activity
                  </span>
                  {stats?.recent_activities?.length ? (
                    <StatusBadge status={`${stats.recent_activities.length}`} variant="neutral" size="sm" />
                  ) : null}
                </div>

                {stats?.recent_activities && stats.recent_activities.length > 0 ? (
                  <div
                    data-testid="admin-recent-activity-list"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      flex: 1,
                      minHeight: 0,
                      overflowY: 'auto',
                      paddingRight: '4px',
                    }}
                  >
                    {stats.recent_activities.map((act) => (
                      <div
                        key={act.id}
                        style={{
                          backgroundColor: tokens.pageBg,
                          border: `1px solid ${tokens.border}`,
                          borderRadius: '8px',
                          padding: '10px',
                          fontSize: '12px',
                          color: tokens.textPrimary,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {act.action_display || act.action}
                          </span>
                          {act.can_undo && (
                            <button
                              type="button"
                              onClick={() => handleOpenUndoConfirm(act)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                backgroundColor: tokens.cslBlue,
                                color: tokens.onPrimary,
                                border: 'none',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                              title="Revert / Undo action"
                            >
                              <UndoIcon size={10} color={tokens.onPrimary} /> Undo
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: tokens.textMuted, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{act.performed_by_name || 'Admin'}</span>
                          <span className="csl-tabular">
                            {act.created_at ? new Date(act.created_at).toLocaleTimeString() : 'Just now'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '14px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${tokens.border}`,
                      backgroundColor: tokens.pageBg,
                      fontSize: '12px',
                      color: tokens.textMuted,
                    }}
                  >
                    No recent audit events recorded yet.
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Ctrl+K Command Palette Modal */}
      <AccessibleModal
        isOpen={commandOpen}
        onClose={() => {
          setCommandOpen(false);
          setCommandQuery('');
        }}
        title="Console Command Search"
        description="Jump quickly to any workspace module or toggle appearance."
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="text"
            value={commandQuery}
            onChange={(e) => setCommandQuery(e.target.value)}
            placeholder="Filter navigation or actions..."
            autoFocus
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '8px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.inputBg,
              color: tokens.textPrimary,
              fontSize: '13.5px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
            {flatNavItems
              .filter(
                (item) =>
                  !commandQuery.trim() ||
                  item.label.toLowerCase().includes(commandQuery.trim().toLowerCase()) ||
                  item.group.toLowerCase().includes(commandQuery.trim().toLowerCase())
              )
              .map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setCommandOpen(false);
                    setCommandQuery('');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: activeTab === item.key ? tokens.surfaceElevated : 'transparent',
                    color: tokens.textPrimary,
                    fontSize: '13.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = tokens.surfaceElevated;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      activeTab === item.key ? tokens.surfaceElevated : 'transparent';
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  <span style={{ fontSize: '11.5px', color: tokens.textMuted }}>{item.group}</span>
                </button>
              ))}
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                setCommandOpen(false);
                setCommandQuery('');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                borderTop: `1px solid ${tokens.border}`,
                marginTop: '4px',
                backgroundColor: 'transparent',
                color: tokens.cslBlue,
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>Toggle Dark / Light Theme</span>
              <span style={{ fontSize: '11.5px', color: tokens.textMuted }}>
                Currently {isDark ? 'Dark' : 'Light'}
              </span>
            </button>
          </div>
        </div>
      </AccessibleModal>

      {/* Undo Toast */}
      {undoToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: tokens.cslCharcoal,
            color: tokens.sidebarText,
            border: `1px solid ${tokens.sidebarBorder}`,
            padding: '12px 18px',
            borderRadius: '10px',
            boxShadow: tokens.modalShadow,
            zIndex: 10000,
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          {undoToast}
        </div>
      )}

      {/* Quick Action Modals */}
      <ReassessStudentAccessModal
        isOpen={showReassessModal}
        onClose={() => setShowReassessModal(false)}
        onSuccess={loadStatsData}
        assessments={portalAssessments}
      />
      <ExportStudentDataModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} />
      <ImportQuestionsCSVModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadStatsData}
      />

      {/* Undo Rollback Confirmation Modal */}
      <AccessibleModal
        isOpen={!!pendingUndoAct}
        onClose={() => setPendingUndoAct(null)}
        title="Confirm Operation Rollback"
        description="Controlled undo will revert this administrative action and record a compensating audit log entry."
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: tokens.warningBg,
              borderRadius: '8px',
              border: `1px solid ${tokens.warningBorder}`,
              color: tokens.warningText,
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            <strong>Action to Revert:</strong> {pendingUndoAct?.action_display || 'Administrative operation'}
            <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
              Are you sure you want to rollback this change? This action will restore the previous record state atomically.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setPendingUndoAct(null)}
              className="csl-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={undoing}
              onClick={handleConfirmUndo}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: tokens.danger,
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: undoing ? 'not-allowed' : 'pointer',
              }}
            >
              {undoing ? 'Reverting...' : 'Confirm Rollback'}
            </button>
          </div>
        </div>
      </AccessibleModal>
    </div>
  );
}
