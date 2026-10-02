// Bosses (C0, flag bosses): the practice boss is called and comes; more frogs in its arena make
// more of it; its phases turn over as it's hurt; beaten, everyone who fought gets its trophy,
// a latecomer earns it at the echo; if nobody is left standing it leaves whole; a region's boss
// beaten opens the next region and quiets its stone; and a fight is saved to resume.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server;
const ADMIN = 'bossadm' + require('crypto').randomBytes(3).toString('hex');
before(async () => { server = await startServer({ env: { FEATURES: 'bosses', ADMINS: ADMIN } }); });
after(async () => { if (server) await server.stop(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BR = WG.RULES.BOSSES, PRACTICE = require('../../server/bosses').BOSSES.practice;
let spot = 0;
// Frogs on open ground, a fresh place for each test (far apart: arenas are 40 m).
async function frogs(prefix, n) {
  const at = landNear({ x: WG.SPAWN.x + 60 * (spot % 3) - 60, z: WG.SPAWN.z - 30 - 60 * Math.floor(spot / 3) });
  spot++;
  const list = [];
  for (let i = 0; i < n; i++) {
    const c = await server.join(prefix + i);
    await c.test('place', { x: at.x + i, z: at.z });
    await c.test('set', { health: 100 });
    list.push(c);
  }
  return { list, at };
}
const bossMsg = (c, fn) => c.next(m => m.t === 'boss' && m.id === 'practice' && fn(m), { timeout: 5000 });

test('called, the practice boss comes; two frogs make it 1.6 times as tough', async () => {
  const { list: [a, b], at } = await frogs('arena', 2);
  const came = bossMsg(a, m => m.state === 'fighting' && m.max > PRACTICE.hp);
  const r = await a.test('boss', { boss: 'practice', x: at.x + 8, z: at.z });
  assert.equal(r.boss.state, 'waiting');
  const m = await came;
  assert.equal(m.max, +(PRACTICE.hp * (1 + BR.PER_FROG)).toFixed(2));
  assert.ok((await a.test('mobs')).mobs.some(x => x.id === m.mob && x.kind === 'boss_practice'), 'its mob is there');
  // it fights: a blow marked on the ground, then the slam (everyone feels it)
  const tg = await b.next(x => x.t === 'telegraph' && x.id === m.mob, { timeout: 8000 });
  const fx = await b.next(x => x.t === 'bossfx' && x.id === m.mob, { timeout: 4000 });
  assert.ok(Math.hypot(fx.x - tg.x, fx.z - tg.z) < .01, 'where it was marked');
});

test('hurt, it turns angry; beaten, both fighters get its trophy, and a latecomer gets it at the echo', async () => {
  const { list: [a, b], at } = await frogs('fight', 2);
  const came = bossMsg(a, m => m.state === 'fighting' && m.max > PRACTICE.hp);
  await a.test('boss', { boss: 'practice', x: at.x + 8, z: at.z });
  const boss = await came;
  // to below half: phase 1
  const angry = bossMsg(a, m => m.phase === 1);
  const rage = a.next(m => m.t === 'toast' && /rage/.test(m.msg));
  await a.test('mobHit', { mob: boss.mob, amount: boss.max * .6 });
  await angry; await rage;
  // the rest: beaten
  const beaten = bossMsg(a, m => m.state === 'beaten');
  const ta = a.next(m => m.t === 'journal' && m.key === PRACTICE.trophy.relic), tb = b.next(m => m.t === 'journal' && m.key === PRACTICE.trophy.relic);
  await a.test('mobHit', { mob: boss.mob, amount: boss.max });
  await beaten; await ta; await tb;
  // someone who wasn't there: at the echo
  const c = await server.join('late');
  assert.ok((c.welcome.bosses || []).some(x => x.id === 'practice' && x.state === 'beaten'), 'the echo is in the welcome');
  await c.test('place', { x: at.x + 8.5, z: at.z });
  const tc = c.next(m => m.t === 'journal' && m.key === PRACTICE.trophy.relic), kept = c.next(m => m.t === 'toast' && /keep something/.test(m.msg));
  c.send({ t: 'boss-echo', id: 'practice' });
  await tc; await kept;
  assert.match((await c.request({ t: 'boss-echo', id: 'practice' }, 'toast')).msg, /already/);
});

test('nobody left standing: it draws back, whole, to come again', async () => {
  const { list: [a], at } = await frogs('wipe', 1);
  const came = bossMsg(a, m => m.state === 'fighting');
  await a.test('boss', { boss: 'practice', x: at.x + 8, z: at.z });
  const boss = await came;
  await a.test('mobHit', { mob: boss.mob, amount: 30 });
  const gone = bossMsg(a, m => m.state === 'waiting');
  const said = a.next(m => m.t === 'toast' && /draws back/.test(m.msg), { timeout: 10000 });
  await a.test('down', { ms: (BR.WIPE + 3) * 1000 });
  const back = await gone;
  await said;
  assert.equal(back.hp, PRACTICE.hp, 'whole again');
  await sleep(200);   // (a removed mob leaves the list at the next tick)
  assert.ok(!(await a.test('mobs')).mobs.some(x => x.id === boss.mob), 'its mob is gone');
});

test('/boss: it comes now, in front of you; called again from elsewhere, it moves to you', async () => {
  const at = landNear({ x: WG.SPAWN.x - 60, z: WG.SPAWN.z + 60 });
  const a = await server.join(ADMIN, { username: ADMIN });
  await a.test('place', at);
  await a.test('set', { health: 100 });
  a.send({ t: 'pos', x: at.x, z: at.z, face: 0, moving: false, sprint: false, cam: 0 });
  await sleep(200);
  const came = bossMsg(a, m => m.state === 'fighting');
  const said = await a.request({ t: 'chat', text: '/boss practice' }, m => m.t === 'chat' && m.kind === 'system');
  assert.match(said.text, /comes, right in front of you/);
  const b = await came;
  assert.ok(Math.hypot(b.x - at.x, b.z - (at.z + 10)) < .5, `10 m in front (${b.x}, ${b.z})`);
  // somewhere else: it moves (one of it, not two)
  const there = landNear({ x: at.x + 30, z: at.z });
  await a.test('place', there);
  a.send({ t: 'pos', x: there.x, z: there.z, face: Math.PI / 2, moving: false, sprint: false, cam: 0 });
  await sleep(200);
  const moved = bossMsg(a, m => m.state === 'fighting' && Math.hypot(m.x - there.x - 10, m.z - there.z) < .5);
  a.send({ t: 'chat', text: '/boss practice' });
  await moved;
  await sleep(400);   // (the one removed leaves the list on the next tick)
  const mobs = (await a.test('mobs')).mobs.filter(m => m.kind === PRACTICE.kind);
  assert.equal(mobs.length, 1);
  assert.ok(Math.hypot(mobs[0].x - there.x - 10, mobs[0].z - there.z) < 4, 'here now (it may have taken a step), not back there');
  await a.test('mobHit', { mob: mobs[0].id, amount: 1e6 });   // (beaten: it's saved, and must not turn up in later tests)
  a.close();
});

test('a region boss beaten: its stone goes quiet and the next region opens', () => {
  const { Island } = require('../../server/world');
  const { BOSSES } = require('../../server/bosses');
  BOSSES.fake = { ...PRACTICE, id: 'fake', name: 'The Fake', region: 'landing', next: 'stair', trophy: {} };
  try {
    const opened = [], said = [];
    const isl = Object.assign(Object.create(Island.prototype), {
      id: 1, day: 7, chains: { landing: { done: 5, completeDay: 6 } }, players: new Map(),
      store: { saveBoss: async () => {}, insertEvent: async () => {} },
      broadcast: m => said.push(m), send() {}, openRegion: id => opened.push(id),
    });
    isl.bossState = new Map([['fake', { id: 'fake', state: 'fighting', present: new Set(), earned: [], phase: 0, x: 0, z: 0 }]]);
    isl.bossBeaten({ bossId: 'fake' });
    assert.equal(isl.chains.landing.bossDay, 7, 'the chain knows its boss is beaten');
    assert.deepEqual(opened, ['stair']);
    assert.ok(said.some(m => m.t === 'boss' && m.state === 'beaten'));
  } finally { delete BOSSES.fake; }
});

test('a fight is saved, and resumes with its health and phase after a restart', () => {
  const { Island } = require('../../server/world');
  const rows = [];
  const isl = Object.assign(Object.create(Island.prototype), { id: 1, store: { saveBoss: async (id, b) => rows.push(b) } });
  isl.bossSave({ id: 'practice', state: 'fighting', mob: { hp: 70, maxHp: 192, gone: false }, phase: 1, x: 3, z: 4, frogs: 2, earned: [], returnAt: 0 });
  const saved = rows.pop();
  assert.equal(saved.hp, 70);
  assert.equal(saved.data.maxHp, 192);
  const again = Object.create(Island.prototype);
  again.bossesLoad([{ ...saved, defeatedAt: null }]);
  const b = again.bossState.get('practice');
  assert.equal(b.state, 'fighting'); assert.equal(b.hp, 70); assert.equal(b.phase, 1); assert.equal(b.maxHp, 192); assert.ok(b.resume);
});
