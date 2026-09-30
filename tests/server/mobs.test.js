// Mobs (P5): the Stilled on the new engine behave as before, and the test dummy's
// telegraphed attack, weaknesses, stagger and death work.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { startServer } = require('../helpers/server');
const { WG, spotNear } = require('../helpers/world');

const ADMIN = 'mobadm' + crypto.randomBytes(3).toString('hex');
let server;
before(async () => { server = await startServer({ env: { ADMINS: ADMIN } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIDNIGHT = 0;
const mobsIn = (c, kind) => (c.snap ? c.snap.m : []).filter(m => !kind || m[1] === kind);
const mobById = (c, id) => mobsIn(c).find(m => m[0] === id);
const until = async (fn, ms = 5000, what = 'condition') => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) { const v = fn(); if (v) return v; }
  throw new Error(`timed out waiting for ${what}`);
};

// Thick night fog, well away from any light (lanterns and fires in a kept database).
function foggySpot(welcome, from) {
  const lights = [...welcome.lanterns.filter(l => l.lit || l.clear > 0), ...welcome.fires];
  return spotNear(from, (h, x, z) => h > .6 && h < 4 && lights.every(l => Math.hypot(l.x - x, l.z - z) > 40)
    && [0, 1, 2, 3, 4, 5].every(i => { const a = i * Math.PI / 3, sx = x + Math.sin(a) * 14, sz = z + Math.cos(a) * 14, sh = WG.heightAt(sx, sz);
      return sh > .3 && WG.fogAt(sx, sz, sh, MIDNIGHT, [], {}) > .9; }), { step: 6, max: 160 });
}
// Tell the server where we are and which way the camera looks (the Stilled only move unwatched).
const look = (c, at, cam) => c.send({ t: 'pos', x: at.x, z: at.z, face: cam, moving: false, sprint: false, cam });
const dirTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

test('the Stilled come at night, in fog', async () => {
  const a = await server.join('night');
  const at = foggySpot(a.welcome, WG.SPAWN);
  assert.ok(at, 'found fog to stand in');
  await a.test('place', at);
  look(a, at, 0);
  await a.test('set', { time: MIDNIGHT, weather: 'clear' });
  await until(() => mobsIn(a, 'stilled').length > 0, 8000, 'a Stilled to appear');
  const [, , x, z] = mobsIn(a, 'stilled')[0];
  const d = Math.hypot(x - at.x, z - at.z);
  assert.ok(d >= WG.RULES.STILLED.SPAWN_MIN - 1 && d <= WG.RULES.STILLED.SPAWN_MAX + 1, `spawned ${d.toFixed(1)} away`);
  // daylight: they're gone
  await a.test('set', { time: .5 });
  await until(() => mobsIn(a, 'stilled').length === 0, 5000, 'the Stilled to fade at noon');
  a.close();
});

test('a Stilled only moves while nobody looks, and knocks you down when it reaches you', async () => {
  const a = await server.join('watch');
  const at = foggySpot(a.welcome, { x: WG.SPAWN.x + 30, z: WG.SPAWN.z - 30 });
  await a.test('place', at);
  await a.test('set', { time: MIDNIGHT });
  const sx = at.x + 6, sz = at.z;
  const { mob } = await a.test('spawn', { kind: 'stilled', x: sx, z: sz });
  // looking straight at it: it stays put
  look(a, at, dirTo(at, { x: sx, z: sz }));
  await sleep(1200);
  const held = mobById(a, mob.id);
  assert.ok(held, 'still there');
  assert.ok(Math.hypot(held[2] - sx, held[3] - sz) < .05, 'it did not move while watched');
  // look away: it comes, and knocks us down
  const knocked = a.next('knocked', { timeout: 8000 });
  look(a, at, dirTo(at, { x: sx, z: sz }) + Math.PI);
  await until(() => { const m = mobById(a, mob.id); return !m || Math.hypot(m[2] - sx, m[3] - sz) > .5; }, 3000, 'it to move');
  const k = await knocked;
  assert.equal(k.id, a.id);
  await until(() => !mobById(a, mob.id), 2000, 'it to be gone after the knock');
  await a.test('set', { time: .5 });
  a.close();
});

test('one left standing in daylight stays until someone walks up to it', async () => {
  const a = await server.join('linger');
  await a.test('set', { time: .5 });
  const at = { x: WG.SPAWN.x, z: WG.SPAWN.z };
  await a.test('place', at);
  const { mob } = await a.test('spawn', { kind: 'stilled', x: at.x + 20, z: at.z, opts: { lingering: true } });
  await sleep(800);
  assert.ok(mobById(a, mob.id), 'still standing at noon');
  await a.test('place', { x: at.x + 15, z: at.z });
  await until(() => !mobById(a, mob.id), 3000, 'it to go when approached');
  a.close();
});

test('the test dummy marks the ground, then strikes there', async () => {
  const a = await server.join('dummy');
  await a.test('set', { time: .5 });
  const at = spotNear(WG.SPAWN, h => h > .6 && h < 3);
  await a.test('place', at);
  look(a, at, 0);
  const health = a.me.health;
  const warned = a.next('telegraph', { timeout: 5000 });
  const { mob } = await a.test('spawn', { kind: 'dummy', x: at.x + 3, z: at.z });
  const tg = await warned;
  assert.equal(tg.id, mob.id);
  assert.equal(tg.shape, 'circle');
  assert.ok(Math.hypot(tg.x - at.x, tg.z - at.z) < .1, 'marked where we stand');
  const hit = await a.next(m => m.t === 'toast' && /slams/.test(m.msg), { timeout: 3000 });
  assert.ok(hit);
  await a.settle();
  assert.ok(a.me.health < health, 'it hurt');
  // step out of the circle before the next one lands: no damage
  const next = await a.next('telegraph', { timeout: 6000 });
  await a.test('place', { x: next.x + next.r + 2, z: next.z });
  const h2 = (await a.settle(), a.me.health);
  await sleep(1300);
  assert.ok(!a.messages.slice(-20).some(m => m.t === 'toast' && /slams/.test(m.msg) && m !== hit), 'no second hit outside the circle');
  await a.settle();
  assert.ok(a.me.health >= h2);
});

test('hitting a mob: weaknesses multiply, a hit staggers, and it dies at 0', async () => {
  const a = await server.join('hitter');
  await a.test('set', { time: .5 });
  const at = spotNear({ x: WG.SPAWN.x - 20, z: WG.SPAWN.z - 10 }, h => h > .6 && h < 3);
  await a.test('place', at);
  const { mob } = await a.test('spawn', { kind: 'dummy', x: at.x + 20, z: at.z });   // out of its reach, so it idles
  const plain = await a.test('mobHit', { mob: mob.id, amount: 5, source: ['sword'] });
  assert.equal(plain.dmg, 5);
  assert.equal(plain.hp, 25);
  await until(() => { const m = mobById(a, mob.id); return m && m[5] === 'stagger'; }, 2000, 'a stagger');
  const fire = await a.test('mobHit', { mob: mob.id, amount: 5, source: ['fire'] });
  assert.equal(fire.dmg, 10, 'fire does double');
  const seen = a.next(m => m.t === 'mobhit' && m.id === mob.id && m.hp === 0);
  const last = await a.test('mobHit', { mob: mob.id, amount: 100 });
  assert.equal(last.gone, true);
  await seen;
  await until(() => !mobById(a, mob.id), 2000, 'the dead dummy to leave the snapshot');
});

test('admins can /spawn a creature; others can\'t', async () => {
  const admin = await server.join('adm', { username: ADMIN });
  const said = await admin.request({ t: 'chat', text: '/spawn dummy' }, m => m.t === 'chat' && m.kind === 'system');
  assert.match(said.text, /A dummy \(#\d+\) appears/);
  assert.match((await admin.request({ t: 'chat', text: '/spawn dragon' }, m => m.t === 'chat' && m.kind === 'system')).text, /Spawn what\?/);
  const other = await server.join('pleb');
  assert.match((await other.request({ t: 'chat', text: '/spawn dummy' }, m => m.t === 'chat' && m.kind === 'system')).text, /no \/spawn command/);
});
