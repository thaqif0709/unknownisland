// The Hanging Mother (C4): the Weeping Wood's boss. Something huge and pale that hangs in the
// canopy by three great vines. Called when the Wood's request chain is done; she comes at night,
// under the tallest trees, and draws back up into the leaves at dawn, whole again.
//
// - Up in the branches she's out of reach. Her shadow slides over the frog she's after (a ring on
//   the ground) and she drops on it, snatches, and is hauled back up: get out of the shadow.
// - Light blinds her: she won't go for a frog in light (a torch in hand, a fire or lantern close).
// - Cut her three vines (on the ground, around her) and she falls: on the ground she can be hit,
//   light hurting her twice over, until she climbs back up and the vines grow back.
// - Below half her health she drops quicker, and stays down less long.
const WG = require('../shared/world-gen');
const { r2 } = require('../systems/util');

const SHADOW = { R: 2.6, MS: [1600, 1200], DMG: 26 };
const FALLEN = [13, 9];   // seconds on the ground once her vines are cut
const SNATCH = 1.4;       // seconds down after a drop (she can be hit, a little) before she's hauled up
const VINE = { HP: 30, R: 9 };
const UP = ['hang', 'aim'];

const vineDef = {
  kind: 'mother_vine', hp: VINE.HP, radius: .4, start: 'sway',
  states: { sway() {} },
  onDeath(island, vine) {
    const b = island.bossState && island.bossState.get('mother'), mob = b && b.mob;
    if (!mob || mob.gone || !b.vines) return;
    b.vines = b.vines.filter(v => v !== vine.id);
    if (b.vines.length) return island.broadcast({ t: 'toast', msg: `A vine parts. ${b.vines.length === 1 ? 'One holds' : `${b.vines.length} hold`} her now.` });
    island.broadcast({ t: 'toast', msg: 'The last vine parts. The Hanging Mother falls!' });
    island.broadcast({ t: 'bossfx', id: mob.id, k: 'slam', x: mob.x, z: mob.z });
    island.mobs.setState(mob, 'fallen');
  },
};
function growVines(island, b) {
  b.vines = [0, 1, 2].map(i => {
    const a = i * Math.PI * 2 / 3 + .3;
    return island.mobs.spawn('mother_vine', r2(b.x + Math.sin(a) * VINE.R), r2(b.z + Math.cos(a) * VINE.R), { bossId: b.id }).id;
  });
}
function cutAll(island, b) { for (const id of b.vines || []) { const v = island.mobs.byId(id); if (v) island.mobs.remove(v); } b.vines = []; }

module.exports = {
  id: 'mother', name: 'The Hanging Mother', kind: 'boss_mother',
  region: 'wood', next: 'mire',
  hp: 420,
  appear: { x: 1500, z: -1500, cooldown: 60, when: island => WG.nightFactor(island.time) > .6 },   // under the tallest trees, at night
  leaves: island => WG.nightFactor(island.time) < .3,
  leaveSay: 'Day comes. The Hanging Mother draws up into the leaves, whole again. She will come back at night.',
  phases: [{ below: .5, name: 'The Hanging Mother shrieks. She drops quicker now.' }],
  trophy: { relic: 'mother_eye', patch: 'mother_silk' },
  kinds: [vineDef],
  radius: 1.6,
  weak: { light: 2 },
  start: 'hang',
  tune: { SHADOW, FALLEN, VINE },
  onAppear(island, b) { growVines(island, b); },
  onGone(island, b) { cutAll(island, b); },
  // out of reach up in the branches; down, the light hurts her (weak), and a snatch is quick
  adjust(island, mob, dmg) { return UP.includes(mob.state) ? 0 : mob.state === 'snatch' ? dmg * .5 : dmg; },
  view(mob) { return UP.includes(mob.state) ? 1 : 0; },   // 1: up in the canopy

  states: {
    // up in the leaves, her shadow drifting after a frog in the dark (light blinds her)
    hang(mob, island, dt, { players }) {
      const b = island.bossOf(mob);
      if (!b) return;
      const prey = island.bossTarget(b, players.filter(p => !island.inLight(p)));
      if (!prey) return;
      const a = Math.atan2(prey.x - mob.x, prey.z - mob.z);
      island.bossStep(b, mob, a, Math.min(Math.hypot(prey.x - mob.x, prey.z - mob.z), (mob.phase ? 4 : 3) * dt));
      if (mob.t < (mob.phase ? 2 : 3)) return;
      island.mobs.telegraph(mob, { shape: 'circle', x: prey.x, z: prey.z, r: SHADOW.R, ms: SHADOW.MS[mob.phase ? 1 : 0] });
      return 'aim';
    },
    aim(mob, island) {
      if (mob.t * 1000 < SHADOW.MS[mob.phase ? 1 : 0]) return;
      const g = mob.telegraphed;
      for (const p of island.players.values()) {
        if (p.dead || p.under || !island.mobs.inTelegraph(mob, p.x, p.z)) continue;
        if (island.damagePlayer(p, SHADOW.DMG) === 'hurt') island.send(p, { t: 'toast', msg: 'She drops on you out of the dark.' });
      }
      if (g) { mob.x = g.x; mob.z = g.z; }
      island.broadcast({ t: 'bossfx', id: mob.id, k: 'slam', x: mob.x, z: mob.z });
      mob.telegraphed = null;
      return 'snatch';
    },
    snatch(mob) { if (mob.t >= SNATCH) return 'hang'; },
    // her vines cut: down on the ground, until she climbs back up and they grow again
    fallen(mob, island) {
      if (mob.t < FALLEN[mob.phase ? 1 : 0]) return;
      const b = island.bossOf(mob);
      if (b) { cutAll(island, b); growVines(island, b); }
      island.broadcast({ t: 'toast', msg: 'The Hanging Mother climbs back into the dark. Her vines grow down again.' });
      return 'hang';
    },
  },
  onDeath(island, mob, hit) { island.bossBeaten(mob, hit); },
};
