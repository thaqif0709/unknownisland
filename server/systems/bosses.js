// Bosses (task C0, flag `bosses`). See docs/roadmap/CONTRACTS.md section 10.
//
// A region's finished chain calls summonBoss(region): its boss (server/bosses/) waits until
// its time and place (appear.when), then appears as a mob. Everyone within BOSSES.ARENA m takes
// part: its health is the boss's hp × (1 + PER_FROG for every frog after the first), growing if
// more come. Its phases start below set shares of its health. If nobody is left standing in the
// arena for WIPE s, it leaves with full health and comes back at its next time (appear.cooldown).
// Beaten: everyone who fought gets its trophy (journal keys: a relic, and what a cloak patch
// needs), the chain's bossDay is set (the stone stops hinting) and the next region opens; an
// echo stays where it fell, and E there ({ t: 'boss-echo', id }) earns latecomers the trophy.
// Everyone hears { t: 'boss', ...bossView }; heavy blows send { t: 'bossfx', k, x, z }.
// Each boss's state is in the `bosses` table (migration 0010) so a restart resumes the fight.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2, num } = require('./util');
const { BOSSES, byRegion } = require('../bosses');

const on = () => WG.feature('bosses');
const B = () => RULES.BOSSES;
const SAVE_EVERY = 5000;   // ms between saves during a fight

const methods = {
  // From `bosses` rows: [{ id, state, hp, phase, defeatedAt, data }].
  bossesLoad(rows) {
    this.bossState = new Map();
    for (const r of rows || []) {
      if (!BOSSES[r.id]) continue;
      const d = r.data || {};
      this.bossState.set(r.id, { id: r.id, state: r.state, hp: r.hp, maxHp: d.maxHp || null, phase: r.phase || 0, defeatedAt: r.defeatedAt || null,
        x: d.x, z: d.z, frogs: d.frogs || 1, earned: d.earned || [], returnAt: d.returnAt || 0, resume: r.state === 'fighting' });
    }
  },
  bossesReady() { if (!this.bossState) this.bossState = new Map(); },
  bossView(b) {
    const def = BOSSES[b.id], mob = b.mob && !b.mob.gone ? b.mob : null;
    return { id: b.id, name: def.name, state: b.state, x: r2(b.x), z: r2(b.z), r: B().ARENA, phase: b.phase, phases: def.phases.length + 1,
      hp: r2(mob ? mob.hp : b.hp || 0), max: r2(mob ? mob.maxHp : b.maxHp || def.hp), mob: mob ? mob.id : null };
  },
  bossSave(b) {
    const mob = b.mob && !b.mob.gone ? b.mob : null;
    b.savedAt = Date.now();
    this.store.saveBoss(this.id, { id: b.id, state: b.state, hp: r2(mob ? mob.hp : b.hp || 0), phase: b.phase, defeatedAt: b.defeatedAt,
      data: { x: b.x, z: b.z, frogs: b.frogs, earned: b.earned, returnAt: b.returnAt, maxHp: mob ? mob.maxHp : b.maxHp } })
      .catch(e => console.error('[island] boss not saved', e.message));
  },
  bossTell(b) { this.broadcast({ t: 'boss', ...this.bossView(b) }); },
  // For a boss's states: its record, the frog to go for, and a step that stays in its arena.
  bossOf(mob) { return mob.bossId && this.bossState ? this.bossState.get(mob.bossId) : null; },
  bossArena() { return B().ARENA; },
  bossTarget(b, players) {
    let best = null, bd = B().ARENA;
    for (const p of players) {
      if (p.under || this.downed(p)) continue;
      const d = Math.hypot(p.x - b.mob.x, p.z - b.mob.z);
      if (d < bd && Math.hypot(p.x - b.x, p.z - b.z) < B().ARENA) { bd = d; best = p; }
    }
    return best;
  },
  bossStep(b, mob, a, step) {
    const x = mob.x + Math.sin(a) * step, z = mob.z + Math.cos(a) * step;
    if (Math.hypot(x - b.x, z - b.z) < B().ARENA * .8 && heightAt(x, z) > -.8) { mob.x = x; mob.z = z; }
  },

  // A region's chain is done: its boss is called (W8 calls this). With no boss (or the flag
  // off) it's only noted, as before.
  summonBoss(regionId) {
    this.store.insertEvent(this.id, 'boss_summoned', { region: regionId, day: this.day })
      .catch(e => console.error('[island] boss event not saved', e.message));
    const def = on() && byRegion(regionId);
    if (!def) return console.log(`[island ${this.id}] boss summoned for ${regionId} (none to come yet)`);
    this.bossCall(def.id);
  },
  // A boss starts waiting for its time (at x, z if given: an admin's /boss, or a test).
  bossCall(id, at = {}) {
    const def = BOSSES[id];
    if (!def) return null;
    this.bossesReady();
    const old = this.bossState.get(id);
    if (old && (old.state === 'fighting' || old.state === 'beaten') && !at.again) return old;
    if (old && old.mob && !old.mob.gone) this.mobs.remove(old.mob);
    const b = { id, state: 'waiting', hp: def.hp, maxHp: def.hp, phase: 0, defeatedAt: null, frogs: 1, earned: [], returnAt: 0,
      x: num(at.x) ? at.x : def.appear.x, z: num(at.z) ? at.z : def.appear.z };
    this.bossState.set(id, b);
    this.bossSave(b);
    this.bossTell(b);
    return b;
  },
  // It comes: a mob with the boss's health (as saved, if a restart cut a fight short).
  bossAppear(b) {
    const def = BOSSES[b.id], resume = b.resume && b.hp > 0;
    const mob = this.mobs.spawn(def.kind, b.x, b.z, { hp: resume ? b.hp : def.hp, bossId: b.id, phase: resume ? b.phase : 0 });
    if (resume && b.maxHp) mob.maxHp = b.maxHp;
    Object.assign(b, { state: 'fighting', mob, present: new Set(), emptySince: null, resume: false });
    if (!resume) { b.frogs = 1; b.phase = 0; }
    this.bossTell(b);
    this.bossSave(b);
    this.broadcast({ t: 'toast', msg: `${def.name} has come.` });
  },
  // Nobody left standing (or its time is over: def.leaves): it leaves, whole again, until its next time.
  bossWipe(b, say) {
    const def = BOSSES[b.id];
    if (b.mob && !b.mob.gone) this.mobs.remove(b.mob);
    Object.assign(b, { state: 'waiting', mob: null, hp: def.hp, maxHp: def.hp, phase: 0, frogs: 1, returnAt: Date.now() + (def.appear.cooldown || 0) * 1000 });
    this.bossTell(b);
    this.bossSave(b);
    this.broadcast({ t: 'toast', msg: say || `${def.name} draws back. It will come again.` });
  },
  // Its mob died (the boss file's onDeath calls this).
  bossBeaten(mob) {
    const b = this.bossOf(mob);
    if (!b || b.state !== 'fighting') return;
    const def = BOSSES[b.id];
    Object.assign(b, { state: 'beaten', defeatedAt: Date.now(), hp: 0, mob: null });
    for (const p of this.players.values()) if (!p.dead && !p.under && Math.hypot(p.x - b.x, p.z - b.z) < B().ARENA) b.present.add(p.id);   // (and whoever is there as it falls)
    for (const id of b.present) { const p = this.players.get(id); if (p) this.bossTrophy(p, b); }
    if (def.region && this.chains) { this.chains[def.region] = this.chains[def.region] || {}; this.chains[def.region].bossDay = this.day; }
    if (def.next) this.openRegion(def.next);
    this.store.insertEvent(this.id, 'boss_defeated', { boss: b.id, day: this.day, frogs: [...b.present] })
      .catch(e => console.error('[island] boss event not saved', e.message));
    this.bossTell(b);
    this.bossSave(b);
    this.broadcast({ t: 'toast', msg: `${def.name} is beaten!` });
  },
  // Its trophy, once each: a relic for the journal (and what a cloak patch needs).
  bossTrophy(p, b) {
    if (b.earned.includes(p.id)) return false;
    b.earned.push(p.id);
    const t = BOSSES[b.id].trophy || {};
    for (const key of [t.relic, t.patch]) if (key) this.discover(p, key);
    this.send(p, { t: 'toast', msg: `You keep something of ${BOSSES[b.id].name.replace(/^The /, 'the ')}.` });
    return true;
  },
};

