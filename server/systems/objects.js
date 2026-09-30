// World objects (trees, palms, bushes, rocks, ore, dig patches): the only code that knows
// where they're kept. The Landing's objects (ids below WG.CHUNK_ID_BASE) are all in memory,
// as always. New land comes in 32 m chunks made from the seed and each region's spawn
// table (WG.generateChunk); a chunk is loaded when asked for, with its saved changes.
// Only objects that differ from how the seed made them are saved (world_objects rows,
// tagged with their chunk). Task W1; which chunks are loaded and who gets them is
// systems/streaming.js (W2).
const WG = require('../shared/world-gen');
const { RULES } = WG;

// Spawn tables from the region files: { region: [rule] } (plain data, see WG.generateChunk).
const SPAWN_TABLES = Object.fromEntries(WG.REGIONS.map(r => [r.id, require(`../regions/${r.id}`).spawn || []]));
// For testing streaming before any region has land of its own: SPAWN_TEST=1 scatters extra
// trees and rocks over the Landing's chunks (never set this on the live island).
if (process.env.SPAWN_TEST) SPAWN_TABLES.landing = [{ type: 'tree', per: 3, pad: .5 }, { type: 'rock', per: 1.5 }, { type: 'bush', per: 1 }];

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

  // What happens to one object at sunrise, as of today (used at dawn, and when a chunk
  // wakes up after a dawn has passed). Returns true, and marks it for saving, if it changed.
  regrow(o) {
    const was = JSON.stringify(o.state);
    let s = o.state;
    // Felled trees and palms come back as saplings. They sprouted on the
    // morning they were due, which matters after a long catch-up.
    if ((o.type === 'tree' || o.type === 'palm') && s.gone && this.day - s.felledDay >= RULES.TREE_REGROW_DAYS) {
      s = o.state = { ...WG.defaultState(o.type), planted: s.felledDay + RULES.TREE_REGROW_DAYS };
      if (o.type === 'palm') s.coconuts = 0;
    }
    if (o.type === 'rock' && s.gone && this.day - s.goneDay >= RULES.ROCK_REGROW_DAYS) s = o.state = WG.defaultState(o.type);
    if (o.type === 'bush' && s.gone && this.day - s.goneDay >= RULES.TREE_REGROW_DAYS) s = o.state = WG.defaultState(o.type);
    if (o.type === 'ore' && s.gone && this.day - s.goneDay >= RULES.ORE_REGROW_DAYS) s = o.state = WG.defaultState(o.type);
    if (o.type === 'dig' && s.dug) s = o.state = WG.defaultState(o.type);
    const g = WG.growth(o.type, s, this.day, 0.25);
    if (o.type === 'palm' && !s.gone && g >= 1) s.coconuts = RULES.COCONUTS;
    if (o.type === 'bush' && g >= RULES.FRUIT_AT) s.berries = true;
    if (s.planted != null && g >= 1) delete s.planted;
    if (JSON.stringify(o.state) === was) return false;
    this.dirty.add(o.id);
    return true;
  },
  // Tell clients about changed objects: the Landing's go to everyone, a chunk's only to
  // players who have that chunk.
  sendObjs(list) {
    const landing = [], byChunk = new Map();
    for (const o of list) {
      if (o.id < WG.CHUNK_ID_BASE) { landing.push(o); continue; }
      const k = this.objectChunk(o);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(o);
    }
    if (landing.length && this.players.size) this.broadcast({ t: 'objs', list: landing.map(o => [o.id, o.state]) });
    for (const [k, os] of byChunk) {
      const text = JSON.stringify({ t: 'objs', list: os.map(o => [o.id, o.state]) });
      for (const p of this.players.values()) if (p.sentChunks && p.sentChunks.has(k)) this.sendRaw(p, text);
    }
  },
  // What a client needs to draw an object (everything it has, state included).
  objectView(o) { return { ...o }; },

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
      // Asleep through a dawn (or more)? Catch up now: regrowth only depends on the day.
      const savedDay = await this.store.loadChunkDay(this.id, key);
      if (savedDay != null && savedDay < this.day) for (const o of objects) this.regrow(o);
      const chunk = { cx, cz, key, objects, savedDay: savedDay === this.day ? savedDay : null };
      this.chunks.set(key, chunk);
      for (const o of objects) this.chunkObjs.set(o.id, o);
      return chunk;
    })();
    this.chunkLoads.set(key, load);
    try { return await load; } finally { this.chunkLoads.delete(key); }
  },
  // Forget a chunk. Returns false (and keeps it) until its changes and today's date are
  // saved, so waking it up later neither loses anything nor regrows twice.
  unloadChunk(cx, cz) {
    const key = WG.chunkKey(cx, cz), c = this.chunks && this.chunks.get(key);
    if (!c) return true;
    if (c.objects.some(o => this.dirty.has(o.id)) || c.savedDay !== this.day) return false;
    for (const o of c.objects) this.chunkObjs.delete(o.id);
    this.chunks.delete(key);
    return true;
  },
};

module.exports = { methods };
