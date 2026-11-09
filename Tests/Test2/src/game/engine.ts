import { BASE_KINDS, FUSION_KINDS, KINDS, PASSIVES, effectsOf } from "./data";
import type { Card, HitEffects, Kind } from "./data";
import { Sfx } from "./audio";

export const W = 540;
export const H = 960;
const PLAY_TOP = 34;
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
const FONT = "'Courier New',ui-monospace,SFMono-Regular,monospace";
const FONT_MONO = "'Courier New',ui-monospace,SFMono-Regular,monospace";
const INK = "#272C26";
const RED = "#DF6546";
const OLIVE = "#7F8C70";
const GOLD = "#D8B568";
const FIELD = "#E7E2D4";
const WHITE = "#FFFCF5";

export type Screen = "menu" | "playing" | "paused" | "levelup" | "gameover";

export interface Summary {
  score: number;
  depth: number;
  level: number;
  kills: number;
  maxCombo: number;
  perfects: number;
}

export interface Loadout {
  balls: { kind: Kind; count: number; level: number }[];
  passives: { id: string; name: string; icon: string; lvl: number }[];
}

export interface Stats {
  score: number;
  depth: number;
  combo: number;
  mult: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  warp: number;
}

export interface GameCallbacks {
  onScreen(s: Screen): void;
  onCards(cards: Card[]): void;
  onGameOver(r: Summary): void;
  onStats(s: Stats): void;
  onHint(text: string): void;
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
  sq: number;
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

const STOCK_INKS = ["#DF6546", "#DF6546", "#D8B568", "#D8B568", "#7F8C70", "#7F8C70", "#272C26", "#272C26"];
const PAL: Pal[] = Array.from({ length: 16 }, (_, i) => {
  const body = STOCK_INKS[Math.min(STOCK_INKS.length - 1, i)];
  const light = body !== INK;
  return { body, top: light ? INK : WHITE, dark: INK, glow: body };
});
const PAL_ARMOR: Pal = { body: "#8E9A82", top: INK, dark: INK, glow: "#8E9A82" };
const PAL_TNT: Pal = { body: "#C0512F", top: WHITE, dark: INK, glow: RED };
const PAL_GEM: Pal = { body: GOLD, top: INK, dark: INK, glow: GOLD };
const PAL_BOSS: Pal = { body: INK, top: WHITE, dark: INK, glow: RED };

function tierOf(hp: number) {
  const h = Math.max(1, Math.ceil(hp));
  if (h <= 10) return h - 1;
  return Math.min(15, 9 + Math.ceil((h - 10) / 6));
}

const UPGRADE_TEXT: Record<Kind, string> = {
  normal: "",
  fire: "Burns hotter and longer.",
  ice: "Freeze lasts longer.",
  bolt: "+1 arc target, and it reaches farther.",
  bomb: "Wider blast, heavier hit.",
  poison: "Venom bites harder.",
  drill: "+1 brick pierced.",
  nova: "More radius, more heat.",
  storm: "+1 arc, longer freeze.",
  plague: "Toxic flame turns meaner.",
  rail: "+1 pierce and more arcs.",
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Game {
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
  private shakeOn = true;
  private reduced = false;
  private statT = 0;

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
  private px = W / 2;
  private ptarget = W / 2;
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
  private flashColor = WHITE;
  private bannerT = 0;
  private bannerText = "";
  private bannerSub = "";
  private bannerColor = WHITE;
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
  }

  /* ───────────────────────── public API ───────────────────────── */

  setSize(cssW: number, dpr: number) {
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round((cssW * H * dpr) / W);
    this.scale = this.canvas.width / W;
    this.buildBg();
  }

  start() {
    this.sfx.init();
    this.sfx.play("select");
    this.reset(false);
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
    this.warpHeld = false;
    this.setScreen("paused");
  }

  resume() {
    if (this.screen !== "paused") return;
    this.setScreen("playing");
  }

  setMuted(m: boolean) {
    this.sfx.setMuted(m);
  }

  setShake(on: boolean) {
    this.shakeOn = on;
  }

  setReduced(on: boolean) {
    this.reduced = on;
  }

  pick(id: string) {
    if (this.screen !== "levelup") return;
    this.sfx.play("select");
    this.applyCard(id);
    this.setScreen("playing");
    if (this.pending > 0) this.openLevelUp();
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
    this.demo = demo;
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
    ars.normal = { count: 5, level: 1 };
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
    this.px = this.ptarget = W / 2;
    this.pvx = 0;
    this.kv = 0;
    for (let k = 6; k >= 0; k--) this.spawnRow(PLAY_TOP - ROW_H + this.accum + k * ROW_H);
    this.pushStats();
    if (!demo) this.hint("MOVE TO AIM. CLICK OR SPACE TO LAUNCH.");
  }

  private needFor(lvl: number) {
    return Math.floor(3 + (lvl - 1) * 2.2 + (lvl - 1) * (lvl - 1) * 0.14);
  }

  private pw() {
    return 110 * (1 + 0.14 * (this.passives.wide || 0));
  }

  private buildBg() {
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    g.scale(this.scale, this.scale);
    g.fillStyle = FIELD;
    g.fillRect(0, 0, W, H);

    // paper grain
    let sd = 101;
    const rnd = () => {
      sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0;
      return sd / 4294967296;
    };
    for (let i = 0; i < 4200; i++) {
      g.globalAlpha = 0.03 + rnd() * 0.05;
      g.fillStyle = i % 3 === 0 ? WHITE : INK;
      g.fillRect(rnd() * W, rnd() * H, rnd() < 0.08 ? 2 : 1, 1);
    }
    g.globalAlpha = 1;

    // side rails with row ticks
    g.strokeStyle = "rgba(39,44,38,0.14)";
    g.lineWidth = 1;
    for (const x of [9, W - 9]) {
      g.beginPath();
      g.moveTo(x + 0.5, PLAY_TOP);
      g.lineTo(x + 0.5, H - 10);
      g.stroke();
    }
    g.strokeStyle = "rgba(39,44,38,0.2)";
    for (let y = PLAY_TOP + 8; y < H - 14; y += ROW_H) {
      g.beginPath();
      g.moveTo(5, y + 0.5);
      g.lineTo(13, y + 0.5);
      g.moveTo(W - 13, y + 0.5);
      g.lineTo(W - 5, y + 0.5);
      g.stroke();
    }

    // dashed rules and captions
    g.globalAlpha = 0.22;
    g.strokeStyle = INK;
    g.setLineDash([2, 8]);
    g.beginPath();
    g.moveTo(16, PLAY_TOP - 7.5);
    g.lineTo(W - 16, PLAY_TOP - 7.5);
    g.moveTo(16, H - 34.5);
    g.lineTo(W - 16, H - 34.5);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.55;
    g.fillStyle = INK;
    g.font = `9px ${FONT_MONO}`;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillText("PRINT FLOOR", 17, PLAY_TOP - 13);
    g.textAlign = "right";
    g.fillText("FEED DOWN", W - 17, PLAY_TOP - 13);
    g.textAlign = "left";
    g.fillText("HANDLE WITH INTENTION", 17, H - 16);
    g.textAlign = "right";
    g.fillText("NO. 101", W - 17, H - 16);

    // corner register marks
    g.globalAlpha = 0.3;
    g.strokeStyle = INK;
    for (const [cx, cy] of [[16, PLAY_TOP + 6], [W - 16, PLAY_TOP + 6], [16, H - 27], [W - 16, H - 27]]) {
      g.beginPath();
      g.moveTo(cx - 3, cy);
      g.lineTo(cx + 3, cy);
      g.moveTo(cx, cy - 3);
      g.lineTo(cx, cy + 3);
      g.stroke();
    }
    g.globalAlpha = 1;
    this.bg = c;
  }

  /* ───────────────────────── input ───────────────────────── */

  private toWorld(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
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
    if (this.balls.length) this.text(this.px, PADDLE_Y - 60, "BALLS RECALLED", "#6E8B96", 16, 0.8);
    this.balls = [];
    this.phase = "ready";
    this.readyT = this.readyMax = 0.25;
    this.lowT = 0;
    this.hint("BALLS RECALLED. LINE UP A FRESH ANGLE.");
  }

  private bindInput() {
    const cv = this.canvas;
    const down = (e: PointerEvent) => {
      this.sfx.init();
      if (this.screen !== "playing") return;
      const p = this.toWorld(e);
      if (Math.hypot(p.x - 492, p.y - 908) < 34) {
        this.warpPtr = e.pointerId;
        this.warpHeld = true;
        cv.setPointerCapture?.(e.pointerId);
        return;
      }
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
    cv.addEventListener("contextmenu", (e) => e.preventDefault());

    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
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
      if (document.hidden) this.pause();
    };
    const blur = () => {
      this.keys.clear();
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
    this.statT += rdt;
    if (this.statT > 0.07) {
      this.statT = 0;
      this.pushStats();
    }

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

  private pushStats() {
    this.cb.onStats({
      score: Math.round(this.score),
      depth: Math.max(0, this.rowIndex - 7),
      combo: this.combo,
      mult: 1 + Math.min(7, this.combo * 0.1),
      hp: this.hp,
      maxHp: this.maxHp,
      level: this.level,
      xp: clamp(this.xp / Math.max(1, this.xpNeed), 0, 1),
      warp: clamp(this.warp / this.maxWarp(), 0, 1),
    });
  }

  private hint(text: string) {
    this.cb.onHint(text);
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
      this.ptarget = best ? best.x + Math.sin(this.time * 1.7) * pw * 0.28 : W / 2 + Math.sin(this.time) * 120;
    } else {
      const l = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
      const r = this.keys.has("ArrowRight") || this.keys.has("KeyD");
      const dir = (r ? 1 : 0) - (l ? 1 : 0);
      this.kv += (dir * 950 - this.kv) * Math.min(1, rdt * 16);
      if (Math.abs(this.kv) > 1) this.ptarget += this.kv * rdt;
    }
    this.ptarget = clamp(this.ptarget, pw / 2, W - pw / 2);
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
      sq: 0,
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
      b.sq = Math.max(0, b.sq - dt * 7);
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
        } else if (b.x > W - R) {
          b.x = W - R;
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
          b.sq = 1;
          this.sfx.play("paddle");
          if (Math.abs(off) < perfectWin && !this.demo) {
            if (!b.charged) {
              b.charged = true;
              this.perfects++;
              this.warp = Math.min(this.maxWarp(), this.warp + 7);
              this.ring(b.x, PADDLE_Y, GOLD, 60, 0.35);
              this.spark(b.x, PADDLE_Y, GOLD, 12, 320, 0.4);
              this.text(b.x, PADDLE_Y - 30, "PERFECT", GOLD, 18, 0.7);
              this.sfx.play("perfect");
              this.shake += 1.5;
            }
          } else {
            this.spark(b.x, PADDLE_Y, "#6E8B96", 4, 160, 0.25);
          }
        }

        // net / lost
        if (b.y + R > NET_Y && b.vy > 0) {
          if (this.net > 0) {
            this.net--;
            b.vy = -Math.abs(b.vy);
            b.y = NET_Y - R;
            this.sfx.play("net");
            this.ring(b.x, NET_Y, "#6E8B96", 36, 0.3);
            this.spark(b.x, NET_Y, "#6E8B96", 10, 260, 0.4);
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
    this.normalize(b);
    b.mom++;
    b.pierceLeft = fx.pierce || 0;
    b.ignore.length = 0;
    this.spark(b.x, b.y, INK, 2, 100, 0.2);
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
      this.ring(b.x, b.y, GOLD, 50, 0.3);
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
    b.sq = 1;

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
      this.spark(br.x + br.w / 2, br.y + br.h / 2, "#A9C3CB", 6, 140, 0.4);
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
        this.text(br.x + br.w / 2 + rand(-10, 10), br.y + 6, crit ? `${t}!` : `${t}`, crit ? GOLD : INK, crit ? 20 : 13, 0.55);
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
        const dx = t.x + t.w / 2 - cx;
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
    this.ring(x, y, WHITE, r * 0.55, 0.25);
    this.spark(x, y, color, Math.min(22, 8 + r / 8), 120 + r * 3, 0.5);
    for (let i = 0; i < 6; i++) this.puff(x + rand(-r / 3, r / 3), y + rand(-r / 3, r / 3), color, 40 + r * 0.5);
    this.shake = Math.min(26, this.shake + 2 + r / 22);
    this.sfx.play("boom");
    this.hitstop = Math.max(this.hitstop, r > 70 ? 0.05 : 0.025);
    for (const br of this.bricks) {
      if (br.dead || br === skip || br.y + br.h < PLAY_TOP) continue;
      const cx = clamp(x, br.x, br.x + br.w);
      const cy = clamp(y, br.y, br.y + br.h);
      const d = Math.hypot(x - cx, y - cy);
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
    this.spark(cx, cy, WHITE, boss ? 30 : 5, boss ? 520 : 260, 0.4);
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
      this.after(0.07, () => this.explode(cx, cy, 100, 5 + this.rowIndex * 0.5, "#C0512F", undefined, br));
    }
    if (br.poison > 0 || br.toxic) {
      for (const n of this.bricks) {
        if (n.dead || n.y + n.h < PLAY_TOP) continue;
        const d = Math.hypot(n.x + n.w / 2 - cx, n.y + n.h / 2 - cy);
        if (d < (boss ? 190 : 96)) {
          if (br.pStacks > 0) this.poison(n, Math.max(1, Math.floor(br.pStacks / 2)), br.pDps || 1, 4, br.toxic);
          if (br.toxic) this.ignite(n, 1.6, 3);
          this.spark(n.x + n.w / 2, n.y + n.h / 2, OLIVE, 3, 80, 0.4);
        }
      }
    }
    if (boss) {
      this.hitstop = Math.max(this.hitstop, 0.14);
      this.flash("#A33B52", 0.7);
      this.ring(cx, cy, "#A33B52", 260, 0.6);
      this.ring(cx, cy, WHITE, 160, 0.4);
      this.sfx.play("boom");
      this.showBanner("BOSS DOWN!", "+1 heart and a shower of XP", "#A33B52");
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
        if (Math.random() < dt * 14) this.particle(br.x + rand(0, br.w), br.y + rand(0, br.h), rand(-15, 15), rand(-70, -30), 0.45, rand(2, 4), RED, 1, 0);
        if (br.burn <= 0) br.burnDps = 0;
      }
      if (br.poison > 0) {
        br.poison -= dt;
        dot += br.pStacks * br.pDps * dt;
        if (Math.random() < dt * 6) this.particle(br.x + rand(0, br.w), br.y + rand(0, br.h), rand(-10, 10), rand(-40, -15), 0.6, rand(2, 3.5), OLIVE, 1, 0);
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
    this.debris(cx, cy, "#C24A32", 30, 400, br.w);
    this.explode(cx, DANGER_Y, 60, 0, "#C24A32");
    if (this.demo) return;
    const dmg = br.type === "boss" ? 2 : 1;
    this.hp -= dmg;
    this.shake = 28;
    this.flash("#ff1f44", 0.55);
    this.sfx.play("breach");
    this.vibrate(120);
    this.combo = 0;
    this.showBanner(this.hp > 0 ? "WALL BREACHED!" : "", this.hp > 0 ? `lives left: ${this.hp}` : "", "#C24A32");
    this.hint("WALL BREACHED — A LIFE LOST.");
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
      const bx = MARGIN + 2 * CW + GAP / 2;
      this.mk(bx, y - ROW_H + GAP / 2, 5 * CW - GAP, 2 * ROW_H - GAP, hp, "boss");
      this.showBanner("◇ BOSS ◇", "hit the core, not the shell", "#A33B52");
      this.sfx.play("breach");
    } else if (d > 0 && d % 10 === 0 && !this.demo) {
      this.showBanner(`DEPTH ${Math.max(0, d - 7)}`, "", "#6E8B96");
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
      this.mk(MARGIN + c * CW + GAP / 2, y + GAP / 2, CW - GAP, ROW_H - GAP, hp, type);
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
      const d = Math.hypot(dx, dy);
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
      } else if (o.x > W - 10) {
        o.x = W - 10;
        o.vx = -Math.abs(o.vx);
      }
      if (o.y >= PADDLE_Y - 8 && o.y <= PADDLE_Y + PADDLE_H + 14 && Math.abs(o.x - this.px) < pw / 2 + 10 && o.t > 0.15) {
        this.orbs.splice(i, 1);
        this.collect(o);
        continue;
      }
      if (o.y > H + 30) this.orbs.splice(i, 1);
      else if (Math.random() < dt * 20) this.particle(o.x, o.y, 0, 20, 0.3, 2, o.heart ? RED : GOLD, 1, 0);
    }
  }

  private collect(o: Orb) {
    if (o.heart) {
      if (this.hp < this.maxHp) {
        this.hp++;
        this.sfx.play("heal");
        this.text(this.px, PADDLE_Y - 30, "+1 LIFE", RED, 22, 0.9);
      } else {
        this.score += 500;
        this.text(this.px, PADDLE_Y - 30, "+500", RED, 20, 0.9);
      }
      this.ring(this.px, PADDLE_Y, RED, 70, 0.4);
    } else {
      this.xp += o.v;
      this.orbChain++;
      this.orbChainT = 0.6;
      this.sfx.play("orb", this.orbChain);
    }
    this.spark(o.x, PADDLE_Y, o.heart ? RED : GOLD, 5, 180, 0.3);
  }

  private openLevelUp() {
    this.pending--;
    this.choices = this.makeCards();
    this.sfx.play("levelup");
    this.ring(this.px, PADDLE_Y, GOLD, 160, 0.6);
    this.vibrate(30);
    this.setScreen("levelup");
    this.cb.onCards(this.choices);
    this.hint("PICK ONE. MUTATIONS LAST THE WHOLE RUN.");
  }

  private totalBalls() {
    return (Object.keys(this.arsenal) as Kind[]).reduce((s, k) => s + this.arsenal[k].count, 0);
  }

  private makeCards(): Card[] {
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
            card: { id: "ball:normal", type: "ball", tag: "+1 BALL", title: `${def.name} ×${a.count + 1}`, desc: "One more dependable ball in the volley.", icon: def.icon, color: def.color, sub: `Balls: ${a.count} → ${a.count + 1}` },
          });
        continue;
      }
      if (a.count === 0 && a.level === 0) {
        cands.push({ w: (early ? 6 : 3) * synergy(k), card: { id: `ball:${k}`, type: "ball", tag: "NEW BALL", title: def.name, desc: def.desc, icon: def.icon, color: def.color, sub: "Joins the volley" } });
      } else {
        if (a.count < 6 && total < MAX_BALLS)
          cands.push({ w: 1.5, card: { id: `ball:${k}`, type: "ball", tag: "+1 BALL", title: `${def.name} ×${a.count + 1}`, desc: def.desc, icon: def.icon, color: def.color, sub: `Balls: ${a.count} → ${a.count + 1}` } });
        if (a.level < 6)
          cands.push({ w: (a.level < 2 ? 3.5 : 2) * synergy(k), card: { id: `lvl:${k}`, type: "level", tag: "UPGRADE", title: `${def.name}: Lv. ${a.level + 1}`, desc: UPGRADE_TEXT[k], icon: def.icon, color: def.color, sub: `Level ${a.level} → ${a.level + 1}` } });
      }
    }
    for (const f of FUSION_KINDS) {
      const def = KINDS[f];
      const [x, y] = def.fusion!;
      const a = A[f];
      if (a.count > 0 || a.level > 0) {
        if (a.level < 6) cands.push({ w: 2.5, card: { id: `lvl:${f}`, type: "level", tag: "UPGRADE", title: `${def.name}: Lv. ${a.level + 1}`, desc: UPGRADE_TEXT[f], icon: def.icon, color: def.color, sub: `Level ${a.level} → ${a.level + 1}` } });
        if (a.count < 4 && total < MAX_BALLS) cands.push({ w: 1.2, card: { id: `ball:${f}`, type: "ball", tag: "+1 BALL", title: `${def.name} ×${a.count + 1}`, desc: def.desc, icon: def.icon, color: def.color, sub: `Balls: ${a.count} → ${a.count + 1}` } });
      } else if (A[x].count > 0 && A[y].count > 0 && A[x].level >= 2 && A[y].level >= 2) {
        cands.push({ w: 100, card: { id: `fuse:${f}`, type: "fusion", tag: "⚗ FUSION", title: def.name, desc: def.desc, icon: def.icon, color: GOLD, sub: `${KINDS[x].icon} + ${KINDS[y].icon} → 2 fused balls ${def.icon}` } });
      }
    }
    for (const p of PASSIVES) {
      const l = this.passives[p.id] || 0;
      if (l < p.max) cands.push({ w: early ? 1 : 1.6, card: { id: `pas:${p.id}`, type: "passive", tag: "PASSIVE", title: p.name, desc: p.desc(l + 1), icon: p.icon, color: "#9bb4ff", sub: `Level ${l} → ${l + 1} (max ${p.max})` } });
    }

    const picks: Card[] = [];
    const pool = cands.slice();
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
      const alt = cands.filter((c) => c.card.type === "ball" && !picks.includes(c.card));
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
      this.flash(GOLD, 0.6);
      this.shake = 18;
      this.ring(this.px, PADDLE_Y, GOLD, 240, 0.7);
      this.spark(this.px, PADDLE_Y, GOLD, 26, 500, 0.8);
      this.showBanner(`FUSION: ${def.name.toUpperCase()}`, def.desc, GOLD);
      this.hint(`FUSION BUILT: ${def.name.toUpperCase()}.`);      this.hint(`FUSION BUILT: ${def.name.toUpperCase()}.`);
      this.vibrate(60);
    } else if (t === "pas") {
      this.passives[k] = (this.passives[k] || 0) + 1;
      if (k === "hp") {
        this.maxHp++;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
      if (k === "wide") this.ptarget = clamp(this.ptarget, this.pw() / 2, W - this.pw() / 2);
    }
  }

  private gameOver() {
    this.sfx.play("gameover");
    this.flash("#ff1f44", 0.8);
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
    this.hint("THE PIT TOOK YOUR LAST BALL. GO AGAIN.");
    this.cb.onGameOver({
      score: this.score,
      depth: Math.max(0, this.rowIndex - 7),
      level: this.level,
      kills: this.kills,
      maxCombo: this.maxCombo,
      perfects: this.perfects,
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

  /* ───────────────────────── rendering ───────────────────────── */

  private brickPath(ctx: CanvasRenderingContext2D, type: Brick["type"], x: number, y: number, w: number, h: number) {
    const cut = Math.min(9, h * 0.42);
    ctx.beginPath();
    if (type === "n") {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - cut, y);
      ctx.lineTo(x + w, y + cut);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    } else if (type === "x") {
      const c = Math.min(8, h * 0.4);
      ctx.moveTo(x + c, y);
      ctx.lineTo(x + w - c, y);
      ctx.lineTo(x + w, y + c);
      ctx.lineTo(x + w, y + h - c);
      ctx.lineTo(x + w - c, y + h);
      ctx.lineTo(x + c, y + h);
      ctx.lineTo(x, y + h - c);
      ctx.lineTo(x, y + c);
      ctx.closePath();
    } else if (type === "g" || type === "boss") {
      rr(ctx, x, y, w, h, type === "boss" ? 8 : 6);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  private render() {
    const ctx = this.ctx;
    const s = this.scale;
    if (!this.bg) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.bg, 0, 0);

    const amp = this.shakeOn && !this.reduced ? Math.min(this.shake, 24) * 0.5 : 0;
    const sx = amp > 0.25 ? rand(-1, 1) * amp : 0;
    const sy = amp > 0.25 ? rand(-1, 1) * amp : 0;
    ctx.setTransform(s, 0, 0, s, sx * s, sy * s);

    ctx.save();
    ctx.beginPath();
    ctx.rect(-60, PLAY_TOP, W + 120, H - PLAY_TOP + 40);
    ctx.clip();
    // scrolling print rules
    ctx.strokeStyle = "rgba(39,44,38,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const off = ((this.gridOff % 48) + 48) % 48;
    for (let y = PLAY_TOP + off; y < H; y += 48) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();

    this.drawDanger(ctx);
    this.drawNet(ctx);
    this.drawBricks(ctx);
    ctx.restore();

    this.drawOrbs(ctx);
    this.drawBalls(ctx);
    this.drawPaddle(ctx);
    this.drawFx(ctx);

    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.drawBanner(ctx);
    this.drawWarp(ctx);

    if (this.flashA > 0.01) {
      ctx.globalAlpha = this.flashA * 0.34;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.timeScale < 0.95 && this.screen === "playing") {
      ctx.globalAlpha = (1 - this.timeScale) * 0.1;
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  private drawDanger(ctx: CanvasRenderingContext2D) {
    const k = this.danger;
    if (k > 0.01) {
      const g = ctx.createLinearGradient(0, DANGER_Y, 0, H);
      g.addColorStop(0, `rgba(223,101,70,${0.04 + 0.2 * k})`);
      g.addColorStop(1, "rgba(223,101,70,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, DANGER_Y, W, H - DANGER_Y);
    }
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.5 * k;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, DANGER_Y + 0.5);
    ctx.lineTo(W, DANGER_Y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `9px ${FONT_MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = RED;
    ctx.fillText("DANGER", W - 13, DANGER_Y - 7);
    ctx.restore();
  }

  private drawNet(ctx: CanvasRenderingContext2D) {
    if (this.net <= 0) return;
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, NET_Y + 0.5);
    ctx.lineTo(W, NET_Y + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 16) {
      ctx.moveTo(x, NET_Y);
      ctx.lineTo(x + 8, NET_Y + 12);
      ctx.lineTo(x + 16, NET_Y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawBricks(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const br of this.bricks) {
      if (br.dead || br.y + br.h < PLAY_TOP - 4) continue;
      const pal = this.palOf(br);
      const boss = br.type === "boss";
      const pop = this.reduced ? 0 : br.pop * 1.8;
      const x = br.x - pop;
      const y = br.y - pop;
      const w = br.w + pop * 2;
      const h = br.h + pop * 2;

      // printed shadow
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = INK;
      this.brickPath(ctx, br.type, x + 3, y + 4, w, h);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = pal.body;
      this.brickPath(ctx, br.type, x, y, w, h);
      ctx.fill();

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = WHITE;
      ctx.fillRect(x + 5, y + 2, Math.max(0, w - 10), 2);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = INK;
      ctx.fillStyle = INK;
      ctx.lineWidth = 1.2;
      if (br.type === "a") {
        ctx.globalAlpha = 0.5;
        rr(ctx, x + 5, y + 5, w - 10, h - 10, 2);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = WHITE;
        ctx.fillRect(x + 5, y + h / 2 - 3, 3, 6);
        ctx.fillRect(x + w - 8, y + h / 2 - 3, 3, 6);
        ctx.globalAlpha = 1;
      } else if (br.type === "x") {
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx + 2.6, cy - 2.6);
        ctx.lineTo(cx + 8, cy);
        ctx.lineTo(cx + 2.6, cy + 2.6);
        ctx.lineTo(cx, cy + 8);
        ctx.lineTo(cx - 2.6, cy + 2.6);
        ctx.lineTo(cx - 8, cy);
        ctx.lineTo(cx - 2.6, cy - 2.6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (br.type === "g") {
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = WHITE;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx + 7, cy);
        ctx.lineTo(cx, cy + 8);
        ctx.lineTo(cx - 7, cy);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (boss) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.fillStyle = WHITE;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.min(46, w * 0.34), 15, 0, 0, 6.283);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
        const px = cx + Math.sin(this.time * 1.6) * Math.min(14, w * 0.1);
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.arc(px, cy, 8, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(px, cy, 3, 0, 6.283);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.32;
        ctx.beginPath();
        ctx.moveTo(x + 7, y + 8.5);
        ctx.lineTo(x + Math.min(w - 20, 32), y + 8.5);
        ctx.stroke();
        ctx.globalAlpha = 0.4;
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.moveTo(x + w - 21 + j * 5, y + h - 8);
          ctx.lineTo(x + w - 17 + j * 5, y + h - 12);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (br.hp < br.maxhp && !boss) {
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.62, y + 1);
        ctx.lineTo(x + w * 0.52, y + h * 0.42);
        ctx.lineTo(x + w * 0.64, y + h * 0.64);
        ctx.lineTo(x + w * 0.54, y + h - 1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (br.frozen > 0) {
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = WHITE;
        this.brickPath(ctx, br.type, x, y, w, h);
        ctx.fill();
        ctx.save();
        this.brickPath(ctx, br.type, x, y, w, h);
        ctx.clip();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = -h; k < w; k += 9) {
          ctx.moveTo(x + k, y + h);
          ctx.lineTo(x + k + h, y);
        }
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      if (br.burn > 0) {
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(this.time * 16 + br.id);
        ctx.fillStyle = RED;
        this.brickPath(ctx, br.type, x, y, w, h);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (br.poison > 0) {
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = OLIVE;
        this.brickPath(ctx, br.type, x, y, w, h);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (br.flash > 0) {
        ctx.globalAlpha = br.flash * 0.7;
        ctx.fillStyle = WHITE;
        this.brickPath(ctx, br.type, x, y, w, h);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (boss) {
        ctx.font = `bold 22px ${FONT}`;
        ctx.fillStyle = WHITE;
        ctx.fillText(String(Math.ceil(br.hp)), x + w / 2, y + h - 16);
      } else if (br.hp > 1) {
        ctx.font = `bold 11px ${FONT}`;
        ctx.fillStyle = pal.top;
        ctx.fillText(String(Math.ceil(br.hp)), x + w / 2, y + h / 2 + 1);
      }
    }
  }

  private drawOrbs(ctx: CanvasRenderingContext2D) {
    for (const o of this.orbs) {
      const s = o.heart ? 9 : 6;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(o.x + 1.5, o.y + 2, s * 0.9, 0, 6.283);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (o.heart) {
        ctx.fillStyle = RED;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + s * 0.8);
        ctx.bezierCurveTo(o.x - s * 1.4, o.y - s * 0.2, o.x - s * 0.7, o.y - s * 1.2, o.x, o.y - s * 0.4);
        ctx.bezierCurveTo(o.x + s * 0.7, o.y - s * 1.2, o.x + s * 1.4, o.y - s * 0.2, o.x, o.y + s * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = GOLD;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.1;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }
  }

  private buildQueueCounts(): Kind[] {
    const q: Kind[] = [];
    (Object.keys(this.arsenal) as Kind[]).forEach((k) => {
      for (let i = 0; i < this.arsenal[k].count; i++) q.push(k);
    });
    return q.slice(0, 12);
  }

  private drawBallShape(ctx: CanvasRenderingContext2D, x: number, y: number, kind: Kind, charged: boolean, sq: number, r: number) {
    const squash = this.reduced ? 0 : clamp(sq, 0, 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + 0.22 * squash, 1 - 0.18 * squash);
    ctx.fillStyle = WHITE;
    ctx.strokeStyle = INK;
    ctx.lineWidth = r > 6 ? 2 : 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 6.283);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = KINDS[kind].color;
    ctx.beginPath();
    ctx.arc(0.5, 0.5, r * 0.52, 0, 6.283);
    ctx.fill();
    if (charged) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 3.5, 0, 6.283);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBalls(ctx: CanvasRenderingContext2D) {
    if (this.phase === "ready" && this.screen === "playing") {
      const q = this.buildQueueCounts().slice(0, 6);
      const ready = clamp(1 - this.readyT / Math.max(0.001, this.readyMax), 0, 1);
      for (let i = 0; i < q.length; i++) {
        const x = this.px + (i - (q.length - 1) / 2) * 16;
        const y = PADDLE_Y - 26 - Math.sin(this.time * 3 + i * 0.8) * 2 + (1 - ready) * 10;
        this.drawBallShape(ctx, x, y, q[i], false, 0, 4.5);
      }
    }
    for (const b of this.balls) {
      const tl = b.trail.length;
      ctx.fillStyle = INK;
      for (let i = tl - 1; i > 0; i--) {
        const t = b.trail[i];
        const k = 1 - i / tl;
        ctx.globalAlpha = k * 0.14;
        ctx.beginPath();
        ctx.arc(t.x, t.y, BALL_R * (0.35 + 0.5 * k), 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      this.drawBallShape(ctx, b.x, b.y, b.kind, b.charged, b.sq, BALL_R);
    }
  }

  private drawPaddle(ctx: CanvasRenderingContext2D) {
    if (this.screen === "gameover") return;
    const pw = this.pw();
    const w = pw * (1 + this.padPop * 0.04);
    const h = PADDLE_H * (1 - this.padPop * 0.18);
    const x = this.px - w / 2;
    const y = PADDLE_Y + (PADDLE_H - h);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = INK;
    rr(ctx, x + 3, y + 4, w, h, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    rr(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.fillRect(x + 2, y + 3, 5, h - 6);
    ctx.fillRect(x + w - 7, y + 3, 5, h - 6);
    const half = (0.15 + 0.06 * (this.passives.parry || 0)) * (pw / 2);
    ctx.fillStyle = GOLD;
    ctx.fillRect(this.px - half, y + h - 3.5, half * 2, 2.5);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = WHITE;
    for (let i = -1; i <= 1; i++) ctx.fillRect(this.px + i * 6 - 1, y + 4, 2, 3);
    ctx.globalAlpha = 1;
  }

  private boltPath(ctx: CanvasRenderingContext2D, pts: number[]) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2];
      const y0 = pts[i - 1];
      const x1 = pts[i];
      const y1 = pts[i + 1];
      const seg = 4;
      for (let s = 1; s < seg; s++) {
        const t = s / seg;
        ctx.lineTo(x0 + (x1 - x0) * t + rand(-8, 8), y0 + (y1 - y0) * t + rand(-8, 8));
      }
      ctx.lineTo(x1, y1);
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const b of this.bolts) {
      const k = clamp(b.life / b.max, 0, 1);
      ctx.globalAlpha = 0.4 * k;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 6;
      this.boltPath(ctx, b.pts);
      ctx.stroke();
      ctx.globalAlpha = k * 0.95;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      this.boltPath(ctx, b.pts);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const p of this.parts) {
      const k = clamp(p.life / p.max, 0, 1);
      if (p.kind === 3) {
        const e = 1 - k;
        ctx.globalAlpha = k * 0.5;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1 + 2.4 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - Math.pow(1 - e, 3)), 0, 6.283);
        ctx.stroke();
      } else if (p.kind === 2) {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === 1) {
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * k), 0, 6.283);
        ctx.fill();
      } else {
        const sz = p.size * (0.5 + 0.5 * k);
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 7);
        ctx.fillRect(-sz / 2, -sz / 3, sz, sz * 0.66);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const k = clamp(t.life / t.max, 0, 1);
      const pop = 1 + Math.max(0, k - 0.82) * 2.2;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = `bold ${Math.round(t.size * pop)}px ${FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = WHITE;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    if (this.bannerT <= 0) return;
    const t = 2 - this.bannerT;
    const a = clamp(Math.min(t * 6, this.bannerT * 3), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 20px ${FONT_MONO}`;
    const tw = ctx.measureText(this.bannerText).width;
    ctx.font = `10px ${FONT_MONO}`;
    const sw = this.bannerSub ? ctx.measureText(this.bannerSub).width : 0;
    const boxW = Math.max(tw, sw) + 40;
    const boxH = this.bannerSub ? 58 : 38;
    const bx = W / 2 - boxW / 2;
    const by = 352;
    ctx.fillStyle = "rgba(255,252,245,0.94)";
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = this.bannerColor;
    ctx.fillRect(bx + 1, by + 1, boxW - 2, 2);
    ctx.fillStyle = INK;
    ctx.font = `bold 20px ${FONT_MONO}`;
    ctx.fillText(this.bannerText, W / 2, by + (this.bannerSub ? 23 : 20));
    if (this.bannerSub) {
      ctx.font = `10px ${FONT_MONO}`;
      ctx.fillStyle = RED;
      ctx.fillText(this.bannerSub, W / 2, by + 42);
    }
    ctx.restore();
  }

  private drawWarp(ctx: CanvasRenderingContext2D) {
    if (this.screen !== "playing" && this.screen !== "paused") return;
    const x = 492;
    const y = 908;
    const r = 19;
    const frac = clamp(this.warp / this.maxWarp(), 0, 1);
    const active = this.timeScale < 0.8;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.stroke();
    // hourglass
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 6);
    ctx.lineTo(x + 5, y - 6);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 5, y + 6);
    ctx.lineTo(x - 5, y + 6);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.stroke();
    // charge ring
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = active ? RED : frac > 0.99 ? GOLD : INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
