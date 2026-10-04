/* Tavlin v73: tap-to-start timers + recipe flow view. Original code, no third-party content. */
(function(){
const H=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=s=>parseFloat(String(s).replace(',','.'));
const UNIT={'דקות':60,'דקה':60,'שעות':3600,'שעה':3600,'שניות':1,'שנייה':1,'שניה':1};
/* Order matters: longest patterns first. */
const DUR=/(חצי שעה|רבע שעה|שעה וחצי|שעתיים|שלוש שעות|(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(דקות|דקה|שעות|שעה|שניות|שנייה|שניה)|(?<![\u05d0-\u05ea\d])דקה(?![\u05d0-\u05ea]))/g;
function parseDur(m,a,b,u){
  if(m==='חצי שעה')return 1800;if(m==='רבע שעה')return 900;if(m==='שעה וחצי')return 5400;if(m==='שעתיים')return 7200;if(m==='שלוש שעות')return 10800;
  if(a){return Math.round(num(a)*UNIT[u])}
  return 60;
}
function label(sec){if(sec>=3600){const h=Math.floor(sec/3600),m=Math.round((sec%3600)/60);return m?`${h} שע׳ ${m} דק׳`:`${h} שע׳`}if(sec>=60){const m=Math.floor(sec/60),s=sec%60;return s?`${m}:${String(s).padStart(2,'0')} דק׳`:`${m} דק׳`}return `${sec} שנ׳`}
/* Returns safe HTML: text escaped, durations wrapped in tap-to-start buttons. */
window.timerize=function(text){
  const t=String(text==null?'':text);let out='',last=0,m;DUR.lastIndex=0;
  while((m=DUR.exec(t))){
    const sec=parseDur(m[1],m[2],m[3],m[4]);if(!(sec>0&&sec<=86400))continue;
    out+=H(t.slice(last,m.index))+`<button type="button" class="durBtn" data-sec="${sec}" data-label="${H(m[0])}" title="הפעלת טיימר ל-${label(sec)}">⏱ ${H(m[0])}</button>`;
    last=m.index+m[0].length;
  }
  return out+H(t.slice(last));
};
window.stepSeconds=function(text){const t=String(text||'');let s=0,m;DUR.lastIndex=0;while((m=DUR.exec(t))){s+=parseDur(m[1],m[2],m[3],m[4])}return s};

/* ---- timer manager (absolute end times, survives reload) ---- */
const KEY='tavlin-timers';let timers=[];try{timers=JSON.parse(localStorage.getItem(KEY)||'[]').filter(x=>x&&x.end)}catch{timers=[]}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(timers))}catch{}};
let bar=null,iv=null,audio=null;
const fmt=n=>{n=Math.max(0,n);const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0')};
function ensureBar(){if(bar)return bar;bar=document.createElement('div');bar.id='timerDock';bar.setAttribute('popover','manual');bar.setAttribute('aria-live','polite');document.body.append(bar);
  bar.addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(!b)return;const id=b.dataset.t,t=timers.find(x=>x.id===id);if(!t)return;
    if(b.dataset.a==='x'){timers=timers.filter(x=>x.id!==id)}
    else if(b.dataset.a==='p'){if(t.paused){t.end=Date.now()+t.left*1000;t.paused=false}else{t.left=Math.max(0,Math.ceil((t.end-Date.now())/1000));t.paused=true}}
    else if(b.dataset.a==='m'){if(t.paused)t.left+=60;else t.end+=60000;t.done=false}
    save();draw()});return bar}
