/* ============================================================
 * FridgeScan — 🧊 צילום מקרר → זיהוי מוצרים (AI vision) → הצעות בישול
 * ------------------------------------------------------------
 * Self-contained feature module for Tavlin. Depends on globals from
 * 3-app.js (loaded BEFORE this file): $, esc, toast, API, recipes.
 * Optional globals (used with typeof guards): invKey, showRecipe.
 *
 * INTEGRATION — the coordinator adds these (do NOT edit 3-app.js /
 * index.html from here):
 *  1. index.html — add AFTER the 3-app.js script tag:
 *       <script src="fridge-scan.js?v=1"></script>
 *  2. 3-app.js layoutHome() — add a quick-action button, e.g.:
 *       <button data-action="fridgeScan"><span>🧊</span>צילום מקרר</button>
 *  3. 3-app.js actions map — add:
 *       fridgeScan:()=>FridgeScan.open(),
 *  4. 3-app.js boot IIFE (line ~182) — add:
 *       if(window.FridgeScan)FridgeScan.init();
 *  5. worker.js — merge ../vision-endpoint.patch.js (new POST /api/ai/vision).
 *  6. Requires POST /api/inventory {name, quantity, unit, zone} and
 *     GET /api/inventory -> {items:[{id,name,...}]} (coordinator's track).
 *
 * Flow: capture (camera/file) → client-side compress (max 1024px, JPEG
 * 0.7) → POST /api/ai/vision → user confirms checklist (nothing is ever
 * auto-added) → POST confirmed items to /api/inventory → recipe
 * suggestions: first from the user's own book (match %), then optional
 * AI ideas with clarifying questions (via existing /api/ai chat).
 * ============================================================ */

const FRIDGE_MAX_SIDE = 1024;   // longest side after compression (§88)
const FRIDGE_JPEG_Q = 0.7;

/* ---------------- pure helpers (no DOM; exported for Node tests) ---------------- */

