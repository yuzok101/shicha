// Node tests for fridge-scan.js pure logic (no DOM).
// Run: node fridge-scan.test.js
const assert = require('assert');
const F = require('./public/fridge-scan.js');

let n = 0;
function t(name, fn) {
  try { fn(); n++; console.log('ok -', name); }
  catch (e) { console.error('FAIL -', name, '\n ', e.message); process.exitCode = 1; }
}
async function ta(name, fn) {
  try { await fn(); n++; console.log('ok -', name); }
  catch (e) { console.error('FAIL -', name, '\n ', e.message); process.exitCode = 1; }
}

(async () => {
  // ---- (a) image compression logic (mock canvas) ----
  t('computeTargetSize: landscape 4000x3000 -> 1024x768', () => {
    assert.deepStrictEqual(F.computeTargetSize(4000, 3000, 1024), { w: 1024, h: 768 });
  });
  t('computeTargetSize: small image unchanged', () => {
    assert.deepStrictEqual(F.computeTargetSize(800, 600, 1024), { w: 800, h: 600 });
  });
  t('computeTargetSize: portrait 500x2000 -> 256x1024', () => {
    assert.deepStrictEqual(F.computeTargetSize(500, 2000, 1024), { w: 256, h: 1024 });
  });
  t('computeTargetSize: exact 1024x1024 unchanged', () => {
    assert.deepStrictEqual(F.computeTargetSize(1024, 1024, 1024), { w: 1024, h: 1024 });
  });

  await ta('compressImage: mock canvas resizes 4000x3000 to 1024x768 JPEG', async () => {
    const drawn = [];
    const mockCanvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: (img, x, y, w, h) => drawn.push({ w, h }) }),
      toDataURL: (type, q) => { assert.strictEqual(type, 'image/jpeg'); assert.strictEqual(q, 0.7); return 'data:image/jpeg;base64,TVFDS0RBVEE'; }
    };
    function MockImage() { this.naturalWidth = 4000; this.naturalHeight = 3000; }
    Object.defineProperty(MockImage.prototype, 'src', {
      set(v) { const self = this; setImmediate(() => { if (self.onload) self.onload(); }); }
    });
    const out = await F.compressImage('data:image/jpeg;base64,xxx', {
      Image: MockImage, document: { createElement: tag => { assert.strictEqual(tag, 'canvas'); return mockCanvas; } }
    });
    assert.strictEqual(mockCanvas.width, 1024);
    assert.strictEqual(mockCanvas.height, 768);
    assert.deepStrictEqual(drawn, [{ w: 1024, h: 768 }]);
    assert.ok(out.startsWith('data:image/jpeg;base64,'), 'output is a JPEG data URL');
  });

  // ---- (b) confidence badge thresholds ----
  t('confBadgeLevel thresholds', () => {
    assert.strictEqual(F.confBadgeLevel(1), 'high');
    assert.strictEqual(F.confBadgeLevel(0.8), 'high');
    assert.strictEqual(F.confBadgeLevel(0.799), 'medium');
    assert.strictEqual(F.confBadgeLevel(0.5), 'medium');
    assert.strictEqual(F.confBadgeLevel(0.499), 'low');
    assert.strictEqual(F.confBadgeLevel(0), 'low');
  });

  // ---- (c) recipe matching algorithm ----
  const recipes = [
    { id: 'r1', name: 'חביתה', ingredients: ['3 ביצים', 'מלח', 'חמאה'] },
    { id: 'r2', name: 'סלט ירקות', ingredients: ['2 עגבניות', 'מלפפון', 'בצל', 'שמן זית'] },
    { id: 'r3', name: 'ריק', ingredients: [] }
  ];
  t('matchRecipes: correct match % and sort order', () => {
    const rows = F.matchRecipes(recipes, ['ביצים', 'מלח', 'עגבניות']);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].recipe.name, 'חביתה');
    assert.strictEqual(rows[0].have, 2);
    assert.strictEqual(rows[0].total, 3);
    assert.strictEqual(rows[0].pct, 67);
    assert.strictEqual(rows[1].recipe.name, 'סלט ירקות');
    assert.strictEqual(rows[1].have, 1);
    assert.strictEqual(rows[1].total, 4);
    assert.strictEqual(rows[1].pct, 25);
  });
  t('matchRecipes: empty inventory -> no matches', () => {
    assert.deepStrictEqual(F.matchRecipes(recipes, []), []);
  });
  t('matchRecipes: recipe with no ingredients excluded', () => {
    const rows = F.matchRecipes(recipes, ['מלח']);
    assert.ok(rows.every(r => r.recipe.name !== 'ריק'));
  });
  t('matchRecipes: full match = 100%', () => {
    const rows = F.matchRecipes([{ name: 'טוסט', ingredients: ['לחם', 'גבינה'] }], ['לחם פרוס', 'גבינה צהובה']);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].pct, 100);
  });

  // ---- (d) JSON fence-failure fallback parsing ----
  t('parseVisionResponse: fenced JSON parses', () => {
    const out = F.parseVisionResponse('הנה התוצאות:\n```json\n[{"name":"חלב","confidence":0.95},{"name":"ביצים","confidence":0.7}]\n```');
    assert.deepStrictEqual(out, [{ name: 'חלב', confidence: 0.95 }, { name: 'ביצים', confidence: 0.7 }]);
  });
  t('parseVisionResponse: fence-failure (broken slice) falls back to regex', () => {
    // first '[' belongs to a non-JSON array, so the sliced text is invalid JSON
    const out = F.parseVisionResponse('ציונים: [1,2] ואז [{"name":"חלב","confidence":0.9}] סוף');
    assert.deepStrictEqual(out, [{ name: 'חלב', confidence: 0.9 }]);
  });
  t('parseVisionResponse: object wrapper (not array) falls back to regex', () => {
    const out = F.parseVisionResponse('{"items": [{"name": "גבינה", "confidence": 0.4}]}');
    assert.deepStrictEqual(out, [{ name: 'גבינה', confidence: 0.4 }]);
  });
  t('parseVisionResponse: sanitizes names, clamps confidence', () => {
    const out = F.parseVisionResponse(JSON.stringify([
      { name: '<img src=x>חלב', confidence: 1.5 },
      { name: 'ביצים', confidence: -0.2 },
      { name: 'מים', confidence: 'abc' },
      { name: 'x'.repeat(100), confidence: 0.6 },
      { name: '   ', confidence: 0.9 },
      { name: 'קפה', confidence: 0.333 }
    ]));
    assert.strictEqual(out[0].name, 'img src=xחלב');
    assert.strictEqual(out[0].confidence, 1);
    assert.strictEqual(out[1].confidence, 0);
    assert.strictEqual(out[2].confidence, 0.5);
    assert.strictEqual(out[3].name.length, 60);
    assert.strictEqual(out.find(x => x.name === ''), undefined);
    assert.strictEqual(out.find(x => x.name === 'קפה').confidence, 0.33);
  });
  t('parseVisionResponse: garbage -> null', () => {
    assert.strictEqual(F.parseVisionResponse('אין פה כלום'), null);
    assert.strictEqual(F.parseVisionResponse(''), null);
  });
  t('parseVisionResponse: caps at 40 items', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: 'פריט' + i, confidence: 0.9 }));
    assert.strictEqual(F.parseVisionResponse(JSON.stringify(many)).length, 40);
  });

  console.log(`\n${n} tests passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
})();
