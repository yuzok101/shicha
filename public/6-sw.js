// Tavlin app shell — v79: FAB glass fix (bigger, white 40% glass, versioned mascot).
const CACHE='tavlin-p1-v79';
const CORE=['./','./index.html','./2-style.css?v=79','./3-app.js?v=79','./feature-flow.js?v=77','./feature-users.js?v=77','./voice.js?v=78','./timer-sounds.js?v=78','./meal-planner.js?v=78','./fridge-scan.js?v=78','./ai-recipe.js?v=78','./assets/mascot.webp?v=79','./assets/mascot-blink.webp?v=79','./ocr/tesseract.min.js','./ocr/worker.min.js','./ocr/tesseract-core-simd-lstm.wasm.js','./ocr/tesseract-core-simd-lstm.wasm','./ocr/heb.traineddata.gz','./ocr/eng.traineddata.gz','./htr/recognizer.js','./htr/LICENSE-MODEL.txt','./fonts/PlaypenSansHebrew.ttf','./fonts/Assistant.ttf','./fonts/SecularOne.ttf','./4-manifest.webmanifest','./5-icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(xs=>Promise.all(xs.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 const nav=e.request.mode==='navigate';
 const key=nav?'./index.html':e.request;
 if(nav||url.pathname.endsWith('.html')){
  // HTML: stale-while-revalidate — serve cache instantly, refresh in background.
  e.respondWith(caches.open(CACHE).then(async c=>{
   const hit=await c.match(key);
   const upd=fetch(e.request,{cache:'no-store'}).then(r=>{if(r.ok){const copy=r.clone();c.put(key,copy)}return r}).catch(()=>null);
   e.waitUntil(upd);
   return hit||upd||caches.match('./index.html');
  }));
  return;
 }
 // Static assets (versioned via ?v=): cache-first, populate on miss.
 e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request))));
});
