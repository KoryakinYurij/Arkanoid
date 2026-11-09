import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Game } from "./game/engine";
import { getGameLayout } from "./game/layout";
import type { Hud, Loadout, Screen, Summary } from "./game/engine";
import { BASE_KINDS, FUSION_KINDS, KINDS, PASSIVES, addScore, getName, loadMute, loadScores, renameScore, saveMute, setName as persistName } from "./game/data";
import type { Card, FusionKind, HighScore, Kind } from "./game/data";
import { STARTERS, applyProgress, getChallenges, hasReroll, isStarterUnlocked, loadMeta, saveMeta, selectStarter } from "./game/meta";
import type { MetaProfile, StarterId } from "./game/meta";

type Sheet = "help" | "settings" | "scores" | "build" | "workshop";
type Presentation = { shake: boolean; reducedMotion: boolean };
const GLYPHS: Record<Kind, string> = { normal: "●", fire: "♨", ice: "✳", bolt: "ϟ", bomb: "✹", poison: "∴", drill: "↗", nova: "☼", storm: "≋", plague: "※", rail: "⇢" };
const TONES: Record<Kind, string> = { normal: "#50574a", fire: "#bd563a", ice: "#537d7a", bolt: "#967322", bomb: "#a44435", poison: "#70804f", drill: "#79677f", nova: "#b27b31", storm: "#55777d", plague: "#6c7948", rail: "#8b5c64" };
const PRESENTATION_KEY = "sideeffect.presentation.v1";
const STARTER_IDS: StarterId[] = ["classic", "ember", "frost"];
const GAME_KEYS = new Set(["Space", "Enter", "Escape", "KeyP", "KeyR", "KeyM", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight", "Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"]);

function starterName(id: unknown) {
  return STARTER_IDS.includes(id as StarterId) ? STARTERS[id as StarterId].name : STARTERS.classic.name;
}

function initialPresentation(): Presentation {
  const fallback = { shake: true, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
  try {
    const saved = JSON.parse(localStorage.getItem(PRESENTATION_KEY) || "null");
    return { shake: typeof saved?.shake === "boolean" ? saved.shake : fallback.shake, reducedMotion: typeof saved?.reducedMotion === "boolean" ? saved.reducedMotion : fallback.reducedMotion };
  } catch { return fallback; }
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ w: Math.floor(window.visualViewport?.width ?? window.innerWidth), h: Math.floor(window.visualViewport?.height ?? window.innerHeight) });
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => { window.removeEventListener("resize", update); window.visualViewport?.removeEventListener("resize", update); };
  }, []);
  return size;
}

function Arrow() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>; }
function SoundIcon({ muted }: { muted: boolean }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z" />{muted ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" />}</svg>; }
function KindMark({ kind }: { kind: Kind }) { return <span className="kind-mark" style={{ "--tone": TONES[kind] } as CSSProperties} aria-hidden="true">{GLYPHS[kind]}</span>; }

function ScoreTable({ rows, me }: { rows: HighScore[]; me?: number }) {
  if (!rows.length) return <p className="empty-scores">Чистый лист.<br />Самое время оставить свой след.</p>;
  return <div className="score-table-wrap"><table className="score-table"><caption className="sr-only">Лучшие результаты на этом устройстве, с указанием стартовой сборки и использованных смен карточек</caption><thead><tr><th>№</th><th>Имя</th><th>Очки</th><th>Глуб.</th><th>Ур.</th><th>Старт</th><th title="Использовано смен карточек">Смен</th></tr></thead><tbody>{rows.map((r, i) => <tr key={r.id} className={r.id === me ? "your-score" : ""}><td>{String(i + 1).padStart(2, "0")}</td><td className="score-name">{r.name}</td><td>{r.score.toLocaleString("ru-RU")}</td><td>{r.depth}</td><td>{r.level}</td><td className="score-starter">{starterName(r.starter)}</td><td>{r.rerollsUsed ?? 0}</td></tr>)}</tbody></table></div>;
}
function Arsenal({ loadout }: { loadout: Loadout | null }) {
  return <><h3 className="section-label">Шары в залпе</h3><div className="arsenal-list">{loadout?.balls.map((b) => <div className="arsenal-item" key={b.kind} data-kind={b.kind}><KindMark kind={b.kind} /><span>{KINDS[b.kind].name}<small>уровень {b.level}</small></span><b>×{b.count}</b></div>)}</div><h3 className="section-label">Улучшения забега</h3>{loadout?.passives.length ? <ul className="passive-list">{loadout.passives.map((p) => <li key={p.id}><span>{p.name}</span><b>ур. {p.lvl}</b></li>)}</ul> : <p className="sidebar-note">Пока нет. Выбирай их при повышении уровня.</p>}</>;
}

