/* shopping-smart.js — המרת יחידות חכמה לרשימת קניות (עברית, ישראל).
 *
 * Pure JS, no dependencies, no DOM.
 * UMD: browser -> window.ShoppingSmart, node -> module.exports.
 *
 * API:
 *   parseLine(text)    -> {qty, unit, name} | null
 *   normalizeName(name)-> canonical name (string)
 *   aggregate(lines)   -> {items:[{name, kind, totalBase, display, packageNote}], leftovers:[string]}
 *
 * Rules: only confident conversions are applied (cup = 240ml, fixed table below).
 * Anything that cannot be parsed or converted confidently goes to `leftovers`.
 * No guessing.
 */
(function (root, factory) {
  if (typeof module === 'object' && module !== null && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.ShoppingSmart = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GERESH = '׳'; // U+05F3
  var TIMES = '×';  // U+00D7

  // ---------------------------------------------------------------- units
  // unitOf -> 'cup' | 'tbsp' | 'tsp' | 'g' | 'kg' | 'ml' | 'liter' | 'count'
  function normQuotes(s) {
    // normalize gershayim/geresh/ascii quotes to a single apostrophe
    return s.replace(/["״׳’”]/g, "'");
  }
  function stripPunct(tok) {
    return tok.replace(/^[.,:;!?()\-"]+|[.,:;!?()\-"]+$/g, '');
  }
  function unitOf(tok) {
    switch (tok) {
      case 'כוס': case 'כוסות': return 'cup';
      case 'כף': case 'כפות': return 'tbsp';
      case 'כפית': case 'כפיות': return 'tsp';
      case 'גרם': case 'גר': case "ג'": return 'g';
      case "ק'ג": case 'קג': case 'קילו': case 'קילוגרם': case 'קילוגרמים': return 'kg';
      case "מ'ל": case 'מל': return 'ml';
      case 'ליטר': case 'ליטרים': case "ל'": return 'liter';
      case "יח'": case 'יחידות': case 'יחידה': return 'count';
      default: return null;
    }
  }

  function parseQtyToken(tok) {
    if (tok === 'חצי') return 0.5;
    var m = tok.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
    if (m) {
      var den = parseFloat(m[2].replace(',', '.'));
      if (den > 0) return parseFloat(m[1].replace(',', '.')) / den;
      return NaN;
    }
    m = tok.match(/^\d+(?:[.,]\d+)?$/);
    if (m) return parseFloat(tok.replace(',', '.'));
    return NaN;
  }

  function parseLine(text) {
    if (typeof text !== 'string') return null;
    var t = text.trim().replace(/\s+/g, ' ');
    if (!t) return null;
    var tokens = t.split(' ');
    var qty = parseQtyToken(normQuotes(stripPunct(tokens[0])));
    if (isNaN(qty)) return null;
    var i = 1;
    if (tokens[i] === 'וחצי') { qty += 0.5; i++; }
    var unit = 'count'; // default when no unit is given (e.g. "3 ביצים")
    if (i < tokens.length) {
      var u = unitOf(normQuotes(stripPunct(tokens[i])));
      if (u) { unit = u; i++; }
    }
    var name = tokens.slice(i).join(' ');
    if (!name) return null;
    return { qty: qty, unit: unit, name: name };
  }

  // ------------------------------------------------------- name canonicalization
  var ALIASES = {
    'שמן קנולה': 'שמן',
    'שמן צמחי': 'שמן',
    'סוכר לבן': 'סוכר',
    'קמח לבן': 'קמח',
    'קמח תופח': 'קמח',
    'חלב פרה': 'חלב',
    'עדשים יבשות': 'עדשים',
    'שעועית יבשה': 'שעועית',
    'חומוס יבש': 'חומוס'
  };
  var PLURALS = {
    'בצלים': 'בצל',
    'עגבניות': 'עגבניה',
    'ביצים': 'ביצה'
  };

  function normalizeName(name) {
    var n = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
    n = n.replace(/^של\s+/, '');
    if (Object.prototype.hasOwnProperty.call(ALIASES, n)) n = ALIASES[n];
    if (Object.prototype.hasOwnProperty.call(PLURALS, n)) n = PLURALS[n];
    return n;
  }

  // ------------------------------------------------------- ingredient table
  // cup = 240ml. Only confident, fixed values. No guessing.
  // pkg: [sizeInBaseUnits, labelSingular]
  var INGREDIENTS = {
    'קמח':         { kind: 'mass',   cup: 140, tbsp: 9, tsp: 3, pkg: [1000, 'שקית'] },
    'סוכר':        { kind: 'mass',   cup: 200, tbsp: 13, tsp: 4, pkg: [1000, 'שקית'] },
    'סוכר חום':    { kind: 'mass',   cup: 220, pkg: [1000, 'שקית'] },
    'אבקת סוכר':   { kind: 'mass',   cup: 120 },
    'אורז':        { kind: 'mass',   cup: 185, pkg: [1000, 'שקית'] },
    'שמן':         { kind: 'volume', cup: 240, tbsp: 15, pkg: [1000, 'בקבוק'] },
    'שמן זית':     { kind: 'volume', cup: 240, pkg: [750, 'בקבוק'] },
    'חלב':         { kind: 'volume', cup: 240, pkg: [1000, 'קרטון'] },
    'מים':         { kind: 'volume', cup: 240 },
    'ביצה':        { kind: 'count',  pkg: [12, 'תבנית'] },
    'מלח':         { kind: 'mass',   cup: 288, tbsp: 18, tsp: 6, pkg: [1000, 'שקית'] },
    'קקאו':        { kind: 'mass',   cup: 100, tbsp: 7 },
    'סולת':        { kind: 'mass',   cup: 170, pkg: [1000, 'שקית'] },
    'שיבולת שועל': { kind: 'mass',   cup: 90 },
    'קורנפלור':    { kind: 'mass',   cup: 130, tbsp: 8 },
    'אבקת אפייה':  { kind: 'mass',   tbsp: 12, tsp: 4, pkg: [10, 'שקית'] },
    'סודה לשתייה': { kind: 'mass',   tsp: 5 },
    'דבש':         { kind: 'mass',   cup: 340, tbsp: 21, tsp: 7 },
    'חמאה':        { kind: 'mass',   tbsp: 15, pkg: [100, 'חבילה'] },
    'פסטה':        { kind: 'mass',   pkg: [500, 'חבילה'] },
    'עדשים':       { kind: 'mass',   pkg: [500, 'שקית'] },
    'שעועית':      { kind: 'mass',   pkg: [500, 'שקית'] },
    'חומוס':       { kind: 'mass',   pkg: [500, 'שקית'] },
    // count only — no weight conversion, ever
    'בצל':         { kind: 'count' },
    'עגבניה':      { kind: 'count' },
    'תפוחי אדמה':  { kind: 'count' },
    'גזר':         { kind: 'count' },
    'שום':         { kind: 'count' }
  };

  // ------------------------------------------------------- conversion
  // Returns {kind, base} with base in grams (mass) / ml (volume) / units (count),
  // or null when the conversion cannot be done confidently.
  function convert(qty, unit, ing) {
    if (unit === 'g') {
      if (ing.kind !== 'mass') return null;
      return { kind: 'mass', base: qty };
    }
    if (unit === 'kg') {
      if (ing.kind !== 'mass') return null;
      return { kind: 'mass', base: qty * 1000 };
    }
    if (unit === 'ml') {
      if (ing.kind !== 'volume') return null;
      return { kind: 'volume', base: qty };
    }
    if (unit === 'liter') {
      if (ing.kind !== 'volume') return null;
      return { kind: 'volume', base: qty * 1000 };
    }
    if (unit === 'cup' || unit === 'tbsp' || unit === 'tsp') {
      if (ing[unit] == null) return null; // no confident conversion for this unit
      return { kind: ing.kind, base: qty * ing[unit] };
    }
    if (unit === 'count') {
      if (ing.kind !== 'count') return null;
      return { kind: 'count', base: qty };
    }
    return null;
  }

  // ------------------------------------------------------- formatting
  function fmtNum(v) {
    return String(Math.round(v * 100) / 100); // 2 decimals, trailing zeros dropped
  }
  function formatDisplay(item) {
    if (item.kind === 'mass') {
      if (item.totalBase >= 1000) return fmtNum(item.totalBase / 1000) + ' ק' + GERESH + 'ג';
      return String(Math.round(item.totalBase)) + ' גרם';
    }
    if (item.kind === 'volume') {
      if (item.totalBase >= 1000) return fmtNum(item.totalBase / 1000) + ' ליטר';
      return String(Math.round(item.totalBase)) + ' מ' + GERESH + 'ל';
    }
    return String(Math.round(item.totalBase)) + ' יחידות';
  }

  var LABEL_PLURAL = {
    'שקית': 'שקיות',
    'בקבוק': 'בקבוקים',
    'קרטון': 'קרטונים',
    'חבילה': 'חבילות',
    'תבנית': 'תבניות'
  };
  function formatSize(size, kind) {
    if (kind === 'count') return String(size);
    if (kind === 'mass') {
      return size >= 1000 ? fmtNum(size / 1000) + ' ק' + GERESH + 'ג'
                          : String(Math.round(size)) + ' גרם';
    }
    return size >= 1000 ? fmtNum(size / 1000) + ' ליטר'
                        : String(Math.round(size)) + ' מ' + GERESH + 'ל';
  }
  function formatPackage(item) {
    var ing = INGREDIENTS[item.name];
    if (!ing || !ing.pkg) return null;
    var size = ing.pkg[0], label = ing.pkg[1];
    var n = Math.ceil(item.totalBase / size - 1e-9);
    var sizeD = formatSize(size, item.kind);
    if (item.totalBase < size) return '(אריזה: ' + sizeD + ')';
    var lbl = n === 1 ? label : (LABEL_PLURAL[label] || label);
    return n + ' ' + lbl + ' ' + TIMES + ' ' + sizeD;
  }

  // ------------------------------------------------------- aggregate
  function aggregate(lines) {
    var items = [];
    var byName = Object.create(null);
    var leftovers = [];
    var seenLeft = Object.create(null);

    function pushLeftover(line) {
      var key = String(line).trim().replace(/\s+/g, ' ');
      if (!seenLeft[key]) { seenLeft[key] = true; leftovers.push(key); }
    }

    var arr = Array.isArray(lines) ? lines : [];
    for (var k = 0; k < arr.length; k++) {
      var line = arr[k];
      var p = parseLine(line);
      if (!p) { pushLeftover(line); continue; }
      var cname = normalizeName(p.name);
      var ing = INGREDIENTS[cname];
      if (!ing) { pushLeftover(line); continue; } // unknown ingredient: no guessing
      var conv = convert(p.qty, p.unit, ing);
      if (!conv) { pushLeftover(line); continue; } // cannot convert confidently
      var existing = byName[cname];
      if (existing) {
        if (existing.kind !== conv.kind) { pushLeftover(line); continue; }
        existing.totalBase += conv.base;
      } else {
        var item = { name: cname, kind: conv.kind, totalBase: conv.base, display: '', packageNote: null };
        byName[cname] = item;
        items.push(item);
      }
    }
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      it.totalBase = Math.round(it.totalBase * 100) / 100;
      it.display = formatDisplay(it);
      it.packageNote = formatPackage(it);
    }
    return { items: items, leftovers: leftovers };
  }

  return {
    parseLine: parseLine,
    normalizeName: normalizeName,
    aggregate: aggregate
  };
}));
