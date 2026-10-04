/* Voice — שליטה קולית "היי מטבח" לתבלין.
   §§40-42 באפיון. מושבת אוטומטית בשבת/חג (Hebcal + נפילה מקומית). */
const Voice = (() => {
  const WAKE = ['היי מטבח', 'הי מטבח', 'היי מתבח'];
  const HEBCAL_URL = 'https://www.hebcal.com/shabbat?cfg=json&geonameid=281184&m=60';
  const CACHE_KEY = 'tavlin-shabbat-cache';

  let rec = null, listening = false, commandMode = false, cmdTimer = null;
  let supported = false;

  // ---------- settings ----------
  function prefs() { try { return JSON.parse(localStorage.getItem('tavlin-settings') || '{}'); } catch { return {}; } }
  function voiceOn() { const p = prefs(); return p.voice !== false; }
  function shabbatGuardOn() { const p = prefs(); return p.voiceShabbatOff !== false; } // default ON

  // ---------- Shabbat / holiday detection ----------
  function satFallback() { return new Date().getDay() === 6; }
  function getCache() { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && (Date.now() - c.at < 6 * 3600e3) ? c : null; } catch { return null; } }
  async function refreshShabbatCache() {
    try {
      const r = await fetch(HEBCAL_URL, { cache: 'no-store' });
      const d = await r.json();
      const items = (d.items || []).map(x => ({ date: new Date(x.date).getTime(), cat: x.category })).sort((a, b) => a.date - b.date);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
      return items;
    } catch { return null; }
  }
  function isShabbatFromItems(items, now) {
    if (!items || !items.length) return null;
    let candles = null;
    for (const it of items) { if (it.cat === 'candles' && it.date <= now) candles = it.date; }
    if (candles == null) return false;
    for (const it of items) { if (it.cat === 'havdalah' && it.date > candles) return now < it.date; }
    return null;
  }
  async function isShabbatNow() {
    if (!shabbatGuardOn()) return false;
    const now = Date.now();
    let c = getCache();
    if (!c) { const items = await refreshShabbatCache(); c = items ? { items } : null; }
    if (c) { const r = isShabbatFromItems(c.items, now); if (r !== null) return r; }
    return satFallback(); // offline fallback: Saturday
  }

  // ---------- speech ----------
  function init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    supported = !!SR;
    if (!supported) return false;
    rec = new SR();
    rec.lang = 'he-IL'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = onResult;
    rec.onend = () => { if (listening) { try { rec.start(); } catch {} } }; // auto-restart
    rec.onerror = (e) => { if (e.error === 'not-allowed') stop(); };
    return true;
  }
  function onResult(e) {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript + ' ';
    text = text.trim();
    if (!text) return;
    if (!commandMode) {
      if (WAKE.some(w => text.includes(w)) || (text.includes('מטבח') && /היי|הי/.test(text))) enterCommandMode();
    } else if (e.results[e.results.length - 1].isFinal) {
      const cmd = text.replace(/היי מטבח|הי מטבח/g, '').trim();
      exitCommandMode();
      if (cmd) handleCommand(cmd);
    }
  }
  function enterCommandMode() {
    commandMode = true; showListening(true);
    speak('כן?');
    clearTimeout(cmdTimer);
    cmdTimer = setTimeout(exitCommandMode, 9000);
  }
  function exitCommandMode() { commandMode = false; clearTimeout(cmdTimer); showListening(false); }

  async function start() {
    if (!supported) { toast('הדפדפן לא תומך בזיהוי קולי'); return false; }
    if (!voiceOn()) return false;
    if (await isShabbatNow()) { toast('שליטה קולית מושבתת בשבת ובחג'); return false; }
    if (listening) return true;
    try { rec.start(); listening = true; updateMicUI(); return true; }
    catch { return false; }
  }
  function stop() { listening = false; exitCommandMode(); try { rec && rec.stop(); } catch {} updateMicUI(); }

  // ---------- TTS ----------
  function speak(text) {
    try {
      const p = prefs(); if (p.voice === false) return;
      const u = new SpeechSynthesisUtterance(text); u.lang = 'he-IL'; u.rate = 1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch {}
  }

  // ---------- Hebrew number parsing ----------
  const NUMS = { 'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שנים': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10, 'אחת עשרה': 11, 'שתים עשרה': 12, 'שלוש עשרה': 13, 'ארבע עשרה': 14, 'חמש עשרה': 15, 'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50, 'שישים': 60 };
  function parseNum(text) {
    const d = text.match(/(\d+)/); if (d) return +d[1];
    if (/רבע שעה/.test(text)) return 15;
    if (/חצי שעה/.test(text)) return 30;
    if (/שעה(?!.*דק)/.test(text) && !/\d/.test(text)) return 60;
    for (const [w, n] of Object.entries(NUMS)) if (text.includes(w)) return n;
    const m = text.match(/(עשרים|שלושים|ארבעים|חמישים) ו(אחד|אחת|שניים|שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע)/);
    if (m) return NUMS[m[1]] + NUMS[m[2]];
    return null;
  }

  // ---------- commands ----------
  function curRecipe() { return (typeof cook !== 'undefined' && cook) ? recipes.find(x => x.id === cook.recipeId) : null; }
  function handleCommand(text) {
    const t = text.trim();
    // timers
    let m = t.match(/טיימר.*?(?:ל|של)?\s*(.+?)\s*דקות?/);
    if (/תפעיל טיימר|שים טיימר|טיימר/.test(t) && !/עוד/.test(t)) {
      const n = parseNum(t) || 5;
      if (typeof cook !== 'undefined' && cook) { updateCook({ timerMinutes: n, timerTarget: Date.now() + n * 60000, timerPausedSeconds: null, timerRang: null }); speak(`טיימר הופעל ל${n} דקות`); }
      else speak('פתחו מתכון כדי להפעיל טיימר');
      return;
    }
    if (/עוד/.test(t) && /דקות?/.test(t)) {
      const n = parseNum(t);
      if (n && typeof cook !== 'undefined' && cook && cook.timerTarget) { updateCook({ timerTarget: cook.timerTarget + n * 60000 }); speak(`הוספתי ${n} דקות`); }
      else speak('אין טיימר פעיל');
      return;
    }
    // steps
    if (/השלב הבא|שלב הבא|קדימה|הבא/.test(t)) { stepMove(1); return; }
    if (/שלב הקודם|הקודם|אחורה/.test(t)) { stepMove(-1); return; }
    if (/תקרא|קרא שוב|מה השלב|איזה שלב/.test(t)) { readStep(); return; }
    // ingredients
    m = t.match(/כמה ([\u0590-\u05FF]+)/);
    if (m) { ingredientAmount(m[1]); return; }
    m = t.match(/סמן (?:ששמתי )?([\u0590-\u05FF ]+)/);
    if (/סמן|שמתי/.test(t) && m) { markIngredient(m[1].trim()); return; }
    // open recipe
    m = t.match(/פתח (?:את )?(?:המתכון )?([\u0590-\u05FF ]+)/);
    if (m) { openRecipeByName(m[1].trim()); return; }
    speak('לא הבנתי. נסו: השלב הבא, תקרא, טיימר עשר דקות');
  }
  function stepMove(d) {
    const r = curRecipe(); if (!r || typeof cook === 'undefined' || !cook) { speak('אין בישול פעיל'); return; }
    const total = r.steps.length;
    const cur = Math.min(cook.detailIndex || 0, total - 1);
    const nx = Math.max(0, Math.min(total - 1, cur + d));
    updateCook({ detailIndex: nx });
    speak(d > 0 ? 'עוברים לשלב הבא' : 'חוזרים שלב');
  }
  function readStep() {
    const r = curRecipe(); if (!r) { speak('אין בישול פעיל'); return; }
    const i = Math.min(cook.detailIndex || 0, r.steps.length - 1);
    speak(`שלב ${i + 1}: ${r.steps[i]}`);
  }
  function ingredientAmount(name) {
    const r = curRecipe(); if (!r) { speak('אין בישול פעיל'); return; }
    const f = r.ingredients.find(x => x.includes(name));
    speak(f ? `${name}: ${f}` : `לא מצאתי ${name} במתכון`);
  }
  function markIngredient(name) {
    const r = curRecipe(); if (!r) { speak('אין בישול פעיל'); return; }
    const f = r.ingredients.find(x => x.includes(name));
    if (!f) { speak(`לא מצאתי ${name}`); return; }
    cook.doneIngredients = cook.doneIngredients || [];
    if (!cook.doneIngredients.includes(f)) cook.doneIngredients.push(f);
    document.querySelectorAll('#cookContent li').forEach(li => { if (li.textContent.includes(name)) li.classList.add('done'); });
    speak(`סימנתי ${name}`);
  }
  function openRecipeByName(name) {
    const r = recipes.find(x => x.name.includes(name));
    if (!r) { speak(`לא מצאתי מתכון בשם ${name}`); return; }
    if (typeof startCook === 'function') { startCook(r.id); speak(`פותח את ${r.name}`); }
  }

  // ---------- UI ----------
  function showListening(on) {
    let el = document.getElementById('voiceInd');
    if (on && !el) {
      el = document.createElement('div'); el.id = 'voiceInd'; el.className = 'voiceInd';
      el.innerHTML = '🎙️ מקשיב…'; document.body.append(el);
    } else if (!on && el) el.remove();
    updateMicUI();
  }
  function updateMicUI() {
    document.querySelectorAll('.micBtn').forEach(b => b.classList.toggle('live', listening));
  }
  function micButtonHTML() { return `<button type="button" class="micBtn" data-mic title="שליטה קולית">🎙️</button>`; }
  function bindMic(root) {
    root.querySelectorAll('[data-mic]').forEach(b => b.onclick = async () => {
      if (listening) { stop(); return; }
      // push-to-talk: single command
      const ok = await start();
      if (ok) { enterCommandMode(); toast('אמרו פקודה…'); }
    });
  }

  // ---------- settings UI ----------
  function settingsHTML() {
    const p = prefs();
    return `<fieldset class="sndField"><legend>🎙️ שליטה קולית</legend>
      <label class="row"><input type="checkbox" name="voice" ${p.voice !== false ? 'checked' : ''}> הפעלת שליטה קולית</label>
      <label class="row"><input type="checkbox" name="voiceShabbatOff" ${p.voiceShabbatOff !== false ? 'checked' : ''}> כבה קול בשבת וחג (מומלץ)</label>
      <p class="muted">אמרו "היי מטבח" ואז פקודה: השלב הבא · תקרא · טיימר עשר דקות · סמן סוכר · פתח עוגת שוקולד.<br>זיהוי שבת/חג: אוטומטי (Hebcal, חינם) עם גיבוי מקומי. כשהדף לא פעיל משתמשים בלחיצה על 🎙️.</p>
      <p class="muted" id="voiceShabbatState"></p></fieldset>`;
  }
  async function refreshShabbatState() {
    const el = document.getElementById('voiceShabbatState');
    if (!el) return;
    if (!shabbatGuardOn()) { el.textContent = ''; return; }
    el.textContent = await isShabbatNow() ? 'כעת שבת/חג — השליטה הקולית מושבתת.' : 'כעת יום חול — השליטה הקולית פעילה.';
  }

  function bindMicButton() { bindMic(document); }
  function startCookMode() { if (prefs().voice !== false && !isShabbatNow()) start(); }
  function stopCookMode() { stop(); }

  return { init, start, stop, speak, isShabbatNow, refreshShabbatCache, settingsHTML, refreshShabbatState, micButtonHTML, bindMic, bindMicButton, startCookMode, stopCookMode, parseNum, supported: () => supported };
})();
