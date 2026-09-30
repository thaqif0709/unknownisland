// Small helpers shared by the island systems.
const { RULES, ITEMS } = require('../shared/world-gen');

const ACT_COOLDOWN = 350;     // ms; the client waits 450
const REACH_SLACK = 0.9;      // tolerance for latency when checking distances

const r2 = v => Math.round(v * 100) / 100;
const num = v => typeof v === 'number' && Number.isFinite(v);
const hasCost = (p, cost) => Object.entries(cost).every(([k, n]) => (p.inv[k] || 0) >= n);
// Buckets saved in the inventory JSON: keep only well-formed ones.
const cleanBuckets = list => (Array.isArray(list) ? list : []).filter(b => b && RULES.BUCKET[b.mat]).slice(0, 8)
  .map(b => ({ id: b.id | 0 || Math.floor(Math.random() * 1e9), mat: b.mat, uses: Math.max(0, b.uses | 0),
    water: ['none', 'sea', 'clean'].includes(b.water) ? b.water : 'none', drinks: Math.max(0, b.drinks | 0) }));
const newBucketId = () => Math.floor(Math.random() * 1e9);
const costText = cost => Object.entries(cost).map(([k, n]) => `${n} ${ITEMS[k].toLowerCase()}`).join(', ');

module.exports = { r2, num, hasCost, cleanBuckets, newBucketId, costText, REACH_SLACK, ACT_COOLDOWN };
