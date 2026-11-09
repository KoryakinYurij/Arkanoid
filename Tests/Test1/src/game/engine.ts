import { BASE_KINDS, FUSION_KINDS, KINDS, PASSIVES, effectsOf } from "./data";
import type { Card, FusionKind, HitEffects, Kind } from "./data";
import { Sfx } from "./audio";
import { STARTERS } from "./meta";
import type { ProgressFacts, StarterId } from "./meta";

export const W = 540;
export const H = 960;
const PLAY_TOP = 104;
const PADDLE_Y = 872;
const PADDLE_H = 14;
const COLS = 9;
const CW = 56;
const MARGIN = (W - COLS * CW) / 2;
const ROW_H = 34;
const GAP = 3;
const DANGER_Y = 806;
const NET_Y = 930;
const BALL_R = 7;
const BALL_SPEED = 540;
const BOSS_EVERY = 14;
const MAX_BALLS = 32;
const FONT = "'Courier New',monospace";
const PAPER = "#f3efe4";
const FIELD = "#e7e2d4";
const INK = "#272c26";
const RED = "#c45337";
const OLIVE = "#647351";
const GOLD = "#a87c32";

export type Screen = "menu" | "playing" | "paused" | "levelup" | "gameover";

export interface Summary {
  score: number;
  depth: number;
  level: number;
  kills: number;
  maxCombo: number;
  perfects: number;
  starter: StarterId;
  rerollsUsed: number;
  bosses: number;
  fusions: FusionKind[];
}

export interface RunOptions { starter: StarterId; rerolls: number }

export interface Loadout {
  balls: { kind: Kind; count: number; level: number }[];
  passives: { id: string; name: string; icon: string; lvl: number }[];
}

export interface GameCallbacks {
  onScreen(s: Screen): void;
  onCards(cards: Card[]): void;
  onGameOver(r: Summary): void;
  onProgress?(facts: ProgressFacts): void;
  onRunStart?(options: RunOptions): void;
}

export interface Hud {
  score: number; depth: number; level: number; hp: number; maxHp: number;
  combo: number; xp: number; xpNeed: number; warp: number; warpMax: number;
  totalBalls: number; phase: "ready" | "launching" | "flying"; net: number; perfects: number; rerolls: number;
}

interface Brick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxhp: number;
  type: "n" | "a" | "x" | "g" | "boss";
  flash: number;
  pop: number;
  burn: number;
  burnDps: number;
  poison: number;
  pStacks: number;
  pDps: number;
  frozen: number;
  toxic: boolean;
  dead: boolean;
  tick: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: Kind;
  mom: number;
  charged: boolean;
  pierceLeft: number;
  ignore: Brick[];
  trail: { x: number; y: number }[];
  dead: boolean;
}

interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  v: number;
  heart: boolean;
  t: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2 | 3;
  g: number;
}

