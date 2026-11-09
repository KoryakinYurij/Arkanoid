const {chromium}=require('C:/Users/Fixed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Fixed/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const report={};
 try{
 await page.goto('http://127.0.0.1:5181/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Начать игру',exact:true}).click();
 await page.locator('canvas').focus();
 await page.waitForTimeout(700);
 const connected=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');
  let fiber=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))];
  while(fiber){let hook=fiber.memoizedState;while(hook){if(hook.memoizedState?.current?.getHud){window.__qaGame=hook.memoizedState.current;return true;}hook=hook.next;}fiber=fiber.return;}return false;
 });
 assert.equal(connected,true);
 report.initial=await page.evaluate(()=>window.__qaGame.getHud());
 assert.equal(report.initial.totalBalls,5);
 const size=await page.locator('canvas').boundingBox();assert.equal(size.width,1600);assert.equal(size.height,900);
 await page.screenshot({path:'output/playwright/desktop-playing.png'});
 // Real pointer control and keyboard slow-motion.
 await page.mouse.move(1300,700);
 await page.waitForTimeout(120);
 assert.ok(await page.evaluate(()=>window.__qaGame.px/window.__qaGame.worldWidth>.7));
 await page.keyboard.down('Shift'); await page.waitForTimeout(180);
 assert.ok(await page.evaluate(()=>window.__qaGame.timeScale<.8));
 await page.keyboard.up('Shift');
 await page.keyboard.press('KeyP');
 await page.getByRole('heading',{name:'Между ударами.'}).waitFor().catch(async()=>{assert.equal(await page.evaluate(()=>window.__qaGame.screen),'paused');});
 report.pause=await page.evaluate(()=>window.__qaGame.screen);assert.equal(report.pause,'paused');
 // Settings is opened from the paused game; closing must not silently resume it.
 const settings=page.getByRole('button',{name:'Настройки',exact:true});await settings.click();
 await page.getByRole('heading',{name:'Твой ритм.'}).waitFor().catch(()=>{});
 await page.screenshot({path:'output/playwright/desktop-settings.png'});
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.__qaGame.screen),'paused');
 await page.locator('canvas').focus();await page.keyboard.press('KeyP');
 assert.equal(await page.evaluate(()=>window.__qaGame.screen),'playing');
 // Drive actual engine progression rather than duplicating card logic in the test.
 await page.evaluate(()=>{const g=window.__qaGame;g.xp=g.xpNeed;g.sim(0,0);});
 await page.locator('.upgrade').first().waitFor();assert.equal(await page.locator('.upgrade').count(),3);
 await page.screenshot({path:'output/playwright/desktop-upgrade.png'});
 await page.locator('.upgrade').first().click();
 assert.equal(await page.evaluate(()=>window.__qaGame.screen),'playing');
 // The real boss renderer and every damage status can share the wide arena.
 await page.evaluate(()=>{const g=window.__qaGame;g.bricks=[];g.rowIndex=13;g.spawnRow(160);const boss=g.bricks.find(b=>b.type==='boss');boss.frozen=4;boss.burn=4;boss.poison=4;boss.pStacks=3;});
 await page.waitForTimeout(70);await page.screenshot({path:'output/playwright/desktop-boss.png'});
 // Freeze final score and persist/rename via real result UI.
 await page.evaluate(()=>{const g=window.__qaGame;g.score=12345;g.gameOver();});
 await page.locator('.result-panel').waitFor();
 const input=page.locator('.result-panel input');await input.fill('ТЕСТ');
 await input.press('KeyR');assert.equal(await page.evaluate(()=>window.__qaGame.screen),'gameover');
 report.saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sideeffect.test1.scores.v1'))[0]);
 assert.equal(report.saved.score,12345);
 await page.screenshot({path:'output/playwright/desktop-result.png'});
 // Rotation preserves the run, fills viewport and leaves panels scrollable.
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(120);await page.screenshot({path:'output/playwright/mobile-result.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 report.mobileCanvas=await page.locator('canvas').boundingBox();assert.equal(report.mobileCanvas.height,844);
 await page.getByRole('button',{name:'Ещё одна попытка',exact:true}).click();
 await page.waitForTimeout(100);
 await page.screenshot({path:'output/playwright/mobile-playing.png'});
 report.errors=errors;assert.deepEqual(errors,[]);
 fs.writeFileSync('output/playwright/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})();

