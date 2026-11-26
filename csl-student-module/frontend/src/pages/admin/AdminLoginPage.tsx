import { useState, useEffect, type FormEvent } from 'react';
import cslTypographyLogo from '../../assets/CSL-TYPOGRAPHY.png';
import { api } from '../../api';
import { getAdminMe, type AdminUser } from '../../api/admin';
import { useAdminTheme } from '../../utils/adminTheme';
import { StatusBadge } from '../../components/ui';

interface AdminLoginPageProps {
  onLoginSuccess: (admin: AdminUser) => void;
}

export function AdminLoginPage({ onLoginSuccess }: AdminLoginPageProps) {
  const { isDark, toggleTheme, tokens } = useAdminTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      sessionStorage.removeItem('csl_admin_tab_authenticated');
      sessionStorage.removeItem('csl_session_key');
      localStorage.removeItem('csl_session_key');
    } catch {
      // ignore
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/login/', {
        email: email.trim(),
        password,
      });

      if (res.data?.session_key) {
        try {
          sessionStorage.setItem('csl_session_key', res.data.session_key);
          localStorage.setItem('csl_session_key', res.data.session_key);
        } catch {
          // ignore
        }
      }

      const adminInfo = await getAdminMe();
      if (!adminInfo.is_staff && !adminInfo.is_superuser && adminInfo.role !== 'ADMIN') {
        await api.post('/logout/');
        try {
          sessionStorage.removeItem('csl_session_key');
          localStorage.removeItem('csl_session_key');
        } catch {
          // ignore
        }
        setError('Access denied: Your account does not have administrator privileges.');
        return;
      }

      onLoginSuccess(adminInfo);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axErr = err as { response?: { status?: number; data?: { error?: string; detail?: string } } };
        if (axErr.response?.status === 401) {
          setError('Invalid administrator email or password.');
        } else if (axErr.response?.status === 403) {
          setError(axErr.response?.data?.detail || 'Administrator access forbidden for this account.');
        } else {
          setError(axErr.response?.data?.error || axErr.response?.data?.detail || 'Login failed. Please verify credentials.');
        }
      } else {
        setError('Network error connecting to authentication server.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: tokens.pageBg,
        color: tokens.textPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: tokens.fontFamily,
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          backgroundColor: tokens.surfaceCard,
          borderRadius: '12px',
          border: `1px solid ${tokens.border}`,
          boxShadow: tokens.modalShadow,
          padding: '32px',
          boxSizing: 'border-box',
        }}
      >
        {/* Theme Toggle + Brand Header */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <button
            type="button"
            data-testid="admin-login-theme-toggle"
            onClick={toggleTheme}
            className="csl-btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <img
            src={cslTypographyLogo}
            alt="CSL Creator Space Lab"
            style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
          />
          <StatusBadge label="Administrator Control Center" variant="info" />
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 600,
              color: tokens.textPrimary,
              margin: 0,
              letterSpacing: '-0.015em',
            }}
          >
            CSL Admin Login
          </h1>
          <p style={{ fontSize: '13.5px', color: tokens.textSecondary, margin: 0, lineHeight: '19px' }}>
            Sign in with authorized administrator credentials to manage assessments, drives, and candidates.
          </p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: tokens.dangerBg,
              border: `1px solid ${tokens.dangerBorder}`,
              color: tokens.dangerText,
              padding: '11px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: 1.5,
              marginBottom: '18px',
            }}
          >
            <strong>Access Notice:</strong> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="admin_email"
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: tokens.textSecondary, marginBottom: '6px' }}
            >
              Administrator Email
            </label>
            <input
              id="admin_email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${tokens.border}`,
                backgroundColor: tokens.inputBg,
                color: tokens.textPrimary,
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="admin_password"
              style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: tokens.textSecondary, marginBottom: '6px' }}
            >
              Password
            </label>
            <input
              id="admin_password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${tokens.border}`,
                backgroundColor: tokens.inputBg,
                color: tokens.textPrimary,
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="csl-btn-primary"
            style={{ width: '100%', padding: '11px 18px', fontSize: '14px', marginTop: '4px' }}
          >
            {loading ? 'Authenticating Admin Session...' : 'Sign In to CSL Console'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', borderTop: `1px solid ${tokens.border}`, paddingTop: '14px' }}>
          <p style={{ fontSize: '12px', color: tokens.textMuted, margin: 0 }}>
            Restricted access. All administrative activity is audited.
          </p>
        </div>
      </div>
    </div>
  );
}
