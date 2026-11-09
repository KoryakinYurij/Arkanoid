import type { BaseKind, FusionKind } from "./data";
import { FUSION_KINDS } from "./data";

export type StarterId = "classic" | "ember" | "frost";

export interface ProgressFacts {
  fusions: FusionKind[];
  bosses: number;
  perfects: number;
  score: number;
}

export interface MetaProfile {
  version: 1;
  discoveries: FusionKind[];
  bestBosses: number;
  bestPerfects: number;
  bestScore: number;
  selectedStarter: StarterId;
}

export interface MetaUpdate {
  profile: MetaProfile;
  newDiscoveries: FusionKind[];
  newChallenges: string[];
  newUnlocks: string[];
}

export const STARTERS: Record<StarterId, {
  id: StarterId;
  name: string;
  desc: string;
  balls: { kind: BaseKind; count: number; level: number }[];
  unlock: string | null;
}> = {
  classic: {
    id: "classic", name: "Классика", desc: "Пять обычных шаров. Надёжный старт с большим залпом.",
    balls: [{ kind: "normal", count: 5, level: 1 }], unlock: null,
  },
  ember: {
    id: "ember", name: "Пиротехник", desc: "Три обычных шара и один огненный. Меньше шаров, но огонь доступен сразу.",
    balls: [{ kind: "normal", count: 3, level: 1 }, { kind: "fire", count: 1, level: 1 }], unlock: "first_boss",
  },
  frost: {
    id: "frost", name: "Криолог", desc: "Три обычных шара и один ледяной. Меньше шаров, но лёд доступен сразу.",
    balls: [{ kind: "normal", count: 3, level: 1 }, { kind: "ice", count: 1, level: 1 }], unlock: "first_fusion",
  },
};

type ChallengeId = "first_boss" | "first_fusion" | "precision" | "archive";

export interface ChallengeDef {
  readonly id: ChallengeId;
  readonly title: string;
  readonly desc: string;
  readonly reward: string;
  readonly target: number;
}

export const CHALLENGES: readonly ChallengeDef[] = [
  { id: "first_boss", title: "Первый босс", desc: "Победи одного босса.", reward: "Старт «Пиротехник»", target: 1 },
  { id: "first_fusion", title: "Первый синтез", desc: "Создай любой синтез шаров.", reward: "Старт «Криолог»", target: 1 },
  { id: "precision", title: "Точный расчёт", desc: "Сделай 10 идеальных отбиваний за один забег.", reward: "Один переброс карт за забег", target: 10 },
  { id: "archive", title: "Полный архив", desc: "Открой все четыре синтеза.", reward: "Титул «Мастер синтеза»", target: 4 },
];

export function defaultMeta(): MetaProfile {
  return {
    version: 1,
    discoveries: [],
    bestBosses: 0,
    bestPerfects: 0,
    bestScore: 0,
    selectedStarter: "classic",
  };
}

function nonnegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function discoveriesOf(value: unknown): FusionKind[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((kind): kind is FusionKind => FUSION_KINDS.includes(kind)))];
}

function challengeProgress(profile: MetaProfile, id: ChallengeId): number {
  switch (id) {
    case "first_boss": return profile.bestBosses;
    case "first_fusion":
    case "archive": return profile.discoveries.length;
    case "precision": return profile.bestPerfects;
  }
}

function challengeCompleted(profile: MetaProfile, id: ChallengeId): boolean {
  const challenge = CHALLENGES.find((definition) => definition.id === id)!;
  return challengeProgress(profile, id) >= challenge.target;
}

function starterUnlocked(profile: MetaProfile, id: StarterId): boolean {
  switch (id) {
    case "classic": return true;
    case "ember": return challengeCompleted(profile, "first_boss");
    case "frost": return challengeCompleted(profile, "first_fusion");
    default: return false;
  }
}

function normalizeMeta(value: unknown): MetaProfile {
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).version !== 1) return defaultMeta();
  const source = value as Record<string, unknown>;
  const profile: MetaProfile = {
    version: 1,
    discoveries: discoveriesOf(source.discoveries),
    bestBosses: nonnegativeInt(source.bestBosses),
    bestPerfects: nonnegativeInt(source.bestPerfects),
    bestScore: nonnegativeInt(source.bestScore),
    selectedStarter: "classic",
  };
  const selected = source.selectedStarter;
  if ((selected === "classic" || selected === "ember" || selected === "frost") && starterUnlocked(profile, selected)) {
    profile.selectedStarter = selected;
  }
  return profile;
}

const META_KEY = "sideeffect.test1.meta.v1";
let memoryProfile = defaultMeta();
let pendingSave = false;

export function loadMeta(): MetaProfile {
  // A failed write can leave readable but older data in storage.
  if (pendingSave) return normalizeMeta(memoryProfile);
  let raw: string | null;
  try {
    raw = localStorage.getItem(META_KEY);
  } catch {
    return normalizeMeta(memoryProfile);
  }
  try {
    memoryProfile = raw ? normalizeMeta(JSON.parse(raw)) : defaultMeta();
  } catch {
    memoryProfile = defaultMeta();
  }
  return normalizeMeta(memoryProfile);
}

export function saveMeta(profile: MetaProfile): void {
  memoryProfile = normalizeMeta(profile);
  pendingSave = true;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(memoryProfile));
    pendingSave = false;
  } catch {
    // Session progress remains usable when browser storage is unavailable.
  }
}

export function isStarterUnlocked(profile: MetaProfile, id: StarterId): boolean {
  return starterUnlocked(normalizeMeta(profile), id);
}

export function selectStarter(profile: MetaProfile, id: StarterId): MetaProfile {
  const next = normalizeMeta(profile);
  if (starterUnlocked(next, id)) next.selectedStarter = id;
  return next;
}

export function hasReroll(profile: MetaProfile): boolean {
  return challengeCompleted(normalizeMeta(profile), "precision");
}

export function getChallenges(profile: MetaProfile): (ChallengeDef & { progress: number; completed: boolean })[] {
  const normalized = normalizeMeta(profile);
  return CHALLENGES.map((challenge) => ({
    ...challenge,
    progress: Math.min(challenge.target, challengeProgress(normalized, challenge.id)),
    completed: challengeCompleted(normalized, challenge.id),
  }));
}

/** Merge cumulative snapshots from a run; repeated snapshots never grant a reward twice. */
export function applyProgress(profile: MetaProfile, facts: ProgressFacts): MetaUpdate {
  const previous = normalizeMeta(profile);
  const newDiscoveries = discoveriesOf(facts.fusions).filter((kind) => !previous.discoveries.includes(kind));
  const next: MetaProfile = {
    ...previous,
    discoveries: [...previous.discoveries, ...newDiscoveries],
    bestBosses: Math.max(previous.bestBosses, nonnegativeInt(facts.bosses)),
    bestPerfects: Math.max(previous.bestPerfects, nonnegativeInt(facts.perfects)),
    bestScore: Math.max(previous.bestScore, nonnegativeInt(facts.score)),
  };
  const completed = CHALLENGES.filter((challenge) =>
    !challengeCompleted(previous, challenge.id) && challengeCompleted(next, challenge.id));
  return {
    profile: next,
    newDiscoveries,
    newChallenges: completed.map((challenge) => challenge.id),
    newUnlocks: completed.map((challenge) => challenge.reward),
  };
}