function FusionBoard({ loadout }: { loadout: Loadout | null }) {
  const collected = FUSION_KINDS.filter((kind) => loadout?.balls.some((b) => b.kind === kind && b.count > 0)).length;
  return <div className="fusion-board"><div className="fusion-board-summary"><span>Собрано комбинаций</span><b>{collected}<span> / 4</span></b></div><div className="fusion-recipes">{FUSION_KINDS.map((kind) => {
    const fused = loadout?.balls.find((b) => b.kind === kind && b.count > 0);
    const ingredients = KINDS[kind].fusion!;
    const ready = ingredients.every((base) => loadout?.balls.some((b) => b.kind === base && b.count > 0 && b.level >= 2));
    const status = fused ? "collected" : ready ? "ready" : "locked";
    return <article className={`fusion-recipe ${status}`} key={kind} data-fusion={kind} data-status={status}>
      <div className="fusion-recipe-heading"><KindMark kind={kind} /><h3>{KINDS[kind].name}</h3><span className="fusion-status">{fused ? "Собрано" : ready ? "Готово" : "Не собрано"}</span></div>
      <div className="recipe-ingredients">{ingredients.map((base) => {
        const ball = loadout?.balls.find((b) => b.kind === base && b.count > 0);
        const met = !!ball && ball.level >= 2;
        return <div className={`recipe-ingredient ${met ? "met" : ""}`} key={base}><span className="ingredient-symbol" style={{ color: TONES[base] }} aria-hidden="true">{GLYPHS[base]}</span><span>{KINDS[base].name}</span><small>{ball ? `ур. ${ball.level}` : "нет"}<span> / ур. 2</span></small><span className="ingredient-check" aria-label={met ? "Условие выполнено" : "Условие не выполнено"}>{met ? "✓" : "·"}</span></div>;
      })}</div>
      {fused ? <p className="fusion-result">В залпе <b>×{fused.count}</b><span>Уровень {fused.level}</span></p> : ready ? <p className="fusion-ready-note">Ищи карточку слияния при повышении уровня.</p> : null}
    </article>;
  })}</div><p className="fusion-explainer">Каждому из двух исходных типов нужен уровень 2. Слияние забирает по одному шару и даёт два особых.</p></div>;
}
function Panel({ title, eyebrow, onClose, children, className = "" }: { title: string; eyebrow: string; onClose?: () => void; children: ReactNode; className?: string }) {
  return <section className={`game-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby="panel-title">{onClose && <button className="panel-close" onClick={onClose} aria-label="Закрыть">×</button>}<p className="panel-eyebrow">{eyebrow}</p><h2 id="panel-title">{title}</h2>{children}</section>;
}
function cardSub(card: Card) {
  if (card.type !== "fusion") return card.sub;
  const fusion = KINDS[card.id.split(":")[1] as Kind]?.fusion;
  return fusion ? `${KINDS[fusion[0]].name} + ${KINDS[fusion[1]].name} → 2 шара` : card.sub;
}

function Workshop({ profile, onSelect, status }: { profile: MetaProfile; onSelect: (id: StarterId) => void; status: string }) {
  const challenges = getChallenges(profile);
  return <>
    <p className="panel-description workshop-description">Открытия остаются с тобой. Шары и улучшения забега собираются заново.</p>
    {profile.discoveries.length === 4 && <p className="profile-title" data-profile-title="master">✳ Мастер синтеза</p>}
    <dl className="profile-stats" aria-label="Лучшие результаты профиля">
      <div><dt>Лучший счёт</dt><dd>{profile.bestScore.toLocaleString("ru-RU")}</dd></div>
      <div><dt>Боссов за забег</dt><dd>{profile.bestBosses}</dd></div>
      <div><dt>Точных ударов за забег</dt><dd>{profile.bestPerfects}</dd></div>
    </dl>
    <nav className="workshop-jumps" aria-label="Разделы мастерской"><button onClick={() => document.getElementById("starters-title")?.scrollIntoView({ block: "start" })}>Старт</button><button onClick={() => document.getElementById("album-title")?.scrollIntoView({ block: "start" })}>Альбом {profile.discoveries.length}/4</button><button onClick={() => document.getElementById("challenges-title")?.scrollIntoView({ block: "start" })}>Испытания</button></nav>
    <section className="workshop-section" aria-labelledby="starters-title">
      <div className="workshop-section-heading"><h3 id="starters-title">Стартовый залп</h3><span>3 сборки</span></div>
      <p className="workshop-note">Выбор применяется к следующему забегу.</p>
      <div className="starter-list">{STARTER_IDS.map((id) => {
        const starter = STARTERS[id];
        const unlocked = isStarterUnlocked(profile, id);
        const selected = profile.selectedStarter === id;
        return <button key={id} className={`starter-card ${selected ? "selected" : ""}`} data-starter={id} data-unlocked={unlocked} disabled={!unlocked} aria-pressed={selected} onClick={() => onSelect(id)}>
          <span className="starter-card-top"><strong>{starter.name}</strong><span>{selected ? "Выбрано" : unlocked ? "Выбрать" : "Закрыто"}</span></span>
          <span className="starter-balls">{starter.balls.map((ball) => <span key={ball.kind}><KindMark kind={ball.kind} /><b>×{ball.count}</b></span>)}</span>
          <span className="starter-description">{starter.desc}</span>
          <span className="starter-unlock">{unlocked ? "Все шары начинают с уровня 1." : challenges.find((challenge) => challenge.id === starter.unlock)?.desc}</span>
        </button>;
      })}</div>
    </section>
    <section className="workshop-section" aria-labelledby="album-title">
      <div className="workshop-section-heading"><h3 id="album-title">Альбом слияний</h3><span>{profile.discoveries.length} / 4</span></div>
      <p className="workshop-note">Собери слияние хотя бы раз — и запись останется в альбоме.</p>
      <div className="album-grid">{FUSION_KINDS.map((kind) => {
        const found = profile.discoveries.includes(kind);
        const [first, second] = KINDS[kind].fusion!;
        return <article key={kind} className={`album-card ${found ? "found" : "unfound"}`} data-discovery={kind} data-found={found}>
          <div className="album-heading"><KindMark kind={kind} /><h4>{KINDS[kind].name}</h4><span>{found ? "Открыто ✓" : "Ещё не открыто"}</span></div>
          <p>{KINDS[kind].desc}</p><span className="album-recipe">{KINDS[first].name} ур. 2 + {KINDS[second].name} ур. 2</span>
        </article>;
      })}</div>
    </section>
    <section className="workshop-section" aria-labelledby="challenges-title">
      <div className="workshop-section-heading"><h3 id="challenges-title">Испытания</h3><span>{challenges.filter((c) => c.completed).length} / 4</span></div>
      <div className="challenge-list">{challenges.map((challenge) => <article className={`challenge-card ${challenge.completed ? "completed" : ""}`} key={challenge.id} data-challenge={challenge.id} data-completed={challenge.completed}>
        <div className="challenge-heading"><h4>{challenge.title}</h4><span>{challenge.completed ? "Выполнено ✓" : `${challenge.progress} / ${challenge.target}`}</span></div>
        <p>{challenge.desc}</p><progress value={challenge.progress} max={challenge.target} aria-label={`${challenge.title}: ${challenge.progress} из ${challenge.target}`} /><p className="challenge-reward"><span>Награда</span>{challenge.reward}</p>
      </article>)}</div>
    </section>
    {status && <p className="workshop-status">{status}</p>}
    <p className="panel-footnote">Альбом, испытания и выбранный старт сохраняются на этом устройстве.</p>
  </>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const panelHostRef = useRef<HTMLDivElement>(null);
  const { w, h } = useViewport();
  const { arenaWidth, arenaHeight, showArsenal, showCombinations } = getGameLayout(w, h);
  const [screen, setScreen] = useState<Screen>("menu");
  const screenRef = useRef<Screen>("menu");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const sheetRef = useRef<Sheet | null>(null);
  const resumeAfterSheet = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [table, setTable] = useState<HighScore[]>(loadScores);
  const [entryId, setEntryId] = useState(-1);
  const [isBest, setIsBest] = useState(false);
  const [name, setName] = useState(getName);
  const [muted, setMuted] = useState(loadMute);
  const mutedRef = useRef(muted);
  const [presentation, setPresentation] = useState(initialPresentation);
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [slowHeld, setSlowHeld] = useState(false);
  const [profile, setProfile] = useState(loadMeta);
  const profileRef = useRef(profile);
  const [runDiscoveries, setRunDiscoveries] = useState<FusionKind[]>([]);
  const [runChallenges, setRunChallenges] = useState<string[]>([]);
  const [runUnlocks, setRunUnlocks] = useState<string[]>([]);
  const [runRerolls, setRunRerolls] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");

  const commitProfile = useCallback((next: MetaProfile) => {
    profileRef.current = next;
    saveMeta(next);
    setProfile(next);
    gameRef.current?.setRunOptions({ starter: next.selectedStarter, rerolls: hasReroll(next) ? 1 : 0 });
  }, []);

  const releaseSlow = useCallback(() => { setSlowHeld(false); gameRef.current?.setSlowMotion(false); }, []);
  const toggleMute = useCallback(() => {
    const value = !mutedRef.current;
    mutedRef.current = value;
    setMuted(value);
    saveMute(value);
    gameRef.current?.setMuted(value);
  }, []);
  const openSheet = useCallback((value: Sheet) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (sheetRef.current === null) resumeAfterSheet.current = screenRef.current === "playing";
    sheetRef.current = value;
    setSheet(value);
    releaseSlow();
    if (resumeAfterSheet.current) gameRef.current?.pause();
    if (value === "scores") setTable(loadScores());
  }, [releaseSlow]);
  const closeSheet = useCallback(() => {
    const resume = resumeAfterSheet.current;
    sheetRef.current = null;
    setSheet(null);
    resumeAfterSheet.current = false;
    if (resume && screenRef.current === "paused") gameRef.current?.resume();
    requestAnimationFrame(() => {
      const oldFocus = returnFocusRef.current;
      if (oldFocus?.isConnected) oldFocus.focus();
      else if (screenRef.current === "playing") canvasRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    const game = new Game(canvasRef.current!, {
      onScreen: (next) => { screenRef.current = next; setScreen(next); if (gameRef.current) { setLoadout(gameRef.current.getLoadout()); setHud(gameRef.current.getHud()); } },
      onCards: setCards,
      onRunStart: (options) => {
        setRunDiscoveries([]); setRunChallenges([]); setRunUnlocks([]);
        setRunRerolls(options.rerolls); setProgressMessage("");
      },
      onProgress: (facts) => {
        const update = applyProgress(profileRef.current, facts);
        commitProfile(update.profile);
        if (update.newDiscoveries.length) setRunDiscoveries((previous) => [...new Set([...previous, ...update.newDiscoveries])]);
        if (update.newChallenges.length) setRunChallenges((previous) => [...new Set([...previous, ...update.newChallenges])]);
        if (update.newUnlocks.length) setRunUnlocks((previous) => [...new Set([...previous, ...update.newUnlocks])]);
        if (update.newDiscoveries.length || update.newUnlocks.length) {
          setProgressMessage([
            ...update.newDiscoveries.map((kind) => `В альбоме: ${KINDS[kind].name}.`),
            ...update.newUnlocks.map((unlock) => `Открыто: ${unlock}.`),
            "Сохранено в мастерской.",
          ].join(" "));
        }
      },
      onGameOver: (result) => {
        setSummary(result);
        const previous = loadScores();
        setIsBest(result.score > 0 && (!previous.length || result.score > previous[0].score));
        if (result.score > 0) {
          const saved = addScore({ name: getName(), score: result.score, depth: result.depth, level: result.level, starter: result.starter, rerollsUsed: result.rerollsUsed });
          setTable(saved.table);
          setEntryId(saved.id);
        } else { setEntryId(-1); setTable(previous); }
        setName(getName());
      },
    });
    gameRef.current = game;
    game.setMuted(mutedRef.current);
    game.setPresentation(presentationRef.current);
    game.setRunOptions({ starter: profileRef.current.selectedStarter, rerolls: hasReroll(profileRef.current) ? 1 : 0 });
    const read = () => { setLoadout(game.getLoadout()); setHud(game.getHud()); };
    read();
    const timer = window.setInterval(read, 150);
    return () => { window.clearInterval(timer); game.destroy(); gameRef.current = null; };
  }, [commitProfile]);
  useEffect(() => { gameRef.current?.setSize(arenaWidth, Math.min(window.devicePixelRatio || 1, 2), arenaHeight); }, [arenaWidth, arenaHeight]);
  useEffect(() => {
    gameRef.current?.setPresentation(presentation);
    try { localStorage.setItem(PRESENTATION_KEY, JSON.stringify(presentation)); } catch { /* Settings remain usable without storage. */ }
  }, [presentation]);
  useEffect(() => { releaseSlow(); if (screen === "menu") setTable(loadScores()); }, [screen, releaseSlow]);

  useEffect(() => {
    const capture = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable='true']");
      const modal = sheetRef.current !== null || ["paused", "levelup", "gameover"].includes(screenRef.current);
      if (sheetRef.current && event.code === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeSheet(); return; }
      if (event.code === "Tab" && modal) {
        const focusable = panelHostRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, select, textarea, [tabindex='0'], summary");
        if (focusable?.length) {
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || !panelHostRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || !panelHostRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
      }
      if (typing) return;
      if (target?.closest(".slow-button") && (event.code === "Enter" || event.code === "Space")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) { setSlowHeld(true); gameRef.current?.setSlowMotion(true); }
        return;
      }
      if (sheetRef.current && GAME_KEYS.has(event.code)) {
        event.stopImmediatePropagation();
        if (event.code === "KeyM" && !event.repeat) toggleMute();
        if (!(target?.closest("button, summary") && (event.code === "Enter" || event.code === "Space"))) event.preventDefault();
        return;
      }
      // The focused control must perform its native click without also triggering a game action.
      if (target?.closest("button, summary") && (event.code === "Enter" || event.code === "Space")) event.stopImmediatePropagation();
    };
    const syncSound = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== "KeyM" || event.repeat || target?.closest("input,textarea,select,[contenteditable='true']")) return;
      queueMicrotask(() => {
        const game = gameRef.current;
        if (!game) return;
        mutedRef.current = game.sfx.muted;
        setMuted(game.sfx.muted);
        saveMute(game.sfx.muted);
      });
    };
    const visibility = () => { if (document.hidden) releaseSlow(); };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("keydown", syncSound);
    window.addEventListener("blur", releaseSlow);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", capture, true);
      window.removeEventListener("keydown", syncSound);
      window.removeEventListener("blur", releaseSlow);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [closeSheet, releaseSlow, toggleMute]);
  useEffect(() => {
    if (sheet || screen === "paused" || screen === "levelup" || screen === "gameover") panelHostRef.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
    else if (screen === "playing") canvasRef.current?.focus({ preventScroll: true });
  }, [sheet, screen, cards]);

  const start = () => { releaseSlow(); gameRef.current?.start(); };
  const chooseStarter = (id: StarterId) => {
    if (!isStarterUnlocked(profileRef.current, id)) return;
    const next = selectStarter(profileRef.current, id);
    commitProfile(next);
    setProgressMessage(`Старт «${STARTERS[next.selectedStarter].name}» выбран для следующего забега.`);
  };
  const reroll = () => {
    const game = gameRef.current;
    if (game?.reroll()) {
      setHud(game.getHud());
      setProgressMessage("Варианты улучшений заменены. Смена этого забега использована.");
    }
  };
  const updateName = (value: string) => {
    setName(value); persistName(value.trim() || "ИГРОК");
    if (screenRef.current === "gameover" && entryId !== -1) setTable(renameScore(entryId, value.trim() || "ИГРОК"));
  };
  const activePanel = sheet !== null || screen === "paused" || screen === "levelup" || screen === "gameover";
  const best = table[0]?.score ?? 0;
  const selectedStarter = STARTERS[profile.selectedStarter];
  const displayedLoadout: Loadout | null = screen === "menu" ? { balls: selectedStarter.balls, passives: [] } : loadout;
  const totalBalls = displayedLoadout?.balls.reduce((sum, ball) => sum + ball.count, 0) ?? 0;
  const collectedFusions = FUSION_KINDS.filter((kind) => displayedLoadout?.balls.some((ball) => ball.kind === kind && ball.count > 0)).length;

  return <main className={`game ${showCombinations ? "with-instruments" : ""} ${presentation.reducedMotion ? "reduced-motion" : ""} state-${screen}`} style={{ "--viewport-height": `${h}px`, "--arena-width": `${arenaWidth}px`, "--arena-height": `${arenaHeight}px` } as CSSProperties}>
    {showArsenal && <aside className="side-panel arsenal-sidebar" aria-label="Арсенал текущей игры"><p className="sidebar-eyebrow">{screen === "menu" ? "НАЧАЛЬНАЯ СБОРКА" : "ТЕКУЩАЯ СБОРКА"}</p><div className="sidebar-heading"><h2>Арсенал</h2><span>{totalBalls} <small>шаров</small></span></div><div className="sidebar-scroll"><Arsenal loadout={displayedLoadout} /></div><div className="sidebar-controls"><h3 className="section-label">Управление</h3><dl><div><dt>Движение</dt><dd>Мышь / ← → / A D</dd></div><div><dt>Залп / возврат</dt><dd>Space / клик</dd></div><div><dt>Замедление</dt><dd>Удерживать Shift</dd></div><div><dt>Пауза / звук</dt><dd>P / M</dd></div></dl><button className="sidebar-button" onClick={() => openSheet("build")}>Вся сборка и слияния <span aria-hidden="true">↗</span></button></div></aside>}
    <div className="arena" style={{ width: arenaWidth, height: arenaHeight }}>
    <canvas ref={canvasRef} className="game-canvas" tabIndex={screen === "playing" && !sheet ? 0 : undefined} aria-hidden={screen !== "playing" || !!sheet} aria-label="Игровое поле. Мышь, касание или стрелки — движение; пробел — залп; Shift — замедление; P — пауза." />
    {screen === "playing" && !sheet && <>
      <div className="game-tools" aria-label="Управление игрой"><button className="tool-button sound-tool" onClick={toggleMute} aria-label={muted ? "Включить звук" : "Выключить звук"} aria-pressed={!muted} title="Звук — M"><SoundIcon muted={muted} /></button><button className="tool-button pause-tool" onClick={() => gameRef.current?.pause()} aria-label="Пауза" title="Пауза — P или Esc"><span aria-hidden="true">Ⅱ</span></button></div>
      <button className={`slow-button ${slowHeld ? "held" : ""}`} aria-label="Замедлить время: удерживайте кнопку или Shift" aria-pressed={slowHeld} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSlowHeld(true); gameRef.current?.setSlowMotion(true); }} onPointerUp={releaseSlow} onPointerCancel={releaseSlow} onLostPointerCapture={releaseSlow} onKeyDown={(event) => { if ((event.code === "Space" || event.code === "Enter") && !event.repeat) { event.preventDefault(); setSlowHeld(true); gameRef.current?.setSlowMotion(true); } }} onKeyUp={(event) => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); releaseSlow(); } }} onBlur={releaseSlow}><span className="slow-symbol" aria-hidden="true">◷</span><span>Замедление<small>Удерживать / Shift</small></span><span className="slow-meter" aria-hidden="true"><i style={{ transform: `scaleX(${hud ? hud.warp / Math.max(1, hud.warpMax) : 0})` }} /></span></button>
    </>}
    {screen === "menu" && !sheet && <section className="main-menu" aria-labelledby="game-title">
      <div className="menu-imprint"><span className="department-mark" aria-hidden="true"><i /><i /><i /></span><span>ИГРОВОЙ ЦЕХ<br />АРКАДА № 101</span></div>
      <div className="menu-content"><p className="menu-eyebrow">МАЛЕНЬКИЙ УДАР. БОЛЬШИЕ ПОСЛЕДСТВИЯ.</p><h1 id="game-title"><span>SIDE</span><br />EFFECT<span className="title-dot">.</span></h1><p className="menu-tagline">Хороший угол меняет всё.</p><div className="menu-actions">
        <button className="primary" onClick={start}>Начать игру <Arrow /></button>
        <button className="menu-starter" onClick={() => openSheet("workshop")} aria-label={`Выбран старт ${selectedStarter.name}. Изменить в мастерской`}><span>Старт: <strong>{selectedStarter.name}</strong></span><span aria-hidden="true">↗</span></button>
        <button className="menu-link workshop-menu-link" onClick={() => openSheet("workshop")}>Мастерская <span>{profile.discoveries.length}/4</span></button>
        <button className="menu-link" onClick={() => openSheet("help")}>Как играть <span>01</span></button><button className="menu-link" onClick={() => openSheet("scores")}>Таблица рекордов <span>02</span></button><button className="menu-link" onClick={() => openSheet("settings")}>Настройки <span>03</span></button></div><p className="menu-keyhint"><kbd>Space</kbd> / <kbd>Enter</kbd> — начать</p></div>
      <div className="menu-bottom"><span>ЗАЛПЫ / СЛИЯНИЯ / ЦЕПНЫЕ РЕАКЦИИ</span><button onClick={toggleMute} className="menu-sound" aria-pressed={!muted}><SoundIcon muted={muted} /><span>Звук {muted ? "выкл" : "вкл"}</span></button></div>{!!best && <button className="menu-record" onClick={() => openSheet("scores")}>ЛУЧШИЙ СЛЕД <strong>{best.toLocaleString("ru-RU")}</strong></button>}
    </section>}
    </div>
    {showCombinations && <aside className="side-panel combinations-sidebar" aria-label="Комбинации шаров"><p className="sidebar-eyebrow">СЛИЯНИЯ ТЕКУЩЕЙ СБОРКИ</p><div className="sidebar-heading"><h2>Комбинации</h2></div><div className="sidebar-scroll"><FusionBoard loadout={displayedLoadout} /></div><button className="sidebar-button" onClick={() => openSheet("build")}>Открыть сборку <span aria-hidden="true">↗</span></button></aside>}
    {activePanel && <div className={`panel-backdrop ${sheet === "help" || sheet === "build" || sheet === "workshop" ? "wide-panel" : ""}`} ref={panelHostRef}>
      {sheet === "workshop" && <Panel title="Мастерская." eyebrow="АЛЬБОМ / ИСПЫТАНИЯ / СТАРТ" onClose={closeSheet} className="workshop-panel"><Workshop profile={profile} onSelect={chooseStarter} status={progressMessage} /><button className="primary workshop-return" onClick={closeSheet}>Готово <Arrow /></button></Panel>}
      {sheet === "build" && <Panel title="Твоя сборка." eyebrow={screen === "menu" ? "НАЧАЛЬНЫЙ АРСЕНАЛ" : "АРСЕНАЛ И КОМБИНАЦИИ"} onClose={closeSheet} className="build-panel"><p className="panel-description">{totalBalls} шаров в залпе · {collectedFusions} из 4 слияний собрано</p><div className="build-columns"><section><Arsenal loadout={displayedLoadout} /></section><section><h3 className="section-label">Слияния</h3><FusionBoard loadout={displayedLoadout} /></section></div><button className="primary" onClick={closeSheet}>Назад к игре <Arrow /></button></Panel>}
      {sheet === "settings" && <Panel title="Твой ритм." eyebrow="НАСТРОЙКИ ИГРЫ" onClose={closeSheet}><p className="panel-description">Бумага, тушь и немного ударных.</p><label className="setting-row"><span>Звук<small>Короткие удары и бумажный шорох.</small></span><input className="switch" type="checkbox" checked={!muted} onChange={toggleMute} /></label><label className="setting-row"><span>Отдача экрана<small>Чувствовать вес каждого попадания.</small></span><input className="switch" type="checkbox" checked={presentation.shake} onChange={(e) => setPresentation((old) => ({ ...old, shake: e.target.checked }))} /></label><label className="setting-row"><span>Меньше движения<small>Спокойные эффекты и переходы.</small></span><input className="switch" type="checkbox" checked={presentation.reducedMotion} onChange={(e) => setPresentation((old) => ({ ...old, reducedMotion: e.target.checked }))} /></label><label className="name-setting">ИМЯ В ТАБЛИЦЕ РЕКОРДОВ<input value={name} onChange={(e) => updateName(e.target.value)} maxLength={12} autoComplete="off" spellCheck={false} /></label><button className="primary" onClick={closeSheet}>Всё подходит <Arrow /></button><p className="panel-footnote">Сохраняется на этом устройстве. M — звук.</p></Panel>}
      {sheet === "scores" && <Panel title="Оставь свой след." eyebrow="ТАБЛИЦА РЕКОРДОВ" onClose={closeSheet} className="records-panel"><p className="panel-description">Восемь поводов сыграть ещё раз.</p><ScoreTable rows={table} me={entryId} /><button className="primary" onClick={closeSheet}>Назад <Arrow /></button><p className="panel-footnote">Локальные легенды. Результаты этого устройства.</p></Panel>}
      {sheet === "help" && <Panel title="Дело в угле." eyebrow="НЕБОЛЬШОЙ ПОЛЕВОЙ СПРАВОЧНИК" onClose={closeSheet} className="help-panel"><p className="help-lead">Разбивай ряды, лови опыт, собирай залп. <strong>Не давай стене добраться до платформы.</strong></p><div className="help-columns"><section><h3 className="section-label">Управление</h3><dl className="control-table"><div><dt>Движение</dt><dd>Мышь / касание / ← → / A D</dd></div><div><dt>Залп / возврат</dt><dd>Клик / Space / Enter</dd></div><div><dt>Замедление</dt><dd>Удерживать Shift или ◷</dd></div><div><dt>Пауза</dt><dd>P / Esc</dd></div><div><dt>Новая игра</dt><dd>R</dd></div><div><dt>Звук</dt><dd>M</dd></div><div><dt>Улучшение</dt><dd>1 / 2 / 3 или выбор карточки</dd></div></dl><p className="help-note">На телефоне веди пальцем по полю. Залпы идут автоматически; касание ускоряет запуск. Возврат доступен, когда осталось не больше половины залпа.</p><h3 className="section-label">Точный удар</h3><p className="help-note">Центр платформы заряжает шар: следующий удар вдвое сильнее. Края задают острый угол. Комбо заряжает замедление.</p><h3 className="section-label">Всё глубже</h3><p className="help-note">Кристаллы дают опыт и выбор улучшения. TNT взрывает соседей, бронированные кирпичи держатся дольше. Каждые 14 рядов — босс. Опасная близость стены замедляет её падение.</p></section><section><h3 className="section-label">Семь типов шаров</h3><div className="kind-guide">{BASE_KINDS.map((kind) => <div key={kind}><KindMark kind={kind} /><p><strong>{KINDS[kind].name}</strong>{KINDS[kind].desc}</p></div>)}</div><h3 className="section-label">Четыре слияния</h3><p className="help-note">Подними оба исходных типа до уровня 2. Карточка слияния заменит их двумя особыми шарами.</p><div className="fusion-guide">{FUSION_KINDS.map((kind) => <div key={kind}><KindMark kind={kind} /><p><strong>{KINDS[kind].name}</strong>{KINDS[kind].desc}</p></div>)}</div></section></div><details className="passive-guide"><summary>Все улучшения забега</summary><dl>{PASSIVES.map((p) => <div key={p.id}><dt>{p.name}</dt><dd>{p.desc(1)} Макс. уровень: {p.max}.</dd></div>)}</dl></details><button className="primary" onClick={closeSheet}>Всё ясно <Arrow /></button></Panel>}
      {!sheet && screen === "paused" && <Panel title="Между ударами." eyebrow="ПАУЗА"><p className="panel-description">Последствия немного подождут.</p><button className="primary" onClick={() => gameRef.current?.resume()}>Продолжить <Arrow /></button><div className="button-pair"><button className="secondary" onClick={() => openSheet("help")}>Как играть</button><button className="secondary" onClick={() => openSheet("settings")}>Настройки</button></div>
        <button className="secondary workshop-entry" onClick={() => openSheet("workshop")}><span>Мастерская</span><small>Альбом {profile.discoveries.length}/4 · испытания <span aria-hidden="true">↗</span></small></button>
        <button className="secondary build-summary-button" onClick={() => openSheet("build")}><span>Сборка</span><span>{totalBalls} шаров · {collectedFusions}/4 слияний <span aria-hidden="true">↗</span></span></button><details className="loadout-details" open><summary>Арсенал и улучшения</summary><Arsenal loadout={displayedLoadout} /></details><div className="button-pair"><button className="secondary" onClick={start}>Новая игра</button><button className="secondary" onClick={() => gameRef.current?.toMenu()}>Главное меню</button></div><p className="panel-footnote">P / Esc — продолжить · R — начать заново</p></Panel>}
      {!sheet && screen === "levelup" && <Panel title="Добавим характер." eyebrow={`УРОВЕНЬ ${hud?.level ?? ""} / ВЫБЕРИ УЛУЧШЕНИЕ`} className="upgrade-panel"><p className="panel-description">Один выбор. Новые последствия.</p><div className="upgrade-list">{cards.map((card, index) => { const kind = card.id.split(":")[1] as Kind; return <button className={`upgrade ${card.type === "fusion" ? "fusion-upgrade" : ""}`} key={card.id} onClick={() => gameRef.current?.pick(card.id)}><span className="upgrade-number">0{index + 1}</span><span className="upgrade-copy"><span className="upgrade-tag">{card.type === "fusion" ? "СЛИЯНИЕ" : card.tag}</span><strong>{card.title}</strong><span className="upgrade-description">{card.desc}</span>{card.sub && <span className="upgrade-sub">{cardSub(card)}</span>}</span>{KINDS[kind] ? <KindMark kind={kind} /> : <span className="passive-symbol" aria-hidden="true">+</span>}</button>; })}</div>
        {hasReroll(profile) && <button className="secondary reroll-button" aria-label={`Переброс вариантов. Осталось ${hud?.rerolls ?? 0} из 1`} onClick={reroll} disabled={!hud?.rerolls} data-rerolls={hud?.rerolls ?? 0}><span aria-hidden="true">↻</span><span>{hud?.rerolls ? "Сменить варианты" : runRerolls ? "Смена использована" : "Смена со следующего забега"}</span><b>{hud?.rerolls ?? 0} / 1</b></button>}
        <p className="panel-footnote">Нажми 1, 2 или 3 — или выбери карточку.</p></Panel>}
      {!sheet && screen === "gameover" && summary && <Panel title="Не последний угол." eyebrow="ПОПЫТКА ЗАВЕРШЕНА" className="result-panel">{isBest && <p className="new-best">↗ Новый рекорд</p>}<div className="result-score">{summary.score.toLocaleString("ru-RU")}</div><p className="result-score-label">ОЧКОВ ЗА ЭТУ ПОПЫТКУ</p>
        <p className="result-run-type">Старт: {STARTERS[summary.starter].name}<span>Смен карточек: {summary.rerollsUsed}</span></p>
        <dl className="result-stats"><div><dt>Глубина</dt><dd>{summary.depth}</dd></div><div><dt>Уровень</dt><dd>{summary.level}</dd></div><div><dt>Кирпичей</dt><dd>{summary.kills}</dd></div><div><dt>Макс. комбо</dt><dd>×{summary.maxCombo}</dd></div><div><dt>Идеальных ударов</dt><dd>{summary.perfects}</dd></div><div><dt>Боссов</dt><dd>{summary.bosses}</dd></div></dl>
        {!!(runDiscoveries.length + runChallenges.length + runUnlocks.length) && <section className="run-rewards" aria-label="Новые открытия этого забега"><h3 className="section-label">Этот забег в мастерской</h3>{runDiscoveries.map((kind) => <div className="run-discovery" key={kind} data-new-discovery={kind}><KindMark kind={kind} /><span>Новая запись: <strong>{KINDS[kind].name}</strong></span></div>)}{getChallenges(profile).filter((challenge) => runChallenges.includes(challenge.id)).map((challenge) => <p className="run-challenge" key={challenge.id}>✓ {challenge.title}</p>)}{runUnlocks.map((unlock) => <p className="run-unlock" key={unlock}>Открыто: <strong>{unlock}</strong></p>)}<p className="reward-saved">Уже сохранено. Останется и после новой попытки.</p></section>}
        {entryId !== -1 && <label className="name-setting">ПОДПИШИ СВОЙ РЕЗУЛЬТАТ<input value={name} maxLength={12} autoComplete="off" spellCheck={false} onChange={(e) => updateName(e.target.value)} /></label>}<button className="primary" onClick={start}>Ещё одна попытка <Arrow /></button>
        <button className="secondary workshop-entry" onClick={() => openSheet("workshop")}><span>Мастерская</span><small>Альбом {profile.discoveries.length}/4 · открытия <span aria-hidden="true">↗</span></small></button>
        <div className="button-pair"><button className="secondary" onClick={() => openSheet("scores")}>Рекорды</button><button className="secondary" onClick={() => gameRef.current?.toMenu()}>Главное меню</button></div><p className="panel-footnote">Space / Enter / R — начать заново</p></Panel>}
    </div>}
    <p className="sr-only" aria-live="polite" aria-atomic="true">{sheet ? ({ help: "Как играть", settings: "Настройки", scores: "Таблица рекордов", build: "Сборка и слияния", workshop: "Мастерская" }[sheet]) : ({ menu: "Главное меню", playing: "Игра", paused: "Пауза", levelup: "Выберите улучшение", gameover: "Игра завершена" }[screen])}</p>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{progressMessage}</p>
  </main>;
}
