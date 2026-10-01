  // ================= Journal (a tattoo flash sheet) =================
  let journal = { entries: [], firsts: {}, mine: {} };
  const JCATS = [['bugs', 'Bugs'], ['moon', 'Under the full moon'], ['shells', 'Shells'], ['glass', 'Sea glass'], ['tide', 'From the tide'], ['fish', 'On the line'], ['strange', 'Strange tides'], ['relics', 'Left by the stones'], ['stilled', 'Things in the fog']];
  const iconCache = new Map();
  // Each entry gets a small inked design, drawn once.
  function flashIcon(key, known) {
    const id = key + (known ? '' : '?');
    if (iconCache.has(id)) return iconCache.get(id);
    const c = document.createElement('canvas'); c.width = c.height = 120;
    const g = c.getContext('2d'), INK = '#2B211F';
    g.lineWidth = 5; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = INK;
    const fill = (col, draw) => { g.beginPath(); draw(); g.fillStyle = col; g.fill(); g.stroke(); };
    if (!known) {
      g.setLineDash([6, 8]); g.beginPath(); g.arc(60, 60, 34, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.font = 'bold 40px sans-serif'; g.fillStyle = INK; g.textAlign = 'center'; g.fillText('?', 60, 74);
    } else if (key === 'firefly' || key === 'moon_moth') {
      const moth = key === 'moon_moth';
      for (const sx of [-1, 1]) fill(moth ? '#F3EAD6' : '#E9F1F3', () => g.ellipse(60 + sx * 24, 52, 22, moth ? 26 : 12, sx * .5, 0, Math.PI * 2));
      fill(moth ? '#D9CDB4' : '#E8D24A', () => g.ellipse(60, 64, 10, 24, 0, 0, Math.PI * 2));
      if (!moth) { g.fillStyle = 'rgba(232,242,122,.55)'; g.beginPath(); g.arc(60, 80, 16, 0, Math.PI * 2); g.fill(); }
    } else if (key === 'dragonfly') {
      for (const [y, l] of [[46, 34], [58, 30]]) for (const sx of [-1, 1]) fill('#DCE9EC', () => g.ellipse(60 + sx * l * .8, y, l * .8, 8, 0, 0, Math.PI * 2));
      fill('#5F7FA8', () => g.ellipse(60, 64, 7, 34, 0, 0, Math.PI * 2));
    } else if (key === 'cricket' || key === 'bark_beetle') {
      const beetle = key === 'bark_beetle';
      for (const sx of [-1, 1]) for (const y of [48, 62, 76]) { g.beginPath(); g.moveTo(60, y); g.lineTo(60 + sx * 34, y + (beetle ? 8 : 14)); g.stroke(); }
      fill(beetle ? '#4A3A34' : '#7C9A6B', () => g.ellipse(60, 62, beetle ? 20 : 14, beetle ? 28 : 32, 0, 0, Math.PI * 2));
      fill(beetle ? '#4A3A34' : '#7C9A6B', () => g.arc(60, 30, 10, 0, Math.PI * 2));
      if (beetle) { g.beginPath(); g.moveTo(60, 38); g.lineTo(60, 88); g.stroke(); }
    } else if (key === 'carved_mask') {
      fill('#8A6A52', () => g.ellipse(60, 60, 30, 40, 0, 0, Math.PI * 2));
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(60 + sx * 22, 48); g.quadraticCurveTo(60 + sx * 12, 54, 60 + sx * 4, 48); g.stroke(); }
      g.beginPath(); g.moveTo(40, 78); g.quadraticCurveTo(60, 90, 80, 78); g.stroke();
      g.beginPath(); g.moveTo(60, 22); g.lineTo(60, 34); g.moveTo(46, 26); g.lineTo(50, 36); g.moveTo(74, 26); g.lineTo(70, 36); g.stroke();
    } else if (key === 'eye_stone') {
      fill('#B3AC9F', () => g.arc(60, 60, 36, 0, Math.PI * 2));
      fill('#2B211F', () => g.ellipse(60, 60, 18, 12, 0, 0, Math.PI * 2));
      g.fillStyle = '#E9E1CF'; g.beginPath(); g.arc(66, 56, 4, 0, 7); g.fill();
    } else if (key === 'old_tooth') {
      fill('#EBD9C3', () => { g.moveTo(30, 30); g.quadraticCurveTo(80, 20, 92, 96); g.quadraticCurveTo(70, 60, 30, 50); g.closePath(); });
      g.beginPath(); g.moveTo(36, 40); g.quadraticCurveTo(66, 38, 82, 80); g.stroke();
    } else if (key === 'glass_snail') {
      fill('#E7DCC8', () => g.ellipse(56, 82, 40, 10, 0, 0, Math.PI * 2));
      fill('rgba(207,230,234,.8)', () => g.arc(62, 60, 26, 0, Math.PI * 2));
      g.beginPath(); for (let a = 0; a < Math.PI * 3; a += .15) { const r = 20 * (1 - a / (Math.PI * 3.3)); g.lineTo(62 + Math.cos(a) * r, 60 + Math.sin(a) * r); } g.stroke();
      g.fillStyle = '#D9605A'; g.beginPath(); g.arc(62, 60, 5, 0, 7); g.fill();
      g.beginPath(); g.moveTo(22, 78); g.lineTo(14, 62); g.moveTo(28, 78); g.lineTo(26, 60); g.stroke();
    } else if (key === 'rain_beetle') {
      for (const sx of [-1, 1]) for (const y of [50, 64, 78]) { g.beginPath(); g.moveTo(60, y); g.lineTo(60 + sx * 32, y + 10); g.stroke(); }
      fill('#3F5F6A', () => g.ellipse(60, 64, 22, 28, 0, 0, Math.PI * 2)); fill('#3F5F6A', () => g.arc(60, 32, 10, 0, Math.PI * 2));
      g.fillStyle = '#CFE6EA'; [[52, 56], [68, 70], [56, 80]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 3, 5, 0, 0, 7); g.fill(); });
    } else if (key === 'glow_mushroom') {
      for (const [x, y, k] of [[48, 90, 1], [80, 94, .7]]) {
        fill('#E9F1DA', () => g.rect(x - 6 * k, y - 40 * k, 12 * k, 40 * k));
        fill('#9FE3C8', () => { g.moveTo(x - 28 * k, y - 38 * k); g.quadraticCurveTo(x, y - 80 * k, x + 28 * k, y - 38 * k); g.closePath(); });
      }
      g.fillStyle = 'rgba(159,227,200,.4)'; g.beginPath(); g.arc(56, 50, 40, 0, 7); g.fill();
    } else if (key === 'lantern_fish') {
      fill('#3E4A5A', () => g.ellipse(52, 66, 34, 20, 0, 0, Math.PI * 2));
      fill('#3E4A5A', () => { g.moveTo(84, 66); g.lineTo(104, 50); g.lineTo(104, 82); g.closePath(); });
      g.beginPath(); g.moveTo(34, 50); g.quadraticCurveTo(30, 20, 14, 26); g.stroke();
      g.fillStyle = 'rgba(243,210,122,.5)'; g.beginPath(); g.arc(14, 26, 14, 0, 7); g.fill(); fill('#F3D27A', () => g.arc(14, 26, 6, 0, 7));
      g.fillStyle = '#F3EAD6'; g.beginPath(); g.arc(34, 62, 4, 0, 7); g.fill();
    } else if (key === 'spiral_shell' || key === 'conch') {
      fill(key === 'conch' ? '#E3A89A' : '#EBD9C3', () => { g.moveTo(22, 80); g.quadraticCurveTo(60, 10, 98, 50); g.quadraticCurveTo(80, 95, 22, 80); });
      g.beginPath(); for (let a = 0; a < Math.PI * 4; a += .15) { const r = 22 * (1 - a / (Math.PI * 4.4)); g.lineTo(66 + Math.cos(a) * r, 56 + Math.sin(a) * r); } g.stroke();
    } else if (key === 'cowrie') {
      fill('#EBD9C3', () => g.ellipse(60, 60, 26, 36, 0, 0, Math.PI * 2));
      g.beginPath(); g.moveTo(60, 32); g.quadraticCurveTo(52, 60, 60, 88); g.stroke();
      g.fillStyle = '#B08A6A'; [[48, 44], [72, 52], [50, 74], [70, 78]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
    } else if (key === 'scallop') {
      fill('#E3A89A', () => { g.moveTo(60, 94); g.lineTo(20, 46); g.quadraticCurveTo(60, 8, 100, 46); g.closePath(); });
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(60, 92); g.lineTo(60 + i * 16, 30 + Math.abs(i) * 6); g.stroke(); }
    } else if (key === 'sand_dollar') {
      fill('#EBD9C3', () => g.arc(60, 60, 36, 0, Math.PI * 2));
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.ellipse(60 + Math.cos(a) * 16, 60 + Math.sin(a) * 16, 4, 10, a + Math.PI / 2, 0, 7); g.stroke(); }
    } else if (key.startsWith('glass_')) {
      fill({ glass_green: '#7FBF8A', glass_blue: '#6FA3D0', glass_amber: '#E0A33A', glass_violet: '#A88BD8' }[key],
        () => { g.moveTo(30, 58); g.lineTo(52, 26); g.lineTo(90, 40); g.lineTo(96, 76); g.lineTo(58, 94); g.closePath(); });
      g.beginPath(); g.moveTo(52, 26); g.lineTo(62, 60); g.lineTo(96, 76); g.moveTo(62, 60); g.lineTo(58, 94); g.stroke();
    } else if (key === 'pool_minnow') {   // (P7) small and quick, a bright stripe
      fill('#9FB7A8', () => g.ellipse(56, 60, 26, 10, 0, 0, Math.PI * 2));
      fill('#9FB7A8', () => { g.moveTo(80, 60); g.lineTo(96, 48); g.lineTo(96, 72); g.closePath(); });
      g.strokeStyle = '#E8F0E6'; g.beginPath(); g.moveTo(36, 60); g.lineTo(76, 60); g.stroke(); g.strokeStyle = INK;
      g.fillStyle = INK; g.beginPath(); g.arc(40, 57, 2.5, 0, 7); g.fill();
    } else if (key === 'silverfin') {
      fill('#B9C3C6', () => g.ellipse(54, 60, 34, 16, 0, 0, Math.PI * 2));
      fill('#B9C3C6', () => { g.moveTo(86, 60); g.lineTo(106, 44); g.lineTo(106, 76); g.closePath(); });
      g.fillStyle = INK; g.beginPath(); g.arc(34, 56, 3, 0, 7); g.fill();
    } else if (key === 'door_in_sand') {
      fill('#8A6A52', () => g.rect(38, 18, 44, 76)); g.beginPath(); g.moveTo(20, 94); g.lineTo(100, 94); g.stroke();
      g.fillStyle = '#C9A04A'; g.beginPath(); g.arc(74, 58, 4, 0, 7); g.fill();
    } else if (key === 'ringing_bell') {
      fill('#8A6A52', () => g.rect(16, 88, 88, 10));
      fill('#C9A04A', () => { g.moveTo(44, 78); g.quadraticCurveTo(44, 30, 60, 28); g.quadraticCurveTo(76, 30, 76, 78); g.closePath(); });
      for (const sx of [-1, 1]) { g.beginPath(); g.arc(60, 54, 34, sx > 0 ? -.4 : Math.PI - .4 + .8, sx > 0 ? .4 : Math.PI + .4); g.stroke(); }
    } else if (key === 'your_cloak') {
      fill(me ? hex(colorFor(me.id)) : '#8A6A52', () => { g.moveTo(40, 24); g.lineTo(80, 24); g.lineTo(96, 96); g.lineTo(24, 96); g.closePath(); });
      fill('#D9C9A6', () => g.rect(52, 60, 16, 14));
    } else if (key === 'footprints') {
      for (let i = 0; i < 4; i++) { const x = 44 + (i % 2) * 30, y = 96 - i * 24; fill('#6E5646', () => g.ellipse(x, y, 7, 10, 0, 0, 7));
        for (const dx of [-7, 0, 7]) { g.beginPath(); g.arc(x + dx, y - 12, 3, 0, 7); g.fillStyle = '#6E5646'; g.fill(); } }
    } else fill('#D9C9A6', () => g.arc(60, 60, 30, 0, Math.PI * 2));
    const url = c.toDataURL();
    iconCache.set(id, url);
    return url;
  }
  const RARITY = {
    common: { name: 'Common', pips: '\u25c6', tip: 'Easy to find. You will see these most days.' },
    uncommon: { name: 'Uncommon', pips: '\u25c6\u25c6', tip: 'Turns up now and then. Keep an eye out.' },
    rare: { name: 'Rare', pips: '\u25c6\u25c6\u25c6', tip: 'Hard to find: only in the right place, time or weather, or very seldom.' },
  };
  function renderJournal() {
    const found = Object.keys(journal.mine).length;
    $('journalCount').innerHTML = `${found} of ${journal.entries.length} found. How hard to find: `
      + Object.entries(RARITY).map(([k, r]) => `<span class="rar r-${k}">${r.pips} ${r.name}</span>`).join(' ');
    $('journalBody').innerHTML = renderCloak() + JCATS.map(([cat, title]) => {
      const list = journal.entries.filter(e => e.category === cat);
      if (!list.length) return '';
      return `<h3>${esc(title)}</h3><div class="flash">` + list.map(e => {
        const n = journal.mine[e.key] || 0, known = n > 0, first = journal.firsts[e.key];
        return `<figure class="flashcard ${known ? '' : 'unknown'} r-${esc(e.rarity)}">
          <img src="${flashIcon(e.key, known)}" alt="">
          <figcaption><b>${known ? esc(e.name) : '???'}</b>
          <span class="rar r-${esc(e.rarity)}" title="${esc((RARITY[e.rarity] || RARITY.common).tip)}">${(RARITY[e.rarity] || RARITY.common).pips} ${(RARITY[e.rarity] || RARITY.common).name}</span>
          ${e.hint ? `<span class="hint">${esc(e.hint)}</span>` : ''}
          ${known ? `<span class="desc">${esc(e.description)}</span><span class="meta">Found ${n}\u00d7${first ? ` \u00b7 first found by ${esc(first)}` : ''}</span>`
                  : first ? `<span class="meta">Someone has found this</span>` : ''}</figcaption></figure>`;
      }).join('') + '</div>';
    }).join('');
  }
  // Your cloak: stitch patches made from things you've found (up to PATCH_SLOTS).
  function renderCloak() {
    const slots = RULES.PATCH_SLOTS || 3;
    return `<h3>Your cloak <small>(${myPatches.length} of ${slots} patches)</small></h3><div class="patches">` + WG.PATCHES.map(pt => {
      const on = myPatches.includes(pt.key), found = (journal.mine[pt.needs] || 0) > 0;
      const need = journal.entries.find(e => e.key === pt.needs);
      const btn = on ? `<button type="button" class="link" data-patch="${pt.key}" data-on="0">Unpick</button>`
        : found ? `<button type="button" class="main" data-patch="${pt.key}" data-on="1"${myPatches.length >= slots ? ' disabled' : ''}>Stitch on</button>`
        : `<span class="meta">Find a ${esc(need ? need.name.toLowerCase() : pt.needs)} first</span>`;
      return `<div class="patch${on ? ' on' : ''}"><i style="background:${hex(PATCH_COL[pt.key])}"></i><div><b>${esc(found || on ? pt.name : '???')}</b>
        ${found || on ? `<span class="desc">${esc(pt.perk)} <em>${esc(pt.cost)}</em></span>` : ''}</div>${btn}</div>`;
    }).join('') + '</div>';
  }
  $('journalBody').addEventListener('click', e => {
    const b = e.target.closest('[data-patch]');
    if (!b || b.disabled || !net) return;
    net.send({ t: 'patch', key: b.dataset.patch, on: b.dataset.on === '1' });
  });

