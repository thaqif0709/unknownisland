// The Crawler (task C2, flag `caves`): the thing in the sea cave. Three times the size of
// the Stilled, all long arms and legs, it crawls along the floor, the walls and the ceiling
// of its cave and never leaves it. It hunts by sound: running, calling out, talking. When it
// hears you it screams (dread for everyone near, a shaking view, and you know where it is)
// and comes. Light drives it back; it won't cross water (when the tide rises it clings to
// the roof and waits). Its lunge is warned by a strip on the ground; caught, you're knocked
// down and dragged deeper into the dark. Killed, it's back the next day.
// Lives in caves whose description lists it (`lair: ['crawler']`, server/regions/<id>.js).
const WG = require('../shared/world-gen');
const Caves = require('../shared/caves');
const { r2 } = require('../systems/util');

const C = {
  ROAM: 1.4, HUNT: 4.2, RECOIL: 5,   // metres a second (walking is 4.6, sprinting about 7.6)
  HEAR_RUN: 25, HEAR_CALL: 60, HEAR_CHAT: 30, SENSE: 5,   // how far it hears each sound; close enough and it just knows
  LIGHT: 4.5,          // it won't come nearer a lit torch than this
  REACH: 3, TELL_MS: 800, LUNGE: 3.4, DRAG: 8,   // the lunge: when it starts, its warning, how far it reaches, how far it drags you
  FORGET: 12,          // seconds without a sound before it goes back to lurking
  SCREAM_GAP: 20000, SCREAM_DREAD: 12, SCREAM_HEAR: 45,
  NEAR: 12, NEAR_DREAD: 2.5,   // dread a second while it's this close
  DRY: .3,             // water deeper than this and it won't go there
  DEEP: 18,            // it lurks further in than this (metres from the mouth)
};
const on = () => WG.feature('caves');

// ---- getting around its cave: a graph of the cave's nodes ----
const graphs = new WeakMap();
function graph(cave) {
  if (!graphs.has(cave)) {
    const adj = cave.nodes.map(() => []);
    for (const [i, j] of cave.segs) { adj[i].push(j); adj[j].push(i); }
    // a branch starts from its own node in the middle of the passage it leaves: join it to the nearest node there
    cave.nodes.forEach((n, i) => {
      if (adj[i].length !== 1 || i === 0 || i === cave.nodes.length - 1) return;
      let best = -1, bd = 1e9;
      cave.nodes.forEach((m, j) => { if (j !== i && !adj[i].includes(j)) { const d = Math.hypot(m.x - n.x, m.z - n.z); if (d < bd) { bd = d; best = j; } } });
      if (best >= 0 && bd < .5) { adj[i].push(best); adj[best].push(i); }
    });
    graphs.set(cave, adj);
  }
  return graphs.get(cave);
}
function nearestNode(cave, x, z, ok = () => true) {
  let best = -1, bd = 1e9;
  cave.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && ok(i)) { bd = d; best = i; } });
  return best;
}
const flooded = (cave, i, level) => level != null && level - cave.nodes[i].y > C.DRY;
// The way from node a to node b over dry ground (a list of nodes, not including a), or null.
function route(cave, a, b, level) {
  if (a < 0 || b < 0) return null;
  const adj = graph(cave), prev = new Map([[a, -1]]), q = [a];
  while (q.length) {
    const i = q.shift();
    if (i === b) break;
    for (const j of adj[i]) if (!prev.has(j) && !flooded(cave, j, level)) { prev.set(j, i); q.push(j); }
  }
  if (!prev.has(b)) return null;
  const out = []; for (let i = b; i !== a; i = prev.get(i)) out.unshift(i);
  return out;
}
const caveOf = (island, mob) => island.caveById && island.caveById(mob.cave);
const level = (island, cave) => Caves.waterLevel(cave, island.time);
// Walk the path at `speed`; true when it has got to the end.
function follow(mob, cave, speed, dt) {
  let left = speed * dt;
  while (left > 0 && mob.path && mob.path.length) {
    const n = cave.nodes[mob.path[0]], dx = n.x - mob.x, dz = n.z - mob.z, d = Math.hypot(dx, dz);
    if (d > .01) mob.face = Math.atan2(dx, dz);
    if (d <= left) { mob.x = n.x; mob.z = n.z; mob.node = mob.path.shift(); left -= d; } else { mob.x += dx / d * left; mob.z += dz / d * left; left = 0; }
  }
  return !mob.path || !mob.path.length;
}
function goTo(mob, cave, island, x, z) {
  const lv = level(island, cave), from = mob.node ?? nearestNode(cave, mob.x, mob.z), to = nearestNode(cave, x, z, i => !flooded(cave, i, lv));
  mob.path = route(cave, from, to, lv) || [];
}

