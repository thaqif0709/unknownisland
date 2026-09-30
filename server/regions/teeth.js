// The Teeth: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by C6. See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'teeth',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). The Landing keeps its own objects and stays empty here.
  spawn: [   // placeholder until C6: rock and iron, pines below the snow
    { type: 'rock', per: 6, minH: .6 },
    { type: 'tree', per: 2, minH: .6, maxH: 380 },
    { type: 'ore', per: .6, minH: 150, extra: { ore: 'iron' } },
  ],
  stilled: null,   // this region's kind of Stilled (a mob kind, P5)
  boss: null,      // this region's boss (a server/bosses file, C0)
  requests: [],    // its Sleeper request chain, in order (W8)
  cave: null,      // its cave, if any: see landing.js and CONTRACTS.md section 18 (W9)
};
