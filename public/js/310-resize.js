  // ================= Resize =================
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const rw = Math.floor(w * PR), rh = Math.floor(h * PR);
    colorRT.setSize(rw, rh); normalRT.setSize(rw, rh);
    inkMat.uniforms.res.value.set(rw, rh);
    inkMat.uniforms.width.value = Math.max(1.5, rh / 420);   // line thickness follows screen size
    camera.aspect = w / h; camera.fov = w / h < .8 ? 68 : 55;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // Graphics quality. Low: normal resolution, no shadows, outlines from depth only
  // (one scene pass instead of two). Auto picks Low on phones and tablets.
  let lowGfx = false;
  function applyQuality() {
    lowGfx = prefs.quality === 'low' || (prefs.quality !== 'high' && coarse);
    PR = lowGfx ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(PR);
    sun.castShadow = !lowGfx;
    inkMat.uniforms.useNormals.value = lowGfx ? 0 : 1;
    resize();
  }
  applyQuality();
  if (/[?&]debug/.test(location.search)) { renderer.info.autoReset = false; window.__dbg = { renderer, scene, camera, chunks, chunkObjs: () => chunkObjs, veil: () => ({ open: [...openRegions], turnAt: veilTurnAt, blocks: (x, z) => veilBlocks(x, z) }), objects: () => objects, stats, mobs,
    pos: () => ({ x: px, z: pz }), lookAt: (x, z) => { yaw = Math.atan2(-(x - px), -(z - pz)); },
    washups: () => washups, bugs: () => bugs, previewJournal: keys => { keys.forEach(k => { journal.mine[k] = 1 + (k.length % 3); journal.firsts[k] = journal.firsts[k] || 'aiman'; }); },
    setEnv: e => setEnv(e), cloudSheet: () => clouds.slice(0, 12).map(c => c.material.map.image.toDataURL()), teleport: (x, z) => { px = x; pz = z; if (net && net.open) net.send({ t: 'pos', x: px, z: pz, face, moving: false, sprint: false, cam: 0 }); }, floorAt: (x, z, y) => floorAt(x, z, y), setHealth: v => { stats.health = v; }, drops: () => drops, hop: () => hop, why: () => ({ state, air: hop.air, knockT, down: stats.down, ex: nrg.exhausted, panel: panelOpen(), h: heightAt(px, pz) }), addFire: f => addFire(f), hero: () => hero, cut: () => Cut, cutJump: T => { Cut.T = T; }, startCut: r => startCutscene(r), carvings: () => carvings, read: id => readCarving(carvings.get(id)),
    recarve: (id, text, st) => { const c = carvings.get(id); setCarvings([{ id, key: c.key, x: c.x, z: c.z, face: c.mesh.rotation.y, text, state: st || 'active', tally: [2, 5] }], id, 'new'); }, face: () => face, gy: () => groundAt(px, pz), board: () => board, openPanel: w => togglePanel(w), patches: l => { myPatches = l; setPatches(hero, l); },
    lanterns: () => lanterns, previewLantern: (id, lit) => { const l = lanterns.get(id); setLantern({ ...l, lit, fuel: 400 }); },
    chips: () => chipMeshes.filter(m => m.visible), target: () => target, cooldown: () => cooldown, swingKindFor: o => swingKindFor(o), cave: () => caveDbg(),
    travel: () => ({ climb: climb && climb.kind, glide, y: hop.y, energy: nrg.energy }), setEnergy: v => { nrg.energy = v; nrg.exhausted = v <= 0; } }; }

