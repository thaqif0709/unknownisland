// Travelling between lit lanterns (task W10, flag `fasttravel`). Stand in a lit lantern's
// light and it's remembered (p.lanternsSeen, saved with the inventory JSON). At a lit
// lantern, the browser's lantern panel lists the other lit lanterns you remember; picking one
// takes lamp oil by distance (RULES.LANTERN_TRAVEL) and puts you beside it.
const WG = require('../shared/world-gen');
const { RULES } = WG;
const { r2, REACH_SLACK } = require('./util');

const on = () => WG.feature('fasttravel');
// Oil to travel from lantern a to lantern b.
const travelCost = (a, b) => Math.max(RULES.LANTERN_TRAVEL.MIN_OIL, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / RULES.LANTERN_TRAVEL.PER_OIL));
// Close enough to a lantern to use it (as for tending it with E).
const atLantern = (p, l) => Math.hypot(l.x - p.x, l.z - p.z) <= (l.big ? 2.2 : 1.6) + RULES.REACH + REACH_SLACK;

const methods = {
  travelCost,
  // Remember every lit lantern p is standing in the light of. Returns the new ones.
  seeLanterns(p) {
    if (!on() || p.dead || p.under) return [];
    if (!p.lanternsSeen) p.lanternsSeen = [];
    const fresh = this.lanterns.filter(l => l.lit && !p.lanternsSeen.includes(l.id) && Math.hypot(l.x - p.x, l.z - p.z) <= this.lanternRadius(l));
    for (const l of fresh) p.lanternsSeen.push(l.id);
    return fresh;
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  // { from: lantern id you're at, to: lantern id to go to }
  lanterntravel(p, { from, to }) {
    if (!on()) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    const a = this.lanterns[from], b = this.lanterns[to], now = Date.now();
    if (!a || !b || a === b || p.dead || p.knockedUntil > now || p.under) return;
    if (!atLantern(p, a)) return;
    if (!a.lit) return say('This lantern has gone cold. Light it first.');
    if (!b.lit) return say('That lantern has gone cold. There’s no light to find your way to.');
    if (!(p.lanternsSeen || []).includes(b.id)) return say('You don’t know the way to that light yet.');
    const cost = travelCost(a, b);
    if (this.count(p, 'oil') < cost) return say(`It takes ${cost} lamp oil to get there. You have ${this.count(p, 'oil')}.`);
    this.take(p, 'oil', cost);
    if (p.sitting) p.sitting = false;
    if (this.wake) this.wake(p);
    // beside it, on its own side (so two travellers don't land on each other), on walkable ground
    const ang = Math.random() * Math.PI * 2, d = (b.big ? 2.6 : 2) + .4;
    const at = this.safeSpot(r2(b.x + Math.cos(ang) * d), r2(b.z + Math.sin(ang) * d));
    this.broadcast({ t: 'fx', id: p.id, k: 'lanterntravel', x: p.x, z: p.z });
    p.x = at.x; p.z = at.z; p.lastPosAt = now; p.moving = false;
    this.send(p, { t: 'correct', x: p.x, z: p.z, under: 0 });
    this.send(p, { t: 'lanterntravelled', from: a.id, to: b.id, cost });
    this.broadcast({ t: 'fx', id: p.id, k: 'lanterntravel', x: p.x, z: p.z });
    say(`You follow the light. (−${cost} lamp oil)`);
    this.sendMe(p);
  },
};

// Once a second or so: remember the lit lanterns each player stands by.
function onTick() {
  if (!on()) return;
  for (const p of this.players.values()) {
    const fresh = this.seeLanterns(p);
    if (!fresh.length) continue;
    this.send(p, { t: 'lanternsseen', ids: p.lanternsSeen });
    if (p.lanternsSeen.length > 1) this.send(p, { t: 'toast', msg: 'You’ll find your way back to this light. (Press E at a lit lantern to travel.)' });
  }
}

// The lanterns this player remembers, for the welcome.
function onJoin(p) { return on() ? { lanternsSeen: p.lanternsSeen || [] } : {}; }

module.exports = { methods, messages, onTick, onJoin };
