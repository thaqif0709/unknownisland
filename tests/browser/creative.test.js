// Creative mode in the browser (admins, for testing): /creative, double-tap Space to fly,
// Space rises, W flies fast where the camera looks, Shift sinks you back down to land.
// Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

const NAME = 'cre' + Date.now().toString(36).slice(-6);
let server, browser, page;
const errors = [];

before(async () => {
  server = await startServer({ env: { ADMINS: NAME } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 480, height: 360 } });
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

const cr = () => page.evaluate(() => window.__dbg.creative());
const pos = () => page.evaluate(() => window.__dbg.pos());

// how far W takes you in `ms` (headless pages draw slowly, so compare walking with flying the same way)
async function run(ms) {
  const p0 = await pos();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(ms); await page.keyboard.up('KeyW');
  const p1 = await pos();
  return Math.hypot(p1.x - p0.x, p1.z - p0.z);
}

test('/creative, then double-tap Space to fly: up, fast across, and back down to land', async () => {
  const walked = await run(2000);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/creative');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dbg.creative().creative, null, { timeout: 10000 });
  await page.waitForSelector('.creativetag:not(.hidden)');
  await page.keyboard.press('Space'); await page.waitForTimeout(80); await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__dbg.creative().flying, null, { timeout: 5000 });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__dbg.creative().y > 8, null, { timeout: 20000 });
  await page.keyboard.up('Space');
  const flown = await run(2000);
  assert.ok(flown > walked * 3, `much faster than walking: ${flown.toFixed(1)} m against ${walked.toFixed(1)} m`);
  // down again (and keep flying over water until there's land under you)
  await page.keyboard.down('ShiftLeft');
  await page.waitForFunction(() => !window.__dbg.creative().flying || window.__dbg.creative().y < .5, null, { timeout: 30000 });
  await page.keyboard.up('ShiftLeft');
  assert.deepEqual(errors, []);
});
