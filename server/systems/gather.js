// Using things with E: water, gathering from plants and rocks, and routing to other systems.
// What E does to each kind of world object is registered in `uses` (any system can add its
// own: `uses: { vent: { reach: 2, use(p, o, { say, changed }) {...} } }`), so new objects
// never need an edit here. See docs/roadmap/CONTRACTS.md section 5.
const WG = require('../shared/world-gen');
const { RULES, ITEMS, heightAt } = WG;
const { REACH_SLACK, ACT_COOLDOWN } = require('./util');

const methods = {
  onAct(p, { target }) {
    if (p.dead || typeof target !== 'string') return;
    if (p.under) return;   // in a cave (W9): the things up on the ground are out of reach (cave finds come with the region packs)
    const now = Date.now();
    if (now < p.nextActAt || p.knockedUntil > now) return;
    p.nextActAt = now + ACT_COOLDOWN;
    const say = msg => this.send(p, { t: 'toast', msg });

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
    if (m[1] === 'f') return this.tendFire(p, +m[2]);

    const o = this.obj(+m[2]);
    if (!o || o.state.gone || this.caveCut(o.x, o.z)) return;   // nothing stands where a cave mouth cuts the ground (W9)
    const u = this.useFor(o.type);
    if (!u) return;
    const size = WG.sizeOf(o, o.state, this.day, this.time);
    if (Math.hypot(o.x - p.x, o.z - p.z) - o.r * Math.max(size, 1) > (u.reach ?? RULES.REACH) + REACH_SLACK) return;
    const changed = () => { this.dirty.add(o.id); this.sendObjs([o]); this.sendMe(p); };
    return u.use.call(this, p, o, { say, changed });
  },
};

// Chopping a tree or a palm with no coconuts left.
function chop(p, o, { say, changed }) {
  const s = o.state, got = this.hasTool(p, 'axe') ? 2 : 1;
  s.hits++; this.give(p, 'wood', got);
  this.fx(p, 'swing', o.id);
  if (s.hits >= WG.chopsFor(o, s, this.day, this.time)) { s.gone = true; s.felledDay = this.day; say(`+${got} wood. The tree comes down.`); }
  else say(`+${got} wood`);
  changed();
}

// What E does to each kind of world object (`this` is the Island).
const uses = {
  palm: {
    use(p, o, ctx) {
      const s = o.state;
      if (!(s.coconuts > 0)) return chop.call(this, p, o, ctx);
      s.coconuts--;
      if (WG.feature('slots')) {   // into the bag, to eat later (P2)
        this.give(p, 'coconut', 1); this.give(p, 'seeds', 1);
        this.fx(p, 'swing');
        ctx.say('A coconut, into your bag. Hold E with it in hand to eat it. (+1 seeds)');
        return ctx.changed();
      }
      p.hunger = Math.min(100, p.hunger + RULES.COCONUT_FOOD);
      p.thirst = Math.min(100, p.thirst + RULES.COCONUT_WATER);
      p.dread = Math.max(0, p.dread + RULES.DREAD.EAT);
      this.give(p, 'seeds', 1);
      this.fx(p, 'swing');
      ctx.say('A coconut. Food and a bit of water. (+1 seeds)');
      ctx.changed();
    },
  },
  tree: { use(p, o, ctx) { chop.call(this, p, o, ctx); } },
  bush: {
    use(p, o, { say, changed }) {
      const s = o.state;
      if (!s.berries) return say('Nothing left. It’ll grow back by morning.');
      s.berries = false;
      if (WG.feature('slots')) {   // into the bag, to eat later (P2)
        this.give(p, 'berries', 1); this.give(p, 'seeds', 1);
        say(`${o.species === 'blueberry' ? 'Blueberries' : 'Berries'}, into your bag. Hold E with them in hand to eat them. (+1 seeds)`);
        return changed();
      }
      p.hunger = Math.min(100, p.hunger + RULES.BERRY_FOOD);
      p.dread = Math.max(0, p.dread + RULES.DREAD.EAT);
      this.give(p, 'seeds', 1);
      say(o.species === 'blueberry' ? 'Blueberries. Sweet! (+1 seeds)' : 'Berries. Tart, but filling. (+1 seeds)');
      changed();
    },
  },
  rock: {
    use(p, o, { say, changed }) {
      const s = o.state, got = this.hasTool(p, 'pickaxe') ? 2 : 1;
      s.left--; this.give(p, 'stone', got);
      if (s.left <= 0) { s.gone = true; s.goneDay = this.day; }
      this.fx(p, 'swing', o.id);
      say(`+${got} stone`);
      changed();
    },
  },
  ore: {
    use(p, o, { say, changed }) {
      if (!this.hasTool(p, 'pickaxe')) return say('Too hard to break by hand. You need a pickaxe.');
      const s = o.state, got = this.hasTool(p, 'ironpick') ? 2 : 1;
      s.left--; this.give(p, o.ore, got);
      if (s.left <= 0) { s.gone = true; s.goneDay = this.day; }
      this.fx(p, 'swing', o.id);
      say(`+${got} ${ITEMS[o.ore].toLowerCase()}`);
      changed();
    },
  },
  dig: {
    use(p, o, { say, changed }) {
      const s = o.state;
      if (s.dug) return say('Already dug up. It’ll settle again by morning.');
      if (!this.hasTool(p, 'shovel')) return say('The soil is soft here. With a shovel you could dig.');
      s.dug = true; this.give(p, 'clay', RULES.DIG_CLAY);
      this.fx(p, 'swing', o.id);
      if (this.stormLastNight && Math.random() < .35) {   // the storm stirred things up
        const find = ['spiral_shell', 'cowrie', 'glass_green', 'glass_amber'][Math.floor(Math.random() * 4)];
        this.discover(p, find); say(`+${RULES.DIG_CLAY} clay. The storm left something buried here.`);
      } else if (Math.random() < RULES.SEED_CHANCE_DIG) { this.give(p, 'seeds', 1); say(`+${RULES.DIG_CLAY} clay, and some buried seeds`); }
      else say(`+${RULES.DIG_CLAY} clay`);
      changed();
    },
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  act(p, msg) { return this.onAct(p, msg); },
};

module.exports = { methods, messages, uses };
