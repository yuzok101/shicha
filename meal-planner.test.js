/* Node test for meal-planner.js pure logic (no DOM required).
 * Run: node meal-planner.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const MP = require('./public/meal-planner.js');

let passed = 0;
function t(name, fn){
  try{ fn(); passed++; console.log('ok -', name); }
  catch(e){ console.error('FAIL -', name, '\n ', e.message); process.exitCode = 1; }
}
const D = (y,m,dd,hh,mm) => new Date(y, m-1, dd, hh||0, mm||0); // local time

/* ---------- date calculations ---------- */
t('sundayOf: Sunday stays Sunday', () =>
  assert.equal(MP._dateKey(MP._sundayOf(D(2026,10,4))), '2026-10-04'));
t('sundayOf: Monday -> previous Sunday', () =>
  assert.equal(MP._dateKey(MP._sundayOf(D(2026,10,5))), '2026-10-04'));
t('sundayOf: Wednesday -> previous Sunday', () =>
  assert.equal(MP._dateKey(MP._sundayOf(D(2026,10,7))), '2026-10-04'));
t('sundayOf: Saturday -> previous Sunday', () =>
  assert.equal(MP._dateKey(MP._sundayOf(D(2026,10,10))), '2026-10-04'));
t('sundayOf: next Sunday -> itself', () =>
  assert.equal(MP._dateKey(MP._sundayOf(D(2026,10,11))), '2026-10-11'));
t('sundayOf: strips time of day', () => {
  const s = MP._sundayOf(D(2026,10,7,15,30));
  assert.equal(s.getHours(), 0);
  assert.equal(MP._dateKey(s), '2026-10-04');
});

t('weekDates: 7 consecutive days from Sunday', () => {
  const keys = MP._weekDates(MP._sundayOf(D(2026,10,4))).map(MP._dateKey);
  assert.deepEqual(keys, ['2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10']);
});

t('weekLabel: same month', () =>
  assert.equal(MP._weekLabel(MP._sundayOf(D(2026,10,4))), '4–10 באוקטובר 2026'));
t('weekLabel: across months', () =>
  assert.equal(MP._weekLabel(MP._sundayOf(D(2026,9,27))), '27 בספטמבר–3 באוקטובר 2026'));
t('fmtDay', () =>
  assert.equal(MP._fmtDay(D(2026,10,4)), '4 באוקטובר'));

/* ---------- ingredient normalization ---------- */
t('normIng strips quantities', () => assert.equal(MP._normIng('2 בצלים'), 'בצלים'));
t('normIng strips parenthetical', () => assert.equal(MP._normIng('עגבניות (שרי)'), 'עגבניות'));
t('normIng strips fractions', () => assert.equal(MP._normIng('1/2 כוס קמח'), 'כוס קמח'));
t('normIng keeps plain text', () => assert.equal(MP._normIng('כף שמן זית'), 'כף שמן זית'));
t('normIng empty', () => assert.equal(MP._normIng(''), ''));

/* ---------- ingredient aggregation ---------- */
const byId = {
  r1: { id:'r1', ingredients:['2 בצלים','מלח'] },
  r2: { id:'r2', ingredients:['מלח','כף שמן זית'] },
  r3: { id:'r3', ingredients:['סוכר'] }
};
const plan = {
  '2026-10-04': { lunch:'r1', dinner:'r2' },
  '2026-10-05': { lunch:'r1' },
  '2026-10-06': { dinner:'ghost' },   // unknown recipe id — skipped
  '2026-10-07': {},                    // empty day — skipped
  '2026-10-11': { lunch:'r3' }
};
t('aggregate: dedupes lines, skips unknown recipes and empty days', () =>
  assert.deepEqual(MP._aggregate(plan, byId), ['2 בצלים','מלח','כף שמן זית','סוכר']));
t('aggregate: onlyKeys limits to the visible week', () =>
  assert.deepEqual(MP._aggregate(plan, byId, ['2026-10-04']), ['2 בצלים','מלח','כף שמן זית']));
t('aggregate: empty plan', () =>
  assert.deepEqual(MP._aggregate({}, byId), []));
t('aggregate: recipe without ingredients array', () =>
  assert.deepEqual(MP._aggregate({ '2026-10-04':{lunch:'r4'} }, { r4:{id:'r4'} }), []));

/* ---------- missing-item detection ---------- */
t('missing: plural/partial matches count as covered', () =>
  assert.deepEqual(
    MP._missing(['2 בצלים','כף שמן זית','מלח'], ['בצל','שמן']),
    ['מלח']));
t('missing: empty inventory -> all missing', () =>
  assert.deepEqual(MP._missing(['מלח','סוכר'], []), ['מלח','סוכר']));
t('missing: quantity-only lines are not reported', () =>
  assert.deepEqual(MP._missing(['3','מלח'], ['מלח']), []));
t('missing: exact match', () =>
  assert.deepEqual(MP._missing(['מלח'], ['מלח']), []));
t('missing: inventory with notes matches', () =>
  assert.deepEqual(MP._missing(['2 בצלים'], ['בצל (סגול)']), []));

/* ---------- plan storage ---------- */
function fakeStore(){
  const data = {};
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k,v) => { data[k] = String(v); },
    _data: data
  };
}
t('readPlan/writePlan roundtrip', () => {
  const s = fakeStore();
  const p = { '2026-10-04': { lunch:'r1', dinner:'r2' } };
  assert.equal(MP._writePlan(s, p), true);
  assert.deepEqual(MP._readPlan(s), p);
});
t('readPlan: missing key -> {}', () =>
  assert.deepEqual(MP._readPlan(fakeStore()), {}));
t('readPlan: malformed JSON -> {}', () => {
  const s = fakeStore(); s.setItem(MP._PLAN_KEY, '{nope');
  assert.deepEqual(MP._readPlan(s), {});
});
t('readPlan: non-object JSON -> {}', () => {
  const s = fakeStore(); s.setItem(MP._PLAN_KEY, '"just a string"');
  assert.deepEqual(MP._readPlan(s), {});
});
t('writePlan: throwing store -> false', () => {
  const bad = { getItem:()=>null, setItem:()=>{ throw new Error('denied'); } };
  assert.equal(MP._writePlan(bad, {}), false);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' (WITH FAILURES)' : ''));
