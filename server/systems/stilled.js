// The Stilled's helpers, and being knocked down. The Stilled themselves are a mob kind
// now: server/mobs/stilled.js (spawning, fading, stalking), run by server/mobs/index.js.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2 } = require('./util');

const methods = {
  // ================= The Stilled =================
  // Pale figures in the fog. They spawn at night in fog near players, never
  // enter light or clear air, and move only while no player is looking at them.
  fogHere(x, z, lights) { return WG.fogAt(x, z, heightAt(x, z), this.time, lights, this.env); },
  watched(s) {
    const S = RULES.STILLED;
    for (const p of this.players.values()) {
      if (p.dead || p.camYaw == null) continue;
      const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
      if (d > S.VIEW_RANGE) continue;
      let a = Math.atan2(dx, dz) - p.camYaw;
      while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) < S.VIEW_HALF_ANGLE) return true;
    }
    return false;
  },
  isAlone(p) {
    for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < RULES.DREAD.FRIEND_RADIUS) return false;
    return true;
  },
  // Knocked down (by the Stilled): hurt, frightened, and half of what you carry
  // is left in a sack on the ground where you fell.
  async knock(p) {
    const now = Date.now(), K = RULES.KNOCK;
    if (p.dead || p.knockedUntil > now) return;
    p.knockedUntil = now + K.DOWN_MS;
    p.health = Math.max(1, p.health - K.HEALTH);
    p.dread = Math.min(100, p.dread + K.DREAD);
    const items = this.takeShare(p, K.DROP);
    this.broadcast({ t: 'knocked', id: p.id });
    this.send(p, { t: 'toast', msg: Object.keys(items).length ? 'Something knocks you down. Your things scatter.' : 'Something knocks you down.' });
    this.sendMe(p);
    if (!Object.keys(items).length) return;
    const x = r2(p.x), z = r2(p.z);
    try {
      const id = await this.store.insertDrop(this.id, x, z, items);
      const d = { id, x, z, items };
      this.drops.push(d);
      this.broadcast({ t: 'drop', drop: { id, x, z, items } });
    } catch (e) { console.error('[island] could not save drop', e.message); }
  },
};

module.exports = { methods };
