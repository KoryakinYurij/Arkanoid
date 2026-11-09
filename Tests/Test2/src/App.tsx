import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Game } from "./game/engine";
import type { Loadout, Screen, Stats, Summary } from "./game/engine";
import {
  BASE_KINDS,
  FUSION_KINDS,
  KINDS,
  addScore,
  getName,
  loadMute,
  loadScores,
  renameScore,
  saveMute,
  setName as persistName,
} from "./game/data";
import type { Card, HighScore } from "./game/data";

type Panel = "scores" | "help" | "settings" | null;

const PREFS_KEY = "tirazh.prefs.v1";

interface Prefs {
  shake: boolean;
  reduced: boolean;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Prefs>;
      return { shake: v.shake !== false, reduced: v.reduced === true };
    }
  } catch {
    /* storage unavailable */
  }
  return { shake: true, reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const EMPTY_STATS: Stats = { score: 0, depth: 0, combo: 0, mult: 1, hp: 3, maxHp: 3, level: 1, xp: 0, warp: 1 };
const START_HINT = "MOVE TO AIM. CLICK OR SPACE TO LAUNCH.";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

function ScoreSheet({ rows, me }: { rows: HighScore[]; me?: number }) {
  return (
    <div className="score-table-wrap">
      {rows.length === 0 ? (
        <p className="empty-scores">
          A clean sheet.
          <br />
          Go leave your first mark.
        </p>
      ) : (
        <table className="score-table">
          <thead>
            <tr>
              <th>NO.</th>
              <th>NAME</th>
              <th>SCORE</th>
              <th>DEPTH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.id === me ? "your-score" : ""}>
                <td>{String(i + 1).padStart(2, "0")}</td>
                <td>{r.name}</td>
                <td>{r.score.toLocaleString("en-US")}</td>
                <td>{r.depth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const prefs = useMemo(loadPrefs, []);

  const [screen, setScreen] = useState<Screen>("menu");
  const [panel, setPanel] = useState<Panel>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [table, setTable] = useState<HighScore[]>(() => loadScores());
  const [entryId, setEntryId] = useState(-1);
  const [isBest, setIsBest] = useState(false);
  const [name, setNameState] = useState(getName());
  const [muted, setMuted] = useState(loadMute());
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [hint, setHint] = useState(START_HINT);
  const [shakeOn, setShakeOn] = useState(prefs.shake);
  const [reduced, setReduced] = useState(prefs.reduced);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new Game(canvas, {
      onScreen: (s) => setScreen(s),
      onCards: (c) => setCards(c),
      onStats: (s) => {
        setStats(s);
        const g = gameRef.current;
        if (g) setLoadout(g.getLoadout());
      },
      onHint: (t) => setHint(t),
      onGameOver: (r) => {
        setSummary(r);
        const prev = loadScores();
        const best = prev.length === 0 || r.score > prev[0].score;
        setIsBest(best && r.score > 0);
        if (r.score > 0) {
          const res = addScore({ name: getName(), score: r.score, depth: r.depth, level: r.level });
          setTable(res.table);
          setEntryId(res.id);
        } else {
          setEntryId(-1);
          setTable(prev);
        }
        setNameState(getName());
      },
    });
    game.setMuted(mutedRef.current);
    game.setShake(prefs.shake);
    game.setReduced(prefs.reduced);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [prefs]);

  // keep the canvas bitmap in step with its CSS box
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const apply = () => {
      const g = gameRef.current;
      if (!g) return;
      g.setSize(Math.max(1, Math.round(el.clientWidth)), Math.min(window.devicePixelRatio || 1, 2));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  useEffect(() => {
    gameRef.current?.setShake(shakeOn);
    gameRef.current?.setReduced(reduced);
    savePrefs({ shake: shakeOn, reduced });
  }, [shakeOn, reduced]);

  useEffect(() => {
    if (screen === "playing" || screen === "gameover") setPanel(null);
    if (screen === "menu") setHint(START_HINT);
    if (screen === "paused") {
      const g = gameRef.current;
      if (g) setLoadout(g.getLoadout());
    }
  }, [screen]);

  // Esc closes a page panel before the engine sees it
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panel]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      saveMute(next);
      gameRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const commitName = useCallback(
    (value: string) => {
      const clean = value.trim().slice(0, 12).toUpperCase() || "PLAYER";
      setNameState(clean);
      persistName(clean);
      if (entryId !== -1) setTable(renameScore(entryId, clean));
    },
    [entryId]
  );

  const start = useCallback(() => {
    setPanel(null);
    gameRef.current?.start();
  }, []);

  const openPanel = useCallback((next: Exclude<Panel, null>) => {
    const g = gameRef.current;
    if (g && (g.screen === "playing" || g.screen === "levelup")) g.pause();
    setPanel(next);
  }, []);

  const overlayOpen = panel !== null || screen === "paused" || screen === "levelup" || screen === "gameover";
  const balls = loadout?.balls ?? [];
  const passives = loadout?.passives ?? [];
  const lives = Math.max(3, stats.maxHp);

  return (
    <div className={`app${screen === "menu" ? "" : " in-run"}`}>
      <header className="masthead">
        <div className="wordmark" aria-label="The Print Floor">
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            THE PRINT
            <br />
            FLOOR
          </span>
        </div>
        <nav className="nav" aria-label="Game tools">
          <button className="nav-link" onClick={() => openPanel("scores")}>
            SCORE SHEET
          </button>
          <button className="nav-link help-nav" onClick={() => openPanel("help")}>
            HOW TO PLAY
          </button>
          <button
            className={`icon-button${muted ? " muted" : ""}`}
            onClick={toggleMute}
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            aria-pressed={muted}
            title="Sound (M)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" />
              <path className="sound-slash" d="m3 3 18 18" />
            </svg>
            <span className="sound-label">{muted ? "SOUND OFF" : "SOUND ON"}</span>
          </button>
          <button className="icon-button" onClick={() => openPanel("settings")} aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M5 3v18M12 3v18M19 3v18" />
              <path fill="var(--paper)" d="M2 7h6v4H2zm7 7h6v4H9zm7-9h6v4h-6z" />
            </svg>
          </button>
        </nav>
      </header>

      <main>
        <section className="intro" aria-labelledby="game-title">
          <p className="eyebrow">A FALLING-WALL BRICK BREAKER</p>
          <h1 id="game-title">ТИРАЖ</h1>
          <p className="intro-copy">
            Hold the floor.
            <br />
            Break the run.
          </p>
          <div className="title-actions">
            <button className="primary" onClick={start}>
              START A RUN <Arrow />
            </button>
            <p className="control-note">
              Move to aim. Click to launch.
              <br />
              Or bring your <kbd>A</kbd> / <kbd>D</kbd> keys.
            </p>
          </div>
          <div className="mechanic-note">
            <span className="tiny-arrow" aria-hidden="true">
              ↗
            </span>
            <p>
              <strong>Meet the falling wall.</strong>
              <br />
              Break bricks for XP.
              <br />
              Fuse two balls into something worse.
            </p>
          </div>
          <div className="run-notes">
            <p className="run-label">YOUR PRINT RUN</p>
            <ul className="mod-list">
              {balls.length === 0 && passives.length === 0 && (
                <li className="empty-mod">A blank sheet. Start a run to build a volley.</li>
              )}
              {balls.slice(0, 4).map((b) => (
                <li key={b.kind}>
                  <span>
                    {KINDS[b.kind].icon} {KINDS[b.kind].name}
                  </span>
                  <span className="mod-count">
                    ×{b.count} · L{b.level}
                  </span>
                </li>
              ))}
              {passives.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <span>
                    {p.icon} {p.name}
                  </span>
                  <span className="mod-count">{p.lvl}</span>
                </li>
              ))}
            </ul>
            <button className="quiet-button" onClick={() => gameRef.current?.pause()}>
              TAKE A BREATHER <span>P / ESC</span>
            </button>
          </div>
        </section>

        <section className="arena-column" aria-label="ТИРАЖ arcade game">
          <div className="hud" aria-label="Run statistics">
            <div>
              <span className="hud-label">DEPTH</span>
              <span className="hud-value">{String(stats.depth).padStart(2, "0")}</span>
            </div>
            <div className="hud-score">
              <span className="hud-label">SCORE</span>
              <span className="hud-value">{stats.score.toLocaleString("en-US")}</span>
            </div>
            <div className="hud-combo">
              <span className="hud-label">COMBO</span>
              <span className="hud-value">×{stats.mult.toFixed(1)}</span>
            </div>
            <div className="hud-lives">
              <span className="hud-label">LIVES</span>
              <div className="life-marks" aria-label={`${stats.hp} lives`}>
                {Array.from({ length: lives }, (_, i) => (
                  <i key={i} className={`life${i >= stats.hp ? " spent" : ""}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="play-surface" ref={surfaceRef}>
            <canvas ref={canvasRef} aria-label="Game field" />
            <div className="xp-track">
              <div className="xp-fill" style={{ width: `${Math.min(100, stats.xp * 100)}%` }} />
            </div>

            <div className={`overlay${overlayOpen ? " visible" : ""}`}>
              <section className={`panel${screen === "paused" && !panel ? " active" : ""}`}>
                <p className="panel-eyebrow">A MOMENT OFF THE FLOOR</p>
                <h2>
                  Take a
                  <br />
                  breather.
                </h2>
                <p className="panel-description">The wall can wait. It usually does not.</p>
                <button className="primary" onClick={() => gameRef.current?.resume()}>
                  BACK TO IT <Arrow />
                </button>
                <div className="button-pair">
                  <button className="secondary" onClick={() => setPanel("help")}>
                    HOW TO PLAY
                  </button>
                  <button className="secondary" onClick={() => setPanel("settings")}>
                    SETTINGS
                  </button>
                </div>
                <button className="text-button" onClick={start}>
                  START A FRESH RUN
                </button>
                <button className="text-button" onClick={() => gameRef.current?.toMenu()}>
                  BACK TO THE FLOOR
                </button>
                <p className="panel-footnote">P / ESC TO RESUME</p>
              </section>

              <section className={`panel${screen === "levelup" && !panel ? " active" : ""}`}>
                <p className="panel-eyebrow">DEPTH {String(stats.depth).padStart(2, "0")} · CARD {stats.level}</p>
                <h2>
                  Make it
                  <br />
                  interesting.
                </h2>
                <p className="panel-description">Pick one. It stays for the whole run.</p>
                <div className="upgrade-list">
                  {cards.map((c, i) => (
                    <button
                      key={c.id}
                      className={`upgrade${c.type === "fusion" ? " fusion" : ""}`}
                      style={{ "--c": c.color } as CSSProperties}
                      onClick={() => gameRef.current?.pick(c.id)}
                    >
                      <span className="upgrade-number">0{i + 1}</span>
                      <span className="upgrade-copy">
                        <span className="upgrade-tag">{c.tag}</span>
                        <span className="upgrade-title">
                          {c.icon} {c.title}
                        </span>
                        <span className="upgrade-desc">{c.desc}</span>
                        {c.sub && <span className="upgrade-sub">{c.sub}</span>}
                      </span>
                      <span className="upgrade-plus">+</span>
                    </button>
                  ))}
                </div>
                <p className="panel-footnote">CHOOSE WITH 1, 2 OR 3</p>
              </section>

              <section className={`panel score-panel${screen === "gameover" && !panel ? " active" : ""}`}>
                <p className="panel-eyebrow">PRINT RUN FINISHED</p>
                <h2>
                  Out of
                  <br />
                  ball.
                </h2>
                {isBest && <p className="newbest">★ A NEW PERSONAL MARK ★</p>}
                <div className="result-score">{(summary?.score ?? 0).toLocaleString("en-US")}</div>
                <p className="result-meta">
                  POINTS · DEPTH {String(summary?.depth ?? 0).padStart(2, "0")} · LEVEL {summary?.level ?? 1}
                </p>
                <p className="result-note">{isBest ? "A new personal impression." : "There is always another angle."}</p>
                {entryId !== -1 && (
                  <div className="name-setting">
                    <label htmlFor="player-name">YOUR NAME ON THE SCORE SHEET</label>
                    <input
                      id="player-name"
                      value={name}
                      maxLength={12}
                      spellCheck={false}
                      onChange={(e) => {
                        setNameState(e.target.value);
                        commitName(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </div>
                )}
                <ScoreSheet rows={table.slice(0, 5)} me={entryId} />
                <button className="primary" onClick={start}>
                  ONE MORE RUN <Arrow />
                </button>
                <button className="text-button" onClick={() => setPanel("scores")}>
                  OPEN THE SCORE SHEET
                </button>
                <p className="panel-footnote">SPACE OR R TO GO AGAIN</p>
              </section>

              <section className={`panel${panel === "help" ? " active" : ""}`}>
                <button className="panel-close" onClick={() => setPanel(null)} aria-label="Close instructions">
                  ×
                </button>
                <p className="panel-eyebrow">A SMALL FIELD GUIDE</p>
                <h2>
                  Good angles.
                  <br />
                  Bad intentions.
                </h2>
                <p className="help-mechanic">
                  Bricks fall. You keep them off the floor. Every break drops <strong>XP crystals</strong> — fill the bar and take a card:
                  a new ball, a level, a passive. Two balls at <strong>level 2</strong> can be fused into a fourth thing entirely.
                </p>
                <div className="kind-key">
                  {BASE_KINDS.map((k) => (
                    <div className="kind-key-item" key={k}>
                      <span className="kind-swatch" style={{ background: KINDS[k].color }} aria-hidden="true">
                        {KINDS[k].icon}
                      </span>
                      <span>
                        <strong>{KINDS[k].name}</strong>
                        {KINDS[k].desc}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="fusion-line">
                  {FUSION_KINDS.map((f) => `${KINDS[f].fusion!.map((b) => KINDS[b].icon).join(" + ")} = ${KINDS[f].name}`).join("  ·  ")}
                </p>
                <div className="control-table">
                  <div>
                    <span>MOVE</span>
                    <span>Mouse / drag / A D / arrows</span>
                  </div>
                  <div>
                    <span>LAUNCH</span>
                    <span>Click / tap / Space</span>
                  </div>
                  <div>
                    <span>TIME WARP</span>
                    <span>Shift / ↑ / hold the dial</span>
                  </div>
                  <div>
                    <span>PADDLE CENTRE</span>
                    <span>Perfect hit charges the ball ×2</span>
                  </div>
                  <div>
                    <span>PAUSE / MUTE</span>
                    <span>P or Esc / M</span>
                  </div>
                </div>
                <button className="primary" onClick={() => setPanel(null)}>
                  LET'S MAKE A MESS <Arrow />
                </button>
              </section>

              <section className={`panel score-panel${panel === "scores" ? " active" : ""}`}>
                <button className="panel-close" onClick={() => setPanel(null)} aria-label="Close score sheet">
                  ×
                </button>
                <p className="panel-eyebrow">GOOD WORK LEAVES A MARK</p>
                <h2>The score sheet.</h2>
                <p className="panel-description">Eight little reasons for one more try.</p>
                <ScoreSheet rows={table} me={entryId} />
                <div className="score-actions">
                  <button className="primary" onClick={() => setPanel(null)}>
                    BACK TO IT
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setTable([]);
                      setEntryId(-1);
                      localStorage.removeItem("tirazh.scores.v1");
                    }}
                  >
                    CLEAR SHEET
                  </button>
                </div>
                <p className="panel-footnote">LOCAL LEGENDS ONLY. SAVED ON THIS DEVICE.</p>
              </section>

              <section className={`panel${panel === "settings" ? " active" : ""}`}>
                <button className="panel-close" onClick={() => setPanel(null)} aria-label="Close settings">
                  ×
                </button>
                <p className="panel-eyebrow">MAKE YOURSELF COMFORTABLE</p>
                <h2>
                  Your kind
                  <br />
                  of chaos.
                </h2>
                <label className="setting-row">
                  <span>
                    Sound
                    <small>Wood, paper, and a little percussion.</small>
                  </span>
                  <input className="switch" type="checkbox" checked={!muted} onChange={toggleMute} />
                </label>
                <label className="setting-row">
                  <span>
                    Screen shake
                    <small>A little weight behind every hit.</small>
                  </span>
                  <input className="switch" type="checkbox" checked={shakeOn} onChange={(e) => setShakeOn(e.target.checked)} />
                </label>
                <label className="setting-row">
                  <span>
                    Reduced motion
                    <small>Less movement. Same consequences.</small>
                  </span>
                  <input className="switch" type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
                </label>
                <div className="name-setting">
                  <label htmlFor="settings-name">YOUR NAME ON THE SCORE SHEET</label>
                  <input
                    id="settings-name"
                    value={name}
                    maxLength={12}
                    spellCheck={false}
                    onChange={(e) => {
                      setNameState(e.target.value);
                      persistName(e.target.value.trim().slice(0, 12).toUpperCase() || "PLAYER");
                    }}
                  />
                </div>
                <button className="primary" onClick={() => setPanel(null)}>
                  THAT FEELS RIGHT <Arrow />
                </button>
                <p className="panel-footnote">SAVED ON THIS DEVICE. M TO MUTE.</p>
              </section>
            </div>
          </div>

          <div className="field-caption">
            <div className="field-hint">
              <span className="status-dot" />
              <span id="hint">{hint}</span>
            </div>
            <button className="field-key" onClick={() => openPanel("help")}>
              HOW TO PLAY
            </button>
          </div>
        </section>
      </main>

      <footer>
        <span>SMALL WALL. BIG CONSEQUENCES.</span>
        <span className="footer-right">
          <i className="footer-square" />
          AN ARCADE ORIGINAL / NO. 101
        </span>
      </footer>
    </div>
  );
}
