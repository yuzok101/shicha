/* Tests for ~/workspace/tavlin-prod/public/ai-recipe.js
 * Run: node --test ai-recipe.test.js   (from ~/workspace/tavlin-prod)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AiRecipe = require('./public/ai-recipe.js');

const GOOD = {
  name: 'שקשוקה',
  category: 'פרווה',
  minutes: 25,
  ingredients: ['3 ביצים', '4 עגבניות'],
  steps: ['לטגן', 'להוסיף ביצים'],
  notes: ''
};

/* ---------- (a) JSON extraction with/without fences ---------- */

test('extractJSON: plain JSON object', () => {
  assert.deepEqual(AiRecipe.extractJSON(JSON.stringify(GOOD)), GOOD);
});

test('extractJSON: ```json fenced block', () => {
  const t = '```json\n' + JSON.stringify(GOOD) + '\n```';
  assert.deepEqual(AiRecipe.extractJSON(t), GOOD);
});

test('extractJSON: ``` fence + surrounding prose', () => {
  const t = 'הנה המתכון שביקשת:\n```\n' + JSON.stringify(GOOD) + '\n```\nבתיאבון!';
  assert.deepEqual(AiRecipe.extractJSON(t), GOOD);
});

test('extractJSON: JSON with leading prose, no fences', () => {
  const t = 'אוקיי, הנה:\n' + JSON.stringify(GOOD) + '\nסוף.';
  assert.deepEqual(AiRecipe.extractJSON(t), GOOD);
});

test('extractJSON: top-level array', () => {
  assert.deepEqual(AiRecipe.extractJSON('["א","ב"]'), ['א', 'ב']);
});

test('extractJSON: invalid text returns null', () => {
  assert.equal(AiRecipe.extractJSON('זה לא JSON בכלל'), null);
  assert.equal(AiRecipe.extractJSON(''), null);
  assert.equal(AiRecipe.extractJSON(null), null);
  assert.equal(AiRecipe.extractJSON('```\nחסר סוגר\n```'), null);
});

/* ---------- (b) source field is always set on AI recipes ---------- */

test('buildRecipe: sets source=ai and sourceLabel always', () => {
  const r = AiRecipe.buildRecipe(GOOD, { kind: 'free' });
  assert.equal(r.source, 'ai');
  assert.equal(r.sourceLabel, 'נוצר על־ידי העוזר החכם של תבלין');
});

test('buildRecipe: overrides a malicious/forged source value', () => {
  const forged = Object.assign({}, GOOD, { source: 'manual', sourceLabel: 'מתכון משפחתי' });
  const r = AiRecipe.buildRecipe(forged, {});
  assert.equal(r.source, 'ai');
  assert.equal(r.sourceLabel, 'נוצר על־ידי העוזר החכם של תבלין');
});

test('buildRecipe: rejects missing name/ingredients/steps', () => {
  assert.equal(AiRecipe.buildRecipe({ name: '', ingredients: ['x'], steps: ['y'] }, {}), null);
  assert.equal(AiRecipe.buildRecipe({ name: 'x', ingredients: [], steps: ['y'] }, {}), null);
  assert.equal(AiRecipe.buildRecipe({ name: 'x', ingredients: ['x'], steps: [] }, {}), null);
  assert.equal(AiRecipe.buildRecipe('not-an-object', {}), null);
});

test('buildRecipe: keeps aiContext internal, notes stay recipe notes', () => {
  const ctx = { kind: 'inventory', prompt: 'PROMPT-TEXT' };
  const r = AiRecipe.buildRecipe(Object.assign({}, GOOD, { notes: 'להגיש חם' }), ctx);
  assert.equal(r.notes, 'להגיש חם');
  assert.deepEqual(r.aiContext, ctx);
  assert.ok(!String(r.notes).includes('PROMPT-TEXT'));
});

