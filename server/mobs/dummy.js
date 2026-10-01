// A straw dummy on a post: the test mob for the framework (never spawns by itself; admins
// spawn one with /spawn dummy, and the tests do). It turns to the nearest frog, marks a
// circle on the ground where they stand, and slams it a moment later. Fire hurts it twice
// as much; a hit staggers it.
const TELL_MS = 900;

module.exports = {
  kind: 'dummy',
  hp: 30,
  radius: .5,
  start: 'idle',
  weak: { fire: 2 },

  states: {
    idle(mob, island, dt, { players }) {
      let near = null, nd = 1e9;
      for (const p of players) { const d = Math.hypot(p.x - mob.x, p.z - mob.z); if (d < nd) { nd = d; near = p; } }
      if (!near || nd > 7) return;
      mob.face = Math.atan2(near.x - mob.x, near.z - mob.z);
      if (nd > 5 || mob.t < 1) return;   // a breath between attacks
      island.mobs.telegraph(mob, { shape: 'circle', x: near.x, z: near.z, r: 2.2, ms: TELL_MS });
      return 'windup';
    },
    windup(mob) { if (mob.t * 1000 >= TELL_MS) return 'strike'; },
    strike(mob, island, dt, { players }) {
      for (const p of players) {
        if (!island.mobs.inTelegraph(mob, p.x, p.z)) continue;
        if (island.damagePlayer(p, 10) === 'hurt') island.send(p, { t: 'toast', msg: 'The straw dummy slams the ground where you stood.' });   // (dodged or downed with combat, P6)
      }
      mob.telegraphed = null;
      return 'recover';
    },
    recover(mob) { if (mob.t >= 1.5) return 'idle'; },
    stagger(mob) { mob.telegraphed = null; if (mob.t >= .6) return 'idle'; },
  },
};
