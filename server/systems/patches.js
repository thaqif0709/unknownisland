// Cloak patches.
const WG = require('../shared/world-gen');
const { RULES } = WG;

const methods = {
  // ================= Cloak patches =================
  has(p, key) { return p.patches && p.patches.includes(key); },
  async onPatch(p, { key, on }) {
    const patch = WG.PATCHES.find(x => x.key === key);
    if (!patch) return;
    const say = msg => this.send(p, { t: 'toast', msg });
    if (on) {
      if (this.has(p, key)) return;
      const d = this.discoveries.get(patch.needs);
      if (!d || !d.counts.get(p.id)) return say('You need to have found one first.');
      if (p.patches.length >= RULES.PATCH_SLOTS) return say('Your cloak has no room for another. Unpick one first.');
      p.patches.push(key);
      say(`You stitch the ${patch.name.toLowerCase()} onto your cloak.`);
    } else {
      if (!this.has(p, key)) return;
      p.patches = p.patches.filter(k => k !== key);
      say(`You unpick the ${patch.name.toLowerCase()}.`);
    }
    this.broadcast({ t: 'patches', id: p.id, list: p.patches });
    const list = [...p.patches];   // saves run one after another, in order
    p.patchSave = (p.patchSave || Promise.resolve()).then(() => this.store.savePatches(this.id, p.id, list))
      .catch(e => console.error('[island] patches not saved', e.message));
  },
};

// Messages from the client this system answers (msg.t -> handler; `this` is the Island).
const messages = {
  patch(p, msg) { return this.onPatch(p, msg); },
};

module.exports = { methods, messages };
