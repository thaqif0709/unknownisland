// World objects (trees, palms, bushes, rocks, ore, dig patches): the only code that knows
// where they're kept. The Landing's objects (ids below WG.CHUNK_ID_BASE) are all in memory,
// as always. New land comes in 32 m chunks made from the seed and each region's spawn
// table (WG.generateChunk); a chunk is loaded when asked for, with its saved changes.
// Only objects that differ from how the seed made them are saved (world_objects rows,
// tagged with their chunk). Task W1; W2 decides which chunks are loaded and sends them.
const WG = require('../shared/world-gen');

// Spawn tables from the region files: { region: [rule] } (plain data, see WG.generateChunk).
const SPAWN_TABLES = Object.fromEntries(WG.REGIONS.map(r => [r.id, require(`../regions/${r.id}`).spawn || []]));

const methods = {
  // One object by id, or undefined (also for a chunk that isn't loaded).
  obj(id) {
    return id < WG.CHUNK_ID_BASE ? this.objects[id] : this.chunkObjs && this.chunkObjs.get(id);
  },
  // Every object in memory: the Landing's, then every loaded chunk's.
  *eachObject() {
    yield* this.objects;
    if (this.chunks) for (const c of this.chunks.values()) yield* c.objects;
  },
  // The chunk an object belongs to ("cx,cz"), for saving.
  objectChunk(o) { const c = WG.chunkOf(o.x, o.z); return WG.chunkKey(c.cx, c.cz); },
  spawnTables() { return SPAWN_TABLES; },

  // Make a chunk's objects from the seed and apply its saved changes. Safe to call again.
  async loadChunk(cx, cz) {
    const key = WG.chunkKey(cx, cz);
    if (!this.chunks) { this.chunks = new Map(); this.chunkObjs = new Map(); this.chunkLoads = new Map(); }
    if (this.chunks.has(key)) return this.chunks.get(key);
    if (this.chunkLoads.has(key)) return this.chunkLoads.get(key);   // already on its way
    const load = (async () => {
      const objects = WG.generateChunk(this.seed, cx, cz, SPAWN_TABLES).map(o => ({ ...o, state: WG.defaultState(o.type) }));
      const byId = new Map(objects.map(o => [o.id, o]));
      for (const saved of await this.store.loadChunkStates(this.id, key)) {
        const o = byId.get(saved.id);
        if (o) o.state = Object.assign(WG.defaultState(o.type), saved.state);
      }
      const chunk = { cx, cz, key, objects };
      this.chunks.set(key, chunk);
      for (const o of objects) this.chunkObjs.set(o.id, o);
      return chunk;
    })();
    this.chunkLoads.set(key, load);
    try { return await load; } finally { this.chunkLoads.delete(key); }
  },
  // Forget a chunk (after its changes are saved). Returns false if it has unsaved changes.
  unloadChunk(cx, cz) {
    const key = WG.chunkKey(cx, cz), c = this.chunks && this.chunks.get(key);
    if (!c) return true;
    if (c.objects.some(o => this.dirty.has(o.id))) return false;
    for (const o of c.objects) this.chunkObjs.delete(o.id);
    this.chunks.delete(key);
    return true;
  },
};

module.exports = { methods };
