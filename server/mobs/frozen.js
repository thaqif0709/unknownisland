// The Frozen (task C6, flag `region-teeth`): the Stilled of the Teeth. Figures white with frost
// that only come with a blizzard, up in the snow, and walk slowly after whoever is out in it.
// Their touch takes the warmth out of you (server/systems/warmth.js). Their weaknesses: fire
// (they won't go for a frog by a fire, a lantern or with a torch in hand, and near a flame they
// melt) and bare rock (a frog by a boulder, a standing stone or on rock too steep for snow is
// safe from them). When the blizzard ends they're gone.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2 } = require('../systems/util');

const F = () => RULES.TEETH.FROZEN;
const on = () => WG.feature('region-teeth') && WG.feature('bigworld');
const notice = (island, p) => F().NOTICE + (island.has(p, 'fleece_patch') ? 10 : 0);
// Who they'll go for: out in the snow, not warm by a fire, not by bare rock.
const prey = (island, p) => island.inSnow(p) && !p.warm && !island.inLight(p) && !island.onBareRock(p) && !island.downed(p);

module.exports = {
  kind: 'frozen',
  get hp() { return F().HP; },
  radius: .4,
  start: 'walk',
  weak: { fire: 3, silver: 2, light: 1.5 },

  // Once a tick: they come with the blizzard, around frogs up in the snow; gone when it ends.
  tick(island, dt, { players }) {
    const mobs = island.mobs, st = mobs.stateOf('frozen');
    const here = on() ? players.filter(p => island.inSnow(p)) : [], blizzard = on() && island.teethBlizzard();
    for (const m of mobs.of('frozen')) {
      if (!blizzard || !here.some(p => Math.hypot(p.x - m.x, p.z - m.z) < 90)) mobs.remove(m);
    }
    if (!blizzard || !here.length || (st.timer = (st.timer || 0) - dt) > 0) return;
    st.timer = 1.5;
    if (mobs.of('frozen').length >= Math.min(F().MAX, here.length * F().PER_PLAYER)) return;
    const p = here[(Math.random() * here.length) | 0];
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = F().SPAWN[0] + Math.random() * (F().SPAWN[1] - F().SPAWN[0]);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (heightAt(x, z) < RULES.TEETH.SNOW_LINE || WG.slopeAt(x, z).g > 1.2 || WG.regionAt(x, z) !== 'teeth') continue;
      mobs.spawn('frozen', r2(x), r2(z), { face: Math.atan2(p.x - x, p.z - z) });
      break;
    }
  },

  states: {
    // Walk after the nearest frog out in the snow; next to a flame, melt.
    walk(mob, island, dt, { players }) {
      if (island.flameNear(mob.x, mob.z, RULES.COMBAT.LIGHT) && (mob.melt = (mob.melt || 0) + dt) >= 1) {   // (a fire, a lantern or a planted torch close by: it melts)
        mob.melt = 0;
        island.mobs.hit(mob, { amount: F().MELT, source: ['fire'] });
        if (mob.gone) return;
      }
      let best = null, bd = 1e9;
      for (const p of players) {
        const d = Math.hypot(p.x - mob.x, p.z - mob.z);
        if (d < notice(island, p) && d < bd && prey(island, p)) { bd = d; best = p; }
      }
      if (!best) return;
      const a = Math.atan2(best.x - mob.x, best.z - mob.z);
      mob.face = a;
      if (bd < F().REACH + .4) return module.exports.onTouch(island, mob, best);
      const step = Math.min(bd, F().SPEED * dt), nx = mob.x + Math.sin(a) * step, nz = mob.z + Math.cos(a) * step;
      if (WG.slopeAt(nx, nz).g <= 1.2 && heightAt(nx, nz) > .3) { mob.x = nx; mob.z = nz; }
    },
    // after a touch it stands a moment
    still(mob) { if (mob.t >= F().COOLDOWN) return 'walk'; },
  },

  // Its touch: your warmth goes out of you (once per cooldown).
  onTouch(island, mob, p) {
    const now = Date.now();
    if (now - (p.lastFrozenAt || 0) < F().COOLDOWN * 1000) return;
    p.lastFrozenAt = now;
    island.discover && island.discover(p, 'frozen_seen');
    if (island.dodging(p)) return;
    island.chill(p, F().DRAIN);
    island.send(p, { t: 'toast', msg: 'A frosted hand closes on your arm. The warmth goes out of you.' });
    island.mobs.setState(mob, 'still');
  },
};
