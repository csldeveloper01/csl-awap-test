/**
 * Device and Viewport Eligibility Utility for CSL Initial Assessment
 * 
 * Requirement: The assessment is designed and restricted for laptop/desktop use.
 * Detects small-screen/mobile contexts and unsuitable viewport dimensions.
 */

export const MIN_SUPPORTED_WIDTH = 1024;
export const MIN_SUPPORTED_HEIGHT = 600;

export interface DeviceEligibilityResult {
  eligible: boolean;
  reason?: 'mobile' | 'viewport_small';
  currentWidth: number;
  currentHeight: number;
  minWidth: number;
  minHeight: number;
  detectedPlatformLabel?: string;
}

export interface DeviceCheckEnvironment {
  userAgent: string;
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  maxTouchPoints: number;
  hasTouch: boolean;
  platform?: string;
}

/**
 * Pure device/viewport eligibility evaluator (testable cleanly without DOM).
 * Note: Client-side UA/viewport inspection is a compatibility & usability safeguard;
 * it cannot prevent deliberate browser spoofing on unmanaged client devices.
 */
export function evaluateDeviceEligibility(
  env: DeviceCheckEnvironment,
  minWidth: number = MIN_SUPPORTED_WIDTH,
  minHeight: number = MIN_SUPPORTED_HEIGHT
): DeviceEligibilityResult {
  const ua = (env.userAgent || '').toLowerCase();
  const platform = (env.platform || '').toLowerCase();

  // Explicit mobile & tablet OS patterns
  const isMobileOrTabletUA =
    /android|iphone|ipad|ipod|blackberry|windows phone|iemobile|opera mini|tablet|playbook|silk|kindle/i.test(
      ua
    );

  // iPadOS Safari frequently masks UA as Macintosh while exposing multi-touch capability
  const isIPadDesktopMasquerade =
    (ua.includes('macintosh') || platform.includes('macintel')) && env.maxTouchPoints > 1;

  // Touch-primary small physical display (phones / compact tablets)
  const isSmallScreenTouch =
    (env.hasTouch || env.maxTouchPoints > 1) &&
    (env.screenWidth < 1024 || env.screenHeight < 600);

  if (isMobileOrTabletUA || isIPadDesktopMasquerade || isSmallScreenTouch) {
    return {
      eligible: false,
      reason: 'mobile',
      currentWidth: env.innerWidth,
      currentHeight: env.innerHeight,
      minWidth,
      minHeight,
      detectedPlatformLabel: isIPadDesktopMasquerade
        ? 'Tablet / iPad Touch Device'
        : isMobileOrTabletUA
        ? 'Mobile / Tablet Browser'
        : 'Small Touch Screen',
    };
  }

  if (env.innerWidth < minWidth || env.innerHeight < minHeight) {
    return {
      eligible: false,
      reason: 'viewport_small',
      currentWidth: env.innerWidth,
      currentHeight: env.innerHeight,
      minWidth,
      minHeight,
      detectedPlatformLabel: 'Undersized Desktop Browser Window',
    };
  }

  return {
    eligible: true,
    currentWidth: env.innerWidth,
    currentHeight: env.innerHeight,
    minWidth,
    minHeight,
    detectedPlatformLabel: 'Laptop / Desktop Display',
  };
}

export function checkDeviceEligibility(
  minWidth: number = MIN_SUPPORTED_WIDTH,
  minHeight: number = MIN_SUPPORTED_HEIGHT
): DeviceEligibilityResult {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      eligible: true,
      currentWidth: minWidth,
      currentHeight: minHeight,
      minWidth,
      minHeight,
    };
  }

  return evaluateDeviceEligibility(
    {
      userAgent: navigator.userAgent || '',
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: window.screen?.width ?? window.innerWidth,
      screenHeight: window.screen?.height ?? window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      hasTouch: 'ontouchstart' in window,
      platform: navigator.platform || '',
    },
    minWidth,
    minHeight
  );
}
