// Rafts and zip lines (task P10, flag `rafts`). See docs/roadmap/CONTRACTS.md section 20.
//
// Both carry you: while you ride, the server moves you (p.ride) and your own 'pos' only says
// which way you look (players.js asks rideHoldsPos).
// - Rafts: hold one and press E facing water ({ t: 'raft-place', x, z }); E beside it climbs
//   aboard ({ t: 'raft-board', id }; RAFT.SEATS frogs). The first aboard paddles:
//   { t: 'raft-steer', dx, dz, go } (a direction and 0-1). A river's current carries it
//   downstream; it won't go onto land. E again steps ashore ({ t: 'raft-off' }) if there's
//   ground to step onto. Everyone hears { t: 'rafts', list } (and { t: 'rafts', gone: [id] }).
// - Zip lines: hold a kit and press E where the top end goes ({ t: 'zip-tie' }), then again
//   lower down where it ends; anyone can then press E by the top post ({ t: 'zip-ride', id }) and
//   slide down at ZIP.SPEED. Everyone hears { t: 'zips', list } and { t: 'ride', id, zip, at }.
// Both are kept with the island (islands.rides, migration 0009).
const WG = require('../shared/world-gen');
const { RULES, heightAt } = WG;
const { r2, num } = require('./util');

const on = () => WG.feature('rafts');
const R = () => RULES.RAFT, Z = () => RULES.ZIP;
const floats = (x, z) => heightAt(x, z) < R().MIN_DEPTH;
const DECK = .22;   // how high the deck floats above the sea
const RIDE_GRACE = 500;   // ms after a ride when the client's positions still lag behind it
const groundY = (x, z) => Math.max(heightAt(x, z), 0);   // the ground, or the sea's surface
// Where each seat is on the raft, before turning it to its heading (back, front).
const SEATS = [[0, -.55], [0, .55], [.5, 0], [-.5, 0]];

// The current at (x, z): [dx, dz] in m/s, down the nearest river (only out in the wider world).
function riverCurrent(x, z) {
  if (!WG.feature('bigworld') || heightAt(x, z) > 0) return [0, 0];
  let best = null, bd = R().RIVER_W;
  for (const pts of WG.RIVERS) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = [dx / L * R().CURRENT, dz / L * R().CURRENT]; }
    }
  }
  return best || [0, 0];
}
// A point on a zip line, k from 0 (top) to 1 (bottom).
const zipAt = (z, k) => ({ x: z.ax + (z.bx - z.ax) * k, y: z.ay + (z.by - z.ay) * k, z: z.az + (z.bz - z.az) * k });
const zipLen = z => Math.hypot(z.bx - z.ax, z.by - z.ay, z.bz - z.az);

