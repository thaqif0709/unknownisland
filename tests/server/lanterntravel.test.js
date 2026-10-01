// Travelling between lit lanterns (W10, flag fasttravel): standing in a lit lantern's light
// remembers it; from one you're at, you can travel to another lit one you remember, paying
// lamp oil by distance; and the server refuses everything else.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { besideSpot, WG } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'fasttravel' } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cost = (a, b) => Math.max(WG.RULES.LANTERN_TRAVEL.MIN_OIL, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / WG.RULES.LANTERN_TRAVEL.PER_OIL));

test('remember lit lanterns by standing in their light, then travel between them for oil', async () => {
  const c = await server.join('ft');
  // the two small lanterns furthest apart, so the trip costs more than the minimum where it can
  const small = c.welcome.lanterns.filter(l => !l.big);
  let a = small[0], b = small[1];
  for (const x of small) for (const y of small) if (Math.hypot(x.x - y.x, x.z - y.z) > Math.hypot(a.x - b.x, a.z - b.z)) { a = x; b = y; }
  const light = async l => {
    await c.test('place', besideSpot({ ...l, r: 1.2 }));
    await c.test('give', { inv: { oil: 1 } });
    await c.act('l' + l.id);   // lights it (or tops it up, in a kept database)
    await c.next(m => m.t === 'lanternsseen' && m.ids.includes(l.id), { timeout: 5000 });
  };
  await light(b);
  await light(a);   // now at a, remembering both

  // too little oil (the two furthest apart cost more than one oil, which is all lighting left us)
  const need = cost(a, b);
  await c.settle();
  if ((c.me.inv.oil || 0) < need) {
    const poor = c.next(m => m.t === 'toast' && /takes \d+ lamp oil/.test(m.msg));
    c.send({ t: 'lanterntravel', from: a.id, to: b.id });
    await poor;
  }

  // enough: off you go, beside the other lantern, and the oil is spent
  await c.test('give', { inv: { oil: need + 1 } });
  await c.settle();
  const before = c.me.inv.oil;
  const went = c.next(m => m.t === 'lanterntravelled');
  const moved = c.next(m => m.t === 'correct');
  c.send({ t: 'lanterntravel', from: a.id, to: b.id });
  assert.equal((await went).cost, need);
  const at = await moved;
  assert.ok(Math.hypot(at.x - b.x, at.z - b.z) < 4, 'beside the other lantern');
  await c.settle();
  assert.equal(c.me.inv.oil, before - need);
  c.close();
});

test('the server refuses: a lantern you have not been to, one gone cold, or from far away', async () => {
  const c = await server.join('ft2');
  const small = c.welcome.lanterns.filter(l => !l.big), [a, b, x] = small;
  await c.test('place', besideSpot({ ...a, r: 1.2 }));
  await c.test('give', { inv: { oil: 3 } });
  await c.act('l' + a.id);
  await c.next(m => m.t === 'lanternsseen' && m.ids.includes(a.id), { timeout: 5000 });
  // b: never stood by it (light it from afar with a test hook isn't possible, so it may be cold too)
  const told = c.next(m => m.t === 'toast' && /gone cold|don.t know the way/.test(m.msg));
  c.send({ t: 'lanterntravel', from: a.id, to: b.id });
  await told;
  // from far away: nothing happens at all
  await c.test('place', { x: WG.SPAWN.x, z: WG.SPAWN.z });
  await c.settle();
  const n = c.messages.length;
  c.send({ t: 'lanterntravel', from: a.id, to: x.id });
  await sleep(400);
  assert.ok(!c.messages.slice(n).some(m => m.t === 'lanterntravelled' || m.t === 'correct'), 'not travelled');
  c.close();
});

test('the lanterns you remember are saved with you', async () => {
  const acct = await server.signup('ftkeep');
  const { TestClient } = require('../helpers/client');
  const connect = async () => { const c = new TestClient(`ws://127.0.0.1:${server.port}/ws`, acct); await c.open(); await c.hello(); return c; };
  const c = await connect();
  const l = c.welcome.lanterns.find(x => !x.big);
  await c.test('place', besideSpot({ ...l, r: 1.2 }));
  await c.test('give', { inv: { oil: 1 } });
  await c.act('l' + l.id);
  await c.next(m => m.t === 'lanternsseen' && m.ids.includes(l.id), { timeout: 5000 });
  c.close();
  await sleep(400);
  const again = await connect();
  assert.ok(again.welcome.lanternsSeen.includes(l.id));
  again.close();
});
