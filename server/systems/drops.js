// Sacks on the ground: dropping, giving and picking up.
const WG = require('../shared/world-gen');
const { RULES, ITEMS } = WG;
const { r2, cleanBuckets, REACH_SLACK } = require('./util');

const methods = {
  // A sack on the ground (used when a fire with a bucket on it is swallowed by fog).
  async sackAt(x, z, items) {
    try { const id = await this.store.insertDrop(this.id, r2(x), r2(z), items); this.drops.push({ id, x: r2(x), z: r2(z), items }); if (this.players.size) this.broadcast({ t: 'drop', drop: { id, x: r2(x), z: r2(z), items } }); }
    catch (e) { console.error('[island] could not save sack', e.message); }
  },

  // Drop some of what you carry at your feet, in a sack anyone can pick up
  // (that's how you give things to a friend). Drops next to a sack go into it.
  async onDropItem(p, { key, count, bucket, slot }) {
    const now = Date.now();
    if (p.dead || p.knockedUntil > now) return;
    if (now - (p.lastDropAt || 0) < 150) return;
    let items, n = 0;
    if (slot != null && p.slots) {   // from one slot (the slot inventory, P2)
      const got = this.takeFromSlot(p, slot, count);
      if (!got) return;
      if (got.bucket != null) {
        const b = (p.buckets || []).find(b => b.id === got.bucket);
        if (!b) return;
        p.buckets = p.buckets.filter(x => x !== b);
        items = { buckets: [b] };
      } else { key = got.key; n = got.n; items = { [key]: n }; }
    } else if (bucket != null) {   // a whole bucket, water and all
      const b = (p.buckets || []).find(b => b.id === bucket);
      if (!b) return;
      p.buckets = p.buckets.filter(x => x !== b);
      items = { buckets: [b] };
    } else {
      if (typeof key !== 'string' || !(key in ITEMS)) return;
      n = Math.min(Math.max(1, count | 0), this.count(p, key));
      if (n <= 0) return;
      this.take(p, key, n);
      items = { [key]: n };
    }
    p.lastDropAt = now;
    this.sendMe(p);
    const x = r2(p.x + Math.sin(p.face) * .9), z = r2(p.z + Math.cos(p.face) * .9);
    const near = this.drops.find(d => Math.hypot(d.x - x, d.z - z) < 1.5);
    if (near) {
      if (items.buckets) near.items.buckets = [...(near.items.buckets || []), ...items.buckets];
      else near.items[key] = (near.items[key] || 0) + n;
      this.broadcast({ t: 'dropitems', id: near.id, items: near.items });
      this.store.updateDrop(near.id, near.items).catch(e => console.error('[island] could not update drop', e.message));
      return;
    }
    try {
      const id = await this.store.insertDrop(this.id, x, z, items);
      this.drops.push({ id, x, z, items });
      this.broadcast({ t: 'drop', drop: { id, x, z, items } });
    } catch (e) {
      if (items.buckets) p.buckets.push(...items.buckets); else this.give(p, key, n);   // give it back if it couldn't be saved
      this.sendMe(p);
      console.error('[island] could not save drop', e.message);
    }
  },

  async pickUp(p, id) {
    const d = this.drops.find(d => d.id === id);
    if (!d || Math.hypot(d.x - p.x, d.z - p.z) > RULES.REACH + 1 + REACH_SLACK) return;
    const got = [], rest = {};
    // with the slot inventory, only what fits: the rest stays in the sack
    for (const [k, n] of Object.entries(d.items)) {
      if (k === 'buckets' || !(n > 0)) continue;
      const g = this.give(p, k, n, { sack: false });
      if (g > 0) got.push(`${g} ${ITEMS[k].toLowerCase()}`);
      if (g < n && k in ITEMS) rest[k] = n - g;
    }
    const bs = cleanBuckets(d.items.buckets);
    if (bs.length) { p.buckets.push(...bs); got.push(bs.length > 1 ? `${bs.length} buckets` : 'a bucket'); }
    this.sendMe(p);
    if (Object.keys(rest).length) {
      d.items = rest;
      this.broadcast({ t: 'dropitems', id: d.id, items: d.items });
      this.send(p, { t: 'toast', msg: got.length ? `You take what fits in your bag: ${got.join(', ')}. The rest stays in the sack.` : 'Your bag is full.' });
      this.store.updateDrop(d.id, d.items).catch(e => console.error('[island] could not update drop', e.message));
      return;
    }
    this.drops = this.drops.filter(x => x !== d);
    this.broadcast({ t: 'undrop', id });
    this.send(p, { t: 'toast', msg: got.length ? `You pick up the sack: ${got.join(', ')}.` : 'An empty sack.' });
    try { await this.store.deleteDrop(id); } catch (e) { console.error('[island] could not delete drop', e.message); }
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  dropitem(p, msg) { return this.onDropItem(p, msg); },
};

module.exports = { methods, messages };
