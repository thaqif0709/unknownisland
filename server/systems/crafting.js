// Building from the recipe book: tools, buckets, items and fires.
const WG = require('../shared/world-gen');
const { RULES, FIRES, heightAt } = WG;
const { r2, num, newBucketId, costText } = require('./util');

const methods = {
  async onBuild(p, { recipe, x, z }) {
    if (p.dead) return;
    const r = WG.recipeById(recipe || 'campfire');
    if (!r) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    if (r.kind === 'tool' && this.hasTool(p, r.id)) return say(`You already have a ${r.name.toLowerCase()}.`);
    if (r.needs && !this.hasTool(p, r.needs)) return say(`You need a ${WG.recipeById(r.needs).name.toLowerCase()} first.`);
    if (!this.canAfford(p, r.cost)) return say(`A ${r.name.toLowerCase()} needs ${costText(r.cost)}.`);

    if (r.kind === 'bucket') {
      if (p.buckets.length >= RULES.BUCKET.MAX) return say(`You can only carry ${RULES.BUCKET.MAX} buckets.`);
      this.spend(p, r.cost);
      p.buckets.push({ id: newBucketId(), mat: r.mat, uses: RULES.BUCKET[r.mat].uses, water: 'none', drinks: 0 });
      this.fx(p, 'swing');
      this.sendMe(p);
      return say(`You made a ${r.name.toLowerCase()}. Hold it (1-8), then fill it in the sea with E.`);
    }
    if (r.kind === 'item') {
      this.spend(p, r.cost);
      this.gain(p, r.gives);
      this.fx(p, 'swing');
      this.sendMe(p);
      return say(`You made ${r.name.toLowerCase()}.`);
    }
    if (r.kind === 'tool') {
      this.spend(p, r.cost);
      this.addTool(p, r.id);
      this.fx(p, 'swing');
      this.sendMe(p);
      return say(`You made a ${r.name.toLowerCase()}!`);
    }

    // A fire, placed in front of you.
    if (!num(x) || !num(z) || Math.hypot(x - p.x, z - p.z) > 2.6) return;
    if (heightAt(x, z) < 0.35) return say('Too wet here. Build it on dry ground.');
    if (this.fires.some(f => Math.hypot(f.x - x, f.z - z) < 1.4)) return say('There’s already a fire right there.');
    this.spend(p, r.cost);
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
      this.gain(p, r.cost);
      say('The fire wouldn’t catch. Try again.');
    }
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  build(p, msg) { return this.onBuild(p, msg); },
};

module.exports = { methods, messages };
