// Rafts and zip lines (P10, flag rafts): a raft is made and set on the water, two frogs ride
// it (the first paddles, both move with it), it won't go aground, you step ashore only where
// there's ground; a zip line strung by one frog carries another down it; and both are kept
// with the island.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, raftEdge, zipSpot } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'rafts,slots' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const RA = WG.RULES.RAFT, ZI = WG.RULES.ZIP;
const where = (c, id) => { const row = c.snap && c.snap.p.find(r => r[0] === id); return row && { x: row[1], z: row[2], stand: row[6] }; };
const until = async (fn, ms, what) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(80)) { const v = fn(); if (v) return v; } throw new Error('timed out waiting for ' + what); };

// A frog standing at `at`, looking `face`, with things in the bag; holds `hold` if given.
async function frog(prefix, at, inv = {}, hold) {
  const c = await server.join(prefix);
  await c.test('place', { x: at.x, z: at.z, face: at.face || 0 });
  c.send({ t: 'pos', x: at.x, z: at.z, face: at.face || 0, moving: false, sprint: false, cam: at.face || 0 });
  if (Object.keys(inv).length) await c.test('give', { inv });
  await c.settle();
  if (hold) { c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === hold) }); await sleep(100); }
  return c;
}
async function launch(c, at) {
  const x = at.x + Math.sin(at.face) * 2.5, z = at.z + Math.cos(at.face) * 2.5;
  return (await c.request({ t: 'raft-place', x, z }, m => m.t === 'rafts' && m.list)).list[0];
}

test('a raft is made from wood, set on deep water (not the sand), and kept in the bag till then', async () => {
  const at = raftEdge(0);
  const c = await frog('raftmaker', at, WG.recipeById('raft').cost);
  assert.match((await c.request({ t: 'build', recipe: 'raft' }, 'toast')).msg, /raft/i);
  await c.settle();
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === 'raft') });
  await sleep(100);
  let back = .5;   // somewhere shallow behind you, within reach
  while (back < 3.4 && WG.heightAt(at.x - Math.sin(at.face) * back, at.z - Math.cos(at.face) * back) < -.15) back += .25;
  const sand = await c.request({ t: 'raft-place', x: at.x - Math.sin(at.face) * back, z: at.z - Math.cos(at.face) * back }, 'toast');
  assert.match(sand.msg, /shallow/);
  const r = await launch(c, at);
  assert.deepEqual(r.riders, []);
  await c.settle();
  assert.equal(c.me.inv.raft, 0);
});

test('two frogs ride one raft: the first paddles, both go with it, a third finds no room', async () => {
  const at = raftEdge(1.3);
  const a = await frog('captain', at, { raft: 1 }, 'raft');
  const r = await launch(a, at);
  const b = await frog('crew', at), c = await frog('left', at);
  await a.request({ t: 'raft-board', id: r.id }, m => m.t === 'rafts' && m.list && m.list[0].riders.length === 1);
  await b.request({ t: 'raft-board', id: r.id }, m => m.t === 'rafts' && m.list && m.list[0].riders.length === 2);
  assert.match((await c.request({ t: 'raft-board', id: r.id }, 'toast')).msg, /no room/);
  // only the first aboard steers
  b.send({ t: 'raft-steer', dx: Math.sin(at.face), dz: Math.cos(at.face), go: 1 });
  await sleep(400);
  const still = (await a.next(m => m.t === 'rafts' && m.list, { timeout: 300 }).catch(() => null));
  assert.ok(!still, 'the second frog can’t paddle');
  // out to sea
  a.send({ t: 'raft-steer', dx: Math.sin(at.face), dz: Math.cos(at.face), go: 1 });
  await sleep(3000);
  a.send({ t: 'raft-steer', dx: 0, dz: 0, go: 0 });
  await sleep(300);
  const pa = where(a, a.id), pb = where(a, b.id);
  const out = (pa.x - r.x) * Math.sin(at.face) + (pa.z - r.z) * Math.cos(at.face);
  assert.ok(out > RA.SPEED * 2, `paddled ${out.toFixed(1)} m out`);
  assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) < 1.5, 'side by side');
  assert.ok(WG.heightAt(pb.x, pb.z) < -1, 'both out over deep water');
  // walking (pos) doesn't take you off it
  b.send({ t: 'pos', x: at.x, z: at.z, face: 0, moving: true, sprint: false, cam: 0 });
  await sleep(300);
  assert.ok(Math.hypot(where(a, b.id).x - pb.x, where(a, b.id).z - pb.z) < .2, 'still aboard');
  // too deep to step off out here
  assert.match((await b.request({ t: 'raft-off' }, 'toast')).msg, /Too deep/);
  // back to the shore, aground, and off
  a.send({ t: 'raft-steer', dx: -Math.sin(at.face), dz: -Math.cos(at.face), go: 1 });
  await sleep(6000);
  const beached = where(a, a.id);
  assert.ok(WG.heightAt(beached.x, beached.z) < RA.MIN_DEPTH + .6, 'stopped at the edge, not up the beach');
  const off = await b.request({ t: 'raft-off' }, 'correct');
  assert.ok(WG.heightAt(off.x, off.z) > -.9, 'stepped onto ground');
  await until(() => a.messages.some(m => m.t === 'rafts' && m.list && m.list[0].id === r.id && m.list[0].riders.length === 1), 2000, 'one rider left');
});

