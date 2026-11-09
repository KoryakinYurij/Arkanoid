import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as meta from '../src/game/meta.ts';

test('a new profile starts with no progress and independent discovery lists', () => {
  const profile = meta.defaultMeta();
  assert.deepEqual(profile, {
    version: 1,
    discoveries: [],
    bestBosses: 0,
    bestPerfects: 0,
    bestScore: 0,
    selectedStarter: 'classic',
  });
  profile.discoveries.push('nova');
  assert.deepEqual(meta.defaultMeta().discoveries, []);
});

const facts = (changes = {}) => ({ fusions: [], bosses: 0, perfects: 0, score: 0, ...changes });

test('new players can only select the five-ball classic starter', () => {
  assert.equal(typeof meta.isStarterUnlocked, 'function');
  const profile = meta.defaultMeta();
  assert.equal(meta.isStarterUnlocked(profile, 'classic'), true);
  assert.equal(meta.isStarterUnlocked(profile, 'ember'), false);
  assert.equal(meta.isStarterUnlocked(profile, 'frost'), false);
  assert.equal(meta.isStarterUnlocked(profile, 'unknown'), false);
  assert.equal(meta.selectStarter(profile, 'ember').selectedStarter, 'classic');
  assert.equal(meta.selectStarter(profile, 'frost').selectedStarter, 'classic');
  assert.deepEqual(meta.STARTERS.classic.balls, [{ kind: 'normal', count: 5, level: 1 }]);
  assert.equal(meta.hasReroll(profile), false);
});

test('a first boss unlocks and permits selecting the fire starter immediately', () => {
  assert.equal(typeof meta.applyProgress, 'function');
  const result = meta.applyProgress(meta.defaultMeta(), facts({ bosses: 1, score: 300 }));
  assert.deepEqual(result.newChallenges, ['first_boss']);
  assert.ok(result.newUnlocks.some(reward => reward.includes('Пиротехник')));
  assert.equal(meta.isStarterUnlocked(result.profile, 'ember'), true);
  assert.equal(meta.isStarterUnlocked(result.profile, 'frost'), false);
  const selected = meta.selectStarter(result.profile, 'ember');
  assert.equal(selected.selectedStarter, 'ember');
  assert.equal(meta.selectStarter(selected, 'frost').selectedStarter, 'ember');
  assert.equal(result.profile.selectedStarter, 'classic');
  assert.deepEqual(meta.STARTERS.ember.balls, [
    { kind: 'normal', count: 3, level: 1 }, { kind: 'fire', count: 1, level: 1 },
  ]);
});

test('the first discovered fusion unlocks the ice starter during the same run', () => {
  assert.equal(typeof meta.applyProgress, 'function');
  const result = meta.applyProgress(meta.defaultMeta(), facts({ fusions: ['storm', 'storm'] }));
  assert.deepEqual(result.profile.discoveries, ['storm']);
  assert.deepEqual(result.newDiscoveries, ['storm']);
  assert.deepEqual(result.newChallenges, ['first_fusion']);
  assert.ok(result.newUnlocks.some(reward => reward.includes('Криолог')));
  assert.equal(meta.isStarterUnlocked(result.profile, 'frost'), true);
  assert.equal(meta.isStarterUnlocked(result.profile, 'ember'), false);
  assert.equal(meta.selectStarter(result.profile, 'frost').selectedStarter, 'frost');
  assert.deepEqual(meta.STARTERS.frost.balls, [
    { kind: 'normal', count: 3, level: 1 }, { kind: 'ice', count: 1, level: 1 },
  ]);
});

test('ten perfect hits in one run unlock a reroll without adding runs together', () => {
  assert.equal(typeof meta.applyProgress, 'function');
  const first = meta.applyProgress(meta.defaultMeta(), facts({ perfects: 6 })).profile;
  const second = meta.applyProgress(first, facts({ perfects: 7 })).profile;
  assert.equal(second.bestPerfects, 7);
  assert.equal(meta.hasReroll(second), false);
  const result = meta.applyProgress(second, facts({ perfects: 10 }));
  assert.equal(meta.hasReroll(result.profile), true);
  assert.deepEqual(result.newChallenges, ['precision']);
  assert.ok(result.newUnlocks.some(reward => reward.includes('переброс')));
});

