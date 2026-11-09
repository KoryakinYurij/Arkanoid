# Arkanoid Synthesis Implementation Plan

> **For agentic workers:** Execute assigned tasks with exclusive file ownership; keep all changes in Test1.

**Goal:** Preserve the complete donor game under the reference's paper art direction and tactile presentation.

**Architecture:** Keep donor rules, progression and original540x960 portrait world with nine columns. Uniformly scale the arena and use surrounding space for live build information. Replace canvas presentation, React shell and Web Audio. Build a single offline HTML through the donor Vite setup.

**Tech Stack:** Existing React 19, TypeScript, Vite, Canvas2D, Web Audio.

**Spec:** `docs/design.md`.

## Global Constraints
- Work only in Tests/Test1; never inspect Test2.
- Preserve donor numeric balance, content and progression.
- No external fonts, images, audio or runtime CDN requirements.

## Review Focus
- Lost pointer capture/focus must not leave movement or slow motion held.
- UI overlays must not intercept gameplay shortcuts in name fields.
- Presentation must support every element, fusion, status and boss.
- Small screens must keep arena and upgrade choices usable.
- Exported HTML must function offline and persist scores safely.

### Task 1 — Recover donor and pin mechanics
- [x] Extract only donor files into Test1.
- [x] Add regression checks for effects, progression and simulation behavior; run baseline.

### Task 2 — Interface (worker owns App.tsx, index.css, index.html)
- [x] Recreate centered portrait paper arena, dedicated main menu, Russian help, score sheet, settings and run overlays. Add live arsenal and combination side panels per latest user clarification; no webpage/hero appearance.
- [x] Use existing Game public actions plus `getHud(): Hud`, `setPresentation({shake,reducedMotion})` and `setSlowMotion(active)`.
- [x] Check type compatibility and keyboard/touch flows.

### Task 3 — Rendering and integration (root owns engine.ts, data.ts, tests)
- [x] Add read-only HUD snapshot and presentation settings.
- [x] Replace neon renderer with paper art, clear type/status markings and restrained impact FX.
- [x] Keep donor simulation constants, collision, effects and progression intact.
- [x] Fix demonstrated input/lifecycle issues with regression checks.

### Task 4 — Audio (worker owns audio.ts)
- [x] Adapt reference's paper percussion to all existing Sfx cue names and preserve API.
- [x] Avoid leaking AudioContexts/voices; retain mute/unlock behavior.

### Task 5 — Delivery
- [x] Type check, regression suite, production build.
- [x] Browser checks desktop and touch viewport; save screenshots.
- [x] Independent review; resolve actionable findings.
- [x] Deliver standalone HTML and short launch instructions.


## Verified result — 2026-11-08
- User clarification superseded by the later portrait-field correction: original arena proportions, live side panels and dedicated menu, no webpage shell.
- `npm run check`: passed.
- `npm test`: 19/19 passed.
- `npm run build`: passed; standalone `Side Effect.html` produced.
- Chromium desktop 1600×900 and mobile390×844,320×568: canvas fills viewport, no page errors.
- Real UI: mouse movement, Shift slow motion, pause/settings restoration, upgrade choice, boss/status render, game over and saved name checked.
- Offline file:// run: no HTTP requests, no page errors, settings persist after reload.
- Independent comparison found no missing fusion, passive, status, volley, boss or score rule.
- Fixed responsive startup/row alignment/range/touch issues and inherited post-game timer/fatal-heart issues, each with regression coverage.
- Original touch auto-recall behavior retained; touch dragging never accidentally triggers a manual recall.
- No Test2 inspection or modification.


## Portrait-field correction
- Fixed 540/960 arena aspect; no landscape expansion of the playfield.
- Left: current arsenal/passives. Right: four fusion recipe progress states and collected combinations.
- Narrow viewport: the same build information in a dedicated sheet.
- Layout helper and regression checks added; rebuilt offline artifact after browser validation.


### Acceptance of portrait correction
- Source and standalone HTML both pass the new browser scenario.
- Desktop1600x900: centered arena488.25x868; two live side panels.
- Medium950x900: same portrait arena; combinations sidebar.
- Phone390x844: centered arena390x693.328; full build via Pause -> Build.
- Small320x568: arena319.5x568, no horizontal overflow.
- Actual recipe progression Nova locked -> ready -> collected verified, including two fused balls and passive display.
- Offline: zero network requests, zero page errors. Types and19regression tests pass. Independent review found no actionable defects.
