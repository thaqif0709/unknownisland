// Using things with E: water, gathering from plants and rocks, and routing to other systems.
const WG = require('../shared/world-gen');
const { RULES, ITEMS, heightAt } = WG;
const { REACH_SLACK, ACT_COOLDOWN } = require('./util');

const methods = {
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
    if (m[1] === 'f') return this.tendFire(p, +m[2]);

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
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  act(p, msg) { return this.onAct(p, msg); },
};

module.exports = { methods, messages };
