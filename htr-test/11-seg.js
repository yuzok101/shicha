// Page line segmentation: JS (opencv.js) port of hebocr/page/segment.py from Mishkefet-v1
// by itayinbar (https://huggingface.co/itayinbar/Mishkefet-v1), CC-BY-NC-SA-4.0, non-commercial.
window.MKSeg=(function(){
  function rowSums(m){ const h=m.rows,w=m.cols,d=m.data,p=new Float64Array(h); for(let y=0;y<h;y++){let s=0;const o=y*w;for(let x=0;x<w;x++)s+=d[o+x];p[y]=s;} return p; }
  function flatten(gray){ const s=Math.max(gray.rows,gray.cols)/30; const bg=new cv.Mat(); if(window.MKSEG_FAST){ const f=4, sm=new cv.Mat(), sb=new cv.Mat(); cv.resize(gray,sm,new cv.Size(Math.max(1,Math.round(gray.cols/f)),Math.max(1,Math.round(gray.rows/f))),0,0,cv.INTER_AREA); cv.GaussianBlur(sm,sb,new cv.Size(0,0),s/f,s/f,cv.BORDER_DEFAULT); cv.resize(sb,bg,new cv.Size(gray.cols,gray.rows),0,0,cv.INTER_LINEAR); sm.delete(); sb.delete(); } else cv.GaussianBlur(gray,bg,new cv.Size(0,0),s,s,cv.BORDER_DEFAULT);
    const out=new cv.Mat(gray.rows,gray.cols,cv.CV_8UC1); const g=gray.data,b=bg.data,o=out.data;
    for(let i=0;i<o.length;i++){ const v=Math.fround(Math.fround(g[i]/Math.max(b[i],1))*128); o[i]=v<0?0:v>255?255:v|0; } bg.delete(); return out; }
  function binarize(gray,maxSide){ let scale=Math.min(1,maxSide/Math.max(gray.rows,gray.cols)); let g=gray;
    if(scale<1){ g=new cv.Mat(); cv.resize(gray,g,new cv.Size(0,0),scale,scale,cv.INTER_AREA); }
    const flat=flatten(g); if(g!==gray) g.delete();
    const block=Math.max(15,(Math.floor(Math.min(flat.rows,flat.cols)/40))|1);
    const bin=new cv.Mat(); cv.adaptiveThreshold(flat,bin,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,block,12); flat.delete();
    const k=cv.Mat.ones(2,2,cv.CV_8U); const o=new cv.Mat(); cv.morphologyEx(bin,o,cv.MORPH_OPEN,k); k.delete(); bin.delete(); return [o,scale]; }
  function pyRound(x){ const r=Math.round(x); return (Math.abs(x%1)===0.5 && r%2!==0)? r-1 : r; }
  function lineKernel(len,ang){ const drop=pyRound(Math.tan(ang*Math.PI/180)*(len-1)); const h=Math.abs(drop)+1; const k=cv.Mat.zeros(h,len,cv.CV_8U);
    const y0=drop>=0?0:h-1; cv.line(k,new cv.Point(0,y0),new cv.Point(len-1,y0+drop),new cv.Scalar(1),1); return k; }

  // Fast binary opening with a thin line kernel: kernel = set of horizontal runs; erosion via run-length arrays,
  // dilation via row prefix sums. Same result as cv.morphologyEx(MORPH_OPEN) with default anchor/borders.
  function kernelRuns(k){ const runs=[]; const kw=k.cols,kh=k.rows,d=k.data;
    for(let i=0;i<kh;i++){ let j=0; while(j<kw){ if(d[i*kw+j]){ let e=j; while(e+1<kw&&d[i*kw+e+1]) e++; runs.push([i,j,e]); j=e+1; } else j++; } }
    return {runs,ax:Math.floor(kw/2),ay:Math.floor(kh/2)}; }
  function openRows(src,W,H,K){
    const BIG=1<<30, R=new Int32Array(W*H);
    for(let y=0;y<H;y++){ const o=y*W; let run=BIG; for(let x=W-1;x>=0;x--){ if(src[o+x]){ run=(run>=BIG?BIG:run+1); R[o+x]=run; } else { run=0; R[o+x]=0; } } }
    const runs=[...K.runs].sort((p,q)=>(q[2]-q[1])-(p[2]-p[1])); const n=runs.length;
    const RI=Int32Array.from(runs.map(r=>r[0]-K.ay)), RA=Int32Array.from(runs.map(r=>r[1]-K.ax)), RB=Int32Array.from(runs.map(r=>r[2]-K.ax));
    const out=new Uint8Array(W*H);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){ let ok=1;
      for(let q=0;q<n;q++){ const yy=y+RI[q]; if(yy<0||yy>=H) continue; let s=x+RA[q], e=x+RB[q]; if(e<0||s>=W) continue; if(s<0) s=0;
        const r=R[yy*W+s]; if(r>=BIG) continue; if(e>=W || r<e-s+1){ ok=0; break; } }
      if(!ok) continue;
      // scatter dilation (same offsets as OpenCV: out(x',y') |= E(x'+dx, y'+dy)  =>  out(x-dx, y-dy) for each kernel offset)
      for(let q=0;q<n;q++){ const yy=y-RI[q]; if(yy<0||yy>=H) continue; let s=x-RB[q], e=x-RA[q]; if(e<0||s>=W) continue; if(s<0)s=0; if(e>=W)e=W-1; out.fill(255,yy*W+s,yy*W+e+1); }
    }
    return out; }
  function fastOpen(bin,k,transposed){
    const K=kernelRuns(k); let src=bin, W=bin.cols, H=bin.rows, t=null;
    if(transposed){ t=new cv.Mat(); cv.transpose(bin,t); src=t; W=t.cols; H=t.rows; }
    const o=openRows(src.data,W,H,K); let m=new cv.Mat(H,W,cv.CV_8UC1); m.data.set(o);
    if(transposed){ const mt=new cv.Mat(); cv.transpose(m,mt); m.delete(); t.delete(); m=mt; }
    return m; }
  function removeRules(bin,pitch){ const angles=[-2,-1,-0.4,0,0.4,1,2]; const len=Math.max(40,Math.floor(pitch*2)), th=Math.max(3,Math.floor(pitch*0.28));
    const hor=cv.Mat.zeros(bin.rows,bin.cols,cv.CV_8U), ver=cv.Mat.zeros(bin.rows,bin.cols,cv.CV_8U), tmp=new cv.Mat();
    for(const a of angles){ const k=lineKernel(len,a);
      if(window.MKSEG_FAST){ const h1=fastOpen(bin,k,false); cv.bitwise_or(hor,h1,hor); h1.delete(); const v1=fastOpen(bin,k,true); cv.bitwise_or(ver,v1,ver); v1.delete(); k.delete(); continue; }
      cv.morphologyEx(bin,tmp,cv.MORPH_OPEN,k); cv.bitwise_or(hor,tmp,hor);
      const kt=new cv.Mat(); cv.transpose(k,kt); cv.morphologyEx(bin,tmp,cv.MORPH_OPEN,kt); cv.bitwise_or(ver,tmp,ver); k.delete(); kt.delete(); }
    let out=bin.clone(); const d3=cv.Mat.ones(3,3,cv.CV_8U);
    for(const [runs,ks] of [[hor,new cv.Size(1,th)],[ver,new cv.Size(th,1)]]){ const se=cv.getStructuringElement(cv.MORPH_RECT,ks); const thick=new cv.Mat(); cv.morphologyEx(runs,thick,cv.MORPH_OPEN,se);
      const rules=new cv.Mat(); cv.subtract(runs,thick,rules); const dil=new cv.Mat(); cv.dilate(rules,dil,d3); const o2=new cv.Mat(); cv.subtract(out,dil,o2); out.delete(); out=o2; se.delete(); thick.delete(); rules.delete(); dil.delete(); }
    hor.delete(); ver.delete(); tmp.delete(); d3.delete(); return out; }
  function pitchOf(bin){ const p=rowSums(bin); const n=p.length; let mean=0; for(const v of p) mean+=v; mean/=n; let any=false; for(let i=0;i<n;i++){p[i]-=mean; if(p[i]!==0) any=true;} if(!any) return 30;
    const lo=Math.max(8,Math.floor(n*0.004)), hi=Math.min(n-1,Math.floor(n*0.15)); if(hi<=lo+2) return 30;
    const win=new Float64Array(hi-lo); for(let L=lo;L<hi;L++){ let s=0; for(let i=0;i+L<n;i++) s+=p[i]*p[i+L]; win[L-lo]=s; }
    for(let i=1;i<win.length-1;i++) if(win[i]>win[i-1]&&win[i]>=win[i+1]&&win[i]>0) return lo+i;
    let bi=0; for(let i=1;i<win.length;i++) if(win[i]>win[bi]) bi=i; return lo+bi; }
  function rotate(m,angle,interp,fill){ const M=cv.getRotationMatrix2D(new cv.Point(m.cols/2,m.rows/2),angle,1); const o=new cv.Mat(); cv.warpAffine(m,o,M,new cv.Size(m.cols,m.rows),interp,cv.BORDER_CONSTANT,new cv.Scalar(fill)); M.delete(); return o; }
  function skew(bin){ const small=new cv.Mat(); cv.resize(bin,small,new cv.Size(0,0),0.5,0.5,cv.INTER_AREA); let best=0,bs=-1;
    for(let i=0;i<=24;i++){ const a=-6+0.5*i; const r=rotate(small,a,cv.INTER_NEAREST,0); const p=rowSums(r); r.delete();
      const n=p.length-1; let m=0; for(let j=0;j<n;j++) m+=p[j+1]-p[j]; m/=n; let v=0; for(let j=0;j<n;j++){const d=p[j+1]-p[j]-m; v+=d*d;} v/=n; if(v>bs){bs=v;best=a;} }
    small.delete(); return best; }
  function findLines(bin,pitch){ const sx=Math.max(8,Math.floor(pitch*0.55)), sy=Math.max(1,Math.floor(pitch*0.05));
    const a=new cv.Mat(); let se=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(sx,sy)); cv.dilate(bin,a,se); se.delete();
    se=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(sx,1)); const b=new cv.Mat(); cv.morphologyEx(a,b,cv.MORPH_CLOSE,se); se.delete(); a.delete();
    const lab=new cv.Mat(),st=new cv.Mat(),ce=new cv.Mat(); const n=cv.connectedComponentsWithStats(b,lab,st,ce,8,cv.CV_32S); b.delete();
    const boxes=[]; const S=st.data32S;
    for(let i=1;i<n;i++){ const x=S[i*5],y=S[i*5+1],w=S[i*5+2],h=S[i*5+3],ar=S[i*5+4];
      if(w<pitch*0.8||h<pitch*0.25) continue; if(h>pitch*12) continue; if(ar<pitch*pitch*0.12) continue; boxes.push({x,y,w,h}); }
    lab.delete(); st.delete(); ce.delete(); return boxes; }
  function splitTall(bin,boxes,pitch){ const out=[]; const W=bin.cols,d=bin.data;
    for(const bx of boxes){ const n=pyRound(bx.h/pitch); if(n<=1){out.push(bx);continue;}
      const prof=new Float64Array(bx.h); for(let y=0;y<bx.h;y++){let s=0;const o=(bx.y+y)*W+bx.x;for(let x=0;x<bx.w;x++)s+=d[o+x];prof[y]=s;}
      const K=[0.0625,0.25,0.375,0.25,0.0625], sm=new Float64Array(bx.h); const rf=(i,m)=>{ if(m===1) return 0; while(i<0||i>=m){ if(i<0)i=-i; if(i>=m)i=2*m-2-i;} return i; };
      for(let y=0;y<bx.h;y++){let s=0;for(let t=-2;t<=2;t++) s+=K[t+2]*prof[rf(y+t,bx.h)]; sm[y]=s;}
      const cuts=[0]; for(let k=1;k<n;k++){ const c=Math.floor(k*bx.h/n); const lo=Math.max(cuts[cuts.length-1]+2,c-Math.floor(pitch*0.35)), hi=Math.min(bx.h-2,c+Math.floor(pitch*0.35));
        if(hi>lo){ let bi=lo; for(let i=lo+1;i<hi;i++) if(sm[i]<sm[bi]) bi=i; cuts.push(bi);} } cuts.push(bx.h);
      for(let q=0;q+1<cuts.length;q++){ const top=cuts[q],bot=cuts[q+1]; let r0=-1,r1=-1,c0=1e9,c1=-1;
        for(let y=top;y<bot;y++){ const o=(bx.y+y)*W+bx.x; let rowAny=false; for(let x=0;x<bx.w;x++) if(d[o+x]){ rowAny=true; if(x<c0)c0=x; if(x>c1)c1=x; } if(rowAny){ if(r0<0) r0=y-top; r1=y-top; } }
        if(r0<0||c1<0) continue; out.push({x:bx.x+c0,y:bx.y+top+r0,w:c1-c0+1,h:r1-r0+1}); } }
    return out; }
  function merge(boxes,pitch){ if(!boxes.length) return []; boxes=[...boxes].sort((a,b)=>a.y-b.y||a.x-b.x); const m=[];
    for(const b of boxes){ let placed=false; for(let i=0;i<m.length;i++){ const o=m[i]; const vo=Math.min(b.y+b.h,o.y+o.h)-Math.max(b.y,o.y), sh=Math.min(b.h,o.h), hg=Math.max(b.x,o.x)-Math.min(b.x+b.w,o.x+o.w);
      if(vo>sh*0.5&&hg<pitch*1.2){ const x0=Math.min(b.x,o.x),y0=Math.min(b.y,o.y),x1=Math.max(b.x+b.w,o.x+o.w),y1=Math.max(b.y+b.h,o.y+o.h); m[i]={x:x0,y:y0,w:x1-x0,h:y1-y0}; placed=true; break; } }
      if(!placed) m.push(b); } return m; }
  function order(boxes,pitch){ if(!boxes.length) return []; const s=[...boxes].sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2)); const rows=[[s[0]]];
    for(const b of s.slice(1)){ const c=b.y+b.h/2, row=rows[rows.length-1]; const rc=row.reduce((t,x)=>t+x.y+x.h/2,0)/row.length; if(Math.abs(c-rc)<pitch*0.45) row.push(b); else rows.push([b]); }
    return rows.flatMap(r=>[...r].sort((a,b)=>-(a.x+a.w)+(b.x+b.w))); }
  // gray: cv.Mat CV_8UC1 of the full page. Returns {boxes (page px), angle, work (rotated gray Mat; caller deletes)}
  function segment(gray,maxSide=2000){
    const T={}; let t=performance.now(); const lap=k=>{const n=performance.now(); T[k]=(T[k]||0)+n-t; t=n;}; window.SEGT=T;
    let [bin,scale]=binarize(gray,maxSide); lap('binarize'); const angle=skew(bin); lap('skew'); let work=gray;
    if(Math.abs(angle)>1e-3){ const r=rotate(bin,angle,cv.INTER_NEAREST,0); bin.delete(); bin=r; work=rotate(gray,angle,cv.INTER_CUBIC,255); } lap('rotate');
    let p=pitchOf(bin); lap('pitch'); const nb=removeRules(bin,p); bin.delete(); bin=nb; lap('rules'); p=pitchOf(bin); lap('pitch');
    let boxes=findLines(bin,p); boxes=splitTall(bin,boxes,p); boxes=merge(boxes,p); boxes=order(boxes,p); bin.delete(); lap('lines');
    const inv=scale>0?1/scale:1; boxes=boxes.map(b=>({x:Math.trunc(b.x*inv),y:Math.trunc(b.y*inv),w:Math.trunc(b.w*inv),h:Math.trunc(b.h*inv)}));
    return {boxes,angle,work,pitch:p,scale};
  }
  function crop(work,b,pad=0.12){ const py=Math.trunc(b.h*pad), px=Math.trunc(b.h*0.05); const x0=Math.max(b.x-px,0),y0=Math.max(b.y-py,0),x1=Math.min(b.x+b.w+px,work.cols),y1=Math.min(b.y+b.h+py,work.rows);
    const w=x1-x0,h=y1-y0,g=new Uint8Array(w*h),d=work.data; for(let y=0;y<h;y++) g.set(d.subarray((y0+y)*work.cols+x0,(y0+y)*work.cols+x0+w),y*w); return {g,w,h}; }
  return {segment,crop,fastOpen,lineKernel};
})();
