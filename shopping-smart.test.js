'use strict';
// Tests for public/shopping-smart.js — run: node shopping-smart.test.js
const assert = require('assert');
const S = require('./public/shopping-smart.js');

const KG = 'ק׳ג';           // ק + U+05F3 + ג
const ML = 'מ׳ל';           // מ + U+05F3 + ל
const X = '×';              // U+00D7
let n = 0;
function eq(a, b, msg) { n++; assert.strictEqual(a, b, msg); }
function deq(a, b, msg) { n++; assert.deepStrictEqual(a, b, msg); }
function itemOf(res, name) { return res.items.find(i => i.name === name); }

// --- API shape (UMD: module.exports in node) ---
eq(typeof S.parseLine, 'function', 'parseLine exported');
eq(typeof S.normalizeName, 'function', 'normalizeName exported');
eq(typeof S.aggregate, 'function', 'aggregate exported');

// --- parseLine ---
deq(S.parseLine('2 כוסות קמח'), { qty: 2, unit: 'cup', name: 'קמח' }, 'parse: 2 כוסות קמח');
deq(S.parseLine('3 ביצים'), { qty: 3, unit: 'count', name: 'ביצים' }, 'parse: no unit defaults to count');
eq(S.parseLine('1,5 כוסות קמח').qty, 1.5, 'parse: decimal with comma');
eq(S.parseLine('1.5 כוסות קמח').qty, 1.5, 'parse: decimal with dot');
deq(S.parseLine('חצי כוס שמן'), { qty: 0.5, unit: 'cup', name: 'שמן' }, 'parse: חצי');
eq(S.parseLine('1/2 כוס קקאו').qty, 0.5, 'parse: 1/2 fraction');
eq(S.parseLine('2 וחצי כוסות קמח').qty, 2.5, 'parse: וחצי');
deq(S.parseLine('2 ק״ג קמח'), { qty: 2, unit: 'kg', name: 'קמח' }, 'parse: ק״ג with gershayim');
deq(S.parseLine('500 מ״ל חלב'), { qty: 500, unit: 'ml', name: 'חלב' }, 'parse: מ״ל');
deq(S.parseLine("250 ג' סוכר"), { qty: 250, unit: 'g', name: 'סוכר' }, "parse: ג'");
deq(S.parseLine("2 ל' חלב"), { qty: 2, unit: 'liter', name: 'חלב' }, "parse: ל'");
deq(S.parseLine('1 כוס של קמח'), { qty: 1, unit: 'cup', name: 'של קמח' }, 'parse keeps "של" in name (normalizeName strips it)');
eq(S.parseLine('קורט אהבה'), null, 'parse: no number -> null');
eq(S.parseLine(''), null, 'parse: empty -> null');
eq(S.parseLine('מלח'), null, 'parse: name only -> null');

// --- normalizeName ---
eq(S.normalizeName('של קמח'), 'קמח', 'normalize: strips של');
eq(S.normalizeName('בצלים'), 'בצל', 'normalize: בצלים→בצל');
eq(S.normalizeName('עגבניות'), 'עגבניה', 'normalize: עגבניות→עגבניה');
eq(S.normalizeName('ביצים'), 'ביצה', 'normalize: ביצים→ביצה');
eq(S.normalizeName('תפוחי אדמה'), 'תפוחי אדמה', 'normalize: תפוחי אדמה stays');
eq(S.normalizeName('שמן קנולה'), 'שמן', 'normalize: שמן קנולה→שמן');
eq(S.normalizeName('שמן צמחי'), 'שמן', 'normalize: שמן צמחי→שמן');
eq(S.normalizeName('סוכר לבן'), 'סוכר', 'normalize: סוכר לבן→סוכר');
eq(S.normalizeName('קמח תופח'), 'קמח', 'normalize: קמח תופח→קמח');
eq(S.normalizeName('חלב פרה'), 'חלב', 'normalize: חלב פרה→חלב');

// --- aggregate: required scenarios ---
let r = S.aggregate(['2 כוסות קמח', '1 כוס קמח']);
let f = itemOf(r, 'קמח');
eq(f.display, '420 גרם', '2+1 cups flour = 420 גרם');
eq(f.packageNote, '(אריזה: 1 ' + KG + ')', '420g < 1kg package note');

r = S.aggregate(['8 כוסות קמח']);
f = itemOf(r, 'קמח');
eq(f.display, '1.12 ' + KG, '8 cups flour = 1.12 ק״ג');
eq(f.packageNote, '2 שקיות ' + X + ' 1 ' + KG, '1120g -> 2 שקיות × 1 ק״ג');

