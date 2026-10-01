// Sacks on the ground: dropping, giving and picking up.
const WG = require('../shared/world-gen');
const { RULES, ITEMS } = WG;
const { r2, cleanBuckets, REACH_SLACK } = require('./util');

// Tools saved in a sack: well-formed ones only.
const cleanTools = list => (Array.isArray(list) ? list : []).filter(t => t && typeof t.k === 'string' && WG.itemInfo(t.k).uses)   // (tools, P3, and weapons, P6)
  .map(t => ({ k: t.k, d: Math.max(1, Math.min(WG.itemInfo(t.k).uses, t.d | 0 || WG.itemInfo(t.k).uses)) }));

const methods = {
  // A sack on the ground (used when a fire with a bucket on it is swallowed by fog).
  async sackAt(x, z, items) {
    try { const id = await this.store.insertDrop(this.id, r2(x), r2(z), items); this.drops.push({ id, x: r2(x), z: r2(z), items }); if (this.players.size) this.broadcast({ t: 'drop', drop: { id, x: r2(x), z: r2(z), items } }); }
    catch (e) { console.error('[island] could not save sack', e.message); }
  },

  // Drop some of what you carry at your feet, in a sack anyone can pick up
  // (that's how you give things to a friend). Drops next to a sack go into it.
  async onDropItem(p, { key, count, bucket, slot, stack }) {
    const now = Date.now();
    if (p.dead || p.knockedUntil > now) return;
    if (now - (p.lastDropAt || 0) < 150) return;
    // G with a torch in hand (one, not Shift+G for the stack) plants it (torches.js, flag torchlight)
    if (WG.feature('torchlight') && !stack && (count == null || count === 1)) {
      const s = slot != null && p.slots ? p.slots[slot] : null;
      if (s ? s.k === 'torch' : (slot == null && key === 'torch')) { p.lastDropAt = now; return this.plantTorch(p, s ? slot : null); }
    }
    let items, n = 0;
    if (slot != null && p.slots) {   // from one slot (the slot inventory, P2)
      const got = this.takeFromSlot(p, slot, count);
      if (!got) return;
      if (got.bucket != null) {
        const b = (p.buckets || []).find(b => b.id === got.bucket);
        if (!b) return;
        p.buckets = p.buckets.filter(x => x !== b);
        items = { buckets: [b] };
      } else if (got.d) { items = { tools: [{ k: got.key, d: got.d }] }; }   // a tool, worn as it is (P3)
      else { key = got.key; n = got.n; items = { [key]: n }; }
    } else if (bucket != null) {   // a whole bucket, water and all
      const b = (p.buckets || []).find(b => b.id === bucket);
      if (!b) return;
      p.buckets = p.buckets.filter(x => x !== b);
      items = { buckets: [b] };
    } else {
      if (typeof key !== 'string' || !(key in ITEMS)) return;
      if (WG.itemInfo(key).uses && p.slots && (WG.feature('tools') || WG.feature('combat'))) return;   // tools and weapons drop from their slot, wear and all
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
      else if (items.tools) near.items.tools = [...(near.items.tools || []), ...items.tools];
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
      if (items.buckets) p.buckets.push(...items.buckets);   // give it back if it couldn't be saved
      else if (items.tools) for (const t of items.tools) this.give(p, t.k, 1, { d: t.d });
      else this.give(p, key, n);
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
      if (k === 'buckets' || k === 'tools' || !(n > 0)) continue;
      const g = this.give(p, k, n, { sack: false });
      if (g > 0) got.push(`${g} ${ITEMS[k].toLowerCase()}`);
      if (g < n && k in ITEMS) rest[k] = n - g;
    }
    // tools (P3), each with its wear; one that doesn't fit stays in the sack
    for (const t of cleanTools(d.items.tools)) {
      if (this.give(p, t.k, 1, { sack: false, d: t.d }) > 0) got.push(`a ${ITEMS[t.k].toLowerCase()}`);
      else (rest.tools = rest.tools || []).push(t);
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
