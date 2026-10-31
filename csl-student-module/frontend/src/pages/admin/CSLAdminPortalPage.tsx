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

const MIN_DESKTOP_WIDTH = 1024;
const MIN_DESKTOP_HEIGHT = 650;
const CSL_ADMIN_TAB_AUTH_KEY = 'csl_admin_tab_authenticated';

export function CSLAdminPortalPage() {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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
      </div>
    );
  }

  if (!adminUser) {
    return <AdminLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const navItems = [
    { key: 'overview', label: 'Overview' },
    { key: 'colleges', label: 'Colleges' },
    { key: 'candidates', label: 'Candidates' },
    { key: 'assessments', label: 'Assessments' },
    { key: 'questions', label: 'Question Bank' },
    { key: 'results', label: 'Results' },
    { key: 'integrity', label: 'Integrity' },
    { key: 'live', label: 'Live Sessions' },
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
      {/* ─── 1. DEEP BLUE LEFT SIDEBAR (Mockup 1-5) ───────────────────── */}
      <aside
        style={{
          width: '210px',
          minWidth: '210px',
          maxWidth: '210px',
          backgroundColor: '#0D52D6',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '20px 14px 20px 18px',
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 30,
        }}
      >
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

            <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>
              Admin
            </div>
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
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 14px',
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
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Circular Controls: Settings Gear & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingLeft: '4px' }}>
          <button
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          <button
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
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

          {/* Right Circular Icons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

          {/* ─── 3. RIGHT SIDEBAR (Quick Actions & Previous Activities) ─── */}
          <aside
            style={{
              width: '240px',
              minWidth: '240px',
              maxWidth: '240px',
              backgroundColor: '#F8F9FA',
              borderLeft: '1px solid #E2E8F0',
              padding: '24px 18px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              overflowY: 'auto',
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
                {/* 1. Add / Create */}
                <button
                  onClick={() => setActiveTab('assessments')}
                  title="Create / Manage Assessments"
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
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>

                {/* 2. Download / Export */}
                <button
                  onClick={() => setActiveTab('colleges')}
                  title="Export Data / Directory"
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
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </button>

                {/* 3. Live Proctoring Monitor */}
                <button
                  onClick={() => setActiveTab('live')}
                  title="Live Assessment Telemetry"
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
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                  </svg>
                </button>

                {/* 4. Home / Overview */}
                <button
                  onClick={() => setActiveTab('overview')}
                  title="Dashboard Overview"
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
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
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
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {act.action}
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
        </div>
      </div>
    </div>
  );
}
