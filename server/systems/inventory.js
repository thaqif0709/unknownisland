// Inventory: the only code that touches what a player carries (p.inv counts, p.tools,
// p.buckets). Everything else goes through these methods, so the slot inventory (task P2)
// and tools that wear out (P3) only have to change this file.
// See docs/roadmap/CONTRACTS.md section 4.
const WG = require('../shared/world-gen');
const { ITEMS } = WG;
const { cleanBuckets } = require('./util');

const methods = {
  // ---- the items API ----
  // Add n of an item. Returns how many were added (0 for an unknown item).
  give(p, key, n = 1) {
    if (!(key in p.inv)) return 0;
    p.inv[key] += n;
    return n;
  },
  // Remove n of an item if the player has that many. Returns true if removed.
  take(p, key, n = 1) {
    if ((p.inv[key] || 0) < n) return false;
    p.inv[key] -= n;
    return true;
  },
  count(p, key) { return p.inv[key] || 0; },
  // What's in the player's hand (the selected hotbar slot), or null.
  held(p) { return p.hold ? { key: p.hold } : null; },

  // ---- tools (items of their own once P3 lands) ----
  hasTool(p, id) { return p.tools.includes(id); },
  addTool(p, id) { if (!p.tools.includes(id)) p.tools.push(id); },

  // ---- costs and bundles ----
  canAfford(p, cost) { return Object.entries(cost).every(([k, n]) => this.count(p, k) >= n); },
  spend(p, cost) { for (const [k, n] of Object.entries(cost)) p.inv[k] -= n; },
  gain(p, items) { for (const [k, n] of Object.entries(items)) this.give(p, k, n); },
  // Take up to n (as many as they have). Returns how many were taken.
  takeUpTo(p, key, n) {
    const k = Math.min(n, this.count(p, key));
    if (k > 0) p.inv[key] -= k;
    return Math.max(0, k);
  },
  // Take a share of everything carried (rounded up), e.g. when knocked down. Returns { key: n }.
  takeShare(p, share) {
    const items = {};
    for (const [k, n] of Object.entries(p.inv)) { const lose = Math.ceil(n * share); if (lose > 0) { items[k] = lose; p.inv[k] -= lose; } }
    return items;
  },
  // Everything carried is lost (tools and buckets are kept).
  clearItems(p) { for (const k of Object.keys(p.inv)) p.inv[k] = 0; },

  // ---- loading, sending and saving ----
  // From the island_members row: { inv, tools, buckets }.
  loadInventory(m) {
    const saved = m.inventory || {};
    const inv = { wood: m.wood, stone: m.stone };
    for (const k of Object.keys(ITEMS)) if (!(k in inv)) inv[k] = Math.max(0, saved[k] | 0);
    return {
      inv,
      tools: (Array.isArray(saved.tools) ? saved.tools : []).filter(t => WG.recipeById(t)),
      buckets: cleanBuckets(saved.buckets),
    };
  },
  // What the player's own client is told.
  inventoryView(p) { return { inv: p.inv, tools: p.tools, buckets: p.buckets }; },
  // The columns saved for the player: wood and stone have their own; the rest is JSON.
  inventorySave(p) {
    const { wood, stone, ...rest } = p.inv;
    return { wood, stone, inventory: { ...rest, tools: [...p.tools], buckets: p.buckets || [] } };
  },
};

module.exports = { methods };
