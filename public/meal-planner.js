/* ============================================================================
 * meal-planner.js — תכנון ארוחות שבועי (Weekly Meal Planner) for Tavlin
 * ----------------------------------------------------------------------------
 * Self-contained page module. Exposes: window.MealPlanner = { html, init }.
 *
 * INTEGRATION INSTRUCTIONS (do NOT edit 3-app.js from this file):
 * 1. index.html — load this file BEFORE 3-app.js:
 *      <script src="meal-planner.js?v=78"></script>
 * 2. index.html — add a nav entry that calls render('planner'):
 *      header nav:  <button data-view="planner">🗓️ תכנון שבועי</button>
 *      (works because 3-app.js bind() wires every [data-view] button)
 *      and/or in the app menu (bound once at startup in 3-app.js):
 *      <button data-menu-view="planner">🗓️ תכנון ארוחות שבועי</button>
 * 3. 3-app.js render() — add 'planner' to the view whitelist and add a case:
 *      const html = view==='home' ? layoutHome()
 *        : view==='planner' ? MealPlanner.html()
 *        : ... ;
 *    then after $('#app').innerHTML = html; call MealPlanner.init();
 *    (keep the existing bind() call — it wires [data-view]/[data-action]).
 * 4. CSS — self-contained: MealPlanner.html() injects a <style> block with
 *    .mp-* classes. No 2-style.css changes needed.
 *
 * DATA: localStorage key 'tavlin-mealplan':
 *   { 'YYYY-MM-DD': { breakfast: recipeId, lunch: recipeId, dinner: recipeId } }
 * OFFLINE: the plan is localStorage-only and works fully offline. Inventory
 *   (/api/inventory) and shopping-list (/api/shopping) calls degrade
 *   gracefully with toast messages when the network/API is unavailable.
 * ========================================================================== */
