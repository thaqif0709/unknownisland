// The Stilled, and being knocked down.
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
  updateStilled(dt, lights) {
    const S = RULES.STILLED, now = Date.now(), players = [...this.players.values()].filter(p => !p.dead && !this.watching(p));
    // fade: gone when their spot clears (dawn, a fire) or nobody is near
    this.stilled = this.stilled.filter(s => {
      if (s.lingering) {   // left standing in daylight by the night: gone when someone walks up to it
        if (players.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 7)) return false;
        if (WG.nightFactor(this.time) > .6) s.lingering = false;
        return true;
      }
      return this.fogHere(s.x, s.z, lights) > .2 && players.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 90);
    });
    // spawn, a few times a second at most
    if ((this.stilledTimer -= dt) <= 0) {
      this.stilledTimer = .5;
      let want = 0;
      for (const p of players) want += S.PER_PLAYER + (this.isAlone(p) ? S.ALONE_EXTRA : 0) + (p.dread > 70 ? S.DREAD_EXTRA : 0);
      if (WG.nightFactor(this.time) < .6) want = 0;
      want = Math.min(S.MAX, want * (this.env.drowning ? 2 : 1));
      if (this.stilled.length < want && players.length) {
        const p = players[(Math.random() * players.length) | 0];
        for (let tries = 0; tries < 8; tries++) {
          const a = Math.random() * Math.PI * 2, r = S.SPAWN_MIN + Math.random() * (S.SPAWN_MAX - S.SPAWN_MIN);
          const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
          if (heightAt(x, z) < .3 || this.fogHere(x, z, lights) < .6) continue;
          const s = { id: this.nextStilled++, x, z, face: Math.atan2(p.x - x, p.z - z) };
          if (this.watched(s)) continue;   // never appear in plain sight
          this.stilled.push(s);
          break;
        }
      }
    }
    // move whoever is unwatched towards the player they have noticed
    for (const s of this.stilled) {
      if (s.lingering || this.watched(s)) continue;
      let best = null, bestScore = -1e9;
      for (const p of players) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        const notice = S.NOTICE + p.dread * S.NOTICE_PER_DREAD + (this.isAlone(p) ? S.NOTICE_ALONE : 0)
          + (this.has(p, 'firefly_jar') ? 10 : 0) + (this.has(p, 'silverfin_scale') ? 8 : 0);
        if (d > notice) continue;
        const score = p.dread / 100 + (this.isAlone(p) ? .5 : 0) - d / 60;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (!best) continue;
      const dx = best.x - s.x, dz = best.z - s.z, d = Math.hypot(dx, dz);
      if (d < S.REACH) {
        if (now - best.lastKnockAt > S.KNOCK_COOLDOWN_MS) { best.lastKnockAt = now; this.knock(best); s.gone = true; }
        continue;
      }
      const step = Math.min(d, S.SPEED * dt), base = Math.atan2(dx, dz);
      for (const off of [0, .6, -.6, 1.2, -1.2]) {   // go round clear patches if it can
        const nx = s.x + Math.sin(base + off) * step, nz = s.z + Math.cos(base + off) * step;
        if (this.fogHere(nx, nz, lights) >= S.FOG_MIN && heightAt(nx, nz) > .2) { s.x = nx; s.z = nz; s.face = base; break; }
      }
    }
    this.stilled = this.stilled.filter(s => !s.gone);
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
