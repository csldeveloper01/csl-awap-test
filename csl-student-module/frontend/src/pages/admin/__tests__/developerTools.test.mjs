import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devToolsPath = path.resolve(__dirname, '../AdminDeveloperToolsView.tsx');
const portalPath = path.resolve(__dirname, '../CSLAdminPortalPage.tsx');

test('AdminDeveloperToolsView enforces authorization and complete browser execution isolation', () => {
  const source = fs.readFileSync(devToolsPath, 'utf-8');
  const portalSource = fs.readFileSync(portalPath, 'utf-8');

  // Must gate rendering on isAuthorizedAdmin
  assert.match(source, /if\s*\(!isAuthorizedAdmin\)/);

  // Must instantiate its own isolated BrowserCodeExecutionAdapter instead of shared candidate singleton or Judge0/backend endpoints
  assert.match(source, /new BrowserCodeExecutionAdapter\(\)/);
  assert.doesNotMatch(source, /sharedBrowserExecutionAdapter/);
  assert.doesNotMatch(source, /\/code\/submit\//);
  assert.doesNotMatch(source, /\/code\/evaluation-cases\//);
  assert.doesNotMatch(source, /\/assessment\/attempts\//);
  assert.doesNotMatch(source, /judge0/i);

  // Must be registered in Admin Portal nav & route switch behind isAuthorizedAdmin
  assert.match(portalSource, /key:\s*'devtools'/);
  assert.match(portalSource, /activeTab === 'devtools'/);
  assert.match(portalSource, /isAuthorizedAdmin=\{Boolean\(/);
});
