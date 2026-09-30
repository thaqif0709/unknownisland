// Numbered database migrations: server/migrations/NNNN-short-name.sql or .js.
// Each runs once, in order, inside a transaction, and is recorded in the `migrations`
// table. A .js file exports `async up(q)` where q(text, params) runs a query.
// To add one, take the next free number. If you and someone else both took the same
// number, whoever merges second renumbers theirs (start-up refuses duplicates).
// See docs/roadmap/CONTRACTS.md section 14.
const fs = require('fs');
const path = require('path');

const NAME = /^(\d{4})-[a-z0-9-]+\.(sql|js)$/;

function listMigrations(dir = __dirname) {
  const files = fs.readdirSync(dir).filter(f => f !== 'index.js' && !f.startsWith('.'));
  const seen = new Map();
  const list = [];
  for (const f of files) {
    const m = NAME.exec(f);
    if (!m) throw new Error(`migrations/${f}: name it NNNN-short-name.sql or .js (lowercase, dashes)`);
    if (seen.has(m[1])) throw new Error(`migrations/${f} and ${seen.get(m[1])} share the number ${m[1]}; renumber one`);
    seen.set(m[1], f);
    const name = f.replace(/\.(sql|js)$/, '');
    list.push(m[2] === 'sql' ? { name, sql: fs.readFileSync(path.join(dir, f), 'utf8') } : { name, up: require(path.join(dir, f)).up });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { listMigrations };
