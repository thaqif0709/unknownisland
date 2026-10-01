// Bosses in the browser (C0, flag bosses): the practice boss called nearby shows its health
// bar and its model, its slam shakes the ground, and once it's beaten its echo stays, with a
// prompt to touch it. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server, browser, page;
const errors = [];
const NAME = 'boss' + Date.now().toString(36).slice(-6);
const send = m => page.evaluate(m => window.__dbg.send(m), m);
let tid = 9900;
const test_ = (what, args = {}) => send({ t: 'test', do: what, id: tid++, ...args });

before(async () => {
  server = await startServer({ env: { FEATURES: 'bosses' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', NAME);
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

test('a boss nearby: its bar, its model, its slam; beaten, its echo', async () => {
  const at = landNear({ x: WG.SPAWN.x + 40, z: WG.SPAWN.z - 40 });
  await test_('place', at);
  await page.waitForFunction(s => { const q = window.__dbg.pos(); return Math.hypot(q.x - s.x, q.z - s.z) < .5; }, at, { timeout: 10000 });
  await test_('set', { health: 100, hunger: 100, thirst: 100 });
  await test_('boss', { boss: 'practice', x: at.x + 7, z: at.z });
  await page.waitForFunction(() => window.__dbg.bosses().bar, null, { timeout: 8000 });
  await page.waitForFunction(() => [...window.UI.mobs.all().values()].some(m => m.kind === 'boss_practice'), null, { timeout: 5000 });
  await page.waitForFunction(() => window.__dbg.bosses().shaking, null, { timeout: 10000 });
  // beat it
  const mob = await page.evaluate(() => [...window.UI.mobs.all().values()].find(m => m.kind === 'boss_practice').id);
  await test_('mobHit', { mob, amount: 10000 });
  await page.waitForFunction(() => window.__dbg.bosses().list.some(b => b.state === 'beaten'), null, { timeout: 5000 });
  await page.waitForFunction(() => !window.__dbg.bosses().bar, null, { timeout: 3000 });
  // its echo, where it was called: a prompt, and E answers (I fought it, so it has nothing more for me)
  await test_('place', { x: at.x + 7.5, z: at.z });
  await page.waitForFunction(() => /echo of the Straw Giant/.test([...document.querySelectorAll('.revivetag:not(.hidden)')].map(e => e.textContent).join()), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => /echo is quiet/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  assert.deepEqual(errors, []);
});
