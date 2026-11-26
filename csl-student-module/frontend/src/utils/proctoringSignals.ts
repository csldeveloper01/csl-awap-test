/**
 * Multi-signal DevTools & integrity policy evaluator.
 * Requires corroboration (>= 2 independent signals or repeated detection across frames)
 * so casual window resizes or zoom changes do not create false positives.
 */

export interface DevToolsSignalSample {
  outerWidth: number;
  innerWidth: number;
  outerHeight: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  recentShortcutTriggered: boolean;
  consoleProbeTriggered: boolean;
  thresholdPx?: number;
}

export interface DevToolsEvaluationResult {
  detected: boolean;
  signals: string[];
  widthDelta: number;
  heightDelta: number;
}

export function evaluateDevToolsSignals(sample: DevToolsSignalSample): DevToolsEvaluationResult {
  const threshold = sample.thresholdPx ?? 180;
  const widthDelta = Math.max(0, (sample.outerWidth || 0) - (sample.innerWidth || 0));
  const heightDelta = Math.max(0, (sample.outerHeight || 0) - (sample.innerHeight || 0));

  const dockedGapSuspect =
    (widthDelta >= threshold || heightDelta >= threshold) &&
    sample.innerWidth > 0 &&
    sample.innerHeight > 0 &&
    (sample.innerWidth < sample.screenWidth || sample.innerHeight < sample.screenHeight);

  const signals: string[] = [];
  if (dockedGapSuspect) signals.push('DOCKED_VIEWPORT_DELTA');
  if (sample.recentShortcutTriggered) signals.push('DEVTOOLS_SHORTCUT_RECENT');
  if (sample.consoleProbeTriggered) signals.push('CONSOLE_INSPECTOR_PROBE');

  // Corroboration rule: either docked dimension gap paired with another signal,
  // or explicit console inspector probe paired with shortcut/dimension anomaly.
  const detected = signals.length >= 2;
  return {
    detected,
    signals,
    widthDelta,
    heightDelta,
  };
}