(function(){
'use strict';

/* ---------------- pure logic (no DOM) — covered by meal-planner.test.js ---- */
var PLAN_KEY = 'tavlin-mealplan';
var DAYS_FULL = ['יום ראשון','יום שני','יום שלישי','יום רביעי','יום חמישי','יום שישי','יום שבת'];
var MONTHS = ['בינואר','בפברואר','במרץ','באפריל','במאי','ביוני','ביולי','באוגוסט','בספטמבר','באוקטובר','בנובמבר','בדצמבר'];
var SLOTS = [
  { id:'breakfast', label:'בוקר',    icon:'🌅' },
  { id:'lunch',     label:'צהריים', icon:'☀️' },
  { id:'dinner',    label:'ערב',    icon:'🌙' }
];

function pad2(n){ return String(n).padStart(2,'0'); }

/* Local calendar date as 'YYYY-MM-DD' (no timezone shift). */
function dateKey(d){
  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
}

/* Sunday (start of week) containing d, at local midnight. getDay(): 0=Sunday. */
function sundayOf(d){
  var x = new Date(d);
  x.setHours(0,0,0,0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

/* 7 consecutive dates starting at a Sunday. */
function weekDates(sun){
  var out = [];
  for (var i=0; i<7; i++){
    var d = new Date(sun);
    d.setDate(sun.getDate()+i);
    out.push(d);
  }
  return out;
}

function fmtDay(d){ return d.getDate() + ' ' + MONTHS[d.getMonth()]; }

/* e.g. "4–10 באוקטובר 2026", or "27 בספטמבר–3 באוקטובר 2026" across months. */
function weekLabel(sun){
  var ds = weekDates(sun), a = ds[0], b = ds[6];
  var left = (a.getMonth()===b.getMonth()) ? String(a.getDate()) : fmtDay(a);
  return left + '–' + fmtDay(b) + ' ' + b.getFullYear();
}

/* Ingredient normalization: strip quantities/fractions and parenthetical
 * notes, lowercase Hebrew. Mirrors invKey() in 3-app.js, kept local so the
 * pure logic stays testable without the app. */
function normIng(t){
  return String(t==null?'':t)
    .split(/[,(]/)[0]
    .replace(/[\d.\/½¼¾]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLocaleLowerCase('he');
}

function shopKeyOf(t){
  return String(t==null?'':t).replace(/\s+/g,' ').trim().toLowerCase();
}

/* store: { getItem, setItem } — pass localStorage in the app, a fake in tests. */
function readPlan(store){
  try{
    var raw = store.getItem(PLAN_KEY);
    if(!raw) return {};
    var p = JSON.parse(raw);
    return (p && typeof p==='object') ? p : {};
  }catch(e){ return {}; }
}
function writePlan(store, plan){
  try{ store.setItem(PLAN_KEY, JSON.stringify(plan||{})); return true; }
  catch(e){ return false; }
}

/* Collect unique ingredient lines from planned recipes.
 * plan: {dateKey:{slot:recipeId}}, byId: {recipeId:recipe},
 * onlyKeys: optional array/Set of date keys to include (the visible week). */
function aggregateIngredients(plan, byId, onlyKeys){
  var allow = null;
  if (onlyKeys){
    allow = {};
    var arr = Array.isArray(onlyKeys) ? onlyKeys : Array.from(onlyKeys);
    for (var k=0;k<arr.length;k++) allow[arr[k]] = true;
  }
  var seen = {}, out = [];
  var keys = Object.keys(plan||{});
  for (var i=0;i<keys.length;i++){
    var key = keys[i];
    if (allow && !allow[key]) continue;
    var day = plan[key];
    if (!day || typeof day!=='object') continue;
    for (var s=0;s<SLOTS.length;s++){
      var id = day[SLOTS[s].id];
      if(!id) continue;
      var r = byId ? byId[id] : null;
      if(!r) continue; // recipe deleted/unknown — skip silently
      var ings = r.ingredients || [];
      for (var j=0;j<ings.length;j++){
        var t = String(ings[j]==null?'':ings[j]).trim();
        if (t && !seen[t]){ seen[t]=true; out.push(t); }
      }
    }
  }
  return out;
}

/* Which ingredient lines are NOT covered by inventory names.
 * Forgiving substring match (like whatCanCook in 3-app.js): "בצלים" matches
 * inventory "בצל"; "כף שמן זית" matches "שמן". */
function missingItems(ingredients, invNames){
  var inv = [];
  (invNames||[]).forEach(function(n){
    var k = normIng(n);
    if (k.length>=2) inv.push(k);
  });
  return (ingredients||[]).filter(function(t){
    var k = normIng(t);
    if (k.length<2) return false; // quantity-only/empty line — nothing to buy
    return !inv.some(function(n){ return k.indexOf(n)>=0 || n.indexOf(k)>=0; });
  });
}

/* ---------------- DOM helpers (browser only) ---------------- */
var weekOffset = 0; // 0 = current week; init() re-binds after every render

function qs(s,r){ return (r||document).querySelector(s); }
function qsa(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
function eh(s){
  return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function say(m){ if (typeof toast==='function') toast(m); }
function ls(){
  try{
    var s = localStorage;
    s.getItem('__mp_probe__');
    return s;
  }catch(e){
    var mem = {};
    return {
      getItem:function(k){ return Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null; },
      setItem:function(k,v){ mem[k]=String(v); },
      removeItem:function(k){ delete mem[k]; }
    };
  }
}
function allRecipes(){
  return (typeof recipes!=='undefined' && Array.isArray(recipes)) ? recipes : [];
}
function recipeMap(){
  var m = {};
  allRecipes().forEach(function(r){ if(r&&r.id) m[r.id]=r; });
  return m;
}
function slotLabel(id){
  for (var i=0;i<SLOTS.length;i++) if (SLOTS[i].id===id) return SLOTS[i].icon+' '+SLOTS[i].label;
  return id;
}
function currentSunday(){
  var sun = sundayOf(new Date());
  sun.setDate(sun.getDate() + weekOffset*7);
  return sun;
}
function currentWeekKeys(){
  return weekDates(currentSunday()).map(dateKey);
}
function rerender(){
  if (typeof render==='function'){ render('planner'); return; }
  var app = qs('#app');
  if (app){ app.innerHTML = MealPlanner.html(); MealPlanner.init(); }
}

/* ---------------- page HTML ---------------- */
function styleBlock(){
  return '<style>' +
  '.mp-weeknav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0;flex-wrap:wrap}' +
  '.mp-weeknav .mp-label{font-size:1.25rem;font-weight:800}' +
  '.mp-weeknav .mp-navbtns{display:flex;gap:8px;flex-wrap:wrap}' +
  '.mp-weeknav button{min-height:56px;padding:12px 18px;font-size:1.05rem}' +
  '.mp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin:8px 0 18px}' +
  '.mp-day{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:16px;box-shadow:0 5px 16px #4937210c}' +
  '.mp-day.mp-today{border:2px solid var(--spice)}' +
  '.mp-day>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px}' +
  '.mp-day>header b{font-size:1.15rem}' +
  '.mp-day>header span{color:var(--muted);font-size:.95rem}' +
  '.mp-todayTag{background:var(--spice);color:#fff;font-size:.8rem;border-radius:999px;padding:3px 12px;white-space:nowrap}' +
  '.mp-slot{display:flex;align-items:center;gap:8px;margin:10px 0;min-height:60px}' +
  '.mp-slotLabel{flex:0 0 92px;font-weight:700;color:var(--muted);font-size:.95rem}' +
  '.mp-recipe{flex:1;min-height:60px;text-align:right;font-size:1.05rem;background:var(--sage);font-weight:700;white-space:normal!important}' +
  '.mp-add{flex:1;min-height:60px;border:2px dashed var(--line);background:transparent;color:var(--muted);font-size:1.05rem}' +
  '.mp-clear{flex:0 0 54px;min-height:54px;background:transparent;color:var(--danger);font-size:1.25rem}' +
  '.mp-actions{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}' +
  '.mp-actions .primary{min-height:60px;font-size:1.15rem;padding:14px 26px}' +
  '.mp-actions button{min-height:60px;font-size:1.05rem}' +
  '.mp-pickList{display:grid;gap:10px;max-height:52vh;overflow:auto;margin-top:12px}' +
  '.mp-pickRow{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:right;background:var(--sage);padding:14px 16px;min-height:60px;width:100%;white-space:normal!important}' +
  '.mp-pickRow small{color:var(--muted)}' +
  '.mp-dlgPad{padding:24px;overflow:auto;max-height:92vh}' +
  '.mp-miss{list-style:none;margin:12px 0;padding:0;display:grid;gap:8px}' +
  '.mp-miss li{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:1.05rem}' +
  '@media(max-width:600px){.mp-slotLabel{flex-basis:72px}}' +
  '</style>';
}

function html(){
  var sun = currentSunday();
  var days = weekDates(sun);
  var today = dateKey(new Date());
  var plan = readPlan(ls());
  var byId = recipeMap();

  var cards = days.map(function(d,i){
    var key = dateKey(d);
    var dayPlan = plan[key]||{};
    var isToday = (key===today);
    var slots = SLOTS.map(function(s){
      var id = dayPlan[s.id];
      var r = id ? byId[id] : null;
      // stale id (recipe deleted) — treat as empty
      var inner = r
        ? '<button type="button" class="mp-recipe" data-mp-pick="'+key+'|'+s.id+'" aria-label="החלפת מתכון: '+eh(r.name)+'">'+eh(r.name)+'</button>' +
          '<button type="button" class="mp-clear" data-mp-clear="'+key+'|'+s.id+'" aria-label="ניקוי '+s.label+'">✕</button>'
        : '<button type="button" class="mp-add" data-mp-pick="'+key+'|'+s.id+'">＋ הוספה</button>';
      return '<div class="mp-slot"><span class="mp-slotLabel">'+s.icon+' '+s.label+'</span>'+inner+'</div>';
    }).join('');
    return '<section class="mp-day'+(isToday?' mp-today':'')+'">' +
      '<header><div><b>'+DAYS_FULL[i]+'</b> <span>'+fmtDay(d)+'</span></div>' +
      (isToday?'<span class="mp-todayTag">היום</span>':'') + '</header>' +
      slots + '</section>';
  }).join('');

  var emptyBook = allRecipes().length===0;
  return styleBlock() +
  '<div class="sectionHead"><div><button type="button" data-view="home">← חזרה לבית</button>' +
  '<h1>🗓️ תכנון ארוחות שבועי</h1></div></div>' +
  '<p class="muted">בחרו מתכון לכל ארוחה. התכנון נשמר במכשיר ועובד גם בלי אינטרנט.</p>' +
  '<div class="mp-weeknav">' +
    '<div class="mp-navbtns"><button type="button" data-mp-nav="-1">→ שבוע קודם</button>' +
    '<button type="button" data-mp-nav="0">השבוע הנוכחי</button>' +
    '<button type="button" data-mp-nav="1">שבוע הבא ←</button></div>' +
    '<span class="mp-label">'+eh(weekLabel(sun))+'</span>' +
  '</div>' +
  (emptyBook
    ? '<div class="empty"><div class="big">📖</div><h2>ספר המתכונים ריק</h2>' +
      '<p>הוסיפו מתכונים כדי לתכנן את השבוע.</p>' +
      '<button type="button" class="primary" data-action="addMenu">＋ מתכון חדש</button></div>'
    : '<div class="mp-grid">'+cards+'</div>') +
  '<div class="mp-actions">' +
    '<button type="button" class="primary" id="mpGenShop" '+(emptyBook?'disabled':'')+'>🛒 יצירת רשימת קניות לשבוע</button>' +
    '<button type="button" id="mpClearWeek" '+(emptyBook?'disabled':'')+'>🧹 ניקוי השבוע</button>' +
  '</div>';
}

/* ---------------- events ---------------- */
function init(){
  var root = qs('#app') || document;
  // safety net: if 3-app.js bind() did not run, wire [data-view] ourselves
  qsa('[data-view]', root).forEach(function(b){
    if(!b.onclick && typeof render==='function') b.onclick = function(){ render(b.dataset.view); };
  });
  qsa('[data-action]', root).forEach(function(b){
    if(!b.onclick && typeof actions!=='undefined' && actions && actions[b.dataset.action])
      b.onclick = function(){ actions[b.dataset.action](); };
  });

  qsa('[data-mp-nav]', root).forEach(function(b){
    b.onclick = function(){
      var n = parseInt(b.dataset.mpNav,10);
      weekOffset = (n===0) ? 0 : weekOffset + n;
      rerender();
    };
  });
  qsa('[data-mp-pick]', root).forEach(function(b){
    b.onclick = function(){
      var parts = b.dataset.mpPick.split('|');
      openPicker(parts[0], parts[1]);
    };
  });
  qsa('[data-mp-clear]', root).forEach(function(b){
    b.onclick = function(){
      var parts = b.dataset.mpClear.split('|');
      clearSlot(parts[0], parts[1]);
    };
  });
  var gen = qs('#mpGenShop', root);
  if (gen) gen.onclick = genShopping;
  var cw = qs('#mpClearWeek', root);
  if (cw) cw.onclick = function(){
    if(!confirm('לנקות את כל התכנון של השבוע המוצג?')) return;
    var store = ls(), plan = readPlan(store);
    currentWeekKeys().forEach(function(k){ delete plan[k]; });
    writePlan(store, plan);
    say('השבוע נוקה');
    rerender();
  };
}

function clearSlot(dateStr, slotId){
  var store = ls(), plan = readPlan(store);
  if (plan[dateStr]) delete plan[dateStr][slotId];
  writePlan(store, plan);
  say('הבחירה נוקתה');
  rerender();
}

/* ---------------- recipe picker dialog ---------------- */
function closePicker(){
  var d = qs('#mpPickerDialog');
  if (d) d.remove();
}

function openPicker(dateStr, slotId){
  closePicker();
  var store = ls(), plan = readPlan(store);
  var curId = plan[dateStr] && plan[dateStr][slotId];
  var byId = recipeMap();
  var cur = curId ? byId[curId] : null;
  var list = allRecipes();

  var d = document.createElement('dialog');
  d.id = 'mpPickerDialog';
  d.innerHTML =
    '<div class="mp-dlgPad">' +
    '<div class="dlgHead"><h2>בחירת מתכון</h2><button type="button" data-mp-x aria-label="סגירה">✕</button></div>' +
    '<p class="muted">'+eh(fmtDay(parseKey(dateStr)))+' · '+eh(slotLabel(slotId))+'</p>' +
    (cur ? '<p>נבחר כעת: <b>'+eh(cur.name)+'</b> <button type="button" data-mp-clearpick>🗑️ ניקוי הבחירה</button></p>' : '') +
    (list.length
      ? '<div class="search"><input id="mpPickSearch" placeholder="חיפוש מתכון לפי שם" autocomplete="off"></div>' +
        '<div class="mp-pickList" id="mpPickList"></div>'
      : '<div class="empty"><h2>אין מתכונים בספר</h2><p>הוסיפו מתכון חדש כדי לבחור אותו.</p></div>') +
    '</div>';
  document.body.appendChild(d);

  function renderList(q){
    var box = qs('#mpPickList', d);
    if(!box) return;
    var nq = String(q||'').trim().toLocaleLowerCase('he');
    var rows = list.filter(function(r){
      if(!nq) return true;
      var hay = (r.name+' '+(r.ingredients||[]).join(' ')).toLocaleLowerCase('he');
      return hay.indexOf(nq)>=0;
    });
    box.innerHTML = rows.length
      ? rows.map(function(r){
          return '<button type="button" class="mp-pickRow" data-mp-choose="'+eh(r.id)+'">' +
            '<b>'+eh(r.name)+'</b><small>'+eh(r.category||'')+(r.minutes?' · '+r.minutes+' דקות':'')+'</small></button>';
        }).join('')
      : '<p class="muted">לא נמצאו מתכונים התואמים לחיפוש.</p>';
    qsa('[data-mp-choose]', box).forEach(function(b){
      b.onclick = function(){
        var p2 = readPlan(store);
        if(!p2[dateStr]) p2[dateStr] = {};
        p2[dateStr][slotId] = b.dataset.mpChoose;
        writePlan(store, p2);
        d.close(); d.remove();
        say('נשמר בתכנון');
        rerender();
      };
    });
  }
  renderList('');
  var si = qs('#mpPickSearch', d);
  if (si) si.oninput = function(){ renderList(si.value); };
  qs('[data-mp-x]', d).onclick = function(){ d.close(); d.remove(); };
  var cp = qs('[data-mp-clearpick]', d);
  if (cp) cp.onclick = function(){ d.close(); d.remove(); clearSlot(dateStr, slotId); };
  d.addEventListener('close', function(){ d.remove(); }, { once:true });
  d.showModal();
  if (si) si.focus();
}

function parseKey(key){
  var p = key.split('-');
  return new Date(+p[0], +p[1]-1, +p[2]);
}

/* ---------------- weekly shopping list ---------------- */
async function genShopping(){
  if (typeof API==='undefined' || !API.call){ say('אין חיבור כרגע — נסו שוב מאוחר יותר'); return; }
  var store = ls(), plan = readPlan(store);
  var byId = recipeMap();
  var lines = aggregateIngredients(plan, byId, currentWeekKeys());
  if(!lines.length){ say('אין מתכונים מתוכננים לשבוע הזה'); return; }
  if (typeof combineShoppingLines==='function'){
    try{ lines = combineShoppingLines(lines); }catch(e){}
  }
  var invNames = null;
  try{
    var inv = await API.call('/inventory');
    invNames = (inv.items||[]).map(function(x){ return x.name; });
  }catch(e){ invNames = null; }
  var missing = invNames ? missingItems(lines, invNames) : lines.slice();
  var haveCount = lines.length - missing.length;
  showShopDialog(lines, missing, haveCount, invNames!==null);
}

function showShopDialog(lines, missing, haveCount, invOk){
  var old = qs('#mpShopDialog');
  if (old) old.remove();
  var d = document.createElement('dialog');
  d.id = 'mpShopDialog';
  d.innerHTML =
    '<div class="mp-dlgPad">' +
    '<div class="dlgHead"><h2>🛒 רשימת קניות לשבוע</h2><button type="button" data-mp-x aria-label="סגירה">✕</button></div>' +
    '<p class="muted">' + lines.length + ' מרכיבים בתכנון השבוע' +
      (invOk ? ' · ' + missing.length + ' חסרים · ' + haveCount + ' כבר יש במלאי' : ' · המלאי לא נטען — מוצגים כל המרכיבים') + '</p>' +
    (missing.length
      ? '<ul class="mp-miss">' + missing.map(function(t){ return '<li>'+eh(t)+'</li>'; }).join('') + '</ul>'
      : '<p class="notice">כל המרכיבים כבר יש במלאי 🎉 אין מה להוסיף.</p>') +
    '<div class="row">' +
      '<button type="button" class="primary" data-mp-addshop '+(missing.length?'':'disabled')+'>הוספה לרשימת הקניות ('+missing.length+')</button>' +
      '<button type="button" data-mp-x2>סגירה</button>' +
    '</div>' +
    '<p class="muted" data-mp-shopstatus role="status"></p>' +
    '</div>';
  document.body.appendChild(d);
  function close(){ d.close(); d.remove(); }
  qsa('[data-mp-x],[data-mp-x2]', d).forEach(function(b){ b.onclick = close; });
  d.addEventListener('close', function(){ d.remove(); }, { once:true });

  var addBtn = qs('[data-mp-addshop]', d);
  if (addBtn) addBtn.onclick = async function(){
    addBtn.disabled = true;
    var status = qs('[data-mp-shopstatus]', d);
    var have = {};
    try{
      var cur = await API.call('/shopping');
      (cur.items||[]).forEach(function(x){ have[shopKeyOf(x.text)] = true; });
    }catch(e){}
    var added = 0, skipped = 0;
    for (var i=0;i<missing.length;i++){
      var text = missing[i], k = shopKeyOf(text);
      if (have[k]){ skipped++; continue; }
      try{
        await API.call('/shopping', { method:'POST', body: JSON.stringify({ text:text }) });
        have[k] = true; added++;
      }catch(e){
        status.textContent = 'נוספו ' + added + ' מתוך ' + missing.length + ' פריטים. בדקו את החיבור ונסו שוב.';
        addBtn.disabled = false;
        return;
      }
    }
    status.textContent = 'נוספו ' + added + ' פריטים לרשימת הקניות' + (skipped ? ' · ' + skipped + ' כבר היו ברשימה' : '');
    say(added ? 'נוספו ' + added + ' פריטים לרשימת הקניות' : 'כל הפריטים כבר היו ברשימת הקניות');
  };
  d.showModal();
}

/* ---------------- public API ---------------- */
var MealPlanner = {
  html: html,
  init: init,
  goWeek: function(n){ weekOffset += n; rerender(); },
  thisWeek: function(){ weekOffset = 0; rerender(); },
  openPicker: openPicker,
  genShopping: genShopping,
  // pure logic, exposed for tests:
  _PLAN_KEY: PLAN_KEY,
  _SLOTS: SLOTS,
  _DAYS: DAYS_FULL,
  _dateKey: dateKey,
  _sundayOf: sundayOf,
  _weekDates: weekDates,
  _fmtDay: fmtDay,
  _weekLabel: weekLabel,
  _normIng: normIng,
  _shopKey: shopKeyOf,
  _readPlan: readPlan,
  _writePlan: writePlan,
  _aggregate: aggregateIngredients,
  _missing: missingItems
};

if (typeof window!=='undefined') window.MealPlanner = MealPlanner;
if (typeof module!=='undefined' && module.exports) module.exports = MealPlanner;

})();
