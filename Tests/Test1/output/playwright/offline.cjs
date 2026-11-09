const {chromium}=require('C:/Users/Fixed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Fixed/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 try{
 await page.goto('file:///D:/Code%20AI/Games/Arkanoid/Tests/Test1/Side%20Effect.html');
 await page.getByRole('button',{name:'Начать игру',exact:true}).waitFor();await page.waitForTimeout(300);
 await page.screenshot({path:'output/playwright/final-menu-desktop.png'});
 await page.getByRole('button',{name:/Настройки/}).click();
 const switches=page.getByRole('checkbox');await switches.nth(1).uncheck();await switches.nth(2).check();
 await page.keyboard.press('Escape');await page.reload();
 await page.getByRole('button',{name:/Настройки/}).click();
 assert.equal(await page.getByRole('checkbox').nth(1).isChecked(),false);
 assert.equal(await page.getByRole('checkbox').nth(2).isChecked(),true);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Начать игру',exact:true}).click();await page.waitForTimeout(600);
 assert.equal(await page.locator('.game-tools').count(),1);
 await page.screenshot({path:'output/playwright/final-game-desktop.png'});
 await page.getByRole('button',{name:'Пауза',exact:true}).click();await page.waitForTimeout(200);
 await page.screenshot({path:'output/playwright/final-pause.png'});
 await page.getByRole('button',{name:'Главное меню',exact:true}).click();
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
 await page.screenshot({path:'output/playwright/final-menu-small.png'});
 await page.getByRole('button',{name:'Начать игру',exact:true}).click();await page.waitForTimeout(150);
 await page.screenshot({path:'output/playwright/final-game-small.png'});
 const canvas=await page.locator('canvas').boundingBox();assert.equal(canvas.width,320);assert.equal(canvas.height,568);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={offline:true,networkRequests:requests,pageErrors:errors,settingsPersist:true,smallViewport:canvas};
 fs.writeFileSync('output/playwright/offline-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})();
