// Shared between the server (Node) and the browser: the parts of the minigames (P8) that
// both sides must work out exactly the same way. In the browser this file sets
// `window.MinigameSim`; in Node it is `require`d.
//
// Pull and ease: a fish tugs a zone up and down a bar; you hold to pull the marker up and
// let go to let it sink, keeping it inside the zone. The browser runs it live; the server
// replays the button presses the browser reports and scores them itself, so the result
// can't be claimed without playing it.
(function (root) {
  'use strict';

  function rng32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PULL = {
    STEP_MS: 1000 / 60,   // fixed steps: both sides step exactly the same way
    UP: 2.6, DOWN: 1.9,   // acceleration while holding / while letting go (bar lengths per s²)
    DAMP: .94,            // velocity kept per step
  };

  // The zone's path for one puzzle: two slow waves from the seed.
  function pullSetup(p) {
    const r = rng32(p.seed >>> 0);
    return { ...p, a1: .7 + r() * .6, p1: r() * 6.28, a2: 1.7 + r() * 1.1, p2: r() * 6.28, amp1: .24 + r() * .06, amp2: .08 + r() * .06 };
  }
  function pullZone(s, t) {   // centre of the zone at t seconds (0 bottom, 1 top)
    const z = .5 + s.amp1 * Math.sin(t * s.a1 + s.p1) + s.amp2 * Math.sin(t * s.a2 * (1 + s.level * .25) + s.p2);
    return Math.min(1 - s.hw, Math.max(s.hw, z));
  }
  // One fixed step. st = { m, v } (marker position and speed).
  function pullStep(st, down) {
    const dt = PULL.STEP_MS / 1000;
    st.v = (st.v + (down ? PULL.UP : -PULL.DOWN) * dt) * PULL.DAMP;
    st.m += st.v * dt;
    if (st.m < 0) { st.m = 0; st.v = 0; }
    if (st.m > 1) { st.m = 1; st.v = 0; }
    return st;
  }
  const pullSteps = s => Math.round(s.duration / PULL.STEP_MS);
  // Replay a whole round. `flips` are the step numbers where the button changed (it starts
  // up, so the first flip presses it), in increasing order: small enough to send even when
  // someone taps away. Returns the share of steps the marker spent inside the zone.
  function pullRun(puzzle, flips) {
    const s = pullSetup(puzzle), steps = pullSteps(s), st = { m: .5, v: 0 };
    let down = false, fi = 0, inside = 0;
    for (let i = 0; i < steps; i++) {
      while (fi < flips.length && flips[fi] <= i) { down = !down; fi++; }
      pullStep(st, down);
      if (Math.abs(st.m - pullZone(s, (i + 1) * PULL.STEP_MS / 1000)) <= s.hw) inside++;
    }
    return inside / steps;
  }

  // Untangle the line: sides 0 up, 1 right, 2 down, 3 left. A straight ('I') at turn 0
  // joins up and down, a bend ('L') up and right; each quarter turn adds one to both.
  const TILE_OPEN = { I: [0, 2], L: [0, 1] };
  const STEP = [[-1, 0], [0, 1], [1, 0], [0, -1]];   // [row, col] for each side
  const tileSides = (type, rot) => TILE_OPEN[type].map(s => (s + rot) % 4);
  // Does a line entering the left edge at row `entry` come out of the right edge? Returns
  // the cells it passes through when it does (for drawing it lit), otherwise null.
  function untangleRun(n, entry, tiles, rots) {
    let r = entry, c = 0, from = 3;
    const cells = [];
    for (let steps = 0; steps <= n * n; steps++) {
      const i = r * n + c, open = tileSides(tiles[i][0], (((rots[i] | 0) % 4) + 4) % 4);
      if (!open.includes(from)) return null;
      cells.push(i);
      const out = open[0] === from ? open[1] : open[0];
      if (out === 1 && c === n - 1) return cells;
      r += STEP[out][0]; c += STEP[out][1];
      if (r < 0 || c < 0 || r >= n || c >= n) return null;
      from = (out + 2) % 4;
    }
    return null;
  }

  const MinigameSim = { PULL, rng32, pullSetup, pullZone, pullStep, pullRun, pullSteps, TILE_OPEN, STEP, tileSides, untangleRun };
  if (typeof module !== 'undefined' && module.exports) module.exports = MinigameSim;
  else root.MinigameSim = MinigameSim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
