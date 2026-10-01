// Torches above ground (flag `torchlight`). A torch in your hand burns wherever you are (the
// caves system burns it underground; this one above ground), pushes the fog back a little
// round you and keeps you warm. G with a torch in hand plants it in the ground in front of
// you, where it does the same for anyone near until it burns out (RULES.TORCH.PLANT_BURN);
// E on a planted torch takes it back. Planted torches aren't saved: they only last minutes.
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2, REACH_SLACK } = require('./util');

const on = () => WG.feature('torchlight');
const T = () => RULES.TORCH;

const methods = {
  // A lit torch in p's hand?
  torchInHand(p) { const h = this.held(p); return !!h && h.key === 'torch' && this.count(p, 'torch') > 0; },
  // Lights that push the fog back (added to lights(), lanterns.js): torches in hand and planted.
  torchLights() {
    if (!on()) return [];
    const out = (this.torches || []).map(t => ({ x: t.x, z: t.z, r: T().LIGHT }));
    for (const p of this.players.values()) if (!p.dead && !p.under && this.torchInHand(p)) out.push({ x: p.x, z: p.z, r: T().LIGHT });
    return out;
  },
  // Is p warm from a torch (theirs, or one planted close by)?
  torchWarm(p) {
    if (!on() || p.under) return false;
    return this.torchInHand(p) || (this.torches || []).some(t => Math.hypot(t.x - p.x, t.z - p.z) < T().WARM);
  },
  torchesView() { return (this.torches || []).map(t => [t.id, t.x, t.z, r2(t.left)]); },
  sendTorches() { if (this.players.size) this.broadcast({ t: 'torches', list: this.torchesView() }); },
  // G with a torch in hand: plant it (the one burning, with what's left of it) in front of you.
  plantTorch(p, slot) {
    const say = msg => this.send(p, { t: 'toast', msg });
    if (p.under) return say('Not down here. There’s nowhere to plant it.');
    const x = r2(p.x + Math.sin(p.face) * .9), z = r2(p.z + Math.cos(p.face) * .9);
    if (heightAt(x, z) < .3) return say('Too wet here to plant a torch.');
    if (slot != null) { if (!this.takeFromSlot(p, slot, 1)) return; } else if (!this.take(p, 'torch', 1)) return;
    const left = Math.max(10, Math.min(T().PLANT_BURN, T().PLANT_BURN - (p.torchT || 0)));
    p.torchT = 0;   // the next one in your hand is fresh
    if (!this.torches) { this.torches = []; this.nextTorch = 1; }
    this.torches.push({ id: this.nextTorch++, x, z, left, by: p.id });
    this.fx(p, 'swing');
    this.sendTorches();
    this.sendMe(p);
    say('You plant the torch in the ground. It will burn for a while.');
  },
  // E on a planted torch: take it back (with what's left of it, if your hand is empty of torches).
  pickTorch(p, id) {
    const t = (this.torches || []).find(t => t.id === id);
    if (!t || p.dead || Math.hypot(t.x - p.x, t.z - p.z) > RULES.REACH + 1 + REACH_SLACK) return;
    const had = this.count(p, 'torch');
    if (this.give(p, 'torch', 1, { sack: false }) < 1) return this.send(p, { t: 'toast', msg: 'Your bag is full.' });
    if (!had) p.torchT = Math.max(0, T().BURN - t.left);
    this.torches = this.torches.filter(x => x !== t);
    this.fx(p, 'swing');
    this.sendTorches();
    this.sendMe(p);
    this.send(p, { t: 'toast', msg: 'You pull the torch out of the ground.' });
  },
};

function onTick(dt) {
  if (!on()) return;
  // a torch in hand burns down above ground too (underground: caves.js)
  for (const p of this.players.values()) {
    if (p.dead || p.under || !this.torchInHand(p)) continue;
    if ((p.torchT = (p.torchT || 0) + dt) < T().BURN) continue;
    p.torchT = 0;
    this.take(p, 'torch', 1);
    this.send(p, { t: 'toast', msg: this.count(p, 'torch') > 0 ? 'Your torch burns out. You light another.' : 'Your torch burns out.' });
    this.sendMe(p);
  }
  // planted torches burn out
  if (!this.torches || !this.torches.length) return;
  for (const t of this.torches) t.left -= dt;
  const before = this.torches.length;
  this.torches = this.torches.filter(t => t.left > 0);
  if (this.torches.length !== before) this.sendTorches();
}

function onJoin() { return on() ? { torches: this.torchesView() } : {}; }

module.exports = { methods, onTick, onJoin };
