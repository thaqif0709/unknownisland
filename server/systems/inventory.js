// Inventory: the only code that touches what a player carries (p.inv counts, p.slots, p.tools,
// p.buckets). Everything else goes through these methods, so tools that wear out (P3) only
// have to change this file. See docs/roadmap/CONTRACTS.md section 4.
//
// With the `slots` flag (P2) what you carry is in p.slots: 8 hotbar slots (0-7) and a 30-slot
// bag (8-37). A slot is null, { k, n } (n of item k, at most its stack size) or { b: id } (one
// of p.buckets). p.inv is still kept, as the totals, so everything that counts things keeps
// working and the flag can be switched off again without losing anything. Buckets live in
// p.buckets as before (buckets.js, crafting.js and drops.js change that list); syncBuckets
// gives each one a slot, and every change goes out through inventoryView, which calls it.
//
// With the `tools` flag too (P3) the tools are items: { k: 'pickaxe', n: 1, d: uses left }, one
// to a slot. The one in your hand is the one you use (toolFor), and each use wears it down
// (wearTool); worn out, it breaks and leaves one of its material. Tools you owned before (p.tools)
// become items the first time you join with the flag on.
const WG = require('../shared/world-gen');
const { RULES, ITEMS } = WG;
const { cleanBuckets } = require('./util');

const S = () => RULES.SLOTS;
const slotCount = () => S().HOTBAR + S().BAG;
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const isBucket = s => !!s && s.b != null;
const stackOf = k => WG.itemInfo(k).stack;
const usesOf = k => WG.itemInfo(k).uses || 0;   // tools (P3): how many uses a new one has; 0 for other things
const toolsOn = () => WG.feature('tools') && WG.feature('slots');
// A new slot of n of k (a tool also gets its uses left, d: full unless given)
const newSlot = (k, n, d) => (usesOf(k) ? { k, n, d: Math.max(1, Math.min(usesOf(k), d || usesOf(k))) } : { k, n });
// Where a new item goes: the hotbar first (so what you carry shows at the bottom of the
// screen, as it did before the bag), then the bag.
const order = () => range(0, slotCount());
function recount(p) {
  for (const k of Object.keys(ITEMS)) p.inv[k] = 0;
  for (const s of p.slots) if (s && !isBucket(s)) p.inv[s.k] += s.n;
}
// Put up to n of k into slots (existing stacks first, then empty slots). Returns how many fitted.
function fill(slots, k, n, idx = order(k), d) {
  const max = stackOf(k);
  let left = n;
  for (const i of idx) { const s = slots[i]; if (left > 0 && s && s.k === k && s.n < max) { const m = Math.min(left, max - s.n); s.n += m; left -= m; } }
  for (const i of idx) { if (left > 0 && !slots[i]) { const m = Math.min(left, max); slots[i] = newSlot(k, m, d); left -= m; } }
  return n - left;
}
function room(slots, k) {
  const max = stackOf(k);
  return slots.reduce((sum, s) => sum + (!s ? max : s.k === k ? Math.max(0, max - s.n) : 0), 0);
}
// Take n of k out of the slots (the bag's last slots first, the one in your hand last).
function remove(p, k, n) {
  const idx = range(0, slotCount()).reverse().filter(i => i !== p.sel);
  if (p.sel >= 0) idx.push(p.sel);
  let left = n;
  for (const i of idx) {
    const s = p.slots[i];
    if (left <= 0) break;
    if (!s || s.k !== k) continue;
    const m = Math.min(left, s.n);
    s.n -= m; left -= m;
    if (s.n <= 0) p.slots[i] = null;
  }
  recount(p);
}
// Give every bucket a slot (the hotbar first: they're used from your hand) and clear the
// slots of buckets that are gone. A bucket with no free slot keeps waiting for one.
function syncBuckets(p) {
  const ids = new Set((p.buckets || []).map(b => b.id));
  for (let i = 0; i < p.slots.length; i++) if (isBucket(p.slots[i]) && !ids.has(p.slots[i].b)) p.slots[i] = null;
  const placed = new Set(p.slots.filter(isBucket).map(s => s.b));
  for (const b of p.buckets || []) {
    if (placed.has(b.id)) continue;
    const i = range(0, slotCount()).find(j => !p.slots[j]);
    if (i == null) break;
    p.slots[i] = { b: b.id };
  }
}
// Lay out a player's things in slots: the saved arrangement where it still matches what they
// have, then whatever is left over in the usual order. Returns { slots, over }: over is what
// didn't fit (it goes in a sack at their feet when they join).
function buildSlots(inv, buckets, saved) {
  const slots = Array(slotCount()).fill(null), left = { ...inv }, over = {};
  const ids = new Set(buckets.map(b => b.id)), used = new Set();
  (Array.isArray(saved) ? saved : []).slice(0, slotCount()).forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    if (s.b != null) { if (ids.has(s.b) && !used.has(s.b)) { slots[i] = { b: s.b }; used.add(s.b); } return; }
    if (typeof s.k !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, s.k)) return;
    const n = Math.min(s.n | 0, left[s.k] || 0, stackOf(s.k));
    if (n > 0) { slots[i] = newSlot(s.k, n, s.d | 0); left[s.k] -= n; }   // (a tool keeps its wear)
  });
  for (const k of Object.keys(ITEMS)) {
    if (!(left[k] > 0)) continue;
    const got = fill(slots, k, left[k]);
    if (got < left[k]) over[k] = left[k] - got;
  }
  return { slots, over };
}

