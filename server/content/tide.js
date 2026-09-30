// weight: relative chance per wash-up; minDay: earliest island day it can appear.
// kind: resource (gives items), food (hunger), collectible (journal only), strange.
const TIDE = [
  { key: 'driftwood', weight: 30, kind: 'resource', label: 'Driftwood', gives: { wood: 3 } },
  { key: 'crate_seeds', weight: 7, kind: 'resource', label: 'A washed-up crate', gives: { seeds: 3, stone: 2 } },
  { key: 'crate_oil', weight: 4, kind: 'resource', label: 'A washed-up crate', gives: { oil: 1, seeds: 1 }, minDay: 2 },
  { key: 'silverfin', weight: 12, kind: 'food', label: 'A silverfin', gives: { hunger: 20 }, entry: 'silverfin' },
  { key: 'spiral_shell', weight: 9, kind: 'collectible', label: 'A spiral shell', entry: 'spiral_shell' },
  { key: 'cowrie', weight: 8, kind: 'collectible', label: 'A cowrie', entry: 'cowrie' },
  { key: 'scallop', weight: 8, kind: 'collectible', label: 'A scallop', entry: 'scallop' },
  { key: 'sand_dollar', weight: 4, kind: 'collectible', label: 'A sand dollar', entry: 'sand_dollar' },
  { key: 'conch', weight: 1.5, kind: 'collectible', label: 'A conch', entry: 'conch', minDay: 3 },
  { key: 'glass_green', weight: 6, kind: 'collectible', label: 'Green sea glass', entry: 'glass_green' },
  { key: 'glass_blue', weight: 4, kind: 'collectible', label: 'Blue sea glass', entry: 'glass_blue' },
  { key: 'glass_amber', weight: 3, kind: 'collectible', label: 'Amber sea glass', entry: 'glass_amber' },
  { key: 'glass_violet', weight: 1, kind: 'collectible', label: 'Violet sea glass', entry: 'glass_violet', minDay: 4 },
  { key: 'door_in_sand', weight: 1.5, kind: 'strange', label: 'A door, standing in the sand', entry: 'door_in_sand', minDay: 3 },
  { key: 'ringing_bell', weight: 1.5, kind: 'strange', label: 'A bell on a plank', entry: 'ringing_bell', minDay: 2 },
  { key: 'your_cloak', weight: 1, kind: 'strange', label: 'A cloak like yours', entry: 'your_cloak', minDay: 4 },
  { key: 'footprints', weight: 1, kind: 'strange', label: 'Footprints', entry: 'footprints', minDay: 5 },
  // weight 0: never brought by the tide, only left by the Sleeper at its stones
  { key: 'carved_mask', weight: 0, kind: 'collectible', label: 'A carved mask', entry: 'carved_mask' },
  { key: 'eye_stone', weight: 0, kind: 'collectible', label: 'An eye stone', entry: 'eye_stone' },
  { key: 'old_tooth', weight: 0, kind: 'collectible', label: 'A very old tooth', entry: 'old_tooth' },
  { key: 'sleeper_gift', weight: 0, kind: 'resource', label: 'Something left by the stone', gives: { oil: 2, seeds: 3 } },
];
module.exports = { TIDE };
