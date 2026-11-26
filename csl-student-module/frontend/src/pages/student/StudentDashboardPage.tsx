import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStudentDashboard } from '../../api/student';
import type { StudentDashboardResponse } from '../../types/student';

/**
 * Student Dashboard — Phase 1
 * Consumes real authenticated student identity and required skills data.
 * Presents clean cards with honest placeholders for performance and activities.
 */
export function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadDashboard = () => {
    setLoading(true);
    setError(false);
    getStudentDashboard()
      .then((res) => {
        setData(res);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return <p>Loading dashboard...</p>;
  }

  if (error || !data) {
    return (
      <div>
        <p>Unable to load dashboard.</p>
        <button type="button" onClick={loadDashboard} style={{ marginTop: '8px', padding: '6px 12px' }}>
          Try again.
        </button>
      </div>
    );
  }

  const { student, skills, performance, activities } = data;
  const isCourseAssigned = Boolean(student.course);
  const isBatchAssigned = Boolean(student.batch);

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* 1. Welcome / Student Identity Card */}
      <section
        className="csl-card"
        style={{
          padding: '24px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 700, color: 'var(--csl-text-primary)', letterSpacing: '-0.02em' }}>
            Welcome back, {student.name}.
          </h2>
          <p style={{ margin: 0, color: 'var(--csl-text-muted)', fontSize: '13.5px' }}>
            Student ID:{' '}
            <span style={{ color: 'var(--csl-text-primary)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", backgroundColor: 'var(--csl-bg-elevated)', border: '1px solid var(--csl-border)', padding: '2px 8px', borderRadius: '6px' }}>
              {student.student_id}
            </span>
          </p>
        </div>
      </section>

      {/* Grid for Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '18px',
          marginBottom: '20px',
        }}
      >
        {/* 2. Course / Batch Status Card */}
        <div className="csl-card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>Course &amp; Batch</h3>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ color: 'var(--csl-text-muted)', display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '2px' }}>Course</span>
            <span style={{ fontWeight: 600, color: 'var(--csl-text-primary)', fontSize: '14px' }}>
              {isCourseAssigned
                ? `${student.course} (${student.course_code})`
                : 'Not assigned'}
            </span>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ color: 'var(--csl-text-muted)', display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '2px' }}>Batch</span>
            <span style={{ fontWeight: 600, color: 'var(--csl-text-primary)', fontSize: '14px' }}>{isBatchAssigned ? student.batch : 'Not assigned'}</span>
          </div>

          {!isCourseAssigned && !isBatchAssigned ? (
            <p style={{ margin: '8px 0 0 0', fontSize: '12.5px', color: 'var(--csl-text-muted)' }}>
              Your dashboard will update once you are assigned to a course and batch.
            </p>
          ) : !isBatchAssigned ? (
            <p style={{ margin: '8px 0 0 0', fontSize: '12.5px', color: 'var(--csl-text-muted)' }}>
              Your batch assignment is pending.
            </p>
          ) : null}
        </div>

        {/* 3. Skill Overview Card */}
        <div className="csl-card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>Skills</h3>
          {skills.available ? (
            skills.total_skills === 0 ? (
              <p style={{ margin: 0, color: 'var(--csl-text-muted)', fontSize: '13px' }}>
                No required skills have been mapped yet.
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                  <div>
                    <span className="csl-tabular" style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: 'var(--csl-text-primary)' }}>
                      {skills.total_skills}
                    </span>
                    <span style={{ color: 'var(--csl-text-muted)', fontSize: '12px' }}>Required Skills</span>
                  </div>
                  <div>
                    <span className="csl-tabular" style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: '#16A34A' }}>
                      {skills.assessed}
                    </span>
                    <span style={{ color: 'var(--csl-text-muted)', fontSize: '12px' }}>Assessed</span>
                  </div>
                  <div>
                    <span className="csl-tabular" style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: '#D97706' }}>
                      {skills.unassessed}
                    </span>
                    <span style={{ color: 'var(--csl-text-muted)', fontSize: '12px' }}>Unassessed</span>
                  </div>
                </div>
                {skills.total_subskills > 0 && (
                  <p style={{ margin: '8px 0 0 0', color: 'var(--csl-text-muted)', fontSize: '12.5px' }}>
                    {skills.total_subskills} total sub-skills required
                  </p>
                )}
              </div>
            )
          ) : (
            <div>
              <p style={{ margin: '0 0 4px 0', fontWeight: 500, color: 'var(--csl-text-secondary)' }}>Not available</p>
              <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--csl-text-muted)' }}>
                Assign a course and batch to view your skill progress.
              </p>
            </div>
          )}
        </div>

        {/* 4. Overall Performance Card */}
        <div className="csl-card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>Overall Performance</h3>
          <div className="csl-tabular" style={{ fontSize: '26px', fontWeight: 700, color: 'var(--csl-text-muted)', marginBottom: '6px' }}>
            —
          </div>
          <p style={{ margin: 0, color: 'var(--csl-text-muted)', fontSize: '13px' }}>
            {performance.message}
          </p>
        </div>

        {/* 5. Activities Card */}
        <div className="csl-card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>Activities</h3>
          <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--csl-text-primary)', fontSize: '14px' }}>
            {activities.message}.
          </p>
          <p style={{ margin: 0, color: 'var(--csl-text-muted)', fontSize: '13px' }}>
            Your assigned activities will appear here.
          </p>
        </div>
      </div>

      {/* 6. Quick Navigation */}
      <section className="csl-card" style={{ padding: '20px' }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>Quick Actions</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            to="/student/skills"
            className="csl-btn-primary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            View Skills
          </Link>
          <Link
            to="/student/activities"
            className="csl-btn-primary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            View Activities
          </Link>
          <Link
            to="/student/profile"
            className="csl-btn-secondary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            View Profile
          </Link>
        </div>
      </section>
    </div>
  );
}
