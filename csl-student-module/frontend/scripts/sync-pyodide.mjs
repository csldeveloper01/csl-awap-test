import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(frontendRoot, 'node_modules', 'pyodide');
const destDir = path.join(frontendRoot, 'public', 'pyodide');

const RUNTIME_FILES = [
  'pyodide.mjs',
  'pyodide.js',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
];

if (!fs.existsSync(sourceDir)) {
  console.warn('[sync-pyodide] node_modules/pyodide not found; skipping asset sync.');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const file of RUNTIME_FILES) {
  const src = path.join(sourceDir, file);
  const dst = path.join(destDir, file);
  if (!fs.existsSync(src)) {
    console.warn(`[sync-pyodide] Missing ${src}`);
    continue;
  }
  const srcStat = fs.statSync(src);
  const needsCopy =
    !fs.existsSync(dst) || fs.statSync(dst).size !== srcStat.size;
  if (needsCopy) {
    fs.copyFileSync(src, dst);
    copied += 1;
  }
}

console.log(`[sync-pyodide] Synced ${copied} updated Pyodide runtime asset(s) to public/pyodide/.`);
