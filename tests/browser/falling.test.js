// Falling (with the travel flag, as live): stepping off a cliff edge falls through the air
// from where you were (it used to snap straight down to the ground below), and the camera
// follows you down instead of jumping to the ground. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const WG = require('../../server/shared/world-gen');

let server, browser, page;
const errors = [];
before(async () => {
  server = await startServer({ env: { FEATURES: 'travel' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'fall' + Date.now().toString(36).slice(-6));
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

// the steepest drop on the Landing: from (x, z) the ground falls d metres within a step
function cliff() {
  let best = null;
  for (let x = -140; x <= 140; x++) for (let z = -140; z <= 140; z++) {
    const h = WG.heightAt(x, z); if (h < 1) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const d = h - WG.heightAt(x + dx * 1.2, z + dz * 1.2);
      if (d > 3 && (!best || d > best.d)) best = { x, z, dx, dz, d };
    }
  }
  return best;
}

test('stepping off a cliff falls through the air, and the camera follows you down', async () => {
  const c = cliff();
  assert.ok(c, 'a cliff on the Landing');
  await page.evaluate(c => window.__dbg.teleport(c.x, c.z), c);
  await page.waitForFunction(() => !window.__dbg.hop().air, null, { timeout: 10000 });
  await page.waitForTimeout(800);
  const camBefore = await page.evaluate(() => window.__dbg.camera.position.y);
  // one step out over the edge
  await page.evaluate(c => window.__dbg.teleport(c.x + c.dx * 1.2, c.z + c.dz * 1.2), c);
  const mid = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ air: window.__dbg.hop().air, y: window.__dbg.hop().y })))));
  assert.ok(mid.air && mid.y > 1, `in the air above the ground below, not snapped down (${JSON.stringify(mid)})`);
  const camMid = await page.evaluate(() => window.__dbg.camera.position.y);
  assert.ok(camMid > camBefore - 3, `the camera hasn't dropped to the ground (${camBefore.toFixed(1)} -> ${camMid.toFixed(1)})`);
  await page.waitForFunction(() => !window.__dbg.hop().air, null, { timeout: 10000 });
  assert.ok(await page.evaluate(() => window.__dbg.hop().y) < .05, 'landed');
  assert.deepEqual(errors, []);
});
