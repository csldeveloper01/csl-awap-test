import { useNavigate } from 'react-router-dom';
import { api } from './api';

interface WelcomeProps {
  user: {
    email: string;
    name: string;
  } | null;
  onLogout: () => void;
}

export function Welcome({ user, onLogout }: WelcomeProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/logout/');
    } catch {
      // ignore
    } finally {
      onLogout();
      navigate('/login');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--csl-bg-canvas)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div className="csl-card" style={{ width: '100%', maxWidth: '520px', padding: '36px 32px', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 700, color: 'var(--csl-text-primary)', letterSpacing: '-0.02em' }}>
          Welcome to CSL
        </h1>
        {user && (
          <div style={{ margin: '18px 0 24px', padding: '14px 18px', borderRadius: '10px', backgroundColor: 'var(--csl-bg-elevated)', border: '1px solid var(--csl-border)', fontSize: '13.5px', textAlign: 'left' }}>
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: 'var(--csl-text-muted)' }}>Name:</span>{' '}
              <strong style={{ color: 'var(--csl-text-primary)' }}>{user.name || '(not set)'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--csl-text-muted)' }}>Email:</span>{' '}
              <strong style={{ color: 'var(--csl-text-primary)' }}>{user.email}</strong>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href={import.meta.env.VITE_API_BASE_URL ? `${import.meta.env.VITE_API_BASE_URL}/admin/` : "/admin/"}
            target="_blank"
            rel="noreferrer"
            className="csl-btn-primary"
            style={{ backgroundColor: '#0F766E', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Open Django Admin Portal &rarr;
          </a>
          <button
            onClick={() => navigate('/staff/activities')}
            className="csl-btn-primary"
          >
            Manage Activities
          </button>
          <button onClick={handleLogout} className="csl-btn-secondary">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
