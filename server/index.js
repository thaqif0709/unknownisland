// Entry point: serves the game files, the login API and the WebSocket game connection.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const { createStore } = require('./store');
const { createAuth } = require('./auth');
const { Island } = require('./world');
const { buildClient } = require('./client-bundle');
const WG = require('./shared/world-gen');

// Feature flags: RULES.FEATURES, overridden by the FEATURES env var ("slots,combat", "-slots").
WG.setFeatures(WG.resolveFeatures(process.env.FEATURES));
{
  const on = Object.keys(WG.features()).filter(WG.feature);
  const unknown = String(process.env.FEATURES || '').split(',').map(s => s.trim().replace(/^[-+]/, '')).filter(n => n && !(n in WG.RULES.FEATURES));
  console.log(`[setup] feature flags on: ${on.join(', ') || 'none'}`);
  if (unknown.length) console.warn(`[setup] FEATURES names flags not in RULES.FEATURES (typo?): ${unknown.join(', ')}`);
}

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const SHARED = path.join(__dirname, 'shared');
const THREE_JS = require.resolve('three/build/three.min.js');
const DEFAULT_ISLAND = 2;   // the big island

const store = createStore();
let inviteCode = process.env.INVITE_CODE;
let sessionSecret = process.env.SESSION_SECRET;
if (store.kind === 'memory') {
  inviteCode = inviteCode || 'dev';
  sessionSecret = sessionSecret || crypto.randomBytes(32).toString('hex');
  console.log(`[setup] No DATABASE_URL, so nothing will be saved. Invite code for local testing: "${inviteCode}"`);
} else if (!inviteCode || !sessionSecret) {
  console.error('[setup] INVITE_CODE and SESSION_SECRET must be set when DATABASE_URL is set.');
  process.exit(1);
}
const auth = createAuth(store, { inviteCode, sessionSecret });

// Islands are loaded on first use and kept in memory.
const islands = new Map();
async function getIsland(id) {
  if (!islands.has(id)) islands.set(id, Island.load(store, id));
  try { return await islands.get(id); } catch (e) { islands.delete(id); throw e; }
}

// ================= HTTP =================
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/vendor/three.min.js') return sendFile(res, THREE_JS, 'public, max-age=86400');
  if (urlPath === '/game.js' || urlPath === '/game.js.map') {   // joined from public/js/*.js
    const b = buildClient(), map = urlPath.endsWith('.map');
    res.writeHead(200, { 'Content-Type': map ? 'application/json; charset=utf-8' : TYPES['.js'], 'Cache-Control': 'no-cache' });
    return res.end(map ? b.map : b.js);
  }
  let base = PUBLIC;
  if (urlPath.startsWith('/shared/')) { base = SHARED; urlPath = urlPath.slice('/shared'.length); }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/hiddenpages' || urlPath === '/hiddenpages/') urlPath = '/hiddenpages.html';
  const file = path.normalize(path.join(base, urlPath));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  sendFile(res, file, 'no-cache');
}

function sendFile(res, file, cache) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (pathname === '/api/world') return sendWorld(req, res);
    if (pathname === '/wiki' || pathname === '/wiki/') { res.writeHead(301, { Location: '/hiddenpages' }); return res.end(); }   // the old name
    if (pathname === '/api/hiddenpages') return sendHiddenPages(res);
    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/me') {
        const player = await auth.playerForToken(bearer(req));
        return player ? sendJson(res, 200, { player }) : sendJson(res, 401, { error: 'Not logged in.' });
      }
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      let body;
      try { body = await readBody(req); } catch { return sendJson(res, 400, { error: 'Bad request' }); }
      let r;
      if (pathname === '/api/signup') r = await auth.signup(body, clientIp(req));
      else if (pathname === '/api/login') r = await auth.login(body, clientIp(req));
      else if (pathname === '/api/logout') r = await auth.logout(bearer(req));
      else return sendJson(res, 404, { error: 'Not found' });
      return r.error ? sendJson(res, r.status, { error: r.error }) : sendJson(res, r.status, r.body);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res);
  } catch (e) {
    console.error('[http]', e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong on the server.' });
  }
});

// Live facts for the Hidden Pages (/hiddenpages, the game's wiki): the journal with rarities and where to look,
// and how many carving-stone requests exist. Numbers the page shows come from
// /shared/world-gen.js directly, so the page never goes out of date.
async function sendHiddenPages(res) {
  try {
    const island = await getIsland(DEFAULT_ISLAND);
    const c = island.content;
    sendJson(res, 200, {
      journal: c.journal.map(e => ({ key: e.key, category: e.category, name: e.name, rarity: e.rarity, hint: island.findHint(e.key) })),
      tide: c.tide.filter(t => t.weight > 0).map(t => ({ label: t.label, kind: t.kind, minDay: t.minDay || 1 })),
      requests: (c.sleeper || []).filter(r => r.inPool !== false).length,   // the random ones; chain steps are counted in chains
      chains: Object.fromEntries(WG.REGIONS.map(r => [r.id, (require(`./regions/${r.id}`).requests || []).length]).filter(([, n]) => n)),
      features: WG.features(),
      day: island.day,
    });
  } catch (e) { sendJson(res, 500, { error: 'The island is not answering.' }); }
}

// The island layout (every tree and rock), sent once per visit and compressed.
let worldCache = null;
async function sendWorld(req, res) {
  if (!worldCache) {
    const island = await getIsland(DEFAULT_ISLAND);
    const body = Buffer.from(island.layoutJson());
    worldCache = { body, gz: zlib.gzipSync(body) };
  }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(gz ? worldCache.gz : worldCache.body);
}

// ================= WebSocket =================
// The browser connects to /ws, then its first message is {t:'hello', token}.
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', ws => {
  let island = null, player = null, closed = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const helloTimer = setTimeout(() => ws.close(4001, 'no hello'), 10000);

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (player) return island.onMessage(player, msg);
    if (msg.t !== 'hello' || island) return;
    clearTimeout(helloTimer);
    try {
      const account = await auth.playerForToken(msg.token);
      if (!account) { ws.send(JSON.stringify({ t: 'auth-failed' })); return ws.close(4001, 'auth'); }
      island = await getIsland(DEFAULT_ISLAND);
      if (closed) return;
      player = await island.join(account, ws);
      if (closed && player) island.leave(player.id, player);
    } catch (e) {
      console.error('[ws] join failed', e);
      ws.close(1011, 'server error');
    }
  });

  ws.on('close', () => {
    closed = true;
    clearTimeout(helloTimer);
    if (island && player) island.leave(player.id, player);
  });
  ws.on('error', () => {});
});

// Drop connections that stopped answering (closed laptop, lost signal).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000).unref();

store.migrate().then(() => server.listen(PORT, () => console.log(`[server] Unknown Island running on http://localhost:${PORT} (storage: ${store.kind})`))).catch(e => {
  console.error('[setup] database migration failed:', e.message);
  process.exit(1);
});

// Save everything before Render (or Ctrl+C) stops the server.
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[server] shutting down, saving islands...');
  for (const p of islands.values()) {
    try { const isl = await p; isl.stop(); await isl.save(); } catch (e) { console.error(e.message); }
  }
  await store.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
