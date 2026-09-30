// The Stairs: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by C3. See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'stair',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). The Landing keeps its own objects and stays empty here.
  spawn: [   // placeholder until C3: grass, pines on the upper terraces, stones, a little copper
    { type: 'tree', per: 2.5, biomes: ['meadow', 'highland'], minH: .6 },
    { type: 'bush', per: 2, biomes: ['meadow'], minH: .6 },
    { type: 'rock', per: 3.5, minH: .6 },
    { type: 'ore', per: .25, minH: 20, extra: { ore: 'copper' } },
  ],
  stilled: null,   // this region's kind of Stilled (a mob kind, P5)
  boss: null,      // this region's boss (a server/bosses file, C0)
  requests: [],    // its Sleeper request chain, in order (W8)
  cave: null,      // its cave (W9)
};
