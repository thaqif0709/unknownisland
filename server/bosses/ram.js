// The White Ram (C6): the Teeth's boss. A ram the size of a hut, white as the snow, with horns
// that curl twice. Called when the Teeth's request chain is done; it comes at nightfall to the
// high snowfield ringed with rock, and a blizzard comes with it (warmth drains fast: bring fire).
// It goes back up into the peaks at daybreak, whole again.
//
// - Its fleece takes most of every blow. It paws the snow (a line on the ground: where it will
//   charge) and charges, flattening whoever is in the way.
// - Bait its charges into rock: if it runs into a cliff or a boulder it staggers, dazed, and
//   then a blow lands full (twice over, on its skull).
// - Fire keeps it back: it won't charge a frog by a fire, a lantern or with a torch in hand.
// - Below half its health it bellows, the blizzard thickens, and it paws less long.
const WG = require('../shared/world-gen');
const { heightAt } = WG;

const CHARGE = { LEN: 22, W: 2.6, MS: [1400, 950], SPEED: 15, DMG: 32, HIT: 1.8 };
const DAZED = [6, 4.5];   // seconds staggered after hitting rock
const FLEECE = .3;        // share of a blow that gets through the fleece
const SKULL = 2;          // times a blow while it's dazed

// Is the way ahead (a step from x, z towards a) rock it would run into?
function rockAhead(island, x, z, a, step) {
  const nx = x + Math.sin(a) * step, nz = z + Math.cos(a) * step;
  if (WG.slopeAt(nx, nz).g > 1.2 || heightAt(nx, nz) - heightAt(x, z) > step * 1.1) return true;
  return island.objectsNear(nx, nz, 3).some(o => (o.type === 'rock' || o.type === 'standing' || o.type === 'crystal') && !(o.state && o.state.gone)
    && Math.hypot(o.x - nx, o.z - nz) < (o.r || .6) + 1.2);
}

module.exports = {
  id: 'ram', name: 'The White Ram', kind: 'boss_ram',
  region: 'teeth', next: 'ash',
  hp: 480,
  appear: { x: 802, z: -2994, cooldown: 60, when: island => WG.nightFactor(island.time) > .35 },   // the high snowfield, at nightfall
  leaves: island => WG.nightFactor(island.time) < .15,
  leaveSay: 'Day breaks. The blizzard blows itself out, and the White Ram goes back up into the peaks, whole again. It will come back at nightfall.',
  phases: [{ below: .5, name: 'The White Ram bellows. The blizzard thickens around it.' }],
  trophy: { relic: 'ram_horn', patch: 'ram_fleece' },
  radius: 1.5,
  weak: { fire: 1.5, silver: 1.5 },
  start: 'stalk',
  tune: { CHARGE, DAZED, FLEECE, SKULL },
  rockAhead,
  // the fleece soaks a blow up, unless it's dazed (then its skull rings)
  adjust(island, mob, dmg) { return mob.state === 'dazed' ? dmg * SKULL : dmg * FLEECE; },
  view(mob) { return mob.state === 'dazed' ? 1 : 0; },

  states: {
    // circle the frog it's after (not one by a fire), then paw the snow
    stalk(mob, island, dt, { players }) {
      const b = island.bossOf(mob);
      if (!b) return;
      const prey = island.bossTarget(b, players.filter(p => !p.warm && !island.inLight(p)));
      if (!prey) return;
      const a = Math.atan2(prey.x - mob.x, prey.z - mob.z), d = Math.hypot(prey.x - mob.x, prey.z - mob.z);
      mob.face = a;
      if (d > 14) island.bossStep(b, mob, a, Math.min(d - 14, 3.5 * dt));
      else if (d < 8) island.bossStep(b, mob, a + Math.PI, 2.5 * dt);
      if (mob.t < (mob.phase ? 1.8 : 2.6)) return;
      island.mobs.telegraph(mob, { shape: 'line', x: mob.x, z: mob.z, a, len: CHARGE.LEN, w: CHARGE.W, ms: CHARGE.MS[mob.phase ? 1 : 0] });
      mob.charge = { a, left: CHARGE.LEN, hit: [] };
      return 'paw';
    },
    paw(mob) { if (mob.t * 1000 >= CHARGE.MS[mob.phase ? 1 : 0]) return 'charge'; },
    // straight along the line: flattening whoever's in the way, until the line ends or rock stops it
    charge(mob, island, dt) {
      const c = mob.charge, b = island.bossOf(mob);
      if (!c || !b) return 'stalk';
      let step = Math.min(c.left, CHARGE.SPEED * dt);
      while (step > 0) {
        const s = Math.min(step, .5);
        if (rockAhead(island, mob.x, mob.z, c.a, s)) {
          island.broadcast({ t: 'bossfx', id: mob.id, k: 'slam', x: mob.x, z: mob.z });
          island.broadcast({ t: 'toast', msg: 'The White Ram slams into the rock and staggers!' });
          mob.telegraphed = null; mob.charge = null;
          return 'dazed';
        }
        mob.x += Math.sin(c.a) * s; mob.z += Math.cos(c.a) * s;
        step -= s; c.left -= s;
        for (const p of island.players.values()) {
          if (p.dead || p.under || c.hit.includes(p.id) || Math.hypot(p.x - mob.x, p.z - mob.z) > CHARGE.HIT) continue;
          c.hit.push(p.id);
          const r = island.damagePlayer(p, CHARGE.DMG);
          if (r === 'hurt') island.send(p, { t: 'toast', msg: 'The White Ram tramples you into the snow.' });
        }
      }
      if (c.left > 0) return;
      mob.telegraphed = null; mob.charge = null;
      if (Math.hypot(mob.x - b.x, mob.z - b.z) > island.bossArena() * .8) {   // (run out of its snowfield: it trots back)
        const a = Math.atan2(b.x - mob.x, b.z - mob.z);
        mob.x += Math.sin(a) * 4; mob.z += Math.cos(a) * 4;
      }
      return 'stalk';
    },
    dazed(mob) { if (mob.t >= DAZED[mob.phase ? 1 : 0]) return 'stalk'; },
  },
  onDeath(island, mob, hit) { island.bossBeaten(mob, hit); },
};
