/* v74: account area (change own password), admin user management, forced password change, and "back to last recipe". Own code. */
(function(){
 const $=s=>document.querySelector(s);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,method='GET',body){const r=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});let j={};try{j=await r.json()}catch{}return {ok:r.ok,status:r.status,data:j}}
 const ERR={wrong_current_password:'הסיסמה הנוכחית לא נכונה',weak_password:'הסיסמה החדשה חייבת להיות לפחות 8 תווים ושונה מהנוכחית',too_many_attempts:'יותר מדי ניסיונות. נסו שוב בעוד כרבע שעה',username_taken:'שם המשתמש כבר קיים',invalid_username:'שם משתמש לא תקין (2-30 תווים)',forbidden:'אין הרשאה',use_change_password:'את הסיסמה שלך משנים באזור האישי'};
 const msg=r=>ERR[r.data&&r.data.error]||'משהו השתבש, נסו שוב';
 function modal(html){const d=document.createElement('dialog');d.className='acctDlg';d.innerHTML=html;document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d}
 function pwForm(forced){
  const d=modal(`<form method="dialog" class="acctForm"><h2>${forced?'קבעו סיסמה חדשה':'החלפת סיסמה'}</h2>${forced?'<p>הסיסמה הזמנית שקיבלתם מתאימה רק לכניסה הראשונה. בחרו סיסמה משלכם.</p>':''}<label>הסיסמה הנוכחית<input type="password" name="cur" autocomplete="current-password" required></label><label>סיסמה חדשה (לפחות 8 תווים)<input type="password" name="np" minlength="8" autocomplete="new-password" required></label><label>שוב את החדשה<input type="password" name="np2" minlength="8" autocomplete="new-password" required></label><p class="acctErr" role="alert"></p><div class="row"><button class="primary" type="submit">שמירה</button>${forced?'':'<button type="button" data-x>ביטול</button>'}</div></form>`);
  if(forced)d.addEventListener('cancel',e=>e.preventDefault());
  d.querySelector('[data-x]')?.addEventListener('click',()=>d.close());
  d.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,er=d.querySelector('.acctErr');
   if(f.np.value!==f.np2.value){er.textContent='שתי הסיסמאות החדשות לא זהות';return}
   const r=await api('/password','POST',{current:f.cur.value,new:f.np.value});
   if(!r.ok){er.textContent=msg(r);return}
   f.cur.value=f.np.value=f.np2.value='';d.close();if(typeof toast==='function')toast('הסיסמה הוחלפה');if(forced)location.reload()});
 }
 function showTemp(name,temp){const d=modal(`<form method="dialog" class="acctForm"><h2>סיסמה זמנית ל${esc(name)}</h2><p>מוצגת פעם אחת בלבד. מסרו אותה למשתמש בדרך בטוחה. בכניסה הראשונה הוא ייבחר סיסמה משלו.</p><output class="tempPw" dir="ltr">${esc(temp)}</output><div class="row"><button type="button" data-copy>📋 העתקה</button><button class="primary" type="submit">סגירה</button></div></form>`);
  d.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(temp);if(typeof toast==='function')toast('הועתק')}catch{}}}
 async function adminList(box){const r=await api('/admin/users');if(!r.ok){box.textContent='';return}
  box.innerHTML=r.data.users.map(u=>`<div class="acctRow"><span>${esc(u.username)}${u.admin?' (מנהל)':''}${u.must_change?' · ממתין לסיסמה חדשה':''}</span>${u.admin?'':`<button type="button" data-reset="${esc(u.id)}" data-name="${esc(u.username)}">איפוס סיסמה</button>`}</div>`).join('');
  box.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{if(!confirm('לאפס את הסיסמה של '+b.dataset.name+'? תיווצר סיסמה זמנית והמשתמש ייצא מהמכשירים שלו.'))return;const x=await api('/admin/users/'+b.dataset.reset+'/reset','POST');if(!x.ok){alert(msg(x));return}showTemp(x.data.user.username,x.data.temp_password);adminList(box)})}
 let me=null;
 async function inject(){const f=$('#settingsForm');if(!f||f.querySelector('#acctArea'))return;if(!me){const r=await api('/me');if(!r.ok)return;me=r.data}
  const s=document.createElement('section');s.id='acctArea';s.className='acctArea';
  s.innerHTML=`<h3>האזור האישי שלי</h3><p>משתמש: <b>${esc(me.user.username)}</b></p><button type="button" id="chgPw">🔑 החלפת סיסמה</button>${me.admin?`<h3>ניהול משתמשים</h3><div id="usersBox"></div><div class="row"><input id="newUserName" placeholder="שם משתמש חדש" maxlength="30" autocomplete="off"><button type="button" id="addUser">➕ הוספת משתמש</button></div><p class="acctErr" id="addErr" role="alert"></p>`:''}`;
  f.append(s);s.querySelector('#chgPw').onclick=()=>pwForm(false);
  if(me.admin){const box=s.querySelector('#usersBox');adminList(box);s.querySelector('#addUser').onclick=async()=>{const n=s.querySelector('#newUserName').value.trim(),er=s.querySelector('#addErr');er.textContent='';if(n.length<2){er.textContent=ERR.invalid_username;return}const x=await api('/admin/users','POST',{username:n});if(!x.ok){er.textContent=msg(x);return}s.querySelector('#newUserName').value='';showTemp(x.data.user.username,x.data.temp_password);adminList(box)}}}
 document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#settingsBtn'))setTimeout(inject,50)});
 async function boot(){const r=await api('/me');if(r.ok){me=r.data;if(me.must_change)pwForm(true)}else if(r.status===403&&r.data&&r.data.error==='password_change_required'){pwForm(true)}}
 /* back to last recipe */
 const KEY='tavlin-last-cook';
 function saveLast(){try{if(typeof cook!=='undefined'&&cook&&cook.recipeId)localStorage.setItem(KEY,JSON.stringify({recipeId:cook.recipeId,mode:cook.mode||'whole',detailIndex:cook.detailIndex||0,name:cook.recipeName||'',at:Date.now()}))}catch{}}
 function resumeBtn(){const home=$('.hero');if(!home||document.getElementById('resumeCook'))return;let l=null;try{l=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
  if(!l||typeof recipes==='undefined')return;const r=recipes.find(x=>x.id===l.recipeId);if(!r)return;
  const b=document.createElement('button');b.id='resumeCook';b.type='button';b.className='primary resumeCook';b.textContent='↩ חזרה למתכון האחרון: '+r.name;
  b.onclick=()=>{cook={id:'offline-resume',recipeId:r.id,recipeName:r.name,step:l.detailIndex||0,mode:l.mode,detailIndex:l.detailIndex||0,startedAt:Date.now(),timerTarget:null,timerMinutes:5};showCook()};
  (home.querySelector('.quick')||home).before(b)}
 addEventListener('load',()=>{const o=window.showCook;if(typeof o==='function'&&!o.__lastWrap){const w=function(){const r=o.apply(this,arguments);saveLast();return r};w.__lastWrap=1;window.showCook=w}});
 const root=document.getElementById('app')||document.body;new MutationObserver(()=>resumeBtn()).observe(root,{childList:true,subtree:true});
 document.addEventListener('close',()=>setTimeout(resumeBtn,50),true);document.addEventListener('DOMContentLoaded',boot);if(document.readyState!=='loading')boot();
})();
