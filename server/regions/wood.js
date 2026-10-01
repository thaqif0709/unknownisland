// The Weeping Wood: everything specific to this region lives here, so region packs never edit
// the same file. Filled in by C4 (flag `region-wood`). See docs/roadmap/CONTRACTS.md section 6.
module.exports = {
  id: 'wood',
  // What grows and lies here, per 32 m chunk (W4): [{ type, per, biomes?, minH?, maxH?, pad?, extra? }]
  // (see WG.generateChunk). These came first and must stay first, in this order: the objects
  // they make keep their ids (and their saved changes) whatever is added after them.
  spawn: [
    { type: 'tree', per: 14, pad: .5, minH: .6 },
    { type: 'bush', per: 4, minH: .6 },
    { type: 'rock', per: 1, minH: .6 },
  ],
  // The Wood's own things, only while `region-wood` is on (after the rules above, see
  // server/systems/objects.js). What E does to them: server/systems/wood.js. The giants are
  // few (they're what you see from far off) and the undergrowth thin, for phones.
  spawnFlag: 'region-wood',
  spawnMore: [
    { type: 'giant', per: .35, minH: 2, pad: 6, extra: { climb: true } },   // giant trees: climb their vines, an axe takes hardwood
    { type: 'resin', per: .8, minH: 1 },
    { type: 'vine', per: 1, minH: 1 },
    { type: 'fruit', per: .7, minH: 1 },
    { type: 'bigleaf', per: 1.2, minH: 1 },
    { type: 'amber', per: .25, minH: 4, pad: 1 },
  ],
  stilled: 'hung',   // this region's kind of Stilled (server/mobs/hung.js)
  boss: 'mother',    // the Hanging Mother (server/bosses/mother.js)
  // Its Sleeper request chain, in order (keys in server/content/sleeper.js). Finishing it
  // calls the region's boss (W8).
  requests: ['wood_resin', 'wood_rope', 'wood_hollow', 'wood_lights', 'wood_mantis'],
  bossHint: { stone: 'spring', text: 'At night, under the tallest trees. Look up.' },
  // Its cave (W9): a root hollow, under the roots of a giant on a rising slope.
  cave: {
    id: 'roothollow', flag: 'region-wood', x: 1450, z: -1400, dir: 1.571, length: 34, wander: 1.2,
    floor: [[0, 22], [4, 21.4], [14, 18.2], [24, 16.6], [34, 16.2]],   // down among the roots
    width: [[0, 1.6], [10, 1.4], [18, 2.6], [26, 4], [34, 2.4]],
    height: [[0, 2.6], [12, 2.4], [22, 3.4], [30, 3.8], [34, 2.8]],
    branch: { at: 20, dir: 1, length: 10, floor: [[0, 17.2], [10, 16.8]], width: [[0, 1.2], [10, 1.6]], height: [[0, 2.2], [10, 2.4]], wander: .6 },
  },
};
