// The Teeth: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by C6 (flag `region-teeth`). See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'teeth',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). These came first and must stay first, in this order: the objects
  // they make keep their ids (and their saved changes) whatever is added after them.
  spawn: [   // rock and iron, pines below the snow
    { type: 'rock', per: 6, minH: .6 },
    { type: 'tree', per: 2, minH: .6, maxH: 380 },
    { type: 'ore', per: .6, minH: 150, extra: { ore: 'iron' } },
  ],
  // The Teeth's own things, only while `region-teeth` is on (after the rules above, see
  // server/systems/objects.js). What E does to them: server/systems/teeth.js. Snow lies above
  // RULES.TEETH.SNOW_LINE.
  spawnFlag: 'region-teeth',
  spawnMore: [
    { type: 'ice', per: .8, minH: 260 },                              // slabs of ice, up in the snow
    { type: 'crystal', per: .4, minH: 200, pad: 1 },                  // crystal in the rock
    { type: 'pinesap', per: .7, minH: 30, maxH: 300 },                 // split pines weeping resin
    { type: 'hare', per: .6, minH: 120 },                              // snow hares' forms (shed fur)
    { type: 'icehole', per: .12, minH: 200, pad: 2 },                 // holes in frozen pools (the ice char)
    { type: 'ore', per: .35, minH: 220, extra: { ore: 'silver' } },   // silver, high up
  ],
  stilled: 'frozen',   // this region's kind of Stilled (server/mobs/frozen.js)
  boss: 'ram',         // the White Ram (server/bosses/ram.js)
  // Its Sleeper request chain, in order (keys in server/content/sleeper.js). Finishing it
  // calls the region's boss (W8).
  requests: ['teeth_fur', 'teeth_ice', 'teeth_cave', 'teeth_moth', 'teeth_char'],
  bossHint: { stone: 'ridge', text: 'At nightfall, on the high snowfield ringed with rock. It brings the blizzard.' },
  // Its cave (W9): an ice cave, into the mountain on the south side of the Teeth.
  cave: {
    id: 'icecave', flag: 'region-teeth', x: -4, z: -2750, dir: 0, length: 38, wander: 1,
    floor: [[0, 268.9], [6, 267.6], [16, 265.1], [26, 263.2], [38, 263]],   // down into the ice
    width: [[0, 1.6], [8, 1.5], [18, 2.8], [28, 4.2], [38, 3]],
    height: [[0, 2.6], [10, 2.6], [20, 3.4], [30, 4.4], [38, 3.4]],
  },
};