interface FText {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Bolt {
  pts: number[];
  life: number;
  max: number;
  color: string;
}

type Pal = { body: string; top: string; dark: string; glow: string };

const PAL: Pal[] = ["#a7ad94", "#859477", "#d6b26e", "#d18b65", "#b9ac8e", "#96aaa3", "#c27658", "#9b956e",
  "#a68c83", "#7c8d7a", "#ba9d65", "#b27562", "#a99579", "#8b9a9d", "#a48672", "#8c8470"]
  .map(body => ({ body, top: PAPER, dark: INK, glow: body }));
const PAL_ARMOR: Pal = { body: "#879390", top: PAPER, dark: INK, glow: "#627672" };
const PAL_TNT: Pal = { body: "#cf7153", top: PAPER, dark: INK, glow: RED };
const PAL_GEM: Pal = { body: "#ceb16b", top: PAPER, dark: INK, glow: GOLD };
const PAL_BOSS: Pal = { body: INK, top: PAPER, dark: INK, glow: RED };

function tierOf(hp: number) {
  const h = Math.max(1, Math.ceil(hp));
  if (h <= 10) return h - 1;
  return Math.min(15, 9 + Math.ceil((h - 10) / 6));
}

const UPGRADE_TEXT: Record<Kind, string> = {
  normal: "",
  fire: "Горение жжёт сильнее.",
  ice: "Заморозка длится дольше.",
  bolt: "+1 цель цепи, дальше дуга.",
  bomb: "Шире радиус и сильнее взрыв.",
  poison: "Яд бьёт сильнее.",
  drill: "+1 пробитие кирпичей.",
  nova: "Больше радиус и жар взрыва.",
  storm: "+1 дуга и дольше заморозка.",
  plague: "Токсичное пламя злее.",
  rail: "+1 пробитие и больше дуг.",
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Game {
  private nextRunOptions: RunOptions = { starter: "classic", rerolls: 0 };
  private currentStarter: StarterId = "classic";
  private rerollsLeft = 0;
  private rerollAllowance = 0;
  private runBosses = 0;
  private runFusions: FusionKind[] = [];
  private worldWidth = W;
  private cellWidth = CW;
  private margin = MARGIN;
  private presentation = { shake: true, reducedMotion: false };
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly sfx = new Sfx();
  private cb: GameCallbacks;
  private raf = 0;
  private last = 0;
  private time = 0;
  private scale = 1;
  private bg: HTMLCanvasElement | null = null;

  screen: Screen = "menu";
  private demo = true;

  // world
  private bricks: Brick[] = [];
  private balls: Ball[] = [];
  private orbs: Orb[] = [];
  private parts: Part[] = [];
  private texts: FText[] = [];
  private bolts: Bolt[] = [];
  private timers: { t: number; fn: () => void }[] = [];
  private brickId = 1;

  // player
  private px = this.worldWidth / 2;
  private ptarget = this.worldWidth / 2;
  private pvx = 0;
  private kv = 0;
  private padPop = 0;
  private score = 0;
  private shownScore = 0;
  private hp = 3;
  private maxHp = 3;
  private xp = 0;
  private xpShown = 0;
  private xpNeed = 4;
  private level = 1;
  private pending = 0;
  private arsenal = {} as Record<Kind, { count: number; level: number }>;
  private passives: Record<string, number> = {};
  private combo = 0;
  private comboT = 0;
  private comboPop = 0;
  private maxCombo = 0;
  private kills = 0;
  private perfects = 0;
  private warp = 50;
  private warpHeld = false;
  private timeScale = 1;
  private orbChain = 0;
  private orbChainT = 0;

  // volley
  private phase: "ready" | "firing" | "flying" = "ready";
  private readyT = 0.3;
  private readyMax = 0.3;
  private queue: Kind[] = [];
  private launchT = 0;
  private launchIdx = 0;
  private volleySize = 0;
  private lowT = 0;
  private net = 0;

  // field
  private rowIndex = 0;
  private accum = 0;
  private skipCenter = 0;
  private gridOff = 0;
  private danger = 0;

  // fx
  private shake = 0;
  private hitstop = 0;
  private flashA = 0;
  private flashColor = "#fff";
  private bannerT = 0;
  private bannerText = "";
  private bannerSub = "";
  private bannerColor = "#fff";
  private choices: Card[] = [];

  // input
  private keys = new Set<string>();
  private movePtr = -1;
  private warpPtr = -1;
  private lastPX = 0;
  private cleanup: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.cb = cb;
    this.reset(true);
    this.bindInput();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.sfx.destroy();
  }

  /* ───────────────────────── public API ───────────────────────── */

  setSize(cssW: number, dpr: number, cssH = cssW * H / W) {
    if (!(cssW > 0 && cssH > 0 && dpr > 0)) return;
    const previous = this.worldWidth;
    this.worldWidth = H * cssW / cssH;
    this.cellWidth = CW * this.worldWidth / W;
    this.margin = MARGIN * this.worldWidth / W;
    const ratio = this.worldWidth / previous;
    this.px *= ratio;
    this.ptarget *= ratio;
    this.lastPX *= ratio;
    // Rotation can change the canvas's client origin while a finger stays still.
    // End that drag; the next touch establishes a fresh relative origin.
    if (this.movePtr !== -1) {
      const pointer = this.movePtr;
      this.movePtr = -1;
      if (this.canvas.hasPointerCapture?.(pointer)) this.canvas.releasePointerCapture(pointer);
    }
    for (const br of this.bricks) { br.x *= ratio; br.w *= ratio; }
    for (const ball of this.balls) {
      ball.x *= ratio;
      for (const point of ball.trail) point.x *= ratio;
    }
    for (const item of [...this.orbs, ...this.parts, ...this.texts]) item.x *= ratio;
    for (const bolt of this.bolts) for (let i = 0; i < bolt.pts.length; i += 2) bolt.pts[i] *= ratio;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = this.canvas.height / H;
    this.buildBg();
  }

  getHud(): Hud {
    return { score: this.score, depth: Math.max(0, this.rowIndex - 7), level: this.level,
      hp: this.hp, maxHp: this.maxHp, combo: this.combo, xp: this.xp, xpNeed: this.xpNeed,
      warp: this.warp, warpMax: this.maxWarp(), totalBalls: this.totalBalls(),
      phase: this.phase === "firing" ? "launching" : this.phase, net: this.net, perfects: this.perfects, rerolls: this.rerollsLeft };
  }

  setRunOptions(options: RunOptions) {
    const starter = Object.prototype.hasOwnProperty.call(STARTERS, options.starter) ? options.starter : "classic";
    this.nextRunOptions = { starter, rerolls: Number.isFinite(options.rerolls) && options.rerolls >= 1 ? 1 : 0 };
  }

  getRunProgress(): ProgressFacts {
    return { fusions: [...this.runFusions], bosses: this.runBosses, perfects: this.perfects, score: this.score };
  }

  private emitProgress() {
    if (!this.demo) this.cb.onProgress?.(this.getRunProgress());
  }

  setPresentation(options: { shake?: boolean; reducedMotion?: boolean }) {
    Object.assign(this.presentation, options);
  }

  setSlowMotion(active: boolean) {
    this.warpHeld = active && this.screen === "playing";
  }

  private clearInput() {
    this.keys.clear();
    this.movePtr = this.warpPtr = -1;
    this.warpHeld = false;
    this.kv = this.pvx = 0;
  }

  start(options?: RunOptions) {
    if (options) this.setRunOptions(options);
    this.sfx.init();
    this.sfx.play("select");
    this.reset(false);
    this.cb.onRunStart?.({ starter: this.currentStarter, rerolls: this.rerollAllowance });
    this.setScreen("playing");
  }

  restart() {
    this.start();
  }

  toMenu() {
    this.reset(true);
    this.setScreen("menu");
  }

  pause() {
    if (this.screen !== "playing") return;
    this.clearInput();
    this.setScreen("paused");
  }

  resume() {
    if (this.screen !== "paused") return;
    this.setScreen("playing");
  }

  setMuted(m: boolean) {
    this.sfx.setMuted(m);
  }

  pick(id: string) {
    if (this.screen !== "levelup") return;
    if (!this.choices.some(card => card.id === id)) return;
    this.sfx.play("select");
    this.applyCard(id);
    this.setScreen("playing");
    if (this.pending > 0) this.openLevelUp();
  }

  reroll(): boolean {
    if (this.screen !== "levelup" || this.rerollsLeft <= 0) return false;
    const alternatives = this.makeCards(this.choices.map(card => card.id));
    if (!alternatives.length) return false;
    this.rerollsLeft--;
    this.choices = alternatives;
    this.sfx.play("select");
    this.cb.onCards(this.choices);
    return true;
  }

  getLoadout(): Loadout {
    const balls = (Object.keys(this.arsenal) as Kind[])
      .filter((k) => this.arsenal[k].count > 0)
      .map((k) => ({ kind: k, count: this.arsenal[k].count, level: this.arsenal[k].level }));
    const passives = PASSIVES.filter((p) => (this.passives[p.id] || 0) > 0).map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      lvl: this.passives[p.id],
    }));
    return { balls, passives };
  }

  /* ───────────────────────── setup ───────────────────────── */

  private setScreen(s: Screen) {
    this.screen = s;
    this.cb.onScreen(s);
  }

  private reset(demo: boolean) {
    this.clearInput();
    this.demo = demo;
    this.currentStarter = demo ? "classic" : this.nextRunOptions.starter;
    this.rerollAllowance = this.rerollsLeft = demo ? 0 : this.nextRunOptions.rerolls;
    this.runBosses = 0;
    this.runFusions = [];
    this.bricks = [];
    this.balls = [];
    this.orbs = [];
    this.parts = [];
    this.texts = [];
    this.bolts = [];
    this.timers = [];
    this.score = 0;
    this.shownScore = 0;
    this.hp = 3;
    this.maxHp = 3;
    this.xp = 0;
    this.xpShown = 0;
    this.level = 1;
    this.xpNeed = this.needFor(1);
    this.pending = 0;
    const ars = {} as Record<Kind, { count: number; level: number }>;
    (Object.keys(KINDS) as Kind[]).forEach((k) => (ars[k] = { count: 0, level: 0 }));
    for (const ball of STARTERS[this.currentStarter].balls) ars[ball.kind] = { count: ball.count, level: ball.level };
    if (demo) {
      ars.fire = { count: 1, level: 3 };
      ars.bolt = { count: 1, level: 3 };
      ars.bomb = { count: 1, level: 2 };
      ars.drill = { count: 1, level: 2 };
      ars.storm = { count: 1, level: 2 };
    }
    this.arsenal = ars;
    this.passives = {};
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.kills = 0;
    this.perfects = 0;
    this.warp = 50;
    this.warpHeld = false;
    this.timeScale = 1;
    this.phase = "ready";
    this.readyT = 0.35;
    this.readyMax = 0.35;
    this.queue = [];
    this.net = 0;
    this.rowIndex = 0;
    this.accum = ROW_H * 0.9;
    this.skipCenter = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.flashA = 0;
    this.bannerT = 0;
    this.px = this.ptarget = this.worldWidth / 2;
    this.pvx = 0;
    this.kv = 0;
    for (let k = 6; k >= 0; k--) this.spawnRow(PLAY_TOP - ROW_H + this.accum + k * ROW_H);
  }

  private needFor(lvl: number) {
    return Math.floor(3 + (lvl - 1) * 2.2 + (lvl - 1) * (lvl - 1) * 0.14);
  }

  private pw() {
    return Math.min(220, 110 * Math.sqrt(this.worldWidth / W)) * (1 + 0.14 * (this.passives.wide || 0));
  }

  private buildBg() {
    const c = document.createElement("canvas");
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    g.scale(this.scale, this.scale);
    const w = this.worldWidth;
    g.fillStyle = FIELD; g.fillRect(0, 0, w, H);
    // Static, seeded grain avoids per-frame noise and never consumes gameplay randomness.
    let seed = 101;
    const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < Math.min(12000, w * 6); i++) {
      g.globalAlpha = .025 + noise() * .055;
      g.fillStyle = i % 3 === 0 ? PAPER : INK;
      g.fillRect(noise() * w, noise() * H, noise() < .1 ? 2 : 1, 1);
    }
    g.globalAlpha = 1;
    g.fillStyle = PAPER; g.fillRect(0, 0, w, PLAY_TOP);
    g.strokeStyle = "rgba(39,44,38,.25)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(18, PLAY_TOP - 1); g.lineTo(w - 18, PLAY_TOP - 1); g.stroke();
    g.setLineDash([2, 10]); g.strokeStyle = "rgba(39,44,38,.14)";
    g.beginPath(); g.moveTo(18, H - 54); g.lineTo(w - 18, H - 54); g.stroke(); g.setLineDash([]);
    g.strokeStyle = "rgba(39,44,38,.26)";
    for (const x of [12, w - 12]) for (const y of [PLAY_TOP + 15, H - 75]) {
      g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
    }
    this.bg = c;
  }

  /* ───────────────────────── input ───────────────────────── */

  private toWorld(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.worldWidth, y: ((e.clientY - r.top) / r.height) * H };
  }

  private requestLaunch(manual = true) {
    if (this.phase === "ready") this.readyT = 0;
    else if (manual && this.phase === "flying" && this.balls.length <= Math.max(1, Math.ceil(this.volleySize * 0.5))) this.recall();
  }

  /** Dissolve the remaining balls and immediately prepare the next volley. */
  private recall() {
    for (const b of this.balls) {
      this.spark(b.x, b.y, KINDS[b.kind].color, 6, 200, 0.4);
      this.ring(b.x, b.y, KINDS[b.kind].color, 24, 0.3);
    }
    if (this.balls.length) this.text(this.px, PADDLE_Y - 60, "ВОЗВРАТ ШАРОВ", "#627e7b", 16, 0.8);
    this.balls = [];
    this.phase = "ready";
    this.readyT = this.readyMax = 0.25;
    this.lowT = 0;
  }

  private bindInput() {
    const cv = this.canvas;
    const down = (e: PointerEvent) => {
      this.sfx.init();
      if (this.screen !== "playing") return;
      const p = this.toWorld(e);
      if (this.movePtr === -1) {
        this.movePtr = e.pointerId;
        this.lastPX = p.x;
        if (e.pointerType === "mouse") this.ptarget = p.x;
        cv.setPointerCapture?.(e.pointerId);
      }
      this.requestLaunch(e.pointerType === "mouse");
    };
    const move = (e: PointerEvent) => {
      if (this.screen !== "playing") return;
      const p = this.toWorld(e);
      if (e.pointerType === "mouse") {
        this.ptarget = p.x;
      } else if (e.pointerId === this.movePtr) {
        this.ptarget += (p.x - this.lastPX) * 1.5;
        this.lastPX = p.x;
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.movePtr) this.movePtr = -1;
      if (e.pointerId === this.warpPtr) {
        this.warpPtr = -1;
        this.warpHeld = false;
      }
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("lostpointercapture", up);
    const contextMenu = (e: Event) => e.preventDefault();
    cv.addEventListener("contextmenu", contextMenu);

    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || t?.isContentEditable || t?.closest?.("input,textarea,select")) return;
      if (t?.closest?.("button,summary") && (e.code === "Space" || e.code === "Enter")) return;
      const c = e.code;
      this.sfx.init();
      if (c === "ArrowLeft" || c === "ArrowRight" || c === "Space" || c === "ArrowUp" || c === "ArrowDown") e.preventDefault();
      if (e.repeat && c !== "ArrowLeft" && c !== "ArrowRight") return;
      this.keys.add(c);
      switch (this.screen) {
        case "menu":
          if (c === "Enter" || c === "Space") this.start();
          break;
        case "gameover":
          if (c === "Enter" || c === "Space" || c === "KeyR") this.start();
          break;
        case "levelup": {
          const i = c === "Digit1" || c === "Numpad1" ? 0 : c === "Digit2" || c === "Numpad2" ? 1 : c === "Digit3" || c === "Numpad3" ? 2 : -1;
          if (i >= 0 && this.choices[i]) this.pick(this.choices[i].id);
          break;
        }
        case "paused":
          if (c === "Escape" || c === "KeyP" || c === "Space" || c === "Enter") this.resume();
          else if (c === "KeyR") this.start();
          break;
        case "playing":
          if (c === "Space" || c === "Enter") this.requestLaunch();
          else if (c === "Escape" || c === "KeyP") this.pause();
          else if (c === "KeyR") this.start();
          break;
      }
      if (c === "KeyM") {
        this.sfx.setMuted(!this.sfx.muted);
      }
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    const vis = () => {
      if (document.hidden) { this.clearInput(); this.pause(); }
    };
    const blur = () => {
      this.clearInput();
      this.pause();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    this.cleanup.push(() => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("lostpointercapture", up);
      cv.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    });
  }

  /* ───────────────────────── main loop ───────────────────────── */

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let rdt = (now - this.last) / 1000;
    this.last = now;
    if (!(rdt > 0)) rdt = 1 / 60;
    rdt = Math.min(rdt, 0.05);
    this.time += rdt;
    this.update(rdt);
    this.render();
  };

  private update(rdt: number) {
    // cosmetic things always
    this.shake *= Math.exp(-rdt * 9);
    if (this.shake < 0.05) this.shake = 0;
    this.flashA = Math.max(0, this.flashA - rdt * 2.2);
    this.shownScore += (this.score - this.shownScore) * Math.min(1, rdt * 10);
    if (Math.abs(this.score - this.shownScore) < 1) this.shownScore = this.score;
    this.xpShown += (this.xp / this.xpNeed - this.xpShown) * Math.min(1, rdt * 10);
    this.comboPop = Math.max(0, this.comboPop - rdt * 4);
    this.padPop = Math.max(0, this.padPop - rdt * 6);
    if (this.bannerT > 0) this.bannerT -= rdt;

    if (this.screen === "playing" || this.screen === "menu") {
      let dt = rdt;
      if (this.hitstop > 0) {
        this.hitstop -= rdt;
        dt = 0;
      } else {
        // time warp
        const maxW = this.maxWarp();
        const want = this.screen === "playing" && (this.warpHeld || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.keys.has("KeyW") || this.keys.has("ArrowUp")) && this.warp > 0;
        const target = want ? 0.3 : 1;
        this.timeScale += (target - this.timeScale) * Math.min(1, rdt * 10);
        if (want) this.warp = Math.max(0, this.warp - rdt * 34 * (1 - 0.18 * (this.passives.chrono || 0)));
        this.warp = Math.min(maxW, this.warp);
        dt = rdt * this.timeScale;
      }
      this.sim(dt, rdt);
    } else if (this.screen === "gameover") {
      this.updateTimers(rdt);
      this.updateParticles(rdt);
      this.updateTexts(rdt);
      this.bolts = this.bolts.filter((b) => (b.life -= rdt) > 0);
    }
  }

  private maxWarp() {
    return 100;
  }

  private after(t: number, fn: () => void) {
    this.timers.push({ t, fn });
  }

  private updateTimers(dt: number) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
  }

  private sim(dt: number, rdt: number) {
    this.updatePaddle(rdt);
    this.updateVolley(dt);
    this.updateBalls(dt);
    this.updateBricks(dt);
    if (this.screen === "gameover") return;
    this.updateOrbs(dt);
    this.updateTimers(dt);
    this.updateParticles(dt);
    this.updateTexts(dt);
    this.bolts = this.bolts.filter((b) => (b.life -= dt) > 0);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (this.orbChainT > 0) {
      this.orbChainT -= dt;
      if (this.orbChainT <= 0) this.orbChain = 0;
    }

    // level up check
    if (!this.demo && this.screen === "playing") {
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.pending++;
        this.xpNeed = this.needFor(this.level);
      }
      if (this.pending > 0) this.openLevelUp();
    }
  }

  /* ───────────────────────── paddle & volley ───────────────────────── */

  private updatePaddle(rdt: number) {
    const pw = this.pw();
    if (this.demo) {
      // autopilot
      let best: Ball | null = null;
      for (const b of this.balls) if (b.vy > 0 && (!best || b.y > best.y)) best = b;
      this.ptarget = best ? best.x + Math.sin(this.time * 1.7) * pw * 0.28 : this.worldWidth / 2 + Math.sin(this.time) * 120;
    } else {
      const l = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
      const r = this.keys.has("ArrowRight") || this.keys.has("KeyD");
      const dir = (r ? 1 : 0) - (l ? 1 : 0);
      this.kv += (dir * 950 - this.kv) * Math.min(1, rdt * 16);
      if (Math.abs(this.kv) > 1) this.ptarget += this.kv * rdt;
    }
    this.ptarget = clamp(this.ptarget, pw / 2, this.worldWidth - pw / 2);
    const prev = this.px;
    this.px += (this.ptarget - this.px) * (1 - Math.exp(-rdt * (this.demo ? 12 : 38)));
    this.pvx += ((this.px - prev) / Math.max(rdt, 0.001) - this.pvx) * Math.min(1, rdt * 20);
  }

  private buildQueue(): Kind[] {
    const q: Kind[] = [];
    (Object.keys(this.arsenal) as Kind[]).forEach((k) => {
      for (let i = 0; i < this.arsenal[k].count; i++) q.push(k);
    });
    // light shuffle so that effects are mixed
    for (let i = q.length - 1; i > 0; i--) {
      if (Math.random() < 0.6) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
    }
    return q.slice(0, MAX_BALLS);
  }

  private spawnBall(kind: Kind) {
    const a = -Math.PI / 2 + rand(-0.2, 0.2) + clamp(this.pvx / 3500, -0.3, 0.3);
    const fx = effectsOf(kind, this.arsenal[kind].level);
    this.balls.push({
      x: this.px + rand(-8, 8),
      y: PADDLE_Y - 12,
      vx: Math.cos(a) * BALL_SPEED,
      vy: Math.sin(a) * BALL_SPEED,
      kind,
      mom: 0,
      charged: false,
      pierceLeft: fx.pierce || 0,
      ignore: [],
      trail: [],
      dead: false,
    });
  }

  /** Deploy freshly acquired balls right away if a volley is in progress. */
  private deploy(kind: Kind, n: number) {
    if (this.phase === "ready" || this.screen === "gameover") return;
    for (let i = 0; i < n; i++) {
      this.after(0.12 + i * 0.1, () => {
        if (this.phase === "ready") return;
        this.spawnBall(kind);
        this.volleySize++;
        this.spark(this.px, PADDLE_Y - 8, KINDS[kind].color, 6, 220, 0.4);
        this.sfx.play("launch", 8);
      });
    }
  }

  private updateVolley(dt: number) {
    if (this.phase === "ready") {
      this.readyT -= dt;
      if (this.readyT <= 0) {
        this.queue = this.buildQueue();
        this.volleySize = this.queue.length;
        this.lowT = 0;
        this.launchIdx = 0;
        this.launchT = 0;
        this.phase = "firing";
        this.net = (this.passives.net || 0) * 2;
      }
    }
    if (this.phase === "firing") {
      const interval = Math.min(0.075, 1.2 / Math.max(1, this.queue.length + this.launchIdx));
      this.launchT -= dt;
      while (this.launchT <= 0 && this.queue.length) {
        this.launchT += interval;
        const kind = this.queue.shift()!;
        this.spawnBall(kind);
        this.launchIdx++;
        this.sfx.play("launch", this.launchIdx);
        this.spark(this.px, PADDLE_Y - 8, KINDS[kind].color, 3, 160, 0.3);
      }
      if (!this.queue.length) this.phase = "flying";
    }
    if (this.phase === "flying") {
      if (this.balls.length === 0) {
        this.phase = "ready";
        this.readyT = this.readyMax = 0.55;
      } else if (this.balls.length <= Math.max(1, Math.floor(this.volleySize * 0.25))) {
        this.lowT += dt;
        if (this.lowT > 3) this.recall();
      } else {
        this.lowT = 0;
      }
    }
  }

  /* ───────────────────────── balls ───────────────────────── */

  private updateBalls(dt: number) {
    const pw = this.pw();
    const R = BALL_R;
    const perfectWin = 0.15 + 0.06 * (this.passives.parry || 0);
    for (const b of this.balls) {
      const dist = BALL_SPEED * dt;
      const steps = Math.max(1, Math.ceil(dist / 4.5));
      const h = dt / steps;
      const L = this.arsenal[b.kind].level;
      const fx = effectsOf(b.kind, L);
      // trail
      let tr = b.trail.length >= 8 ? b.trail.pop()! : { x: 0, y: 0 };
      tr.x = b.x;
      tr.y = b.y;
      b.trail.unshift(tr);

      for (let s = 0; s < steps && !b.dead; s++) {
        b.x += b.vx * h;
        b.y += b.vy * h;

        // walls
        if (b.x < R) {
          b.x = R;
          b.vx = Math.abs(b.vx);
          this.wallBounce(b, fx);
        } else if (b.x > this.worldWidth - R) {
          b.x = this.worldWidth - R;
          b.vx = -Math.abs(b.vx);
          this.wallBounce(b, fx);
        }
        if (b.y < PLAY_TOP + R) {
          b.y = PLAY_TOP + R;
          b.vy = Math.abs(b.vy);
          this.wallBounce(b, fx);
        }

        // paddle
        if (b.vy > 0 && b.y + R >= PADDLE_Y && b.y - R <= PADDLE_Y + PADDLE_H && Math.abs(b.x - this.px) <= pw / 2 + R * 0.8) {
          const off = clamp((b.x - this.px) / (pw / 2), -1, 1);
          const a = clamp(off * 1.05 + this.pvx / 2600, -1.2, 1.2);
          b.vx = Math.sin(a) * BALL_SPEED;
          b.vy = -Math.cos(a) * BALL_SPEED;
          b.y = PADDLE_Y - R - 0.5;
          b.pierceLeft = fx.pierce || 0;
          b.ignore.length = 0;
          this.padPop = 1;
          this.sfx.play("paddle");
          if (Math.abs(off) < perfectWin && !this.demo) {
            if (!b.charged) {
              b.charged = true;
              this.perfects++;
              this.emitProgress();
              this.warp = Math.min(this.maxWarp(), this.warp + 7);
              this.ring(b.x, PADDLE_Y, "#a87c32", 60, 0.35);
              this.spark(b.x, PADDLE_Y, "#a87c32", 12, 320, 0.4);
              this.text(b.x, PADDLE_Y - 30, "ИДЕАЛЬНО", "#a87c32", 18, 0.7);
              this.sfx.play("perfect");
              this.shake += 1.5;
            }
          } else {
            this.spark(b.x, PADDLE_Y, "#627e7b", 4, 160, 0.25);
          }
        }

        // net / lost
        if (b.y + R > NET_Y && b.vy > 0) {
          if (this.net > 0) {
            this.net--;
            b.vy = -Math.abs(b.vy);
            b.y = NET_Y - R;
            this.sfx.play("net");
            this.ring(b.x, NET_Y, "#627e7b", 36, 0.3);
            this.spark(b.x, NET_Y, "#627e7b", 10, 260, 0.4);
          } else if (b.y - R > H + 10) {
            b.dead = true;
            this.sfx.play("lost");
            this.spark(b.x, H - 20, KINDS[b.kind].color, 8, 200, 0.4);
          }
        }

        // ignore cleanup
        if (b.ignore.length) {
          b.ignore = b.ignore.filter((br) => !br.dead && this.overlaps(b, br));
        }

        // bricks
        for (let i = 0; i < this.bricks.length; i++) {
          const br = this.bricks[i];
          if (br.dead) continue;
          if (b.x + R < br.x || b.x - R > br.x + br.w || b.y + R < br.y || b.y - R > br.y + br.h) continue;
          if (br.y + br.h < PLAY_TOP) continue;
          const cx = clamp(b.x, br.x, br.x + br.w);
          const cy = clamp(b.y, br.y, br.y + br.h);
          const dx = b.x - cx;
          const dy = b.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > R * R) continue;
          if (b.ignore.includes(br)) continue;

          if (b.pierceLeft > 0) {
            b.pierceLeft--;
            b.ignore.push(br);
          } else {
            let nx = 0;
            let ny = 0;
            if (d2 < 0.0001) {
              const l = b.x - br.x;
              const r = br.x + br.w - b.x;
              const t = b.y - br.y;
              const bt = br.y + br.h - b.y;
              const m = Math.min(l, r, t, bt);
              if (m === l) nx = -1;
              else if (m === r) nx = 1;
              else if (m === t) ny = -1;
              else ny = 1;
              b.x += nx * (R + m);
              b.y += ny * (R + m);
            } else {
              const d = Math.sqrt(d2);
              nx = dx / d;
              ny = dy / d;
              b.x = cx + nx * (R + 0.4);
              b.y = cy + ny * (R + 0.4);
            }
            const dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
              b.vx -= 2 * dot * nx;
              b.vy -= 2 * dot * ny;
            }
            this.normalize(b);
            b.pierceLeft = fx.pierce || 0;
            b.ignore.length = 0;
          }
          this.hitBrick(b, br, fx);
          if (b.pierceLeft <= 0 || b.ignore.length === 0) break;
        }
      }
    }
    // remove dead
    if (this.balls.some((b) => b.dead)) this.balls = this.balls.filter((b) => !b.dead);
  }

  private overlaps(b: Ball, br: Brick) {
    const cx = clamp(b.x, br.x, br.x + br.w);
    const cy = clamp(b.y, br.y, br.y + br.h);
    const dx = b.x - cx;
    const dy = b.y - cy;
    return dx * dx + dy * dy <= (BALL_R + 1) * (BALL_R + 1);
  }

  private normalize(b: Ball) {
    const min = BALL_SPEED * 0.24;
    if (Math.abs(b.vy) < min) {
      b.vy = (b.vy < 0 || b.vy === 0 ? -1 : 1) * min;
    }
    const l = Math.hypot(b.vx, b.vy);
    b.vx = (b.vx / l) * BALL_SPEED;
    b.vy = (b.vy / l) * BALL_SPEED;
  }

  private wallBounce(b: Ball, fx: HitEffects) {
    this.sfx.play("wall");
    this.normalize(b);
    b.mom++;
    b.pierceLeft = fx.pierce || 0;
    b.ignore.length = 0;
    this.spark(b.x, b.y, "#8b817f", 2, 100, 0.2);
  }

  /* ───────────────────────── hits & effects ───────────────────────── */

  private hitBrick(b: Ball, br: Brick, fx: HitEffects) {
    const color = KINDS[b.kind].color;
    let dmg = (1 + 0.25 * (this.passives.dmg || 0)) * fx.dmgMul;
    const ric = this.passives.ric || 0;
    if (ric && b.mom) dmg *= 1 + b.mom * 0.3 * ric;
    b.mom = 0;
    let crit = false;
    if (b.charged) {
      dmg *= 2 + 0.5 * (this.passives.parry || 0);
      b.charged = false;
      crit = true;
      this.ring(b.x, b.y, "#a87c32", 50, 0.3);
      this.shake += 3;
    }
    if (Math.random() < 0.08 * (this.passives.crit || 0)) {
      dmg *= 2;
      crit = true;
    }
    if (br.frozen > 0) dmg *= 1.5;

    this.combo++;
    this.comboT = 2.4;
    this.comboPop = 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.sfx.play("hit", this.combo);
    this.shake += 0.6;
    this.spark(b.x, b.y, color, 4, 220, 0.3);

    this.hurt(br, dmg, crit);

    if (!br.dead) {
      if (fx.burn) this.ignite(br, fx.burn.dps, fx.burn.dur);
      if (fx.freeze) this.freeze(br, fx.freeze);
      if (fx.poison) this.poison(br, fx.poison.stacks, fx.poison.dps, 4, b.kind === "plague");
    }
    if (b.kind === "plague") br.toxic = true;
    if (fx.arcs) this.arc(br, fx.arcs, dmg, color);
    if (fx.boom) {
      this.explode(b.x, b.y, fx.boom.r, dmg * fx.boom.dmg, color, fx.boom.burn, br);
    }
  }

  private ignite(br: Brick, dps: number, dur: number) {
    if (br.dead) return;
    br.burn = Math.max(br.burn, dur);
    br.burnDps = Math.max(br.burnDps, dps);
  }

  private freeze(br: Brick, t: number) {
    if (br.dead) return;
    if (br.frozen <= 0) {
      this.sfx.play("ice");
      this.spark(br.x + br.w / 2, br.y + br.h / 2, "#a3bbb9", 6, 140, 0.4);
    }
    br.frozen = Math.max(br.frozen, t);
  }

  private poison(br: Brick, stacks: number, dps: number, dur: number, toxic = false) {
    if (br.dead) return;
    br.poison = Math.max(br.poison, dur);
    br.pStacks = Math.min(8, br.pStacks + stacks);
    br.pDps = Math.max(br.pDps, dps);
    if (toxic) br.toxic = true;
  }

  private hurt(br: Brick, amt: number, crit = false, dot = false) {
    if (br.dead) return;
    br.hp -= amt;
    if (!dot) {
      br.flash = 1;
      br.pop = 1;
      if (this.texts.length < 34) {
        const t = Math.max(1, Math.round(amt));
        this.text(br.x + br.w / 2 + rand(-10, 10), br.y + 6, crit ? `${t}!` : `${t}`, crit ? "#a87c32" : "#ffffff", crit ? 20 : 13, 0.55);
      }
    }
    if (br.hp <= 0) this.kill(br);
  }

  private arc(origin: Brick, a: { n: number; dmg: number; range: number; freeze?: number }, dmg: number, color: string) {
    let cx = origin.x + origin.w / 2;
    let cy = origin.y + origin.h / 2;
    const pts = [cx, cy];
    const used = new Set<Brick>([origin]);
    for (let i = 0; i < a.n; i++) {
      let best: Brick | null = null;
      let bd = a.range * a.range;
      for (const t of this.bricks) {
        if (t.dead || used.has(t) || t.y + t.h < PLAY_TOP) continue;
        const dx = (t.x + t.w / 2 - cx) * W / this.worldWidth;
        const dy = t.y + t.h / 2 - cy;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) break;
      used.add(best);
      cx = best.x + best.w / 2;
      cy = best.y + best.h / 2;
      pts.push(cx, cy);
      this.hurt(best, dmg * a.dmg);
      if (a.freeze) this.freeze(best, a.freeze);
      this.spark(cx, cy, color, 4, 200, 0.3);
    }
    if (pts.length > 2) {
      this.bolts.push({ pts, life: 0.2, max: 0.2, color });
      this.sfx.play("bolt");
    }
  }

  private explode(x: number, y: number, r: number, dmg: number, color: string, burn?: { dps: number; dur: number }, skip?: Brick) {
    this.ring(x, y, color, r, 0.38);
    this.ring(x, y, "#ffffff", r * 0.55, 0.25);
    this.spark(x, y, color, Math.min(22, 8 + r / 8), 120 + r * 3, 0.5);
    for (let i = 0; i < 6; i++) this.puff(x + rand(-r / 3, r / 3), y + rand(-r / 3, r / 3), color, 40 + r * 0.5);
    this.shake = Math.min(26, this.shake + 2 + r / 22);
    this.sfx.play("boom");
    this.hitstop = Math.max(this.hitstop, r > 70 ? 0.05 : 0.025);
    for (const br of this.bricks) {
      if (br.dead || br === skip || br.y + br.h < PLAY_TOP) continue;
      const cx = clamp(x, br.x, br.x + br.w);
      const cy = clamp(y, br.y, br.y + br.h);
      const d = Math.hypot((x - cx) * W / this.worldWidth, y - cy);
      if (d <= r && dmg > 0) {
        this.hurt(br, dmg * (1 - 0.4 * (d / r)));
        if (burn && !br.dead) this.ignite(br, burn.dps, burn.dur);
      }
    }
  }

  private kill(br: Brick) {
    if (br.dead) return;
    br.dead = true;
    this.kills++;
    const cx = br.x + br.w / 2;
    const cy = br.y + br.h / 2;
    const pal = this.palOf(br);
    const boss = br.type === "boss";
    const mult = 1 + Math.min(7, this.combo * 0.1);
    const typeMul = boss ? 6 : br.type === "g" ? 2 : br.type === "a" ? 1.4 : 1;
    const pts = Math.round(br.maxhp * 10 * mult * typeMul);
    this.score += pts;
    if (this.texts.length < 34 || boss) this.text(cx, cy - 4, `+${pts}`, pal.top, boss ? 30 : 15, boss ? 1.2 : 0.8);
    this.debris(cx, cy, pal.glow, boss ? 70 : 12, boss ? 520 : 260, br.w);
    this.spark(cx, cy, "#ffffff", boss ? 30 : 5, boss ? 520 : 260, 0.4);
    this.sfx.play("kill", this.combo);
    this.shake += boss ? 20 : 1.4;
    this.warp = Math.min(this.maxWarp(), this.warp + 1.1 + 0.5 * (this.passives.chrono || 0));

    // drops
    if (!this.demo) {
      let n = br.type === "g" ? 4 : br.type === "a" ? 2 : Math.random() < 0.8 ? 1 : 0;
      if (boss) n = 18;
      if (this.orbs.length > 90) n = Math.min(n, 1);
      for (let i = 0; i < n; i++) this.orb(cx + rand(-10, 10), cy + rand(-6, 6), 1, false);
      if (boss) this.orb(cx, cy, 0, true);
    }

    if (br.type === "x") {
      this.after(0.07, () => this.explode(cx, cy, 100, 5 + this.rowIndex * 0.5, "#c45337", undefined, br));
    }
    if (br.poison > 0 || br.toxic) {
      for (const n of this.bricks) {
        if (n.dead || n.y + n.h < PLAY_TOP) continue;
        const d = Math.hypot((n.x + n.w / 2 - cx) * W / this.worldWidth, n.y + n.h / 2 - cy);
        if (d < (boss ? 190 : 96)) {
          if (br.pStacks > 0) this.poison(n, Math.max(1, Math.floor(br.pStacks / 2)), br.pDps || 1, 4, br.toxic);
          if (br.toxic) this.ignite(n, 1.6, 3);
          this.spark(n.x + n.w / 2, n.y + n.h / 2, "#647351", 3, 80, 0.4);
        }
      }
    }
    if (boss) {
      if (!this.demo) { this.runBosses++; this.emitProgress(); }
      this.hitstop = Math.max(this.hitstop, 0.14);
      this.flash("#a96851", 0.7);
      this.ring(cx, cy, "#a96851", 260, 0.6);
      this.ring(cx, cy, "#ffffff", 160, 0.4);
      this.sfx.play("boom");
      this.showBanner("БОСС ПОВЕРЖЕН!", "+ сердце и россыпь опыта", "#a96851");
      this.vibrate(80);
    }
  }

  /* ───────────────────────── bricks ───────────────────────── */

  private updateBricks(dt: number) {
    let lowest = 0;
    let frozenN = 0;
    for (const br of this.bricks) {
      if (br.dead) continue;
      if (br.y + br.h > lowest && br.y + br.h > PLAY_TOP) lowest = br.y + br.h;
      if (br.frozen > 0) {
        br.frozen -= dt;
        frozenN++;
      }
      br.flash = Math.max(0, br.flash - dt * 6);
      br.pop = Math.max(0, br.pop - dt * 7);
      let dot = 0;
      if (br.burn > 0) {
        br.burn -= dt;
        dot += br.burnDps * dt;
        if (Math.random() < dt * 14) this.particle(br.x + rand(0, br.w), br.y + rand(0, br.h), rand(-15, 15), rand(-70, -30), 0.45, rand(2, 4), "#c3784f", 1, 0);
        if (br.burn <= 0) br.burnDps = 0;
      }
      if (br.poison > 0) {
        br.poison -= dt;
        dot += br.pStacks * br.pDps * dt;
        if (Math.random() < dt * 6) this.particle(br.x + rand(0, br.w), br.y + rand(0, br.h), rand(-10, 10), rand(-40, -15), 0.6, rand(2, 3.5), "#647351", 1, 0);
        if (br.poison <= 0) {
          br.pStacks = 0;
          br.pDps = 0;
        }
      }
      if (dot > 0) {
        br.tick -= dt;
        if (br.tick <= 0) {
          br.tick = 0.3;
          br.flash = Math.max(br.flash, 0.3);
        }
        this.hurt(br, dot, false, true);
      }
    }

    // scroll speed with rubber band
    let f = 1;
    if (lowest < 300) f = 1 + ((300 - lowest) / 200) * 4;
    else if (lowest > 560) f = Math.max(0.4, 1 - (lowest - 560) / 400);
    const depth = Math.max(0, this.rowIndex - 7);
    let speed = 9 + Math.min(depth, 70) * 0.26;
    speed *= 1 - 0.1 * (this.passives.chill || 0);
    speed *= 1 - Math.min(0.5, frozenN * 0.04);
    if (this.demo) speed = Math.max(speed, 16);
    const d = speed * f * dt;
    this.accum += d;
    this.gridOff = (this.gridOff + d) % 48;
    for (const br of this.bricks) if (!br.dead) br.y += d;
    while (this.accum >= ROW_H) {
      this.accum -= ROW_H;
      this.spawnRow(PLAY_TOP - ROW_H + this.accum);
    }

    // breach
    this.danger += (clamp((lowest - (DANGER_Y - 130)) / 130, 0, 1) - this.danger) * Math.min(1, dt * 5);
    for (const br of this.bricks) {
      if (br.dead) continue;
      if (br.y + br.h >= DANGER_Y) this.breach(br);
    }
    this.bricks = this.bricks.filter((b) => !b.dead);
  }

  private breach(br: Brick) {
    if (!this.demo && this.hp <= 0) return;
    br.dead = true;
    const cx = br.x + br.w / 2;
    const cy = br.y + br.h / 2;
    this.debris(cx, cy, "#c45337", 30, 400, br.w);
    this.explode(cx, DANGER_Y, 60, 0, "#c45337");
    if (this.demo) return;
    const dmg = br.type === "boss" ? 2 : 1;
    this.hp -= dmg;
    this.shake = 28;
    this.flash("#c45337", 0.55);
    this.sfx.play("breach");
    this.vibrate(120);
    this.combo = 0;
    this.showBanner(this.hp > 0 ? "СТЕНА ПРОРВАНА!" : "", this.hp > 0 ? `осталось жизней: ${this.hp}` : "", "#c45337");
    if (this.hp <= 0) this.gameOver();
  }

  private spawnRow(y: number) {
    const d = this.rowIndex++;
    const boss = d > 10 && d % BOSS_EVERY === BOSS_EVERY - 1;
    const skip = boss || this.skipCenter > 0;
    if (this.skipCenter > 0 && !boss) this.skipCenter--;
    if (boss) {
      this.skipCenter = 1;
      const hp = 55 + d * 9;
      const gapX = GAP * this.worldWidth / W;
      const bx = this.margin + 2 * this.cellWidth + gapX / 2;
      this.mk(bx, y - ROW_H + GAP / 2, 5 * this.cellWidth - gapX, 2 * ROW_H - GAP, hp, "boss");
      this.showBanner("⚠ БОСС ⚠", "бей по самому сердцу!", "#a96851");
      this.sfx.play("breach");
    } else if (d > 0 && d % 10 === 0 && !this.demo) {
      this.showBanner(`ГЛУБИНА ${Math.max(0, d - 7)}`, "", "#627e7b");
    }
    const dens = Math.min(0.9, 0.6 + d * 0.012);
    const mirror = Math.random() < 0.55;
    const r1: number[] = [];
    const r2: number[] = [];
    for (let i = 0; i < COLS; i++) {
      r1.push(Math.random());
      r2.push(Math.random());
    }
    const pA = d >= 3 ? Math.min(0.22, 0.04 + d * 0.008) : 0;
    const pX = d >= 2 ? 0.06 : 0;
    const pG = d >= 1 ? 0.07 : 0;
    for (let c = 0; c < COLS; c++) {
      if (skip && c >= 2 && c <= 6) continue;
      const cc = mirror ? Math.min(c, COLS - 1 - c) : c;
      if (r1[cc] > dens) continue;
      const base = 1 + Math.floor(d * 0.34 + Math.random() * (1 + d * 0.1));
      const t = r2[cc];
      let type: Brick["type"] = "n";
      let hp = base;
      if (t < pX) {
        type = "x";
        hp = Math.max(1, Math.round(base * 0.6));
      } else if (t < pX + pG) {
        type = "g";
      } else if (t < pX + pG + pA) {
        type = "a";
        hp = Math.round(base * 2.2) + 1;
      }
      const gapX = GAP * this.worldWidth / W;
      this.mk(this.margin + c * this.cellWidth + gapX / 2, y + GAP / 2, this.cellWidth - gapX, ROW_H - GAP, hp, type);
    }
  }

  private mk(x: number, y: number, w: number, h: number, hp: number, type: Brick["type"]) {
    this.bricks.push({
      id: this.brickId++,
      x,
      y,
      w,
      h,
      hp,
      maxhp: hp,
      type,
      flash: 0,
      pop: 0,
      burn: 0,
      burnDps: 0,
      poison: 0,
      pStacks: 0,
      pDps: 0,
      frozen: 0,
      toxic: false,
      dead: false,
      tick: 0,
    });
  }

  private palOf(br: Brick): Pal {
    switch (br.type) {
      case "a":
        return PAL_ARMOR;
      case "x":
        return PAL_TNT;
      case "g":
        return PAL_GEM;
      case "boss":
        return PAL_BOSS;
      default:
        return PAL[tierOf(br.hp)];
    }
  }

  /* ───────────────────────── orbs & progression ───────────────────────── */

  private orb(x: number, y: number, v: number, heart: boolean) {
    this.orbs.push({ x, y, vx: rand(-130, 130), vy: rand(-320, -120), v, heart, t: 0 });
  }

  private updateOrbs(dt: number) {
    const pw = this.pw();
    const magR = 100 + 60 * (this.passives.magnet || 0);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      o.vy += 650 * dt;
      const dx = this.px - o.x;
      const dy = PADDLE_Y - o.y;
      const d = Math.max(.001, Math.hypot(dx * W / this.worldWidth, dy));
      if (d < magR && o.t > 0.3 && o.y < PADDLE_Y + 20) {
        const pull = 2600 * (1 - d / magR) + 500;
        o.vx += (dx / d) * pull * dt;
        o.vy += (dy / d) * pull * dt;
        o.vx *= 1 - Math.min(1, dt * 3);
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.x < 10) {
        o.x = 10;
        o.vx = Math.abs(o.vx);
      } else if (o.x > this.worldWidth - 10) {
        o.x = this.worldWidth - 10;
        o.vx = -Math.abs(o.vx);
      }
      if (o.y >= PADDLE_Y - 8 && o.y <= PADDLE_Y + PADDLE_H + 14 && Math.abs(o.x - this.px) < pw / 2 + 10 && o.t > 0.15) {
        this.orbs.splice(i, 1);
        this.collect(o);
        continue;
      }
      if (o.y > H + 30) this.orbs.splice(i, 1);
      else if (Math.random() < dt * 20) this.particle(o.x, o.y, 0, 20, 0.3, 2, o.heart ? "#c45337" : "#647351", 1, 0);
    }
  }

  private collect(o: Orb) {
    if (o.heart) {
      if (this.hp < this.maxHp) {
        this.hp++;
        this.sfx.play("heal");
        this.text(this.px, PADDLE_Y - 30, "+1 ❤", "#c45337", 22, 0.9);
      } else {
        this.score += 500;
        this.text(this.px, PADDLE_Y - 30, "+500", "#c45337", 20, 0.9);
      }
      this.ring(this.px, PADDLE_Y, "#c45337", 70, 0.4);
    } else {
      this.xp += o.v;
      this.orbChain++;
      this.orbChainT = 0.6;
      this.sfx.play("orb", this.orbChain);
    }
    this.spark(o.x, PADDLE_Y, o.heart ? "#c45337" : "#647351", 5, 180, 0.3);
  }

  private openLevelUp() {
    this.pending--;
    this.choices = this.makeCards();
    this.sfx.play("levelup");
    this.ring(this.px, PADDLE_Y, "#647351", 160, 0.6);
    this.vibrate(30);
    this.setScreen("levelup");
    this.cb.onCards(this.choices);
  }

  private totalBalls() {
    return (Object.keys(this.arsenal) as Kind[]).reduce((s, k) => s + this.arsenal[k].count, 0);
  }

  private makeCards(excludeIds: readonly string[] = []): Card[] {
    const cands: { card: Card; w: number }[] = [];
    const total = this.totalBalls();
    const early = this.level <= 3;
    const A = this.arsenal;
    // balls that can be fused with something we already own get picked more often
    const synergy = (k: Kind) =>
      FUSION_KINDS.some((f) => {
        const [x, y] = KINDS[f].fusion!;
        if (A[f].count > 0 || A[f].level > 0) return false;
        const other = x === k ? y : y === k ? x : null;
        return other !== null && A[other].count > 0;
      })
        ? 2.2
        : 1;
    for (const k of BASE_KINDS) {
      const def = KINDS[k];
      const a = A[k];
      if (k === "normal") {
        if (a.count < 8 && total < MAX_BALLS)
          cands.push({
            w: 0.7,
            card: { id: "ball:normal", type: "ball", tag: "+1 ШАР", title: `${def.name} ×${a.count + 1}`, desc: "Ещё один надёжный шар в залпе.", icon: def.icon, color: def.color, sub: `Шаров: ${a.count} → ${a.count + 1}` },
          });
        continue;
      }
      if (a.count === 0 && a.level === 0) {
        cands.push({ w: (early ? 6 : 3) * synergy(k), card: { id: `ball:${k}`, type: "ball", tag: "НОВЫЙ ШАР", title: def.name, desc: def.desc, icon: def.icon, color: def.color, sub: "Добавляется в залп" } });
      } else {
        if (a.count < 6 && total < MAX_BALLS)
          cands.push({ w: 1.5, card: { id: `ball:${k}`, type: "ball", tag: "+1 ШАР", title: `${def.name} ×${a.count + 1}`, desc: def.desc, icon: def.icon, color: def.color, sub: `Шаров: ${a.count} → ${a.count + 1}` } });
        if (a.level < 6)
          cands.push({ w: (a.level < 2 ? 3.5 : 2) * synergy(k), card: { id: `lvl:${k}`, type: "level", tag: "УЛУЧШЕНИЕ", title: `${def.name}: ур. ${a.level + 1}`, desc: UPGRADE_TEXT[k], icon: def.icon, color: def.color, sub: `Уровень ${a.level} → ${a.level + 1}` } });
      }
    }
    for (const f of FUSION_KINDS) {
      const def = KINDS[f];
      const [x, y] = def.fusion!;
      const a = A[f];
      if (a.count > 0 || a.level > 0) {
        if (a.level < 6) cands.push({ w: 2.5, card: { id: `lvl:${f}`, type: "level", tag: "УЛУЧШЕНИЕ", title: `${def.name}: ур. ${a.level + 1}`, desc: UPGRADE_TEXT[f], icon: def.icon, color: def.color, sub: `Уровень ${a.level} → ${a.level + 1}` } });
        if (a.count < 4 && total < MAX_BALLS) cands.push({ w: 1.2, card: { id: `ball:${f}`, type: "ball", tag: "+1 ШАР", title: `${def.name} ×${a.count + 1}`, desc: def.desc, icon: def.icon, color: def.color, sub: `Шаров: ${a.count} → ${a.count + 1}` } });
      } else if (A[x].count > 0 && A[y].count > 0 && A[x].level >= 2 && A[y].level >= 2) {
        cands.push({ w: 100, card: { id: `fuse:${f}`, type: "fusion", tag: "⚗ СЛИЯНИЕ", title: def.name, desc: def.desc, icon: def.icon, color: "#a87c32", sub: `${KINDS[x].icon} + ${KINDS[y].icon} → 2 шара ${def.icon}` } });
      }
    }
    for (const p of PASSIVES) {
      const l = this.passives[p.id] || 0;
      if (l < p.max) cands.push({ w: early ? 1 : 1.6, card: { id: `pas:${p.id}`, type: "passive", tag: "ПАССИВКА", title: p.name, desc: p.desc(l + 1), icon: p.icon, color: "#627e7b", sub: `Уровень ${l} → ${l + 1} (макс ${p.max})` } });
    }

    const picks: Card[] = [];
    const pool = cands.filter(candidate => !excludeIds.includes(candidate.card.id));
    if (excludeIds.length && !pool.length) return [];
    // Fill rare late-game offers without spending a reroll on an identical set.
    if (pool.length < 3) {
      for (const candidate of cands) {
        if (pool.length >= 3) break;
        if (!pool.includes(candidate)) pool.push(candidate);
      }
    }
    const eligible = pool.slice();
    while (picks.length < 3 && pool.length) {
      const sum = pool.reduce((s, c) => s + c.w, 0);
      let r = Math.random() * sum;
      let idx = 0;
      for (; idx < pool.length - 1; idx++) {
        r -= pool[idx].w;
        if (r <= 0) break;
      }
      picks.push(pool[idx].card);
      pool.splice(idx, 1);
    }
    if (!picks.some((c) => c.type === "ball" || c.type === "fusion")) {
      const alt = eligible.filter((c) => c.card.type === "ball" && !picks.includes(c.card));
      if (alt.length) picks[picks.length - 1] = alt[Math.floor(Math.random() * alt.length)].card;
    }
    return picks;
  }

  private applyCard(id: string) {
    const [t, k] = id.split(":");
    if (t === "ball") {
      const a = this.arsenal[k as Kind];
      a.count++;
      if (a.level === 0) a.level = 1;
      this.text(this.px, PADDLE_Y - 40, `+ ${KINDS[k as Kind].name}`, KINDS[k as Kind].color, 22, 1);
      this.deploy(k as Kind, 1);
    } else if (t === "lvl") {
      this.arsenal[k as Kind].level++;
    } else if (t === "fuse") {
      const def = KINDS[k as Kind];
      const [x, y] = def.fusion!;
      this.arsenal[x].count--;
      this.arsenal[y].count--;
      this.arsenal[k as Kind] = { count: 2, level: 1 };
      if (!this.demo && !this.runFusions.includes(k as FusionKind)) {
        this.runFusions.push(k as FusionKind);
        this.emitProgress();
      }
      // swap one in-flight ingredient ball of each type for the fused ones
      for (const ing of [x, y]) {
        const i = this.balls.findIndex((bb) => bb.kind === ing);
        if (i >= 0) {
          this.balls.splice(i, 1);
          this.volleySize--;
        }
      }
      this.deploy(k as Kind, 2);
      this.sfx.play("fuse");
      this.flash("#a87c32", 0.6);
      this.shake = 18;
      this.ring(this.px, PADDLE_Y, "#a87c32", 240, 0.7);
      this.spark(this.px, PADDLE_Y, "#a87c32", 26, 500, 0.8);
      this.showBanner(`СЛИЯНИЕ: ${def.name.toUpperCase()}`, def.desc, "#a87c32");
      this.vibrate(60);
    } else if (t === "pas") {
      this.passives[k] = (this.passives[k] || 0) + 1;
      if (k === "hp") {
        this.maxHp++;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
      if (k === "wide") this.ptarget = clamp(this.ptarget, this.pw() / 2, this.worldWidth - this.pw() / 2);
    }
  }

  private gameOver() {
    if (this.screen === "gameover") return;
    this.emitProgress();
    this.clearInput();
    // Queued deployments and chain explosions belong to the finished run.
    this.timers = [];
    this.sfx.play("gameover");
    this.flash("#c45337", 0.8);
    this.vibrate(250);
    this.hitstop = 0;
    this.timeScale = 1;
    const bs = this.bricks.filter((b) => !b.dead);
    bs.forEach((b, i) => {
      this.after(0.05 + i * 0.012, () => {
        this.debris(b.x + b.w / 2, b.y + b.h / 2, this.palOf(b).glow, 8, 300, b.w);
        this.shake = Math.max(this.shake, 4);
      });
    });
    this.after(0.05 + bs.length * 0.012, () => {
      this.bricks = [];
    });
    this.balls = [];
    this.setScreen("gameover");
    this.cb.onGameOver({
      score: this.score,
      depth: Math.max(0, this.rowIndex - 7),
      level: this.level,
      kills: this.kills,
      maxCombo: this.maxCombo,
      perfects: this.perfects,
      starter: this.currentStarter,
      rerollsUsed: this.rerollAllowance - this.rerollsLeft,
      bosses: this.runBosses,
      fusions: [...this.runFusions],
    });
  }

  /* ───────────────────────── particles & text ───────────────────────── */

  private vibrate(ms: number) {
    try {
      if (!this.sfx.muted && navigator.vibrate) navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }

  private flash(color: string, a: number) {
    this.flashColor = color;
    this.flashA = a;
  }

  private showBanner(text: string, sub: string, color: string) {
    if (!text) return;
    this.bannerText = text;
    this.bannerSub = sub;
    this.bannerColor = color;
    this.bannerT = 2;
  }

  private particle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: 0 | 1 | 2 | 3, g: number) {
    if (this.parts.length > 650 && kind !== 3) return;
    this.parts.push({ x, y, vx, vy, life, max: life, size, color, kind, g });
  }

  private spark(x: number, y: number, color: string, n: number, speed: number, life: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * rand(0.3, 1);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1), 1.5, color, 2, 0);
    }
  }

  private debris(x: number, y: number, color: string, n: number, speed: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * rand(0.2, 1);
      this.particle(x + rand(-spread / 2, spread / 2) * 0.6, y + rand(-8, 8), Math.cos(a) * s, Math.sin(a) * s - 80, rand(0.5, 1), rand(2.5, 6), color, 0, 900);
    }
  }

  private ring(x: number, y: number, color: string, r: number, life: number) {
    this.particle(x, y, 0, 0, life, r, color, 3, 0);
  }

  private puff(x: number, y: number, color: string, r: number) {
    this.particle(x, y, rand(-40, 40), rand(-40, 40), rand(0.25, 0.5), r * rand(0.25, 0.45), color, 1, 0);
  }

  private text(x: number, y: number, text: string, color: string, size: number, life: number) {
    this.texts.push({ x, y, text, life, max: life, color, size });
  }

  private updateParticles(dt: number) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      if (p.kind === 3) continue;
      p.vy += p.g * dt;
      const drag = p.kind === 2 ? 3 : 1;
      p.vx *= 1 - Math.min(1, drag * dt);
      p.vy *= 1 - Math.min(1, drag * dt * (p.g ? 0.3 : 1));
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private updateTexts(dt: number) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 42 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  /* ───────────────────────── paper presentation ───────────────────────── */

  private render() {
    const ctx = this.ctx, s = this.scale, w = this.worldWidth;
    if (!this.bg) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.bg, 0, 0);
    const motion = !this.presentation.reducedMotion;
    const trauma = this.presentation.shake && motion ? Math.min(1, this.shake / 22) : 0;
    const kick = trauma * trauma * 8;
    ctx.setTransform(s, 0, 0, s, Math.sin(this.time * 83) * kick * s, Math.sin(this.time * 113 + 1) * kick * s);
    ctx.save(); ctx.beginPath(); ctx.rect(0, PLAY_TOP, w, H - PLAY_TOP); ctx.clip();
    ctx.strokeStyle = "rgba(39,44,38,.045)"; ctx.lineWidth = 1; ctx.setLineDash([2, 12]);
    ctx.beginPath();
    for (let x = this.margin; x < w; x += this.cellWidth) { ctx.moveTo(x, PLAY_TOP); ctx.lineTo(x, DANGER_Y); }
    ctx.stroke(); ctx.setLineDash([]);
    // The registration line is the actual breach boundary, not an ornamental floor.
    ctx.strokeStyle = `rgba(196,83,55,${.28 + this.danger * .5})`;
    ctx.setLineDash([6, 9]); ctx.beginPath(); ctx.moveTo(18, DANGER_Y); ctx.lineTo(w - 18, DANGER_Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `10px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = RED;
    ctx.globalAlpha = .6; ctx.fillText("ЛИНИЯ ПРОРЫВА", 22, DANGER_Y - 9); ctx.globalAlpha = 1;
    if (this.danger > .1) {
      ctx.fillStyle = `rgba(196,83,55,${this.danger * .07})`;
      ctx.fillRect(0, DANGER_Y - 80, w, 100);
    }
    if (this.net > 0) {
      ctx.strokeStyle = OLIVE; ctx.globalAlpha = .6; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, NET_Y); ctx.lineTo(w, NET_Y);
      for (let x = 0; x < w; x += 20) { ctx.moveTo(x, NET_Y); ctx.lineTo(x + 10, NET_Y + 8); ctx.lineTo(x + 20, NET_Y); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    this.drawBricks(ctx); this.drawOrbs(ctx); this.drawBalls(ctx); this.drawPaddle(ctx); this.drawFx(ctx);
    ctx.restore();
    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.drawHud(ctx);
    if (this.flashA > .01 && motion) {
      ctx.globalAlpha = Math.min(.16, this.flashA * .2); ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, PLAY_TOP, w, H - PLAY_TOP); ctx.globalAlpha = 1;
    }
    if (this.timeScale < .8) {
      ctx.strokeStyle = OLIVE; ctx.lineWidth = 3;
      ctx.strokeRect(3, PLAY_TOP + 3, w - 6, H - PLAY_TOP - 6);
      ctx.fillStyle = OLIVE; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText("ВРЕМЯ ЗАМЕДЛЕНО", w / 2, H - 18);
    }
  }

  private brickPath(ctx: CanvasRenderingContext2D, type: Brick["type"], x: number, y: number, w: number, h: number) {
    ctx.beginPath();
    const cut = Math.min(7, w / 8);
    if (type === "n") {
      ctx.moveTo(x, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (type === "x" || type === "g") {
      ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
      ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
      ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    } else { rr(ctx, x, y, w, h, type === "boss" ? 3 : 0); }
  }

  private drawBricks(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const br of this.bricks) {
      if (br.dead || br.y + br.h < PLAY_TOP) continue;
      const pal = this.palOf(br), boss = br.type === "boss";
      const bump = this.presentation.reducedMotion ? 0 : br.pop;
      const width = br.w * (1 + bump * .025), height = br.h * (1 - bump * .08);
      const x = br.x + (br.w - width) / 2, y = br.y + (br.h - height) / 2;
      this.brickPath(ctx, br.type, x + 2, y + 4, width, height);
      ctx.fillStyle = INK; ctx.globalAlpha = .13; ctx.fill(); ctx.globalAlpha = 1;
      this.brickPath(ctx, br.type, x, y, width, height);
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = boss ? PAPER : INK; ctx.lineWidth = 1;
      ctx.globalAlpha = .25;
      ctx.beginPath(); ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + Math.min(width * .3, 35), y + 7); ctx.stroke();
      if (br.type === "a") {
        ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
        ctx.fillStyle = PAPER; ctx.globalAlpha = .7;
        ctx.fillRect(x + 8, y + height / 2 - 3, 3, 6); ctx.fillRect(x + width - 11, y + height / 2 - 3, 3, 6);
      } else if (br.type === "x") {
        ctx.globalAlpha = .2; ctx.beginPath();
        for (let k = -height; k < width; k += 12) { ctx.moveTo(x + k, y + height); ctx.lineTo(x + k + height, y); }
        ctx.stroke();
      } else if (br.type === "g") {
        ctx.globalAlpha = .4; ctx.beginPath(); const gx = x + width / 2;
        ctx.moveTo(gx, y + 5); ctx.lineTo(gx + 9, y + height / 2); ctx.lineTo(gx, y + height - 5);
        ctx.lineTo(gx - 9, y + height / 2); ctx.closePath(); ctx.stroke();
      }
      if (br.hp < br.maxhp && !boss) {
        ctx.globalAlpha = .8; ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + width * .55, y); ctx.lineTo(x + width * .48, y + height * .35);
        ctx.lineTo(x + width * .59, y + height * .6); ctx.lineTo(x + width * .52, y + height); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Status effects each have their own printed mark and can coexist.
      if (br.frozen > 0) {
        ctx.fillStyle = "rgba(235,246,244,.4)"; ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = "#537e87"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
        ctx.fillStyle = "#355e68"; ctx.font = `bold 12px ${FONT}`; ctx.fillText("*", x + 7, y + 8);
      }
      if (br.burn > 0) { ctx.fillStyle = RED; ctx.fillRect(x, y + height - 3, width, 3); }
      if (br.poison > 0) {
        ctx.fillStyle = OLIVE;
        for (let i = 0; i < Math.min(5, br.pStacks); i++) { ctx.beginPath(); ctx.arc(x + 5 + i * 5, y + height - 7, 1.5, 0, Math.PI * 2); ctx.fill(); }
      }
      if (br.flash > 0 && !this.presentation.reducedMotion) {
        ctx.fillStyle = PAPER; ctx.globalAlpha = br.flash * .65; ctx.fillRect(x, y, width, height); ctx.globalAlpha = 1;
      }
      if (boss) {
        const ex = x + width / 2, ey = y + height * .38;
        ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5; ctx.globalAlpha = .8;
        ctx.beginPath(); ctx.ellipse(ex, ey, Math.min(40, width * .22), 13, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(ex + (this.presentation.reducedMotion ? 0 : Math.sin(this.time * 1.5) * 8), ey, 7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = PAPER; ctx.font = `bold 12px ${FONT}`;
        ctx.fillText(`БОСС / ${Math.ceil(br.hp)}`, ex, y + height - 14);
        ctx.fillStyle = RED; ctx.fillRect(x + 8, y + height - 5, (width - 16) * br.hp / br.maxhp, 2);
      } else {
        ctx.fillStyle = INK; ctx.font = `bold 13px ${FONT}`;
        ctx.fillText(String(Math.ceil(br.hp)), x + width / 2, y + height / 2 + 1);
        if (br.type === "x" && width > 65) { ctx.font = `9px ${FONT}`; ctx.fillText("TNT", x + width - 15, y + height / 2); }
      }
      ctx.restore();
    }
  }

  private drawOrbs(ctx: CanvasRenderingContext2D) {
    for (const orb of this.orbs) {
      ctx.save(); ctx.translate(orb.x, orb.y);
      ctx.fillStyle = orb.heart ? RED : GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1;
      if (orb.heart) { ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; ctx.fillText("+", 0, 5); }
      else { ctx.rotate(Math.PI / 4); ctx.fillRect(-3.5, -3.5, 7, 7); ctx.strokeRect(-3.5, -3.5, 7, 7); }
      ctx.restore();
    }
  }

  private drawBalls(ctx: CanvasRenderingContext2D) {
    if (this.phase === "ready" && this.screen !== "gameover") {
      const kinds = (Object.keys(this.arsenal) as Kind[]).flatMap(k => Array<Kind>(this.arsenal[k].count).fill(k)).slice(0, 12);
      kinds.forEach((kind, i) => this.drawBall(ctx, this.px + (i - (kinds.length - 1) / 2) * 13, PADDLE_Y - 16 - Math.sin(i / Math.max(1, kinds.length - 1) * Math.PI) * 8, kind, false));
    }
    for (const ball of this.balls) {
      if (!this.presentation.reducedMotion) {
        for (let i = ball.trail.length - 1; i >= 0; i--) {
          ctx.globalAlpha = (1 - i / ball.trail.length) * .18;
          ctx.fillStyle = KINDS[ball.kind].color;
          ctx.beginPath(); ctx.arc(ball.trail[i].x, ball.trail[i].y, BALL_R * (1 - i / (ball.trail.length + 1)) * .75, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      this.drawBall(ctx, ball.x, ball.y, ball.kind, ball.charged);
    }
  }

  private drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, kind: Kind, charged: boolean) {
    const r = BALL_R, col = KINDS[kind].color;
    ctx.fillStyle = "rgba(39,44,38,.16)"; ctx.beginPath(); ctx.arc(x + 2, y + 3, r + .5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fffcf5"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + .5, y + .5, kind === "normal" ? 2.5 : 3.8, 0, Math.PI * 2); ctx.fill();
    if (kind === "drill" || kind === "rail") {
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y - 4); ctx.stroke();
    }
    if (charged) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
  }

  private drawPaddle(ctx: CanvasRenderingContext2D) {
    if (this.screen === "gameover") return;
    const bump = this.presentation.reducedMotion ? 0 : this.padPop;
    const width = this.pw() * (1 + bump * .04), height = PADDLE_H * (1 - bump * .15);
    const x = this.px - width / 2, y = PADDLE_Y + PADDLE_H - height;
    ctx.fillStyle = "rgba(39,44,38,.16)"; ctx.fillRect(x + 3, y + 5, width, height);
    ctx.fillStyle = INK; rr(ctx, x, y, width, height, 2); ctx.fill();
    ctx.fillStyle = RED; ctx.fillRect(x + 3, y + 3, 5, height - 6); ctx.fillRect(x + width - 8, y + 3, 5, height - 6);
    const perfect = (.15 + .06 * (this.passives.parry || 0)) * this.pw();
    ctx.fillStyle = GOLD; ctx.fillRect(this.px - perfect / 2, y + 2, perfect, 2);
    ctx.fillStyle = PAPER; ctx.globalAlpha = .6;
    for (const offset of [-5, 0, 5]) ctx.fillRect(this.px + offset - 1, y + 6, 2, 4);
    ctx.globalAlpha = 1;
  }

  private drawFx(ctx: CanvasRenderingContext2D) {
    for (const bolt of this.bolts) {
      ctx.globalAlpha = bolt.life / bolt.max; ctx.strokeStyle = bolt.color; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(bolt.pts[0], bolt.pts[1]);
      for (let i = 2; i < bolt.pts.length; i += 2) {
        const x = bolt.pts[i], y = bolt.pts[i + 1];
        const px = bolt.pts[i - 2], py = bolt.pts[i - 1];
        ctx.lineTo((x + px) / 2 + (this.presentation.reducedMotion ? 0 : Math.sin(this.time * 40 + i) * 5), (y + py) / 2 - 4);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    let index = 0;
    for (const part of this.parts) {
      if (this.presentation.reducedMotion && index++ % 4) continue;
      const k = part.life / part.max;
      ctx.globalAlpha = Math.min(1, k * 1.6) * (part.kind === 1 ? .25 : .8);
      ctx.fillStyle = part.color; ctx.strokeStyle = part.color;
      if (part.kind === 3) {
        const radius = Math.max(.1, part.size * (1 - k * k));
        ctx.lineWidth = .5 + k; ctx.beginPath(); ctx.ellipse(part.x, part.y, radius * this.worldWidth / W, radius, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (part.kind === 2) {
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(part.x, part.y); ctx.lineTo(part.x - part.vx * .025, part.y - part.vy * .025); ctx.stroke();
      } else if (part.kind === 1) {
        ctx.beginPath(); ctx.arc(part.x, part.y, part.size * k * .45, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.save(); ctx.translate(part.x, part.y);
        if (!this.presentation.reducedMotion) ctx.rotate(part.life * part.vx * .018);
        const size = part.size * (.4 + .6 * k); ctx.fillRect(-size / 2, -size / 3, size, size * .65); ctx.restore();
      }
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const text of this.texts) {
      const k = text.life / text.max;
      ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = INK;
      ctx.font = `bold ${Math.min(24, text.size)}px ${FONT}`;
      ctx.lineWidth = 3; ctx.strokeStyle = PAPER; ctx.strokeText(text.text, text.x, text.y); ctx.fillText(text.text, text.x, text.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const w = this.worldWidth, narrow = w < 600;
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, PLAY_TOP - 1);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `bold 10px ${FONT}`; ctx.fillStyle = INK;
    ctx.fillText("ОЧКИ", 20, 23);
    ctx.fillText("ГЛУБИНА", narrow ? w * .4 : 230, 23);
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(Math.round(this.shownScore).toLocaleString("ru-RU"), 18, 53);
    ctx.fillStyle = RED; ctx.fillText(String(Math.max(0, this.rowIndex - 7)).padStart(2, "0"), narrow ? w * .4 : 230, 53);
    const hx = narrow ? w * .65 : 380;
    ctx.font = `bold 10px ${FONT}`; ctx.fillStyle = INK; ctx.fillText("ЖИЗНИ", hx, 23);
    for (let i = 0; i < this.maxHp; i++) {
      ctx.globalAlpha = i < this.hp ? 1 : .18; ctx.fillStyle = RED;
      ctx.save(); ctx.translate(hx + i * 14, 36); ctx.transform(1, -.2, 0, 1, 0, 0); ctx.fillRect(0, 0, 8, 16); ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.font = `bold 10px ${FONT}`; ctx.fillStyle = INK;
    ctx.fillText(`УР. ${this.level}`, 20, 85);
    const xpX = 78, xpWidth = Math.max(40, Math.min(300, w * .4));
    ctx.fillStyle = "rgba(39,44,38,.12)"; ctx.fillRect(xpX, 76, xpWidth, 5);
    ctx.fillStyle = OLIVE; ctx.fillRect(xpX, 76, xpWidth * clamp(this.xpShown, 0, 1), 5);
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(39,44,38,.65)";
    ctx.fillText(`${this.xp}/${this.xpNeed} ОПЫТ`, Math.min(w - 20, xpX + xpWidth + 105), 85);
    if (this.combo >= 3) {
      ctx.save(); ctx.translate(22, PADDLE_Y - 105);
      const pop = this.presentation.reducedMotion ? 1 : 1 + this.comboPop * .1; ctx.scale(pop, pop);
      ctx.textAlign = "left"; ctx.fillStyle = RED; ctx.font = `bold 32px ${FONT}`;
      ctx.fillText(`×${(1 + Math.min(7, this.combo * .1)).toFixed(1)}`, 0, 0);
      ctx.font = `10px ${FONT}`; ctx.fillStyle = INK; ctx.fillText(`СЕРИЯ / ${this.combo}`, 1, 18);
      ctx.fillStyle = RED; ctx.fillRect(1, 26, 75 * clamp(this.comboT / 2.4, 0, 1), 2); ctx.restore();
    }
    // A compact printed inventory remains available on phones as well as desktop.
    ctx.textAlign = "left"; ctx.font = `10px ${FONT}`;
    let x = 20;
    for (const kind of Object.keys(this.arsenal) as Kind[]) {
      const count = this.arsenal[kind].count; if (!count) continue;
      if (x + 32 > w - 110) break;
      ctx.fillStyle = KINDS[kind].color; ctx.beginPath(); ctx.arc(x + 3, H - 22, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.fillText(`×${count}`, x + 11, H - 19); x += 42;
    }
    if (this.net > 0 && x < w - 180) ctx.fillText(`СЕТКА ${this.net}`, x, H - 19);
    if (this.phase === "flying" && this.screen === "playing" && this.balls.length > 0 && this.balls.length <= Math.max(1, Math.ceil(this.volleySize * .5))) {
      ctx.fillStyle = "rgba(39,44,38,.6)"; ctx.textAlign = "center"; ctx.font = `10px ${FONT}`;
      ctx.fillText(narrow ? "ПРОБЕЛ / КЛИК — ВОЗВРАТ" : "ПРОБЕЛ / КЛИК — ВЕРНУТЬ ОСТАВШИЕСЯ ШАРЫ", w / 2, 909);
    }
    if (this.phase === "ready" && this.screen === "playing") {
      const remaining = clamp(this.readyT / Math.max(.001, this.readyMax), 0, 1);
      ctx.fillStyle = OLIVE; ctx.fillRect(this.px - 24, PADDLE_Y - 46, 48 * (1 - remaining), 2);
    }
    if (this.bannerT > 0 && this.screen !== "menu") {
      ctx.save(); ctx.globalAlpha = clamp(Math.min((2 - this.bannerT) * 5, this.bannerT * 2.5), 0, 1);
      const width = Math.min(w - 40, 590), x = (w - width) / 2;
      ctx.fillStyle = PAPER; ctx.fillRect(x, 390, width, 89);
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x, 390, width, 89);
      ctx.fillStyle = this.bannerColor; ctx.textAlign = "center"; ctx.font = `bold ${narrow ? 22 : 28}px ${FONT}`;
      ctx.fillText(this.bannerText.replace(/⚠/g, "").trim(), w / 2, 426, width - 20);
      ctx.fillStyle = INK; ctx.font = `12px ${FONT}`; ctx.fillText(this.bannerSub, w / 2, 454, width - 20);
      ctx.restore();
    }
  }
}
