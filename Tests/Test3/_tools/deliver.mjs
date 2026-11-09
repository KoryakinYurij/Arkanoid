import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "D:/Code AI/Games/Arkanoid/Tests/Test3/_shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errs.push("console " + m.text()));

await page.goto("http://127.0.0.1:5183/", { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/final-1-title.png` });

/* audio graph must exist after the first gesture */
await page.getByRole("button", { name: /MAKE AN IMPRESSION/i }).click();
await page.waitForTimeout(600);
const audio = await page.evaluate(() => {
  const s = window.__game.sfx;
  return { ctx: !!s.ctx, state: s.ctx?.state ?? null, master: !!s.master, noise: !!s.noise, muted: s.muted, failed: s.failed };
});
console.log("audio:", JSON.stringify(audio));

/* play a little */
const box = await page.locator("canvas").boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 40);
for (let i = 0; i < 30; i++) {
  await page.mouse.move(box.x + box.width * (0.5 + 0.3 * Math.sin(i / 2.5)), box.y + box.height - 30);
  await page.waitForTimeout(110);
}
await page.screenshot({ path: `${OUT}/final-2-play.png` });
await page.locator(".play-surface").screenshot({ path: `${OUT}/final-3-field.png` });

/* upgrade panel */
await page.evaluate(() => {
  const g = window.__game;
  g.xp = g.xpNeed;
});
await page.waitForTimeout(700);
await page.locator(".play-surface").screenshot({ path: `${OUT}/final-4-upgrade.png` });
await page.locator(".upgrade").first().click();
await page.waitForTimeout(600);

/* pause + help */
await page.keyboard.press("KeyP");
await page.waitForTimeout(500);
await page.locator(".play-surface").screenshot({ path: `${OUT}/final-5-pause.png` });
await page.keyboard.press("KeyP");
await page.waitForTimeout(300);

/* mobile */
await page.setViewportSize({ width: 414, height: 896 });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/final-6-mobile.png` });

console.log("errors:", errs.length ? errs.join("\n") : "(none)");
await browser.close();
