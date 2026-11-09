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
  normal: { id: "normal", name: "Stock", icon: "●", color: "#272C26", desc: "A dependable ball. No tricks." },
  fire: { id: "fire", name: "Fire", icon: "✦", color: "#DF6546", desc: "Sets bricks burning: damage over time." },
  ice: { id: "ice", name: "Frost", icon: "❄", color: "#6E8B96", desc: "Freezes bricks: they crack 50% easier and the feed slows." },
  bolt: { id: "bolt", name: "Spark", icon: "↯", color: "#D8B568", desc: "Chains a strike into the nearest bricks." },
  bomb: { id: "bomb", name: "Bomb", icon: "✷", color: "#C0512F", desc: "Detonates on impact and clears the neighbourhood." },
  poison: { id: "poison", name: "Venom", icon: "☣", color: "#7F8C70", desc: "Spreads venom. A dying brick infects its neighbours." },
  drill: { id: "drill", name: "Drill", icon: "◎", color: "#8A6070", desc: "Punches straight through a brick." },
  nova: { id: "nova", name: "Nova", icon: "☀", color: "#D98E3A", desc: "Fire + Bomb: one enormous burning blast.", fusion: ["fire", "bomb"] },
  storm: { id: "storm", name: "Storm", icon: "✶", color: "#5F7E93", desc: "Frost + Spark: many arcs, each one freezing.", fusion: ["ice", "bolt"] },
  plague: { id: "plague", name: "Blight", icon: "☠", color: "#6E7F45", desc: "Venom + Fire: toxic flame that creeps across the wall.", fusion: ["poison", "fire"] },
  rail: { id: "rail", name: "Railgun", icon: "➤", color: "#A0525F", desc: "Drill + Spark: pierces nearly everything and strikes again.", fusion: ["drill", "bolt"] },
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
      return { boom: { r: 85 + 9 * L, dmg: 2 + 0.45 * L, burn: { dps: 1.8 + 0.6 * L, dur: 3.5 } }, burn: { dps: 1.8 + 0.6 * L, dur: 3.5 }, dmgMul: 1 };
    case "storm":
      return { freeze: 1.5 + 0.3 * L, arcs: { n: 3 + L, dmg: 0.9, range: 190 + L * 8, freeze: 1.2 + 0.25 * L }, dmgMul: 1 };
    case "plague":
      return { poison: { stacks: 2, dps: 0.9 + 0.25 * L }, burn: { dps: 1 + 0.4 * L, dur: 3.5 }, dmgMul: 1 };
    case "rail":
      return { pierce: 3 + L, arcs: { n: 1 + Math.floor((L + 1) / 2), dmg: 0.8, range: 170 }, dmgMul: 1 };
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
  { id: "dmg", name: "Sharp edges", icon: "✧", max: 8, desc: () => "+25% damage from every ball." },
  { id: "wide", name: "Wide margin", icon: "↔", max: 5, desc: () => "Paddle is 14% wider." },
  { id: "crit", name: "Marksman", icon: "◎", max: 5, desc: () => "+8% critical chance (×2 damage)." },
  { id: "ric", name: "Ricochet", icon: "⌐", max: 4, desc: () => "Each wall bounce adds +30% damage until the next hit." },
  { id: "net", name: "Safety net", icon: "⋈", max: 4, desc: () => "+2 saved balls per volley: fallen balls bounce back." },
  { id: "chill", name: "Slow feed", icon: "↓", max: 4, desc: () => "The wall descends 10% slower." },
  { id: "hp", name: "Solid hull", icon: "♥", max: 3, desc: () => "+1 max life and one life healed." },
  { id: "chrono", name: "Chronometer", icon: "◷", max: 3, desc: () => "Time warp drains slower and builds faster." },
  { id: "parry", name: "Parry master", icon: "✦", max: 3, desc: () => "Wider perfect zone, stronger charge (×2 and up)." },
  { id: "magnet", name: "Magnet", icon: "⌄", max: 3, desc: () => "XP crystals are pulled in from farther away." },
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
  date: number;
  id: number;
}

const KEY = "tirazh.scores.v1";
const NAME_KEY = "tirazh.name";
const MUTE_KEY = "tirazh.mute";

export function loadScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HighScore[];
    return Array.isArray(arr) ? arr : [];
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

export function getName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "PLAYER";
  } catch {
    return "PLAYER";
  }
}

export function setName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
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

/** Adds a score entry. Returns the new table and the id of the entry (or -1 if it didn't qualify). */
export function addScore(entry: Omit<HighScore, "id" | "date">): { table: HighScore[]; id: number } {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const full: HighScore = { ...entry, id, date: Date.now() };
  const table = [...loadScores(), full].sort((a, b) => b.score - a.score).slice(0, 8);
  saveScores(table);
  return { table, id: table.some((t) => t.id === id) ? id : -1 };
}

export function renameScore(id: number, name: string): HighScore[] {
  const table = loadScores().map((t) => (t.id === id ? { ...t, name } : t));
  saveScores(table);
  return table;
}
