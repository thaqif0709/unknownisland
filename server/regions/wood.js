// The Weeping Wood: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by C4. See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'wood',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). The Landing keeps its own objects and stays empty here.
  spawn: [   // placeholder until C4 (giant trees come with it): thick forest
    { type: 'tree', per: 14, pad: .5, minH: .6 },
    { type: 'bush', per: 4, minH: .6 },
    { type: 'rock', per: 1, minH: .6 },
  ],
  stilled: null,   // this region's kind of Stilled (a mob kind, P5)
  boss: null,      // this region's boss (a server/bosses file, C0)
  requests: [],    // its Sleeper request chain, in order (W8)
  cave: null,      // its cave (W9)
};
