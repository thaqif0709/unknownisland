// The Sleeper: the island itself. It never appears; it speaks through carvings
// on three fixed stones. One request at a time, picked from the editable
// sleeper_requests table, carved at dawn (also during offline catch-up).
// Answer it and it gives something back; ignore it and the fog presses harder.
// Everything that happens is logged in island_events.
// Request chains (W8, flag `chains`): each open region has a chain of requests, in the
// order listed in server/regions/<id>.js. The next step of the first unfinished chain is
// always carved next; finishing the chain calls the region's boss (summonBoss). With no
// chain to work on, requests come at random from the pool as before.
const WG = require('../shared/world-gen');
const CONTENT = require('../content');
const { RULES, heightAt, isNight } = WG;

const r2 = v => Math.round(v * 100) / 100;
// Each region's file (chain order, boss hint), loaded once.
const REGION_FILES = Object.fromEntries(WG.REGIONS.map(r => [r.id, require(`../regions/${r.id}`)]));
const chainOf = region => (REGION_FILES[region] && REGION_FILES[region].requests) || [];
const CHAIN_KEYS = new Set(WG.REGIONS.flatMap(r => chainOf(r.id)));
const KINDS = new Set(['offer', 'lanterns_lit', 'lantern_fed', 'gather', 'fires_dawn', 'fog_walk', 'bugs', 'find']);
const need = c => c.type === 'offer' || c.type === 'lanterns_lit' || c.type === 'gather' || c.type === 'fires_dawn' || c.type === 'bugs' ? Math.max(1, c.count | 0) : 1;

