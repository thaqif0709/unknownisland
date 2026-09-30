// Minigames (P8): every game is set and checked on the server; wrong, late, early, odd or
// abandoned answers lose, and the answer never goes to the player.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { startServer } = require('../helpers/server');

const ADMIN = 'mgadm' + crypto.randomBytes(3).toString('hex');
let server;
before(async () => { server = await startServer({ env: { ADMINS: ADMIN } }); });
after(async () => { if (server) await server.stop(); });

// Start a game for c; resolves with { game (what the player got), solution (from the test hook) }.
async function play(c, type, opts = {}) {
  const got = c.next('minigame');
  const solution = await c.test('minigame', { type, ...opts });
  const game = await got;
  assert.equal(game.id, solution.game);
  return { game, solution };
}
const answer = (c, id, a) => c.request({ t: 'minigame-answer', id, answer: a }, m => m.t === 'minigame-result' && m.id === id, { timeout: 4000 });

for (const type of ['trivia', 'untangle', 'ripple', 'water']) {
  test(`${type}: the right answer wins`, async () => {
    const c = await server.join(type.slice(0, 5));
    for (const difficulty of ['easy', 'hard']) {
      const { game, solution } = await play(c, type, { difficulty });
      assert.equal(game.type, type);
      assert.ok(game.ms > 0 && game.puzzle);
      const r = await answer(c, game.id, solution.answer);
      assert.equal(r.won, true, `${type} ${difficulty}: ${r.reason}`);
    }
  });
}

test('pull and ease: played out, it wins; answered at once, it loses', async () => {
  const c = await server.join('pull');
  const early = await play(c, 'pull');
  assert.equal((await answer(c, early.game.id, early.solution.answer)).reason, 'early');
  const { game, solution } = await play(c, 'pull', { difficulty: 'hard' });
  assert.ok(solution.answer.flips.length > 0);
  await new Promise(r => setTimeout(r, game.puzzle.duration));
  const r = await answer(c, game.id, solution.answer);
  assert.equal(r.won, true, r.reason);
});

test('trivia: the answer stays on the server, and a wrong one loses', async () => {
  const c = await server.join('quiz');
  const { game, solution } = await play(c, 'trivia', { difficulty: 'medium' });
  assert.equal(game.puzzle.answers.length, 4);
  assert.ok(!('correct' in game.puzzle) && !JSON.stringify(game.puzzle).includes('choice'));
  const wrong = (solution.answer.choice + 1) % 4;
  const r = await answer(c, game.id, { choice: wrong });
  assert.deepEqual([r.won, r.reason], [false, 'wrong']);
});

test('too late loses, even with the right answer', async () => {
  const c = await server.join('late');
  const { game, solution } = await play(c, 'trivia', { ms: 200 });
  const r = await c.next(m => m.t === 'minigame-result' && m.id === game.id, { timeout: 3000 });
  assert.deepEqual([r.won, r.reason], [false, 'late']);
  c.send({ t: 'minigame-answer', id: game.id, answer: solution.answer });   // too late: nothing more happens
  await new Promise(r => setTimeout(r, 400));
  assert.equal(c.messages.filter(m => m.t === 'minigame-result' && m.id === game.id).length, 1);
});

test('odd answers lose; answers to another game are ignored', async () => {
  const c = await server.join('odd');
  for (const [type, bad] of [['untangle', { rots: 'no' }], ['water', { marks: Array(9).fill([.5, .5]) }], ['ripple', null], ['pull', { flips: [5, 2] }]]) {
    const { game } = await play(c, type);
    c.send({ t: 'minigame-answer', id: game.id + 999, answer: bad });   // not this game: ignored
    if (type === 'pull') await new Promise(r => setTimeout(r, game.puzzle.duration));
    const r = await answer(c, game.id, bad);
    assert.equal(r.won, false, type);
  }
});

test('giving up, or starting another, ends a game as lost', async () => {
  const c = await server.join('quit');
  const a = await play(c, 'ripple');
  const quit = await c.request({ t: 'minigame-quit', id: a.game.id }, m => m.t === 'minigame-result' && m.id === a.game.id);
  assert.deepEqual([quit.won, quit.reason], [false, 'gave up']);
  const b = await play(c, 'trivia');
  const replaced = c.next(m => m.t === 'minigame-result' && m.id === b.game.id);
  await play(c, 'water');
  assert.equal((await replaced).reason, 'replaced');
});

test('admins can start one from chat', async () => {
  const c = await server.join('adm', { username: ADMIN });
  const game = await c.request({ t: 'chat', text: '/minigame untangle hard' }, 'minigame');
  assert.equal(game.type, 'untangle');
  assert.equal(game.puzzle.n, 5);
  const quit = c.next(m => m.t === 'chat' && m.kind === 'system' && /You lost/.test(m.text));
  c.send({ t: 'minigame-quit', id: game.id });
  await quit;
  const other = await server.join('noadm');
  assert.match((await other.request({ t: 'chat', text: '/minigame trivia' }, m => m.t === 'chat' && m.kind === 'system')).text, /no \/minigame command/);
});
