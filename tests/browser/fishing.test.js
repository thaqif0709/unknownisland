// Fishing in the browser (P7, flag fishing): with a rod in hand on the shore, holding E casts
// (a friend sees the line), a bite shows, E hooks it into a minigame, and once it's decided
// the line comes in. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const { WG, shoreSpot } = require('../helpers/world');

let server, browser, page, bot;
const errors = [];
const NAME = 'fish' + Date.now().toString(36).slice(-6);
const send = m => page.evaluate(m => window.__dbg.send(m), m);
let tid = 9600;
const test_ = (what, args = {}) => send({ t: 'test', do: what, id: tid++, ...args });

before(async () => {
  server = await startServer({ env: { FEATURES: 'fishing' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  bot = await server.join('watcher');
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

test('hold E with a rod to cast; a bite, E, a game; then the line comes in', async () => {
  const at = shoreSpot(0);
  await test_('place', { x: at.x, z: at.z });
  await page.waitForFunction(s => { const q = window.__dbg.pos(); return Math.hypot(q.x - s.x, q.z - s.z) < .5; }, at, { timeout: 10000 });
  await test_('give', { inv: { rod: 1 } });
  await page.waitForFunction(() => (window.__dbg.stats.slots || []).some(s => s && s.k === 'rod'), null, { timeout: 10000 });
  const slot = await page.evaluate(() => window.__dbg.stats.slots.findIndex(s => s && s.k === 'rod'));
  await page.keyboard.press(`Digit${slot + 1}`);
  await page.evaluate(({ x, z }) => window.__dbg.lookAt(x, z), { x: at.x + Math.sin(at.face) * 8, z: at.z + Math.cos(at.face) * 8 });
  await page.waitForTimeout(300);
  // hold E, let go: the cast (a friend sees the line go out)
  const seen = bot.next(m => m.t === 'fishing' && m.s === 'wait', { timeout: 10000 });
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(WG.RULES.FISHING.CAST.CHARGE * 500);
  await page.keyboard.up('KeyE');
  const out = await seen;
  assert.ok(Math.hypot(out.x - at.x, out.z - at.z) > WG.RULES.FISHING.CAST.MIN - .1, 'out in the water');
  await page.waitForFunction(() => window.__dbg.fishing().lines.length === 1, null, { timeout: 5000 });
  // a bite, and E hooks it into a game
  await test_('bite', { fish: 'silverfin', game: 'trivia' });
  await page.waitForFunction(() => window.__dbg.fishing().biting, null, { timeout: 5000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => { const el = document.getElementById('minigame'); return !el.classList.contains('gone') && el.dataset.type === 'trivia'; }, null, { timeout: 5000 });
  await page.locator('#mgBody .mgbtn').first().click();
  await page.waitForFunction(() => /won|lost/.test(document.getElementById('mgRes').className), null, { timeout: 10000 });
  // landed or snapped, the line comes back in
  await page.waitForFunction(() => window.__dbg.fishing().lines.length === 0, null, { timeout: 5000 });
  assert.deepEqual(errors, []);
});
