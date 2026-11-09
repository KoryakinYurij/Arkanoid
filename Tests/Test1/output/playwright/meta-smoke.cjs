const {chromium}=require('C:/Users/Fixed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const url=process.argv[2]||'http://127.0.0.1:5181/';
const mode=url.startsWith('file:')?'offline':'live';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Fixed/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const report={mode};
 const profile=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sideeffect.test1.meta.v1')));
 async function connect(){assert.equal(await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');let fiber=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))];
  while(fiber){let hook=fiber.memoizedState;while(hook){if(hook.memoizedState?.current?.getHud){window.__qaGame=hook.memoizedState.current;return true;}hook=hook.next;}fiber=fiber.return;}return false;
 }),true);}
 try{
 await page.goto(url,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:/Мастерская/}).first().click();
 await page.locator('[data-starter="classic"]').waitFor();
 assert.equal(await page.locator('[data-discovery][data-found="true"]').count(),0);
 assert.equal(await page.locator('[data-starter="ember"]').isDisabled(),true);
 assert.equal(await page.locator('[data-starter="frost"]').isDisabled(),true);
 await page.waitForTimeout(220);await page.screenshot({path:`output/playwright/meta-${mode}-fresh.png`});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Начать игру',exact:true}).click();await connect();
 assert.equal(await page.evaluate(()=>window.__qaGame.getHud().rerolls),0);
 await page.evaluate(()=>{
  const g=window.__qaGame;
  for(const id of ['ball:fire','lvl:fire','ball:bomb','lvl:bomb','fuse:nova'])g.applyCard(id);
  g.bricks=[];g.mk(100,150,200,60,30,'boss');g.kill(g.bricks[0]);g.bricks=[];
  for(let i=0;i<10;i++){g.balls=[];g.spawnBall('normal');const b=g.balls[0];b.x=g.px;b.y=862;b.vx=0;b.vy=540;g.updateBalls(1/60);}
 });
 await page.waitForTimeout(200);
 const earned=await profile();assert.deepEqual(earned.discoveries,['nova']);assert.equal(earned.bestBosses,1);assert.equal(earned.bestPerfects,10);
 assert.equal(await page.evaluate(()=>window.__qaGame.getHud().rerolls),0);
 await page.evaluate(()=>window.__qaGame.gameOver());await page.locator('.result-panel').waitFor();
 await page.waitForTimeout(250);report.resultText=await page.locator('.result-panel').innerText();
 assert.ok(report.resultText.includes('Криолог'));assert.ok(report.resultText.includes('Пиротехник'));
 await page.screenshot({path:`output/playwright/meta-${mode}-result.png`});
 await page.reload();await page.getByRole('button',{name:/Мастерская/}).first().click();
 assert.equal(await page.locator('[data-discovery="nova"]').getAttribute('data-found'),'true');
 await page.locator('[data-starter="ember"]').click();assert.equal((await profile()).selectedStarter,'ember');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Начать игру',exact:true}).click();await connect();
 report.start=await page.evaluate(()=>({balls:window.__qaGame.getLoadout().balls,hud:window.__qaGame.getHud()}));
 assert.deepEqual(report.start.balls,[{kind:'normal',count:3,level:1},{kind:'fire',count:1,level:1}]);assert.equal(report.start.hud.rerolls,1);
 await page.evaluate(()=>{const g=window.__qaGame;g.xp=g.xpNeed;g.sim(0,0);});
 await page.locator('.upgrade').first().waitFor();
 const before=await page.evaluate(()=>window.__qaGame.choices.map(c=>c.id));
 await page.getByRole('button',{name:/Переброс/}).click();await page.waitForTimeout(200);
 const after=await page.evaluate(()=>window.__qaGame.choices.map(c=>c.id));
 assert.ok(after.every(id=>!before.includes(id)));assert.equal(await page.evaluate(()=>window.__qaGame.getHud().rerolls),0);
 assert.equal(await page.getByRole('button',{name:/Переброс/}).isDisabled(),true);
 await page.screenshot({path:`output/playwright/meta-${mode}-reroll.png`});
 await page.locator('.upgrade').first().click();await page.locator('canvas').focus();await page.keyboard.press('KeyR');
 assert.equal(await page.evaluate(()=>window.__qaGame.getHud().rerolls),1);
 assert.equal(await page.evaluate(()=>window.__qaGame.getHud().totalBalls),4);
 await page.evaluate(()=>{
  const g=window.__qaGame;
  for(const [kind,ingredients]of [['nova',['fire','bomb']],['storm',['ice','bolt']],['plague',['poison','fire']],['rail',['drill','bolt']]]){
   for(const ingredient of ingredients){if(!g.arsenal[ingredient].count)g.applyCard('ball:'+ingredient);while(g.arsenal[ingredient].level<2)g.applyCard('lvl:'+ingredient);}
   g.applyCard('fuse:'+kind);
  }
 });await page.waitForTimeout(200);
 assert.equal((await profile()).discoveries.length,4);
 const beforeRepeat=await profile();await page.evaluate(()=>window.__qaGame.emitProgress());assert.deepEqual(await profile(),beforeRepeat);
 await page.keyboard.press('KeyP');await page.getByRole('button',{name:/Мастерская/}).first().click();
 assert.equal(await page.locator('[data-discovery][data-found="true"]').count(),4);
 assert.ok((await page.locator('[role="dialog"]').innerText()).includes('Мастер синтеза'));
 await page.waitForTimeout(220);await page.screenshot({path:`output/playwright/meta-${mode}-complete.png`});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 await page.screenshot({path:`output/playwright/meta-${mode}-mobile.png`});
 const box=await page.locator('canvas').boundingBox();assert.ok(Math.abs(box.width/box.height-540/960)<1e-5);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.__qaGame.screen),'playing');
 report.profile=await profile();report.errors=errors;report.networkRequests=mode==='offline'?requests.length:'development';
 assert.deepEqual(errors,[]);if(mode==='offline')assert.deepEqual(requests,[]);
 fs.writeFileSync(`output/playwright/meta-${mode}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})();
