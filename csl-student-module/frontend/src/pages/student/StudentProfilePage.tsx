import { useEffect, useState } from 'react';
import { getStudentProfile } from '../../api/student';
import type { StudentProfile } from '../../types/student';

/**
 * Student profile page. Read-only today: fetches the authenticated student's
 * profile from the backend (which resolves the student from the session).
 */
export function StudentProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStudentProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="csl-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--csl-text-muted)' }}>
        Loading profile...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="csl-card" style={{ padding: '32px', color: '#DC2626' }}>
        Unable to load profile.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--csl-text-primary)', margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>
        My Profile
      </h2>
      <div className="csl-card" style={{ padding: '24px' }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px', margin: 0 }}>
          <div>
            <dt style={{ fontSize: '12px', fontWeight: 600, color: 'var(--csl-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Name</dt>
            <dd style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>{profile.name}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '12px', fontWeight: 600, color: 'var(--csl-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Email</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--csl-text-secondary)' }}>{profile.email}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '12px', fontWeight: 600, color: 'var(--csl-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Student ID</dt>
            <dd style={{ margin: 0, fontSize: '14px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--csl-text-primary)' }}>{profile.student_id}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '12px', fontWeight: 600, color: 'var(--csl-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Course</dt>
            <dd style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--csl-text-primary)' }}>{profile.course ?? 'Not assigned'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '12px', fontWeight: 600, color: 'var(--csl-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Batch</dt>
            <dd style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--csl-text-primary)' }}>{profile.batch ?? 'Not assigned'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
