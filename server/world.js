// The island: authoritative simulation, catch-up after quiet periods, and persistence.
const WG = require('./shared/world-gen');
const { RULES, FIRES, ITEMS, heightAt, SPRING, SPAWN, isNight } = WG;

const TICK_MS = 80;           // simulation + position broadcast (~12.5 Hz)
const ME_EVERY = 3;           // personal stats every 3 ticks (~4 Hz)
const FIRES_EVERY = 12;       // fire fuel sync about once a second
const SAVE_MS = 30 * 1000;
const ACT_COOLDOWN = 350;     // ms; the client waits 450
const REACH_SLACK = 0.9;      // tolerance for latency when checking distances

const r2 = v => Math.round(v * 100) / 100;
const num = v => typeof v === 'number' && Number.isFinite(v);
const hasCost = (p, cost) => Object.entries(cost).every(([k, n]) => (p.inv[k] || 0) >= n);
const costText = cost => Object.entries(cost).map(([k, n]) => `${n} ${ITEMS[k].toLowerCase()}`).join(', ');

class Island {
  constructor(store, data) {
    this.store = store;
    this.id = data.id;
    this.name = data.name;
    this.seed = data.seed;
    this.day = data.day;
    this.time = data.time;
    this.lastTickAt = data.lastTickAt;
    this.objects = WG.generateObjects(this.seed).map(o => ({ ...o, state: WG.defaultState(o.type) }));
    for (const saved of data.objects) {
      const o = this.objects[saved.id];
      if (o) o.state = Object.assign(WG.defaultState(o.type), saved.state);
    }
    this.fires = data.fires.map(f => ({ id: f.id, x: f.x, z: f.z, fuel: f.fuel, kind: FIRES[f.kind] ? f.kind : 'campfire' }));
    this.drops = (data.drops || []).map(d => ({ id: d.id, x: d.x, z: d.z, items: d.items }));
    // Stone lanterns: fixed places from the seed, state from the database.
    // reclaim: 0 = fully clear, 1 = the fog has it all back (never-lit lanterns start at 1)
    this.lanterns = WG.generateLanterns(this.seed).map(l => ({ ...l, lit: false, fuel: 0, offerings: [], clearedSince: null, reclaim: 1 }));
    for (const saved of data.lanterns || []) {
      const l = this.lanterns[saved.id];
      if (l) Object.assign(l, { lit: saved.lit, fuel: saved.fuel, offerings: saved.offerings || [],
        clearedSince: saved.clearedSince ?? null, reclaim: saved.reclaim ?? (saved.lit ? 0 : 1) });
    }
    this.lanternsDirty = new Set();
    this.env = {};   // weather and moon flags for the fog (later phases)
    this.stilled = []; this.nextStilled = 1; this.stilledTimer = 0;
    this.players = new Map();   // playerId -> live player
    this.dirty = new Set();     // object ids changed since the last save
    this.timer = null;
    this.tickN = 0;
    this.lastSave = Date.now();
    this.saving = Promise.resolve();
  }

  // The island layout for /api/world (no states), built once.
  layoutJson() {
    if (!this._layout) this._layout = JSON.stringify(this.objects.map(o => {
      const { state, ...rest } = o; return rest;
    }));
    return this._layout;
  }

  static async load(store, id) {
    const data = await store.loadIsland(id);
    if (!data) throw new Error(`Island ${id} not found in the database`);
    return new Island(store, data);
  }

  // ================= Time =================
  // Advance the clock by `sec` real seconds. Works for one tick or for hours of
  // catch-up: sunrise effects are applied once no matter how many passed,
  // because regrowth only depends on the final day number.
  advance(sec) {
    if (sec <= 0) return [];
    const before = this.time, after = before + sec / RULES.DAY_LEN;
    const sunrises = Math.floor(after - 0.25) - Math.floor(before - 0.25);
    this.time = after - Math.floor(after);
    for (const f of this.fires) if (f.fuel > 0) f.fuel = Math.max(0, f.fuel - sec * FIRES[f.kind].burn);
    for (const l of this.lanterns || []) this.burnLantern(l, sec);
    if (sunrises > 0) {
      this.day += sunrises;
      return this.dawn();
    }
    return [];
  }

