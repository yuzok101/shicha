
const GEMINI_MODEL='gemini-3.5-flash-lite',GEMINI_URL='https://generativelanguage.googleapis.com/v1beta/models/'+GEMINI_MODEL+':generateContent';
const AI_SYS={
chat:'אתה "העוזר החכם" של אפליקציית המתכונים "תבלין". ענה בעברית, בקצרה ובחום. אתה מומחה לבישול ביתי ישראלי: מתכונים, טכניקות, תחליפי מרכיבים, תכנון ארוחות ואחסון מזון. שים לב לכשרות (פרווה/חלבי/בשרי) כשזה רלוונטי. אם השאלה אינה קשורה לאוכל ולבישול, החזר אותה בנימוס לנושא.',
suggest:'אתה מנוע המלצות לאפליקציית מתכונים ישראלית. ענה אך ורק ב-JSON תקין, ללא טקסט נוסף וללא סימוני קוד.',
substitute:'אתה מנוע תחליפי מרכיבים לאפליקציית מתכונים ישראלית. ענה אך ורק ב-JSON תקין, ללא טקסט נוסף וללא סימוני קוד.',
smartsearch:'אתה מנוע חיפוש סמנטי לאפליקציית מתכונים ישראלית. ענה אך ורק ב-JSON תקין, ללא טקסט נוסף וללא סימוני קוד.',
parse:'אתה מפענח מתכונים לאפליקציית מתכונים ישראלית. ענה אך ורק ב-JSON תקין, ללא טקסט נוסף וללא סימוני קוד.'};
function aiSpec(action,b){
 if(action==='chat'){const msgs=Array.isArray(b.messages)?b.messages.slice(-12):[];return{contents:msgs.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:String(m.text||'').slice(0,2000)}]}))}}
 const slim=a=>JSON.stringify(a).slice(0,6000);
 if(action==='suggest')return{temp:0.6,tokens:800,prompt:'המתכונים:\n'+slim(b.recipes||[])+'\n\nמה שיש בבית: '+((b.inventory||[]).join(', ')||'לא צוין')+'\n\nבחר עד 3 מתכונים שמתאימים ביותר. החזר JSON: [{"name":"שם המתכון בדיוק כפי שמופיע","reason":"סיבה קצרה בעברית","missing":["מרכיבים חסרים"]}]'};
 if(action==='substitute')return{temp:0.5,tokens:500,prompt:'המרכיב: "'+String(b.ingredient||'').slice(0,80)+'"'+(b.recipeName?'\nבהקשר של המתכון: "'+String(b.recipeName).slice(0,80)+'"':'')+'\nהחזר JSON: {"substitutes":[{"name":"שם התחליף","amount":"כמות/יחס","note":"הערה קצרה בעברית"}]}. עד 4 תחליפים.'};
 if(action==='smartsearch')return{temp:0.4,tokens:600,prompt:'השאילתה: "'+String(b.query||'').slice(0,200)+'"\n\nהמתכונים:\n'+slim(b.recipes||[])+'\n\nהחזר JSON עם המתכונים המתאימים לשאילתה (גם התאמה רעיונית, לא רק מילולית): [{"name":"שם בדיוק כפי שמופיע","reason":"למה מתאים, בעברית"}]. אם אין התאמה החזר [].'};
 if(action==='parse')return{temp:0.3,tokens:1200,prompt:'הטקסט:\n"""\n'+String(b.text||'').slice(0,4000)+'\n"""\n\nחלץ מתכון מובנה. החזר JSON: {"name":"שם","category":"פרווה/חלבי/בשרי/קינוח/אחר","minutes":30,"ingredients":["שורה לכל מרכיב"],"steps":["שורה לכל שלב"],"notes":""}. אם חסר מידע, השאר מחרוזת ריקה או מערך ריק.'};
 return null}
