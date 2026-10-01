// Tools in the browser (P3, flag tools): a tool sits in the hotbar with a wear bar instead of
// a count, and the bar turns red when it's nearly worn out. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page;
const errors = [];
const NAME = 'tool' + Date.now().toString(36).slice(-6);

before(async () => {
  server = await startServer({ env: { FEATURES: 'tools' } });
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

test('a tool shows its wear in the hotbar, red when nearly worn out', async () => {
  await page.evaluate(() => window.__dbg.send({ t: 'test', do: 'give', id: 9101, tools: ['pickaxe'] }));
  await page.waitForFunction(() => (window.__dbg.stats.slots || []).some(s => s && s.k === 'pickaxe' && s.d), null, { timeout: 10000 });
  const at = await page.evaluate(() => window.__dbg.stats.slots.findIndex(s => s && s.k === 'pickaxe'));
  assert.ok(at >= 0 && at < 8, 'in the hotbar');
  const slot = `#invList [data-slot="${at}"]`;
  await page.waitForSelector(`${slot} u`);
  assert.equal(await page.locator(`${slot} b`).count(), 0, 'no count, a wear bar');
  assert.match(await page.getAttribute(slot, 'title'), /60 of 60 uses left/);
  await page.evaluate(s => window.__dbg.send({ t: 'test', do: 'wear', id: 9102, slot: s, d: 5 }), at);
  await page.waitForSelector(`${slot} u.low`, { timeout: 10000 });
  assert.match(await page.getAttribute(slot, 'title'), /5 of 60 uses left/);
  assert.deepEqual(errors, []);
});
