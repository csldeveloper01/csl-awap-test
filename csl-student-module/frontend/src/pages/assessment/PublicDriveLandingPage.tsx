import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchPublicDrive,
  type PublicDriveInfo,
} from '../../api/assessment';
import cslTypographyLogo from '../../assets/CSL-TYPOGRAPHY.png';
import backgroundImage from '../../assets/background.png';

export default function PublicDriveLandingPage() {
  const { driveCode } = useParams<{ driveCode: string }>();

  const [drive, setDrive] = useState<PublicDriveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driveCode) {
      setError('Drive code not specified in URL.');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const driveData = await fetchPublicDrive(driveCode);
        setDrive(driveData);
      } catch (err: any) {
        console.error('Failed to load drive information:', err);
        setError(
          err.response?.data?.detail ||
          err.response?.data?.message ||
          'Unable to load recruitment drive. Please verify the link or contact your campus administrator.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [driveCode]);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)',
          padding: '36px 32px',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <img
          src={cslTypographyLogo}
          alt="CSL Assessment Platform"
          style={{ height: '38px', marginBottom: '24px', objectFit: 'contain' }}
        />

        {loading ? (
          <div style={{ padding: '40px 0', color: '#64748B', fontSize: '15px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
            Loading recruitment drive details...
          </div>
        ) : error ? (
          <div style={{ padding: '24px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '12px', textAlign: 'left' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#B91C1C', fontWeight: 800 }}>
              Recruitment Drive Unavailable
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#7F1D1D', lineHeight: 1.5 }}>
              {error}
            </p>
            <div style={{ marginTop: '18px', textAlign: 'center' }}>
              <Link
                to="/assessment/register"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  backgroundColor: '#1455B8',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                Go to Open Assessment Registration →
              </Link>
            </div>
          </div>
        ) : drive ? (
          <div>
            <div
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '999px',
                backgroundColor: '#EFF6FF',
                color: '#1455B8',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '14px',
                letterSpacing: '0.5px',
              }}
            >
              RECRUITMENT DRIVE #{drive.code}
            </div>

            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0B2E6F', margin: '0 0 10px 0' }}>
              {drive.name}
            </h1>

            {/* Drive Banner */ false && (
              <p style={{ fontSize: '15px', color: '#475569', fontWeight: 600, margin: '0 0 16px 0' }}>
                Recruitment Assessment Portal
              </p>
            )}

            {drive.description && (
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, margin: '0 0 24px 0', textAlign: 'left', backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                {drive.description}
              </p>
            )}

            <div style={{ backgroundColor: '#F1F5F9', borderRadius: '10px', padding: '14px', marginBottom: '24px', textAlign: 'left', fontSize: '13px', color: '#334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#64748B' }}>Associated Assessments:</span>
                <strong style={{ color: '#0F172A' }}>{drive.assessments?.length || 0} rounds</strong>
              </div>
              {drive.registration_start && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Registration Window:</span>
                  <strong style={{ color: '#0F172A' }}>Active</strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link
                to={`/assessment/register?drive=${driveCode}`}
                style={{
                  display: 'block',
                  padding: '14px 20px',
                  background: 'linear-gradient(135deg, #0B2E6F 0%, #1455B8 100%)',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  boxShadow: '0 4px 12px rgba(11, 46, 111, 0.22)',
                  transition: 'transform 0.15s ease',
                }}
              >
                Register for this Drive →
              </Link>

              <Link
                to={`/assessment/register?drive=${driveCode}&action=resume`}
                style={{
                  display: 'block',
                  padding: '12px 20px',
                  backgroundColor: '#F8FAFC',
                  color: '#1E293B',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Returning Candidate / Resume Session
              </Link>
            </div>

            <p style={{ margin: '20px 0 0 0', fontSize: '11px', color: '#94A3B8' }}>
              Standard campus assessment credentials apply. Verified by CSL Assessment Engine.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
