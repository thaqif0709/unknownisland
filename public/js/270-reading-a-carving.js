  // ================= Reading a carving =================
  let reading = null;
  function readCarving(c) {
    reading = c;
    togglePanel('carvingPanel');
    if (isNight(t)) {   // at night you can hear it
      Sound.init(); Sound.breath();
      $('carveEar').textContent = 'You press your ear to the stone. Something far beneath it is breathing, slow and deep.';
    } else $('carveEar').textContent = '';
  }
  function renderCarving() {
    const c = reading && carvings.get(reading.id);
    if (!c) return;
    $('carveTitle').textContent = `The ${c.key} stone`;
    $('carveText').textContent = c.text;
    $('carveText').className = 'carved ' + (c.stateName || '');
    const [have, need] = c.tally || [0, 0];
    $('carveTally').textContent = c.tally && need > 1 ? `Marks scratched beneath: ${have} of ${need}.` : '';
    $('carveNote').textContent = c.stateName === 'active' ? 'Nobody knows what happens if it is ignored. It changes at dawn.'
      : c.stateName === 'done' ? 'The carving is fresh. Something was given back.' : c.stateName === 'failed' ? 'The words look angry, somehow.' : 'Old words, worn soft.';
    const b = $('carveOffer'), n = c.offer ? (stats.inv[c.offer] || 0) : 0;
    b.hidden = !(c.offer && c.stateName === 'active');
    b.disabled = n <= 0;
    b.textContent = n > 0 ? `Leave ${Math.min(n, need - have)} ${WG.ITEMS[c.offer].toLowerCase()} at its foot` : `You have no ${c.offer ? WG.ITEMS[c.offer].toLowerCase() : ''}`;
  }
  $('carveOffer').addEventListener('click', () => { if (reading && net) { net.send({ t: 'act', target: 'c' + reading.id }); if (hero) hero.swingT = .35; } });

  let stampT = null;
  function stamp(msg) { const el = $('stamp'); el.textContent = msg; el.classList.add('on'); clearTimeout(stampT); stampT = setTimeout(() => el.classList.remove('on'), 3200); }

