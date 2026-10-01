// Fighting (P6, flag combat): swings hit what's in reach and in the arc, a sword's third quick
// hit knocks back, heavy swings cost energy, the sling throws stones, a roll dodges a blow,
// a blow that would kill you leaves you down for a friend to pick up, and the Stilled break
// into fog.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'combat,caves' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const K = WG.RULES.COMBAT, W = K.WEAPONS;
let spot = 0;
// A player standing on open ground facing +z (looking that way too), and a fresh spot each time.
async function fighter(prefix) {
  const c = await server.join(prefix);
  const at = landNear({ x: WG.SPAWN.x + 14 * (spot % 4) - 20, z: WG.SPAWN.z - 12 - 14 * Math.floor(spot / 4) });
  spot++;
  await c.test('place', { ...at, face: 0 });
  c.send({ t: 'pos', x: at.x, z: at.z, face: 0, moving: false, sprint: false, cam: 0 });
  await sleep(150);
  return { c, at };
}
const spawn = async (c, kind, x, z, opts = {}) => (await c.test('spawn', { kind, x, z, opts })).mob;
// Swing (a = where you aim) and collect the hits that follow.
async function swing(c, opts = {}, wait = 250) {
  const n = c.messages.length;
  c.send({ t: 'attack', a: 0, ...opts });
  await sleep(wait);
  return c.messages.slice(n).filter(m => m.t === 'mobhit');
}
async function hold(c, item) {
  await c.test('give', { inv: { [item]: 1 } });
  await c.settle();
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === item) });
  await sleep(100);
}

test('a bare-handed swing hits what is in front, in reach, and not too soon', async () => {
  const { c, at } = await fighter('fist');
  const d = await spawn(c, 'dummy', at.x, at.z + 1.4);
  const behind = await spawn(c, 'dummy', at.x, at.z - 1.4);
  const far = await spawn(c, 'dummy', at.x + .2, at.z + 6);
  const hits = await swing(c);
  assert.deepEqual(hits.map(h => h.id), [d.id], 'only the one in front and in reach');
  assert.equal(hits[0].dmg, W.fist.damage);
  assert.equal((await swing(c, {}, 100)).length, 0, 'too soon after the last swing');
  await sleep(W.fist.swing * 1000);
  assert.equal((await swing(c, { a: Math.PI })).map(h => h.id).join(), String(behind.id), 'turned round: the one behind');
  assert.ok(far);
});

test('a wooden sword: made, held, and its third quick hit hits harder and knocks back', async () => {
  const { c, at } = await fighter('sword');
  await c.test('give', { inv: { wood: 4 } });
  assert.match((await c.request({ t: 'build', recipe: 'sword_wood' }, 'toast')).msg, /wooden sword/i);
  await c.settle();
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === 'sword_wood') });
  await sleep(100);
  const d = await spawn(c, 'dummy', at.x, at.z + 1.6);
  const dmg = [];
  for (let i = 0; i < 3; i++) { dmg.push((await swing(c, {}, W.sword_wood.swing * 1000 + 30))[0].dmg); }
  assert.deepEqual(dmg, [W.sword_wood.damage, W.sword_wood.damage, +(W.sword_wood.damage * K.COMBO.MULT).toFixed(2)]);
  const m = (await c.test('mobs')).mobs.find(x => x.id === d.id);
  assert.ok(m.z > at.z + 1.6 + W.sword_wood.knock * K.COMBO.KNOCK * .9, `knocked back to ${m.z - at.z} m`);
});

test('a heavy swing hits harder and costs energy', async () => {
  const { c, at } = await fighter('heavy');
  await spawn(c, 'dummy', at.x, at.z + 1.3);
  await c.settle();
  const e0 = c.me.energy;
  const [h] = await swing(c, { heavy: true }, 300);
  assert.equal(h.dmg, +(W.fist.damage * K.HEAVY.MULT).toFixed(2));
  await c.settle();
  assert.ok(c.me.energy <= e0 - K.HEAVY.ENERGY + 1, `energy ${e0} -> ${c.me.energy}`);
});

test('the sling throws a stone from the bag at the first creature in line', async () => {
  const { c, at } = await fighter('sling');
  await hold(c, 'sling');
  const d = await spawn(c, 'dummy', at.x, at.z + 10);
  const empty = c.next(m => m.t === 'toast' && /needs stones/.test(m.msg));
  c.send({ t: 'attack', a: 0 });
  await empty;
  await c.test('give', { inv: { stone: 2 } });
  await sleep(W.sling.swing * 1000);
  const hits = await swing(c, {}, 300);
  assert.deepEqual(hits.map(h => h.id), [d.id]);
  await c.settle();
  assert.equal(c.me.inv.stone, 1, 'one stone thrown');
});

