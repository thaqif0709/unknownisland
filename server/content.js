// Default content for the journal and the tides. On start the server inserts
// any of these that are missing into the journal_entries and tide_table
// tables; after that the tables are the source of truth, so new entries can be
// added (or tuned) directly in the database without a code change.

const JOURNAL = [
  // bugs (catch them; frogs eat them)
  { key: 'firefly', category: 'bugs', name: 'Firefly', rarity: 'common', description: 'A little green lamp that flies. Tastes faintly of lightning.' },
  { key: 'bark_beetle', category: 'bugs', name: 'Bark beetle', rarity: 'common', description: 'Lives under the forest bark and clicks when you pick it up.' },
  { key: 'dragonfly', category: 'bugs', name: 'Spring dragonfly', rarity: 'uncommon', description: 'Hovers over fresh water. Its wings are glass with ink veins.' },
  { key: 'cricket', category: 'bugs', name: 'Meadow cricket', rarity: 'common', description: 'Sings in the grass until the moment you look for it.' },
  { key: 'moon_moth', category: 'bugs', name: 'Moon moth', rarity: 'rare', description: 'Pale as paper, only out at night. The dust on its wings glows.' },
  // shells
  { key: 'spiral_shell', category: 'shells', name: 'Spiral shell', rarity: 'common', description: 'Hold it to your ear and it hums. Everything here hums.' },
  { key: 'cowrie', category: 'shells', name: 'Cowrie', rarity: 'common', description: 'Smooth and speckled, like a small closed mouth.' },
  { key: 'scallop', category: 'shells', name: 'Scallop', rarity: 'common', description: 'Ribbed like a fan. The sea brings them in at dawn.' },
  { key: 'sand_dollar', category: 'shells', name: 'Sand dollar', rarity: 'uncommon', description: 'A flower printed on a coin. Nobody here takes payment.' },
  { key: 'conch', category: 'shells', name: 'Conch', rarity: 'rare', description: 'A great pink horn. Somebody blew it once; the island remembers.' },
  // sea glass
  { key: 'glass_green', category: 'glass', name: 'Green sea glass', rarity: 'common', description: 'Worn smooth by a very long time in the water.' },
  { key: 'glass_blue', category: 'glass', name: 'Blue sea glass', rarity: 'uncommon', description: 'The colour of the sea on a morning with no fog.' },
  { key: 'glass_amber', category: 'glass', name: 'Amber sea glass', rarity: 'uncommon', description: 'Warm, like a lantern that forgot to go out.' },
  { key: 'glass_violet', category: 'glass', name: 'Violet sea glass', rarity: 'rare', description: 'Nobody has seen a violet bottle. Where did this come from?' },
  { key: 'glass_snail', category: 'bugs', name: 'Glass snail', rarity: 'rare', description: 'Only comes out in the rain. You can see its heart beating through the shell.' },
  { key: 'rain_beetle', category: 'bugs', name: 'Rain beetle', rarity: 'uncommon', description: 'Drinks from the drops on leaves. Shiny as a wet stone.' },
  // full moon
  { key: 'glow_mushroom', category: 'moon', name: 'Glowing mushroom', rarity: 'rare', description: 'Grows in the forest on full-moon nights and is gone by morning.' },
  { key: 'lantern_fish', category: 'moon', name: 'Lantern fish', rarity: 'rare', description: 'Swims into the shallows under a full moon, lit from inside.' },
  // fish
  { key: 'silverfin', category: 'tide', name: 'Silverfin', rarity: 'common', description: 'Washed up with the tide, still cold. Good to eat.' },
  // things the tide should not bring
  { key: 'door_in_sand', category: 'strange', name: 'A door in the sand', rarity: 'rare', description: 'Standing upright, frame and all. It will not open. There is nothing behind it.' },
  { key: 'ringing_bell', category: 'strange', name: 'A bell on a plank', rarity: 'rare', description: 'It rings on its own, even when the sea is flat.' },
  { key: 'your_cloak', category: 'strange', name: 'A cloak like yours', rarity: 'rare', description: 'Same patch, same frayed hem. Still warm.' },
  { key: 'footprints', category: 'strange', name: 'Footprints from the sea', rarity: 'rare', description: 'Webbed feet, walking out of the water, all the way to the fire. None walking back.' },
];

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
];

// Bugs appear around players by biome and time of day (not a database table,
// but their journal text is).
const BUGS = [
  { key: 'firefly', when: 'night', biomes: ['meadow', 'forest', 'spring'], weight: 5 },
  { key: 'moon_moth', when: 'night', biomes: ['meadow', 'forest', 'highland'], weight: .5 },
  { key: 'cricket', when: 'any', biomes: ['meadow', 'highland'], weight: 3 },
  { key: 'bark_beetle', when: 'day', biomes: ['forest'], weight: 4 },
  { key: 'dragonfly', when: 'day', biomes: ['spring', 'meadow', 'beach'], weight: 2, nearWater: true },
  // only in the rain
  { key: 'glass_snail', when: 'any', biomes: ['meadow', 'forest', 'spring'], weight: 2, weather: 'rain' },
  { key: 'rain_beetle', when: 'any', biomes: ['forest', 'meadow'], weight: 3, weather: 'rain' },
  // only on full-moon nights
  { key: 'glow_mushroom', when: 'night', biomes: ['forest'], weight: 4, moon: 'full' },
  { key: 'lantern_fish', when: 'night', biomes: ['sea'], weight: 3, moon: 'full', shallow: true },
];

// Notes the island pins to the driftwood board by itself (overnight). Unsettling,
// but not part of the story; the story notes come later.
const ISLAND_NOTES = [
  'The fire was nice.',
  'You left something by the water.',
  'Count yourselves.',
  'We waited up.',
  'Don\u2019t go in the fog alone.',
  'Who has been sleeping in my spot?',
  'Thank you for the light.',
  'Closer.',
];

module.exports = { JOURNAL, TIDE, BUGS, ISLAND_NOTES };
