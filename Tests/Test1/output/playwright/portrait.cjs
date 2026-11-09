const {chromium}=require('C:/Users/Fixed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const url=process.argv[2]||'http://127.0.0.1:5181/';
const mode=url.startsWith('file:')?'offline':'live';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Fixed/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const report={mode};
 async function checkField(width,height){
  const box=await page.locator('canvas').boundingBox();
  assert.ok(Math.abs(box.width/box.height-540/960)<1e-5,JSON.stringify(box));
  assert.ok(Math.abs(box.x+box.width/2-width/2)<2,JSON.stringify(box));
  assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  return box;
 }
 try{
 await page.goto(url,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Начать игру',exact:true}).waitFor();await page.waitForTimeout(300);
 report.desktop=await checkField(1600,900);
 assert.equal(await page.locator('.arsenal-sidebar').count(),1);assert.equal(await page.locator('.combinations-sidebar').count(),1);
 assert.equal(await page.locator('.combinations-sidebar [data-fusion]').count(),4);
 assert.equal(await page.locator('.combinations-sidebar [data-status="collected"]').count(),0);
 assert.ok(!(await page.locator('.arsenal-sidebar').innerText()).includes('Шторм'));
 await page.screenshot({path:`output/playwright/portrait-${mode}-menu.png`});
 await page.getByRole('button',{name:'Начать игру',exact:true}).click();
 const connected=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');let fiber=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))];
  while(fiber){let hook=fiber.memoizedState;while(hook){if(hook.memoizedState?.current?.getHud){window.__qaGame=hook.memoizedState.current;return true;}hook=hook.next;}fiber=fiber.return;}return false;
 });assert.equal(connected,true);
 assert.ok(Math.abs(await page.evaluate(()=>window.__qaGame.worldWidth)-540)<1e-8);
 await page.mouse.move(report.desktop.x+report.desktop.width*.8,report.desktop.y+report.desktop.height*.7);
 await page.waitForTimeout(130);assert.ok(await page.evaluate(()=>window.__qaGame.px/540>.7));
 await page.evaluate(()=>{const g=window.__qaGame;g.applyCard('ball:fire');g.applyCard('lvl:fire');g.applyCard('ball:bomb');g.applyCard('lvl:bomb');});
 await page.waitForTimeout(200);assert.equal(await page.locator('.combinations-sidebar [data-fusion="nova"]').getAttribute('data-status'),'ready');
 await page.evaluate(()=>{const g=window.__qaGame;g.applyCard('fuse:nova');g.applyCard('pas:dmg');});
 await page.waitForTimeout(300);assert.equal(await page.locator('.combinations-sidebar [data-fusion="nova"]').getAttribute('data-status'),'collected');
 assert.ok((await page.locator('.arsenal-sidebar').innerText()).includes('Нова'));
 assert.ok((await page.locator('.arsenal-sidebar').innerText()).includes('Острые края'));
 await page.screenshot({path:`output/playwright/portrait-${mode}-playing.png`});
 await page.keyboard.press('KeyP');await page.getByRole('heading',{name:'Между ударами.'}).waitFor();
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.__qaGame.screen),'playing');
 await page.setViewportSize({width:950,height:900});await page.waitForTimeout(200);
 report.medium=await checkField(950,900);assert.equal(await page.locator('.arsenal-sidebar').count(),0);assert.equal(await page.locator('.combinations-sidebar').count(),1);
 assert.ok(Math.abs(await page.evaluate(()=>window.__qaGame.worldWidth)-540)<1e-8);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
 report.phone=await checkField(390,844);assert.equal(await page.locator('.combinations-sidebar').count(),0);
 await page.keyboard.press('KeyP');await page.getByRole('button',{name:/Сборка/}).first().click();await page.locator('[role="dialog"] [data-fusion="nova"]').waitFor();
 assert.equal(await page.locator('[role="dialog"] [data-fusion="nova"]').getAttribute('data-status'),'collected');
 await page.waitForTimeout(220);await page.screenshot({path:`output/playwright/portrait-${mode}-mobile-build.png`});
 await page.keyboard.press('Escape');await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.__qaGame.screen),'paused');await page.keyboard.press('Escape');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__qaGame.screen),'playing');
 await page.screenshot({path:`output/playwright/portrait-${mode}-mobile-playing.png`});
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(200);report.small=await checkField(320,568);
 assert.deepEqual(errors,[]);if(mode==='offline')assert.deepEqual(requests,[]);
 report.errors=errors;report.networkRequests=mode==='offline'?requests.length:'development';report.fusionProgress='locked -> ready -> collected';
 fs.writeFileSync(`output/playwright/portrait-${mode}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})();
