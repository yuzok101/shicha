// CTC prefix beam search + char 6-gram LM (stupid backoff), JS port of hebocr.decode.beam_decode.
// Model/LM: itayinbar/Mishkefet-v1, CC-BY-NC-SA-4.0 (non-commercial, share-alike). Attribution required.
(function(root){
  const NEG=-Infinity;
  function lse(a,b){ if(a===NEG) return b; if(b===NEG) return a; const hi=a>b?a:b, lo=a>b?b:a; return hi+Math.log1p(Math.exp(lo-hi)); }
  function fnv(s){ let x=0x811c9dc5; for(let i=0;i<s.length;i++){ x^=s.charCodeAt(i); x=Math.imul(x,0x01000193)>>>0; } return x>>>0; }
  function loadLM(buf){
    const dv=new DataView(buf); if(String.fromCharCode(...new Uint8Array(buf,0,4))!=='MKLM') throw new Error('bad LM');
    const order=dv.getUint32(4,true), n=dv.getUint32(8,true), backoff=dv.getFloat64(12,true), total=dv.getUint32(20,true);
    const keys=new Uint32Array(buf.slice(24,24+4*n)), vals=new Uint32Array(buf.slice(24+4*n,24+8*n));
    function get(s){ const k=fnv(s); let lo=0,hi=n-1; while(lo<=hi){ const m=(lo+hi)>>1, v=keys[m]; if(v===k) return vals[m]; if(v<k) lo=m+1; else hi=m-1; } return 0; }
    const lb=Math.log(backoff); const cache=new Map();
    function logprob(context,ch){
      context=context.slice(-(order-1)); const ck=context+'\u0001'+ch; const c=cache.get(ck); if(c!==undefined) return c;
      let pen=0, r;
      for(let L=context.length;L>=0;L--){ const pre=L?context.slice(context.length-L):''; const num=get(pre+ch);
        if(num){ const den=L?get(pre):total; if(den){ r=pen+Math.log(num/den); break; } } pen+=lb; }
      if(r===undefined) r=pen+Math.log(1/Math.max(total,1));
      if(cache.size>200000) cache.clear(); cache.set(ck,r); return r;
    }
    return {order,n,total,logprob};
  }
  function beam(lp,T,C,valid,chars,opt){
    opt=opt||{}; const W=opt.beamWidth||12, K=opt.topK||8, lmw=opt.lmWeight??0.4, lb=opt.lengthBonus??0.6, lm=opt.lm||null;
    T=Math.min(T,valid); let beams=new Map([['',[0,NEG]]]);
    const idx=new Int32Array(C);
    for(let t=0;t<T;t++){
      const off=t*C; for(let c=0;c<C;c++) idx[c]=c;
      // top-K by value (descending), ties by lower index like torch.topk is not guaranteed; fine
      const top=Array.from(idx).sort((a,b)=>lp[off+b]-lp[off+a]).slice(0,K);
      const next=new Map();
      for(const [prefix,[pb,pnb]] of beams){
        const pt=lse(pb,pnb);
        for(const index of top){
          const p=lp[off+index];
          if(index===0){ let e=next.get(prefix); if(!e){e=[NEG,NEG];next.set(prefix,e);} e[0]=lse(e[0],pt+p); continue; }
          const ch=chars[index]; let from;
          if(prefix && ch===prefix[prefix.length-1]){ let e=next.get(prefix); if(!e){e=[NEG,NEG];next.set(prefix,e);} e[1]=lse(e[1],pnb+p); from=pb; } else from=pt;
          if(from===NEG) continue;
          const ext=prefix+ch; const bonus=lm?(lmw*lm.logprob(prefix,ch)+lb):0;
          let e=next.get(ext); if(!e){e=[NEG,NEG];next.set(ext,e);} e[1]=lse(e[1],from+p+bonus);
        }
      }
      const arr=[...next.entries()].map(kv=>[kv[0],kv[1],lse(kv[1][0],kv[1][1])]);
      arr.sort((a,b)=>b[2]-a[2]);
      beams=new Map(arr.slice(0,W).map(x=>[x[0],x[1]]));
      if(!beams.size) beams=new Map([['',[0,NEG]]]);
    }
    let best='',bs=NEG; for(const [k,v] of beams){ const s=lse(v[0],v[1]); if(s>bs){bs=s;best=k;} } return best;
  }
  const api={loadLM,beam,fnv}; if(typeof module!=='undefined') module.exports=api; else root.MKBeam=api;
})(typeof window!=='undefined'?window:globalThis);
