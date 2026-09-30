// Climbing and gliding (P9, flag travel): WG.climbAt finds trunks and cliffs, the server
// lets a glide drift faster than walking, shows friends your pose and height, and charges
// the energy for it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'travel' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = WG.RULES.TRAVEL;

test('climbAt: steep ground is a cliff with a top; flat ground is not', () => {
  let cliff = null;
  for (let x = -170; x < 170 && !cliff; x += 2) for (let z = -170; z < 170 && !cliff; z += 2) {
    const c = WG.climbAt(x, 0, z);
    if (c) cliff = { x, z, c };
  }
  assert.ok(cliff, 'the Landing has a cliff somewhere');
  assert.equal(cliff.c.kind, 'cliff');
  assert.ok(cliff.c.slope >= T.CLIFF_SLOPE);
  assert.ok(Math.abs(Math.hypot(cliff.c.nx, cliff.c.nz) - 1) < 1e-6, 'the face has a direction');
  if (cliff.c.top) assert.ok(cliff.c.top.h > WG.heightAt(cliff.x, cliff.z), 'the top is higher up');
  assert.equal(WG.climbAt(WG.SPAWN.x, 0, WG.SPAWN.z), null);
});

test('climbAt: a climbable trunk within reach, and not when felled or above its top', () => {
  const palms = WG.generateObjects(11).filter(o => o.type === 'palm');
  const o = palms.find(p => p.climb);
  assert.ok(o, 'some palms are climbable');
  assert.ok(palms.some(p => !p.climb), 'but not all of them');
  const at = { x: o.x + o.r + .3, z: o.z };
  const t = WG.climbAt(at.x, 0, at.z, [{ ...o, state: {} }]);
  assert.equal(t && t.kind, 'trunk');
  assert.ok(t.nx > .9, 'facing out from the trunk towards us');
  assert.equal(WG.climbAt(at.x, 0, at.z, [{ ...o, state: { gone: true } }]), null);
  assert.equal(WG.climbAt(at.x, 99, at.z, [{ ...o, state: {} }]), null, 'above the top there is nothing to hold');
  assert.equal(WG.climbAt(o.x + 5, 0, o.z, [{ ...o, state: {} }]), null, 'too far away');
});

test('a glide may drift faster than walking; walking that fast is pulled back', async () => {
  const a = await server.join('glide');
  const start = landNear(WG.SPAWN);
  const dir = [0, 1, 2, 3, 4, 5, 6, 7].map(i => i * Math.PI / 4).find(d => [2, 5, 9, 13].every(r => WG.heightAt(start.x + Math.cos(d) * r, start.z + Math.sin(d) * r) > .4));
  const run = async pose => {
    await a.test('place', start);
    await sleep(600);
    let { x, z } = start, corrected = false;
    const seen = m => { if (m.t === 'correct' && m.x !== start.x) corrected = true; };
    const n0 = a.messages.length;
    for (let i = 0; i < 3; i++) {   // 4.3 m every half second: over a walk's allowance, under a glide's
      x += Math.cos(dir) * 4.3; z += Math.sin(dir) * 4.3;
      a.send({ t: 'pos', x, z, face: dir, moving: true, sprint: false, cam: 0, stand: pose ? 5 : 0, pose });
      await sleep(500);
    }
    a.messages.slice(n0).forEach(seen);
    return corrected;
  };
  assert.equal(await run('glide'), false, 'gliding at 8.6 m/s is fine');
  assert.equal(await run(undefined), true, 'walking at 8.6 m/s is not');
});

test('friends see you climbing and gliding, and how high you are', async () => {
  const a = await server.join('pose'), b = await server.join('friend');
  const at = landNear({ x: WG.SPAWN.x + 10, z: WG.SPAWN.z - 10 });
  await a.test('place', at);
  const row = () => b.snap && b.snap.p.find(r => r[0] === a.id);
  a.send({ t: 'pos', x: at.x, z: at.z, face: 0, moving: true, sprint: false, cam: 0, stand: 6.5, pose: 'climb' });
  await sleep(400);
  assert.deepEqual([row()[6], row()[8]], [6.5, 1], 'climbing 6.5 m up');
  a.send({ t: 'pos', x: at.x, z: at.z, face: 0, moving: true, sprint: false, cam: 0, stand: 99, pose: 'glide' });
  await sleep(400);
  assert.deepEqual([row()[6], row()[8]], [T.MAX_HEIGHT, 2], 'gliding, as high as can be shown');
  a.send({ t: 'pos', x: at.x, z: at.z, face: 0, moving: false, sprint: false, cam: 0, stand: 9, pose: 'fly' });
  await sleep(400);
  assert.deepEqual([row()[6], row()[8]], [2.2, 0], 'no such pose: standing height only');
});

test('gliding and climbing use energy', async () => {
  const a = await server.join('tired');
  const at = landNear({ x: WG.SPAWN.x - 10, z: WG.SPAWN.z - 10 });
  await a.test('place', at);
  const hold = async (pose, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { a.send({ t: 'pos', x: at.x, z: at.z, face: 0, moving: true, sprint: false, cam: 0, stand: 3, pose }); await sleep(200); }
    await a.settle(); await a.settle();
    return a.me.energy;
  };
  const e0 = await hold(undefined, 400);
  const e1 = await hold('glide', 2000);
  assert.ok(e1 < e0 - T.GLIDE_ENERGY, `gliding for 2 s: ${e0} -> ${e1}`);
  const e2 = await hold('climb', 1500);
  assert.ok(e2 < e1 - T.HANG_ENERGY, `climbing for 1.5 s: ${e1} -> ${e2}`);
});
