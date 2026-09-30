// Pull and ease: keep the marker in the fish's drifting zone for most of the round
// (server/shared/minigame-sim.js has the physics both sides run). The browser reports
// the steps where the button went down or up; the server replays that and scores it, and the answer
// can't come before the round has been played out.
const Sim = require('../shared/minigame-sim');

const DURATION = 8000;

module.exports = {
  type: 'pull',
  name: 'Pull and ease',
  build(rng, level) {
    const puzzle = { seed: Math.floor(rng() * 2 ** 31), duration: DURATION, level, hw: [.16, .13, .1][level], need: [.55, .62, .7][level] };
    const steps = Sim.pullSteps(puzzle), MAX_FLIPS = 600;
    const valid = f => Array.isArray(f) && f.length <= MAX_FLIPS && f.every((v, i) => Number.isInteger(v) && v >= 0 && v < steps && (i === 0 || v > f[i - 1]));
    return {
      puzzle,
      check: a => a && valid(a.flips) && Sim.pullRun(puzzle, a.flips) >= puzzle.need,
      // a steady hand that reads the fish a moment ahead (used by the tests; it keeps the
      // marker in the zone at least 86% of the time even on hard, so hard's 70% is fair)
      solve() {
        const s = Sim.pullSetup(puzzle), st = { m: .5, v: 0 }, flips = [];
        let down = false;
        for (let i = 0; i < steps; i++) {
          const want = st.m + st.v * .2 < Sim.pullZone(s, (i + 21) * Sim.PULL.STEP_MS / 1000);
          if (want !== down && flips.length < MAX_FLIPS) { down = want; flips.push(i); }
          Sim.pullStep(st, down);
        }
        return { flips };
      },
      ms: DURATION + 1500,
      minMs: DURATION,
    };
  },
};
