/* E2E test of aiChatStream: mock Gemini SSE upstream, verify sanitized
 * client events. Run: node stream-e2e.test.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const src = fs.readFileSync(require('node:path').join(__dirname, 'worker.js'), 'utf8');
const i = src.indexOf('// ==AI-STREAM-START==');
const j = src.indexOf('// ==AI-STREAM-END==');
const block = src.slice(i, j);

// stub environment
const GEMINI_STREAM_URL = 'https://example.test/streamGenerateContent';
const AI_SYS = { chat: 'sys' };
const aiSpec = () => ({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });

const geminiEvents = [
  'data: {"candidates":[{"content":{"parts":[{"text":"שלום "}],"role":"model"}}]}\r\n\r\n',
  'data: {"candidates":[{"content":{"parts":[{"text":"עולם!"}],"role":"model"}}]}\r\n\r\n',
  'data: {"candidates":[{"content":{"parts":[{"text":"","thoughtSignature":"xyz"}],"role":"model"},"finishReason":"STOP"}]}\r\n\r\n',
];
let fetchUrl = '';
global.fetch = async (url, opts) => {
  fetchUrl = url;
  assert.ok(url.startsWith(GEMINI_STREAM_URL), 'wrong upstream URL');
  assert.ok(url.includes('alt=sse'), 'missing alt=sse');
  assert.ok(url.includes('key=' + encodeURIComponent('SECRET')), 'API key must go to Gemini server-side');
  const body = geminiEvents.join('');
  // split into awkward chunks to test the incremental parser
  const chunks = [body.slice(0, 40), body.slice(40, 90), body.slice(90)];
  return {
    ok: true,
    body: new ReadableStream({
      start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); c.close(); },
    }),
  };
};

const aiChatStream = new Function(
  'GEMINI_STREAM_URL', 'AI_SYS', 'aiSpec', 'fetch',
  block.slice(block.indexOf('function geminiStreamDelta')) +
  '; return aiChatStream;'
)(GEMINI_STREAM_URL, AI_SYS, aiSpec, global.fetch);

(async () => {
  const r = await aiChatStream({ GEMINI_API_KEY: 'SECRET' }, { action: 'chat', messages: [] });
  assert.ok(!r.err, 'unexpected err: ' + JSON.stringify(r.err));
  assert.equal(r.stream.headers.get('content-type'), 'text/event-stream;charset=UTF-8');
  const text = await r.stream.text();
  const events = text.split('\n\n').filter(Boolean).map(e => JSON.parse(e.replace(/^data: /, '')));
  const tokens = events.filter(e => e.t).map(e => e.t).join('');
  assert.equal(tokens, 'שלום עולם!', 'token stream mismatch: ' + JSON.stringify(tokens));
  assert.ok(events.some(e => e.done === true), 'missing done event');
  assert.ok(!events.some(e => e.thoughtSignature), 'thoughtSignature leaked');
  console.log('stream events:', JSON.stringify(events.map(e => e.t ? { t: e.t } : e)));
  console.log('E2E stream test PASSED');
})().catch(e => { console.error('E2E FAIL:', e); process.exit(1); });
