// Torches above ground (flag torchlight): a torch in hand pushes the fog back and keeps you
// warm; G plants it (lit, in front of you), E takes it back; a planted torch burns out; the
// sea is too wet to plant one in.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear, spotNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'torchlight,slots' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
// a torch in hand: put it in a hotbar slot and select it
async function holdTorch(c, n = 2) {
  await c.test('give', { inv: { torch: n } });
  await c.settle();
  const at = c.me.slots.findIndex(s => s && s.k === 'torch');
  c.send({ t: 'select', slot: at });
  await sleep(100);
  return at;
}

test('G plants a lit torch in front of you; it lights the fog for everyone; E takes it back', async () => {
  const a = await server.join('torch'), b = await server.join('torchsee');
  const spot = landNear({ x: WG.SPAWN.x - 10, z: WG.SPAWN.z - 20 }, a.welcome.fires);
  await a.test('place', { ...spot, face: 0 });
  const slot = await holdTorch(a, 2);
  const seen = b.next(m => m.t === 'torches' && m.list.length > 0);
  a.send({ t: 'dropitem', slot, count: 1 });
  const [id, x, z, left] = (await seen).list[0];
  assert.ok(Math.hypot(x - spot.x, z - (spot.z + .9)) < .2, 'just in front of you');
  assert.ok(left > 0 && left <= WG.RULES.TORCH.PLANT_BURN);
  await a.settle();
  assert.equal(a.me.inv.torch, 1, 'one torch planted, one still carried');
  // E on it: back in the bag
  await a.test('place', { x: x + 1, z });
  const gone = b.next(m => m.t === 'torches' && !m.list.some(t => t[0] === id));
  const t = await a.act('t' + id);
  assert.match(t.msg, /pull the torch/);
  await gone;
  await a.settle();
  assert.equal(a.me.inv.torch, 2);
  a.close(); b.close();
});

test('Shift+G still drops the whole stack in a sack; not in the sea', async () => {
  const a = await server.join('torch2');
  const spot = landNear({ x: WG.SPAWN.x + 10, z: WG.SPAWN.z - 20 }, a.welcome.fires);
  await a.test('place', { ...spot, face: 0 });
  const slot = await holdTorch(a, 3);
  const n0 = a.messages.length;
  a.send({ t: 'dropitem', slot, count: 3 });
  for (let i = 0; i < 30 && !a.messages.slice(n0).some(m => m.t === 'drop' && m.drop.items.torch === 3); i++) await sleep(100);
  assert.ok(a.messages.slice(n0).some(m => m.t === 'drop' && m.drop.items.torch === 3), 'a sack of three torches');
  assert.ok(!a.messages.slice(n0).some(m => m.t === 'torches'), 'nothing planted');
  // in the sea
  // wading, with water in front too
  const sea = spotNear(WG.SPAWN, (h, x, z) => h < .25 && h > -.6 && WG.heightAt(x, z + .9) < .3, { step: 2, max: 400 });
  await a.test('place', { ...sea, face: 0 });
  const s2 = await holdTorch(a, 1);
  const wet = a.next(m => m.t === 'toast' && /Too wet/.test(m.msg));
  a.send({ t: 'dropitem', slot: s2, count: 1 });
  await wet;
  a.close();
});

test('a torch in hand keeps you warm and is a light against the fog', async () => {
  const a = await server.join('torch3');
  const spot = landNear({ x: WG.SPAWN.x - 20, z: WG.SPAWN.z - 30 }, a.welcome.fires);
  await a.test('place', spot);
  await a.test('set', { time: .9 });   // night
  await holdTorch(a, 1);
  await a.next(m => m.t === 'me' && m.warm === true, { timeout: 5000 });
  a.close();
});
