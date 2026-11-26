import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDevToolsSignals } from '../proctoringSignals.ts';

test('evaluateDevToolsSignals avoids false positives on casual resize or single isolated signal', () => {
  // Single narrow resize or zoom change (no shortcut, no console probe)
  const resizeOnly = evaluateDevToolsSignals({
    outerWidth: 1440,
    innerWidth: 1180,
    outerHeight: 900,
    innerHeight: 820,
    screenWidth: 1440,
    screenHeight: 900,
    recentShortcutTriggered: false,
    consoleProbeTriggered: false,
  });
  assert.equal(resizeOnly.detected, false);
  assert.deepEqual(resizeOnly.signals, ['DOCKED_VIEWPORT_DELTA']);

  // Single accidental key shortcut without docked panel or console probe
  const shortcutOnly = evaluateDevToolsSignals({
    outerWidth: 1440,
    innerWidth: 1424,
    outerHeight: 900,
    innerHeight: 830,
    screenWidth: 1440,
    screenHeight: 900,
    recentShortcutTriggered: true,
    consoleProbeTriggered: false,
  });
  assert.equal(shortcutOnly.detected, false);
  assert.deepEqual(shortcutOnly.signals, ['DEVTOOLS_SHORTCUT_RECENT']);
});

test('evaluateDevToolsSignals confirms when multiple independent signals corroborate', () => {
  const confirmed = evaluateDevToolsSignals({
    outerWidth: 1440,
    innerWidth: 1080,
    outerHeight: 900,
    innerHeight: 820,
    screenWidth: 1440,
    screenHeight: 900,
    recentShortcutTriggered: false,
    consoleProbeTriggered: true,
  });
  assert.equal(confirmed.detected, true);
  assert.equal(confirmed.signals.length, 2);
  assert.ok(confirmed.signals.includes('DOCKED_VIEWPORT_DELTA'));
  assert.ok(confirmed.signals.includes('CONSOLE_INSPECTOR_PROBE'));
});
