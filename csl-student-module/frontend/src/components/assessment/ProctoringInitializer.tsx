import React, { useState, useEffect, useRef } from 'react';
import {
  getFaceLandmarker,
  processVideoFrame,
  checkPoseMatch,
  CALIBRATION_SEQUENCE,
  type HeadOrientation,
} from '../../utils/faceLandmarker';
import {
  initProctoringSession,
  updateProctoringCameraStatus,
  submitProctoringCalibration,
  updateProctoringScreenShareStatus,
  uploadProctoringEvidence,
  type ProctoringSessionResponse,
} from '../../api/assessment';

export interface ProctoringInitializerProps {
  attemptId: string;
  onSuccess: (session: ProctoringSessionResponse, cameraStream: MediaStream, screenStream: MediaStream) => void;
  onCancel?: () => void;
  bypassGranted?: boolean;
}

type StepStatus = 'PENDING' | 'INITIALIZING' | 'SUCCESS' | 'FAILED';

export const ProctoringInitializer: React.FC<ProctoringInitializerProps> = ({
  attemptId,
  onSuccess,
  onCancel,
  bypassGranted = false,
}) => {
  // Step statuses
  const [cameraStatus, setCameraStatus] = useState<StepStatus>('PENDING');
  const [faceEngineStatus, setFaceEngineStatus] = useState<StepStatus>('PENDING');
  const [calibrationStatus, setCalibrationStatus] = useState<StepStatus>('PENDING');
  const [screenShareStatus, setScreenShareStatus] = useState<StepStatus>('PENDING');
  const [browserCheckStatus, setBrowserCheckStatus] = useState<StepStatus>('PENDING');
  const [sessionInitStatus, setSessionInitStatus] = useState<StepStatus>('PENDING');

  // Error messages
  const [cameraError, setCameraError] = useState<string>('');
  const [faceEngineError, setFaceEngineError] = useState<string>('');
  const [calibrationError, setCalibrationError] = useState<string>('');
  const [screenShareError, setScreenShareError] = useState<string>('');

  // Streams
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Calibration state
  const [calibStepIndex, setCalibStepIndex] = useState<number>(0);
  const [calibProgress, setCalibProgress] = useState<number>(0);
  const [calibResults, setCalibResults] = useState<any[]>([]);
  const [baselinePose, setBaselinePose] = useState<HeadOrientation>({ yaw: 0, pitch: 0, roll: 0 });
  const [liveOrientation, setLiveOrientation] = useState<HeadOrientation>({ yaw: 0, pitch: 0, roll: 0 });
  const [liveFaceCount, setLiveFaceCount] = useState<number>(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const activeSessionRef = useRef<ProctoringSessionResponse | null>(null);

  // Overall workflow state: 'WELCOME' | 'CAMERA' | 'CALIBRATION' | 'SCREEN_SHARE' | 'CONFIRM'
  const [activeStage, setActiveStage] = useState<'WELCOME' | 'CALIBRATION' | 'SCREEN_SHARE' | 'READY'>('WELCOME');

  // Attach camera stream to video element
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(console.warn);
    }
  }, [cameraStream, activeStage]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Step 1: Start Camera Hardware
  const handleStartCamera = async () => {
    setCameraStatus('INITIALIZING');
    setCameraError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support webcam hardware access.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      setCameraStream(stream);
      setCameraStatus('SUCCESS');

      // Listen for camera disconnection / track ended
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setCameraStatus('FAILED');
          setCameraError('Camera stream was unexpectedly disconnected or terminated.');
        };
      }

      // Automatically initialize Face Detection Engine
      await handleInitFaceEngine(stream);
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      setCameraStatus('FAILED');
      let msg = 'Camera permission was denied or camera is unavailable.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera access was blocked. Please permit webcam access in browser address bar.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No compatible webcam device was detected on your computer.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Webcam is currently occupied by another program (e.g., Zoom, Teams).';
      }
      setCameraError(msg);
    }
  };

  // Step 2: Initialize MediaPipe Face Landmarker Engine
  const handleInitFaceEngine = async (_stream: MediaStream) => {
    setFaceEngineStatus('INITIALIZING');
    setFaceEngineError('');
    try {
      const landmarker = await getFaceLandmarker();
      setFaceEngineStatus('SUCCESS');

      if (bypassGranted) {
        setCalibrationStatus('SUCCESS');
        setActiveStage('SCREEN_SHARE');
      } else {
        setActiveStage('CALIBRATION');
        startCalibrationLoop(landmarker);
      }
    } catch (err: any) {
      console.error('Face landmarker engine load error:', err);
      setFaceEngineStatus('FAILED');
      setFaceEngineError('Failed to initialize local facial detection engine. Please check internet connection.');
    }
  };

  // Step 3: Run Guided 6-Pose Head Calibration
  const startCalibrationLoop = (landmarker: any) => {
    setCalibrationStatus('INITIALIZING');
    setCalibrationError('');
    let currentStepIdx = 0;
    let holdCount = 0;
    const requiredHoldFrames = 15; // ~500ms of sustained correct pose
    const recordedResults: any[] = [];
    let currentBaseline: HeadOrientation = { yaw: 0, pitch: 0, roll: 0 };

    const loop = () => {
      try {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const now = performance.now();
          const detection = processVideoFrame(landmarker, videoRef.current, now);

          setLiveFaceCount(detection.faceCount);
          setLiveOrientation(detection.orientation);

          if (detection.hasFace && detection.faceCount === 1) {
            const currentTarget = CALIBRATION_SEQUENCE[currentStepIdx]?.step;
            if (currentTarget) {
              const matches = checkPoseMatch(currentTarget, detection.orientation, currentBaseline);

              if (matches) {
                holdCount += 1;
                const pct = Math.min(100, Math.round((holdCount / requiredHoldFrames) * 100));
                setCalibProgress(pct);

                if (holdCount >= requiredHoldFrames) {
                  // Completed current pose step
                  if (currentTarget === 'LOOK_STRAIGHT') {
                    currentBaseline = detection.orientation;
                    setBaselinePose(currentBaseline);
                  }

                  recordedResults.push({
                    pose: currentTarget,
                    passed: true,
                    yaw: detection.orientation.yaw,
                    pitch: detection.orientation.pitch,
                    confidence: detection.confidence,
                    timestamp: Date.now(),
                  });
                  setCalibResults([...recordedResults]);

                  currentStepIdx += 1;
                  setCalibStepIndex(currentStepIdx);
                  holdCount = 0;
                  setCalibProgress(0);

                  if (currentStepIdx >= CALIBRATION_SEQUENCE.length) {
                    // All 6 poses successfully completed!
                    setCalibrationStatus('SUCCESS');
                    setActiveStage('SCREEN_SHARE');
                    return; // Exit calibration animation loop
                  }
                }
              } else {
                holdCount = Math.max(0, holdCount - 1);
                setCalibProgress(Math.min(100, Math.round((holdCount / requiredHoldFrames) * 100)));
              }
            }
          } else {
            holdCount = 0;
            setCalibProgress(0);
          }
        }
      } catch (err: any) {
        setCalibrationError(err?.message || 'Error tracking facial landmarks');
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  };

  // Step 4: Request & Initialize Display Capture (Screen Sharing)
  const handleStartScreenShare = async () => {
    setScreenShareStatus('INITIALIZING');
    setScreenShareError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen sharing API is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        } as any,
        audio: false,
      });

      setScreenStream(stream);
      setScreenShareStatus('SUCCESS');

      const screenTrack = stream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.onended = () => {
          setScreenShareStatus('FAILED');
          setScreenShareError('Screen sharing was stopped or interrupted by the candidate.');
        };
      }

      // Step 5: Browser Integrity checks (Fullscreen & visibility)
      handleCheckBrowserIntegrity(stream);
    } catch (err: any) {
      console.error('Screen sharing permission error:', err);
      setScreenShareStatus('FAILED');
      setScreenShareError(
        err.name === 'NotAllowedError'
          ? 'Screen sharing permission was cancelled or denied. Mandatory screen sharing is required.'
          : err.message || 'Could not initialize screen capture.'
      );
    }
  };

  // Step 5 & 6: Browser Checks & Security Session Init
  const handleCheckBrowserIntegrity = async (_scStream: MediaStream) => {
    setBrowserCheckStatus('INITIALIZING');
    try {
      if (!document.fullscreenEnabled) {
        throw new Error('Your browser does not permit fullscreen mode. Please update or unblock fullscreen.');
      }
      setBrowserCheckStatus('SUCCESS');

      // Step 6: Create or Retrieve Proctoring Session on Django Backend
      setSessionInitStatus('INITIALIZING');
      const session = await initProctoringSession(attemptId);
      activeSessionRef.current = session;

      // Update hardware statuses
      await updateProctoringCameraStatus(session.id, 'ACTIVE');
      await updateProctoringScreenShareStatus(session.id, 'ACTIVE');

      // Submit calibration baseline
      if (!bypassGranted && calibResults.length > 0) {
        await submitProctoringCalibration(session.id, {
          baseline_orientation: baselinePose,
          calibration_results: calibResults,
          calibration_completed: true,
        });
      }

      // Upload initial calibration snapshot frame
      if (videoRef.current) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 320, 240);
            const b64 = canvas.toDataURL('image/jpeg', 0.8);
            await uploadProctoringEvidence(session.id, b64, 'CALIBRATION_FRAME', undefined, {
              baseline: baselinePose,
            });
          }
        } catch (snapErr) {
          console.warn('Initial snapshot capture non-fatal warning:', snapErr);
        }
      }

      setSessionInitStatus('SUCCESS');
      setActiveStage('READY');
    } catch (err: any) {
      console.error('Session initialization error:', err);
      setSessionInitStatus('FAILED');
    }
  };

  // Step 7: Launch Exam
  const handleAuthorizeAndEnter = () => {
    if (activeSessionRef.current && cameraStream && screenStream) {
      onSuccess(activeSessionRef.current, cameraStream, screenStream);
    }
  };

  const currentPoseInstruction = CALIBRATION_SEQUENCE[calibStepIndex];

  return (
    <div
      style={{
        maxWidth: '760px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 20px 40px -15px rgba(11, 46, 111, 0.12)',
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          padding: '24px 32px',
          background: 'linear-gradient(135deg, #0B2E6F 0%, #1455B8 100%)',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '4px',
                letterSpacing: '0.05em',
              }}
            >
              CSL SENTINEL
            </span>
            <span style={{ fontSize: '13px', opacity: 0.9 }}>AI-Assisted Examination Integrity System</span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Security Initialization Gate</h2>
        </div>
        <div style={{ fontSize: '28px' }}>🛡️</div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: '32px' }}>
        {/* Stage 1: Welcome & Camera Launch */}
        {activeStage === 'WELCOME' && (
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              Step 1: Camera Initialization & Permissions
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, marginBottom: '24px' }}>
              CSL Sentinel enforces an active webcam stream throughout the assessment. Before entering the examination
              room, you must grant webcam permission and complete a 6-step guided head calibration.
            </p>

            {cameraError && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '10px',
                  color: '#991B1B',
                  fontSize: '13px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span>⚠️</span>
                <span>{cameraError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleStartCamera}
                disabled={cameraStatus === 'INITIALIZING'}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0B2E6F',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: cameraStatus === 'INITIALIZING' ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {cameraStatus === 'INITIALIZING' ? 'Connecting Webcam...' : 'Enable Camera & Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: MediaPipe Head Movement Calibration */}
        {activeStage === 'CALIBRATION' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Step 2: Head Movement Calibration ({calibStepIndex + 1}/6)
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Guided head movement establishes your baseline posture to eliminate false cheating alerts.
                </p>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: liveFaceCount === 1 ? '#DCFCE7' : '#FEF3C7',
                  color: liveFaceCount === 1 ? '#15803D' : '#B45309',
                  padding: '4px 10px',
                  borderRadius: '999px',
                }}
              >
                {liveFaceCount === 1 ? '✓ Face Locked' : liveFaceCount === 0 ? 'Searching Face...' : 'Multiple Faces!'}
              </span>
            </div>

            {/* Video Preview and Pose Direction Overlay */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '320px',
                backgroundColor: '#0F172A',
                borderRadius: '16px',
                overflow: 'hidden',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)', // Mirrored selfie view
                }}
              />

              {/* Oval Face Guide Overlay */}
              <div
                style={{
                  position: 'absolute',
                  width: '190px',
                  height: '240px',
                  borderRadius: '50%',
                  border: `3px dashed ${liveFaceCount === 1 ? '#10B981' : '#F59E0B'}`,
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
                  pointerEvents: 'none',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              />

              {/* Active Pose Directive Badge */}
              {currentPoseInstruction && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    backdropFilter: 'blur(6px)',
                    color: '#FFFFFF',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    textAlign: 'center',
                    maxWidth: '85%',
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '2px' }}>
                    {currentPoseInstruction.icon} {currentPoseInstruction.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>{currentPoseInstruction.instruction}</div>
                  <div style={{ fontSize: '10px', color: '#38BDF8', marginTop: '4px' }}>
                    Live Pose: Yaw {liveOrientation.yaw.toFixed(1)}° • Pitch {liveOrientation.pitch.toFixed(1)}° • Roll {liveOrientation.roll.toFixed(1)}°
                  </div>
                  {/* Progress Bar for Current Step */}
                  <div
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      height: '5px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${calibProgress}%`,
                        backgroundColor: '#10B981',
                        transition: 'width 0.1s linear',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Pose Steps Tracker */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
              {CALIBRATION_SEQUENCE.map((p, idx) => {
                const isPassed = idx < calibStepIndex;
                const isCurrent = idx === calibStepIndex;
                return (
                  <div
                    key={p.step}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '8px',
                      backgroundColor: isPassed ? '#DCFCE7' : isCurrent ? '#EFF6FF' : '#F1F5F9',
                      border: `1px solid ${isPassed ? '#86EFAC' : isCurrent ? '#3B82F6' : '#E2E8F0'}`,
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: isPassed ? '#166534' : isCurrent ? '#1D4ED8' : '#64748B',
                    }}
                  >
                    <div>{isPassed ? '✓' : p.icon}</div>
                    <div style={{ marginTop: '2px', fontSize: '10px' }}>{p.step.replace('LOOK_', '').replace('TURN_', '')}</div>
                  </div>
                );
              })}
            </div>

            {(faceEngineError || calibrationError) && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#DC2626',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              >
                ⚠️ {faceEngineError || calibrationError}
              </div>
            )}
          </div>
        )}

        {/* Stage 3: Mandatory Screen Sharing */}
        {activeStage === 'SCREEN_SHARE' && (
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              Step 3: Mandatory Display Capture (Screen Sharing)
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, marginBottom: '20px' }}>
              To ensure integrity, please share your entire desktop screen. The exam browser detects interruptions, tab
              switching, and unauthorized applications in real time.
            </p>

            {screenShareError && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '10px',
                  color: '#991B1B',
                  fontSize: '13px',
                  marginBottom: '20px',
                }}
              >
                ⚠️ {screenShareError}
              </div>
            )}

            <div
              style={{
                padding: '16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                marginBottom: '24px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A', marginBottom: '6px' }}>
                Instructions for Screen Share:
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                <li>Select <strong>Entire Screen</strong> when prompted by the browser.</li>
                <li>Do NOT click "Stop sharing" during the exam, as this records an integrity violation.</li>
                <li>Ensure all private tabs or messengers are closed beforehand.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={handleStartScreenShare}
                disabled={screenShareStatus === 'INITIALIZING'}
                style={{
                  padding: '12px 28px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0B2E6F',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: screenShareStatus === 'INITIALIZING' ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {screenShareStatus === 'INITIALIZING' ? 'Starting Screen Share...' : '🖥️ Share Screen & Verify'}
              </button>
            </div>
          </div>
        )}

        {/* Stage 4: Ready to Enter Assessment */}
        {activeStage === 'READY' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                fontSize: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              ✓
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              CSL Sentinel Integrity Checks Passed
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.6 }}>
              Webcam stream, facial baseline orientation, screen capture, and browser monitoring have all been successfully
              initialized and bound to your assessment attempt.
            </p>

            <button
              type="button"
              onClick={handleAuthorizeAndEnter}
              style={{
                padding: '14px 36px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 10px 20px -5px rgba(5, 150, 105, 0.4)',
              }}
            >
              Launch Secure Assessment →
            </button>
          </div>
        )}

        {/* Step Status Strip */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '11px',
            color: '#94A3B8',
            marginTop: '20px',
            justifyContent: 'center',
            borderTop: '1px solid #F1F5F9',
            paddingTop: '14px',
          }}
        >
          <span>Camera: {cameraStatus}</span> •
          <span>Engine: {faceEngineStatus}</span> •
          <span>Calibration: {calibrationStatus}</span> •
          <span>Screen: {screenShareStatus}</span> •
          <span>Browser: {browserCheckStatus}</span> •
          <span>Session: {sessionInitStatus}</span>
        </div>
      </div>
    </div>
  );
};