test('all four fusion discoveries complete the archive and each reward appears once', () => {
  assert.equal(typeof meta.applyProgress, 'function');
  const first = meta.applyProgress(meta.defaultMeta(), facts({ fusions: ['rail', 'nova'] })).profile;
  const result = meta.applyProgress(first, facts({ fusions: ['nova', 'storm', 'plague', 'rail'] }));
  assert.deepEqual(result.profile.discoveries, ['rail', 'nova', 'storm', 'plague']);
  assert.deepEqual(result.newDiscoveries, ['storm', 'plague']);
  assert.deepEqual(result.newChallenges, ['archive']);
  assert.ok(result.newUnlocks.some(reward => reward.includes('Мастер синтеза')));
  const duplicate = meta.applyProgress(result.profile, facts({ fusions: ['nova', 'storm', 'plague', 'rail'] }));
  assert.deepEqual(duplicate.profile, result.profile);
  assert.deepEqual(duplicate.newDiscoveries, []);
  assert.deepEqual(duplicate.newChallenges, []);
  assert.deepEqual(duplicate.newUnlocks, []);
});

test('progress snapshots only union discoveries and improve personal bests without mutation', () => {
  assert.equal(typeof meta.applyProgress, 'function');
  const profile = Object.freeze({ ...meta.defaultMeta(), discoveries: Object.freeze(['nova']),
    bestBosses: 2, bestPerfects: 12, bestScore: 500, selectedStarter: 'ember' });
  const snapshot = Object.freeze({ fusions: Object.freeze(['nova', 'rail']), bosses: 1, perfects: 3, score: 200 });
  const result = meta.applyProgress(profile, snapshot);
  assert.deepEqual(result.profile, { version: 1, discoveries: ['nova', 'rail'],
    bestBosses: 2, bestPerfects: 12, bestScore: 500, selectedStarter: 'ember' });
  assert.deepEqual(result.newChallenges, []);
  const duplicate = meta.applyProgress(result.profile, snapshot);
  assert.deepEqual(duplicate.profile, result.profile);
  assert.deepEqual(duplicate.newDiscoveries, []);
  result.profile.discoveries.push('storm');
  assert.deepEqual(profile.discoveries, ['nova']);
  assert.deepEqual(snapshot.fusions, ['nova', 'rail']);
});

test('challenge progress is derived from bests and capped at each target', () => {
  assert.equal(typeof meta.getChallenges, 'function');
  assert.deepEqual(meta.getChallenges(meta.defaultMeta()).map(({ id, progress, completed }) => ({ id, progress, completed })), [
    { id: 'first_boss', progress: 0, completed: false },
    { id: 'first_fusion', progress: 0, completed: false },
    { id: 'precision', progress: 0, completed: false },
    { id: 'archive', progress: 0, completed: false },
  ]);
  const result = meta.applyProgress(meta.defaultMeta(), facts({
    fusions: ['nova', 'storm', 'plague', 'rail'], bosses: 3, perfects: 25,
  }));
  assert.deepEqual(meta.getChallenges(result.profile).map(({ id, progress, completed }) => ({ id, progress, completed })), [
    { id: 'first_boss', progress: 1, completed: true },
    { id: 'first_fusion', progress: 1, completed: true },
    { id: 'precision', progress: 10, completed: true },
    { id: 'archive', progress: 4, completed: true },
  ]);
  assert.equal(result.newUnlocks.length, 4);
});

test('invalid facts cannot add invented discoveries or corrupt personal bests', () => {
  assert.equal(typeof meta.applyProgress, 'function');
  const result = meta.applyProgress(meta.defaultMeta(), facts({
    fusions: ['unknown', 'normal', null, 'nova', 'nova'], bosses: -1, perfects: NaN, score: Infinity,
  }));
  assert.deepEqual(result.profile.discoveries, ['nova']);
  assert.deepEqual(result.newDiscoveries, ['nova']);
  assert.equal(result.profile.bestBosses, 0);
  assert.equal(result.profile.bestPerfects, 0);
  assert.equal(result.profile.bestScore, 0);
  const fractional = meta.applyProgress(result.profile, facts({ fusions: null, bosses: 1.9, perfects: 8.8, score: 321.8 }));
  assert.equal(fractional.profile.bestBosses, 1);
  assert.equal(fractional.profile.bestPerfects, 8);
  assert.equal(fractional.profile.bestScore, 321);
});

const META_KEY = 'sideeffect.test1.meta.v1';

function installStorage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  meta.saveMeta(meta.defaultMeta());
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  return { values, storage };
}

test('missing, malformed and unsupported saved profiles safely start fresh', t => {
  assert.equal(typeof meta.loadMeta, 'function');
  assert.equal(typeof meta.saveMeta, 'function');
  const { values } = installStorage(t);
  for (const raw of [null, '{bad json', 'null', '[]', '"profile"', '42', '{"version":2,"bestBosses":99}']) {
    if (raw === null) values.delete(META_KEY);
    else values.set(META_KEY, raw);
    assert.deepEqual(meta.loadMeta(), { version: 1, discoveries: [], bestBosses: 0,
      bestPerfects: 0, bestScore: 0, selectedStarter: 'classic' }, `saved value: ${raw}`);
  }
});

