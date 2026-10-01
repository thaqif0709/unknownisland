// Caves (task W9, flag `caves`). Shared between the server (Node) and the browser
// (`window.Caves`), so both agree exactly on where a cave's floor, walls and roof are.
//
// A cave is walked into, with no loading: a tunnel under the ground made of nodes
// { x, z, y (floor height), w (half width), h (height to the top of the arch), s (metres
// from the mouth) }, joined by segments. Node 0 is the mouth, where the floor meets the
// ground; the tunnel is open at that end and closed everywhere else. Each region describes
// its cave in server/regions/<id>.js (`cave:`), and generateCave turns that description
// into nodes, using the cave's own seed for the wandering, so the same cave comes out on
// every island. See docs/roadmap/CONTRACTS.md section 18.
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  // piecewise-linear lookup in [[s, value], ...]
  const pw = (pts, s) => {
    if (s <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (s - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
    return pts[pts.length - 1][1];
  };

  const CAVE = {
    STEP: 2.5,         // metres between nodes
    WALL: .55,         // the walls stand straight up to this share of the height, then arch over
    MOUTH: 4,          // within this many metres of the mouth you can step in or out
    STEP_UP: .8,       // the biggest height difference you can step between cave floor and ground
    DARK_FROM: 3, DARK_TO: 14,   // metres from the mouth: daylight fades out between these
    WADE: .3,          // water deeper than this slows you down
    PUSH: .9,          // water deeper than this pushes you out of the cave (and you can't walk into it)
    // The tide (only sea caves feel it): twice a day, from LOW to HIGH metres.
    TIDE: { LOW: -3, HIGH: .3, PER_DAY: 2, PHASE: .1 },
  };

  // The tide's height at time of day t (0-1). Lowest at t = PHASE and half a tide later.
  function tideLevel(t) {
    const T = CAVE.TIDE, k = Math.cos((t - T.PHASE) * Math.PI * 2 * T.PER_DAY);
    return lerp(T.HIGH, T.LOW, (k + 1) / 2);
  }
  // Water in a cave: sea caves fill with the tide; others are dry (null).
  const waterLevel = (cave, t) => (cave.sea ? tideLevel(t) : null);

  // spec (plain data, from the region file):
  //   { id, region, sea?, x, z (the mouth), dir (radians, the way in: 0 = north, π/2 = east),
  //     length (metres), floor: [[s, y], ...] (floor height along the way; s = 0 is the mouth),
  //     width: [[s, w], ...], height: [[s, h], ...], wander (metres the tunnel drifts sideways),
  //     branch?: { at (s), dir (+1 right, -1 left), length, floor: [[s, y]], width, height } }
  // `flag`: a feature flag it waits for (a region pack's), besides `caves`.
  // `lair`: the kinds of creature that live in it (e.g. ['crawler']; see server/mobs/).
  // Returns { id, region, sea, lair, nodes, segs, out, bbox }. `out` is a safe spot just outside
  // the mouth (where the tide leaves you).
  function generateCave(spec) {
    const rng = mulberry32(hashStr(spec.id));
    const nodes = [], segs = [];
    const wig = () => { const a = rng() * 6.283, b = rng() * 6.283, f = .05 + rng() * .05; return s => Math.sin(s * f + a) * .6 + Math.sin(s * f * 2.3 + b) * .4; };
    // one path: nodes every STEP metres, drifting sideways a little (never at the mouth)
    // (A branch starts with a node of its own in the middle of the passage it leaves, with its
    // own width, so it doesn't take the shape of the chamber it leaves from.)
    function path(x0, z0, dir, s0, len, floor, width, height, wander) {
      const drift = wig(), n = Math.max(1, Math.round(len / CAVE.STEP)), fx = Math.sin(dir), fz = -Math.cos(dir), rx = Math.cos(dir), rz = Math.sin(dir);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const s = len * i / n, side = wander * drift(s) * smooth(0, 8, s);
        const node = { x: +(x0 + fx * s + rx * side).toFixed(2), z: +(z0 + fz * s + rz * side).toFixed(2), y: +pw(floor, s).toFixed(2), w: +pw(width, s).toFixed(2), h: +pw(height, s).toFixed(2), s: +(s0 + s).toFixed(2) };
        nodes.push(node);
        if (prev != null) segs.push([prev, nodes.length - 1]);
        prev = nodes.length - 1;
      }
      return prev;
    }
    path(spec.x, spec.z, spec.dir, 0, spec.length, spec.floor, spec.width, spec.height, spec.wander || 0);
    if (spec.branch) {
      const B = spec.branch;
      let at = 0; for (let i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].s - B.at) < Math.abs(nodes[at].s - B.at)) at = i;
      const a = nodes[at];
      path(a.x, a.z, spec.dir + B.dir * Math.PI / 2, a.s, B.length, B.floor, B.width, B.height, B.wander || 0);
    }
    const n0 = nodes[0], n1 = nodes[1], d = Math.hypot(n1.x - n0.x, n1.z - n0.z);
    const out = { x: +(n0.x - (n1.x - n0.x) / d * 2.5).toFixed(2), z: +(n0.z - (n1.z - n0.z) / d * 2.5).toFixed(2) };
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const q of nodes) { x0 = Math.min(x0, q.x - q.w - 1); z0 = Math.min(z0, q.z - q.w - 1); x1 = Math.max(x1, q.x + q.w + 1); z1 = Math.max(z1, q.z + q.w + 1); }
    return { id: spec.id, region: spec.region || 'landing', sea: !!spec.sea, lair: spec.lair || [], flag: spec.flag || null, nodes, segs, out, bbox: [x0, z0, x1, z1] };
  }

  // The roof above a spot `d` metres from the middle of a tunnel that is `w` wide (half) and `h` high.
  const roofAt = (floor, w, h, d) => floor + h * (CAVE.WALL + (1 - CAVE.WALL) * Math.sqrt(Math.max(0, 1 - (d / w) ** 2)));

  // Where in this cave (x, z) is, or null if it's outside it:
  // { cave, floor, roof, w, h, d (metres from the middle), s (metres from the mouth), seg, t }.
  function caveHit(cave, x, z) {
    const b = cave.bbox;
    if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) return null;
    let best = null, bk = 1;
    cave.segs.forEach(([i, j], si) => {
      const A = cave.nodes[i], B = cave.nodes[j], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
      let t = ((x - A.x) * dx + (z - A.z) * dz) / L2;
      if (i === 0 && t < 0) return;   // the mouth end is open
      t = clamp(t, 0, 1);
      const d = Math.hypot(x - A.x - dx * t, z - A.z - dz * t), w = lerp(A.w, B.w, t), k = d / w;
      if (k < bk) { bk = k; best = { si, t, d, w, A, B }; }
    });
    if (!best) return null;
    const { t, d, w, A, B } = best, floor = lerp(A.y, B.y, t), h = lerp(A.h, B.h, t);
    return { cave, floor, roof: roofAt(floor, w, h, d), w, h, d, s: lerp(A.s, B.s, t), seg: best.si, t };
  }
  // The first cave that (x, z) is inside, or null.
  function caveAt(caves, x, z) {
    for (const c of caves || []) { const hit = caveHit(c, x, z); if (hit) return hit; }
    return null;
  }
  // Is the ground at (x, z), height H, cut away here? (Where the tunnel comes up through it,
  // at the mouth. Deeper in, the ground stays whole over the roof.)
  function groundCut(caves, x, z, H) {
    const hit = caveAt(caves, x, z);
    return !!hit && H > hit.floor - .25 && H < hit.roof + .4;
  }
  // How dark it is here (0 at the mouth, 1 deep inside).
  const darkness = hit => (hit ? smooth(CAVE.DARK_FROM, CAVE.DARK_TO, hit.s) : 0);

  const Caves = { CAVE, generateCave, caveHit, caveAt, groundCut, roofAt, darkness, tideLevel, waterLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = Caves;
  else root.Caves = Caves;
})(typeof globalThis !== 'undefined' ? globalThis : this);
