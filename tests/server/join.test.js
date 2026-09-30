// Accounts and joining: sign-up, log-in, the welcome, others seeing you come and go.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, INVITE } = require('../helpers/server');
const { TestClient } = require('../helpers/client');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

test('sign-up needs the invite code and a valid name', async () => {
  const bad = await server.api('/api/signup', { username: 'nobody', password: 'password123', invite: 'wrong' }, { 'X-Forwarded-For': '10.9.0.1' });
  assert.equal(bad.status, 403);
  const shortName = await server.api('/api/signup', { username: 'x', password: 'password123', invite: INVITE }, { 'X-Forwarded-For': '10.9.0.2' });
  assert.equal(shortName.status, 400);
  const acct = await server.signup('dup');
  const again = await server.api('/api/signup', { username: acct.username, password: 'password123', invite: INVITE }, { 'X-Forwarded-For': '10.9.0.3' });
  assert.equal(again.status, 409);
});

test('log in, see who you are, log out', async () => {
  const acct = await server.signup('login');
  const wrong = await server.api('/api/login', { username: acct.username, password: 'not-it' }, { 'X-Forwarded-For': '10.9.1.1' });
  assert.equal(wrong.status, 401);
  const ok = await server.api('/api/login', { username: acct.username, password: 'password123' }, { 'X-Forwarded-For': '10.9.1.2' });
  assert.equal(ok.status, 200);
  const me = await server.api('/api/me', undefined, { Authorization: `Bearer ${ok.body.token}` });
  assert.equal(me.status, 200);
  assert.equal(me.body.player.username, acct.username);
  await server.api('/api/logout', {}, { Authorization: `Bearer ${ok.body.token}` });
  const after = await server.api('/api/me', undefined, { Authorization: `Bearer ${ok.body.token}` });
  assert.equal(after.status, 401);
});

test('joining sends the welcome, at midday in clear weather', async () => {
  const a = await server.join('wel');
  const w = a.welcome;
  assert.equal(w.you.name, a.name);
  assert.equal(w.you.health, 100);
  assert.ok(w.island && typeof w.island.day === 'number');
  assert.ok(w.island.time > 0.45 && w.island.time < 0.8, `time of day ${w.island.time} should be midday`);
  assert.equal(w.env.weather, 'clear');
  assert.ok(w.rules && w.rules.WALK_SPEED > 0, 'the rules come with the welcome');
  assert.ok(Array.isArray(w.lanterns) && w.lanterns.length > 0);
  assert.ok(Array.isArray(w.carvings) && w.carvings.length > 0);
  const state = await a.test('state');
  assert.equal(state.stilled, 0, 'no Stilled at midday');
});

test('a bad token is turned away', async () => {
  const c = new TestClient(`ws://127.0.0.1:${server.port}/ws`, { username: 'ghost', token: 'not-a-real-token' });
  await c.open();
  const r = await c.request({ t: 'hello', token: 'not-a-real-token' }, 'auth-failed');
  assert.equal(r.t, 'auth-failed');
  c.close();
});

test('others see you arrive and leave', async () => {
  const a = await server.join('arr');
  const joined = a.next(m => m.t === 'join' && m.player && m.player.name.startsWith('lv'));
  const b = await server.join('lv');
  const j = await joined;
  assert.equal(j.player.id, b.id);
  assert.ok(b.welcome.players.some(p => p.id === a.id), 'the newcomer is told who is already here');
  const left = a.next(m => m.t === 'leave' && m.id === b.id);
  b.close();
  await left;
});

test('logging in again elsewhere kicks the old connection', async () => {
  const a = await server.join('kick');
  const kicked = a.next('kicked');
  const again = new TestClient(`ws://127.0.0.1:${server.port}/ws`, a.account);
  await again.open();
  await again.hello();
  assert.match((await kicked).reason, /somewhere else/);
  again.close();
});

test("coming back to a spot you can't stand on any more puts you on the beach", async () => {
  const { WG } = require('../helpers/world');
  const acct = await server.signup('back');
  const connect = async () => { const c = new TestClient(`ws://127.0.0.1:${server.port}/ws`, acct); await c.open(); await c.hello(); return c; };
  const a = await connect();
  // out at sea, as if the big world had been switched off while you were out in it
  const sea = { x: WG.ISL * 3, z: WG.ISL * 3 };
  assert.ok(WG.heightAt(sea.x, sea.z) <= -1);
  await a.test('place', sea);
  a.close();
  await new Promise(r => setTimeout(r, 400));   // leaving saves where you are
  const b = await connect();
  assert.ok(Math.hypot(b.welcome.you.x - WG.SPAWN.x, b.welcome.you.z - WG.SPAWN.z) < .01, `back on the beach, not at ${b.welcome.you.x}, ${b.welcome.you.z}`);
  b.close();
});
