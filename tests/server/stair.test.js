// The Stairs (C3, flag region-stair): their own things to gather, the old mine, the bugs, the
// Leaning, and the request chain.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG } = require('../helpers/world');
const leaning = require('../../server/mobs/leaning');
const CONTENT = require('../../server/content');
const stair = require('../../server/regions/stair');

const FEATURES = 'streaming,bigworld,caves,region-stair';
let server;
before(async () => { server = await startServer({ env: { FEATURES } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(80); } throw new Error('timed out waiting for ' + what); };
// Everything the server has streamed to this player so far (chunks of new land).
const streamed = c => c.messages.filter(m => m.t === 'chunk').flatMap(m => m.objects);
// Onto the Stairs: open them, put the player at (x, z), wait for the land around to arrive.
async function onStairs(c, x, z) {
  await c.test('open', { region: 'stair' });
  await c.test('place', { x, z });
  c.send({ t: 'pos', x, z, face: 0, moving: false, sprint: false, cam: 0 });
  await until(() => streamed(c).length > 20, 8000, 'the chunks around');
}

test('the Stairs grow their own things (after, and without moving, what was there)', () => {
  WG.setFeatures(WG.resolveFeatures(FEATURES));
  const base = { stair: stair.spawn }, more = { stair: [...stair.spawn, ...stair.spawnMore] }, types = {};
  for (let cx = -3; cx <= 3; cx++) for (let cz = -34; cz <= -22; cz++) {
    const a = WG.generateChunk(11, cx, cz, base), b = WG.generateChunk(11, cx, cz, more);
    assert.deepEqual(b.slice(0, a.length).map(o => [o.id, o.type, o.x, o.z]), a.map(o => [o.id, o.type, o.x, o.z]), 'the objects that were there keep their ids and places');
    for (const o of b) types[o.type === 'ore' ? o.ore : o.type] = (types[o.type === 'ore' ? o.ore : o.type] || 0) + 1;
  }
  for (const t of ['flint', 'herb', 'flax', 'ruin', 'standing', 'tin']) assert.ok(types[t] > 0, `${t} grows there (${types[t] || 0})`);
  WG.setFeatures(WG.resolveFeatures(''));
});

test('gathering: flint, herbs, flax and bricks, and they grow back', async () => {
  const a = await server.join('st');
  await onStairs(a, 0, -900);
  for (const [type, item] of [['flint', 'flint'], ['herb', 'herbs'], ['flax', 'flax'], ['ruin', 'bricks']]) {
    const o = streamed(a).filter(o => o.type === type && !(o.state && (o.state.gone || o.state.picked)))
      .sort((p, q) => Math.hypot(p.x, p.z + 900) - Math.hypot(q.x, q.z + 900))[0];
    assert.ok(o, `a ${type} nearby`);
    await a.test('place', { x: o.x + o.r + .5, z: o.z });
    const before = (a.me.inv || {})[item] || 0;
    const t = await a.act('o' + o.id);
    assert.match(t.msg, new RegExp(WG.ITEMS[item].toLowerCase()), `${type}: ${t.msg}`);
    await a.settle();
    assert.ok(a.me.inv[item] > before, `+${item}`);
  }
  assert.ok(WG.THINGS.herb.regrow > 0 && WG.THINGS.ruin.regrow > 0, 'they grow back after a while');
  a.close();
});

test('the old mine is there (with caves and the Stairs on)', async () => {
  const a = await server.join('stm');
  assert.ok(a.welcome.caves.some(c => c.id === 'oldmine' && c.region === 'stair'), 'in the welcome');
  a.close();
});

test('a Leaning, carried on a gust, shoves you down the steps; behind a standing stone it cannot', async () => {
  const a = await server.join('stl');
  await onStairs(a, 0, -900);
  // dusk: late enough that they don't fade, too early for the night's own to come out, so only
  // the ones placed here are about
  const DUSK = .775;
  assert.ok(WG.nightFactor(DUSK) > .3 && WG.nightFactor(DUSK) < .6);
  await a.test('set', { time: DUSK });
  // out in the open, with one right upwind of you, as a gust starts
  const open = { x: 0, z: -900 };
  await a.test('place', open);
  const waitGust = async () => { while (leaning.wind(Date.now()).gust) await sleep(100); while (!leaning.wind(Date.now()).gust) await sleep(50); };
  const w0 = leaning.wind(Date.now() + 12000);
  const knocked = a.next(m => m.t === 'knocked' && m.id === a.id, { timeout: 20000 });
  await waitGust();
  const w = leaning.wind(Date.now());
  // (waiting for the shove before it can come: it's sent in the same tick as the knockdown)
  const shove = a.next(m => m.t === 'correct' && Math.hypot(m.x - open.x, m.z - open.z) > .5, { timeout: 23000 });
  await a.test('spawn', { kind: 'leaning', x: open.x - Math.sin(w.a) * 2, z: open.z - Math.cos(w.a) * 2 });
  await knocked;
  const shoved = await shove;
  assert.ok(Math.hypot(shoved.x - open.x, shoved.z - open.z) > 2, 'thrown downwind');
  // behind a standing stone (on its downwind side): it can't touch you (a second frog: the
  // first can't be knocked down again so soon anyway)
  const b = await server.join('stl2');
  await b.test('set', { time: DUSK });
  await onStairs(b, 80, -960);   // away from the first one, still drifting about
  const stone = streamed(b).filter(o => o.type === 'standing').sort((p, q) => Math.hypot(p.x - 80, p.z + 960) - Math.hypot(q.x - 80, q.z + 960))[0];
  assert.ok(stone, 'a standing stone somewhere near');
  await waitGust();
  const w2 = leaning.wind(Date.now());
  const lee = { x: stone.x + Math.sin(w2.a) * (stone.r + .6), z: stone.z + Math.cos(w2.a) * (stone.r + .6) };
  await b.test('place', lee);
  const n0 = b.messages.filter(m => m.t === 'knocked' && m.id === b.id).length;
  assert.equal(n0, 0, 'b has not been knocked down before (so no cooldown hides the result)');
  await b.test('spawn', { kind: 'leaning', x: lee.x - Math.sin(w2.a) * 1.5, z: lee.z - Math.cos(w2.a) * 1.5 });
  await sleep(2200);
  assert.equal(b.messages.filter(m => m.t === 'knocked' && m.id === b.id).length, n0, 'sheltered: not knocked');
  void w0;
  a.close(); b.close();
});

test('the Stairs have a chain of five requests, one of them for the old mine', () => {
  assert.equal(stair.requests.length, 5);
  for (const k of stair.requests) assert.ok(CONTENT.SLEEPER.some(r => r.key === k && r.pool === false), `${k} is a chain step`);
  const mine = CONTENT.SLEEPER.find(r => r.key === 'stair_mine');
  assert.deepEqual([mine.conditions.type, mine.conditions.cave], ['in_cave', 'oldmine']);
  assert.ok(CONTENT.BUGS.filter(b => b.region === 'stair').length === 3, 'three bugs of its own');
});
