// The Stairs: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by C3 (flag `region-stair`). See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'stair',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). These came first and must stay first, in this order: the objects
  // they make keep their ids (and their saved changes) whatever is added after them.
  spawn: [
    { type: 'tree', per: 2.5, biomes: ['meadow', 'highland'], minH: .6 },
    { type: 'bush', per: 2, biomes: ['meadow'], minH: .6 },
    { type: 'rock', per: 3.5, minH: .6 },
    { type: 'ore', per: .25, minH: 20, extra: { ore: 'copper' } },
  ],
  // The Stairs' own things, only while `region-stair` is on (after the rules above, see
  // server/systems/objects.js). What E does to them: server/systems/stair.js.
  spawnFlag: 'region-stair',
  spawnMore: [
    { type: 'tree', per: 1.5, biomes: ['highland'], minH: 120 },          // more pines on the upper terraces
    { type: 'flint', per: 1.2, minH: 12 },
    { type: 'herb', per: 1.4, biomes: ['meadow'], minH: 8 },
    { type: 'flax', per: 1.1, biomes: ['meadow'], minH: 8, maxH: 130 },
    { type: 'ruin', per: .2, minH: 25, pad: 1.4 },                         // old walls, tumbling down the terraces
    { type: 'standing', per: .12, minH: 20, pad: 1.2 },                    // standing stones: the only shelter from the wind
    { type: 'ore', per: .35, minH: 60, extra: { ore: 'tin' } },            // tin (bronze, once there are tools that wear out, P3)
  ],
  stilled: 'leaning',   // this region's kind of Stilled (server/mobs/leaning.js)
  boss: null,           // the Keeper of Steps (C0 first)
  // Its Sleeper request chain, in order (keys in server/content/sleeper.js). Finishing it
  // calls the region's boss (W8).
  requests: ['stair_flint', 'stair_mend', 'stair_mine', 'stair_herbs', 'stair_climb'],
  bossHint: { stone: 'ridge', text: 'At dusk, in the village on the steps. Know my marks.' },
  // Its cave (W9): an old mine, dug into a terrace riser on the east side, with a side gallery.
  cave: {
    id: 'oldmine', flag: 'region-stair', x: 270, z: -764, dir: 0, length: 32, wander: .6,
    floor: [[0, 63.71], [4, 63.41], [20, 62.21], [32, 61.51]],   // a gentle slope down, as miners dug it
    width: [[0, 1.3], [16, 1.2], [22, 2.2], [28, 3], [32, 2]],
    height: [[0, 2.4], [16, 2.2], [24, 3], [32, 2.6]],
    branch: { at: 12, dir: -1, length: 9, floor: [[0, 62.71], [9, 62.31]], width: [[0, 1.1], [9, 1.4]], height: [[0, 2.1], [9, 2.2]], wander: .4 },
  },
};
