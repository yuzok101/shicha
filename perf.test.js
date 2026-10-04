/* Node tests for the performance track (2026-10-04):
 *  - worker.js: geminiStreamDelta pure parser + /api/ai/stream route present
 *  - 6-sw.js: cache v78 + all new assets in CORE
 *  - 3-app.js: library pagination (LIB_PAGE), lazy images, skeleton HTML
 * Run: node perf.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('ok -', name); }
  catch (e) { failed++; console.error('FAIL -', name, '\n  ', e.message); }
}

/* ---------- worker.js streaming ---------- */
const workerSrc = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
t('worker: AI-STREAM markers present', () => {
  assert.ok(workerSrc.includes('// ==AI-STREAM-START=='));
  assert.ok(workerSrc.includes('// ==AI-STREAM-END=='));
});
t('worker: /api/ai/stream route present (auth-gated, chat-only, rate-limited)', () => {
  assert.ok(workerSrc.includes("if(p==='/api/ai/stream'&&req.method==='POST')"));
  assert.ok(workerSrc.includes("b.action!=='chat'"));
  assert.ok(workerSrc.includes('aiRateLimit(env,u.id)'));
});
t('worker: stream uses streamGenerateContent SSE endpoint', () => {
  assert.ok(workerSrc.includes("':streamGenerateContent'"));
  assert.ok(workerSrc.includes('alt=sse'));
  assert.ok(workerSrc.includes('text/event-stream'));
});
t('worker: existing aiCall() untouched (still used by /api/ai)', () => {
  assert.ok(workerSrc.includes('await aiCall(env,b.action,b)'));
});
// extract the pure parser and test it
const mStart = workerSrc.indexOf('// ==AI-STREAM-START==');
const mEnd = workerSrc.indexOf('// ==AI-STREAM-END==');
const blockSrc = workerSrc.slice(mStart, mEnd);
const fnSrc = blockSrc.slice(blockSrc.indexOf('function geminiStreamDelta'),
  blockSrc.indexOf('async function aiChatStream'));
const geminiStreamDelta = new Function(fnSrc + '; return geminiStreamDelta;')();
t('geminiStreamDelta: extracts Hebrew text deltas', () => {
  const ev = { candidates: [{ content: { parts: [{ text: 'שלום ' }, { text: 'עולם' }] } }] };
  assert.equal(geminiStreamDelta(ev), 'שלום עולם');
});
t('geminiStreamDelta: skips thoughtSignature-only parts', () => {
  const ev = { candidates: [{ content: { parts: [{ text: '', thoughtSignature: 'abc' }] }, finishReason: 'STOP' }] };
  assert.equal(geminiStreamDelta(ev), '');
});
t('geminiStreamDelta: robust to garbage', () => {
  assert.equal(geminiStreamDelta(null), '');
  assert.equal(geminiStreamDelta({}), '');
  assert.equal(geminiStreamDelta({ candidates: [{ content: {} }] }), '');
});

/* ---------- 6-sw.js ---------- */
const swSrc = fs.readFileSync(path.join(ROOT, 'public', '6-sw.js'), 'utf8');
t('sw: cache version is v78', () => {
  assert.ok(swSrc.includes("CACHE='tavlin-p1-v78'") || swSrc.includes('CACHE="tavlin-p1-v78"'));
});
t('sw: CORE includes all new JS + mascot assets', () => {
  for (const f of ['voice.js', 'timer-sounds.js', 'meal-planner.js', 'fridge-scan.js',
    'ai-recipe.js', 'assets/mascot.webp', 'assets/mascot-blink.webp']) {
    assert.ok(swSrc.includes(f), 'missing ' + f);
  }
});
t('sw: CORE versions match index.html script tags', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  for (const m of html.matchAll(/src="([a-z0-9-]+\.js)\?v=(\d+)"/g)) {
    assert.ok(swSrc.includes(`./${m[1]}?v=${m[2]}`), `SW CORE missing ./${m[1]}?v=${m[2]}`);
  }
});
t('sw: stale-while-revalidate for HTML, cache-first for assets, offline fallback', () => {
  assert.ok(/stale-while-revalidate/i.test(swSrc));
  assert.ok(swSrc.includes('caches.match'));
  assert.ok(swSrc.includes("caches.match('./index.html')"));
});

