// Hearth checkpoints (task P4, flag `checkpoints`): sit beside a lit clay hearth, anyone's,
// and after a few seconds you curl up asleep and it becomes where you wake: after dying, and
// after being knocked down. Friends can share one hearth as a camp. See CONTRACTS.md section 11.
//
// p.checkpoint is the fire id (island_members.checkpoint, migration 0007), or null.
const WG = require('../shared/world-gen');
const { RULES, SPAWN } = WG;
const { r2 } = require('./util');

const CP = {
  SLEEP_MS: 3000,     // asleep this long by a lit hearth and it remembers you
  REACH: 3.2,         // how close to the hearth you must be
  REGEN: 1,           // extra energy regeneration while asleep (1 = twice as fast)
  COLD_DREAD: 15,     // waking by a hearth that has gone out
};
const on = () => WG.feature('checkpoints');

const methods = {
  // The hearth p would wake at, or null.
  checkpointFire(p) { return p.checkpoint != null ? this.fires.find(f => f.id === p.checkpoint && f.kind === 'hearth') || null : null; },
  // Where p wakes: { x, z, say?, dread? }. By their hearth (a spot of their own around it, so
  // friends sharing it don't wake on top of each other); cold and uneasy if it has gone out;
  // the Landing's beach if it's gone, or they never slept by one.
  respawnPoint(p) {
    if (!on() || p.checkpoint == null) return { x: SPAWN.x, z: SPAWN.z };
    const f = this.checkpointFire(p);
    if (!f) {
      p.checkpoint = null;
      this.broadcast({ t: 'checkpoint', id: p.id, fire: null });
      return { x: SPAWN.x, z: SPAWN.z, say: 'The hearth you slept by is gone. You wake on the beach where you first arrived.' };
    }
    const a = (p.id * 2.39996) % (Math.PI * 2), x = r2(f.x + Math.cos(a) * 1.8), z = r2(f.z + Math.sin(a) * 1.8);
    if (f.fuel <= 0) return { x, z, dread: CP.COLD_DREAD, say: 'You wake by your hearth. It has gone cold.' };
    return { x, z, say: 'You wake by your hearth, the fire still going.' };
  },
  checkpointsView() {
    const out = {};
    if (on()) for (const q of this.players.values()) if (q.checkpoint != null) out[q.id] = q.checkpoint;
    return out;
  },
  // Stop sleeping (standing up, moving, being knocked down ...).
  wake(p) {
    if (!p.sleeping) return;
    p.sleeping = false; p.sleepAt = 0;
    this.broadcast({ t: 'sleep', id: p.id, on: false });
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  // Curling up by a hearth (the browser asks once you've sat down beside a lit one).
  sleep(p, msg) {
    if (!on()) return;
    if (!msg.on) return this.wake(p);
    const f = this.fires.find(x => x.id === msg.fire);
    if (p.dead || !p.sitting || p.under || !f || f.kind !== 'hearth' || f.fuel <= 0 || Math.hypot(f.x - p.x, f.z - p.z) > CP.REACH) return;
    if (p.sleeping) return;
    p.sleeping = true; p.sleepAt = Date.now(); p.sleepFire = f.id;
    this.broadcast({ t: 'sleep', id: p.id, on: true });
  },
};

function onTick(dt) {
  if (!on()) return;
  const now = Date.now();
  for (const p of this.players.values()) {
    // knocked down (by the Stilled, or later anything else): when you come to, it's at your hearth
    if (p.knockedUntil && now >= p.knockedUntil && p.wokeFor !== p.knockedUntil) {
      p.wokeFor = p.knockedUntil;
      if (!p.dead && p.checkpoint != null) {
        const at = this.respawnPoint(p);
        p.x = at.x; p.z = at.z; p.under = null; p.lastPosAt = now;
        if (at.dread) p.dread = Math.min(100, p.dread + at.dread);
        this.send(p, { t: 'correct', x: p.x, z: p.z, under: 0 });
        if (at.say) this.send(p, { t: 'toast', msg: at.say });
      }
    }
    if (!p.sleeping) continue;
    const f = this.fires.find(x => x.id === p.sleepFire);
    if (p.dead || !p.sitting || p.moving || p.knockedUntil > now || !f || Math.hypot(f.x - p.x, f.z - p.z) > CP.REACH) { this.wake(p); continue; }
    // resting: energy comes back faster
    p.energy = Math.min(100, p.energy + RULES.ENERGY_REGEN * CP.REGEN * dt);
    if (p.checkpoint !== f.id && now - p.sleepAt >= CP.SLEEP_MS) {
      p.checkpoint = f.id;
      this.broadcast({ t: 'checkpoint', id: p.id, fire: f.id });
      this.send(p, { t: 'toast', msg: 'The fire will remember you.' });
    }
  }
}

// Everyone's checkpoints, for each player who joins (only with the flag on).
function onJoin() { return on() ? { checkpoints: this.checkpointsView() } : {}; }

module.exports = { methods, messages, onTick, onJoin, CP };
