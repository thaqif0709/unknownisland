// Fish (P7, flag fishing): what bites where. Not a database table (like the bugs); their
// journal text is (server/content/journal.js). Each fish:
//   water: the waters it lives in ('sea', 'spring'; later 'river', 'swamp', 'ice')
//   region: whose waters ('landing'; the other regions' fish come with their packs)
//   when: 'day', 'night' or 'any'; moon: 'full' for full-moon nights only; weather: 'rain'
//   weight: how often it bites, against the others that could; bait: times that with bait
//   rarity: common, uncommon, rare or strange (RULES.FISHING.GAMES: which game decides it)
//   hint: where and when it bites, for the journal's fish page
const FISH = [
  { key: 'silverfin', water: ['sea'], region: 'landing', when: 'any', weight: 10, rarity: 'common',
    hint: 'in the sea, day or night' },
  { key: 'pool_minnow', water: ['spring'], region: 'landing', when: 'any', weight: 10, bait: 2, rarity: 'uncommon',
    hint: 'in the spring pools; it likes bait' },
  { key: 'lantern_fish', water: ['sea'], region: 'landing', when: 'night', moon: 'full', weight: 4, rarity: 'rare',
    hint: 'in the sea on full-moon nights' },
];

module.exports = { FISH };
