import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "D:/Code AI/Games/Arkanoid/Tests/Test3/_shots";
mkdirSync(OUT, { recursive: true });
const TAG = process.argv[2] || "f1";

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errs.push("console: " + m.text()));

await page.goto("http://127.0.0.1:5183/", { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${TAG}-01-title.png` });

/* start, catch the aim guide before the volley fires */
await page.getByRole("button", { name: /MAKE AN IMPRESSION/i }).click();
await page.waitForTimeout(260);
await page.locator(".play-surface").screenshot({ path: `${OUT}/${TAG}-02-aim.png` });

/* play: break blocks so crystals drop, then catch them */
const box = await page.locator("canvas").boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 40);
await page.waitForTimeout(3200);
await page.locator(".play-surface").screenshot({ path: `${OUT}/${TAG}-03-play.png` });

/* guarantee crystals on screen for the shot */
await page.evaluate(() => {
  const g = window.__game;
  g.orb(g.px - 40, 872 - 260, 1, false);
  g.orb(g.px + 30, 872 - 320, 1, false);
  g.orb(g.px + 80, 872 - 200, 1, false);
});
await page.waitForTimeout(700);
await page.locator(".play-surface").screenshot({ path: `${OUT}/${TAG}-04-crystals.png` });

/* full page in-run */
await page.screenshot({ path: `${OUT}/${TAG}-05-inrun.png` });

console.log("errors:", errs.length ? errs.join("\n") : "(none)");
await browser.close();
