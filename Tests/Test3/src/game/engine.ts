/**
 * Under Pressure — game engine.
 *
 * The mechanical model (ball kinds, fusion recipes, passive upgrades, the
 * descending wall, the danger line, XP and level-up cards) comes from the
 * Neon Pit mechanic. Everything the player sees and hears — paper stock,
 * letterpress typography, paper-bit debris, hit-stop, trauma shake — comes
 * from the Side Effect house style.
 */

import { BASE_KINDS, FUSION_KINDS, KINDS, PASSIVES, effectsOf } from "./data";
import type { Card, HitEffects, Kind } from "./data";
import { Sfx } from "./audio";
import { PAL } from "./data";

/* ───────────────────────── world ───────────────────────── */

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

const MONO = '"Courier New", Courier, monospace';

/* ───────────────────────── types ───────────────────────── */

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

export interface HudState {
  score: number;
  level: number;
  combo: number;
  depth: number;
  lives: number;
  maxLives: number;
  balls: number;
  volley: number;
  warp: number;
  hint: string;
}

export interface GameCallbacks {
  onScreen(s: Screen): void;
  onCards(cards: Card[]): void;
  onGameOver(r: Summary): void;
  onHud(h: HudState): void;
}

type BrickType = "n" | "a" | "x" | "g" | "boss";

interface Brick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxhp: number;
  type: BrickType;
  flash: number;
  pop: number;
  bump: number;
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
  squash: number;
  impact: number;
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
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1;
  angle: number;
  spin: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
  big: boolean;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

interface Bolt {
  pts: number[];
  life: number;
  max: number;
  color: string;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* ───────────────────────── brick art ───────────────────────── */

/** Cut corner, the way a printed block is trimmed. */
function brickPath(
  g: CanvasRenderingContext2D,
  type: BrickType,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  g.beginPath();
  if (type === "n") {
    g.moveTo(x, y);
    g.lineTo(x + w - 9, y);
    g.lineTo(x + w, y + 9);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
  } else if (type === "x") {
    g.moveTo(x + 8, y);
    g.lineTo(x + w - 8, y);
    g.lineTo(x + w, y + 8);
    g.lineTo(x + w, y + h - 8);
    g.lineTo(x + w - 8, y + h);
    g.lineTo(x + 8, y + h);
    g.lineTo(x, y + h - 8);
    g.lineTo(x, y + 8);
    g.closePath();
  } else if (type === "g") {
    g.roundRect(x, y, w, h, 9);
  } else {
    g.rect(x, y, w, h);
  }
}

const BRICK_FILL: Record<BrickType, string> = {
  n: PAL.red,
  a: PAL.olive,
  x: PAL.gold,
  g: PAL.paper,
  boss: PAL.ink,
};

/** Pre-rendered block art: [type][cracked] → canvas. */
const sprites = new Map<string, HTMLCanvasElement>();

function spriteFor(type: BrickType, cracked: boolean, w: number, h: number): HTMLCanvasElement {
  const key = `${type}:${cracked ? 1 : 0}:${w}x${h}`;
  const hit = sprites.get(key);
  if (hit) return hit;

  const image = document.createElement("canvas");
  image.width = w + 12;
  image.height = h + 12;
  const b = image.getContext("2d")!;
  b.translate(6, 4);

  // soft print shadow
  brickPath(b, type, 0, 4, w, h);
  b.fillStyle = PAL.ink;
  b.globalAlpha = 0.15;
  b.fill();
  b.globalAlpha = 1;

  brickPath(b, type, 0, 0, w, h);
  b.fillStyle = BRICK_FILL[type];
  b.fill();
  b.strokeStyle = type === "boss" ? PAL.paper : PAL.ink;
  b.lineWidth = type === "boss" ? 2 : 1.3;
  b.stroke();

  b.fillStyle = type === "boss" ? PAL.paper : PAL.ink;
  b.strokeStyle = type === "boss" ? PAL.paper : PAL.ink;

  if (type === "n") {
    b.globalAlpha = 0.35;
    b.beginPath();
    b.moveTo(8, 8);
    b.lineTo(w - 24, 8);
    b.stroke();
    b.globalAlpha = 0.65;
    for (let j = 0; j < 3; j++) {
      b.beginPath();
      b.moveTo(w - 20 + j * 5, h - 9);
      b.lineTo(w - 16 + j * 5, h - 13);
      b.stroke();
    }
  } else if (type === "a") {
    b.globalAlpha = 0.65;
    b.strokeRect(5, 5, w - 10, h - 10);
    b.fillStyle = PAL.paper;
    b.fillRect(10, h / 2 - 3, 4, 6);
    b.fillRect(w - 14, h / 2 - 3, 4, 6);
    b.strokeStyle = PAL.paper;
    b.beginPath();
    b.moveTo(w / 2 - 5, 12);
    b.lineTo(w / 2 - 5, 22);
    b.moveTo(w / 2 + 5, 12);
    b.lineTo(w / 2 + 5, 22);
    b.stroke();
  } else if (type === "x") {
    b.globalAlpha = 0.85;
    b.beginPath();
    b.moveTo(w / 2 - 3, 7);
    b.lineTo(w / 2, 14);
    b.lineTo(w / 2 + 7, 17);
    b.lineTo(w / 2, 20);
    b.lineTo(w / 2 - 3, 27);
    b.lineTo(w / 2 - 6, 20);
    b.lineTo(w / 2 - 13, 17);
    b.lineTo(w / 2 - 6, 14);
    b.closePath();
    b.fill();
  } else if (type === "g") {
    // proof sheet: a pale plate with a registration cross
    b.globalAlpha = 0.5;
    b.strokeRect(4, 4, w - 8, h - 8);
    b.globalAlpha = 0.75;
    b.strokeStyle = PAL.red;
    b.lineWidth = 1.4;
    const cx = w / 2;
    const cy = h / 2;
    b.beginPath();
    b.moveTo(cx - 7, cy);
    b.lineTo(cx + 7, cy);
    b.moveTo(cx, cy - 7);
    b.lineTo(cx, cy + 7);
    b.stroke();
    b.strokeStyle = PAL.ink;
    b.globalAlpha = 0.4;
    b.beginPath();
    b.moveTo(9, 7);
    b.lineTo(9, h - 7);
    b.stroke();
  } else {
    // boss: a heavy block with a red band and a heart core
    b.fillStyle = PAL.red;
    b.fillRect(0, h / 2 - 5, w, 10);
    b.globalAlpha = 0.22;
    b.fillStyle = PAL.paper;
    for (let j = 0; j < 10; j++) b.fillRect(6 + j * (w / 10), 6, 4, h - 12);
    b.globalAlpha = 1;
    b.fillStyle = PAL.red;
    b.beginPath();
    b.arc(w / 2, h / 2, 11, 0, Math.PI * 2);
    b.fill();
    b.strokeStyle = PAL.paper;
    b.lineWidth = 1.5;
    b.stroke();
  }

  if (cracked) {
    b.globalAlpha = 0.85;
    b.strokeStyle = type === "g" || type === "boss" ? PAL.ink : PAL.paper;
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(w / 2, 0);
    b.lineTo(w / 2 - 6, 12);
    b.lineTo(w / 2 + 3, 20);
    b.lineTo(w / 2 - 4, h);
    b.stroke();
    b.globalAlpha = 1;
  }

  b.globalAlpha = 1;
  sprites.set(key, image);
  return image;
}

/* ───────────────────────── engine ───────────────────────── */

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly sfx = new Sfx();
  private cb: GameCallbacks;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private clock = 0;
  private view = { w: 0, h: 0, dpr: 1, scale: 1, x: 0, y: 0 };
  private bg: HTMLCanvasElement | null = null;

