// Tides: what the sea washes up each sunrise, and picking it up.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2, REACH_SLACK } = require('./util');

const methods = {
  // ================= Tides =================
  // Each sunrise the sea takes back what it left last time and washes up new
  // things from the tide table, onto the beaches.
  async tide() {
    if (this.tiding) return;   // one tide at a time
    this.tiding = true;
    try { await this.runTide(); } finally { this.tiding = false; }
  },
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
  },
  beachSpot() {
    for (let tries = 0; tries < 400; tries++) {
      const x = (Math.random() - .5) * WG.ISL * 2.3, z = (Math.random() - .5) * WG.ISL * 2.3, h = heightAt(x, z);
      if (h > .4 && h < .85 && WG.biomeAt(x, z, h) === 'beach') return { x: r2(x), z: r2(z) };
    }
    return null;
  },
  // Footprints walk out of the sea to the nearest fire or lantern, and stop.
  footprintTarget(spot) {
    let best = null, bd = 90;
    for (const f of this.fires) { const d = Math.hypot(f.x - spot.x, f.z - spot.z); if (d < bd) { bd = d; best = f; } }
    for (const l of this.lanterns) { const d = Math.hypot(l.x - spot.x, l.z - spot.z); if (l.lit && d < bd) { bd = d; best = l; } }
    if (best) return { tx: best.x, tz: best.z };
    const a = Math.atan2(-spot.z, -spot.x);   // otherwise simply inland
    return { tx: r2(spot.x + Math.cos(a) * 25), tz: r2(spot.z + Math.sin(a) * 25) };
  },
  washView(w) { const t = this.content.tide.find(t => t.key === w.key) || {}; return { id: w.id, key: w.key, x: w.x, z: w.z, data: w.data, kind: t.kind, label: t.label || w.key }; },
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
  },
};

module.exports = { methods };
