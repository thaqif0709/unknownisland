// Fishing (task P7, flag `fishing`). See docs/roadmap/CONTRACTS.md section 19.
//
// - Casting: hold a rod, face the water, hold E and let go: { t: 'cast', power, a } (power 0-1
//   is how long E was held, a where you aim). The bobber lands CAST.MIN-MAX m out; on land
//   nothing happens. Everyone sees it ({ t: 'fishing', id, x, z, s }).
// - Waiting: a fish bites after BITE.MIN-MAX s (sooner at night, in the rain, on a rising
//   tide, under a full moon and with bait in the bag, which the bite takes). Which fish is
//   up to the water, the time and server/content/fish.js. The fisher gets { t: 'fish-bite' }.
// - Hooking: E again ({ t: 'hook' }) within HOOK s of the bite starts the minigame (P8) for
//   that fish's rarity (two in a row for a rare one). E while nothing bites reels in, as does
//   walking off, putting the rod away, or being knocked down.
// - Landing it: the fish goes in your bag and the journal; the rod wears by one. Losing it
//   snaps the line: the rod loses SNAP uses. A friend within HELP_REACH can press E once per
//   catch ({ t: 'fish-help', id }) for HELP more seconds.
// - Cooking: E at a lit fire with a raw fish in hand cooks it (fires.js asks cookFish).
const WG = require('../shared/world-gen');
const { RULES, ITEMS, heightAt } = WG;
const Caves = require('../shared/caves');
const CONTENT = require('../content');
const { r2, num } = require('./util');
const { Minigames } = require('../minigames');

const on = () => WG.feature('fishing');
const F = () => RULES.FISHING;
const rand = (a, b) => a + Math.random() * (b - a);

// What water is at (x, z): 'sea', 'spring' or null (land).
function waterAt(x, z) {
  const sp = WG.nearestSpring(x, z);
  if (Math.hypot(x - sp.x, z - sp.z) < F().SPRING_R) return 'spring';
  return heightAt(x, z) < 0 ? 'sea' : null;
}
const regionOfWater = (x, z) => (Math.hypot(x, z) < F().LANDING_R ? 'landing' : null);

const methods = {
  // The fish that could bite in this water now, with their weights.
  fishFor(water, x, z, bait) {
    const night = WG.nightFactor(this.time) > .5, region = regionOfWater(x, z);
    return CONTENT.FISH.filter(f => f.water.includes(water) && f.region === region
      && (f.when === 'any' || (f.when === 'night') === night)
      && (!f.moon || (f.moon === 'full' && this.env.fullMoon)) && (!f.weather || (f.weather === 'rain' && this.env.rain)))
      .map(f => ({ f, w: f.weight * (bait && f.bait ? f.bait : 1) }));
  },
  // Seconds until the next bite, from what's in the bag and the island's weather and time.
  biteWait(bait) {
    const B = F().BITE, rising = Caves.tideLevel((this.time + .01) % 1) > Caves.tideLevel(this.time);
    let k = 1;
    if (WG.nightFactor(this.time) > .5) k *= B.NIGHT;
    if (this.env.rain) k *= B.RAIN;
    if (rising) k *= B.RISING;
    if (this.env.fullMoon) k *= B.FULL_MOON;
    if (bait) k *= B.BAIT;
    return rand(B.MIN, B.MAX) * k;
  },
  holdingRod(p) { const h = this.held(p); return !!h && h.key === 'rod'; },
  fishingView(p) { const f = p.fishing; return f ? { id: p.id, x: f.x, z: f.z, s: f.state } : { id: p.id, s: null }; },
  // Reel in: the line comes back (and why, if there's something to say).
  reelIn(p, msg) {
    if (!p.fishing) return;
    p.fishing = null;
    if (this.minigames.active.has(p.id)) this.minigames.quit(p, {});
    this.broadcast({ t: 'fishing', id: p.id, s: null });
    if (msg) this.send(p, { t: 'toast', msg });
  },

  onCast(p, { power, a }) {
    if (!on() || p.dead || p.under || p.knockedUntil > Date.now() || !this.holdingRod(p)) return;
    if (p.fishing) return this.reelIn(p);
    const C = F().CAST, k = num(power) ? Math.max(0, Math.min(1, power)) : .5;
    if (num(a)) p.face = a;
    const d = C.MIN + (C.MAX - C.MIN) * k, x = p.x + Math.sin(p.face) * d, z = p.z + Math.cos(p.face) * d;
    const water = waterAt(x, z);
    if (!water) return this.send(p, { t: 'toast', msg: 'The bobber lands on dry ground. Face the water and cast again.' });
    const bait = this.count(p, 'bait') > 0;
    p.fishing = { x: r2(x), z: r2(z), ox: p.x, oz: p.z, water, bait, state: 'wait', biteAt: Date.now() + this.biteWait(bait) * 1000, helped: new Set() };
    this.fx(p, 'cast');
    this.broadcast({ t: 'fishing', ...this.fishingView(p) });
    if (!this.fishFor(water, x, z, bait).length) this.send(p, { t: 'toast', msg: 'Nothing seems to be biting in this water just now.' });
  },
  // E while fishing: hook a fish that's biting, or reel in.
  onHook(p) {
    const f = p.fishing;
    if (!f) return;
    if (f.state === 'wait') return this.reelIn(p, 'You reel in.');
    if (f.state !== 'bite') return;
    if (Date.now() > f.biteEnd) return;   // (onTick lets it go)
    f.state = 'fight';
    this.broadcast({ t: 'fishing', ...this.fishingView(p) });
    this.fight(p, f);
  },
  // The minigames that decide the catch, one after another.
  async fight(p, f) {
    const g = F().GAMES[f.fish.rarity] || F().GAMES.common, types = Minigames.types();
    let won = true;
    for (let i = 0; i < g.n && won; i++) {
      const type = f.game || g.type || types[Math.floor(Math.random() * types.length)];   // (game: a test's choice)
      if (i > 0) this.send(p, { t: 'toast', msg: 'It’s still fighting!' });
      won = (await this.minigames.start(p, type, { difficulty: g.level })).won;
      if (p.fishing !== f) return;   // reeled in (walked off, knocked down) in the meantime
    }
    const name = ITEMS[f.fish.key].toLowerCase();
    p.fishing = null;
    this.broadcast({ t: 'fishing', id: p.id, s: null });
    if (won) {
      this.give(p, f.fish.key, 1);
      this.discover(p, f.fish.key);
      this.fx(p, 'catch');
      const worn = this.wearTool(p, 'rod');
      this.send(p, { t: 'toast', msg: `You land ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}!${worn}` });
    } else {
      let worn = '';
      for (let i = 0; i < F().SNAP && this.holdingRod(p) && !worn.includes('breaks'); i++) worn = this.wearTool(p, 'rod');
      this.send(p, { t: 'toast', msg: `The line snaps. The ${name} is gone.${worn}` });
    }
    this.sendMe(p);
  },
  // A friend's E beside someone landing a fish: a second more, once per catch.
  onFishHelp(q, { id }) {
    const p = this.players.get(id);
    const f = p && p.fishing;
    if (!on() || !f || f.state !== 'fight' || p === q || q.dead || f.helped.has(q.id)) return;
    if (Math.hypot(p.x - q.x, p.z - q.z) > F().HELP_REACH) return;
    f.helped.add(q.id);
    this.minigames.extend(p, F().HELP * 1000);
    this.send(p, { t: 'toast', msg: `${q.name} grabs the line with you!` });
    this.send(q, { t: 'toast', msg: `You help ${p.name} with the line.` });
  },

  // A raw fish in hand at a lit fire: cook it. Returns what to say, or '' (fires.js tendFire).
  cookFish(p, fire) {
    if (!on() || !(fire.fuel > 0)) return '';
    const h = this.held(p), cooks = h && WG.itemInfo(h.key).cooks;
    if (!cooks || !this.take(p, h.key, 1)) return '';
    this.give(p, cooks, 1);
    this.fx(p, 'swing');
    return `You cook the ${ITEMS[h.key].toLowerCase()} over the fire.`;
  },
};

