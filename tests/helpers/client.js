// A player in the tests: a WebSocket that speaks the game's protocol, keeps every message
// it receives, and can wait for the next one that matches.
const WebSocket = require('ws');

const ACT_GAP = 400;   // the server ignores E more often than every 350 ms

class TestClient {
  constructor(url, account) {
    this.url = url;
    this.account = account;
    this.name = account.username;
    this.messages = [];
    this.waiters = [];
    this.me = null;          // the latest 'me' (health, inventory, ...)
    this.welcome = null;
    this.nextTestId = 1;
    this.lastActAt = 0;
  }

  open() {
    this.ws = new WebSocket(this.url);
    this.ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'snap') { this.snap = m; return; }   // positions, 12 times a second: kept, not logged
      if (m.t === 'me') this.me = m;
      this.messages.push(m);
      for (const w of [...this.waiters]) if (w.match(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
    });
    return new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); });
  }

  send(msg) { this.ws.send(JSON.stringify(msg)); }

  // The next message matching `match` (a type name, or a function), arriving after now.
  next(match, { timeout = 5000, what } = {}) {
    const fn = typeof match === 'string' ? m => m.t === match : match;
    return new Promise((resolve, reject) => {
      const w = { match: fn, resolve };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        const recent = this.messages.slice(-8).map(m => m.t + (m.msg ? `(${m.msg})` : '')).join(', ');
        reject(new Error(`${this.name}: no ${what || (typeof match === 'string' ? `'${match}'` : 'matching')} message within ${timeout} ms (last: ${recent})`));
      }, timeout);
      w.resolve = m => { clearTimeout(timer); resolve(m); };
      this.waiters.push(w);
    });
  }

  // Send, then wait for a reply. The listener is set up first, so a fast reply isn't missed.
  async request(msg, match, opts) { const p = this.next(match, opts); this.send(msg); return p; }

  async hello() {
    this.welcome = await this.request({ t: 'hello', token: this.account.token }, 'welcome');
    this.id = this.welcome.you.id;
    this.me = { ...this.welcome.you };
    return this.welcome;
  }

  // A setup command from test-hooks.js; rejects if the server says it failed.
  // (`id` is taken: it matches the reply to the request.)
  async test(what, args = {}) {
    if ('id' in args) throw new Error(`test ${what}: don't pass "id", it's the request's own`);
    const id = this.nextTestId++;
    const r = await this.request({ t: 'test', do: what, id, ...args }, m => m.t === 'test' && m.id === id, { what: `test ${what} reply` });
    if (r.error) throw new Error(`test ${what}: ${r.error}`);
    return r;
  }

  // Press E on something. Resolves with the first toast that follows, once the 'me' that
  // usually comes right after it (the new inventory) has arrived too.
  async act(target, { toast = true } = {}) {
    const wait = ACT_GAP - (Date.now() - this.lastActAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastActAt = Date.now();
    if (!toast) return this.send({ t: 'act', target });
    const t = await this.request({ t: 'act', target }, 'toast', { what: `toast after E on ${target}` });
    await this.settle();
    return t;
  }

  // Wait until the next 'me' arrives (the server sends one a few times a second anyway).
  settle() { return this.next('me', { timeout: 1000 }).catch(() => null); }

  close() { try { this.ws.close(); } catch (e) { /* already closed */ } }
}

module.exports = { TestClient };
