// Bosses (C0): one file per boss here, each a mob definition (server/mobs/, CONTRACTS.md
// section 8) plus what the boss system needs (CONTRACTS.md section 10):
//
//   module.exports = {
//     id: 'tidewife', name: 'The Tidewife', kind: 'boss_tidewife',   // kind: its mob kind
//     region: 'landing',            // whose chain summons it (null: only by hand, for testing)
//     next: 'stair',                // the region beating it opens (or null)
//     hp: 400,                      // for one frog; more frogs: RULES.BOSSES.PER_FROG each
//     appear: { when(island, boss) -> bool, x, z, cooldown },   // where, and when it shows (again after a wipe, cooldown s on)
//     leaves(island, boss) -> bool, leaveSay,                   // optional: its time is over (it leaves whole, as after a wipe)
//     onAppear(island, boss, mob), onGone(island, boss),       // optional: its helpers come and go with it
//     kinds: [mob definitions],                                  // optional: helper mob kinds it brings (the Mother's vines)
//     phases: [{ below: .66, name: 'It rears up' }, ...],       // phase n starts below that share of its health
//     trophy: { relic: 'journal key', patch: 'journal key a patch needs' },   // for everyone who fought it
//     ...the mob definition: radius, weak, start, states, view...
//   };
//
// The boss system (server/systems/bosses.js) spawns its mob with the scaled health and sets
// mob.bossId and mob.phase; the mob's states read mob.phase to fight harder.
const BOSSES = {};
for (const name of ['practice', 'tidewife', 'mother', 'ram']) {
  const b = require(`./${name}`);
  if (!b.id || !b.kind || !b.states) throw new Error(`bosses/${name}.js: needs id, kind and states`);
  BOSSES[b.id] = b;
}
module.exports = { BOSSES, byRegion: region => Object.values(BOSSES).find(b => b.region === region) || null };