test('saved profiles reject duplicate or invalid discoveries and locked selections', t => {
  assert.equal(typeof meta.loadMeta, 'function');
  const { values } = installStorage(t);
  values.set(META_KEY, JSON.stringify({ version: 1, discoveries: ['nova', 'unknown', 'nova', null, 'rail'],
    bestBosses: -2, bestPerfects: 17.9, bestScore: '150', selectedStarter: 'ember' }));
  assert.deepEqual(meta.loadMeta(), { version: 1, discoveries: ['nova', 'rail'], bestBosses: 0,
    bestPerfects: 17, bestScore: 0, selectedStarter: 'classic' });
  values.set(META_KEY, JSON.stringify({ version: 1, discoveries: ['storm'],
    bestBosses: 1e400, bestPerfects: -0.5, bestScore: 39.9, selectedStarter: 'frost' }));
  assert.deepEqual(meta.loadMeta(), { version: 1, discoveries: ['storm'], bestBosses: 0,
    bestPerfects: 0, bestScore: 39, selectedStarter: 'frost' });
  values.set(META_KEY, JSON.stringify({ version: 1, discoveries: ['storm'], selectedStarter: '__proto__' }));
  assert.equal(meta.loadMeta().selectedStarter, 'classic');
});

test('save and load round-trip normalized progress under a Test1-specific key', t => {
  assert.equal(typeof meta.saveMeta, 'function');
  const { values } = installStorage(t);
  values.set('sideeffect.test1.scores.v1', 'existing scores');
  const profile = Object.freeze({ version: 1, discoveries: Object.freeze(['nova', 'nova', 'bad']),
    bestBosses: 2.8, bestPerfects: -1, bestScore: 754.9, selectedStarter: 'ember' });
  meta.saveMeta(profile);
  assert.equal(values.get('sideeffect.test1.scores.v1'), 'existing scores');
  assert.deepEqual([...values.keys()].sort(), ['sideeffect.test1.meta.v1', 'sideeffect.test1.scores.v1']);
  const expected = { version: 1, discoveries: ['nova'], bestBosses: 2,
    bestPerfects: 0, bestScore: 754, selectedStarter: 'ember' };
  assert.deepEqual(JSON.parse(values.get(META_KEY)), expected);
  assert.deepEqual(meta.loadMeta(), expected);
  const loaded = meta.loadMeta();
  loaded.discoveries.push('rail');
  assert.deepEqual(meta.loadMeta(), expected);
  assert.deepEqual(profile.discoveries, ['nova', 'nova', 'bad']);
});

test('blocked writes keep the newest progress even when reads return stale data', t => {
  assert.equal(typeof meta.saveMeta, 'function');
  const { storage } = installStorage(t);
  storage.setItem = () => { throw new Error('storage quota exceeded'); };
  const profile = { version: 1, discoveries: ['nova'], bestBosses: 1,
    bestPerfects: 10, bestScore: 900, selectedStarter: 'frost' };
  assert.doesNotThrow(() => meta.saveMeta(profile));
  assert.deepEqual(meta.loadMeta(), profile);
  const loaded = meta.loadMeta();
  loaded.discoveries.push('rail');
  assert.deepEqual(meta.loadMeta(), profile);
});

test('missing and blocked localStorage retain progress for the current app session', t => {
  assert.equal(typeof meta.saveMeta, 'function');
  const { storage } = installStorage(t);
  const profile = { version: 1, discoveries: ['rail'], bestBosses: 1,
    bestPerfects: 4, bestScore: 600, selectedStarter: 'ember' };
  meta.saveMeta(profile);
  storage.getItem = () => { throw new Error('read access denied'); };
  assert.deepEqual(meta.loadMeta(), profile);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    get() { throw new Error('storage access denied'); } });
  assert.deepEqual(meta.loadMeta(), profile);
  assert.doesNotThrow(() => meta.saveMeta(profile));
  assert.deepEqual(meta.loadMeta(), profile);
  delete globalThis.localStorage;
  const next = meta.applyProgress(profile, facts({ fusions: ['nova'], bosses: 2, score: 800 })).profile;
  assert.doesNotThrow(() => meta.saveMeta(next));
  assert.deepEqual(meta.loadMeta(), next);
});

test('applying a progress snapshot does not persist it before the app saves', t => {
  assert.equal(typeof meta.saveMeta, 'function');
  const { values } = installStorage(t);
  const stored = values.get(META_KEY);
  const result = meta.applyProgress(meta.loadMeta(), facts({ fusions: ['nova'], bosses: 1 }));
  assert.equal(result.profile.bestBosses, 1);
  assert.equal(values.get(META_KEY), stored);
  assert.deepEqual(meta.loadMeta().discoveries, []);
  assert.equal(meta.loadMeta().bestBosses, 0);
});
