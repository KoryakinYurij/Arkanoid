const {chromium}=require('C:/Users/Fixed/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Fixed/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5181/',{waitUntil:'networkidle'});
 console.log(await page.locator('body').innerText());
 await page.screenshot({path:'output/playwright/desktop-menu.png'});
 console.log('ERRORS',JSON.stringify(errors));
 await browser.close();
})();

