// Accounts: sign-up (needs the invite code), login, logout and session tokens.
// The browser keeps a random token; the database only stores an HMAC of it,
// so a leaked database can't be used to log in.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SESSION_DAYS = 30;
const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;

function createAuth(store, { inviteCode, sessionSecret }) {
  const hashToken = token => crypto.createHmac('sha256', sessionSecret).update(token).digest('hex');

  // Very small per-IP limiter so passwords and the invite code can't be guessed quickly.
  const attempts = new Map();
  function limited(ip) {
    const now = Date.now();
    const a = attempts.get(ip) || { n: 0, reset: now + 10 * 60 * 1000 };
    if (now > a.reset) { a.n = 0; a.reset = now + 10 * 60 * 1000; }
    a.n++;
    attempts.set(ip, a);
    return a.n > 20;
  }
  setInterval(() => { const now = Date.now(); for (const [k, a] of attempts) if (now > a.reset) attempts.delete(k); }, 60 * 1000).unref();

  function sameText(a, b) {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  }

  async function newSession(player) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
    await store.createSession(hashToken(token), player.id, expires);
    return { token, player: { id: player.id, username: player.username } };
  }

  async function signup({ username, password, invite }, ip) {
    if (limited(ip)) return { status: 429, error: 'Too many tries. Wait a few minutes and try again.' };
    username = String(username || '').trim();
    password = String(password || '');
    if (!inviteCode || !sameText(String(invite || '').trim(), inviteCode)) return { status: 403, error: 'That invite code isn’t right.' };
    if (!USERNAME_RE.test(username)) return { status: 400, error: 'Names are 3 to 16 letters, numbers, _ or -.' };
    if (password.length < 6 || password.length > 200) return { status: 400, error: 'Passwords need at least 6 characters.' };
    if (await store.findPlayerByName(username)) return { status: 409, error: 'Someone already has that name.' };
    let player;
    try {
      player = await store.createPlayer(username, await bcrypt.hash(password, 10));
    } catch (e) {
      if (e.code === '23505') return { status: 409, error: 'Someone already has that name.' };
      throw e;
    }
    return { status: 200, body: await newSession(player) };
  }

  async function login({ username, password }, ip) {
    if (limited(ip)) return { status: 429, error: 'Too many tries. Wait a few minutes and try again.' };
    const p = await store.findPlayerByName(String(username || '').trim());
    const ok = p && await bcrypt.compare(String(password || ''), p.pass_hash);
    if (!ok) return { status: 401, error: 'Wrong name or password.' };
    return { status: 200, body: await newSession(p) };
  }

  async function logout(token) {
    if (token) await store.deleteSession(hashToken(token));
    return { status: 200, body: { ok: true } };
  }

  async function playerForToken(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    return store.getSession(hashToken(token));
  }

  setInterval(() => store.pruneSessions().catch(() => {}), 6 * 3600 * 1000).unref();

  return { signup, login, logout, playerForToken };
}

module.exports = { createAuth };
