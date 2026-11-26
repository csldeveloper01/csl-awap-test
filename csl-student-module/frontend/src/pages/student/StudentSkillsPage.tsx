import { useEffect, useState } from 'react';
import { getStudentSkills } from '../../api/student';
import type { StudentSkillsResponse } from '../../types/student';

/**
 * Student Skills Page:
 * Displays required skills and subskills derived from StudentProfile -> Course -> CourseSkill.
 * If not assigned, prompts the student clearly.
 */
export function StudentSkillsPage() {
  const [data, setData] = useState<StudentSkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStudentSkills()
      .then((res) => {
        if (!cancelled) setData(res);
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
        Loading skills...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="csl-card" style={{ padding: '32px', color: '#DC2626' }}>
        Unable to load skills.
      </div>
    );
  }

  // Unassigned course/batch state
  if (!data.course) {
    return (
      <div className="csl-card" style={{ padding: '28px', maxWidth: '680px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700, color: 'var(--csl-text-primary)' }}>My Skills</h2>
        <p style={{ margin: '4px 0', color: 'var(--csl-text-secondary)', fontSize: '14px' }}>Course: Not assigned</p>
        <p style={{ margin: '4px 0', color: 'var(--csl-text-secondary)', fontSize: '14px' }}>Batch: Not assigned</p>
        <p style={{ marginTop: '14px', color: 'var(--csl-text-muted)', fontSize: '13.5px' }}>
          Your skill matrix will appear after you are assigned to a course and batch.
        </p>
      </div>
    );
  }

  const formatStatus = (status: string) => {
    if (status === 'UNASSESSED') return 'Unassessed';
    return status;
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      <div className="csl-card" style={{ padding: '22px 24px', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 700, color: 'var(--csl-text-primary)', letterSpacing: '-0.02em' }}>
          My Skills
        </h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13.5px', color: 'var(--csl-text-secondary)' }}>
          <span>
            Course: <strong style={{ color: 'var(--csl-text-primary)' }}>{data.course.name} ({data.course.code})</strong>
          </span>
          <span>
            Batch: <strong style={{ color: 'var(--csl-text-primary)' }}>{data.batch ? data.batch.name : 'Not assigned'}</strong>
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {data.skills.length === 0 ? (
          <div className="csl-card" style={{ padding: '32px', color: 'var(--csl-text-muted)', gridColumn: '1 / -1' }}>
            No required skills have been mapped for your course yet.
          </div>
        ) : (
          data.skills.map((skill) => (
            <div key={skill.id} className="csl-card" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15.5px', fontWeight: 600, color: 'var(--csl-text-primary)' }}>
                {skill.name}
              </h3>
              {skill.subskills.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '8px', backgroundColor: 'var(--csl-bg-elevated)', fontSize: '13px', color: 'var(--csl-text-secondary)' }}>
                  <span>(entire skill)</span>
                  <span style={{ fontWeight: 600 }}>{formatStatus(skill.status)}</span>
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {skill.subskills.map((sub) => (
                    <li
                      key={sub.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--csl-bg-elevated)',
                        fontSize: '13px',
                        color: 'var(--csl-text-primary)',
                      }}
                    >
                      <span>{sub.name}</span>
                      <span style={{ color: 'var(--csl-text-muted)', fontSize: '12px', fontWeight: 600 }}>{formatStatus(sub.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
