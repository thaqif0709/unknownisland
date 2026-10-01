// Fighting at night (P6, flag combat): light slows the Stilled, and two friends fight one
// together until it breaks into fog, then pick each other up when they're down. (On its own
// server so no one else is about to be noticed or to watch.)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, spotNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'combat,caves' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const K = WG.RULES.COMBAT, W = K.WEAPONS;
const MIDNIGHT = 0;
// Thick night fog, well away from any light (lanterns and fires in a kept database).
function foggySpot(welcome, from) {
  const lights = [...welcome.lanterns.filter(l => l.lit || l.clear > 0), ...welcome.fires];
  return spotNear(from, (h, x, z) => h > .6 && h < 4 && lights.every(l => Math.hypot(l.x - x, l.z - z) > 40)
    && [0, 1, 2, 3, 4, 5].every(i => { const a = i * Math.PI / 3, sx = x + Math.sin(a) * 14, sz = z + Math.cos(a) * 14, sh = WG.heightAt(sx, sz);
      return sh > .3 && WG.fogAt(sx, sz, sh, MIDNIGHT, [], {}) > .9; }), { step: 6, max: 160 });
}
// Where we stand and which way the camera looks (the Stilled only move unwatched).
const look = (c, at, cam) => c.send({ t: 'pos', x: at.x, z: at.z, face: cam, moving: false, sprint: false, cam });
const mobAt = async (c, id) => (await c.test('mobs')).mobs.find(m => m.id === id);
async function hold(c, item, n = 1) {
  await c.test('give', { inv: { [item]: n } });
  await c.settle();
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === item) });
  await sleep(100);
}
// How far a Stilled comes in ms.
async function comes(c, id, ms) {
  const a = await mobAt(c, id);
  await sleep(ms);
  const b = await mobAt(c, id);
  return Math.hypot(b.x - a.x, b.z - a.z);
}

test('a torch in hand slows the Stilled coming for you', async () => {
  const c = await server.join('lit');
  const at = foggySpot(c.welcome, WG.SPAWN);
  assert.ok(at, 'found fog to stand in');
  await c.test('place', { ...at, face: 0 });
  look(c, at, 0);
  await c.test('set', { time: MIDNIGHT, weather: 'clear' });
  const { mob } = await c.test('spawn', { kind: 'stilled', x: at.x, z: at.z - 7 });   // behind, unwatched
  await sleep(200);
  const dark = await comes(c, mob.id, 800);
  await hold(c, 'torch');
  const lit = await comes(c, mob.id, 800);
  assert.ok(dark > .5, `it came ${dark.toFixed(2)} m in the dark`);
  assert.ok(lit < dark * (K.LIGHT_SLOW + .2), `and ${lit.toFixed(2)} m with a torch in hand`);
  await c.test('set', { time: .5 });
  c.close();
});

test('two friends fight a Stilled together, then pick each other up', async () => {
  const a = await server.join('pairA'), b = await server.join('pairB');
  const at = foggySpot(a.welcome, { x: WG.SPAWN.x + 30, z: WG.SPAWN.z - 30 });
  const bt = { x: at.x + 1.2, z: at.z };
  await a.test('place', { ...at, face: 0 });
  await b.test('place', { ...bt, face: 0 });
  await a.test('set', { time: MIDNIGHT, weather: 'clear' });
  const { mob } = await a.test('spawn', { kind: 'stilled', x: at.x + .6, z: at.z + 1.6, opts: { face: Math.PI } });
  // both looking at it (so it holds still), aiming at it
  const aimA = Math.atan2(.6, 1.6), aimB = Math.atan2(-.6, 1.6);
  look(a, at, aimA); look(b, bt, aimB);
  await hold(a, 'sword_wood');
  await sleep(150);
  const hitsBy = { a: 0, b: 0 };
  const burst = a.next(m => m.t === 'fogburst', { timeout: 8000 });
  for (let i = 0; i < 8 && !a.messages.some(m => m.t === 'fogburst'); i++) {
    const [who, c, aim, gap] = i % 2 ? ['b', b, aimB, W.fist.swing] : ['a', a, aimA, W.sword_wood.swing];
    const n = c.messages.length;
    c.send({ t: 'attack', a: aim });
    await sleep(250);
    hitsBy[who] += c.messages.slice(n).filter(m => m.t === 'mobhit' && m.id === mob.id).length;
    await sleep(Math.max(0, gap * 1000 - 200));
  }
  await burst;
  assert.ok(hitsBy.a > 0 && hitsBy.b > 0, `both landed blows (${hitsBy.a} and ${hitsBy.b})`);
  assert.ok(!(await mobAt(a, mob.id)), 'broken into fog');
  // A goes down; B holds E beside them
  const downA = b.next(m => m.t === 'downed' && m.id === a.id);
  await a.test('down', { ms: 15000 });
  await downA;
  b.send({ t: 'revive', id: a.id });
  await sleep(K.DOWNED.REVIVE * 1000);
  const upA = a.next(m => m.t === 'revived' && m.id === a.id);
  b.send({ t: 'revive', id: a.id, done: true });
  assert.equal((await upA).by, b.id);
  // then B goes down, and A returns the favour
  const downB = a.next(m => m.t === 'downed' && m.id === b.id);
  await b.test('down', { ms: 15000 });
  await downB;
  a.send({ t: 'revive', id: b.id });
  await sleep(K.DOWNED.REVIVE * 1000);
  const upB = b.next(m => m.t === 'revived' && m.id === b.id);
  a.send({ t: 'revive', id: b.id, done: true });
  assert.equal((await upB).by, a.id);
  await a.settle(); await b.settle();
  assert.ok(!a.me.down && !b.me.down, 'both up');
  await a.test('set', { time: .5 });
  a.close(); b.close();
});
