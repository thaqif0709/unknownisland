// Creative mode (admins, for testing): /creative lets an admin fly fast, over the sea too;
// nobody else can turn it on, and /normal puts you back on land.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

const ADMIN = 'fly' + Date.now().toString(36).slice(-6);
let server;
before(async () => { server = await startServer({ env: { ADMINS: ADMIN } }); });
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
