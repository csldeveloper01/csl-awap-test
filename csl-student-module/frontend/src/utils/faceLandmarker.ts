import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';

let faceLandmarkerInstance: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

export interface HeadOrientation {
  yaw: number;   // Turning left/right in degrees (-left, +right)
  pitch: number; // Tilting up/down in degrees (+up, -down)
  roll: number;  // Tilting side-to-side in degrees
}

export interface DetectionResult {
  faceCount: number;
  hasFace: boolean;
  orientation: HeadOrientation;
  confidence: number;
  rawLandmarks?: any;
}

/**
 * Initializes and caches the MediaPipe Face Landmarker instance.
 * Runs completely locally in the browser using WebAssembly.
 */
export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarkerInstance) {
    return faceLandmarkerInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 2,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      faceLandmarkerInstance = landmarker;
      return landmarker;
    } catch (err) {
      console.warn('FaceLandmarker GPU initialization fallback to CPU:', err);
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 2,
      });
      faceLandmarkerInstance = landmarker;
      return landmarker;
    }
  })();

  return initPromise;
}

/**
 * Extracts 3D head rotation angles (Yaw, Pitch, Roll) from the 4x4 facial transformation matrix.
 */
export function extractHeadOrientationFromMatrix(matrix: number[]): HeadOrientation {
  if (!matrix || matrix.length < 16) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }
  // MediaPipe transformation matrix is 4x4 column-major:
  // m0  m4  m8  m12
  // m1  m5  m9  m13
  // m2  m6  m10 m14
  // m3  m7  m11 m15
  const m00 = matrix[0];
  const m10 = matrix[1];
  const m20 = matrix[2];
  const m21 = matrix[6];
  const m22 = matrix[10];

  const pitch = Math.atan2(-m21, m22) * (180 / Math.PI);
  const yaw = Math.atan2(m20, Math.sqrt(m21 * m21 + m22 * m22)) * (180 / Math.PI);
  const roll = Math.atan2(-m10, m00) * (180 / Math.PI);

  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
  };
}

/**
 * Geometric fallback estimation from facial landmarks (when matrix is unavailable).
 */
export function estimateOrientationFromLandmarks(landmarks: Array<{ x: number; y: number; z: number }>): HeadOrientation {
  if (!landmarks || landmarks.length < 468) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const forehead = landmarks[10];
  const chin = landmarks[152];

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 0.1;
  const yawOffset = (nose.x - eyeMidX) / eyeDistance;
  const yaw = yawOffset * 65;

  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y) || 0.1;
  const faceMidY = (forehead.y + chin.y) / 2;
  const pitchOffset = (nose.y - faceMidY) / faceHeight;
  const pitch = -pitchOffset * 60;

  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
  };
}

/**
 * Performs detection on the active HTMLVideoElement frame.
 */
export function processVideoFrame(
  landmarker: FaceLandmarker,
  videoElement: HTMLVideoElement,
  timestampMs: number
): DetectionResult {
  if (videoElement.readyState < 2 || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    return {
      faceCount: 0,
      hasFace: false,
      orientation: { yaw: 0, pitch: 0, roll: 0 },
      confidence: 0,
    };
  }

  const result: FaceLandmarkerResult = landmarker.detectForVideo(videoElement, timestampMs);
  const faceCount = result.faceLandmarks ? result.faceLandmarks.length : 0;

  if (faceCount === 0) {
    return {
      faceCount: 0,
      hasFace: false,
      orientation: { yaw: 0, pitch: 0, roll: 0 },
      confidence: 0,
    };
  }

  let orientation: HeadOrientation = { yaw: 0, pitch: 0, roll: 0 };
  if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
    const rawMatrix = Array.from(result.facialTransformationMatrixes[0].data);
    orientation = extractHeadOrientationFromMatrix(rawMatrix);
  } else if (result.faceLandmarks && result.faceLandmarks[0]) {
    orientation = estimateOrientationFromLandmarks(result.faceLandmarks[0]);
  }

  return {
    faceCount,
    hasFace: true,
    orientation,
    confidence: 0.95,
    rawLandmarks: result.faceLandmarks ? result.faceLandmarks[0] : undefined,
  };
}

export type CalibrationPoseStep =
  | 'LOOK_STRAIGHT'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'LOOK_UP'
  | 'LOOK_DOWN'
  | 'RETURN_CENTER';

export interface PoseInstruction {
  step: CalibrationPoseStep;
  title: string;
  instruction: string;
  icon: string;
}

export const CALIBRATION_SEQUENCE: PoseInstruction[] = [
  {
    step: 'LOOK_STRAIGHT',
    title: 'Look Straight at the Camera',
    instruction: 'Keep your face centred in the oval guide and look directly at your webcam.',
    icon: '👀',
  },
  {
    step: 'TURN_LEFT',
    title: 'Turn Head Slightly Left',
    instruction: 'Gently rotate your head toward your left shoulder until confirmed.',
    icon: '👈',
  },
  {
    step: 'TURN_RIGHT',
    title: 'Turn Head Slightly Right',
    instruction: 'Gently rotate your head toward your right shoulder until confirmed.',
    icon: '👉',
  },
  {
    step: 'LOOK_UP',
    title: 'Tilt Head Slightly Upward',
    instruction: 'Tilt your chin upward towards the ceiling slightly.',
    icon: '👆',
  },
  {
    step: 'LOOK_DOWN',
    title: 'Tilt Head Slightly Downward',
    instruction: 'Tilt your chin downward towards your desk slightly.',
    icon: '👇',
  },
  {
    step: 'RETURN_CENTER',
    title: 'Return to Centre',
    instruction: 'Return your head to the neutral straight position.',
    icon: '🎯',
  },
];

/**
 * Checks whether current detection satisfies the active calibration pose requirements.
 */
export function checkPoseMatch(
  step: CalibrationPoseStep,
  current: HeadOrientation,
  baseline: HeadOrientation = { yaw: 0, pitch: 0, roll: 0 }
): boolean {
  const diffYaw = current.yaw - baseline.yaw;
  const diffPitch = current.pitch - baseline.pitch;

  switch (step) {
    case 'LOOK_STRAIGHT':
      // Straight: yaw within +/-15 deg, pitch within +/-15 deg
      return Math.abs(current.yaw) <= 15 && Math.abs(current.pitch) <= 15;

    case 'TURN_LEFT':
      // Webcam can be mirrored; account for negative or positive yaw displacement >= 12 deg
      return Math.abs(diffYaw) >= 12 || Math.abs(current.yaw) >= 14;

    case 'TURN_RIGHT':
      return Math.abs(diffYaw) >= 12 || Math.abs(current.yaw) >= 14;

    case 'LOOK_UP':
      return diffPitch >= 10 || current.pitch >= 10;

    case 'LOOK_DOWN':
      return diffPitch <= -10 || current.pitch <= -10;

    case 'RETURN_CENTER':
      return Math.abs(diffYaw) <= 12 && Math.abs(diffPitch) <= 12;

    default:
      return false;
  }
}