const methods = {
  // Lazily from what was saved (islands.rides).
  ridesReady() {
    if (this.rafts) return;
    const saved = this.ridesSaved || {};
    this.rafts = (saved.rafts || []).map(r => ({ id: r.id, x: r.x, z: r.z, a: r.a || 0, riders: [], input: null, made: r.made || 0 }));
    this.zips = (saved.zips || []).map(z => ({ ...z }));
    this.nextRide = Math.max(0, ...this.rafts.map(r => r.id), ...this.zips.map(z => z.id)) + 1;
  },
  ridesSave() {
    if (!this.rafts) return this.ridesSaved || {};
    return { rafts: this.rafts.map(r => ({ id: r.id, x: r2(r.x), z: r2(r.z), a: r2(r.a), made: r.made })), zips: this.zips.map(z => ({ ...z })) };
  },
  raftView(r) { return { id: r.id, x: r2(r.x), z: r2(r.z), a: r2(r.a), riders: [...r.riders] }; },
  zipView(z) { return { id: z.id, ax: z.ax, ay: z.ay, az: z.az, bx: z.bx, by: z.by, bz: z.bz, who: z.byName || '' }; },
  riverCurrent(x, z) { return riverCurrent(x, z); },
  // players.js: while you ride, your position is ours.
  rideHoldsPos(p, face) {
    // (and for a moment after: a position sent from partway along hasn't arrived yet)
    if (!p.ride && !(Date.now() - (p.rideEndAt || 0) < RIDE_GRACE)) return false;
    if (num(face)) p.face = face;
    p.lastPosAt = Date.now();
    return true;
  },
  // Where each rider sits, following the raft.
  seatRiders(r) {
    const c = Math.cos(r.a), s = Math.sin(r.a);
    r.riders.forEach((id, i) => {
      const p = this.players.get(id); if (!p) return;
      const [ox, oz] = SEATS[i % SEATS.length];
      p.x = r2(r.x + ox * c + oz * s); p.z = r2(r.z - ox * s + oz * c);
      p.stand = r2(DECK - Math.max(heightAt(p.x, p.z), -.75));   // standing on the deck (drawn from the sea floor, or -0.75 over deep water)
    });
  },
  // Off a raft or a line (or gone): out of its list, and the raft's paddle passes on.
  dismount(p) {
    const ride = p.ride;
    if (!ride) return;
    p.ride = null; p.rideEndAt = Date.now();
    if (ride.kind === 'raft') {
      const r = this.rafts.find(x => x.id === ride.id);
      if (r) { r.riders = r.riders.filter(id => id !== p.id); r.input = null; this.broadcast({ t: 'rafts', list: [this.raftView(r)] }); }
    } else this.broadcast({ t: 'ride', id: p.id, zip: null });
  },

  onRaftPlace(p, { x, z }) {
    if (!on() || p.dead || p.under || p.ride || !num(x) || !num(z)) return;
    const h = this.held(p);
    if (!h || h.key !== 'raft') return;
    if (Math.hypot(x - p.x, z - p.z) > R().REACH + 1) return;
    if (!floats(x, z)) return this.send(p, { t: 'toast', msg: 'Too shallow. Set it down on deeper water.' });
    this.ridesReady();
    if (!this.take(p, 'raft', 1)) return;
    // too many: the oldest one nobody is on drifts away
    if (this.rafts.length >= R().MAX) {
      const old = this.rafts.filter(r => !r.riders.length).sort((a, b) => a.made - b.made)[0];
      if (old) { this.rafts = this.rafts.filter(r => r !== old); this.broadcast({ t: 'rafts', gone: [old.id] }); }
    }
    const r = { id: this.nextRide++, x: r2(x), z: r2(z), a: r2(p.face || 0), riders: [], input: null, made: Date.now() };
    this.rafts.push(r);
    this.broadcast({ t: 'rafts', list: [this.raftView(r)] });
    this.fx(p, 'swing');
    this.sendMe(p);
    this.send(p, { t: 'toast', msg: 'The raft floats. Press E beside it to climb aboard.' });
  },
  onRaftBoard(p, { id }) {
    if (!on() || p.dead || p.under || p.ride || p.knockedUntil > Date.now()) return;
    this.ridesReady();
    const r = this.rafts.find(x => x.id === id);
    if (!r || Math.hypot(r.x - p.x, r.z - p.z) > R().REACH + .5) return;
    if (r.riders.length >= R().SEATS) return this.send(p, { t: 'toast', msg: 'There’s no room left on that raft.' });
    r.riders.push(p.id);
    p.ride = { kind: 'raft', id: r.id };
    if (this.reelIn) this.reelIn(p);   // (no fishing from a raft, yet)
    this.seatRiders(r);
    this.broadcast({ t: 'rafts', list: [this.raftView(r)] });
    this.send(p, { t: 'toast', msg: r.riders.length === 1 ? 'You’re aboard. Walk to paddle; E steps ashore.' : 'You’re aboard. The one at the back paddles; E steps ashore.' });
  },
  onRaftSteer(p, { dx, dz, go }) {
    const r = p.ride && p.ride.kind === 'raft' && this.rafts.find(x => x.id === p.ride.id);
    if (!r || r.riders[0] !== p.id || !num(dx) || !num(dz)) return;
    const l = Math.hypot(dx, dz);
    r.input = l > .01 && num(go) && go > 0 ? { dx: dx / l, dz: dz / l, go: Math.min(1, go) } : null;
  },
  onRaftOff(p) {
    const r = p.ride && p.ride.kind === 'raft' && this.rafts.find(x => x.id === p.ride.id);
    if (!r) return;
    // the nearest ground you could stand on, within reach of the raft
    let spot = null, bd = 1e9;
    for (let d = .8; d <= R().REACH + .01; d += .4) {
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, x = r.x + Math.sin(a) * d, z = r.z + Math.cos(a) * d;
        if (heightAt(x, z) > -.9 && !this.veilAt(x, z) && d < bd) { bd = d; spot = { x, z }; }
      }
      if (spot) break;
    }
    if (!spot) return this.send(p, { t: 'toast', msg: 'Too deep to step off here. Paddle to the shore.' });
    this.dismount(p);
    p.x = r2(spot.x); p.z = r2(spot.z);
    this.send(p, { t: 'correct', x: p.x, z: p.z });
  },

  onZipTie(p) {
    if (!on() || p.dead || p.under || p.ride) return;
    const h = this.held(p);
    if (!h || h.key !== 'zipline') return;
    const Zr = Z(), say = msg => this.send(p, { t: 'toast', msg });
    const here = { x: r2(p.x), z: r2(p.z), y: r2(groundY(p.x, p.z) + Zr.POST) };
    const from = p.zipFrom;
    if (!from) { p.zipFrom = here; return say('One post set. Walk to where the line should end, lower down, and press E again.'); }
    if (Math.hypot(here.x - from.x, here.z - from.z) < 1.5) { p.zipFrom = null; return say('You pull the post up again.'); }
    this.ridesReady();
    const line = { ax: from.x, ay: from.y, az: from.z, bx: here.x, by: here.y, bz: here.z }, len = zipLen(line);
    if (len < Zr.MIN) return say(`Too short. A zip line needs at least ${Zr.MIN} m.`);
    if (len > Zr.MAX) return say(`Too long: the line only reaches ${Zr.MAX} m. Try somewhere closer.`);
    if (line.ay - line.by < Zr.DROP) return say('This end needs to be lower than the first, or nothing will slide down it.');
    for (let k = .05; k < .95; k += 1 / len) {
      const q = zipAt(line, k);
      if (q.y - groundY(q.x, q.z) < Zr.CLEAR) return say('The ground is in the way between the two ends.');
    }
    if (this.zips.length >= Zr.MAX) return say('There are too many zip lines on the island already.');
    if (!this.take(p, 'zipline', 1)) return;
    p.zipFrom = null;
    const zl = { id: this.nextRide++, ...line, byName: p.name };
    this.zips.push(zl);
    this.broadcast({ t: 'zips', list: [this.zipView(zl)] });
    this.fx(p, 'swing');
    this.sendMe(p);
    say(`The line is strung, ${Math.round(len)} m. Anyone can ride it from the top post.`);
  },
  onZipRide(p, { id }) {
    if (!on() || p.dead || p.under || p.ride || p.knockedUntil > Date.now()) return;
    this.ridesReady();
    const zl = this.zips.find(x => x.id === id);
    if (!zl || Math.hypot(zl.ax - p.x, zl.az - p.z) > Z().REACH + .5) return;
    if (this.reelIn) this.reelIn(p);
    p.ride = { kind: 'zip', id: zl.id, at: Date.now() };
    this.broadcast({ t: 'ride', id: p.id, zip: zl.id, at: 0 });
  },
};

