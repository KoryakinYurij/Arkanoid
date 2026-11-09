import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.ts';
import { KINDS, effectsOf } from '../src/game/data.ts';

// Minimal browser surface: simulation is real; only the DOM/audio boundary is absent.
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: (target, key) => target[key] ??
  (key === 'measureText' ? text => ({ width: text.length * 7 }) :
   String(key).startsWith('create') ? () => gradient : () => {}),
  set: (target, key, value) => (target[key] = value, true) });
class Surface extends EventTarget {
  width = 540; height = 960;
  getContext() { return context; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 540, height: 960 }; }
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
}
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { hidden: false, createElement: () => new Surface() });
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const newGame = () => {
  const game = new Game(new Surface(), { onScreen() {}, onCards() {}, onGameOver() {} });
  game.start();
  return game;
};

test('all seven base kinds and four fusions retain their donor effects', () => {
  assert.equal(Object.keys(KINDS).length, 11);
  assert.deepEqual(effectsOf('fire', 2), { burn: { dps: 2.3, dur: 3.2 }, dmgMul: 1 });
  assert.equal(effectsOf('ice', 2).freeze, 2.6);
  assert.equal(effectsOf('bolt', 2).arcs.n, 3);
  assert.equal(effectsOf('bomb', 2).boom.r, 68);
  assert.equal(effectsOf('poison', 2).poison.stacks, 1);
  assert.equal(effectsOf('drill', 2).pierce, 3);
  for (const kind of ['nova','storm','plague','rail']) assert.ok(KINDS[kind].fusion);
});

test('a run starts with five classic balls, three lives, level one', () => {
  const game = newGame();
  assert.deepEqual(game.getLoadout().balls, [{ kind: 'normal', count: 5, level: 1 }]);
  assert.equal(game.hp, 3);
  assert.equal(game.xpNeed, 3);
  game.destroy();
});

test('fusion consumes one of each ingredient and creates two fused balls', () => {
  const game = newGame();
  game.applyCard('ball:fire'); game.applyCard('lvl:fire');
  game.applyCard('ball:bomb'); game.applyCard('lvl:bomb');
  const available = Array.from({ length: 20 }, () => game.makeCards()).flat();
  assert.ok(available.some(card => card.id === 'fuse:nova'));
  game.applyCard('fuse:nova');
  assert.equal(game.arsenal.fire.count, 0);
  assert.equal(game.arsenal.bomb.count, 0);
  assert.deepEqual(game.arsenal.nova, { count: 2, level: 1 });
  assert.equal(game.totalBalls(), 7);
  game.destroy();
});

test('level up pauses simulation until one of three offered cards is chosen', () => {
  const game = newGame();
  game.xp = game.xpNeed;
  game.sim(0, 0);
  assert.equal(game.screen, 'levelup');
  assert.equal(game.choices.length, 3);
  game.pick(game.choices[0].id);
  assert.equal(game.screen, 'playing');
  assert.equal(game.level, 2);
  game.destroy();
});

test('every fourteenth row creates donor boss with 172 HP', () => {
  const game = newGame(); game.bricks = []; game.rowIndex = 13;
  game.spawnRow(140);
  assert.equal(game.bricks.filter(brick => brick.type === 'boss').length, 1);
  assert.equal(game.bricks.find(brick => brick.type === 'boss').hp, 172);
  game.destroy();
});

test('a center paddle hit charges a ball and replenishes slow motion', () => {
  const game = newGame(); game.bricks = []; game.spawnBall('normal');
  const ball = game.balls[0]; ball.x = game.px; ball.y = 862; ball.vx = 0; ball.vy = 540;
  game.updateBalls(1/60);
  assert.ok(ball.vy < 0); assert.equal(ball.charged, true);
  assert.equal(game.perfects, 1); assert.equal(game.warp, 57);
  game.destroy();
});

test('public HUD snapshot and presentation options do not change simulation', () => {
  const game = newGame();
  assert.equal(typeof game.getHud, 'function');
  const before = game.getHud();
  game.setPresentation({ shake: false, reducedMotion: true });
  assert.deepEqual(game.getHud(), before);
  game.setSlowMotion(true); assert.equal(game.warpHeld, true);
  game.pause(); assert.equal(game.warpHeld, false);
  game.destroy();
});