function aiCleanJSON(t){const m=String(t||'').replace(/```json|```/g,'').trim();const bo=m.indexOf('{'),bc=m.lastIndexOf('}'),ao=m.indexOf('['),ac=m.lastIndexOf(']');let c=m;if(ao>=0&&(bo<0||ao<bo))c=m.slice(ao,ac+1);else if(bo>=0)c=m.slice(bo,bc+1);try{return JSON.parse(c)}catch(e){return null}}
async function aiCall(env,action,b){
 const key=env.GEMINI_API_KEY;
 if(!key)return{err:{error:'ai_unavailable',message:'שירות ה-AI אינו מוגדר כרגע. כדי להפעיל אותו יש להגדיר את הסוד GEMINI_API_KEY בשרת (wrangler secret put GEMINI_API_KEY).'},status:503};
 const spec=aiSpec(action,b);
 if(!spec||(action==='chat'&&!spec.contents.length))return{err:{error:'bad_request'},status:400};
 const contents=action==='chat'?spec.contents:[{parts:[{text:spec.prompt}]}];
 let gr;
 try{gr=await fetch(GEMINI_URL+'?key='+encodeURIComponent(key),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({system_instruction:{parts:[{text:AI_SYS[action]}]},contents,generationConfig:{temperature:spec.temp??0.7,maxOutputTokens:spec.tokens??1024}})} )}catch(e){return{err:{error:'ai_failed',message:'שירות ה-AI נכשל כרגע. נסו שוב מאוחר יותר.'},status:502}}
 if(!gr.ok)return{err:{error:'ai_failed',message:'שירות ה-AI החזיר שגיאה. נסו שוב מאוחר יותר.'},status:502};
 let gj;try{gj=await gr.json()}catch(e){return{err:{error:'ai_failed',message:'שירות ה-AI החזיר תשובה לא תקינה.'},status:502}}
 const text=(gj.candidates&&gj.candidates[0]&&gj.candidates[0].content&&gj.candidates[0].content.parts||[]).map(x=>x.text||'').join('').trim();
 if(!text)return{err:{error:'ai_failed',message:'שירות ה-AI החזיר תשובה ריקה. נסו שוב.'},status:502};
 if(action==='chat')return{ok:{reply:text}};
 const data=aiCleanJSON(text);
 if(!data)return{err:{error:'ai_parse',message:'שירות ה-AI החזיר תשובה לא תקינה. נסו שוב.'},status:502};
 return{ok:{data}}}

