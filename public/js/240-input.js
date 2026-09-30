  // ================= Input =================
  // Controls are stored by physical key (e.code), so they work on any keyboard layout.
  const ACTIONS = [
    ['forward', 'Walk forward', 'KeyW'], ['back', 'Walk back', 'KeyS'], ['left', 'Walk left', 'KeyA'], ['right', 'Walk right', 'KeyD'],
    ['sprint', 'Sprint (hold)', 'ShiftLeft'], ['act', 'Use / pick up', 'KeyE'], ['build', 'Quick-build campfire', 'KeyF'],
    ['book', 'Recipe book', 'KeyB'], ['journal', 'Journal', 'KeyJ'], ['map', 'Map', 'KeyM'], ['chat', 'Open chat', 'Enter'], ['hood', 'Hood up / down', 'KeyT'], ['drop', 'Drop held item (Shift: all)', 'KeyG'], ['jump', 'Jump (hold to leap higher and forward)', 'Space'], ['cycle', 'Next item slot (Shift: back)', 'KeyQ'], ['sit', 'Sit down / get up', 'KeyV'], ['call', 'Call out to friends', 'KeyC'],
    ['inventory', 'Open the bag', 'KeyI', 'slots'],   // a 4th value: only shown while that flag is on
  ];
  const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
  const PREFS_KEY = 'unknown-island-prefs';
  let prefs = { binds: { ...DEFAULT_BINDS }, sens: 1, invertY: false, quality: 'auto', sounds: true };
  try { const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (saved) prefs = { ...prefs, ...saved, binds: { ...DEFAULT_BINDS, ...saved.binds } }; } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} };
  function keyLabel(code) {
    if (!code) return '—';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const names = { ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt',
      AltRight: 'Right Alt', Space: 'Space', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps Lock', Backquote: '`', Backspace: 'Backspace',
      ArrowUp: '\u2191', ArrowDown: '\u2193', ArrowLeft: '\u2190', ArrowRight: '\u2192' };
    return names[code] || code.replace(/^Numpad/, 'Num ');
  }

  const keys = {};
  const held = a => !!keys[prefs.binds[a]];
  let waitingBind = null;
  const PANELS = ['book', 'settings', 'journal', 'board', 'carvingPanel', 'map'];
  const panelOpen = () => PANELS.some(k => !ui[k].classList.contains('gone')) || Cut.on || chatOpen();
  const panelHooks = {};
  const isShown = which => !!ui[which] && !ui[which].classList.contains('gone');
  UI.panels = {
    // A new panel: el is its element (starts with class "gone"); onOpen runs each time it
    // opens, onClose each time it closes. Any open panel frees the mouse (mouse-look).
    register(name, { el, onOpen, onClose } = {}) { if (!PANELS.includes(name)) PANELS.push(name); ui[name] = el; panelHooks[name] = { onOpen, onClose }; },
    open: which => { if (ui[which] && !isShown(which)) togglePanel(which); },
    toggle: which => togglePanel(which),
    close: which => { if (!which || isShown(which)) closePanels(); },   // one panel is open at a time
    isOpen: which => (which ? isShown(which) : panelOpen()),
  };
  // The map is a glance-at-while-walking overlay, not a modal: unlike the other panels
  // it doesn't freeze movement or block key handling.
  const blocksInput = () => PANELS.some(k => k !== 'map' && !ui[k].classList.contains('gone')) || Cut.on || chatOpen();
  window.addEventListener('keydown', e => {
    if (waitingBind) {
      e.preventDefault();
      if (e.code !== 'Escape') {
        // Taking a key another action uses swaps them.
        const other = Object.keys(prefs.binds).find(a => a !== waitingBind && prefs.binds[a] === e.code);
        if (other) prefs.binds[other] = prefs.binds[waitingBind];
        prefs.binds[waitingBind] = e.code;
        savePrefs();
      }
      waitingBind = null;
      renderBinds();
      return;
    }
    if (state !== 'play' && state !== 'dead') return;
    if (Cut.on) { if (['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); endCutscene(true); } return; }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (performance.now() - lookFreedAt < 300) return;   // this Esc freed the mouse and already opened settings
      if (panelOpen()) closePanels(); else if (state === 'play') togglePanel('settings');
      return;
    }
    if (blocksInput()) {
      if ((e.code === prefs.binds.book && !ui.book.classList.contains('gone')) || (e.code === prefs.binds.journal && !ui.journal.classList.contains('gone'))
        || (e.code === prefs.binds.inventory && isShown('inventory'))) closePanels();
      return;
    }
    if (state !== 'play') return;
    if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
    if (e.code === prefs.binds.chat || e.code === 'NumpadEnter' || e.code === 'Slash') { e.preventDefault(); openChat(e.code === 'Slash' ? '/' : ''); return; }
    keys[e.code] = true;
    if (e.code === prefs.binds.act) act();
    if (e.code === prefs.binds.build) build('campfire');
    if (e.code === prefs.binds.book) togglePanel('book');
    if (e.code === prefs.binds.journal) togglePanel('journal');
    if (e.code === prefs.binds.hood) toggleHood();
    if (e.code === prefs.binds.sit) setSitting(!sitting);
    if (e.code === prefs.binds.call) callOut();
    if (/^Digit[1-8]$/.test(e.code) || /^Numpad[1-8]$/.test(e.code)) selectSlot(+e.code.slice(-1) - 1);
    if (e.code === prefs.binds.drop) dropHeld(e.shiftKey);
    if (e.code === prefs.binds.cycle) cycleSlot(e.shiftKey ? -1 : 1);
    if (e.code === prefs.binds.jump) { e.preventDefault(); startCharge(); }
    if (e.code === prefs.binds.map) togglePanel('map');
    if (e.code === prefs.binds.inventory && slotsOn()) togglePanel('inventory');
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === prefs.binds.jump) releaseJump(); });
  const releaseKeys = () => { for (const k in keys) keys[k] = false; };
  window.addEventListener('blur', releaseKeys);

  let lastInv = '', lastCounts = {};
  // Hotbar: slotKeys[i] is the item in slot i+1. selSlot is the one in your hand (-1: empty hands).
  // With the slot inventory (P2, flag slots) the server keeps the slots (stats.slots: 0-7 the
  // hotbar, 8-37 the bag) and slotKeys just mirrors the first eight; without it, each thing
  // you carry takes the first free slot and keeps it until you run out.
  const slotKeys = Array(8).fill(null);
  const slotsOn = () => WG.feature('slots') && Array.isArray(stats.slots);
  const slotKey = s => (!s ? null : s.b != null ? 'b' + s.b : s.k);
  const slotCountAt = i => (slotsOn() ? (stats.slots[i] && stats.slots[i].n) || 0 : stats.inv[slotKeys[i]] || 0);
  let selSlot = -1, sentHold = null;
  // each bucket has its own slot, keyed "b<id>"
  const bucketOf = k => k && k[0] === 'b' && k !== 'bucket' ? (stats.buckets || []).find(b => 'b' + b.id === k) : null;
  const haveKey = k => bucketOf(k) || (stats.inv[k] || 0) > 0;
  function syncSlots() {
    if (slotsOn()) { for (let i = 0; i < 8; i++) slotKeys[i] = slotKey(stats.slots[i]); return; }
    for (let i = 0; i < 8; i++) if (slotKeys[i] && !haveKey(slotKeys[i])) slotKeys[i] = null;
    const want = [...Object.keys(WG.ITEMS).filter(k => (stats.inv[k] || 0) > 0), ...(stats.buckets || []).map(b => 'b' + b.id)];
    for (const k of want) if (!slotKeys.includes(k)) { const e = slotKeys.indexOf(null); if (e >= 0) slotKeys[e] = k; }
  }
  const heldBucket = () => bucketOf(heldKey());
  const bucketName = b => b.mat === 'iron' ? 'Iron bucket' : 'Wooden bucket';
  const bucketLook = b => `bucket:${b.mat}:${b.water}`;   // what others see in your hand
  const heldKey = () => (selSlot >= 0 && slotKeys[selSlot]) || null;
  function updateHeld() {
    const hb = heldBucket(), k = hb ? bucketLook(hb) : heldKey();
    setHeld(hero, k);
    if (k !== sentHold && net && state === 'play') { sentHold = k; net.send({ t: 'hold', key: k }); }
  }
  function selectSlot(i) {
    if (state !== 'play') return;
    syncSlots();
    selSlot = selSlot === i || !slotKeys[i] ? -1 : i;   // same number again, or an empty slot: empty hands
    if (slotsOn() && net) net.send({ t: 'select', slot: selSlot });
    lastInv = ''; renderInventory();
    const k = heldKey(), hb = heldBucket();
    if (hb) toast(`${bucketName(hb)} in hand. ${hb.water === 'none' ? 'Wade into the sea and press E to fill it.' : hb.water === 'sea' ? 'Seawater: press E at a fire to boil it.' : 'Clean water: press E to drink.'}`);
    else if (k && slotsOn() && WG.itemInfo(k).kind === 'food') toast(`${WG.ITEMS[k]} in hand. Hold ${keyLabel(prefs.binds.act)} to eat.`);
    else if (k) toast(`${WG.ITEMS[k]} in hand. ${keyLabel(prefs.binds.drop)} drops one, Shift+${keyLabel(prefs.binds.drop)} drops them all.`);
  }
  // Q: the next slot that has something in it (wrapping round); Shift+Q goes back.
  function cycleSlot(dir) {
    if (state !== 'play') return;
    syncSlots();
    for (let step = 1; step <= 8; step++) {
      const i = (((selSlot < 0 ? (dir > 0 ? -1 : 8) : selSlot) + dir * step) % 8 + 8) % 8;
      if (slotKeys[i]) { selSlot = -1; selectSlot(i); return; }
    }
    toast('Nothing to hold yet.');
  }
  function dropHeld(all) {
    const k = heldKey();
    if (state !== 'play' || !net) return;
    if (!k) { toast('Pick something to hold first (keys 1-8).'); return; }
    const hb = bucketOf(k);
    if (slotsOn()) net.send({ t: 'dropitem', slot: selSlot, count: all ? slotCountAt(selSlot) : 1 });
    else if (hb) net.send({ t: 'dropitem', bucket: hb.id });
    else net.send({ t: 'dropitem', key: k, count: all ? stats.inv[k] : 1 });
    startSwing(hero, null, .25);
  }
  $('invList').addEventListener('click', e => { const sl = e.target.closest('[data-slot]'); if (sl) selectSlot(+sl.dataset.slot); });
  // Small inked icons for carried things and tools, drawn once on a canvas.
  const itemIcons = new Map();
  function itemIcon(key) {
    if (itemIcons.has(key)) return itemIcons.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), INK = '#2B211F';
    g.lineWidth = 3; g.lineJoin = g.lineCap = 'round'; g.strokeStyle = INK;
    const fill = (col, draw) => { g.beginPath(); draw(); g.fillStyle = col; g.fill(); g.stroke(); };
    const handle = () => { g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.moveTo(16, 52); g.lineTo(44, 18); g.stroke(); g.lineWidth = 3.5; g.strokeStyle = '#A57A55'; g.beginPath(); g.moveTo(16, 52); g.lineTo(44, 18); g.stroke(); g.strokeStyle = INK; g.lineWidth = 3; };
    switch (key) {
      case 'wood':   // two logs, cut ends showing rings
        fill('#9A7055', () => g.rect(10, 30, 38, 14)); fill('#B98A62', () => g.ellipse(48, 37, 6, 7, 0, 0, 7));
        fill('#8A6248', () => g.rect(16, 16, 36, 13)); fill('#C9A078', () => g.ellipse(52, 22.5, 6, 6.5, 0, 0, 7));
        g.lineWidth = 1.5; g.beginPath(); g.arc(52, 22.5, 2.5, 0, 7); g.stroke(); g.beginPath(); g.arc(48, 37, 2.5, 0, 7); g.stroke(); break;
      case 'stone':
        fill('#A9A193', () => { g.moveTo(12, 44); g.lineTo(18, 24); g.lineTo(36, 16); g.lineTo(52, 26); g.lineTo(54, 44); g.lineTo(36, 52); g.closePath(); });
        g.lineWidth = 2; g.beginPath(); g.moveTo(22, 30); g.lineTo(34, 26); g.stroke(); break;
      case 'clay': fill('#B8704F', () => g.ellipse(32, 38, 22, 14, 0, 0, 7)); fill('#C98563', () => g.ellipse(28, 33, 10, 5, -.2, 0, 7)); break;
      case 'copper': case 'iron': {
        const base = key === 'copper' ? '#948E83' : '#7E8590', fleck = key === 'copper' ? '#D9803A' : '#C9D2DA';
        fill(base, () => { g.moveTo(10, 42); g.lineTo(20, 18); g.lineTo(40, 14); g.lineTo(54, 30); g.lineTo(46, 50); g.lineTo(22, 52); g.closePath(); });
        g.fillStyle = fleck; [[24, 28, 5], [38, 24, 4], [34, 40, 6], [46, 36, 3]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.lineWidth = 1.5; g.stroke(); });
        break; }
      case 'seeds': [[22, 38, -.5], [36, 26, .3], [40, 44, 1.1]].forEach(([x, y, a]) => fill('#C8A860', () => g.ellipse(x, y, 7, 11, a, 0, 7))); break;
      case 'oil':   // a little stoppered flask
        fill('#E0A33A', () => { g.moveTo(24, 22); g.lineTo(40, 22); g.lineTo(40, 28); g.quadraticCurveTo(52, 34, 50, 46); g.quadraticCurveTo(48, 56, 32, 56); g.quadraticCurveTo(16, 56, 14, 46); g.quadraticCurveTo(12, 34, 24, 28); g.closePath(); });
        fill('#8A6A52', () => g.rect(26, 12, 12, 10)); g.fillStyle = 'rgba(255,245,210,.6)'; g.beginPath(); g.ellipse(24, 42, 3, 6, .3, 0, 7); g.fill(); break;
      case 'torch':   // a stick with a rag head and a flame
        g.lineWidth = 6; g.beginPath(); g.moveTo(20, 56); g.lineTo(38, 24); g.stroke(); g.lineWidth = 3.5; g.strokeStyle = '#A57A55'; g.beginPath(); g.moveTo(20, 56); g.lineTo(38, 24); g.stroke(); g.strokeStyle = INK; g.lineWidth = 3;
        fill('#8A6A52', () => g.ellipse(39, 22, 7, 5, -1, 0, 7));
        fill('#F2A541', () => { g.moveTo(34, 18); g.quadraticCurveTo(34, 6, 44, 2); g.quadraticCurveTo(42, 10, 48, 14); g.quadraticCurveTo(48, 22, 40, 22); g.closePath(); }); break;
      case 'berries':   // a little cluster on a stalk
        g.beginPath(); g.moveTo(32, 10); g.quadraticCurveTo(36, 18, 32, 24); g.stroke();
        fill('#6F9A55', () => g.ellipse(40, 16, 8, 4, -.5, 0, 7));
        [[24, 34], [38, 32], [30, 46], [44, 44], [20, 48]].forEach(([x, y]) => fill('#B8475A', () => g.arc(x, y, 8, 0, 7)));
        g.fillStyle = 'rgba(255,245,235,.7)'; [[22, 31], [36, 29], [28, 43]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }); break;
      case 'coconut':
        fill('#7A5238', () => g.arc(32, 36, 20, 0, 7));
        g.lineWidth = 1.5; [[-.6, 12], [.2, 16], [1, 12]].forEach(([a, r]) => { g.beginPath(); g.arc(32, 36, r, a, a + 1.4); g.stroke(); });
        g.fillStyle = INK; [[26, 30], [36, 29], [31, 38]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }); break;
      default:
        if (key.startsWith('bucket:')) {
          const [, mat, water] = key.split(':'), body = mat === 'iron' ? '#8E96A0' : '#A57A55';
          g.lineWidth = 3;
          if (water !== 'none') fill(water === 'sea' ? '#5E8FA8' : '#9FD3E6', () => g.ellipse(32, 22, 17, 5, 0, 0, 7));
          fill(body, () => { g.moveTo(14, 22); g.lineTo(50, 22); g.lineTo(45, 54); g.lineTo(19, 54); g.closePath(); });
          if (water !== 'none') fill(water === 'sea' ? '#5E8FA8' : '#9FD3E6', () => g.ellipse(32, 22, 17, 5, 0, 0, 7));
          else { g.beginPath(); g.ellipse(32, 22, 17, 5, 0, 0, 7); g.stroke(); }
          g.lineWidth = 2; g.beginPath(); g.moveTo(16, 34); g.lineTo(48, 34); g.moveTo(18, 46); g.lineTo(46, 46); g.stroke();   // hoops or planks
          g.lineWidth = 2.5; g.beginPath(); g.arc(32, 22, 18, Math.PI * 1.05, Math.PI * 1.95); g.stroke();   // handle
          if (water === 'clean') { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(26, 21, 4, 1.4, 0, 0, 7); g.fill(); }
          break;
        }
        fill('#D9C9A6', () => g.arc(32, 32, 18, 0, 7)); break;
      case 'shovel': handle(); fill('#B3AC9F', () => { g.moveTo(10, 50); g.quadraticCurveTo(6, 40, 14, 36); g.lineTo(26, 46); g.quadraticCurveTo(22, 56, 10, 50); }); break;
      case 'pickaxe': case 'ironpick': handle();
        fill(key === 'ironpick' ? '#9AA4B0' : '#A9A193', () => { g.moveTo(24, 10); g.quadraticCurveTo(44, 12, 56, 32); g.quadraticCurveTo(44, 22, 34, 22); g.lineTo(30, 18); g.closePath(); }); break;
      case 'axe': handle(); fill('#D9803A', () => { g.moveTo(36, 12); g.quadraticCurveTo(56, 12, 56, 30); g.lineTo(42, 30); g.lineTo(36, 22); g.closePath(); }); break;
    }
    const url = c.toDataURL(); itemIcons.set(key, url); return url;
  }
  function renderInventory() {
    syncSlots();
    // the thing in your hand ran out (eaten, dropped, used): your hands are empty again
    if (selSlot >= 0 && !slotKeys[selSlot]) { selSlot = -1; if (slotsOn() && net) net.send({ t: 'select', slot: -1 }); }
    const key = JSON.stringify([stats.inv, stats.tools, stats.buckets, stats.slots, prefs.binds.book, slotKeys, selSlot]);
    if (key === lastInv) return;
    lastInv = key;
    // eight slots, numbered 1-8
    $('invList').innerHTML = slotKeys.map((k, i) => {
      const sel = i === selSlot ? ' sel' : '', num = `<i>${i + 1}</i>`;
      if (!k) return `<div class="slot empty${sel}" data-slot="${i}">${num}</div>`;
      const bk = bucketOf(k);
      if (bk) {
        const max = RULES.BUCKET[bk.mat].uses, wear = Math.max(0, bk.uses) / max;
        const what = bk.water === 'clean' ? `clean water, ${bk.drinks} drink${bk.drinks === 1 ? '' : 's'}` : bk.water === 'sea' ? 'seawater (boil it on a fire)' : 'empty';
        return `<div class="slot bucket${sel}" data-slot="${i}" title="${esc(bucketName(bk))}: ${esc(what)}. ${bk.uses} of ${max} boils left.">${num}<img src="${itemIcon(bucketLook(bk))}" alt="${esc(bucketName(bk))}">`
          + (bk.water === 'clean' ? `<b>${bk.drinks}</b>` : '') + `<u style="--w:${Math.round(wear * 100)}%" class="${wear < .25 ? 'low' : ''}"></u></div>`;
      }
      const n = slotCountAt(i), fresh = (lastCounts[k] || 0) < (stats.inv[k] || 0) ? ' new' : '';
      return `<div class="slot${fresh}${sel}" data-slot="${i}" title="${esc(WG.ITEMS[k])}: ${n}">${num}<img src="${itemIcon(k)}" alt="${esc(WG.ITEMS[k])}"><b>${n}</b></div>`;
    }).join('');
    updateHeld();
    lastCounts = { ...stats.inv };
    $('toolList').innerHTML = stats.tools.length ? '<span class="toolsLabel">Tools</span>' + stats.tools.map(t =>
      `<div class="slot tool" title="${esc(WG.recipeById(t).name)}"><img src="${itemIcon(t)}" alt="${esc(WG.recipeById(t).name)}"></div>`).join('') : '';
    document.documentElement.style.setProperty('--invH', ui.inv.offsetHeight + 'px');
    const ready = WG.RECIPES.filter(r => !(r.flag && !WG.feature(r.flag)) && canAfford(r) && !(r.kind === 'tool' && has(r.id)) && !(r.needs && !has(r.needs))).length;
    $('craftHint').textContent = ready
      ? `You can make ${ready} thing${ready > 1 ? 's' : ''}. Press ${keyLabel(prefs.binds.book)} for recipes.`
      : `Press ${keyLabel(prefs.binds.book)} for the recipe book.`;
  }