/* ---------- 3-app.js pagination / lazy / skeleton ---------- */
function loadApp() {
  function makeEl() {
    const el = {
      _html: '', _text: '', children: [], dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild(c) { this.children.push(c); return c; },
      append(c) { this.children.push(c); return c; },
      querySelector() { return makeEl(); }, querySelectorAll() { return []; },
      addEventListener() {}, removeEventListener() {}, setAttribute() {},
      getAttribute() { return null; }, scrollIntoView() {}, focus() {},
      click() {}, showModal() {}, close() {}, getContext() { return null; },
    };
    return new Proxy(el, {
      get(tg, p) {
        if (p === 'innerHTML') return tg._html;
        if (p === 'textContent') return tg._text;
        if (p in tg) return tg[p];
        return (...a) => makeEl();
      },
      set(tg, p, v) {
        if (p === 'innerHTML') tg._html = String(v);
        else if (p === 'textContent') tg._text = String(v);
        else tg[p] = v;
        return true;
      },
    });
  }
  const sandbox = {
    console, performance,
    document: new Proxy({}, {
      get(tg, p) {
        if (p === 'querySelector') return () => makeEl();
        if (p === 'querySelectorAll') return () => [];
        if (p === 'createElement') return () => makeEl();
        if (p === 'addEventListener' || p === 'removeEventListener') return () => {};
        if (p === 'body') return makeEl();
        return undefined;
      }, set() { return true; },
    }),
    navigator: { onLine: true },
    localStorage: { getItem: () => '{}', setItem() {}, removeItem() {} },
    indexedDB: { open() { return {}; } },
    requestAnimationFrame: () => 0,
  };
  sandbox.window = new Proxy(
    { location: { hash: '' }, matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {} },
    { get(tg, p) { if (p in tg) return tg[p]; return undefined; }, set(tg, p, v) { tg[p] = v; return true; } });
  sandbox.window.document = sandbox.document;
  sandbox.globalThis = sandbox;
  const vm = require('node:vm');
  vm.createContext(sandbox);
  let src = fs.readFileSync(path.join(ROOT, 'public', '3-app.js'), 'utf8');
  src += '\n;globalThis.__T={layoutLibrary,card,libCardHTML,skelHTML,LIB_PAGE,setRecipes:r=>{recipes=r},getLibShown:()=>libShown};';
  vm.runInContext(src, sandbox, { filename: '3-app.js' });
  return sandbox.__T;
}
function mkRecipes(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({
    id: 'r' + i, name: 'מתכון ' + i, category: 'מרקים', minutes: 30,
    ingredients: ['א', 'ב'], steps: ['1'], notes: '',
    photo: i % 2 ? 'data:image/jpeg;base64,AAAA' : '',
    updatedAt: Date.now() - i, updated_at: Date.now() - i,
  });
  return out;
}
const T = loadApp();
t('library: 100 recipes render only LIB_PAGE cards + sentinel', () => {
  T.setRecipes(mkRecipes(100));
  const html = T.layoutLibrary();
  assert.equal((html.match(/class="card"/g) || []).length, T.LIB_PAGE);
  assert.equal(T.getLibShown(), T.LIB_PAGE);
  assert.ok(html.includes('id="libSentinel"'), 'sentinel missing');
  assert.ok(html.includes('id="libMoreBtn"'), 'load-more button missing');
  assert.ok(/\(50 נותרו\)/.test(html), 'remaining count missing');
});
t('library: small library renders all cards, no sentinel', () => {
  T.setRecipes(mkRecipes(20));
  const html = T.layoutLibrary();
  assert.equal((html.match(/class="card"/g) || []).length, 20);
  assert.ok(!html.includes('libSentinel'));
});
t('card: photos use loading=lazy + decoding=async', () => {
  const html = T.card({ id: 'x', name: 'n', category: 'c', minutes: 1, ingredients: ['a'], photo: 'data:image/png;base64,AA' });
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(html.includes('decoding="async"'));
  assert.ok(html.includes('<img'));
  assert.ok(!html.includes('background-image'));
});
t('card: no-photo fallback keeps emoji placeholder', () => {
  const html = T.card({ id: 'x', name: 'n', category: 'c', minutes: 1, ingredients: ['a'], photo: '' });
  assert.ok(html.includes('🍲'));
});
t('skelHTML: renders shimmer placeholders with Hebrew title', () => {
  const html = T.skelHTML('רשימת קניות');
  assert.ok(html.includes('skelWrap') && html.includes('רשימת קניות'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
