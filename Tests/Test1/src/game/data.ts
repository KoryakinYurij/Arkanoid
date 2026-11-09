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
  normal: { id: "normal", name: "Классик", icon: "⚪", color: "#272c26", desc: "Надёжный шар. Без фокусов." },
  fire: { id: "fire", name: "Огненный", icon: "🔥", color: "#c45337", desc: "Поджигает кирпичи: урон со временем." },
  ice: { id: "ice", name: "Ледяной", icon: "❄️", color: "#537e87", desc: "Замораживает: кирпичи хрупкие (+50% урона) и падение замедляется." },
  bolt: { id: "bolt", name: "Молния", icon: "⚡", color: "#a87c32", desc: "Бьёт цепной молнией по ближайшим кирпичам." },
  bomb: { id: "bomb", name: "Бомба", icon: "💣", color: "#a64a3b", desc: "Взрывается при ударе, круша всё вокруг." },
  poison: { id: "poison", name: "Яд", icon: "🧪", color: "#647351", desc: "Накладывает яд. Умирая, кирпич заражает соседей." },
  drill: { id: "drill", name: "Бур", icon: "🌀", color: "#887087", desc: "Прошивает кирпичи насквозь." },
  nova: { id: "nova", name: "Нова", icon: "☀️", color: "#b26937", desc: "Огонь + Бомба: огромный поджигающий взрыв.", fusion: ["fire", "bomb"] },
  storm: { id: "storm", name: "Шторм", icon: "🌩️", color: "#55747d", desc: "Лёд + Молния: много дуг, замораживающих цели.", fusion: ["ice", "bolt"] },
  plague: { id: "plague", name: "Чума", icon: "🦠", color: "#6a7344", desc: "Яд + Огонь: токсичное пламя, что расползается по полю.", fusion: ["poison", "fire"] },
  rail: { id: "rail", name: "Рейлган", icon: "🚀", color: "#8c5864", desc: "Бур + Молния: пробивает почти всё и бьёт дугами.", fusion: ["drill", "bolt"] },
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
  { id: "dmg", name: "Острые края", icon: "🗡️", max: 8, desc: () => "+25% урона всех шаров." },
  { id: "wide", name: "Широкая платформа", icon: "↔️", max: 5, desc: () => "Платформа шире на 14%." },
  { id: "crit", name: "Меткий глаз", icon: "🎯", max: 5, desc: () => "+8% шанс критического удара (×2)." },
  { id: "ric", name: "Рикошет", icon: "📐", max: 4, desc: () => "Каждый отскок от стены даёт шару +30% урона до следующего удара." },
  { id: "net", name: "Страховочная сетка", icon: "🕸️", max: 4, desc: () => "+2 спасённых шара за залп: упавший шар отскакивает." },
  { id: "chill", name: "Тормоз пита", icon: "🐌", max: 4, desc: () => "Стена кирпичей падает на 10% медленнее." },
  { id: "hp", name: "Крепкий корпус", icon: "❤️", max: 3, desc: () => "+1 макс. жизнь и полное лечение на 1." },
  { id: "chrono", name: "Хронометр", icon: "⏳", max: 3, desc: () => "Замедление времени тратится медленнее и копится быстрее." },
  { id: "parry", name: "Мастер парирования", icon: "✨", max: 3, desc: () => "Шире зона идеального удара, мощнее заряд (×2 → больше)." },
  { id: "magnet", name: "Магнит опыта", icon: "🧲", max: 3, desc: () => "Кристаллы опыта притягиваются издалека." },
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
  starter?: "classic" | "ember" | "frost";
  rerollsUsed?: number;
}

const KEY = "sideeffect.test1.scores.v1";
const NAME_KEY = "sideeffect.test1.name";
const MUTE_KEY = "sideeffect.test1.mute";

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
    return localStorage.getItem(NAME_KEY) || "ИГРОК";
  } catch {
    return "ИГРОК";
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
