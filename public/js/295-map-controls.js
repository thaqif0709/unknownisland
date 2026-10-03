  // ================= Map controls (task W7) =================
  // Drag the full map to pan, scroll or pinch to zoom, or use the buttons: zoom in and out,
  // "Me" to centre on you, "All" to see everything the map covers.
  const mapCanvas = $('mapCanvas');
  function zoomMap(factor, fx = .5, fy = .5) {   // fx, fy: the point to zoom around, 0..1 across the map
    const v = fullMapView(), half = Math.max(MAP_MIN_HALF, Math.min(mapMaxHalf(), v.half * factor));
    v.cx += (fx - .5) * 2 * (v.half - half); v.cz += (fy - .5) * 2 * (v.half - half);
    v.half = half;
    renderMap();
  }
  const centreOnMe = () => { if (!inGame()) return; const v = fullMapView(); v.cx = px; v.cz = pz; renderMap(); };
  function showAll() { Object.assign(fullMapView(), { cx: MAP_CX, cz: MAP_CZ, half: Math.min(mapMaxHalf(), MAP_HALF) }); renderMap(); }
  $('mapZoomIn').addEventListener('click', () => zoomMap(1 / 1.6));
  $('mapZoomOut').addEventListener('click', () => zoomMap(1.6));
  $('mapMe').addEventListener('click', centreOnMe);
  $('mapAll').addEventListener('click', showAll);
  mapCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = mapCanvas.getBoundingClientRect();
    zoomMap(e.deltaY > 0 ? 1.25 : 1 / 1.25, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  // One finger or the mouse drags; two fingers pinch.
  const mapPtrs = new Map();
  let pinchDist = 0;
  mapCanvas.addEventListener('pointerdown', e => {
    mapCanvas.setPointerCapture(e.pointerId);
    mapPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mapCanvas.classList.add('dragging');
    if (mapPtrs.size === 2) { const [a, b] = [...mapPtrs.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  mapCanvas.addEventListener('pointermove', e => {
    const prev = mapPtrs.get(e.pointerId);
    if (!prev) return;
    const r = mapCanvas.getBoundingClientRect(), v = fullMapView(), mpp = v.half * 2 / r.width;
    if (mapPtrs.size === 1) {
      v.cx -= (e.clientX - prev.x) * mpp; v.cz -= (e.clientY - prev.y) * mpp;
      mapPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      renderMap();
    } else {
      mapPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...mapPtrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) zoomMap(pinchDist / d, ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height);
      pinchDist = d;
    }
  });
  const endMapPtr = e => { mapPtrs.delete(e.pointerId); if (!mapPtrs.size) mapCanvas.classList.remove('dragging'); pinchDist = 0; };
  mapCanvas.addEventListener('pointerup', endMapPtr);
  // Admins (the server says so in its welcome): double-click (or double-tap) the map to go straight there.
  let isAdmin = false, lastJump = 0, lastTap = null;
  UI.net.on('welcome', m => { isAdmin = !!m.admin; });
  function mapJump(clientX, clientY) {
    if (!isAdmin || !inGame() || performance.now() - lastJump < 600) return;
    lastJump = performance.now();
    const r = mapCanvas.getBoundingClientRect(), v = fullMapView();
    const x = v.cx + ((clientX - r.left) / r.width - .5) * 2 * v.half, z = v.cz + ((clientY - r.top) / r.height - .5) * 2 * v.half;
    if (net && net.open) { net.send({ t: 'mapjump', x, z }); closePanels(); }
  }
  mapCanvas.addEventListener('dblclick', e => mapJump(e.clientX, e.clientY));
  mapCanvas.addEventListener('pointerup', e => {   // (a double-tap, where a touch screen sends no dblclick)
    if (e.pointerType !== 'touch') return;
    const now = performance.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) { lastTap = null; mapJump(e.clientX, e.clientY); }
    else lastTap = { t: now, x: e.clientX, y: e.clientY };
  });
  mapCanvas.addEventListener('pointercancel', endMapPtr);

