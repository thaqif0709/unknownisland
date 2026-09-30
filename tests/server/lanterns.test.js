// Stone lanterns: lighting one with lamp oil, topping it up, great lanterns needing
// several frogs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { besideSpot, nearest, WG } = require('../helpers/world');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

test('a cold lantern wants oil, and one oil lights it for everyone', async () => {
  const a = await server.join('lamp'), b = await server.join('see');
  // a small lantern (in a database kept between runs one may already be lit; then it's topped up)
  const l = nearest(a.welcome.lanterns, WG.SPAWN, x => !x.big && !x.lit) || nearest(a.welcome.lanterns, WG.SPAWN, x => !x.big);
  await a.test('place', besideSpot({ ...l, r: 1.2 }));
  if (!l.lit) assert.match((await a.act('l' + l.id)).msg, /wants an offering of lamp oil/);
  await a.test('give', { inv: { oil: 1 } });
  const seen = b.next(m => m.t === 'lanterns' && m.list.some(x => x.id === l.id && x.lit));
  const t = await a.act('l' + l.id);
  assert.match(t.msg, l.lit ? /steadies|full/ : /catches/);
  const view = (await seen).list.find(x => x.id === l.id);
  assert.ok(view.fuel > 0 && view.clear > 0, 'lit and clearing the fog');
  if (!l.lit) assert.equal(a.me.inv.oil, 0);
});

test('a great lantern takes offerings from different frogs', async () => {
  const a = await server.join('great');
  const l = a.welcome.lanterns.find(x => x.big && !x.lit);
  if (!l) return;   // already lit in a kept database
  await a.test('place', besideSpot({ ...l, r: 1.6 }));
  await a.test('give', { inv: { oil: 2 } });
  const first = await a.act('l' + l.id);
  // in a kept database earlier runs' frogs may have made offerings; the last one lights it
  if (l.have + 1 >= l.need) return assert.match(first.msg, /great lantern flares to life/);
  assert.match(first.msg, /offering is taken/);
  assert.match((await a.act('l' + l.id)).msg, /made your offering/, 'the same frog can\'t offer twice');
});