test('a zip line strung by one frog carries another down it', async () => {
  const s = zipSpot();
  assert.ok(s, 'found a hillside');
  const a = await frog('rigger', s.A, { zipline: 2 }, 'zipline');
  assert.match((await a.request({ t: 'zip-tie' }, 'toast')).msg, /One post set/);
  // uphill is no good: tie the first end at the bottom instead
  await a.test('place', s.B); a.send({ t: 'pos', x: s.B.x, z: s.B.z, face: 0, moving: false, sprint: false, cam: 0 }); await sleep(100);
  const made = a.next(m => m.t === 'zips' && m.list);
  assert.match((await a.request({ t: 'zip-tie' }, 'toast')).msg, /strung/);
  const zl = (await made).list[0];
  await a.settle();
  assert.equal(a.me.inv.zipline, 1);
  // someone else, at the top post
  const b = await frog('rider', s.A);
  const t0 = Date.now();
  b.send({ t: 'zip-ride', id: zl.id });
  await until(() => { const q = where(b, b.id); return q && q.stand > .3; }, 3000, 'off the ground on the line');
  const down = await b.next(m => m.t === 'correct', { timeout: 8000 });
  assert.ok(Math.hypot(down.x - s.B.x, down.z - s.B.z) < .2, 'at the bottom post');
  assert.ok(Date.now() - t0 > s.len / ZI.SPEED * 1000 * .8, 'took the ride, not a jump');
  // and it's there for anyone who joins later
  const c = await server.join('later');
  assert.ok((c.welcome.zips || []).some(z => z.id === zl.id), 'in the welcome');
});

test('a zip line has to slope down, clear the ground, and not be too short', async () => {
  const s = zipSpot();
  const a = await frog('fussy', s.B, { zipline: 1 }, 'zipline');
  await a.request({ t: 'zip-tie' }, 'toast');
  await a.test('place', s.A); a.send({ t: 'pos', x: s.A.x, z: s.A.z, face: 0, moving: false, sprint: false, cam: 0 }); await sleep(100);
  assert.match((await a.request({ t: 'zip-tie' }, 'toast')).msg, /lower than the first/);
  await a.test('place', { x: s.B.x + 3, z: s.B.z }); a.send({ t: 'pos', x: s.B.x + 3, z: s.B.z, face: 0, moving: false, sprint: false, cam: 0 }); await sleep(100);
  assert.match((await a.request({ t: 'zip-tie' }, 'toast')).msg, /Too short|lower than the first/);
});

test('a river carries a raft downstream (out in the wider world)', () => {
  const { Island } = require('../../server/world');
  const was = WG.feature('bigworld');
  WG.setFeatures(WG.resolveFeatures('bigworld'));
  try {
    const river = WG.RIVERS[0], a = river[1], b = river[2], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const [cx, cz] = Island.prototype.riverCurrent.call({}, mx, mz);
    assert.ok(WG.heightAt(mx, mz) < RA.MIN_DEPTH, 'a raft floats on the river');
    assert.ok(Math.abs(Math.hypot(cx, cz) - RA.CURRENT) < .01, 'at the current’s speed');
    assert.ok(cx * (b[0] - a[0]) + cz * (b[1] - a[1]) > 0, 'downstream');
    assert.deepEqual(Island.prototype.riverCurrent.call({}, 0, 0), [0, 0], 'none on land');
  } finally { WG.setFeatures(WG.resolveFeatures(was ? 'bigworld' : '-bigworld')); }
});

test('rafts and zip lines are kept with the island', async () => {
  const { Island } = require('../../server/world');
  const isl = Object.create(Island.prototype);
  isl.ridesSaved = { rafts: [{ id: 3, x: 1, z: 2, a: .5, made: 1 }], zips: [{ id: 4, ax: 0, ay: 5, az: 0, bx: 10, by: 2, bz: 0, byName: 'x' }] };
  isl.ridesReady();
  assert.equal(isl.nextRide, 5);
  assert.deepEqual(isl.ridesSave(), isl.ridesSaved);
});
