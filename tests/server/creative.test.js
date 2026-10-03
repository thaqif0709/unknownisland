// Creative mode (admins, for testing): /creative lets an admin fly fast, over the sea too;
// nobody else can turn it on, and /normal puts you back on land. In it your health, hunger
// and thirst stay full, nothing hurts you, and /tp takes you to another frog.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

const ADMIN = 'fly' + Date.now().toString(36).slice(-6), ADMIN2 = 'god' + Date.now().toString(36).slice(-6), ADMIN3 = 'tp' + Date.now().toString(36).slice(-6), ADMIN4 = 'mj' + Date.now().toString(36).slice(-6);
let server;
before(async () => { server = await startServer({ env: { ADMINS: `${ADMIN},${ADMIN2},${ADMIN3},${ADMIN4}` } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const C = WG.RULES.CREATIVE;
const say = (c, text) => c.request({ t: 'chat', text }, m => m.t === 'chat' && m.kind === 'system', { what: `the answer to ${text}` });
// Send positions every 200 ms along a straight line at `speed` m/s; returns whether the server pulled us back.
async function travel(c, from, dir, speed, pose, n = 4) {
  let { x, z } = from, corrected = false;
  const seen = c.messages.length;
  for (let i = 0; i < n; i++) {
    x += Math.cos(dir) * speed * .2; z += Math.sin(dir) * speed * .2;
    c.send({ t: 'pos', x, z, face: dir, moving: true, sprint: false, cam: 0, stand: 20, pose });
    await sleep(200);
  }
  await sleep(150);
  corrected = c.messages.slice(seen).some(m => m.t === 'correct');
  return { corrected, x, z };
}

test("only admins have /creative", async () => {
  const c = await server.join('nofly');
  assert.match((await say(c, '/creative')).text, /no \/creative command/);
  const at = landNear(WG.SPAWN);
  await c.test('place', at); await sleep(300);
  assert.equal((await travel(c, at, 0, 20, 'fly')).corrected, true, 'flying without creative mode is walking too fast');
});

test('an admin in creative mode flies fast, over the sea too, and friends see it', async () => {
  const a = await server.join('fly', { username: ADMIN }), b = await server.join('see');
  const mode = a.next(m => m.t === 'mode' && m.creative === true);
  assert.match((await say(a, '/gamemode creative')).text, /Creative mode/);
  await mode;
  const at = landNear(WG.SPAWN);
  await a.test('place', at); await sleep(300);
  const r = await travel(a, at, 0, C.FLY_SPEED * .9, 'fly');
  assert.equal(r.corrected, false, `flying at ${C.FLY_SPEED * .9} m/s is allowed`);
  const row = b.snap && b.snap.p.find(x => x[0] === a.id);
  assert.ok(row && row[8] === 3 && row[6] === 20, 'friends see the flying pose, 20 m up');
  // out over the open sea
  const sea = { x: WG.ISL * 2, z: 0 };
  assert.ok(WG.heightAt(sea.x, sea.z) <= -1);
  await a.test('place', sea); await sleep(300);
  assert.equal((await travel(a, sea, 0, 10, 'fly')).corrected, false, 'over the sea');
  // /normal out there: back on the beach
  const back = a.next(m => m.t === 'correct');
  const off = a.next(m => m.t === 'mode' && m.creative === false);
  assert.match((await say(a, '/normal')).text, /Normal mode/);
  const fix = await back; await off;
  assert.ok(WG.heightAt(fix.x, fix.z) > -1, 'back on land');
  // and walking pace again
  const land = landNear(WG.SPAWN);
  await a.test('place', land); await sleep(300);
  assert.equal((await travel(a, land, 0, 20, 'fly')).corrected, true, 'too fast once creative is off');
});

test('in creative mode your health, hunger and thirst stay full, and nothing hurts you', async () => {
  const a = await server.join('god', { username: ADMIN2 });
  const at = landNear({ x: WG.SPAWN.x + 30, z: WG.SPAWN.z - 30 });
  await a.test('place', at); await sleep(300);
  assert.match((await say(a, '/creative')).text, /Creative mode/);
  await a.test('set', { health: 40, hunger: 5, thirst: 5 });
  const me = await a.next(m => m.t === 'me' && m.health === 100 && m.hunger === 100 && m.thirst === 100, { what: 'full again' });
  assert.ok(me);
  // a straw dummy slams the ground where you stand: nothing
  const seen = a.messages.length;
  await a.test('spawn', { kind: 'dummy', x: at.x, z: at.z + 1.5 });
  await a.next(m => m.t === 'telegraph', { what: 'the dummy winds up' });
  await sleep(2500);
  const after = a.messages.slice(seen);
  assert.ok(!after.some(m => m.t === 'me' && m.health < 100), 'no health lost');
  assert.ok(!after.some(m => m.t === 'downed' || m.t === 'knocked' || (m.t === 'toast' && /slams/.test(m.msg))), 'not hurt, not down');
  assert.match((await say(a, '/normal')).text, /Normal mode/);
});

test('/tp takes you to another frog, in creative mode only', async () => {
  const a = await server.join('tp', { username: ADMIN3 }), b = await server.join('far'), c = await server.join('plain');
  const there = landNear({ x: WG.SPAWN.x - 40, z: WG.SPAWN.z - 20 });
  await b.test('place', there); await sleep(300);
  assert.match((await say(c, `/tp ${b.name}`)).text, /creative mode/, 'not out of creative mode');
  assert.match((await say(a, `/tp ${b.name}`)).text, /creative mode/, 'not even an admin out of it');
  assert.match((await say(a, '/creative')).text, /Creative mode/);
  assert.match((await say(a, '/tp nobody_here')).text, /isn't on the island/);
  const moved = a.next(m => m.t === 'correct', { what: 'the jump' });
  assert.match((await say(a, `/tp ${b.name}`)).text, new RegExp(`You go to ${b.name}`));
  const fix = await moved;
  assert.ok(Math.hypot(fix.x - there.x, fix.z - there.z) < 2, `next to them: ${fix.x.toFixed(1)}, ${fix.z.toFixed(1)}`);
  // and the server agrees: walking on from there isn't pulled back
  await sleep(300);
  assert.equal((await travel(a, fix, 0, 3, undefined, 2)).corrected, false);
  assert.match((await say(a, `/tp #${c.id}`)).text, /You go to/, 'by number too');
});

test('an admin double-clicking the big map jumps there (not onto open sea out of creative)', async () => {
  const a = await server.join('mj', { username: ADMIN4 }), c = await server.join('notadmin');
  assert.equal(a.welcome.admin, true, 'the welcome says who is an admin');
  assert.equal(c.welcome.admin, false);
  const there = landNear({ x: WG.SPAWN.x - 50, z: WG.SPAWN.z - 30 });
  const moved = a.next(m => m.t === 'correct', { what: 'the jump' });
  a.send({ t: 'mapjump', x: there.x, z: there.z });
  const fix = await moved;
  assert.ok(Math.hypot(fix.x - there.x, fix.z - there.z) < .01);
  // not for anyone else
  const seen = c.messages.length;
  c.send({ t: 'mapjump', x: there.x, z: there.z });
  await sleep(400);
  assert.ok(!c.messages.slice(seen).some(m => m.t === 'correct'), 'a player who is not an admin stays put');
  // open sea: only in creative mode
  const sea = { x: WG.ISL * 2, z: 0 };
  const no = a.next(m => m.t === 'toast' && /open sea/.test(m.msg), { what: 'the sea refusal' });
  a.send({ t: 'mapjump', x: sea.x, z: sea.z });
  await no;
  assert.match((await say(a, '/creative')).text, /Creative mode/);
  const over = a.next(m => m.t === 'correct', { what: 'the jump out to sea' });
  a.send({ t: 'mapjump', x: sea.x, z: sea.z });
  assert.ok(Math.hypot((await over).x - sea.x, 0) < .01);
});
