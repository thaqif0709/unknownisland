// Mobs: one engine for every creature (the Stilled, the Crawler, bosses). Each kind is a
// file in this folder (see stilled.js and dummy.js), registered in KINDS below:
//
//   module.exports = {
//     kind: 'drowned', hp: 30, speed: 2.2, radius: .5,
//     weak: { fire: 3, silver: 2 },          // damage multipliers by source tag
//     start: 'idle',                         // the state a new mob starts in
//     states: { idle(mob, island, dt, ctx) { return 'stalk'; }, ... },   // return the next state, or nothing to stay
//     tick(island, dt, ctx) {},              // optional, once a tick for the whole kind (spawning, fading)
//     touch: .6,                             // optional: onTouch runs for players this close (plus radius)
//     onTouch(island, mob, p) {},            // knockdown, drag, drain warmth...
//     onHit(island, mob, hit) {},            // optional, after damage (before a death)
//     onDeath(island, mob, hit) {},          // optional
//     view(mob) { return extra; },           // optional small extra for the snapshot (e.g. a pose)
//   };
//
// island.mobs.spawn(kind, x, z, opts)    -> the mob ({ id, kind, x, z, face, hp, state, t, ... })
// island.mobs.hit(mob, { amount, source: ['sword', 'silver'], from: p })
// island.mobs.telegraph(mob, { shape: 'circle'|'line'|'cone', x, z, r, ms, a, len, w })   // drawn by the client
// island.mobs.of(kind)                   -> the live mobs of that kind
//
// Each tick: every kind's tick(), then every mob's current state, then touches. Clients
// get [id, kind, x, z, face, state, extra] for each mob in the snapshot ('m'), plus
// { t: 'telegraph' } and { t: 'mobhit' } messages. Docs: docs/roadmap/CONTRACTS.md section 8.
const { r2 } = require('../systems/util');

const KINDS = {};
for (const name of ['stilled', 'dummy', 'crawler', 'leaning']) {
  const def = require(`./${name}`);
  if (!def.kind || !def.states || !def.states[def.start || 'idle']) throw new Error(`mobs/${name}.js: needs kind, states and a start state`);
  KINDS[def.kind] = def;
}

class Mobs {
  constructor(island) {
    this.island = island;
    this.list = [];
    this.nextId = 1;
    this.kindState = {};   // per kind, for its tick() (timers and such)
  }
  static def(kind) { return KINDS[kind] || null; }   // a kind's definition (P6: its radius, for hitting it)
  static kinds() { return Object.keys(KINDS); }
  def(kind) { return KINDS[kind]; }
  of(kind) { return this.list.filter(m => m.kind === kind && !m.gone); }
  byId(id) { return this.list.find(m => m.id === id && !m.gone) || null; }
  stateOf(kind) { return this.kindState[kind] || (this.kindState[kind] = {}); }

  spawn(kind, x, z, opts = {}) {
    const def = KINDS[kind];
    if (!def) throw new Error(`no mob kind "${kind}"`);
    const hp = opts.hp ?? def.hp ?? 1;
    const mob = { face: 0, ...opts, id: this.nextId++, kind, x, z, hp, maxHp: hp, state: opts.state || def.start || 'idle', t: 0 };
    this.list.push(mob);
    return mob;
  }
  remove(mob) { mob.gone = true; }

  // Damage: the amount times every matching weakness. At 0 hp the mob dies; otherwise a
  // kind with a 'stagger' state staggers.
  hit(mob, { amount = 0, source = [], from = null } = {}) {
    if (!mob || mob.gone || mob.dead) return 0;
    const def = KINDS[mob.kind], tags = [].concat(source);
    let dmg = amount;
    for (const tag of tags) if (def.weak && def.weak[tag]) dmg *= def.weak[tag];
    mob.hp = Math.max(0, mob.hp - dmg);
    const hit = { amount: dmg, source: tags, from };
    if (def.onHit) def.onHit(this.island, mob, hit);
    this.island.broadcast({ t: 'mobhit', id: mob.id, hp: r2(mob.hp), max: mob.maxHp ?? def.hp, dmg: r2(dmg) });
    if (mob.hp <= 0) {
      mob.dead = true;
      if (def.onDeath) def.onDeath(this.island, mob, hit);
      mob.gone = true;
    } else if (def.states.stagger) this.setState(mob, 'stagger');
    return dmg;
  }

  // A warning drawn on the ground before an attack lands: a circle, a line or a cone.
  telegraph(mob, { shape = 'circle', x = mob.x, z = mob.z, r = 2, ms = 800, a = mob.face, len = 0, w = 0 } = {}) {
    const tg = { shape, x: r2(x), z: r2(z), r: r2(r), ms, a: r2(a), len: r2(len), w: r2(w) };
    mob.telegraphed = { ...tg, until: Date.now() + ms };
    this.island.broadcast({ t: 'telegraph', id: mob.id, ...tg });
    return mob.telegraphed;
  }
  // Is (x, z) inside the mob's last telegraph? (for resolving the strike it warned about)
  inTelegraph(mob, x, z) {
    const g = mob.telegraphed;
    if (!g) return false;
    const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
    if (g.shape === 'circle') return d <= g.r;
    const along = dx * Math.sin(g.a) + dz * Math.cos(g.a);
    if (g.shape === 'line') return along >= 0 && along <= g.len && Math.abs(dx * Math.cos(g.a) - dz * Math.sin(g.a)) <= g.w / 2;
    if (g.shape === 'cone') { let da = Math.atan2(dx, dz) - g.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; return d <= g.r && Math.abs(da) <= (g.w || .6); }
    return false;
  }

  setState(mob, state) {
    if (!KINDS[mob.kind].states[state]) throw new Error(`mob kind ${mob.kind} has no state "${state}"`);
    mob.state = state; mob.t = 0;
  }

  update(dt, lights) {
    const isl = this.island;
    const ctx = { lights, now: Date.now(), players: [...isl.players.values()].filter(p => !p.dead && !isl.watching(p)) };
    for (const kind of Object.keys(KINDS)) if (KINDS[kind].tick) KINDS[kind].tick(isl, dt, ctx);
    for (const mob of this.list) {
      if (mob.gone) continue;
      const def = KINDS[mob.kind];
      mob.t += dt;
      const next = def.states[mob.state](mob, isl, dt, ctx);
      if (next && next !== mob.state && !mob.gone) this.setState(mob, next);
      if (def.onTouch && def.touch != null && !mob.gone) {
        for (const p of ctx.players) if (Math.hypot(p.x - mob.x, p.z - mob.z) < (def.radius || .5) + def.touch) def.onTouch(isl, mob, p);
      }
    }
    this.list = this.list.filter(m => !m.gone);
  }

  // For the snapshot: [id, kind, x, z, face, state, extra?]
  snap() {
    return this.list.map(m => {
      const def = KINDS[m.kind], row = [m.id, m.kind, r2(m.x), r2(m.z), r2(m.face), m.state];
      if (def.view) row.push(def.view(m));
      return row;
    });
  }
}

module.exports = { Mobs, KINDS };
