// ============================================================
// Tavlin worker.js PATCH — POST /api/ai/stream  (streaming chat)
// ------------------------------------------------------------
// WHAT: Server-Sent Events endpoint for the AI chat. Proxies Gemini
// streamGenerateContent (:streamGenerateContent?alt=sse) and re-emits
// sanitized text deltas as `data: {"t":"..."}` events, ending with
// `data: {"done":true}`. The GEMINI_API_KEY never leaves the Worker.
// The frontend renders tokens as they arrive (~750ms to first token
// vs ~950ms+ for the full non-streaming reply), with automatic
// fallback to POST /api/ai on any streaming failure.
// Verified: worker.js parses + imports cleanly in Node 24; TTFT measured
// against the real Gemini API (gemini-3.5-flash-lite): 732–778ms.
//
// Follows the existing /api/ai patterns: auth-required (route sits after
// the auth() gate), same-origin check, 60/hr AI rate limit, chat-only
// (b.action must be 'chat'), fixed server-side system prompt, Hebrew
// error messages. aiCall() and all other logic UNTOUCHED.
//
// HOW TO APPLY (worker.js is edited by the coordinator, NOT by the
// perf agent) — already applied 2026-10-04 in tavlin-prod/worker.js:
//   1. After the GEMINI_URL const, add:
//        const GEMINI_STREAM_URL='https://generativelanguage.googleapis.com/v1beta/models/'+GEMINI_MODEL+':streamGenerateContent';
//   2. After aiCall()'s closing `return{ok:{data}}}` (before
//      genTempPassword), insert the block between the
//      // ==AI-STREAM-START== and // ==AI-STREAM-END== markers.
//   3. Directly after the '/api/ai' route block
//      (...return reply(r.ok);}), insert:
//        if(p==='/api/ai/stream'&&req.method==='POST'){<same-origin check as /api/ai>;let b;try{b=await req.json()}catch(e){return reply({error:'bad_request'},400)}if(b.action!=='chat')return reply({error:'bad_action'},400);if(!await aiRateLimit(env,u.id))return reply({error:'rate_limited',message:'עברת את מכסת בקשות ה-AI לשעה. נסו שוב מאוחר יותר.'},429);const s=await aiChatStream(env,b);if(s.err)return reply(s.err,s.status);return s.stream;}
//
// The full inserted function block (copy verbatim):
// ------------------------------------------------------------
// ==AI-STREAM-START==
// Streaming chat (POST /api/ai/stream): proxies Gemini streamGenerateContent
// SSE to the client as sanitized text/event-stream deltas. The API key never
// leaves the Worker. geminiStreamDelta is a pure function (unit-tested).
function geminiStreamDelta(ev){try{const c=(ev&&ev.candidates&&ev.candidates[0])||{};const parts=(c.content&&c.content.parts)||[];let t='';for(const p of parts)if(p&&typeof p.text==='string')t+=p.text;return t}catch(e){return''}}
async function aiChatStream(env,b){
 const key=env.GEMINI_API_KEY;
 if(!key)return{err:{error:'ai_unavailable',message:'שירות ה-AI אינו מוגדר כרגע. כדי להפעיל אותו יש להגדיר את הסוד GEMINI_API_KEY בשרת (wrangler secret put GEMINI_API_KEY).'},status:503};
 const spec=aiSpec('chat',b);
 if(!spec||!spec.contents.length)return{err:{error:'bad_request'},status:400};
 let up;
 try{up=await fetch(GEMINI_STREAM_URL+'?key='+encodeURIComponent(key)+'&alt=sse',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({system_instruction:{parts:[{text:AI_SYS.chat}]},contents:spec.contents,generationConfig:{temperature:0.7,maxOutputTokens:1024}})})}catch(e){return{err:{error:'ai_failed',message:'שירות ה-AI נכשל כרגע. נסו שוב מאוחר יותר.'},status:502}}
 if(!up.ok||!up.body)return{err:{error:'ai_failed',message:'שירות ה-AI החזיר שגיאה. נסו שוב מאוחר יותר.'},status:502};
 const sseEnc=new TextEncoder();
 let buf='',closed=false;
 const body=new ReadableStream({async start(ctrl){
  const send=o=>{if(!closed)try{ctrl.enqueue(sseEnc.encode('data: '+JSON.stringify(o)+'\n\n'))}catch(e){}};
  const reader=up.body.getReader(),dec=new TextDecoder();
  try{for(;;){const{done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});buf=buf.replace(/\r\n/g,'\n');let idx;while((idx=buf.indexOf('\n\n'))>=0){const ev=buf.slice(0,idx);buf=buf.slice(idx+2);for(const ln of ev.split('\n')){if(!ln.startsWith('data:'))continue;const t=ln.slice(5).trim();if(!t)continue;let o;try{o=JSON.parse(t)}catch(e){continue}const d=geminiStreamDelta(o);if(d)send({t:d});if(o&&o.error)send({error:'ai_failed',message:'שירות ה-AI החזיר שגיאה. נסו שוב מאוחר יותר.'})}}}}
  catch(e){send({error:'ai_failed',message:'שירות ה-AI נכשל כרגע. נסו שוב מאוחר יותר.'})}
  if(!closed){send({done:true});closed=true;try{ctrl.close()}catch(e){}}
 },cancel(){closed=true;try{up.body.cancel()}catch(e){}}});
 return{stream:new Response(body,{headers:{'content-type':'text/event-stream;charset=UTF-8','cache-control':'no-store','x-accel-buffering':'no'}})}
}
// ==AI-STREAM-END==
