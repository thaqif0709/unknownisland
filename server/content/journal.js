const JOURNAL = [
  // bugs (catch them; frogs eat them)
  { key: 'firefly', category: 'bugs', name: 'Firefly', rarity: 'common', description: 'A little green lamp that flies. Tastes faintly of lightning.' },
  { key: 'bark_beetle', category: 'bugs', name: 'Bark beetle', rarity: 'common', description: 'Lives under the forest bark and clicks when you pick it up.' },
  { key: 'dragonfly', category: 'bugs', name: 'Spring dragonfly', rarity: 'uncommon', description: 'Hovers over fresh water. Its wings are glass with ink veins.' },
  { key: 'cricket', category: 'bugs', name: 'Meadow cricket', rarity: 'common', description: 'Sings in the grass until the moment you look for it.' },
  { key: 'moon_moth', category: 'bugs', name: 'Moon moth', rarity: 'rare', description: 'Pale as paper, only out at night. The dust on its wings glows.' },
  // the Stairs (C3). `flag`: hidden (journal, Hidden Pages) until that feature is on.
  { key: 'stone_beetle', flag: 'region-stair', category: 'bugs', name: 'Stone beetle', rarity: 'common', description: 'Grey and ridged, like a pebble that changed its mind. Warm from the sun.' },
  { key: 'terrace_grasshopper', flag: 'region-stair', category: 'bugs', name: 'Terrace grasshopper', rarity: 'common', description: 'Jumps from one step to the next and never falls. Show-off.' },
  { key: 'wind_moth', flag: 'region-stair', category: 'bugs', name: 'Wind moth', rarity: 'rare', description: 'Only flies high on the steps at night, sideways on the wind. It never lands where you think.' },
  { key: 'leaning_seen', flag: 'region-stair', category: 'stilled', name: 'The Leaning', rarity: 'rare', description: 'Pale shapes on the steps that lean into the wind and only move when it blows. You stood behind a stone and it went past.' },
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
  { key: 'pool_minnow', flag: 'fishing', category: 'fish', name: 'Pool minnow', rarity: 'uncommon', description: 'A quick little fish from the spring pools, bright as a dropped needle. Nobody knows how it got up here.' },
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
module.exports = { JOURNAL };
