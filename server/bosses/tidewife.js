// The Tidewife (C1): the Landing's boss, a great crab wearing a wreck for a shell, hung with
// kelp. Called when the Landing's request chain is done; she comes up onto the east sand at the
// lowest tide and goes back down when the tide turns, whole again, so she has to be beaten
// within one low tide. Beating her opens the Stairs.
//
// - Kelp: while it hangs on her, blows only scratch her (KELP_TAKES of them gets through), but
//   fire burns it: KELP of fire damage and it's gone, for the rest of that fight.
// - Her shell takes only part of a blow (SHELL); when she REARS up, her barnacle eyes are
//   open and a blow there hits EYES times as hard, until she crashes down around herself.
// - She swipes her claw at whoever is close (a cone), and throws wreckage at whoever isn't
//   (a circle where they stand). Torn free (below half her health) she's quicker, throws at
//   anyone in the arena, and rears more often.
const Caves = require('../shared/caves');

const LOW = -2.5, TURNS = -1.5;   // she comes with the tide below LOW, and goes when it's rising past TURNS
const KELP = 40, KELP_TAKES = .35, SHELL = .6, EYES = 2.5;
const CLAW = { R: 4.5, W: .8, MS: 900, DMG: 20 };
const THROW = { R: 2.2, MS: 1400, DMG: 16 };
const REAR = { R: 3.8, MS: [2600, 2000], DMG: 26 };
const tideNow = island => Caves.tideLevel(island.time);
const tideRising = island => Caves.tideLevel((island.time + .005) % 1) > tideNow(island);

module.exports = {
  id: 'tidewife', name: 'The Tidewife', kind: 'boss_tidewife',
  region: 'landing', next: 'stair',
  hp: 360,
  appear: { x: 140, z: -40, cooldown: 30, when: island => tideNow(island) < LOW },   // the east sand, at the lowest tide
  leaves: island => tideRising(island) && tideNow(island) > TURNS,
  leaveSay: 'The tide turns. The Tidewife sinks back into the sea, whole again. She will come at the next lowest tide.',
  phases: [{ below: .5, name: 'The Tidewife tears free of the wreck! She’s quicker now.' }],
  trophy: { relic: 'tidewife_eye', patch: 'tidewife_shell' },
  radius: 1.8,
  start: 'stalk',
  // (numbers for the tests and the Hidden Pages)
  tune: { LOW, TURNS, KELP, KELP_TAKES, SHELL, EYES },

  // Kelp, shell and eyes: how much of a blow gets through.
  adjust(island, mob, dmg, tags) {
    if (mob.kelp == null) mob.kelp = KELP;
    if (mob.state === 'rear') return dmg * EYES;   // the barnacle eyes, open while she rears
    if (mob.kelp > 0) {
      if (!tags.includes('fire')) return dmg * KELP_TAKES;
      mob.kelp = Math.max(0, mob.kelp - dmg);
      if (mob.kelp <= 0) island.broadcast({ t: 'toast', msg: 'The Tidewife’s kelp burns away!' });
    }
    return dmg * SHELL;
  },
  view(mob) { return (mob.kelp == null || mob.kelp > 0) ? 1 : 0; },   // kelp still on her (for drawing it)

  states: {
    // sidle after the nearest frog; a breath between attacks (shorter once she's torn free)
    stalk(mob, island, dt, { players }) {
      const b = island.bossOf(mob), near = b && island.bossTarget(b, players);
      if (!near) return;
      const d = Math.hypot(near.x - mob.x, near.z - mob.z);
      mob.face = Math.atan2(near.x - mob.x, near.z - mob.z);
      if (d > 5.5) island.bossStep(b, mob, mob.face, (mob.phase ? 2.2 : 1.4) * dt);
      if (mob.t < (mob.phase ? 2.2 : 3.2)) return;
      mob.moves = (mob.moves || 0) + 1;
      if (mob.moves % (mob.phase ? 2 : 3) === 0) {   // rear up: eyes open, then down she crashes
        island.mobs.telegraph(mob, { shape: 'circle', x: mob.x, z: mob.z, r: REAR.R, ms: REAR.MS[mob.phase ? 1 : 0] });
        return 'rear';
      }
      if (d < CLAW.R) {
        island.mobs.telegraph(mob, { shape: 'cone', x: mob.x, z: mob.z, r: CLAW.R, w: CLAW.W, ms: CLAW.MS });
        return 'claw';
      }
      // wreckage, at the nearest frog (or, torn free, at anyone in the arena)
      const pool = mob.phase ? players.filter(p => !p.under && !island.downed(p) && Math.hypot(p.x - b.x, p.z - b.z) < island.bossArena()) : [];
      const at = pool.length ? pool[Math.floor(Math.random() * pool.length)] : near;
      island.mobs.telegraph(mob, { shape: 'circle', x: at.x, z: at.z, r: THROW.R, ms: THROW.MS });
      island.broadcast({ t: 'bossfx', id: mob.id, k: 'wreck', x: at.x, z: at.z, fx: mob.x, fz: mob.z, ms: THROW.MS });
      return 'throw';
    },
    claw(mob, island) { if (mob.t * 1000 >= CLAW.MS) { strike(mob, island, CLAW.DMG, 'Her claw catches you.'); return 'recover'; } },
    throw(mob, island) { if (mob.t * 1000 >= THROW.MS) { strike(mob, island, THROW.DMG, 'A beam of the wreck knocks you flat.'); return 'recover'; } },
    rear(mob, island) {
      if (mob.t * 1000 < REAR.MS[mob.phase ? 1 : 0]) return;
      strike(mob, island, REAR.DMG, 'She crashes down on you.', true);
      return 'recover';
    },
    recover(mob) { if (mob.t >= 1.3) return 'stalk'; },
  },
  onDeath(island, mob, hit) { island.bossBeaten(mob, hit); },
};

// A blow lands: whoever is still inside its mark is hurt (unless they roll clear, P6); the crash shakes the ground.
function strike(mob, island, dmg, say, heavy) {
  for (const p of island.players.values()) {
    if (p.dead || p.under || !island.mobs.inTelegraph(mob, p.x, p.z)) continue;
    if (island.damagePlayer(p, dmg) === 'hurt') island.send(p, { t: 'toast', msg: say });
  }
  if (heavy) island.broadcast({ t: 'bossfx', id: mob.id, k: 'slam', x: mob.x, z: mob.z });
  mob.telegraphed = null;
}
