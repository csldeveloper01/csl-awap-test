import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  fetchPublicDrive,
  getStudentColleges,
  registerCandidate,
  linkCandidateToDrive,
  type PublicDriveInfo,
  type CollegeOption,
} from '../../api/assessment';
import cslTypographyLogo from '../../assets/CSL-TYPOGRAPHY.png';
import backgroundImage from '../../assets/background.png';

export default function PublicDriveLandingPage() {
  const { driveCode } = useParams<{ driveCode: string }>();
  const navigate = useNavigate();

  const [drive, setDrive] = useState<PublicDriveInfo | null>(null);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mode: 'register' (new candidate) vs 'returning' (resume session)
  const [activeMode, setActiveMode] = useState<'register' | 'returning'>('register');

  // Registration Form State
  const [fullName, setFullName] = useState('');
  const [registerNumber, setRegisterNumber] = useState('');
  const [collegeId, setCollegeId] = useState<number | ''>('');
  const [collegeSearch, setCollegeSearch] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [yearOfStudy, setYearOfStudy] = useState('Final Year');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');

  // Returning Candidate State
  const [returnRegNo, setReturnRegNo] = useState('');
  const [returnFactor, setReturnFactor] = useState('');

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

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
        const [driveData, collegesData] = await Promise.all([
          fetchPublicDrive(driveCode),
          getStudentColleges(),
        ]);
        setDrive(driveData);
        setColleges(collegesData);

        if (driveData.assessments && driveData.assessments.length > 0) {
          setSelectedAssessmentId(driveData.assessments[0].id);
        }
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

  const filteredColleges = colleges.filter((c) => {
    // If drive has restricted eligible colleges, filter to only those
    if (drive?.eligible_colleges && drive.eligible_colleges.length > 0) {
      const allowedIds = drive.eligible_colleges.map((ec) => ec.id);
      if (!allowedIds.includes(c.id)) return false;
    }
    if (!collegeSearch.trim()) return true;
    return (
      c.name.toLowerCase().includes(collegeSearch.toLowerCase()) ||
      c.code.toLowerCase().includes(collegeSearch.toLowerCase()) ||
      (c.location && c.location.toLowerCase().includes(collegeSearch.toLowerCase()))
    );
  });

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!fullName.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    if (!registerNumber.trim()) {
      setFormError('Please enter your register / roll number.');
      return;
    }
    if (!collegeId) {
      setFormError('Please select your institution from the directory.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.length < 10) {
      setFormError('Please enter a valid 10-digit mobile phone number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerCandidate({
        drive_code: driveCode,
        full_name: fullName.trim(),
        register_number: registerNumber.trim().toUpperCase(),
        college_id: Number(collegeId),
        email: email.trim().toLowerCase(),
        phone_number: phoneNumber.trim(),
        department: department.trim(),
        year_of_study: yearOfStudy,
        assessment_id: selectedAssessmentId || undefined,
      });

      if (res.assessment_token) {
        sessionStorage.setItem('assessment_token', res.assessment_token);
        sessionStorage.setItem('candidate_name', res.full_name || '');
        sessionStorage.setItem('candidate_college', res.college || '');
        if (drive) {
          sessionStorage.setItem('drive_name', drive.name);
          sessionStorage.setItem('drive_code', drive.code);
        }
        setFormSuccess('Registration verified successfully! Redirecting to assessment...');
        setTimeout(() => {
          navigate('/assessment/instructions');
        }, 1200);
      } else {
        setFormError('Registration recorded, but token was not returned. Please try logging in.');
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      const errData = err.response?.data;
      if (typeof errData === 'object' && errData !== null) {
        const firstKey = Object.keys(errData)[0];
        const val = errData[firstKey];
        setFormError(Array.isArray(val) ? val[0] : (typeof val === 'string' ? val : 'Registration failed.'));
      } else {
        setFormError('Registration failed. Please check your details and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!returnRegNo.trim()) {
      setFormError('Please enter your Register / Roll Number.');
      return;
    }
    if (!returnFactor.trim()) {
      setFormError('Please enter your registered Email address or Mobile Phone Number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await linkCandidateToDrive({
        drive_code: driveCode,
        register_number: returnRegNo.trim().toUpperCase(),
        verification_factor: returnFactor.trim().toLowerCase(),
      });

      if (res.assessment_token) {
        sessionStorage.setItem('assessment_token', res.assessment_token);
        sessionStorage.setItem('candidate_name', res.full_name || '');
        sessionStorage.setItem('candidate_college', res.college || '');
        if (drive) {
          sessionStorage.setItem('drive_name', drive.name);
          sessionStorage.setItem('drive_code', drive.code);
        }
        setFormSuccess('Session recognized! Resuming your assessment workspace...');
        setTimeout(() => {
          navigate('/assessment/instructions');
        }, 1000);
      } else {
        setFormError('Unable to resume session with the provided details.');
      }
    } catch (err: any) {
      console.error('Session resume failed:', err);
      setFormError(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Candidate record not found. Please double-check your roll number and email, or register as a new candidate.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#0F172A',
        }}
      >
        <div style={{ textAlign: 'center', padding: '32px', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: '20px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
          <img src={cslTypographyLogo} alt="CSL Logo" style={{ height: '48px', marginBottom: '20px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>Loading Recruitment Drive...</h2>
          <p style={{ margin: 0, color: '#64748B', fontSize: '14px' }}>Connecting to secure institutional portal</p>
        </div>
      </div>
    );
  }

  if (error || !drive) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '24px',
            padding: '36px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.12)',
            textAlign: 'center',
          }}
        >
          <img src={cslTypographyLogo} alt="CSL Logo" style={{ height: '44px', marginBottom: '20px' }} />
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '24px',
              fontWeight: 800,
            }}
          >
            !
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 10px' }}>
            Drive Unavailable
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', lineHeight: '1.6', margin: '0 0 24px' }}>
            {error || 'The requested recruitment drive could not be located.'}
          </p>
          <Link
            to="/assessment"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              borderRadius: '12px',
              backgroundColor: '#0052CC',
              color: '#FFFFFF',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            Return to Assessment Portal
          </Link>
        </div>
      </div>
    );
  }

  const isRegistrationClosed = drive.is_registration_open === false;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '32px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ maxWidth: '880px', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header Branding */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
          <img src={cslTypographyLogo} alt="CSL Assessment Platform" style={{ height: '42px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: '999px',
                backgroundColor: isRegistrationClosed ? '#FEE2E2' : '#DCFCE7',
                color: isRegistrationClosed ? '#DC2626' : '#15803D',
              }}
            >
              {isRegistrationClosed ? 'Registration Closed' : 'Registration Open'}
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: '999px',
                backgroundColor: '#EFF6FF',
                color: '#0052CC',
              }}
            >
              Code: {drive.code}
            </span>
          </div>
        </div>

        {/* Drive Overview Banner */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '24px',
            padding: '28px 32px',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              {drive.name}
            </h1>
            {drive.description && (
              <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: 0 }}>
                {drive.description}
              </p>
            )}

            {/* Quick Metadata Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569' }}>
                <strong style={{ color: '#0F172A' }}>Associated Assessments:</strong> {drive.assessments?.length || 0}
              </div>
              {drive.registration_end && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569' }}>
                  <strong style={{ color: '#0F172A' }}>Registration Closes:</strong>{' '}
                  {new Date(drive.registration_end).toLocaleDateString()} {new Date(drive.registration_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              {drive.eligible_colleges && drive.eligible_colleges.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569' }}>
                  <strong style={{ color: '#0F172A' }}>Eligible Colleges:</strong>{' '}
                  {drive.eligible_colleges.map((c) => c.name).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assessments Included in this Drive */}
        {drive.assessments && drive.assessments.length > 0 && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              padding: '24px 28px',
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
              border: '1px solid #E2E8F0',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 16px' }}>
              Available Assessments in this Drive
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '14px' }}>
              {drive.assessments.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: '16px',
                    borderRadius: '16px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0052CC', backgroundColor: '#EFF6FF', padding: '3px 8px', borderRadius: '6px' }}>
                      {a.code}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: a.is_required ? '#DC2626' : '#64748B' }}>
                      {a.is_required ? 'Mandatory' : 'Optional'}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    {a.title}
                  </h4>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                    <span>⏱ {a.duration_minutes} Mins</span>
                    <span>⭐ {a.total_marks} Marks</span>
                    <span>📄 {a.delivery_mode === 'PDF_CODING' ? 'PDF Coding' : 'MCQ'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Student Registration Box without mandatory account creation */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)',
            border: '1px solid #E2E8F0',
          }}
        >
          {/* Tab Selector */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              borderBottom: '2px solid #E2E8F0',
              paddingBottom: '12px',
              marginBottom: '24px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveMode('register');
                setFormError(null);
                setFormSuccess(null);
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: 'none',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                backgroundColor: activeMode === 'register' ? '#0052CC' : '#F1F5F9',
                color: activeMode === 'register' ? '#FFFFFF' : '#475569',
                transition: 'all 0.15s ease',
              }}
            >
              New Candidate Registration
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('returning');
                setFormError(null);
                setFormSuccess(null);
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: 'none',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                backgroundColor: activeMode === 'returning' ? '#0052CC' : '#F1F5F9',
                color: activeMode === 'returning' ? '#FFFFFF' : '#475569',
                transition: 'all 0.15s ease',
              }}
            >
              Returning Candidate / Quick Resume
            </button>
          </div>

          {/* Account-free explanatory callout */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #DCFCE7',
              borderRadius: '12px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>✓</span>
            <span>
              <strong>No Account Creation Required:</strong> Simply enter your roll number and details. Your attempt will be securely bound to your verified institutional identity without requiring a password.
            </span>
          </div>

          {formError && (
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FEE2E2',
                borderRadius: '12px',
                color: '#991B1B',
                fontSize: '13px',
                marginBottom: '20px',
                fontWeight: 600,
              }}
            >
              {formError}
            </div>
          )}

          {formSuccess && (
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#F0FDF4',
                border: '1px solid #DCFCE7',
                borderRadius: '12px',
                color: '#15803D',
                fontSize: '13px',
                marginBottom: '20px',
                fontWeight: 600,
              }}
            >
              {formSuccess}
            </div>
          )}

          {/* MODE 1: NEW CANDIDATE REGISTRATION */}
          {activeMode === 'register' && (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Arun Kumar"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      color: '#0F172A',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Register / Roll Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={registerNumber}
                    onChange={(e) => setRegisterNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. 710022104001"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      color: '#0F172A',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Institution / College (Select from Real Directory) *
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={collegeSearch}
                    onChange={(e) => setCollegeSearch(e.target.value)}
                    placeholder="Search institution by name, code or location..."
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <select
                  required
                  value={collegeId}
                  onChange={(e) => setCollegeId(e.target.value ? Number(e.target.value) : '')}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <option value="">-- Choose your College / University --</option>
                  {filteredColleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}){c.location ? ` - ${c.location}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@college.edu"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      color: '#0F172A',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Mobile Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      color: '#0F172A',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Department / Course *
                  </label>
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Computer Science & Engineering"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      color: '#0F172A',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Year of Study *
                  </label>
                  <select
                    value={yearOfStudy}
                    onChange={(e) => setYearOfStudy(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      color: '#0F172A',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="Final Year">Final Year</option>
                  </select>
                </div>
              </div>

              {drive.assessments && drive.assessments.length > 1 && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Target Assessment
                  </label>
                  <select
                    value={selectedAssessmentId}
                    onChange={(e) => setSelectedAssessmentId(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      color: '#0F172A',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    {drive.assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.code}) - {a.duration_minutes} Mins, {a.total_marks} Marks
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || isRegistrationClosed}
                style={{
                  marginTop: '10px',
                  padding: '15px 24px',
                  borderRadius: '14px',
                  border: 'none',
                  backgroundColor: isRegistrationClosed ? '#94A3B8' : '#0052CC',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: isRegistrationClosed ? 'not-allowed' : 'pointer',
                  boxShadow: isRegistrationClosed ? 'none' : '0 8px 24px rgba(0, 82, 204, 0.3)',
                  transition: 'all 0.15s ease',
                }}
              >
                {submitting
                  ? 'Verifying and Registering...'
                  : isRegistrationClosed
                  ? 'Registration Closed'
                  : 'Register & Launch Assessment →'}
              </button>
            </form>
          )}

          {/* MODE 2: RETURNING CANDIDATE QUICK RESUME */}
          {activeMode === 'returning' && (
            <form onSubmit={handleReturningSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Register / Roll Number *
                </label>
                <input
                  type="text"
                  required
                  value={returnRegNo}
                  onChange={(e) => setReturnRegNo(e.target.value.toUpperCase())}
                  placeholder="Enter your registered Roll Number"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    color: '#0F172A',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Registered Verification Factor (Email or Phone Number) *
                </label>
                <input
                  type="text"
                  required
                  value={returnFactor}
                  onChange={(e) => setReturnFactor(e.target.value)}
                  placeholder="student@college.edu or 9876543210"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    color: '#0F172A',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  marginTop: '10px',
                  padding: '15px 24px',
                  borderRadius: '14px',
                  border: 'none',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.2)',
                  transition: 'all 0.15s ease',
                }}
              >
                {submitting ? 'Verifying Session...' : 'Verify Identity & Resume Assessment →'}
              </button>
            </form>
          )}
        </div>

        {/* Footer Note */}
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '13px', color: '#64748B' }}>
          CSL Assessment Platform &bull; Secure Institutional Recruitment Engine
        </div>
      </div>
    </div>
  );
}
