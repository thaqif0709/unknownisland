// Warmth (task C6, flag `region-teeth`): a stat of its own, 0-100, that only the Teeth's cold
// takes. Up there it drains (faster in the snow, at night and in a blizzard; slower with your
// hood up, a fur cloak in your bag, or the Ram's fleece patch) and a fire, a lantern or a torch
// gives it back fast; anywhere else it comes back by itself. Low, you shiver and dread creeps
// up; at nothing, the cold hurts you. Not saved: a fresh start is warm.
// Clients get { t: 'warmth', v } when it changes by a point or more (and `warmth` in the welcome).
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;

const W = () => RULES.TEETH.WARMTH;
const on = () => WG.feature('region-teeth') && WG.feature('bigworld');

const methods = {
  // How fast the cold takes p's warmth just now (per second; 0 out of the Teeth's cold).
  warmthDrain(p) {
    if (!this.inTeeth(p) || p.warm) return 0;
    let k = W().DRAIN;
    if (heightAt(p.x, p.z) >= RULES.TEETH.SNOW_LINE) k *= W().SNOW;
    if (WG.nightFactor(this.time) > .5) k *= W().NIGHT;
    const b = this.teethBlizzard();
    if (b) k *= W().BLIZZARD * b;
    if (p.hoodDown) k *= W().HOOD_DOWN;
    if (this.count(p, 'fur_cloak') > 0) k *= W().CLOAK;
    if (this.has(p, 'fleece_patch')) k *= .5;
    return k;
  },
  // Lose some warmth at once (the Frozen's touch).
  chill(p, amount) {
    p.warmth = Math.max(0, (p.warmth ?? 100) - amount);
    this.send(p, { t: 'warmth', v: Math.round(p.warmth) });
    p.warmthSent = Math.round(p.warmth);
  },
};

function onTick(dt) {
  if (!on()) return;
  for (const p of this.players.values()) {
    if (p.dead) { p.warmth = 100; continue; }   // (you wake up warm)
    if (this.watching(p)) continue;
    if (p.warmth == null) p.warmth = 100;
    const drain = this.warmthDrain(p);
    if (drain > 0) p.warmth = Math.max(0, p.warmth - drain * dt);
    else p.warmth = Math.min(100, p.warmth + (p.warm ? W().FIRE : W().OUT) * dt);
    if (p.warmth < W().LOW && drain > 0) p.dread = Math.min(100, p.dread + .5 * dt);
    if (p.warmth <= 0 && drain > 0) {
      p.health -= W().FREEZE * dt;
      if (p.hunger > 0 && p.thirst > 0) p.cause = 'freeze';
    }
    const v = Math.round(p.warmth);
    if (v !== p.warmthSent && (Math.abs(v - (p.warmthSent ?? 100)) >= 1 || v === 0 || v === 100)) {
      p.warmthSent = v;
      this.send(p, { t: 'warmth', v });
    }
    const shivering = p.warmth < W().LOW;
    if (shivering && !p.shivering && drain > 0) this.send(p, { t: 'toast', msg: 'You’re shivering. Find a fire, or get down out of the cold.' });
    p.shivering = shivering;
  }
}
function onJoin(p) { return on() ? { warmth: Math.round(p.warmth ?? 100) } : {}; }

module.exports = { methods, onTick, onJoin };
