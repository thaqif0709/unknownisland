  // ================= Travelling by lantern light (W10, flag `fasttravel`) =================
  // E at a lit lantern you're standing by opens this panel (when there's anywhere to go): the
  // other lit lanterns you remember (you remember one by standing in its light), how far and
  // which way, and the lamp oil it takes; and "Add lamp oil" as E did before. The server checks
  // everything (server/systems/lanterntravel.js).
  const ltSeen = new Set();
  const ltOn = () => WG.feature('fasttravel');
  const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const ltCost = (a, b) => Math.max(RULES.LANTERN_TRAVEL.MIN_OIL, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / RULES.LANTERN_TRAVEL.PER_OIL));
  // Where you could go from lantern l: [{ l, d, dir, cost }], nearest first.
  function ltWays(from) {
    if (!ltOn() || !from || !from.lit) return [];
    const out = [];
    lanterns.forEach(l => {
      if (l === from || !l.lit || !ltSeen.has(l.id)) return;
      const dx = l.x - from.x, dz = l.z - from.z;
      out.push({ l, d: Math.hypot(dx, dz), dir: DIRS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8], cost: ltCost(from, l) });
    });
    return out.sort((a, b) => a.d - b.d);
  }
  const ltEl = document.createElement('div');
  ltEl.className = 'panel gone mg'; ltEl.id = 'lanterntravel';
  ltEl.setAttribute('role', 'dialog'); ltEl.setAttribute('aria-modal', 'true'); ltEl.setAttribute('aria-labelledby', 'ltTitle');
  ltEl.innerHTML = `<div class="sheet"><header><h2 id="ltTitle">By lantern light</h2><button type="button" class="x" data-close aria-label="Close">&times;</button></header>
    <p class="note" id="ltNote"></p><div class="mgbody" id="ltList"></div></div>`;
  document.body.appendChild(ltEl);
  let ltFrom = null;
  function ltRender() {
    const oil = stats.inv.oil || 0, ways = ltWays(ltFrom);
    $('ltNote').textContent = `Follow the light to another lantern you know. You have ${oil} lamp oil.`;
    const full = ltFrom.fuel >= RULES.LANTERN.MAX_FUEL - 1;
    $('ltList').innerHTML = ways.map(w => `<button type="button" class="mgbtn" data-to="${w.l.id}"${oil < w.cost ? ' disabled' : ''}>`
      + `<b>${w.l.big ? 'The great lantern' : 'A lantern'}</b> · ${Math.round(w.d)} m ${w.dir} · ${w.cost} oil</button>`).join('')
      + `<button type="button" class="mgbtn" data-oil${oil > 0 && !full ? '' : ' disabled'}>${full ? 'This lantern is full' : 'Add lamp oil to this one'}</button>`;
  }
  UI.panels.register('lanterntravel', { el: ltEl, onOpen() { ltRender(); }, onClose() { ltFrom = null; } });
  $('ltList').addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn || btn.disabled || !ltFrom || !net) return;
    if (btn.dataset.to != null) net.send({ t: 'lanterntravel', from: ltFrom.id, to: +btn.dataset.to });
    else net.send({ t: 'act', target: 'l' + ltFrom.id });
    UI.panels.close('lanterntravel');
  });
  // A soft fade as you follow the light.
  const ltFade = document.createElement('div');
  ltFade.style.cssText = 'position:fixed;inset:0;background:#F3E3B5;opacity:0;pointer-events:none;transition:opacity .35s;z-index:6';
  document.body.appendChild(ltFade);
  UI.net.on('lanterntravelled', () => { ltFade.style.opacity = '.85'; setTimeout(() => { ltFade.style.opacity = '0'; }, 380); });
  UI.net.on('welcome', m => { ltSeen.clear(); (m.lanternsSeen || []).forEach(id => ltSeen.add(id)); });
  UI.net.on('lanternsseen', m => { (m.ids || []).forEach(id => ltSeen.add(id)); });
  UI.lanternTravel = {
    ways: ltWays,
    // E on lantern l: open the panel if there's somewhere to go from it (true), else act as before
    open(l) {
      if (!ltWays(l).length) return false;
      ltFrom = l; UI.panels.open('lanterntravel');
      return true;
    },
    seen: () => new Set(ltSeen),
  };
