// The Landing: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by W4 (spawn tables), W8 (request chain), C1 (the Tidewife), C2 (the Crawler). See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'landing',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). The Landing keeps its own objects and stays empty here.
  spawn: [],
  stilled: null,   // this region's kind of Stilled (a mob kind, P5)
  boss: null,      // this region's boss (a server/bosses file, C0)
  // Its Sleeper request chain, in order (keys in server/content/sleeper.js). Finishing it
  // calls the region's boss (W8).
  requests: ['landing_watch', 'landing_weight', 'landing_together', 'landing_east', 'landing_call'],
  // While the boss is waiting to be met, this stone says when and where.
  bossHint: { stone: 'shore', text: 'At the lowest tide. The east sand.' },
  cave: null,      // its cave (W9)
};
