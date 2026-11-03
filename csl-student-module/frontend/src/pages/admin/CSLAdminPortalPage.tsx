import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { getAdminMe, getAdminStats, type AdminUser, type AdminStats } from '../../api/admin';
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
import { AdminUsersView } from './AdminUsersView';
import { AdminDrivesView } from './AdminDrivesView';
import { undoAdminAuditAction } from '../../api/admin';
import { AccessibleModal } from '../../components/admin/AccessibleModal';
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
} from '../../components/common/Icons';
import {
  ReassessStudentAccessModal,
  ExportStudentDataModal,
  ImportQuestionsCSVModal,
} from '../../components/admin/QuickActionsModals';

const MIN_DESKTOP_WIDTH = 1024;
const MIN_DESKTOP_HEIGHT = 650;
const CSL_ADMIN_TAB_AUTH_KEY = 'csl_admin_tab_authenticated';

export function CSLAdminPortalPage() {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Collapsible Sidebars state (Persisted in localStorage)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('csl_admin_sidebar_collapsed') === 'true';
  });
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('csl_admin_right_collapsed') === 'true';
  });
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('csl_admin_right_width');
    const num = saved ? parseInt(saved, 10) : 270;
    return !isNaN(num) && num >= 220 && num <= 420 ? num : 270;
  });
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const handleDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDividerPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRight) return;
    const newWidth = Math.max(220, Math.min(420, window.innerWidth - e.clientX));
    setRightPanelWidth(newWidth);
    localStorage.setItem('csl_admin_right_width', String(newWidth));
  };

  const handleDividerPointerUp = (e: React.PointerEvent) => {
    if (isDraggingRight) {
      setIsDraggingRight(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
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

  // Quick Action Modal states
  const [showReassessModal, setShowReassessModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [undoToast, setUndoToast] = useState<string | null>(null);

  // Undo Confirmation Dialog state
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

  // Viewport dimensions
  const [viewportDimensions, setViewportDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const handleResize = () => {
      setViewportDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDesktopEligible =
    viewportDimensions.width >= MIN_DESKTOP_WIDTH &&
    viewportDimensions.height >= MIN_DESKTOP_HEIGHT;

  const activeTab = searchParams.get('tab') || 'overview';
  const reviewAttemptId = searchParams.get('attemptId');
  const assessmentIdFromQuery = searchParams.get('assessmentId');
  const fromTab = searchParams.get('fromTab') || 'live';

  // Load telemetry stats on mount and interval
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

  if (loadingAuth) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: '#0D52D6',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', color: '#FFFFFF', fontWeight: 700 }}>
          <div style={{ fontSize: '15px' }}>Verifying Administrator Session...</div>
        </div>
        {/* Undo Action Confirmation Modal */}
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
              backgroundColor: '#FEF3C7',
              borderRadius: '12px',
              border: '1px solid #FDE68A',
              color: '#92400E',
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
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={undoing}
              onClick={handleConfirmUndo}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
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

  if (!isDesktopEligible) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#FCFAF5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '36px 32px',
            textAlign: 'center',
            boxShadow: '0 20px 40px -12px rgba(11, 46, 111, 0.1)',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 12px 0' }}>
            Desktop Display Required
          </h2>
          <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6, margin: '0 0 16px 0' }}>
            The CSL Admin Portal is designed for PC and desktop workstations (minimum {MIN_DESKTOP_WIDTH} × {MIN_DESKTOP_HEIGHT} px).
          </p>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626' }}>
            Current resolution: {viewportDimensions.width} × {viewportDimensions.height} px
          </div>
        </div>
        {/* Undo Action Confirmation Modal */}
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
              backgroundColor: '#FEF3C7',
              borderRadius: '12px',
              border: '1px solid #FDE68A',
              color: '#92400E',
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
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={undoing}
              onClick={handleConfirmUndo}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
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

  if (!adminUser) {
    return <AdminLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const navItems = [
    { key: 'overview', label: 'Overview', icon: <OverviewIcon size={18} /> },
    { key: 'colleges', label: 'Colleges', icon: <CollegesIcon size={18} /> },
    { key: 'candidates', label: 'Candidates', icon: <CandidatesIcon size={18} /> },
    { key: 'assessments', label: 'Assessments', icon: <AssessmentsIcon size={18} /> },
    { key: 'drives', label: 'Drives', icon: <DrivesIcon size={18} /> },
    { key: 'questions', label: 'Question Bank', icon: <QuestionBankIcon size={18} /> },
    { key: 'results', label: 'Results', icon: <ResultsIcon size={18} /> },
    { key: 'integrity', label: 'Integrity', icon: <IntegrityIcon size={18} /> },
    { key: 'live', label: 'Live Sessions', icon: <LiveSessionsIcon size={18} /> },
  ];

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        backgroundColor: '#F8F9FA',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ─── 1. DEEP BLUE LEFT SIDEBAR (Mockup 1-5, Collapsible) ───────────────────── */}
      <aside
        style={{
          width: leftSidebarCollapsed ? '76px' : '210px',
          minWidth: leftSidebarCollapsed ? '76px' : '210px',
          maxWidth: leftSidebarCollapsed ? '76px' : '210px',
          backgroundColor: '#0D52D6',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: leftSidebarCollapsed ? '20px 8px' : '20px 14px 20px 18px',
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 30,
          transition: 'width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease, padding 0.2s ease',
        }}
      >
        {/* Floating Center Collapse Button */}
        <button
          type="button"
          onClick={toggleLeftSidebar}
          title={leftSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={leftSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          style={{
            position: 'absolute',
            top: '50%',
            right: '-14px',
            transform: 'translateY(-50%)',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: '#072C77',
            color: '#FFFFFF',
            border: '2px solid #FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 50,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0052CC')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#072C77')}
        >
          {leftSidebarCollapsed ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}
        </button>
        <div>
          {/* Top Admin Active Session Card */}
          <div
            style={{
              backgroundColor: '#072C77',
              borderRadius: '22px',
              padding: '16px 14px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              marginBottom: '26px',
              position: 'relative',
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.15)',
            }}
          >
            {/* Green glowing status dot */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                backgroundColor: '#22C55E',
                boxShadow: '0 0 8px #22C55E',
              }}
            />

            <div style={{ fontSize: leftSidebarCollapsed ? '14px' : '18px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2, textAlign: leftSidebarCollapsed ? 'center' : 'left' }}>
              {leftSidebarCollapsed ? '👤' : 'Admin'}
            </div>
            {!leftSidebarCollapsed && (
              <>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.65)',
                    margin: '2px 0 14px 0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {adminUser.email || 'admin@email.com'}
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '4px 10px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.85)',
                    textAlign: 'center',
                    letterSpacing: '0.02em',
                  }}
                >
                  Session Active
                </div>
              </>
            )}
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {navItems.map((item) => {
              const isActive =
                activeTab === item.key ||
                (item.key === 'assessments' && activeTab === 'assessment');

              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  title={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    justifyContent: leftSidebarCollapsed ? 'center' : 'flex-start',
                    textAlign: leftSidebarCollapsed ? 'center' : 'left',
                    padding: leftSidebarCollapsed ? '10px 0' : '9px 14px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: isActive ? 800 : 600,
                    color: '#FFFFFF',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.1)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
                  {!leftSidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Circular Controls: Settings Gear & Logout */}
        <div style={{ display: 'flex', flexDirection: leftSidebarCollapsed ? 'column' : 'row', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            title="System Configuration"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#CBD5E1',
              color: '#0F172A',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >
            <SettingsIcon size={20} />
          </button>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#CBD5E1',
              color: '#0F172A',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >
            <LogoutIcon size={20} />
          </button>
        </div>
      </aside>

      {/* ─── 2. MAIN WORKSPACE CONTAINER (TOPBAR + CONTENT + RIGHT PANEL) ─ */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          backgroundColor: '#FAF9F5',
        }}
      >
        {/* Top Gold / Amber Bar (Mockups 1-5) */}
        <header
          style={{
            height: '42px',
            minHeight: '42px',
            backgroundColor: '#C59A27',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          {/* Breadcrumb e.g. admin/overview */}
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', letterSpacing: '-0.01em' }}>
            admin/{activeTab === 'review' ? 'review' : activeTab}
          </div>

          {/* Right Circular Icons & Right Panel Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={toggleRightPanel}
              title={rightPanelCollapsed ? 'Show Quick Actions' : 'Hide Quick Actions'}
              style={{
                backgroundColor: 'rgba(0,0,0,0.12)',
                border: 'none',
                borderRadius: '12px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#1E293B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {rightPanelCollapsed ? '‹ Quick Actions' : 'Quick Actions ›'}
            </button>
            <div
              title="User Directory"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1E293B',
                cursor: 'pointer',
              }}
              onClick={() => setActiveTab('users')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
              </svg>
            </div>

            <div
              title="Toggle Dark Mode"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1E293B',
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            </div>
          </div>
        </header>

        {/* Body Row: Center Main Content + Right Sidebar */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Scrollable Center Content */}
          <main
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflowY: 'auto',
              padding: '28px 32px',
              boxSizing: 'border-box',
              background: 'radial-gradient(ellipse at 50% 0%, rgba(245, 230, 190, 0.35) 0%, rgba(250, 249, 245, 0) 65%)',
            }}
          >
            {activeTab === 'overview' && (
              <AdminOverviewView onNavigateTab={(tab) => setActiveTab(tab)} />
            )}

            {activeTab === 'colleges' && <AdminCollegesView />}

            {activeTab === 'candidates' && (
              <AdminCandidatesView onReviewAttempt={handleOpenReview} />
            )}

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

            {activeTab === 'drives' && <AdminDrivesView />}

            {activeTab === 'questions' && (
              <AdminQuestionsView initialAssessmentId={searchParams.get('assessmentId') || undefined} />
            )}

            {activeTab === 'config' && <AdminConfigView />}

            {activeTab === 'users' && <AdminUsersView />}

            {activeTab === 'live' && (
              <AdminLiveAttemptsView onReviewAttempt={handleOpenReview} />
            )}

            {activeTab === 'review' && (
              reviewAttemptId ? (
                <AdminAttemptReviewView
                  attemptId={reviewAttemptId}
                  onBack={handleBackFromReview}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '60px' }}>
                  <h3>No Attempt Selected</h3>
                  <button
                    onClick={() => setActiveTab('live')}
                    style={{
                      padding: '8px 18px',
                      backgroundColor: '#0D52D6',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    Go to Live Sessions
                  </button>
                </div>
              )
            )}

            {activeTab === 'results' && (
              <AdminResultsView onReviewAttempt={handleOpenReview} />
            )}

            {activeTab === 'integrity' && (
              <AdminIntegrityEventsView onReviewAttempt={handleOpenReview} />
            )}
          </main>

          {/* Draggable Resize Divider */}
          {!rightPanelCollapsed && (
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
                width: '8px',
                cursor: 'col-resize',
                backgroundColor: isDraggingRight ? '#0052CC' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                touchAction: 'none',
                zIndex: 25,
                transition: 'background-color 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '3px',
                  height: '32px',
                  borderRadius: '2px',
                  backgroundColor: isDraggingRight ? '#FFFFFF' : '#CBD5E1',
                }}
              />
            </div>
          )}

          {/* 3. RIGHT SIDEBAR (Quick Actions & Previous Activities, Collapsible & Resizable) */}
          {!rightPanelCollapsed && (
            <aside
              style={{
                width: `${rightPanelWidth}px`,
                minWidth: `${rightPanelWidth}px`,
                maxWidth: `${rightPanelWidth}px`,
                backgroundColor: '#F8F9FA',
                borderLeft: '1px solid #E2E8F0',
                padding: '24px 18px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                overflowY: 'auto',
                transition: isDraggingRight ? 'none' : 'width 0.2s ease',
              }}
            >
              {/* Quick Actions Container (Mockups 1-5) */}
              <div
                style={{
                  backgroundColor: '#DDE2EB',
                  borderRadius: '24px',
                  padding: '20px 16px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#0F172A',
                    marginBottom: '16px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Quick Actions
                </div>

                {/* 2x2 Button Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px',
                  }}
                >
                  {/* 1. Add / Create Assessment */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('assessments')}
                    title="Create New Assessment"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1.5px solid #C7D0DE',
                      borderRadius: '16px',
                      height: '68px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'transform 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <PlusIcon size={28} color="#0F172A" />
                  </button>

                  {/* 2. Download / Export Student CSV */}
                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    title="Export Student Data CSV"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1.5px solid #C7D0DE',
                      borderRadius: '16px',
                      height: '68px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'transform 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <DownloadIcon size={26} color="#0F172A" />
                  </button>

                  {/* 3. Reassess Student Access / Device Monitoring */}
                  <button
                    type="button"
                    onClick={() => setShowReassessModal(true)}
                    title="Reassess Student Access"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1.5px solid #C7D0DE',
                      borderRadius: '16px',
                      height: '68px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'transform 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <DeviceIcon size={26} color="#0F172A" />
                  </button>

                  {/* 4. Home / Overview */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    title="Return to Overview Dashboard"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1.5px solid #C7D0DE',
                      borderRadius: '16px',
                      height: '68px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'transform 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <HomeIcon size={26} color="#0F172A" />
                  </button>
                </div>
              </div>

              {/* Previous Activities Container (Mockups 1-5) */}
              <div>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#0F172A',
                    marginBottom: '14px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Previous Activities
                </div>

                {stats?.recent_activities && stats.recent_activities.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {stats.recent_activities.map((act) => (
                      <div
                        key={act.id}
                        style={{
                          backgroundColor: '#CBD5E1',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          fontSize: '11px',
                          color: '#1E293B',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: act.can_undo ? '120px' : '100%' }}>
                            {act.action_display || act.action}
                          </span>
                          {act.can_undo && (
                            <button
                              type="button"
                              onClick={() => handleOpenUndoConfirm(act)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                backgroundColor: '#0052CC',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Revert / Undo action"
                            >
                              <UndoIcon size={11} color="#FFFFFF" /> Undo
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{act.performed_by_name || 'Admin'}</span>
                          <span>{act.created_at ? new Date(act.created_at).toLocaleTimeString() : 'Just now'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Grey Placeholder Bars Matching Mockup */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                      <div
                        key={i}
                        style={{
                          height: '14px',
                          backgroundColor: '#CBD5E1',
                          borderRadius: '4px',
                          opacity: 0.8,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Undo Toast Alert */}
      {undoToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            zIndex: 10000,
            fontSize: '13px',
            fontWeight: 600,
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
      />
      <ExportStudentDataModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
      <ImportQuestionsCSVModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadStatsData}
      />
      {/* Undo Action Confirmation Modal */}
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
              backgroundColor: '#FEF3C7',
              borderRadius: '12px',
              border: '1px solid #FDE68A',
              color: '#92400E',
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
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={undoing}
              onClick={handleConfirmUndo}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
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