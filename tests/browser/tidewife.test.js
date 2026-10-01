// The Tidewife in the browser (C1): at the lowest tide she comes up on the east sand with her
// health bar and her model, kelp and all; fire burns the kelp off her. Needs Chromium like
// smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const TW = require('../../server/bosses').BOSSES.tidewife;

let server, browser, page;
const errors = [];
const NAME = 'tide' + Date.now().toString(36).slice(-6);
const send = m => page.evaluate(m => window.__dbg.send(m), m);
let tid = 9950;
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

test('the Tidewife on the east sand: her bar, her model, her kelp until it burns', async () => {
  const at = { x: TW.appear.x - 7, z: TW.appear.z - 3 };
  await goTo(at);
  await test_('set', { time: .6, weather: 'clear', health: 100, hunger: 100, thirst: 100 });   // the afternoon's lowest tide
  await test_('boss', { boss: 'tidewife' });
  await page.waitForFunction(() => window.__dbg.bosses().bar && /Tidewife/.test(document.querySelector('.bossbar .name').textContent), null, { timeout: 8000 });
  const mob = await page.evaluate(() => { const m = [...window.UI.mobs.all().values()].find(x => x.kind === 'boss_tidewife'); return m && m.id; });
  assert.ok(mob, 'her model');
  await page.waitForFunction(id => window.UI.mobs.all().get(id).mesh.userData.kelp.visible, mob, { timeout: 3000 });
  await test_('mobHit', { mob, amount: TW.tune.KELP, source: ['fire'] });
  await page.waitForFunction(id => !window.UI.mobs.all().get(id).mesh.userData.kelp.visible, mob, { timeout: 3000 });
  assert.deepEqual(errors, []);
});