test('full-screen resize fills viewport without stretching or losing run state', () => {
  const game = newGame(); game.spawnBall('fire');
  game.score = 123; game.balls[0].x = 270;
  game.setSize(1600, 1, 900);
  assert.equal(game.canvas.width, 1600); assert.equal(game.canvas.height, 900);
  assert.equal(game.worldWidth, 960 * 1600/900);
  assert.equal(game.balls[0].x / game.worldWidth, .5);
  assert.equal(game.score, 123);
  assert.ok(game.bricks.every(b => b.x >= 0 && b.x + b.w <= game.worldWidth));
  game.destroy();
});

test('losing focus clears held keyboard and pointer actions before resuming', () => {
  const game = newGame();
  game.keys.add('ArrowRight'); game.keys.add('ShiftLeft');
  game.movePtr = 4; game.warpPtr = 7; game.warpHeld = true;
  window.dispatchEvent(new Event('blur'));
  assert.equal(game.screen, 'paused');
  assert.equal(game.keys.size, 0);
  assert.equal(game.movePtr, -1); assert.equal(game.warpPtr, -1);
  assert.equal(game.warpHeld, false);
  game.destroy();
});

test('starting or restarting after a wide resize centers the paddle', () => {
  const game = newGame(); game.setSize(1600, 1, 900); game.start();
  assert.equal(game.px, game.worldWidth / 2);
  assert.equal(game.ptarget, game.worldWidth / 2);
  game.destroy();
});

test('old and newly spawned rows share column boundaries after resizing', () => {
  const game = newGame(); game.bricks = [];
  game.mk(19.5, 140, 53, 31, 10, 'n'); game.setSize(1600, 1, 900);
  const previous = game.bricks[0];
  const random = Math.random; Math.random = () => .5;
  try { game.rowIndex = 0; game.spawnRow(200); }
  finally { Math.random = random; }
  assert.ok(Math.abs(game.bricks[1].x - previous.x) < 1e-8);
  assert.ok(Math.abs(game.bricks[1].w - previous.w) < 1e-8);
  game.destroy();
});

test('a touch drag remains still when the viewport resizes under the finger', () => {
  const game = newGame(); game.movePtr = 4; game.lastPX = 270;
  game.setSize(1600, 1, 900);
  assert.equal(game.lastPX, game.worldWidth / 2);
  assert.equal(game.movePtr, -1);
  game.destroy();
});

test('game over cancels pending gameplay timers so the recorded score stays final', () => {
  const game = newGame(); game.phase = 'flying';
  game.after(.05, () => { game.score += 1000; game.spawnBall('fire'); });
  game.gameOver(); const final = game.score;
  game.update(.2);
  assert.equal(game.score, final); assert.equal(game.balls.length, 0);
  game.destroy();
});

test('fatal breach ends the frame before a falling heart can heal the finished run', () => {
  const game = newGame(); game.bricks = []; game.hp = 1;
  game.mk(100, 805, 53, 31, 10, 'n');
  game.orbs = [{ x: game.px, y: 870, vx: 0, vy: 0, v: 0, heart: true, t: 1 }];
  game.sim(.016, .016);
  assert.equal(game.screen, 'gameover'); assert.equal(game.hp, 0);
  game.destroy();
});

test('lightning and poison retain horizontal neighbor reach on a wide screen', () => {
  const game = newGame(); game.bricks = [];
  game.mk(19.5, 200, 53, 31, 100, 'n'); game.mk(75.5, 200, 53, 31, 100, 'n');
  game.setSize(1600, 1, 900);
  const [origin, neighbor] = game.bricks;
  game.arc(origin, { n: 1, dmg: 1, range: 158 }, 10, '#000');
  assert.equal(neighbor.hp, 90);
  origin.poison = 4; origin.pStacks = 2; origin.pDps = 1;
  game.kill(origin);
  assert.ok(neighbor.poison > 0);
  game.destroy();
});

