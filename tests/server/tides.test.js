// Tides: what the sea washes up, and picking it up.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { dist, WG } = require('../helpers/world');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

test('a tide washes things up on the beaches, and they can be picked up', async () => {
  const a = await server.join('tide'), b = await server.join('beach');
  const washed = b.next('wash');
  const { washups } = await a.test('tide');
  assert.ok(washups.length >= 1, 'something washed up');
  await washed;
  for (const w of washups) assert.ok(WG.heightAt(w.x, w.z) > .3, `washup ${w.key} is on the beach, not in the sea`);

  // pick up something ordinary (the strange ones do their own thing)
  const w = washups.find(x => x.kind !== 'strange') || washups[0];
  await a.test('place', { x: w.x + 1, z: w.z });
  const gone = b.next(m => m.t === 'unwash' && m.ids.includes(w.id));
  const t = await a.act('w' + w.id);
  assert.ok(t.msg.length > 0);
  await gone;
});

test('the next tide takes back what was left', async () => {
  const a = await server.join('ebb');
  const first = (await a.test('tide')).washups;
  const taken = a.next(m => m.t === 'unwash' && first.some(w => !(w.data && w.data.sleeper) && m.ids.includes(w.id)));
  await a.test('tide');
  await taken;
});

test('washups out of reach can\'t be taken', async () => {
  const a = await server.join('reach');
  const [w] = (await a.test('tide')).washups;
  await a.test('place', { x: w.x + 15, z: w.z });
  await a.act('w' + w.id, { toast: false });
  await new Promise(r => setTimeout(r, 500));
  assert.ok(!a.messages.some(m => m.t === 'unwash' && m.ids.includes(w.id)));
  assert.ok(dist(w, { x: w.x + 15, z: w.z }) > 10);
});
