  // ================= Chunk objects (new land, streamed by the server) =================
  // The Landing's objects come from /api/world (the `objects` list, ids 0, 1, 2 ...). Land
  // beyond it arrives in 32 m chunks from the server ('chunk' messages) with ids from
  // WG.CHUNK_ID_BASE up, and is taken back ('unchunk') when you walk away. They join the
  // same per-chunk buckets, so drawing, targeting and collisions treat them like any other.
  const chunkObjs = new Map();   // id -> object, for streamed objects only
  const objectById = id => (id < WG.CHUNK_ID_BASE ? objects[id] : chunkObjs.get(id));
  function addChunkObjects(key, list) {
    removeChunkObjects(key);
    if (!buckets.has(key)) buckets.set(key, []);
    const bucket = buckets.get(key), c = chunks.get(key);
    for (const src of list) {
      const o = { id: src.id, type: src.type, x: src.x, z: src.z, r: src.r, s: src.s, maxScale: src.maxScale, size: 1,
        species: src.species, ore: src.ore, state: src.state || WG.defaultState(src.type), mesh: null };
      chunkObjs.set(o.id, o); bucket.push(o);
      if (c && c.props) buildMesh(o);
    }
  }
  function removeChunkObjects(key) {
    const bucket = buckets.get(key);
    if (!bucket) return;
    const keep = [];
    for (const o of bucket) {
      if (o.id < WG.CHUNK_ID_BASE) { keep.push(o); continue; }
      removeMesh(o); chunkObjs.delete(o.id);
    }
    if (keep.length) buckets.set(key, keep); else buckets.delete(key);
  }
  UI.net.on('chunk', m => addChunkObjects(m.key, m.objects));
  UI.net.on('unchunk', m => removeChunkObjects(m.key));
  // A fresh welcome (a reconnect) means the server will send the chunks again.
  UI.net.on('welcome', () => { for (const key of [...buckets.keys()]) removeChunkObjects(key); });

