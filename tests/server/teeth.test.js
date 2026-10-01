// The Teeth (C6, flag region-teeth): their own things lie there (after what was there); E
// gathers ice, crystal (with a pickaxe), pine resin, hare fur and silver; the fur cloak, the
// silver sword and pine torches are made; warmth drains up in the snow (slower with a fur cloak,
// faster in a blizzard), a fire gives it back, and with none left the cold hurts; the line drops
// through an ice hole; the Frozen come with the blizzard and their touch takes warmth; the chain
// has five steps; and the White Ram: its fleece soaks blows up, rock stops its charge and dazes
// it (then blows land twice over), it brings a blizzard, and beaten it opens the Ashen Shore.
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG } = require('../helpers/world');
const CONTENT = require('../../server/content');
const teeth = require('../../server/regions/teeth');

const FEATURES = 'streaming,bigworld,caves,region-teeth,bosses,fishing';
let server;
const open = [];
before(async () => { server = await startServer({ env: { FEATURES } }); });
after(async () => { if (server) await server.stop(); });
afterEach(() => { while (open.length) open.pop().close(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(80); } throw new Error('timed out waiting for ' + what); };
const streamed = c => c.messages.filter(m => m.t === 'chunk').flatMap(m => m.objects);
const RAM = require('../../server/bosses').BOSSES.ram, RT = RAM.tune;
const SNOW = { x: RAM.appear.x, z: RAM.appear.z };   // the high snowfield (about 310 m)
const FLAT = [{ x: SNOW.x + 5, z: SNOW.z - 5 }, { x: SNOW.x - 3, z: SNOW.z + 6 }, { x: SNOW.x - 15, z: SNOW.z + 5 }];   // flat snow there, no rock beside
const lastWarmth = c => { const w = c.messages.filter(m => m.t === 'warmth'); return w.length ? w[w.length - 1].v : null; };
async function join(name) { const c = await server.join(name); open.push(c); return c; }
// Into the Teeth: open them, put the player at (x, z), wait for the land around to arrive.
async function inTeeth(c, x, z) {
  await c.test('open', { region: 'teeth' });
  await c.test('place', { x, z });
  c.send({ t: 'pos', x, z, face: 0, moving: false, sprint: false, cam: 0 });
  await until(() => streamed(c).length > 30, 8000, 'the chunks around');
}
const nearestNow = (c, type, x, z, f = () => true) => streamed(c).filter(o => o.type === type && f(o) && !(o.state && (o.state.gone || o.state.picked)))
  .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
// (the chunks keep arriving for a moment: wait for one)
const nearest = (c, type, x, z, f) => until(() => nearestNow(c, type, x, z, f), 8000, `a ${type} nearby`);
async function hold(c, key) {
  await c.settle();
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === key) });
  await sleep(120);
}

test('the Teeth have their own things (after, and without moving, what was there)', () => {
  WG.setFeatures(WG.resolveFeatures(FEATURES));
  const base = { teeth: teeth.spawn }, more = { teeth: [...teeth.spawn, ...teeth.spawnMore] }, types = {};
  for (let cx = 15; cx <= 35; cx += 2) for (let cz = -100; cz <= -88; cz += 2) {
    const a = WG.generateChunk(11, cx, cz, base), b = WG.generateChunk(11, cx, cz, more);
    assert.deepEqual(b.slice(0, a.length).map(o => [o.id, o.type, o.x, o.z]), a.map(o => [o.id, o.type, o.x, o.z]), 'the objects that were there keep their ids and places');
    for (const o of b) types[o.type + (o.ore ? ':' + o.ore : '')] = (types[o.type + (o.ore ? ':' + o.ore : '')] || 0) + 1;
  }
  for (const t of ['ice', 'crystal', 'pinesap', 'hare', 'icehole', 'ore:silver']) assert.ok(types[t] > 0, `${t} lies there (${types[t] || 0})`);
  WG.setFeatures(WG.resolveFeatures(''));
});

