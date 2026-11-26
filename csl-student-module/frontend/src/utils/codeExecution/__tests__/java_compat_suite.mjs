import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..', '..', '..', '..');
const publicJavaWasmDir = path.join(frontendRoot, 'public', 'java-wasm');
const workerScriptPath = path.join(publicJavaWasmDir, 'worker-java.js');

function createPublicWorkerHarness() {
  const workerSource = fs.readFileSync(workerScriptPath, 'utf8');
  const listeners = [];

  const localFetch = async (url) => {
    const cleanPath = String(url).replace('https://local.csl.test/java-wasm/', '');
    const fullPath = path.join(publicJavaWasmDir, cleanPath);
    if (!fs.existsSync(fullPath)) {
      return new Response(new Uint8Array(0), { status: 404 });
    }
    const buf = fs.readFileSync(fullPath);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': cleanPath.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
      },
    });
  };

  const activeTimers = new Set();
  const trackTimeout = (fn, ms, ...args) => {
    const id = setTimeout(() => {
      activeTimers.delete(id);
      fn(...args);
    }, ms);
    activeTimers.add(id);
    return id;
  };
  const untrackTimeout = (id) => {
    activeTimers.delete(id);
    clearTimeout(id);
  };

  const sandbox = {
    URL,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Int8Array,
    ArrayBuffer,
    WebAssembly,
    Response,
    Promise,
    Map,
    WeakMap,
    WeakRef,
    FinalizationRegistry,
    WeakSet,
    Symbol,
    Proxy,
    Reflect,
    Math,
    Date,
    Error,
    TypeError,
    BigInt,
    Function,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    setTimeout: trackTimeout,
    clearTimeout: untrackTimeout,
    console,
    performance,
    fetch: localFetch,
    indexedDB: undefined,
    require: () => {
      throw new Error('Unexpected CommonJS require inside browser worker');
    },
    self: {
      location: { href: 'https://local.csl.test/java-wasm/worker-java.js' },
      postMessage(msg) {
        for (const fn of listeners) fn({ data: msg });
      },
      onmessage: null,
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(workerSource, sandbox);

  function callWorker(payload) {
    return new Promise((resolve) => {
      const handler = (event) => {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
        resolve(event.data);
      };
      listeners.push(handler);
      sandbox.self.onmessage({ data: payload });
    });
  }

  return { workerSource, callWorker };
}

test('Synced public/java-wasm assets include patched dynamic MainClass filename support', () => {
  assert.ok(fs.existsSync(workerScriptPath), 'public/java-wasm/worker-java.js must exist');
  assert.ok(fs.existsSync(path.join(publicJavaWasmDir, 'teavm', 'compiler.wasm')), 'compiler.wasm must exist');
  assert.ok(fs.existsSync(path.join(publicJavaWasmDir, 'teavm', 'compile-classlib-teavm.bin')), 'compile-classlib-teavm.bin must exist');
  assert.ok(fs.existsSync(path.join(publicJavaWasmDir, 'teavm', 'runtime-classlib-teavm.bin')), 'runtime-classlib-teavm.bin must exist');
  const src = fs.readFileSync(workerScriptPath, 'utf8');
  assert.match(src, /addSourceFile\(\(e\|\|"Main"\)\+"\.java",t\)/);
});

test('Java TeaVM WASM worker passes 25-case compatibility suite + CSL sample coding problems', async () => {
  const { callWorker } = createPublicWorkerHarness();
  const initRes = await callWorker({
    cmd: 'init',
    baseUrl: 'https://local.csl.test/java-wasm/teavm/',
    persistFiles: false,
  });
  assert.equal(initRes.type, 'initialized', initRes.error);

  const cases = [
    {
      name: '1. Basic Hello World (Main)',
      source: 'public class Main { public static void main(String[] args) { System.out.println("Hello World"); } }',
      expected: 'Hello World',
    },
    {
      name: '2. Public class Solution filename support',
      mainClass: 'Solution',
      source: 'public class Solution { public static void main(String[] args) { System.out.println("SolutionOK"); } }',
      expected: 'SolutionOK',
    },
    {
      name: '3. Arithmetic & casting',
      source: 'public class Main { public static void main(String[] args) { int a = 7, b = 3; System.out.println((a + b) + " " + (a - b) + " " + (a * b) + " " + (a / b) + " " + (a % b)); } }',
      expected: '10 4 21 2 1',
    },
    {
      name: '4. Scanner integer reading',
      input: '14 28\n',
      source: 'import java.util.Scanner; public class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); System.out.println(sc.nextInt() + sc.nextInt()); } }',
      expected: '42',
    },
    {
      name: '5. Scanner line & word reading',
      input: 'Creator Space Lab\n2026\n',
      source: 'import java.util.Scanner; public class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); String line = sc.nextLine(); int yr = Integer.parseInt(sc.nextLine().trim()); System.out.println(line + ":" + yr); } }',
      expected: 'Creator Space Lab:2026',
    },
    {
      name: '6. Multi-line Scanner input with BufferedReader',
      input: '3\napple\nbanana\ncherry\n',
      source: 'import java.io.*; public class Main { public static void main(String[] args) throws Exception { BufferedReader br = new BufferedReader(new InputStreamReader(System.in)); int n = Integer.parseInt(br.readLine().trim()); StringBuilder sb = new StringBuilder(); for (int i = 0; i < n; i++) { if (i > 0) sb.append(","); sb.append(br.readLine().trim()); } System.out.println(sb); } }',
      expected: 'apple,banana,cherry',
    },
    {
      name: '7. Conditionals & switch',
      input: '85',
      source: 'import java.util.*; public class Main { public static void main(String[] args) { int s = new Scanner(System.in).nextInt(); System.out.println(s >= 90 ? "A" : s >= 80 ? "B" : "C"); } }',
      expected: 'B',
    },
    {
      name: '8. Loops & nested loops',
      source: 'public class Main { public static void main(String[] args) { int sum = 0; for (int i = 1; i <= 5; i++) for (int j = 1; j <= i; j++) sum += j; System.out.println(sum); } }',
      expected: '35',
    },
    {
      name: '9. 1D Arrays',
      source: 'public class Main { public static void main(String[] args) { int[] a = {3, 1, 4, 1, 5}; int s = 0; for (int v : a) s += v; System.out.println(s); } }',
      expected: '14',
    },
    {
      name: '10. 2D Matrix transpose trace',
      source: 'public class Main { public static void main(String[] args) { int[][] m = {{1, 2}, {3, 4}}; System.out.println((m[0][0] + m[1][1]) + " " + m[1][0]); } }',
      expected: '5 3',
    },
    {
      name: '11. StringBuilder & char processing',
      source: 'public class Main { public static void main(String[] args) { System.out.println(new StringBuilder("CSL-WASM").reverse().toString()); } }',
      expected: 'MSAW-LSC',
    },
    {
      name: '12. Static helper methods',
      source: 'public class Main { static int gcd(int a, int b) { return b == 0 ? a : gcd(b, a % b); } public static void main(String[] args) { System.out.println(gcd(48, 18)); } }',
      expected: '6',
    },
    {
      name: '13. Recursion (Fibonacci)',
      source: 'public class Main { static int fib(int n) { return n <= 1 ? n : fib(n - 1) + fib(n - 2); } public static void main(String[] args) { System.out.println(fib(10)); } }',
      expected: '55',
    },
    {
      name: '14. Classes & constructors',
      source: 'class Box { final int w, h; Box(int w, int h) { this.w = w; this.h = h; } int area() { return w * h; } } public class Main { public static void main(String[] args) { System.out.println(new Box(6, 7).area()); } }',
      expected: '42',
    },
    {
      name: '15. Inheritance & polymorphism',
      source: 'class Animal { String speak() { return "?"; } } class Dog extends Animal { @Override String speak() { return "Woof"; } } public class Main { public static void main(String[] args) { Animal a = new Dog(); System.out.println(a.speak()); } }',
      expected: 'Woof',
    },
    {
      name: '16. Interfaces & lambdas',
      source: 'interface Op { int apply(int x); } public class Main { public static void main(String[] args) { Op sq = x -> x * x; System.out.println(sq.apply(9)); } }',
      expected: '81',
    },
    {
      name: '17. ArrayList operations',
      source: 'import java.util.*; public class Main { public static void main(String[] args) { List<String> list = new ArrayList<>(Arrays.asList("B", "A", "C")); list.remove("A"); System.out.println(String.join("-", list)); } }',
      expected: 'B-C',
    },
    {
      name: '18. HashMap frequency counting',
      source: 'import java.util.*; public class Main { public static void main(String[] args) { Map<String, Integer> map = new HashMap<>(); for (String w : new String[]{"a","b","a","c","a"}) map.put(w, map.getOrDefault(w, 0) + 1); System.out.println(map.get("a") + ":" + map.size()); } }',
      expected: '3:3',
    },
    {
      name: '19. HashSet deduplication',
      source: 'import java.util.*; public class Main { public static void main(String[] args) { Set<Integer> set = new HashSet<>(Arrays.asList(1, 2, 2, 3, 1)); System.out.println(set.size()); } }',
      expected: '3',
    },
    {
      name: '20. Arrays.sort',
      source: 'import java.util.*; public class Main { public static void main(String[] args) { int[] a = {5, 1, 4, 2, 8}; Arrays.sort(a); System.out.println(Arrays.toString(a)); } }',
      expected: '[1, 2, 4, 5, 8]',
    },
    {
      name: '21. Collections.sort with Comparator',
      source: 'import java.util.*; public class Main { public static void main(String[] args) { List<String> xs = Arrays.asList("pear", "fig", "apple"); Collections.sort(xs, Comparator.comparingInt(String::length)); System.out.println(xs); } }',
      expected: '[fig, pear, apple]',
    },
    {
      name: '22. PriorityQueue & Stack (Deque)',
      source: 'import java.util.*; public class Main { public static void main(String[] args) { PriorityQueue<Integer> pq = new PriorityQueue<>(); pq.add(30); pq.add(10); pq.add(20); Deque<Integer> st = new ArrayDeque<>(); st.push(pq.poll()); st.push(pq.poll()); System.out.println(st.pop() + "," + pq.peek()); } }',
      expected: '20,30',
    },
    {
      name: '23. Exceptions try/catch/finally (NumberFormatException & custom)',
      source: 'class CustomEx extends Exception { CustomEx(String m) { super(m); } } public class Main { static void check() throws CustomEx { throw new CustomEx("bad"); } public static void main(String[] args) { try { Integer.parseInt("xyz"); } catch (NumberFormatException e) { System.out.print("NFE:"); } try { check(); } catch (CustomEx e) { System.out.print(e.getMessage() + ":"); } finally { System.out.println("FIN"); } } }',
      expected: 'NFE:bad:FIN',
    },
    {
      name: '24. CSL Question Sim 1: Second Largest Unique Number',
      mainClass: 'Solution',
      input: '6\n10 5 20 8 20 15\n',
      source: 'import java.util.*; public class Solution { public static void main(String[] args) { Scanner sc = new Scanner(System.in); int n = sc.nextInt(); TreeSet<Integer> s = new TreeSet<>(); for (int i = 0; i < n; i++) s.add(sc.nextInt()); s.pollLast(); System.out.println(s.last()); } }',
      expected: '15',
    },
    {
      name: '25. CSL Question Sim 2: Anagram Check',
      mainClass: 'Solution',
      input: 'listen\nsilent\n',
      source: 'import java.util.*; public class Solution { public static void main(String[] args) { Scanner sc = new Scanner(System.in); char[] a = sc.nextLine().toCharArray(); char[] b = sc.nextLine().toCharArray(); Arrays.sort(a); Arrays.sort(b); System.out.println(Arrays.equals(a, b) ? "YES" : "NO"); } }',
      expected: 'YES',
    },
  ];

  for (const tc of cases) {
    const res = await callWorker({
      cmd: 'run',
      source: tc.source,
      mainClass: tc.mainClass || 'Main',
      input: tc.input || '',
    });
    assert.equal(res.ok, true, `${tc.name} failed: stderr=${res.stderr} error=${res.error}`);
    assert.equal((res.stdout || '').trim(), tc.expected, `${tc.name} stdout mismatch`);
  }

  // Compile error diagnostic test
  const compileErr = await callWorker({
    cmd: 'run',
    source: 'public class Main { public static void main(String[] args) { int x = "wrong"; } }',
    mainClass: 'Main',
    input: '',
  });
  assert.equal(compileErr.ok, false);
  assert.notEqual(compileErr.exitCode, 0);
  assert.ok((compileErr.stderr || '').length > 0, 'Compiler error diagnostics must be populated');

  // Uncaught RuntimeException reporting test
  const runtimeErr = await callWorker({
    cmd: 'run',
    source: 'public class Main { public static void main(String[] args) { throw new IllegalStateException("boom"); } }',
    mainClass: 'Main',
    input: '',
  });
  assert.equal(runtimeErr.ok, false);
  assert.notEqual(runtimeErr.exitCode, 0);
});

test('Patched worker-java.js correlates requestIds, emits phase events, supports warmup, and enforces execution timeoutMs', async () => {
  const workerSource = fs.readFileSync(workerScriptPath, 'utf8');
  const events = [];
  const activeTimers = new Set();
  const trackTimeout = (fn, ms, ...args) => {
    const id = setTimeout(() => {
      activeTimers.delete(id);
      fn(...args);
    }, ms);
    activeTimers.add(id);
    return id;
  };
  const untrackTimeout = (id) => {
    activeTimers.delete(id);
    clearTimeout(id);
  };

  const sandbox = {
    URL,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Int8Array,
    ArrayBuffer,
    WebAssembly,
    Response,
    Promise,
    Map,
    WeakMap,
    WeakRef,
    FinalizationRegistry,
    WeakSet,
    Symbol,
    Proxy,
    Reflect,
    Math,
    Date,
    Error,
    TypeError,
    BigInt,
    Function,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
    setTimeout: trackTimeout,
    clearTimeout: untrackTimeout,
    console,
    performance,
    fetch: async (url) => {
      const cleanPath = String(url).replace('https://local.csl.test/java-wasm/', '');
      const fullPath = path.join(publicJavaWasmDir, cleanPath);
      const buf = fs.readFileSync(fullPath);
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': cleanPath.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        },
      });
    },
    indexedDB: undefined,
    require: () => {
      throw new Error('Unexpected CommonJS require');
    },
    self: {
      location: { href: 'https://local.csl.test/java-wasm/worker-java.js' },
      postMessage(msg) {
        events.push(msg);
      },
      onmessage: null,
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(workerSource, sandbox);

  const waitFor = (pred) =>
    new Promise((resolve) => {
      const check = () => {
        const match = events.find(pred);
        if (match) return resolve(match);
        setTimeout(check, 20);
      };
      check();
    });

  sandbox.self.onmessage({
    data: { cmd: 'init', requestId: 'init_1', baseUrl: 'https://local.csl.test/java-wasm/teavm/', persistFiles: false },
  });
  const initMsg = await waitFor((m) => m.type === 'initialized' && m.requestId === 'init_1');
  assert.equal(initMsg.requestId, 'init_1');

  sandbox.self.onmessage({ data: { cmd: 'warmup', requestId: 'warm_1' } });
  const warmMsg = await waitFor((m) => m.type === 'warmed' && m.requestId === 'warm_1');
  assert.equal(warmMsg.ok, true);

  sandbox.self.onmessage({
    data: {
      cmd: 'run',
      requestId: 'run_phases_1',
      mainClass: 'Main',
      source: 'public class Main { public static void main(String[] a) { System.out.println("PHASE_OK"); } }',
      input: '',
      timeoutMs: 2500,
      emitPhases: true,
    },
  });
  const resMsg = await waitFor((m) => m.type === 'result' && m.requestId === 'run_phases_1');
  assert.equal(resMsg.ok, true);
  assert.equal(resMsg.stdout.trim(), 'PHASE_OK');

  const phases = events
    .filter((m) => m.type === 'phase' && m.requestId === 'run_phases_1')
    .map((m) => m.phase);
  assert.deepEqual(phases, ['COMPILING', 'GENERATING_WASM', 'INSTANTIATING', 'RUNNING']);

  // Cooperative timeout loop (Thread.sleep yields inside TeaVM event loop) exits cleanly at timeoutMs
  sandbox.self.onmessage({
    data: {
      cmd: 'run',
      requestId: 'run_tle_1',
      mainClass: 'Main',
      source: 'public class Main { public static void main(String[] a) throws Exception { while (true) { Thread.sleep(50); } } }',
      input: '',
      timeoutMs: 600,
      emitPhases: true,
    },
  });
  const tleMsg = await waitFor((m) => m.type === 'result' && m.requestId === 'run_tle_1');
  assert.equal(tleMsg.ok, false);
  assert.equal(tleMsg.phase, 'TIME_LIMIT_EXCEEDED');

  for (const tid of activeTimers) {
    clearTimeout(tid);
  }
  activeTimers.clear();
});
