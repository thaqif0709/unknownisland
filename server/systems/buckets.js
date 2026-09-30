// Buckets: fill in the sea, boil on a fire, drink.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { newBucketId, REACH_SLACK } = require('./util');

const methods = {
  // ================= Buckets =================
  // fill: stand in the sea with an empty bucket. place: set a seawater bucket on a
  // fire to boil. drink: a sip from a bucket of clean water.
  onBucket(p, { id, action, fire }) {
    const b = (p.buckets || []).find(b => b.id === id), say = msg => this.send(p, { t: 'toast', msg }), B = RULES.BUCKET;
    if (action === 'drink') p.bites = (p.bites || 0) + 1;   // counted like a bite (inventory.js eat)
    if (!b || p.dead || p.knockedUntil > Date.now()) return action === 'drink' ? this.sendMe(p) : undefined;
    const name = b.mat === 'iron' ? 'iron bucket' : 'wooden bucket';
    if (action === 'fill') {
      if (heightAt(p.x, p.z) > 0.25 + 0.4) return say('Wade into the sea to fill it.');
      if (b.water !== 'none') return say('The bucket is already full.');
      b.water = 'sea'; b.drinks = 0;
      say('Seawater. Set it on a fire to boil it clean.');
    } else if (action === 'place') {
      const f = this.fires.find(f => f.id === fire);
      if (!f || Math.hypot(f.x - p.x, f.z - p.z) - 0.6 > RULES.REACH + REACH_SLACK) return;
      if (b.water !== 'sea') return say(b.water === 'clean' ? 'This water is already clean.' : 'Fill it with seawater first.');
      if (f.pot) return say('There\u2019s already a bucket on this fire.');
      p.buckets = p.buckets.filter(x => x !== b);
      f.pot = { ...b, left: B[b.mat].boil };
      this.broadcast({ t: 'pot', id: f.id, pot: this.potView(f) });
      say(f.fuel > 0 ? `You set the ${name} on the fire. It will be ready in about ${B[b.mat].boil} seconds.` : 'You set the bucket on the fire. The fire is out; add wood to boil it.');
    } else if (action === 'drink') {   // held for RULES.SLOTS.EAT_TIME in the browser, like eating
      const now = Date.now();
      if (b.water === 'sea') { say('Seawater. Boil it on a fire first.'); return this.sendMe(p); }
      if (b.water !== 'clean' || b.drinks <= 0) { say('The bucket is empty.'); return this.sendMe(p); }
      if (now - (p.lastEatAt || 0) < RULES.SLOTS.EAT_GAP * 1000) return this.sendMe(p);
      if (p.thirst >= 99.5) { say('You’re not thirsty.'); return this.sendMe(p); }
      p.lastEatAt = now;
      b.drinks--;
      p.thirst = Math.min(100, p.thirst + B.DRINK);
      if (b.drinks <= 0) {
        b.water = 'none';
        if (b.uses <= 0) { p.buckets = p.buckets.filter(x => x !== b); say(`Cool, clean water. Your ${name} cracks and falls apart.`); }
        else say('Cool, clean water. The bucket is empty.');
      } else say(`Cool, clean water. (${b.drinks} left)`);
    } else return;
    this.fx(p, 'swing');
    this.sendMe(p);
  },
  potToBucket(pot) {
    const done = pot.left <= 0;
    return { id: pot.id || newBucketId(), mat: pot.mat, uses: done ? Math.max(0, pot.uses - 1) : pot.uses,
      water: done ? 'clean' : 'sea', drinks: done ? RULES.BUCKET.DRINKS : 0 };
  },
  takePot(p, f) {
    const say = msg => this.send(p, { t: 'toast', msg });
    const done = f.pot.left <= 0, b = this.potToBucket(f.pot);
    p.buckets.push(b); f.pot = null;
    this.broadcast({ t: 'pot', id: f.id, pot: null });
    say(done ? `You lift the bucket off the fire. Clean water: ${RULES.BUCKET.DRINKS} good drinks.${b.uses <= 0 ? ' The bucket is worn out; it will break once it\u2019s empty.' : ''}`
      : 'You take the bucket back. It hasn\u2019t boiled yet.');
    this.fx(p, 'swing');
    this.sendMe(p);
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  bucket(p, msg) { return this.onBucket(p, msg); },
};

module.exports = { methods, messages };
