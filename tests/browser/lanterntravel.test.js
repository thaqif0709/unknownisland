// Travelling by lantern light in the browser (W10, flag fasttravel): light two lanterns,
// then E at one opens the panel, which lists the other (distance, way, oil), and picking it
// takes you there. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page;
const errors = [];

before(async () => {
  server = await startServer({ env: { FEATURES: 'fasttravel,slots' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.click('#tabSignup');
  await page.fill('#inName', 'lamp' + Date.now().toString(36).slice(-6));
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
// two small lanterns, away from the driftwood board (E would pick the board): [a, b]
const pair = () => page.evaluate(() => {
  const board = window.__dbg.board(), far = l => !board || Math.hypot(l.x - board.x, l.z - board.z) > 6;
  const small = [...window.__dbg.lanterns().values()].filter(l => !l.big && far(l)).sort((a, b) => a.id - b.id);
  return small.slice(0, 2).map(l => ({ id: l.id, x: l.x, z: l.z }));
});
async function lightAt(l) {
  await send({ do: 'place', x: l.x + 1.6, z: l.z });
  await send({ do: 'give', inv: { oil: 1 } });
  await page.waitForFunction(id => { const t = window.__dbg.target(); return t && t.type === 'lantern' && t.id === id; }, l.id, { timeout: 10000 });
  // headless rendering is slow: press again until it takes
  const done = () => page.evaluate(id => window.__dbg.lanterns().get(id).lit && window.UI.lanternTravel.seen().has(id), l.id);
  for (let i = 0; i < 5 && !(await done()); i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(2000); }
  assert.ok(await done(), `lantern ${l.id} lit and remembered`);
}

test('light two lanterns; E at one lists the other, and you travel there for oil', async () => {
  const [a, b] = await pair();
  await lightAt(b);
  await lightAt(a);
  await send({ do: 'give', inv: { oil: 5 } });
  await page.waitForFunction(() => /Travel by lantern light/.test(document.getElementById('prompt').textContent), null, { timeout: 10000 });
  for (let i = 0; i < 5 && !(await page.locator('#lanterntravel:not(.gone)').count()); i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(1500); }
  await page.waitForSelector('#lanterntravel:not(.gone)');
  const label = await page.textContent(`#ltList [data-to="${b.id}"]`);
  assert.match(label, /\d+ m (north|south|east|west|north-east|north-west|south-east|south-west) · \d+ oil/);
  await page.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
  await page.click(`#ltList [data-to="${b.id}"]`);
  await page.waitForFunction(b => { const p = window.__dbg.pos(); return Math.hypot(p.x - b.x, p.z - b.z) < 4; }, b, { timeout: 10000 });
  assert.ok(await page.locator('#lanterntravel.gone').count(), 'the panel closes');
  assert.deepEqual(errors, []);
});
