// The Mire: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by C5. See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'mire',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). The Landing keeps its own objects and stays empty here.
  spawn: [   // placeholder until C5: low trees and bushes, soft ground to dig
    { type: 'tree', per: 2, biomes: ['forest', 'meadow'], minH: .6 },
    { type: 'bush', per: 5, minH: .6 },
    { type: 'dig', per: 1.5, minH: .4, maxH: 3 },
  ],
  stilled: null,   // this region's kind of Stilled (a mob kind, P5)
  boss: null,      // this region's boss (a server/bosses file, C0)
  requests: [],    // its Sleeper request chain, in order (W8)
  cave: null,      // its cave (W9)
};
