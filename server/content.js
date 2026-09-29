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
  // relics: left at the carving stones when the Sleeper is answered
  { key: 'carved_mask', category: 'relics', name: 'Carved mask', rarity: 'rare', description: 'A frog face cut from old wood. The eyes are closed. They were open when you picked it up.' },
  { key: 'eye_stone', category: 'relics', name: 'Eye stone', rarity: 'rare', description: 'A round pebble with one dark ring in it. It is warm on the side facing the hill.' },
  { key: 'old_tooth', category: 'relics', name: 'A very old tooth', rarity: 'rare', description: 'Longer than your arm, smooth as a shell. It came up out of the ground.' },
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
  // weight 0: never brought by the tide, only left by the Sleeper at its stones
  { key: 'carved_mask', weight: 0, kind: 'collectible', label: 'A carved mask', entry: 'carved_mask' },
  { key: 'eye_stone', weight: 0, kind: 'collectible', label: 'An eye stone', entry: 'eye_stone' },
  { key: 'old_tooth', weight: 0, kind: 'collectible', label: 'A very old tooth', entry: 'old_tooth' },
  { key: 'sleeper_gift', weight: 0, kind: 'resource', label: 'Something left by the stone', gives: { oil: 2, seeds: 3 } },
];

// The Sleeper's requests, carved on the stones (sleeper_requests table).
// stone: where it appears (shore, spring, ridge; null = any). days: time to answer.
// conditions.type:
//   offer        bring items to the stone        { item, count }
//   lanterns_lit lit lanterns at once            { count, minHeight }
//   lantern_fed  one lantern lit and full enough { which: 'east'|'shore'|'spring'|'high', fuel }
//   gather       frogs at the stone at night     { count }
//   fires_dawn   fires still burning at sunrise  { count }
//   fog_walk     stand in thick fog, come back   { seconds }
//   bugs         bugs caught while it's carved   { count }
//   find         someone finds a journal entry   { key }
// reward / penalty: a list of { type } from calm, gift, relic, note, light / press, dread, douse
const SLEEPER = [
  { key: 'east_flame', text: 'Feed the east flame before the dark moon.', stone: 'shore', days: 4, minDay: 2,
    conditions: { type: 'lantern_fed', which: 'east', fuel: 900 }, reward: [{ type: 'calm', nights: 1 }, { type: 'gift' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'Warm. I remember warm.', failText: 'The east is dark. So am I.' },
  { key: 'spring_return', text: 'Return what was taken from the spring.', stone: 'spring', days: 3, minDay: 1,
    conditions: { type: 'offer', item: 'stone', count: 8 }, reward: [{ type: 'relic', key: 'eye_stone' }], penalty: [{ type: 'dread', amount: 15 }],
    doneText: 'It is whole. I can see you now.', failText: 'Still taken.' },
  { key: 'three_lights', text: 'Three lights on the ridge. Then I will show you.', stone: 'ridge', days: 5, minDay: 3,
    conditions: { type: 'lanterns_lit', count: 3, minHeight: 7 }, reward: [{ type: 'relic', key: 'old_tooth' }, { type: 'note' }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'Look beneath the stone.', failText: 'Dark on the ridge. I will not show you.' },
  { key: 'fog_walk', text: 'One of you walked into the fog. Walk in after them, and come back.', stone: null, days: 3, minDay: 4,
    conditions: { type: 'fog_walk', seconds: 30 }, reward: [{ type: 'calm', nights: 1 }, { type: 'note' }], penalty: [{ type: 'dread', amount: 20 }],
    doneText: 'You came back. They did not.', failText: 'Nobody came.' },
  { key: 'gather_dark', text: 'Come to me together when it is dark. Stand where I can see you.', stone: null, days: 3, minDay: 2,
    conditions: { type: 'gather', count: 2 }, reward: [{ type: 'relic', key: 'carved_mask' }], penalty: [{ type: 'douse' }],
    doneText: 'Two. Three. I counted you.', failText: 'Alone, all of you.' },
  { key: 'keep_fires', text: 'Keep two fires awake until the sun.', stone: 'shore', days: 3, minDay: 1,
    conditions: { type: 'fires_dawn', count: 2 }, reward: [{ type: 'gift' }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'The dark was shorter.', failText: 'The fires slept. So did you.' },
  { key: 'seeds_mouth', text: 'Seeds for the mouth that feeds you.', stone: 'spring', days: 3, minDay: 1,
    conditions: { type: 'offer', item: 'seeds', count: 6 }, reward: [{ type: 'light' }, { type: 'gift' }], penalty: [{ type: 'press', days: 1 }],
    doneText: 'Fed.', failText: 'Hungry.' },
  { key: 'eat_dark', text: 'Eat what flies in the dark. Five of them.', stone: null, days: 3, minDay: 1,
    conditions: { type: 'bugs', count: 5 }, reward: [{ type: 'calm', nights: 1 }], penalty: [{ type: 'dread', amount: 10 }],
    doneText: 'Good. Grow.', failText: 'Thin frogs.' },
  { key: 'sea_voice', text: 'Bring me the voice of the sea.', stone: 'shore', days: 5, minDay: 3,
    conditions: { type: 'find', key: 'conch' }, reward: [{ type: 'relic', key: 'carved_mask' }, { type: 'calm', nights: 1 }], penalty: [{ type: 'press', days: 2 }],
    doneText: 'I heard it. I have not heard it in so long.', failText: 'Quiet.' },
];
// What the stones say when they aren't asking for anything.
const SLEEPER_IDLE = {
  shore: ['They all came from the sea.', 'Stay.', 'I made the water sweet for you.'],
  spring: ['Drink. It is mine to give.', 'The water comes from inside.', 'Rest here.'],
  ridge: ['I have been asleep a long time.', 'Higher. Closer.', 'Do you hear me breathing?'],
};
// Notes the Sleeper leaves on the board as a reward.
const SLEEPER_NOTES = [
  'There is a pool on the hill shaped like an eye. It was not there before.',
  'Pell was here. Pell is still here.',
  'The ground was warm under the ridge stone this morning.',
  'I put my ear to the rock. It was breathing slower, like something asleep.',
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

module.exports = { JOURNAL, TIDE, BUGS, ISLAND_NOTES, SLEEPER, SLEEPER_IDLE, SLEEPER_NOTES };