// ---- what it notices ----
const inCave = (p, cave) => p.under === cave.id && !(p.knockedUntil > Date.now());
const torchLit = (island, p) => { const h = island.held(p); return !!h && h.key === 'torch' && island.count(p, 'torch') > 0; };
// The loudest thing it can hear right now: { p, x, z } or null.
function listen(mob, island, cave, players) {
  const now = Date.now();
  let best = null, bestK = 0;
  for (const p of players) {
    if (!inCave(p, cave)) continue;
    const d = Math.hypot(p.x - mob.x, p.z - mob.z);
    let reach = C.SENSE;
    if (p.running && p.moving) reach = Math.max(reach, C.HEAR_RUN);
    if (now - (p.lastCallAt || 0) < 1500) reach = Math.max(reach, C.HEAR_CALL);
    if (now - (p.lastChatAt || 0) < 1500) reach = Math.max(reach, C.HEAR_CHAT);
    const k = reach - d;
    if (k > 0 && k > bestK) { bestK = k; best = { p, x: p.x, z: p.z }; }
  }
  return best;
}
// The nearest lit torch too close for comfort, or null.
function light(mob, island, cave, players) {
  let best = null, bd = C.LIGHT;
  for (const p of players) { if (p.under !== cave.id || !torchLit(island, p)) continue; const d = Math.hypot(p.x - mob.x, p.z - mob.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
function scream(mob, island, cave) {
  const now = Date.now();
  if (now - (mob.screamAt || 0) < C.SCREAM_GAP) return;
  mob.screamAt = now;
  for (const p of island.players.values()) {
    const d = Math.hypot(p.x - mob.x, p.z - mob.z);
    if (d < C.SCREAM_HEAR && (p.under === cave.id || d < C.SCREAM_HEAR / 3)) p.dread = Math.min(100, p.dread + C.SCREAM_DREAD * (p.under === cave.id ? 1 : .5));
  }
  island.broadcast({ t: 'scream', id: mob.id, x: r2(mob.x), z: r2(mob.z), under: cave.id });
}
// Where the floor (or the roof, on the ceiling) is under it.
function surfaceY(cave, mob) {
  const hit = Caves.caveHit(cave, mob.x, mob.z);
  if (!hit) return 0;
  return mob.surf === 'c' ? hit.roof - .25 : hit.floor;
}
// Up on the roof when lurking or when the water is up; down on the floor to hunt and strike.
function setSurface(mob, island, cave, want) {
  const hit = Caves.caveHit(cave, mob.x, mob.z), lv = level(island, cave);
  mob.surf = hit && lv != null && lv - hit.floor > C.DRY ? 'c' : want;
}

module.exports = {
  kind: 'crawler',
  hp: 60,
  radius: .9,
  start: 'lurk',
  weak: { fire: 3, light: 2 },
  C,

  // Once a tick: one in each cave that is its lair (back the day after it's killed), none
  // with caves switched off; and its closeness frightens.
  tick(island, dt, { players }) {
    const mobs = island.mobs, st = mobs.stateOf('crawler');
    if (!on() || !island.caveList) { for (const m of mobs.of('crawler')) mobs.remove(m); return; }
    for (const cave of island.caveList()) {
      if (!(cave.lair || []).includes('crawler')) continue;
      const here = mobs.of('crawler').find(m => m.cave === cave.id);
      if (!here) {
        st.dead = st.dead || {};
        if (st.dead[cave.id] != null && st.dead[cave.id] >= island.day) continue;   // killed today: back tomorrow
        let deep = 0; cave.nodes.forEach((n, i) => { if (n.s > cave.nodes[deep].s) deep = i; });
        const n = cave.nodes[deep];
        mobs.spawn('crawler', n.x, n.z, { cave: cave.id, node: deep, path: [], surf: 'c', face: 0 });
        continue;
      }
      for (const p of players) if (p.under === cave.id && Math.hypot(p.x - here.x, p.z - here.z) < C.NEAR) p.dread = Math.min(100, p.dread + C.NEAR_DREAD * dt);
      here.y = surfaceY(cave, here);   // for the browser (last tick's position is close enough)
    }
  },

  states: {
    // Hanging from the roof deep inside, moving from spot to spot, listening.
    lurk(mob, island, dt, { players }) {
      const cave = caveOf(island, mob); if (!cave) return;
      setSurface(mob, island, cave, 'c');
      if (light(mob, island, cave, players)) return 'recoil';
      const heard = listen(mob, island, cave, players);
      if (heard) { mob.heard = heard; mob.heardAt = Date.now(); scream(mob, island, cave); goTo(mob, cave, island, heard.x, heard.z); return 'hunt'; }
      if (follow(mob, cave, C.ROAM, dt)) {
        if ((mob.wait = (mob.wait ?? 3) - dt) > 0) return;
        mob.wait = 2 + Math.random() * 4;
        const lv = level(island, cave), deep = cave.nodes.map((n, i) => i).filter(i => cave.nodes[i].s > C.DEEP && !flooded(cave, i, lv));
        if (deep.length) { const to = deep[(Math.random() * deep.length) | 0]; goTo(mob, cave, island, cave.nodes[to].x, cave.nodes[to].z); }
      }
    },
    // After a sound: to where it came from, down on the floor once it's close.
    hunt(mob, island, dt, { players }) {
      const cave = caveOf(island, mob); if (!cave) return 'lurk';
      if (light(mob, island, cave, players)) return 'recoil';
      const heard = listen(mob, island, cave, players), now = Date.now();
      if (heard) { mob.heard = heard; mob.heardAt = now; if (!mob.path.length || mob.t % .5 < dt) goTo(mob, cave, island, heard.x, heard.z); }
      const near = players.filter(p => inCave(p, cave)).reduce((b, p) => { const d = Math.hypot(p.x - mob.x, p.z - mob.z); return d < b.d ? { p, d } : b; }, { p: null, d: 1e9 });
      setSurface(mob, island, cave, near.d < 9 ? 'f' : 'c');
      if (near.p && near.d < C.REACH && mob.surf === 'f') {
        mob.face = Math.atan2(near.p.x - mob.x, near.p.z - mob.z);
        island.mobs.telegraph(mob, { shape: 'line', x: mob.x, z: mob.z, a: mob.face, len: C.LUNGE + .6, w: 1.6, ms: C.TELL_MS });
        return 'windup';
      }
      const arrived = follow(mob, cave, C.HUNT, dt);
      if (arrived && now - (mob.heardAt || 0) > C.FORGET * 1000) return 'lurk';
    },
    // Rearing back before the lunge (the strip on the ground is the warning).
    windup(mob, island, dt, { players }) {
      const cave = caveOf(island, mob);
      if (cave && light(mob, island, cave, players)) { mob.telegraphed = null; return 'recoil'; }
      if (mob.t * 1000 >= C.TELL_MS) return 'strike';
    },
    // The lunge: anyone in the strip is knocked down and dragged deeper in.
    strike(mob, island, dt, { players }) {
      const cave = caveOf(island, mob);
      if (cave) {
        scream(mob, island, cave);
        for (const p of players) {
          if (!inCave(p, cave) || !island.mobs.inTelegraph(mob, p.x, p.z)) continue;
          if (island.dodging(p)) { island.send(p, { t: 'toast', msg: 'You roll clear.' }); continue; }   // (P6)
          island.knock(p);
          // dragged: to a dry spot further from the mouth
          const lv = level(island, cave), here = nearestNode(cave, p.x, p.z), s0 = cave.nodes[here].s;
          const to = nearestNode(cave, p.x, p.z, i => cave.nodes[i].s >= s0 + C.DRAG * .6 && cave.nodes[i].s <= s0 + C.DRAG * 1.6 && !flooded(cave, i, lv) && route(cave, here, i, lv));
          if (to >= 0) {
            const n = cave.nodes[to];
            p.x = n.x; p.z = n.z; p.lastPosAt = Date.now();
            island.send(p, { t: 'correct', x: p.x, z: p.z, under: cave.id });
            mob.x = n.x; mob.z = n.z; mob.node = to; mob.path = [];
          }
          island.send(p, { t: 'toast', msg: 'Something grabs you and drags you into the dark.' });
        }
        const g = mob.telegraphed;
        if (g && !players.some(p => island.mobs.inTelegraph(mob, p.x, p.z))) {   // missed: it ends up at the end of its lunge
          const x = mob.x + Math.sin(g.a) * C.LUNGE, z = mob.z + Math.cos(g.a) * C.LUNGE;
          if (Caves.caveHit(cave, x, z)) { mob.x = x; mob.z = z; mob.node = nearestNode(cave, x, z); mob.path = []; }
        }
      }
      mob.telegraphed = null;
      return 'recover';
    },
    recover(mob) { if (mob.t >= 1.6) return 'hunt'; },
    // Light: back off, away from it, then lurk.
    recoil(mob, island, dt, { players }) {
      const cave = caveOf(island, mob); if (!cave) return 'lurk';
      setSurface(mob, island, cave, 'c');
      if (mob.t < dt * 1.5 || !mob.path.length) {
        const src = light(mob, island, cave, players) || mob.heard;
        if (src) {
          const lv = level(island, cave), far = cave.nodes.map((n, i) => i).filter(i => !flooded(cave, i, lv))
            .sort((a, b) => Math.hypot(cave.nodes[b].x - src.x, cave.nodes[b].z - src.z) - Math.hypot(cave.nodes[a].x - src.x, cave.nodes[a].z - src.z));
          if (far.length) goTo(mob, cave, island, cave.nodes[far[0]].x, cave.nodes[far[0]].z);
        }
      }
      follow(mob, cave, C.RECOIL, dt);
      if (mob.t > 3 && !light(mob, island, cave, players)) { mob.heardAt = 0; return 'lurk'; }
    },
    stagger(mob) { mob.telegraphed = null; if (mob.t >= .7) return 'recoil'; },
  },

  onDeath(island, mob) { const st = island.mobs.stateOf('crawler'); st.dead = st.dead || {}; st.dead[mob.cave] = island.day; },
  // For the browser: on the floor or the roof, and how high that is there.
  view(mob) { return [mob.surf || 'f', r2(mob.y || 0)]; },
};
