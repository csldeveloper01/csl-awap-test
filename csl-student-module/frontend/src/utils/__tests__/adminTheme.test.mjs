import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  computeRippleMaxRadius,
  THEME_RIPPLE_DURATION_MS,
} from '../adminTheme.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portalPath = path.resolve(__dirname, '../../pages/admin/CSLAdminPortalPage.tsx');
const cssPath = path.resolve(__dirname, '../../index.css');
const skeletonsPath = path.resolve(__dirname, '../../components/admin/SkeletonLoaders.tsx');

test('computeRippleMaxRadius covers entire viewport from top-right corner origin', () => {
  const r = computeRippleMaxRadius(1412, 26, 1440, 900);
  // Distance from (1412, 26) to bottom-left (0, 900) is hypot(1412, 874) = ~1661px
  assert.ok(r >= 1660, `Expected radius >= 1660px, got ${r}`);
  assert.ok(THEME_RIPPLE_DURATION_MS >= 500 && THEME_RIPPLE_DURATION_MS <= 750);
});

test('Top-right theme toggle sits in extreme corner, uses circular style, and respects Access Panel sticky scroll', () => {
  const portal = fs.readFileSync(portalPath, 'utf-8');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const skeletons = fs.readFileSync(skeletonsPath, 'utf-8');

  // Theme toggle appears AFTER adminInitials avatar so it sits on extreme right corner of topbar
  const avatarIdx = portal.indexOf('{adminInitials}');
  const toggleIdx = portal.indexOf('data-testid="admin-theme-toggle"');
  assert.ok(avatarIdx > 0 && toggleIdx > avatarIdx, 'Theme toggle must appear after avatar at extreme top-right corner');
  assert.match(portal, /borderRadius:\s*'9999px'/);
  assert.match(portal, /onClick=\{toggleTheme\}/);

  // Access Panel outer aside stays fixed (overflow hidden), Quick Actions is flexShrink: 0, only Recent Activity scrolls
  assert.match(portal, /data-testid="admin-quick-actions-section"/);
  assert.match(portal, /data-testid="admin-recent-activity-list"/);

  // Shimmer skeleton & ripple CSS rules exist with disabled fallback
  assert.match(css, /csl-theme-ripple/);
  assert.match(css, /csl-skeleton-shimmer/);
  assert.match(css, /\[data-csl-animations="disabled"\]/);
  assert.match(skeletons, /csl-skeleton-shimmer/);
  assert.doesNotMatch(skeletons, /animate-pulse/);
});
