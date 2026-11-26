import React, { useState, useEffect } from 'react';
import { useAdminTheme } from '../../utils/adminTheme';
import { PageContainer, SectionHeader, StatusBadge, EmptyState } from '../../components/ui';
import {
  getAdminUsers,
  createAdminUser,
  toggleAdminUserStatus,
  deleteAdminUser,
  type AdminStaffUser,
} from '../../api/admin';

export function AdminUsersView() {
  const { tokens } = useAdminTheme();
  const [users, setUsers] = useState<AdminStaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    is_superuser: true,
  });
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('Failed to fetch administrator accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user: AdminStaffUser) => {
    const action = user.is_active ? 'deactivate' : 'activate';
    const confirmed = window.confirm(
      `Are you sure you want to ${action} user "${user.name || user.username}" (${user.email})?`
    );
    if (!confirmed) return;

    try {
      const res = await toggleAdminUserStatus(user.id);
      alert(res.message);
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to toggle user status.';
      alert(`Action Blocked: ${msg}`);
    }
  };

  const handleDeleteUser = async (user: AdminStaffUser) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete administrator account "${user.name || user.username}" (${user.email})?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await deleteAdminUser(user.id);
      alert(res.message);
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to delete user account.';
      alert(`Deletion Denied: ${msg}`);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
    if (!createForm.email.trim()) {
      setCreateError('Email is required.');
      return;
    }
    if (!createForm.password.trim() || createForm.password.length < 8) {
      setCreateError('Password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createAdminUser({
        email: createForm.email.trim(),
        password: createForm.password.trim(),
        name: createForm.name.trim() || undefined,
        is_superuser: createForm.is_superuser,
      });
      setCreateSuccess(res.message);
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', password: '', is_superuser: true });
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to create administrator account.';
      setCreateError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Administrator & Staff Accounts"
        description="Manage privileged user credentials, superusers, and institutional administrator accounts."
        actions={
          <button
            onClick={() => {
              setCreateError('');
              setCreateSuccess('');
              setShowCreateModal(true);
            }}
            className="csl-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add New Superuser
          </button>
        }
      />

      {createSuccess && (
        <div style={{ padding: '12px 16px', backgroundColor: tokens.successBg, border: `1px solid ${tokens.successBorder}`, color: tokens.successText, borderRadius: '8px', fontSize: '13px', fontWeight: 500 }}>
          ✓ {createSuccess}
        </div>
      )}

      {/* ─── USERS TABLE ────────────────────────────────────────────── */}
      <div className="csl-card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted, fontWeight: 500 }}>
            Loading administrators...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '24px' }}>
            <EmptyState title="No staff accounts found" description="Create an administrator account to grant portal access." />
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ backgroundColor: tokens.surfaceElevated, borderBottom: `1px solid ${tokens.border}`, color: tokens.textMuted }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>User / Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Login Email</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Role</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Superuser</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Date Created</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${tokens.borderLight}` }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: tokens.textPrimary }}>{u.name || u.username}</div>
                    <div style={{ fontSize: '12px', color: tokens.textMuted, fontFamily: tokens.monoFamily }}>@{u.username}</div>
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: tokens.cslBlueSoftText }}>
                    {u.email}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusBadge label={u.role} variant="info" size="sm" dot={false} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusBadge label={u.is_superuser ? 'Superuser' : 'Staff'} variant={u.is_superuser ? 'success' : 'neutral'} size="sm" dot={false} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusBadge status={u.is_active ? 'ACTIVE' : 'INACTIVE'} label={u.is_active ? 'Active' : 'Inactive'} size="sm" />
                  </td>
                  <td className="csl-tabular" style={{ padding: '14px 16px', textAlign: 'center', color: tokens.textMuted, fontSize: '13px' }}>
                    {u.date_joined ? new Date(u.date_joined).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: u.is_active ? tokens.warningBg : tokens.successBg,
                          color: u.is_active ? tokens.warningText : tokens.successText,
                          border: `1px solid ${u.is_active ? tokens.warningBorder : tokens.successBorder}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title={u.is_active ? 'Deactivate user' : 'Activate user'}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: tokens.dangerBg,
                          color: tokens.dangerText,
                          border: `1px solid ${tokens.dangerBorder}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="Permanently delete user"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── CREATE SUPERUSER MODAL ─────────────────────────────────── */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: tokens.surfaceCard,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.border}`,
              borderRadius: '12px',
              padding: '24px 28px',
              width: '460px',
              maxWidth: '92vw',
              boxShadow: tokens.modalShadow,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                Create Administrator Account
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="csl-btn-secondary"
                style={{ width: '30px', height: '30px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div style={{ padding: '10px 14px', backgroundColor: tokens.dangerBg, border: `1px solid ${tokens.dangerBorder}`, color: tokens.dangerText, borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lead Administrator"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${tokens.border}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Login Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. admin@csl.edu"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${tokens.border}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '6px' }}>
                  Password * (Min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  placeholder="Secure administrator password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${tokens.border}`, backgroundColor: tokens.inputBg, color: tokens.textPrimary, fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: tokens.textPrimary, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createForm.is_superuser}
                    onChange={(e) => setCreateForm({ ...createForm, is_superuser: e.target.checked })}
                    style={{ accentColor: tokens.cslBlue }}
                  />
                  <span>Grant full <strong>Superuser &amp; Staff privileges</strong></span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="csl-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="csl-btn-primary"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
