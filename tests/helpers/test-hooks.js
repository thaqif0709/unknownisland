// Loaded into the game server by the tests only (`node -r tests/helpers/test-hooks.js`),
// never in production. It changes nothing in the game's own code; it wraps two things:
//
// 1. The island always starts at midday in clear weather, so the Stilled (who only come
//    out at night) never interfere, and the weather can't change for the next ~7 minutes
//    (it only rolls at noon and at sunrise).
// 2. A `{ t: 'test', do, ... }` WebSocket message for setting things up quickly: give a
//    player items, put them somewhere, wash up a tide, carve an offering request, finish
//    boiling. The answer comes back as `{ t: 'test', id, ... }`.
const path = require('path');
const SERVER = path.join(__dirname, '..', '..', 'server');
const storeModule = require(path.join(SERVER, 'store'));
const { Island } = require(path.join(SERVER, 'world'));

const MIDDAY = 0.51;   // just after noon: noon's weather roll has passed, night starts at 0.8

const createStore = storeModule.createStore;
storeModule.createStore = () => {
  const store = createStore();
  const loadIsland = store.loadIsland.bind(store);
  store.loadIsland = async id => {
    const data = await loadIsland(id);
    if (data) Object.assign(data, { time: MIDDAY, weather: 'clear', lastTickAt: Date.now() });
    return data;
  };
  return store;
};

const COMMANDS = {
  // { inv: { wood: 4 }, tools: ['pickaxe'] }
  give(p, { inv = {}, tools = [] }) {
    for (const [k, n] of Object.entries(inv)) this.give(p, k, n);
    for (const t of tools) this.addTool(p, t);
    this.sendMe(p);
    return { inv: p.inv, tools: p.tools };
  },
  // Put the player at x, z (the client is told with a 'correct').
  place(p, { x, z, face }) {
    p.x = x; p.z = z; if (typeof face === 'number') p.face = face;
    p.lastPosAt = Date.now(); p.moving = false;
    this.send(p, { t: 'correct', x, z });
    return { x, z };
  },
  // A tide right now, as at sunrise.
  async tide() {
    await this.tide();
    return { washups: this.washups.map(w => this.washView(w)) };
  },
  // Carve an 'offer' request (the first one in the content, or `key`) on its stone.
  sleeperOffer(p, { key }) {
    const def = (this.content.sleeper || []).find(r => r.conditions && r.conditions.type === 'offer' && (!key || r.key === key));
    if (!def) return { error: 'no offer request in the content' };
    const stone = this.carvings.find(c => c.key === def.stone) || this.carvings[0];
    this.sleeper.req = { key: def.key, stone: stone.id, progress: 0, need: Math.max(1, def.conditions.count | 0), startDay: this.day,
      expiresDay: this.day + (def.days || 3), status: 'active', resolvedDay: null };
    this.saveReq();
    this.sleeperChanged(stone.id, 'new');
    return { key: def.key, item: def.conditions.item, need: this.sleeper.req.need, stone: { id: stone.id, x: stone.x, z: stone.z, face: stone.face } };
  },
  // Every bucket on a fire is done boiling.
  boil() {
    for (const f of this.fires) if (f.pot) f.pot.left = 0;
    return { pots: this.fires.filter(f => f.pot).map(f => f.id) };
  },
  state() {
    return { day: this.day, time: this.time, weather: this.weather, env: this.env, stilled: this.stilled.length };
  },
};

const onMessage = Island.prototype.onMessage;
Island.prototype.onMessage = function (p, msg) {
  if (!msg || msg.t !== 'test') return onMessage.call(this, p, msg);
  const cmd = Object.prototype.hasOwnProperty.call(COMMANDS, msg.do) ? COMMANDS[msg.do] : null;
  const reply = r => this.send(p, { t: 'test', id: msg.id, ...r });
  if (!cmd) return reply({ error: `no test command "${msg.do}"` });
  return Promise.resolve().then(() => cmd.call(this, p, msg)).then(reply, e => reply({ error: e.message }));
};

console.log('[tests] test hooks loaded: midday, clear weather, test commands on');