function raise(){if(!bar||!timers.length)return;try{bar.hidePopover();bar.showPopover()}catch{}}
function draw(){
  if(!timers.length){if(bar){try{bar.hidePopover()}catch{}bar.innerHTML=''}clearInterval(iv);iv=null;return}
  ensureBar();const now=Date.now();
  bar.innerHTML=timers.map(t=>{const left=t.paused?t.left:Math.ceil((t.end-now)/1000),done=!t.paused&&left<=0;
    return `<div class="tdRow${done?' tdDone':''}"><b class="tdTime">${done?'הסתיים!':fmt(left)}</b><span class="tdLbl">${H(t.label)}</span><button data-t="${t.id}" data-a="p" aria-label="${t.paused?'המשך':'השהיה'}">${t.paused?'▶':'⏸'}</button><button data-t="${t.id}" data-a="m" aria-label="דקה נוספת">+1</button><button data-t="${t.id}" data-a="x" aria-label="סגירה">✕</button></div>`}).join('');
  if(!bar.matches(':popover-open'))raise();
  if(!iv)iv=setInterval(tickTimers,500);
}
function beep(){let on=true;try{on=JSON.parse(localStorage.getItem('tavlin-settings')||'{}').timerSounds!==false}catch{}
  if(on){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();const c=audio;[0,.3,.6,1.2,1.5,1.8].forEach(d=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.setValueAtTime(.0001,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.35,c.currentTime+d+.02);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d+.22);o.connect(g).connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.25)})}catch{}}
  try{navigator.vibrate&&navigator.vibrate([300,150,300,150,300])}catch{}}
function tickTimers(){const now=Date.now();let changed=false;
  for(const t of timers){if(!t.paused&&!t.done&&t.end<=now){t.done=true;changed=true;beep();
    try{if('Notification'in window&&Notification.permission==='granted')new Notification('תבלין: הטיימר הסתיים',{body:t.label})}catch{}
    const ts=document.getElementById('toast');if(ts){ts.textContent='⏱ הטיימר הסתיים: '+t.label;ts.classList.add('show');setTimeout(()=>ts.classList.remove('show'),5000)}}}
  if(changed)save();draw()}
window.startTimer=function(sec,lbl){
  const id='t'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  timers.push({id,end:Date.now()+sec*1000,total:sec,label:lbl||label(sec),paused:false,left:sec,done:false});save();
  try{if('Notification'in window&&Notification.permission==='default')Notification.requestPermission()}catch{}
  try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume&&audio.resume()}catch{}
  draw();
};
document.addEventListener('click',e=>{const b=e.target.closest('.durBtn');if(!b)return;e.preventDefault();e.stopPropagation();
  const sec=+b.dataset.sec;if(!(sec>0))return;startTimer(sec,(b.dataset.label||'')+' · '+(b.closest('li,.step,.flowCard')?.querySelector('.flowTitle')?.textContent||''));
  const ts=document.getElementById('toast');if(ts){ts.textContent='⏱ טיימר התחיל: '+label(sec);ts.classList.add('show');setTimeout(()=>ts.classList.remove('show'),2500)}},true);
/* keep the dock above freshly opened modal dialogs */
const sm=HTMLDialogElement.prototype.showModal;HTMLDialogElement.prototype.showModal=function(){const r=sm.apply(this,arguments);raise();return r};
window.addEventListener('DOMContentLoaded',()=>{if(timers.length)draw()});if(document.readyState!=='loading'&&timers.length)draw();