r = S.aggregate(['16 כוסות קמח']);
f = itemOf(r, 'קמח');
eq(f.display, '2.24 ' + KG, '16 cups flour = 2.24 ק״ג');
eq(f.packageNote, '3 שקיות ' + X + ' 1 ' + KG, '2240g -> 3 שקיות');

r = S.aggregate(['1 כוס סוכר', '500 גרם סוכר']);
eq(itemOf(r, 'סוכר').display, '700 גרם', '1 cup sugar + 500g = 700 גרם');

r = S.aggregate(['3 כפות שמן']);
eq(itemOf(r, 'שמן').display, '45 ' + ML, '3 tbsp oil = 45 מ״ל');

r = S.aggregate(['2 כוסות חלב']);
eq(itemOf(r, 'חלב').display, '480 ' + ML, '2 cups milk = 480 מ״ל');

r = S.aggregate(['15 ביצים']);
let e = itemOf(r, 'ביצה');
eq(e.display, '15 יחידות', '15 eggs display');
eq(e.packageNote, '2 תבניות ' + X + ' 12', '15 eggs -> 2 תבניות × 12');

r = S.aggregate(['1 כפית מלח', '2 כפיות מלח']);
eq(itemOf(r, 'מלח').display, '18 גרם', '3 tsp salt = 18 גרם');

r = S.aggregate(['3 בצלים', '2 בצלים']);
let o = itemOf(r, 'בצל');
eq(o.display, '5 יחידות', 'onions merged to 5 יחידות');
eq(o.kind, 'count', 'onions are count kind');

r = S.aggregate(['חצי כוס שמן']);
eq(itemOf(r, 'שמן').display, '120 ' + ML, 'half cup oil = 120 מ״ל');

r = S.aggregate(['1/2 כוס קקאו']);
eq(itemOf(r, 'קקאו').display, '50 גרם', 'half cup cocoa = 50 גרם');

r = S.aggregate(['קורט אהבה']);
deq(r.leftovers, ['קורט אהבה'], 'unparseable -> leftovers');
eq(r.items.length, 0, 'no items for unparseable line');

r = S.aggregate(['מלח', 'מלח']);
eq(r.leftovers.length, 1, 'exact duplicate leftovers merged');
deq(r.leftovers, ['מלח'], 'leftover content preserved');

// --- aggregate: no-guessing edge cases ---
r = S.aggregate(['500 גרם שמן']);
deq(r.leftovers, ['500 גרם שמן'], 'mass unit for volume ingredient -> leftover (no guess)');
eq(r.items.length, 0, 'no item when conversion impossible');

r = S.aggregate(['2 כוסות קינואה']);
deq(r.leftovers, ['2 כוסות קינואה'], 'unknown ingredient -> leftover');

r = S.aggregate(['3 שמן']);
deq(r.leftovers, ['3 שמן'], 'count unit for volume ingredient -> leftover');

r = S.aggregate(['1 כף סולת']);
deq(r.leftovers, ['1 כף סולת'], 'tbsp not in table for סולת -> leftover');

r = S.aggregate(['1 כוס שמן', '1 כוס שמן קנולה']);
eq(itemOf(r, 'שמן').display, '480 ' + ML, 'alias שמן קנולה merges with שמן');
eq(r.items.length, 1, 'alias produces single item');

r = S.aggregate(['2 וחצי כוסות קמח']);
eq(itemOf(r, 'קמח').display, '350 גרם', '2.5 cups flour = 350 גרם');

r = S.aggregate(['1.5 כוסות קמח']);
eq(itemOf(r, 'קמח').display, '210 גרם', '1.5 cups flour = 210 גרם');

r = S.aggregate(['1 כוס חלב', '500 מ״ל חלב']);
eq(itemOf(r, 'חלב').display, '740 ' + ML, 'cup + ml milk merge in volume');

r = S.aggregate(['4 תפוחי אדמה', '3 גזרים']);
eq(itemOf(r, 'תפוחי אדמה').display, '4 יחידות', 'potatoes count');
eq(r.leftovers.length, 1, 'גזרים (unknown plural) -> leftover, no guessing');

r = S.aggregate(['500 גרם פסטה', '1 חבילת פסטה']);
eq(itemOf(r, 'פסטה').display, '500 גרם', 'pasta by weight works');
eq(itemOf(r, 'פסטה').packageNote, '1 חבילה ' + X + ' 500 גרם', 'pasta package note');
eq(r.leftovers.length, 1, '"1 חבילת פסטה" is not a known unit -> leftover');

console.log('OK: ' + n + ' assertions passed');