  screen: Screen = "menu";
  private demo = true;
  private shakeEnabled = true;
  private reduced = false;

  // world
  private bricks: Brick[] = [];
  private balls: Ball[] = [];
  private orbs: Orb[] = [];
  private parts: Part[] = [];
  private floats: FloatText[] = [];
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private timers: { t: number; fn: () => void }[] = [];
  private brickId = 1;

  // player
  private px = W / 2;
  private ptarget = W / 2;
  private pvx = 0;
  private kv = 0;
  private padBump = 0;
  private score = 0;
  private hp = 3;
  private maxHp = 3;
  private xp = 0;
  private xpNeed = 4;
  private level = 1;
  private pending = 0;
  private arsenal = {} as Record<Kind, { count: number; level: number }>;
  private passives: Record<string, number> = {};
  private combo = 0;
  private comboT = 0;
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
  private trauma = 0;
  private hitstop = 0;
  private flashA = 0;
  private flashColor: string = PAL.red;
  private bannerT = 0;
  private bannerText = "";
  private bannerSub = "";
  private bannerColor: string = PAL.ink;
  private choices: Card[] = [];
  private hint = "";
  private hintUntil = 0;

  // input
  private keys = new Set<string>();
  private movePtr = -1;
  private lastPX = 0;
  private overlayOpen = false;
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

