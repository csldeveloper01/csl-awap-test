import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';

interface StudentLayoutProps {
  onLogout: () => void;
}

const NAV_ITEMS = [
  { to: '/student', label: 'Dashboard', end: true },
  { to: '/student/skills', label: 'Skills', end: false },
  { to: '/student/activities', label: 'Activities', end: false },
  { to: '/student/performance', label: 'Performance', end: false },
  { to: '/student/leaderboard', label: 'Leaderboard', end: false },
  { to: '/student/profile', label: 'Profile', end: false },
];

/**
 * Authenticated Student application shell: simple top bar with the student
 * navigation and a main content area. Intentionally plain — no design work.
 */
export function StudentLayout({ onLogout }: StudentLayoutProps) {
  const navigate = useNavigate();

  // Uses the existing logout mechanism (POST /api/auth/logout/), then clears
  // client auth state and returns the user to /login.
  const handleLogout = async () => {
    try {
      await api.post('/logout/');
    } catch {
      // ignore — still clear local state and go to login
    } finally {
      onLogout();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--csl-bg-canvas)', color: 'var(--csl-text-primary)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backgroundColor: '#171717',
          borderBottom: '1px solid #2A2A2A',
          padding: '0 24px',
          height: '58px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              backgroundColor: '#1455D9',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            CSL
          </span>
          <strong style={{ color: '#FFFFFF', fontSize: '14px', letterSpacing: '-0.01em' }}>
            Student Portal
          </strong>
        </div>

        <nav style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                color: isActive ? '#FFFFFF' : '#A3A3A3',
                backgroundColor: isActive ? '#262626' : 'transparent',
                borderBottom: isActive ? '2px solid #3B82F6' : '2px solid transparent',
                transition: 'all 0.15s ease',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            marginLeft: 'auto',
            padding: '6px 14px',
            borderRadius: '8px',
            backgroundColor: '#262626',
            border: '1px solid #3F3F46',
            color: '#E5E7EB',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </header>
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 24px' }}>
        <Outlet />
      </main>
    </div>
  );
}
