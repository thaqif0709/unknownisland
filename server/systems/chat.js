// Chat and whispers.
const WG = require('../shared/world-gen');

const isAdmin = p => String(process.env.ADMINS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).includes(p.name.toLowerCase());

const methods = {
  // ================= Chat =================
  // Plain text goes to everyone on the island. Commands:
  //   /w <name or number> <message>   whisper to one person (/whisper, /tell, /msg too)
  //   /r <message>                    reply to whoever last whispered you
  //   /who                            who's on the island, with their numbers
  //   /help                           the list of commands
  // The last few global messages are kept in memory so people who join see them.
  onChat(p, { text }) {
    const clean = String(text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!clean) return;
    const sys = msg => this.send(p, { t: 'chat', kind: 'system', text: msg, at: Date.now() });
    const now = Date.now();
    p.chatTimes = (p.chatTimes || []).filter(t => now - t < 8000);
    if (p.chatTimes.length >= 6) return sys('Slow down a little.');
    p.chatTimes.push(now);
    if (clean[0] === '/') {
      const [cmd0, ...rest] = clean.slice(1).split(' '), cmd = cmd0.toLowerCase();
      if (cmd === 'w' || cmd === 'whisper' || cmd === 'tell' || cmd === 'msg') {
        const who = rest.shift(), body = rest.join(' ').trim();
        if (!who || !body) return sys('To whisper: /w name message');
        return this.whisper(p, this.findPlayer(who), body, who);
      }
      if (cmd === 'r' || cmd === 'reply') {
        const body = rest.join(' ').trim();
        if (!p.lastWhisperFrom) return sys('Nobody has whispered to you yet.');
        if (!body) return sys('To reply: /r message');
        return this.whisper(p, this.players.get(p.lastWhisperFrom), body, 'them');
      }
      if (cmd === 'who' || cmd === 'online') {
        return sys('On the island: ' + [...this.players.values()].map(q => `${q.name} (#${q.id})`).join(', '));
      }
      // For whoever runs the island (usernames in the ADMINS env var): open a region by hand.
      if (cmd === 'open' && isAdmin(p)) {
        const id = String(rest[0] || '').toLowerCase();
        return sys(this.openRegion(id) ? `The Veil will lift from ${id} at the next dawn.` : `Can't open "${id}" (already open, or not a region: ${WG.REGIONS.map(r => r.id).join(', ')}).`);
      }
      if (cmd === 'help' || cmd === '?') return sys('Commands: /w name message (whisper), /r message (reply to a whisper), /who (who is here). Anything else goes to everyone.');
      return sys(`There's no /${cmd0} command. Type /help for the list.`);
    }
    const msg = { t: 'chat', kind: 'all', from: p.name, id: p.id, text: clean, at: now };
    this.chatLog = [...(this.chatLog || []), msg].slice(-30);
    if (!p.under) return this.broadcast(msg);
    // from underground (W9): clear to whoever is in the same cave, muffled to everyone else
    const muffled = JSON.stringify({ ...msg, text: this.muffle(clean), muffled: true }), clear = JSON.stringify(msg);
    for (const q of this.players.values()) this.sendRaw(q, q.under === p.under ? clear : muffled);
  },
  // A name (any case) or a number (with or without #).
  findPlayer(who) {
    const w = String(who).replace(/^#/, '').toLowerCase();
    for (const q of this.players.values()) if (q.name.toLowerCase() === w || String(q.id) === w) return q;
    return null;
  },
  whisper(p, q, body, asked) {
    const now = Date.now();
    if (!q) return this.send(p, { t: 'chat', kind: 'system', text: `${asked} isn't on the island right now. Type /who to see who is.`, at: now });
    if (q === p) return this.send(p, { t: 'chat', kind: 'system', text: 'You whisper to yourself. Nobody answers. Probably.', at: now });
    q.lastWhisperFrom = p.id;
    this.send(q, { t: 'chat', kind: 'whisper', from: p.name, id: p.id, text: body, at: now });
    this.send(p, { t: 'chat', kind: 'whisper', to: q.name, toId: q.id, text: body, at: now });
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  chat(p, msg) { return this.onChat(p, msg); },
};

module.exports = { methods, messages };
