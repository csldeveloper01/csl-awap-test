import { Link } from 'react-router-dom';

export function Rejected() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--csl-bg-canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="csl-card" style={{ maxWidth: '460px', width: '100%', padding: '36px 32px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 700, color: 'var(--csl-text-primary)' }}>
          Request Declined
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#DC2626', lineHeight: 1.5 }}>
          Your registration request has been declined.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link to="/login" className="csl-btn-secondary" style={{ textDecoration: 'none' }}>Back to Login</Link>
          <Link to="/register" className="csl-btn-primary" style={{ textDecoration: 'none' }}>Register Again</Link>
        </div>
      </div>
    </div>
  );
}
