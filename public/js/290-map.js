  // ================= Map =================
  // A top-down chart, inked in flat biome colours. A coarse picture of everything the map
  // can show is drawn once and cached; with the big world on, sharper 256 m tiles are drawn
  // on top when zoomed in (a few per frame), and land nobody has walked near yet is covered
  // in blank parchment (charting, W7). Markers go on top. The full map (M) can be panned and
  // zoomed (295-map-controls.js); the minimap follows you. Other parts add markers with
  // UI.mapLayers.push({ draw(g, at, dotScale, full) }).
  const MAP_PX = 480, MINI_PX = 190, MINI_DOT = .68;
  // What the coarse picture covers: the Landing, or the whole world with the big world on.
  let MAP_HALF = WG.ISL * 1.15, MAP_CX = 0, MAP_CZ = 0;
  const bigMap = () => WG.feature('bigworld');
  // The full map's view (the minimap's is worked out each time): centre and half-width, metres.
  const mapView = { cx: 0, cz: 0, half: WG.ISL * 1.15, set: false };
  const MINI_HALF_BIG = 170, MAP_MIN_HALF = 40;
  const mapMaxHalf = () => (bigMap() ? 2700 : MAP_HALF);
  UI.net.on('welcome', m => {
    const big = bigMap(), half = big ? 2600 : WG.ISL * 1.15, cz = big ? -1900 : 0;
    if (half !== MAP_HALF || cz !== MAP_CZ) { MAP_HALF = half; MAP_CZ = cz; }
    mapBase = null;   // redrawn with the Veil as it is now
    tiles.clear(); tileQueue.length = 0; mapView.set = false;
    resetFog(big ? m.seen : null);
  });
  UI.net.on('regions', () => { mapBase = null; tiles.clear(); tileQueue.length = 0; });

  // Sharper tiles for zooming in on the big world: 256 m each, 4 m a pixel.
  const TILE = 256, TILE_PX = 64, TILE_STEP = 2;
  const tiles = new Map(), tileQueue = [];
  function paintLand(g, x, z, px, py, step) {
    const h = WG.heightAt(x, z);
    g.fillStyle = BIOME_COL[WG.biomeAt(x, z, h)] || BIOME_COL.sea;
    g.fillRect(px, py, step, step);
    if (veilBlocks(x, z)) {   // behind the Veil: fogged over and hatched
      g.fillStyle = 'rgba(238,234,226,.62)'; g.fillRect(px, py, step, step);
      if (((px + py) / step) % 3 === 0) { g.strokeStyle = 'rgba(70,60,52,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py + step); g.lineTo(px + step, py); g.stroke(); }
    }
  }
  function renderTile(tx, tz) {
    const c = document.createElement('canvas'); c.width = c.height = TILE_PX;
    const g = c.getContext('2d'), n = TILE_PX / TILE_STEP;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) paintLand(g, tx * TILE + (i + .5) * TILE / n, tz * TILE + (j + .5) * TILE / n, i * TILE_STEP, j * TILE_STEP, TILE_STEP);
    tiles.set(tx + ',' + tz, c);
  }
  function tileFor(tx, tz) {
    const k = tx + ',' + tz, t = tiles.get(k);
    if (t) return t;
    if (!tileQueue.includes(k)) { tileQueue.push(k); if (tileQueue.length > 160) tileQueue.shift(); }
    return null;
  }
  UI.onFrame(() => {   // draw waiting tiles, a few milliseconds' worth per frame, newest first
    const t0 = performance.now();
    while (tileQueue.length && performance.now() - t0 < 5) { const [a, b] = tileQueue.pop().split(',').map(Number); renderTile(a, b); }
  });

  // Charting: one pixel per 32 m chunk, parchment where nobody has been yet. Drawn scaled
  // over the map with smoothing, so explored land has soft edges.
  const SEEN_SPAN = 320, SEEN_OFF = 160, PARCHMENT = [239, 230, 208];
  const fogCanvas = document.createElement('canvas'); fogCanvas.width = fogCanvas.height = SEEN_SPAN;
  const fogG = fogCanvas.getContext('2d');
  let fogOn = false;
  function resetFog(b64) {
    fogOn = !!b64;
    if (!fogOn) return;
    const bits = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)), img = fogG.createImageData(SEEN_SPAN, SEEN_SPAN);
    for (let i = 0; i < SEEN_SPAN; i++) for (let j = 0; j < SEEN_SPAN; j++) {
      const bit = i * SEEN_SPAN + j, cx = i - SEEN_OFF, cz = j - SEEN_OFF;
      const seen = (bits[bit >> 3] >> (bit & 7)) & 1 || Math.hypot((cx + .5) * WG.CHUNK, (cz + .5) * WG.CHUNK) < 330;   // the Landing is always known
      const o = (j * SEEN_SPAN + i) * 4;
      img.data[o] = PARCHMENT[0]; img.data[o + 1] = PARCHMENT[1]; img.data[o + 2] = PARCHMENT[2]; img.data[o + 3] = seen ? 0 : 255;
    }
    fogG.putImageData(img, 0, 0);
  }
  UI.net.on('seen', m => { if (fogOn) for (const [cx, cz] of m.list) fogG.clearRect(cx + SEEN_OFF, cz + SEEN_OFF, 1, 1); });
  const BIOME_COL = { sea: '#4A6F91', beach: '#D8C9A0', meadow: '#8FAE72', forest: '#5C7A4B', highland: '#9C8A6A', peak: '#D9D3C4', spring: '#7FC9D6' };
  let mapBase = null, mapTimer = 0;
  function buildMapBase() {
    const c = document.createElement('canvas'); c.width = c.height = MAP_PX;
    const g = c.getContext('2d'), STEP = 4, n = MAP_PX / STEP;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      paintLand(g, MAP_CX + (i + .5) / n * MAP_HALF * 2 - MAP_HALF, MAP_CZ + (j + .5) / n * MAP_HALF * 2 - MAP_HALF, i * STEP, j * STEP, STEP);
    }
    mapBase = c;
  }
  // Marker shapes, shared by the map and its legend so the two always match.
  const MARK = {
    spring: { name: 'Spring (fresh water)', col: '#4FA9C9' }, lanternLit: { name: 'Lantern, lit', col: '#F2B33D' },
    lantern: { name: 'Lantern, cold', col: '#8A8171' }, carving: { name: 'Carving stone', col: '#7A5E8A' },
    board: { name: 'Driftwood board', col: '#A07A4A' }, fire: { name: 'Fire, burning', col: '#E2742C' },
    fireOut: { name: 'Fire, gone out', col: '#6E6862' }, sack: { name: 'Dropped sack', col: '#FFF6DC' },
    checkpoint: { name: 'Where you wake (your hearth; friends\u2019 fainter)', col: '#C4574F', flag: 'checkpoints' },
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
    } else if (kind === 'checkpoint') {   // a flag on a pole
      stroke(() => { g.moveTo(-3, 6); g.lineTo(-3, -6); }, '#2B211F', 1.6);
      shape(() => { g.moveTo(-3, -6); g.lineTo(5, -3.5); g.lineTo(-3, -.5); g.closePath(); }, fill || MARK.checkpoint.col);
    } else shape(() => g.arc(0, 0, 4, 0, Math.PI * 2), fill || (MARK[kind] && MARK[kind].col) || '#8A8171');
    g.restore();
  }
  // Players on the map use a brighter version of their cloak colour so they pop.
  const mapCol = id => { const c = new THREE.Color(colorFor(id)), h = {}; c.getHSL(h); c.setHSL(h.h, Math.max(.6, h.s * 1.9), .56); return '#' + c.getHexString(); };
  function drawMapMarkers(g, at, dotScale, full) {
    const mark = (kind, x, z, k = 1) => { const [cx, cy] = at(x, z); markerShape(g, kind, cx, cy, dotScale * k); };
    WG.SPRINGS.forEach(sp => mark('spring', sp.x, sp.z));
    if (board) mark('board', board.x, board.z);
    carvings.forEach(c => mark('carving', c.x, c.z));
    lanterns.forEach(l => mark(l.lit ? 'lanternLit' : 'lantern', l.x, l.z, l.big ? 1.35 : 1));
    fires.forEach(f => mark(f.fuel > 0 ? 'fire' : 'fireOut', f.x, f.z));
    drops.forEach(d => mark('sack', d.x, d.z, .9));
    for (const layer of UI.mapLayers) layer.draw(g, at, dotScale, full);   // markers other parts add
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
    const places = Object.keys(MARK).filter(k => !MARK[k].flag || WG.feature(MARK[k].flag)).map(k => li(iconFor(k), MARK[k].name));
    const land = [['beach', 'Beach'], ['meadow', 'Meadow'], ['forest', 'Forest'], ['highland', 'Hills'], ['peak', 'Peak'], ['spring', 'Spring pool'], ['sea', 'Sea']]
      .map(([k, n]) => li(iconFor('land', BIOME_COL[k]), n));
    if (bigMap()) land.push(li(iconFor('land', 'rgb(210,204,196)'), 'Behind the Veil'), li(iconFor('land', `rgb(${PARCHMENT})`), 'Not explored yet'));
    $('mapLegend').innerHTML = `<h4>On the island now</h4><ul>${people.join('')}</ul><h4>Places</h4><ul>${places.join('')}</ul><h4>Land</h4><ul>${land.join('')}</ul>`;
  }
  // Draw the map for a view { cx, cz, half } (metres) onto a square canvas.
  function drawMap(canvas, size, dotScale, view, full) {
    if (!mapBase) buildMapBase();
    const g = canvas.getContext('2d'), mpp = view.half * 2 / size, x0 = view.cx - view.half, z0 = view.cz - view.half;
    g.fillStyle = BIOME_COL.sea; g.fillRect(0, 0, size, size);
    const bpp = MAP_HALF * 2 / MAP_PX;   // metres per pixel of the coarse picture
    g.drawImage(mapBase, (x0 - (MAP_CX - MAP_HALF)) / bpp, (z0 - (MAP_CZ - MAP_HALF)) / bpp, view.half * 2 / bpp, view.half * 2 / bpp, 0, 0, size, size);
    if (bigMap() && mpp < 6) {   // zoomed in: the sharper tiles, as they're ready
      for (let tx = Math.floor(x0 / TILE); tx * TILE < x0 + view.half * 2; tx++) for (let tz = Math.floor(z0 / TILE); tz * TILE < z0 + view.half * 2; tz++) {
        const t = tileFor(tx, tz);
        if (t) g.drawImage(t, (tx * TILE - x0) / mpp, (tz * TILE - z0) / mpp, TILE / mpp + .6, TILE / mpp + .6);
      }
    }
    if (fogOn) {   // land nobody has seen yet
      const cpp = WG.CHUNK;
      g.drawImage(fogCanvas, x0 / cpp + SEEN_OFF, z0 / cpp + SEEN_OFF, view.half * 2 / cpp, view.half * 2 / cpp, 0, 0, size, size);
    }
    drawMapMarkers(g, (x, z) => [(x - x0) / mpp, (z - z0) / mpp], dotScale, full);
  }
  // The full map: where you left it, or around you the first time.
  function fullMapView() {
    if (!bigMap()) { if (!mapView.set) Object.assign(mapView, { cx: MAP_CX, cz: MAP_CZ, half: MAP_HALF, set: true }); }
    else if (!mapView.set) Object.assign(mapView, { cx: inGame() ? px : 0, cz: inGame() ? pz : 0, half: 600, set: true });
    return mapView;
  }
  // The minimap: the whole Landing, or (big world) the land around you.
  const miniView = () => (bigMap() && inGame() ? { cx: px, cz: pz, half: MINI_HALF_BIG } : { cx: MAP_CX, cz: MAP_CZ, half: MAP_HALF });
  const renderMap = () => { drawMap($('mapCanvas'), MAP_PX, 1, fullMapView(), true); renderMapLegend(); };
  const renderMinimap = () => drawMap($('minimapCanvas'), MINI_PX, MINI_DOT, miniView(), false);
  $('minimap').addEventListener('click', () => togglePanel('map'));

