// The Weeping Wood's own things (task C4, flag `region-wood`): what E does to the giant trees,
// resin, hanging vines, strange fruit, giant leaves and amber. Where they grow is the region
// file (server/regions/wood.js, `spawnMore`); how they look is public/js/109-the-wood.js; how
// long they take to come back is WG.THINGS.
const WG = require('../shared/world-gen');
const { ITEMS, RULES } = WG;

// Take one of `item` (two with `tool` in hand) from a thing that runs out after `state.left` goes.
function dig(item, tool, verb) {
  return function (p, o, { say, changed }) {
    const used = tool && this.toolFor(p, WG.itemInfo(tool).tool), s = o.state, got = used ? 2 : 1;
    s.left--; this.give(p, item, got);
    if (s.left <= 0) { s.gone = true; s.goneDay = this.day; }
    this.fx(p, 'swing', o.id);
    say(`${verb} +${got} ${ITEMS[item].toLowerCase()}${this.wearTool(p, used)}`);
    changed();
  };
}
// Pick what grows on a plant; it grows back (WG.THINGS[type].regrow days).
function pick(item, n, gone) {
  return function (p, o, { say, changed }) {
    const s = o.state;
    if (s.picked) return say(gone);
    s.picked = true; s.pickedDay = this.day;
    this.give(p, item, n);
    this.fx(p, 'swing');
    say(`+${n} ${ITEMS[item].toLowerCase()}`);
    changed();
  };
}

const uses = {
  // a giant: only an axe bites into it, and only a little a day (it's climbed by its vines, P9)
  giant: {
    reach: 3.4,
    use(p, o, { say, changed }) {
      const s = o.state, axe = this.toolFor(p, 'axe');
      if (!axe) return say('Its bark is like stone. You’d need an axe, and even then it gives only a little.');
      if (s.cutDay !== this.day) { s.cutDay = this.day; s.cuts = 0; }
      if (s.cuts >= RULES.WOOD.HARDWOOD) return say('It has given enough today. Come back tomorrow.');
      const got = Math.min(2, RULES.WOOD.HARDWOOD - s.cuts);
      s.cuts += got; this.give(p, 'hardwood', got);
      this.fx(p, 'swing', o.id);
      say(`You hew a slab from its roots: +${got} hardwood${this.wearTool(p, axe)}`);
      changed();
    },
  },
  resin: { use: dig('resin', null, 'You scrape the weeping stump:') },
  vine: { use: pick('vine_rope', 2, 'Cut back to the branch. It will hang down again in a day or two.') },
  fruit: { use: pick('strange_fruit', 2, 'Picked bare. New fruit in a day or two.') },
  bigleaf: { use: pick('giant_leaf', 1, 'Only the small leaves are left. A new big one by tomorrow.') },
  amber: { reach: 1.4, use: dig('amber', 'pickaxe', 'You break amber out of the old roots:') },
};

module.exports = { uses };
