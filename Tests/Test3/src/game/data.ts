/**
 * Static game data: palette, ball kinds, fusion rules, passive upgrades,
 * and the local score sheet.
 *
 * The mechanical model (ball kinds, level scaling, fusion recipes, passives)
 * comes from the Neon Pit mechanic. The palette, naming voice and typography
 * are the Side Effect house style.
 */

export const PAL = {
  paper: "#F3EFE4",
  ink: "#272C26",
  red: "#DF6546",
  olive: "#7F8C70",
  gold: "#D8B568",
  field: "#E7E2D4",
  white: "#FFFCF5",
  /* riso-style extension inks, kept muted so they sit on paper */
  teal: "#4E7F86",
  violet: "#6B5B7E",
  rust: "#8C3B2E",
  orange: "#E08442",
  sky: "#8FB3C0",
  acid: "#93A83C",
  mulberry: "#B4567F",
} as const;

export type BaseKind = "normal" | "fire" | "ice" | "bolt" | "bomb" | "poison" | "drill";
export type FusionKind = "nova" | "storm" | "plague" | "rail";
export type Kind = BaseKind | FusionKind;

export interface KindDef {
  id: Kind;
  name: string;
  icon: string;
  color: string;
  desc: string;
  fusion?: [BaseKind, BaseKind];
}

export const KINDS: Record<Kind, KindDef> = {
  normal: {
    id: "normal",
    name: "Standard",
    icon: "●",
    color: PAL.ink,
    desc: "No tricks. A reliable ball that does exactly what it is told.",
  },
  fire: {
    id: "fire",
    name: "Fire",
    icon: "🔥",
    color: PAL.red,
    desc: "Sets stock alight. Burned bricks keep taking damage after the hit.",
  },
  ice: {
    id: "ice",
    name: "Frost",
    icon: "❄️",
    color: PAL.teal,
    desc: "Freezes stock brittle: +50% damage taken, and the press slows down.",
  },
  bolt: {
    id: "bolt",
    name: "Spark",
    icon: "⚡",
    color: PAL.gold,
    desc: "Chains lightning into the nearest bricks it can reach.",
  },
  bomb: {
    id: "bomb",
    name: "Bomb",
    icon: "💣",
    color: PAL.rust,
    desc: "Detonates on impact and takes everything nearby with it.",
  },
  poison: {
    id: "poison",
    name: "Venom",
    icon: "🧪",
    color: PAL.olive,
    desc: "Poisons stock. When it dies, the poison spreads to its neighbours.",
  },
  drill: {
    id: "drill",
    name: "Drill",
    icon: "🌀",
    color: PAL.violet,
    desc: "Punches clean through bricks instead of bouncing off them.",
  },
  nova: {
    id: "nova",
    name: "Nova",
    icon: "☀️",
    color: PAL.orange,
    desc: "Fire and Bomb, pressed together. One enormous scorching blast.",
    fusion: ["fire", "bomb"],
  },
  storm: {
    id: "storm",
    name: "Storm",
    icon: "🌩️",
    color: PAL.sky,
    desc: "Frost and Spark. Many arcs, and everything they touch freezes.",
    fusion: ["ice", "bolt"],
  },
  plague: {
    id: "plague",
    name: "Blight",
    icon: "🦠",
    color: PAL.acid,
    desc: "Venom and Fire. A toxic flame that keeps crawling across the field.",
    fusion: ["poison", "fire"],
  },
  rail: {
    id: "rail",
    name: "Rail",
    icon: "🚀",
    color: PAL.mulberry,
    desc: "Drill and Spark. Punches through almost anything, then arcs on.",
    fusion: ["drill", "bolt"],
  },
};

export const BASE_KINDS: BaseKind[] = ["normal", "fire", "ice", "bolt", "bomb", "poison", "drill"];
export const FUSION_KINDS: FusionKind[] = ["nova", "storm", "plague", "rail"];

export interface HitEffects {
  burn?: { dps: number; dur: number };
  freeze?: number;
  arcs?: { n: number; dmg: number; range: number; freeze?: number };
  boom?: { r: number; dmg: number; burn?: { dps: number; dur: number } };
  poison?: { stacks: number; dps: number };
  pierce?: number;
  dmgMul: number;
}

