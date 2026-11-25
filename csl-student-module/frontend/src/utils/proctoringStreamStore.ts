import { type ProctoringSessionResponse } from '../api/assessment';

let cachedSession: ProctoringSessionResponse | null = null;
let cachedCameraStream: MediaStream | null = null;
let cachedScreenStream: MediaStream | null = null;

// In-flight deduplicators to prevent duplicate permission prompts or concurrent session init calls (e.g., React StrictMode)
const inFlightSessionInits = new Map<string, Promise<ProctoringSessionResponse>>();
let inFlightMediaAcquire: Promise<{ stream: MediaStream; hasAudio: boolean }> | null = null;

export function hasLiveVideoTrack(stream?: MediaStream | null): boolean {
  return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));
}

export function hasLiveAudioTrack(stream?: MediaStream | null): boolean {
  return Boolean(stream && stream.getAudioTracks().some((t) => t.readyState === 'live'));
}

export function setProctoringStreams(
  session: ProctoringSessionResponse,
  camera: MediaStream | null,
  screen: MediaStream | null
): void {
  if (cachedCameraStream && cachedCameraStream !== camera) {
    cachedCameraStream.getTracks().forEach((t) => t.stop());
  }
  if (cachedScreenStream && cachedScreenStream !== screen) {
    cachedScreenStream.getTracks().forEach((t) => t.stop());
  }
  cachedSession = session;
  cachedCameraStream = camera;
  cachedScreenStream = screen;
}

export function getProctoringStreams(): {
  session: ProctoringSessionResponse | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
} {
  const camLive = hasLiveVideoTrack(cachedCameraStream);
  const scLive = hasLiveVideoTrack(cachedScreenStream);

  return {
    session: cachedSession,
    cameraStream: camLive ? cachedCameraStream : null,
    screenStream: scLive ? cachedScreenStream : null,
  };
}

export function updateCachedCameraStream(newStream: MediaStream | null): void {
  if (cachedCameraStream && cachedCameraStream !== newStream) {
    cachedCameraStream.getTracks().forEach((t) => t.stop());
  }
  cachedCameraStream = newStream;
}

export function updateCachedScreenStream(newStream: MediaStream | null): void {
  if (cachedScreenStream && cachedScreenStream !== newStream) {
    cachedScreenStream.getTracks().forEach((t) => t.stop());
  }
  cachedScreenStream = newStream;
}

export function clearProctoringStreams(): void {
  if (cachedCameraStream) {
    cachedCameraStream.getTracks().forEach((t) => t.stop());
    cachedCameraStream = null;
  }
  if (cachedScreenStream) {
    cachedScreenStream.getTracks().forEach((t) => t.stop());
    cachedScreenStream = null;
  }
  cachedSession = null;
  inFlightSessionInits.clear();
}

export async function getOrInitProctoringSession(
  attemptId: string,
  initializer: (attemptId: string) => Promise<ProctoringSessionResponse>
): Promise<ProctoringSessionResponse> {
  if (cachedSession && cachedSession.assessment_session === attemptId) {
    return cachedSession;
  }
  const existing = inFlightSessionInits.get(attemptId);
  if (existing) {
    return existing;
  }
  const promise = initializer(attemptId)
    .then((sess) => {
      cachedSession = sess;
      return sess;
    })
    .finally(() => {
      inFlightSessionInits.delete(attemptId);
    });
  inFlightSessionInits.set(attemptId, promise);
  return promise;
}

export async function getMediaPermissionState(name: 'camera' | 'microphone'): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
    const result = await navigator.permissions.query({ name: name as PermissionName });
    return result.state as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'unknown';
  }
}

/**
 * Acquires (or reuses) a combined Camera + Microphone MediaStream with single-flight locking.
 * Falls back cleanly to video-only if no microphone hardware exists on the system, while
 * never swallowing explicit permission denials (NotAllowedError / PermissionDeniedError).
 */
export async function acquireCameraAndMicrophoneStream(): Promise<{ stream: MediaStream; hasAudio: boolean }> {
  if (hasLiveVideoTrack(cachedCameraStream) && cachedCameraStream) {
    return {
      stream: cachedCameraStream,
      hasAudio: hasLiveAudioTrack(cachedCameraStream),
    };
  }
  if (inFlightMediaAcquire) {
    return inFlightMediaAcquire;
  }

  inFlightMediaAcquire = (async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support webcam and microphone hardware access.');
    }

    try {
      const combined = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: true,
      });
      return { stream: combined, hasAudio: combined.getAudioTracks().some((t) => t.readyState === 'live') };
    } catch (err: any) {
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        throw err;
      }
      // If system has a webcam without an attached microphone, retry video-only once
      if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errName === 'OverconstrainedError' ||
        errName === 'NotReadableError'
      ) {
        const videoOnly = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });
        return { stream: videoOnly, hasAudio: false };
      }
      throw err;
    }
  })().finally(() => {
    inFlightMediaAcquire = null;
  });

  return inFlightMediaAcquire;
}
