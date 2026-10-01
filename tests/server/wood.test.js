// The Weeping Wood (C4, flag region-wood): its own things grow there (after what was there);
// E gathers resin, vine rope, strange fruit, giant leaves and amber, and an axe hews a little
// hardwood a day from a giant; the bow, arrows, resin torches and the leaf glider are made;
// river fish bite in its river; the Hung drop on a frog in the dark beneath them but not on one
// with a torch; its chain has five steps; and the Hanging Mother: out of reach until her three
// vines are cut, then on the ground (light hurting her more), and beaten she opens the Mire.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG } = require('../helpers/world');
const CONTENT = require('../../server/content');
const wood = require('../../server/regions/wood');

const FEATURES = 'streaming,bigworld,caves,region-wood,bosses';
let server;
before(async () => { server = await startServer({ env: { FEATURES } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(80); } throw new Error('timed out waiting for ' + what); };
const streamed = c => c.messages.filter(m => m.t === 'chunk').flatMap(m => m.objects);
const MOTHER = require('../../server/bosses').BOSSES.mother, MT = MOTHER.tune;
// Into the Wood: open it, put the player at (x, z), wait for the land around to arrive.
async function inWood(c, x, z) {
  await c.test('open', { region: 'wood' });
  await c.test('place', { x, z });
  c.send({ t: 'pos', x, z, face: 0, moving: false, sprint: false, cam: 0 });
  await until(() => streamed(c).length > 30, 8000, 'the chunks around');
}
const nearestNow = (c, type, x, z) => streamed(c).filter(o => o.type === type && !(o.state && (o.state.gone || o.state.picked)))
  .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];

// (the chunks keep arriving for a moment: wait for one)
const nearest = (c, type, x, z) => until(() => nearestNow(c, type, x, z), 8000, `a ${type} nearby`);

test('the Wood grows its own things (after, and without moving, what was there)', () => {
  WG.setFeatures(WG.resolveFeatures(FEATURES));
  const base = { wood: wood.spawn }, more = { wood: [...wood.spawn, ...wood.spawnMore] }, types = {};
  for (let cx = 40; cx <= 50; cx++) for (let cz = -46; cz <= -38; cz++) {
    const a = WG.generateChunk(11, cx, cz, base), b = WG.generateChunk(11, cx, cz, more);
    assert.deepEqual(b.slice(0, a.length).map(o => [o.id, o.type, o.x, o.z]), a.map(o => [o.id, o.type, o.x, o.z]), 'the objects that were there keep their ids and places');
    for (const o of b) types[o.type] = (types[o.type] || 0) + 1;
  }
  for (const t of ['giant', 'resin', 'vine', 'fruit', 'bigleaf', 'amber']) assert.ok(types[t] > 0, `${t} grows there (${types[t] || 0})`);
  WG.setFeatures(WG.resolveFeatures(''));
});

test('gathering: resin, vine rope, strange fruit, a giant leaf and amber', async () => {
  const a = await server.join('wd');
  await inWood(a, 1450, -1450);
  for (const [type, item] of [['resin', 'resin'], ['vine', 'vine_rope'], ['fruit', 'strange_fruit'], ['bigleaf', 'giant_leaf'], ['amber', 'amber']]) {
    const o = await nearest(a, type, 1450, -1450);
    assert.ok(o, `a ${type} nearby`);
    await a.test('place', { x: o.x + o.r + .5, z: o.z });
    const before = (a.me.inv || {})[item] || 0;
    const t = await a.act('o' + o.id);
    assert.match(t.msg, new RegExp(WG.ITEMS[item].toLowerCase()), `${type}: ${t.msg}`);
    await a.settle();
    assert.ok(a.me.inv[item] > before, `+${item}`);
  }
  a.close();
});

test('a giant: no hardwood without an axe; with one, a little a day', async () => {
  const a = await server.join('hew');
  await inWood(a, 1500, -1400);
  const g = await nearest(a, 'giant', 1500, -1400);
  assert.ok(g, 'a giant nearby');
  await a.test('place', { x: g.x + g.r + .8, z: g.z });
  assert.match((await a.act('o' + g.id)).msg, /need an axe/);
  await a.test('give', { inv: { axe: 1 } });
  await a.settle();
  a.send({ t: 'select', slot: a.me.slots.findIndex(s => s && s.k === 'axe') });
  await sleep(100);
  assert.match((await a.act('o' + g.id)).msg, /\+2 hardwood/);
  assert.match((await a.act('o' + g.id)).msg, /\+1 hardwood/);
  assert.match((await a.act('o' + g.id)).msg, /tomorrow/);
  await a.settle();
  assert.equal(a.me.inv.hardwood, WG.RULES.WOOD.HARDWOOD);
  assert.ok(g.climb, 'its vines can be climbed');
  a.close();
});

test('the bow, arrows, resin torches and the leaf glider are made from the Wood', async () => {
  const a = await server.join('craft');
  for (const id of ['bow', 'arrow', 'resin_torch', 'leaf_glider']) {
    const r = WG.recipeById(id);
    await a.test('give', { inv: r.cost });
    assert.ok((await a.request({ t: 'build', recipe: id }, 'toast')).msg, id);
    await a.settle();
    for (const [k, n] of Object.entries(r.gives)) assert.ok(a.me.inv[k] >= n, `${id} gives ${k}`);
  }
  assert.equal(WG.RULES.COMBAT.WEAPONS.bow.ammo, 'arrow');
  a.close();
});

test('river fish bite in the Wood’s river', () => {
  WG.setFeatures(WG.resolveFeatures(FEATURES + ',fishing'));
  try {
    const { Island } = require('../../server/world');
    const { waterAt } = require('../../server/systems/fishing');
    const r = WG.RIVERS[0], mx = (r[1][0] + r[2][0]) / 2, mz = (r[1][1] + r[2][1]) / 2;
    assert.equal(waterAt(mx, mz), 'river');
    const bites = time => Island.prototype.fishFor.call({ time, env: {} }, 'river', mx, mz).map(c => c.f.key).sort();
    assert.deepEqual(bites(.5), ['catfish', 'glass_carp'], 'by day');
    assert.deepEqual(bites(0), ['catfish'], 'at night');
  } finally { WG.setFeatures(WG.resolveFeatures('')); }
});

test('the Hung drop on a frog in the dark beneath them, not on one with a torch', async () => {
  const a = await server.join('hung');
  await inWood(a, 1440, -1460);
  await a.test('set', { time: 0, weather: 'clear', health: 100 });   // night
  const { mob } = await a.test('spawn', { kind: 'hung', x: 1440.5, z: -1460, opts: { home: { x: 1440.5, z: -1460 } } });
  assert.equal((await a.test('mobHit', { mob: mob.id, amount: 10 })).dmg, 0, 'out of reach up there');
  const creak = await a.next(m => m.t === 'telegraph' && m.id === mob.id, { timeout: 6000 });
  assert.ok(Math.hypot(creak.x - 1440, creak.z + 1460) < .5, 'a ring where you stand');
  // with a torch in hand, another one stays up
  const b = await server.join('lit');
  await b.test('place', { x: 1480, z: -1480 });
  b.send({ t: 'pos', x: 1480, z: -1480, face: 0, moving: false, sprint: false, cam: 0 });
  await b.test('give', { inv: { torch: 1 } });
  await b.settle();
  b.send({ t: 'select', slot: b.me.slots.findIndex(s => s && s.k === 'torch') });
  const m2 = (await b.test('spawn', { kind: 'hung', x: 1480.5, z: -1480, opts: { home: { x: 1480.5, z: -1480 } } })).mob;
  await sleep(5000);
  assert.ok(!b.messages.some(m => m.t === 'telegraph' && m.id === m2.id), 'not on a frog with a light');
  a.close(); b.close();
});

test('the Wood’s chain has five steps, one in the root hollow; three bugs of its own', () => {
  assert.equal(wood.requests.length, 5);
  for (const k of wood.requests) assert.ok(CONTENT.SLEEPER.some(r => r.key === k && r.pool === false), `${k} is a chain step`);
  const hollow = CONTENT.SLEEPER.find(r => r.key === 'wood_hollow');
  assert.deepEqual([hollow.conditions.type, hollow.conditions.cave], ['in_cave', wood.cave.id]);
  assert.equal(CONTENT.BUGS.filter(b => b.region === 'wood').length, 3);
  assert.equal(wood.boss, 'mother');
});

test('the Hanging Mother: out of reach until her vines are cut; down, light hurts her; beaten, the Mire opens', async () => {
  const a = await server.join('mom');
  await inWood(a, MOTHER.appear.x - 6, MOTHER.appear.z);
  await a.test('set', { time: 0, weather: 'clear', health: 100 });
  const came = a.next(m => m.t === 'boss' && m.id === 'mother' && m.state === 'fighting');
  await a.test('boss', { boss: 'mother' });
  const boss = await came;
  await sleep(200);
  const vines = (await a.test('mobs')).mobs.filter(m => m.kind === 'mother_vine');
  assert.equal(vines.length, 3, 'three vines');
  assert.equal((await a.test('mobHit', { mob: boss.mob, amount: 50 })).dmg, 0, 'out of reach up there');
  const falls = a.next(m => m.t === 'toast' && /falls/.test(m.msg));
  for (const v of vines) await a.test('mobHit', { mob: v.id, amount: MT.VINE.HP });
  await falls;
  assert.equal((await a.test('mobHit', { mob: boss.mob, amount: 10, source: ['light'] })).dmg, 20, 'down, and light hurts her twice over');
  const opens = a.next(m => m.t === 'toast' && /fog stirs/.test(m.msg));
  const relic = a.next(m => m.t === 'journal' && m.key === MOTHER.trophy.relic);
  await a.test('mobHit', { mob: boss.mob, amount: 100000 });
  await opens; await relic;
  await sleep(200);
  assert.ok(!(await a.test('mobs')).mobs.some(m => m.kind === 'mother_vine'), 'her vines go with her');
  a.close();
});