/** Level-scaled behaviour of every ball kind. `L` is the ball's own level. */
export function effectsOf(kind: Kind, L: number): HitEffects {
  switch (kind) {
    case "fire":
      return { burn: { dps: 1.1 + 0.6 * L, dur: 3.2 }, dmgMul: 1 };
    case "ice":
      return { freeze: 1.8 + 0.4 * L, dmgMul: 1 };
    case "bolt":
      return { arcs: { n: 1 + L, dmg: 0.75, range: 150 + L * 8 }, dmgMul: 0.9 };
    case "bomb":
      return { boom: { r: 50 + 9 * L, dmg: 1.1 + 0.3 * L }, dmgMul: 0.8 };
    case "poison":
      return { poison: { stacks: 1, dps: 0.7 + 0.2 * L }, dmgMul: 1 };
    case "drill":
      return { pierce: 1 + L, dmgMul: 0.85 };
    case "nova":
      return {
        boom: { r: 85 + 9 * L, dmg: 2 + 0.45 * L, burn: { dps: 1.8 + 0.6 * L, dur: 3.5 } },
        burn: { dps: 1.8 + 0.6 * L, dur: 3.5 },
        dmgMul: 1,
      };
    case "storm":
      return {
        freeze: 1.5 + 0.3 * L,
        arcs: { n: 3 + L, dmg: 0.9, range: 190 + L * 8, freeze: 1.2 + 0.25 * L },
        dmgMul: 1,
      };
    case "plague":
      return {
        poison: { stacks: 2, dps: 0.9 + 0.25 * L },
        burn: { dps: 1 + 0.4 * L, dur: 3.5 },
        dmgMul: 1,
      };
    case "rail":
      return {
        pierce: 3 + L,
        arcs: { n: 1 + Math.floor((L + 1) / 2), dmg: 0.8, range: 170 },
        dmgMul: 1,
      };
    default:
      return { dmgMul: 1 };
  }
}

export interface PassiveDef {
  id: string;
  name: string;
  icon: string;
  max: number;
  desc: (lvl: number) => string;
}

export const PASSIVES: PassiveDef[] = [
  { id: "dmg", name: "Sharp Edges", icon: "▲", max: 8, desc: () => "+25% damage on every ball." },
  { id: "wide", name: "Wide Margin", icon: "↔", max: 5, desc: () => "The plate is 14% wider." },
  { id: "crit", name: "Steady Hand", icon: "◎", max: 5, desc: () => "+8% chance of a critical hit (×2)." },
  { id: "ric", name: "Ricochet", icon: "↩", max: 4, desc: () => "Every wall bounce adds +30% damage until the next hit." },
  { id: "net", name: "Safety Net", icon: "⊞", max: 4, desc: () => "+2 saved balls per volley: a lost ball bounces back." },
  { id: "chill", name: "Slow Press", icon: "◑", max: 4, desc: () => "The wall of stock descends 10% slower." },
  { id: "hp", name: "Solid Frame", icon: "✚", max: 3, desc: () => "+1 max life, and a full heal to start." },
  { id: "chrono", name: "Clockmaker", icon: "◷", max: 3, desc: () => "Slow motion drains slower and refills faster." },
  { id: "parry", name: "Parry Master", icon: "✦", max: 3, desc: () => "Wider perfect-hit window, and a much heavier charge (×2 → more)." },
  { id: "magnet", name: "Ink Magnet", icon: "◉", max: 3, desc: () => "Ink crystals are pulled in from further away." },
];

export interface Card {
  id: string; // ball:x | lvl:x | fuse:x | pas:x
  type: "ball" | "level" | "fusion" | "passive";
  tag: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  sub?: string;
}

export interface HighScore {
  name: string;
  score: number;
  depth: number;
  level: number;
  date: string;
  id: number;
}

const KEY = "underpressure.scores.v1";
const NAME_KEY = "underpressure.name";
const MUTE_KEY = "underpressure.mute";
const SETTINGS_KEY = "underpressure.settings.v1";

export function loadScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HighScore[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (s) =>
          s &&
          typeof s.name === "string" &&
          Number.isFinite(s.score) &&
          s.score >= 0 &&
          Number.isInteger(s.level) &&
          s.level > 0 &&
          typeof s.date === "string" &&
          Number.isFinite(Date.parse(s.date)),
      )
      .map((s) => ({ ...s, name: cleanName(s.name) }))
      .sort((a, b) => b.score - a.score || b.level - a.level)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function saveScores(arr: HighScore[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function cleanName(s: string): string {
  return (s || "").replace(/[^a-zA-Z0-9 ._-]/g, "").trim().slice(0, 10).toUpperCase() || "PLAYER";
}

export function getName(): string {
  try {
    return cleanName(localStorage.getItem(NAME_KEY) || "PLAYER");
  } catch {
    return "PLAYER";
  }
}

export function setName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, cleanName(n));
  } catch {
    /* ignore */
  }
}

export function loadMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMute(m: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export interface Settings {
  sound: boolean;
  shake: boolean;
  reduced: boolean;
}

export function loadSettings(): Settings {
  const fallback: Settings = {
    sound: true,
    shake: true,
    reduced: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : fallback.sound,
      shake: typeof parsed.shake === "boolean" ? parsed.shake : fallback.shake,
      reduced: typeof parsed.reduced === "boolean" ? parsed.reduced : fallback.reduced,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Adds a score entry. Returns the new table and the id of the entry (or -1 if it didn't qualify). */
export function addScore(entry: Omit<HighScore, "id" | "date">): { table: HighScore[]; id: number } {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const full: HighScore = { ...entry, id, date: new Date().toISOString() };
  const table = [...loadScores(), full].sort((a, b) => b.score - a.score).slice(0, 10);
  saveScores(table);
  return { table, id: table.some((t) => t.id === id) ? id : -1 };
}

export function renameScore(id: number, name: string): HighScore[] {
  const table = loadScores().map((t) => (t.id === id ? { ...t, name: cleanName(name) } : t));
  saveScores(table);
  return table;
}
