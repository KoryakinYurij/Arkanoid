const ARENA_ASPECT = 540 / 960;

/** Keep the donor playfield proportions; only its surrounding instruments adapt. */
export function getGameLayout(viewportWidth: number, viewportHeight: number) {
  const showArsenal = viewportWidth >= 1180;
  const showCombinations = viewportWidth >= 900;
  const padding = viewportWidth >= 700 ? 16 : 0;
  const sideSpace = showArsenal ? 264 : showCombinations ? 200 : 0;
  const availableWidth = Math.max(1, viewportWidth - padding * 2 - sideSpace * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const arenaWidth = Math.min(availableWidth, availableHeight * ARENA_ASPECT);
  return {
    arenaWidth,
    arenaHeight: arenaWidth / ARENA_ASPECT,
    showArsenal,
    showCombinations,
  };
}
