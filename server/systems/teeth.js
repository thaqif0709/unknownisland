// The Teeth's own things (task C6, flag `region-teeth`): what E does to ice, crystal, pine
// resin, snow hares' forms and ice holes; the Teeth's blizzards; and fishing through the ice.
// Where they lie is the region file (server/regions/teeth.js, `spawnMore`); how they look is
// public/js/112-the-teeth.js; warmth is server/systems/warmth.js.
//
// Blizzards: up in the Teeth, a storm (or a fog storm) is a blizzard, and so is rain at night.
// While the White Ram is out there's always one. Clients get { t: 'teeth', blizzard } when it
// changes (and `teeth` in the welcome).
const WG = require('../shared/world-gen');
const { ITEMS, RULES, heightAt } = WG;

const on = () => WG.feature('region-teeth') && WG.feature('bigworld');
const T = () => RULES.TEETH;

// Take one of `item` (two with `tool` in hand; with `need`, only with it) from a thing that runs out.
function dig(item, tool, verb, need) {
  return function (p, o, { say, changed }) {
    const used = tool && this.toolFor(p, WG.itemInfo(tool).tool), s = o.state, got = used ? 2 : 1;
    if (need && !used) return say(need);
    s.left--; this.give(p, item, got);
    if (s.left <= 0) { s.gone = true; s.goneDay = this.day; }
    this.fx(p, 'swing', o.id);
    say(`${verb} +${got} ${ITEMS[item].toLowerCase()}${this.wearTool(p, used)}`);
    changed();
  };
}

const uses = {
  ice: { reach: 1.5, use: dig('ice', 'pickaxe', 'You break off a slab of ice:') },
  crystal: { reach: 1.4, use: dig('crystal', 'pickaxe', 'You prise crystal out of the rock:', 'It’s set deep in the rock. You need a pickaxe.') },
  pinesap: { use: dig('pine_resin', null, 'You scrape the split pine:') },
  hare: {
    use(p, o, { say, changed }) {
      const s = o.state;
      if (s.picked) return say('Only snow in it now. The hares will be back tonight.');
      s.picked = true; s.pickedDay = this.day;
      this.give(p, 'hare_fur', 2);
      this.fx(p, 'swing');
      say('Soft white fur, shed where a hare slept: +2 hare fur');
      changed();
    },
  },
  icehole: {
    reach: 2,
    use(p, o, { say }) {
      say(this.holdingRod && this.holdingRod(p) ? 'Hold E to drop your line through the ice.' : 'Black water under the ice, very deep. A fishing rod would reach down into it.');
    },
  },
};

const methods = {
  // Is it a blizzard up in the Teeth? (and how hard: 1, or more when the Ram is angry)
  teethBlizzard() {
    if (!on()) return 0;
    const ram = this.bossState && this.bossState.get('ram');
    if (ram && ram.state === 'fighting' && ram.mob && !ram.mob.gone) return ram.mob.phase ? 1.5 : 1;
    const e = this.env || {};
    return e.storm || e.fogStorm || (e.rain && WG.nightFactor(this.time) > .5) ? 1 : 0;
  },
  inTeeth(p) { return on() && !p.under && WG.regionAt(p.x, p.z) === 'teeth'; },
  inSnow(p) { return this.inTeeth(p) && heightAt(p.x, p.z) >= T().SNOW_LINE; },
  // Standing by bare rock: a boulder or a standing stone beside you, or ground too steep for snow.
  onBareRock(p) {
    if (WG.slopeAt(p.x, p.z).g > 1.2) return true;
    return this.objectsNear(p.x, p.z, T().FROZEN.ROCK + 1).some(o => (o.type === 'rock' || o.type === 'standing') && !(o.state && o.state.gone)
      && Math.hypot(o.x - p.x, o.z - p.z) < T().FROZEN.ROCK + (o.r || .5));
  },
  // A fire, a lit lantern or a planted torch within r of (x, z).
  flameNear(x, z, r) {
    return this.fires.some(f => f.fuel > 0 && Math.hypot(f.x - x, f.z - z) < r)
      || this.lanterns.some(l => l.lit && Math.hypot(l.x - x, l.z - z) < r)
      || (this.torches || []).some(t => Math.hypot(t.x - x, t.z - z) < r);
  },
  // An ice hole close enough to fish through (casting with a rod drops the line into it).
  iceHoleNear(p) {
    if (!on()) return null;
    let best = null, bd = T().ICEHOLE_REACH;
    for (const o of this.objectsNear(p.x, p.z, bd)) {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (o.type === 'icehole' && d <= bd) { bd = d; best = o; }
    }
    return best;
  },
};

function onTick() {
  const b = this.teethBlizzard();
  if (b !== (this.teethWas || 0)) {
    this.teethWas = b;
    this.broadcast({ t: 'teeth', blizzard: b });
  }
}
function onJoin() { return on() ? { teeth: { blizzard: this.teethBlizzard() } } : {}; }

module.exports = { uses, methods, onTick, onJoin };