const JSON_HEADERS={'content-type':'application/json;charset=UTF-8','cache-control':'no-store'};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))), unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function hashPassword(password,salt=crypto.getRandomValues(new Uint8Array(16))){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},key,256);return `pbkdf2$210000$${b64(salt)}$${b64(bits)}`}
async function verifyPassword(password,stored){const [kind,n,salt,want]=stored.split('$');if(kind!=='pbkdf2')return false;const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const got=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:+n,hash:'SHA-256'},key,256)), exp=unb64(want);if(got.length!==exp.length)return false;let d=0;for(let i=0;i<got.length;i++)d|=got[i]^exp[i];return d===0}
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,enc.encode(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
async function session(user,env){const exp=Date.now()+7*864e5,body=`${user.id}.${exp}`,sig=await sign(body,env.SESSION_SECRET);return `${body}.${sig}`}
async function auth(req,env){const c=req.headers.get('cookie')||'',token=c.match(/(?:^|; )tavlin_session=([^;]+)/)?.[1];if(!token)return null;const [id,exp,sig]=token.split('.');if(!id||+exp<Date.now()||await sign(`${id}.${exp}`,env.SESSION_SECRET)!==sig)return null;return env.DB.prepare('SELECT id,username FROM users WHERE id=?').bind(id).first()}
const recipeFields=r=>({id:r.id||crypto.randomUUID(),name:String(r.name||'').trim(),category:String(r.category||'אחר'),minutes:Math.max(0,Math.min(1440,+r.minutes||0)),ingredients:Array.isArray(r.ingredients)?r.ingredients.map(String):[],steps:Array.isArray(r.steps)?r.steps.map(String):[],notes:String(r.notes||''),photo_key:r.photo_key||null,source:String(r.source||'manual'),updated_at:Date.now()});
export default {async fetch(req,env){const url=new URL(req.url),p=url.pathname;try{
 if(p==='/api/health')return reply({ok:true,service:'tavlin',storage:'d1'});
 if(p==='/api/setup'&&req.method==='POST'){if(await env.DB.prepare('SELECT count(*) n FROM users').first().then(x=>x.n))return reply({error:'setup_closed'},403);const b=await req.json();if(b.username!=='יוני'||typeof b.password!=='string'||b.password.length<12)return reply({error:'invalid_setup'},400);const id=crypto.randomUUID(),hash=await hashPassword(b.password);await env.DB.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(id,b.username,hash,Date.now()).run();return reply({ok:true})}
 if(p==='/api/login'&&req.method==='POST'){const b=await req.json(),u=await env.DB.prepare('SELECT id,username,password_hash FROM users WHERE username=?').bind(String(b.username||'')).first();if(!u||!await verifyPassword(String(b.password||''),u.password_hash))return reply({error:'invalid_credentials'},401);const token=await session(u,env);return reply({ok:true,user:{username:u.username}},200,{'set-cookie':`tavlin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`})}
 if(p==='/api/logout'&&req.method==='POST')return reply({ok:true},200,{'set-cookie':'tavlin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
  if(p==='/api/ai'&&req.method==='POST'){
  const ref=req.headers.get('origin')||req.headers.get('referer')||'';
  let same=false;try{same=!!ref&&new URL(ref).hostname===url.hostname}catch(e){}
  if(!same)return reply({error:'forbidden'},403);
  let b;try{b=await req.json()}catch(e){return reply({error:'bad_request'},400)}
  if(!AI_SYS[b.action])return reply({error:'bad_action'},400);
  const r=await aiCall(env,b.action,b);
  if(r.err)return reply(r.err,r.status);
  return reply(r.ok);
 }
 const u=await auth(req,env);if(!u)return reply({error:'unauthorized'},401);
 if(p==='/api/me')return reply({user:{username:u.username}});
 if(p==='/api/recipes'&&req.method==='GET'){const rows=await env.DB.prepare('SELECT id,name,category,minutes,ingredients,steps,notes,source,created_at,updated_at FROM recipes WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500').bind(u.id).all();return reply({recipes:rows.results.map(r=>({...r,ingredients:JSON.parse(r.ingredients),steps:JSON.parse(r.steps)}))})}
 if(p==='/api/recipes'&&req.method==='POST'){const r=recipeFields(await req.json());if(!r.name||!r.ingredients.length||!r.steps.length)return reply({error:'invalid_recipe'},400);await env.DB.prepare('INSERT INTO recipes(id,user_id,name,category,minutes,ingredients,steps,notes,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(r.id,u.id,r.name,r.category,r.minutes,JSON.stringify(r.ingredients),JSON.stringify(r.steps),r.notes,r.source,r.updated_at,r.updated_at).run();return reply({recipe:r},201)}
 const m=p.match(/^\/api\/recipes\/([a-zA-Z0-9-]+)$/);if(m&&req.method==='PUT'){const old=await env.DB.prepare('SELECT * FROM recipes WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(m[1],u.id).first();if(!old)return reply({error:'not_found'},404);const r=recipeFields({...await req.json(),id:m[1]});if(!r.name||!r.ingredients.length||!r.steps.length)return reply({error:'invalid_recipe'},400);await env.DB.batch([env.DB.prepare('INSERT INTO recipe_versions(id,recipe_id,user_id,snapshot,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),m[1],u.id,JSON.stringify(old),Date.now()),env.DB.prepare('UPDATE recipes SET name=?,category=?,minutes=?,ingredients=?,steps=?,notes=?,source=?,updated_at=? WHERE id=? AND user_id=?').bind(r.name,r.category,r.minutes,JSON.stringify(r.ingredients),JSON.stringify(r.steps),r.notes,r.source,r.updated_at,m[1],u.id)]);return reply({recipe:r})}
 if(m&&req.method==='DELETE'){const x=await env.DB.prepare('UPDATE recipes SET deleted_at=?,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(Date.now(),Date.now(),m[1],u.id).run();return x.meta.changes?reply({ok:true}):reply({error:'not_found'},404)}
 if(p==='/api/backup') {const rows=await env.DB.prepare('SELECT * FROM recipes WHERE user_id=?').bind(u.id).all();return reply({app:'tavlin',backup_version:1,exported_at:new Date().toISOString(),recipes:rows.results})}
 return reply({error:'not_found'},404)
 }catch(e){console.log('request_failed',crypto.randomUUID());return reply({error:'request_failed'},500)}}};
