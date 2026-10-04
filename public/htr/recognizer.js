// Mishkefet-v1 by itayinbar, CC BY-NC-SA 4.0, non-commercial only.
// https://huggingface.co/itayinbar/Mishkefet-v1 - see LICENSE-MODEL.txt.
// The model and input image stay in the browser. No result is saved automatically.
window.TavlinHTR=(function(){
let pending=null, session=null, chars=null, lm=null;
const base='/htr/';
function loadScript(path){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=base+path;s.onload=resolve;s.onerror=()=>reject(Error('asset_failed:'+path));document.head.appendChild(s)})}
async function init(status){
 if(session)return;
 if(pending)return pending;
 pending=(async()=>{
   status('טוען כלי זיהוי כתב יד...');
   for(const script of ['ort/ort.all.min.js','mk.js','mkbeam.js','seg.js'])await loadScript(script);
   window.MKSEG_FAST=true;window.Module={};await loadScript('opencv.js');
   const started=Date.now();while(!(window.cv&&cv.Mat)){if(Date.now()-started>30000)throw Error('opencv_timeout');await new Promise(r=>setTimeout(r,100))}
   ort.env.wasm.numThreads=self.crossOriginIsolated?Math.max(1,Math.min(4,(navigator.hardwareConcurrency||2)-1||1)):1;
   status('מוריד מודל כתב יד (כ-35MB)...');
   const parts=await Promise.all(['model-g.part00','model-g.part01'].map(async n=>{const r=await fetch(base+n);if(!r.ok)throw Error('model_fetch:'+r.status);return r.arrayBuffer()}));
   const model=new Uint8Array(parts.reduce((n,b)=>n+b.byteLength,0));let offset=0;for(const p of parts){model.set(new Uint8Array(p),offset);offset+=p.byteLength}
   const [cr,lr]=await Promise.all([fetch(base+'chars.json'),fetch(base+'lm-mc10.bin')]);if(!cr.ok||!lr.ok)throw Error('decoder_fetch');
   chars=await cr.json();lm=MKBeam.loadLM(await lr.arrayBuffer());
   status('מכין את המודל, זה עשוי לקחת זמן בפעם הראשונה...');
   session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
 })();try{await pending}finally{pending=null}
}
async function gray(blob){
 const bmp=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'from-image'});
 const f=Math.min(1,2000/Math.max(bmp.width,bmp.height)),w=Math.round(bmp.width*f),h=Math.round(bmp.height*f);
 const c=new OffscreenCanvas(w,h),x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(bmp,0,0,w,h);
 const d=x.getImageData(0,0,w,h).data,g=new cv.Mat(h,w,cv.CV_8UC1),o=g.data;
 for(let i=0,j=0;i<o.length;i++,j+=4)o[i]=(d[j]*19595+d[j+1]*38470+d[j+2]*7471+0x8000)>>16;
 bmp.close?.();return g;
}
async function recognize(file,status){
 await init(status);const g=await gray(file);let work=null;
 try{
   const segmented=MKSeg.segment(g);work=segmented.work;
   if(!segmented.boxes.length)return {text:'',lines:0,quality:{reason:'no_lines'}};
   const texts=[],signals=[];
   for(const b of segmented.boxes){const crop=MKSeg.crop(work,b),{a,w}=MK.preprocessGray(crop.g,crop.w,crop.h);
     const out=await session.run({image:new ort.Tensor('float32',a,[1,1,64,w])}),lp=out.logprobs;
     const valid=Math.min(lp.dims[1],Math.max(Math.floor(w/4),1)),columns=lp.dims[2];let peak=0,margin=0,active=0,invalid=false;
     for(let t=0;t<valid;t++){let best=-Infinity,second=-Infinity,idx=-1;for(let j=0;j<columns;j++){const v=lp.data[t*columns+j];if(!Number.isFinite(v)){invalid=true;continue}if(v>best){second=best;best=v;idx=j}else if(v>second)second=v}if(idx!==0){peak+=Math.exp(best);margin+=best-second;active++}}
     signals.push({frames:valid,active,peak:active?peak/active:0,margin:active?margin/active:0,invalid});
     texts.push(MKBeam.beam(lp.data,lp.dims[1],lp.dims[2],valid,chars,{lm}));
     status('זוהתה שורה '+texts.length+' מתוך '+segmented.boxes.length+'...');
   }
   const text=texts.filter(x=>x.trim()).join('\n'),letters=[...text].filter(x=>/\p{L}/u.test(x)),hebrew=letters.filter(x=>/[\u0590-\u05ff]/.test(x));
   const quality={lineCount:texts.filter(x=>x.trim()).length,characters:text.length,hebrewRatio:letters.length?hebrew.length/letters.length:0,peak:signals.length?signals.reduce((sum,x)=>sum+x.peak,0)/signals.length:0,margin:signals.length?signals.reduce((sum,x)=>sum+x.margin,0)/signals.length:0,invalid:signals.some(x=>x.invalid)};
   return {text,lines:segmented.boxes.length,quality};
 }finally{if(work&&work!==g)work.delete();g.delete()}
}
return {recognize};
})();
