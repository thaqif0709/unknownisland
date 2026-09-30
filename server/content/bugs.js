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
module.exports = { BUGS };
