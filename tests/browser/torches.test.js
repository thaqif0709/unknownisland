// Torches above ground in the browser (flag torchlight): a torch in hand at night lights the
// ground; G plants it, E on it takes it back. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page;
const errors = [];
const SHOT = process.env.SHOT;   // a folder: screenshots for a look by hand
before(async () => {
  server = await startServer({ env: { FEATURES: 'torchlight,slots' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'torch' + Date.now().toString(36).slice(-6));
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
const send = m => page.evaluate(m => window.__dbg.send({ t: 'test', id: Math.floor(Math.random() * 1e6), ...m }), m);
const shot = async name => { if (SHOT) { await page.waitForTimeout(2500); await page.screenshot({ path: `${SHOT}/${name}.png` }); } };

test('a torch at night lights the way; G plants it; E takes it back', async () => {
  await send({ do: 'time', at: .9 });
  await send({ do: 'give', inv: { torch: 2 } });
  await page.waitForFunction(() => (window.__dbg.stats.inv.torch || 0) >= 2, null, { timeout: 10000 });
  const at = await page.evaluate(() => window.__dbg.stats.slots.findIndex(s => s && s.k === 'torch'));
  await page.keyboard.press(`Digit${at + 1}`);
  await page.waitForFunction(() => window.UI && document.getElementById('toast').textContent.includes('plants it'), null, { timeout: 5000 });
  await shot('t1-in-hand');
  // plant it
  const before = await page.evaluate(() => window.__dbg.stats.inv.torch);
  for (let i = 0; i < 4 && !(await page.evaluate(() => window.UI.torches.planted().length)); i++) { await page.keyboard.press('KeyG'); await page.waitForTimeout(1500); }
  assert.equal(await page.evaluate(() => window.UI.torches.planted().length), 1, 'planted');
  assert.equal(await page.evaluate(() => window.__dbg.stats.inv.torch), before - 1);
  await shot('t2-planted');
  // step back to look at it, then take it back with E
  const tp = await page.evaluate(() => { const t = window.UI.torches.planted()[0]; return { x: t.x, z: t.z }; });
  await page.evaluate(p => window.__dbg.teleport(p.x + 3, p.z + 3), tp);
  await shot('t3-planted-away');
  await page.evaluate(p => window.__dbg.teleport(p.x + 1, p.z), tp);
  await page.waitForFunction(() => /Take the torch/.test(document.getElementById('prompt').textContent), null, { timeout: 10000 });
  for (let i = 0; i < 4 && (await page.evaluate(() => window.UI.torches.planted().length)); i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(1500); }
  assert.equal(await page.evaluate(() => window.UI.torches.planted().length), 0, 'taken back');
  assert.deepEqual(errors, []);
});
