  // ================= Map =================
  // A top-down chart of the island, inked in flat biome colours once and cached;
  // markers for springs, lanterns, carving stones, the board, fires and players
  // are redrawn on top of a scaled copy of that cache for both the full panel
  // (opened with M) and the always-on minimap in the top-right corner.
  const MAP_PX = 480, MINI_PX = 190, MINI_DOT = .68, MAP_HALF = WG.ISL * 1.15;
  const BIOME_COL = { sea: '#4A6F91', beach: '#D8C9A0', meadow: '#8FAE72', forest: '#5C7A4B', highland: '#9C8A6A', peak: '#D9D3C4', spring: '#7FC9D6' };
  let mapBase = null, mapTimer = 0;
  function buildMapBase() {
    const c = document.createElement('canvas'); c.width = c.height = MAP_PX;
    const g = c.getContext('2d'), STEP = 4, n = MAP_PX / STEP;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (i + .5) / n * MAP_HALF * 2 - MAP_HALF, z = (j + .5) / n * MAP_HALF * 2 - MAP_HALF;
      const h = WG.heightAt(x, z);
      g.fillStyle = BIOME_COL[WG.biomeAt(x, z, h)] || BIOME_COL.sea;
      g.fillRect(i * STEP, j * STEP, STEP, STEP);
    }
    mapBase = c;
  }
  const mapCoord = (v, size) => (v + MAP_HALF) / (MAP_HALF * 2) * size;
  // Marker shapes, shared by the map and its legend so the two always match.
  const MARK = {
    spring: { name: 'Spring (fresh water)', col: '#4FA9C9' }, lanternLit: { name: 'Lantern, lit', col: '#F2B33D' },
    lantern: { name: 'Lantern, cold', col: '#8A8171' }, carving: { name: 'Carving stone', col: '#7A5E8A' },
    board: { name: 'Driftwood board', col: '#A07A4A' }, fire: { name: 'Fire, burning', col: '#E2742C' },
    fireOut: { name: 'Fire, gone out', col: '#6E6862' }, sack: { name: 'Dropped sack', col: '#FFF6DC' },
  };
  // Each marker is a small pictogram (not just a coloured blob in a different
  // silhouette): a lantern has a bronze cage with a glowing dot, a fire has
  // crossed logs under the flame, a board shows plank seams, a carving stone
  // has a scratched rune. `fill` carries the part that changes with state
  // (lit/unlit, burning/out); everything else uses a fixed thematic colour.
  function markerShape(g, kind, cx, cy, s, fill) {
    g.save(); g.translate(cx, cy); g.scale(s, s); g.lineJoin = 'round';
    const shape = (draw, col, lw = 1.4) => { g.beginPath(); draw(); g.fillStyle = col; g.fill(); g.lineWidth = lw; g.strokeStyle = '#2B211F'; g.stroke(); };
    const stroke = (draw, col, lw = 1) => { g.beginPath(); draw(); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.stroke(); };
    if (kind === 'spring') {
      shape(() => { g.moveTo(0, -6); g.bezierCurveTo(4, -1, 5, 2, 0, 5); g.bezierCurveTo(-5, 2, -4, -1, 0, -6); }, fill || MARK.spring.col);   // droplet
    } else if (kind === 'lantern' || kind === 'lanternLit') {
      shape(() => g.rect(-2.6, 4, 5.2, 1.6), '#5E4632');    // stepped base
      shape(() => g.rect(-3.2, -1.6, 6.4, 5.4), '#8C6B4A');   // lamp box
      shape(() => { g.moveTo(-5, -1.6); g.lineTo(5, -1.6); g.lineTo(0, -6.5); g.closePath(); }, '#6B4A35');   // wide roof
      shape(() => g.arc(0, 1, 2, 0, Math.PI * 2), fill || MARK[kind].col, 1);   // the light itself
    } else if (kind === 'carving') {
      shape(() => { g.moveTo(-3.5, 5); g.lineTo(-3.5, -2); g.arc(0, -2, 3.5, Math.PI, 0); g.lineTo(3.5, 5); g.closePath(); }, fill || MARK.carving.col);
      stroke(() => { g.moveTo(-1.3, .2); g.lineTo(1.3, 2.6); g.moveTo(1.3, .2); g.lineTo(-1.3, 2.6); }, 'rgba(255,251,240,.6)', .9);   // a scratched rune
    } else if (kind === 'board') {
      shape(() => g.rect(-4.5, -3.5, 9, 7), fill || MARK.board.col);
      stroke(() => { g.moveTo(-4.5, -1.2); g.lineTo(4.5, -1.2); }, 'rgba(43,33,31,.5)', .9);   // plank seams
      stroke(() => { g.moveTo(-4.5, 1.2); g.lineTo(4.5, 1.2); }, 'rgba(43,33,31,.5)', .9);
    } else if (kind === 'fire' || kind === 'fireOut') {
      stroke(() => { g.moveTo(-4, 5); g.lineTo(3, 1.5); }, '#6B4A35', 1.6);   // crossed logs
      stroke(() => { g.moveTo(4, 5); g.lineTo(-3, 1.5); }, '#6B4A35', 1.6);
      shape(() => { g.moveTo(0, -6); g.quadraticCurveTo(5, 0, 3.5, 4); g.lineTo(-3.5, 4); g.quadraticCurveTo(-5, 0, 0, -6); }, fill || MARK[kind].col);
    } else if (kind === 'sack') {
      shape(() => { g.moveTo(-3.4, -.8); g.quadraticCurveTo(-4.2, 4.6, 0, 5); g.quadraticCurveTo(4.2, 4.6, 3.4, -.8); g.quadraticCurveTo(1.7, -2.4, 0, -2.4); g.quadraticCurveTo(-1.7, -2.4, -3.4, -.8); }, fill || MARK.sack.col);
      stroke(() => { g.moveTo(-1.7, -2.4); g.lineTo(0, -5); g.lineTo(1.7, -2.4); }, '#2B211F', 1.3);   // drawstring tie
    } else shape(() => g.arc(0, 0, 4, 0, Math.PI * 2), fill || (MARK[kind] && MARK[kind].col) || '#8A8171');
    g.restore();
  }
  // Players on the map use a brighter version of their cloak colour so they pop.
  const mapCol = id => { const c = new THREE.Color(colorFor(id)), h = {}; c.getHSL(h); c.setHSL(h.h, Math.max(.6, h.s * 1.9), .56); return '#' + c.getHexString(); };
  function drawMapMarkers(g, size, dotScale, full) {
    const at = (x, z) => [mapCoord(x, size), mapCoord(z, size)];
    const mark = (kind, x, z, k = 1) => { const [cx, cy] = at(x, z); markerShape(g, kind, cx, cy, dotScale * k); };
    WG.SPRINGS.forEach(sp => mark('spring', sp.x, sp.z));
    if (board) mark('board', board.x, board.z);
    carvings.forEach(c => mark('carving', c.x, c.z));
    lanterns.forEach(l => mark(l.lit ? 'lanternLit' : 'lantern', l.x, l.z, l.big ? 1.35 : 1));
    fires.forEach(f => mark(f.fuel > 0 ? 'fire' : 'fireOut', f.x, f.z));
    drops.forEach(d => mark('sack', d.x, d.z, .9));
    // players: their colour, and (on the big map) their name
    const label = (text, cx, cy, col) => {
      g.font = `600 ${Math.round(12 * Math.max(.8, dotScale))}px Fredoka, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#FFFBF0'; g.strokeText(text, cx + 12 * dotScale, cy); g.fillStyle = '#2B211F'; g.fillText(text, cx + 12 * dotScale, cy);
    };
    remotes.forEach((r, id) => {
      if (r.dead) return;
      const s2 = r.remote.sample(), [cx, cy] = at(s2.x, s2.z), col = mapCol(id);
      g.beginPath(); g.arc(cx, cy, 5.2 * dotScale, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#2B211F'; g.stroke();
      if (full) label(r.name, cx, cy, col);
    });
    if (inGame()) {
      const [cx, cy] = at(px, pz), col = mapCol(me.id);
      g.save(); g.translate(cx, cy); g.rotate(Math.PI - face); g.scale(dotScale, dotScale);
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = 1.8; g.strokeStyle = '#2B211F'; g.stroke();
      g.restore();
      if (full) label('You', cx + 2, cy, col);
    }
  }
  // Legend icons are drawn with the same code as the map.
  function iconFor(kind, fill) {
    const c = document.createElement('canvas'); c.width = c.height = 26;
    const g = c.getContext('2d');
    if (kind === 'you') { g.translate(13, 13); g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.stroke(); }
    else if (kind === 'player') { g.beginPath(); g.arc(13, 13, 10, 0, 7); g.fillStyle = '#FFFBF0'; g.fill(); g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.arc(13, 13, 6.5, 0, 7); g.fillStyle = fill; g.fill(); g.stroke(); }
    else if (kind === 'land') { g.fillStyle = fill; g.fillRect(3, 3, 20, 20); g.lineWidth = 1.5; g.strokeRect(3, 3, 20, 20); }
    else markerShape(g, kind, 13, 13, 1.9);
    return c.toDataURL();
  }
  function renderMapLegend() {
    const li = (src, text) => `<li><img src="${src}" alt="">${esc(text)}</li>`;
    const people = [li(iconFor('you', mapCol(me.id)), 'You')].concat([...remotes].map(([id, r]) => li(iconFor('player', mapCol(id)), r.name)));
    const places = Object.keys(MARK).map(k => li(iconFor(k), MARK[k].name));
    const land = [['beach', 'Beach'], ['meadow', 'Meadow'], ['forest', 'Forest'], ['highland', 'Hills'], ['peak', 'Peak'], ['spring', 'Spring pool'], ['sea', 'Sea']]
      .map(([k, n]) => li(iconFor('land', BIOME_COL[k]), n));
    $('mapLegend').innerHTML = `<h4>On the island now</h4><ul>${people.join('')}</ul><h4>Places</h4><ul>${places.join('')}</ul><h4>Land</h4><ul>${land.join('')}</ul>`;
  }
  function drawMap(canvas, size, dotScale) {
    if (!mapBase) buildMapBase();
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, size, size);
    g.drawImage(mapBase, 0, 0, MAP_PX, MAP_PX, 0, 0, size, size);
    drawMapMarkers(g, size, dotScale, size === MAP_PX);
  }
  const renderMap = () => { drawMap($('mapCanvas'), MAP_PX, 1); renderMapLegend(); };
  const renderMinimap = () => drawMap($('minimapCanvas'), MINI_PX, MINI_DOT);
  $('minimap').addEventListener('click', () => togglePanel('map'));

