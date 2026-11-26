import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateDeviceEligibility,
  MIN_SUPPORTED_HEIGHT,
  MIN_SUPPORTED_WIDTH,
} from '../deviceCheck.ts';

test('deviceCheck rejects mobile phones and tablets including iPadOS masquerade', () => {
  const androidPhone = evaluateDeviceEligibility({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Mobile Safari/537.36',
    innerWidth: 390,
    innerHeight: 844,
    screenWidth: 390,
    screenHeight: 844,
    maxTouchPoints: 5,
    hasTouch: true,
  });
  assert.equal(androidPhone.eligible, false);
  assert.equal(androidPhone.reason, 'mobile');

  const ipadDesktopMask = evaluateDeviceEligibility({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    platform: 'MacIntel',
    innerWidth: 1180,
    innerHeight: 820,
    screenWidth: 1180,
    screenHeight: 820,
    maxTouchPoints: 5,
    hasTouch: true,
  });
  assert.equal(ipadDesktopMask.eligible, false);
  assert.equal(ipadDesktopMask.reason, 'mobile');
});

test('deviceCheck rejects narrow desktop viewports and accepts standard laptops', () => {
  const narrowLaptop = evaluateDeviceEligibility({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
    innerWidth: MIN_SUPPORTED_WIDTH - 64,
    innerHeight: 768,
    screenWidth: 1920,
    screenHeight: 1080,
    maxTouchPoints: 0,
    hasTouch: false,
  });
  assert.equal(narrowLaptop.eligible, false);
  assert.equal(narrowLaptop.reason, 'viewport_small');

  const desktopOk = evaluateDeviceEligibility({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
    innerWidth: MIN_SUPPORTED_WIDTH,
    innerHeight: MIN_SUPPORTED_HEIGHT,
    screenWidth: 1920,
    screenHeight: 1080,
    maxTouchPoints: 0,
    hasTouch: false,
  });
  assert.equal(desktopOk.eligible, true);
});
