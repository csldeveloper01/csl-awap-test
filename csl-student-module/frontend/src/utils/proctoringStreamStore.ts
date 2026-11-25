import { type ProctoringSessionResponse } from '../api/assessment';

let cachedSession: ProctoringSessionResponse | null = null;
let cachedCameraStream: MediaStream | null = null;
let cachedScreenStream: MediaStream | null = null;

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
  // Check if existing tracks are still live
  const camLive = cachedCameraStream && cachedCameraStream.getVideoTracks().some((t) => t.readyState === 'live');
  const scLive = cachedScreenStream && cachedScreenStream.getVideoTracks().some((t) => t.readyState === 'live');

  return {
    session: cachedSession,
    cameraStream: camLive ? cachedCameraStream : null,
    screenStream: scLive ? cachedScreenStream : null,
  };
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
}
