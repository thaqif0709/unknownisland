// The island: authoritative simulation, catch-up after quiet periods, and persistence.
const WG = require('./shared/world-gen');
const { RULES, heightAt, SPRING, SPAWN, isNight } = WG;

const TICK_MS = 80;           // simulation + position broadcast (~12.5 Hz)
const ME_EVERY = 3;           // personal stats every 3 ticks (~4 Hz)
const FIRES_EVERY = 12;       // fire fuel sync about once a second
const SAVE_MS = 30 * 1000;
const ACT_COOLDOWN = 350;     // ms; the client waits 450
const REACH_SLACK = 0.9;      // tolerance for latency when checking distances

const r2 = v => Math.round(v * 100) / 100;
const num = v => typeof v === 'number' && Number.isFinite(v);

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
    this.fires = data.fires.map(f => ({ id: f.id, x: f.x, z: f.z, fuel: f.fuel }));
    this.players = new Map();   // playerId -> live player
    this.dirty = new Set();     // object ids changed since the last save
    this.timer = null;
    this.tickN = 0;
    this.lastSave = Date.now();
    this.saving = Promise.resolve();
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
    for (const f of this.fires) if (f.fuel > 0) f.fuel = Math.max(0, f.fuel - sec);
    if (sunrises > 0) {
      this.day += sunrises;
      return this.dawn();
    }
    return [];
  }

  dawn() {
    const changed = [];
    for (const o of this.objects) {
      const s = o.state, was = JSON.stringify(s);
      if (o.type === 'palm' && !s.gone) s.coconuts = RULES.COCONUTS;
      if (o.type === 'bush') s.berries = true;
      if ((o.type === 'tree' || o.type === 'palm') && s.gone && this.day - s.felledDay >= RULES.TREE_REGROW_DAYS) o.state = WG.defaultState(o.type);
      if (o.type === 'rock' && s.gone && this.day - s.goneDay >= RULES.ROCK_REGROW_DAYS) o.state = WG.defaultState(o.type);
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

    const p = {
      id: account.id, name: account.username, ws,
      x: m.x ?? SPAWN.x, z: m.z ?? SPAWN.z, face: m.face,
      health: m.health, hunger: m.hunger, thirst: m.thirst, wood: m.wood, stone: m.stone,
      dead: m.health <= 0, cause: '', moving: false, warm: false,
      lastPosAt: Date.now(), nextActAt: 0,
    };
    this.players.set(p.id, p);

    this.send(p, {
      t: 'welcome',
      you: this.selfView(p),
      island: { id: this.id, name: this.name, day: this.day, time: this.time },
      objects: this.objects.map(o => ({ id: o.id, type: o.type, x: o.x, z: o.z, r: o.r, s: o.s, state: o.state })),
      fires: this.fires.map(f => ({ id: f.id, x: f.x, z: f.z, fuel: f.fuel })),
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
      thirst: p.thirst, wood: p.wood, stone: p.stone, dead: p.dead };
  }
  publicView(p) { return { id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), face: r2(p.face), dead: p.dead }; }

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
    for (const p of this.players.values()) {
      if (p.dead) continue;
      p.warm = this.fires.some(f => f.fuel > 0 && Math.hypot(f.x - p.x, f.z - p.z) < RULES.WARM_RADIUS);
      p.hunger = Math.max(0, p.hunger - RULES.HUNGER_DRAIN * dt);
      p.thirst = Math.max(0, p.thirst - RULES.THIRST_DRAIN * dt);
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
      p: [...this.players.values()].map(p => [p.id, r2(p.x), r2(p.z), r2(p.face), p.moving ? 1 : 0, p.dead ? 1 : 0]),
    });
    for (const p of this.players.values()) this.sendRaw(p, snap);

    if (this.tickN % ME_EVERY === 0) {
      for (const p of this.players.values()) {
        this.send(p, { t: 'me', health: r2(p.health), hunger: r2(p.hunger), thirst: r2(p.thirst),
          wood: p.wood, stone: p.stone, warm: p.warm, dead: p.dead });
      }
    }
    if (this.tickN % FIRES_EVERY === 0 && this.fires.length) {
      this.broadcast({ t: 'fires', list: this.fires.map(f => [f.id, r2(f.fuel)]) });
    }
    if (now - this.lastSave > SAVE_MS) this.save();
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

  onPos(p, { x, z, face, moving }) {
    if (p.dead || !num(x) || !num(z) || !num(face)) return;
    const now = Date.now();
    const dt = (now - p.lastPosAt) / 1000;
    p.lastPosAt = now;
    const maxStep = RULES.WALK_SPEED * 1.4 * Math.min(dt, 1) + 0.6;
    const d = Math.hypot(x - p.x, z - p.z);
    if (heightAt(x, z) <= -1) { this.send(p, { t: 'correct', x: p.x, z: p.z }); return; }
    if (d > maxStep) {
      // Too fast: move as far as allowed and tell the client where it really is.
      p.x += (x - p.x) / d * maxStep; p.z += (z - p.z) / d * maxStep;
      this.send(p, { t: 'correct', x: p.x, z: p.z });
    } else { p.x = x; p.z = z; }
    p.face = face;
    p.moving = !!moving;
  }

  onAct(p, { target }) {
    if (p.dead || typeof target !== 'string') return;
    const now = Date.now();
    if (now < p.nextActAt) return;
    p.nextActAt = now + ACT_COOLDOWN;
    const say = msg => this.send(p, { t: 'toast', msg });

    if (target === 'spring') {
      if (Math.hypot(p.x - SPRING.x, p.z - SPRING.z) > RULES.SPRING_REACH + REACH_SLACK) return;
      p.thirst = Math.min(100, p.thirst + RULES.SPRING_WATER);
      return say('Cold, clean water.');
    }
    if (target === 'sea') {
      if (heightAt(p.x, p.z) > 0.25 + 0.4) return;
      p.thirst = Math.max(0, p.thirst + RULES.SEA_WATER);
      return say('Salty. That only made it worse.');
    }

    const m = /^([of])(\d+)$/.exec(target);
    if (!m) return;
    if (m[1] === 'f') {
      const f = this.fires.find(f => f.id === +m[2]);
      if (!f || Math.hypot(f.x - p.x, f.z - p.z) - 0.6 > RULES.REACH + REACH_SLACK) return;
      if (p.wood <= 0) return say('You need wood for the fire.');
      p.wood--;
      f.fuel = Math.min(f.fuel + RULES.FIRE_ADD_FUEL, RULES.FIRE_MAX_FUEL);
      this.broadcast({ t: 'fires', list: [[f.id, r2(f.fuel)]] });
      this.fx(p, 'swing');
      return say('The fire flares up.');
    }

    const o = this.objects[+m[2]];
    if (!o || o.state.gone || Math.hypot(o.x - p.x, o.z - p.z) - o.r > RULES.REACH + REACH_SLACK) return;
    const s = o.state;
    const changed = () => { this.dirty.add(o.id); this.broadcast({ t: 'objs', list: [[o.id, o.state]] }); };
    const chop = () => {
      s.hits++; p.wood++;
      this.fx(p, 'swing', o.id);
      if (s.hits >= RULES.CHOPS) { s.gone = true; s.felledDay = this.day; say('+1 wood. The tree comes down.'); }
      else say('+1 wood');
      changed();
    };
    switch (o.type) {
      case 'palm':
        if (s.coconuts > 0) {
          s.coconuts--;
          p.hunger = Math.min(100, p.hunger + RULES.COCONUT_FOOD);
          p.thirst = Math.min(100, p.thirst + RULES.COCONUT_WATER);
          this.fx(p, 'swing');
          say('A coconut. Food and a bit of water.');
          changed();
        } else chop();
        break;
      case 'tree': chop(); break;
      case 'bush':
        if (s.berries) {
          s.berries = false;
          p.hunger = Math.min(100, p.hunger + RULES.BERRY_FOOD);
          say('Berries. Tart, but filling.');
          changed();
        } else say('Nothing left. It’ll grow back by morning.');
        break;
      case 'rock':
        s.left--; p.stone++;
        if (s.left <= 0) { s.gone = true; s.goneDay = this.day; }
        this.fx(p, 'swing');
        say('+1 stone');
        changed();
        break;
    }
  }

  async onBuild(p, { x, z }) {
    if (p.dead || !num(x) || !num(z)) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    if (p.wood < RULES.FIRE_WOOD || p.stone < RULES.FIRE_STONE) {
      return say(`A fire needs ${RULES.FIRE_WOOD} wood and ${RULES.FIRE_STONE} stone. You have ${p.wood} and ${p.stone}.`);
    }
    if (Math.hypot(x - p.x, z - p.z) > 2.6) return;
    if (heightAt(x, z) < 0.35) return say('Too wet here. Build it on dry ground.');
    if (this.fires.some(f => Math.hypot(f.x - x, f.z - z) < 1.4)) return say('There’s already a fire right there.');
    p.wood -= RULES.FIRE_WOOD; p.stone -= RULES.FIRE_STONE;
    try {
      const id = await this.store.insertFire(this.id, r2(x), r2(z), RULES.FIRE_START_FUEL, p.id);
      const f = { id, x: r2(x), z: r2(z), fuel: RULES.FIRE_START_FUEL };
      this.fires.push(f);
      this.broadcast({ t: 'fire', fire: f });
      this.fx(p, 'swing');
      say('A fire. Stay close to it at night.');
    } catch (e) {
      console.error('[island] could not save fire', e.message);
      p.wood += RULES.FIRE_WOOD; p.stone += RULES.FIRE_STONE;
      say('The fire wouldn’t catch. Try again.');
    }
  }

  onRespawn(p) {
    if (!p.dead) return;
    Object.assign(p, RULES.START, { wood: 0, stone: 0, x: SPAWN.x, z: SPAWN.z, face: Math.PI, dead: false, cause: '', lastPosAt: Date.now() });
    this.send(p, { t: 'respawned', you: this.selfView(p) });
  }

  fx(p, kind, obj) { this.broadcast({ t: 'fx', id: p.id, k: kind, o: obj }); }

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
    const members = [...this.players.values(), ...extraMembers].map(p => ({
      playerId: p.id, x: r2(p.x), z: r2(p.z), face: r2(p.face), health: r2(p.health), hunger: r2(p.hunger),
      thirst: r2(p.thirst), wood: p.wood, stone: p.stone,
    }));
    const objects = [...this.dirty].map(id => {
      const o = this.objects[id];
      return { id, state: WG.isDefaultState(o.type, o.state) ? null : { ...o.state } };
    });
    this.dirty.clear();
    const snap = {
      id: this.id, day: this.day, time: this.time, lastTickAt: this.lastTickAt,
      objects, fires: this.fires.map(f => ({ id: f.id, fuel: r2(f.fuel) })), members,
    };
    this.saving = this.saving.then(() => this.store.saveIsland(snap)).catch(e => {
      console.error(`[island ${this.id}] save failed:`, e.message);
      for (const o of objects) this.dirty.add(o.id);   // try again next time
    });
    return this.saving;
  }
}

module.exports = { Island };