test('gathering: ice, pine resin, hare fur; crystal and silver need a pickaxe', async () => {
  const a = await join('gath');
  await inTeeth(a, SNOW.x, SNOW.z);
  for (const [type, item] of [['ice', 'ice'], ['hare', 'hare_fur']]) {
    const o = await nearest(a, type, SNOW.x, SNOW.z);
    assert.ok(o, `a ${type} nearby`);
    await a.test('place', { x: o.x + o.r + .5, z: o.z });
    const t = await a.act('o' + o.id);
    assert.match(t.msg, new RegExp(WG.ITEMS[item].toLowerCase()), `${type}: ${t.msg}`);
    await a.settle();
    assert.ok(a.me.inv[item] > 0, `+${item}`);
  }
  const c = await nearest(a, 'crystal', SNOW.x, SNOW.z);
  await a.test('place', { x: c.x + c.r + .5, z: c.z });
  assert.match((await a.act('o' + c.id)).msg, /pickaxe/);
  await a.test('give', { inv: { pickaxe: 1 } });
  await hold(a, 'pickaxe');
  assert.match((await a.act('o' + c.id)).msg, /\+2 crystal/);
  const s = await nearest(a, 'ore', SNOW.x, SNOW.z, o => o.ore === 'silver');
  await a.test('place', { x: s.x + s.r + .5, z: s.z });
  assert.match((await a.act('o' + s.id)).msg, /silver ore/);
  // pine resin, lower down
  await inTeeth(a, -4, -2780);
  const p = await nearest(a, 'pinesap', -4, -2780);
  assert.ok(p, 'a split pine nearby');
  await a.test('place', { x: p.x + p.r + .5, z: p.z });
  assert.match((await a.act('o' + p.id)).msg, /pine resin/);
});

test('the fur cloak, the silver sword and pine torches are made from the Teeth', async () => {
  const a = await join('craft');
  for (const id of ['fur_cloak', 'sword_silver', 'pine_torch']) {
    const r = WG.recipeById(id);
    await a.test('give', { inv: r.cost });
    assert.ok((await a.request({ t: 'build', recipe: id }, 'toast')).msg, id);
    await a.settle();
    for (const [k, n] of Object.entries(r.gives)) assert.ok(a.me.inv[k] >= n || (a.me.slots || []).some(s => s && s.k === k), `${id} gives ${k}`);
  }
  assert.deepEqual(WG.RULES.COMBAT.WEAPONS.sword_silver.tags, ['silver']);
});

test('warmth: the snow takes it (a fur cloak slows that), a fire gives it back, with none the cold hurts', async () => {
  const a = await join('cold');
  await inTeeth(a, FLAT[0].x, FLAT[0].z);
  await a.test('set', { time: .51, weather: 'clear', warmth: 100, health: 100, hunger: 100, thirst: 100 });
  const drop = async () => { const w0 = lastWarmth(a) ?? 100; await sleep(3000); return w0 - lastWarmth(a); };
  await sleep(600);
  const bare = await drop();
  assert.ok(bare >= 2, `it drains up in the snow (${bare})`);
  await a.test('give', { inv: { fur_cloak: 1 } });
  await a.test('set', { warmth: 100 });
  await sleep(600);
  const cloaked = await drop();
  assert.ok(cloaked < bare * .75, `slower with a fur cloak (${cloaked} vs ${bare})`);
  // a blizzard
  const storm = a.next(m => m.t === 'teeth' && m.blizzard === 1);
  await a.test('set', { weather: 'storm', warmth: 100 });
  await storm;
  await sleep(600);
  assert.ok((await drop()) > cloaked * 1.8, 'faster in a blizzard');
  await a.test('set', { weather: 'clear' });
  // by a fire it comes back
  await a.test('set', { warmth: 20 });
  await a.test('give', { inv: { wood: 4, stone: 3 } });
  await a.request({ t: 'build', recipe: 'campfire', x: FLAT[0].x + 1.5, z: FLAT[0].z }, m => m.t === 'toast' && /fire/i.test(m.msg));
  await until(() => lastWarmth(a) > 30, 6000, 'warmth back by the fire');
  // with none at all, the cold hurts (walk away from the fire)
  await a.test('place', FLAT[2]);
  a.send({ t: 'pos', ...FLAT[2], face: 0, moving: false, sprint: false, cam: 0 });
  await a.test('set', { warmth: 0, health: 100 });
  await sleep(2500);
  await a.settle();
  assert.ok(a.me.health < 99, `the cold hurts (${a.me.health})`);
});

test('an ice hole: a rod cast beside it drops the line through, for an ice char', async () => {
  const a = await join('char');
  await inTeeth(a, SNOW.x, SNOW.z);
  const h = await nearest(a, 'icehole', SNOW.x, SNOW.z);
  assert.ok(h, 'an ice hole nearby');
  await a.test('place', { x: h.x + 2, z: h.z });
  await a.test('give', { inv: { rod: 1 } });
  await hold(a, 'rod');
  const line = a.next(m => m.t === 'fishing' && m.id === a.id && m.s === 'wait');
  a.send({ t: 'cast', power: 1, a: 0 });   // (facing away: it still goes down the hole)
  const l = await line;
  assert.deepEqual([l.x, l.z], [h.x, h.z]);
  const { Island } = require('../../server/world');
  WG.setFeatures(WG.resolveFeatures(FEATURES));
  try { assert.deepEqual(Island.prototype.fishFor.call({ time: .5, env: {} }, 'ice', h.x, h.z).map(c => c.f.key), ['ice_char']); } finally { WG.setFeatures(WG.resolveFeatures('')); }
});

