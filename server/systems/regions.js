// Regions opening, bosses and where knocked-down frogs wake up. These are placeholders
// that other work can already call; the real versions come with tasks W5 (the Veil and
// opening regions), C0 (the boss system) and P4 (hearth checkpoints).
// See docs/roadmap/CONTRACTS.md sections 6, 10 and 11.
const WG = require('../shared/world-gen');
const { SPAWN } = WG;

const methods = {
  // Placeholder: only the Landing is open (W5 makes this real and saves it).
  isRegionOpen(id) { return (this.openRegions || new Set(['landing'])).has(id); },
  // Placeholder: remembers it for now and logs an island event; the Veil comes with W5.
  openRegion(id) {
    if (!WG.REGIONS.some(r => r.id === id) || this.isRegionOpen(id)) return;
    this.openRegions = new Set([...(this.openRegions || ['landing']), id]);
    console.log(`[island ${this.id}] region opened: ${id}`);
    this.store.insertEvent(this.id, 'region_open', { region: id, day: this.day })
      .catch(e => console.error('[island] region event not saved', e.message));
  },
  // Placeholder: a region's request chain is done and its boss should appear (C0).
  summonBoss(regionId) {
    console.log(`[island ${this.id}] boss summoned for ${regionId} (no boss system yet)`);
    this.store.insertEvent(this.id, 'boss_summoned', { region: regionId, day: this.day })
      .catch(e => console.error('[island] boss event not saved', e.message));
  },
  // Where a frog wakes after being knocked out: the island's start for now (P4 adds hearths).
  respawnPoint(p) { return { x: SPAWN.x, z: SPAWN.z }; },
};

module.exports = { methods };
