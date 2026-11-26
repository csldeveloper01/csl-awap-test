import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from './api';
import axios from 'axios';

interface LoginProps {
  onLoginSuccess: (user: { email: string; name: string }) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/login/', { email, password });
      onLoginSuccess(res.data.user);
      // Students go to their section; other roles keep the existing welcome page.
      navigate(res.data.user?.role === 'STUDENT' ? '/student' : '/welcome');
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data;
        if (data.error === 'pending') {
          navigate('/pending');
          return;
        }
        if (data.error === 'rejected') {
          navigate('/rejected');
          return;
        }
        if (data.error) {
          setError(data.error);
        } else if (data.message) {
          setError(data.message);
        } else {
          setError('Invalid email or password.');
        }
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
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
      <div className="csl-card" style={{ width: '100%', maxWidth: '420px', padding: '32px', textAlign: 'left' }}>
        <div style={{ marginBottom: '20px' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: '11px',
              fontWeight: 700,
              color: '#1455D9',
              backgroundColor: 'rgba(20, 85, 217, 0.1)',
              padding: '3px 8px',
              borderRadius: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '8px',
            }}
          >
            Creator Space Lab
          </span>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--csl-text-primary)', letterSpacing: '-0.02em' }}>
            Sign in to CSL Portal
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--csl-text-muted)' }}>
            Enter your account credentials to continue.
          </p>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label htmlFor="email" style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--csl-text-secondary)', marginBottom: '6px' }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--csl-border)',
                backgroundColor: 'var(--csl-bg-card)',
                color: 'var(--csl-text-primary)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label htmlFor="password" style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--csl-text-secondary)', marginBottom: '6px' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--csl-border)',
                backgroundColor: 'var(--csl-bg-card)',
                color: 'var(--csl-text-primary)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="csl-btn-primary"
            style={{ width: '100%', padding: '10px 16px', marginTop: '4px', fontSize: '14px' }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p style={{ marginTop: '18px', marginBottom: 0, fontSize: '13px', color: 'var(--csl-text-muted)', textAlign: 'center' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#1455D9', fontWeight: 600, textDecoration: 'none' }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
