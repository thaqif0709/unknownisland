// The browser game is one script, /game.js, but its code lives in public/js/ as one file
// per part (NNN-name.js, joined in number order; a part NNN-name.js can have a folder
// public/js/name/ whose files are joined right after it, e.g. 135-mobs.js then
// mobs/*.js, one file per creature). They share a single scope, exactly as
// if they were one file, so any part can use what an earlier part declared. A source map
// (/game.js.map) makes browser errors and the debugger show the real file and line.
// Files are re-read when they change, so editing one and reloading the page is enough.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'js');
const NAME = /^\d{3}-[a-z0-9-]+\.js$/;
let cache = null;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(n) {
  let v = n < 0 ? (-n << 1) | 1 : n << 1, out = '';
  do { let d = v & 31; v >>>= 5; if (v) d |= 32; out += B64[d]; } while (v);
  return out;
}

// The parts in order, each followed by the files in its folder (if it has one).
function listFiles() {
  const out = [];
  for (const f of fs.readdirSync(DIR).filter(f => NAME.test(f)).sort()) {
    out.push(f);
    const sub = f.slice(4, -3), dir = path.join(DIR, sub);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      for (const g of fs.readdirSync(dir).filter(g => /^[a-z0-9-]+\.js$/.test(g)).sort()) out.push(sub + '/' + g);
    }
  }
  return out;
}

function build() {
  const files = listFiles();
  const stamp = files.map(f => f + ':' + fs.statSync(path.join(DIR, f)).mtimeMs).join('|');
  if (cache && cache.stamp === stamp) return cache;
  if (!files.length || !files[0].startsWith('000-') || !files[files.length - 1].startsWith('999-')) {
    throw new Error('public/js needs a 000-*.js first part and a 999-*.js last part');
  }
  const texts = files.map(f => {
    const t = fs.readFileSync(path.join(DIR, f), 'utf8');
    return t.endsWith('\n') ? t : t + '\n';
  });
  // One mapping per generated line: column 0 -> (file, line, column 0).
  const lines = [];
  let prevFile = 0, prevLine = 0;
  texts.forEach((t, fi) => {
    const n = t.split('\n').length - 1;
    for (let li = 0; li < n; li++) {
      lines.push('A' + vlq(fi - prevFile) + vlq(li - prevLine) + 'A');
      prevFile = fi; prevLine = li;
    }
  });
  const map = { version: 3, file: 'game.js', sources: files.map(f => 'js/' + f), sourceRoot: '/', names: [], mappings: lines.join(';') };
  const js = texts.join('') + '//# sourceMappingURL=/game.js.map\n';
  cache = { stamp, files, js: Buffer.from(js), map: Buffer.from(JSON.stringify(map)) };
  return cache;
}

module.exports = { buildClient: build };
