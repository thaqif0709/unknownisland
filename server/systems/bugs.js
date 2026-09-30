// Bugs: where they appear and catching them.
const WG = require('../shared/world-gen');
const CONTENT = require('../content');
const { heightAt } = WG;
const { r2, REACH_SLACK } = require('./util');

const methods = {
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
          && (!k.shallow || (h > -1.3 && h < -.15)) && (k.shallow || h > .2)
          && (!k.region || WG.regionAt(x, z) === k.region) && (!k.flag || WG.feature(k.flag)) && (!k.minH || h >= k.minH));   // a region's own (C3 ...)
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
  },
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
  },
};

module.exports = { methods };
