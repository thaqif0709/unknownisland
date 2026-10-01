// The Straw Giant: a practice boss for testing the boss system (C0). It belongs to no region,
// so no chain calls it; admins summon it with /boss practice. A big straw dummy that turns to
// the nearest frog, marks a wide circle where they stand and slams it; below half its health
// it gets angry: quicker, and it sweeps a line across the arena too. Fire hurts it twice over.
const SLAM = { R: 2.8, MS: 1100, DMG: 22 };
const SWEEP = { LEN: 12, W: 2.4, MS: 1300, DMG: 18 };

module.exports = {
  id: 'practice', name: 'The Straw Giant', kind: 'boss_practice',
  region: null, next: null,
  hp: 120,
  appear: { when: () => true, cooldown: 20 },
  phases: [{ below: .5, name: 'The Straw Giant shakes with rage!' }],
  trophy: { relic: 'eye_stone' },
  radius: 1.2,
  weak: { fire: 2 },
  start: 'watch',

  states: {
    // turn to the nearest frog in the arena; walk up to them; a breath between blows
    watch(mob, island, dt, { players }) {
      const b = island.bossOf(mob), near = b && island.bossTarget(b, players);
      if (!near) return;
      const d = Math.hypot(near.x - mob.x, near.z - mob.z);
      mob.face = Math.atan2(near.x - mob.x, near.z - mob.z);
      if (d > 5) island.bossStep(b, mob, mob.face, (mob.phase ? 2.4 : 1.6) * dt);
      if (mob.t < (mob.phase ? 1.6 : 2.8)) return;
      if (mob.phase && (mob.sweeps = (mob.sweeps || 0) + 1) % 2 === 0) {   // angry: every other blow a sweep
        island.mobs.telegraph(mob, { shape: 'line', x: mob.x, z: mob.z, a: mob.face, len: SWEEP.LEN, w: SWEEP.W, ms: SWEEP.MS });
        return 'sweep';
      }
      island.mobs.telegraph(mob, { shape: 'circle', x: near.x, z: near.z, r: SLAM.R, ms: SLAM.MS });
      return 'slam';
    },
    slam(mob, island) { if (mob.t * 1000 >= SLAM.MS) { strike(mob, island, SLAM.DMG); return 'recover'; } },
    sweep(mob, island) { if (mob.t * 1000 >= SWEEP.MS) { strike(mob, island, SWEEP.DMG); return 'recover'; } },
    recover(mob) { if (mob.t >= 1.2) return 'watch'; },
  },
  onDeath(island, mob, hit) { island.bossBeaten(mob, hit); },
};

// The blow lands: everyone still inside the marked shape is hurt (or rolls clear, or goes down),
// and the ground shakes.
function strike(mob, island, dmg) {
  for (const p of island.players.values()) {
    if (p.dead || p.under || !island.mobs.inTelegraph(mob, p.x, p.z)) continue;
    if (island.damagePlayer(p, dmg) === 'hurt') island.send(p, { t: 'toast', msg: 'The Straw Giant’s blow knocks the wind out of you.' });
  }
  const g = mob.telegraphed;
  island.broadcast({ t: 'bossfx', id: mob.id, k: 'slam', x: g ? g.x : mob.x, z: g ? g.z : mob.z });
  mob.telegraphed = null;
}
