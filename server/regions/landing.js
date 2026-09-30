// The Landing: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by W4 (spawn tables), W8 (request chain), C1 (the Tidewife), C2 (the Crawler). See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'landing',
  spawn: [],       // what grows and lies here: [{ type, count, where }] (W4)
  stilled: null,   // this region's kind of Stilled (a mob kind, P5)
  boss: null,      // this region's boss (a server/bosses file, C0)
  requests: [],    // its Sleeper request chain, in order (W8)
  cave: null,      // its cave (W9)
};