test('P still pauses and resumes when an ordinary interface button has focus', () => {
  const game = newGame();
  const key = () => {
    const event = new Event('keydown');
    Object.defineProperties(event, { code: { value: 'KeyP' },
      target: { value: { closest: selector => selector.includes('button') ? {} : null } } });
    window.dispatchEvent(event);
  };
  key(); assert.equal(game.screen, 'paused');
  key(); assert.equal(game.screen, 'playing');
  game.destroy();
});

test('configured starter is used by restart without changing classic default', () => {
  const game = newGame();
  assert.equal(game.getLoadout().balls[0].count, 5);
  game.setRunOptions({ starter: 'ember', rerolls: 1 });
  game.restart();
  assert.deepEqual(game.getLoadout().balls, [
    { kind: 'normal', count: 3, level: 1 }, { kind: 'fire', count: 1, level: 1 },
  ]);
  assert.equal(game.getHud().rerolls, 1);
  game.destroy();
});

test('reroll changes offered cards once and cannot apply a stale choice', () => {
  const game = newGame(); game.setRunOptions({ starter: 'classic', rerolls: 1 }); game.start();
  assert.equal(game.reroll(), false);
  game.xp = game.xpNeed; game.sim(0, 0);
  const old = game.choices.map(c => c.id);
  assert.equal(game.reroll(), true);
  assert.equal(game.choices.length, 3);
  assert.ok(game.choices.every(c => !old.includes(c.id)));
  assert.equal(game.screen, 'levelup');
  assert.equal(game.getHud().rerolls, 0);
  assert.equal(game.reroll(), false);
  game.pick(old[0]); assert.equal(game.screen, 'levelup');
  game.pick(game.choices[0].id); assert.equal(game.screen, 'playing');
  game.restart(); assert.equal(game.getHud().rerolls, 1);
  game.destroy();
});

test('demo has no permanent progress; actual fusion and boss kill publish facts', () => {
  const snapshots = [];
  const game = new Game(new Surface(), { onScreen() {}, onCards() {}, onGameOver() {},
    onProgress: facts => snapshots.push(facts) });
  game.applyCard('fuse:nova'); assert.equal(snapshots.length, 0);
  game.start();
  for (const id of ['ball:fire', 'lvl:fire', 'ball:bomb', 'lvl:bomb', 'fuse:nova']) game.applyCard(id);
  assert.deepEqual(snapshots.at(-1).fusions, ['nova']);
  game.bricks = []; game.mk(100, 140, 200, 60, 10, 'boss'); game.kill(game.bricks[0]);
  assert.equal(snapshots.at(-1).bosses, 1);
  assert.equal(game.getRunProgress().bosses, 1);
  game.destroy();
});

test('ten precise paddle hits publish per-run mastery and changing next options does not refill rerolls', () => {
  const snapshots = [];
  const game = new Game(new Surface(), { onScreen() {}, onCards() {}, onGameOver() {},
    onProgress: facts => snapshots.push(facts) });
  game.start(); game.bricks = [];
  for (let i = 0; i < 10; i++) {
    game.balls = []; game.spawnBall('normal'); const ball = game.balls[0];
    ball.x = game.px; ball.y = 862; ball.vx = 0; ball.vy = 540; game.updateBalls(1/60);
  }
  assert.equal(snapshots.at(-1).perfects, 10);
  game.setRunOptions({ starter: 'frost', rerolls: 1 });
  assert.equal(game.getHud().rerolls, 0);
  assert.equal(game.getLoadout().balls[0].count, 5);
  game.destroy();
});

test('game over summary records chosen starter, bosses and rerolls once', () => {
  const summaries = [];
  const game = new Game(new Surface(), { onScreen() {}, onCards() {}, onGameOver: s => summaries.push(s) });
  game.setRunOptions({ starter: 'frost', rerolls: 1 }); game.start();
  game.xp = game.xpNeed; game.sim(0,0); game.reroll();
  game.gameOver(); game.gameOver();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].starter, 'frost'); assert.equal(summaries[0].rerollsUsed, 1);
  assert.equal(summaries[0].bosses, 0); assert.deepEqual(summaries[0].fusions, []);
  game.destroy();
});
