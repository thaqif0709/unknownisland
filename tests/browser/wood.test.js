// The Weeping Wood in the browser (C4, flag region-wood): its own things are drawn as
// themselves (the giants too), E says what it does to them, the bow has a model in hand, and
// the Hung and the Hanging Mother (up in the canopy, then down once her vines are cut) have
// their own. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const MOTHER = require('../../server/bosses').BOSSES.mother;

let server, browser, page;
const errors = [];
const send = m => page.evaluate(m => window.__dbg.send(m), m);
let tid = 9850;
const test_ = (what, args = {}) => send({ t: 'test', do: what, id: tid++, ...args });

before(async () => {
  server = await startServer({ env: { FEATURES: 'streaming,bigworld,caves,slots,bosses,region-wood' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'wood' + Date.now().toString(36).slice(-6));
  await page.fill('#inPass', 'password123');
  await page.fill('#inInvite', INVITE);
  await page.click('#fAuth button[type=submit]');
  await page.waitForSelector('#vReady.on', { timeout: 15000 });
  await page.click('#goIsland');
  await page.click('#cutSkip', { timeout: 90000 });
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 90000 });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.stop();
});

// Put me at `at`. (A position the page sent just before can reach the server after the move and
// pull me part of the way back, so it tries again until I stay there.)
async function goTo(at) {
  const there = () => page.evaluate(s => { const q = window.__dbg.pos(); return Math.hypot(q.x - s.x, q.z - s.z) < .5; }, at);
  for (let i = 0; i < 5; i++) {
    await test_('place', { x: at.x, z: at.z });
    await page.waitForTimeout(700);
    if (await there()) return;
  }
  assert.fail(`could not get to ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`);
}

test('the Wood’s things arrive and are drawn as themselves', async () => {
  await test_('open', { region: 'wood' });
  await test_('set', { hunger: 100, thirst: 100, health: 100 });
  await goTo({ x: 1450, z: -1450 });
  await page.waitForFunction(() => ['giant', 'resin', 'vine', 'fruit', 'bigleaf'].every(t => [...window.__dbg.chunkObjs().values()].some(o => o.type === t && o.mesh)), null, { timeout: 90000 });
  const tall = await page.evaluate(() => {
    const g = [...window.__dbg.chunkObjs().values()].find(o => o.type === 'giant' && o.mesh);
    return new window.THREE.Box3().setFromObject(g.mesh).getSize(new window.THREE.Vector3()).y;
  });
  assert.ok(tall > 55, `a giant is giant (${tall.toFixed(0)} m)`);
});

test('E says what it does, and picking strange fruit gives it (with an icon)', async () => {
  const fruit = await page.evaluate(() => {
    const p = window.__dbg.pos();
    return [...window.__dbg.chunkObjs().values()].filter(o => o.type === 'fruit' && !o.state.picked)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).map(o => ({ id: o.id, x: o.x, z: o.z, r: o.r }))[0];
  });
  await goTo({ x: fruit.x + fruit.r + .5, z: fruit.z });
  await page.waitForFunction(() => /fruit/i.test(document.getElementById('prompt').textContent), null, { timeout: 15000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window.__dbg.stats.inv.strange_fruit || 0) > 0, null, { timeout: 10000 });
  await page.waitForFunction(() => { const i = document.querySelector('#invList .slot img[alt="Strange fruit"]'); return i && i.src.startsWith('data:image/png'); }, null, { timeout: 5000 });
});

test('the Hung and the Hanging Mother have their own models; cut her vines and she comes down', async () => {
  await goTo({ x: MOTHER.appear.x - 6, z: MOTHER.appear.z });
  await test_('set', { time: 0, weather: 'clear', health: 100, hunger: 100, thirst: 100 });
  const p = await page.evaluate(() => window.__dbg.pos());
  await test_('spawn', { kind: 'hung', x: p.x + 20, z: p.z + 20, opts: { home: { x: p.x + 20, z: p.z + 20 } } });
  await page.waitForFunction(() => [...window.UI.mobs.all().values()].some(m => m.kind === 'hung' && m.mesh.userData.arms), null, { timeout: 10000 });
  await test_('boss', { boss: 'mother' });
  await page.waitForFunction(() => window.__dbg.bosses().bar && /Hanging Mother/.test(document.querySelector('.bossbar .name').textContent), null, { timeout: 8000 });
  await page.waitForFunction(() => [...window.UI.mobs.all().values()].filter(m => m.kind === 'mother_vine' && m.mesh).length === 3, null, { timeout: 5000 });
  const high = () => page.evaluate(() => { const m = [...window.UI.mobs.all().values()].find(x => x.kind === 'boss_mother'); return m.mesh.userData.body.position.y; });
  await page.waitForFunction(() => { const m = [...window.UI.mobs.all().values()].find(x => x.kind === 'boss_mother'); return m && m.mesh.userData.body.position.y > 10; }, null, { timeout: 8000 });
  for (const v of await page.evaluate(() => [...window.UI.mobs.all().values()].filter(m => m.kind === 'mother_vine').map(m => m.id))) {
    await test_('mobHit', { mob: v, amount: MOTHER.tune.VINE.HP });
  }
  await page.waitForFunction(() => { const m = [...window.UI.mobs.all().values()].find(x => x.kind === 'boss_mother'); return m.mesh.userData.body.position.y < 3; }, null, { timeout: 8000 });
  assert.ok(await high() < 3, 'down on the ground');
  assert.deepEqual(errors, []);
});
