// The driftwood board by the beach lantern.
const WG = require('../shared/world-gen');

const methods = {
  // ================= Driftwood board =================
  async pinNote(p, text, key) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!clean) return;
    try {
      const r = await this.store.pinNote(this.id, clean, p ? p.id : null, key);
      const note = { id: r.id, text: clean, key: key || null, by: p ? p.name : null, at: r.at };
      this.notes.push(note); if (this.notes.length > 40) this.notes.shift();
      if (this.players.size) this.broadcast({ t: 'note', note });
    } catch (e) { console.error('[island] note not saved', e.message); }
  },
  onPin(p, { text }) {
    if (p.dead || Math.hypot(this.board.x - p.x, this.board.z - p.z) > 4) return;
    const now = Date.now();
    if (now - (p.lastPinAt || 0) < 30000) return this.send(p, { t: 'toast', msg: 'Give it a moment before pinning another note.' });
    p.lastPinAt = now;
    this.pinNote(p, text);
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  pin(p, msg) { return this.onPin(p, msg); },
};

module.exports = { methods, messages };