const methods = {
  // ---- the items API ----
  // Add n of an item. Returns how many were added (0 for an unknown item). With slots on,
  // what doesn't fit goes in a sack at the player's feet, unless opts.sack is false.
  // A tool can be given part-worn: opts.d is its uses left.
  give(p, key, n = 1, opts = {}) {
    if (!(key in p.inv)) return 0;
    n = Math.max(0, Math.floor(n));
    if (!p.slots) { p.inv[key] += n; return n; }
    const got = fill(p.slots, key, n, order(), opts.d);
    recount(p);
    const left = n - got;
    if (left > 0 && opts.sack !== false) {
      this.sackAt(p.x, p.z, { [key]: left });
      this.send(p, { t: 'toast', msg: `Your bag is full: ${left} ${ITEMS[key].toLowerCase()} in a sack at your feet.` });
    }
    return got;
  },
  // Remove n of an item if the player has that many. Returns true if removed.
  take(p, key, n = 1) {
    if (!(n >= 0) || (p.inv[key] || 0) < n) return false;
    if (p.slots) remove(p, key, n); else p.inv[key] -= n;
    return true;
  },
  count(p, key) { return p.inv[key] || 0; },
  // How many more of an item the player could carry (Infinity without slots).
  roomFor(p, key) { return p.slots ? room(p.slots, key) : Infinity; },
  // What's in the player's hand (the selected hotbar slot), or null.
  held(p) {
    if (!p.slots) return p.hold ? { key: p.hold } : null;
    const s = p.sel >= 0 ? p.slots[p.sel] : null;
    return !s ? null : isBucket(s) ? { key: 'bucket', bucket: s.b } : { key: s.k };
  },

  // ---- tools (items of their own with the tools flag, P3) ----
  // Owned at all: as a tool kept forever (before P3), or one in the bag.
  hasTool(p, id) { return p.tools.includes(id) || this.count(p, id) > 0; },
  addTool(p, id) {
    if (toolsOn() && p.slots) return this.give(p, id, 1);   // a new one, as an item
    if (!p.tools.includes(id)) p.tools.push(id);
  },
  // The tool you'd use for a job ('axe', 'pick' or 'shovel'): its key, or null for bare hands.
  // With the tools flag it's the one in your hand; before that, owning one was enough (the
  // iron pickaxe first).
  toolFor(p, job) {
    if (!toolsOn() || !p.slots) return ({ axe: ['axe'], pick: ['ironpick', 'pickaxe'], shovel: ['shovel'] }[job] || []).find(t => this.hasTool(p, t)) || null;
    const h = this.held(p);
    return h && WG.itemInfo(h.key).tool === job ? h.key : null;
  },
  // One use of the tool in your hand. Returns what to add to the toast: a warning when it's
  // nearly worn out, or that it broke (and the material it leaves), or ''.
  wearTool(p, key) {
    if (!toolsOn() || !p.slots || !key) return '';
    const s = p.sel >= 0 ? p.slots[p.sel] : null;
    if (!s || s.k !== key || !s.d) return '';
    s.d--;
    const name = ITEMS[key].toLowerCase(), back = WG.itemInfo(key).returns;
    if (s.d <= 0) {
      p.slots[p.sel] = null;
      recount(p);
      if (back) this.give(p, back, 1);
      this.fx(p, 'break');
      return ` Your ${name} breaks${back ? ` (you keep 1 ${ITEMS[back].toLowerCase()})` : ''}.`;
    }
    if (s.d === Math.floor(usesOf(key) * RULES.TOOLS.WARN)) return ` Your ${name} is wearing out (${s.d} uses left). Repair it at a lit hearth.`;
    return '';
  },
  // Repairing the tool in your hand at a lit hearth, for part of its recipe (RULES.TOOLS.REPAIR).
  // Returns a message, or null when there's nothing to repair (so E does what it usually does).
  repairTool(p, f) {
    if (!toolsOn() || !p.slots || !f || f.kind !== 'hearth' || !(f.fuel > 0)) return null;
    const s = p.sel >= 0 ? p.slots[p.sel] : null;
    if (!s || !usesOf(s.k) || s.d >= usesOf(s.k)) return null;
    const cost = this.repairCost(s.k), name = ITEMS[s.k].toLowerCase();
    if (!this.canAfford(p, cost)) return `Mending your ${name} needs ${Object.entries(cost).map(([k, n]) => `${n} ${ITEMS[k].toLowerCase()}`).join(', ')}.`;
    this.spend(p, cost);
    s.d = usesOf(s.k);
    this.fx(p, 'swing');
    return `You mend your ${name} in the hearth's heat. Good as new.`;
  },
  repairCost(key) {
    const r = WG.recipeById(key);
    return Object.fromEntries(Object.entries(r ? r.cost : {}).map(([k, n]) => [k, Math.max(1, Math.ceil(n * RULES.TOOLS.REPAIR))]));
  },

  // ---- costs and bundles ----
  canAfford(p, cost) { return Object.entries(cost).every(([k, n]) => this.count(p, k) >= n); },
  spend(p, cost) { for (const [k, n] of Object.entries(cost)) this.take(p, k, n); },
  gain(p, items) { for (const [k, n] of Object.entries(items)) this.give(p, k, n); },
  // Take up to n (as many as they have). Returns how many were taken.
  takeUpTo(p, key, n) {
    const k = Math.max(0, Math.min(n, this.count(p, key)));
    if (k > 0) this.take(p, key, k);
    return k;
  },
  // Take a share of everything carried (rounded up), e.g. when knocked down. Returns { key: n }.
  takeShare(p, share) {
    const items = {};
    for (const [k, n] of Object.entries(p.inv)) {
      if (WG.itemInfo(k).kind === 'tool') continue;   // tools stay in your hand (P3)
      const lose = Math.ceil(n * share); if (lose > 0) { items[k] = lose; this.take(p, k, lose); }
    }
    return items;
  },
  // Everything carried is lost (tools and buckets are kept).
  // Everything in your slots, taken out on dying, as a sack's items: { key: n, tools: [{ k, d }],
  // buckets: [...] } (tools and weapons keep their wear). It's left where you fell (players.js).
  // (Without the slot inventory, tools aren't items: they stay with you, as before.)
  takeCarried(p) {
    const out = {};
    if (p.slots) {
      for (const s of p.slots) {
        if (!s) continue;
        if (isBucket(s)) { const b = (p.buckets || []).find(b => b.id === s.b); if (b) (out.buckets = out.buckets || []).push(b); }
        else if (usesOf(s.k)) for (let i = 0; i < s.n; i++) (out.tools = out.tools || []).push({ k: s.k, d: s.d });
        else out[s.k] = (out[s.k] || 0) + s.n;
      }
      p.slots = p.slots.map(() => null);
      p.buckets = [];
      p.sel = -1;
      recount(p);
    } else for (const k of Object.keys(p.inv)) if (p.inv[k] > 0) { out[k] = p.inv[k]; p.inv[k] = 0; }
    return out;
  },
  clearItems(p) {
    if (p.slots) { p.slots = p.slots.map(s => (isBucket(s) || (s && usesOf(s.k)) ? s : null)); recount(p); }
    else for (const k of Object.keys(p.inv)) p.inv[k] = 0;
  },

  // ---- slots (flag slots) ----
  // Take up to n from one slot. Returns { key, n } (and d, a tool's uses left) or { bucket: id } taken, or null.
  takeFromSlot(p, i, n) {
    const s = p.slots && Number.isInteger(i) ? p.slots[i] : null;
    if (!s) return null;
    if (isBucket(s)) { p.slots[i] = null; return { bucket: s.b }; }
    const m = Math.min(s.n, Math.max(1, Math.floor(n) || 1));
    s.n -= m;
    if (s.n <= 0) p.slots[i] = null;
    recount(p);
    return s.d ? { key: s.k, n: m, d: s.d } : { key: s.k, n: m };
  },
  // Move count from slot `from` to slot `to` (to -1: the other part, bag <-> hotbar, wherever it
  // fits). Into an empty slot, onto the same item up to its stack size, or a whole stack swaps
  // places with another. Anything else is refused. Nothing is ever made or lost: the items only
  // change slots. Returns true if something moved.
  moveSlots(p, from, to, count) {
    const N = slotCount();
    if (!p.slots || !Number.isInteger(from) || from < 0 || from >= N) return false;
    const src = p.slots[from];
    if (!src) return false;
    if (to === -1) {
      const idx = from < S().HOTBAR ? range(S().HOTBAR, N) : range(0, S().HOTBAR);
      if (isBucket(src) || src.d) {   // a bucket or a tool moves as it is
        const i = idx.find(j => !p.slots[j]);
        if (i == null) return false;
        p.slots[i] = src; p.slots[from] = null;
        return true;
      }
      const got = fill(p.slots, src.k, src.n, idx);
      src.n -= got;
      if (src.n <= 0) p.slots[from] = null;
      return got > 0;
    }
    if (!Number.isInteger(to) || to < 0 || to >= N || to === from) return false;
    const dst = p.slots[to];
    if (isBucket(src)) { p.slots[from] = dst; p.slots[to] = src; return true; }
    let c = count == null ? src.n : Math.floor(count);
    if (!(c >= 1)) return false;
    c = Math.min(c, src.n);
    if (!dst) {
      if (c === src.n) { p.slots[to] = src; p.slots[from] = null; return true; }   // the whole stack (a tool keeps its wear)
      p.slots[to] = { k: src.k, n: c };
    } else if (dst.k === src.k && dst.n < stackOf(src.k)) {
      c = Math.min(c, stackOf(src.k) - dst.n);
      dst.n += c;
    } else {
      if (c !== src.n) return false;   // only a whole stack swaps
      p.slots[from] = dst; p.slots[to] = src;
      return true;
    }
    src.n -= c;
    if (src.n <= 0) p.slots[from] = null;
    return true;
  },

  // ---- loading, sending and saving ----
  // From the island_members row: { inv, tools, buckets, slots, over, slotsSaved }.
  loadInventory(m) {
    const saved = m.inventory || {};
    const inv = { wood: m.wood, stone: m.stone };
    for (const k of Object.keys(ITEMS)) if (!(k in inv)) inv[k] = Math.max(0, saved[k] | 0);
    let tools = (Array.isArray(saved.tools) ? saved.tools : []).filter(t => WG.recipeById(t));
    const buckets = cleanBuckets(saved.buckets);
    // the tools flag (P3): tools you owned become items (once: the list is saved empty after)
    if (toolsOn()) { for (const t of tools) if (t in inv && !(inv[t] > 0)) inv[t] = 1; tools = []; }
    // With slots off the saved arrangement is kept as it was, for when they're back on.
    if (!WG.feature('slots')) return { inv, tools, buckets, slotsSaved: Array.isArray(saved.slots) ? saved.slots : undefined };
    const { slots, over } = buildSlots(inv, buckets, saved.slots);
    const p = { inv, slots, buckets };
    recount(p);
    syncBuckets(p);
    return { inv, tools, buckets, slots, over };
  },
  // What the player's own client is told.
  inventoryView(p) {
    if (!p.slots) return { inv: p.inv, tools: p.tools, buckets: p.buckets };
    syncBuckets(p);
    return { inv: p.inv, tools: p.tools, buckets: p.buckets, slots: p.slots, sel: p.sel };
  },
  // The columns saved for the player: wood and stone have their own; the rest is JSON.
  inventorySave(p) {
    const { wood, stone, ...rest } = p.inv;
    const inventory = { ...rest, tools: [...p.tools], buckets: p.buckets || [] };
    const slots = p.slots || p.slotsSaved;
    if (slots) inventory.slots = slots.map(s => (s ? { ...s } : null));
    return { wood, stone, inventory };
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  // drag, merge, swap, Shift-click: { from, to, count }
  move(p, msg) {
    if (!p.slots || p.dead) return;
    const count = msg.count == null ? null : typeof msg.count === 'number' ? msg.count : NaN;
    if (this.moveSlots(p, msg.from, msg.to, count)) recount(p);
    this.sendMe(p);   // moved or not, the client shows what the server has
  },
  // which hotbar slot is in your hand (-1: none)
  select(p, msg) {
    if (!p.slots) return;
    p.sel = Number.isInteger(msg.slot) && msg.slot >= 0 && msg.slot < S().HOTBAR ? msg.slot : -1;
  },
  // eat one of the food in a slot (the client waits RULES.SLOTS.EAT_TIME holding E first, and
  // shows the bite straight away; a refusal sends the real state back so it's put right)
  eat(p, msg) {
    const now = Date.now();
    if (!p.slots) return;
    p.bites = (p.bites || 0) + 1;   // every bite or sip asked for, done or not (sendMe tells the browser)
    if (p.dead || p.knockedUntil > now || now - (p.lastEatAt || 0) < S().EAT_GAP * 1000) return this.sendMe(p);
    const s = Number.isInteger(msg.slot) ? p.slots[msg.slot] : null;
    const info = s && !isBucket(s) ? WG.itemInfo(s.k) : null;
    if (!info || info.kind !== 'food') return this.sendMe(p);
    if (p.hunger >= 99.5 && (!info.water || p.thirst >= 99.5)) { this.send(p, { t: 'toast', msg: 'You’re full.' }); return this.sendMe(p); }
    p.lastEatAt = now;
    this.takeFromSlot(p, msg.slot, 1);
    p.hunger = Math.min(100, p.hunger + (info.food || 0));
    if (info.water) p.thirst = Math.min(100, p.thirst + info.water);
    p.dread = Math.max(0, p.dread + RULES.DREAD.EAT);
    this.fx(p, 'eat');
    this.send(p, { t: 'toast', msg: s.k === 'coconut' ? 'You crack the coconut and drink it down.' : `You eat the ${ITEMS[s.k].toLowerCase()}.` });
    this.sendMe(p);
  },
};

// What didn't fit in the slots when loading goes in a sack at the player's feet.
function onJoin(p) {
  if (p.slots && p.slotsOver && Object.keys(p.slotsOver).length) {
    const over = p.slotsOver, n = Object.values(over).reduce((a, b) => a + b, 0);
    p.slotsOver = null;
    this.sackAt(p.x, p.z, over).then(() => this.send(p, { t: 'toast', msg: `Your bag couldn't hold everything: ${n} things are in a sack at your feet.` }));
  }
  return {};
}

module.exports = { methods, messages, onJoin, buildSlots };
