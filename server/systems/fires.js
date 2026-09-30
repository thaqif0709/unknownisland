// Fires: what clients see of them, and tending them.
const WG = require('../shared/world-gen');
const { RULES, FIRES } = WG;
const { r2, REACH_SLACK } = require('./util');

const methods = {
  fireView(f) { return { id: f.id, x: f.x, z: f.z, fuel: r2(f.fuel), kind: f.kind, pot: this.potView(f) }; },
  potView(f) { return f.pot ? { mat: f.pot.mat, left: r2(f.pot.left) } : null; },

  // Adding wood to a fire, or lifting a finished bucket off it.
  tendFire(p, id) {
    const say = msg => this.send(p, { t: 'toast', msg });
    const f = this.fires.find(f => f.id === id);
    if (!f || Math.hypot(f.x - p.x, f.z - p.z) - 0.6 > RULES.REACH + REACH_SLACK) return;
    // a bucket on it: take it when it's ready (or when there's no wood to keep it going)
    if (f.pot && (f.pot.left <= 0 || this.count(p, 'wood') <= 0)) return this.takePot(p, f);
    if (this.count(p, 'wood') <= 0) return say('You need wood for the fire.');
    const k = FIRES[f.kind];
    this.take(p, 'wood');
    f.fuel = Math.min(f.fuel + k.add, k.max);
    this.broadcast({ t: 'fires', list: [[f.id, r2(f.fuel)]] });
    this.fx(p, 'swing');
    this.sendMe(p);
    return say('The fire flares up.');
  },
};

module.exports = { methods };
