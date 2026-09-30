// Buckets: make one, fill it in the sea, boil it on a fire, drink.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear, seaNear } = require('../helpers/world');

let server;
before(async () => { server = await startServer(); });
after(async () => { if (server) await server.stop(); });

test('sea water, boiled clean, quenches thirst', async () => {
  const a = await server.join('bucket');
  await a.test('give', { inv: { wood: 6 + 4, stone: 3 } });
  assert.match((await a.request({ t: 'build', recipe: 'bucket_wood' }, 'toast')).msg, /wooden bucket/);
  await a.settle();
  assert.equal(a.me.buckets.length, 1);
  const b = a.me.buckets[0];
  assert.equal(b.water, 'none');

  // filling needs the sea
  const land = landNear({ x: WG.SPAWN.x - 10, z: WG.SPAWN.z - 20 }, a.welcome.fires);
  await a.test('place', land);
  const bucket = (action, extra = {}) => a.request({ t: 'bucket', id: b.id, action, ...extra }, 'toast');
  assert.match((await bucket('fill')).msg, /Wade into the sea/);
  await a.test('place', seaNear(WG.SPAWN));
  assert.match((await bucket('fill')).msg, /Seawater/);
  await a.settle();
  assert.equal(a.me.buckets[0].water, 'sea');
  assert.match((await bucket('drink')).msg, /Boil it on a fire first/);

  // a fire to boil it on
  await a.test('place', land);
  const built = a.next('fire');
  await a.request({ t: 'build', recipe: 'campfire', x: land.x + 1.6, z: land.z }, 'toast');
  const { fire } = await built;
  const pot = a.next('pot');
  assert.match((await bucket('place', { fire: fire.id })).msg, /set the wooden bucket on the fire/);
  assert.equal((await pot).pot.mat, 'wood');
  await a.settle();
  assert.equal(a.me.buckets.length, 0, 'the bucket is on the fire now');

  await a.test('boil');   // skip the 75 seconds
  assert.match((await a.act('f' + fire.id)).msg, /Clean water/);
  const clean = a.me.buckets[0];
  assert.equal(clean.water, 'clean');
  assert.equal(clean.drinks, WG.RULES.BUCKET.DRINKS);

  const thirst = a.me.thirst;
  assert.match((await bucket('drink')).msg, /Cool, clean water/);
  await a.settle();
  assert.ok(a.me.thirst > thirst, 'drinking helps');
  assert.equal(a.me.buckets[0].drinks, WG.RULES.BUCKET.DRINKS - 1);
});

test('you can only carry so many buckets', async () => {
  const a = await server.join('many');
  const max = WG.RULES.BUCKET.MAX;
  await a.test('give', { inv: { wood: 6 * (max + 1) } });
  for (let i = 0; i < max; i++) await a.request({ t: 'build', recipe: 'bucket_wood' }, 'toast');
  assert.match((await a.request({ t: 'build', recipe: 'bucket_wood' }, 'toast')).msg, new RegExp(`only carry ${max}`));
});
