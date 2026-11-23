import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  startAssessment,
  getCandidateAssessments,
  type CandidateAssessmentItem,
  checkCameraBypassStatus,
  downloadCandidateSebConfig,
} from '../../api/assessment';
import {
  checkDeviceEligibility,
  MIN_SUPPORTED_WIDTH,
  MIN_SUPPORTED_HEIGHT,
  type DeviceEligibilityResult,
} from '../../utils/deviceCheck';
import { ProctoringInitializer } from '../../components/assessment/ProctoringInitializer';
import { setProctoringStreams } from '../../utils/proctoringStreamStore';

export function AssessmentInstructionsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // CSL Sentinel Security Gate State
  const [showProctoringGate, setShowProctoringGate] = useState<boolean>(false);
  const [attemptForProctoring, setAttemptForProctoring] = useState<any>(null);

  // Assessment metadata state
  const [eligibleAssessments, setEligibleAssessments] = useState<CandidateAssessmentItem[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<CandidateAssessmentItem | null>(null);
  const [candidateCollege, setCandidateCollege] = useState<string>('');
  const [candidateName, setCandidateName] = useState<string>('');
  const [candidateRegNo, setCandidateRegNo] = useState<string>('');
  const [loadingMetadata, setLoadingMetadata] = useState<boolean>(true);

  // 4-Slide Slideshow State
  const [currentSlide, setCurrentSlide] = useState<1 | 2 | 3 | 4>(1);

  // Slide 1: External Devices Acknowledgment
  const [devicesAcknowledged, setDevicesAcknowledged] = useState<boolean>(false);

  // Slide 2: Hardware Permissions & Integrity Check
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraGranted, setCameraGranted] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenGranted, setScreenGranted] = useState<boolean>(false);
  const [screenError, setScreenError] = useState<string>('');
  const [screenEndedAlert, setScreenEndedAlert] = useState<boolean>(false);
  const [fullscreenVerified] = useState<boolean>(Boolean(document.fullscreenEnabled));
  const [downloadingSeb, setDownloadingSeb] = useState<boolean>(false);

  // Slide 3: Rules & Passing Criteria Acknowledgment
  const [rulesAcknowledged, setRulesAcknowledged] = useState<boolean>(false);

  // Slide 4: Camera Calibration & Admin Bypass
  const [bypassGranted, setBypassGranted] = useState<boolean>(false);
  const [bypassReason, setBypassReason] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);

  // Device eligibility state
  const [eligibility, setEligibility] = useState<DeviceEligibilityResult>(() =>
    checkDeviceEligibility()
  );

  const handleResize = useCallback(() => {
    setEligibility(checkDeviceEligibility());
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Load candidate and assessment details
  useEffect(() => {
    let isMounted = true;
    const storedAssessmentId = sessionStorage.getItem('csl_assessment_id');

    setLoadingMetadata(true);
    getCandidateAssessments()
      .then((data) => {
        if (!isMounted) return;
        setCandidateCollege(data.candidate.college);
        setCandidateName(data.candidate.full_name);
        setCandidateRegNo(data.candidate.register_number);
        setEligibleAssessments(data.assessments);

        if (data.assessments.length > 0) {
          let chosen = data.assessments.find((a) => a.id === storedAssessmentId);
          if (!chosen) {
            chosen = data.assessments.find((a) => a.user_can_attempt) || data.assessments[0];
          }
          setSelectedAssessment(chosen);
          if (chosen) {
            sessionStorage.setItem('csl_assessment_id', chosen.id);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load candidate assessments:', err);
        if (isMounted) {
          if (err?.response?.status === 401) {
            navigate('/assessment/register', { replace: true });
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoadingMetadata(false);
      });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  // Check camera bypass status when assessment is available
  useEffect(() => {
    if (!selectedAssessment?.id) return;
    checkCameraBypassStatus(selectedAssessment.id)
      .then((res) => {
        if (res.bypass_granted) {
          setBypassGranted(true);
          setBypassReason(res.reason || 'Authorized by Administrator');
        }
      })
      .catch((err) => {
        console.warn('Could not verify camera bypass status:', err);
      });
  }, [selectedAssessment?.id]);

  // Attach camera stream to video preview elements
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, currentSlide]);

  const handleAssessmentChange = (assessmentId: string) => {
    const chosen = eligibleAssessments.find((a) => a.id === assessmentId);
    if (chosen) {
      setSelectedAssessment(chosen);
      sessionStorage.setItem('csl_assessment_id', chosen.id);
    }
  };

  // Hardware permission request handlers
  const requestCameraPermission = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setCameraStream(stream);
      setCameraGranted(true);
    } catch (err: any) {
      setCameraError(err.message || 'Camera permission denied or camera not found.');
      setCameraGranted(false);
    }
  };

  const requestScreenSharePermission = async () => {
    setScreenError('');
    setScreenEndedAlert(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setScreenGranted(false);
          setScreenEndedAlert(true);
        };
      }
      setScreenStream(stream);
      setScreenGranted(true);
    } catch (err: any) {
      setScreenError(err.message || 'Screen sharing cancelled or denied.');
      setScreenGranted(false);
    }
  };

  const handleDownloadSeb = async () => {
    if (!selectedAssessment?.id) return;
    try {
      setDownloadingSeb(true);
      const blob = await downloadCandidateSebConfig(selectedAssessment.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedAssessment.code || 'CSL_Assessment'}.seb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to download Safe Exam Browser configuration file.');
    } finally {
      setDownloadingSeb(false);
    }
  };

  const handleStart = async () => {
    if (loading) return;
    setError('');

    // Stop any instruction-level preview tracks so ProctoringInitializer has clean, exclusive hardware access
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
    }

    // Re-verify device and viewport eligibility
    const currentCheck = checkDeviceEligibility();
    if (!currentCheck.eligible) {
      setEligibility(currentCheck);
      setError('Please maximize your browser window or switch to a supported laptop to begin.');
      return;
    }

    // Fullscreen validation
    if (!document.fullscreenEnabled) {
      setError(
        'Your browser does not support or permit the Fullscreen API. Please use a modern laptop browser such as Chrome, Edge, or Firefox.'
      );
      return;
    }

    setLoading(true);

    try {
      // 1. Request browser fullscreen on this explicit user gesture
      if (!document.fullscreenElement) {
        try {
          const docEl = document.documentElement as any;
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen();
          } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
          } else if (docEl.msRequestFullscreen) {
            await docEl.msRequestFullscreen();
          }
        } catch (fsErr) {
          console.warn('Initial requestFullscreen was delayed or restricted by browser:', fsErr);
        }
      }

      // 2. Start assessment and transition to CSL Sentinel security initialization gate
      const targetAssessmentId = selectedAssessment?.id || sessionStorage.getItem('csl_assessment_id') || undefined;
      const attempt = await startAssessment(targetAssessmentId);

      // Open CSL Sentinel Mandatory Initialization Gate
      setAttemptForProctoring(attempt);
      setShowProctoringGate(true);
    } catch (err: unknown) {
      console.error('Failed to initialize assessment:', err);

      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axErr = err as { response?: { data?: { detail?: string; bank_error?: string } } };
        const msg =
          axErr.response?.data?.detail ||
          axErr.response?.data?.bank_error ||
          'Failed to initialize assessment session.';
        setError(msg);
      } else if (err instanceof Error) {
        setError(err.message || 'Failed to start assessment. Please try again.');
      } else {
        setError('Failed to initialize assessment session. Please retry.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Screen 1: Mobile device detected
  if (!eligibility.eligible && eligibility.reason === 'mobile') {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#FCFAF5',
          padding: '24px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid rgba(245, 184, 61, 0.3)',
            boxShadow: '0 10px 25px -5px rgba(11, 46, 111, 0.08)',
            padding: '36px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#FAF7F3',
              border: '2px solid rgba(245, 184, 61, 0.4)',
              color: '#0B2E6F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '30px',
              margin: '0 auto 20px',
            }}
          >
            💻
          </div>
          <span
            style={{
              display: 'inline-block',
              backgroundColor: 'rgba(20, 85, 184, 0.08)',
              color: '#1455B8',
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            CSL Skill Matrix — Laptop Required
          </span>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#0B2E6F',
              margin: '0 0 12px 0',
              lineHeight: 1.3,
            }}
          >
            Please use a laptop to attend this assessment
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#6B7280',
              lineHeight: 1.6,
              marginBottom: '28px',
            }}
          >
            This diagnostic assessment is strictly designed for and restricted to laptop or desktop
            environments with a full keyboard, pointer device, and fullscreen proctoring interface.
            Mobile devices and tablets are not eligible.
          </p>
          <button
            onClick={() => navigate('/assessment/register')}
            style={{
              width: '100%',
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #0B2E6F 0%, #1455B8 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Return to Registration
          </button>
        </div>
      </div>
    );
  }

  // Screen 2: Viewport too small (window not maximized on laptop)
  if (!eligibility.eligible && eligibility.reason === 'viewport_small') {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#FCFAF5',
          padding: '24px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid rgba(245, 184, 61, 0.3)',
            boxShadow: '0 10px 25px -5px rgba(11, 46, 111, 0.08)',
            padding: '36px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#FAF7F3',
              border: '2px solid rgba(245, 184, 61, 0.4)',
              color: '#0B2E6F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '30px',
              margin: '0 auto 20px',
            }}
          >
            🖥️
          </div>
          <span
            style={{
              display: 'inline-block',
              backgroundColor: 'rgba(245, 184, 61, 0.15)',
              color: '#B45309',
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            Viewport Adjustment Needed
          </span>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#0B2E6F',
              margin: '0 0 12px 0',
              lineHeight: 1.3,
            }}
          >
            Please maximize your browser window
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#6B7280',
              lineHeight: 1.6,
              marginBottom: '20px',
            }}
          >
            The single-viewport assessment layout requires an active window of at least{' '}
            <strong>
              {MIN_SUPPORTED_WIDTH} × {MIN_SUPPORTED_HEIGHT} pixels
            </strong>{' '}
            to display all question controls, timer, and palette without page scrolling.
          </p>

          <div
            style={{
              backgroundColor: '#FAF7F3',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              padding: '14px',
              fontSize: '13px',
              color: '#374151',
              marginBottom: '24px',
            }}
          >
            <div>
              Current Window Resolution:{' '}
              <strong style={{ color: '#DC2626', fontFamily: 'monospace' }}>
                {eligibility.currentWidth}px × {eligibility.currentHeight}px
              </strong>
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#6B7280' }}>
              Minimum Required: {MIN_SUPPORTED_WIDTH}px × {MIN_SUPPORTED_HEIGHT}px
            </div>
          </div>

          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Maximize your browser window or adjust your OS display scaling. This screen will
            automatically unlock once suitable dimensions are detected.
          </p>
        </div>
      </div>
    );
  }

  // Display metrics defaults
  const durationMinutes = selectedAssessment?.duration_minutes ?? 60;
  const sections = selectedAssessment?.sections || [];
  const hasDynamicSections = sections.length > 0;
  const dynamicTotalQuestions = sections.reduce((acc, s) => acc + (s.question_count || 0), 0);
  const dynamicTotalMarks = sections.reduce(
    (acc, s) => acc + (s.total_marks || (s.question_count * s.marks_per_question) || 0),
    0
  );

  const aptitudeCount = selectedAssessment?.aptitude_count ?? 25;
  const codingCount = selectedAssessment?.coding_count ?? 25;
  const totalQuestions = hasDynamicSections ? dynamicTotalQuestions : (aptitudeCount + codingCount);
  const totalMarks = selectedAssessment?.total_marks ?? (hasDynamicSections ? dynamicTotalMarks : 50);
  const assessmentTitle = selectedAssessment?.title ?? 'Initial Diagnostic Assessment';
  const assessmentCode = selectedAssessment?.code ?? 'CSL-INITIAL-01';
  const isPdfCoding =
    selectedAssessment?.delivery_mode === 'PDF_CODING' ||
    String(selectedAssessment?.delivery_mode).toUpperCase() === 'PDF_CODING' ||
    Boolean(selectedAssessment?.has_pdf);
  const isSebRequired = Boolean(selectedAssessment?.is_seb_required);

  if (loadingMetadata) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#FCFAF5',
          padding: '36px 16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #E2E8F0',
              borderTopColor: '#0B2E6F',
              borderRadius: '50%',
              margin: '0 auto 16px',
            }}
          />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Loading Assessment...</h3>
        </div>
      </div>
    );
  }

  // CSL Sentinel Mandatory Security Initialization Gate
  if (showProctoringGate && attemptForProctoring) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0F172A',
          padding: '36px 16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <ProctoringInitializer
          attemptId={attemptForProctoring.id}
          bypassGranted={bypassGranted}
          onSuccess={(session, camStream, scStream) => {
            setProctoringStreams(session, camStream, scStream);
            sessionStorage.setItem('csl_proctoring_session_id', session.id);
            navigate(`/assessment/exam/${attemptForProctoring.id}`);
          }}
          onCancel={() => setShowProctoringGate(false)}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FCFAF5',
        padding: '36px 16px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: '820px',
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid rgba(245, 184, 61, 0.3)',
          boxShadow: '0 12px 35px -5px rgba(11, 46, 111, 0.08)',
          padding: '36px',
          boxSizing: 'border-box',
        }}
      >
        {/* Top Assessment Brand Header */}
        <div
          style={{
            borderBottom: '1px solid #FAF7F3',
            paddingBottom: '20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  backgroundColor: '#0B2E6F',
                  color: '#FFD45C',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.05em',
                }}
              >
                CSL
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#1455B8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {assessmentCode}
              </span>
              {candidateCollege && (
                <span style={{ fontSize: '12px', color: '#6B7280' }}>
                  · {candidateCollege}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0B2E6F', margin: 0 }}>
              {assessmentTitle}
            </h1>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              Candidate: <strong style={{ color: '#0B2E6F' }}>{candidateName || candidateRegNo}</strong>
            </div>
            {candidateRegNo && (
              <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace' }}>
                Reg: {candidateRegNo}
              </div>
            )}
          </div>
        </div>

        {/* Assessment Switcher (if college has multiple assessments) */}
        {eligibleAssessments.length > 1 && (
          <div
            style={{
              backgroundColor: '#FAF7F3',
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              border: '1px solid #E5E7EB',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
              Select Assessment:
            </span>
            <select
              value={selectedAssessment?.id || ''}
              onChange={(e) => handleAssessmentChange(e.target.value)}
              style={{
                fontSize: '13px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0B2E6F',
                fontWeight: 600,
              }}
            >
              {eligibleAssessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ─── 4-SLIDE SLIDESHOW PROGRESS BAR ─── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '8px' }}>
            {[
              { num: 1, label: '1. External Devices' },
              { num: 2, label: '2. Permissions' },
              { num: 3, label: '3. Rules & Scoring' },
              { num: 4, label: '4. Sentinel Verification' },
            ].map((s) => (
              <div
                key={s.num}
                style={{
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: currentSlide >= s.num ? '#0D52D6' : '#E2E8F0',
                  transition: 'background-color 0.25s ease',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
            <span style={{ color: currentSlide === 1 ? '#0D52D6' : undefined }}>External Devices</span>
            <span style={{ color: currentSlide === 2 ? '#0D52D6' : undefined }}>Permissions</span>
            <span style={{ color: currentSlide === 3 ? '#0D52D6' : undefined }}>Rules & Scoring</span>
            <span style={{ color: currentSlide === 4 ? '#0D52D6' : undefined }}>Sentinel Gate</span>
          </div>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: '#FEE2E2',
              border: '1px solid #FECACA',
              color: '#991B1B',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* ─── SLIDE 1: EXTERNAL DEVICES ────────────────────────────── */}
        {currentSlide === 1 && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 6px 0' }}>
                Academic Integrity: External Devices Check
              </h2>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                To maintain a fair testing environment, unauthorized hardware and secondary peripherals are strictly prohibited throughout the entire assessment duration.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '24px' }}>
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1.5px solid #FCA5A5',
                  backgroundColor: '#FEF2F2',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🚫</span>
                  <strong style={{ fontSize: '13px', color: '#991B1B' }}>Secondary Monitors & Displays</strong>
                </div>
                <p style={{ fontSize: '12px', color: '#7F1D1D', margin: 0, lineHeight: 1.4 }}>
                  Multiple screens, external HDMI monitors, projector mirroring, and virtual monitors are prohibited. Disconnect all secondary cables.
                </p>
              </div>

              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1.5px solid #FCA5A5',
                  backgroundColor: '#FEF2F2',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🚫</span>
                  <strong style={{ fontSize: '13px', color: '#991B1B' }}>Headphones & Earbuds</strong>
                </div>
                <p style={{ fontSize: '12px', color: '#7F1D1D', margin: 0, lineHeight: 1.4 }}>
                  Wired or Bluetooth headphones, AirPods, earphones, or hearing accessories may not be worn. Your ears must remain uncovered.
                </p>
              </div>

              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1.5px solid #FCA5A5',
                  backgroundColor: '#FEF2F2',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🚫</span>
                  <strong style={{ fontSize: '13px', color: '#991B1B' }}>Smartwatches & Wearables</strong>
                </div>
                <p style={{ fontSize: '12px', color: '#7F1D1D', margin: 0, lineHeight: 1.4 }}>
                  Smartwatches, fitness trackers, smart rings, and connected glasses must be removed and placed outside of reach.
                </p>
              </div>

              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1.5px solid #FCA5A5',
                  backgroundColor: '#FEF2F2',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🚫</span>
                  <strong style={{ fontSize: '13px', color: '#991B1B' }}>Mobile Phones & Reference Notes</strong>
                </div>
                <p style={{ fontSize: '12px', color: '#7F1D1D', margin: 0, lineHeight: 1.4 }}>
                  Smartphones, tablets, calculators, textbooks, and loose paper notes must be stored away. No reference materials are permitted.
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#FAF7F3',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '24px',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={devicesAcknowledged}
                  onChange={(e) => setDevicesAcknowledged(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#0D52D6', cursor: 'pointer', marginTop: '2px' }}
                />
                <span style={{ fontSize: '13px', color: '#1E293B', fontWeight: 600, lineHeight: 1.5 }}>
                  I confirm that my testing desk is completely clear of unauthorized external peripherals, secondary monitors, headphones, smartwatches, and notes.
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCurrentSlide(2)}
                disabled={!devicesAcknowledged}
                style={{
                  backgroundColor: devicesAcknowledged ? '#0D52D6' : '#94A3B8',
                  color: '#FFFFFF',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: devicesAcknowledged ? 'pointer' : 'not-allowed',
                }}
              >
                Next: Hardware & Permissions →
              </button>
            </div>
          </div>
        )}

        {/* ─── SLIDE 2: PERMISSIONS ──────────────────────────────────── */}
        {currentSlide === 2 && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 6px 0' }}>
                Hardware & System Permissions
              </h2>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                The exam platform requires webcam access, screen sharing, and fullscreen capability to ensure exam integrity.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              {/* Webcam Verification */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: `1.5px solid ${cameraGranted ? '#86EFAC' : '#E2E8F0'}`,
                  backgroundColor: cameraGranted ? '#F0FDF4' : '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📷</span>
                    <strong style={{ fontSize: '14px', color: '#0F172A' }}>Web Camera Access</strong>
                    {cameraGranted && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
                        Connected ✓
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                    Webcam is used for identity verification and continuous automated head pose monitoring.
                  </p>
                  {cameraError && (
                    <div style={{ color: '#B91C1C', fontSize: '12px', marginTop: '4px' }}>{cameraError}</div>
                  )}
                </div>

                {cameraGranted ? (
                  <div style={{ width: '80px', height: '60px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000' }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={requestCameraPermission}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#0D52D6',
                      color: '#FFFFFF',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Grant Camera Access
                  </button>
                )}
              </div>

              {/* Screen Share Verification */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: `1.5px solid ${screenGranted ? '#86EFAC' : screenEndedAlert ? '#FCA5A5' : '#E2E8F0'}`,
                  backgroundColor: screenGranted ? '#F0FDF4' : screenEndedAlert ? '#FEF2F2' : '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🖥️</span>
                    <strong style={{ fontSize: '14px', color: '#0F172A' }}>Entire Screen Share</strong>
                    {screenGranted && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
                        Screen Shared ✓
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                    Share your entire desktop screen (not a single tab). The track automatically detects if sharing is ended.
                  </p>
                  {screenEndedAlert && (
                    <div style={{ color: '#B91C1C', fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>
                      ⚠️ Screen share was ended! You must share your entire screen again to proceed.
                    </div>
                  )}
                  {screenError && (
                    <div style={{ color: '#B91C1C', fontSize: '12px', marginTop: '4px' }}>{screenError}</div>
                  )}
                </div>

                {!screenGranted && (
                  <button
                    type="button"
                    onClick={requestScreenSharePermission}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#0D52D6',
                      color: '#FFFFFF',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Share Entire Screen
                  </button>
                )}
              </div>

              {/* Browser Fullscreen Verification */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1.5px solid #86EFAC',
                  backgroundColor: '#F0FDF4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⛶</span>
                    <strong style={{ fontSize: '14px', color: '#0F172A' }}>Fullscreen API Support</strong>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
                      Ready ✓
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                    Your browser supports the Fullscreen API. The exam will launch into fullscreen mode upon start.
                  </p>
                </div>
              </div>

              {/* Safe Exam Browser (SEB) Mandatory Notice if enabled */}
              {isSebRequired && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1.5px solid #FCD34D',
                    backgroundColor: '#FFFBEB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🛡️</span>
                      <strong style={{ fontSize: '14px', color: '#92400E' }}>Safe Exam Browser (SEB) Required</strong>
                    </div>
                    <p style={{ fontSize: '12px', color: '#B45309', margin: '4px 0 0 0' }}>
                      This assessment is protected with Safe Exam Browser. Download the pre-configured `.seb` file to take the test.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSeb}
                    disabled={downloadingSeb}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#D97706',
                      color: '#FFFFFF',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: downloadingSeb ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {downloadingSeb ? 'Downloading...' : 'Download .seb Config'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setCurrentSlide(1)}
                style={{
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentSlide(3)}
                disabled={(!cameraGranted && !bypassGranted) || !screenGranted || !fullscreenVerified}
                style={{
                  backgroundColor: ((cameraGranted || bypassGranted) && screenGranted && fullscreenVerified) ? '#0D52D6' : '#94A3B8',
                  color: '#FFFFFF',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: ((cameraGranted || bypassGranted) && screenGranted && fullscreenVerified) ? 'pointer' : 'not-allowed',
                }}
              >
                Next: Rules & Scoring →
              </button>
            </div>
          </div>
        )}

        {/* ─── SLIDE 3: RULES & PASSING CRITERIA ──────────────────────── */}
        {currentSlide === 3 && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 6px 0' }}>
                Assessment Rules, Scoring & Integrity Policy
              </h2>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                Review the structural parameters, qualifying cutoff, and integrity deterrents for this examination.
              </p>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#FAF7F3', padding: '14px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(245, 184, 61, 0.2)' }}>
                <span style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Duration
                </span>
                <strong style={{ fontSize: '20px', color: '#0B2E6F', fontWeight: 800 }}>
                  {durationMinutes} Mins
                </strong>
              </div>
              <div style={{ backgroundColor: '#FAF7F3', padding: '14px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(245, 184, 61, 0.2)' }}>
                <span style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Format
                </span>
                <strong style={{ fontSize: '18px', color: '#0B2E6F', fontWeight: 800 }}>
                  {isPdfCoding ? 'PDF Coding' : `${totalQuestions} Questions`}
                </strong>
              </div>
              <div style={{ backgroundColor: '#FAF7F3', padding: '14px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(245, 184, 61, 0.2)' }}>
                <span style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Total Marks
                </span>
                <strong style={{ fontSize: '20px', color: '#0B2E6F', fontWeight: 800 }}>
                  {totalMarks} Marks
                </strong>
              </div>
              <div style={{ backgroundColor: '#FAF7F3', padding: '14px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(245, 184, 61, 0.2)' }}>
                <span style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Passing Criteria
                </span>
                <strong style={{ fontSize: '16px', color: '#0B2E6F', fontWeight: 800 }}>
                  {selectedAssessment?.passing_marks ? `${selectedAssessment.passing_marks} Marks` : selectedAssessment?.passing_percentage ? `${selectedAssessment.passing_percentage}%` : 'Standard'}
                </strong>
              </div>
            </div>

            {/* Structure Details */}
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
              <strong style={{ fontSize: '13px', color: '#0F172A', display: 'block', marginBottom: '8px' }}>
                Section Structure & Scoring Rules:
              </strong>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                {sections.length > 0 ? (
                  sections.map((s, idx) => (
                    <li key={s.id || idx}>
                      <strong>{s.name || `Section ${idx + 1}`}</strong>: {s.question_count} Questions ({s.marks_per_question || 1} mark each, total {s.total_marks || (s.question_count * (s.marks_per_question || 1))} marks)
                    </li>
                  ))
                ) : (
                  <li>Comprehensive Question Set ({totalQuestions} Questions, {totalMarks} Total Marks)</li>
                )}
                <li>Negative Marking: <strong>None</strong> (no penalties for incorrect attempts).</li>
                <li>Tab Switches: Up to <strong>2 warnings</strong> permitted. A 3rd switch triggers automatic test submission.</li>
                <li>All responses are securely synchronized with the central assessment server in real-time.</li>
              </ul>
            </div>

            {selectedAssessment?.instructions && (
              <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '14px', marginBottom: '20px', fontSize: '13px', color: '#1E40AF' }}>
                <strong>Additional Instructions:</strong> {selectedAssessment.instructions}
              </div>
            )}

            <div
              style={{
                backgroundColor: '#FAF7F3',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '24px',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rulesAcknowledged}
                  onChange={(e) => setRulesAcknowledged(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#0D52D6', cursor: 'pointer', marginTop: '2px' }}
                />
                <span style={{ fontSize: '13px', color: '#1E293B', fontWeight: 600, lineHeight: 1.5 }}>
                  I have read and agree to the assessment instructions, timing constraints, and academic integrity policies.
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setCurrentSlide(2)}
                style={{
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentSlide(4)}
                disabled={!rulesAcknowledged}
                style={{
                  backgroundColor: rulesAcknowledged ? '#0D52D6' : '#94A3B8',
                  color: '#FFFFFF',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: rulesAcknowledged ? 'pointer' : 'not-allowed',
                }}
              >
                Next: Sentinel Verification →
              </button>
            </div>
          </div>
        )}

        {/* ─── SLIDE 4: SENTINEL VERIFICATION & LAUNCH ──────────────────── */}
        {currentSlide === 4 && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0B2E6F', margin: '0 0 6px 0' }}>
                CSL Sentinel Integrity System Verification Gate
              </h2>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                Review the automated proctoring verification pipeline before launching your assessment.
              </p>
            </div>

            {/* Admin Camera Bypass Granted Alert */}
            {bypassGranted ? (
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1.5px solid #86EFAC',
                  borderRadius: '14px',
                  padding: '24px',
                  marginBottom: '24px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#15803D', margin: '0 0 6px 0' }}>
                  Admin Camera Bypass Granted
                </h3>
                <p style={{ fontSize: '13px', color: '#166534', margin: 0, lineHeight: 1.5 }}>
                  An administrator has authorized an official camera calibration bypass for your account ({bypassReason}). Camera calibration is waived. You may start the assessment directly.
                </p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                    🤖
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      Mandatory 7-Step CSL Sentinel Verification Gate
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                      Once you click &quot;Start Assessment&quot;, the CSL Sentinel gate will automatically execute real hardware and AI checks:
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {[
                    { num: '1', title: 'Camera Stream Check', desc: 'Hardware verification via browser MediaDevices API' },
                    { num: '2', title: 'MediaPipe Face Mesh', desc: 'Initializes real-time facial feature tracking' },
                    { num: '3', title: 'Head Pose Calibration', desc: 'Interactive head turn calibration & baseline calculation' },
                    { num: '4', title: 'Screen Share Lock', desc: 'Validates entire desktop capture & monitors track closure' },
                    { num: '5', title: 'Anti-Cheat Inspection', desc: 'Verifies fullscreen mode and prevents developer shortcuts' },
                    { num: '6', title: 'Session Handshake', desc: 'Cryptographically registers proctoring session on server' },
                    { num: '7', title: 'Continuous Stream Handoff', desc: 'Transfers active tracks to exam room with zero re-prompting' },
                  ].map((step) => (
                    <div
                      key={step.num}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#0D52D6', backgroundColor: '#EFF6FF', padding: '2px 7px', borderRadius: '4px' }}>
                        {step.num}
                      </span>
                      <div>
                        <strong style={{ fontSize: '12px', color: '#0F172A', display: 'block' }}>{step.title}</strong>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>{step.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Launch Assessment Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setCurrentSlide(3)}
                disabled={loading}
                style={{
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={handleStart}
                disabled={loading}
                style={{
                  backgroundColor: !loading ? '#0D52D6' : '#94A3B8',
                  color: '#FFFFFF',
                  padding: '14px 32px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: !loading ? 'pointer' : 'not-allowed',
                  boxShadow: !loading ? '0 4px 14px rgba(13,82,214,0.3)' : 'none',
                }}
              >
                {loading ? 'Entering Fullscreen & Initializing Gate...' : 'Start Assessment →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