/* ---- flow view ---- */
const EMO=[[/בצל/,'🧅'],[/שום/,'🧄'],[/עגבני/,'🍅'],[/ביצ|שקשוק/,'🥚'],[/חמאה/,'🧈'],[/קמח|בצק|לש/,'🌾'],[/סוכר|ממתיק|דבש/,'🍯'],[/שוקולד|קקאו/,'🍫'],[/לימון/,'🍋'],[/עוף|שניצל/,'🍗'],[/בשר|אנטריקוט|קציצ/,'🥩'],[/דג|סלמון/,'🐟'],[/פסטה|ספגטי/,'🍝'],[/אורז/,'🍚'],[/חלב|שמנת/,'🥛'],[/גבינ/,'🧀'],[/תפוח אדמה|תפוחי אדמה|פירה/,'🥔'],[/גזר/,'🥕'],[/פלפל/,'🌶️'],[/שמן|מטגנ|טגנ|מטגן|מחממ/,'🍳'],[/אופ|תנור|אפי/,'🔥'],[/מרתיח|רותח|מבשל|בישול|מבשלים|מתבשל|סיר/,'♨️'],[/ערבב|מערבב|מערבבים|טורפ|מועך/,'🥣'],[/קצוץ|חות|חתכ|מקצצ|פרס/,'🔪'],[/מקרר|קרר|הקפא|מצנן/,'❄️'],[/מגיש|הגשה|מקשט|בתיאבון/,'🍽️'],[/מים/,'💧'],[/תבלינ|מלח|פפריקה|כמון/,'🧂']];
const emo=t=>{for(const [re,e] of EMO)if(re.test(t))return e;return '🍽️'};
const UNITW=new Set(['כוס','כוסות','כף','כפות','כפית','כפיות','גרם','ק"ג','קילו','מ"ל','ליטר','יחידה','יחידות','חבילה','קמצוץ','לפי','טעם','גדול','גדולה','קטן','קטנה','בינוני','שיניים','שן','פרוסות','פרוסה','מעט','קצת','של','עם','או','ללא']);
function ingKey(s){const ws=String(s).replace(/[\d.,/½¼¾()\-–"׳']/g,' ').split(/\s+/).filter(w=>w.length>=3&&!UNITW.has(w));if(!ws.length)return '';ws.sort((a,b)=>b.length-a.length);let k=ws[0];if(/^[הבלמוכש]/.test(k)&&k.length>4)k=k.slice(1);return k.length>3?k.slice(0,k.length-1):k}
function title(s){const t=String(s).split(/[.,;:]|\s-\s/)[0].trim();const w=t.split(/\s+/).slice(0,4).join(' ');return w.length>26?w.slice(0,26)+'…':w}
window.flowHTML=function(r){
  const steps=r.steps||[],ings=r.ingredients||[],assigned=steps.map(()=>[]),loose=[];
  ings.forEach((ing,i)=>{const k=ingKey(ing);let at=-1;if(k)at=steps.findIndex(s=>String(s).includes(k));if(at<0)loose.push(i);else assigned[at].push(i)});
  let ticks={};try{ticks=JSON.parse(localStorage.getItem('tavlin-ticks-'+r.id)||'{}')}catch{}
  const li=i=>`<label class="flowIng"><input type="checkbox" data-tick="${i}" ${ticks[i]?'checked':''}> <span>${H(ings[i])}</span></label>`;
  let out='';
  if(loose.length)out+=`<div class="flowNode"><article class="flowCard flowPrep"><div class="flowEmoji">🧺</div><h3 class="flowTitle">מכינים מראש</h3></article><div class="flowIngs">${loose.map(li).join('')}</div></div>`;
  steps.forEach((s,i)=>{const sec=window.stepSeconds(s);
    if(i>0||loose.length)out+=`<div class="flowArrow" aria-hidden="true"><span>${(i>0&&window.stepSeconds(steps[i-1]))?'⏱ '+label(window.stepSeconds(steps[i-1])):''}</span></div>`;
    out+=`<div class="flowNode"><article class="flowCard"><div class="flowEmoji">${emo(s)}</div><span class="flowNum">שלב ${i+1}</span><h3 class="flowTitle">${H(title(s))}</h3><p>${window.timerize(s)}</p></article>${assigned[i].length?`<div class="flowIngs">${assigned[i].map(li).join('')}</div>`:''}</div>`});
  return `<div class="flowWrap${(window.matchMedia&&matchMedia('(min-width:900px)').matches)?' flowH':''}" data-id="${H(r.id)}">${out}</div>`;
};
document.addEventListener('change',e=>{const c=e.target.closest('[data-tick]');if(!c)return;const w=c.closest('.flowWrap');if(!w)return;const k='tavlin-ticks-'+w.dataset.id;let t={};try{t=JSON.parse(localStorage.getItem(k)||'{}')}catch{}t[c.dataset.tick]=c.checked;try{localStorage.setItem(k,JSON.stringify(t))}catch{}c.closest('.flowIng').classList.toggle('on',c.checked)});
document.addEventListener('click',e=>{const b=e.target.closest('[data-flow-toggle]');if(!b)return;const p=b.closest('.recipeViewPanel');if(!p)return;const f=p.querySelector('#flowView'),l=p.querySelector('#listView');const show=f.hidden;f.hidden=!show;l.hidden=show;b.textContent=show?'📋 תצוגת רשימה':'🧭 תצוגת זרימה';b.setAttribute('aria-pressed',show);const w=p.querySelector('.flowWrap'),d=p.querySelector('[data-flow-dir]');if(w&&d)d.textContent=w.classList.contains('flowH')?'⬍ פריסה אנכית':'⬌ פריסה אופקית'});
document.addEventListener('click',e=>{const b=e.target.closest('[data-flow-dir]');if(!b)return;const w=b.closest('.recipeViewPanel').querySelector('.flowWrap');const h=w.classList.toggle('flowH');b.textContent=h?'⬍ פריסה אנכית':'⬌ פריסה אופקית'});
})();

/* v73d: fit the whole recipe on one tablet screen by shrinking type until nothing overflows (min 15px, max 30px) */
(function(){
 function fit(){const d=document.getElementById('cookDialog');if(!d||!d.open)return;const s=d.querySelector('.recipeSheet');if(!s)return;
  if(!matchMedia('(min-width:700px) and (max-width:1400px)').matches){s.style.removeProperty('--cookFit');return}
  let px=30;s.style.setProperty('--cookFit',px+'px');
  const free=()=>{const r=s.getBoundingClientRect();return d.clientHeight-(r.top-d.getBoundingClientRect().top)-6};
  while(px>15&&(s.scrollHeight>free()||[...s.children].some(c=>c.scrollHeight>c.clientHeight+2&&c.tagName!=='H3'&&c.getBoundingClientRect().bottom>d.getBoundingClientRect().bottom))){px-=1;s.style.setProperty('--cookFit',px+'px')}
  d.style.overflowY=(s.scrollHeight>free())?'auto':'hidden'}
 const t=()=>requestAnimationFrame(fit);
 new MutationObserver(t).observe(document.getElementById('cookContent')||document.body,{childList:true,subtree:true});
 addEventListener('resize',t);addEventListener('orientationchange',t);
})();

/* v73e: fit the flow diagram inside cook mode to one screen by lowering CSS zoom (min .4, max 1.5) */
(function(){
 function fitFlow(){const d=document.getElementById('cookDialog');if(!d||!d.open)return;const b=d.querySelector('.cookFlowBox');if(!b)return;
  const w=b.querySelector('.flowWrap');if(!w)return;
  const top=b.getBoundingClientRect().top-d.getBoundingClientRect().top;const avail=d.clientHeight-top-8;
  let z=1.5;w.style.zoom=z;
  while(z>0.4&&w.scrollHeight*z>avail){z=Math.round((z-0.05)*100)/100;w.style.zoom=z}
  b.style.height=avail+'px'}
 const t=()=>requestAnimationFrame(fitFlow);
 const c=document.getElementById('cookContent');if(c)new MutationObserver(t).observe(c,{childList:true,subtree:true});
 addEventListener('resize',t);addEventListener('orientationchange',t);
})();

/* v73f: night display toggle (cook menu): switches to the night theme and back to the previous one */
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#nightToggle');if(!b)return;
 let o={};try{o=JSON.parse(localStorage.getItem('tavlin-settings')||'{}')}catch{}
 const cur=document.body.dataset.theme||'cream';
 if(cur==='night'){o.theme=(o.prevTheme&&o.prevTheme!=='night')?o.prevTheme:'cream';delete o.prevTheme}else{o.prevTheme=cur;o.theme='night'}
 localStorage.setItem('tavlin-settings',JSON.stringify(o));document.body.dataset.theme=o.theme});
