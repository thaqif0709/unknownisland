  // ================= The bag (P2, flag slots) =================
  // I opens the bag: the 8 hotbar slots and the 30 bag slots, as the server keeps them
  // (stats.slots: 0-7 the hotbar, 8-37 the bag). Drag a stack onto another slot to move,
  // merge or swap it; drag with the right button to take half; Shift-click sends it across
  // (bag <-> hotbar); drag it off the sheet to drop it in a sack at your feet. Without a mouse,
  // tap a stack, then tap where it goes (the buttons under the bag halve, send across, eat or
  // drop what you tapped).
  // Every move is a 'move' message; the server checks it and sends the slots back, so nothing
  // here changes what you carry by itself.
  // Holding E (or the Act button) for RULES.SLOTS.EAT_TIME with food in hand eats one ('eat'),
  // and with a bucket of clean water drinks from it (below).
  const BAG0 = 8, BAGN = 38;
  const bagEl = document.createElement('div');
  bagEl.className = 'panel gone bag'; bagEl.id = 'inventory';
  bagEl.setAttribute('role', 'dialog'); bagEl.setAttribute('aria-modal', 'true'); bagEl.setAttribute('aria-labelledby', 'bagTitle');
  bagEl.innerHTML = `<div class="sheet"><header><h2 id="bagTitle">Bag</h2><button type="button" class="x" data-close aria-label="Close">&times;</button></header>
    <div class="bagGrid" id="bagGrid" aria-label="Bag"></div>
    <h3 class="bagLabel">Hotbar <span>(keys 1-8: what's in your hand)</span></h3>
    <div class="bagGrid hot" id="bagBar" aria-label="Hotbar"></div>
    <div class="bagActs" id="bagActs"><span id="bagPicked"></span><button type="button" id="bagHalf"></button><button type="button" id="bagAcross"></button><button type="button" id="bagEat">Eat one</button><button type="button" id="bagDrop">Drop</button></div>
    <p class="note bagHint" id="bagHint"></p></div>`;
  document.body.appendChild(bagEl);
  const bagGrid = $('bagGrid'), bagBar = $('bagBar');
  let pick = null;       // tap-to-move: { from, count } once a stack is tapped
  let drag = null;       // pointer down on a slot: { from, count, x, y, id, moved, ghost }
  let bagKey = '', stopClick = false;

  const bagSlot = i => (stats.slots && stats.slots[i]) || null;
  const bagBucket = s => s && s.b != null ? (stats.buckets || []).find(b => b.id === s.b) : null;
  const bagName = s => (!s ? '' : s.b != null ? (bagBucket(s) ? bucketName(bagBucket(s)) : 'Bucket') : WG.ITEMS[s.k]);
  const bagIcon = s => (s.b != null ? (bagBucket(s) ? itemIcon(bucketLook(bagBucket(s))) : '') : itemIcon(s.k));
  const isFood = s => !!s && s.k && WG.itemInfo(s.k).kind === 'food';
  function slotHtml(i) {
    const s = bagSlot(i), cls = (pick && pick.from === i ? ' picked' : '') + (i === selSlot ? ' sel' : ''), num = i < BAG0 ? `<i>${i + 1}</i>` : '';
    if (!s || (s.b != null && !bagBucket(s))) return `<div class="slot empty${cls}" data-bag="${i}">${num}</div>`;
    const n = s.b != null ? '' : s.d ? wearBar(s) : `<b>${s.n}</b>`, eat = isFood(s) ? ` (hold ${keyLabel(prefs.binds.act)} with it in hand to eat)` : '';   // (a tool, P3: its wear bar)
    return `<div class="slot${cls}" data-bag="${i}" title="${esc(s.b != null ? bagName(s) : slotTitle(s, bagName(s)))}${esc(eat)}">${num}<img src="${bagIcon(s)}" alt="${esc(bagName(s))}" draggable="false">${n}</div>`;
  }
  function renderBag() {
    if (!UI.panels.isOpen('inventory')) return;
    if (pick && !bagSlot(pick.from)) pick = null;
    const key = JSON.stringify([stats.slots, stats.buckets, selSlot, pick]);
    if (key === bagKey) return;
    bagKey = key;
    const idx = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
    bagGrid.innerHTML = idx(BAG0, BAGN).map(slotHtml).join('');
    bagBar.innerHTML = idx(0, BAG0).map(slotHtml).join('');
    const s = pick && bagSlot(pick.from);
    $('bagActs').classList.toggle('on', !!s);
    if (s) {
      $('bagPicked').textContent = `${bagName(s)}${s.n ? ` ×${pick.count}` : ''}:`;
      $('bagAcross').textContent = pick.from < BAG0 ? 'To the bag' : 'To the hotbar';
      $('bagEat').hidden = !isFood(s);
      $('bagHalf').hidden = !(s.n > 1);
      $('bagHalf').textContent = pick.count < s.n ? 'All of it' : 'Half';
    }
    const touch = matchMedia('(pointer:coarse)').matches;
    $('bagHint').textContent = touch
      ? 'Tap a stack, then tap where it goes: an empty slot, the same thing to add to it, or something else to swap.'
      : 'Drag a stack to move it, add it to the same thing, or swap. Right-drag takes half. Shift-click sends it across. Drag it off the page to drop it.';
  }
  UI.panels.register('inventory', { el: bagEl, onOpen() { pick = null; bagKey = ''; setTimeout(renderBag); }, onClose() { pick = null; endDrag(); } });
  UI.net.on('me', renderBag);
  UI.net.on('welcome', () => {
    $('btnBag').hidden = !WG.feature('slots');   // phones have no I key
    if (slotsOn() && selSlot >= 0 && net) net.send({ t: 'select', slot: selSlot });
  });
  $('btnBag').addEventListener('click', () => { if (slotsOn() && state === 'play') togglePanel('inventory'); });

  const sendMove = (from, to, count) => { if (net) net.send({ t: 'move', from, to, count }); };
  const sendDrop = (slot, count) => { if (net) { net.send({ t: 'dropitem', slot, count }); startSwing(hero, null, .25); } };
  function endDrag() {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null;
  }
  // after a drag the browser also sends a click: don't let the backdrop take it as "close"
  bagEl.addEventListener('click', e => { if (stopClick) { stopClick = false; e.stopImmediatePropagation(); } });
  bagEl.addEventListener('dragstart', e => e.preventDefault());   // the browser's own image drag would cancel ours
  bagEl.addEventListener('contextmenu', e => { if (e.target.closest('[data-bag]')) e.preventDefault(); });
  bagEl.addEventListener('pointerdown', e => {
    stopClick = false;
    const el = e.target.closest('[data-bag]');
    if (!el || (e.button !== 0 && e.button !== 2)) return;
    const i = +el.dataset.bag, s = bagSlot(i);
    e.preventDefault();
    if (e.shiftKey && s && e.button === 0) { pick = null; sendMove(i, -1); return; }
    const count = !s ? 0 : s.b != null ? 1 : e.button === 2 ? Math.ceil(s.n / 2) : s.n;
    drag = { from: i, count, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, ghost: null, empty: !s };
  });
  window.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || drag.empty) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
    if (!drag.moved) {
      drag.moved = true; pick = null;
      const s = bagSlot(drag.from);
      if (!s) { endDrag(); return; }
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'slot bagGhost';
      drag.ghost.innerHTML = `<img src="${bagIcon(s)}" alt="">${s.n ? `<b>${drag.count}</b>` : ''}`;
      document.body.appendChild(drag.ghost);
    }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
  });
  window.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    endDrag();
    const over = document.elementFromPoint(e.clientX, e.clientY), el = over && over.closest && over.closest('[data-bag]');
    if (d.moved) {   // a drag: onto a slot, or off the sheet to drop it
      stopClick = true;
      if (el && bagEl.contains(el)) { if (+el.dataset.bag !== d.from) sendMove(d.from, +el.dataset.bag, d.count); }
      else if (!(over && over.closest && over.closest('#inventory .sheet'))) sendDrop(d.from, d.count);
      return;
    }
    // a tap or a click: pick a stack up, or put the one you picked where you tapped
    if (!el) return;
    const i = +el.dataset.bag;
    if (pick) { if (i !== pick.from) sendMove(pick.from, i, pick.count); pick = null; }
    else if (!d.empty) pick = { from: i, count: d.count };
    bagKey = ''; renderBag();
  });
  window.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) endDrag(); });
  $('bagAcross').addEventListener('click', () => { if (pick) sendMove(pick.from, -1); pick = null; bagKey = ''; renderBag(); });
  $('bagHalf').addEventListener('click', () => {   // split a stack without a right button
    const s = pick && bagSlot(pick.from);
    if (s && s.n > 1) pick.count = pick.count < s.n ? s.n : Math.ceil(s.n / 2);
    bagKey = ''; renderBag();
  });
  $('bagDrop').addEventListener('click', () => { if (pick) sendDrop(pick.from, pick.count); pick = null; bagKey = ''; renderBag(); });
  $('bagEat').addEventListener('click', () => { if (pick && net) { bitesSent++; net.send({ t: 'eat', slot: pick.from }); } });   // counted like a held bite (below)

  // ---- eating and drinking: hold E (or Act) with something to eat or drink in hand ----
  // Every consumable works the same way: a ring fills for RULES.SLOTS.EAT_TIME, and when it's
  // full you've had it: the count and the meter change right then (here first, so it never
  // waits on the network; the server's 'me' then confirms or puts it right), and holding on
  // starts the next one. Timed by the clock, not by frames (frame time is capped).
  const eatRing = document.createElement('div');
  eatRing.className = 'eatring hidden'; eatRing.setAttribute('aria-hidden', 'true');
  eatRing.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="19" class="fg" pathLength="100"/></svg>';
  document.body.appendChild(eatRing);
  const eatArc = eatRing.querySelector('.fg');
  let eatFrom = -1, eatWhat = '';
  // What you'd have by holding E now: { key, full, bite }, or null. A bite is what changes:
  // { bucket } (a drink from it) or { slot, k } (one of the food there).
  function consumable() {
    const hb = heldBucket();
    if (hb) {
      if (hb.water !== 'clean' || !(hb.drinks > 0)) return null;
      return { key: 'b' + hb.id, full: stats.thirst >= 99.5, bite: { bucket: hb.id } };
    }
    const slot = selSlot, s = slotsOn() && slot >= 0 ? bagSlot(slot) : null;
    if (!isFood(s)) return null;
    const info = WG.itemInfo(s.k);
    return { key: s.k + slot, full: stats.hunger >= 99.5 && (!info.water || stats.thirst >= 99.5), bite: { slot, k: s.k } };
  }
  // Show a bite on what we have (the server does the same, and its 'me' says how many it has had)
  function applyBite(b) {
    if (b.bucket != null) {
      const hb = (stats.buckets || []).find(x => x.id === b.bucket);
      if (!hb || !(hb.drinks > 0)) return;
      hb.drinks--; if (hb.drinks <= 0) hb.water = 'none';
      stats.thirst = Math.min(100, stats.thirst + RULES.BUCKET.DRINK);
      return;
    }
    const s = bagSlot(b.slot), info = WG.itemInfo(b.k);
    if (!s || s.k !== b.k) return;
    stats.hunger = Math.min(100, stats.hunger + (info.food || 0));
    if (info.water) stats.thirst = Math.min(100, stats.thirst + info.water);
    stats.inv[b.k] = Math.max(0, (stats.inv[b.k] || 0) - 1);
    stats.slots[b.slot] = s.n > 1 ? { ...s, n: s.n - 1 } : null;
  }
  // Bites sent that the server hasn't answered yet: a 'me' it sent before it had them (the
  // regular one each tick) would otherwise undo them on screen for a moment.
  let bitesSent = 0, pending = [];
  UI.net.on('welcome', () => { bitesSent = 0; pending = []; });
  UI.net.on('me', m => {
    pending = pending.filter(b => b.n > (m.bites || 0));
    if (!pending.length) return;
    for (const b of pending) applyBite(b);
    lastInv = ''; renderInventory(); bagKey = ''; renderBag();
  });
  UI.consumable = consumable;   // the E prompt says "Hold E: ..." for it (230-actions.js)
  function eatStart() {
    const c = state === 'play' && !blocksInput() ? consumable() : null;
    if (!c) return;
    if (c.full) { toast(c.key[0] === 'b' ? 'You’re not thirsty.' : 'You’re full.'); return; }
    eatFrom = performance.now(); eatWhat = c.key;
  }
  function eatStop() { eatFrom = -1; eatRing.classList.add('hidden'); }
  window.addEventListener('keydown', e => { if (e.code === prefs.binds.act && !e.repeat) eatStart(); });
  window.addEventListener('keyup', e => { if (e.code === prefs.binds.act) eatStop(); });
  $('btnAct').addEventListener('pointerdown', eatStart);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => $('btnAct').addEventListener(t, eatStop));
  UI.onFrame(() => {
    if (eatFrom < 0) return;
    const c = consumable();
    if (!c || c.key !== eatWhat || c.full || state !== 'play' || knockT > 0 || !net) { eatStop(); return; }
    const now = performance.now(), t = (now - eatFrom) / 1000;
    const f = Math.min(1, t / RULES.SLOTS.EAT_TIME);
    eatRing.classList.toggle('hidden', t < .15);
    eatArc.style.strokeDasharray = `${(f * 100).toFixed(1)} 100`;
    if (f < 1) return;
    // done: have it now, and tell the server
    const b = { ...c.bite, n: ++bitesSent };
    net.send(b.bucket != null ? { t: 'bucket', id: b.bucket, action: 'drink' } : { t: 'eat', slot: b.slot });
    pending.push(b); applyBite(b);
    lastInv = ''; renderInventory(); bagKey = ''; renderBag();
    startSwing(hero, null, .5);
    eatFrom = now;   // keep holding for the next one
  });
