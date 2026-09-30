// Building from the recipe book: fires, tools, items and what they cost.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

// Somewhere on dry land away from every fire (this run's and, in a kept database, earlier ones).
const fires = [];
const spot = (c, n) => {
  for (const f of c.welcome.fires) if (!fires.some(g => g.id === f.id)) fires.push(f);
  const at = landNear({ x: WG.SPAWN.x + n * 7, z: WG.SPAWN.z - 12 }, fires);
  fires.push({ x: at.x + 1.6, z: at.z });
  return at;
};

test('a campfire costs wood and stone, and everyone sees it', async () => {
  const a = await server.join('fire'), b = await server.join('watch');
  const at = spot(a, 0);
  await a.test('place', at);
  await a.test('give', { inv: WG.recipeById('campfire').cost });
  const seen = b.next('fire');
  const t = await a.request({ t: 'build', recipe: 'campfire', x: at.x + 1.6, z: at.z }, 'toast');
  assert.match(t.msg, /A fire/);
  const f = (await seen).fire;
  assert.ok(Math.abs(f.x - (at.x + 1.6)) < .02 && f.fuel > 0);
  await a.settle();
  assert.equal(a.me.inv.wood, 0);
  assert.equal(a.me.inv.stone, 0);

  // feeding it wood
  await a.test('give', { inv: { wood: 1 } });
  assert.match((await a.act('f' + f.id)).msg, /flares up/);
  assert.equal(a.me.inv.wood, 0);
  assert.match((await a.act('f' + f.id)).msg, /need wood/);
});

test('fires can\'t be built without the materials, too far, or on top of another', async () => {
  const a = await server.join('nofire');
  const at = spot(a, 1);
  await a.test('place', at);
  const cost = WG.recipeById('campfire').cost;
  assert.match((await a.request({ t: 'build', recipe: 'campfire', x: at.x + 1.6, z: at.z }, 'toast')).msg, new RegExp(`needs ${cost.wood} wood, ${cost.stone} stone`));
  await a.test('give', { inv: { wood: 8, stone: 6 } });
  a.send({ t: 'build', recipe: 'campfire', x: at.x + 10, z: at.z });   // out of reach: silently ignored
  assert.match((await a.request({ t: 'build', recipe: 'campfire', x: at.x + 1.6, z: at.z }, 'toast')).msg, /A fire/);
  assert.match((await a.request({ t: 'build', recipe: 'campfire', x: at.x + 1.8, z: at.z }, 'toast', { what: 'second fire refused' })).msg, /already a fire/);
});

test('tools are made once and kept', async () => {
  const a = await server.join('tool');
  await a.test('give', { inv: { wood: 6, stone: 6 } });
  assert.match((await a.request({ t: 'build', recipe: 'pickaxe' }, 'toast')).msg, /You made a stone pickaxe/);
  await a.settle();
  assert.deepEqual(a.me.tools, ['pickaxe']);
  assert.equal(a.me.inv.wood, 3);
  assert.match((await a.request({ t: 'build', recipe: 'pickaxe' }, 'toast')).msg, /already have/);
  assert.match((await a.request({ t: 'build', recipe: 'ironpick' }, 'toast')).msg, /needs 2 wood, 3 iron ore/);
});

test('an iron pickaxe needs a stone one first', async () => {
  const a = await server.join('iron');
  await a.test('give', { inv: { wood: 2, iron: 3 } });
  assert.match((await a.request({ t: 'build', recipe: 'ironpick' }, 'toast')).msg, /need a stone pickaxe first/);
});

test('lamp oil is pressed from seeds', async () => {
  const a = await server.join('oil');
  await a.test('give', { inv: { seeds: 3 } });
  assert.match((await a.request({ t: 'build', recipe: 'oil' }, 'toast')).msg, /You made lamp oil/);
  await a.settle();
  assert.equal(a.me.inv.oil, 1);
  assert.equal(a.me.inv.seeds, 0);
});
