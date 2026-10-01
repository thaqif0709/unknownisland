// The Stairs in the browser (C3, flag region-stair): their own things are drawn (not as
// rocks), E says what it does to them, the new items have icons, and the Leaning has its own
// model. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page;
const errors = [];

before(async () => {
  server = await startServer({ env: { FEATURES: 'streaming,bigworld,caves,slots,region-stair' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'stairs' + Date.now().toString(36).slice(-6));
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

test('the Stairs’ things arrive and are drawn as themselves', async () => {
  await send({ do: 'open', region: 'stair' });
  await send({ do: 'place', x: 0, z: -900 });
  await page.waitForFunction(() => [...window.__dbg.chunkObjs().values()].some(o => o.type === 'herb' && o.mesh), null, { timeout: 90000 });
  const kinds = await page.evaluate(() => {
    const seen = {};
    for (const o of window.__dbg.chunkObjs().values()) if (o.mesh && window.UI.things[o.type]) seen[o.type] = !!o.parts;
    return seen;
  });
  for (const t of ['flint', 'herb', 'flax', 'standing']) assert.equal(kinds[t], true, `${t} has its own model`);
});

test('E says what it does to them, and gathering one gives its item (with an icon)', async () => {
  const herb = await page.evaluate(() => {
    const p = window.__dbg.pos();
    return [...window.__dbg.chunkObjs().values()].filter(o => o.type === 'herb' && !o.state.picked)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).map(o => ({ id: o.id, x: o.x, z: o.z, r: o.r }))[0];
  });
  await send({ do: 'place', x: herb.x + herb.r + .5, z: herb.z });
  await page.waitForFunction(() => /Pick healing herbs/.test(document.getElementById('prompt').textContent), null, { timeout: 15000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window.__dbg.stats.inv.herbs || 0) > 0, null, { timeout: 10000 });
  await page.waitForFunction(() => { const i = document.querySelector('#invList .slot img[alt="Healing herbs"]'); return i && i.src.startsWith('data:image/png'); }, null, { timeout: 5000 });
  // picked: it shows as cut back, and E says so (over that herb)
  await page.waitForFunction(id => { const o = window.__dbg.chunkObjs().get(id); return o.state.picked && o.parts.stub.visible && !o.parts.full.visible; }, herb.id, { timeout: 10000 });
  assert.match(await page.evaluate(id => window.UI.things.herb.label(window.__dbg.chunkObjs().get(id)), herb.id), /picked/);
});

test('the Leaning has its own model', async () => {
  const p = await page.evaluate(() => window.__dbg.pos());
  await send({ do: 'time', at: .9 });
  await send({ do: 'spawn', kind: 'leaning', x: p.x + 3, z: p.z + 3 });
  await page.waitForFunction(() => [...window.UI.mobs.all().values()].some(m => m.kind === 'leaning' && m.mesh.userData.strips), null, { timeout: 10000 });
  assert.deepEqual(errors, []);
});