  dawn() {
    const changed = [];
    for (const o of this.objects) {
      const was = JSON.stringify(o.state);
      let s = o.state;
      // Felled trees and palms come back as saplings. They sprouted on the
      // morning they were due, which matters after a long catch-up.
      if ((o.type === 'tree' || o.type === 'palm') && s.gone && this.day - s.felledDay >= RULES.TREE_REGROW_DAYS) {
        s = o.state = { ...WG.defaultState(o.type), planted: s.felledDay + RULES.TREE_REGROW_DAYS };
        if (o.type === 'palm') s.coconuts = 0;
      }
      if (o.type === 'rock' && s.gone && this.day - s.goneDay >= RULES.ROCK_REGROW_DAYS) s = o.state = WG.defaultState(o.type);
      if (o.type === 'bush' && s.gone && this.day - s.goneDay >= RULES.TREE_REGROW_DAYS) s = o.state = WG.defaultState(o.type);
      if (o.type === 'ore' && s.gone && this.day - s.goneDay >= RULES.ORE_REGROW_DAYS) s = o.state = WG.defaultState(o.type);
      if (o.type === 'dig' && s.dug) s = o.state = WG.defaultState(o.type);
      const g = WG.growth(o.type, s, this.day, 0.25);
      if (o.type === 'palm' && !s.gone && g >= 1) s.coconuts = RULES.COCONUTS;
      if (o.type === 'bush' && g >= RULES.FRUIT_AT) s.berries = true;
      if (s.planted != null && g >= 1) delete s.planted;
      if (JSON.stringify(o.state) !== was) { changed.push(o); this.dirty.add(o.id); }
    }
    return changed;
  }

  catchUp() {
    const now = Date.now();
    const sec = Math.max(0, (now - this.lastTickAt) / 1000);
    const d0 = this.day;
    this.advance(sec);
    this.lastTickAt = now;
    if (sec > 5) console.log(`[island ${this.id}] woke up after ${Math.round(sec)}s: day ${d0} -> ${this.day}, time ${this.time.toFixed(3)}`);
  }

  // ================= Players =================
  async join(account, ws) {
    const old = this.players.get(account.id);
    if (old) {
      this.send(old, { t: 'kicked', reason: 'You logged in somewhere else.' });
      old.ws.close(4000, 'replaced');
      await this.leave(account.id, old);
    }
    const m = await this.store.getMember(this.id, account.id);
    if (ws.readyState !== ws.OPEN) return null;

    if (this.players.size === 0) this.start();

    const saved = m.inventory || {};
    const inv = { wood: m.wood, stone: m.stone };
    for (const k of Object.keys(ITEMS)) if (!(k in inv)) inv[k] = Math.max(0, saved[k] | 0);
    const p = {
      id: account.id, name: account.username, ws,
      x: m.x ?? SPAWN.x, z: m.z ?? SPAWN.z, face: m.face,
      health: m.health, hunger: m.hunger, thirst: m.thirst, inv,
      tools: (Array.isArray(saved.tools) ? saved.tools : []).filter(t => WG.recipeById(t)),
      dead: m.health <= 0, cause: '', moving: false, warm: false,
      energy: 100, exhausted: false, rest: 0, wantSprint: false, running: false,
      dread: m.dread || 0, fog: 0, knockedUntil: 0, camYaw: null, lastKnockAt: 0,
      lastPosAt: Date.now(), nextActAt: 0,
    };
    this.players.set(p.id, p);

    this.send(p, {
      t: 'welcome',
      you: this.selfView(p),
      island: { id: this.id, name: this.name, day: this.day, time: this.time },
      // the layout comes from /api/world; here only what differs from default
      states: this.objects.filter(o => !WG.isDefaultState(o.type, o.state)).map(o => [o.id, o.state]),
      fires: this.fires.map(f => this.fireView(f)),
      drops: this.drops.map(d => ({ id: d.id, x: d.x, z: d.z })),
      lanterns: this.lanterns.map(l => this.lanternView(l)),
      players: [...this.players.values()].filter(q => q !== p).map(q => this.publicView(q)),
      rules: RULES,
    });
    this.broadcast({ t: 'join', player: this.publicView(p) }, p);
    console.log(`[island ${this.id}] ${p.name} joined (${this.players.size} online)`);
    return p;
  }

