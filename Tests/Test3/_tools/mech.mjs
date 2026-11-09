/**
 * Mechanic acceptance: fusion unlock, fusion application, boss row, breach,
 * game over and score-sheet persistence.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "D:/Code AI/Games/Arkanoid/Tests/Test3/_shots";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errs.push("console: " + m.text()));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

await page.goto("http://127.0.0.1:5183/", { waitUntil: "load" });
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /MAKE AN IMPRESSION/i }).click();
await page.waitForTimeout(700);

/* ── 1. fusion unlock ─────────────────────────────── */
await page.evaluate(() => {
  const g = window.__game;
  g.arsenal.fire = { count: 1, level: 2 };
  g.arsenal.bomb = { count: 1, level: 2 };
  g.arsenal.ice = { count: 0, level: 0 };
  g.arsenal.bolt = { count: 0, level: 0 };
  g.arsenal.poison = { count: 0, level: 0 };
  g.arsenal.drill = { count: 0, level: 0 };
  g.pending = 0;
  g.xp = g.xpNeed;
});
await page.waitForTimeout(800);

const cards = await page.evaluate(() => window.__game.choices.map((c) => ({ id: c.id, type: c.type, title: c.title })));
check("level-up opens a card draft", (await page.locator(".upgrade").count()) === 3, JSON.stringify(cards.map((c) => c.id)));
check(
  "fusion card offered when both ingredients are level 2",
  cards.some((c) => c.type === "fusion"),
  cards.map((c) => c.id).join(", "),
);

/* ── 2. fusion applies ────────────────────────────── */
const fusionCard = page.locator(".upgrade.fusion");
if (await fusionCard.count()) {
  await fusionCard.first().click();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => {
    const g = window.__game;
    return {
      nova: g.arsenal.nova,
      fire: g.arsenal.fire,
      bomb: g.arsenal.bomb,
      screen: g.screen,
    };
  });
  check("fusion consumes both ingredients", after.fire.count === 0 && after.bomb.count === 0, JSON.stringify(after));
  check("fusion produces two balls of the fused kind", after.nova.count === 2, JSON.stringify(after.nova));
  check("run resumes after the draft", after.screen === "playing", after.screen);
} else {
  check("fusion card present", false, "no fusion card rendered");
}

/* ── 3. boss row ──────────────────────────────────── */
await page.evaluate(() => {
  const g = window.__game;
  g.rowIndex = 13;
  g.spawnRow(g.accum + 40);
});await page.waitForTimeout(600);
const boss = await page.evaluate(() => window.__game.bricks.filter((b) => b.type === "boss").length);
check("boss block spawns on the cadence", boss > 0, `boss blocks: ${boss}`);
await page.locator(".play-surface").screenshot({ path: `${OUT}/m-boss.png` });

/* ── 4. breach costs a life ───────────────────────── */
const hpBefore = await page.evaluate(() => window.__game.hp);
await page.evaluate(() => {
  const g = window.__game;
  g.hp = 3;
  for (const b of g.bricks) b.y += 700;
});
await page.waitForTimeout(1200);
const hpAfter = await page.evaluate(() => window.__game.hp);
check("breach costs a life", hpAfter < 3, `${hpBefore} -> ${hpAfter}`);

/* ── 5. game over + score sheet ───────────────────── */
await page.evaluate(() => {
  const g = window.__game;
  g.hp = 1;
  g.score = 4242;
  for (const b of g.bricks) b.y += 700;
});
await page.waitForTimeout(1500);
const screen = await page.evaluate(() => window.__game.screen);
check("run ends when lives run out", screen === "gameover", screen);
await page.locator(".play-surface").screenshot({ path: `${OUT}/m-gameover.png` });

const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("underpressure.scores.v1") || "[]"));
check("score is written to the score sheet", stored.some((s) => s.score > 0), JSON.stringify(stored[0] || null));

/* the score sheet panel must show the entry */
await page.getByRole("button", { name: "SCORE SHEET", exact: true }).click();
await page.waitForTimeout(500);
const rows = await page.locator(".score-table tbody tr").count();
check("score sheet lists the run", rows > 0, `rows: ${rows}`);
await page.locator(".play-surface").screenshot({ path: `${OUT}/m-scores.png` });

await page.locator(".panel-close").click();
await page.waitForTimeout(400);

/* ── 6. restart clears the board ──────────────────── */
await page.getByRole("button", { name: /ONE MORE ROUND/i }).click();
await page.waitForTimeout(900);
const fresh = await page.evaluate(() => {
  const g = window.__game;
  return { screen: g.screen, score: g.score, hp: g.hp, level: g.level };
});
check("restart resets the run", fresh.score === 0 && fresh.hp === 3 && fresh.level === 1, JSON.stringify(fresh));

console.log("\nerrors:", errs.length ? errs.join("\n") : "(none)");
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
