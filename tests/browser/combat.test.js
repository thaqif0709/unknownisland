// Fighting in the browser (P6, flag combat): R swings the sword in your hand at what you aim
// at, holding R throws a torch, a double-tap of Shift rolls, being down shows how long you have, and holding E beside
// a friend who's down picks them up. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const { WG, landNear } = require('../helpers/world');

let server, browser, page, bot;
const errors = [];
const NAME = 'fight' + Date.now().toString(36).slice(-6);
const send = m => page.evaluate(m => window.__dbg.send(m), m);
let tid = 9300;
const test_ = (what, args = {}) => send({ t: 'test', do: what, id: tid++, ...args });

before(async () => {
  server = await startServer({ env: { FEATURES: 'combat' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 640, height: 480 } });
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

test('R swings the sword in your hand at the dummy you aim at', async () => {
  await test_('give', { inv: { sword_wood: 1 } });
  await page.waitForFunction(() => (window.__dbg.stats.slots || []).some(s => s && s.k === 'sword_wood'), null, { timeout: 10000 });
  const slot = await page.evaluate(() => window.__dbg.stats.slots.findIndex(s => s && s.k === 'sword_wood'));
  await page.keyboard.press(`Digit${slot + 1}`);
  const p = await page.evaluate(() => window.__dbg.pos());
  const at = { x: p.x + 1.5, z: p.z };
  await test_('spawn', { kind: 'dummy', x: at.x, z: at.z });
  await page.evaluate(({ x, z }) => window.__dbg.lookAt(x, z), at);
  await page.waitForTimeout(400);
  const hit = bot.next(m => m.t === 'mobhit', { timeout: 10000 });
  await page.keyboard.press('KeyR');
  assert.ok((await hit).dmg >= 6, 'hit with the sword');
});

test('holding R with a torch in hand throws it, and it bursts into fire', async () => {
  await test_('give', { inv: { torch: 2 } });
  await page.waitForFunction(() => (window.__dbg.stats.slots || []).some(s => s && s.k === 'torch'), null, { timeout: 10000 });
  const slot = await page.evaluate(() => window.__dbg.stats.slots.findIndex(s => s && s.k === 'torch'));
  await page.keyboard.press(`Digit${slot + 1}`);
  await page.waitForTimeout(300);
  const burst = bot.next(m => m.t === 'burst', { timeout: 10000 });
  await page.keyboard.down('KeyR');
  await page.waitForTimeout(WG.RULES.COMBAT.HEAVY.HOLD * 1000 + 250);
  await page.keyboard.up('KeyR');
  await burst;
  await page.waitForFunction(() => window.__dbg.combat().bursts > 0, null, { timeout: 3000 });
  await page.waitForFunction(() => window.__dbg.stats.inv.torch === 1, null, { timeout: 5000 });
});

test('a double-tap of Shift rolls you a few metres', async () => {
  // inland, on solid ground all round (from the beach, a roll back could be into deep water, which it won't go)
  const spot = landNear({ x: WG.SPAWN.x + 30, z: WG.SPAWN.z - 30 });
  await test_('place', spot);
  await page.waitForFunction(s => { const q = window.__dbg.pos(); return Math.hypot(q.x - s.x, q.z - s.z) < .5; }, spot, { timeout: 10000 });
  await page.waitForTimeout(300);
  const p0 = await page.evaluate(() => window.__dbg.pos());
  // both taps from inside the page: a slow headless page can take longer than the double-tap window between two key presses
  await page.evaluate(() => { for (const type of ['keydown', 'keyup', 'keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code: 'ShiftLeft', key: 'Shift' })); });
  await page.waitForFunction(p => { const q = window.__dbg.pos(); return Math.hypot(q.x - p.x, q.z - p.z) > 1.5; }, p0, { timeout: 5000 });
});

test('down: the countdown shows; a friend down nearby: hold E to pick them up', async () => {
  await test_('down', { ms: 2500 });
  await page.waitForSelector('.downtag:not(.hidden)', { timeout: 5000 });
  assert.match(await page.textContent('.downtag'), /You're down/);
  await page.waitForSelector('.downtag.hidden', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(500);
  const p = await page.evaluate(() => window.__dbg.pos());
  await bot.test('place', { x: p.x + 1, z: p.z });
  await bot.test('down', { ms: 20000 });
  await page.waitForSelector('.revivetag:not(.hidden)', { timeout: 10000 });
  const up = bot.next(m => m.t === 'revived' && m.id === bot.id, { timeout: 10000 });
  await page.keyboard.down('KeyE');
  await up;
  await page.keyboard.up('KeyE');
  assert.deepEqual(errors, []);
});
