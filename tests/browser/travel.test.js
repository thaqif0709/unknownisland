// Climbing and gliding in the browser (P9, flag travel): walk into a climbable palm to grab
// it, W climbs, Space lets go, holding Space glides; a friend sees each pose.
// Needs Chromium like smoke.test.js. Headless rendering is slow, so the waits are long.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page, bot;
const errors = [];
const NAME = 'climb' + Date.now().toString(36).slice(-6);

before(async () => {
  server = await startServer({ env: { FEATURES: 'travel' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  // small and on Low graphics: climbing and gliding need real frames per second, and the
  // server spends energy by the clock, so a slow headless page would run out halfway up
  page = await browser.newPage({ viewport: { width: 480, height: 360 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  bot = await server.join('see');
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

const travel = () => page.evaluate(() => window.__dbg.travel());
const myRow = () => bot.snap && bot.snap.p.find(r => r[0] !== bot.id);   // the only other player: the browser

test('walk into a tall palm, climb it, and a friend sees it', async () => {
  // the nearest climbable palm, and a spot just beside it
  const palm = await page.evaluate(() => {
    const p = window.__dbg.pos();
    return window.__dbg.objects().filter(o => o.climb && !o.state.gone && o.state.planted == null)
      .map(o => ({ x: o.x, z: o.z, r: o.r, d: Math.hypot(o.x - p.x, o.z - p.z) })).sort((a, b) => a.d - b.d)[0];
  });
  assert.ok(palm, 'a climbable palm');
  const spot = { x: palm.x + palm.r + 1.2, z: palm.z };
  for (let i = 0; i < 40; i++) {   // hop over in short steps (the server only allows so far at a time)
    const p = await page.evaluate(() => window.__dbg.pos());
    const dx = spot.x - p.x, dz = spot.z - p.z, d = Math.hypot(dx, dz);
    if (d < .3) break;
    const s = Math.min(d, 5);
    await page.evaluate(({ x, z }) => window.__dbg.teleport(x, z), { x: p.x + dx / d * s, z: p.z + dz / d * s });
    await page.waitForTimeout(1100);
  }
  await page.evaluate(({ x, z }) => window.__dbg.lookAt(x, z), palm);   // camera behind us, facing the palm
  await page.waitForTimeout(500);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__dbg.travel().climb === 'trunk', null, { timeout: 30000 });
  await page.waitForFunction(() => window.__dbg.travel().y > 3, null, { timeout: 60000 });
  await page.keyboard.up('KeyW');
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (fn()) return true; return false; };
  assert.ok(await until(() => { const r = myRow(); return r && r[8] === 1 && r[6] > 1; }, 8000), 'the friend sees us climbing, up the trunk');
});

test('let go with Space and hold it to glide', async () => {
  await page.keyboard.down('Space');   // lets go, and held: the cloak opens once we're falling
  await page.waitForFunction(() => window.__dbg.travel().glide, null, { timeout: 30000 });
  const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (fn()) return true; return false; };
  assert.ok(await until(() => { const r = myRow(); return r && r[8] === 2; }, 8000), 'the friend sees us gliding');
  await page.keyboard.up('Space');
  await page.waitForFunction(() => { const t = window.__dbg.travel(); return !t.glide && !t.climb && t.y < .05; }, null, { timeout: 60000 });
  assert.deepEqual(errors, []);
});
