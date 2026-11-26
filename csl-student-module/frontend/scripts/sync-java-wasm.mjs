import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const pkgRoot = path.join(frontendRoot, 'node_modules', '@live-codes', 'java-wasm');
const distDir = path.join(pkgRoot, 'dist');
const destDir = path.join(frontendRoot, 'public', 'java-wasm');

if (!fs.existsSync(distDir)) {
  console.warn('[sync-java-wasm] node_modules/@live-codes/java-wasm/dist not found; skipping asset sync.');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(path.join(destDir, 'teavm'), { recursive: true });

let updated = 0;

function syncFile(srcPath, dstPath, transform) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`[sync-java-wasm] Missing ${srcPath}`);
    return;
  }
  if (transform) {
    const raw = fs.readFileSync(srcPath, 'utf8');
    const next = transform(raw);
    const existing = fs.existsSync(dstPath) ? fs.readFileSync(dstPath, 'utf8') : null;
    if (existing !== next) {
      fs.writeFileSync(dstPath, next, 'utf8');
      updated += 1;
    }
    return;
  }
  const srcStat = fs.statSync(srcPath);
  const needsCopy = !fs.existsSync(dstPath) || fs.statSync(dstPath).size !== srcStat.size;
  if (needsCopy) {
    fs.copyFileSync(srcPath, dstPath);
    updated += 1;
  }
}

// Worker script: allow arbitrary public class filename (e.g. Solution.java, Main.java)
// while keeping javac + TeaVM offline WasmGC behavior untouched.
syncFile(path.join(distDir, 'worker-java.js'), path.join(destDir, 'worker-java.js'), (src) =>
  src.replace(
    'o.addSourceFile("Main.java",t)',
    'o.addSourceFile((e||"Main")+".java",t)'
  )
);

// Preserve Apache-2.0 & GPLv2+Classpath Exception notices alongside the static runtime assets
syncFile(path.join(pkgRoot, 'LICENSE'), path.join(destDir, 'LICENSE'));
syncFile(path.join(pkgRoot, 'THIRD-PARTY-NOTICES.md'), path.join(destDir, 'THIRD-PARTY-NOTICES.md'));

const teavmDir = path.join(distDir, 'teavm');
if (fs.existsSync(teavmDir)) {
  for (const name of fs.readdirSync(teavmDir)) {
    const src = path.join(teavmDir, name);
    if (fs.statSync(src).isFile()) {
      syncFile(src, path.join(destDir, 'teavm', name));
    }
  }
}

console.log(`[sync-java-wasm] Synced ${updated} updated Java Wasm asset(s) to public/java-wasm/.`);
