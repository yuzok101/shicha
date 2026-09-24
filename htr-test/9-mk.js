// Mishkefet-v1 browser harness: JS port of hebocr preprocess + greedy CTC.
// Model: itayinbar/Mishkefet-v1 (CC-BY-NC-SA-4.0), int8 ONNX export.
window.MK = (function(){
  async function decodeGray(bytes){
    const bmp = await createImageBitmap(new Blob([bytes]), {colorSpaceConversion:'none', premultiplyAlpha:'none'});
    const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d');
    x.drawImage(bmp,0,0); const d = x.getImageData(0,0,bmp.width,bmp.height).data;
    const g = new Uint8Array(bmp.width*bmp.height);
    for (let i=0,j=0;i<g.length;i++,j+=4) g[i] = (d[j]*19595 + d[j+1]*38470 + d[j+2]*7471 + 0x8000) >> 16;
    return {g, w:bmp.width, h:bmp.height};
  }
  function gaussKernel(sigma){
    let n = Math.round(sigma*3*2+1) | 1; const k = new Float64Array(n); let s=0;
    for (let i=0;i<n;i++){ const x=i-(n-1)/2; k[i]=Math.exp(-x*x/(2*sigma*sigma)); s+=k[i]; }
    for (let i=0;i<n;i++) k[i]/=s; return k;
  }
  function refl101(i,n){ if(n===1) return 0; while(i<0||i>=n){ if(i<0) i=-i; if(i>=n) i=2*n-2-i; } return i; }
  function blur(g,w,h,sigma){
    const k=gaussKernel(sigma), n=k.length, r=(n-1)/2, kf=Float32Array.from(k);
    const tmp=new Float32Array(w*h), out=new Uint8Array(w*h);
    const row=new Float32Array(w+2*r);
    for(let y=0;y<h;y++){ const o=y*w;
      for(let x=-r;x<w+r;x++) row[x+r]=g[o+refl101(x,w)];
      for(let x=0;x<w;x++){ let s=0; for(let t=0;t<n;t++) s+=kf[t]*row[x+t]; tmp[o+x]=s; } }
    const col=new Float32Array((h+2*r)*w);
    for(let y=-r;y<h+r;y++){ const src=refl101(y,h)*w, dst=(y+r)*w; col.set(tmp.subarray(src,src+w),dst); }
    const acc=new Float32Array(w);
    for(let y=0;y<h;y++){ acc.fill(0);
      for(let t=0;t<n;t++){ const kv=kf[t], base=(y+t)*w; for(let x=0;x<w;x++) acc[x]+=kv*col[base+x]; }
      const o=y*w; for(let x=0;x<w;x++){ const v=Math.round(acc[x]); out[o+x]=v<0?0:v>255?255:v; } }
    return out;
  }
  function percentile(sorted,p){ const idx=p/100*(sorted.length-1), lo=Math.floor(idx), hi=Math.ceil(idx); return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo); }
  function contrast(g,w,h){
    const b=blur(g,w,h,Math.max(h/8,3)); const f=new Float32Array(w*h);
    for(let i=0;i<f.length;i++) f[i]=Math.fround(g[i]/Math.max(b[i],1e-3));
    const s=Float32Array.from(f).sort(); const lo=percentile(s,2), hi=percentile(s,98);
    const o=new Uint8Array(w*h); if(hi-lo<1e-6){o.fill(255);return o;}
    for(let i=0;i<f.length;i++){ let v=Math.fround(Math.fround(Math.fround(f[i]-lo)/Math.fround(hi-lo))*255); v=Math.min(255,Math.max(0,v)); o[i]=v|0; }
    return o;
  }
  function areaTab(ssize,dsize,scale){
    const tab=[]; for(let dx=0;dx<dsize;dx++){ const fsx1=dx*scale, fsx2=fsx1+scale, cw=Math.min(scale, ssize-fsx1);
      let sx1=Math.ceil(fsx1), sx2=Math.floor(fsx2); sx2=Math.min(sx2,ssize-1); sx1=Math.min(sx1,sx2); const e=[];
      if(sx1-fsx1>1e-3) e.push([sx1-1,(sx1-fsx1)/cw]);
      for(let s=sx1;s<sx2;s++) e.push([s,1/cw]);
      if(fsx2-sx2>1e-3) e.push([sx2,Math.min(Math.min(fsx2-sx2,1),cw)/cw]);
      tab.push(e);} return tab;
  }
  function linTab(ssize,dsize,scale){
    const tab=[]; for(let dx=0;dx<dsize;dx++){ let fx=(dx+0.5)*scale-0.5, sx=Math.floor(fx); fx-=sx;
      if(sx<0){fx=0;sx=0;} if(sx>=ssize-1){fx=0;sx=ssize-1;} tab.push(sx+1<ssize?[[sx,1-fx],[sx+1,fx]]:[[sx,1]]);} return tab;
  }
  function resize(g,w,h,nw,nh,area){
    const tx=(area?areaTab:linTab)(w,nw,w/nw), ty=(area?areaTab:linTab)(h,nh,h/nh);
    const tmp=new Float64Array(w*nh);
    for(let dy=0;dy<nh;dy++) for(const [sy,wy] of ty[dy]) for(let x=0;x<w;x++) tmp[dy*w+x]+=wy*g[sy*w+x];
    const o=new Uint8Array(nw*nh);
    for(let dy=0;dy<nh;dy++) for(let dx=0;dx<nw;dx++){ let s=0; for(const [sx,wx] of tx[dx]) s+=wx*tmp[dy*w+sx]; o[dy*nw+dx]=Math.min(255,Math.max(0,Math.round(s))); }
    return o;
  }
  function pyRound(x){ const r=Math.round(x); return (Math.abs(x%1)===0.5 && r%2!==0) ? r-1 : r; }
  async function preprocess(bytes){
    const {g,w,h}=await decodeGray(bytes); const c=contrast(g,w,h);
    const scale=64/Math.max(h,1); let nw=pyRound(w*scale); nw=Math.max(16,Math.min(nw,2560));
    const r=resize(c,w,h,nw,64,scale<1); const a=new Float32Array(nw*64);
    for(let i=0;i<a.length;i++) a[i]=1-r[i]/255; return {a,w:nw};
  }
  function preprocessGray(g,w,h){ const c=contrast(g,w,h); const scale=64/Math.max(h,1); let nw=pyRound(w*scale); nw=Math.max(16,Math.min(nw,2560)); const r=resize(c,w,h,nw,64,scale<1); const a=new Float32Array(nw*64); for(let i=0;i<a.length;i++) a[i]=1-r[i]/255; return {a,w:nw}; }
  function greedy(lp,T,C,valid,chars){
    let out='',prev=-1; for(let t=0;t<Math.min(T,valid);t++){ let bi=0,bv=-Infinity; for(let c=0;c<C;c++){const v=lp[t*C+c]; if(v>bv){bv=v;bi=c;}}
      if(bi!==prev && bi!==0) out+=chars[bi]; prev=bi; } return out;
  }
  async function run(modelBytes, bundle, opts){
    opts=opts||{}; ort.env.wasm.numThreads=opts.threads||1;
    const t0=performance.now(); const sess=await ort.InferenceSession.create(modelBytes,{executionProviders:['wasm']}); const load=performance.now()-t0;
    const res=[];
    for(const L of bundle.lines){
      const bytes=Uint8Array.from(atob(L.b64),c=>c.charCodeAt(0));
      const tp=performance.now(); const {a,w}=await preprocess(bytes); const pre=performance.now()-tp;
      const ti=performance.now(); const o=await sess.run({image:new ort.Tensor('float32',a,[1,1,64,w])}); const inf=performance.now()-ti;
      const lp=o.logprobs; const [,T,C]=lp.dims; const hyp=greedy(lp.data,T,C,Math.max(Math.floor(w/4),1),bundle.chars);
      let sum=0; for(let i=0;i<a.length;i++) sum+=a[i];
      res.push({i:L.i,hyp,w,pre_ms:pre,inf_ms:inf,sum});
    }
    const mem = performance.memory ? {usedJSHeapMB:performance.memory.usedJSHeapSize/1048576,totalJSHeapMB:performance.memory.totalJSHeapSize/1048576} : null;
    return {load_ms:load,threads:ort.env.wasm.numThreads,ua:navigator.userAgent,hc:navigator.hardwareConcurrency,devmem:navigator.deviceMemory||null,mem,res};
  }
  return {run,preprocess,preprocessGray};
})();
