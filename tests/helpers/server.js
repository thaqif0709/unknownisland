// Starts a real game server for a test file and gives it players to connect with.
//
// The server runs as a child process (`node server/index.js`) with test-hooks.js
// preloaded. It uses the Postgres database in TEST_DATABASE_URL, or keeps everything in
// memory when that isn't set. Each test file gets its own server on a free port.
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { TestClient } = require('./client');

const ROOT = path.join(__dirname, '..', '..');
const HOOKS = path.join(__dirname, 'test-hooks.js');
const INVITE = 'test-invite';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function databaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (url && process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL. The tests make accounts and change the island, so give them their own database.');
  }
  return url || null;
}

// A new, empty database gets db/schema.sql first (as Neon did by hand); the server's
// migrations do the rest when it starts.
async function prepareDatabase(url) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT to_regclass('public.islands') AS t`);
    if (!rows[0].t) await client.query(require('fs').readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));
  } finally { await client.end(); }
}

// Start a server; resolves once it's listening. `env` adds variables (FEATURES, ...).
async function startServer({ env = {} } = {}) {
  const port = await freePort();
  const db = databaseUrl();
  if (db) await prepareDatabase(db);
  const child = spawn(process.execPath, ['-r', HOOKS, path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(port), INVITE_CODE: INVITE, SESSION_SECRET: crypto.randomBytes(16).toString('hex'),
      DATABASE_URL: db || '', ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const keep = d => {
    if (process.env.TEST_SERVER_LOG) process.stderr.write(d);   // TEST_SERVER_LOG=1 shows the server's own output
    log += d; if (log.length > 200000) log = log.slice(-100000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the server did not start within 20 s:\n' + log)), 20000);
    const check = () => { if (log.includes('Unknown Island running on')) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', check);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`the server exited (${code}) before starting:\n${log}`)); });
  });
  child.removeAllListeners('exit');

  const base = `http://127.0.0.1:${port}`;
  let n = 0;
  const clients = [];
  const server = {
    base, port, storage: db ? 'postgres' : 'memory',
    log: () => log,
    async api(pathname, body, headers = {}) {
      const res = await fetch(base + pathname, body === undefined ? { headers } : {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    // A new account (a unique name each time), signed up with the test invite code.
    async signup(prefix = 't') {
      const username = `${prefix}${Date.now().toString(36).slice(-5)}${(n++).toString(36)}${crypto.randomBytes(2).toString('hex')}`.slice(0, 16);
      // a made-up address per account, so the per-IP sign-up limit never trips
      const r = await server.api('/api/signup', { username, password: 'password123', invite: INVITE }, { 'X-Forwarded-For': `10.0.${n}.${n}` });
      if (r.status !== 200) throw new Error(`sign-up failed (${r.status}): ${JSON.stringify(r.body)}`);
      return { username, token: r.body.token, id: r.body.player.id };
    },
    // Sign up and join the island; resolves with a connected client once 'welcome' arrives.
    async join(prefix) {
      const acct = await server.signup(prefix);
      const c = new TestClient(`ws://127.0.0.1:${port}/ws`, acct);
      clients.push(c);
      await c.open();
      await c.hello();
      return c;
    },
    // The island's layout (every tree, rock, ...), as the browser gets it.
    async world() { return (await server.api('/api/world')).body; },
    async stop() {
      for (const c of clients) c.close();
      await new Promise(r => setTimeout(r, 100));
      if (child.exitCode != null) return;
      const gone = new Promise(r => child.once('exit', r));
      child.kill('SIGTERM');   // the server saves the island, then exits
      await Promise.race([gone, new Promise(r => setTimeout(r, 5000))]);
      if (child.exitCode == null) child.kill('SIGKILL');
    },
  };
  return server;
}

module.exports = { startServer, INVITE };
