import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStudentActivities } from '../../api/student';
import type { StudentActivitySummary } from '../../types/student';

/**
 * Student Activities Page:
 * Displays assigned activities (Tasks, Assessments, Projects) for the student's Course & Batch.
 */
export function StudentActivitiesPage() {
  const [activities, setActivities] = useState<StudentActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadActivities = () => {
    setLoading(true);
    setError(false);
    getStudentActivities()
      .then((res) => {
        setActivities(res.activities || []);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadActivities();
  }, []);

  if (loading) {
    return <p>Loading activities...</p>;
  }

  if (error) {
    return (
      <div>
        <p>Unable to load activities.</p>
        <button
          type="button"
          onClick={loadActivities}
          style={{ marginTop: '8px', padding: '6px 12px' }}
        >
          Try again
        </button>
      </div>
    );
  }

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return 'No deadline';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'SUBMITTED':
        return 'Submitted';
      case 'EVALUATED':
        return 'Evaluated';
      case 'DRAFT':
        return 'Draft';
      case 'WITHDRAWN':
        return 'Withdrawn';
      default:
        return status;
    }
  };

  const formatType = (typeStr: string) => {
    switch (typeStr) {
      case 'TASK':
        return 'Task';
      case 'ASSESSMENT':
        return 'Assessment';
      case 'PROJECT':
        return 'Project';
      default:
        return typeStr;
    }
  };

  return (
    <div style={{ maxWidth: '860px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--csl-text-primary)', margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>
        Activities
      </h2>

      {activities.length === 0 ? (
        <div
          className="csl-card"
          style={{
            padding: '36px 24px',
            textAlign: 'center',
            color: 'var(--csl-text-muted)',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: 'var(--csl-text-primary)', fontSize: '15px' }}>
            No activities yet.
          </p>
          <p style={{ margin: 0, fontSize: '13.5px' }}>
            Your assigned activities will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {activities.map((act) => (
            <div
              key={act.id}
              className="csl-card"
              style={{ padding: '20px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>{act.title}</h3>
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor: 'rgba(20, 85, 217, 0.1)',
                      color: '#1455D9',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    {formatType(act.type)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    backgroundColor: act.status === 'PENDING' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(22, 163, 74, 0.12)',
                    color: act.status === 'PENDING' ? '#B45309' : '#15803D',
                  }}
                >
                  {formatStatus(act.status)}
                </span>
              </div>

              {act.description && (
                <p style={{ margin: '4px 0 12px 0', color: 'var(--csl-text-secondary)', fontSize: '13.5px', lineHeight: 1.5 }}>
                  {act.description}
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--csl-border)',
                  fontSize: '12.5px',
                  color: 'var(--csl-text-muted)',
                }}
              >
                <div className="csl-tabular">
                  <span>Due: {formatDueDate(act.due_date)}</span>
                  {act.max_marks > 0 && <span style={{ marginLeft: '16px' }}>Max marks: {act.max_marks}</span>}
                </div>

                <Link
                  to={`/student/activities/${act.id}`}
                  className="csl-btn-primary"
                  style={{ textDecoration: 'none', padding: '6px 14px', fontSize: '12.5px' }}
                >
                  View Activity
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
