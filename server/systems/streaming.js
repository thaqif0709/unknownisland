// Streaming (task W2, flag `streaming`): each player gets the chunks of new land around
// them. Every half second the server works out which 32 m chunks are within STREAM_R of
// each player, loads any that aren't loaded (objects.js), and sends their objects; chunks
// further than KEEP_R are taken back. Chunks nobody has are unloaded once their changes
// and today's date are saved. Changes to a chunk's objects only go to players who have it
// (sendObjs in objects.js). The Landing's own objects aren't streamed: everyone has them.
const WG = require('../shared/world-gen');

const STREAM_R = 3;    // chunks each way (7 x 7 around you, about 100 m); the client draws props within 3
const KEEP_R = 4;      // dropped once further than this, so walking along an edge doesn't flicker
const EVERY = .5;      // seconds between checks
const SWEEP = 10;      // seconds between unloading chunks nobody has

const methods = {
  // Work out one player's chunks: load and send new ones, take back far ones.
  streamPlayer(p) {
    if (!p.chunks) { p.chunks = new Set(); p.sentChunks = new Set(); }
    const { cx, cz } = WG.chunkOf(p.x, p.z);
    for (const key of p.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= KEEP_R) continue;
      p.chunks.delete(key);
      if (p.sentChunks.delete(key)) this.send(p, { t: 'unchunk', key });
    }
    for (let i = -STREAM_R; i <= STREAM_R; i++) for (let j = -STREAM_R; j <= STREAM_R; j++) {
      const x = cx + i, z = cz + j, key = WG.chunkKey(x, z);
      if (p.chunks.has(key)) continue;
      p.chunks.add(key);
      this.loadChunk(x, z).then(c => {
        if (this.players.get(p.id) !== p || !p.chunks.has(key) || !c.objects.length) return;
        p.sentChunks.add(key);
        this.send(p, { t: 'chunk', key, objects: c.objects.map(o => this.objectView(o)) });
      }).catch(e => { p.chunks.delete(key); console.error(`[island ${this.id}] chunk ${key} failed to load`, e.message); });
    }
  },
  // Unload every chunk no player has (the ones with unsaved changes wait for the next save).
  sweepChunks() {
    if (!this.chunks) return;
    const wanted = new Set();
    for (const p of this.players.values()) if (p.chunks) for (const k of p.chunks) wanted.add(k);
    for (const c of [...this.chunks.values()]) if (!wanted.has(c.key)) this.unloadChunk(c.cx, c.cz);
  },
};

function onTick(dt) {
  if (!WG.feature('streaming')) return;
  if ((this.streamTimer = (this.streamTimer || 0) - dt) > 0) return;
  this.streamTimer = EVERY;
  for (const p of this.players.values()) this.streamPlayer(p);
  if ((this.sweepTimer = (this.sweepTimer ?? SWEEP) - EVERY) <= 0) { this.sweepTimer = SWEEP; this.sweepChunks(); }
}

module.exports = { methods, onTick };
