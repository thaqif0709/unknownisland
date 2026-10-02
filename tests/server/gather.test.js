// Gathering with E: trees, rocks, ore, bushes, palms, the spring and the sea.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, objectsWithState, nearest, besideSpot, chopsLeft } = require('../helpers/world');

let server, layout;
before(async () => { server = await startServer(); layout = await server.world(); });
after(async () => { if (server) await server.stop(); });

// A fresh player standing next to the nearest object of `type` that passes `ok`.
// (`ok` gets the island too, for how grown things are.) In a database kept between runs
// earlier runs have used things up, so each test asks for enough left to do its work.
async function besideA(type, ok = () => true, prefix = type) {
  const c = await server.join(prefix);
  const list = objectsWithState(layout, c.welcome);
  const o = nearest(list, WG.SPAWN, x => x.type === type && !x.state.gone && ok(x, c.welcome.island));
  assert.ok(o, `there is a ${type} to use`);
  await c.test('place', besideSpot(o));
  return { c, o };
}

// A tool for this player: kept forever, or (with the tools flag, P3) an item that has to be in hand.
async function giveTool(c, tool) {
  await c.test('give', { tools: [tool] });
  if (!c.welcome.features.tools) return;
  c.send({ t: 'select', slot: c.me.slots.findIndex(s => s && s.k === tool) });
  await new Promise(r => setTimeout(r, 100));
}

test('chopping a tree gives wood', async () => {
  const { c, o } = await besideA('tree', (x, isl) => chopsLeft(x, isl) >= 3);
  const t = await c.act('o' + o.id);
  assert.match(t.msg, /^\+1 wood/);
  assert.equal(c.me.inv.wood, 1);
  const t2 = await c.act('o' + o.id);
  assert.match(t2.msg, /^\+1 wood/);
  assert.equal(c.me.inv.wood, 2);
});

test('a tree 2.5 frogs tall or more is too big to cut down (flag treeheights)', async () => {
  const { c, o } = await besideA('tree', (x, isl) => WG.tooBigToChop(x, x.state, isl.day, isl.time), 'big');
  assert.ok(WG.treeHeight(o, o.state, 0, .3) >= WG.RULES.TREES.NO_CHOP * WG.RULES.FROG_HEIGHT);
  assert.match((await c.act('o' + o.id)).msg, /too big to cut down/);
  assert.ok(!c.me.inv.wood, 'no wood from it');
});

test('an axe doubles the wood', async () => {
  const { c, o } = await besideA('tree', (x, isl) => chopsLeft(x, isl) >= 2, 'axe');
  await giveTool(c, 'axe');
  assert.match((await c.act('o' + o.id)).msg, /^\+2 wood/);
});

test('breaking rocks gives stone, twice as much with a pickaxe', async () => {
  const { c, o } = await besideA('rock', x => x.state.left >= 2);
  assert.match((await c.act('o' + o.id)).msg, /^\+1 stone/);
  await giveTool(c, 'pickaxe');
  assert.match((await c.act('o' + o.id)).msg, /^\+2 stone/);
  assert.equal(c.me.inv.stone, 3);
});

test('ore needs a pickaxe', async () => {
  const { c, o } = await besideA('ore');
  assert.match((await c.act('o' + o.id)).msg, /need a pickaxe/);
  await giveTool(c, 'pickaxe');
  assert.match((await c.act('o' + o.id)).msg, /^\+1 (copper|iron) ore/);
  assert.equal(c.me.inv.copper + c.me.inv.iron, 1);
});

test('berries and coconuts feed you and give seeds', async () => {
  const bush = await besideA('bush', x => x.state.berries);
  const before = bush.c.me.hunger, bag = !!bush.c.welcome.features.slots;   // with the slot inventory (P2) they go in the bag
  assert.match((await bush.c.act('o' + bush.o.id)).msg, /berries/i);
  if (bag) assert.equal(bush.c.me.inv.berries, 1); else assert.ok(bush.c.me.hunger > before);
  assert.equal(bush.c.me.inv.seeds, 1);
  assert.match((await bush.c.act('o' + bush.o.id)).msg, /Nothing left/);

  const palm = await besideA('palm', x => x.state.coconuts > 0);
  assert.match((await palm.c.act('o' + palm.o.id)).msg, /coconut/i);
  assert.equal(palm.c.me.inv.seeds, 1);
  if (bag) assert.equal(palm.c.me.inv.coconut, 1);
});

test('the spring quenches thirst, the sea makes it worse', async () => {
  const c = await server.join('drink');
  const sp = WG.nearestSpring(WG.SPAWN.x, WG.SPAWN.z);
  await c.test('place', { x: sp.x + 1, z: sp.z });
  assert.match((await c.act('spring')).msg, /clean water/);
  await c.test('place', { x: WG.SPAWN.x, z: WG.SPAWN.z + 3 });
  // wade out: the first spot towards the sea shallow enough to drink from
  let z = WG.SPAWN.z; while (WG.heightAt(WG.SPAWN.x, z) > .5) z += .5;
  await c.test('place', { x: WG.SPAWN.x, z });
  assert.match((await c.act('sea')).msg, /Salty/);
});

test('things out of reach can\'t be used', async () => {
  const c = await server.join('far');
  const list = objectsWithState(layout, c.welcome);
  const o = nearest(list, WG.SPAWN, x => x.type === 'tree' && !x.state.gone);
  await c.test('place', { x: o.x + 20, z: o.z });
  await c.act('o' + o.id, { toast: false });
  await new Promise(r => setTimeout(r, 500));
  assert.ok(!c.messages.some(m => m.t === 'toast' && /wood/.test(m.msg)));
  assert.equal(c.me.inv.wood, 0);
});
