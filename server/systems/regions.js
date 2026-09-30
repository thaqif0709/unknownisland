// Regions and the Veil (task W5, part of the `bigworld` flag). Every region but the Landing
// starts behind the Veil, a wall of fog you can't walk through: step onto a locked region's
// land and you're turned around. A region is opened (openRegion) when its way is earned
// (the previous region's boss, C0), and the Veil lifts at the next dawn. Opened stays open.
// Also where knocked-down frogs wake (P4 makes it the hearth) and the boss placeholder (C0).
// See docs/roadmap/CONTRACTS.md sections 6, 10 and 11.
const WG = require('../shared/world-gen');
const { SPAWN } = WG;

const VEIL_DREAD = 6;          // dread each time the Veil turns you around
const VEIL_COOLDOWN = 1500;    // ms between turn-arounds that count

const methods = {
  // From regions_open rows: region -> { region, openedDay, liftedDay }.
  regionsLoad(rows) { this.regionState = new Map((rows || []).map(r => [r.region, { ...r }])); },
  isRegionOpen(id) {
    if (id === 'landing' || id === 'sea') return true;
    const r = this.regionState && this.regionState.get(id);
    return !!(r && r.liftedDay != null);
  },
  openRegions() { return ['landing', ...WG.REGIONS.map(r => r.id).filter(id => id !== 'landing' && this.isRegionOpen(id))]; },
  // Open a region: the Veil lifts from it at the next dawn. Safe to call again.
  openRegion(id) {
    if (!WG.REGIONS.some(r => r.id === id) || id === 'landing') return false;
    if (!this.regionState) this.regionState = new Map();
    if (this.regionState.has(id)) return false;
    const reg = { region: id, openedDay: this.day, liftedDay: null };
    this.regionState.set(id, reg);
    this.store.saveRegion(this.id, reg).catch(e => console.error('[island] region not saved', e.message));
    this.store.insertEvent(this.id, 'region_open', { region: id, day: this.day }).catch(e => console.error('[island] region event not saved', e.message));
    console.log(`[island ${this.id}] region opened: ${id} (the Veil lifts at the next dawn)`);
    if (this.players.size) this.broadcast({ t: 'toast', msg: 'Far off, the fog stirs, as if it is getting ready to move.' });
    return true;
  },
  // Is this spot behind the Veil? (Only with the big world on; water never is.)
  veilAt(x, z) {
    if (!WG.feature('bigworld')) return false;
    return !this.isRegionOpen(WG.regionAt(x, z));
  },
  // The Veil turned a player around: dread, at most once in a while.
  veilTurned(p) {
    const now = Date.now();
    if (now - (p.lastVeilAt || 0) < VEIL_COOLDOWN) return;
    p.lastVeilAt = now;
    p.dread = Math.min(100, p.dread + VEIL_DREAD);
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

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  // The client stopped you at the Veil itself (so you don't bounce back); it still frightens.
  veil(p) {
    if (p.dead || !WG.feature('bigworld')) return;
    for (let a = 0; a < 8; a++) {   // only if there really is locked land right in front of you
      if (this.veilAt(p.x + Math.sin(a * Math.PI / 4) * 3, p.z + Math.cos(a * Math.PI / 4) * 3)) return this.veilTurned(p);
    }
  },
};

// At dawn, the Veil lifts from every region opened before it.
function onDawn() {
  if (!this.regionState) return;
  const lifted = [];
  for (const reg of this.regionState.values()) {
    if (reg.liftedDay != null || reg.openedDay >= this.day) continue;
    reg.liftedDay = this.day;
    lifted.push(reg.region);
    this.store.saveRegion(this.id, reg).catch(e => console.error('[island] region not saved', e.message));
  }
  if (!lifted.length) return;
  console.log(`[island ${this.id}] the Veil lifts from: ${lifted.join(', ')}`);
  if (this.players.size) {
    this.broadcast({ t: 'regions', open: this.openRegions(), lifted });
    const names = lifted.map(id => WG.REGIONS.find(r => r.id === id).name);
    this.broadcast({ t: 'toast', msg: `With the sun, the fog draws back from ${names.join(' and ')}.` });
  }
}

// Which regions are open, for each player who joins.
function onJoin() { return { regions: this.openRegions() }; }

module.exports = { methods, messages, onDawn, onJoin };
