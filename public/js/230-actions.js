  // ================= Actions =================
  function findTarget() {
    if (myCave) return null;   // in a cave (W9): nothing up on the ground is in reach
    let bestO = null, bd = 1e9;
    const check = o => {
      if (o.state.gone) return;
      const d = Math.hypot(o.x - px, o.z - pz) - radius(o);
      if (d < RULES.REACH && d < bd) { bd = d; bestO = o; }
    };
    nearbyObjects(px, pz, check); fires.forEach(check); drops.forEach(check); lanterns.forEach(check); washups.forEach(check);
    if (board) check(board);
    carvings.forEach(check);
    bugs.forEach(b => { const d = Math.hypot((b.cx ?? b.x) - px, (b.cz ?? b.z) - pz); if (d < 1.9 && d < bd) { bd = d; bestO = b; } });
    if (bestO) return bestO;
    const sn = WG.nearestSpring(px, pz);
    if (Math.hypot(px - sn.x, pz - sn.z) < RULES.SPRING_REACH) return { type: 'spring' };
    if (!myCave && heightAt(px, pz) < .25) return { type: 'sea' };
    return null;
  }
  function label(o) {
    if (!o) return '';
    switch (o.type) {
      case 'spring': return 'Drink from the spring';
      case 'sea': return 'Drink seawater';
      case 'palm': return o.state.coconuts > 0 ? 'Pick a coconut' : o.state.planted != null ? 'Chop the young palm' : 'Chop the palm';
      case 'tree': return o.state.planted != null ? 'Chop the young tree' : 'Chop the tree';
      case 'bush': return !o.state.berries ? 'Bush (picked clean)' : WG.feature('slots') ? `Pick ${o.species === 'blueberry' ? 'blueberries' : 'berries'}` : 'Eat berries';   // with the bag (P2) they go into it
      case 'rock': return o.species === 'pebble' ? 'Pick up stones' : 'Gather stone';
      case 'ore': { const n = (WG.ITEMS[o.ore] || 'Ore').replace(/ ore$/i, '');
        return toolInHand('pick') ? `Mine ${n.toLowerCase()} ore` : `${n} ore (${has('pickaxe') || has('ironpick') ? 'hold your pickaxe' : 'needs a pickaxe'})`; }   // (P3: in your hand)
      case 'dig': return o.state.dug ? 'Dug up (settles by morning)' : toolInHand('shovel') ? 'Dig for clay' : `Soft soil (${has('shovel') ? 'hold your shovel' : 'needs a shovel'})`;
      case 'drop': {
        const list = o.items ? Object.entries(o.items).filter(([k, n]) => k !== 'buckets' && k !== 'tools' && n > 0).map(([k, n]) => `${n} ${(WG.ITEMS[k] || k).toLowerCase()}`) : [];
        if (o.items && Array.isArray(o.items.tools)) list.unshift(...o.items.tools.map(t => `a ${(WG.ITEMS[t.k] || 'tool').toLowerCase()}`));   // (P3)
        if (o.items && o.items.buckets && o.items.buckets.length) list.unshift(o.items.buckets.length > 1 ? `${o.items.buckets.length} buckets` : 'a bucket');
        return list.length ? `Pick up the sack (${list.slice(0, 3).join(', ')}${list.length > 3 ? ', ...' : ''})` : 'Pick up the sack';
      }
      case 'carving': return o.offer && o.tally ? `Read the ${o.key} stone (it wants ${WG.ITEMS[o.offer].toLowerCase()})` : `Read the ${o.key} stone`;
      case 'board': return notes.length ? `Read the driftwood board (${notes.length} note${notes.length > 1 ? 's' : ''})` : 'The driftwood board (pin a note)';
      case 'wash': return o.kind === 'strange' ? (o.key === 'door_in_sand' ? 'Try the door' : o.key === 'ringing_bell' ? 'Touch the bell' : o.key === 'footprints' ? 'Look at the footprints' : 'Pick it up') : `${o.kind === 'food' ? 'Eat' : 'Pick up'}: ${o.label.replace(/^A /, 'a ')}`;   // tide food is eaten on the spot
      case 'bug': { const e = journal.entries.find(e => e.key === o.key); return `Catch the ${(e ? e.name : 'bug').toLowerCase()}`; }
      case 'lantern': {
        const oil = (stats.inv.oil || 0) > 0;
        if (o.lit && UI.lanternTravel && UI.lanternTravel.ways(o).length) return 'Travel by lantern light, or add oil';   // W10
        if (o.lit) return oil ? `Add lamp oil (burns ${Math.ceil(o.fuel / RULES.DAY_LEN * 24)} more hours)` : 'A lit stone lantern';
        if (!oil && o.reclaim < 1) return `Gone cold. The fog is creeping back (${Math.round(o.reclaim * 100)}%)`;
        if (!oil) return o.big ? `Great stone lantern (needs lamp oil from ${o.need} frogs)` : 'Old stone lantern (needs lamp oil)';
        return o.big ? `Offer lamp oil (${o.have}/${o.need} frogs)` : 'Light it with lamp oil';
      }
      case 'fire': { const n = o.kind === 'hearth' ? 'hearth' : 'fire';
        const mend = !o.pot && repairHere(o);   // a worn tool in your hand at a lit hearth (P3)
        if (mend) return `Mend your ${WG.ITEMS[heldTool().k].toLowerCase()} (${mend.map(([k, c]) => `${c} ${WG.ITEMS[k].toLowerCase()}`).join(', ')})`;
        if (o.pot) return o.pot.left <= 0 ? 'Take the bucket of clean water' : (stats.inv.wood || 0) > 0 ? `Add wood (the bucket is boiling)` : 'Take the bucket back (not boiled yet)';
        return (stats.inv.wood || 0) > 0 ? (o.fuel > 0 ? `Add wood to the ${n}` : 'Relight with wood') : `${n[0].toUpperCase() + n.slice(1)} (needs wood)`; }
    }
    if (UI.things[o.type]) return UI.things[o.type].label(o);   // a region's own (C3 ...)
  }
  const has = tool => stats.tools.includes(tool) || (stats.inv[tool] || 0) > 0;   // (P3: tools can be items in the bag)
  // The tool in your hand for a job ('axe', 'pick', 'shovel'), with the tools flag (P3); before
  // that, owning one was enough.
  const toolsOn = () => WG.feature('tools') && slotsOn();
  const heldTool = () => { const s = toolsOn() && selSlot >= 0 ? stats.slots[selSlot] : null; return s && s.d ? s : null; };
  const toolInHand = job => {
    if (!toolsOn()) return ({ axe: ['axe'], pick: ['ironpick', 'pickaxe'], shovel: ['shovel'] }[job] || []).find(has) || null;
    const s = heldTool(); return s && WG.itemInfo(s.k).tool === job ? s.k : null;
  };
  // What mending the tool in your hand at this fire would cost, or null (P3: a lit hearth, a worn tool)
  function repairHere(f) {
    const s = heldTool();
    if (!s || !f || f.kind !== 'hearth' || !(f.fuel > 0) || s.d >= WG.itemInfo(s.k).uses) return null;
    const r = WG.recipeById(s.k);
    return Object.entries(r ? r.cost : {}).map(([k, n]) => [k, Math.max(1, Math.ceil(n * RULES.TOOLS.REPAIR))]);
  }
  // Which swing a hit gets: chopping (axe, swept sideways) for trees and palms with
  // no coconuts left, mining (pickaxe, brought down) for rocks and ore.
  const swingKindFor = o => !o ? null
    : (o.type === 'tree' || (o.type === 'palm' && !(o.state && o.state.coconuts > 0))) ? 'chop'
    : (o.type === 'rock' || o.type === 'ore') ? 'mine' : UI.things[o.type] ? UI.things[o.type].swing || null : null;
  function targetKey(o) {
    if (o.type === 'spring' || o.type === 'sea') return o.type;
    return ({ fire: 'f', drop: 'd', lantern: 'l', wash: 'w', bug: 'b' }[o.type] || 'o') + o.id;
  }
  // What E does with the bucket in your hand here, or null to act normally.
  function bucketAction() {
    const b = heldBucket();
    if (!b) return null;
    // with a bucket in hand, a fire in reach (and the sea you're standing in) win over trees and rocks
    let fire = null, fd = 1e9;
    fires.forEach(f => { const d = Math.hypot(f.x - px, f.z - pz) - f.r; if (d < RULES.REACH && d < fd) { fd = d; fire = f; } });
    if (b.water === 'clean') return { action: 'drink', label: `Hold to drink clean water (${b.drinks} left)` };   // a full clean bucket: holding E drinks (255-inventory.js)
    if (fire && fire.pot) return { fireAct: fire, label: label(fire) };   // take it / feed it
    if (b.water === 'none' && !myCave && heightAt(px, pz) < .25) return { action: 'fill', label: `Fill the ${bucketName(b).toLowerCase()} with seawater` };
    if (b.water === 'sea' && fire) return { action: 'place', fire: fire.id, label: `Set the bucket on the fire to boil (${RULES.BUCKET[b.mat].boil} s)` };
    if (!target) return { hint: b.water === 'sea' ? 'Seawater: take it to a fire and press E to boil it.' : 'Wade into the sea to fill the bucket.' };
    return null;
  }
  function act() {
    if (UI.fishing && UI.fishing.act()) return;   // a rod in hand, or a friend's line to help with (P7)
    const ba = state === 'play' && cooldown <= 0 && net && knockT <= 0 ? bucketAction() : null;
    if (ba) {
      cooldown = .45;
      if (ba.hint) { toast(ba.hint); return; }
      if (ba.action === 'drink') return;   // drinking is a hold, like eating (255-inventory.js)
      startSwing(hero);
      if (ba.fireAct) { net.send({ t: 'act', target: 'f' + ba.fireAct.id }); return; }
      net.send({ t: 'bucket', id: heldBucket().id, action: ba.action, fire: ba.fire });
      return;
    }
    if (state !== 'play' || cooldown > 0 || !target || !net || knockT > 0) return;
    cooldown = .45;
    if (target.type === 'board') { togglePanel('board'); return; }
    if (target.type === 'carving') { readCarving(target); return; }
    if (target.type === 'lantern' && UI.lanternTravel && UI.lanternTravel.open(target)) return;   // somewhere to travel to (W10)
    if (['palm', 'tree', 'rock', 'fire', 'ore', 'dig', 'lantern'].includes(target.type) || (UI.things[target.type] && UI.things[target.type].swing !== undefined)) startSwing(hero, swingKindFor(target));
    net.send({ t: 'act', target: targetKey(target) });
  }
  // Build a recipe: tools are made on the spot, fires are placed in front of you.
  function build(id) {
    if (state !== 'play' || !net) return;
    const r = WG.recipeById(id);
    if (!r) return;
    if (r.kind !== 'fire') { net.send({ t: 'build', recipe: id }); return; }   // made in your hands, not placed
    const fx = px + Math.sin(face) * 1.6, fz = pz + Math.cos(face) * 1.6;
    if (myCave) { toast('There’s no air to keep a fire going down here.'); return; }
    if (heightAt(fx, fz) < .35) { toast('Too wet here. Build it on dry ground.'); return; }
    net.send({ t: 'build', recipe: id, x: fx, z: fz });
  }
  const canAfford = r => Object.entries(r.cost).every(([k, n]) => (stats.inv[k] || 0) >= n);
  $('btnAct').addEventListener('click', act);
  $('btnBook').addEventListener('click', () => togglePanel('book'));
  $('btnJournal').addEventListener('click', () => togglePanel('journal'));
  $('btnMap').addEventListener('click', () => togglePanel('map'));
  $('btnSettings').addEventListener('click', () => togglePanel('settings'));
  $('btnHood').addEventListener('click', () => toggleHood());
  $('btnDrop').addEventListener('click', () => dropHeld(false));
  // phones: hold the Jump button to charge
  $('btnJump').addEventListener('pointerdown', e => { e.preventDefault(); jumpBtnHeld = true; startCharge(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('btnJump').addEventListener(ev, () => { jumpBtnHeld = false; releaseJump(); }));
  $('btnRun').addEventListener('click', () => { runToggle = !runToggle; $('btnRun').setAttribute('aria-pressed', String(runToggle)); });

