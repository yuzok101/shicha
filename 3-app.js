const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const DB={name:'tavlin',version:1,db:null,async open(){this.db=await new Promise((ok,no)=>{const q=indexedDB.open(this.name,this.version);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('recipes')){const s=d.createObjectStore('recipes',{keyPath:'id'});s.createIndex('updatedAt','updatedAt')}if(!d.objectStoreNames.contains('state'))d.createObjectStore('state',{keyPath:'key'})};q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});return this},store(n,m='readonly'){return this.db.transaction(n,m).objectStore(n)},req(q){return new Promise((ok,no)=>{q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})},all(){return this.req(this.store('recipes').getAll())},put(v){return this.req(this.store('recipes','readwrite').put(v))},del(id){return this.req(this.store('recipes','readwrite').delete(id))},state(key){return this.req(this.store('state').get(key))},setState(key,value){return this.req(this.store('state','readwrite').put({key,value}))}};
let recipes=[],filter='',category='הכל',installPrompt=null,cook=null,tick=null;
const uid=()=>crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2), lines=s=>s.split(/\n+/).map(x=>x.trim()).filter(Boolean), esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2400)}
async function refresh(){recipes=(await DB.all()).filter(x=>!x.deletedAt).sort((a,b)=>b.updatedAt-a.updatedAt)}
function layoutHome(){const last=recipes[0];return `<section class="hero"><span class="eyebrow">ספר המתכונים המשפחתי שלך</span><h1>מה מבשלים היום?</h1><p>כל המתכונים, הזיכרונות והטעמים במקום אחד. נשמרים במכשיר שלך ועובדים גם בלי אינטרנט.</p><div class="search"><input id="homeSearch" placeholder="חיפוש לפי שם או מרכיב"><button class="primary" id="homeSearchBtn">חיפוש</button></div><div class="statusbar"><div class="stat"><b>${recipes.length}</b>מתכונים</div><div class="stat"><b>${navigator.onLine?'מחובר':'לא מקוון'}</b>מצב רשת</div><div class="stat"><b>${cook?'פעיל':'פנוי'}</b>מטבח</div></div></section><section class="quick"><button data-action="new"><span>✍️</span>מתכון ידני</button><button data-action="paste"><span>📋</span>הדבקת מתכון</button><button data-action="scan"><span>📷</span>סריקת דף</button><button data-view="library"><span>📖</span>ספר המתכונים</button><button data-action="suggest"><span>🤖</span>מה לבשל היום</button></section>${cook?`<div class="backupPanel"><b>יש לך בישול פעיל</b><p>${esc(cook.recipeName)} · שלב ${cook.step+1}</p><button class="primary" data-action="resume">חזרה לבישול</button></div>`:''}<div class="sectionHead"><h2>נוספו לאחרונה</h2><button data-view="library">לכל המתכונים</button></div><div class="grid">${recipes.length?recipes.slice(0,3).map(card).join(''):`<div class="empty"><div class="big">🌿</div><h2>ברוכים הבאים לתבלין</h2><p>מתחילים מהמתכון הראשון?</p><button class="primary" data-action="new">הוספה ידנית</button></div>`}</div>`}
function card(r){return `<article class="card"><div class="photo" ${r.photo?`style="background-image:url('${r.photo}')"`:''}>${r.photo?'':'🍲'}</div><div class="cardBody"><h3>${esc(r.name)}</h3><div class="meta">${esc(r.category)} · ${r.minutes||0} דקות · ${r.ingredients.length} מרכיבים</div><div class="cardActions"><button class="primary" data-cook="${r.id}">לבישול</button><button data-edit="${r.id}">פתיחה</button><button data-copy="${r.id}" title="העתקה">שיתוף</button><button data-split="${r.id}">ליד מתכון</button></div></div></article>`}
function layoutLibrary(){let shown=recipes.filter(r=>(category==='הכל'||r.category===category)&&(!filter||normQ([r.name,...r.ingredients,...r.steps].join(' ')).includes(normQ(filter))));return `<div class="sectionHead"><div><span class="eyebrow" style="color:var(--spice)">הספר המשפחתי</span><h1>המתכונים שלי</h1></div><button class="primary" data-action="new">＋ מתכון חדש</button></div><div class="search"><input id="libSearch" value="${esc(filter)}" placeholder="חיפוש בשם, מרכיב או שלב"><button id="libSearchBtn">חיפוש</button><button id="libSmartBtn" title="חיפוש חכם">✨ חכם</button></div><div class="chips">${['הכל','פרווה','חלבי','בשרי','קינוח','אחר'].map(x=>`<button class="chip ${category===x?'active':''}" data-category="${x}">${x}</button>`).join('')}</div><p class="muted">${shown.length} תוצאות</p><div id="smartBox"></div><div class="grid">${shown.length?shown.map(card).join(''):`<div class="empty"><div class="big">🔎</div><h2>לא נמצאו מתכונים</h2><p>אפשר לשנות את החיפוש או להוסיף מתכון חדש.</p></div>`}</div>`}
function layoutBackup(){return `<h1>גיבוי ושיתוף</h1><p>כל המידע נשמר רק במכשיר הזה. קובץ גיבוי מאפשר להעביר או לשחזר אותו בלי חשבון ובלי שרת.</p><section class="backupPanel"><h2>גיבוי מלא</h2><p>מוריד קובץ JSON עם כל המתכונים והתמונות ועם <code>backup_version</code>.</p><button class="primary" data-action="export">הורדת גיבוי</button><button data-action="import">שחזור מגיבוי</button></section><section class="backupPanel"><h2>פרטיות ועבודה לא מקוונת</h2><p>אין חשבון, אין ענן ואין מעקב. הנתונים נשארים ב-IndexedDB בדפדפן. האפליקציה הסטטית נשמרת במטמון ועובדת ללא רשת.</p><div class="notice">מחיקת נתוני הדפדפן תמחק גם את המתכונים המקומיים. מומלץ להוריד גיבוי אחרי שינויים חשובים.</div></section><section class="backupPanel"><h2>עוזר חכם 🤖</h2><div id="aiChat" class="chatLog"><div class="bubble ai">היי! אני העוזר החכם של תבלין 🍳 שאלו אותי על מתכונים, מרכיבים, תחליפים או טכניקות בישול.</div></div><div class="row"><input id="aiInput" placeholder="שאלו כל שאלה על בישול..." autocomplete="off"><button class="primary" id="aiSend">שליחה</button></div><p class="muted" id="aiStatus">מופעל על ידי AI · דורש חיבור לאינטרנט</p></section><section class="backupPanel"><h2>המלאי שלי 🧺</h2><p class="muted">סמנו מה יש בבית — ההמלצות והמתכונים ידעו מה חסר.</p><div id="invPreview" class="chips"></div><div><button class="primary" id="invEdit">עריכת מלאי</button></div></section>`}
async function render(view=location.hash.slice(1)||'home'){if(!['home','library','backup'].includes(view))view='home';location.hash=view;$('#app').innerHTML=view==='home'?layoutHome():view==='library'?layoutLibrary():layoutBackup();bind()}
function bind(){$$('[data-view]').forEach(b=>b.onclick=()=>render(b.dataset.view));$$('[data-action]').forEach(b=>b.onclick=()=>actions[b.dataset.action]?.());$$('[data-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.edit));$$('[data-cook]').forEach(b=>b.onclick=()=>startCook(b.dataset.cook));$$('[data-copy]').forEach(b=>b.onclick=()=>shareRecipe(b.dataset.copy));$$('[data-split]').forEach(b=>b.onclick=()=>chooseSplit(b.dataset.split));$$('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;render('library')});$('#homeSearchBtn')?.addEventListener('click',()=>{filter=$('#homeSearch').value;render('library')});$('#libSearchBtn')?.addEventListener('click',()=>{filter=$('#libSearch').value;render('library')});$('#libSmartBtn')?.addEventListener('click',smartSearch);$('#aiSend')?.addEventListener('click',sendAiChat);$('#aiInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendAiChat()}});$('#invEdit')?.addEventListener('click',openInventory);$('#scanAiBtn')?.addEventListener('click',aiParseScan);$('#subBtn')?.addEventListener('click',findSubstitutes);renderInvPreview()}
const actions={new:()=>openEditor(),suggest:()=>openSuggest(),paste:()=>{$('#pasteDialog').showModal()},scan:()=>{$('#scanDialog').showModal()},export:exportBackup,import:()=>$('#importFile').click(),resume:()=>showCook()};
function closeDialogs(){ $$('dialog [data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close())}closeDialogs();
async function openEditor(id,seed){const f=$('#recipeForm');f.reset();f.id.value='';$('#deleteRecipe').hidden=true;let r=id?recipes.find(x=>x.id===id):seed;if(r){f.id.value=r.id||'';f.name.value=r.name||'';f.category.value=r.category||'אחר';f.minutes.value=r.minutes||30;f.ingredients.value=(r.ingredients||[]).join('\n');f.steps.value=(r.steps||[]).join('\n');f.notes.value=r.notes||'';$('#deleteRecipe').hidden=!r.id;$('#formTitle').textContent=r.id?'עריכת מתכון':'בדיקת המתכון'}else{const d=await DB.state('draft');if(d?.value){Object.entries(d.value).forEach(([k,v])=>{if(f[k])f[k].value=v})}$('#formTitle').textContent='מתכון חדש'}$('#recipeDialog').showModal();const _sr=$('#subResult');if(_sr)_sr.innerHTML='';updateMissBox()}
let draftDelay;$('#recipeForm').addEventListener('input',()=>{clearTimeout(draftDelay);draftDelay=setTimeout(()=>{const f=$('#recipeForm');DB.setState('draft',{name:f.name.value,category:f.category.value,minutes:f.minutes.value,ingredients:f.ingredients.value,steps:f.steps.value,notes:f.notes.value})},300)});
$('#recipeForm').onsubmit=async e=>{e.preventDefault();const f=e.target,id=f.id.value||uid(),old=recipes.find(x=>x.id===id);let photo=old?.photo||'';if(f.photo.files[0])photo=await fileData(f.photo.files[0]);const r={id,name:f.name.value.trim(),category:f.category.value,minutes:+f.minutes.value||0,ingredients:lines(f.ingredients.value),steps:lines(f.steps.value),notes:f.notes.value.trim(),photo,source:old?.source||'manual',sourceImage:old?.sourceImage||'',createdAt:old?.createdAt||Date.now(),updatedAt:Date.now(),favorite:old?.favorite||false};if(!r.name||!r.ingredients.length||!r.steps.length)return toast('צריך שם, מרכיבים ושלבים');await DB.put(r);await DB.setState('draft',null);$('#recipeDialog').close();await refresh();render('library');toast('המתכון נשמר במכשיר')};
$('#deleteRecipe').onclick=async()=>{const id=$('#recipeForm').id.value;if(!id)return;const r=recipes.find(x=>x.id===id);r.deletedAt=Date.now();r.updatedAt=Date.now();await DB.put(r);$('#recipeDialog').close();await refresh();render('library');toast('המתכון הועבר למחיקה');setTimeout(()=>{const t=$('#toast');t.innerHTML='המתכון נמחק · <button id="undo">ביטול</button>';t.classList.add('show');$('#undo').onclick=async()=>{delete r.deletedAt;await DB.put(r);await refresh();render('library');toast('המתכון שוחזר')}},50)};
function parseText(raw){const a=lines(raw);let name=a.shift()||'מתכון חדש',i=a.findIndex(x=>/מרכיבים|מצרכים/.test(x)),s=a.findIndex(x=>/אופן|הכנה|שלבים/.test(x));let ingredients,steps;if(i>=0&&s>i){ingredients=a.slice(i+1,s);steps=a.slice(s+1)}else{const cut=Math.max(1,Math.floor(a.length/2));ingredients=a.slice(0,cut);steps=a.slice(cut)}return{name,category:'אחר',minutes:30,ingredients,steps,notes:''}}
$('#pasteForm').onsubmit=e=>{e.preventDefault();const p=parseText(e.target.raw.value);$('#pasteDialog').close();openEditor(null,p)};
$('#scanForm').scan.onchange=async e=>{const f=e.target.files[0];if(f){$('#scanPreview').src=await fileData(f);$('#scanPreview').hidden=false}};
$('#scanForm').onsubmit=async e=>{e.preventDefault();const p=parseText(e.target.raw.value);p.source='scan';p.sourceImage=$('#scanPreview').src;$('#scanDialog').close();openEditor(null,p)};
function fileData(f){return new Promise((ok,no)=>{if(f.size>6e6)return no(toast('הקובץ גדול מדי - עד 6MB'));const r=new FileReader;r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)})}
async function startCook(id){const r=recipes.find(x=>x.id===id);cook={recipeId:id,recipeName:r.name,step:0,startedAt:Date.now(),timerTarget:null,timerMinutes:5};await DB.setState('cook',cook);showCook()}
function showCook(){const r=recipes.find(x=>x.id===cook?.recipeId);if(!r){cook=null;return}const n=r.steps.length,step=Math.min(cook.step,n-1),remaining=cook.timerTarget?Math.ceil((cook.timerTarget-Date.now())/1000):null;$('#cookContent').innerHTML=`<div class="cookTop"><div><span class="eyebrow" style="color:var(--spice)">מצב בישול</span><h2>${esc(r.name)}</h2></div><button id="closeCook">✕</button></div><div class="progress"><i style="width:${((step+1)/n)*100}%"></i></div><p class="muted">שלב ${step+1} מתוך ${n}</p><div class="step">${esc(r.steps[step])}</div><div class="timerBox"><b>טיימר לשלב</b><div class="row"><input id="timerMin" type="number" min="1" max="180" value="${cook.timerMinutes||5}"><button class="primary" id="timerStart">הפעלת טיימר</button></div>${remaining!==null?`<div class="timerTime" id="timerTime">${formatTimer(remaining)}</div>`:''}</div><div class="row"><button id="prevStep" ${step===0?'disabled':''}>הקודם</button><button class="primary" id="nextStep">${step===n-1?'סיום הבישול':'השלב הבא'}</button></div>`;$('#cookDialog').showModal();$('#closeCook').onclick=()=>$('#cookDialog').close();$('#prevStep').onclick=()=>updateCook({step:step-1});$('#nextStep').onclick=async()=>{if(step===n-1){cook=null;clearInterval(tick);await DB.setState('cook',null);$('#cookDialog').close();toast('בתיאבון! הבישול נשמר כהושלם');render('home')}else updateCook({step:step+1})};$('#timerStart').onclick=()=>{const m=+$('#timerMin').value||5;updateCook({timerMinutes:m,timerTarget:Date.now()+m*60000})};clearInterval(tick);tick=setInterval(updateTimer,1000)}
async function updateCook(x){Object.assign(cook,x);await DB.setState('cook',cook);showCook()}function updateTimer(){if(!cook?.timerTarget)return;const n=Math.ceil((cook.timerTarget-Date.now())/1000),el=$('#timerTime');if(el){el.textContent=formatTimer(n);if(n<=0)el.style.color='var(--danger)'}}function formatTimer(n){if(n<0)return `הטיימר הסתיים לפני ${Math.ceil(-n/60)} דקות`;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}

function chooseSplit(first){const choices=recipes.filter(r=>r.id!==first);if(!choices.length)return toast('צריך שני מתכונים לתצוגה מפוצלת');const id=prompt('בחרו מתכון שני לפי מספר:\n'+choices.map((r,i)=>`${i+1}. ${r.name}`).join('\n'));const second=choices[(+id||0)-1];if(second)showSplit(first,second.id)}
function showSplit(a,b){const one=recipes.find(r=>r.id===a),two=recipes.find(r=>r.id===b);const pane=r=>`<article class="splitPane"><h2>${esc(r.name)}</h2><h3>מרכיבים</h3><ul>${r.ingredients.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>אופן הכנה</h3><ol>${r.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>${r.notes?`<h3>הערות</h3><p>${esc(r.notes)}</p>`:''}</article>`;const el=document.createElement('section');el.className='splitOverlay';el.innerHTML=`<div class="splitHead"><div><b>שני מתכונים יחד</b><small class="muted">כל צד נגלל בנפרד</small></div><button id="closeSplit">✕ סגירה</button></div><div class="splitGrid">${pane(one)}${pane(two)}</div>`;document.body.append(el);$('#closeSplit').onclick=()=>el.remove()}

async function shareRecipe(id){const r=recipes.find(x=>x.id===id),text=`${r.name}\n\nמרכיבים:\n${r.ingredients.join('\n')}\n\nאופן הכנה:\n${r.steps.join('\n')}\n\nנשלח מתבלין`;try{await navigator.clipboard.writeText(text);toast('המתכון הועתק ואפשר לשתף אותו')}catch{download(new Blob([text],{type:'text/plain'}),`${r.name}.txt`)}}
async function exportBackup(){const data={app:'tavlin',backup_version:1,exported_at:new Date().toISOString(),recipes:await DB.all()};download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`tavlin-backup-${new Date().toISOString().slice(0,10)}.json`);toast('הגיבוי הורד')}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#importFile').onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(data.app!=='tavlin'||!Array.isArray(data.recipes)||data.backup_version>1)throw 0;for(const r of data.recipes)if(r.id&&r.name&&Array.isArray(r.ingredients)&&Array.isArray(r.steps))await DB.put(r);await refresh();render('library');toast(`${data.recipes.length} מתכונים שוחזרו`)}catch{toast('קובץ הגיבוי אינו תקין')}e.target.value=''};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').hidden=false});$('#installBtn').onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}};

/* ===== AI features (Gemini via /api/ai) ===== */
async function apiAI(action,payload={}){
 try{
  const r=await fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)return{ok:false,error:j.error||'ai_failed',message:j.message||'שירות ה-AI נכשל. נסו שוב מאוחר יותר.'};
  return{ok:true,...j};
 }catch(e){return{ok:false,error:'network',message:'אין חיבור לרשת. ה-AI דורש אינטרנט.'}}
}
let aiBusy=false;
function aiBubble(text,me){const log=$('#aiChat');if(!log)return null;const d=document.createElement('div');d.className='bubble '+(me?'me':'ai');d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight;return d}
async function sendAiChat(){
 const inp=$('#aiInput');if(!inp||aiBusy)return;const text=inp.value.trim();if(!text)return;
 aiBusy=true;inp.value='';aiBubble(text,true);
 const typing=aiBubble('מקליד... 🤔',false);if(typing)typing.classList.add('typing');
 const hist=[...$('#aiChat').querySelectorAll('.bubble:not(.typing)')].map(b=>({role:b.classList.contains('me')?'user':'assistant',text:b.textContent}));
 const res=await apiAI('chat',{messages:hist});
 if(typing)typing.remove();aiBusy=false;
 aiBubble(res.ok?res.reply:'⚠️ '+res.message,false);
}
const normIng=s=>String(s||'').replace(/[\d\/.,()\-+"':;!?\u0590-\u05CF]*\d+[\w\u0590-\u05FF\/.,()\-]*|[\d\/.,()\-+"':;!?]+/g,' ').replace(/\s+/g,' ').trim();
async function getInventory(){return(await DB.state('inventory'))?.value||[]}
async function setInventory(items){await DB.setState('inventory',items)}
function missingFor(r,inv){
 const items=(inv||[]).map(normIng).filter(Boolean);
 return(r.ingredients||[]).filter(line=>{const n=normIng(line);if(!n)return false;return!items.some(it=>it&&(n.includes(it)||it.includes(n)))});
}
async function renderInvPreview(){const el=$('#invPreview');if(!el)return;const inv=await getInventory();el.innerHTML=inv.length?inv.map(x=>`<span class="badge ok">${esc(x)}</span>`).join(''):'<span class="muted">עוד לא הוגדר מלאי</span>'}
async function openInventory(){
 const dlg=$('#inventoryDialog'),list=$('#invList'),inp=$('#invAdd');
 const draw=async()=>{const inv=await getInventory();
  list.innerHTML=inv.length?inv.map((x,i)=>`<div class="invRow"><span>${esc(x)}</span><button data-invdel="${i}">הסרה</button></div>`).join(''):'<p class="muted">רשימת המלאי ריקה. הוסיפו מרכיבים שיש בבית.</p>';
  list.querySelectorAll('[data-invdel]').forEach(b=>b.onclick=async()=>{const cur=await getInventory();cur.splice(+b.dataset.invdel,1);await setInventory(cur);draw();renderInvPreview();updateMissBox()})};
 $('#invAddBtn').onclick=async()=>{const v=inp.value.trim();if(!v)return;const cur=await getInventory();if(!cur.includes(v))cur.push(v);await setInventory(cur);inp.value='';draw();renderInvPreview();updateMissBox();inp.focus()};
 inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#invAddBtn').click()}};
 draw();dlg.showModal();
}
async function openSuggest(){
 const dlg=$('#aiDialog');$('#aiDlgTitle').textContent='🤖 מה לבשל היום';
 const inv=await getInventory();
 $('#aiDlgBody').innerHTML=`<p class="muted">מבוסס על ${recipes.length} מתכונים${inv.length?` ועל המלאי שלך (${inv.length} מרכיבים)`:' (טיפ: הגדירו מלאי כדי לקבל המלצות מדויקות יותר)'}</p><div class="row" style="margin-bottom:10px"><button id="sugInvBtn">🧺 עריכת מלאי</button></div><div id="sugBody"><p class="muted"><span class="spin">⏳</span> חושב...</p></div>`;
 dlg.showModal();
 $('#sugInvBtn').onclick=()=>{dlg.close();openInventory()};
 const res=await apiAI('suggest',{recipes:recipes.map(r=>({name:r.name,ingredients:r.ingredients,category:r.category,minutes:r.minutes})),inventory:inv});
 const body=$('#sugBody');if(!body)return;
 if(!res.ok){body.innerHTML=`<div class="notice">⚠️ ${esc(res.message)}</div>`;return}
 const items=res.data||[];
 if(!items.length){body.innerHTML='<p class="muted">לא נמצאו המלצות כרגע.</p>';return}
 body.innerHTML=items.map(s=>{const r=recipes.find(x=>x.name===s.name);const miss=r?missingFor(r,inv):(s.missing||[]);
  return `<div class="sugCard"><h3>${esc(s.name)}</h3><p>${esc(s.reason||'')}</p>${miss.length?`<div>חסר: ${miss.map(m=>`<span class="badge">${esc(m)}</span>`).join('')}</div>`:'<div><span class="badge ok">✅ יש את כל המרכיבים</span></div>'}${r?`<div class="row" style="margin-top:8px"><button class="primary" data-cook="${r.id}">לבישול</button></div>`:''}</div>`}).join('');
 body.querySelectorAll('[data-cook]').forEach(b=>b.onclick=()=>{dlg.close();startCook(b.dataset.cook)});
}
const SYN=[['עגבניות','עגבניה'],['בצלים','בצל'],['גזרים','גזר'],['תפוחי אדמה','תפוח אדמה'],['ביצים','ביצה'],['מלפפונים','מלפפון'],['פלפלים','פלפל'],['קישואים','קישוא'],['חצילים','חציל'],['פטריות','פטריה'],['שומים','שום'],['תפוזים','תפוז']];
const normQ=s=>{let t=String(s||'').toLowerCase().trim();SYN.forEach(([pl,sn])=>{t=t.split(pl).join(sn)});return t};
async function smartSearch(){
 const q=($('#libSearch')?.value||'').trim();if(!q)return toast('כתבו שאילתה לחיפוש חכם');
 const box=$('#smartBox');if(!box)return;box.innerHTML='<p class="muted"><span class="spin">⏳</span> מחפש חכם...</p>';
 const res=await apiAI('smartsearch',{query:q,recipes:recipes.map(r=>({name:r.name,ingredients:r.ingredients}))});
 if(!res.ok){box.innerHTML=`<div class="notice">⚠️ ${esc(res.message)}</div>`;return}
 const items=res.data||[];
 if(!items.length){box.innerHTML='<p class="muted">החיפוש החכם לא מצא התאמה. נסו ניסוח אחר.</p>';return}
 box.innerHTML='<h3>✨ תוצאות חיפוש חכם</h3>'+items.map(s=>{const r=recipes.find(x=>x.name===s.name);
  return `<div class="sugCard"><h3>${esc(s.name)}</h3><p class="muted">${esc(s.reason||'')}</p>${r?`<div class="row"><button class="primary" data-scook="${r.id}">לבישול</button><button data-sopen="${r.id}">פתיחה</button></div>`:''}</div>`}).join('');
 box.querySelectorAll('[data-scook]').forEach(b=>b.onclick=()=>startCook(b.dataset.scook));
 box.querySelectorAll('[data-sopen]').forEach(b=>b.onclick=()=>openEditor(b.dataset.sopen));
}
async function findSubstitutes(){
 const inp=$('#subInput'),box=$('#subResult');if(!inp||!box)return;
 const ing=inp.value.trim();if(!ing)return toast('כתבו מרכיב לחיפוש תחליף');
 const r=recipes.find(x=>x.id===$('#recipeForm').id.value);
 box.innerHTML='<p class="muted"><span class="spin">⏳</span> מחפש תחליפים...</p>';
 const res=await apiAI('substitute',{ingredient:ing,recipeName:r?.name});
 if(!res.ok){box.innerHTML=`<div class="notice">⚠️ ${esc(res.message)}</div>`;return}
 const subs=(res.data&&res.data.substitutes)||[];
 box.innerHTML=subs.length?`<ul>${subs.map(s=>`<li><b>${esc(s.name)}</b> <span class="muted">${esc(s.amount||'')}</span> — ${esc(s.note||'')}</li>`).join('')}</ul>`:'<p class="muted">לא נמצאו תחליפים.</p>';
}
async function updateMissBox(){
 const box=$('#missBox');if(!box||!$('#recipeDialog')?.open)return;
 const inv=await getInventory();if(!inv.length){box.innerHTML='';return}
 const ta=$('#recipeForm')?.ingredients;const lines=String(ta?.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
 const miss=missingFor({ingredients:lines},inv);
 box.innerHTML=miss.length?`<div class="notice">🧺 חסר במלאי: ${miss.map(m=>`<span class="badge">${esc(m)}</span>`).join(' ')}</div>`:'<div><span class="badge ok">✅ כל המרכיבים יש במלאי</span></div>';
}
async function aiParseScan(){
 const ta=$('#scanForm')?.raw;const raw=(ta?.value||'').trim();if(!raw)return toast('הדביקו או הקלידו טקסט קודם');
 const btn=$('#scanAiBtn');if(btn){btn.disabled=true;btn.textContent='⏳ מנתח...'}
 const res=await apiAI('parse',{text:raw});
 if(btn){btn.disabled=false;btn.textContent='✨ ניתוח חכם של הטקסט'}
 if(!res.ok){toast(res.message);return}
 const d=res.data||{};$('#scanDialog').close();
 openEditor(null,{name:String(d.name||'מתכון חדש'),category:['פרווה','חלבי','בשרי','קינוח','אחר'].includes(d.category)?d.category:'אחר',minutes:+d.minutes||30,ingredients:Array.isArray(d.ingredients)?d.ingredients.map(String):[],steps:Array.isArray(d.steps)?d.steps.map(String):[],notes:String(d.notes||'')});
 toast('הטקסט פורק למתכון — בדקו ותקנו לפני שמירה');
}
document.addEventListener('input',e=>{if(e.target&&e.target.name==='ingredients'&&$('#recipeDialog')?.open)updateMissBox()});
window.addEventListener('hashchange',()=>render());window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
(async()=>{await DB.open();await refresh();cook=(await DB.state('cook'))?.value||null;if('serviceWorker'in navigator)navigator.serviceWorker.register('./6-sw.js');render()})();
