const puppeteer=require('puppeteer-core');
(async()=>{const b=await puppeteer.launch({protocolTimeout:900000,executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
 const p=await b.newPage(); await p.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:2});
 p.on('pageerror',e=>console.error('pageerror',String(e).slice(0,300))); p.on('console',m=>{if(/rror/.test(m.text()))console.error(m.text().slice(0,200))});
 await p.goto('https://tavlin-htr-test.p0583212053.workers.dev/'); await p.click('#run');
 await p.waitForFunction(()=>/הסתיים|שגיאה/.test(document.getElementById('status').textContent),{timeout:600000,polling:2000});
 console.log(await p.$eval('#status',e=>e.textContent)); console.log(await p.$eval('#res',e=>e.textContent));
 await p.screenshot({path:'/downloads/htr-test-page-live.png',fullPage:false}); await b.close();})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1)});
