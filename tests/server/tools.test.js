// Tools that wear out (P3, flag tools): tools are items, one to a slot, used from your hand.
// Each use wears one down; worn out, it breaks and leaves one of its material; a lit hearth
// mends it for half its recipe. Tools you owned before become items.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, objectsWithState, nearest, besideSpot, landNear } = require('../helpers/world');
const { methods: inv } = require('../../server/systems/inventory');

let server, layout;
before(async () => { server = await startServer({ env: { FEATURES: 'tools' } }); layout = await server.world(); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = WG.RULES.TOOLS;
const slotOf = (c, k) => c.me.slots.findIndex(s => s && s.k === k);
const select = async (c, slot) => { c.send({ t: 'select', slot }); await sleep(100); };
// A fresh player next to the nearest object of `type` that passes `ok`.
async function besideA(type, ok = () => true, prefix = type) {
  const c = await server.join(prefix);
  const o = nearest(objectsWithState(layout, c.welcome), WG.SPAWN, x => x.type === type && !x.state.gone && ok(x));
  assert.ok(o, `there is a ${type} to use`);
  await c.test('place', besideSpot(o));
  return { c, o };
}

test('tools you owned become items in your bag, once', () => {
  const was = WG.features();
  WG.setFeatures({ ...was, slots: true, tools: true });
  try {
    const row = { wood: 3, stone: 0, inventory: { tools: ['pickaxe', 'axe'], buckets: [] } };
    const l = inv.loadInventory(row);
    assert.deepEqual(l.tools, [], 'no longer kept as a list');
    assert.deepEqual(l.slots.filter(s => s && s.d).map(s => [s.k, s.d]), [['pickaxe', T.USES.pickaxe], ['axe', T.USES.axe]], 'items with all their uses');
    // saved and loaded again: still one of each, as worn as they were
    const p = { inv: l.inv, tools: l.tools, buckets: l.buckets, slots: l.slots };
    p.slots.find(s => s && s.k === 'axe').d = 7;
    const again = inv.loadInventory({ wood: 3, stone: 0, inventory: inv.inventorySave(p).inventory });
    assert.deepEqual(again.slots.filter(s => s && s.d).map(s => [s.k, s.d]), [['pickaxe', T.USES.pickaxe], ['axe', 7]]);
  } finally { WG.setFeatures(was); }
});

test('a tool is made as an item with all its uses, and you can make another', async () => {
  const c = await server.join('mk');
  await c.test('give', { inv: { wood: 6, stone: 6 } });
  assert.match((await c.request({ t: 'build', recipe: 'pickaxe' }, 'toast')).msg, /made a stone pickaxe/i);
  await c.settle();
  assert.deepEqual(c.me.slots[slotOf(c, 'pickaxe')], { k: 'pickaxe', n: 1, d: T.USES.pickaxe });
  assert.match((await c.request({ t: 'build', recipe: 'pickaxe' }, 'toast')).msg, /made a stone pickaxe/i);
  await c.settle();
  assert.equal(c.me.inv.pickaxe, 2, 'two of them, one to a slot');
});

test('the pickaxe in your hand mines (and wears); just owning one does not', async () => {
  const { c, o } = await besideA('ore', x => x.state.left >= 2);
  await c.test('give', { tools: ['pickaxe'] });
  await c.settle();
  assert.match((await c.act('o' + o.id)).msg, /Hold your stone pickaxe/);
  const at = slotOf(c, 'pickaxe');
  await select(c, at);
  assert.match((await c.act('o' + o.id)).msg, /^\+1 (copper|iron) ore$/);
  assert.equal(c.me.slots[at].d, T.USES.pickaxe - 1, 'one use worn');
});

test('worn out, a pickaxe breaks and leaves a stone', async () => {
  const { c, o } = await besideA('rock', x => x.state.left >= 2, 'brk');
  await c.test('give', { tools: ['pickaxe'] });
  await c.settle();
  const at = slotOf(c, 'pickaxe');
  await select(c, at);
  await c.test('wear', { slot: at, d: Math.floor(T.USES.pickaxe * T.WARN) + 1 });
  assert.match((await c.act('o' + o.id)).msg, /^\+2 stone Your stone pickaxe is wearing out/, 'a warning as it gets low');
  await c.test('wear', { slot: at, d: 1 });
  const stone = c.me.inv.stone;
  assert.match((await c.act('o' + o.id)).msg, /^\+2 stone Your stone pickaxe breaks \(you keep 1 stone\)/);
  assert.equal(c.me.slots[at] && c.me.slots[at].k === 'pickaxe' ? 'still there' : 'gone', 'gone');
  assert.equal(c.me.inv.pickaxe, 0);
  assert.equal(c.me.inv.stone, stone + 2 + 1, 'the rock’s two, and one back from the pickaxe');
});

test('a lit hearth mends the tool in your hand for half its recipe', async () => {
  const c = await server.join('mend');
  const at = landNear({ x: WG.SPAWN.x + 6, z: WG.SPAWN.z + 6 });
  await c.test('place', at);
  await c.test('give', { inv: { wood: 10, stone: 10, clay: 3 }, tools: ['axe'] });
  const lit = c.next(m => m.t === 'fire');
  await c.request({ t: 'build', recipe: 'hearth', x: at.x + 1.6, z: at.z }, 'toast');
  const f = (await lit).fire;
  await c.settle();
  const slot = slotOf(c, 'axe');
  await select(c, slot);
  await c.test('wear', { slot, d: 5 });
  const wood = c.me.inv.wood, copper = c.me.inv.copper;
  assert.match((await c.act('f' + f.id)).msg, /needs 1 wood, 2 copper ore/, 'half of 2 wood and 3 copper, rounded up');
  await c.test('give', { inv: { copper: 2 } });
  assert.match((await c.act('f' + f.id)).msg, /mend your copper axe/i);
  assert.equal(c.me.slots[slot].d, T.USES.axe);
  assert.deepEqual([c.me.inv.wood, c.me.inv.copper], [wood - 1, copper], 'paid 1 wood and 2 copper');
  // full again: E feeds the hearth as usual
  assert.match((await c.act('f' + f.id)).msg, /flares up/);
});

test('dropped and picked up, a tool keeps its wear; knocked down, you keep your tools', async () => {
  const c = await server.join('keep');
  await c.test('place', landNear({ x: WG.SPAWN.x - 6, z: WG.SPAWN.z + 4 }));
  await c.test('give', { inv: { wood: 4 }, tools: ['shovel'] });
  await c.settle();
  let slot = slotOf(c, 'shovel');
  await c.test('wear', { slot, d: 9 });
  c.send({ t: 'dropitem', key: 'shovel', count: 1 });   // not by name: only from its slot, wear and all
  await sleep(300);
  assert.equal(c.me.inv.shovel, 1);
  const dropped = c.next(m => m.t === 'drop');
  c.send({ t: 'dropitem', slot, count: 1 });
  const d = (await dropped).drop;
  assert.deepEqual(d.items.tools, [{ k: 'shovel', d: 9 }]);
  await c.test('place', { x: d.x, z: d.z });
  await sleep(200);
  assert.match((await c.act('d' + d.id)).msg, /a shovel/);
  slot = slotOf(c, 'shovel');
  assert.equal(c.me.slots[slot].d, 9, 'still 9 uses left');
  await c.test('knock');
  await c.settle();
  assert.equal(c.me.inv.shovel, 1, 'the shovel stays');
  assert.ok(c.me.inv.wood < 4, 'other things scatter');
});
