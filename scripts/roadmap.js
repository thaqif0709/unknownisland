#!/usr/bin/env node
// Prints the roadmap board from docs/roadmap/tasks/*.md and checks it.
//   npm run roadmap              the whole board
//   npm run roadmap -- edvin     only one person's tasks
//   npm run roadmap -- --ready   only tasks that can start now
//   npm run roadmap -- --check   exit 1 on unknown dependencies, cycles or bad fields
const fs = require('fs'), path = require('path');

const DIR = path.join(__dirname, '..', 'docs', 'roadmap', 'tasks');
const STATUSES = ['todo', 'doing', 'review', 'done', 'on-hold'];
const LANES = ['foundations', 'world', 'player', 'content'];

function parse(file) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { file, bad: 'no front matter' };
  const t = { file };
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    t[k] = k === 'depends' ? v.replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean) : v;
  }
  return t;
}

const tasks = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).map(parse);
const byId = new Map(tasks.map(t => [t.id, t]));
const problems = [];
for (const t of tasks) {
  if (t.bad) { problems.push(`${t.file}: ${t.bad}`); continue; }
  if (!STATUSES.includes(t.status)) problems.push(`${t.id}: status "${t.status}" should be one of ${STATUSES.join(', ')}`);
  if (!LANES.includes(t.lane)) problems.push(`${t.id}: lane "${t.lane}" should be one of ${LANES.join(', ')}`);
  for (const d of t.depends || []) if (!byId.has(d)) problems.push(`${t.id}: depends on unknown task ${d}`);
}
// cycles
const seen = new Map();
const visit = (id, trail) => {
  if (seen.get(id) === 'done') return;
  if (seen.get(id) === 'open') { problems.push(`dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
  seen.set(id, 'open');
  for (const d of (byId.get(id) || {}).depends || []) if (byId.has(d)) visit(d, [...trail, id]);
  seen.set(id, 'done');
};
for (const t of tasks) if (t.id) visit(t.id, []);

const args = process.argv.slice(2);
if (args.includes('--check')) {
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`roadmap ok: ${tasks.length} tasks`); process.exit(0);
}

const ready = t => t.status === 'todo' && (t.depends || []).every(d => (byId.get(d) || {}).status === 'done');
const who = args.find(a => !a.startsWith('--'));
const onlyReady = args.includes('--ready');
const order = id => { const m = /^([A-Z])(\d+)$/.exec(id) || []; return 'FWPC'.indexOf(m[1]) * 1000 + +m[2]; };
const mark = { todo: ' ', doing: '>', review: '?', done: 'x', 'on-hold': '-' };

for (const lane of LANES) {
  const rows = tasks.filter(t => t.lane === lane && (!who || t.owner === who) && (!onlyReady || ready(t)))
    .sort((a, b) => order(a.id) - order(b.id));
  if (!rows.length) continue;
  console.log(`\n${lane.toUpperCase()}`);
  for (const t of rows) {
    const deps = (t.depends || []).map(d => ((byId.get(d) || {}).status === 'done' ? d + '✓' : d)).join(' ');
    const tag = ready(t) ? '  READY' : '';
    console.log(`[${mark[t.status] || '?'}] ${t.id.padEnd(4)} ${t.title.padEnd(48).slice(0, 48)} ${String(t.owner).padEnd(10)} ${deps ? 'needs ' + deps : ''}${tag}`);
  }
}
const counts = STATUSES.map(s => `${tasks.filter(t => t.status === s).length} ${s}`).join(', ');
console.log(`\n${counts}.  [ ] todo  [>] doing  [?] review  [x] done  [-] on hold`);
if (problems.length) console.log(`\nProblems (run with --check):\n${problems.join('\n')}`);
