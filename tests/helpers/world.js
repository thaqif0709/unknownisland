// Finding things on the island for the tests: objects by type, a spot to stand next to
// one, dry land, the sea. Uses the same shared world code the server and browser use.
const WG = require('../../server/shared/world-gen');

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The layout from /api/world with each object's current state from the welcome.
function objectsWithState(layout, welcome) {
  const states = new Map(welcome.states || []);
  return layout.map(o => ({ ...o, state: { ...WG.defaultState(o.type), ...(states.get(o.id) || {}) } }));
}

// The nearest object to `from` that passes `ok` (by default: not gone).
function nearest(list, from, ok = o => !o.state.gone) {
  let best = null, bd = Infinity;
  for (const o of list) { if (!ok(o)) continue; const d = dist(o, from); if (d < bd) { bd = d; best = o; } }
  return best;
}

// A spot close enough to use `o` with E (the server allows its radius plus reach), on the
// side facing `from`.
function besideSpot(o, from = WG.SPAWN) {
  const a = Math.atan2(from.z - o.z, from.x - o.x), r = (o.r || .5) + 1;
  return { x: o.x + Math.cos(a) * r, z: o.z + Math.sin(a) * r };
}

// Search outwards from `from` for a spot where `ok(height)` holds.
function spotNear(from, ok, { step = 1, max = 120 } = {}) {
  for (let r = 0; r <= max; r += step) {
    for (let i = 0, n = Math.max(1, Math.round(r * 2)); i < n; i++) {
      const a = i / n * Math.PI * 2, x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
      if (ok(WG.heightAt(x, z), x, z)) return { x, z };
    }
  }
  return null;
}

// Dry, flat-ish land (a fire can be built 1.6 in front of it), at least 4 away from the
// fires in `avoid` (a database kept between runs remembers the last run's fires).
const landNear = (from, avoid = []) => spotNear(from, (h, x, z) => h > .6 && h < 3 && WG.heightAt(x + 1.6, z) > .6
  && avoid.every(f => Math.hypot(f.x - x, f.z - z) > 4 && Math.hypot(f.x - x - 1.6, f.z - z) > 4));
// How many more chops a tree or palm takes to come down (none for a tree too big to cut).
const chopsLeft = (o, island) => WG.tooBigToChop(o, o.state, island.day, island.time) ? 0 : WG.chopsFor(o, o.state, island.day, island.time) - (o.state.hits || 0);
// Shallow sea, where a bucket can be filled (and a player can stand).
const seaNear = from => spotNear(from, h => h < .5 && h > -.6, { step: 2, max: 400 });

// A spot on land with open sea 6-10 m in front, looking out from the middle of the island
// (fishing, P7): { x, z, face }. a0 is where round the island to start looking.
function shoreSpot(a0 = 0) {
  for (let a = a0; a < a0 + Math.PI * 2; a += .15) {
    const dx = Math.sin(a), dz = Math.cos(a);
    for (let r = 20; r < 300; r += .5) {
      const h = WG.heightAt(dx * r, dz * r);
      if (h > .25 && h < 3 && [6, 8, 10].every(d => WG.heightAt(dx * (r + d), dz * (r + d)) < -.1)) return { x: dx * r, z: dz * r, face: a };
    }
  }
  return null;
}
// Rafts and zip lines (P10).
const groundY = (x, z) => Math.max(WG.heightAt(x, z), 0);
// Wading at the water's edge, deep water just ahead: { x, z, face } (a0: where round the island).
function raftEdge(a0 = 0) {
  for (let k = 0; k < 40; k++) {
    const s = shoreSpot(a0 + k * .15), dx = Math.sin(s.face), dz = Math.cos(s.face);
    for (let r = 0; r < 12; r += .25) {
      const x = s.x + dx * r, z = s.z + dz * r;
      if (WG.heightAt(x, z) < -.1 && WG.heightAt(x, z) > -.8 && WG.heightAt(x + dx * 2.5, z + dz * 2.5) < -.6 && WG.heightAt(x + dx * 10, z + dz * 10) < -1.6) return { x, z, face: s.face };
    }
  }
  return null;
}
// A hillside where a zip line can be strung: top and bottom, ground clear in between.
function zipSpot() {
  for (const hl of WG.HILLS) {
    for (let a = 0; a < Math.PI * 2; a += .3) {
      for (let r0 = hl.r * .2; r0 < hl.r * 1.2; r0 += 2) {
        for (const len of [14, 20, 28]) {
          const A = { x: hl.x + Math.sin(a) * r0, z: hl.z + Math.cos(a) * r0 }, B = { x: hl.x + Math.sin(a) * (r0 + len), z: hl.z + Math.cos(a) * (r0 + len) };
          if (WG.heightAt(A.x, A.z) < 1 || WG.heightAt(B.x, B.z) < 1) continue;
          const ZI = WG.RULES.ZIP, ay = groundY(A.x, A.z) + ZI.POST, by = groundY(B.x, B.z) + ZI.POST, L = Math.hypot(B.x - A.x, by - ay, B.z - A.z);
          if (ay - by < ZI.DROP + .5) continue;
          let ok = true;
          for (let k = .05; k < .95 && ok; k += 1 / L) { const x = A.x + (B.x - A.x) * k, z = A.z + (B.z - A.z) * k; if (ay + (by - ay) * k - groundY(x, z) < ZI.CLEAR + .3) ok = false; }
          if (ok) return { A, B, len: L };
        }
      }
    }
  }
  return null;
}


module.exports = { WG, dist, objectsWithState, nearest, besideSpot, spotNear, landNear, seaNear, chopsLeft, shoreSpot, raftEdge, zipSpot };
