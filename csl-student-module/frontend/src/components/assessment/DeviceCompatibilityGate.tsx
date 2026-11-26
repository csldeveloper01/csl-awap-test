import React, { useEffect, useState } from 'react';
import {
  checkDeviceEligibility,
  MIN_SUPPORTED_HEIGHT,
  MIN_SUPPORTED_WIDTH,
  type DeviceEligibilityResult,
} from '../../utils/deviceCheck';

interface DeviceCompatibilityGateProps {
  children: React.ReactNode;
  bypass?: boolean;
  minWidth?: number;
  minHeight?: number;
  contextLabel?: string;
}

/**
 * Blocks candidate assessment workflows on phones, tablets, or narrow browser windows
 * below laptop resolution (1024x600 by default). Keeps Admin simulation bypassable.
 */
export const DeviceCompatibilityGate: React.FC<DeviceCompatibilityGateProps> = ({
  children,
  bypass = false,
  minWidth = MIN_SUPPORTED_WIDTH,
  minHeight = MIN_SUPPORTED_HEIGHT,
  contextLabel = 'CSL Assessment Portal',
}) => {
  const [eligibility, setEligibility] = useState<DeviceEligibilityResult>(() =>
    checkDeviceEligibility(minWidth, minHeight)
  );

  useEffect(() => {
    if (bypass) return;
    const sync = () => setEligibility(checkDeviceEligibility(minWidth, minHeight));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [bypass, minWidth, minHeight]);

  if (bypass || eligibility.eligible) {
    return <>{children}</>;
  }

  const isMobile = eligibility.reason === 'mobile';

  return (
    <div
      data-testid="device-compatibility-gate"
      data-reason={eligibility.reason || 'unsupported'}
      style={{
        minHeight: '100vh',
        width: '100%',
        background: 'linear-gradient(160deg, #F8FAFC 0%, #EEF2FF 100%)',
        padding: '24px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #CBD5E1',
          boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.14)',
          padding: '32px 28px',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: isMobile ? '#FEF2F2' : '#FFFBEB',
            border: `2px solid ${isMobile ? '#FECACA' : '#FDE68A'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px',
          }}
        >
          {isMobile ? '💻' : '🖥️'}
        </div>

        <span
          style={{
            display: 'inline-block',
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '4px 12px',
            borderRadius: '9999px',
            backgroundColor: '#EFF6FF',
            color: '#1D4ED8',
            marginBottom: '12px',
          }}
        >
          {contextLabel} — Laptop / Desktop Required
        </span>

        <h1
          style={{
            margin: '0 0 10px 0',
            fontSize: '21px',
            fontWeight: 800,
            color: '#0F172A',
            lineHeight: 1.3,
          }}
        >
          {isMobile
            ? 'Mobile & Tablet Devices Are Not Supported'
            : 'Please Maximize Your Browser Window'}
        </h1>

        <p
          style={{
            margin: '0 0 20px 0',
            fontSize: '13.5px',
            color: '#475569',
            lineHeight: 1.65,
          }}
        >
          {isMobile
            ? 'Candidate registration, Sentinel camera proctoring, and coding execution require a laptop or desktop computer with a physical keyboard and pointer device.'
            : `Your browser viewport is currently ${eligibility.currentWidth} × ${eligibility.currentHeight}px. The assessment workspace requires at least ${eligibility.minWidth} × ${eligibility.minHeight}px.`}
        </p>

        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '20px',
            fontSize: '12.5px',
            color: '#334155',
            textAlign: 'left',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Detected Viewport</div>
            <strong>
              {eligibility.currentWidth} × {eligibility.currentHeight}px
            </strong>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Minimum Required</div>
            <strong>
              {eligibility.minWidth} × {eligibility.minHeight}px
            </strong>
          </div>
        </div>

        <button
          type="button"
          data-testid="device-gate-recheck-btn"
          onClick={() => setEligibility(checkDeviceEligibility(minWidth, minHeight))}
          style={{
            width: '100%',
            padding: '11px 18px',
            borderRadius: '9px',
            border: 'none',
            backgroundColor: '#1455D9',
            color: '#FFFFFF',
            fontSize: '13.5px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Re-check Display Compatibility
        </button>

        <p style={{ margin: '14px 0 0 0', fontSize: '11px', color: '#94A3B8', lineHeight: 1.45 }}>
          Tip: Close split-screen views or switch to a laptop/desktop browser. Note: Client-side viewport and browser checks enforce UI compatibility and do not prevent intentional user-agent spoofing.
        </p>
      </div>
    </div>
  );
};
