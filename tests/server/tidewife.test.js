// The Tidewife (C1, the Landing's boss): called by the Landing's chain, she waits for the lowest
// tide and comes up on the east sand; four frogs make her 2.8 times as tough; her kelp soaks up
// blows until fire burns it, her shell takes part of each blow, and her eyes take more while she
// rears; when the tide turns she goes back down whole; beaten, everyone who fought keeps her eye
// and her shell (which makes a cloak patch), and the Stairs open.
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'bosses' } }); });
after(async () => { if (server) await server.stop(); });
let joined = [];   // each test's frogs leave when it's done (the arena is the same for all of them)
afterEach(async () => { joined.forEach(c => c.close()); joined = []; await sleep(200); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TW = require('../../server/bosses').BOSSES.tidewife, T = TW.tune, BR = WG.RULES.BOSSES;
const HIGH = .35, LOW = .6, TURNED = .73;   // times of day: high tide; the afternoon's lowest tide (daylight); the tide well on its way back in
const twMsg = (c, fn, timeout = 5000) => c.next(m => m.t === 'boss' && m.id === 'tidewife' && fn(m), { timeout });
// Frogs on the east sand, healthy.
async function frogs(prefix, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const c = await server.join(prefix + i);
    joined.push(c);
    await c.test('place', { x: TW.appear.x - 6 + i, z: TW.appear.z - 4 });
    await c.test('set', { health: 100, hunger: 100, thirst: 100 });
    list.push(c);
  }
  return list;
}
// Her, here now (at the lowest tide).
async function bring(c) {
  await c.test('set', { time: LOW, weather: 'clear' });
  const came = twMsg(c, m => m.state === 'fighting');
  await c.test('boss', { boss: 'tidewife' });
  return came;
}

test('the Landing’s chain calls her; she waits for the lowest tide, then comes up on the east sand', async () => {
  const [a] = await frogs('call', 1);
  await a.test('set', { time: HIGH, weather: 'clear' });
  const r = await a.test('summonBoss', { region: 'landing' });
  assert.equal(r.bosses.find(b => b.id === 'tidewife').state, 'waiting');
  await sleep(400);
  assert.ok(!(await a.test('mobs')).mobs.some(m => m.kind === 'boss_tidewife'), 'not at high tide');
  const came = twMsg(a, m => m.state === 'fighting');
  await a.test('set', { time: LOW });
  const m = await came;
  assert.ok(Math.hypot(m.x - TW.appear.x, m.z - TW.appear.z) < .01, 'on the east sand');
});

test('alone or with friends: four frogs make her 2.8 times as tough', async () => {
  const fs = await frogs('four', 4);
  const tough = twMsg(fs[0], m => m.state === 'fighting' && m.max >= TW.hp * (1 + BR.PER_FROG * 3) - .01);
  await bring(fs[0]);
  const m = await tough;
  assert.equal(m.max, +(TW.hp * (1 + BR.PER_FROG * 3)).toFixed(2));
});

test('kelp soaks blows until fire burns it; her shell takes part; her eyes, while she rears, take more', async () => {
  const [a] = await frogs('kelp', 1);
  const m = await bring(a);
  const hit = async (amount, source) => (await a.test('mobHit', { mob: m.mob, amount, source })).dmg;
  assert.equal(await hit(10), +(10 * T.KELP_TAKES).toFixed(4), 'through the kelp');
  const burnt = a.next(x => x.t === 'toast' && /kelp burns away/.test(x.msg));
  assert.equal(await hit(T.KELP, ['fire']), T.KELP * T.SHELL, 'fire burns it (and her shell takes part)');
  await burnt;
  assert.equal(await hit(10), 10 * T.SHELL, 'her shell');
  await a.test('mobState', { mob: m.mob, state: 'rear' });
  assert.equal(await hit(10), 10 * T.EYES, 'her eyes, while she rears');
});

test('she fights: her blows are marked on the sand first', async () => {
  const [a] = await frogs('blows', 1);
  const m = await bring(a);
  const tg = await a.next(x => x.t === 'telegraph' && x.id === m.mob, { timeout: 8000 });
  assert.ok(['circle', 'cone'].includes(tg.shape));
});

test('when the tide turns she goes back down, whole', async () => {
  const [a] = await frogs('tide', 1);
  const m = await bring(a);
  await a.test('mobHit', { mob: m.mob, amount: 100 });
  const gone = twMsg(a, x => x.state === 'waiting');
  const said = a.next(x => x.t === 'toast' && /tide turns/.test(x.msg));
  await a.test('set', { time: TURNED });
  assert.equal((await gone).hp, TW.hp, 'whole again');
  await said;
});

test('beaten: her eye and shell for everyone who fought, a patch to stitch, and the Stairs open', async () => {
  const [a, b] = await frogs('win', 2);
  const m = await bring(a);
  const eyes = [a, b].map(c => c.next(x => x.t === 'journal' && x.key === TW.trophy.relic));
  const shells = [a, b].map(c => c.next(x => x.t === 'journal' && x.key === TW.trophy.patch));
  const opens = a.next(x => x.t === 'toast' && /fog stirs/.test(x.msg));
  const beaten = twMsg(a, x => x.state === 'beaten', 8000);
  await a.test('mobState', { mob: m.mob, state: 'rear' });
  await a.test('mobHit', { mob: m.mob, amount: 100000 });
  await beaten; await Promise.all([...eyes, ...shells]); await opens;
  // the shell is a cloak patch now
  const stitched = a.next(x => x.t === 'patches' && x.id === a.id && x.list.includes('tide_shell'));
  a.send({ t: 'patch', key: 'tide_shell', on: true });
  await stitched;
});