test('savePayload: enforces source ai and strips aiContext', () => {
  const r = AiRecipe.buildRecipe(GOOD, { kind: 'free', prompt: 'SECRET' });
  r.source = 'manual'; // simulate tampering after build
  const p = AiRecipe.savePayload(r);
  assert.equal(p.source, 'ai');
  assert.equal(p.sourceLabel, 'נוצר על־ידי העוזר החכם של תבלין');
  assert.ok(!('aiContext' in p));
});

test('badgeHTML: shown for ai recipes only', () => {
  const ai = AiRecipe.buildRecipe(GOOD, {});
  const badge = AiRecipe.badgeHTML(ai);
  assert.ok(badge.includes('🤖 נוצר על־ידי AI'));
  assert.ok(badge.includes('aiBadge'));
  assert.equal(AiRecipe.badgeHTML({ source: 'manual', name: 'x' }), '');
  assert.equal(AiRecipe.badgeHTML(null), '');
  assert.ok(AiRecipe.isAiRecipe(ai));
  assert.ok(!AiRecipe.isAiRecipe({ source: 'scan' }));
});

/* ---------- (c) prompt construction includes inventory items ---------- */

test('buildInventoryPrompt: includes every item with quantity and unit', () => {
  const items = [
    { name: 'ביצים', quantity: 3, unit: 'יחידות' },
    { name: 'קמח', quantity: 200, unit: 'גרם' },
    { name: 'חלב', quantity: 1, unit: 'כוס' }
  ];
  const p = AiRecipe.buildInventoryPrompt(items);
  for (const it of items) {
    assert.ok(p.includes(it.name), 'missing name ' + it.name);
    assert.ok(p.includes(String(it.quantity)), 'missing qty ' + it.quantity);
    assert.ok(p.includes(it.unit), 'missing unit ' + it.unit);
  }
  assert.ok(p.includes('JSON'));
});

test('buildInventoryPrompt: accepts plain strings and handles empty list', () => {
  const p = AiRecipe.buildInventoryPrompt(['עגבניות', 'בצל']);
  assert.ok(p.includes('עגבניות') && p.includes('בצל'));
  const empty = AiRecipe.buildInventoryPrompt([]);
  assert.ok(typeof empty === 'string' && empty.length > 0);
});

test('buildFreePrompt: includes the user request', () => {
  const p = AiRecipe.buildFreePrompt('עוגת שוקולד ללא גלוטן');
  assert.ok(p.includes('עוגת שוקולד ללא גלוטן'));
  assert.ok(p.includes('JSON'));
});

/* ---------- (d) graceful handling of AI-unavailable ---------- */

test('errorMessage: ai_unavailable -> exact Hebrew message for Yoni', () => {
  assert.equal(
    AiRecipe.errorMessage({ ok: false, error: 'ai_unavailable' }),
    'העוזר החכם עדיין לא הוגדר. יוני צריך להגדיר את המפתח בהגדרות.'
  );
});

test('errorMessage: bad_action (server not updated yet) is graceful', () => {
  const m = AiRecipe.errorMessage({ ok: false, error: 'bad_action' });
  assert.ok(typeof m === 'string' && m.length > 5 && !/undefined|null/.test(m));
});

test('errorMessage: network failure is graceful Hebrew', () => {
  assert.ok(AiRecipe.errorMessage({ ok: false, error: 'network' }).includes('אין חיבור לרשת'));
});

test('errorMessage: rate_limited passes server message through', () => {
  const srv = 'עברת את מכסת בקשות ה-AI לשעה. נסו שוב מאוחר יותר.';
  assert.equal(AiRecipe.errorMessage({ ok: false, error: 'rate_limited', message: srv }), srv);
});

test('errorMessage: unknown errors fall back to generic Hebrew', () => {
  const m = AiRecipe.errorMessage({ ok: false, error: 'weird' });
  assert.ok(m.includes('שירות ה-AI'));
  assert.ok(AiRecipe.errorMessage(null).includes('שירות ה-AI'));
});
