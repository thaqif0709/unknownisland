// The clock, sunrise regrowth, catching up after quiet periods, overnight changes.
const WG = require('../shared/world-gen');
const CONTENT = require('../content');
const { RULES, FIRES, heightAt } = WG;
const { r2 } = require('./util');

const methods = {
  // ================= Time =================
  // Advance the clock by `sec` real seconds. Works for one tick or for hours of
  // catch-up: sunrise effects are applied once no matter how many passed,
  // because regrowth only depends on the final day number.
  advance(sec) {
    if (sec <= 0) return [];
    const before = this.time, after = WG.advanceT(before, sec);
    const sunrises = Math.floor(after - 0.25) - Math.floor(before - 0.25);
    const noons = Math.floor(after - 0.5) - Math.floor(before - 0.5);
    if (noons > 0 && !sunrises) { this.rollWeather(); this.updateEnv(); }
    this.time = after - Math.floor(after);
    for (const f of this.fires) if (f.fuel > 0) {
      // a bucket on the fire boils only while the fire is actually burning (also during catch-up)
      if (f.pot && f.pot.left > 0) f.pot.left = Math.max(0, f.pot.left - Math.min(sec, f.fuel / FIRES[f.kind].burn));
      f.fuel = Math.max(0, f.fuel - sec * FIRES[f.kind].burn);
    }
    for (const l of this.lanterns || []) this.burnLantern(l, sec);
    if (sunrises > 0) {
      this.day += sunrises;
      this.stormLastNight = this.env.storm;
      this.rollWeather();
      this.updateEnv();
      if (this.sleeper) { this.sleeperDawn(sunrises); this.updateEnv(); }
      if (this.content) this.tide();   // async; the sea brings new things
      this.dawnHooks(sunrises);
      return this.dawn();
    }
    return [];
  },

  dawn() {
    const changed = [];
    for (const o of this.eachObject()) if (this.regrow(o)) changed.push(o);
    return changed;
  },

  catchUp() {
    const now = Date.now();
    const sec = Math.max(0, (now - this.lastTickAt) / 1000);
    const d0 = this.day;
    this.advance(sec);
    this.lastTickAt = now;
    if (sec > RULES.DAY_LEN * .8) this.overnight();
    if (sec > 5) console.log(`[island ${this.id}] woke up after ${Math.round(sec)}s: day ${d0} -> ${this.day}, time ${this.time.toFixed(3)}`);
  },

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
  },
};

module.exports = { methods };
