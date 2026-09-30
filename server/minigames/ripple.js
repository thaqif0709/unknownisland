// Ripple memory: the carving symbols light up one by one in the water; tap them back in
// the same order. (The symbols are the carving stones' marks, so fishers learn them.)
// The sequence has to be shown, so the player sees it; the server checks the order and
// the time (showing it takes SHOW_MS a symbol, then SYMBOL_MS a symbol to answer).
const SYMBOLS = 6, SHOW_MS = 700, SYMBOL_MS = 1500;

module.exports = {
  type: 'ripple',
  name: 'Ripple memory',
  build(rng, level) {
    const len = [3, 4, 6][level];
    const seq = Array.from({ length: len }, () => Math.floor(rng() * SYMBOLS));
    return {
      puzzle: { symbols: SYMBOLS, seq, showMs: SHOW_MS },
      check: a => a && Array.isArray(a.seq) && a.seq.length === len && a.seq.every((v, i) => v === seq[i]),
      solve: () => ({ seq: [...seq] }),
      ms: len * SHOW_MS + 600 + len * SYMBOL_MS,
    };
  },
};
