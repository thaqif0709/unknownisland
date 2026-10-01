// Dying: what you carried stays in a sack where you fell (it never goes away); tools and
// buckets stay with you; anyone can pick the sack up.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer({ env: { FEATURES: 'slots,tools' } }); });
after(async () => { if (server) await server.stop(); });

test('dying leaves everything you carried in a sack where you fell, tools too', async () => {
  const a = await server.join('dies'), b = await server.join('finds');
  const spot = landNear({ x: WG.SPAWN.x - 15, z: WG.SPAWN.z - 25 }, a.welcome.fires);
  await a.test('place', spot);
  await a.test('give', { inv: { wood: 7, stone: 3, berries: 2 } });
  await a.test('give', { inv: { pickaxe: 1, shovel: 1 } });   // tools (P3: items with uses)
  await a.settle();
  const tools = a.me.slots.filter(s => s && WG.itemInfo(s.k).uses).map(s => s.k);
  assert.deepEqual(tools.sort(), ['pickaxe', 'shovel']);
  const carried = Object.fromEntries(Object.entries(a.me.inv).filter(([k, n]) => n > 0 && !WG.itemInfo(k).uses));
  // starve, and fall
  const sack = b.next(m => m.t === 'drop', { timeout: 15000 });
  const died = a.next(m => m.t === 'died', { timeout: 15000 });
  await a.test('set', { hunger: 0, thirst: 0, health: .5 });
  await died;
  const { drop } = await sack;
  assert.ok(Math.hypot(drop.x - spot.x, drop.z - spot.z) < 1.5, 'where they fell');
  for (const [k, n] of Object.entries(carried)) assert.equal(drop.items[k], n, `${k} in the sack`);
  assert.deepEqual(drop.items.tools.map(t => t.k).sort(), tools.sort(), 'the tools are in the sack');
  await a.settle();
  assert.ok(a.me.slots.every(s => !s), 'nothing left in your slots');
  // waking up doesn't take the sack away; a friend can pick it up
  a.send({ t: 'respawn' });
  await a.next(m => m.t === 'respawned');
  assert.ok(b.messages.every(m => m.t !== 'undrop' || m.id !== drop.id), 'still there');
  await b.test('place', { x: drop.x + .6, z: drop.z });
  await b.act('d' + drop.id);
  await b.settle();
  assert.equal(b.me.inv.wood, carried.wood);
  assert.ok(b.me.slots.some(s => s && s.k === 'pickaxe'), 'the tools come with it');
  a.close(); b.close();
});