  setSize(cssW: number, cssH: number, dpr: number) {
    const w = Math.max(1, cssW);
    const h = Math.max(1, cssH);
    this.view.w = w;
    this.view.h = h;
    this.view.dpr = Math.min(2, dpr);
    this.view.scale = Math.min(w / W, h / H);
    this.view.x = (w - W * this.view.scale) / 2;
    this.view.y = (h - H * this.view.scale) / 2;
    const cw = Math.round(w * this.view.dpr);
    const ch = Math.round(h * this.view.dpr);
    this.canvas.dataset.box = `${Math.round(w)}x${Math.round(h)} dpr${this.view.dpr}`;
    const sizeChanged = this.canvas.width !== cw || this.canvas.height !== ch;
    if (sizeChanged) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.ctx.imageSmoothingEnabled = true;
    }
    // The backdrop is rebuilt whenever the field changes size — and whenever it
    // is missing, which happens when the canvas element is reused by a fresh
    // engine instance (React remount) while its bitmap is already sized.
    if (!this.bg || sizeChanged) this.buildBg();
  }

  setOptions(o: { shake?: boolean; reduced?: boolean }) {
    if (typeof o.shake === "boolean") this.shakeEnabled = o.shake;
    if (typeof o.reduced === "boolean") this.reduced = o.reduced;
  }

  start() {
    this.sfx.init();
    this.sfx.play("select");
    this.reset(false);
    this.setScreen("playing");
    this.setHint("CLICK, TAP OR SPACE TO LAUNCH. THE PRESS DOES NOT WAIT.", 4);
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

  setWarpHeld(v: boolean) {
    this.warpHeld = v;
  }

  /** A DOM panel is on top of the field: swallow gameplay input. */
  setOverlayOpen(v: boolean) {
    this.overlayOpen = v;
    if (v) this.keys.clear();
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
    this.pushHud(true);
  }

  private reset(demo: boolean) {
    this.demo = demo;
    this.bricks = [];
    this.balls = [];
    this.orbs = [];
    this.parts = [];
    this.floats = [];
    this.rings = [];
    this.bolts = [];
    this.timers = [];
    this.score = 0;
    this.hp = 3;
    this.maxHp = 3;
    this.xp = 0;
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
    this.queue = [];
    this.net = 0;
    this.rowIndex = 0;
    this.accum = ROW_H * 0.9;
    this.skipCenter = 0;
    this.trauma = 0;
    this.hitstop = 0;
    this.flashA = 0;
    this.bannerT = 0;
    this.px = this.ptarget = W / 2;
    this.pvx = 0;
    this.kv = 0;
    this.setHint(demo ? "THE PRESS IS ALREADY MOVING." : "", 0);
    for (let k = 6; k >= 0; k--) this.spawnRow(PLAY_TOP - ROW_H + this.accum + k * ROW_H);
    this.pushHud(true);
  }

  private needFor(lvl: number) {
    return Math.floor(3 + (lvl - 1) * 2.2 + (lvl - 1) * (lvl - 1) * 0.14);
  }

  private pw() {
    return 110 * (1 + 0.14 * (this.passives.wide || 0));
  }

  private buildBg() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = PAL.field;
    g.fillRect(0, 0, W, H);

    // printed grain
    let s = 101;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 3200; i++) {
      g.globalAlpha = 0.035 + rnd() * 0.05;
      g.fillStyle = i % 3 === 0 ? PAL.white : PAL.ink;
      const x = rnd() * W;
      const y = rnd() * H;
      g.fillRect(x, y, rnd() < 0.1 ? 2 : 1, 1);
    }
    g.globalAlpha = 1;

    // registration rules
    g.globalAlpha = 0.16;
    g.strokeStyle = PAL.ink;
    g.lineWidth = 1;
    g.setLineDash([2, 8]);
    g.beginPath();
    g.moveTo(26, PLAY_TOP - 16);
    g.lineTo(W - 26, PLAY_TOP - 16);
    g.moveTo(26, NET_Y + 22);
    g.lineTo(W - 26, NET_Y + 22);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;

    g.globalAlpha = 0.42;
    g.font = `10px ${MONO}`;
    g.textAlign = "left";
    g.fillStyle = PAL.ink;
    g.fillText("THE PRESS FLOOR", 26, 84);
    g.textAlign = "right";
    g.fillText("MIND THE LINE", W - 26, 84);
    g.textAlign = "left";

    // corner crosses
    g.globalAlpha = 0.24;
    for (let i = 0; i < 4; i++) {
      const x = i % 2 === 0 ? 24 : W - 24;
      const y = i < 2 ? 100 : H - 26;
      g.beginPath();
      g.moveTo(x - 5, y);
      g.lineTo(x + 5, y);
      g.moveTo(x, y - 5);
      g.lineTo(x, y + 5);
      g.stroke();
    }
    g.globalAlpha = 1;

    // press rails down both edges
    g.globalAlpha = 0.1;
    g.strokeStyle = PAL.ink;
    g.lineWidth = 1;
    g.setLineDash([3, 7]);
    g.beginPath();
    g.moveTo(13, PLAY_TOP);
    g.lineTo(13, H);
    g.moveTo(W - 13, PLAY_TOP);
    g.lineTo(W - 13, H);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.18;
    g.beginPath();
    g.moveTo(0, PLAY_TOP + 0.5);
    g.lineTo(W, PLAY_TOP + 0.5);
    g.stroke();
    g.globalAlpha = 1;

    this.bg = c;
  }

  /* ───────────────────────── input ───────────────────────── */

  private toWorld(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const v = this.view;
    return { x: (e.clientX - r.left - v.x) / v.scale, y: (e.clientY - r.top - v.y) / v.scale };
  }

  private requestLaunch(manual = true) {
    if (this.phase === "ready") this.readyT = 0;
    else if (manual && this.phase === "flying" && this.balls.length <= Math.max(1, Math.ceil(this.volleySize * 0.5))) {
      this.recall();
    }
  }

  /** Dissolve the remaining balls and immediately prepare the next volley. */
  private recall() {
    for (const b of this.balls) {
      this.spark(b.x, b.y, KINDS[b.kind].color, 6, 200, 0.4);
      this.ring(b.x, b.y, KINDS[b.kind].color, 24, 0.3);
    }
    if (this.balls.length) this.float(this.px, PADDLE_Y - 60, "RECALLED", PAL.ink, false);
    this.balls = [];
    this.phase = "ready";
    this.readyT = 0.25;
    this.lowT = 0;
    this.setHint("NEW VOLLEY LOADED. SEND IT.", 2);
  }

  private bindInput() {
    const cv = this.canvas;
    const down = (e: PointerEvent) => {
      this.sfx.init();
      if (this.screen !== "playing") return;
      if (this.movePtr === -1) {
        this.movePtr = e.pointerId;
        this.lastPX = this.toWorld(e).x;
        if (e.pointerType === "mouse") this.ptarget = this.lastPX;
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
      if (c === "ArrowLeft" || c === "ArrowRight" || c === "Space" || c === "ArrowUp" || c === "ArrowDown") {
        e.preventDefault();
      }
      if (e.repeat && c !== "ArrowLeft" && c !== "ArrowRight") return;
      this.keys.add(c);
      if (c === "KeyM") {
        this.sfx.setMuted(!this.sfx.muted);
        return;
      }
      if (this.overlayOpen) return;
      switch (this.screen) {
        case "menu":
          if (c === "Enter" || c === "Space") this.start();
          break;
        case "gameover":
          if (c === "Enter" || c === "Space" || c === "KeyR") this.start();
          break;
        case "levelup": {
          const i =
            c === "Digit1" || c === "Numpad1" ? 0 : c === "Digit2" || c === "Numpad2" ? 1 : c === "Digit3" || c === "Numpad3" ? 2 : -1;
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
    rdt = Math.min(rdt, 0.1);
    this.clock += rdt;

    const dt = 1 / 60;
    this.acc += rdt;
    let steps = 0;
    while (this.acc >= dt && steps < 6) {
      this.acc -= dt;
      steps++;
      this.fixed(dt);
    }
    if (steps === 6) this.acc = 0;

    this.render();
  };

  private fixed(dt: number) {
    // cosmetics always run
    this.trauma = Math.max(0, this.trauma - dt * (1 / 0.3));
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.padBump = Math.max(0, this.padBump - dt * 7);
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.hintUntil > 0 && this.clock > this.hintUntil) {
      this.hintUntil = 0;
      this.hint = this.screen === "playing" ? "THE PLATE IS WIDE. THE EDGES MAKE SHARPER ANGLES." : "";
      this.pushHud(true);
    }

    const live = this.screen === "playing" || this.screen === "menu";
    if (!live) {
      this.updateTimers(dt);
      this.stepFX(dt);
      return;
    }

    let sdt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      sdt = 0;
    } else {
      const maxW = 100;
      const want =
        this.screen === "playing" &&
        (this.warpHeld ||
          this.keys.has("ShiftLeft") ||
          this.keys.has("ShiftRight") ||
          this.keys.has("KeyW") ||
          this.keys.has("ArrowUp")) &&
        this.warp > 0;
      const target = want ? 0.3 : 1;
      this.timeScale += (target - this.timeScale) * Math.min(1, dt * 10);
      if (want) this.warp = Math.max(0, this.warp - dt * 34 * (1 - 0.18 * (this.passives.chrono || 0)));
      this.warp = Math.min(maxW, this.warp);
      sdt = dt * this.timeScale;
    }

    this.sim(sdt, dt);
    this.stepFX(dt);
  }

  private sim(dt: number, rdt: number) {
    this.updatePaddle(rdt);
    this.updateVolley(dt);
    this.updateBalls(dt);
    this.updateBricks(dt);
    this.updateOrbs(dt);
    this.updateTimers(dt);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (this.orbChainT > 0) {
      this.orbChainT -= dt;
      if (this.orbChainT <= 0) this.orbChain = 0;
    }

    if (!this.demo && this.screen === "playing") {
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.pending++;
        this.xpNeed = this.needFor(this.level);
      }
      if (this.pending > 0) this.openLevelUp();
    }
    this.pushHud();
  }

  /* ───────────────────────── paddle & volley ───────────────────────── */

  private updatePaddle(rdt: number) {
    const pw = this.pw();
    if (this.demo) {
      let best: Ball | null = null;
      for (const b of this.balls) if (b.vy > 0 && (!best || b.y > best.y)) best = b;
      this.ptarget = best
        ? best.x + Math.sin(this.clock * 1.7) * pw * 0.28
        : W / 2 + Math.sin(this.clock) * 120;
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
      squash: 0,
      impact: 0,
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
        this.readyT = 0.55;
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

      let tr = b.trail.length >= 8 ? b.trail.pop()! : { x: 0, y: 0 };
      tr.x = b.x;
      tr.y = b.y;
      b.trail.unshift(tr);
      b.squash = Math.max(0, b.squash - dt);

      for (let s = 0; s < steps && !b.dead; s++) {
        b.x += b.vx * h;
        b.y += b.vy * h;

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

        // plate
        if (b.vy > 0 && b.y + R >= PADDLE_Y && b.y - R <= PADDLE_Y + PADDLE_H && Math.abs(b.x - this.px) <= pw / 2 + R * 0.8) {
          const off = clamp((b.x - this.px) / (pw / 2), -1, 1);
          const a = clamp(off * 1.05 + this.pvx / 2600, -1.2, 1.2);
          b.vx = Math.sin(a) * BALL_SPEED;
          b.vy = -Math.cos(a) * BALL_SPEED;
          b.y = PADDLE_Y - R - 0.5;
          b.pierceLeft = fx.pierce || 0;
          b.ignore.length = 0;
          b.squash = 0.12;
          b.impact = a;
          this.padBump = 1;
          this.sfx.play("paddle");
          this.addTrauma(0.065);
          if (Math.abs(off) < perfectWin && !this.demo) {
            if (!b.charged) {
              b.charged = true;
              this.perfects++;
              this.warp = Math.min(100, this.warp + 7);
              this.ring(b.x, PADDLE_Y, PAL.gold, 60, 0.35);
              this.spark(b.x, PADDLE_Y, PAL.gold, 12, 320, 0.4);
              this.float(b.x, PADDLE_Y - 30, "PERFECT", PAL.gold, true);
              this.sfx.play("perfect");
              this.addTrauma(0.16);
              this.setHint("PERFECT HIT. THE BALL IS CHARGED — NEXT BREAK HITS DOUBLE.", 2.6);
            }
          } else {
            this.spark(b.x, PADDLE_Y, PAL.ink, 4, 160, 0.25);
          }
        }

        // safety net / lost
        if (b.y + R > NET_Y && b.vy > 0) {
          if (this.net > 0) {
            this.net--;
            b.vy = -Math.abs(b.vy);
            b.y = NET_Y - R;
            this.sfx.play("net");
            this.ring(b.x, NET_Y, PAL.teal, 36, 0.3);
            this.spark(b.x, NET_Y, PAL.teal, 10, 260, 0.4);
            this.setHint("SAFETY NET CAUGHT IT. THE SHEET IS WORTH MORE THAN THE BALL.", 2.4);
          } else if (b.y - R > H + 10) {
            b.dead = true;
            this.sfx.play("lost");
            this.spark(b.x, H - 20, KINDS[b.kind].color, 8, 200, 0.4);
          }
        }

        if (b.ignore.length) {
          b.ignore = b.ignore.filter((br) => !br.dead && this.overlaps(b, br));
        }

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
            b.squash = 0.12;
            b.impact = Math.atan2(ny, nx) - Math.PI / 2;
          }
          this.hitBrick(b, br, fx);
          if (b.pierceLeft <= 0 || b.ignore.length === 0) break;
        }
      }
    }
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
    b.squash = 0.1;
    b.impact = Math.atan2(b.vy, b.vx) - Math.PI / 2;
    this.sfx.play("wall");
    this.spark(b.x, b.y, PAL.ink, 2, 100, 0.2);
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
      this.ring(b.x, b.y, PAL.gold, 50, 0.3);
      this.addTrauma(0.3);
    }
    if (Math.random() < 0.08 * (this.passives.crit || 0)) {
      dmg *= 2;
      crit = true;
    }
    if (br.frozen > 0) dmg *= 1.5;

    this.combo++;
    this.comboT = 2.4;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.sfx.play(crit ? "kill" : "hit", this.combo);
    this.addTrauma(0.06);
    this.spark(b.x, b.y, color, 4, 220, 0.3);

    const wasAlive = !br.dead;
    this.hurt(br, dmg, crit);

    if (wasAlive && !br.dead) {
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
      this.spark(br.x + br.w / 2, br.y + br.h / 2, PAL.teal, 6, 140, 0.4);
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
    br.bump = 1;
    if (!dot) {
      br.flash = 1;
      br.pop = 1;
      if (this.floats.length < 28) {
        const t = Math.max(1, Math.round(amt));
        this.float(br.x + br.w / 2 + rand(-10, 10), br.y + 6, crit ? `${t}!` : `${t}`, crit ? PAL.gold : PAL.ink, crit);
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
    this.ring(x, y, PAL.white, r * 0.55, 0.25);
    this.spark(x, y, color, Math.min(22, 8 + r / 8), 120 + r * 3, 0.5);
    for (let i = 0; i < 6; i++) this.puff(x + rand(-r / 3, r / 3), y + rand(-r / 3, r / 3), color, 40 + r * 0.5);
    this.addTrauma(0.2 + r / 110);
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
    const boss = br.type === "boss";
    const mult = 1 + Math.min(7, this.combo * 0.1);
    const typeMul = boss ? 6 : br.type === "g" ? 2 : br.type === "a" ? 1.4 : 1;
    const pts = Math.round(br.maxhp * 10 * mult * typeMul);
    this.score += pts;
    this.float(cx, cy - 4, `+${pts}`, boss ? PAL.red : PAL.ink, boss);
    this.debris(cx, cy, boss ? PAL.red : br.type === "g" ? PAL.olive : PAL.ink, boss ? 70 : 12, boss ? 520 : 260, br.w);
    this.spark(cx, cy, PAL.white, boss ? 30 : 5, boss ? 520 : 260, 0.4);
    this.sfx.play("kill", this.combo);
    this.addTrauma(boss ? 0.9 : 0.05);
    this.warp = Math.min(100, this.warp + 1.1 + 0.5 * (this.passives.chrono || 0));
    this.hitstop = Math.max(this.hitstop, boss ? 0.14 : 0.012);

    if (!this.demo) {
      let n = br.type === "g" ? 4 : br.type === "a" ? 2 : Math.random() < 0.8 ? 1 : 0;
      if (boss) n = 18;
      if (this.orbs.length > 90) n = Math.min(n, 1);
      for (let i = 0; i < n; i++) this.orb(cx + rand(-10, 10), cy + rand(-6, 6), 1, false);
      if (boss) this.orb(cx, cy, 0, true);
    }

    if (br.type === "x") {
      this.after(0.07, () => this.explode(cx, cy, 100, 5 + this.rowIndex * 0.5, PAL.gold, undefined, br));
    }
    if (br.poison > 0 || br.toxic) {
      for (const n of this.bricks) {
        if (n.dead || n.y + n.h < PLAY_TOP) continue;
        const d = Math.hypot(n.x + n.w / 2 - cx, n.y + n.h / 2 - cy);
        if (d < (boss ? 190 : 96)) {
          if (br.pStacks > 0) this.poison(n, Math.max(1, Math.floor(br.pStacks / 2)), br.pDps || 1, 4, br.toxic);
          if (br.toxic) this.ignite(n, 1.6, 3);
          this.spark(n.x + n.w / 2, n.y + n.h / 2, PAL.acid, 3, 80, 0.4);
        }
      }
    }
    if (boss) {
      this.hitstop = Math.max(this.hitstop, 0.14);
      this.flash(PAL.red, 0.7);
      this.ring(cx, cy, PAL.red, 260, 0.6);
      this.ring(cx, cy, PAL.white, 160, 0.4);
      this.sfx.play("boom");
      this.banner("PRESS CLEARED", "One life back, and a shower of ink.", PAL.red);
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
      br.bump = Math.max(0, br.bump - dt * 8);
      let dot = 0;
      if (br.burn > 0) {
        br.burn -= dt;
        dot += br.burnDps * dt;
        if (Math.random() < dt * 14) this.particle(br.x + rand(0, br.w), br.y + rand(0, br.h), rand(-15, 15), rand(-70, -30), 0.45, rand(2, 4), PAL.red, 0, 0);
        if (br.burn <= 0) br.burnDps = 0;
      }
      if (br.poison > 0) {
        br.poison -= dt;
        dot += br.pStacks * br.pDps * dt;
        if (Math.random() < dt * 6) this.particle(br.x + rand(0, br.w), br.y + rand(0, br.h), rand(-10, 10), rand(-40, -15), 0.6, rand(2, 3.5), PAL.acid, 0, 0);
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

    // the press: speeds up when the floor is clear, eases off when it is close
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

    // danger line
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
    this.debris(cx, cy, PAL.red, 30, 400, br.w);
    this.explode(cx, DANGER_Y, 60, 0, PAL.red);
    if (this.demo) return;
    const dmg = br.type === "boss" ? 2 : 1;
    this.hp -= dmg;
    this.addTrauma(1);
    this.flash(PAL.red, 0.55);
    this.sfx.play("lost");
    this.vibrate(120);
    this.combo = 0;
    this.banner(this.hp > 0 ? "THE LINE BROKE" : "", this.hp > 0 ? `${this.hp} lives left` : "", PAL.red);
    this.setHint(this.hp > 0 ? "THE PRESS GOT THROUGH. BREAK FASTER." : "", 3);
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
      this.banner("THE PRESS ITSELF", "Hit the core. It takes two.", PAL.red);
      this.sfx.play("lost");
    } else if (d > 0 && d % 10 === 0 && !this.demo) {
      this.banner(`DEPTH ${Math.max(0, d - 7)}`, "", PAL.ink);
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
      let type: BrickType = "n";
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

  private mk(x: number, y: number, w: number, h: number, hp: number, type: BrickType) {
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
      bump: 0,
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
      else if (Math.random() < dt * 20) this.particle(o.x, o.y, 0, 20, 0.3, 2, o.heart ? PAL.red : PAL.ink, 1, 0);
    }
  }

  private collect(o: Orb) {
    if (o.heart) {
      if (this.hp < this.maxHp) {
        this.hp++;
        this.sfx.play("heal");
        this.float(this.px, PADDLE_Y - 30, "+1 LIFE", PAL.red, true);
      } else {
        this.score += 500;
        this.float(this.px, PADDLE_Y - 30, "+500", PAL.red, true);
      }
      this.ring(this.px, PADDLE_Y, PAL.red, 70, 0.4);
    } else {
      this.xp += o.v;
      this.orbChain++;
      this.orbChainT = 0.6;
      this.sfx.play("orb", this.orbChain);
    }
    this.spark(o.x, PADDLE_Y, o.heart ? PAL.red : PAL.ink, 5, 180, 0.3);
  }

  private openLevelUp() {
    this.pending--;
    this.choices = this.makeCards();
    this.sfx.play("levelup");
    this.ring(this.px, PADDLE_Y, PAL.ink, 160, 0.6);
    this.vibrate(30);
    this.setScreen("levelup");
    this.cb.onCards(this.choices);
  }

  private totalBalls() {
    return (Object.keys(this.arsenal) as Kind[]).reduce((s, k) => s + this.arsenal[k].count, 0);
  }

  private makeCards(): Card[] {
    const cands: { card: Card; w: number }[] = [];
    const total = this.totalBalls();
    const early = this.level <= 3;
    const A = this.arsenal;
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
        if (a.count < 8 && total < MAX_BALLS) {
          cands.push({
            w: 0.7,
            card: {
              id: "ball:normal",
              type: "ball",
              tag: "+1 BALL",
              title: `${def.name} ×${a.count + 1}`,
              desc: "One more reliable ball in the volley.",
              icon: def.icon,
              color: def.color,
              sub: `Balls: ${a.count} → ${a.count + 1}`,
            },
          });
        }
        continue;
      }
      if (a.count === 0 && a.level === 0) {
        cands.push({
          w: (early ? 6 : 3) * synergy(k),
          card: {
            id: `ball:${k}`,
            type: "ball",
            tag: "NEW BALL",
            title: def.name,
            desc: def.desc,
            icon: def.icon,
            color: def.color,
            sub: "Added to the volley",
          },
        });
      } else {
        if (a.count < 6 && total < MAX_BALLS) {
          cands.push({
            w: 1.5,
            card: {
              id: `ball:${k}`,
              type: "ball",
              tag: "+1 BALL",
              title: `${def.name} ×${a.count + 1}`,
              desc: def.desc,
              icon: def.icon,
              color: def.color,
              sub: `Balls: ${a.count} → ${a.count + 1}`,
            },
          });
        }
        if (a.level < 6) {
          cands.push({
            w: (a.level < 2 ? 3.5 : 2) * synergy(k),
            card: {
              id: `lvl:${k}`,
              type: "level",
              tag: "IMPROVEMENT",
              title: `${def.name}: level ${a.level + 1}`,
              desc: UPGRADE_TEXT[k],
              icon: def.icon,
              color: def.color,
              sub: `Level ${a.level} → ${a.level + 1}`,
            },
          });
        }
      }
    }

    for (const f of FUSION_KINDS) {
      const def = KINDS[f];
      const [x, y] = def.fusion!;
      const a = A[f];
      if (a.count > 0 || a.level > 0) {
        if (a.level < 6) {
          cands.push({
            w: 2.5,
            card: {
              id: `lvl:${f}`,
              type: "level",
              tag: "IMPROVEMENT",
              title: `${def.name}: level ${a.level + 1}`,
              desc: UPGRADE_TEXT[f],
              icon: def.icon,
              color: def.color,
              sub: `Level ${a.level} → ${a.level + 1}`,
            },
          });
        }
        if (a.count < 4 && total < MAX_BALLS) {
          cands.push({
            w: 1.2,
            card: {
              id: `ball:${f}`,
              type: "ball",
              tag: "+1 BALL",
              title: `${def.name} ×${a.count + 1}`,
              desc: def.desc,
              icon: def.icon,
              color: def.color,
              sub: `Balls: ${a.count} → ${a.count + 1}`,
            },
          });
        }
      } else if (A[x].count > 0 && A[y].count > 0 && A[x].level >= 2 && A[y].level >= 2) {
        cands.push({
          w: 100,
          card: {
            id: `fuse:${f}`,
            type: "fusion",
            tag: "FUSION",
            title: def.name,
            desc: def.desc,
            icon: def.icon,
            color: PAL.red,
            sub: `${KINDS[x].icon} + ${KINDS[y].icon} → 2 × ${def.icon}`,
          },
        });
      }
    }

    for (const p of PASSIVES) {
      const l = this.passives[p.id] || 0;
      if (l < p.max) {
        cands.push({
          w: early ? 1 : 1.6,
          card: {
            id: `pas:${p.id}`,
            type: "passive",
            tag: "PERMANENT EDGE",
            title: p.name,
            desc: p.desc(l + 1),
            icon: p.icon,
            color: PAL.olive,
            sub: `Level ${l} → ${l + 1} (max ${p.max})`,
          },
        });
      }
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
      this.float(this.px, PADDLE_Y - 40, `+ ${KINDS[k as Kind].name}`, KINDS[k as Kind].color, true);
      this.deploy(k as Kind, 1);
    } else if (t === "lvl") {
      this.arsenal[k as Kind].level++;
    } else if (t === "fuse") {
      const def = KINDS[k as Kind];
      const [x, y] = def.fusion!;
      this.arsenal[x].count--;
      this.arsenal[y].count--;
      this.arsenal[k as Kind] = { count: 2, level: 1 };
      for (const ing of [x, y]) {
        const i = this.balls.findIndex((bb) => bb.kind === ing);
        if (i >= 0) {
          this.balls.splice(i, 1);
          this.volleySize--;
        }
      }
      this.deploy(k as Kind, 2);
      this.sfx.play("fuse");
      this.flash(PAL.gold, 0.6);
      this.addTrauma(0.75);
      this.ring(this.px, PADDLE_Y, PAL.gold, 240, 0.7);
      this.spark(this.px, PADDLE_Y, PAL.gold, 26, 500, 0.8);
      this.banner(`FUSION: ${def.name.toUpperCase()}`, def.desc, PAL.red);
      this.vibrate(60);
      this.setHint(`${def.name.toUpperCase()} IS IN THE VOLLEY. IT WILL NOT BE SUBTLE.`, 3);
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
    this.flash(PAL.red, 0.8);
    this.vibrate(250);
    this.hitstop = 0;
    this.timeScale = 1;
    const bs = this.bricks.filter((b) => !b.dead);
    bs.forEach((b, i) => {
      this.after(0.05 + i * 0.012, () => {
        this.debris(b.x + b.w / 2, b.y + b.h / 2, PAL.ink, 8, 300, b.w);
        this.addTrauma(0.1);
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
    });
  }

  /* ───────────────────────── fx ───────────────────────── */

  private addTrauma(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

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

  private banner(text: string, sub: string, color: string) {
    if (!text) return;
    this.bannerText = text;
    this.bannerSub = sub;
    this.bannerColor = color;
    this.bannerT = 2;
  }

  private setHint(text: string, dur: number) {
    this.hint = text;
    this.hintUntil = dur > 0 ? this.clock + dur : 0;
    this.pushHud(true);
  }

  private particle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: 0 | 1, g: number) {
    if (this.parts.length > 600) return;
    this.parts.push({
      x,
      y,
      px: x,
      py: y,
      vx,
      vy,
      life,
      max: life,
      size,
      color,
      kind,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
    });
    void g;
  }

  private spark(x: number, y: number, color: string, n: number, speed: number, life: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * rand(0.3, 1);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1), 1.5 + Math.random() * 2, color, 0, 0);
    }
  }

  private debris(x: number, y: number, color: string, n: number, speed: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * rand(0.2, 1);
      this.particle(
        x + rand(-spread / 2, spread / 2) * 0.6,
        y + rand(-8, 8),
        Math.cos(a) * s,
        Math.sin(a) * s - 80,
        rand(0.5, 1),
        rand(2.5, 6),
        color,
        0,
        900,
      );
    }
  }

  private ring(x: number, y: number, color: string, r: number, life: number) {
    if (this.rings.length > 24) this.rings.shift();
    this.rings.push({ x, y, r, life, max: life, color });
  }

  private puff(x: number, y: number, color: string, r: number) {
    this.particle(x, y, rand(-40, 40), rand(-40, 40), rand(0.25, 0.5), r * rand(0.25, 0.45), color, 1, 0);
  }

  private float(x: number, y: number, text: string, color: string, big: boolean) {
    if (this.floats.length > 28) this.floats.shift();
    this.floats.push({ x, y, text, life: 0.78, max: 0.78, color, big });
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

  private stepFX(dt: number) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.px = p.x;
      p.py = p.y;
      p.vy += 360 * dt;
      const drag = p.kind === 0 ? 1 : 2;
      p.vx *= 1 - Math.min(1, drag * dt);
      p.vy *= 1 - Math.min(1, drag * dt * 0.5);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const q = this.rings[i];
      q.life -= dt;
      if (q.life <= 0) this.rings.splice(i, 1);
    }
    this.bolts = this.bolts.filter((b) => (b.life -= dt) > 0);
  }

  /* ───────────────────────── hud ───────────────────────── */

  private lastHud = "";

  private pushHud(force = false) {
    /* the title screen runs a live demo — it must not report a score */
    const demo = this.demo;
    const hud: HudState = {
      score: demo ? 0 : this.score,
      level: demo ? 1 : this.level,
      combo: demo ? 0 : this.combo,
      depth: demo ? 0 : Math.max(0, this.rowIndex - 7),
      lives: demo ? 3 : Math.max(0, this.hp),
      maxLives: this.maxHp,
      balls: this.balls.length,
      volley: this.volleySize,
      warp: this.warp,
      hint: this.hint,
    };
    const key = `${hud.score}|${hud.level}|${hud.combo}|${hud.depth}|${hud.lives}|${hud.balls}|${Math.round(hud.warp / 2)}|${hud.hint}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.cb.onHud(hud);
  }

  /* ───────────────────────── rendering ───────────────────────── */

  private render() {
    const ctx = this.ctx;
    const v = this.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.field;
    ctx.fillRect(0, 0, v.w, v.h);
    if (!this.bg) return;
    ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.x, v.dpr * v.y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    const shake = this.shakeEnabled && !this.reduced ? this.trauma * this.trauma * 8 : 0;
    ctx.translate(Math.sin(this.clock * 83) * shake, Math.sin(this.clock * 113 + 1) * shake);

    ctx.drawImage(this.bg, 0, 0);

    // scrolling press rules
    ctx.strokeStyle = "rgba(39,44,38,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = PLAY_TOP + this.gridOff; y < H; y += 48) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();

    // danger line
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 8);
    const dg = ctx.createLinearGradient(0, DANGER_Y - 70, 0, DANGER_Y + 70);
    dg.addColorStop(0, "rgba(223,101,70,0)");
    dg.addColorStop(1, `rgba(223,101,70,${0.08 + this.danger * (0.18 + 0.1 * pulse)})`);
    ctx.fillStyle = dg;
    ctx.fillRect(0, DANGER_Y - 70, W, H - DANGER_Y + 70);
    ctx.strokeStyle = `rgba(223,101,70,${0.45 + this.danger * 0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(0, DANGER_Y);
    ctx.lineTo(W, DANGER_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `9px ${MONO}`;
    ctx.fillStyle = `rgba(223,101,70,${0.5 + this.danger * 0.5})`;
    ctx.textAlign = "left";
    ctx.fillText("DANGER LINE", 6, DANGER_Y - 6);

    // safety net
    if (this.net > 0) {
      ctx.strokeStyle = `rgba(78,127,134,${0.6 + 0.3 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, NET_Y);
      ctx.lineTo(W, NET_Y);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(78,127,134,0.3)";
      ctx.beginPath();
      for (let x = 0; x < W; x += 18) {
        ctx.moveTo(x, NET_Y);
        ctx.lineTo(x + 9, NET_Y + 20);
        ctx.moveTo(x + 18, NET_Y);
        ctx.lineTo(x + 9, NET_Y + 20);
      }
      ctx.stroke();
    }

    // bricks
    for (const br of this.bricks) {
      if (br.dead) continue;
      const img = spriteFor(br.type, br.hp < br.maxhp, br.w, br.h);
      const scale = this.reduced ? 1 : 1 + br.bump * 0.06;
      if (scale !== 1) {
        ctx.save();
        ctx.translate(br.x + br.w / 2, br.y + br.h / 2);
        ctx.scale(scale, 2 - scale);
        ctx.drawImage(img, -br.w / 2 - 6, -br.h / 2 - 4);
        ctx.restore();
      } else {
        ctx.drawImage(img, br.x - 6, br.y - 4);
      }
      if (br.maxhp > 1) {
        ctx.font = `bold 11px ${MONO}`;
        ctx.textAlign = "right";
        /* ink numbers on light stock, paper numbers on dark stock */
        ctx.fillStyle =
          br.type === "x" || br.type === "g" ? PAL.ink : PAL.paper;
        ctx.fillText(String(Math.max(1, Math.ceil(br.hp))), br.x + br.w - 7, br.y + 13);
        ctx.textAlign = "left";
      }
      // status marks
      if (br.frozen > 0) {
        ctx.strokeStyle = "rgba(78,127,134,0.75)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(br.x + 2.5, br.y + 2.5, br.w - 5, br.h - 5);
      }
      if (br.burn > 0 || br.poison > 0) {
        const c = br.burn > 0 ? PAL.red : PAL.acid;
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.clock * 9);
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.strokeRect(br.x + 1, br.y + 1, br.w - 2, br.h - 2);
        ctx.globalAlpha = 1;
      }
      if (br.flash > 0) {
        ctx.globalAlpha = br.flash * 0.55;
        ctx.fillStyle = PAL.white;
        ctx.fillRect(br.x, br.y, br.w, br.h);
        ctx.globalAlpha = 1;
      }
    }

    // lightning arcs
    for (const b of this.bolts) {
      const a = b.life / b.max;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.pts[0], b.pts[1]);
      for (let i = 2; i < b.pts.length - 2; i += 2) {
        const jx = (Math.random() - 0.5) * 10;
        const jy = (Math.random() - 0.5) * 10;
        ctx.lineTo(b.pts[i] + jx, b.pts[i + 1] + jy);
      }
      ctx.lineTo(b.pts[b.pts.length - 2], b.pts[b.pts.length - 1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // rings
    for (const q of this.rings) {
      const t = 1 - q.life / q.max;
      ctx.globalAlpha = (1 - t) * (this.reduced ? 0.2 : 0.55);
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 2 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // plate
    this.drawPaddle(ctx);

    /* aim guide: where the next volley will leave the plate */
    if (this.phase === "ready" && !this.demo && this.screen === "playing") {
      const a = -Math.PI / 2 + clamp(this.pvx / 3500, -0.3, 0.3);
      ctx.strokeStyle = PAL.ink;
      ctx.globalAlpha = 0.19;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 12]);
      ctx.beginPath();
      ctx.moveTo(this.px, PADDLE_Y - 30);
      ctx.lineTo(this.px + Math.cos(a) * 190, PADDLE_Y - 30 + Math.sin(a) * 190);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // balls
    for (const b of this.balls) {
      if (!this.reduced) {
        for (let n = b.trail.length - 1; n > 0; n--) {
          const p = b.trail[n];
          ctx.globalAlpha = (1 - n / b.trail.length) * 0.16;
          ctx.fillStyle = KINDS[b.kind].color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, BALL_R * (1 - n / b.trail.length) * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      this.drawBall(ctx, b);
    }

    // ink crystals — the experience you catch with the plate
    for (const o of this.orbs) {
      ctx.save();
      ctx.translate(o.x, o.y);
      if (o.heart) {
        ctx.rotate(Math.sin(o.t * 3) * 0.22);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(-6.5, -1.6, 13, 3.2);
        ctx.fillRect(-1.6, -6.5, 3.2, 13);
      } else {
        ctx.rotate(o.t * 2.2);
        ctx.fillStyle = PAL.paper;
        ctx.strokeStyle = PAL.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 6);
        ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // particles
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.7);
      ctx.fillStyle = p.color;
      if (p.kind === 0) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // floating type
    ctx.textAlign = "center";
    for (const f of this.floats) {
      const t = 1 - f.life / f.max;
      const ease = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = Math.min(1, f.life / 0.22);
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.big ? 13 : 15}px ${MONO}`;
      ctx.fillText(f.text, f.x, f.y - (this.reduced ? 13 : 34 * ease));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // banner
    if (this.bannerT > 0) {
      const a = Math.min(1, this.bannerT * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = PAL.paper;
      ctx.fillRect(0, PLAY_TOP + 26, W, 44);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(0, PLAY_TOP + 26, W, 1.5);
      ctx.fillRect(0, PLAY_TOP + 68, W, 1.5);
      ctx.textAlign = "center";
      ctx.fillStyle = this.bannerColor;
      ctx.font = `bold 19px ${MONO}`;
      ctx.fillText(this.bannerText, W / 2, PLAY_TOP + 48);
      if (this.bannerSub) {
        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = PAL.ink;
        ctx.globalAlpha = a * 0.7;
        ctx.fillText(this.bannerSub, W / 2, PLAY_TOP + 63);
      }
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    if (this.flashA > 0) {
      ctx.globalAlpha = this.flashA * (this.reduced ? 0.12 : 0.3);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private drawPaddle(ctx: CanvasRenderingContext2D) {
    const pw = this.pw();
    const h = PADDLE_H * (1 + this.padBump * 0.17);
    const x = this.px - pw / 2;
    const y = PADDLE_Y;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(x + 3, y + 5, pw, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.ink;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, h, 3);
    ctx.fill();
    ctx.fillStyle = PAL.red;
    ctx.fillRect(x + 3, y + 3, 6, h - 6);
    ctx.fillRect(x + pw - 9, y + 3, 6, h - 6);
    ctx.fillStyle = PAL.paper;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(this.px - 7, y + 5, 2, 6);
    ctx.fillRect(this.px - 1, y + 5, 2, 6);
    ctx.fillRect(this.px + 5, y + 5, 2, 6);
    ctx.globalAlpha = 1;
  }

  private drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
    const def = KINDS[b.kind];
    const squash = this.reduced ? 0 : b.squash / 0.12;
    /* The standard ball is bare paper with an ink core; every other kind
       carries its own ink so the volley can be read at a glance. */
    const plain = b.kind === "normal";
    const fill = plain ? PAL.white : def.color;
    const core = plain ? PAL.ink : PAL.paper;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.impact);
    ctx.scale(1 + 0.25 * squash, 1 - 0.2 * squash);
    ctx.fillStyle = PAL.ink;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.arc(2, 3, BALL_R + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = fill;
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // type mark
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    if (b.charged) {
      ctx.strokeStyle = PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const UPGRADE_TEXT: Record<Kind, string> = {
  normal: "",
  fire: "Burns hotter and longer.",
  ice: "The freeze lasts longer.",
  bolt: "+1 chain target, and a longer reach.",
  bomb: "A wider blast and a harder edge.",
  poison: "The venom bites deeper.",
  drill: "+1 brick punched through.",
  nova: "A wider blast and a fiercer burn.",
  storm: "+1 arc, and a longer freeze.",
  plague: "The toxic flame turns meaner.",
  rail: "+1 punch and more arcs.",
};