const messages = {
  // A latecomer at the echo of a beaten boss.
  'boss-echo'(p, { id }) {
    const b = on() && this.bossState && this.bossState.get(id);
    if (!b || b.state !== 'beaten' || p.dead || Math.hypot(p.x - b.x, p.z - b.z) > B().ECHO + .5) return;
    if (!this.bossTrophy(p, b)) this.send(p, { t: 'toast', msg: 'The echo is quiet. You have its gift already.' });
    else this.bossSave(b);
  },
};

function onTick() {
  if (!on() || !this.bossState) return;
  const now = Date.now(), A = B().ARENA;
  for (const b of this.bossState.values()) {
    const def = BOSSES[b.id];
    if (b.state === 'waiting') {
      if (now >= (b.returnAt || 0) && def.appear.when(this, b)) this.bossAppear(b);
      continue;
    }
    if (b.state !== 'fighting' || !b.mob || b.mob.gone) continue;
    if (def.leaves && def.leaves(this, b)) { this.bossWipe(b, def.leaveSay); continue; }   // its time is over (the tide turns...)
    const mob = b.mob, inArena = [...this.players.values()].filter(p => !p.dead && !p.under && Math.hypot(p.x - b.x, p.z - b.z) < A);
    for (const p of inArena) b.present.add(p.id);
    // more frogs: more of it
    if (inArena.length > b.frogs) {
      const more = (inArena.length - b.frogs) * B().PER_FROG * def.hp;
      mob.hp += more; mob.maxHp += more; b.frogs = inArena.length;
      this.bossTell(b);
    }
    // nobody standing: it leaves
    const standing = inArena.filter(p => !this.downed(p) && !(p.knockedUntil > now));
    if (standing.length) b.emptySince = null;
    else if (!b.emptySince) b.emptySince = now;
    else if (now - b.emptySince > B().WIPE * 1000) { this.bossWipe(b); continue; }
    // its phases
    const frac = mob.hp / mob.maxHp, phase = def.phases.filter(ph => frac < ph.below).length;
    if (phase !== b.phase) {
      b.phase = mob.phase = phase;
      this.bossTell(b);
      if (phase > 0 && def.phases[phase - 1].name) this.broadcast({ t: 'toast', msg: def.phases[phase - 1].name });
    }
    if (now - (b.savedAt || 0) > SAVE_EVERY) this.bossSave(b);
  }
}

// Every boss that's waiting, fighting or beaten (for its echo), for someone joining.
function onJoin() {
  if (!on() || !this.bossState) return {};
  return { bosses: [...this.bossState.values()].map(b => this.bossView(b)) };
}

module.exports = { methods, messages, onTick, onJoin };