test('a roll dodges the blow; too tired, you can’t roll', async () => {
  const { c, at } = await fighter('dodge');
  await c.settle();
  const h0 = c.me.health;
  const d = await spawn(c, 'dummy', at.x, at.z + 2);
  const tg = await c.next(m => m.t === 'telegraph' && m.id === d.id, { timeout: 5000 });   // (its own: other tests' dummies are still about)
  await sleep(Math.max(0, tg.ms - 200));   // roll just before it lands
  const clear = c.next(m => m.t === 'toast' && /roll clear/.test(m.msg), { timeout: 3000 });
  c.send({ t: 'dodge' });
  await clear;
  await c.settle();
  assert.equal(c.me.health, h0, 'not hurt');
  await sleep(K.DODGE.GAP * 1000);
  await c.test('set', { energy: 2 });
  const tired = c.next(m => m.t === 'toast' && /Too tired/.test(m.msg));
  c.send({ t: 'dodge' });
  await tired;
});

test('a blow that would kill you leaves you down, and a friend holding E picks you up', async () => {
  const { c: a, at } = await fighter('down');
  const b = await server.join('friend');
  await b.test('place', { x: at.x + 1, z: at.z });
  await a.test('set', { health: 5 });
  await spawn(a, 'dummy', at.x, at.z + 2);
  const down = await a.next(m => m.t === 'downed' && m.id === a.id, { timeout: 8000 });
  assert.equal(down.until, K.DOWNED.TIME);
  await a.settle();
  assert.ok(a.me.down && !a.me.dead && a.me.health >= 1, 'down, not dead');
  // too quick: not yet
  b.send({ t: 'revive', id: a.id });
  b.send({ t: 'revive', id: a.id, done: true });
  await sleep(300);
  assert.ok(!a.messages.some(m => m.t === 'revived'), 'not picked up in an instant');
  b.send({ t: 'revive', id: a.id });
  await sleep(K.DOWNED.REVIVE * 1000);
  const up = a.next(m => m.t === 'revived' && m.id === a.id);
  b.send({ t: 'revive', id: a.id, done: true });
  assert.equal((await up).by, b.id);
  await a.settle();
  assert.ok(!a.me.down && a.me.health >= K.DOWNED.HEALTH, 'up again');
});

test('down with nobody to help: you wake on the beach', async () => {
  const { c } = await fighter('alone');
  const woke = c.next(m => m.t === 'correct', { timeout: 5000 });
  await c.test('down', { ms: 600 });
  const at = await woke;
  assert.ok(Math.hypot(at.x - WG.SPAWN.x, at.z - WG.SPAWN.z) < .01, 'on the beach');
});

test('a Stilled breaks into fog after a few blows', async () => {
  const { c, at } = await fighter('fog');
  await c.test('set', { time: .02, weather: 'fogstorm' });   // a foggy night
  await hold(c, 'sword_wood');
  const s = await spawn(c, 'stilled', at.x, at.z + 1.8, { face: Math.PI });
  assert.equal(s.hp, K.STILLED_HP);
  const burst = c.next(m => m.t === 'fogburst', { timeout: 5000 });
  for (let i = 0; i < 4 && !c.messages.some(m => m.t === 'fogburst'); i++) await swing(c, {}, W.sword_wood.swing * 1000 + 30);
  await burst;
  assert.ok(!(await c.test('mobs')).mobs.some(m => m.id === s.id), 'gone (for now)');
  await c.test('set', { time: .5, weather: 'clear' });
});

test('down in the sea cave, the Crawler can be hit too', async () => {
  const Caves = require('../../server/shared/caves');
  const cave = Caves.generateCave(require('../../server/regions/landing').cave);
  const c = await server.join('cave');
  await c.test('time', { at: Caves.CAVE.TIDE.PHASE + .5 });   // the midday low tide
  let cr = null;
  for (let i = 0; i < 30 && !cr; i++) { await sleep(100); cr = (await c.test('mobs')).mobs.find(m => m.kind === 'crawler'); }
  assert.ok(cr, 'the Crawler is in its cave');
  const n = cave.nodes.reduce((b, q) => (Math.hypot(q.x - cr.x, q.z - cr.z) < Math.hypot(b.x - cr.x, b.z - cr.z) && Math.hypot(q.x - cr.x, q.z - cr.z) > .8 ? q : b), cave.nodes[0]);
  await c.test('place', { x: n.x, z: n.z, under: cave.id });
  await sleep(150);
  const a = Math.atan2(cr.x - n.x, cr.z - n.z);
  const hits = await swing(c, { a });
  assert.deepEqual(hits.map(h => h.id), [cr.id]);
});
