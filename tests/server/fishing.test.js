// Fishing (P7, flag fishing): a rod is made and held, a cast lands in the water (or not),
// a fish bites, E hooks it, a minigame lands it (two for a rare one) or snaps the line, and
// it goes in the bag and the journal; the rod wears; walking off reels in; a friend's E buys a
// second; a raw fish cooks at a fire; and every Landing fish bites in its own water and time.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, shoreSpot } = require('../helpers/world');
const CONTENT = require('../../server/content');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'fishing,slots,tools' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const F = WG.RULES.FISHING, USES = WG.RULES.TOOLS.USES.rod;
const dist = d => (d - F.CAST.MIN) / (F.CAST.MAX - F.CAST.MIN);   // the power that casts d m out

let nextShore = 0;
// A player on the shore with a rod in hand.
async function angler(prefix, at) {
  const c = await server.join(prefix);
  at = at || shoreSpot((nextShore++) * 1.1);
  await c.test('place', { x: at.x, z: at.z, face: at.face });
  c.send({ t: 'pos', x: at.x, z: at.z, face: at.face, moving: false, sprint: false, cam: at.face });
  await c.test('give', { inv: { rod: 1 } });
  await c.settle();
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === 'rod') });
  await sleep(100);
  return { c, at };
}
const cast = (c, at, d = 6) => c.request({ t: 'cast', power: dist(d), a: at.face }, m => m.t === 'fishing' && m.id === c.id);
// A fish bites (the test's choice of fish and game), and E hooks it: the game's message.
async function hookOne(c, fish, game = 'trivia') {
  const bit = c.next('fish-bite');
  await c.test('bite', { fish, game });
  await bit;
  return c.request({ t: 'hook' }, 'minigame');
}
async function win(c) {
  const { game, answer } = await c.test('solve');
  return c.request({ t: 'minigame-answer', id: game, answer }, 'minigame-result');
}
const rod = c => c.me.slots.find(s => s && s.k === 'rod');

test('a rod is made from wood and copper and wears like a tool', async () => {
  const c = await server.join('rodmaker');
  await c.test('give', { inv: WG.recipeById('rod').cost });
  assert.match((await c.request({ t: 'build', recipe: 'rod' }, 'toast')).msg, /fishing rod/i);
  await c.settle();
  assert.equal(rod(c).d, USES);
});

test('a cast lands in the sea, or on dry ground does nothing; E with nothing biting reels in', async () => {
  const { c, at } = await angler('caster');
  const dry = await c.request({ t: 'cast', power: dist(4), a: at.face + Math.PI }, 'toast');   // turned round: inland
  assert.match(dry.msg, /dry ground/);
  const m = await cast(c, at);
  assert.equal(m.s, 'wait');
  assert.ok(Math.hypot(m.x - (at.x + Math.sin(at.face) * 6), m.z - (at.z + Math.cos(at.face) * 6)) < .05, 'six metres out');
  const t = c.next('toast');
  const off = c.next(x => x.t === 'fishing' && x.id === c.id && x.s === null);
  c.send({ t: 'hook' });
  assert.match((await t).msg, /reel in/);
  await off;
});

test('a bite, hooked in time and landed: in the bag, in the journal, and the rod wears', async () => {
  const { c, at } = await angler('lander');
  await cast(c, at);
  const g = await hookOne(c, 'silverfin');
  assert.equal(g.type, 'trivia');
  const journal = c.next(m => m.t === 'journal' && m.key === 'silverfin');
  const landed = c.next(m => m.t === 'toast' && /land a silverfin/.test(m.msg));
  assert.equal((await win(c)).won, true);
  await journal; await landed;
  await c.settle();
  assert.equal(c.me.inv.silverfin, 1);
  assert.equal(rod(c).d, USES - 1);
});

test('lost: the line snaps and the rod loses uses; missed: it gets away', async () => {
  const { c, at } = await angler('snapper');
  await cast(c, at);
  const g = await hookOne(c, 'silverfin');
  const snap = c.next(m => m.t === 'toast' && /line snaps/.test(m.msg));
  c.send({ t: 'minigame-quit', id: g.id });
  await snap;
  await c.settle();
  assert.equal(c.me.inv.silverfin, 0);
  assert.equal(rod(c).d, USES - F.SNAP);
  // a bite left too long
  await cast(c, at);
  const away = c.next(m => m.t === 'toast' && /got away/.test(m.msg), { timeout: 4000 });
  await c.test('bite', { fish: 'silverfin' });
  await away;
});

