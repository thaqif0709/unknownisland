// W1: saved object changes are tagged with the 32 m chunk they're in, so later work (W2)
// can load them area by area. Existing rows are the Landing's objects; their chunk is
// worked out from where the seed put them.
const WG = require('../shared/world-gen');

module.exports = {
  async up(q) {
    await q('ALTER TABLE world_objects ADD COLUMN IF NOT EXISTS chunk TEXT');
    await q('CREATE INDEX IF NOT EXISTS world_objects_chunk ON world_objects (island_id, chunk)');
    const islands = (await q('SELECT id, seed FROM islands')).rows;
    for (const isl of islands) {
      const objects = WG.generateObjects(isl.seed);
      const rows = (await q('SELECT obj_id FROM world_objects WHERE island_id = $1 AND chunk IS NULL', [isl.id])).rows;
      for (const { obj_id: id } of rows) {
        const o = objects[id];
        if (!o) continue;
        const c = WG.chunkOf(o.x, o.z);
        await q('UPDATE world_objects SET chunk = $3 WHERE island_id = $1 AND obj_id = $2', [isl.id, id, WG.chunkKey(c.cx, c.cz)]);
      }
    }
  },
};