test('the Frozen come with the blizzard; their touch takes your warmth; by a fire they melt', async () => {
  const a = await join('frz');
  await inTeeth(a, FLAT[1].x, FLAT[1].z);
  await a.test('set', { time: .51, weather: 'storm', warmth: 100, health: 100 });
  try {
  const spawned = await (async () => { for (let i = 0; i < 40; i++) { const m = (await a.test('mobs')).mobs.filter(x => x.kind === 'frozen'); if (m.length) return m; await sleep(250); } return []; })();
  assert.ok(spawned.length > 0, 'they come with the blizzard');
  const { mob } = await a.test('spawn', { kind: 'frozen', x: FLAT[1].x + 1.5, z: FLAT[1].z });
  const touched = a.next(m => m.t === 'toast' && /warmth goes out/.test(m.msg), { timeout: 6000 });
  await touched;
  await sleep(200);
  assert.ok(lastWarmth(a) <= 100 - WG.RULES.TEETH.FROZEN.DRAIN + 2, `warmth taken (${lastWarmth(a)})`);
  assert.ok((await a.test('mobHit', { mob: mob.id, amount: 4, source: ['fire'] })).dmg >= 12, 'fire hurts them');
  // the blizzard ends: they're gone
  await a.test('set', { weather: 'clear' });
  await sleep(600);
  assert.equal((await a.test('mobs')).mobs.filter(x => x.kind === 'frozen').length, 0, 'gone with the blizzard');
  } finally { await a.test('set', { weather: 'clear' }); }
});

test('the Teeth’s chain has five steps, one in the ice cave; two bugs and a fish of their own', async () => {
  assert.equal(teeth.requests.length, 5);
  for (const k of teeth.requests) assert.ok(CONTENT.SLEEPER.some(r => r.key === k && r.pool === false), `${k} is a chain step`);
  const cave = CONTENT.SLEEPER.find(r => r.key === 'teeth_cave');
  assert.deepEqual([cave.conditions.type, cave.conditions.cave], ['in_cave', teeth.cave.id]);
  assert.equal(CONTENT.BUGS.filter(b => b.region === 'teeth').length, 2);
  assert.ok(CONTENT.FISH.some(f => f.key === 'ice_char' && f.water.includes('ice')));
  assert.equal(teeth.boss, 'ram');
  const a = await join('cave');
  assert.ok(a.welcome.caves.some(c => c.id === 'icecave' && c.region === 'teeth'), 'the ice cave is in the welcome');
});

test('rock ahead stops a charge (the snowfield is ringed with it)', () => {
  WG.setFeatures(WG.resolveFeatures(FEATURES));
  try {
    const island = { objectsNear: () => [] };
    let walls = 0;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      for (let d = 0; d < 30; d += .5) if (RAM.rockAhead(island, SNOW.x + Math.sin(a) * d, SNOW.z + Math.cos(a) * d, a, .5)) { walls++; break; }
    }
    assert.ok(walls >= 14, `rock in most directions (${walls}/16)`);
    assert.ok(!RAM.rockAhead(island, SNOW.x, SNOW.z, 0, .5), 'not in the middle');
  } finally { WG.setFeatures(WG.resolveFeatures('')); }
});

test('the White Ram: its fleece soaks blows up; dazed, they land twice over; it brings a blizzard; beaten, the Ashen Shore opens', async () => {
  const a = await join('ram');
  await inTeeth(a, SNOW.x - 6, SNOW.z);
  const calm = a.next(m => m.t === 'teeth' && m.blizzard === 0, { timeout: 2000 }).catch(() => null);
  await a.test('set', { time: .51, weather: 'clear' });   // (no blizzard to start with)
  await calm;
  await a.test('set', { time: 0, health: 100, hunger: 100, thirst: 100, warmth: 100 });
  const came = a.next(m => m.t === 'boss' && m.id === 'ram' && m.state === 'fighting');
  const storm = a.next(m => m.t === 'teeth' && m.blizzard >= 1);
  await a.test('boss', { boss: 'ram' });
  const boss = await came;
  await storm;
  assert.equal((await a.test('mobHit', { mob: boss.mob, amount: 100 })).dmg, 100 * RT.FLEECE, 'the fleece takes most of it');
  await a.test('mobState', { mob: boss.mob, state: 'dazed' });
  assert.equal((await a.test('mobHit', { mob: boss.mob, amount: 10 })).dmg, 10 * RT.SKULL, 'dazed: twice over');
  const opens = a.next(m => m.t === 'toast' && /fog stirs/.test(m.msg));
  const relic = a.next(m => m.t === 'journal' && m.key === RAM.trophy.relic);
  await a.test('mobHit', { mob: boss.mob, amount: 100000 });
  await opens; await relic;
});
