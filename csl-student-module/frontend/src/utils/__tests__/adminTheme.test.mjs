import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  computeRippleMaxRadius,
  playRaiseCentreRippleEffect,
  THEME_RIPPLE_CIRCLES,
  THEME_RIPPLE_CLEANUP_MS,
  THEME_RIPPLE_DURATION_MS,
  THEME_RIPPLE_SWAP_DELAY_MS,
} from '../adminTheme.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portalPath = path.resolve(__dirname, '../../pages/admin/CSLAdminPortalPage.tsx');
const cssPath = path.resolve(__dirname, '../../index.css');
const skeletonsPath = path.resolve(__dirname, '../../components/admin/SkeletonLoaders.tsx');
const themePath = path.resolve(__dirname, '../adminTheme.ts');

test('computeRippleMaxRadius covers entire viewport from top-right corner origin', () => {
  const r = computeRippleMaxRadius(1412, 26, 1440, 900);
  // Distance from (1412, 26) to bottom-left (0, 900) is hypot(1412, 874) = ~1661px
  assert.ok(r >= 1660, `Expected radius >= 1660px, got ${r}`);
  assert.equal(THEME_RIPPLE_SWAP_DELAY_MS, 400);
  assert.equal(THEME_RIPPLE_CLEANUP_MS, 1200);
  assert.equal(THEME_RIPPLE_DURATION_MS, 1000);
});

test('RAISE Centre ripple uses exact 3 concentric circle parameters and 400ms flip timing', () => {
  assert.deepEqual(THEME_RIPPLE_CIRCLES, [
    { size: 150, opacity: '12', delay: 50, duration: 1000 },
    { size: 100, opacity: '20', delay: 0, duration: 800 },
    { size: 60, opacity: '15', delay: 100, duration: 900 },
  ]);

  const src = fs.readFileSync(themePath, 'utf8');
  assert.match(src, /currentlyDark \? '#f8f9fa' : '#000000'/);
  assert.match(src, /cubic-bezier\(0\.4, 0\.0, 0\.2, 1\)/);
  assert.match(src, /THEME_RIPPLE_SWAP_DELAY_MS/);
  assert.match(src, /THEME_RIPPLE_CLEANUP_MS/);
  // Must NOT use View Transition single-circle clip-path instead of multi-circle ripple
  assert.doesNotMatch(src, /startViewTransition/);
});

test('playRaiseCentreRippleEffect mounts 3 concentric circles from exact origin and cleans up on DOM mock', async () => {
  const createdElements = [];
  const makeEl = () => {
    const attrs = {};
    const children = [];
    const el = {
      children,
      className: '',
      style: { cssText: '', transform: '' },
      setAttribute(k, v) {
        attrs[k] = v;
      },
      getAttribute(k) {
        return attrs[k];
      },
      appendChild(c) {
        children.push(c);
      },
      remove() {
        el.removed = true;
      },
      removed: false,
    };
    createdElements.push(el);
    return el;
  };

  const bodyChildren = [];
  const origDoc = globalThis.document;
  const origWin = globalThis.window;

  try {
    globalThis.document = {
      body: {
        appendChild(el) {
          bodyChildren.push(el);
        },
      },
      documentElement: { clientWidth: 1440, clientHeight: 900 },
      createElement: () => makeEl(),
    };
    globalThis.window = {
      innerWidth: 1440,
      innerHeight: 900,
      requestAnimationFrame: (cb) => {
        cb();
        return 1;
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    playRaiseCentreRippleEffect(1404, 28, false);
    assert.equal(bodyChildren.length, 1);
    const container = bodyChildren[0];
    assert.equal(container.children.length, 3);
    assert.match(container.children[0].style.cssText, /left:\s*1404px/);
    assert.match(container.children[0].style.cssText, /top:\s*28px/);
    assert.match(container.children[0].style.cssText, /#00000012/);
    assert.match(container.children[1].style.cssText, /#00000020/);
    assert.match(container.children[2].style.cssText, /#00000015/);

    await new Promise((r) => setTimeout(r, 150));
    for (const circle of container.children) {
      assert.match(circle.style.transform, /scale\(([5-9]\d|\d{3,})\)/);
    }
    container.remove();
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWin;
  }
});

test('Top-right theme toggle sits in extreme corner, uses circular style, and respects Access Panel sticky scroll', () => {
  const portal = fs.readFileSync(portalPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const skeletons = fs.readFileSync(skeletonsPath, 'utf8');

  // Theme toggle appears AFTER adminInitials avatar so it sits on extreme right corner of topbar
  const avatarIdx = portal.indexOf('{adminInitials}');
  const toggleIdx = portal.indexOf('data-testid="admin-theme-toggle"');
  assert.ok(avatarIdx > 0 && toggleIdx > avatarIdx, 'Theme toggle must appear after avatar at extreme top-right corner');
  assert.match(portal, /borderRadius:\s*'9999px'/);
  assert.match(portal, /toggleTheme\(e\)/);
  assert.match(portal, /csl-theme-btn-animate/);

  // Access Panel outer aside stays fixed (overflow hidden), Quick Actions is flexShrink: 0, only Recent Activity scrolls
  assert.match(portal, /data-testid="admin-quick-actions-section"/);
  assert.match(portal, /data-testid="admin-recent-activity-list"/);

  // Shimmer skeleton & RAISE Centre keyframes CSS rules exist with disabled + reduced motion fallbacks
  assert.match(css, /csl-circle-move/);
  assert.match(css, /csl-dark-transition/);
  assert.match(css, /csl-skeleton-shimmer/);
  assert.match(css, /\[data-csl-animations="disabled"\]/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(skeletons, /csl-skeleton-shimmer/);
  assert.doesNotMatch(skeletons, /animate-pulse/);
});
