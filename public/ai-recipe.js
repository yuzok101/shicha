'use strict';
/* ============================================================================
 * ai-recipe.js — יצירת מתכונים על־ידי ה־AI (תבלין) 🤖
 *
 * מודול עצמאי (לא נוגע ב-worker.js / 3-app.js / index.html).
 * מציג את `AiRecipe` הגלובלי עם: html(), init(), createFromInventory(),
 * createFree(), preview(), save() — ועוד עזרים טהורים שנבדקים ב-Node.
 *
 * IRON RULE — תיוג מקור חובה:
 *   כל מתכון שה-AI יוצר מקבל source:'ai' + sourceLabel:'נוצר על־ידי העוזר
 *   החכם של תבלין', ומוצג תמיד עם התגית "🤖 נוצר על־ידי AI" — אף פעם לא
 *   נראה כמו מתכון משפחתי. הקונטקסט של היצירה נשמר בשדה aiContext
 *   (פנימי — לא מוצג כהערות המתכון).
 *
 * חוזה מול השרת:
 *   POST /api/ai  {action:'generate', kind:'inventory'|'free',
 *                  inventory:[{name,quantity,unit}...], request:'...',
 *                  prompt:'...'}  →  {data:{name,category,minutes,
 *                  ingredients:[],steps:[],notes:''}}  (או {reply:'...'})
 *   שגיאות: 503 {error:'ai_unavailable'} כשהמפתח לא הוגדר,
 *            400 {error:'bad_action'} כשהשרת עוד לא תומך ב-generate.
 *
 * ============================================================================
 * הוראות שילוב לרכז (coordinator) — בלי לערוך את הקובץ הזה:
 *
 * 1) index.html — הוסיפו לפני </body>, אחרי 3-app.js:
 *      <script src="ai-recipe.js?v=1"></script>
 *
 * 2) כפתור ניווט — למשל ב-showAddMenu() ב-3-app.js הוסיפו כפתור:
 *      <button data-add="ai">🤖 יצירת מתכון ב-AI</button>
 *    וב-handler שלו:  else if(x==='ai'){AiRecipe.open()}
 *    (או: actions.aiCreate=()=>AiRecipe.open(); וכפתור data-action="aiCreate")
 *
 * 3) תצוגה כ-view (אופציונלי — open() עובד גם כדיאלוג עצמאי):
 *    ב-render() הוסיפו 'aiCreate' לרשימת ה-views התקינים, הוסיפו לשרשור:
 *      view==='aiCreate'?AiRecipe.html():
 *    ואחרי bind() הוסיפו:  if(view==='aiCreate')AiRecipe.init();
 *
 * 4) תגית AI בתצוגות קיימות — ב-card() אחרי <h3> הוסיפו:
 *      ${AiRecipe.badgeHTML(r)}
 *    וב-showRecipe() ליד שורת ה-meta הוסיפו:
 *      ${AiRecipe.badgeHTML(r)}
 *
 * 5) שמירת source:'ai' דרך העורך — ב-openEditor() אחרי f.reset() הוסיפו:
 *      f.dataset.seedSource=(!id&&seed&&seed.source)?seed.source:'';
 *    וב-$('#recipeForm').onsubmit החליפו:
 *      source:old?.source||'manual'
 *    ב-:
 *      source:old?.source||e.target.dataset.seedSource||'manual'
 *    (בלי זה, שמירה מתוך "עריכה" בתצוגה המקדימה תחזיר source ל-'manual')
 *
 * 6) worker.js — הוסיפו ל-AI_SYS:
 *      generate:'אתה יוצר מתכונים לאפליקציית המתכונים הישראלית "תבלין". ענה אך ורק ב-JSON תקין, ללא טקסט נוסף וללא סימוני קוד.',
 *    והוסיפו ב-aiSpec() (אחרי ה-parse branch):
 *      if(action==='generate'){const inv=(b.inventory||[]).map(i=>typeof i==='string'?i.trim():[i.name,i.quantity,i.unit].filter(x=>x!=null&&String(x).trim()!=='').join(' ')).filter(Boolean).join(', ');const prompt=(b.kind==='inventory'?('המרכיבים שיש בבית: '+(inv||'לא צוינו')+'\nצור מתכון אחד בעברית שמשתמש בעיקר במרכיבים האלה. מותר להוסיף מצרכי יסוד (מלח, פלפל, שמן, מים).'):('הבקשה: "'+String(b.request||'').slice(0,300)+'"\nצור מתכון אחד בעברית לפי הבקשה.'))+'\nהחזר JSON בלבד: {"name":"שם המתכון","category":"אחת מ: פרווה/חלבי/בשרי/קינוח/ארוחות עיקריות/סלטים ותוספות/מרקים/דגים/מאפים ופשטידות/ארוחות בוקר/ילדים/שבת וחגים/אחר","minutes":30,"ingredients":["מרכיב + כמות"],"steps":["שלב"],"notes":""}.';return{temp:0.7,tokens:1500,prompt}}
 *    (aiCleanJSON הקיים כבר מטפל ב-```json fences)
 * ========================================================================== */
