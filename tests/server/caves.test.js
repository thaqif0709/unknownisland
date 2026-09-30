// Caves (W9, flag `caves`): walking into the Landing's sea cave at low tide, together, and
// being pushed out by the tide; the Dark, torches and muffled chat.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG } = require('../helpers/world');
const Caves = require('../../server/shared/caves');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'caves' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const spec = require('../../server/regions/landing').cave;
const cave = Caves.generateCave(spec), N = cave.nodes;
const T = Caves.CAVE.TIDE;

// Walk at walking pace (4 m/s) through these points, saying you're in the cave once you're past the mouth.
async function walkIn(c, points, side = 0) {
  let at = { x: cave.out.x, z: cave.out.z + side };
  for (const n of points) {
    const to = { x: n.x, z: n.z + side }, d = Math.hypot(to.x - at.x, to.z - at.z), k = Math.max(1, Math.ceil(d / .4));
    for (let i = 1; i <= k; i++) {
      const x = at.x + (to.x - at.x) * i / k, z = at.z + (to.z - at.z) * i / k, hit = Caves.caveHit(cave, x, z);
      c.send({ t: 'pos', x, z, face: 0, moving: true, sprint: false, cam: 0, under: hit ? cave.id : undefined });
      await sleep(100);
    }
    at = to;
  }
  return at;
}
const snapOf = (c, id) => c.snap && c.snap.p.find(q => q[0] === id);

test('the welcome has the sea cave, and the ground is whole over its roof', async () => {
  const a = await server.join('cv');
  assert.deepEqual(a.welcome.caves.map(c => c.id), ['seacave']);
  for (const n of N) if (n.s > 8) assert.ok(WG.heightAt(n.x, n.z) - Caves.caveHit(cave, n.x, n.z).roof > 1, `a metre of ground over the roof at ${n.s} m`);
  assert.ok(Math.abs(N[0].y - WG.heightAt(N[0].x, N[0].z)) < .05, 'the floor meets the ground at the mouth');
});

test('two players walk in together at low tide, see each other down there, and the tide pushes them out', async () => {
  const a = await server.join('cva'), b = await server.join('cvb'), up = await server.join('cvu');
  await a.test('time', { at: T.PHASE + .5 });   // the midday low tide
  await a.test('place', cave.out); await b.test('place', { x: cave.out.x, z: cave.out.z + .8 });
  await a.test('give', { inv: { torch: 2 } }); a.send({ t: 'hold', key: 'torch' });
  a.send({ t: 'select', slot: (a.me.slots || []).findIndex(s => s && s.k === 'torch') });   // in hand, with P2's slots
  const [ea] = await Promise.all([walkIn(a, N.slice(0, 15)), walkIn(b, N.slice(0, 15), .8)]);
  await sleep(300);
  assert.ok(!a.messages.some(m => m.t === 'correct' && m.under === 0), 'never turned back on the way in');
  assert.equal(snapOf(b, a.id)[7], 'seacave', 'b sees a in the cave');
  assert.equal(snapOf(a, b.id)[7], 'seacave', 'a sees b in the cave');
  assert.equal(snapOf(up, a.id)[7], 'seacave', 'and so does someone up on the beach');
  // chat: clear to b, muffled up above
  const heardB = b.next(m => m.t === 'chat' && m.kind === 'all'), heardUp = up.next(m => m.t === 'chat' && m.kind === 'all');
  a.send({ t: 'chat', text: 'can anyone hear me from down here in the dark' });
  const [mb, mu] = await Promise.all([heardB, heardUp]);
  assert.equal(mb.text, 'can anyone hear me from down here in the dark');
  assert.ok(mu.muffled && mu.text !== mb.text, `muffled up above: "${mu.text}"`);
  // the tide comes in: past the depth that pushes you out where a stands
  const hit = Caves.caveHit(cave, ea.x, ea.z);
  let t = T.PHASE + .5; while (Caves.tideLevel(t) - hit.floor <= Caves.CAVE.PUSH + .05) t += .002;
  const out = a.next(m => m.t === 'correct' && m.under === 0, { timeout: 3000 });
  await a.test('time', { at: t });
  const fix = await out;
  assert.ok(Math.hypot(fix.x - cave.out.x, fix.z - cave.out.z) < .01, 'dragged out onto the sand at the mouth');
});

test("you can't drop into the cave from the hill above it, or walk in at high tide", async () => {
  const a = await server.join('cvh');
  await a.test('time', { at: T.PHASE + .5 });
  const above = { x: N[14].x + 1, z: N[14].z };
  await a.test('place', above); await sleep(200);
  const fix = await a.request({ t: 'pos', x: N[14].x, z: N[14].z, face: 0, moving: true, sprint: false, cam: 0, under: cave.id }, 'correct');
  assert.ok(Math.hypot(fix.x - above.x, fix.z - above.z) < .01 && fix.under === 0, 'turned back');
  await a.test('time', { at: T.PHASE + .25 });   // high tide
  await a.test('place', cave.out);
  await walkIn(a, N.slice(0, 11));
  await sleep(300);
  const s = snapOf(a, a.id);
  assert.ok(Math.hypot(s[1] - N[10].x, s[2] - N[10].z) > 3, 'the flooded dip stops you');
});

test("the Stilled don't reach you in a cave", async () => {
  const a = await server.join('cvs');
  await a.test('time', { at: T.PHASE });   // the night-time low tide
  await a.test('place', cave.out);
  const end = await walkIn(a, N.slice(0, 13));
  await a.test('set', { time: T.PHASE, weather: 'fogstorm' });   // fog over the hill above
  await a.test('spawn', { kind: 'stilled', x: end.x + 1.5, z: end.z });
  await sleep(2500);
  assert.ok(!a.messages.some(m => m.t === 'knocked' && m.id === a.id), 'it never reaches you (with nobody up top, it fades away)');
  await a.test('set', { time: .5, weather: 'clear' });
  assert.equal(snapOf(a, a.id)[7], 'seacave', 'still in the cave');
});
