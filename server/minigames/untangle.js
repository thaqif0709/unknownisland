// Untangle the line: a grid of line pieces (straights and bends); turn them so one line
// runs from the left edge (row `entry`) out of the right edge. 3×3, 4×4 or 5×5.
// (Sides and turns: see untangleRun in server/shared/minigame-sim.js.)
const { STEP, untangleRun } = require('../shared/minigame-sim');   // the browser checks the line the same way
const connects = (n, entry, tiles, rots) => !!untangleRun(n, entry, tiles, rots);

module.exports = {
  type: 'untangle',
  name: 'Untangle the line',
  connects,
  build(rng, level) {
    const n = 3 + level, pick = a => a[Math.floor(rng() * a.length)];
    const entry = Math.floor(rng() * n);
    // a winding path from the left edge to the right edge (a random walk that never crosses itself)
    let path = null;
    const walk = (r, c, from, seen, out) => {
      seen.add(r * n + c);
      const dirs = [0, 1, 2, 3].filter(d => d !== from).sort(() => rng() - .5);
      for (const d of dirs) {
        if (d === 1 && c === n - 1) { out.push([r, c, from, 1]); return true; }
        const nr = r + STEP[d][0], nc = c + STEP[d][1];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n || seen.has(nr * n + nc)) continue;
        out.push([r, c, from, d]);
        if (walk(nr, nc, (d + 2) % 4, seen, out)) return true;
        out.pop();
      }
      seen.delete(r * n + c);
      return false;
    };
    const cells = [];
    walk(entry, 0, 3, new Set(), cells);
    path = cells;
    const tiles = [], solved = [];
    for (let i = 0; i < n * n; i++) { tiles.push([pick(['I', 'L']), 0]); solved.push(Math.floor(rng() * 4)); }
    for (const [r, c, a, b] of path) {
      const i = r * n + c;
      if ((a + 2) % 4 === b) { tiles[i] = ['I', 0]; solved[i] = a % 2; }
      else {
        const lo = ((b - a + 4) % 4 === 1) ? a : b;   // the bend joins lo and lo + 1
        tiles[i] = ['L', 0]; solved[i] = lo;
      }
    }
    // scramble: every tile turned at random, and the line must start broken
    const rots = solved.map(() => Math.floor(rng() * 4));
    if (connects(n, entry, tiles, rots)) { const [r, c] = path[0]; rots[r * n + c] = (solved[r * n + c] + 1) % 4; }
    for (let i = 0; i < n * n; i++) tiles[i][1] = rots[i];
    return {
      puzzle: { n, entry, tiles },
      check: a => a && Array.isArray(a.rots) && a.rots.length === n * n && connects(n, entry, tiles, a.rots),
      solve: () => ({ rots: solved }),
      ms: [12000, 14000, 16000][level],
    };
  },
};