function frKey(t) {
  return String(t || '').split(/[,(]/)[0].replace(/[\d.\/½¼¾]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Target dimensions keeping aspect ratio, longest side <= max.
function computeTargetSize(w, h, max) {
  w = +w || 0; h = +h || 0;
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  if (w <= max && h <= max) return { w: Math.round(w), h: Math.round(h) };
  const s = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

// Confidence badge level: high >= 0.8, medium 0.5–0.8, low < 0.5
function confBadgeLevel(c) {
  c = +c;
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

// Mirror of the worker's aiCleanJSON: strip fences, slice widest JSON, parse.
function sliceJSON(text) {
  const m = String(text || '').replace(/```json|```/g, '').trim();
  const bo = m.indexOf('{'), bc = m.lastIndexOf('}');
  const ao = m.indexOf('['), ac = m.lastIndexOf(']');
  let c = m;
  if (ao >= 0 && (bo < 0 || ao < bo)) c = m.slice(ao, ac + 1);
  else if (bo >= 0) c = m.slice(bo, bc + 1);
  try { return JSON.parse(c); } catch (e) { return null; }
}

// Sanitize a raw vision array into [{name, confidence}] or null.
function cleanVisionItems(d) {
  if (!Array.isArray(d)) return null;
  const clean = [];
  for (const x of d) {
    if (!x || typeof x !== 'object') continue;
    const name = String(x.name || '').replace(/[<>"'&]/g, '').trim().slice(0, 60);
    let c = parseFloat(x.confidence);
    if (!isFinite(c)) c = 0.5;
    c = Math.min(1, Math.max(0, c));
    if (!name) continue;
    clean.push({ name, confidence: Math.round(c * 100) / 100 });
    if (clean.length >= 40) break;
  }
  return clean;
}

// Parse a vision-model reply: slice-parse first, regex fallback on failure.
function parseVisionResponse(text) {
  let d = sliceJSON(text);
  if (!Array.isArray(d)) {
    const out = [];
    const re = /"name"\s*:\s*"([^"\\]{1,80})"\s*,\s*"confidence"\s*:\s*(-?[0-9]*\.?[0-9]+)/g;
    const s = String(text || '');
    let m;
    while ((m = re.exec(s))) out.push({ name: m[1], confidence: parseFloat(m[2]) });
    d = out.length ? out : null;
  }
  return cleanVisionItems(d);
}

// Local recipe matching: which recipes can be cooked from inventory names.
// Returns [{recipe, have, total, pct}] sorted by pct desc, only have>0.
function matchRecipes(list, invNames) {
  const names = (invNames || []).map(frKey).filter(Boolean);
  const rows = [];
  for (const r of (list || [])) {
    const keys = (r.ingredients || []).map(frKey).filter(Boolean);
    if (!keys.length) continue;
    const have = keys.filter(k => names.some(n => n && (k.includes(n) || n.includes(k))));
    if (!have.length) continue;
    rows.push({ recipe: r, have: have.length, total: keys.length, pct: Math.round(have.length / keys.length * 100) });
  }
  rows.sort((a, b) => b.pct - a.pct || b.have - a.have);
  return rows;
}

// Client-side compression: resize to max 1024px longest side, JPEG 0.7.
// deps injectable for tests: {Image, document}.
function compressImage(dataUrl, deps) {
  const Img = (deps && deps.Image) || Image;
  const doc = (deps && deps.document) || document;
  return new Promise((ok, no) => {
    const img = new Img();
    img.onload = () => {
      try {
        const t = computeTargetSize(img.naturalWidth || img.width, img.naturalHeight || img.height, FRIDGE_MAX_SIDE);
        if (!t.w || !t.h) return no(new Error('bad_image_size'));
        const cv = doc.createElement('canvas');
        cv.width = t.w; cv.height = t.h;
        cv.getContext('2d').drawImage(img, 0, 0, t.w, t.h);
        ok(cv.toDataURL('image/jpeg', FRIDGE_JPEG_Q));
      } catch (e) { no(e); }
    };
    img.onerror = () => no(new Error('image_load_failed'));
    img.src = dataUrl;
  });
}

/* ---------------- FridgeScan UI (DOM) ---------------- */

const escH = s => (typeof esc === 'function' ? esc(s) : String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
const toastH = s => { if (typeof toast === 'function') toast(s); };
const $H = (s, r) => (typeof $ === 'function' ? $(s, r) : (r || document).querySelector(s));

const FridgeScan = {
  S: null, inited: false,

  reset() { this.S = { img: null, items: [], dup: new Set(), busy: false, prefs: { kind: 'לא משנה', level: 'לא משנה', time: 'לא משנה' } }; },

  html() {
    return `<dialog id="fridgeDialog" class="fridgeDialog" dir="rtl" aria-label="צילום מקרר">
      <div class="dlgHead" style="padding:20px 24px 0"><h2>🧊 צילום מקרר</h2><button type="button" id="fridgeClose" aria-label="סגירת חלון">✕</button></div>
      <div id="fridgeBody" class="frBody"></div>
      <input type="file" id="fridgeCam" accept="image/*" capture="environment" hidden aria-label="צילום במצלמה">
      <input type="file" id="fridgeFile" accept="image/*" hidden aria-label="בחירת תמונה מקבצים">
    </dialog>`;
  },

  style() {
    return `<style id="fridgeScanStyle">
.frBody{padding:6px 24px 26px;overflow:auto;max-height:80vh}
.frPreview{width:100%;max-height:260px;object-fit:contain;border-radius:14px;background:#f4eee2;margin-top:10px}
.frChoices{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
.frChoices button{min-height:88px;font-size:1.05rem}
.frRow{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line,#e5d9c8);border-radius:12px;margin:8px 0;background:#fff}
.frRow input[type=text]{flex:1;min-width:0;border:1px solid var(--line,#e5d9c8);border-radius:10px;padding:10px}
.frRow input[type=checkbox]{width:28px;height:28px;flex:none}
.frRow.dup{opacity:.65}
.badge.low{background:#f3d9d5;border-color:#a13f36}
.frActions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.frActions .primary{flex:1;min-height:56px;font-size:1.05rem}
.frChips{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px}
.frChips button{border:1px solid var(--line,#e5d9c8);border-radius:20px;padding:9px 15px;background:#fff}
.frChips button.on{background:var(--green,#315b45);color:#fff;border-color:var(--green,#315b45)}
.frSug{border:1px solid var(--line,#e5d9c8);border-radius:14px;padding:12px;margin:8px 0;background:#fff}
.frSug .pct{font-weight:700;color:var(--green,#315b45)}
.frAiReply{white-space:pre-wrap;line-height:1.7;background:#fbf7ee;border-radius:12px;padding:12px;margin-top:8px}
.spin{display:inline-block;animation:frspin 1s linear infinite}
@keyframes frspin{to{transform:rotate(360deg)}}
@media(max-width:600px){.frChoices{grid-template-columns:1fr}}
</style>`;
  },

  init() {
    if (this.inited || typeof document === 'undefined') return;
    if (!$H('#fridgeDialog')) document.body.insertAdjacentHTML('beforeend', this.html());
    if (!$H('#fridgeScanStyle')) document.head.insertAdjacentHTML('beforeend', this.style());
    $H('#fridgeClose').onclick = () => $H('#fridgeDialog').close();
    $H('#fridgeCam').onchange = e => this.onFile(e.target.files[0]);
    $H('#fridgeFile').onchange = e => this.onFile(e.target.files[0]);
    this.inited = true;
  },

  open() {
    this.init();
    this.reset();
    const d = $H('#fridgeDialog');
    if (!d) return;
    this.stepCapture();
    if (!d.open) d.showModal();
  },

  /* ---- step 1: capture ---- */
  stepCapture() {
    const S = this.S;
    $H('#fridgeBody').innerHTML = `
      <p class="muted">צלמו את המקרר (או בחרו תמונה) והעוזר החכם יזהה את המוצרים שבתמונה. התמונה מוקטנת במכשיר לפני השליחה.</p>
      <div class="frChoices">
        <button type="button" id="frCamBtn" class="primary">📷 צילום במצלמה</button>
        <button type="button" id="frFileBtn">🖼️ בחירה מקבצים</button>
      </div>
      ${S.img ? `<img class="frPreview" src="${S.img}" alt="תצוגה מקדימה של התמונה">` : ''}
      <div class="frActions">
        <button type="button" id="frAnalyzeBtn" class="primary" ${S.img ? '' : 'disabled'}>🔍 ניתוח התמונה</button>
      </div>
      <p class="muted" id="frCapMsg" role="status"></p>`;
    $H('#frCamBtn').onclick = () => this.capture('cam');
    $H('#frFileBtn').onclick = () => this.capture('file');
    $H('#frAnalyzeBtn').onclick = () => this.analyze();
  },

  capture(which) {
    const el = $H(which === 'cam' ? '#fridgeCam' : '#fridgeFile');
    if (el) { el.value = ''; el.click(); }
  },

  onFile(f) {
    if (!f) return;
    if (!String(f.type || '').startsWith('image/')) { toastH('צריך לבחור קובץ תמונה'); return; }
    if (f.size > 15 * 1024 * 1024) { toastH('התמונה גדולה מדי (מעל 15MB)'); return; }
    const msg = $H('#frCapMsg'); if (msg) msg.textContent = 'מכין את התמונה…';
    const r = new FileReader();
    r.onload = async () => {
      try {
        this.S.img = await compressImage(r.result);
        this.stepCapture();
      } catch (e) {
        if (msg) msg.textContent = 'לא ניתן לעבד את התמונה. נסו תמונה אחרת.';
      }
    };
    r.onerror = () => { if (msg) msg.textContent = 'קריאת הקובץ נכשלה.'; };
    r.readAsDataURL(f);
  },

  /* ---- step 2: analyze via /api/ai/vision ---- */
  async analyze() {
    const S = this.S;
    if (!S.img || S.busy) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      $H('#fridgeBody').innerHTML = `<div class="notice">📡 אין חיבור לרשת. זיהוי התמונה דורש אינטרנט.<div class="frActions"><button type="button" id="frBack1">← חזרה</button></div></div>`;
      $H('#frBack1').onclick = () => this.stepCapture();
      return;
    }
    S.busy = true;
    $H('#fridgeBody').innerHTML = `<div style="text-align:center;padding:40px 10px"><div style="font-size:2.4rem"><span class="spin">⏳</span></div><h3>מנתח את התמונה…</h3><p class="muted">העוזר החכם מזהה מוצרים. זה לוקח כמה שניות.</p></div>`;
    try {
      const b64 = S.img.split(',')[1] || '';
      const res = await API.call('/ai/vision', { method: 'POST', body: JSON.stringify({ image: b64, mimeType: 'image/jpeg' }) });
      S.items = parseVisionResponse(JSON.stringify(res.items || [])) || [];
      // The worker already returns a clean array; parse again defensively (never throws).
      await this.markDuplicates();
      this.confirmUI();
    } catch (e) {
      let msg = 'שירות ה-AI נכשל כרגע. נסו שוב מאוחר יותר.';
      try {
        const j = JSON.parse(e.message);
        if (j && j.message) msg = j.message;
        else if (j && j.error === 'rate_limited') msg = 'עברת את מכסת בקשות ה-AI לשעה. נסו שוב מאוחר יותר.';
        else if (j && j.error === 'ai_unavailable') msg = 'שירות ה-AI אינו זמין כרגע.';
      } catch (_) { /* keep default */ }
      if (e && (e.name === 'TypeError' || /failed to fetch|networkerror/i.test(e.message || ''))) msg = 'אין חיבור לרשת. ה-AI דורש אינטרנט.';
      $H('#fridgeBody').innerHTML = `<div class="notice">⚠️ ${escH(msg)}<div class="frActions"><button type="button" id="frRetry">🔁 ניסיון נוסף</button><button type="button" id="frBack2">← צילום אחר</button></div></div>`;
      $H('#frRetry').onclick = () => this.analyze();
      $H('#frBack2').onclick = () => this.stepCapture();
    } finally {
      S.busy = false;
    }
  },

  async markDuplicates() {
    this.S.dup = new Set();
    try {
      const inv = await API.call('/inventory');
      const have = new Set((inv.items || []).map(x => frKey(x.name)));
      this.S.items.forEach((it, i) => { if (have.has(frKey(it.name))) this.S.dup.add(i); });
    } catch (e) { /* inventory endpoint unavailable — skip dup detection */ }
  },

  confBadge(c) {
    const l = confBadgeLevel(c);
    if (l === 'high') return '<span class="badge ok">🟢 ביטחון גבוה</span>';
    if (l === 'medium') return '<span class="badge">🟡 ביטחון בינוני</span>';
    return '<span class="badge low">🔴 ביטחון נמוך</span>';
  },

  /* ---- step 3: user confirmation (never auto-add) ---- */
  confirmUI() {
    const S = this.S;
    const body = $H('#fridgeBody');
    if (!S.items.length) {
      body.innerHTML = `<div class="notice">🔍 לא זוהו מוצרי מזון בתמונה.<p class="muted">נסו תמונה ברורה יותר, עם תאורה טובה והמוצרים גלויים.</p><div class="frActions"><button type="button" id="frBack3">📷 צילום אחר</button><button type="button" id="frSugOnly">🍳 הצעות בישול מהמלאי הקיים</button></div></div>`;
      $H('#frBack3').onclick = () => this.stepCapture();
      $H('#frSugOnly').onclick = () => this.suggestRecipes();
      return;
    }
    body.innerHTML = `
      <h3>זוהו ${S.items.length} מוצרים — אשרו לפני הוספה</h3>
      <p class="notice">רק הפריטים <b>המסומנים</b> יתווספו למלאי. שום דבר לא נוסף אוטומטית. אפשר לערוך שמות לפני ההוספה.</p>
      <div id="frList">${S.items.map((it, i) => {
        const dup = S.dup.has(i);
        const checked = !dup && it.confidence >= 0.5;
        return `<div class="frRow${dup ? ' dup' : ''}">
          <input type="checkbox" id="frChk${i}" ${checked ? 'checked' : ''} ${dup ? 'disabled' : ''} aria-label="הוספת ${escH(it.name)}">
          <input type="text" id="frName${i}" value="${escH(it.name)}" maxlength="60" ${dup ? 'disabled' : ''} aria-label="שם המוצר">
          ${this.confBadge(it.confidence)}
          ${dup ? '<span class="badge">כבר במלאי</span>' : ''}
        </div>`;
      }).join('')}</div>
      <div class="frActions">
        <button type="button" id="frAddBtn" class="primary">🧺 הוספה למלאי</button>
        <button type="button" id="frSkipAdd">🍳 רק הצעות בישול</button>
      </div>`;
    const upd = () => {
      const n = S.items.filter((it, i) => !S.dup.has(i) && $H('#frChk' + i).checked).length;
      $H('#frAddBtn').textContent = `🧺 הוספה למלאי (${n})`;
      $H('#frAddBtn').disabled = !n;
    };
    S.items.forEach((it, i) => { const c = $H('#frChk' + i); if (c) c.onchange = upd; });
    upd();
    $H('#frAddBtn').onclick = () => this.addSelected();
    $H('#frSkipAdd').onclick = () => this.suggestRecipes();
  },

  async addSelected() {
    const S = this.S;
    const sel = S.items
      .map((it, i) => ({ i, name: ($H('#frName' + i).value || '').trim() }))
      .filter(x => !S.dup.has(x.i) && $H('#frChk' + x.i).checked && x.name);
    if (!sel.length) return;
    const btn = $H('#frAddBtn');
    btn.disabled = true; btn.textContent = 'מוסיף למלאי…';
    let okN = 0;
    for (const x of sel) {
      try {
        await API.call('/inventory', { method: 'POST', body: JSON.stringify({ name: x.name, quantity: 1, unit: 'יחידה', zone: 'fridge' }) });
        okN++;
      } catch (e) { /* keep going; report at the end */ }
    }
    toastH(okN === sel.length ? `${okN} פריטים נוספו למלאי 🧊` : `${okN} מתוך ${sel.length} פריטים נוספו. בדקו את החיבור ונסו שוב.`);
    this.suggestRecipes();
  },

  /* ---- step 4: "what can I cook" ---- */
  async suggestRecipes() {
    const body = $H('#fridgeBody');
    body.innerHTML = `<div style="text-align:center;padding:30px 10px"><span class="spin" style="font-size:2rem">⏳</span><p class="muted">בודק התאמות לספר המתכונים שלך…</p></div>`;
    let invNames = [];
    try {
      const inv = await API.call('/inventory');
      invNames = (inv.items || []).map(x => x.name).filter(Boolean);
    } catch (e) { invNames = []; }
    const book = (typeof recipes !== 'undefined' && Array.isArray(recipes)) ? recipes : [];
    const matches = matchRecipes(book, invNames).slice(0, 6);
    const best = matches.length ? matches[0].pct : 0;

    const openBtn = m => (typeof showRecipe === 'function')
      ? `<button type="button" data-fr-open="${m.recipe.id}">לצפייה</button>` : '';

    body.innerHTML = `
      <h3>🍳 מה אפשר להכין</h3>
      <h4>📖 מהספר שלך</h4>
      ${matches.length ? matches.map(m => `
        <div class="frSug"><div class="row" style="justify-content:space-between">
          <div><b>${escH(m.recipe.name)}</b><div class="muted">יש לך ${m.have} מתוך ${m.total} מרכיבים · <span class="pct">${m.pct}% התאמה</span></div></div>
          ${openBtn(m)}
        </div></div>`).join('')
        : `<p class="muted">${invNames.length ? 'לא נמצאה התאמה טובה בספר שלך כרגע.' : 'המלאי ריק או לא נטען — אי אפשר להתאים מתכונים.'}</p>`}
      ${best < 50 && invNames.length ? `<p class="notice">💡 ההתאמה הטובה ביותר היא ${best}%. אפשר לקבל רעיונות מהעוזר החכם למטה.</p>` : ''}
      <h4 style="margin-top:18px">🤖 רעיונות מהעוזר החכם</h4>
      <p class="muted">אם לא יודעים מה רוצים — ענו על 3 שאלות קצרות וקבלו הצעות:</p>
      <div><b>סוג:</b><div class="frChips" id="frKindChips">${['בשרי', 'חלבי', 'פרווה', 'לא משנה'].map(k => `<button type="button" data-v="${k}" class="${k === this.S.prefs.kind ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      <div><b>רמת קושי:</b><div class="frChips" id="frLevelChips">${['קל', 'בינוני', 'מאתגר', 'לא משנה'].map(k => `<button type="button" data-v="${k}" class="${k === this.S.prefs.level ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      <div><b>זמן הכנה:</b><div class="frChips" id="frTimeChips">${['עד 20 דקות', 'עד 45 דקות', 'עד שעה וחצי', 'לא משנה'].map(k => `<button type="button" data-v="${k}" class="${k === this.S.prefs.time ? 'on' : ''}">${k}</button>`).join('')}</div></div>
      <div class="frActions"><button type="button" id="frAiBtn" class="primary">✨ קבלת רעיונות</button></div>
      <div id="frAiOut"></div>
      <p class="muted" style="margin-top:14px">רעיונות ה-AI הם הצעות בלבד. מתכון שישמר מרעיון כזה יסומן תמיד כ״נוצר ע״י העוזר החכם של תבלין״ — לעולם לא כמתכון משפחתי.</p>
      <div class="frActions"><button type="button" id="frDone">סגירה</button></div>`;

    const chipGroup = (id, key) => {
      $H('#' + id).querySelectorAll('button').forEach(b => {
        b.onclick = () => {
          this.S.prefs[key] = b.dataset.v;
          $H('#' + id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        };
      });
    };
    chipGroup('frKindChips', 'kind'); chipGroup('frLevelChips', 'level'); chipGroup('frTimeChips', 'time');
    body.querySelectorAll('[data-fr-open]').forEach(b => b.onclick = () => { $H('#fridgeDialog').close(); showRecipe(b.dataset.frOpen); });
    $H('#frAiBtn').onclick = () => this.aiSuggestIdeas(invNames);
    $H('#frDone').onclick = () => $H('#fridgeDialog').close();
  },

  async aiSuggestIdeas(invNames) {
    const out = $H('#frAiOut');
    const btn = $H('#frAiBtn');
    btn.disabled = true;
    out.innerHTML = `<p class="muted"><span class="spin">⏳</span> העוזר החכם חושב…</p>`;
    const p = this.S.prefs;
    const prefBits = [];
    if (p.kind !== 'לא משנה') prefBits.push('סוג: ' + p.kind);
    if (p.level !== 'לא משנה') prefBits.push('רמת קושי: ' + p.level);
    if (p.time !== 'לא משנה') prefBits.push('זמן הכנה: ' + p.time);
    const userText = `במלאי שלי יש: ${(invNames.length ? invNames.join(', ') : 'לא צוין מלאי')}.`
      + (prefBits.length ? ` העדפות: ${prefBits.join(', ')}.` : '')
      + ` הצע 3 רעיונות קצרים למה אפשר לבשל, בעברית, כל רעיון בשורה-שתיים עם המרכיבים העיקריים.`;
    try {
      const r = await fetch('/api/ai', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'chat', messages: [{ role: 'user', text: userText }] })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || j.error || 'ai_failed');
      out.innerHTML = `<div class="frAiReply">${escH(j.reply || '')}</div>`;
    } catch (e) {
      const net = e && /failed to fetch|networkerror/i.test(e.message || '');
      out.innerHTML = `<div class="notice">⚠️ ${escH(net ? 'אין חיבור לרשת. ה-AI דורש אינטרנט.' : (e.message || 'שירות ה-AI נכשל. נסו שוב מאוחר יותר.'))}</div>`;
    } finally {
      btn.disabled = false;
    }
  }
};

/* Export pure helpers for Node tests; expose UI in browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { frKey, computeTargetSize, confBadgeLevel, sliceJSON, cleanVisionItems, parseVisionResponse, matchRecipes, compressImage };
} else if (typeof window !== 'undefined') {
  window.FridgeScan = FridgeScan;
}
