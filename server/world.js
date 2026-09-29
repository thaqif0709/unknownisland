// The island: authoritative simulation, catch-up after quiet periods, and persistence.
const WG = require('./shared/world-gen');
const CONTENT = require('./content');
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
    this.weather = data.weather || 'clear';
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
  noteDiscovery(key, playerId, name, first, count = 1) {
    if (!this.discoveries.has(key)) this.discoveries.set(key, { first: null, counts: new Map() });
    const d = this.discoveries.get(key);
    if (first || !d.first) d.first = d.first && !first ? d.first : { playerId, name };
    d.counts.set(playerId, count);
  }
  // A player finds something for the journal: first finds are credited and announced.
  discover(p, key) {
    if (!key || !this.journalKeys.has(key)) return;
    const d = this.discoveries.get(key);
    const first = !d || !d.first;
    const count = ((d && d.counts.get(p.id)) || 0) + 1;
    this.noteDiscovery(key, p.id, p.name, first, count);
    this.store.recordDiscovery(this.id, p.id, key, first).catch(e => console.error('[island] discovery not saved', e.message));
    const entry = this.content.journal.find(e => e.key === key);
    if (first) this.broadcast({ t: 'discovery', key, by: p.name, first: true, name: entry.name });
    this.send(p, { t: 'journal', key, count, first: this.discoveries.get(key).first.name });
    if (this.sleeper) this.sleeperOnFind(key);
  }
  journalView(p) {
    const firsts = {}, mine = {};
    for (const [key, d] of this.discoveries) {
      if (d.first) firsts[key] = d.first.name;
      if (d.counts.has(p.id)) mine[key] = d.counts.get(p.id);
    }
    return { entries: this.content.journal, firsts, mine };
  }

  // ================= Tides =================
  // Each sunrise the sea takes back what it left last time and washes up new
  // things from the tide table, onto the beaches.
  async tide() {
    if (this.tiding) return;   // one tide at a time
    this.tiding = true;
    try { await this.runTide(); } finally { this.tiding = false; }
  }
  async runTide() {
    const T = this.content.tide.filter(t => (t.minDay || 1) <= this.day && t.weight > 0);
    if (!T.length) return;
    const total = T.reduce((a, t) => a + t.weight, 0);
    const pick = () => { let r = Math.random() * total; for (const t of T) if ((r -= t.weight) <= 0) return t; return T[0]; };
    const old = this.washups.filter(w => !(w.data && w.data.sleeper));   // the Sleeper's gifts stay until taken
    this.washups = this.washups.filter(w => w.data && w.data.sleeper);
    if (old.length && this.players.size) this.broadcast({ t: 'unwash', ids: old.map(w => w.id) });
    try { await this.store.clearWashups(this.id); } catch (e) { console.error('[island] tide clear failed', e.message); }
    const n = Math.round((8 + Math.floor(Math.random() * 5)) * (this.stormLastNight ? RULES.WEATHER.STORM_TIDE : 1));
    let strange = 0;
    for (let i = 0; i < n; i++) {
      let t = pick();
      if (t.kind === 'strange' && ++strange > 1) t = T.find(x => x.key === 'driftwood') || t;   // at most one wrong thing per tide
      const spot = this.beachSpot();
      if (!spot) continue;
      const w = { key: t.key, x: spot.x, z: spot.z, day: this.day, data: {} };
      if (t.key === 'footprints') w.data = this.footprintTarget(spot);
      try { w.id = await this.store.insertWashup(this.id, w); } catch (e) { console.error('[island] washup not saved', e.message); continue; }
      this.washups.push(w);
      if (this.players.size) this.broadcast({ t: 'wash', w: this.washView(w) });
    }
  }
  beachSpot() {
    for (let tries = 0; tries < 400; tries++) {
      const x = (Math.random() - .5) * WG.ISL * 2.3, z = (Math.random() - .5) * WG.ISL * 2.3, h = heightAt(x, z);
      if (h > .4 && h < .85 && WG.biomeAt(x, z, h) === 'beach') return { x: r2(x), z: r2(z) };
    }
    return null;
  }
  // Footprints walk out of the sea to the nearest fire or lantern, and stop.
  footprintTarget(spot) {
    let best = null, bd = 90;
    for (const f of this.fires) { const d = Math.hypot(f.x - spot.x, f.z - spot.z); if (d < bd) { bd = d; best = f; } }
    for (const l of this.lanterns) { const d = Math.hypot(l.x - spot.x, l.z - spot.z); if (l.lit && d < bd) { bd = d; best = l; } }
    if (best) return { tx: best.x, tz: best.z };
    const a = Math.atan2(-spot.z, -spot.x);   // otherwise simply inland
    return { tx: r2(spot.x + Math.cos(a) * 25), tz: r2(spot.z + Math.sin(a) * 25) };
  }
  washView(w) { const t = this.content.tide.find(t => t.key === w.key) || {}; return { id: w.id, key: w.key, x: w.x, z: w.z, data: w.data, kind: t.kind, label: t.label || w.key }; }
  async takeWashup(p, id) {
    const w = this.washups.find(w => w.id === id);
    if (!w || Math.hypot(w.x - p.x, w.z - p.z) > 2 + RULES.REACH + REACH_SLACK) return;
    const t = this.content.tide.find(t => t.key === w.key) || { kind: 'resource', gives: {} };
    const say = msg => this.send(p, { t: 'toast', msg });
    this.discover(p, t.entry);
    if (t.kind === 'strange') {
      if (w.key === 'door_in_sand') return say('It will not open. There is nothing behind it.');
      if (w.key === 'ringing_bell') { this.broadcast({ t: 'fx', id: p.id, k: 'bell', x: w.x, z: w.z }); p.dread = Math.min(100, p.dread + 4); return say('It rings. The sea is perfectly flat.'); }
      if (w.key === 'footprints') { p.dread = Math.min(100, p.dread + 6); return say('Webbed feet. They walk out of the sea and do not walk back.'); }
      if (w.key === 'your_cloak') { p.dread = Math.min(100, p.dread + 10); say('Same patch, same frayed hem. It\u2019s still warm.'); }
    } else if (t.kind === 'food') {
      p.hunger = Math.min(100, p.hunger + (t.gives.hunger || 15)); p.dread = Math.max(0, p.dread + RULES.DREAD.EAT);
      say(`${t.label}. You eat it on the spot.`);
    } else {
      const got = [];
      for (const [k, n] of Object.entries(t.gives || {})) if (k in p.inv) { p.inv[k] += n; got.push(`+${n} ${WG.ITEMS[k].toLowerCase()}`); }
      say(got.length ? `${t.label}: ${got.join(', ')}` : `${t.label}. Into the journal.`);
    }
    this.washups = this.washups.filter(x => x !== w);
    this.broadcast({ t: 'unwash', ids: [w.id] });
    this.store.deleteWashup(w.id).catch(e => console.error('[island] washup delete failed', e.message));
    this.fx(p, 'swing');
    this.sendMe(p);
  }

  // ================= Bugs =================
  // Bugs appear around players by biome and time of day; catch them to eat and
  // for the journal. The server decides where they are; clients animate them.
  updateBugs(dt) {
    if ((this.bugTimer = (this.bugTimer || 0) - dt) > 0) return;
    this.bugTimer = 1;
    const now = Date.now(), night = WG.nightFactor(this.time) > .5;
    let changed = false;
    const before = this.bugs.length;
    this.bugs = this.bugs.filter(b => b.until > now && [...this.players.values()].some(p => Math.hypot(p.x - b.x, p.z - b.z) < 45));
    if (this.bugs.length !== before) changed = true;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const near = this.bugs.filter(b => Math.hypot(p.x - b.x, p.z - b.z) < 30).length;
      if (near >= 5 || Math.random() > .5) continue;
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 16, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
        const h = heightAt(x, z), biome = WG.biomeAt(x, z, h);
        const sp = WG.nearestSpring(x, z), nearWater = Math.hypot(x - sp.x, z - sp.z) < 20 || biome === 'beach';
        const kinds = CONTENT.BUGS.filter(k => (k.when === 'any' || (k.when === 'night') === night) && k.biomes.includes(biome) && (!k.nearWater || nearWater)
          && (!k.weather || (k.weather === 'rain' && this.env.rain)) && (!k.moon || (k.moon === 'full' && this.env.fullMoon))
          && (!k.shallow || (h > -1.3 && h < -.15)) && (k.shallow || h > .2));
        if (!kinds.length) continue;
        const total = kinds.reduce((a, k) => a + k.weight * (k.key === 'moon_moth' && this.env.fullMoon ? 6 : 1), 0);
        let roll = Math.random() * total, kind = kinds[0];
        for (const k of kinds) if ((roll -= k.weight * (k.key === 'moon_moth' && this.env.fullMoon ? 6 : 1)) <= 0) { kind = k; break; }
        this.bugs.push({ id: this.nextBug++, key: kind.key, x: r2(x), z: r2(z), until: now + 60000 + Math.random() * 60000 });
        changed = true;
        break;
      }
    }
    if (changed) this.broadcast({ t: 'bugs', list: this.bugs.map(b => [b.id, b.key, b.x, b.z]) });
  }
  catchBug(p, id) {
    const b = this.bugs.find(b => b.id === id);
    if (!b || Math.hypot(b.x - p.x, b.z - p.z) > 1.8 + REACH_SLACK + .8) return;
    this.bugs = this.bugs.filter(x => x !== b);
    p.hunger = Math.min(100, p.hunger + 6);
    p.dread = Math.max(0, p.dread - 2);
    const entry = this.content.journal.find(e => e.key === b.key);
    this.send(p, { t: 'toast', msg: `${entry ? entry.name : 'A bug'}. Crunchy.` });
    this.discover(p, b.key);
    this.sleeperOnBug();
    this.broadcast({ t: 'bugs', list: this.bugs.map(b => [b.id, b.key, b.x, b.z]) });
    this.fx(p, 'swing');
    this.sendMe(p);
  }

  // ================= Moon and weather =================
  updateEnv() {
    const phase = WG.moonPhase(this.day), w = this.weather;
    const env = { phase, drowning: phase === 0, fullMoon: phase === 4, weather: w,
      rain: w === 'rain' || w === 'storm', storm: w === 'storm', fogStorm: w === 'fogstorm' };
    env.lightMul = env.rain ? RULES.WEATHER.RAIN_LIGHT : 1;
    if (this.sleeper) Object.assign(env, this.sleeperEnv());
    const changed = JSON.stringify(env) !== JSON.stringify(this.env);
    this.env = env;
    if (changed && this.players && this.players.size) this.broadcast({ t: 'env', env });
  }
  rollWeather() {
    const W = RULES.WEATHER.WEIGHTS, opts = Object.entries(W).filter(([k]) => k !== 'fogstorm' || this.day >= RULES.WEATHER.FOGSTORM_MIN_DAY);
    let r = Math.random() * opts.reduce((a, [, v]) => a + v, 0);
    for (const [k, v] of opts) if ((r -= v) <= 0) { this.weather = k; break; }
  }

  // ================= Time =================
  // Advance the clock by `sec` real seconds. Works for one tick or for hours of
  // catch-up: sunrise effects are applied once no matter how many passed,
  // because regrowth only depends on the final day number.
  advance(sec) {
    if (sec <= 0) return [];
    const before = this.time, after = before + sec / RULES.DAY_LEN;
    const sunrises = Math.floor(after - 0.25) - Math.floor(before - 0.25);
    const noons = Math.floor(after - 0.5) - Math.floor(before - 0.5);
    if (noons > 0 && !sunrises) { this.rollWeather(); this.updateEnv(); }
    this.time = after - Math.floor(after);
    for (const f of this.fires) if (f.fuel > 0) f.fuel = Math.max(0, f.fuel - sec * FIRES[f.kind].burn);
    for (const l of this.lanterns || []) this.burnLantern(l, sec);
    if (sunrises > 0) {
      this.day += sunrises;
      this.stormLastNight = this.env.storm;
      this.rollWeather();
      this.updateEnv();
      if (this.sleeper) { this.sleeperDawn(sunrises); this.updateEnv(); }
      if (this.content) this.tide();   // async; the sea brings new things
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
    if (sec > RULES.DAY_LEN * .8) this.overnight();
    if (sec > 5) console.log(`[island ${this.id}] woke up after ${Math.round(sec)}s: day ${d0} -> ${this.day}, time ${this.time.toFixed(3)}`);
  }

  // While nobody was here, the island did something. One or two of these.
  overnight() {
    const camps = [...this.fires.filter(f => f.fuel > 0), ...this.lanterns.filter(l => l.lit)];
    const options = [
      camps.length && (() => {   // a Stilled left standing near camp, frozen in daylight
        const c = camps[Math.floor(Math.random() * camps.length)], a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 4;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (heightAt(x, z) < .3) return false;
        this.stilled.push({ id: this.nextStilled++, x, z, face: Math.atan2(c.x - x, c.z - z), lingering: true });
        return 'a Stilled left by the camp';
      }),
      this.lanterns.some(l => l.lit) && (() => {   // a lantern put out
        const l = this.lanterns.filter(l => l.lit)[0]; l.fuel = 0; this.burnLantern(l, 0); return `lantern ${l.id} put out`;
      }),
      this.fires.some(f => f.fuel > 0) && (() => { for (const f of this.fires) f.fuel = 0; return 'fires put out'; }),
      this.drops.length && (() => {
        const d = this.drops[Math.floor(Math.random() * this.drops.length)], a = Math.random() * Math.PI * 2;
        d.x = r2(d.x + Math.cos(a) * 6); d.z = r2(d.z + Math.sin(a) * 6);
        this.store.moveDrop(d.id, d.x, d.z).catch(() => {}); return 'a sack moved';
      }),
      () => {   // a note nobody wrote
        const text = CONTENT.ISLAND_NOTES[Math.floor(Math.random() * CONTENT.ISLAND_NOTES.length)];
        this.pinNote(null, text, 'island'); return 'a note on the board';
      },
    ].filter(Boolean);
    const n = 1 + (Math.random() < .5 ? 1 : 0), done = [];
    for (let i = 0; i < n && options.length; i++) {
      const [f] = options.splice(Math.floor(Math.random() * options.length), 1);
      const r = f(); if (r) done.push(r);
    }
    if (done.length) console.log(`[island ${this.id}] overnight: ${done.join(', ')}`);
  }

  // ================= Chat =================
  // Plain text goes to everyone on the island. Commands:
  //   /w <name or number> <message>   whisper to one person (/whisper, /tell, /msg too)
  //   /r <message>                    reply to whoever last whispered you
  //   /who                            who's on the island, with their numbers
  //   /help                           the list of commands
  // The last few global messages are kept in memory so people who join see them.
  onChat(p, { text }) {
    const clean = String(text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!clean) return;
    const sys = msg => this.send(p, { t: 'chat', kind: 'system', text: msg, at: Date.now() });
    const now = Date.now();
    p.chatTimes = (p.chatTimes || []).filter(t => now - t < 8000);
    if (p.chatTimes.length >= 6) return sys('Slow down a little.');
    p.chatTimes.push(now);
    if (clean[0] === '/') {
      const [cmd0, ...rest] = clean.slice(1).split(' '), cmd = cmd0.toLowerCase();
      if (cmd === 'w' || cmd === 'whisper' || cmd === 'tell' || cmd === 'msg') {
        const who = rest.shift(), body = rest.join(' ').trim();
        if (!who || !body) return sys('To whisper: /w name message');
        return this.whisper(p, this.findPlayer(who), body, who);
      }
      if (cmd === 'r' || cmd === 'reply') {
        const body = rest.join(' ').trim();
        if (!p.lastWhisperFrom) return sys('Nobody has whispered to you yet.');
        if (!body) return sys('To reply: /r message');
        return this.whisper(p, this.players.get(p.lastWhisperFrom), body, 'them');
      }
      if (cmd === 'who' || cmd === 'online') {
        return sys('On the island: ' + [...this.players.values()].map(q => `${q.name} (#${q.id})`).join(', '));
      }
      if (cmd === 'help' || cmd === '?') return sys('Commands: /w name message (whisper), /r message (reply to a whisper), /who (who is here). Anything else goes to everyone.');
      return sys(`There's no /${cmd0} command. Type /help for the list.`);
    }
    const msg = { t: 'chat', kind: 'all', from: p.name, id: p.id, text: clean, at: now };
    this.chatLog = [...(this.chatLog || []), msg].slice(-30);
    this.broadcast(msg);
  }
  // A name (any case) or a number (with or without #).
  findPlayer(who) {
    const w = String(who).replace(/^#/, '').toLowerCase();
    for (const q of this.players.values()) if (q.name.toLowerCase() === w || String(q.id) === w) return q;
    return null;
  }
  whisper(p, q, body, asked) {
    const now = Date.now();
    if (!q) return this.send(p, { t: 'chat', kind: 'system', text: `${asked} isn't on the island right now. Type /who to see who is.`, at: now });
    if (q === p) return this.send(p, { t: 'chat', kind: 'system', text: 'You whisper to yourself. Nobody answers. Probably.', at: now });
    q.lastWhisperFrom = p.id;
    this.send(q, { t: 'chat', kind: 'whisper', from: p.name, id: p.id, text: body, at: now });
    this.send(p, { t: 'chat', kind: 'whisper', to: q.name, toId: q.id, text: body, at: now });
  }

  // Watching the intro cutscene (held safe for at most two and a half minutes).
  watching(p) { return p.introAt && Date.now() - p.introAt < 150000; }

  // ================= Driftwood board =================
  async pinNote(p, text, key) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!clean) return;
    try {
      const r = await this.store.pinNote(this.id, clean, p ? p.id : null, key);
      const note = { id: r.id, text: clean, key: key || null, by: p ? p.name : null, at: r.at };
      this.notes.push(note); if (this.notes.length > 40) this.notes.shift();
      if (this.players.size) this.broadcast({ t: 'note', note });
    } catch (e) { console.error('[island] note not saved', e.message); }
  }
  onPin(p, { text }) {
    if (p.dead || Math.hypot(this.board.x - p.x, this.board.z - p.z) > 4) return;
    const now = Date.now();
    if (now - (p.lastPinAt || 0) < 30000) return this.send(p, { t: 'toast', msg: 'Give it a moment before pinning another note.' });
    p.lastPinAt = now;
    this.pinNote(p, text);
  }

  // ================= Cloak patches =================
  has(p, key) { return p.patches && p.patches.includes(key); }
  async onPatch(p, { key, on }) {
    const patch = WG.PATCHES.find(x => x.key === key);
    if (!patch) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    if (on) {
      if (this.has(p, key)) return;
      const d = this.discoveries.get(patch.needs);
      if (!d || !d.counts.get(p.id)) return say('You need to have found one first.');
      if (p.patches.length >= RULES.PATCH_SLOTS) return say('Your cloak has no room for another. Unpick one first.');
      p.patches.push(key);
      say(`You stitch the ${patch.name.toLowerCase()} onto your cloak.`);
    } else {
      if (!this.has(p, key)) return;
      p.patches = p.patches.filter(k => k !== key);
      say(`You unpick the ${patch.name.toLowerCase()}.`);
    }
    this.broadcast({ t: 'patches', id: p.id, list: p.patches });
    const list = [...p.patches];   // saves run one after another, in order
    p.patchSave = (p.patchSave || Promise.resolve()).then(() => this.store.savePatches(this.id, p.id, list))
      .catch(e => console.error('[island] patches not saved', e.message));
  }

  // ================= Players =================
  async join(account, ws) {
    await this.refreshContent();
    const old = this.players.get(account.id);
    if (old) {
      this.send(old, { t: 'kicked', reason: 'You logged in somewhere else.' });
      old.ws.close(4000, 'replaced');
      await this.leave(account.id, old);
    }
    const m = await this.store.getMember(this.id, account.id);
    const patches = (await this.store.loadPatches(this.id, account.id)).filter(k => WG.PATCHES.some(x => x.key === k));
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
      dread: m.dread || 0, fog: 0, knockedUntil: 0, camYaw: null, lastKnockAt: 0, patches, hoodDown: !!saved.hoodDown,
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
      drops: this.drops.map(d => ({ id: d.id, x: d.x, z: d.z, items: d.items })),
      lanterns: this.lanterns.map(l => this.lanternView(l)),
      washups: this.washups.map(w => this.washView(w)),
      bugs: this.bugs.map(b => [b.id, b.key, b.x, b.z]),
      journal: this.journalView(p),
      env: this.env, board: this.board, notes: this.notes, carvings: this.sleeperView(), chat: this.chatLog || [],
      firstArrival: m.x == null, seenIntro: !!m.seen_intro,
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
      thirst: p.thirst, inv: p.inv, tools: p.tools, energy: p.energy, exhausted: p.exhausted, dread: p.dread, dead: p.dead, patches: p.patches, hoodDown: p.hoodDown };
  }
  publicView(p) { return { id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), face: r2(p.face), dead: p.dead, patches: p.patches, hoodDown: p.hoodDown, hold: p.hold || null }; }
  fireView(f) { return { id: f.id, x: f.x, z: f.z, fuel: r2(f.fuel), kind: f.kind }; }

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
      if (regrown.length) this.broadcast({ t: 'objs', list: regrown.map(o => [o.id, o.state]) });
    }

    const night = isNight(this.time);
    const lights = this.lights();
    const D = RULES.DREAD, nf = WG.nightFactor(this.time);
    this.updateStilled(dt, lights);
    if ((this.sleeperTimer = (this.sleeperTimer || 0) - dt) <= 0) { this.sleeperCheck(1 - this.sleeperTimer); this.sleeperTimer = 1; }
    this.updateBugs(dt);
    for (const p of this.players.values()) {
      if (p.dead || this.watching(p)) continue;   // nothing happens to you while the intro plays
      const warmMul = this.env.lightMul * (this.has(p, 'silverfin_scale') ? 1.3 : 1);
      p.warm = this.fires.some(f => f.fuel > 0 && Math.hypot(f.x - p.x, f.z - p.z) < FIRES[f.kind].warm * warmMul)
        || this.lanterns.some(l => l.lit && Math.hypot(l.x - p.x, l.z - p.z) < this.lanternRadius(l) * .6 * warmMul);
      if (this.env.rain) p.thirst = Math.min(100, p.thirst + RULES.WEATHER.RAIN_WATER * dt);
      // Dread: fog, darkness and being alone push it up; light, day and friends bring it down.
      p.fog = WG.fogAt(p.x, p.z, heightAt(p.x, p.z), this.time, lights, this.env);
      let alone = true;
      for (const q of this.players.values()) if (q !== p && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < D.FRIEND_RADIUS) { alone = false; break; }
      let dd = D.FOG * p.fog;
      if (nf > .5 && !p.warm) dd += D.DARK * nf * (this.has(p, 'violet_charm') ? 1.5 : 1);
      if (alone) dd += nf > .5 ? D.ALONE_NIGHT : D.ALONE_DAY;
      else dd += D.FRIENDS * (this.has(p, 'conch_charm') ? 2 : 1);
      if (p.warm) dd += D.LIGHT;
      if (nf < .5 && p.fog < .3) dd += D.DAY;
      if (this.stilled.some(s => Math.hypot(s.x - p.x, s.z - p.z) < RULES.STILLED.NEAR_RADIUS)) dd += RULES.STILLED.NEAR_DREAD;
      if (dd > 0 && this.has(p, 'moon_wing')) dd *= 1.3;
      p.dread = Math.max(0, Math.min(100, p.dread + dd * dt));
      p.running = WG.stepEnergy(p, dt, p.wantSprint && p.moving);
      // Hunger and thirst only go down while you're moving; standing still costs nothing.
      if (p.moving) {
        p.hunger = Math.max(0, p.hunger - (RULES.HUNGER_DRAIN * (this.has(p, 'conch_charm') ? 1.2 : 1) + (p.running ? RULES.SPRINT_HUNGER : 0)) * dt);
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
      case 'pin': return this.onPin(p, msg);
      case 'chat': return this.onChat(p, msg);
      case 'jump': {   // just for show: tell everyone else so they see the hop
        const now = Date.now();
        if (p.dead || p.knockedUntil > now || now - (p.lastJumpAt || 0) < 400) return;
        p.lastJumpAt = now;
        return this.broadcast({ t: 'jump', id: p.id }, p);
      }
      case 'hold':   // which item is in your hand (just for show; everyone sees it)
        p.hold = typeof msg.key === 'string' && ITEMS[msg.key] ? msg.key : null;
        return this.broadcast({ t: 'hold', id: p.id, key: p.hold }, p);
      case 'dropitem': return this.onDropItem(p, msg);
      case 'hood':   // hood up or down; everyone sees it, and it's remembered
        p.hoodDown = !!msg.down;
        return this.broadcast({ t: 'hood', id: p.id, down: p.hoodDown });
      case 'patch': return this.onPatch(p, msg);
      case 'intro': p.introAt = Date.now(); return;
      case 'intro-seen':
        p.introAt = 0;
        return this.store.setSeenIntro(p.id, true).catch(e => console.error('[island] intro flag not saved', e.message));
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

    const m = /^([ofdlwbc])(\d+)$/.exec(target);
    if (!m) return;
    if (m[1] === 'c') return this.sleeperOffer(p, +m[2]);
    if (m[1] === 'w') return this.takeWashup(p, +m[2]);
    if (m[1] === 'b') return this.catchBug(p, +m[2]);
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
        if (this.stormLastNight && Math.random() < .35) {   // the storm stirred things up
          const find = ['spiral_shell', 'cowrie', 'glass_green', 'glass_amber'][Math.floor(Math.random() * 4)];
          this.discover(p, find); say(`+${RULES.DIG_CLAY} clay. The storm left something buried here.`);
        } else if (Math.random() < RULES.SEED_CHANCE_DIG) { p.inv.seeds += 1; say(`+${RULES.DIG_CLAY} clay, and some buried seeds`); }
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
  }

  // Light sources that clear fog: lit fires (lanterns join them later).
  lights() {
    const k = this.env.lightMul || 1;
    return this.fires.filter(f => f.fuel > 0).map(f => ({ x: f.x, z: f.z, r: FIRES[f.kind].warm * 1.4 * k }))
      .concat(this.lanterns.filter(l => this.clearRadius(l) > 0).map(l => ({ x: l.x, z: l.z, r: this.clearRadius(l) * k })))
      .concat([...this.players.values()].filter(p => !p.dead && this.has(p, 'firefly_jar')).map(p => ({ x: p.x, z: p.z, r: 3.5 })));
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
      p.inv.oil--; l.fuel = Math.min(L.MAX_FUEL, l.fuel + L.FUEL_PER_OIL * (this.has(p, 'violet_charm') ? 1.5 : 1));
      say('The flame steadies.');
    } else if (l.big) {
      if (l.offerings.includes(p.id)) return say('You have made your offering. It needs other frogs\u2019 too.');
      p.inv.oil--; l.offerings.push(p.id);
      if (l.offerings.length >= L.BIG_OFFERINGS) {
        l.lit = true; l.fuel = L.FUEL_PER_OIL * L.BIG_OFFERINGS; l.litBy = p.id; l.reclaim = 0; l.clearedSince = l.clearedSince || Date.now();
        this.broadcast({ t: 'toast', msg: 'A great lantern flares to life. The fog pulls back from the hill.' });
      } else say(`Your offering is taken. It needs ${L.BIG_OFFERINGS - l.offerings.length} more frog${L.BIG_OFFERINGS - l.offerings.length > 1 ? 's' : ''}.`);
    } else {
      p.inv.oil--; l.lit = true; l.fuel = L.FUEL_PER_OIL * (this.has(p, 'violet_charm') ? 1.5 : 1); l.litBy = p.id; l.reclaim = 0; l.clearedSince = l.clearedSince || Date.now();
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
      this.broadcast({ t: 'drop', drop: { id, x, z, items } });
    } catch (e) { console.error('[island] could not save drop', e.message); }
  }

  // Drop some of what you carry at your feet, in a sack anyone can pick up
  // (that's how you give things to a friend). Drops next to a sack go into it.
  async onDropItem(p, { key, count }) {
    const now = Date.now();
    if (p.dead || p.knockedUntil > now || typeof key !== 'string' || !(key in ITEMS)) return;
    if (now - (p.lastDropAt || 0) < 150) return;
    p.lastDropAt = now;
    const n = Math.min(Math.max(1, count | 0), p.inv[key] || 0);
    if (n <= 0) return;
    p.inv[key] -= n;
    this.sendMe(p);
    const x = r2(p.x + Math.sin(p.face) * .9), z = r2(p.z + Math.cos(p.face) * .9);
    const near = this.drops.find(d => Math.hypot(d.x - x, d.z - z) < 1.5);
    if (near) {
      near.items[key] = (near.items[key] || 0) + n;
      this.broadcast({ t: 'dropitems', id: near.id, items: near.items });
      this.store.updateDrop(near.id, near.items).catch(e => console.error('[island] could not update drop', e.message));
      return;
    }
    const items = { [key]: n };
    try {
      const id = await this.store.insertDrop(this.id, x, z, items);
      this.drops.push({ id, x, z, items });
      this.broadcast({ t: 'drop', drop: { id, x, z, items } });
    } catch (e) {
      p.inv[key] += n; this.sendMe(p);   // give it back if it couldn't be saved
      console.error('[island] could not save drop', e.message);
    }
  }

  async pickUp(p, id) {
    const d = this.drops.find(d => d.id === id);
    if (!d || Math.hypot(d.x - p.x, d.z - p.z) > RULES.REACH + 1 + REACH_SLACK) return;
    this.drops = this.drops.filter(x => x !== d);
    const got = [];
    for (const [k, n] of Object.entries(d.items)) if (k in p.inv && n > 0) { p.inv[k] += n; got.push(`${n} ${ITEMS[k].toLowerCase()}`); }
    this.broadcast({ t: 'undrop', id });
    this.send(p, { t: 'toast', msg: got.length ? `You pick up the sack: ${got.join(', ')}.` : 'An empty sack.' });
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
        thirst: r2(p.thirst), wood, stone, inventory: { ...rest, tools: [...p.tools], hoodDown: !!p.hoodDown }, dread: r2(p.dread),
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
      id: this.id, day: this.day, time: this.time, lastTickAt: this.lastTickAt, moonDay: WG.moonPhase(this.day), weather: this.weather,
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

Object.assign(Island.prototype, require('./sleeper'));

module.exports = { Island };
