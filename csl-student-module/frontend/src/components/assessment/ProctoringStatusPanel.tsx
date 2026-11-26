import React, { useState, useEffect, useRef } from 'react';
import {
  getFaceLandmarker,
  processVideoFrame,
} from '../../utils/faceLandmarker';
import {
  updateProctoringCameraStatus,
  updateProctoringScreenShareStatus,
  recordProctoringEvent,
  uploadProctoringEvidence,
  type ProctoringSessionResponse,
} from '../../api/assessment';
import {
  acquireCameraAndMicrophoneStream,
  hasLiveVideoTrack,
  hasLiveAudioTrack,
} from '../../utils/proctoringStreamStore';

export interface ProctoringStatusPanelProps {
  session: ProctoringSessionResponse;
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  cameraBypassed?: boolean;
  cameraRecoveryReason?: string;
  onCameraReconnected?: (newStream: MediaStream) => void;
  onScreenShareReconnected?: (newStream: MediaStream) => void;
  onViolationThresholdExceeded?: (reason: string) => void;
}

export const ProctoringStatusPanel: React.FC<ProctoringStatusPanelProps> = ({
  session,
  cameraStream = null,
  screenStream = null,
  cameraBypassed = false,
  cameraRecoveryReason = '',
  onCameraReconnected,
  onScreenShareReconnected,
  onViolationThresholdExceeded,
}) => {
  const hasLiveCamera = hasLiveVideoTrack(cameraStream);
  const hasLiveAudio = hasLiveAudioTrack(cameraStream);
  const hasLiveScreen = hasLiveVideoTrack(screenStream);

  const [cameraActive, setCameraActive] = useState<boolean>(hasLiveCamera);
  const [micActive, setMicActive] = useState<boolean>(hasLiveAudio);
  const [screenShareActive, setScreenShareActive] = useState<boolean>(hasLiveScreen);
  const [faceCount, setFaceCount] = useState<number>(1);
  const [poseDeviated, setPoseDeviated] = useState<boolean>(false);
  const [activeAlert, setActiveAlert] = useState<string>('');
  const [riskScore, setRiskScore] = useState<number>(session.risk_score || 0);

  // Recovery modal states for camera/mic and screen share
  const [showCameraRecovery, setShowCameraRecovery] = useState<boolean>(() => !cameraBypassed && !hasLiveCamera);
  const [reconnectingCamera, setReconnectingCamera] = useState<boolean>(false);
  const [cameraRecoveryError, setCameraRecoveryError] = useState<string>('');
  const [showScreenRecovery, setShowScreenRecovery] = useState<boolean>(!hasLiveScreen);
  const [reconnectingScreen, setReconnectingScreen] = useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Deviation timers to avoid false positives & 15s anomaly cooldowns
  const ANOMALY_COOLDOWN_MS = 15000;
  const noFaceDurationRef = useRef<number>(0);
  const multiFaceDurationRef = useRef<number>(0);
  const poseDevDurationRef = useRef<number>(0);
  const lastFaceNotDetectedSentRef = useRef<number>(0);
  const lastMultiFaceSentRef = useRef<number>(0);
  const lastPoseDevSentRef = useRef<number>(0);
  const lastPeriodicSnapshotRef = useRef<number>(Date.now());
  const lastFrameProcessTime = useRef<number>(0);

  useEffect(() => {
    if (riskScore >= 90 && onViolationThresholdExceeded) {
      onViolationThresholdExceeded(`High proctoring risk detected (${riskScore}/100)`);
    }
  }, [riskScore, onViolationThresholdExceeded]);

  // Attach camera stream to thumbnail preview
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(console.warn);
    }
  }, [cameraStream]);

  // Monitor camera and microphone track lifecycle (skipped gracefully if admin bypassed webcam)
  useEffect(() => {
    if (cameraBypassed) {
      setCameraActive(false);
      setMicActive(false);
      setShowCameraRecovery(false);
      return;
    }

    const videoTrack = cameraStream?.getVideoTracks()[0];
    const audioTrack = cameraStream?.getAudioTracks()[0];

    if (!videoTrack || videoTrack.readyState !== 'live') {
      setCameraActive(false);
      setMicActive(Boolean(audioTrack && audioTrack.readyState === 'live'));
      setShowCameraRecovery(true);
      return;
    }

    setCameraActive(true);
    setMicActive(Boolean(audioTrack && audioTrack.readyState === 'live'));
    setShowCameraRecovery(false);

    const handleVideoEnded = () => {
      setCameraActive(false);
      setShowCameraRecovery(true);
      setActiveAlert('Camera stream was disconnected! Please restore immediately.');
      updateProctoringCameraStatus(session.id, 'DISCONNECTED')
        .then((res: any) => {
          if (typeof res?.risk_score === 'number') setRiskScore(res.risk_score);
          if (res?.auto_submitted && onViolationThresholdExceeded) {
            onViolationThresholdExceeded(res.auto_submitted_reason || 'Camera violation threshold exceeded.');
          }
        })
        .catch(console.error);
    };

    const handleAudioEnded = () => {
      setMicActive(false);
      setActiveAlert('Microphone audio track was disconnected!');
    };

    videoTrack.addEventListener('ended', handleVideoEnded);
    if (audioTrack && audioTrack.readyState === 'live') {
      audioTrack.addEventListener('ended', handleAudioEnded);
    }

    return () => {
      videoTrack.removeEventListener('ended', handleVideoEnded);
      if (audioTrack) {
        audioTrack.removeEventListener('ended', handleAudioEnded);
      }
    };
  }, [cameraStream, cameraBypassed, session.id]);

  // Monitor screen share track lifecycle
  useEffect(() => {
    const screenTrack = screenStream?.getVideoTracks()[0];
    if (!screenTrack || screenTrack.readyState !== 'live') {
      setScreenShareActive(false);
      setShowScreenRecovery(true);
      return;
    }
    setScreenShareActive(true);
    setShowScreenRecovery(false);
    const handleEnded = () => {
      setScreenShareActive(false);
      setShowScreenRecovery(true);
      setActiveAlert('Screen sharing was interrupted! Please restore immediately.');
      updateProctoringScreenShareStatus(session.id, 'INTERRUPTED').catch(console.error);
    };
    screenTrack.addEventListener('ended', handleEnded);
    return () => screenTrack.removeEventListener('ended', handleEnded);
  }, [screenStream, session.id]);

  // Helper to capture a canvas snapshot frame and upload as evidence
  const captureAndUploadSnapshot = async (reason: string, eventId?: number) => {
    if (!cameraStream || !videoRef.current || videoRef.current.readyState < 2) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const b64 = canvas.toDataURL('image/jpeg', 0.8);
        await uploadProctoringEvidence(session.id, b64, 'WEBCAM_SNAPSHOT', eventId, {
          reason,
          timestamp: new Date().toISOString(),
          face_count: faceCount,
        });
      }
    } catch (err) {
      console.warn('Snapshot evidence upload non-fatal error:', err);
    }
  };

  // Background Face Detection & Pose Tracking Loop (throttled to ~750ms interval; skipped if camera bypassed/absent)
  useEffect(() => {
    if (!cameraStream || !cameraStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      return;
    }
    let isCancelled = false;

    const setupLandmarker = async () => {
      try {
        const landmarker = await getFaceLandmarker();
        if (isCancelled) return;

        const loop = (timestamp: number) => {
          if (isCancelled) return;

          // Throttle to every 750ms to keep CPU / battery usage low
          if (timestamp - lastFrameProcessTime.current >= 750) {
            lastFrameProcessTime.current = timestamp;

            if (videoRef.current && videoRef.current.readyState >= 2) {
              const detection = processVideoFrame(landmarker, videoRef.current, timestamp);
              setFaceCount(detection.faceCount);

              // 1. Face Absence Evaluation (>3000ms, 15s cooldown)
              // 1. No Face Evaluation (policy-aware absence threshold, 15s cooldown)
              const faceAbsenceThresholdMs = Math.max(
                3000,
                (session.proctoring_policy?.max_face_absence_seconds || 3) * 1000
              );
              if (detection.faceCount === 0) {
                noFaceDurationRef.current += 750;
                if (noFaceDurationRef.current >= Math.min(faceAbsenceThresholdMs, 3500)) {
                  setActiveAlert('Face not visible! Please look at the camera.');
                }
                if (noFaceDurationRef.current >= faceAbsenceThresholdMs) {
                  setActiveAlert('Face absence threshold exceeded! Please stay visible in front of the camera.');
                  const now = Date.now();
                  if (now - lastFaceNotDetectedSentRef.current >= ANOMALY_COOLDOWN_MS) {
                    lastFaceNotDetectedSentRef.current = now;
                    recordProctoringEvent(session.id, {
                      event_type: 'FACE_NOT_DETECTED',
                      severity: 'WARNING',
                      metadata: { duration_ms: noFaceDurationRef.current },
                    })
                      .then((res) => {
                        setRiskScore(res.risk_score);
                        if (res.auto_submitted && onViolationThresholdExceeded) {
                          onViolationThresholdExceeded(
                            res.auto_submitted_reason || 'Face absence violation limit exceeded.'
                          );
                        }
                      })
                      .catch(console.error);
                  }
                }
              } else {
                if (noFaceDurationRef.current >= 3000) {
                  // Recovered
                  recordProctoringEvent(session.id, {
                    event_type: 'FACE_DETECTED',
                    severity: 'INFO',
                  }).catch(console.error);
                }
                noFaceDurationRef.current = 0;
              }

              // 2. Multiple Faces Evaluation (>2000ms, 15s cooldown)
              if (detection.faceCount > 1) {
                multiFaceDurationRef.current += 750;
                if (multiFaceDurationRef.current >= 2000) {
                  setActiveAlert('Multiple faces detected! Only the registered candidate may be present.');
                  const now = Date.now();
                  if (now - lastMultiFaceSentRef.current >= ANOMALY_COOLDOWN_MS) {
                    lastMultiFaceSentRef.current = now;
                    recordProctoringEvent(session.id, {
                      event_type: 'MULTIPLE_FACES_DETECTED',
                      severity: 'CRITICAL',
                      metadata: { count: detection.faceCount },
                    })
                      .then((res) => {
                        setRiskScore(res.risk_score);
                        // Immediate snapshot evidence capture on multiple faces
                        captureAndUploadSnapshot('multiple_faces_detected', res.event_id);
                        if (res.auto_submitted && onViolationThresholdExceeded) {
                          onViolationThresholdExceeded(
                            res.auto_submitted_reason || 'Multiple faces violation threshold exceeded.'
                          );
                        }
                      })
                      .catch(console.error);
                  }
                }
              } else {
                multiFaceDurationRef.current = 0;
              }

              // 3. Head Pose Deviation Evaluation (>3500ms, 15s cooldown)
              const yawDev = Math.abs(detection.orientation.yaw);
              const pitchDev = Math.abs(detection.orientation.pitch);
              if (yawDev > 25 || pitchDev > 25) {
                poseDevDurationRef.current += 750;
                setPoseDeviated(true);
                if (poseDevDurationRef.current >= 3500) {
                  setActiveAlert('Sustained head turn detected. Please focus on your screen.');
                  const now = Date.now();
                  if (now - lastPoseDevSentRef.current >= ANOMALY_COOLDOWN_MS) {
                    lastPoseDevSentRef.current = now;
                    recordProctoringEvent(session.id, {
                      event_type: 'HEAD_ORIENTATION_DEVIATION',
                      severity: 'WARNING',
                      metadata: { orientation: detection.orientation },
                    }).then((res) => setRiskScore(res.risk_score)).catch(console.error);
                  }
                }
              } else {
                poseDevDurationRef.current = 0;
                setPoseDeviated(false);
              }

              // Clear alert if normal
              if (detection.faceCount === 1 && yawDev <= 25 && pitchDev <= 25 && screenShareActive) {
                setActiveAlert('');
              }

              // 4. Periodic Snapshot every 3 minutes (180,000ms)
              const now = Date.now();
              if (now - lastPeriodicSnapshotRef.current >= 180000) {
                lastPeriodicSnapshotRef.current = now;
                captureAndUploadSnapshot('periodic_routine_audit');
              }
            }
          }

          animFrameRef.current = requestAnimationFrame(loop);
        };

        animFrameRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.warn('Face monitoring loop setup error:', err);
      }
    };

    setupLandmarker();

    return () => {
      isCancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [session.id, screenShareActive, cameraStream]);

  // Browser Integrity Event Listeners
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordProctoringEvent(session.id, {
          event_type: 'TAB_SWITCHED',
          severity: 'WARNING',
          event_id: `tab_switch_${Date.now()}`,
        }).then((res) => setRiskScore(res.risk_score)).catch(console.error);
      } else {
        recordProctoringEvent(session.id, {
          event_type: 'TAB_RETURNED',
          severity: 'INFO',
          event_id: `tab_return_${Date.now()}`,
        }).catch(console.error);
      }
    };

    const handleWindowBlur = () => {
      recordProctoringEvent(session.id, {
        event_type: 'WINDOW_UNFOCUSED',
        severity: 'INFO',
      }).catch(console.error);
    };

    const handleWindowFocus = () => {
      recordProctoringEvent(session.id, {
        event_type: 'WINDOW_FOCUSED',
        severity: 'INFO',
      }).catch(console.error);
    };

    const handleBeforeUnload = () => {
      recordProctoringEvent(session.id, {
        event_type: 'PAGE_UNLOAD_ATTEMPT',
        severity: 'CRITICAL',
      }).catch(console.error);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [session.id]);

  // Camera & Microphone Reconnection Workflow (user-gesture safe)
  const handleReconnectCamera = async () => {
    setReconnectingCamera(true);
    setCameraRecoveryError('');
    try {
      const { stream: newStream, hasAudio } = await acquireCameraAndMicrophoneStream();
      if (cameraStream && cameraStream !== newStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }

      setCameraActive(true);
      setMicActive(hasAudio);
      setShowCameraRecovery(false);
      setActiveAlert('');

      await updateProctoringCameraStatus(session.id, 'ACTIVE');
      recordProctoringEvent(session.id, {
        event_type: 'CAMERA_RECONNECTED',
        severity: 'INFO',
        metadata: { has_audio: hasAudio },
      }).catch(console.error);

      if (onCameraReconnected) {
        onCameraReconnected(newStream);
      }
    } catch (err: any) {
      setCameraRecoveryError(
        err?.name === 'NotAllowedError'
          ? 'Camera/microphone permission was denied or blocked. Please enable permissions in your browser bar and try again.'
          : err?.message || 'Camera reconnection failed. Please ensure your webcam is available and retry.'
      );
    } finally {
      setReconnectingCamera(false);
    }
  };

  // Screen Share Reconnection Workflow
  const handleReconnectScreenShare = async () => {
    setReconnectingScreen(true);
    setRecoveryError('');
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as any,
        audio: false,
      });

      const track = newStream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') {
        newStream.getTracks().forEach((t) => t.stop());
        throw new Error('No active screen video track was selected.');
      }

      if (screenStream && screenStream !== newStream) {
        screenStream.getTracks().forEach((t) => t.stop());
      }

      setScreenShareActive(true);
      setShowScreenRecovery(false);
      setActiveAlert('');

      await updateProctoringScreenShareStatus(session.id, 'ACTIVE');
      recordProctoringEvent(session.id, {
        event_type: 'SCREEN_SHARE_RESTORED',
        severity: 'INFO',
      }).catch(console.error);

      if (onScreenShareReconnected) {
        onScreenShareReconnected(newStream);
      }
    } catch (err: any) {
      setRecoveryError(
        err?.name === 'NotAllowedError'
          ? 'Screen share permission was cancelled or denied. Please choose your entire screen to resume.'
          : err?.message || 'Screen share reconnection failed. Please grant permission to share your screen.'
      );
    } finally {
      setReconnectingScreen(false);
    }
  };

  return (
    <>
      {/* Compact Pinned Widget in Top-Right / Header Area */}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 9990,
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 8px 24px -4px rgba(11, 46, 111, 0.12)',
          padding: '10px',
          width: '160px',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        {/* Webcam Live Thumbnail Preview (or Camera-Waived Sentinel Pill) */}
        {hasLiveCamera ? (
          <div
            style={{
              position: 'relative',
              width: '140px',
              height: '105px',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#0F172A',
              marginBottom: '8px',
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
                transform: 'scaleX(-1)',
              }}
            />

            {/* Sentinel Status Badge overlay */}
            <div
              style={{
                position: 'absolute',
                top: '4px',
                left: '4px',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 800,
                color: '#38BDF8',
                letterSpacing: '0.04em',
              }}
            >
              SENTINEL
            </div>

            {/* Face count indicator */}
            <div
              style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                backgroundColor: faceCount === 1 ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
                color: '#FFFFFF',
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '9px',
                fontWeight: 700,
              }}
            >
              {faceCount === 1 ? '1 Face' : faceCount === 0 ? 'No Face' : `${faceCount} Faces`}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              backgroundColor: '#F0F9FF',
              border: '1px solid #BAE6FD',
              marginBottom: '8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#0369A1', letterSpacing: '0.04em' }}>
              SENTINEL ACTIVE
            </div>
            <div style={{ fontSize: '10px', color: '#0C4A6E', fontWeight: 600, marginTop: '2px' }}>
              {cameraBypassed ? 'Camera Waiver Applied' : 'Screen & Activity Guard'}
            </div>
          </div>
        )}

        {/* Status Indicators Pill */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Camera:</span>
            <span
              style={{
                fontWeight: 700,
                color: cameraActive ? '#16A34A' : cameraBypassed ? '#0284C7' : '#DC2626',
              }}
            >
              {cameraActive ? '● Active' : cameraBypassed ? '● Waived' : '● Offline'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Mic:</span>
            <span
              style={{
                fontWeight: 700,
                color: micActive ? '#16A34A' : cameraBypassed ? '#0284C7' : '#D97706',
              }}
            >
              {micActive ? '● Active' : cameraBypassed ? '● Waived' : '○ Off'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Screen Share:</span>
            <span style={{ fontWeight: 700, color: screenShareActive ? '#16A34A' : '#DC2626' }}>
              {screenShareActive ? '● Sharing' : '● Stopped'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Head Pose:</span>
            <span
              style={{
                fontWeight: 700,
                color: !hasLiveCamera ? '#0284C7' : poseDeviated ? '#D97706' : '#16A34A',
              }}
            >
              {!hasLiveCamera ? '● Waived' : poseDeviated ? '▲ Deviated' : '● Centred'}
            </span>
          </div>

          <div
            style={{
              marginTop: '4px',
              padding: '3px 6px',
              borderRadius: '4px',
              backgroundColor: riskScore < 20 ? '#F0FDF4' : riskScore < 50 ? '#FEFCE8' : '#FEF2F2',
              color: riskScore < 20 ? '#15803D' : riskScore < 50 ? '#A16207' : '#991B1B',
              fontSize: '10px',
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            Security Index: {Math.max(0, 100 - riskScore)}/100
          </div>
        </div>
      </div>

      {/* Floating Active Warning Banner */}
      {activeAlert && !showScreenRecovery && !showCameraRecovery && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9995,
            backgroundColor: '#FEF2F2',
            border: '2px solid #EF4444',
            borderRadius: '12px',
            padding: '12px 24px',
            color: '#991B1B',
            boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            animation: 'pulse 2s infinite',
          }}
        >
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <strong style={{ display: 'block', fontSize: '13px' }}>CSL Sentinel Integrity Notice:</strong>
            <span style={{ fontSize: '12px' }}>{activeAlert}</span>
          </div>
        </div>
      )}

      {/* Mandatory Proctoring Hardware Recovery Modal (Camera/Mic & Screen Share) */}
      {(showScreenRecovery || showCameraRecovery) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: '540px',
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              padding: '32px',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                fontSize: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              {showCameraRecovery && !showScreenRecovery ? '📷' : '🖥️'}
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              {showCameraRecovery && showScreenRecovery
                ? 'Proctoring Streams Interrupted'
                : showCameraRecovery
                ? 'Camera & Microphone Reconnection Required'
                : 'Screen Sharing Interrupted'}
            </h3>
            <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, marginBottom: '20px' }}>
              {showCameraRecovery && cameraRecoveryReason
                ? cameraRecoveryReason
                : 'Your examination proctoring stream has stopped or disconnected (for example, after a page reload or permission change). Restore the required stream(s) below to resume your test.'}
            </p>

            {showCameraRecovery && (
              <div
                style={{
                  marginBottom: showScreenRecovery ? '14px' : '0px',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #FECACA',
                  backgroundColor: '#FEF2F2',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#991B1B', marginBottom: '6px' }}>
                  Camera & Microphone Stream Offline
                </div>
                {cameraRecoveryError && (
                  <div style={{ fontSize: '12px', color: '#B91C1C', marginBottom: '10px' }}>
                    ⚠️ {cameraRecoveryError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleReconnectCamera}
                  disabled={reconnectingCamera}
                  style={{
                    width: '100%',
                    padding: '11px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: reconnectingCamera ? 'wait' : 'pointer',
                  }}
                >
                  {reconnectingCamera ? 'Restoring Camera & Mic...' : 'Restore Camera & Microphone'}
                </button>
              </div>
            )}

            {showScreenRecovery && (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #FECACA',
                  backgroundColor: '#FEF2F2',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#991B1B', marginBottom: '6px' }}>
                  Screen Sharing Stream Offline
                </div>
                {recoveryError && (
                  <div style={{ fontSize: '12px', color: '#B91C1C', marginBottom: '10px' }}>
                    ⚠️ {recoveryError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleReconnectScreenShare}
                  disabled={reconnectingScreen}
                  style={{
                    width: '100%',
                    padding: '11px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: reconnectingScreen ? 'wait' : 'pointer',
                  }}
                >
                  {reconnectingScreen ? 'Connecting...' : 'Reconnect Screen Share Now'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
