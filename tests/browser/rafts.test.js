// Rafts and zip lines in the browser (P10, flag rafts): E with a raft in hand sets it on the
// water, E beside it climbs aboard, the walking keys paddle it out (a friend sees it move);
// a zip line strung with E twice is ridden down from its top post. Needs Chromium like
// smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');
const { raftEdge, zipSpot } = require('../helpers/world');

let server, browser, page, bot;
const errors = [];
const NAME = 'raft' + Date.now().toString(36).slice(-6);
const send = m => page.evaluate(m => window.__dbg.send(m), m);
let tid = 9800;
const test_ = (what, args = {}) => send({ t: 'test', do: what, id: tid++, ...args });

before(async () => {
  server = await startServer({ env: { FEATURES: 'rafts' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('unknown-island-prefs', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  bot = await server.join('onshore');
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

// Put me at `at`. (A position the page sent just before can reach the server after the move and
// pull me part of the way back, so it tries again until I stay there.)
// Wait for fn in the page; on a timeout, say which wait and what the page looked like.
async function waitFor(what, fn, arg, timeout = 5000) {
  try { await page.waitForFunction(fn, arg, { timeout }); } catch (e) {
    const st = await page.evaluate(() => ({ pos: window.__dbg.pos(), r: window.__dbg.rafts(), ride: !!window.UI.ride, toast: document.getElementById('toast').textContent,
      tag: [...document.querySelectorAll('.revivetag:not(.hidden)')].map(x => x.textContent).join() }));
    throw new Error(`waiting for ${what}: ${JSON.stringify(st)}`);
  }
}
async function goTo(at) {
  const there = () => page.evaluate(s => { const q = window.__dbg.pos(); return Math.hypot(q.x - s.x, q.z - s.z) < .5; }, at);
  for (let i = 0; i < 5; i++) {
    await test_('place', { x: at.x, z: at.z });
    await page.waitForTimeout(700);
    if (await there()) return;
  }
  assert.fail(`could not get to ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`);
}
async function hold(item) {
  await test_('give', { inv: { [item]: 1 } });
  await page.waitForFunction(k => (window.__dbg.stats.slots || []).some(s => s && s.k === k), item, { timeout: 10000 });
  const slot = await page.evaluate(k => window.__dbg.stats.slots.findIndex(s => s && s.k === k), item);
  // (pressing the slot that's already selected puts it away: then once more takes it out)
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press(`Digit${slot + 1}`);
    await page.waitForTimeout(200);
    if (/in hand/.test(await page.textContent('#toast'))) return;
  }
  assert.fail(`${item} not in hand`);
}

test('set a raft afloat, climb aboard, paddle it out', async () => {
  await test_('set', { hunger: 100, thirst: 100 });   // (so no hungry or thirsty toast hides the ones we look for)
  const at = raftEdge(0);
  await goTo(at);
  await hold('raft');
  const out = { x: at.x + Math.sin(at.face) * 8, z: at.z + Math.cos(at.face) * 8 };
  await page.evaluate(({ x, z }) => window.__dbg.lookAt(x, z), out);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__dbg.rafts().rafts.length === 1, null, { timeout: 5000 });
  const r0 = (await page.evaluate(() => window.__dbg.rafts().rafts[0]));
  await goTo({ x: r0.x - Math.sin(at.face) * 1.5, z: r0.z - Math.cos(at.face) * 1.5 });   // right beside it
  await page.waitForFunction(() => /climb aboard/.test([...document.querySelectorAll('.revivetag:not(.hidden)')].map(e => e.textContent).join()), null, { timeout: 3000 });
  await page.waitForTimeout(300);   // (E's cooldown)
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__dbg.rafts().riding === 'raft', null, { timeout: 5000 });
  // paddle out (W, looking out to sea); the friend on the shore sees it go
  await page.evaluate(({ x, z }) => window.__dbg.lookAt(x, z), out);
  const seen = bot.next(m => m.t === 'rafts' && m.list && m.list.some(r => r.id === r0.id && Math.hypot(r.x - r0.x, r.z - r0.z) > 2), { timeout: 8000 });
  await page.keyboard.down('KeyW');
  await seen;
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);
  const me = await page.evaluate(() => window.__dbg.pos()), r = (await page.evaluate(() => window.__dbg.rafts().rafts[0]));
  assert.ok(Math.hypot(me.x - r.x, me.z - r.z) < 2, 'you go with it');
  assert.deepEqual(errors, []);
});

test('string a zip line with E twice, then ride it down', async () => {
  await test_('set', { hunger: 100, thirst: 100 });
  const s = zipSpot();   // (the test command that puts you there takes you off the raft too)
  await goTo(s.A);
  await hold('zipline');
  await page.keyboard.press('KeyE');
  await waitFor('the first post', () => /One post set/.test(document.getElementById('toast').textContent));
  await goTo(s.B);
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyE');
  await waitFor('the line', () => window.__dbg.rafts().zips.length === 1);
  // back up to the top post, hands empty, and E
  await page.keyboard.press('Digit1'); await page.keyboard.press('Digit1');
  const atTop = () => page.evaluate(a => { const q = window.__dbg.pos(); return Math.hypot(q.x - a.x, q.z - a.z) < .5
    && /ride the zip line/.test([...document.querySelectorAll('.revivetag:not(.hidden)')].map(e => e.textContent).join()); }, s.A);
  for (let i = 0; i < 4; i++) { await goTo(s.A); await page.waitForTimeout(800); if (await atTop()) break; }   // (and still there a moment later)
  assert.ok(await atTop(), 'at the top post, with the prompt to ride');
  await page.keyboard.press('KeyE');
  await waitFor('riding it', () => window.__dbg.rafts().riding === 'zip');
  await waitFor('the bottom', s => { const q = window.__dbg.pos(); return Math.hypot(q.x - s.x, q.z - s.z) < 1; }, s.B, 10000);
  await waitFor('letting go', () => window.__dbg.rafts().riding === null);
  await page.waitForTimeout(1500);
  const end = await page.evaluate(() => window.__dbg.pos());
  assert.ok(Math.hypot(end.x - s.B.x, end.z - s.B.z) < 1.5, 'left at the bottom post');
  assert.deepEqual(errors, []);
});
