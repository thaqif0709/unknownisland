// The slot inventory (P2, flag slots): 8 hotbar slots and a 30-slot bag kept by the server.
// Moves are checked there, so no message can make or lose an item; a full bag drops a sack;
// new things fill the hotbar first, then the bag; berries and coconuts are kept to eat later; the arrangement is saved; and players who
// had things before the flag keep all of them.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { TestClient } = require('../helpers/client');
const { WG, objectsWithState, nearest, besideSpot, landNear } = require('../helpers/world');
const { methods: inv, buildSlots } = require('../../server/systems/inventory');

let server, layout;
before(async () => { server = await startServer({ env: { FEATURES: 'slots' } }); layout = await server.world(); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = WG.RULES.SLOTS, N = S.HOTBAR + S.BAG;
// Totals by item, from the slots
const totals = slots => slots.reduce((t, s) => { if (s && s.k) t[s.k] = (t[s.k] || 0) + s.n; return t; }, {});
const nonZero = o => Object.fromEntries(Object.entries(o).filter(([, n]) => n > 0));
// every slot is empty, a bucket, or 1 to a stack of one item
function wellFormed(slots) {
  assert.equal(slots.length, N);
  for (const s of slots) if (s && s.b == null) assert.ok(Number.isInteger(s.n) && s.n >= 1 && s.n <= WG.itemInfo(s.k).stack, `slot ${JSON.stringify(s)}`);
}
// Send a message and wait for the 'me' it causes (moves always answer with one)
async function send(c, msg) { const me = c.next('me'); c.send(msg); await me; return c.me; }

test('buildSlots: counts from before the flag become slots, nothing lost', () => {
  const counts = { ...Object.fromEntries(Object.keys(WG.ITEMS).map(k => [k, 0])), wood: 123, stone: 7, seeds: 3 };
  const { slots, over } = buildSlots(counts, [], null);
  wellFormed(slots);
  assert.deepEqual(totals(slots), { wood: 123, stone: 7, seeds: 3 });
  assert.deepEqual(over, {});
  assert.deepEqual(slots.slice(0, 5).map(s => s && s.k), ['wood', 'wood', 'wood', 'stone', 'seeds'], 'the hotbar fills first');
  // far more than fits: the rest is "over" (a sack at their feet when they join)
  const big = buildSlots({ ...counts, wood: 5000 }, [], null);
  const t = totals(big.slots);
  assert.equal((t.wood || 0) + big.over.wood, 5000);
  assert.equal((t.stone || 0) + (big.over.stone || 0), 7);
  // a saved arrangement is kept where it still matches, and trimmed where it doesn't
  const saved = [{ k: 'stone', n: 5 }, { k: 'wood', n: 999 }, { k: 'nonsense', n: 4 }, null, { b: 12345 }];
  const again = buildSlots(counts, [{ id: 12345 }], saved);
  assert.deepEqual(again.slots.slice(0, 2), [{ k: 'stone', n: 7 }, { k: 'wood', n: 50 }], 'the 2 other stone join the saved stack');
  assert.deepEqual(again.slots[4], { b: 12345 });
  assert.deepEqual(totals(again.slots), { wood: 123, stone: 7, seeds: 3 });
});

test('with the flag off, the saved arrangement is kept for later and the counts are used', () => {
  const was = WG.features();
  WG.setFeatures({ ...was, slots: false });
  try {
    const row = { wood: 4, stone: 2, inventory: { seeds: 1, tools: [], buckets: [], slots: [{ k: 'wood', n: 4 }] } };
    const l = inv.loadInventory(row);
    assert.equal(l.slots, undefined);
    assert.equal(l.inv.wood, 4);
    const p = { inv: l.inv, tools: l.tools, buckets: l.buckets, slotsSaved: l.slotsSaved };
    inv.give(p, 'wood', 3);
    assert.equal(p.inv.wood, 7);
    assert.deepEqual(inv.inventorySave(p).inventory.slots, [{ k: 'wood', n: 4 }]);
  } finally { WG.setFeatures(was); }
});

test('moving: into an empty slot, onto the same thing up to a stack, and swapping', async () => {
  const c = await server.join('mv');
  await c.test('give', { inv: { wood: 70, stone: 5 } });
  let me = await send(c, { t: 'move', from: 99, to: 0 });   // nothing there: just the slots back
  wellFormed(me.slots);
  const woodAt = () => me.slots.map((s, i) => (s && s.k === 'wood' ? i : -1)).filter(i => i >= 0);
  const stoneAt = me.slots.findIndex(s => s && s.k === 'stone');
  const [w1, w2] = woodAt();
  assert.deepEqual([me.slots[w1].n, me.slots[w2].n], [50, 20], 'a stack of wood is 50');
  assert.ok(Math.max(w1, w2, stoneAt) < S.HOTBAR, 'new things go into the hotbar first');
  me = await send(c, { t: 'move', from: w2, to: 10, count: 5 });   // part of a stack into the bag
  assert.deepEqual([me.slots[10], me.slots[w2]], [{ k: 'wood', n: 5 }, { k: 'wood', n: 15 }]);
  me = await send(c, { t: 'move', from: w1, to: 10 });   // onto the 5: only 45 more fit
  assert.deepEqual([me.slots[10], me.slots[w1]], [{ k: 'wood', n: 50 }, { k: 'wood', n: 5 }]);
  me = await send(c, { t: 'move', from: stoneAt, to: 10 });   // a different thing: they swap
  assert.deepEqual([me.slots[10], me.slots[stoneAt]], [{ k: 'stone', n: 5 }, { k: 'wood', n: 50 }]);
  me = await send(c, { t: 'move', from: stoneAt, to: 10, count: 3 });   // part of a stack can't swap
  assert.deepEqual([me.slots[10], me.slots[stoneAt]], [{ k: 'stone', n: 5 }, { k: 'wood', n: 50 }]);
  const free = me.slots.findIndex(s => !s);   // the first empty hotbar slot
  me = await send(c, { t: 'move', from: 10, to: -1 });   // Shift-click: bag -> hotbar
  assert.deepEqual([me.slots[10], me.slots[free]], [null, { k: 'stone', n: 5 }]);
  me = await send(c, { t: 'move', from: free, to: -1 });   // hotbar -> bag
  assert.deepEqual([me.slots[free], me.slots[S.HOTBAR]], [null, { k: 'stone', n: 5 }]);
  assert.deepEqual(nonZero(totals(me.slots)), { wood: 70, stone: 5 });
  assert.equal(me.inv.wood, 70);
});

test('no item can be copied or lost by sending odd move messages', async () => {
  const c = await server.join('fuzz');
  await c.test('give', { inv: { wood: 173, stone: 61, clay: 9, seeds: 4, oil: 2 } });
  await c.test('give', { inv: { torch: 3 } });
  await c.settle();
  const want = nonZero(totals(c.me.slots));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const odd = [-1, -2, 0.5, 1e9, NaN, null, '3', [], {}, true, Infinity, -Infinity, 37, 38, 7, 8];
  const pickVal = () => (rnd() < .7 ? Math.floor(rnd() * N) : odd[Math.floor(rnd() * odd.length)]);
  for (let i = 0; i < 400; i++) {
    const msg = { t: 'move', from: pickVal(), to: pickVal() };
    if (rnd() < .6) msg.count = rnd() < .7 ? Math.floor(rnd() * 60) - 5 : odd[Math.floor(rnd() * odd.length)];
    c.send(msg);
    if (i % 50 === 49) await sleep(50);
  }
  await sleep(400);
  const me = await send(c, { t: 'move', from: -5, to: 0 });
  wellFormed(me.slots);
  assert.deepEqual(nonZero(totals(me.slots)), want, 'the same things as before, in some order');
  assert.deepEqual(nonZero(me.inv), want, 'and the totals agree');
});

test('a full bag drops what doesn’t fit in a sack at your feet', async () => {
  const c = await server.join('full');
  await c.test('give', { inv: { wood: 50 * N } });
  const sack = c.next(m => m.t === 'drop' && m.drop.items.stone === 5, { what: 'the overflow sack' });
  const told = c.next(m => m.t === 'toast' && /bag is full/.test(m.msg));
  await c.test('give', { inv: { stone: 5 } });
  await sack; await told;
  await c.settle();
  assert.equal(c.me.inv.stone, 0);
  assert.equal(c.me.inv.wood, 50 * N);
  // dropping a slot's worth (it goes into that sack, right beside) makes room for the stone;
  // picking the sack up takes what fits and leaves the rest in it
  const d = c.messages.filter(m => m.t === 'drop' && m.drop.items.stone === 5).pop().drop;
  const merged = c.next(m => m.t === 'dropitems' && m.id === d.id);
  await send(c, { t: 'dropitem', slot: 8, count: 50 });
  assert.deepEqual((await merged).items, { stone: 5, wood: 50 });
  await c.test('place', { x: d.x, z: d.z });
  await sleep(200);
  const left = c.next(m => m.t === 'dropitems' && m.id === d.id);
  const t = await c.act('d' + d.id);
  assert.match(t.msg, /take what fits in your bag: 5 stone\. The rest stays in the sack/);
  assert.deepEqual((await left).items, { wood: 50 });
  assert.equal(c.me.inv.stone, 5);
  assert.equal(c.me.inv.wood, 50 * N - 50);
});

test('berries are kept (in the hotbar first), and holding E with them in hand eats them', async () => {
  const c = await server.join('eat');
  const o = nearest(objectsWithState(layout, c.welcome), WG.SPAWN, x => x.type === 'bush' && x.state.berries);
  assert.ok(o, 'a bush with berries');
  await c.test('place', besideSpot(o));
  const hunger = c.me.hunger;
  assert.match((await c.act('o' + o.id)).msg, /into your bag/);
  assert.equal(c.me.inv.berries, 1);
  assert.equal(c.me.inv.seeds, 1);
  assert.ok(c.me.hunger <= hunger, 'not eaten yet');
  const at = c.me.slots.findIndex(s => s && s.k === 'berries');
  assert.ok(at >= 0 && at < S.HOTBAR, 'in the hotbar');
  await c.test('set', { hunger: 40 });
  const ate = c.next(m => m.t === 'toast' && /eat the berries/.test(m.msg));
  c.send({ t: 'eat', slot: at });
  await ate; await c.settle();
  assert.equal(c.me.inv.berries, 0);
  assert.ok(c.me.hunger >= 40 + WG.RULES.BERRY_FOOD - 1, `hunger ${c.me.hunger}`);
  // full up: nothing is wasted
  await c.test('give', { inv: { berries: 1 } });
  await c.test('set', { hunger: 100 });
  await sleep(WG.RULES.SLOTS.EAT_GAP * 1000); await c.settle();
  const full = c.next(m => m.t === 'toast' && /full/.test(m.msg));
  c.send({ t: 'eat', slot: c.me.slots.findIndex(s => s && s.k === 'berries') });
  await full; await c.settle();
  assert.equal(c.me.inv.berries, 1);
  // wood isn't food
  await c.test('give', { inv: { wood: 2 } });
  await c.settle();
  const w = c.me.slots.findIndex(s => s && s.k === 'wood');
  c.send({ t: 'eat', slot: w });
  await sleep(300);
  assert.equal(c.me.inv.wood, 2);
});

test('buckets get a slot, and the arrangement is saved when you leave', async () => {
  const acct = await server.signup('keep');
  const connect = async () => { const c = new TestClient(`ws://127.0.0.1:${server.port}/ws`, acct); await c.open(); await c.hello(); return c; };
  const a = await connect();
  await a.test('place', landNear(WG.SPAWN));
  await a.test('give', { inv: { wood: 26, stone: 3 } });
  await a.request({ t: 'build', recipe: 'bucket_wood' }, 'toast');
  await a.settle();
  const b = a.me.buckets[0];
  assert.ok(b, 'a bucket');
  const bAt = a.me.slots.findIndex(s => s && s.b === b.id);
  assert.ok(bAt >= 0 && bAt < S.HOTBAR, 'a bucket goes in the hotbar, to be held');
  const w = a.me.slots.findIndex(s => s && s.k === 'wood');
  await send(a, { t: 'move', from: w, to: 5, count: 7 });
  await send(a, { t: 'move', from: bAt, to: 20 });
  const layoutBefore = a.me.slots;
  a.close();
  await sleep(400);   // leaving saves
  const c = await connect();
  assert.deepEqual(c.welcome.you.slots, layoutBefore);
  assert.equal(c.welcome.you.inv.wood, 20);
  c.close();
});
