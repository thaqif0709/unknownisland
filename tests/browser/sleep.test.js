// Sleeping by a hearth in the browser (P4, flag checkpoints): by a lit clay hearth a tap of V
// only sits you down; holding V sleeps (and the hearth remembers you); a tap stands you up.
// Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page;
const errors = [];

before(async () => {
  server = await startServer({ env: { FEATURES: 'checkpoints,slots' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'nap' + Date.now().toString(36).slice(-6));
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

const hero = () => page.evaluate(() => ({ sitting: window.__dbg.hero().sitting, sleeping: !!window.__dbg.hero().sleeping }));

test('by a lit hearth: tap V sits, hold V sleeps, tap V stands up', async () => {
  await page.evaluate(() => window.__dbg.send({ t: 'test', do: 'give', id: 1, inv: { wood: 10, stone: 10, clay: 10 } }));
  await page.waitForFunction(() => (window.__dbg.stats.inv.clay || 0) >= 10, null, { timeout: 10000 });
  const p = await page.evaluate(() => window.__dbg.pos());
  await page.evaluate(p => window.__dbg.send({ t: 'build', recipe: 'hearth', x: p.x + 1.6, z: p.z }), p);
  await page.waitForTimeout(2500);
  // a tap: sitting, not asleep, and told how
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => window.__dbg.hero().sitting, null, { timeout: 5000 });
  await page.waitForFunction(() => /Hold V to sleep/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  assert.equal((await hero()).sleeping, false, 'a tap only sits');
  // stand, then hold: sits and falls asleep, and the hearth remembers you
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => !window.__dbg.hero().sitting, null, { timeout: 5000 });
  await page.keyboard.down('KeyV');
  await page.waitForFunction(() => window.__dbg.hero().sleeping, null, { timeout: 15000 });
  await page.keyboard.up('KeyV');
  await page.waitForFunction(() => /remember you/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  // a tap wakes you and stands you up
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => !window.__dbg.hero().sitting && !window.__dbg.hero().sleeping, null, { timeout: 5000 });
  assert.deepEqual(errors, []);
});