const messages = {
  'raft-place'(p, msg) { return this.onRaftPlace(p, msg); },
  'raft-board'(p, msg) { return this.onRaftBoard(p, msg); },
  'raft-steer'(p, msg) { return this.onRaftSteer(p, msg); },
  'raft-off'(p) { return this.onRaftOff(p); },
  'zip-tie'(p) { return this.onZipTie(p); },
  'zip-ride'(p, msg) { return this.onZipRide(p, msg); },
};

function onTick(dt) {
  if (!this.rafts) return;
  const now = Date.now();
  // riders who left, died or were knocked off
  for (const r of this.rafts) {
    const before = r.riders.length;
    r.riders = r.riders.filter(id => {
      const p = this.players.get(id), mine = p && p.ride && p.ride.kind === 'raft' && p.ride.id === r.id;
      if (mine && p.dead) p.ride = null;
      return mine && !p.dead;
    });
    if (r.riders.length !== before) { r.input = null; this.broadcast({ t: 'rafts', list: [this.raftView(r)] }); }
  }
  // rafts on the move: paddled, and carried by a river
  const moved = [];
  for (const r of this.rafts) {
    if (!r.riders.length) continue;
    const [cx, cz] = this.riverCurrent(r.x, r.z), inp = r.input;
    const vx = (inp ? inp.dx * R().SPEED * inp.go : 0) + cx, vz = (inp ? inp.dz * R().SPEED * inp.go : 0) + cz;
    if (Math.hypot(vx, vz) < .02) continue;
    const nx = r.x + vx * dt, nz = r.z + vz * dt;
    if (!floats(nx, nz) || this.veilAt(nx, nz)) continue;   // aground: it stops
    r.x = nx; r.z = nz;
    if (inp) { let da = Math.atan2(inp.dx, inp.dz) - r.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; r.a += da * Math.min(1, dt * R().TURN); }
    this.seatRiders(r);
    for (const id of r.riders) { const p = this.players.get(id); if (p) p.moving = true; }
    moved.push(this.raftView(r));
  }
  if (moved.length && (this.tickN % 2 === 0)) this.broadcast({ t: 'rafts', list: moved });
  // riders sliding down zip lines
  for (const p of this.players.values()) {
    if (!p.ride || p.ride.kind !== 'zip') continue;
    const zl = this.zips.find(x => x.id === p.ride.id);
    if (!zl || p.dead) { this.dismount(p); continue; }
    const k = Math.min(1, (now - p.ride.at) / 1000 * Z().SPEED / zipLen(zl)), q = zipAt(zl, k);
    p.x = r2(q.x); p.z = r2(q.z); p.stand = r2(Math.max(0, q.y - Z().HANG - groundY(q.x, q.z))); p.moving = true;
    if (k >= 1) { this.dismount(p); p.stand = 0; this.send(p, { t: 'correct', x: p.x, z: p.z }); }
  }
}

// What's on the island, for someone joining.
function onJoin() {
  if (!on()) return {};
  this.ridesReady();
  return { rafts: this.rafts.map(r => this.raftView(r)), zips: this.zips.map(z => this.zipView(z)) };
}

module.exports = { methods, messages, onTick, onJoin, riverCurrent };
