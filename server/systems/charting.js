// Charting (task W7, with the big world): the map starts blank beyond the Landing and fills
// in wherever anyone has walked. One bit per 32 m chunk (WG.chunkObjectId's range: 320 x 320
// chunks), shared by the whole island, saved in islands.seen. Newly seen chunks go to
// everyone as they're found ('seen'); the whole chart comes with the welcome message.
const WG = require('../shared/world-gen');

const SPAN = 320, OFF = 160;       // same grid as the chunk ids: chunks -160..159 each way
const REVEAL = 2;                  // chunks each way around a player (5 x 5, about 160 m across)
const EVERY = 1;                   // seconds between checks

const bitOf = (cx, cz) => (cx + OFF) * SPAN + (cz + OFF);
const inRange = (cx, cz) => cx >= -OFF && cx < SPAN - OFF && cz >= -OFF && cz < SPAN - OFF;

const methods = {
  chartLoad(buf) {
    this.seen = new Uint8Array(SPAN * SPAN / 8);
    if (buf && buf.length === this.seen.length) this.seen.set(buf);
    this.seenDirty = false;
  },
  isSeen(cx, cz) { return inRange(cx, cz) && !!(this.seen[bitOf(cx, cz) >> 3] & (1 << (bitOf(cx, cz) & 7))); },
  // Mark the chunks around a spot as seen. Returns the newly seen ones as [cx, cz].
  chartAround(x, z) {
    const { cx, cz } = WG.chunkOf(x, z), fresh = [];
    for (let i = -REVEAL; i <= REVEAL; i++) for (let j = -REVEAL; j <= REVEAL; j++) {
      const a = cx + i, b = cz + j;
      if (!inRange(a, b) || this.isSeen(a, b)) continue;
      const bit = bitOf(a, b);
      this.seen[bit >> 3] |= 1 << (bit & 7);
      fresh.push([a, b]);
    }
    if (fresh.length) this.seenDirty = true;
    return fresh;
  },
  chartView() { return Buffer.from(this.seen).toString('base64'); },
};

function onTick(dt) {
  if (!WG.feature('bigworld') || !this.seen) return;
  if ((this.chartTimer = (this.chartTimer || 0) - dt) > 0) return;
  this.chartTimer = EVERY;
  const fresh = [];
  for (const p of this.players.values()) if (!p.dead) fresh.push(...this.chartAround(p.x, p.z));
  if (fresh.length) this.broadcast({ t: 'seen', list: fresh });
}

function onJoin() { return WG.feature('bigworld') && this.seen ? { seen: this.chartView() } : {}; }

module.exports = { methods, onTick, onJoin };
