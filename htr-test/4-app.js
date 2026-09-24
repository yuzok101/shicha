// Mishkefet-v1 by itayinbar, CC BY-NC-SA 4.0, non-commercial. https://huggingface.co/itayinbar/Mishkefet-v1
window.MKSEG_FAST=true;
const $=id=>document.getElementById(id), st=m=>{$('status').textContent=m;};
const R={ua:navigator.userAgent,cores:navigator.hardwareConcurrency,deviceMemoryGB:navigator.deviceMemory||null,crossOriginIsolated:self.crossOriginIsolated,webgpu:!!navigator.gpu,wasmThreads:typeof SharedArrayBuffer!=='undefined'};
$('dev').innerHTML='<pre>'+JSON.stringify(R,null,1)+'</pre>';
const threads=Math.max(1,Math.min(4,(navigator.hardwareConcurrency||2)-1||1));
let S=null,LM=null,CH=null,peakHeap=0;
const heap=()=>{if(performance.memory){const h=performance.memory.usedJSHeapSize/1048576;if(h>peakHeap)peakHeap=h;}};
async function init(){
  if(S) return;
  while(!(window.cv&&cv.Mat)) await new Promise(r=>setTimeout(r,100));
  ort.env.wasm.numThreads=self.crossOriginIsolated?threads:1;
  const t0=performance.now(); st('מוריד מודל...');
  const parts=await Promise.all(['model.part00','model.part01'].map(u=>fetch(u).then(r=>{if(!r.ok)throw Error(u+' '+r.status);return r.arrayBuffer()})));
  const buf=new Uint8Array(parts.reduce((a,b)=>a+b.byteLength,0)); let o=0; for(const p of parts){buf.set(new Uint8Array(p),o);o+=p.byteLength;}
  LM=MKBeam.loadLM(await (await fetch('lm-mc10.bin')).arrayBuffer());
  R.download_ms=Math.round(performance.now()-t0);
  let t1=performance.now(); st('טוען מודל (WASM)...');
  S=await ort.InferenceSession.create(buf,{executionProviders:['wasm']});
  R.session_ms=Math.round(performance.now()-t1); R.threads=ort.env.wasm.numThreads; heap();
  R._buf=buf;
}
async function grayFromBlob(blob){
  const bmp=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'from-image'});
  const f=Math.min(1,2000/Math.max(bmp.width,bmp.height)), W=Math.round(bmp.width*f), H=Math.round(bmp.height*f);
  const c=new OffscreenCanvas(W,H),x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(bmp,0,0,W,H); const d=x.getImageData(0,0,W,H).data;
  const gray=new cv.Mat(H,W,cv.CV_8UC1),g=gray.data; for(let i=0,j=0;i<g.length;i++,j+=4) g[i]=(d[j]*19595+d[j+1]*38470+d[j+2]*7471+0x8000)>>16; return gray;
}
async function recognize(blob,sess){
  const t0=performance.now(); const gray=await grayFromBlob(blob); const t1=performance.now();
  const r=MKSeg.segment(gray); const t2=performance.now(); heap();
  const texts=[]; let inf=0,pre=0,bm=0;
  for(const b of r.boxes){ const cr=MKSeg.crop(r.work,b); let tp=performance.now(); const {a,w}=MK.preprocessGray(cr.g,cr.w,cr.h); pre+=performance.now()-tp;
    const ti=performance.now(); const o=await sess.run({image:new ort.Tensor('float32',a,[1,1,64,w])}); inf+=performance.now()-ti;
    const lp=o.logprobs; const tb=performance.now(); texts.push(MKBeam.beam(lp.data,lp.dims[1],lp.dims[2],Math.max(Math.floor(w/4),1),CH,{lm:LM})); bm+=performance.now()-tb; heap();
    st('שורה '+texts.length+'/'+r.boxes.length); }
  if(r.work!==gray) r.work.delete(); gray.delete();
  const rd=x=>Math.round(x);
  return {lines:r.boxes.length,text:texts.filter(t=>t.trim()).join('\n'),decode_ms:rd(t1-t0),seg_ms:rd(t2-t1),pre_ms:rd(pre),inf_ms:rd(inf),beam_ms:rd(bm),ms_per_line:rd(inf/Math.max(1,r.boxes.length)),total_ms:rd(performance.now()-t0)};
}
function lev(a,b){a=[...a];b=[...b];let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c;}return p[b.length];}
const norm=s=>s.replace(/\s+/g,' ').trim();
function show(){ const r={...R}; delete r._buf; r.peak_js_heap_mb=performance.memory?Math.round(peakHeap):null; $('res').textContent=JSON.stringify(r,null,1); $('copy').hidden=false; }
async function webgpuProbe(page){
  if(!navigator.gpu) return {available:false};
  try{ const t0=performance.now(); const s=await ort.InferenceSession.create(R._buf,{executionProviders:['webgpu']}); const load=performance.now()-t0;
    const x=await recognize(page,s); return {available:true,session_ms:Math.round(load),...x,text:undefined}; }catch(e){ return {available:true,error:String(e).slice(0,200)}; }
}
$('run').onclick=async()=>{ $('run').disabled=true; try{
  await init(); const P=await (await fetch('testpages.json')).json(); CH=P.chars; R.pages=[]; let E=0,N=0;
  for(const pg of P.pages){ st('דף '+(R.pages.length+1)+'/'+P.pages.length);
    const blob=new Blob([Uint8Array.from(atob(pg.b64),c=>c.charCodeAt(0))]); const x=await recognize(blob,S);
    const e=lev(norm(x.text),norm(pg.ref)),n=[...norm(pg.ref)].length; E+=e;N+=n; x.cer=+(e/n).toFixed(3); R.pages.push({...x,text:undefined}); show(); }
  R.cer_micro=+(E/N).toFixed(3); R.mean_page_ms=Math.round(R.pages.reduce((a,b)=>a+b.total_ms,0)/R.pages.length);
  st('בודק WebGPU...'); R.webgpu_probe=await webgpuProbe(new Blob([Uint8Array.from(atob(P.pages[0].b64),c=>c.charCodeAt(0))]));
  st('הסתיים. לחץ "העתק תוצאות" ושלח.'); show();
 }catch(e){ st('שגיאה: '+e); R.error=String(e); show(); } $('run').disabled=false; };
$('own').onchange=async ev=>{ const f=ev.target.files[0]; if(!f) return; try{ await init(); if(!CH) CH=(await (await fetch('testpages.json')).json()).chars;
  const x=await recognize(f,S); $('out').innerHTML='<h3>טיוטה (לעריכה - לא נשמר)</h3><pre style="direction:rtl;text-align:right">'+x.text.replace(/</g,'&lt;')+'</pre>'; R.own_photo={...x,text:undefined}; st('הסתיים'); show(); }catch(e){ st('שגיאה: '+e); } };
$('copy').onclick=()=>navigator.clipboard.writeText($('res').textContent).then(()=>st('הועתק'));
