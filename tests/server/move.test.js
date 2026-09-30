// Moving: walking is accepted, running too fast or into deep water is pulled back.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Walk in small steps at walking pace from `from` in direction `a` for `n` steps.
async function walk(c, from, a, n) {
  let { x, z } = from;
  for (let i = 0; i < n; i++) {
    x += Math.cos(a) * .4; z += Math.sin(a) * .4;
    c.send({ t: 'pos', x, z, face: a, moving: true, sprint: false, cam: 0 });
    await sleep(100);   // 4 units a second; walking is 4.6
  }
  return { x, z };
}
const posIn = (snap, id) => { const p = snap.p.find(q => q[0] === id); return p && { x: p[1], z: p[2] }; };

test('walking moves you, and everyone sees it', async () => {
  const a = await server.join('walk'), b = await server.join('see');
  const start = landNear(WG.SPAWN);
  await a.test('place', start);
  // a direction that stays on land for the whole walk
  const dir = [0, 1, 2, 3, 4, 5].map(i => i * Math.PI / 3).find(d => [2, 4, 6].every(r => WG.heightAt(start.x + Math.cos(d) * r, start.z + Math.sin(d) * r) > .5));
  assert.notEqual(dir, undefined, 'found a way to walk');
  const end = await walk(a, start, dir, 15);
  await sleep(300);
  const seen = posIn(b.snap, a.id);
  assert.ok(seen, 'the walker is in the other player\'s snapshot');
  assert.ok(Math.hypot(seen.x - end.x, seen.z - end.z) < .2, `seen at ${JSON.stringify(seen)}, walked to ${JSON.stringify(end)}`);
  assert.ok(!a.messages.some(m => m.t === 'correct' && m.x !== start.x), 'walking pace is never corrected');
});

test('moving too far at once is pulled back', async () => {
  const a = await server.join('fast');
  const start = landNear(WG.SPAWN);
  await a.test('place', start);
  await sleep(200);
  const far = landNear({ x: start.x + 40, z: start.z });
  const fix = await a.request({ t: 'pos', x: far.x, z: far.z, face: 0, moving: true, sprint: false, cam: 0 }, 'correct');
  assert.ok(Math.hypot(fix.x - start.x, fix.z - start.z) < 8, 'the server only let it move a few steps');
  assert.ok(Math.hypot(fix.x - far.x, fix.z - far.z) > 30);
});

test('deep water is out of bounds', async () => {
  const a = await server.join('deep');
  const start = landNear(WG.SPAWN);
  await a.test('place', start);
  const deep = { x: WG.ISL * 3, z: WG.ISL * 3 };
  assert.ok(WG.heightAt(deep.x, deep.z) <= -1);
  const fix = await a.request({ t: 'pos', x: deep.x, z: deep.z, face: 0, moving: true, sprint: false, cam: 0 }, 'correct');
  assert.ok(Math.hypot(fix.x - start.x, fix.z - start.z) < .01, 'stays where it was');
});