const methods = {
  // Rebuild state from the event log.
  sleeperLoad(events) {
    this.carvings = WG.generateCarvings(this.seed);
    const S = this.sleeper = { req: null, calmUntil: -1, pressUntil: -1, recent: [], effects: [], chain: Promise.resolve() };
    for (const e of events) {
      if (e.key === 'sleeper') { S.req = { ...e.state, eventId: e.id }; S.recent.push(e.state.key); }
      else if ((e.key === 'calm' || e.key === 'press') && !e.ended) {
        S.effects.push({ id: e.id, key: e.key, state: e.state });
        if (e.key === 'calm') S.calmUntil = Math.max(S.calmUntil, e.state.untilDay);
        else S.pressUntil = Math.max(S.pressUntil, e.state.untilDay);
      }
    }
    S.recent = S.recent.slice(-3);
    if (!S.req) this.sleeperPick();
  },
  // Writes to the log run one after another.
  sleeperLog(fn) { this.sleeper.chain = this.sleeper.chain.then(fn).catch(e => console.error('[sleeper] log failed', e.message)); },
  saveReq() {
    const req = this.sleeper.req; if (!req) return;
    const { eventId, ...state } = req, ended = req.status !== 'active';
    this.sleeperLog(async () => {
      if (req.eventId == null) req.eventId = await this.store.insertEvent(this.id, 'sleeper', state);
      else await this.store.updateEvent(req.eventId, { ...state }, ended);
    });
  },
  reqDef(req = this.sleeper.req) { return req && (this.content.sleeper || []).find(r => r.key === req.key); },

  // A new carving, on its stone (or any stone).
  sleeperPick() {
    const S = this.sleeper, all = (this.content.sleeper || []).filter(r => (r.minDay || 1) <= this.day && KINDS.has(r.conditions && r.conditions.type));
    const chains = WG.feature('chains'), step = chains ? this.chainStep() : null;
    let def = step && all.find(r => r.key === step.key);
    if (step && !def) console.warn(`[island ${this.id}] chain step ${step.key} (${step.region}) is missing, disabled or too early; carving a side request`);
    if (!def) {
      // Chain steps are never picked at random (with chains on, not even old pool requests
      // that a region's chain uses).
      const list = all.filter(r => r.inPool !== false && !(chains && CHAIN_KEYS.has(r.key)));
      let pool = list.filter(r => !S.recent.includes(r.key)); if (!pool.length) pool = list;
      if (!pool.length) { S.req = null; return; }
      const total = pool.reduce((a, r) => a + (r.weight ?? 1), 0);
      let roll = Math.random() * total;
      def = pool[0];
      for (const r of pool) if ((roll -= (r.weight ?? 1)) <= 0) { def = r; break; }
    }
    const stone = this.carvings.find(c => c.key === def.stone) || this.carvings[Math.floor(Math.random() * this.carvings.length)];
    S.req = { key: def.key, stone: stone.id, progress: 0, need: need(def.conditions), startDay: this.day,
      expiresDay: this.day + (def.days || RULES.SLEEPER.DAYS), status: 'active', resolvedDay: null };
    if (step && def.key === step.key) S.req.region = step.region;
    S.recent = [...S.recent, def.key].slice(-3);
    this.saveReq();
    this.sleeperChanged(stone.id, 'new');
    console.log(`[island ${this.id}] the Sleeper carves "${def.text}" on the ${stone.key} stone`);
  },
  // The next request of the first open region whose chain isn't finished, or null.
  chainStep() {
    for (const r of [...WG.REGIONS].sort((a, b) => a.stage - b.stage)) {
      if (!this.isRegionOpen(r.id)) continue;
      const keys = chainOf(r.id), done = (this.chains[r.id] || {}).done || 0;
      if (done < keys.length) return { region: r.id, key: keys[done], step: done + 1, of: keys.length };
    }
    return null;
  },
  // A chain step was answered: move on, and at the end call the region's boss.
  chainAdvance(region) {
    const c = this.chains[region] = { done: 0, ...this.chains[region] }, keys = chainOf(region);
    c.done = Math.min(keys.length, c.done + 1);
    console.log(`[island ${this.id}] ${region} chain: ${c.done}/${keys.length}`);
    if (c.done >= keys.length && c.completeDay == null) {
      c.completeDay = this.day;
      this.summonBoss(region);
    }
  },
  // What a stone says while a finished chain's boss is waiting (C0 sets bossDay when it's beaten).
  bossHintFor(stoneKey) {
    if (!WG.feature('chains')) return null;
    for (const r of WG.REGIONS) {
      const c = this.chains[r.id], hint = REGION_FILES[r.id].bossHint;
      if (c && c.completeDay != null && c.bossDay == null && hint && hint.stone === stoneKey) return hint.text;
    }
    return null;
  },
  sleeperChanged(stoneId, why) {
    if (!this.players || !this.players.size) return;
    this.broadcast({ t: 'carvings', list: this.sleeperView(), changed: stoneId, why });
  },
  // What each stone says right now.
  sleeperView() {
    const req = this.sleeper.req, def = this.reqDef();
    return this.carvings.map(c => {
      const v = { id: c.id, key: c.key, x: c.x, z: c.z, face: c.face };
      if (req && def && req.stone === c.id) {
        v.state = req.status;
        v.text = req.status === 'done' ? (def.doneText || 'Yes.') : req.status === 'failed' ? (def.failText || '...') : def.text;
        if (req.status === 'active') { v.tally = [Math.min(req.progress, req.need), req.need]; v.offer = def.conditions.type === 'offer' ? def.conditions.item : null; }
      } else {
        const idle = CONTENT.SLEEPER_IDLE[c.key] || ['...'];
        v.state = 'idle'; v.text = this.bossHintFor(c.key) || idle[(this.day + c.id) % idle.length];
      }
      return v;
    });
  },

  // ---- progress ----
  sleeperProgress(value, set) {
    const req = this.sleeper.req;
    if (!req || req.status !== 'active') return;
    const before = req.progress;
    req.progress = set ? value : req.progress + value;
    if (req.progress >= req.need) return this.sleeperComplete();
    if (req.progress !== before) { this.saveReq(); this.sleeperChanged(req.stone, 'progress'); }
  },
  sleeperComplete() {
    const req = this.sleeper.req, def = this.reqDef(), stone = this.carvings[req.stone];
    req.status = 'done'; req.resolvedDay = this.day; req.progress = req.need;
    this.saveReq();
    if (this.players.size) this.broadcast({ t: 'toast', msg: `The carving on the ${stone.key} stone has changed.` });
    for (const r of [].concat(def.reward || [])) this.sleeperEffect(r, stone);
    if (req.region && WG.feature('chains')) this.chainAdvance(req.region);
    this.sleeperChanged(stone.id, 'done');
    console.log(`[island ${this.id}] the Sleeper was answered: ${req.key}`);
  },
  sleeperFail() {
    const req = this.sleeper.req, def = this.reqDef(), stone = this.carvings[req.stone];
    req.status = 'failed'; req.resolvedDay = this.day;
    this.saveReq();
    if (def) for (const r of [].concat(def.penalty || [])) this.sleeperEffect(r, stone);
    this.sleeperChanged(stone.id, 'failed');
    console.log(`[island ${this.id}] the Sleeper was ignored: ${req.key}`);
  },

  // ---- rewards and penalties ----
  sleeperEffect(e, stone) {
    const S = this.sleeper, near = (list, f) => list.filter(f).sort((a, b) => Math.hypot(a.x - stone.x, a.z - stone.z) - Math.hypot(b.x - stone.x, b.z - stone.z))[0];
    switch (e.type) {
      case 'calm': case 'press': {
        const untilDay = this.day + Math.max(1, e.nights || e.days || 1) - (e.type === 'calm' ? 1 : 0);
        if (e.type === 'calm') S.calmUntil = Math.max(S.calmUntil, untilDay); else S.pressUntil = Math.max(S.pressUntil, untilDay);
        const fx = { key: e.type, state: { untilDay, from: this.sleeper.req && this.sleeper.req.key }, id: null };
        S.effects.push(fx);
        this.sleeperLog(async () => { fx.id = await this.store.insertEvent(this.id, e.type, fx.state); });
        this.updateEnv();
        if (this.players.size) this.broadcast({ t: 'toast', msg: e.type === 'calm' ? 'The fog draws back, as if something holds its breath.' : 'The fog leans in closer. Something is displeased.' });
        break;
      }
      case 'gift': case 'relic': this.leaveAtStone(e.type === 'gift' ? 'sleeper_gift' : e.key, stone); break;
      case 'note': this.pinNote(null, CONTENT.SLEEPER_NOTES[Math.floor(Math.random() * CONTENT.SLEEPER_NOTES.length)], 'sleeper'); break;
      case 'light': {
        const l = near(this.lanterns, l => !l.lit && !l.big);
        if (!l) break;
        Object.assign(l, { lit: true, fuel: RULES.LANTERN.FUEL_PER_OIL, reclaim: 0, offerings: [], clearedSince: l.clearedSince || Date.now() });
        this.lanternsDirty.add(l.id); this.lanternChanged(l);
        break;
      }
      case 'dread':
        for (const p of this.players.values()) p.dread = Math.min(100, p.dread + (e.amount || 10));
        break;
      case 'douse': {
        for (const f of this.fires) f.fuel = 0;
        if (this.fires.length && this.players.size) this.broadcast({ t: 'fires', list: this.fires.map(f => [f.id, 0]) });
        const l = near(this.lanterns, l => l.lit);
        if (l) { l.fuel = 0; this.burnLantern(l, 0); }
        break;
      }
    }
  },
  async leaveAtStone(key, stone) {
    if (!this.content.tide.some(t => t.key === key)) return;
    const a = stone.face + (Math.random() - .5) * 1.2, x = r2(stone.x + Math.sin(a) * 1.8), z = r2(stone.z + Math.cos(a) * 1.8);
    const w = { key, x, z, day: this.day, data: { sleeper: true } };
    try { w.id = await this.store.insertWashup(this.id, w); } catch (e) { return console.error('[sleeper] gift not saved', e.message); }
    this.washups.push(w);
    if (this.players.size) this.broadcast({ t: 'wash', w: this.washView(w) });
  },
  // Moods run out at the end of their day.
  sleeperEnv() {
    const S = this.sleeper;
    for (const fx of S.effects.filter(f => f.state.untilDay < this.day)) {
      S.effects = S.effects.filter(f => f !== fx);
      this.sleeperLog(async () => { if (fx.id != null) await this.store.updateEvent(fx.id, fx.state, true); });
    }
    return { calm: this.day <= S.calmUntil, press: this.day <= S.pressUntil && !(this.day <= S.calmUntil) };
  },

  // ---- dawn: fires kept, deadlines, new carvings ----
  sleeperDawn(sunrises) {
    const S = this.sleeper, req = S.req, def = this.reqDef();
    if (req && def && req.status === 'active') {
      if (def.conditions.type === 'fires_dawn') this.sleeperProgress(this.fires.filter(f => f.fuel > 0).length, true);
      if (req.status === 'active' && this.day >= req.expiresDay) this.sleeperFail();
    }
    // A resolved carving stays for the rest of its day; the next dawn brings a new one.
    // (after a long time away, straight away).
    if (!S.req || !this.reqDef() || (S.req.status !== 'active' && (S.req.resolvedDay < this.day || sunrises > 1))) this.sleeperPick();
    else this.sleeperChanged(S.req.stone, 'dawn');   // idle lines turn over too
  },

  // ---- conditions that are checked about once a second ----
  sleeperCheck(dt) {
    const req = this.sleeper.req, def = this.reqDef();
    if (!req || !def || req.status !== 'active') return;
    const c = def.conditions, stone = this.carvings[req.stone];
    switch (c.type) {
      case 'lanterns_lit':
        return this.sleeperProgress(this.lanterns.filter(l => l.lit && heightAt(l.x, l.z) >= (c.minHeight || 0)).length, true);
      case 'lantern_fed': {
        const l = this.namedLantern(c.which);
        if (l && l.lit && l.fuel >= (c.fuel || 1)) this.sleeperComplete();
        return;
      }
      case 'gather': {
        if (!isNight(this.time)) return;
        const n = [...this.players.values()].filter(p => !p.dead && Math.hypot(p.x - stone.x, p.z - stone.z) < RULES.SLEEPER.GATHER_RADIUS).length;
        return this.sleeperProgress(n, true);
      }
      case 'fog_walk':
        for (const p of this.players.values()) {
          if (p.dead) continue;
          if (p.fog >= RULES.SLEEPER.FOG_WALK) p.fogWalk = (p.fogWalk || 0) + dt;
          if ((p.fogWalk || 0) >= (c.seconds || 30) && p.warm) { this.send(p, { t: 'toast', msg: 'You came back out of the fog.' }); return this.sleeperComplete(); }
        }
    }
  },
  namedLantern(which) {
    const L = this.lanterns;
    if (which === 'east') return L.reduce((a, l) => (l.x > a.x ? l : a), L[0]);
    if (which === 'high') return L.reduce((a, l) => (heightAt(l.x, l.z) > heightAt(a.x, a.z) ? l : a), L[0]);
    if (which === 'spring') return L[1];
    return L[0];
  },
  // events from elsewhere in the simulation
  sleeperOnBug() { const def = this.reqDef(); if (def && def.conditions.type === 'bugs') this.sleeperProgress(1); },
  sleeperOnFind(key) { const def = this.reqDef(); if (def && def.conditions.type === 'find' && def.conditions.key === key) this.sleeperComplete(); },
  // Offer items at the stone (act on it).
  sleeperOffer(p, id) {
    const stone = this.carvings[id], req = this.sleeper.req, def = this.reqDef(), say = msg => this.send(p, { t: 'toast', msg });
    if (!stone || p.dead || Math.hypot(stone.x - p.x, stone.z - p.z) > RULES.SLEEPER.REACH + RULES.REACH + .9) return;
    if (!req || req.status !== 'active' || req.stone !== id || def.conditions.type !== 'offer') return;
    const item = def.conditions.item, give = Math.min(this.count(p, item), req.need - req.progress);
    if (give <= 0) return say(`It wants ${WG.ITEMS[item].toLowerCase()}. You have none.`);
    this.takeUpTo(p, item, give);
    say(`You leave ${give} ${WG.ITEMS[item].toLowerCase()} at the foot of the stone. ${req.progress + give >= req.need ? '' : 'The marks deepen.'}`.trim());
    this.fx(p, 'swing');
    this.sendMe(p);
    this.sleeperProgress(give);
  },
};

module.exports = { methods };
