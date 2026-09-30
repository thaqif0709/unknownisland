// Hearth checkpoints (P4, flag `checkpoints`): sleep by a lit hearth, wake there after a
// knockdown; cold if it went out, the beach if it's gone.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'checkpoints' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fires = [];
// Build a lit clay hearth on dry land; returns { fire, at } (at: where you stood).
async function buildHearth(c, n) {
  for (const f of c.welcome.fires) if (!fires.some(g => g.id === f.id)) fires.push(f);
  const at = landNear({ x: WG.SPAWN.x - 20 + n * 9, z: WG.SPAWN.z - 30 }, fires);
  fires.push({ x: at.x + 1.6, z: at.z });
  await c.test('place', at);
  await c.test('give', { inv: WG.recipeById('hearth').cost });
  const made = c.next(m => m.t === 'fire');
  c.send({ t: 'build', recipe: 'hearth', x: at.x + 1.6, z: at.z });
  return { fire: (await made).fire, at };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lastWake = c => (c.messages.filter(m => m.t === 'toast' && /wake/.test(m.msg)).pop() || {}).msg || '';

test('sit by a lit hearth and it remembers you; knocked down far away, you wake there', async () => {
  const a = await server.join('cp'), b = await server.join('cpf');
  const { fire, at } = await buildHearth(a, 0);
  a.send({ t: 'sit', on: true });
  const sawSleep = b.next(m => m.t === 'sleep' && m.id === a.id && m.on);
  const remembered = a.next(m => m.t === 'toast' && /remember you/.test(m.msg), { timeout: 6000 });
  const told = b.next(m => m.t === 'checkpoint' && m.id === a.id, { timeout: 6000 });
  a.send({ t: 'sleep', on: true, fire: fire.id });
  await sawSleep;
  await remembered;
  assert.equal((await told).fire, fire.id, 'friends are told (for the map and the pennant)');
  // far away, knocked down
  a.send({ t: 'sit', on: false });
  const away = landNear({ x: at.x + 40, z: at.z + 20 });
  await a.test('place', away);
  const woke = a.next(m => m.t === 'correct' && m.under === 0, { timeout: 6000 });
  await a.test('knock');
  const w = await woke;
  assert.ok(dist(w, fire) < 2.2, `woke ${dist(w, fire).toFixed(1)} m from the hearth`);
  await sleep(200);
  assert.match(lastWake(a), /still going/);
});

test('standing up too soon, or a hearth that is out, or a campfire: no checkpoint', async () => {
  const a = await server.join('cpq');
  const { fire, at } = await buildHearth(a, 1);
  // not sitting: nothing happens
  a.send({ t: 'sleep', on: true, fire: fire.id });
  await sleep(300);
  assert.ok(!a.messages.some(m => m.t === 'sleep' && m.id === a.id));
  // up again after a second
  a.send({ t: 'sit', on: true }); a.send({ t: 'sleep', on: true, fire: fire.id });
  await sleep(1000); a.send({ t: 'sit', on: false });
  await sleep(2800);
  assert.ok(!a.messages.some(m => m.t === 'checkpoint' && m.id === a.id), 'too soon');
  // a hearth that has gone out
  await a.test('fire', { fire: fire.id, fuel: 0 });
  a.send({ t: 'sit', on: true }); a.send({ t: 'sleep', on: true, fire: fire.id });
  await sleep(3500);
  assert.ok(!a.messages.some(m => m.t === 'checkpoint' && m.id === a.id), 'not by a cold hearth');
  // a campfire isn't a hearth
  a.send({ t: 'sit', on: false });
  await a.test('place', { x: at.x - 3, z: at.z });
  await a.test('give', { inv: WG.recipeById('campfire').cost });
  const made = a.next(m => m.t === 'fire');
  a.send({ t: 'build', recipe: 'campfire', x: at.x - 1.4, z: at.z });
  const camp = (await made).fire;
  a.send({ t: 'sit', on: true }); a.send({ t: 'sleep', on: true, fire: camp.id });
  await sleep(3500);
  assert.ok(!a.messages.some(m => m.t === 'checkpoint' && m.id === a.id), 'not by a campfire');
  // knocked down with no checkpoint: you get up where you fell
  a.send({ t: 'sit', on: false });
  const here = { x: at.x - 3, z: at.z };
  await a.test('place', here);
  await a.test('knock');
  await sleep(3600);
  assert.ok(!a.messages.some(m => m.t === 'correct' && m.under === 0), 'not moved');
});

test('a hearth gone cold: you wake there, uneasy; a hearth gone: the beach', async () => {
  const a = await server.join('cpc');
  const { fire, at } = await buildHearth(a, 2);
  a.send({ t: 'sit', on: true });
  const remembered = a.next(m => m.t === 'toast' && /remember you/.test(m.msg), { timeout: 6000 });
  a.send({ t: 'sleep', on: true, fire: fire.id });
  await remembered;
  a.send({ t: 'sit', on: false });
  // it goes out
  await a.test('fire', { fire: fire.id, fuel: 0 });
  await a.test('place', landNear({ x: at.x + 30, z: at.z }));
  let woke = a.next(m => m.t === 'correct' && m.under === 0, { timeout: 6000 });
  await a.test('knock');
  assert.ok(dist(await woke, fire) < 2.2);
  await sleep(200);
  assert.match(lastWake(a), /gone cold/);
  // the fog takes it
  await a.test('fire', { fire: fire.id, remove: true });
  await a.test('place', landNear({ x: at.x + 30, z: at.z }));
  woke = a.next(m => m.t === 'correct' && m.under === 0, { timeout: 6000 });
  await a.test('knock');
  assert.ok(dist(await woke, WG.SPAWN) < .1, 'back on the beach');
  await sleep(200);
  assert.equal(a.messages.filter(m => m.t === 'checkpoint' && m.id === a.id).pop().fire, null, 'and the checkpoint is cleared');
});

test('your checkpoint is kept when you leave and come back', async () => {
  const { TestClient } = require('../helpers/client');
  const acct = await server.signup('cpk');
  const connect = async () => { const c = new TestClient(`ws://127.0.0.1:${server.port}/ws`, acct); await c.open(); await c.hello(); return c; };
  const a = await connect();
  const { fire } = await buildHearth(a, 3);
  a.send({ t: 'sit', on: true });
  const remembered = a.next(m => m.t === 'toast' && /remember you/.test(m.msg), { timeout: 6000 });
  a.send({ t: 'sleep', on: true, fire: fire.id });
  await remembered;
  a.close();
  await sleep(400);
  const b = await connect();
  assert.equal(b.welcome.checkpoints[b.id], fire.id);
  b.close();
});
