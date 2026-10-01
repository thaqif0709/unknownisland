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
  // only on the Stairs (C3, flag region-stair)
  { key: 'stone_beetle', when: 'day', biomes: ['meadow', 'highland'], weight: 4, region: 'stair', flag: 'region-stair' },
  { key: 'terrace_grasshopper', when: 'day', biomes: ['meadow'], weight: 5, region: 'stair', flag: 'region-stair' },
  { key: 'wind_moth', when: 'night', biomes: ['meadow', 'highland'], weight: 1.5, region: 'stair', flag: 'region-stair', minH: 90 },
  // only in the Weeping Wood (C4, flag region-wood)
  { key: 'lantern_beetle', when: 'night', biomes: ['forest'], weight: 4, region: 'wood', flag: 'region-wood' },
  { key: 'glasswing', when: 'day', biomes: ['forest'], weight: 4, region: 'wood', flag: 'region-wood' },
  { key: 'bark_mantis', when: 'any', biomes: ['forest'], weight: 1.2, region: 'wood', flag: 'region-wood', minH: 15 },
  // only in the Teeth (C6, flag region-teeth): up in the snow
  { key: 'snow_moth', when: 'night', biomes: ['highland', 'peak'], weight: 3, region: 'teeth', flag: 'region-teeth', minH: 260 },
  { key: 'ice_louse', when: 'day', biomes: ['highland', 'peak'], weight: 4, region: 'teeth', flag: 'region-teeth', minH: 200 },
];
module.exports = { BUGS };
