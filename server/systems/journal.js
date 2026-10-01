// The journal: first finds, counts, and where to look for things.
const WG = require('../shared/world-gen');
const CONTENT = require('../content');

const methods = {
  noteDiscovery(key, playerId, name, first, count = 1) {
    if (!this.discoveries.has(key)) this.discoveries.set(key, { first: null, counts: new Map() });
    const d = this.discoveries.get(key);
    if (first || !d.first) d.first = d.first && !first ? d.first : { playerId, name };
    d.counts.set(playerId, count);
  },
  // A player finds something for the journal: first finds are credited and announced.
  discover(p, key) {
    if (!key || !this.journalKeys.has(key)) return;
    const d = this.discoveries.get(key);
    const first = !d || !d.first;
    const count = ((d && d.counts.get(p.id)) || 0) + 1;
    this.noteDiscovery(key, p.id, p.name, first, count);
    this.store.recordDiscovery(this.id, p.id, key, first).catch(e => console.error('[island] discovery not saved', e.message));
    const entry = this.content.journal.find(e => e.key === key);
    if (first) this.broadcast({ t: 'discovery', key, by: p.name, first: true, name: entry.name });
    this.send(p, { t: 'journal', key, count, first: this.discoveries.get(key).first.name });
    if (this.sleeper) this.sleeperOnFind(key);
  },
  // Where and when something can be found, in a few words, from the spawn rules
  // (so the journal can say how to look for it even before you've found it).
  findHint(key) {
    const base = this.findHintBase(key), fish = WG.feature('fishing') && CONTENT.FISH.find(f => f.key === key);
    return fish ? `${base ? base + ' ' : ''}Bites on a line ${fish.hint}.` : base;   // (P7: the journal's fish page)
  },
  findHintBase(key) {
    const list = (xs) => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0];
    const place = { meadow: 'meadows', forest: 'forests', spring: 'spring clearings', beach: 'beaches', highland: 'the hills', peak: 'the peaks', sea: 'the shallows' };
    const b = CONTENT.BUGS.find(x => x.key === key);
    if (b) {
      const when = b.when === 'night' ? 'At night' : b.when === 'day' ? 'By day' : 'Day or night';
      const extra = b.weather === 'rain' ? ', only in the rain' : b.moon === 'full' ? ', only under a full moon' : '';
      return `${when} in ${list(b.biomes.map(x => place[x] || x))}${extra}.`;
    }
    const t = this.content.tide.find(x => x.entry === key);
    if (t && t.weight > 0) return `Washed up on the beaches in the morning${t.minDay > 1 ? `, from day ${t.minDay} on` : ''}${t.kind === 'strange' ? '. The tide brings at most one strange thing a day' : ''}.`;
    if (t) return 'Left at a carving stone when someone answers what it asks.';
    return '';
  },
  journalView(p) {
    const firsts = {}, mine = {};
    for (const [key, d] of this.discoveries) {
      if (d.first) firsts[key] = d.first.name;
      if (d.counts.has(p.id)) mine[key] = d.counts.get(p.id);
    }
    return { entries: this.content.journal.map(e => ({ ...e, hint: this.findHint(e.key) })), firsts, mine };
  },
};

module.exports = { methods };
