// The Landing: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by W4 (spawn tables), W8 (request chain), C1 (the Tidewife), C2 (the Crawler). See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'landing',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). The Landing keeps its own objects and stays empty here.
  spawn: [],
  stilled: null,   // this region's kind of Stilled (a mob kind, P5)
  boss: 'tidewife',   // this region's boss (server/bosses/tidewife.js, C1)
  // Its Sleeper request chain, in order (keys in server/content/sleeper.js). Finishing it
  // calls the region's boss (W8).
  requests: ['landing_watch', 'landing_weight', 'landing_together', 'landing_east', 'landing_call'],
  // While the boss is waiting to be met, this stone says when and where.
  bossHint: { stone: 'shore', text: 'At the lowest tide. The east sand.' },
  // Its cave (W9): the sea cave under the low hill on the east shore. It dips below the sea
  // on the way in, so it floods at high tide and only opens at low tide. The shape is
  // described here and built by Caves.generateCave (server/shared/caves.js, CONTRACTS.md
  // section 18); s is metres in from the mouth.
  cave: {
    id: 'seacave', sea: true, lair: ['crawler'], x: 114.94, z: 24.4, dir: -1.762, length: 40, wander: 1.5,
    floor: [[0, .52], [3, .02], [11, -3], [17, -3], [25, -2], [40, -1.8]],   // down under the sea, then up a little into the chamber
    width: [[0, 1.7], [18, 1.4], [24, 2.6], [30, 5], [37, 4.5], [40, 2.2]],   // half-widths: a narrow way in, a wide chamber
    height: [[0, 2.6], [16, 2.3], [24, 3.2], [31, 4.3], [40, 3]],
    branch: { at: 31, dir: 1, length: 11, floor: [[0, -1.9], [11, -1.2]], width: [[0, 1.5], [9, 1.3], [11, 1.8]], height: [[0, 2.4], [11, 2.2]], wander: .8 },
  },
};
