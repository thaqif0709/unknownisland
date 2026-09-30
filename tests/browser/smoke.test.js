// Browser smoke tests: the game loads without errors, you can sign up, skip the intro,
// jump and sit. Needs Playwright's Chromium (`npx playwright install chromium`), or set
// CHROMIUM_PATH to a Chromium or Chrome that's already installed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer, INVITE } = require('../helpers/server');

let server, browser, page, bot;
const errors = [];

before(async () => {
  server = await startServer();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  // script errors count; a font or icon that fails to download doesn't
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  bot = await server.join('bot');   // another player, to see what the browser sends
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.stop();
});

const name = 'web' + Date.now().toString(36).slice(-6);

test('the page loads without errors', async () => {
  await page.goto(server.base + '/?debug', { waitUntil: 'load' });
  await page.waitForSelector('#fAuth');
  assert.deepEqual(errors, []);
});

test('signing up and skipping the intro reaches the island', async () => {
  const seen = bot.next(m => m.t === 'join' && m.player.name === name, { timeout: 240000 });
  await page.click('#tabSignup');
  await page.fill('#inName', name);
  await page.fill('#inPass', 'password123');
  await page.fill('#inInvite', INVITE);
  await page.click('#fAuth button[type=submit]');
  await page.waitForSelector('#vReady.on', { timeout: 15000 });
  await page.click('#goIsland');
  await page.click('#cutSkip', { timeout: 90000 });
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 90000 });
  await seen;
  const state = await page.evaluate(() => window.__dbg.why().state);
  assert.equal(state, 'play');
  assert.deepEqual(errors, []);
});

test('jumping: the other players see the hop', async () => {
  const seen = bot.next(m => m.t === 'jump', { timeout: 10000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');
  await seen;
  assert.deepEqual(errors, []);
});

test('sitting down and getting up', async () => {
  await page.waitForFunction(() => !window.__dbg.hop().air, null, { timeout: 10000 });   // landed
  const sat = bot.next(m => m.t === 'sit' && m.on === true, { timeout: 10000 });
  await page.keyboard.press('KeyV');
  await sat;
  assert.equal(await page.evaluate(() => window.__dbg.hero().sitting), true);
  const stood = bot.next(m => m.t === 'sit' && m.on === false, { timeout: 10000 });
  await page.keyboard.press('KeyV');
  await stood;
  assert.equal(await page.evaluate(() => window.__dbg.hero().sitting), false);
  assert.deepEqual(errors, []);
});
