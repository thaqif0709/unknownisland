// Stone lanterns and the light that clears the fog.
const WG = require('../shared/world-gen');
const { RULES, FIRES } = WG;
const { r2, REACH_SLACK } = require('./util');

const methods = {
  // Light sources that clear fog: lit fires (lanterns join them later).
  lights() {
    const k = this.env.lightMul || 1;
    return this.fires.filter(f => f.fuel > 0).map(f => ({ x: f.x, z: f.z, r: FIRES[f.kind].warm * 1.4 * k }))
      .concat(this.lanterns.filter(l => this.clearRadius(l) > 0).map(l => ({ x: l.x, z: l.z, r: this.clearRadius(l) * k })))
      .concat([...this.players.values()].filter(p => !p.dead && this.has(p, 'firefly_jar')).map(p => ({ x: p.x, z: p.z, r: 3.5 })));
  },

  // ================= Stone lanterns =================
  lanternRadius(l) { return l.big ? RULES.LANTERN.BIG_RADIUS : RULES.LANTERN.RADIUS; },
  // How far the clearing reaches: full while lit; once cold it shrinks in steps
  // as the fog reclaims it.
  clearRadius(l) {
    if (l.lit) return this.lanternRadius(l);
    const steps = RULES.LANTERN.RECLAIM_STEPS;
    return this.lanternRadius(l) * Math.ceil((1 - l.reclaim) * steps - 1e-9) / steps;
  },
  // The fog fights back. Burn oil (faster the longer the clearing has been held,
  // and on Drowning nights); once cold, the fog reclaims the clearing over
  // RECLAIM_DAYS. Works for one tick or a long offline catch-up.
  burnLantern(l, sec) {
    const L = RULES.LANTERN;
    if (l.lit) {
      const heldDays = l.clearedSince ? Math.max(0, (this.lastTickAt - l.clearedSince) / 1000 / RULES.DAY_LEN) : 0;
      const rate = (1 + Math.min(L.HELD_MAX, heldDays * L.HELD_PER_DAY)) * (this.env.drowning ? L.DROWNING_MULT : 1) * (this.env.press ? RULES.SLEEPER.PRESS_BURN : 1);
      const lasts = l.fuel / rate;
      this.lanternsDirty.add(l.id);
      if (sec < lasts) { l.fuel -= sec * rate; return; }
      sec -= lasts;
      l.fuel = 0; l.lit = false; l.offerings = [];
      this.lanternChanged(l);
    }
    if (l.reclaim < 1) {
      const before = this.clearRadius(l);
      l.reclaim = Math.min(1, l.reclaim + sec / (L.RECLAIM_DAYS * RULES.DAY_LEN));
      this.lanternsDirty.add(l.id);
      if (this.clearRadius(l) !== before) this.lanternChanged(l);
      if (l.reclaim >= 1) { l.clearedSince = null; this.reclaimed(l); }
    }
  },
  lanternChanged(l) { if (this.players && this.players.size) this.broadcast({ t: 'lanterns', list: [this.lanternView(l)] }); },
  // A clearing the fog has fully taken back: some of what stood there is
  // swallowed (it regrows later), fires are put out and taken, and dropped
  // sacks are dragged deeper into the fog. Inventories are never touched.
  reclaimed(l) {
    const R = this.lanternRadius(l), chance = RULES.LANTERN.SWALLOW_CHANCE, changed = [];
    for (const o of this.objects) {
      if (Math.hypot(o.x - l.x, o.z - l.z) > R || Math.random() > chance) continue;
      const s = o.state;
      if (s.gone || s.dug) continue;
      if (o.type === 'dig') s.dug = true;
      else { s.gone = true; s.swallowed = true; s.felledDay = s.goneDay = this.day; }
      this.dirty.add(o.id); changed.push(o);
    }
    if (changed.length && this.players.size) this.broadcast({ t: 'objs', list: changed.map(o => [o.id, o.state]) });
    for (const f of this.fires.filter(f => Math.hypot(f.x - l.x, f.z - l.z) < R)) {
      this.fires = this.fires.filter(x => x !== f);
      if (f.pot) this.sackAt(f.x, f.z, { buckets: [this.potToBucket(f.pot)] });
      this.store.deleteFire(f.id).catch(e => console.error('[island] could not delete fire', e.message));
      if (this.players.size) this.broadcast({ t: 'unfire', id: f.id });
    }
    for (const d of this.drops.filter(d => Math.hypot(d.x - l.x, d.z - l.z) < R)) {
      const a = Math.atan2(d.z - l.z, d.x - l.x) + (Math.random() - .5), push = 4 + Math.random() * 6;
      d.x = r2(d.x + Math.cos(a) * push); d.z = r2(d.z + Math.sin(a) * push);
      this.store.moveDrop(d.id, d.x, d.z).catch(e => console.error('[island] could not move drop', e.message));
      if (this.players.size) this.broadcast({ t: 'movedrop', id: d.id, x: d.x, z: d.z });
    }
    console.log(`[island ${this.id}] the fog reclaimed lantern ${l.id}: ${changed.length} things swallowed`);
  },
  lanternView(l) {
    return { id: l.id, x: l.x, z: l.z, big: l.big, lit: l.lit, fuel: r2(l.fuel), have: l.offerings.length,
      need: l.big ? RULES.LANTERN.BIG_OFFERINGS : 1, clear: r2(this.clearRadius(l)), reclaim: r2(l.reclaim) };
  },
  // Offer lamp oil: lights a cold lantern (great ones need offerings from
  // several different frogs first) or tops up a lit one.
  tendLantern(p, id) {
    const l = this.lanterns[id], L = RULES.LANTERN;
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > (l.big ? 2.2 : 1.6) + RULES.REACH + REACH_SLACK) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    if (this.count(p, 'oil') <= 0) return say(l.lit ? 'It burns on. Lamp oil would keep it going.' : 'Cold stone. It wants an offering of lamp oil.');
    if (l.lit) {
      if (l.fuel >= L.MAX_FUEL - 1) return say('The lantern is full.');
      this.take(p, 'oil'); l.fuel = Math.min(L.MAX_FUEL, l.fuel + L.FUEL_PER_OIL * (this.has(p, 'violet_charm') ? 1.5 : 1));
      say('The flame steadies.');
    } else if (l.big) {
      if (l.offerings.includes(p.id)) return say('You have made your offering. It needs other frogs\u2019 too.');
      this.take(p, 'oil'); l.offerings.push(p.id);
      if (l.offerings.length >= L.BIG_OFFERINGS) {
        l.lit = true; l.fuel = L.FUEL_PER_OIL * L.BIG_OFFERINGS; l.litBy = p.id; l.reclaim = 0; l.clearedSince = l.clearedSince || Date.now();
        this.broadcast({ t: 'toast', msg: 'A great lantern flares to life. The fog pulls back from the hill.' });
      } else say(`Your offering is taken. It needs ${L.BIG_OFFERINGS - l.offerings.length} more frog${L.BIG_OFFERINGS - l.offerings.length > 1 ? 's' : ''}.`);
    } else {
      this.take(p, 'oil'); l.lit = true; l.fuel = L.FUEL_PER_OIL * (this.has(p, 'violet_charm') ? 1.5 : 1); l.litBy = p.id; l.reclaim = 0; l.clearedSince = l.clearedSince || Date.now();
      say('The old lantern catches. The fog draws back.');
    }
    this.lanternsDirty.add(l.id);
    this.fx(p, 'swing');
    this.broadcast({ t: 'lanterns', list: [this.lanternView(l)] });
    this.sendMe(p);
  },
};

module.exports = { methods };
