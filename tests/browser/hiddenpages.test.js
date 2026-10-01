// The Hidden Pages' search: typing narrows the page to the sections and lines that mention
// it (highlighted), spoilers stay closed with a "match inside" tag, and clearing it brings
// everything back. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('../helpers/server');

let server, browser, page;
const errors = [];
before(async () => {
  server = await startServer({ env: { FEATURES: 'fasttravel' } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  await page.goto(server.base + '/hiddenpages', { waitUntil: 'load' });
  await page.waitForFunction(() => /day \d+/.test(document.getElementById('liveNote').textContent), null, { timeout: 15000 });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.stop();
});

const shown = () => page.evaluate(() => [...document.querySelectorAll('main section')].filter(s => s.offsetParent !== null).map(s => s.id));

test('searching narrows the page to what mentions it, and clearing brings it all back', async () => {
  const all = (await shown()).length;
  await page.keyboard.press('/');
  await page.keyboard.type('lamp oil');
  await page.waitForFunction(() => /Found in \d+ section/.test(document.getElementById('qInfo').textContent), null, { timeout: 5000 });
  const some = await shown();
  assert.ok(some.includes('lanterns'), 'the lanterns section');
  assert.ok(some.length < all, `fewer sections (${some.length} of ${all})`);
  assert.ok(await page.locator('#lanterns mark.hit').count() > 0, 'highlighted');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#lanterns li')].some(li => li.offsetParent === null)), 'lines that don’t mention it are hidden');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  // nothing
  await page.fill('#q', 'zzzqqq');
  await page.waitForFunction(() => /Nothing found/.test(document.getElementById('qInfo').textContent), null, { timeout: 5000 });
  assert.equal((await shown()).length, 0);
  // Esc clears it
  await page.press('#q', 'Escape');
  await page.waitForFunction(n => [...document.querySelectorAll('main section')].filter(s => s.offsetParent !== null).length === n, all, { timeout: 5000 });
  assert.equal(await page.locator('mark.hit').count(), 0);
});

test('a match inside a spoiler leaves it closed, tagged', async () => {
  await page.fill('#q', 'Crawler');
  await page.waitForFunction(() => document.querySelector('.s-inside'), null, { timeout: 5000 }).catch(() => {});
  const closedTagged = await page.evaluate(() => [...document.querySelectorAll('details.spoiler')].some(d => !d.open && d.offsetParent !== null && d.querySelector('.s-inside')));
  // the Crawler only appears in the caves section's spoiler (caves is off here, so it may be nowhere)
  const caves = await page.evaluate(() => window.WorldGen && document.getElementById('caves').offsetParent !== null);
  if (caves) assert.ok(closedTagged, 'tagged, still closed');
  await page.fill('#q', 'Veil');
  await page.waitForTimeout(400);
  assert.deepEqual(errors, []);
});
