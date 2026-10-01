// The Stairs' own things (task C3, flag `region-stair`): what E does to flint nodules,
// healing herbs, flax, the tumbledown walls of old brick and the standing stones. Where they
// grow is the region file (server/regions/stair.js, `spawnMore`); how they look is
// public/js/108-the-stairs.js; how long they take to come back is WG.THINGS.
const WG = require('../shared/world-gen');
const { ITEMS } = WG;

// Take one of `item` (two with `tool`) from a thing that runs out after `state.left` goes.
function dig(item, tool, verb) {
  return function (p, o, { say, changed }) {
    const used = tool && this.toolFor(p, WG.itemInfo(tool).tool), s = o.state, got = used ? 2 : 1;   // (the tool in hand with the tools flag, P3)
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

// What E does to each of the Stairs' things (`this` is the Island).
const uses = {
  flint: { use: dig('flint', 'pickaxe', 'You prise out a nodule of flint:') },
  herb: { use: pick('herbs', 2, 'Picked. New leaves by tomorrow.') },
  flax: { use: pick('flax', 2, 'Cut back. It will grow again in a day or two.') },
  ruin: { reach: 1.8, use: dig('bricks', 'pickaxe', 'You work a few bricks loose:') },
  standing: {
    use(p, o, { say }) {
      say(['Marks worn almost smooth. On this side the wind can’t reach you.', 'Cold stone, taller than three frogs. Something is carved near the top.',
        'Leaning on it, you can’t hear the wind at all.'][o.id % 3]);
    },
  },
};

module.exports = { uses };
