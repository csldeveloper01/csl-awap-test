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

// Worker script: allow arbitrary public class filename (e.g. Solution.java, Main.java),
// serialize init/warmup/run operations, honor per-run execution timeoutMs independently
// from compile/WasmGC generation, correlate requestId, and emit optional phase telemetry.
syncFile(path.join(distDir, 'worker-java.js'), path.join(destDir, 'worker-java.js'), (src) => {
  let out = src;

  const replaceExact = (target, replacement, label) => {
    if (!out.includes(target)) {
      throw new Error(`[sync-java-wasm] Expected pattern not found for ${label}`);
    }
    out = out.replace(target, replacement);
  };

  replaceExact(
    'o.addSourceFile("Main.java",t)',
    'o.addSourceFile((e||"Main")+".java",t)',
    'dynamic MainClass source file'
  );

  replaceExact(
    'function mt(t,e,r="posix"){',
    'function mt(t,e,r="posix",_reqId=null,_execTimeoutMs=0,_emitPhases=!1){',
    'mt signature'
  );

  replaceExact(
    'if(typeof l.main!="function")throw new Error("generated program did not export main()");let d=()=>{',
    'if(typeof l.main!="function")throw new Error("generated program did not export main()");if(_emitPhases)self.postMessage({type:"phase",requestId:_reqId,phase:"RUNNING"});let _execLimit=_execTimeoutMs>0?_execTimeoutMs:Me;let d=()=>{',
    'mt RUNNING phase & limit'
  );

  replaceExact(
    'if(performance.now()-w>Me)throw new Error(`program did not finish within ${Me} ms`);',
    'if(performance.now()-w>_execLimit)throw new Error(`program did not finish within ${_execLimit} ms`);',
    'mt timeout check'
  );

  replaceExact(
    'function pt(t,e,r,s="posix"){let o=z,c=performance.now();o.clearSourceFiles(),o.addSourceFile((e||"Main")+".java",t),B=[];let i=o.compile(),p=performance.now()-c;if(!i)return{ok:!1,compileMs:p,exitCode:1,stdout:"",stderr:ie(),diagnostics:[...B]};let l=performance.now(),d=o.generateWebAssembly({outputName:"app",mainClass:e,optimizationLevel:"SIMPLE"}),w=performance.now()-l;if(!d)return{ok:!1,compileMs:p,generateMs:w,exitCode:1,stdout:"",stderr:ie(),diagnostics:[...B]};let g=o.getWebAssemblyOutputFile("app.wasm");if(!g)return{ok:!1,compileMs:p,generateMs:w,exitCode:1,stdout:"",stderr:ie()||"compiler produced no WebAssembly output",diagnostics:[...B]};let{stdout:x,stderr:k,runMs:b,error:v}=await mt(g,r,s);return{ok:v==null,compileMs:p,generateMs:w,runMs:b,exitCode:v==null?0:1,stdout:x,stderr:k,diagnostics:[...B]}}',
    'function pt(t,e,r,s="posix",_reqId=null,_execTimeoutMs=0,_emitPhases=!1){let o=z,c=performance.now();o.clearSourceFiles(),o.addSourceFile((e||"Main")+".java",t),B=[];if(_emitPhases)self.postMessage({type:"phase",requestId:_reqId,phase:"COMPILING"});let i=o.compile(),p=performance.now()-c;if(!i)return{ok:!1,phase:"COMPILATION_ERROR",compileMs:p,exitCode:1,stdout:"",stderr:ie(),diagnostics:[...B]};if(_emitPhases)self.postMessage({type:"phase",requestId:_reqId,phase:"GENERATING_WASM",compileMs:p});let l=performance.now(),d=o.generateWebAssembly({outputName:"app",mainClass:e,optimizationLevel:"SIMPLE"}),w=performance.now()-l;if(!d)return{ok:!1,phase:"COMPILATION_ERROR",compileMs:p,generateMs:w,exitCode:1,stdout:"",stderr:ie(),diagnostics:[...B]};let g=o.getWebAssemblyOutputFile("app.wasm");if(!g)return{ok:!1,phase:"COMPILATION_ERROR",compileMs:p,generateMs:w,exitCode:1,stdout:"",stderr:ie()||"compiler produced no WebAssembly output",diagnostics:[...B]};if(_emitPhases)self.postMessage({type:"phase",requestId:_reqId,phase:"INSTANTIATING",compileMs:p,generateMs:w});let{stdout:x,stderr:k,runMs:b,error:v}=await mt(g,r,s,_reqId,_execTimeoutMs,_emitPhases);return{ok:v==null,phase:v==null?"ACCEPTED":(String(v).includes("did not finish within")?"TIME_LIMIT_EXCEEDED":"RUNTIME_ERROR"),compileMs:p,generateMs:w,runMs:b,exitCode:v==null?0:1,error:v,stdout:x,stderr:k,diagnostics:[...B]}}',
    'pt pipeline instrumentation'
  );

  replaceExact(
    'self.onmessage=async t=>{let{cmd:e}=t.data||{};if(e==="init"){let r=performance.now();try{let s=t.data.baseUrl||(()=>{try{return new URL(".",self.location.href).href}catch(o){throw new Error("java worker: baseUrl is required when loaded from a blob/data URL")}})();ce=t.data.persistFiles===!0,await ot(s),self.postMessage({type:"initialized",initMs:performance.now()-r})}catch(s){self.postMessage({type:"init-error",error:String((s==null?void 0:s.message)||s)})}return}if(e==="run")try{let r=await pt(t.data.source,t.data.mainClass||"Main",t.data.input||"",t.data.platform||"posix");self.postMessage({type:"result",...r})}catch(r){self.postMessage({type:"result",ok:!1,error:String((r==null?void 0:r.message)||r)+`\n`+String((r==null?void 0:r.stack)||""),exitCode:1})}};',
    'let _workerQueue=Promise.resolve();self.onmessage=t=>{let _run=_workerQueue.then(async()=>{let{cmd:e}=t.data||{};if(e==="init"){let r=performance.now();try{let s=t.data.baseUrl||(()=>{try{return new URL(".",self.location.href).href}catch(o){throw new Error("java worker: baseUrl is required when loaded from a blob/data URL")}})();ce=t.data.persistFiles===!0,await ot(s),self.postMessage({type:"initialized",requestId:t.data.requestId??null,initMs:performance.now()-r})}catch(s){self.postMessage({type:"init-error",requestId:t.data.requestId??null,error:String((s==null?void 0:s.message)||s)})}return}if(e==="warmup"){let _wt=performance.now();try{await pt("class __CslWarmup{public static void main(String[]a){}}","__CslWarmup","","posix",null,5000,!1);self.postMessage({type:"warmed",ok:!0,requestId:t.data.requestId??null,warmupMs:performance.now()-_wt})}catch(s){self.postMessage({type:"warmed",ok:!1,requestId:t.data.requestId??null,error:String((s==null?void 0:s.message)||s)})}return}if(e==="run")try{let r=await pt(t.data.source,t.data.mainClass||"Main",t.data.input||"",t.data.platform||"posix",t.data.requestId??null,Number(t.data.timeoutMs||0),t.data.emitPhases===!0);self.postMessage({type:"result",requestId:t.data.requestId??null,...r})}catch(r){self.postMessage({type:"result",requestId:t.data.requestId??null,phase:"RUNTIME_ERROR",ok:!1,error:String((r==null?void 0:r.message)||r)+`\n`+String((r==null?void 0:r.stack)||""),exitCode:1})}});_workerQueue=_run.catch(()=>{});return _run;};',
    'self.onmessage queue & requestId correlation'
  );

  return out;
});

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
