import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getStaffActivities,
  getActivityOptions,
  createStaffActivity,
  updateStaffActivity,
  deleteStaffActivity,
} from '../../api/staffActivities';
import type {
  StaffActivityItem,
  ActivityOptions,
  StaffActivityCreatePayload,
} from '../../types/staffActivity';
import { CreateActivityModal } from './CreateActivityModal';

export function StaffActivitiesPage() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<StaffActivityItem[]>([]);
  const [options, setOptions] = useState<ActivityOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: { status?: string; course_id?: number } = {};
      if (selectedStatus) params.status = selectedStatus;
      if (selectedCourse) params.course_id = Number(selectedCourse);

      const data = await getStaffActivities(params);
      setActivities(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load activities.');
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getActivityOptions()
      .then((opts) => setOptions(opts))
      .catch((e) => console.error('Failed to load options', e));
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [selectedStatus, selectedCourse]);

  const handleCreate = async (payload: StaffActivityCreatePayload) => {
    await createStaffActivity(payload);
    setShowCreateModal(false);
    await fetchActivities();
  };

  const handleUpdateStatus = async (id: number, newStatus: 'ACTIVE' | 'ARCHIVED') => {
    try {
      await updateStaffActivity(id, { status: newStatus });
      await fetchActivities();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update status.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this activity?')) return;
    try {
      await deleteStaffActivity(id);
      await fetchActivities();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete activity.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            DRAFT
          </span>
        );
      case 'ACTIVE':
        return (
          <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            ACTIVE
          </span>
        );
      case 'ARCHIVED':
        return (
          <span style={{ backgroundColor: '#f3f4f6', color: '#4b5563', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            ARCHIVED
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      ASSESSMENT: { bg: '#e0e7ff', text: '#3730a3' },
      TASK: { bg: '#e0f2fe', text: '#0369a1' },
      PROJECT: { bg: '#f3e8ff', text: '#6b21a8' },
    };
    const c = colors[type] || { bg: '#f3f4f6', text: '#374151' };
    return (
      <span style={{ backgroundColor: c.bg, color: c.text, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
        {type}
      </span>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--csl-bg-canvas)', padding: '28px 24px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <button
              onClick={() => navigate('/welcome')}
              style={{ background: 'none', border: 'none', color: '#1455D9', cursor: 'pointer', padding: 0, marginBottom: 8, fontSize: 13, fontWeight: 600 }}
            >
              ← Back to Staff Portal
            </button>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--csl-text-primary)', letterSpacing: '-0.02em' }}>Activity Management</h1>
            <p style={{ margin: '4px 0 0 0', color: 'var(--csl-text-muted)', fontSize: 13.5 }}>
              Create and manage Tasks, Projects, and Assessments across courses and batches.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={!options}
              className="csl-btn-primary"
            >
              + Create Activity
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="csl-card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--csl-text-secondary)', marginRight: 6 }}>Status:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--csl-border)', backgroundColor: 'var(--csl-bg-card)', color: 'var(--csl-text-primary)', fontSize: 13 }}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          {options && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--csl-text-secondary)', marginRight: 6 }}>Course:</label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--csl-border)', backgroundColor: 'var(--csl-bg-card)', color: 'var(--csl-text-primary)', fontSize: 13 }}
              >
                <option value="">All Courses</option>
                {options.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="csl-card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--csl-text-muted)' }}>Loading activities...</div>
        ) : error ? (
          <div style={{ padding: 16, backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 10 }}>
            {error}
          </div>
        ) : activities.length === 0 ? (
          <div className="csl-card" style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--csl-text-muted)' }}>
            <h3 style={{ margin: '0 0 6px 0', color: 'var(--csl-text-primary)' }}>No activities found</h3>
            <p style={{ fontSize: 13.5, margin: 0 }}>Click "+ Create Activity" to publish or draft a new activity.</p>
          </div>
        ) : (
          <div className="csl-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--csl-border)', backgroundColor: 'var(--csl-bg-elevated)', color: 'var(--csl-text-muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px' }}>Title</th>
                  <th style={{ padding: '12px 16px' }}>Type</th>
                  <th style={{ padding: '12px 16px' }}>Course / Batch</th>
                  <th style={{ padding: '12px 16px' }}>Max Marks</th>
                  <th style={{ padding: '12px 16px' }}>Deadline</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(activities) ? activities : []).map((act) => (
                  <tr key={act.id} style={{ borderBottom: '1px solid var(--csl-border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--csl-text-primary)' }}>{act.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--csl-text-muted)', marginTop: 2 }}>
                        By {act.created_by_name} • {act.skills_covered?.length || 0} skills mapped
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{getTypeBadge(act.type)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--csl-text-primary)' }}>{act.course_code}</div>
                      <div style={{ fontSize: 12, color: 'var(--csl-text-muted)' }}>
                        {act.batch_name ? act.batch_name : 'All Batches'}
                      </div>
                    </td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', fontWeight: 600 }}>{act.max_marks}</td>
                    <td className="csl-tabular" style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--csl-text-secondary)' }}>
                      {act.deadline ? new Date(act.deadline).toLocaleString() : 'No deadline'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{getStatusBadge(act.status)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {act.status === 'DRAFT' && (
                          <button
                            onClick={() => handleUpdateStatus(act.id, 'ACTIVE')}
                            title="Publish activity to students"
                            style={{ fontSize: 12, padding: '4px 10px', background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                          >
                            Publish
                          </button>
                        )}
                        {act.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleUpdateStatus(act.id, 'ARCHIVED')}
                            title="Archive activity"
                            className="csl-btn-secondary"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                          >
                            Archive
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(act.id)}
                          title="Delete activity"
                          style={{ fontSize: 12, padding: '4px 10px', background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Dialog */}
        {showCreateModal && options && (
          <CreateActivityModal
            options={options}
            onClose={() => setShowCreateModal(false)}
            onSubmit={handleCreate}
          />
        )}
      </div>
    </div>
  );
}