(function (global) {
  'use strict';

  var g = (typeof window !== 'undefined') ? window : globalThis;

  /* ---------------- קבועים ---------------- */
  var SOURCE = 'ai';
  var SOURCE_LABEL = 'נוצר על־ידי העוזר החכם של תבלין';
  var BADGE_TEXT = '🤖 נוצר על־ידי AI';
  var AI_UNSET_MSG = 'העוזר החכם עדיין לא הוגדר. יוני צריך להגדיר את המפתח בהגדרות.';

  var h = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ======================================================================
   * לוגיקה טהורה — נבדקת ב-Node, בלי DOM
   * ====================================================================== */

  // (א) חילוץ JSON — עם/בלי ```json fences, עם טקסט מסביב
  function extractJSON(text) {
    if (text == null) return null;
    var m = String(text).replace(/```json/gi, '```').trim();
    var fence = m.match(/```([\s\S]*?)```/);
    if (fence) m = fence[1].trim();
    var bo = m.indexOf('{'), bc = m.lastIndexOf('}');
    var ao = m.indexOf('['), ac = m.lastIndexOf(']');
    var c = m;
    if (ao >= 0 && (bo < 0 || ao < bo)) c = m.slice(ao, ac + 1);
    else if (bo >= 0) c = m.slice(bo, bc + 1);
    try { return JSON.parse(c); }
    catch (e) {
      try { return JSON.parse(c.replace(/[^\}\]]+$/, '')); }
      catch (e2) { return null; }
    }
  }

  // נירמול פריט מלאי: "שם כמות יחידה" (או מחרוזת כפי שהיא)
  function normItem(it) {
    if (typeof it === 'string') return it.trim();
    if (it && typeof it === 'object') {
      var parts = [it.name,
        (it.quantity != null && String(it.quantity).trim() !== '') ? it.quantity : null,
        (it.unit != null && String(it.unit).trim() !== '') ? it.unit : null
      ].filter(function (x) { return x != null && String(x).trim() !== ''; });
      return parts.join(' ').trim();
    }
    return '';
  }

  // (ג) בניית פרומפט — חייב לכלול את פריטי המלאי
  function buildInventoryPrompt(items) {
    var list = (items || []).map(normItem).filter(Boolean);
    return 'יש לי בבית את המרכיבים הבאים:\n' +
      (list.length ? list.map(function (x) { return '• ' + x; }).join('\n') : '• (לא צוינו מרכיבים)') +
      '\n\nהמצא מתכון אחד בעברית שמשתמש בעיקר במרכיבים האלה.' +
      ' מותר להוסיף מצרכי יסוד בסיסיים (מלח, פלפל, שמן, מים) אם צריך.' +
      ' החזר אך ורק JSON במבנה: {"name":"שם המתכון","category":"קטגוריה","minutes":30,"ingredients":["מרכיב + כמות"],"steps":["שלב הכנה"],"notes":"הערה קצרה או מחרוזת ריקה"}.';
  }

  function buildFreePrompt(request) {
    var r = String(request || '').trim();
    return 'הבקשה שלי: "' + r + '"\n\n' +
      'המצא מתכון אחד בעברית לפי הבקשה.' +
      ' החזר אך ורק JSON במבנה: {"name":"שם המתכון","category":"קטגוריה","minutes":30,"ingredients":["מרכיב + כמות"],"steps":["שלב הכנה"],"notes":"הערה קצרה או מחרוזת ריקה"}.';
  }

  // (ב) IRON RULE — בניית מתכון תמיד עם source:'ai' + sourceLabel
  // מחזיר null אם חסרים שם/מרכיבים/שלבים
  function buildRecipe(data, aiContext) {
    var d = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    var name = String(d.name || '').trim();
    var ingredients = Array.isArray(d.ingredients)
      ? d.ingredients.map(function (x) { return String(x).trim(); }).filter(Boolean) : [];
    var steps = Array.isArray(d.steps)
      ? d.steps.map(function (x) { return String(x).trim(); }).filter(Boolean) : [];
    if (!name || !ingredients.length || !steps.length) return null;
    var minutes = parseInt(d.minutes, 10);
    if (!isFinite(minutes)) minutes = 0;
    return {
      name: name,
      category: String(d.category || 'אחר').trim() || 'אחר',
      minutes: Math.max(0, Math.min(1440, minutes)),
      ingredients: ingredients,
      steps: steps,
      notes: String(d.notes || '').trim(),
      source: SOURCE,             // IRON RULE — תמיד 'ai', גם אם ה-data ניסה אחרת
      sourceLabel: SOURCE_LABEL,  // IRON RULE — תמיד קיים
      aiContext: (aiContext && typeof aiContext === 'object') ? aiContext : { note: 'no-context' },
      photo: '',
      sourceImage: '',
      favorite: false
    };
  }

  function isAiRecipe(r) { return !!(r && r.source === SOURCE); }

  // מטען לשמירה בשרת — אוכף source:'ai', מסיר aiContext (פנימי בלבד)
  function savePayload(recipe) {
    var r = {};
    for (var k in recipe) if (Object.prototype.hasOwnProperty.call(recipe, k)) r[k] = recipe[k];
    r.source = SOURCE;
    r.sourceLabel = SOURCE_LABEL;
    delete r.aiContext;
    return r;
  }

  // (ד) הודעות שגיאה בעברית — כולל AI לא מוגדר
  function errorMessage(res) {
    var err = res && res.error;
    if (err === 'ai_unavailable') return AI_UNSET_MSG;
    if (err === 'bad_action') return 'יצירת מתכוני AI עדיין לא הופעלה בשרת. נסו שוב מאוחר יותר.';
    if (err === 'rate_limited') return (res && res.message) || 'עברת את מכסת בקשות ה-AI לשעה. נסו שוב מאוחר יותר.';
    if (err === 'network') return 'אין חיבור לרשת. ה-AI דורש אינטרנט.';
    if (err === 'ai_parse') return 'ה-AI החזיר תשובה לא תקינה. נסו שוב.';
    return (res && res.message) || 'שירות ה-AI נכשל כרגע. נסו שוב מאוחר יותר.';
  }

  // תגית AI — מחזיר מחרוזת ריקה למתכון לא-AI
  function badgeHTML(r) {
    if (!isAiRecipe(r)) return '';
    return '<span class="aiBadge" title="' + h(SOURCE_LABEL) + '">' + h(BADGE_TEXT) + '</span>';
  }

  /* ======================================================================
   * שכבת הדפדפן — מוגנת מפני Node (typeof document)
   * ====================================================================== */

  var busy = false;
  var lastGen = null; // {root, kind, payload} ל"יצירה מחדש"

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('ai-recipe-styles')) return;
    var st = document.createElement('style');
    st.id = 'ai-recipe-styles';
    st.textContent = [
      '.aiBadge{display:inline-block;background:#241b3d;color:#fff;border:2px solid #8b6fd8;border-radius:999px;padding:6px 16px;font-weight:800;font-size:.95rem;white-space:nowrap;vertical-align:middle}',
      '.aiModes{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}',
      '.aiMode{min-height:130px;display:grid;place-items:center;gap:4px;background:var(--paper,#fffdf8);border:2px solid var(--line,#e5d9c8);border-radius:20px;font-size:1.05rem;padding:16px}',
      '.aiMode span{font-size:2.4rem}',
      '.aiMode small{color:var(--muted,#726b61);font-weight:400}',
      '.aiBig{min-height:56px;font-size:1.1rem}',
      '.aiInvList{display:grid;gap:8px;max-height:42vh;overflow:auto;margin:12px 0}',
      '.aiInvItem{display:flex;align-items:center;gap:12px;background:var(--paper,#fffdf8);border:1px solid var(--line,#e5d9c8);border-radius:14px;padding:14px;font-size:1.05rem;cursor:pointer}',
      '.aiInvItem input{width:24px;height:24px;flex:0 0 auto}',
      '.aiStatus{background:var(--sage,#dce8d8);border-radius:14px;padding:14px;margin:14px 0;font-weight:700}',
      '.aiStatus.aiError{background:#f6d9d4;color:#7c2d24}',
      '.aiDialog .aiWrap{padding:clamp(18px,4vw,32px)}',
      '.aiDialog h1{margin:.3em 0}',
      '.aiDialog section{margin-block:18px}',
      '.aiDialog li{margin-block:8px;line-height:1.6;font-size:1.05rem}',
      '.aiActions{position:sticky;bottom:0;display:flex;gap:10px;background:var(--paper,#fffdf8);padding-top:12px;flex-wrap:wrap}',
      '.aiActions button{flex:1;min-width:140px;min-height:56px}',
      '#aiFreeReq{min-height:56px;font-size:1.1rem}',
      '@media(max-width:600px){.aiModes{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // קריאה ל-/api/ai — דרך apiAI של 3-app.js אם קיים, אחרת fetch ישיר
  async function _callAI(action, payload) {
    if (typeof g.apiAI === 'function') return g.apiAI(action, payload);
    try {
      var body = { action: action };
      for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) body[k] = payload[k];
      var r = await fetch('/api/ai', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) return { ok: false, error: j.error || 'ai_failed', message: j.message };
      j.ok = true;
      return j;
    } catch (e) { return { ok: false, error: 'network' }; }
  }

  function setStatus(root, msg, isError) {
    var el = root.querySelector('#aiCreateStatus');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; el.className = 'aiStatus'; return; }
    el.hidden = false;
    el.className = 'aiStatus' + (isError ? ' aiError' : '');
    el.textContent = (isError ? '⚠️ ' : '') + msg;
  }

  // מסך הכניסה — שני מצבים
  function html() {
    return '' +
      '<div class="sectionHead"><div><button type="button" data-ai-back>← חזרה</button>' +
      '<span class="eyebrow">העוזר החכם 🤖</span><h1>יצירת מתכון חדש</h1></div></div>' +
      '<p class="muted">כל מתכון שה-AI יוצר מסומן בתגית ברורה — הוא אף פעם לא ייראה כמו מתכון משפחתי.</p>' +
      '<div class="aiModes">' +
      '<button type="button" class="aiMode" id="aiModeInv"><span>🧺</span><b>מהמלאי שלי</b><small>מתכון ממה שיש בבית</small></button>' +
      '<button type="button" class="aiMode" id="aiModeFree"><span>✨</span><b>יצירה חופשית</b><small>תארו מה בא לכם</small></button>' +
      '</div><div id="aiCreateBody"></div>' +
      '<div id="aiCreateStatus" class="aiStatus" role="status" hidden></div>';
  }

  function init(root) {
    if (typeof document === 'undefined') return;
    root = root || document;
    injectStyles();
    var back = root.querySelector('[data-ai-back]');
    if (back && !back.dataset.bound) {
      back.dataset.bound = '1';
      back.onclick = function () { if (typeof g.render === 'function') g.render('home'); };
    }
    var inv = root.querySelector('#aiModeInv');
    if (inv) inv.onclick = function () { createFromInventory(root); };
    var free = root.querySelector('#aiModeFree');
    if (free) free.onclick = function () { createFree(root); };
  }

  // פתיחה כדיאלוג עצמאי (לא דורש שינוי ב-render)
  function open() {
    if (typeof document === 'undefined') return;
    injectStyles();
    var d = document.createElement('dialog');
    d.className = 'aiDialog';
    d.innerHTML = '<div class="aiWrap">' + html() + '</div>';
    document.body.append(d);
    var back = d.querySelector('[data-ai-back]');
    back.textContent = '✕ סגירה';
    back.dataset.bound = '1';
    back.onclick = function () { d.close(); };
    d.addEventListener('close', function () { d.remove(); }, { once: true });
    init(d);
    d.showModal();
  }

  // מצב 1: מהמלאי שלי
  async function createFromInventory(root) {
    var body = root.querySelector('#aiCreateBody');
    if (!body) return;
    setStatus(root, 'טוען את המלאי…');
    var items = null, loadFailed = false;
    try {
      if (g.API && typeof g.API.call === 'function') {
        var x = await g.API.call('/inventory');
        items = Array.isArray(x.items) ? x.items : (Array.isArray(x) ? x : []);
      } else { loadFailed = true; }
    } catch (e) { loadFailed = true; }
    if (loadFailed || !items || !items.length) {
      body.innerHTML =
        '<div class="notice">' + (loadFailed
          ? 'לא הצלחתי לטעון את המלאי מהשרת. אפשר להקליד את המרכיבים ידנית:'
          : 'המלאי ריק. אפשר להקליד את המרכיבים ידנית:') + '</div>' +
        '<label>מרכיבים שיש בבית (שורה לכל מרכיב)<textarea id="aiManualInv" rows="5" placeholder="לדוגמה:\n3 ביצים\n200 גרם קמח\n1 כוס חלב"></textarea></label>' +
        '<button type="button" class="primary aiBig" id="aiGenInv">🤖 צור מתכון מהמרכיבים</button>';
      root.querySelector('#aiGenInv').onclick = function () {
        var lines = String(root.querySelector('#aiManualInv').value || '')
          .split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) { setStatus(root, 'כתבו לפחות מרכיב אחד.', true); return; }
        generate(root, 'inventory', { items: lines.map(function (n) { return { name: n }; }) });
      };
      setStatus(root, null);
      return;
    }
    body.innerHTML =
      '<p><b>בחרו מרכיבים</b> <span class="muted">(או השאירו הכל מסומן)</span></p>' +
      '<div class="aiInvList">' + items.map(function (it, i) {
        return '<label class="aiInvItem"><input type="checkbox" data-ai-inv="' + i + '" checked> ' +
          '<span>' + h(normItem(it) || it.name) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="row"><button type="button" class="primary aiBig" id="aiGenInv">🤖 צור מתכון מהנבחרים</button>' +
      '<button type="button" id="aiInvAll">בחירת הכל</button>' +
      '<button type="button" id="aiInvNone">ניקוי</button></div>';
    var boxes = function () { return root.querySelectorAll('[data-ai-inv]'); };
    root.querySelector('#aiInvAll').onclick = function () { boxes().forEach(function (c) { c.checked = true; }); };
    root.querySelector('#aiInvNone').onclick = function () { boxes().forEach(function (c) { c.checked = false; }); };
    root.querySelector('#aiGenInv').onclick = function () {
      var sel = Array.prototype.filter.call(boxes(), function (c) { return c.checked; })
        .map(function (c) { return items[+c.dataset.aiInv]; }).filter(Boolean);
      if (!sel.length) { setStatus(root, 'בחרו לפחות מרכיב אחד.', true); return; }
      generate(root, 'inventory', { items: sel });
    };
    setStatus(root, null);
  }

  // מצב 2: יצירה חופשית
  function createFree(root) {
    var body = root.querySelector('#aiCreateBody');
    if (!body) return;
    setStatus(root, null);
    body.innerHTML =
      '<label>תמציא לי מתכון ל…<input id="aiFreeReq" maxlength="300" placeholder="לדוגמה: עוגת שוקולד ללא גלוטן" autocomplete="off"></label>' +
      '<button type="button" class="primary aiBig" id="aiGenFree">🤖 צור מתכון</button>' +
      '<p class="muted">אפשר לציין העדפות: פרווה / חלבי / בשרי, זמן הכנה, רמת קושי.</p>';
    var go = function () {
      var req = String(root.querySelector('#aiFreeReq').value || '').trim();
      if (!req) { setStatus(root, 'כתבו מה בא לכם שה-AI ימציא.', true); return; }
      generate(root, 'free', { request: req });
    };
    root.querySelector('#aiGenFree').onclick = go;
    root.querySelector('#aiFreeReq').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
    root.querySelector('#aiFreeReq').focus();
  }

  // קריאה ל-AI + מעבר לתצוגה מקדימה
  async function generate(root, kind, payload) {
    if (busy) return;
    busy = true;
    lastGen = { root: root, kind: kind, payload: payload };
    setStatus(root, 'ה-AI חושב… 🤔 זה יכול לקחת כמה שניות.');
    var prompt = kind === 'inventory' ? buildInventoryPrompt(payload.items) : buildFreePrompt(payload.request);
    var aiContext = {
      kind: kind,
      createdAt: new Date().toISOString(),
      inventoryUsed: kind === 'inventory' ? (payload.items || []).map(normItem).filter(Boolean) : [],
      request: kind === 'free' ? String(payload.request || '') : '',
      prompt: prompt
    };
    var body = kind === 'inventory'
      ? { kind: kind, inventory: payload.items, prompt: prompt }
      : { kind: kind, request: payload.request, prompt: prompt };
    var res;
    try { res = await _callAI('generate', body); }
    catch (e) { res = { ok: false, error: 'network' }; }
    busy = false;
    if (!res || !res.ok) { setStatus(root, errorMessage(res), true); return; }
    var raw = (res.data != null) ? res.data : extractJSON(res.reply || res.text || '');
    var recipe = buildRecipe(raw, aiContext);
    if (!recipe) { setStatus(root, 'ה-AI החזיר תשובה לא תקינה. נסו שוב.', true); return; }
    setStatus(root, null);
    preview(root, recipe);
  }

  // תצוגה מקדימה לפני שמירה — עם תגית AI, עריכה ושמירה
  function preview(root, recipe) {
    var d = document.createElement('dialog');
    d.className = 'aiDialog';
    d.innerHTML =
      '<div class="aiWrap"><div class="dlgHead"><div>' + badgeHTML(recipe) + '</div>' +
      '<button type="button" data-ai-close aria-label="סגירה">✕</button></div>' +
      '<h1>' + h(recipe.name) + '</h1>' +
      '<div class="meta">' + h(recipe.category) + ' · ' + (recipe.minutes || 0) + ' דקות</div>' +
      '<section><h2>מרכיבים</h2><ul>' +
      recipe.ingredients.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') +
      '</ul></section><section><h2>אופן ההכנה</h2><ol>' +
      recipe.steps.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') +
      '</ol></section>' +
      (recipe.notes ? '<section><h2>הערות</h2><p>' + h(recipe.notes) + '</p></section>' : '') +
      '<p class="notice">המתכון יישמר עם התגית <b>' + h(BADGE_TEXT) + '</b> — תמיד יהיה ברור שהוא נוצר על־ידי ה-AI.</p>' +
      '<div class="row aiActions">' +
      '<button type="button" class="primary aiBig" data-ai-save>💾 שמירה לספר</button>' +
      '<button type="button" data-ai-edit>✏️ עריכה</button>' +
      '<button type="button" data-ai-regen>🔄 יצירה מחדש</button>' +
      '</div></div>';
    document.body.append(d);
    d.querySelector('[data-ai-close]').onclick = function () { d.close(); };
    d.addEventListener('close', function () { d.remove(); }, { once: true });
    d.querySelector('[data-ai-edit]').onclick = function () {
      d.close();
      // seed עם source:'ai' — דורש את התיקון ב-3-app.js (סעיף 5 בהוראות השילוב)
      if (typeof g.openEditor === 'function') {
        g.openEditor(null, {
          name: recipe.name, category: recipe.category, minutes: recipe.minutes,
          ingredients: recipe.ingredients, steps: recipe.steps,
          notes: recipe.notes, source: SOURCE
        });
      }
    };
    d.querySelector('[data-ai-regen]').onclick = function () {
      d.close();
      if (lastGen) generate(lastGen.root, lastGen.kind, lastGen.payload);
    };
    d.querySelector('[data-ai-save]').onclick = function () { save(d, recipe); };
    d.showModal();
  }

  // שמירה למטמון המקומי (כולל aiContext הפנימי)
  function cacheLocal(rec) {
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    return new Promise(function (ok, no) {
      try {
        var q = indexedDB.open('tavlin', 1);
        q.onerror = function () { no(q.error); };
        q.onsuccess = function () {
          try {
            var tx = q.result.transaction('recipes', 'readwrite');
            tx.objectStore('recipes').put(rec);
            tx.oncomplete = function () { ok(); };
            tx.onerror = function () { no(tx.error); };
          } catch (e) { no(e); }
        };
      } catch (e) { no(e); }
    });
  }

  // שמירה — תמיד עם source:'ai'
  async function save(dlg, recipe) {
    var btn = dlg.querySelector('[data-ai-save]');
    if (btn) { btn.disabled = true; btn.textContent = 'שומר…'; }
    var payload = savePayload(recipe); // אוכף source:'ai', מסיר aiContext
    try {
      var saved = await g.API.call('/recipes', { method: 'POST', body: JSON.stringify(payload) });
      var serverRecipe = (saved && saved.recipe) || {};
      await cacheLocal(Object.assign({}, recipe, serverRecipe, {
        id: serverRecipe.id || recipe.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }));
      if (g.API && typeof g.API.load === 'function') await g.API.load();
      dlg.close();
      if (typeof g.render === 'function') g.render('library');
      if (typeof g.toast === 'function') g.toast('המתכון נשמר לספר 🤖');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 שמירה לספר'; }
      if (typeof g.toast === 'function') g.toast('לא הצלחנו לשמור כרגע. נסו שוב.');
    }
  }

  /* ---------------- API ציבורי ---------------- */
  var AiRecipe = {
    SOURCE: SOURCE,
    SOURCE_LABEL: SOURCE_LABEL,
    BADGE_TEXT: BADGE_TEXT,
    AI_UNSET_MSG: AI_UNSET_MSG,
    // לוגיקה טהורה (נבדקת)
    extractJSON: extractJSON,
    normItem: normItem,
    buildInventoryPrompt: buildInventoryPrompt,
    buildFreePrompt: buildFreePrompt,
    buildRecipe: buildRecipe,
    savePayload: savePayload,
    errorMessage: errorMessage,
    isAiRecipe: isAiRecipe,
    badgeHTML: badgeHTML,
    // דפדפן
    html: html,
    init: init,
    open: open,
    createFromInventory: createFromInventory,
    createFree: createFree,
    generate: generate,
    preview: preview,
    save: save,
    injectStyles: injectStyles
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AiRecipe;
  else global.AiRecipe = AiRecipe;
})(typeof window !== 'undefined' ? window : globalThis);
