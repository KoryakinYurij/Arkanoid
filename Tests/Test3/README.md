# UNDER PRESSURE

A fusion-fuelled brick breaker. Fuse the balls, catch the ink crystals, and hold the line
above the danger rule — while the press keeps coming down.

This is a **synthesis of two sources**, deliberately kept apart:

| Layer | Source | What was taken |
|---|---|---|
| **Mechanic** | `Projects for Destill/arkanoid-great-mechanic.zip` ("Neon Pit") | Ball kinds, fusion recipes, passive upgrades, XP → card draft, combo, slow-motion, the descending wall, the danger line, boss rows, safety net, perfect hits |
| **Visual & feel** | `Projects for Destill/Great visual and feel of game.html` ("Side Effect") | Paper-and-ink editorial system, letterpress typography, clip-path print blocks, paper-bit debris, wood-and-percussion audio, hit-stop, trauma shake, squash-and-stretch, panel choreography |

Nothing else was carried over from either project: the reference's own mechanic
(offcut knock-on chain) and its art are gone; the Neon Pit's neon palette and
Russian copy are gone.

---

## Run it

```bash
npm install
npm run dev      # http://127.0.0.1:5183
npm run build    # -> dist/index.html (single self-contained file, ~280 kB)
```

`npm run build` inlines the JS and CSS into one HTML file — double-click `dist/index.html`
and it plays, no server, no network.

---

## Controls

| | |
|---|---|
| **Move** | Mouse / drag / `A` `D` / arrows |
| **Launch** | Click / tap / `Space` |
| **Recall** | `Space` again once the volley thins out |
| **Slow time** | Hold `Shift` or `W`, or hold the **HOLD: SLOW** button |
| **Pause / mute** | `P` or `Esc` / `M` |
| **Pick a draft** | `1` `2` `3` |

---

## The mechanic

Seven balls, each with its own behaviour, and four fusions unlocked by levelling two of
them up:

- **Standard** — no tricks.
- **Fire** 🔥 — sets stock alight; damage over time.
- **Frost** ❄️ — brittle stock (+50% damage) and a slower press.
- **Spark** ⚡ — chains lightning into nearby blocks.
- **Bomb** 💣 — detonates on impact.
- **Venom** 🧪 — poisons; dying blocks infect their neighbours.
- **Drill** 🌀 — punches clean through.

Fusions: **Nova** (Fire + Bomb), **Storm** (Frost + Spark), **Blight** (Venom + Fire),
**Rail** (Drill + Spark). Take the same ball to level two and the fusion appears in the
draft, permanently.

Ten passives sit alongside: Sharp Edges, Wide Margin, Steady Hand, Ricochet, Safety Net,
Slow Press, Solid Frame, Clockmaker, Parry Master, Ink Magnet.

The wall of stock descends and speeds up when the field is clear, easing off when it is
close. Crossing the danger line costs a life. Every fourteenth row is **the press
itself** — a heavy block with a core in the middle.

---

## Layout

```
src/
  main.tsx            entry
  App.tsx             editorial shell: masthead, intro column, arena column, panels
  index.css           the house style — tokens, layout, panels, container-query type scale
  game/
    data.ts           palette, ball kinds, fusion recipes, passives, score sheet
    audio.ts          paper-and-wood percussion synthesised in the browser
    engine.ts         simulation + rendering (the whole game)
_tools/
  mech.mjs            mechanic acceptance suite (11 checks)
  deliver.mjs         captures the delivery screenshots + probes the audio graph
_shots/               captured frames
```

### Two deliberate deviations from the sources

1. **Plain CSS, not Tailwind.** The mechanic zip shipped with Tailwind, but the Side
   Effect visual identity is hand-built CSS with design tokens; porting it to utility
   classes would have cost more fidelity than it bought.
2. **Panel typography scales with the field.** The reference drew its panel type for a
   720 px sheet; this field is a narrow 9:16 column. Every panel size is derived from
   the field's own width via container queries (`cqi`), so the panels stay in proportion
   from a 420 px phone to a wide desktop.

---

## Tests

With the dev server running:

```bash
node _tools/mech.mjs
```

Drives the real game in Chrome and checks the full loop: the draft opens, a fusion is
offered when both ingredients are level two, the fusion consumes them and yields two
balls, the run resumes, the boss block spawns, a breach costs a life, running out of
lives ends the run, the score reaches the score sheet, and restart clears the board.
