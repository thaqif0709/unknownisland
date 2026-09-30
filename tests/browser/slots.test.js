// The bag in the browser (P2, flag slots): I opens it, a stack drags from the hotbar into the
// bag, tap-then-tap moves one too, and holding E with food in hand eats it.
// Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page;
const errors = [];
const NAME = 'bag' + Date.now().toString(36).slice(-6);

before(async () => {
  server = await startServer({ env: { FEATURES: 'slots' } });
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
  await page.evaluate(() => window.__dbg.send({ t: 'test', do: 'give', id: 9001, inv: { wood: 12, berries: 3 } }));
  await page.waitForFunction(() => window.__dbg.stats.inv.berries === 3, null, { timeout: 10000 });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.stop();
});

const slotOf = key => page.evaluate(k => window.__dbg.stats.slots.findIndex(s => s && s.k === k), key);
async function center(sel) { const b = await page.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; }

test('I opens the bag, and a stack drags from the hotbar into the bag', async () => {
  await page.keyboard.press('KeyI');
  await page.waitForSelector('#inventory:not(.gone)');
  assert.equal(await page.locator('#bagGrid .slot').count(), 30);
  assert.equal(await page.locator('#bagBar .slot').count(), 8);
  assert.equal(await page.getAttribute('#btnBag', 'hidden'), null, 'phones get a Bag button');
  assert.equal(await slotOf('wood'), 0, 'new things fill the hotbar first');
  const [x1, y1] = await center('#bagBar [data-bag="0"]'), [x2, y2] = await center('#bagGrid [data-bag="20"]');
  await page.mouse.move(x1, y1); await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => { const s = window.__dbg.stats.slots[20]; return s && s.k === 'wood' && s.n === 12 && !window.__dbg.stats.slots[0]; }, null, { timeout: 5000 });
  assert.ok(await page.locator('#inventory:not(.gone)').count(), 'the bag stays open after a drag');
});

test('tap a stack, then tap where it goes', async () => {
  await page.click('#bagGrid [data-bag="20"]');
  await page.waitForSelector('#bagActs.on');
  await page.click('#bagBar [data-bag="2"]');
  await page.waitForFunction(() => { const s = window.__dbg.stats.slots[2]; return s && s.k === 'wood'; }, null, { timeout: 5000 });
  await page.keyboard.press('KeyI');
  await page.waitForSelector('#inventory.gone', { state: 'attached' });
  assert.equal(await page.locator('#invList [data-slot="2"] b').textContent(), '12', 'the hotbar shows the stack');
});

test('hold E with berries in hand to eat one', async () => {
  await page.keyboard.press(`Digit${(await slotOf('berries')) + 1}`);
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__dbg.stats.inv.berries === 2, null, { timeout: 10000 });
  await page.keyboard.up('KeyE');
  assert.deepEqual(errors, []);
});
