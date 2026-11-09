import { test } from 'node:test';
import assert from 'node:assert/strict';

const { getGameLayout } = await import('../src/game/layout.ts').catch(() => ({}));

test('the game layout exposes a fixed portrait arena', () => {
  assert.equal(typeof getGameLayout, 'function');
  for (const [w, h] of [[1600, 900], [1180, 800], [950, 900], [800, 600], [390, 844], [320, 568]]) {
    const layout = getGameLayout(w, h);
    assert.ok(Math.abs(layout.arenaWidth / layout.arenaHeight - 540 / 960) < 1e-10);
    assert.ok(layout.arenaWidth <= w && layout.arenaHeight <= h);
    assert.ok(layout.arenaWidth > 0 && layout.arenaHeight > 0);
  }
});

test('wide screens reserve space for arsenal and combinations beside the field', () => {
  assert.equal(typeof getGameLayout, 'function');
  const layout = getGameLayout(1600, 900);
  assert.equal(layout.showArsenal, true);
  assert.equal(layout.showCombinations, true);
  assert.ok(layout.arenaWidth < 540);
  assert.ok((1600 - layout.arenaWidth) / 2 > 260);
});

test('narrow screens keep the field readable without squeezed side panels', () => {
  assert.equal(typeof getGameLayout, 'function');
  const layout = getGameLayout(390, 844);
  assert.equal(layout.showArsenal, false);
  assert.equal(layout.showCombinations, false);
  assert.equal(layout.arenaWidth, 390);
});
