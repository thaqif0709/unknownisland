// The island: authoritative simulation, catch-up after quiet periods, and persistence.
const WG = require('./shared/world-gen');
const { FIRES, isNight } = WG;

const TICK_MS = 80;           // simulation + position broadcast (~12.5 Hz)
const ME_EVERY = 3;           // personal stats every 3 ticks (~4 Hz)
const FIRES_EVERY = 12;       // fire fuel sync about once a second
const SAVE_MS = 30 * 1000;
const { r2 } = require('./systems/util');

// Every feature lives in server/systems/<name>.js and plugs in here: its `methods`
// are mixed into Island.prototype, its `messages` answer msg.t from clients, its `uses`
// say what E does to kinds of world object, and the
// optional hooks onTick(dt), onDawn(sunrises) and onJoin(p) (extra welcome fields) run
// alongside the core loop. See docs/roadmap/CONTRACTS.md section 2.
const SYSTEMS = ['journal', 'tides', 'bugs', 'weather', 'time', 'chat', 'board', 'patches', 'players',
  'inventory', 'objects', 'gather', 'crafting', 'fires', 'stilled', 'lanterns', 'buckets', 'drops', 'sleeper', 'regions', 'streaming', 'charting', 'caves'];

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
    this.fires = data.fires.map(f => ({ id: f.id, x: f.x, z: f.z, fuel: f.fuel, kind: FIRES[f.kind] ? f.kind : 'campfire', pot: f.pot || null }));
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
    this.weather = data.weather || 'clear';
    this.chains = data.chains || {};   // Sleeper request chains: { region: { done, completeDay } }
    this.env = {};   // moon and weather flags, see updateEnv()
    const l0 = WG.generateLanterns(this.seed)[0];
    this.board = { x: r2(l0.x + 2.6), z: r2(l0.z + 1.4) };   // the driftwood board, by the beach lantern
    this.notes = [];
    this.stilled = []; this.nextStilled = 1; this.stilledTimer = 0;
    this.bugs = []; this.nextBug = 1; this.washups = [];
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
    const isl = new Island(store, data);
    isl.setContent(await store.loadContent());
    isl.discoveries = new Map();   // entry key -> { first: {playerId, name}, counts: Map(playerId -> n) }
    for (const d of await store.loadDiscoveries(id)) isl.noteDiscovery(d.key, d.playerId, d.name, d.first, d.count);
    isl.washups = await store.loadWashups(id);
    isl.notes = await store.loadNotes(id);
    isl.regionsLoad(await store.loadRegions(id));
    isl.chartLoad(data.seen);
    isl.sleeperLoad(await store.loadEvents(id));
    isl.updateEnv();
    return isl;
  }

  // Journal entries and the tide table live in the database so they can be
  // edited without a code change; reloaded every few minutes.
  setContent(c) { this.content = c; this.contentAt = Date.now(); this.journalKeys = new Set(c.journal.map(e => e.key)); }
  async refreshContent() {
    if (Date.now() - (this.contentAt || 0) < 5 * 60 * 1000) return;
    try { this.setContent(await this.store.loadContent()); } catch (e) { console.error('[island] content reload failed', e.message); }
  }

  // ================= Loop =================
  start() {
    if (this.timer) return;
    this.catchUp();
    if (!this.washups.length && this.content && !this.tiding) this.tide();   // first visit: something on the beaches already
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
      if (regrown.length) this.sendObjs(regrown);
    }

    const night = isNight(this.time);
    const lights = this.lights();
    const nf = WG.nightFactor(this.time);
    this.updateStilled(dt, lights);
    if ((this.sleeperTimer = (this.sleeperTimer || 0) - dt) <= 0) { this.sleeperCheck(1 - this.sleeperTimer); this.sleeperTimer = 1; }
    this.updateBugs(dt);
    this.updatePlayers(dt, lights, night, nf);
    for (const s of HOOKS.onTick) s.call(this, dt);

    // Everyone's position, in one shared message.
    const snap = JSON.stringify({
      t: 'snap', time: this.time, day: this.day,
      p: [...this.players.values()].map(p => [p.id, r2(p.x), r2(p.z), r2(p.face), p.moving ? (p.running ? 2 : 1) : 0, p.dead ? 1 : 0, p.stand ? r2(p.stand) : 0, p.under || 0]),
      s: this.stilled.map(s => [s.id, r2(s.x), r2(s.z), r2(s.face)]),
    });
    for (const p of this.players.values()) this.sendRaw(p, snap);

    if (this.tickN % ME_EVERY === 0) for (const p of this.players.values()) this.sendMe(p);
    if (this.tickN % FIRES_EVERY === 0 && this.fires.length) {
      this.broadcast({ t: 'fires', list: this.fires.map(f => [f.id, r2(f.fuel), f.pot ? r2(f.pot.left) : null]) });
    }
    if (this.tickN % (FIRES_EVERY * 5) === 0) {
      const lit = this.lanterns.filter(l => l.lit || l.offerings.length);
      if (lit.length) this.broadcast({ t: 'lanterns', list: lit.map(l => this.lanternView(l)) });
    }
    if (now - this.lastSave > SAVE_MS) this.save();
  }

  // ================= Messages =================
  onMessage(p, msg) {
    if (!msg || typeof msg.t !== 'string' || !Object.prototype.hasOwnProperty.call(MESSAGES, msg.t)) return;
    return MESSAGES[msg.t].call(this, p, msg);
  }
  // What E does to a kind of world object (from the systems' `uses`), or undefined.
  useFor(type) { return Object.prototype.hasOwnProperty.call(USES, type) ? USES[type] : undefined; }
  // Extra fields systems add to the welcome message (onJoin hooks).
  joinExtras(p) {
    const extra = {};
    for (const s of HOOKS.onJoin) Object.assign(extra, s.call(this, p));
    return extra;
  }
  dawnHooks(sunrises) { for (const s of HOOKS.onDawn) s.call(this, sunrises); }

  // Where a player is saved: underground, just outside the cave's mouth (W9).
  savedSpot(p) {
    const c = p.under && this.caveById && this.caveById(p.under);
    return c ? { x: c.out.x, z: c.out.z } : { x: r2(p.x), z: r2(p.z) };
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
    const members = [...this.players.values(), ...extraMembers].map(p => {
      const { wood, stone, inventory } = this.inventorySave(p);
      return {
        playerId: p.id, ...this.savedSpot(p), face: r2(p.face), health: r2(p.health), hunger: r2(p.hunger),
        thirst: r2(p.thirst), wood, stone, inventory: { ...inventory, hoodDown: !!p.hoodDown }, dread: r2(p.dread),
      };
    });
    const objects = [...this.dirty].map(id => {
      const o = this.obj(id);
      return { id, chunk: this.objectChunk(o), state: WG.isDefaultState(o.type, o.state) ? null : { ...o.state } };
    });
    this.dirty.clear();
    const lanterns = [...this.lanternsDirty].map(id => { const l = this.lanterns[id]; return { id, lit: l.lit, fuel: r2(l.fuel), offerings: [...l.offerings], litBy: l.litBy, clearedSince: l.clearedSince, reclaim: r2(l.reclaim) }; });
    this.lanternsDirty = new Set();
    // Every loaded chunk is saved as of today (see unloadChunk).
    const chunkDays = this.chunks ? [...this.chunks.values()].map(c => [c.key, this.day]) : [];
    const snap = {
      id: this.id, day: this.day, time: this.time, lastTickAt: this.lastTickAt, moonDay: WG.moonPhase(this.day), weather: this.weather, chains: this.chains,
      objects, fires: this.fires.map(f => ({ id: f.id, fuel: r2(f.fuel), pot: f.pot ? { ...f.pot } : null })), members,
      lanterns, chunkDays,
      seen: this.seenDirty ? Buffer.from(this.seen) : null,
    };
    this.seenDirty = false;
    this.saving = this.saving.then(() => this.store.saveIsland(snap)).then(() => {
      for (const [key, day] of chunkDays) { const c = this.chunks.get(key); if (c) c.savedDay = day; }
    }).catch(e => {
      console.error(`[island ${this.id}] save failed:`, e.message);
      for (const o of objects) this.dirty.add(o.id);   // try again next time
      for (const l of lanterns) this.lanternsDirty.add(l.id);
      if (snap.seen) this.seenDirty = true;
    });
    return this.saving;
  }
}

const MESSAGES = {};
const USES = {};
const HOOKS = { onTick: [], onDawn: [], onJoin: [] };
for (const name of SYSTEMS) {
  const sys = require(`./systems/${name}`);
  for (const k of Object.keys(sys.methods || {})) {
    if (k in Island.prototype) throw new Error(`systems/${name}.js: method ${k} is already defined`);
  }
  Object.assign(Island.prototype, sys.methods || {});
  for (const [t, fn] of Object.entries(sys.messages || {})) {
    if (MESSAGES[t]) throw new Error(`systems/${name}.js: message "${t}" is already handled`);
    MESSAGES[t] = fn;
  }
  for (const [type, u] of Object.entries(sys.uses || {})) {
    if (USES[type]) throw new Error(`systems/${name}.js: E on "${type}" is already handled`);
    USES[type] = u;
  }
  for (const h of Object.keys(HOOKS)) if (sys[h]) HOOKS[h].push(sys[h]);
}

module.exports = { Island };
