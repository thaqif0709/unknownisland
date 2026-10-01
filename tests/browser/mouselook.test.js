// Mouse-look (P1, flag mouselook): pointer lock, crosshair, panels freeing the mouse,
// the wheel and the ink cursor. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page;
const errors = [];

before(async () => {
  server = await startServer({ env: { FEATURES: 'mouselook' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'look' + Date.now().toString(36).slice(-6));
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

const locked = () => page.evaluate(() => !!document.pointerLockElement);
const shown = sel => page.evaluate(s => !document.querySelector(s).classList.contains('hidden'), sel);

test('on the island: the ink cursor and a pill asking for a click, but no crosshair', async () => {
  await page.waitForFunction(() => !document.getElementById('lockPill').classList.contains('hidden'), null, { timeout: 10000 });
  assert.equal(await page.textContent('#lockPill'), 'Click to look around');
  assert.ok(!(await shown('#xhair')), 'the crosshair stays hidden until something you can hit is aimed at');
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('inkcursor')));
});

test('clicking the island locks the pointer, and the mouse turns the camera', async () => {
  await page.mouse.click(640, 300);
  await page.waitForFunction(() => !!document.pointerLockElement, null, { timeout: 5000 });
  assert.ok(!(await shown('#lockPill')), 'the pill goes away');
  const cam = () => page.evaluate(() => { const c = window.__dbg.camera.position, p = window.__dbg.pos(); return Math.atan2(c.x - p.x, c.z - p.z); });
  const before = await cam();
  await page.mouse.move(640 + 200, 300, { steps: 5 });
  await page.waitForTimeout(600);
  const after = await cam();
  assert.ok(Math.abs(after - before) > .1, `the camera turned (${before.toFixed(2)} -> ${after.toFixed(2)})`);
});

test('a panel frees the pointer; closing it locks again, or asks for a click', async () => {
  await page.keyboard.press('KeyB');
  await page.waitForFunction(() => !document.pointerLockElement, null, { timeout: 5000 });
  assert.ok(!(await shown('#xhair')), 'no crosshair over a panel');
  assert.ok(await page.evaluate(() => window.UI.panels.isOpen('book')));
  await page.keyboard.press('Escape');
  // the browser decides whether it may lock again without a click; either way it ends locked
  await page.waitForFunction(() => document.pointerLockElement || !document.getElementById('lockPill').classList.contains('hidden'), null, { timeout: 5000 });
  if (!(await locked())) {
    assert.equal(await page.textContent('#lockPill'), 'Click to continue');
    await page.mouse.click(640, 300);
  }
  await page.waitForFunction(() => !!document.pointerLockElement, null, { timeout: 5000 });
});

test('UI.panels.open and close work by name', async () => {
  await page.evaluate(() => window.UI.panels.open('journal'));
  assert.ok(await page.evaluate(() => window.UI.panels.isOpen('journal')));
  await page.waitForFunction(() => !document.pointerLockElement, null, { timeout: 5000 });
  await page.evaluate(() => window.UI.panels.close('book'));   // not the open one: nothing happens
  assert.ok(await page.evaluate(() => window.UI.panels.isOpen('journal')));
  await page.evaluate(() => window.UI.panels.close('journal'));
  assert.ok(!(await page.evaluate(() => window.UI.panels.isOpen())));
  if (!(await locked())) await page.mouse.click(640, 300);
  await page.waitForFunction(() => !!document.pointerLockElement, null, { timeout: 5000 });
});

test('the (hidden) crosshair still follows what E would use', async () => {
  const tree = await page.evaluate(() => {
    const p = window.__dbg.pos();
    return window.__dbg.objects().filter(o => o.type === 'tree' && !o.state.gone)
      .map(o => ({ x: o.x, z: o.z, r: o.r, d: Math.hypot(o.x - p.x, o.z - p.z) })).sort((a, b) => a.d - b.d)[0];
  });
  // walk over in short hops (the server only allows so far at a time)
  for (let i = 0; i < 30; i++) {
    const p = await page.evaluate(() => window.__dbg.pos());
    const dx = tree.x + tree.r + .9 - p.x, dz = tree.z - p.z, d = Math.hypot(dx, dz);
    if (d < .3) break;
    const s = Math.min(d, 5);
    await page.evaluate(({ x, z }) => window.__dbg.teleport(x, z), { x: p.x + dx / d * s, z: p.z + dz / d * s });
    await page.waitForTimeout(1100);
  }
  await page.waitForFunction(() => document.getElementById('xhair').classList.contains('use'), null, { timeout: 5000 });
});

test('Esc with a panel open only closes it (even when the mouse is let go at the same time)', async () => {
  if (await locked()) { await page.keyboard.press('KeyB'); await page.waitForFunction(() => !document.pointerLockElement, null, { timeout: 5000 }); }
  else await page.keyboard.press('KeyB');
  await page.waitForFunction(() => window.UI.panels.isOpen('book'), null, { timeout: 5000 });
  // Esc, and the browser letting the mouse go on the same key press (an unlock we didn't ask for)
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    Object.defineProperty(document, 'pointerLockElement', { get: () => null, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { delete document.pointerLockElement; });   // the browser's own again
  assert.ok(!(await page.evaluate(() => window.UI.panels.isOpen())), 'no panel open: the book closed, settings did not open');
  // with nothing open, Esc opens settings
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.UI.panels.isOpen('settings'), null, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.UI.panels.isOpen(), null, { timeout: 5000 });
  if (!(await locked())) await page.mouse.click(640, 300);
});

test('the wheel steps through the hotbar; Ctrl+wheel zooms', async () => {
  const dist = () => page.evaluate(() => { const c = window.__dbg.camera.position, p = window.__dbg.pos(); return Math.hypot(c.x - p.x, c.z - p.z); });
  // Headless rendering is slow, so each action is retried a few times until it shows.
  const until = async (done, action) => {
    for (let i = 0; i < 4 && !(await page.evaluate(done)); i++) { await action(); await page.waitForTimeout(1500); }
    assert.ok(await page.evaluate(done));
  };
  // chop the tree for wood, so there is something to hold
  await until(() => (window.__dbg.stats.inv.wood || 0) > 0, () => page.keyboard.press('KeyE'));
  const selected = () => page.evaluate(() => [...document.querySelectorAll('#invList .slot')].findIndex(s => s.classList.contains('sel')));
  assert.equal(await selected(), -1);
  await until(() => !!document.querySelector('#invList .slot.sel'), () => page.mouse.wheel(0, 120));
  assert.ok((await selected()) >= 0, 'an item is in hand');
  const d0 = await dist();
  await page.keyboard.down('Control');
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(500);
  assert.ok((await dist()) > d0 + 1, 'zoomed out');
  assert.deepEqual(errors, []);
});
