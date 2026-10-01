// The Teeth in the browser (C6, flag region-teeth): their own things are drawn as themselves,
// the warmth bar shows up there and frost creeps in when you're cold, a blizzard brings snow,
// and the Frozen and the White Ram (dazed after rock) have their own models. Needs Chromium like
// smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const RAM = require('../../server/bosses').BOSSES.ram;
const AT = { x: RAM.appear.x + 5, z: RAM.appear.z - 5 };   // flat snow on the high snowfield

let server, browser, page;
const errors = [];
const send = m => page.evaluate(m => window.__dbg.send(m), m);
let tid = 9750;
const test_ = (what, args = {}) => send({ t: 'test', do: what, id: tid++, ...args });

before(async () => {
  server = await startServer({ env: { FEATURES: 'streaming,bigworld,caves,slots,bosses,region-teeth' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'teeth' + Date.now().toString(36).slice(-6));
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

test('the Teeth’s things arrive and are drawn as themselves; the warmth bar shows up there', async () => {
  await test_('open', { region: 'teeth' });
  await test_('set', { hunger: 100, thirst: 100, health: 100, time: .51, weather: 'clear' });
  await goTo(AT);
  await page.waitForFunction(() => ['ice', 'crystal', 'hare', 'icehole'].every(t => [...window.__dbg.chunkObjs().values()].some(o => o.type === t && o.mesh)), null, { timeout: 90000 });
  await page.waitForFunction(() => window.UI.teeth.bar, null, { timeout: 5000 });
  await test_('set', { warmth: 10 });
  await page.waitForFunction(() => window.UI.teeth.warmth <= 12 && +getComputedStyle(document.querySelector('.frost')).opacity > .3, null, { timeout: 5000 });
  await test_('set', { warmth: 100 });
});

test('a blizzard brings snow; the Frozen have their own model', async () => {
  await test_('set', { weather: 'storm' });
  await page.waitForFunction(() => window.UI.teeth.blizzard === 1 && window.UI.teeth.snow, null, { timeout: 5000 });
  const p = await page.evaluate(() => window.__dbg.pos());
  await test_('spawn', { kind: 'frozen', x: p.x + 6, z: p.z + 6 });
  await page.waitForFunction(() => [...window.UI.mobs.all().values()].some(m => m.kind === 'frozen' && m.mesh.userData.arms), null, { timeout: 10000 });
  await test_('set', { weather: 'clear' });
});

test('the White Ram has its own model, and stars round its horns when dazed', async () => {
  await test_('set', { time: 0, health: 100, hunger: 100, thirst: 100, warmth: 100 });
  await test_('boss', { boss: 'ram' });
  await page.waitForFunction(() => window.__dbg.bosses().bar && /White Ram/.test(document.querySelector('.bossbar .name').textContent), null, { timeout: 8000 });
  const mob = await page.evaluate(() => { const m = [...window.UI.mobs.all().values()].find(x => x.kind === 'boss_ram'); return m && m.id; });
  assert.ok(mob, 'its model');
  await test_('mobState', { mob, state: 'dazed' });
  await page.waitForFunction(id => window.UI.mobs.all().get(id).mesh.userData.stars.visible, mob, { timeout: 4000 });
  assert.deepEqual(errors, []);
});
