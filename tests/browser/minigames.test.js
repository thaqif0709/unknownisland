// Minigames in the browser (P8): each opens above the hotbar and draws; trivia and read the
// water can be played to a result; Esc gives up. Games are started with the admin
// /minigame command. Needs Chromium like smoke.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

const NAME = 'mgweb' + Date.now().toString(36).slice(-6);
let server, browser, page;
const errors = [];

before(async () => {
  server = await startServer({ env: { ADMINS: NAME } });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
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
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.stop();
});

async function start(type, difficulty = 'easy') {
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/minigame ${type} ${difficulty}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(t => { const el = document.getElementById('minigame'); return !el.classList.contains('gone') && el.dataset.type === t; }, type, { timeout: 15000 });
}
const result = () => page.waitForFunction(() => /won|lost/.test(document.getElementById('mgRes').className), null, { timeout: 20000 }).then(() => page.textContent('#mgRes'));
const closed = () => page.waitForFunction(() => document.getElementById('minigame').classList.contains('gone'), null, { timeout: 5000 });

test('trivia: pick an answer and hear how it went', async () => {
  await start('trivia');
  const n = await page.locator('#mgBody .mgbtn').count();
  assert.equal(n, 3, 'easy trivia has three answers');
  await page.locator('#mgBody .mgbtn').first().click();
  assert.match(await result(), /Got it!|Not quite\./);
  await closed();
});

test('read the water: mark three places, then Done', async () => {
  await start('water');
  const box = await page.locator('#mgBody canvas.tap').boundingBox();
  for (const [x, y] of [[.2, .2], [.5, .5], [.8, .8]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  assert.equal(await page.textContent('#mgWaterDone'), 'Done (3 of 3)');
  await page.click('#mgWaterDone');
  assert.match(await result(), /Got it!|Not quite\./);
  await closed();
});

for (const [type, sel] of [['untangle', '.mgtile'], ['ripple', '.mgmark'], ['pull', '.mgpull canvas']]) {
  test(`${type}: it draws, and Esc gives up`, async () => {
    await start(type, 'medium');
    assert.ok(await page.locator(`#mgBody ${sel}`).count() > 0);
    if (type === 'untangle') {   // turning a piece redraws it
      const before = await page.evaluate(() => document.querySelector('.mgtile canvas').toDataURL());
      await page.locator('#mgBody .mgtile').first().click();
      await page.waitForTimeout(100);
      assert.notEqual(await page.evaluate(() => document.querySelector('.mgtile canvas').toDataURL()), before);
    }
    await page.keyboard.press('Escape');
    await closed();
  });
}

test('no errors along the way', () => { assert.deepEqual(errors, []); });
