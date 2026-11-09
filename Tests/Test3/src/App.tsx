import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Game } from "./game/engine";
import type { HudState, Loadout, Screen, Summary } from "./game/engine";
import {
  KINDS,
  addScore,
  cleanName,
  getName,
  loadScores,
  loadSettings,
  renameScore,
  saveSettings,
  setName as persistName,
} from "./game/data";
import type { Card, HighScore, Settings } from "./game/data";

type MenuKind = "help" | "settings" | "scores";
type PanelKind = MenuKind | "pause" | "upgrade" | "over";

const number = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });

const EMPTY_HUD: HudState = {
  score: 0,
  level: 1,
  combo: 0,
  depth: 0,
  lives: 3,
  maxLives: 3,
  balls: 0,
  volley: 0,
  warp: 50,
  hint: "",
};

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

function Speaker({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" />
      {!muted && <path className="sound-slash" d="m3 3 18 18" />}
    </svg>
  );
}

function Sliders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M5 3v18M12 3v18M19 3v18" />
      <path fill="var(--paper)" d="M2 7h6v4H2zm7 7h6v4H9zm7-9h6v4h-6z" />
    </svg>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [cards, setCards] = useState<Card[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryNote, setSummaryNote] = useState("There is always another angle.");
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [scores, setScores] = useState<HighScore[]>(() => loadScores());
  const [entryId, setEntryId] = useState(-1);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [name, setNameState] = useState(getName());
  const [menu, setMenu] = useState<MenuKind | null>(null);
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const resumeRef = useRef<Screen>("menu");

  /* ── engine ─────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, {
      onScreen: (s) => setScreen(s),
      onCards: (c) => setCards(c),
      onHud: (h) => setHud(h),
      onGameOver: (r) => {
        setSummary(r);
        const prev = loadScores();
        const best = prev.length === 0 || r.score > prev[0].score;
        setSummaryNote(best && r.score > 0 ? "A new personal impression." : "There is always another angle.");
        if (r.score > 0) {
          const res = addScore({ name: getName(), score: r.score, depth: r.depth, level: r.level });
          setScores(res.table);
          setEntryId(res.id);
        } else {
          setEntryId(-1);
          setScores(prev);
        }
      },
    });
    game.setMuted(!settings.sound);
    game.setOptions({ shake: settings.shake, reduced: settings.reduced });
    gameRef.current = game;
    if (import.meta.env.DEV) {
      (window as unknown as { __game?: Game }).__game = game;
    }

    const fit = () => {
      const el = surfaceRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      game.setSize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (surfaceRef.current) ro.observe(surfaceRef.current);
    window.addEventListener("resize", fit);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      game.destroy();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* the engine owns the "M" mute key; keep the UI in sync */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      setTimeout(() => {
        const g = gameRef.current;
        if (!g) return;
        const sound = !g.sfx.muted;
        setSettings((s) => {
          const next = { ...s, sound };
          saveSettings(next);
          return next;
        });
      }, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    g.setMuted(!settings.sound);
    g.setOptions({ shake: settings.shake, reduced: settings.reduced });
    document.body.classList.toggle("reduced", settings.reduced);
  }, [settings]);

  useEffect(() => {
    if (screen === "menu") setScores(loadScores());
  }, [screen]);

  useEffect(() => {
    gameRef.current?.setOverlayOpen(menu !== null);
  }, [menu]);

  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    setLoadout(g.getLoadout());
  }, [screen, hud.level]);

  /* ── actions ────────────────────────────────────────── */

  const start = useCallback(() => {
    setMenu(null);
    setSummary(null);
    setEntryId(-1);
    gameRef.current?.start();
  }, []);

  const openMenu = useCallback(
    (m: MenuKind) => {
      resumeRef.current = screen;
      if (screen === "playing") gameRef.current?.pause();
      setMenu(m);
    },
    [screen],
  );

  const closeMenu = useCallback(() => {
    setMenu(null);
    if (resumeRef.current === "playing") gameRef.current?.resume();
  }, []);

  const toggleSound = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, sound: !s.sound };
      saveSettings(next);
      return next;
    });
  }, []);

  const patchSettings = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...p };
      saveSettings(next);
      return next;
    });
  }, []);

  const commitName = useCallback(() => {
    const clean = cleanName(name);
    persistName(clean);
    if (entryId !== -1) setScores(renameScore(entryId, clean));
  }, [name, entryId]);

  /* ── panels ─────────────────────────────────────────── */

  const panel: PanelKind | null =
    menu ?? (screen === "paused" ? "pause" : screen === "levelup" ? "upgrade" : screen === "gameover" ? "over" : null);

  const inRun = screen !== "menu";

    /* ── render ─────────────────────────────────────────── */

  const balls = loadout?.balls ?? [];

  return (
    <div className={`app ${inRun ? "in-run" : ""}`}>
      <header className="masthead">
        <div className="wordmark" aria-label="The Play Department">
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            THE PLAY
            <br />
            DEPARTMENT
          </span>
        </div>
        <nav className="nav" aria-label="Game tools">
          <button className="nav-link" onClick={() => openMenu("scores")}>
            SCORE SHEET
          </button>
          <button className="nav-link help-nav" onClick={() => openMenu("help")}>
            HOW TO PLAY
          </button>
          <button
            className={`icon-button ${settings.sound ? "" : "muted"}`}
            onClick={toggleSound}
            aria-label={settings.sound ? "Mute sound" : "Enable sound"}
            aria-pressed={!settings.sound}
            title="Sound (M)"
          >
            <Speaker muted={settings.sound} />
            <span className="sound-label">{settings.sound ? "SOUND ON" : "SOUND OFF"}</span>
          </button>
          <button className="icon-button" onClick={() => openMenu("settings")} aria-label="Settings" title="Settings">
            <Sliders />
          </button>
        </nav>
      </header>

      <main>
        <section className="intro" aria-labelledby="game-title">
          <p className="eyebrow">A FUSION-FUELLED BRICK BREAKER</p>
          <h1 id="game-title">
            <span className="side">UNDER</span>
            <br />
            PRESSURE<span className="dot">.</span>
          </h1>
          <p className="intro-copy">
            Fuse the balls.
            <br />
            Outrun the press.
          </p>
          <div className="title-actions">
            <button className="primary" onClick={start}>
              MAKE AN IMPRESSION
              <Arrow />
            </button>
            <p className="control-note">
              Move to aim. Click to launch.
              <br />
              Or bring your <kbd>A</kbd> / <kbd>D</kbd> keys.
            </p>
          </div>
          <div className="mechanic-note">
            <span className="tiny-arrow" aria-hidden="true">
              &#8599;
            </span>
            <p>
              <strong>Meet the fusion.</strong>
              <br />
              Two balls at level two become one far worse thing. Hold the line above the danger rule.
            </p>
          </div>
          <div className="run-notes">
            <p className="run-label">YOUR PRINT RUN</p>
            <ul className="mod-list">
              {balls.length === 0 && <li className="empty-mod">No balls loaded. Just you and the angles.</li>}
              {balls.map((b) => (
                <li key={b.kind}>
                  <span>
                    {KINDS[b.kind].icon} {KINDS[b.kind].name} ×{b.count}
                  </span>
                  <span className="mod-count">LV {b.level}</span>
                </li>
              ))}
              {(loadout?.passives ?? []).map((p) => (
                <li key={p.id}>
                  <span>
                    {p.icon} {p.name}
                  </span>
                  <span className="mod-count">×{p.lvl}</span>
                </li>
              ))}
            </ul>
            <button className="quiet-button" onClick={() => gameRef.current?.pause()}>
              TAKE A BREATHER <span>P / ESC</span>
            </button>
          </div>
        </section>

        <section className="arena-column" aria-label="Under Pressure arcade game">
          <div className="hud" aria-label="Run statistics">
            <div>
              <span className="hud-label">LEVEL</span>
              <span className="hud-value">{String(hud.level).padStart(2, "0")}</span>
            </div>
            <div className="hud-score">
              <span className="hud-label">SCORE</span>
              <span className="hud-value">{number.format(hud.score)}</span>
            </div>
            <div className="hud-combo">
              <span className="hud-label">COMBO</span>
              <span className="hud-value">×{hud.combo}</span>
            </div>
            <div className="hud-depth">
              <span className="hud-label">DEPTH</span>
              <span className="hud-value">{String(hud.depth).padStart(2, "0")}</span>
            </div>
            <div className="hud-lives">
              <span className="hud-label">LIVES</span>
              <div className="life-marks" aria-label={`${hud.lives} lives`}>
                {Array.from({ length: Math.max(3, hud.maxLives) }).map((_, i) => (
                  <i key={i} className={`life ${i < hud.lives ? "" : "spent"}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="play-surface" id="surface" ref={surfaceRef}>
            <canvas
              ref={canvasRef}
              tabIndex={0}
              aria-label="Game field. Move the mouse, drag anywhere, or use A and D to move the plate. Click or press Space to launch. P pauses."
            />

            <div className={`overlay ${panel ? "visible" : ""}`}>
              {panel === "pause" && (
                <section className="panel active" role="dialog" aria-modal="true" aria-label="Paused">
                  <p className="panel-eyebrow">A MOMENT BETWEEN IMPACTS</p>
                  <h2>
                    Take a
                    <br />
                    breather.
                  </h2>
                  <p className="panel-description">The mess can wait.</p>
                  <button className="primary" onClick={() => gameRef.current?.resume()}>
                    BACK TO IT <span aria-hidden="true">&#8599;</span>
                  </button>
                  <div className="button-pair">
                    <button className="secondary" onClick={() => openMenu("help")}>
                      HOW TO PLAY
                    </button>
                    <button className="secondary" onClick={() => openMenu("settings")}>
                      SETTINGS
                    </button>
                  </div>
                  <button className="text-button" onClick={start}>
                    START A FRESH RUN
                  </button>
                  <p className="panel-footnote">P / ESC TO RESUME</p>
                </section>
              )}

              {panel === "upgrade" && (
                <section className="panel active" role="dialog" aria-modal="true" aria-label="Choose an upgrade">
                  <p className="panel-eyebrow">IMPRESSION {String(hud.level).padStart(2, "0")} COMPLETE</p>
                  <h2>
                    Make it
                    <br />
                    interesting.
                  </h2>
                  <p className="panel-description">Pick one. Make it permanent.</p>
                  <div className="upgrade-list">
                    {cards.map((c, i) => (
                      <button
                        key={c.id}
                        className={`upgrade ${c.type === "fusion" ? "fusion" : ""}`}
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.currentTarget.blur();
                          gameRef.current?.pick(c.id);
                        }}
                      >
                        <span className="upgrade-number">0{i + 1}</span>
                        <span className="upgrade-icon" style={{ color: c.color }}>
                          {c.icon}
                        </span>
                        <span className="upgrade-copy">
                          <span className="upgrade-tag">{c.tag}</span>
                          <span className="upgrade-title">{c.title}</span>
                          <span className="upgrade-desc">{c.desc}</span>
                          {c.sub && <span className="upgrade-sub">{c.sub}</span>}
                        </span>
                        <span className="upgrade-plus" aria-hidden="true">
                          +
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="panel-footnote">CHOOSE WITH 1, 2, OR 3</p>
                </section>
              )}

              {panel === "over" && summary && (
                <section className="panel active" role="dialog" aria-modal="true" aria-label="Run over">
                  <p className="panel-eyebrow">PRINT RUN FINISHED</p>
                  <h2>
                    Out of
                    <br />
                    bounce.
                  </h2>
                  <div className="result-score">{number.format(summary.score)}</div>
                  <p className="result-meta">
                    POINTS / LEVEL {String(summary.level).padStart(2, "0")} / DEPTH {summary.depth} / FILED AS{" "}
                    {cleanName(name)}
                  </p>
                  <p className="result-note">{summaryNote}</p>
                  <div className="result-stats">
                    <div className="result-stat">
                      <b>{summary.kills}</b>
                      <span>BLOCKS</span>
                    </div>
                    <div className="result-stat">
                      <b>×{summary.maxCombo}</b>
                      <span>BEST CHAIN</span>
                    </div>
                    <div className="result-stat">
                      <b>{summary.perfects}</b>
                      <span>PERFECT HITS</span>
                    </div>
                    <div className="result-stat">
                      <b>{summary.depth}</b>
                      <span>DEPTH</span>
                    </div>
                  </div>
                  <button className="primary" onClick={start}>
                    ONE MORE ROUND <span aria-hidden="true">&#8599;</span>
                  </button>
                  <button className="text-button" onClick={() => openMenu("scores")}>
                    OPEN THE SCORE SHEET
                  </button>
                  <p className="panel-footnote">ANY KEY OR TAP TO GO AGAIN</p>
                </section>
              )}

              {panel === "help" && (
                <section className="panel active" role="dialog" aria-modal="true" aria-label="How to play">
                  <button className="panel-close" onClick={closeMenu} aria-label="Close instructions">
                    &#215;
                  </button>
                  <p className="panel-eyebrow">A SMALL FIELD GUIDE</p>
                  <h2>
                    Good angles.
                    <br />
                    Bad intentions.
                  </h2>
                  <p className="help-mechanic">
                    The wall of stock <strong>descends</strong> and never stops. Break blocks, catch the ink crystals
                    with your plate for experience, and take an upgrade whenever the press offers one.
                  </p>
                  <div className="brick-key">
                    <div className="brick-key-item">
                      <span className="brick-swatch" />
                      <span>
                        <strong>STOCK</strong>One hit. One block.
                      </span>
                    </div>
                    <div className="brick-key-item">
                      <span className="brick-swatch armor" />
                      <span>
                        <strong>DOUBLE-PLY</strong>Takes far more.
                      </span>
                    </div>
                    <div className="brick-key-item">
                      <span className="brick-swatch bomb" />
                      <span>
                        <strong>INK BOMB</strong>Breaks the neighbours.
                      </span>
                    </div>
                    <div className="brick-key-item">
                      <span className="brick-swatch plate" />
                      <span>
                        <strong>PROOF SHEET</strong>Worth more, drops crystals.
                      </span>
                    </div>
                  </div>
                  <div className="ball-key">
                    {(
                      [
                        ["Standard", KINDS.normal.color],
                        ["Fire", KINDS.fire.color],
                        ["Frost", KINDS.ice.color],
                        ["Spark", KINDS.bolt.color],
                        ["Bomb", KINDS.bomb.color],
                        ["Venom", KINDS.poison.color],
                        ["Drill", KINDS.drill.color],
                      ] as const
                    ).map(([label, color]) => (
                      <span className="ball-key-item" key={label}>
                        <span className="ball-dot" style={{ background: color }} />
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="help-mechanic">
                    Take two of the same ball to <strong>level two</strong> and a fusion becomes available — Fire and
                    Bomb make a Nova, Frost and Spark make a Storm, Venom and Fire make a Blight, Drill and Spark make
                    a Rail.
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
                      <span>RECALL</span>
                      <span>Space again, when the volley thins</span>
                    </div>
                    <div>
                      <span>SLOW TIME</span>
                      <span>Hold Shift / W / the slow button</span>
                    </div>
                    <div>
                      <span>PAUSE / MUTE</span>
                      <span>P or Esc / M</span>
                    </div>
                  </div>
                  <button className="primary" onClick={closeMenu}>
                    LET&apos;S MAKE A MESS <span aria-hidden="true">&#8599;</span>
                  </button>
                </section>
              )}

              {panel === "settings" && (
                <section className="panel active" role="dialog" aria-modal="true" aria-label="Settings">
                  <button className="panel-close" onClick={closeMenu} aria-label="Close settings">
                    &#215;
                  </button>
                  <p className="panel-eyebrow">MAKE YOURSELF COMFORTABLE</p>
                  <h2>
                    Your kind
                    <br />
                    of chaos.
                  </h2>
                  <label className="setting-row">
                    <span>
                      Sound<small>Paper, wood, and a little percussion.</small>
                    </span>
                    <input
                      className="switch"
                      type="checkbox"
                      checked={settings.sound}
                      onChange={(e) => patchSettings({ sound: e.target.checked })}
                    />
                  </label>
                  <label className="setting-row">
                    <span>
                      Screen shake<small>A little weight behind every hit.</small>
                    </span>
                    <input
                      className="switch"
                      type="checkbox"
                      checked={settings.shake}
                      onChange={(e) => patchSettings({ shake: e.target.checked })}
                    />
                  </label>
                  <label className="setting-row">
                    <span>
                      Reduced motion<small>Less movement. Same consequences.</small>
                    </span>
                    <input
                      className="switch"
                      type="checkbox"
                      checked={settings.reduced}
                      onChange={(e) => patchSettings({ reduced: e.target.checked })}
                    />
                  </label>
                  <div className="name-setting">
                    <label htmlFor="player-name">YOUR NAME ON THE SCORE SHEET</label>
                    <input
                      id="player-name"
                      type="text"
                      value={name}
                      maxLength={10}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNameState(v);
                        persistName(v);
                        if (entryId !== -1) setScores(renameScore(entryId, v));
                      }}
                      onBlur={commitName}
                    />
                  </div>
                  <button className="primary" onClick={closeMenu}>
                    THAT FEELS RIGHT <span aria-hidden="true">&#8599;</span>
                  </button>
                  <p className="panel-footnote">SAVED ON THIS DEVICE. M TO MUTE.</p>
                </section>
              )}

              {panel === "scores" && (
                <section className="panel score-panel active" role="dialog" aria-modal="true" aria-label="Score sheet">
                  <button className="panel-close" onClick={closeMenu} aria-label="Close score sheet">
                    &#215;
                  </button>
                  <p className="panel-eyebrow">GOOD WORK LEAVES A MARK</p>
                  <h2>The score sheet.</h2>
                  <p className="panel-description">Ten little reasons for one more try.</p>
                  <div className="score-table-wrap" tabIndex={0} role="region" aria-label="Top ten scores">
                    <table className="score-table">
                      <thead>
                        <tr>
                          <th>NO.</th>
                          <th>NAME</th>
                          <th>SCORE</th>
                          <th>LV.</th>
                          <th>DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scores.map((s, i) => (
                          <tr key={s.id} className={s.id === entryId ? "your-score" : ""}>
                            <td>{String(i + 1).padStart(2, "0")}</td>
                            <td>{s.name}</td>
                            <td>{number.format(s.score)}</td>
                            <td>{String(s.level).padStart(2, "0")}</td>
                            <td>{dateFormat.format(new Date(s.date))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {scores.length === 0 && (
                      <p className="empty-scores">
                        A clean sheet.
                        <br />
                        Go leave your first mark.
                      </p>
                    )}
                  </div>
                  <div className="score-actions">
                    <button className="primary" onClick={closeMenu}>
                      BACK TO IT
                    </button>
                    <button
                      className="text-button"
                      disabled={scores.length === 0}
                      onClick={() => {
                        setScores([]);
                        try {
                          localStorage.setItem("underpressure.scores.v1", "[]");
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      CLEAR SCORES
                    </button>
                  </div>
                  <p className="panel-footnote">LOCAL LEGENDS ONLY. SAVED ON THIS DEVICE.</p>
                </section>
              )}
            </div>
          </div>

          <div className="field-caption">
            <div className="field-hint">
              <span className="status-dot" />
              <span id="hint">{hud.hint || "BREAK BLOCKS. CATCH THE CRYSTALS. HOLD THE LINE."}</span>
            </div>
            <div className="field-keys">
              <button
                className="field-key"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  gameRef.current?.setWarpHeld(true);
                }}
                onPointerUp={() => gameRef.current?.setWarpHeld(false)}
                onPointerCancel={() => gameRef.current?.setWarpHeld(false)}
                onPointerLeave={() => gameRef.current?.setWarpHeld(false)}
                title="Hold to slow time"
              >
                HOLD: SLOW
              </button>
              <button
                className="field-key"
                onClick={() => {
                  if (screen === "playing") gameRef.current?.pause();
                  else if (screen === "paused") gameRef.current?.resume();
                  else if (screen === "menu") openMenu("help");
                }}
              >
                {screen === "menu" ? "HOW TO PLAY" : screen === "paused" ? "RESUME" : "P / PAUSE"}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>MANY BALLS. ONE WALL.</span>
        <span className="footer-right">
          <i className="footer-square" />
          AN ARCADE ORIGINAL / NO. 102
        </span>
      </footer>
    </div>
  );
}
