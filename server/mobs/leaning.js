// The Leaning (task C3, flag `region-stair`): the Stilled of the Stairs. Pale shapes that
// stand leaning into the wind and only move when it gusts, carried with it (they can steer a
// little towards you, never against the wind). One that reaches you in a gust shoves you
// over and down the terrace. Their weakness is shelter: with a standing stone or an old wall
// between you and the wind, they can't touch you, and go on past. They come out at night on
// the Stairs, upwind of whoever is there, and are gone by morning.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2 } = require('../systems/util');

const L = {
  PER_PLAYER: 2, ALONE_EXTRA: 1, MAX: 8,
  SPAWN_MIN: 16, SPAWN_MAX: 34,   // metres upwind of a player
  SPEED: 5.5,                     // carried by a gust (walking is 4.6: get out of its way, or behind a stone)
  STEER: .9,                      // radians either side of the wind it can steer towards you
  REACH: 1.2, SHOVE: 5,           // how close it must come; how far downwind it throws you
  SHELTER: 2.6,                   // a stone or wall this close, on the side the wind comes from, shelters you
  GUST_EVERY: 9, GUST_FOR: 3,     // seconds
  NEAR_DREAD: 2,                  // a second, while one is within 10 m
};
const on = () => WG.feature('region-stair') && WG.feature('bigworld');

// The wind: where it blows towards (radians, like `face`: 0 = +z), turning slowly over the
// night, and whether it's gusting right now. The same for everyone.
function wind(now) {
  const t = now / 1000;
  return { a: 3.4 + Math.sin(t / 240) * 1.1 + Math.sin(t / 67) * .25, gust: (t % L.GUST_EVERY) < L.GUST_FOR };
}
// Is p sheltered from the wind by a standing stone or an old wall?
function sheltered(island, p, a) {
  const up = { x: -Math.sin(a), z: -Math.cos(a) };   // towards where the wind comes from
  for (const o of island.objectsNear ? island.objectsNear(p.x, p.z, L.SHELTER + 1.5) : []) {
    if ((o.type !== 'standing' && o.type !== 'ruin') || o.state.gone) continue;
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
    if (d < L.SHELTER + o.r && (dx * up.x + dz * up.z) / (d || 1) > .35) return true;
  }
  return false;
}
const onStairs = p => WG.regionAt(p.x, p.z) === 'stair' && !p.under;

module.exports = {
  kind: 'leaning',
  hp: 3,
  radius: .35,
  start: 'stand',
  weak: { light: 2 },
  L,
  wind,
  sheltered,

  // Once a tick: come out at night upwind of players on the Stairs; gone at dawn, or when
  // nobody is near. Being close frightens you.
  tick(island, dt, { players }) {
    const mobs = island.mobs, st = mobs.stateOf('leaning'), now = Date.now();
    const here = players.filter(onStairs), night = WG.nightFactor(island.time) > .6;
    for (const m of mobs.of('leaning')) {
      if (!on() || WG.nightFactor(island.time) < .3 || !here.some(p => Math.hypot(p.x - m.x, p.z - m.z) < 80)) mobs.remove(m);
    }
    if (!on()) return;
    for (const p of here) if (mobs.of('leaning').some(m => Math.hypot(p.x - m.x, p.z - m.z) < 10)) p.dread = Math.min(100, p.dread + L.NEAR_DREAD * dt);
    if (!night || !here.length || (st.timer = (st.timer || 0) - dt) > 0) return;
    st.timer = 1;
    let want = 0;
    for (const p of here) want += L.PER_PLAYER + (island.isAlone(p) ? L.ALONE_EXTRA : 0);
    if (mobs.of('leaning').length >= Math.min(L.MAX, want)) return;
    const p = here[(Math.random() * here.length) | 0], w = wind(now);
    for (let tries = 0; tries < 8; tries++) {
      const a = w.a + Math.PI + (Math.random() - .5) * 1.4, r = L.SPAWN_MIN + Math.random() * (L.SPAWN_MAX - L.SPAWN_MIN);
      const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      if (WG.regionAt(x, z) !== 'stair' || island.veilAt(x, z)) continue;
      mobs.spawn('leaning', r2(x), r2(z), { face: w.a });
      break;
    }
  },

  states: {
    // Still, leaning into the wind, until it gusts.
    stand(mob) { if (wind(Date.now()).gust) return 'drift'; },
    // Carried on the gust, steering a little towards the nearest frog it can reach.
    drift(mob, island, dt, { players }) {
      const now = Date.now(), w = wind(now);
      if (!w.gust) return 'stand';
      let best = null, bd = 40;
      for (const p of players) {
        if (!onStairs(p) || p.knockedUntil > now) continue;
        const d = Math.hypot(p.x - mob.x, p.z - mob.z);
        let da = Math.atan2(p.x - mob.x, p.z - mob.z) - w.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        if (d < bd && Math.abs(da) < L.STEER + .4) { bd = d; best = { p, da }; }
      }
      const a = w.a + (best ? Math.max(-L.STEER, Math.min(L.STEER, best.da)) : 0);
      const nx = mob.x + Math.sin(a) * L.SPEED * dt, nz = mob.z + Math.cos(a) * L.SPEED * dt;
      if (WG.regionAt(nx, nz) === 'stair' && heightAt(nx, nz) > .3) { mob.x = nx; mob.z = nz; }
      mob.face = w.a;
      if (!best || bd > L.REACH) return;
      const p = best.p;
      if (sheltered(island, p, w.a)) {   // it can't touch you: it goes on past
        if (!p.leaningSeen) { p.leaningSeen = true; island.discover && island.discover(p, 'leaning_seen'); }
        return;
      }
      if (now - (p.lastKnockAt || 0) < RULES.STILLED.KNOCK_COOLDOWN_MS) return;
      p.lastKnockAt = now;
      island.knock(p);
      // thrown downwind, down the slope if it can
      for (let k = L.SHOVE; k > 0; k -= 1) {
        const x = p.x + Math.sin(w.a) * k, z = p.z + Math.cos(w.a) * k;
        if (heightAt(x, z) > .3 && !island.veilAt(x, z)) { p.x = r2(x); p.z = r2(z); p.lastPosAt = now; island.send(p, { t: 'correct', x: p.x, z: p.z }); break; }
      }
      island.send(p, { t: 'toast', msg: 'The wind, and something in it, throws you down the steps.' });
      return 'stand';
    },
  },
  // For the browser: whether it's gusting, and where the wind blows.
  view() { const w = wind(Date.now()); return [w.gust ? 1 : 0, r2(w.a)]; },
};
