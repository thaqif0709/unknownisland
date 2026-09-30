  // ================= Chunk streaming =================
  const chunks = new Map();
  // The server may switch on the big world (W4), which changes the ground: rebuild anything
  // built before it said so.
  let builtBig = WG.feature('bigworld');
  UI.net.on('welcome', () => {
    if (WG.feature('bigworld') === builtBig) return;
    builtBig = WG.feature('bigworld');
    for (const c of [...chunks.values()]) unloadChunk(c);
  });
  function loadChunk(cx, cz) {
    const c = { key: ckey(cx, cz), cx, cz, terrain: buildTerrain(cx, cz), crests: buildCrests(cx, cz), decor: null, props: false };
    if (c.terrain) scene.add(c.terrain);
    chunks.set(c.key, c);
  }
  function unloadChunk(c) {
    if (c.terrain) { scene.remove(c.terrain); c.terrain.geometry.dispose(); }
    for (const m of c.crests) { scene.remove(m); crests.delete(m); noInk.delete(m); m.material.dispose(); }
    dropDecor(c); dropProps(c);
    chunks.delete(c.key);
  }
  function dropDecor(c) {
    if (!c.decor) return;
    for (const im of c.decor) { scene.remove(im); noInk.delete(im); im.dispose(); }
    c.decor = null;
  }
  // Called every frame: unload far chunks, then build the nearest missing ones
  // within a small time budget so walking never stutters.
  function updateChunks(x, z, budgetMs = 6) {
    const ccx = Math.floor(x / CH), ccz = Math.floor(z / CH);
    for (const c of chunks.values()) {
      const d = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (d > VIEW + 1) { unloadChunk(c); continue; }
      if (c.props && d > PROP_VIEW + 1) dropProps(c);
      if (c.decor && d > DECOR_VIEW + 1) dropDecor(c);
    }
    const want = [];
    for (let i = -VIEW; i <= VIEW; i++) for (let j = -VIEW; j <= VIEW; j++) {
      if (i * i + j * j > (VIEW + .5) ** 2) continue;
      const c = chunks.get(ckey(ccx + i, ccz + j));
      const d = Math.max(Math.abs(i), Math.abs(j)), r2 = i * i + j * j;
      if (!c) want.push([r2, ccx + i, ccz + j, 'chunk']);
      else if (!c.props && d <= PROP_VIEW) want.push([r2 + .3, ccx + i, ccz + j, 'props']);
      else if (!c.decor && d <= DECOR_VIEW) want.push([r2 + .6, ccx + i, ccz + j, 'decor']);
    }
    want.sort((a, b) => a[0] - b[0]);
    const start = performance.now();
    for (const [, cx, cz, what] of want) {
      const c = chunks.get(ckey(cx, cz));
      if (what === 'chunk') loadChunk(cx, cz); else if (what === 'props') buildProps(c); else c.decor = buildDecor(cx, cz);
      if (performance.now() - start > budgetMs) break;
    }
    return want.length;
  }

  let day = 1, t = .3;
  const TITLE = { x: SPAWN.x, z: SPAWN.z - 40 };   // what the title screen looks at
  // Title-screen backdrop: fetch the island layout (also used when joining).
  const layoutReady = fetch('/api/world').then(r => r.json()).then(list => { setLayout(list); return list; });

