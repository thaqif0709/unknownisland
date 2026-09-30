// The Crawler (C2, flag `caves`): it lives in the sea cave, hunts by sound, screams, lunges
// (warned), knocks you down and drags you deeper; light drives it back; nobody outside the
// cave interests it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG } = require('../helpers/world');
const Caves = require('../../server/shared/caves');
const { C } = require('../../server/mobs/crawler');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'caves' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cave = Caves.generateCave(require('../../server/regions/landing').cave), N = cave.nodes;
const LOW = Caves.CAVE.TIDE.PHASE + .5;   // the midday low tide
const crawler = c => (c.snap && c.snap.m || []).find(m => m[1] === 'crawler');
const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(80); } throw new Error('timed out waiting for ' + what); };
// Put a player in the cave at the node nearest (x, z), then keep them there quietly.
async function into(c, i) { await c.test('place', { x: N[i].x, z: N[i].z, under: cave.id }); await sleep(150); }
const nodeNear = (x, z) => N.reduce((b, n, i) => (Math.hypot(n.x - x, n.z - z) < Math.hypot(N[b].x - x, N[b].z - z) ? i : b), 0);

test('it lives deep in the sea cave, up on the roof', async () => {
  const a = await server.join('cr');
  await a.test('time', { at: LOW });
  const m = await until(() => crawler(a), 3000, 'the crawler in the snapshot');
  const hit = Caves.caveHit(cave, m[2], m[3]);
  assert.ok(hit && hit.s > 15, `inside the cave, ${hit && hit.s.toFixed(0)} m from the mouth`);
  assert.equal(m[6][0], 'c', 'on the ceiling');
  assert.ok(m[6][1] > hit.floor + 1, 'up by the roof');
  a.close();
});

test('it hears you run, screams and comes; standing close in the dark, it lunges (warned) and drags you deeper', async () => {
  const a = await server.join('crr');
  await a.test('time', { at: LOW });
  const m = await until(() => crawler(a), 3000, 'the crawler');
  // somewhere in the cave within earshot of running, but not right next to it
  const at = N.map((n, i) => i).filter(i => { const d = Math.hypot(N[i].x - m[2], N[i].z - m[3]); return d > 10 && d < C.HEAR_RUN - 5; })[0];
  assert.ok(at != null, 'a spot within earshot');
  await into(a, at);
  const screamed = a.next(x => x.t === 'scream', { timeout: 4000 });
  // run on the spot (sprinting, moving back and forth)
  const run = setInterval(() => { a.send({ t: 'pos', x: N[at].x + (Date.now() % 400 < 200 ? .15 : -.15), z: N[at].z, face: 0, moving: true, sprint: true, cam: 0, under: cave.id }); }, 90);
  const s = await screamed;
  assert.ok(Math.abs(s.x - m[2]) < 6, 'the scream comes from where it is');
  clearInterval(run);
  // it comes, and lunges: a warning strip first, then the blow
  const warned = await a.next(x => x.t === 'telegraph', { timeout: 15000 });
  assert.equal(warned.shape, 'line');
  const t0 = Date.now();
  const dragged = await a.next(x => x.t === 'correct' && x.under === cave.id, { timeout: 5000 });
  assert.ok(Date.now() - t0 >= C.TELL_MS - 150, 'the warning comes first, for long enough to dodge');
  assert.ok(a.messages.some(x => x.t === 'knocked' && x.id === a.id), 'knocked down');
  assert.ok(Caves.caveHit(cave, dragged.x, dragged.z).s > N[nodeNear(warned.x, warned.z)].s, 'and dragged deeper in');
  a.close();
});

test('a lit torch drives it back', async () => {
  const a = await server.join('crt');
  await a.test('time', { at: LOW });
  await a.test('give', { inv: { torch: 3 } });
  a.send({ t: 'hold', key: 'torch' });
  const m = await until(() => crawler(a) && crawler(a)[5] === 'lurk' && crawler(a), 20000, 'it to be lurking');
  await into(a, nodeNear(m[2], m[3]));   // right beside it
  await until(() => crawler(a) && crawler(a)[5] === 'recoil', 3000, 'it to recoil');
  await sleep(2500);
  assert.ok(!a.messages.some(x => x.t === 'knocked' && x.id === a.id), 'it never strikes');
  const later = crawler(a);
  assert.ok(Math.hypot(later[2] - m[2], later[3] - m[3]) > 3, 'it has backed away');
  a.close();
});

test('up on the beach nobody interests it, however loud', async () => {
  const a = await server.join('crb');
  await a.test('time', { at: LOW });
  await a.test('place', { x: cave.out.x, z: cave.out.z + 1, under: '' });
  const run = setInterval(() => { a.send({ t: 'pos', x: cave.out.x + (Date.now() % 400 < 200 ? .15 : -.15), z: cave.out.z + 1, face: 0, moving: true, sprint: true, cam: 0 }); }, 90);
  await sleep(2500);
  clearInterval(run);
  assert.ok(!a.messages.some(x => x.t === 'scream'), 'no scream');
  a.close();
});

test("it won't cross water: with the dip flooded, it can't reach you on the mouth side", async () => {
  const a = await server.join('crw');
  // a tide where the dip is under water but both sides are dry
  const sumpFloor = Math.min(...N.map(n => n.y)), mouthSide = N.findIndex(n => n.s > 6 && n.y > sumpFloor + .9);
  let t = LOW; while (Caves.tideLevel(t) < sumpFloor + C.DRY + .4) t += .002;
  assert.ok(Caves.tideLevel(t) - N[mouthSide].y < .2, 'the mouth side is dry then');
  await a.test('time', { at: t });
  await until(() => crawler(a), 3000, 'the crawler');
  await into(a, mouthSide);
  const screamed = a.next(x => x.t === 'scream', { timeout: 4000 });
  a.send({ t: 'call' });   // a call carries: it hears
  await screamed;
  const run = setInterval(() => { a.send({ t: 'pos', x: N[mouthSide].x + (Date.now() % 400 < 200 ? .15 : -.15), z: N[mouthSide].z, face: 0, moving: true, sprint: true, cam: 0, under: cave.id }); }, 90);
  await sleep(6000);
  clearInterval(run);
  const m = crawler(a), sumpS = Math.max(...N.filter(n => n.y <= sumpFloor + .05).map(n => n.s));
  assert.ok(Caves.caveHit(cave, m[2], m[3]).s > sumpS, `it stayed beyond the water (at ${Caves.caveHit(cave, m[2], m[3]).s.toFixed(0)} m, the dip ends at ${sumpS.toFixed(0)} m)`);
  assert.ok(!a.messages.some(x => x.t === 'knocked' && x.id === a.id));
  a.close();
});
