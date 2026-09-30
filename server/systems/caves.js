// Caves (task W9, flag `caves`): walking in and out, the tide in sea caves, the Dark,
// torches, and muffled voices. The shapes are in server/regions/<id>.js (`cave:`) and the
// geometry in server/shared/caves.js, shared with the browser. See CONTRACTS.md section 18.
//
// p.under is the id of the cave you're in (null above ground). The browser says when it
// thinks you went in or came out (`under` on `pos`); the server checks you really are in
// that cave, and only let in or out near its mouth.
const WG = require('../shared/world-gen');
const Caves = require('../shared/caves');
const { RULES } = WG;
const { CAVE } = Caves;

// Every region's cave, built once. The same on every island (each cave has its own seed).
const ALL = WG.REGIONS.map(r => ({ region: r.id, spec: require(`../regions/${r.id}`).cave }))
  .filter(c => c.spec).map(c => Caves.generateCave({ region: c.region, ...c.spec }));
const caves = () => (WG.feature('caves') ? ALL : []);
// Just outside a cave's mouth (a lagging connection can skip from there to well inside).
const nearMouth = (c, x, z) => !!c && Math.hypot(x - c.nodes[0].x, z - c.nodes[0].z) < 3 && !Caves.caveHit(c, x, z);

const methods = {
  caveList() { return caves(); },
  caveById(id) { return caves().find(c => c.id === id) || null; },
  // Where p is in their cave, or null (above ground).
  caveHitOf(p, x = p.x, z = p.z) {
    const c = p.under && this.caveById(p.under);
    return c ? Caves.caveHit(c, x, z) : null;
  },
  // Is (x, z) ground cut away at a cave mouth? (Nothing can stand there.)
  caveCut(x, z) { const cs = caves(); return cs.length > 0 && Caves.groundCut(cs, x, z, WG.heightAt(x, z)); },

  // A move with the cave the browser says you're in (a cave id, or nothing).
  // Returns 'block' (not allowed: correct them), true (a move inside a cave: the ground
  // checks don't apply) or false (above ground, as usual).
  caveMove(p, x, z, under) {
    if (!caves().length) { p.under = null; return false; }
    const want = typeof under === 'string' ? this.caveById(under) : null;
    if (!want) {
      if (!p.under) return false;
      const hit = this.caveHitOf(p);   // coming out: only by the mouth (from near it, or to just outside it)
      if (hit && hit.s > CAVE.MOUTH + 1.5 && !nearMouth(this.caveById(p.under), x, z)) return 'block';
      p.under = null;
      return false;
    }
    const hit = Caves.caveHit(want, x, z);
    if (!hit) return 'block';
    if (p.under !== want.id) {   // going in: only by the mouth (to near it, or from just outside it)
      if (hit.s > CAVE.MOUTH + 1.5 && !nearMouth(want, p.x, p.z)) return 'block';
      p.under = want.id;
    }
    const lv = Caves.waterLevel(want, this.time);
    if (lv != null && lv - hit.floor > CAVE.PUSH + .3) return 'block';   // too deep to walk into
    return true;
  },
  // The tide (or anything else) puts you back outside the mouth.
  caveThrowOut(p, msg) {
    const c = this.caveById(p.under);
    p.under = null;
    if (!c) return;
    p.x = c.out.x; p.z = c.out.z; p.lastPosAt = Date.now();
    this.send(p, { t: 'correct', x: p.x, z: p.z, under: 0 });
    if (msg) this.send(p, { t: 'toast', msg });
  },
  // Is there light down here for p: their own torch, a friend's close by, or a firefly jar?
  caveLit(p) {
    const lit = q => q.hold === 'torch' && this.count(q, 'torch') > 0;
    if (lit(p) || this.has(p, 'firefly_jar')) return true;
    for (const q of this.players.values()) {
      if (q !== p && !q.dead && q.under === p.under && lit(q) && Math.hypot(q.x - p.x, q.z - p.z) < RULES.DREAD.FRIEND_RADIUS) return true;
    }
    return false;
  },
  // Dread per second from the Dark (instead of the night's darkness and the fog).
  caveDark(p) {
    const hit = this.caveHitOf(p);
    if (!hit || this.caveLit(p)) return 0;
    return RULES.DREAD.CAVE_DARK * Caves.darkness(hit);
  },
  // Chat from underground reaches people outside muffled: some words lost.
  muffle(text) {
    const words = text.split(' ');
    return words.map((w, i) => (i % 3 === 1 || Math.random() < .45 ? '…' : w)).join(' ').replace(/(… )+…/g, '…');
  },
};

function onTick(dt) {
  if (!caves().length) return;
  for (const p of this.players.values()) {
    if (!p.under || p.dead) continue;
    const c = this.caveById(p.under), hit = c && Caves.caveHit(c, p.x, p.z);
    if (!hit) { p.under = null; continue; }
    // the tide coming in pushes you out
    const lv = Caves.waterLevel(c, this.time);
    if (lv != null && lv - hit.floor > CAVE.PUSH) {
      p.dread = Math.min(100, p.dread + 6);
      this.caveThrowOut(p, 'The sea pours in and drags you out onto the sand.');
      continue;
    }
    // a torch in your hand burns down while you're underground
    if (p.hold === 'torch' && this.count(p, 'torch') > 0 && (p.torchT = (p.torchT || 0) + dt) >= RULES.TORCH.BURN) {
      p.torchT = 0;
      this.take(p, 'torch', 1);
      this.send(p, { t: 'toast', msg: this.count(p, 'torch') > 0 ? 'Your torch burns out. You light another.' : 'Your torch burns out. It is very dark.' });
      this.sendMe(p);
    }
  }
}

// The caves for each player who joins (only with the flag on).
function onJoin() { return { caves: caves() }; }

module.exports = { methods, onTick, onJoin, ALL };
