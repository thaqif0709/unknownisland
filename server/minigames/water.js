// Read the water: two pictures of the same patch of pond; three things differ (one is gone,
// one has moved, one has become something else). Mark the three on the right-hand picture.
// Positions are 0..1 across and down each picture.
const KINDS = ['lily', 'reed', 'ripple', 'stone', 'fish', 'leaf'];
const NEAR = .085;   // how close a mark must be to count

module.exports = {
  type: 'water',
  name: 'Read the water',
  build(rng, level) {
    const n = [9, 12, 15][level], items = [];
    for (let tries = 0; items.length < n && tries < 500; tries++) {
      const x = .1 + rng() * .8, y = .1 + rng() * .8;
      if (items.some(o => Math.hypot(o.x - x, o.y - y) < .14)) continue;
      items.push({ k: KINDS[Math.floor(rng() * KINDS.length)], x, y, s: .8 + rng() * .5 });
    }
    const r3 = v => Math.round(v * 1000) / 1000;
    const idx = items.map((_, i) => i).sort(() => rng() - .5).slice(0, 3);
    const right = items.map(o => ({ ...o })), spots = [];
    // gone
    spots.push([items[idx[0]].x, items[idx[0]].y]); right[idx[0]] = null;
    // moved (either place counts)
    { const o = right[idx[1]], a = rng() * 6.28, x = Math.min(.92, Math.max(.08, o.x + Math.cos(a) * .16)), y = Math.min(.92, Math.max(.08, o.y + Math.sin(a) * .16));
      spots.push([o.x, o.y, x, y]); o.x = x; o.y = y; }
    // changed
    { const o = right[idx[2]]; o.k = KINDS[(KINDS.indexOf(o.k) + 1 + Math.floor(rng() * (KINDS.length - 1))) % KINDS.length]; spots.push([o.x, o.y]); }
    const view = list => list.filter(Boolean).map(o => ({ k: o.k, x: r3(o.x), y: r3(o.y), s: r3(o.s) })).sort(() => rng() - .5);
    const hits = (spot, m) => Math.hypot(m[0] - spot[0], m[1] - spot[1]) < NEAR || (spot.length > 2 && Math.hypot(m[0] - spot[2], m[1] - spot[3]) < NEAR);
    return {
      puzzle: { left: view(items), right: view(right) },
      // up to 5 marks; each difference needs one of them
      check: a => a && Array.isArray(a.marks) && a.marks.length <= 5 && a.marks.every(m => Array.isArray(m) && m.length === 2 && m.every(Number.isFinite))
        && spots.every(spot => a.marks.some(m => hits(spot, m))),
      solve: () => ({ marks: spots.map(s => [s[0], s[1]]) }),
      ms: [15000, 12000, 10000][level],
    };
  },
};
