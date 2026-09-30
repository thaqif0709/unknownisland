// Minigames (P8): short games the server sets and checks, used to land fish (P7) and by
// future Sleeper requests. Each game is a file here (trivia, untangle, ripple, pull, water):
//
//   module.exports = {
//     type: 'untangle', name: 'Untangle the line',
//     build(rng, level, island) -> { puzzle, check(answer) -> bool, solve() -> answer, ms, minMs? },
//   };
//
// `puzzle` goes to the player; `check` and the answer stay here. level is 0 (easy),
// 1 (medium) or 2 (hard). `ms` is the time allowed (the caller can override it); `minMs`,
// if set, is the earliest an answer may come (for games that must be played out).
//
// island.minigames.start(p, type, { difficulty, seed, ms }) -> Promise<{ won, reason }>
// The player gets { t: 'minigame', id, type, name, difficulty, ms, puzzle }, answers with
// { t: 'minigame-answer', id, answer } (or gives up with 'minigame-quit'), and hears
// { t: 'minigame-result', id, won, reason }. A late, early, wrong or missing answer loses.
const { rng32 } = require('../shared/minigame-sim');

const GAMES = {};
for (const name of ['trivia', 'untangle', 'ripple', 'pull', 'water']) {
  const g = require(`./${name}`);
  GAMES[g.type] = g;
}
const LEVELS = { easy: 0, medium: 1, hard: 2 };
const GRACE_MS = 600;   // for the answer's trip over the network

class Minigames {
  constructor(island) {
    this.island = island;
    this.nextId = 1;
    this.active = new Map();   // player id -> session
  }
  static types() { return Object.keys(GAMES); }

  start(p, type, { difficulty = 'easy', seed, ms } = {}) {
    const game = GAMES[type];
    if (!game) return Promise.reject(new Error(`no minigame "${type}"`));
    const old = this.active.get(p.id);
    if (old) this.finish(old, false, 'replaced');
    const level = LEVELS[difficulty] ?? 0;
    const s = seed ?? Math.floor(Math.random() * 2 ** 31);
    const built = game.build(rng32(s), level, this.island);
    const now = Date.now(), allowed = ms ?? built.ms;
    return new Promise(resolve => {
      const session = { id: this.nextId++, type, p, check: built.check, solution: built.solve, startedAt: now,
        deadline: now + allowed, minAt: built.minMs ? now + built.minMs - GRACE_MS : 0, resolve };
      session.timer = setTimeout(() => this.finish(session, false, 'late'), allowed + GRACE_MS);
      this.active.set(p.id, session);
      this.island.send(p, { t: 'minigame', id: session.id, type, name: game.name, difficulty, ms: allowed, puzzle: built.puzzle });
    });
  }

  // The player's answer (from the 'minigame-answer' message).
  answer(p, { id, answer }) {
    const s = this.active.get(p.id);
    if (!s || s.id !== id) return;
    const now = Date.now();
    if (now > s.deadline + GRACE_MS) return this.finish(s, false, 'late');
    if (s.minAt && now < s.minAt) return this.finish(s, false, 'early');
    let ok = false;
    try { ok = !!s.check(answer); } catch (e) { ok = false; }   // malformed answers simply lose
    this.finish(s, ok, ok ? 'right' : 'wrong');
  }
  quit(p, { id }) { const s = this.active.get(p.id); if (s && (id == null || s.id === id)) this.finish(s, false, 'gave up'); }

  finish(s, won, reason) {
    if (this.active.get(s.p.id) !== s) return;
    clearTimeout(s.timer);
    this.active.delete(s.p.id);
    this.island.send(s.p, { t: 'minigame-result', id: s.id, won, reason });
    s.resolve({ won, reason });
  }
  // For tests and debugging only: a right answer to the player's current game.
  solution(p) { const s = this.active.get(p.id); return s ? { game: s.id, answer: s.solution() } : null; }
}

module.exports = { Minigames, GAMES };