test('a rare fish takes two games in a row', async () => {
  const { c, at } = await angler('rare');
  await cast(c, at);
  await hookOne(c, 'lantern_fish');
  const second = c.next('minigame');
  await win(c);
  await second;
  const landed = c.next(m => m.t === 'toast' && /land a lantern fish/.test(m.msg));
  await win(c);
  await landed;
});

test('walking off reels the line in', async () => {
  const { c, at } = await angler('walker');
  await cast(c, at);
  const t = c.next(m => m.t === 'toast' && /walk off/.test(m.msg));
  for (let i = 1; i <= 3; i++) {   // a step at a time, as walking does
    c.send({ t: 'pos', x: at.x - Math.sin(at.face) * 1.2 * i, z: at.z - Math.cos(at.face) * 1.2 * i, face: at.face, moving: true, sprint: false, cam: at.face });
    await sleep(300);
  }
  await t;
});

test('a friend beside you can buy you a second, once', async () => {
  const { c: a, at } = await angler('helped');
  const b = await server.join('helper');
  await b.test('place', { x: at.x + 1, z: at.z });
  await cast(a, at);
  const g = await hookOne(a, 'silverfin', 'water');
  const more = a.next('minigame-time');
  b.send({ t: 'fish-help', id: a.id });
  assert.equal((await more).ms, g.ms + F.HELP * 1000);
  b.send({ t: 'fish-help', id: a.id });
  await sleep(300);
  assert.equal(a.messages.filter(m => m.t === 'minigame-time').length, 1, 'only once');
  await win(a);
});

test('a pool minnow from a spring; bait is taken by the bite', async () => {
  const sp = WG.SPRINGS[0], at = { x: sp.x, z: sp.z - 6, face: 0 };
  const { c } = await angler('spring', at);
  await c.test('give', { inv: { bait: 2 } });
  const m = await cast(c, at, 6);
  assert.ok(Math.hypot(m.x - sp.x, m.z - sp.z) < .1, 'in the pool');
  await hookOne(c, 'pool_minnow');
  await c.settle();
  assert.equal(c.me.inv.bait, 1, 'one bait taken');
  await win(c);
  await c.settle();
  assert.equal(c.me.inv.pool_minnow, 1);
});

test('a raw fish cooks at a lit fire', async () => {
  const { c, at } = await angler('cook');
  await c.test('give', { inv: { ...WG.recipeById('campfire').cost, silverfin: 2 } });
  const fx = at.x - Math.sin(at.face) * 1.6, fz = at.z - Math.cos(at.face) * 1.6;
  const f = (await c.request({ t: 'build', recipe: 'campfire', x: fx, z: fz }, 'fire')).fire;
  await c.settle();
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === 'silverfin') });
  await sleep(100);
  assert.match((await c.act('f' + f.id)).msg, /cook the silverfin/);
  await c.settle();
  assert.equal(c.me.inv.silverfin, 1);
  assert.equal(c.me.inv.cooked_fish, 1);
  assert.equal(WG.itemInfo('cooked_fish').food, F.COOKED);
});

test('every Landing fish bites in its own water, and the lantern fish only on full-moon nights', () => {
  const { Island } = require('../../server/world');
  const bites = (water, time, fullMoon) => Island.prototype.fishFor.call({ time, env: { fullMoon, rain: false } }, water, 0, 60).map(c => c.f.key).sort();
  const NIGHT = 0, NOON = .5;
  assert.deepEqual(bites('sea', NOON, false), ['silverfin']);
  assert.deepEqual(bites('sea', NOON, true), ['silverfin']);
  assert.deepEqual(bites('sea', NIGHT, false), ['silverfin']);
  assert.deepEqual(bites('sea', NIGHT, true), ['lantern_fish', 'silverfin']);
  assert.deepEqual(bites('spring', NOON, false), ['pool_minnow']);
  // every fish of the Landing is in one of those
  assert.deepEqual(CONTENT.FISH.filter(f => f.region === 'landing').map(f => f.key).sort(), ['lantern_fish', 'pool_minnow', 'silverfin']);
  for (const f of CONTENT.FISH) assert.ok(WG.ITEMS[f.key] && WG.itemInfo(f.key).cooks, `${f.key} is an item that cooks`);
});
