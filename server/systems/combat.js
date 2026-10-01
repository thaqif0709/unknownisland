// Fighting (task P6, flag `combat`). See docs/roadmap/CONTRACTS.md section 9.
//
// - Attacking: { t: 'attack', heavy, a } swings what's in your hand (a weapon, a tool, or your
//   fist) towards a (where you aim). The server checks the swing time, then hits every
//   creature in reach and inside the weapon's arc, with RULES.COMBAT.LAG seconds of slack
//   for where they were. A heavy swing (held) hits harder for energy; a sword's third quick
//   hit hits harder and knocks back; the sling throws a stone at the first one in line.
//   Light (a torch in hand, a lit fire or lantern close by) and silver are damage types the
//   Stilled are weak to.
// - Dodging: { t: 'dodge' } (double-tap Shift): for DODGE.TIME you can't be touched, and
//   may move fast enough to roll DODGE.DIST.
// - Downed: damage that would kill you leaves you down instead, for DOWNED.TIME; a friend
//   holding E beside you picks you up ({ t: 'revive', id, done }); otherwise you wake at your
//   hearth (or the beach).
const WG = require('../shared/world-gen');
const { RULES, ITEMS, heightAt } = WG;
const { r2, num } = require('./util');

const on = () => WG.feature('combat');
const C = () => RULES.COMBAT;
// The cave a creature is in (the Crawler keeps it as `cave`), or null up on the ground.
const caveOfMob = m => m.under || m.cave || null;
const angleDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
// What a weapon is, for creatures' weaknesses: sword, spear, club, sling, fist, or the tool.
const typeOf = key => (key.startsWith('sword_') ? 'sword' : key === 'pickaxe' || key === 'ironpick' ? 'pick' : key);

