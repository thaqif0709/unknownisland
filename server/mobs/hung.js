// The Hung (task C4, flag `region-wood`): the Stilled of the Weeping Wood. Pale shapes that
// hang from the giants' high branches by long arms, out of reach. At night, walk beneath one
// in the dark and it creaks (a ring on the ground where it will land) and lets go: if it lands
// on you, you're knocked down as the Stilled do. Their weakness is light: a frog with a torch
// in hand, or by a fire or a lantern, they won't drop on. Once down they can be hit (light
// hurts them more), until they climb back up. They come at night and are gone by morning.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2 } = require('../systems/util');

const H = () => RULES.WOOD.HUNG;
const on = () => WG.feature('region-wood') && WG.feature('bigworld');
const inWood = p => !p.under && WG.regionAt(p.x, p.z) === 'wood';
const UP = ['hang', 'creak'];   // up in the branches: out of reach

module.exports = {
  kind: 'hung',
  hp: 4,
  radius: .35,
  start: 'hang',
  weak: { light: 2 },
  adjust(island, mob, dmg) { return UP.includes(mob.state) ? 0 : dmg; },
  view(mob) { return UP.includes(mob.state) ? 1 : mob.state === 'climb' ? 2 : 0; },   // 1 up in the branches, 2 climbing back, 0 on the ground

  // Once a tick: hang under the giants near frogs in the Wood at night; gone at dawn or when
  // nobody is near. Being under them frightens you.
  tick(island, dt, { players }) {
    const mobs = island.mobs, st = mobs.stateOf('hung');
    const here = players.filter(inWood), night = WG.nightFactor(island.time) > .6;
    for (const m of mobs.of('hung')) {
      if (!on() || WG.nightFactor(island.time) < .3 || !here.some(p => Math.hypot(p.x - m.x, p.z - m.z) < 80)) mobs.remove(m);
    }
    if (!on()) return;
    for (const p of here) if (mobs.of('hung').some(m => Math.hypot(p.x - m.x, p.z - m.z) < 8)) p.dread = Math.min(100, p.dread + H().NEAR_DREAD * dt);
    if (!night || !here.length || (st.timer = (st.timer || 0) - dt) > 0) return;
    st.timer = 1;
    if (mobs.of('hung').length >= Math.min(H().MAX, here.length * H().PER_PLAYER)) return;
    // under a giant near someone (not right over their head)
    const p = here[(Math.random() * here.length) | 0];
    const giants = (island.objectsNear ? island.objectsNear(p.x, p.z, 45) : []).filter(o => o.type === 'giant');
    for (let tries = 0; tries < 6 && giants.length; tries++) {
      const g = giants[(Math.random() * giants.length) | 0], a = Math.random() * Math.PI * 2, d = g.r + 1.5 + Math.random() * 4;
      const x = g.x + Math.sin(a) * d, z = g.z + Math.cos(a) * d;
      if (Math.hypot(x - p.x, z - p.z) < 8 || heightAt(x, z) < .3 || mobs.of('hung').some(m => Math.hypot(m.x - x, m.z - z) < 6)) continue;
      mobs.spawn('hung', r2(x), r2(z), { face: Math.random() * 6.28, home: { x: r2(x), z: r2(z) } });
      break;
    }
  },

  states: {
    // Hanging still. A frog in the dark beneath it: it creaks, and a ring marks where it'll land.
    hang(mob, island, dt, { players }) {
      if (mob.t < 3) return;   // (a breath after climbing back up)
      for (const p of players) {
        if (!inWood(p) || island.downed(p) || island.inLight(p)) continue;
        if (Math.hypot(p.x - mob.x, p.z - mob.z) > H().REACH + (island.has(p, 'silk_patch') ? 1.5 : 0)) continue;   // (the Mother's silk draws them)
        island.mobs.telegraph(mob, { shape: 'circle', x: p.x, z: p.z, r: 1.6, ms: H().DROP_MS });
        return 'creak';
      }
    },
    // ...and it lets go: whoever is still in the ring is knocked down (unless they rolled clear).
    creak(mob, island) {
      if (mob.t * 1000 < H().DROP_MS) return;
      const g = mob.telegraphed, now = Date.now();
      for (const p of island.players.values()) {
        if (p.dead || p.under || Math.hypot(p.x - mob.x, p.z - mob.z) > 12) continue;
        island.discover && island.discover(p, 'hung_seen');
        if (!g || !island.mobs.inTelegraph(mob, p.x, p.z) || island.dodging(p)) continue;
        if (now - (p.lastKnockAt || 0) < RULES.STILLED.KNOCK_COOLDOWN_MS) continue;
        p.lastKnockAt = now;
        island.knock(p);
        island.send(p, { t: 'toast', msg: 'Something drops out of the branches onto you.' });
      }
      if (g) { mob.x = g.x; mob.z = g.z; }
      mob.telegraphed = null;
      return 'fallen';
    },
    // On the ground a moment (now it can be hit), then back up the trunk.
    fallen(mob) { if (mob.t >= 3) return 'climb'; },
    climb(mob) {
      if (mob.t < H().CLIMB) return;
      if (mob.home) { mob.x = mob.home.x; mob.z = mob.home.z; }
      return 'hang';
    },
  },
};