  async leave(playerId, which) {
    const p = this.players.get(playerId);
    if (!p || (which && p !== which)) return;
    this.players.delete(playerId);
    this.broadcast({ t: 'leave', id: playerId });
    console.log(`[island ${this.id}] ${p.name} left (${this.players.size} online)`);
    await this.save([p]);
    if (this.players.size === 0) this.stop();
  }

  selfView(p) {
    return { id: p.id, name: p.name, x: p.x, z: p.z, face: p.face, health: p.health, hunger: p.hunger,
      thirst: p.thirst, inv: p.inv, tools: p.tools, energy: p.energy, exhausted: p.exhausted, dread: p.dread, dead: p.dead };
  }
  publicView(p) { return { id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), face: r2(p.face), dead: p.dead }; }
  fireView(f) { return { id: f.id, x: f.x, z: f.z, fuel: r2(f.fuel), kind: f.kind }; }

  // ================= Loop =================
  start() {
    if (this.timer) return;
    this.catchUp();
    this.lastSave = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickAt) / 1000, 1);
    this.lastTickAt = now;
    this.tickN++;

    const dayBefore = this.day;
    const regrown = this.advance(dt);
    if (this.day !== dayBefore) {
      this.broadcast({ t: 'dawn', day: this.day });
      if (regrown.length) this.broadcast({ t: 'objs', list: regrown.map(o => [o.id, o.state]) });
    }

    const night = isNight(this.time);
    const lights = this.lights();
    const D = RULES.DREAD, nf = WG.nightFactor(this.time);
    this.updateStilled(dt, lights);
    for (const p of this.players.values()) {
      if (p.dead) continue;
      p.warm = this.fires.some(f => f.fuel > 0 && Math.hypot(f.x - p.x, f.z - p.z) < FIRES[f.kind].warm)
        || this.lanterns.some(l => l.lit && Math.hypot(l.x - p.x, l.z - p.z) < this.lanternRadius(l) * .6);
      // Dread: fog, darkness and being alone push it up; light, day and friends bring it down.
      p.fog = WG.fogAt(p.x, p.z, heightAt(p.x, p.z), this.time, lights, this.env);
      let alone = true;
      for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < D.FRIEND_RADIUS) { alone = false; break; }
      let dd = D.FOG * p.fog;
      if (nf > .5 && !p.warm) dd += D.DARK * nf;
      if (alone) dd += nf > .5 ? D.ALONE_NIGHT : D.ALONE_DAY;
      else dd += D.FRIENDS;
      if (p.warm) dd += D.LIGHT;
      if (nf < .5 && p.fog < .3) dd += D.DAY;
      if (this.stilled.some(s => Math.hypot(s.x - p.x, s.z - p.z) < RULES.STILLED.NEAR_RADIUS)) dd += RULES.STILLED.NEAR_DREAD;
      p.dread = Math.max(0, Math.min(100, p.dread + dd * dt));
      p.running = WG.stepEnergy(p, dt, p.wantSprint && p.moving);
      // Hunger and thirst only go down while you're moving; standing still costs nothing.
      if (p.moving) {
        p.hunger = Math.max(0, p.hunger - (RULES.HUNGER_DRAIN + (p.running ? RULES.SPRINT_HUNGER : 0)) * dt);
        p.thirst = Math.max(0, p.thirst - RULES.THIRST_DRAIN * dt);
      }
      let hurt = 0;
      if (p.hunger <= 0) { hurt += RULES.STARVE_DMG; p.cause = 'hunger'; }
      if (p.thirst <= 0) { hurt += RULES.STARVE_DMG; p.cause = 'thirst'; }
      if (night && !p.warm) { hurt += RULES.COLD_DMG; if (p.hunger > 0 && p.thirst > 0) p.cause = 'cold'; }
      if (hurt > 0) p.health -= hurt * dt;
      else if (p.hunger > RULES.REGEN_MIN && p.thirst > RULES.REGEN_MIN) p.health = Math.min(100, p.health + RULES.REGEN * dt);
      if (p.health <= 0) {
        p.health = 0; p.dead = true; p.moving = false;
        this.send(p, { t: 'died', cause: p.cause, day: this.day });
      }
    }

    // Everyone's position, in one shared message.
    const snap = JSON.stringify({
      t: 'snap', time: this.time, day: this.day,
      p: [...this.players.values()].map(p => [p.id, r2(p.x), r2(p.z), r2(p.face), p.moving ? (p.running ? 2 : 1) : 0, p.dead ? 1 : 0]),
      s: this.stilled.map(s => [s.id, r2(s.x), r2(s.z), r2(s.face)]),
    });
    for (const p of this.players.values()) this.sendRaw(p, snap);

    if (this.tickN % ME_EVERY === 0) for (const p of this.players.values()) this.sendMe(p);
    if (this.tickN % FIRES_EVERY === 0 && this.fires.length) {
      this.broadcast({ t: 'fires', list: this.fires.map(f => [f.id, r2(f.fuel)]) });
    }
    if (this.tickN % (FIRES_EVERY * 5) === 0) {
      const lit = this.lanterns.filter(l => l.lit || l.offerings.length);
      if (lit.length) this.broadcast({ t: 'lanterns', list: lit.map(l => this.lanternView(l)) });
    }
    if (now - this.lastSave > SAVE_MS) this.save();
  }

  sendMe(p) {
    this.send(p, { t: 'me', health: r2(p.health), hunger: r2(p.hunger), thirst: r2(p.thirst), inv: p.inv, tools: p.tools,
      energy: r2(p.energy), exhausted: p.exhausted, warm: p.warm, dead: p.dead, dread: r2(p.dread), fog: r2(p.fog),
      down: p.knockedUntil > Date.now() });
  }

  // ================= Messages =================
  onMessage(p, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    switch (msg.t) {
      case 'pos': return this.onPos(p, msg);
      case 'act': return this.onAct(p, msg);
      case 'build': return this.onBuild(p, msg);
      case 'respawn': return this.onRespawn(p);
      case 'ping': return this.send(p, { t: 'pong', c: msg.c });
    }
  }

  onPos(p, { x, z, face, moving, sprint, cam }) {
    if (num(cam)) p.camYaw = cam;
    if (p.dead || !num(x) || !num(z) || !num(face)) return;
    const now = Date.now();
    if (p.knockedUntil > now) { p.lastPosAt = now; p.moving = false; if (Math.hypot(x - p.x, z - p.z) > .3) this.send(p, { t: 'correct', x: p.x, z: p.z }); return; }
    const dt = (now - p.lastPosAt) / 1000;
    p.lastPosAt = now;
    p.wantSprint = !!sprint;
    // Allow sprint speed only while the server agrees you have energy.
    const speed = RULES.WALK_SPEED * (p.wantSprint && !p.exhausted ? RULES.SPRINT_MULT : 1);
    const maxStep = speed * 1.4 * Math.min(dt, 1) + 0.6;
    const d = Math.hypot(x - p.x, z - p.z);
    if (heightAt(x, z) <= -1) { this.send(p, { t: 'correct', x: p.x, z: p.z }); return; }
    if (d > maxStep) {
      // Too fast: move as far as allowed and tell the client where it really is.
      p.x += (x - p.x) / d * maxStep; p.z += (z - p.z) / d * maxStep;
      this.send(p, { t: 'correct', x: p.x, z: p.z });
    } else { p.x = x; p.z = z; }
    p.face = face;
    p.moving = !!moving || d > 0.02;   // actually changing position counts, whatever the client says
  }

  onAct(p, { target }) {
    if (p.dead || typeof target !== 'string') return;
    const now = Date.now();
    if (now < p.nextActAt || p.knockedUntil > now) return;
    p.nextActAt = now + ACT_COOLDOWN;
    const say = msg => this.send(p, { t: 'toast', msg });
    const has = tool => p.tools.includes(tool);

    if (target === 'spring') {
      const sn = WG.nearestSpring(p.x, p.z);
      if (Math.hypot(p.x - sn.x, p.z - sn.z) > RULES.SPRING_REACH + REACH_SLACK) return;
      p.thirst = Math.min(100, p.thirst + RULES.SPRING_WATER);
      return say('Cold, clean water.');
    }
    if (target === 'sea') {
      if (heightAt(p.x, p.z) > 0.25 + 0.4) return;
      p.thirst = Math.max(0, p.thirst + RULES.SEA_WATER);
      return say('Salty. That only made it worse.');
    }

    const m = /^([ofdl])(\d+)$/.exec(target);
    if (!m) return;
    if (m[1] === 'd') return this.pickUp(p, +m[2]);
    if (m[1] === 'l') return this.tendLantern(p, +m[2]);
    if (m[1] === 'f') {
      const f = this.fires.find(f => f.id === +m[2]);
      if (!f || Math.hypot(f.x - p.x, f.z - p.z) - 0.6 > RULES.REACH + REACH_SLACK) return;
      if (p.inv.wood <= 0) return say('You need wood for the fire.');
      const k = FIRES[f.kind];
      p.inv.wood--;
      f.fuel = Math.min(f.fuel + k.add, k.max);
      this.broadcast({ t: 'fires', list: [[f.id, r2(f.fuel)]] });
      this.fx(p, 'swing');
      this.sendMe(p);
      return say('The fire flares up.');
    }

    const o = this.objects[+m[2]];
    if (!o || o.state.gone) return;
    const size = WG.sizeOf(o, o.state, this.day, this.time);
    if (Math.hypot(o.x - p.x, o.z - p.z) - o.r * Math.max(size, 1) > RULES.REACH + REACH_SLACK) return;
    const s = o.state;
    const changed = () => { this.dirty.add(o.id); this.broadcast({ t: 'objs', list: [[o.id, o.state]] }); this.sendMe(p); };
    const chop = () => {
      const got = has('axe') ? 2 : 1;
      s.hits++; p.inv.wood += got;
      this.fx(p, 'swing', o.id);
      if (s.hits >= WG.chopsFor(o, s, this.day, this.time)) { s.gone = true; s.felledDay = this.day; say(`+${got} wood. The tree comes down.`); }
      else say(`+${got} wood`);
      changed();
    };
    switch (o.type) {
      case 'palm':
        if (s.coconuts > 0) {
          s.coconuts--;
          p.hunger = Math.min(100, p.hunger + RULES.COCONUT_FOOD);
          p.thirst = Math.min(100, p.thirst + RULES.COCONUT_WATER);
          p.dread = Math.max(0, p.dread + RULES.DREAD.EAT);
          p.inv.seeds += 1;
          this.fx(p, 'swing');
          say('A coconut. Food and a bit of water. (+1 seeds)');
          changed();
        } else chop();
        break;
      case 'tree': chop(); break;
      case 'bush':
        if (s.berries) {
          s.berries = false;
          p.hunger = Math.min(100, p.hunger + RULES.BERRY_FOOD);
          p.dread = Math.max(0, p.dread + RULES.DREAD.EAT);
          p.inv.seeds += 1;
          say(o.species === 'blueberry' ? 'Blueberries. Sweet! (+1 seeds)' : 'Berries. Tart, but filling. (+1 seeds)');
          changed();
        } else say('Nothing left. It’ll grow back by morning.');
        break;
      case 'rock': {
        const got = has('pickaxe') ? 2 : 1;
        s.left--; p.inv.stone += got;
        if (s.left <= 0) { s.gone = true; s.goneDay = this.day; }
        this.fx(p, 'swing', o.id);
        say(`+${got} stone`);
        changed();
        break;
      }
      case 'ore': {
        if (!has('pickaxe')) return say('Too hard to break by hand. You need a pickaxe.');
        const got = has('ironpick') ? 2 : 1;
        s.left--; p.inv[o.ore] += got;
        if (s.left <= 0) { s.gone = true; s.goneDay = this.day; }
        this.fx(p, 'swing', o.id);
        say(`+${got} ${ITEMS[o.ore].toLowerCase()}`);
        changed();
        break;
      }
      case 'dig':
        if (s.dug) return say('Already dug up. It’ll settle again by morning.');
        if (!has('shovel')) return say('The soil is soft here. With a shovel you could dig.');
        s.dug = true; p.inv.clay += RULES.DIG_CLAY;
        this.fx(p, 'swing', o.id);
        if (Math.random() < RULES.SEED_CHANCE_DIG) { p.inv.seeds += 1; say(`+${RULES.DIG_CLAY} clay, and some buried seeds`); }
        else say(`+${RULES.DIG_CLAY} clay`);
        changed();
        break;
    }
  }

  async onBuild(p, { recipe, x, z }) {
    if (p.dead) return;
    const r = WG.recipeById(recipe || 'campfire');
    if (!r) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    if (r.kind === 'tool' && p.tools.includes(r.id)) return say(`You already have a ${r.name.toLowerCase()}.`);
    if (r.needs && !p.tools.includes(r.needs)) return say(`You need a ${WG.recipeById(r.needs).name.toLowerCase()} first.`);
    if (!hasCost(p, r.cost)) return say(`A ${r.name.toLowerCase()} needs ${costText(r.cost)}.`);

    if (r.kind === 'item') {
      for (const [k, n] of Object.entries(r.cost)) p.inv[k] -= n;
      for (const [k, n] of Object.entries(r.gives)) p.inv[k] += n;
      this.fx(p, 'swing');
      this.sendMe(p);
      return say(`You made ${r.name.toLowerCase()}.`);
    }
    if (r.kind === 'tool') {
      for (const [k, n] of Object.entries(r.cost)) p.inv[k] -= n;
      p.tools.push(r.id);
      this.fx(p, 'swing');
      this.sendMe(p);
      return say(`You made a ${r.name.toLowerCase()}!`);
    }

    // A fire, placed in front of you.
    if (!num(x) || !num(z) || Math.hypot(x - p.x, z - p.z) > 2.6) return;
    if (heightAt(x, z) < 0.35) return say('Too wet here. Build it on dry ground.');
    if (this.fires.some(f => Math.hypot(f.x - x, f.z - z) < 1.4)) return say('There’s already a fire right there.');
    for (const [k, n] of Object.entries(r.cost)) p.inv[k] -= n;
    const kind = FIRES[r.id];
    try {
      const id = await this.store.insertFire(this.id, r2(x), r2(z), kind.start, p.id, r.id);
      const f = { id, x: r2(x), z: r2(z), fuel: kind.start, kind: r.id };
      this.fires.push(f);
      this.broadcast({ t: 'fire', fire: this.fireView(f) });
      this.fx(p, 'swing');
      this.sendMe(p);
      say(r.id === 'hearth' ? 'A clay hearth. It’ll burn long and warm.' : 'A fire. Stay close to it at night.');
    } catch (e) {
      console.error('[island] could not save fire', e.message);
      for (const [k, n] of Object.entries(r.cost)) p.inv[k] += n;
      say('The fire wouldn’t catch. Try again.');
    }
  }

  onRespawn(p) {
    if (!p.dead) return;
    // You keep your tools; what you were carrying is lost.
    for (const k of Object.keys(p.inv)) p.inv[k] = 0;
    Object.assign(p, RULES.START, { x: SPAWN.x, z: SPAWN.z, face: Math.PI, dead: false, cause: '', lastPosAt: Date.now(),
      energy: 100, exhausted: false, rest: 0, dread: 10, knockedUntil: 0 });
    this.send(p, { t: 'respawned', you: this.selfView(p) });
  }

  fx(p, kind, obj) { this.broadcast({ t: 'fx', id: p.id, k: kind, o: obj }); }

  // ================= The Stilled =================
  // Pale figures in the fog. They spawn at night in fog near players, never
  // enter light or clear air, and move only while no player is looking at them.
  fogHere(x, z, lights) { return WG.fogAt(x, z, heightAt(x, z), this.time, lights, this.env); }
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
  }
  isAlone(p) {
    for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < RULES.DREAD.FRIEND_RADIUS) return false;
    return true;
  }
  updateStilled(dt, lights) {
    const S = RULES.STILLED, now = Date.now(), players = [...this.players.values()].filter(p => !p.dead);
    // fade: gone when their spot clears (dawn, a fire) or nobody is near
    this.stilled = this.stilled.filter(s => this.fogHere(s.x, s.z, lights) > .2
      && players.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 90));
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
      if (this.watched(s)) continue;
      let best = null, bestScore = -1e9;
      for (const p of players) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        const notice = S.NOTICE + p.dread * S.NOTICE_PER_DREAD + (this.isAlone(p) ? S.NOTICE_ALONE : 0);
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
  }

  // Light sources that clear fog: lit fires (lanterns join them later).
  lights() {
    return this.fires.filter(f => f.fuel > 0).map(f => ({ x: f.x, z: f.z, r: FIRES[f.kind].warm * 1.4 }))
      .concat(this.lanterns.filter(l => this.clearRadius(l) > 0).map(l => ({ x: l.x, z: l.z, r: this.clearRadius(l) })));
  }

  // ================= Stone lanterns =================
  lanternRadius(l) { return l.big ? RULES.LANTERN.BIG_RADIUS : RULES.LANTERN.RADIUS; }
  // How far the clearing reaches: full while lit; once cold it shrinks in steps
  // as the fog reclaims it.
  clearRadius(l) {
    if (l.lit) return this.lanternRadius(l);
    const steps = RULES.LANTERN.RECLAIM_STEPS;
    return this.lanternRadius(l) * Math.ceil((1 - l.reclaim) * steps - 1e-9) / steps;
  }
  // The fog fights back. Burn oil (faster the longer the clearing has been held,
  // and on Drowning nights); once cold, the fog reclaims the clearing over
  // RECLAIM_DAYS. Works for one tick or a long offline catch-up.
  burnLantern(l, sec) {
    const L = RULES.LANTERN;
    if (l.lit) {
      const heldDays = l.clearedSince ? Math.max(0, (this.lastTickAt - l.clearedSince) / 1000 / RULES.DAY_LEN) : 0;
      const rate = (1 + Math.min(L.HELD_MAX, heldDays * L.HELD_PER_DAY)) * (this.env.drowning ? L.DROWNING_MULT : 1);
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
  }
  lanternChanged(l) { if (this.players && this.players.size) this.broadcast({ t: 'lanterns', list: [this.lanternView(l)] }); }
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
  }
  lanternView(l) {
    return { id: l.id, x: l.x, z: l.z, big: l.big, lit: l.lit, fuel: r2(l.fuel), have: l.offerings.length,
      need: l.big ? RULES.LANTERN.BIG_OFFERINGS : 1, clear: r2(this.clearRadius(l)), reclaim: r2(l.reclaim) };
  }
  // Offer lamp oil: lights a cold lantern (great ones need offerings from
  // several different frogs first) or tops up a lit one.
  tendLantern(p, id) {
    const l = this.lanterns[id], L = RULES.LANTERN;
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > (l.big ? 2.2 : 1.6) + RULES.REACH + REACH_SLACK) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    if (p.inv.oil <= 0) return say(l.lit ? 'It burns on. Lamp oil would keep it going.' : 'Cold stone. It wants an offering of lamp oil.');
    if (l.lit) {
      if (l.fuel >= L.MAX_FUEL - 1) return say('The lantern is full.');
      p.inv.oil--; l.fuel = Math.min(L.MAX_FUEL, l.fuel + L.FUEL_PER_OIL);
      say('The flame steadies.');
    } else if (l.big) {
      if (l.offerings.includes(p.id)) return say('You have made your offering. It needs other frogs\u2019 too.');
      p.inv.oil--; l.offerings.push(p.id);
      if (l.offerings.length >= L.BIG_OFFERINGS) {
        l.lit = true; l.fuel = L.FUEL_PER_OIL * L.BIG_OFFERINGS; l.litBy = p.id; l.reclaim = 0; l.clearedSince = l.clearedSince || Date.now();
        this.broadcast({ t: 'toast', msg: 'A great lantern flares to life. The fog pulls back from the hill.' });
      } else say(`Your offering is taken. It needs ${L.BIG_OFFERINGS - l.offerings.length} more frog${L.BIG_OFFERINGS - l.offerings.length > 1 ? 's' : ''}.`);
    } else {
      p.inv.oil--; l.lit = true; l.fuel = L.FUEL_PER_OIL; l.litBy = p.id; l.reclaim = 0; l.clearedSince = l.clearedSince || Date.now();
      say('The old lantern catches. The fog draws back.');
    }
    this.lanternsDirty.add(l.id);
    this.fx(p, 'swing');
    this.broadcast({ t: 'lanterns', list: [this.lanternView(l)] });
    this.sendMe(p);
  }

  // Knocked down (by the Stilled): hurt, frightened, and half of what you carry
  // is left in a sack on the ground where you fell.
  async knock(p) {
    const now = Date.now(), K = RULES.KNOCK;
    if (p.dead || p.knockedUntil > now) return;
    p.knockedUntil = now + K.DOWN_MS;
    p.health = Math.max(1, p.health - K.HEALTH);
    p.dread = Math.min(100, p.dread + K.DREAD);
    const items = {};
    for (const [k, n] of Object.entries(p.inv)) { const lose = Math.ceil(n * K.DROP); if (lose > 0) { items[k] = lose; p.inv[k] -= lose; } }
    this.broadcast({ t: 'knocked', id: p.id });
    this.send(p, { t: 'toast', msg: Object.keys(items).length ? 'Something knocks you down. Your things scatter.' : 'Something knocks you down.' });
    this.sendMe(p);
    if (!Object.keys(items).length) return;
    const x = r2(p.x), z = r2(p.z);
    try {
      const id = await this.store.insertDrop(this.id, x, z, items);
      const d = { id, x, z, items };
      this.drops.push(d);
      this.broadcast({ t: 'drop', drop: { id, x, z } });
    } catch (e) { console.error('[island] could not save drop', e.message); }
  }

  async pickUp(p, id) {
    const d = this.drops.find(d => d.id === id);
    if (!d || Math.hypot(d.x - p.x, d.z - p.z) > RULES.REACH + 1 + REACH_SLACK) return;
    this.drops = this.drops.filter(x => x !== d);
    for (const [k, n] of Object.entries(d.items)) if (k in p.inv) p.inv[k] += n;
    this.broadcast({ t: 'undrop', id });
    this.send(p, { t: 'toast', msg: 'You gather up the scattered things.' });
    this.sendMe(p);
    try { await this.store.deleteDrop(id); } catch (e) { console.error('[island] could not delete drop', e.message); }
  }

  // ================= Networking helpers =================
  sendRaw(p, text) { if (p.ws.readyState === p.ws.OPEN) p.ws.send(text); }
  send(p, msg) { this.sendRaw(p, JSON.stringify(msg)); }
  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) if (p !== except) this.sendRaw(p, text);
  }

  // ================= Persistence =================
  // Saves are queued so two never run at the same time.
  save(extraMembers = []) {
    this.lastSave = Date.now();
    const members = [...this.players.values(), ...extraMembers].map(p => {
      const { wood, stone, ...rest } = p.inv;
      return {
        playerId: p.id, x: r2(p.x), z: r2(p.z), face: r2(p.face), health: r2(p.health), hunger: r2(p.hunger),
        thirst: r2(p.thirst), wood, stone, inventory: { ...rest, tools: [...p.tools] }, dread: r2(p.dread),
      };
    });
    const objects = [...this.dirty].map(id => {
      const o = this.objects[id];
      return { id, state: WG.isDefaultState(o.type, o.state) ? null : { ...o.state } };
    });
    this.dirty.clear();
    const lanterns = [...this.lanternsDirty].map(id => { const l = this.lanterns[id]; return { id, lit: l.lit, fuel: r2(l.fuel), offerings: [...l.offerings], litBy: l.litBy, clearedSince: l.clearedSince, reclaim: r2(l.reclaim) }; });
    this.lanternsDirty = new Set();
    const snap = {
      id: this.id, day: this.day, time: this.time, lastTickAt: this.lastTickAt,
      objects, fires: this.fires.map(f => ({ id: f.id, fuel: r2(f.fuel) })), members,
      lanterns,
    };
    this.saving = this.saving.then(() => this.store.saveIsland(snap)).catch(e => {
      console.error(`[island ${this.id}] save failed:`, e.message);
      for (const o of objects) this.dirty.add(o.id);   // try again next time
      for (const l of lanterns) this.lanternsDirty.add(l.id);
    });
    return this.saving;
  }
}

module.exports = { Island };