const methods = {
  // The weapon in p's hand ({ key, ...stats }), or bare hands.
  weaponOf(p) {
    const h = this.held(p), W = C().WEAPONS;
    const key = h && W[h.key] && (h.key !== 'torch' || this.count(p, 'torch') > 0) ? h.key : 'fist';
    return { key, ...W[key] };
  },
  // A torch in hand, or a lit fire or lantern close by: your blows carry light.
  inLight(p) {
    const h = this.held(p), L = C().LIGHT;
    if (h && h.key === 'torch' && this.count(p, 'torch') > 0) return true;
    if (p.under) return false;
    return this.fires.some(f => f.fuel > 0 && Math.hypot(f.x - p.x, f.z - p.z) < L)
      || this.lanterns.some(l => l.lit && Math.hypot(l.x - p.x, l.z - p.z) < L);
  },
  dodging(p) { return on() && Date.now() < (p.dodgeUntil || 0); },
  downed(p) { return !!p.downedUntil && Date.now() < p.downedUntil; },

  onAttack(p, { heavy, a }) {
    const now = Date.now(), K = C();
    if (!on() || p.dead || this.downed(p) || p.knockedUntil > now || this.watching(p)) return;
    const w = this.weaponOf(p);
    heavy = !!heavy && p.energy >= K.HEAVY.ENERGY && !p.exhausted;
    if (heavy && w.key === 'torch') return this.throwTorch(p, a);   // a heavy swing with a torch throws it
    const swing = w.swing * (heavy ? K.HEAVY.SWING : 1) * 1000;
    if (now - (p.lastAttackAt || 0) < swing - K.LAG * 1000) return;   // too soon (with the same slack as the aim)
    p.lastAttackAt = now;
    if (num(a)) p.face = a;
    if (heavy) p.energy = Math.max(0, p.energy - K.HEAVY.ENERGY);
    // a sword's combo: the third quick hit in a row
    let combo = false;
    if (w.combo) { p.combo = now - (p.lastHitAt || 0) < K.COMBO.WINDOW * 1000 ? ((p.combo || 0) + 1) % 3 : 0; combo = p.combo === 2; }
    const tags = [typeOf(w.key), ...(w.tags || [])];
    if (this.inLight(p)) tags.push('light');
    if (heavy) tags.push('heavy');
    const amount = w.damage * (heavy ? K.HEAVY.MULT : 1) * (combo ? K.COMBO.MULT : 1);
    const knock = w.knock * (combo ? K.COMBO.KNOCK : 1) * (heavy ? 1.5 : 1);
    this.fx(p, heavy ? 'heavy' : 'attack');
    // the sling: a stone from the bag, at the first creature in line
    if (w.ammo) {
      if (!this.take(p, w.ammo, 1)) { this.send(p, { t: 'toast', msg: `Your ${ITEMS[w.key].toLowerCase()} needs ${ITEMS[w.ammo].toLowerCase()}s to throw.` }); return this.sendMe(p); }
      const target = this.mobs.list.filter(m => !m.gone && !m.dead && caveOfMob(m) === (p.under || null))
        .map(m => ({ m, d: Math.hypot(m.x - p.x, m.z - p.z) }))
        .filter(({ m, d }) => d <= w.reach && angleDiff(Math.atan2(m.x - p.x, m.z - p.z), p.face) <= w.arc + Math.atan2(1, Math.max(d, .5)))
        .sort((x, y) => x.d - y.d)[0];
      this.broadcast({ t: 'shot', id: p.id, x: r2(p.x), z: r2(p.z), a: r2(p.face), to: target ? [r2(target.m.x), r2(target.m.z)] : null, under: p.under || 0 });
      if (target) this.strike(p, target.m, amount, tags, knock);
      this.wornBy(p, w.key);
      return this.sendMe(p);
    }
    // a melee swing: everything in reach and in the arc (a little slack for lag and size)
    let hits = 0;
    for (const m of [...this.mobs.list]) {
      if (m.gone || m.dead || caveOfMob(m) !== (p.under || null)) continue;
      const def = this.mobs.constructor.def(m.kind);
      const radius = (def && def.radius) || .5, d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d > w.reach + radius + 2.5 * K.LAG) continue;
      const da = angleDiff(Math.atan2(m.x - p.x, m.z - p.z), p.face);
      if (da > w.arc + Math.atan2(radius, Math.max(d, .3))) continue;
      this.strike(p, m, amount, tags, knock);
      hits++;
    }
    if (hits) { p.lastHitAt = now; this.wornBy(p, w.key); }
    if (heavy) this.sendMe(p);
  },
  // A torch thrown where you aim: it lands on the first creature in line (or THROW.RANGE m
  // off) and bursts into fire, burning everything within THROW.RADIUS (fire and light).
  throwTorch(p, a) {
    const now = Date.now(), K = C(), T = K.THROW;
    if (now - (p.lastAttackAt || 0) < K.WEAPONS.torch.swing * K.HEAVY.SWING * 1000 - K.LAG * 1000) return;
    if (!this.take(p, 'torch', 1)) return;
    p.lastAttackAt = now;
    if (num(a)) p.face = a;
    p.energy = Math.max(0, p.energy - K.HEAVY.ENERGY);
    const first = this.mobs.list.filter(m => !m.gone && !m.dead && caveOfMob(m) === (p.under || null))
      .map(m => ({ m, d: Math.hypot(m.x - p.x, m.z - p.z) }))
      .filter(({ m, d }) => d <= T.RANGE && angleDiff(Math.atan2(m.x - p.x, m.z - p.z), p.face) <= .25 + Math.atan2(1, Math.max(d, .5)))
      .sort((x, y) => x.d - y.d)[0];
    const x = first ? first.m.x : p.x + Math.sin(p.face) * T.RANGE, z = first ? first.m.z : p.z + Math.cos(p.face) * T.RANGE;
    this.fx(p, 'heavy');
    this.broadcast({ t: 'shot', id: p.id, k: 'torch', x: r2(p.x), z: r2(p.z), a: r2(p.face), to: [r2(x), r2(z)], under: p.under || 0 });
    this.broadcast({ t: 'burst', x: r2(x), z: r2(z), r: T.RADIUS, under: p.under || 0 });
    for (const m of [...this.mobs.list]) {
      if (m.gone || m.dead || caveOfMob(m) !== (p.under || null) || Math.hypot(m.x - x, m.z - z) > T.RADIUS) continue;
      this.strike(p, m, T.DAMAGE, ['fire', 'light', 'torch'], 0);
    }
    this.sendMe(p);
  },
  // One blow on a creature: damage (its weaknesses multiply it), and a shove away from you.
  strike(p, m, amount, tags, knock) {
    const dealt = this.mobs.hit(m, { amount, source: tags, from: p });
    if (m.gone || m.dead || !knock || m.cave || m.under) return dealt;   // (nothing is shoved through a cave's rock)
    const a = Math.atan2(m.x - p.x, m.z - p.z), x = m.x + Math.sin(a) * knock, z = m.z + Math.cos(a) * knock;
    if (heightAt(x, z) > .2) { m.x = r2(x); m.z = r2(z); }
    return dealt;
  },
  // A weapon (or tool) used in a fight wears like a tool does (with the tools flag, P3).
  wornBy(p, key) {
    if (key === 'fist') return;
    const t = this.wearTool(p, key);
    if (t) this.send(p, { t: 'toast', msg: t.trim() });
  },

  onDodge(p) {
    const now = Date.now(), D = C().DODGE;
    if (!on() || p.dead || this.downed(p) || p.knockedUntil > now || now - (p.lastDodgeAt || 0) < D.GAP * 1000) return;
    if (p.exhausted || p.energy < D.ENERGY) return this.send(p, { t: 'toast', msg: 'Too tired to roll.' });
    p.energy -= D.ENERGY;
    p.lastDodgeAt = now;
    p.dodgeUntil = now + (D.TIME + C().LAG) * 1000;
    this.fx(p, 'dodge');
    this.sendMe(p);
  },

  // Before a blow lands (the Stilled, the Crawler, anything that knocks you down): a roll
  // dodges it ('dodged'), and one that would kill you leaves you down instead ('downed').
  // Returns null when the blow should land as usual. Contract section 9.
  combatGuard(p, amount) {
    if (!on() || p.dead) return null;
    if (this.dodging(p)) { this.send(p, { t: 'toast', msg: 'You roll clear.' }); return 'dodged'; }
    if (this.downed(p)) return 'downed';
    if (p.health - amount <= 0) { this.goDown(p); return 'downed'; }
    return null;
  },
  // Damage from a creature: { from, knock }. Returns 'dodged', 'downed', 'knocked' or 'hurt'.
  damagePlayer(p, amount, { knock = false } = {}) {
    const g = this.combatGuard(p, amount);
    if (g) return g;
    if (knock) { this.knock(p); return 'knocked'; }
    p.health = Math.max(1, p.health - amount);
    this.sendMe(p);
    return 'hurt';
  },
  // Down, not dead: a friend can pick you up for DOWNED.TIME.
  goDown(p) {
    const now = Date.now(), D = C().DOWNED;
    p.health = 1;
    p.downedUntil = now + D.TIME * 1000;
    p.knockedUntil = p.downedUntil;   // can't move or act (the checkpoint wakes you at your hearth when it runs out, P4)
    p.wokeFor = null;
    p.reviving = null;
    if (p.sitting) p.sitting = false;
    this.broadcast({ t: 'downed', id: p.id, until: D.TIME });
    this.send(p, { t: 'toast', msg: `You're down. A friend can pick you up (${D.TIME} s).` });
    this.sendMe(p);
    if (this.onDowned) this.onDowned(p);
  },
  revive(by, p) {
    const now = Date.now(), D = C().DOWNED;
    p.downedUntil = 0;
    p.knockedUntil = now;
    p.wokeFor = now;   // not moved to the hearth: you're up where you fell
    p.health = Math.max(p.health, D.HEALTH);
    p.lastKnockAt = now;   // a moment's grace before the next knockdown
    this.broadcast({ t: 'revived', id: p.id, by: by.id });
    this.send(p, { t: 'toast', msg: `${by.name} picks you up.` });
    this.send(by, { t: 'toast', msg: `You pick ${p.name} up.` });
    this.sendMe(p);
    if (this.onRevived) this.onRevived(p);
  },
  // Holding E beside a downed friend: { id } when you start, { id, done: true } when the ring fills.
  onRevive(p, { id, done }) {
    const now = Date.now(), D = C().DOWNED, q = this.players.get(id);
    if (!on() || !q || q === p || p.dead || this.downed(p) || !this.downed(q)) return;
    if (Math.hypot(q.x - p.x, q.z - p.z) > D.REACH + .9 || (q.under || null) !== (p.under || null)) return;
    if (!done) { p.reviving = { id, since: now }; return; }
    if (!p.reviving || p.reviving.id !== id || now - p.reviving.since < D.REVIVE * 1000 - 250) return;
    p.reviving = null;
    this.revive(p, q);
  },
};

const messages = {
  attack(p, msg) { return this.onAttack(p, msg); },
  dodge(p) { return this.onDodge(p); },
  revive(p, msg) { return this.onRevive(p, msg); },
};

// Down too long: you come to at your hearth (the checkpoint system moves you, P4) or, without
// one, on the beach.
function onTick() {
  if (!on()) return;
  const now = Date.now();
  for (const p of this.players.values()) {
    if (!p.downedUntil || now < p.downedUntil) continue;
    p.downedUntil = 0;
    p.health = Math.max(p.health, C().DOWNED.HEALTH);
    if (!(WG.feature('checkpoints') && p.checkpoint != null)) {
      const at = this.respawnPoint(p);
      p.x = at.x; p.z = at.z; p.under = null; p.lastPosAt = now;
      this.send(p, { t: 'correct', x: p.x, z: p.z, under: 0 });
      this.send(p, { t: 'toast', msg: 'Nobody came. You wake on the beach, aching.' });
    }
    this.broadcast({ t: 'revived', id: p.id, by: null });
    this.sendMe(p);
  }
}

module.exports = { methods, messages, onTick };
