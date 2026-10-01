  // ================= Torches above ground (flag `torchlight`) =================
  // A torch in hand lights the ground round you, everywhere (as it does in caves), and burns
  // down; G with one in hand plants it in front of you; E on a planted torch takes it back.
  // The server decides (server/systems/torches.js); here the planted torches are drawn, and a
  // small pool of flickering lights follows the nearest torches, in hand or planted.
  const tlOn = () => WG.feature('torchlight');
  const planted = new Map();   // id -> { id, type: 'torch', x, z, r, left, mesh, flame, state }
  const plantStickM = soft(0x7A5A45), plantRagM = soft(0x8A6A52);
  function makePlanted(t) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .9, 6), plantStickM); stick.position.y = .45; g.add(stick);
    const rag = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 6), plantRagM); rag.scale.set(1, 1.35, 1); rag.position.y = .92; g.add(rag);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.085, .3, 7), torchFlameM); flame.position.y = 1.12; g.add(flame);
    g.rotation.set((WG.hash2(t.id, 1) - .5) * .25, 0, (WG.hash2(t.id, 2) - .5) * .25);   // stuck in a little crooked
    g.position.set(t.x, groundAt(t.x, t.z), t.z);
    shadows(g); scene.add(g);
    return { g, flame };
  }
  function setPlanted(list) {
    const seen = new Set();
    for (const [id, x, z, left] of list || []) {
      seen.add(id);
      let t = planted.get(id);
      if (!t) { t = { id, type: 'torch', x, z, r: .25, state: {} }; const m = makePlanted(t); t.mesh = m.g; t.flame = m.flame; planted.set(id, t); }
      t.left = left;
    }
    for (const [id, t] of planted) if (!seen.has(id)) { scene.remove(t.mesh); planted.delete(id); }
  }
  UI.net.on('welcome', m => setPlanted(m.torches || []));
  UI.net.on('torches', m => setPlanted(m.list));
  UI.torches = { planted: () => [...planted.values()] };

  // Torchlight: up to three flickering lights on the nearest torches (yours first), brighter at night.
  const tLights = [];
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xFFA84A, 0, 11, 1.5); scene.add(l); tLights.push(l); }
  const tV = new THREE.Vector3();
  UI.onFrame(() => {
    if (!tlOn() || !inGame()) { tLights.forEach(l => { l.intensity = 0; }); return; }
    const now = performance.now() / 1000, dark = Math.max(myCave ? 1 : 0, WG.nightFactor(t) * .9 + .25);
    const srcs = [];
    const mine = torchOf(hero); if (mine) srcs.push(mine);
    const near = [];
    remotes.forEach(r => { const f = torchOf(r.av); if (f) near.push(f); });
    planted.forEach(p => near.push(p.flame));
    near.forEach(f => { f.getWorldPosition(tV); f.userData.d = tV.distanceTo(camera.position); });
    near.sort((a, b) => a.userData.d - b.userData.d).forEach(f => srcs.push(f));
    tLights.forEach((l, i) => {
      const f = srcs[i];
      if (!f) { l.intensity = 0; return; }
      f.getWorldPosition(tV); l.position.copy(tV); l.position.y += .15;
      l.intensity = (1.5 + Math.sin(now * 13 + i * 2) * .18 + Math.sin(now * 7.3 + i) * .12) * dark;
    });
    // every flame flickers, lit or not by a light of its own
    planted.forEach(p => { p.flame.scale.set(1, 1 + Math.sin(now * 17 + p.id) * .2, 1); });
    if (mine) mine.scale.set(1, 1 + Math.sin(now * 17) * .18, 1);
  });