const messages = {
  cast(p, msg) { return this.onCast(p, msg); },
  hook(p) { return this.onHook(p); },
  reel(p) { return this.reelIn(p); },
  'fish-help'(p, msg) { return this.onFishHelp(p, msg); },
};

function onTick() {
  if (!on()) return;
  const now = Date.now();
  for (const p of this.players.values()) {
    const f = p.fishing;
    if (!f) continue;
    if (p.dead || p.knockedUntil > now || !this.holdingRod(p)) { this.reelIn(p); continue; }
    if (Math.hypot(p.x - f.ox, p.z - f.oz) > F().REACH) { this.reelIn(p, 'You walk off and reel the line in.'); continue; }
    if (f.state === 'wait' && now >= f.biteAt) {
      const list = f.only ? [{ f: CONTENT.FISH.find(x => x.key === f.only), w: 1 }] : this.fishFor(f.water, f.x, f.z, f.bait && this.count(p, 'bait') > 0);   // (only: a test's choice)
      if (!list.length) { f.biteAt = now + this.biteWait(false) * 1000; continue; }
      let roll = Math.random() * list.reduce((a, c) => a + c.w, 0), pick = list[0].f;
      for (const c of list) if ((roll -= c.w) <= 0) { pick = c.f; break; }
      if (f.bait && this.take(p, 'bait', 1)) this.sendMe(p);
      f.fish = pick; f.state = 'bite'; f.biteEnd = now + (F().HOOK + RULES.COMBAT.LAG) * 1000;
      this.send(p, { t: 'fish-bite', ms: F().HOOK * 1000 });
      this.broadcast({ t: 'fishing', ...this.fishingView(p) });
    } else if (f.state === 'bite' && now > f.biteEnd) {
      f.state = 'wait'; f.fish = null; f.bait = this.count(p, 'bait') > 0;
      f.biteAt = now + this.biteWait(f.bait) * 1000;
      this.send(p, { t: 'toast', msg: 'It got away. Wait for the next one.' });
      this.broadcast({ t: 'fishing', ...this.fishingView(p) });
    }
  }
}

// Who's fishing, for someone joining.
function onJoin() {
  if (!on()) return {};
  return { fishing: [...this.players.values()].filter(q => q.fishing).map(q => this.fishingView(q)) };
}

module.exports = { methods, messages, onTick, onJoin, waterAt };
