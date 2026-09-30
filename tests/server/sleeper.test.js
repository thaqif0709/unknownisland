// The Sleeper: carvings on the stones, and answering an offering request.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

// Stand in front of a carving stone.
const before1 = s => ({ x: s.x + Math.sin(s.face) * 1.6, z: s.z + Math.cos(s.face) * 1.6 });

test('every stone says something', async () => {
  const a = await server.join('read');
  for (const c of a.welcome.carvings) {
    assert.ok(typeof c.text === 'string' && c.text.length > 0, `stone ${c.key} has words`);
    assert.ok(['idle', 'active', 'done', 'failed'].includes(c.state));
  }
});

test('offering what a carving asks for answers it', async () => {
  const a = await server.join('offer'), b = await server.join('witness');
  const carved = b.next(m => m.t === 'carvings' && m.why === 'new');
  const req = await a.test('sleeperOffer');
  const stone = (await carved).list.find(c => c.id === req.stone.id);
  assert.equal(stone.state, 'active');
  assert.deepEqual(stone.tally, [0, req.need]);
  assert.equal(stone.offer, req.item);

  await a.test('place', before1(req.stone));
  assert.match((await a.act('c' + req.stone.id)).msg, /You have none/);

  await a.test('give', { inv: { [req.item]: req.need } });
  const answered = b.next(m => m.t === 'carvings' && m.why === 'done' && m.changed === req.stone.id);
  const t = await a.act('c' + req.stone.id);
  assert.match(t.msg, /at the foot of the stone/);
  const done = (await answered).list.find(c => c.id === req.stone.id);
  assert.equal(done.state, 'done');
  assert.equal(a.me.inv[req.item], 0, 'the offering is taken');
});

test('a partial offering deepens the marks', async () => {
  const a = await server.join('part');
  const req = await a.test('sleeperOffer');
  if (req.need < 2) return;   // the first offer request only needs one
  await a.test('place', before1(req.stone));
  await a.test('give', { inv: { [req.item]: 1 } });
  const progress = a.next(m => m.t === 'carvings' && m.why === 'progress');
  assert.match((await a.act('c' + req.stone.id)).msg, /marks deepen/);
  assert.deepEqual((await progress).list.find(c => c.id === req.stone.id).tally, [1, req.need]);
});
