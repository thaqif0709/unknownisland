  // ================= The driftwood board =================
  // Grey driftwood planks on two posts, by the first lantern. Notes are paper scraps.
  let board = null;
  const paperM = soft(0xF3EAD6);
  function setBoard(b) {
    if (board) scene.remove(board.mesh);
    board = null; if (!b) return;
    const g = new THREE.Group(), add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    for (const sx of [-.8, .8]) add(new THREE.CylinderGeometry(.07, .09, 2, 7), driftM, sx, 1, 0).rotation.z = sx * .03;
    for (const [y, w, rz] of [[1.55, 2.1, .02], [1.2, 1.9, -.03], [.85, 2, .015]]) add(new THREE.BoxGeometry(w, .32, .08), driftM, 0, y, 0).rotation.z = rz;
    const scraps = new THREE.Group(); g.add(scraps);
    g.position.set(b.x, groundAt(b.x, b.z), b.z); g.rotation.y = -.6;
    shadows(g); scene.add(g);
    board = { type: 'board', x: b.x, z: b.z, r: .9, mesh: g, scraps, state: {} };
    renderScraps();
  }
  function renderScraps() {
    if (!board) return;
    board.scraps.clear();
    notes.slice(-7).forEach((n, i) => {
      const r = mulberry32(n.id * 17 + 3), m = new THREE.Mesh(new THREE.PlaneGeometry(.34, .26), paperM);
      m.position.set(-.75 + (i % 4) * .5 + r() * .08, 1.45 - Math.floor(i / 4) * .45 + r() * .06, .05); m.rotation.z = (r() - .5) * .4;
      board.scraps.add(m);
    });
  }
  let notes = [];

  // Sacks of things dropped when someone was knocked down.
  let drops = new Map();
  // A burlap sack: woven texture, lumpy bottom, gathered neck tied with rope, a
  // frill of cloth on top. A soft white outline and ground glow pulse around it so
  // dropped things are easy to spot (and never mistaken for a mud patch).
  const burlapTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 4) {   // the weave: light and dark threads each way
      g.fillStyle = i % 8 ? 'rgba(90,60,30,.13)' : 'rgba(255,245,220,.35)'; g.fillRect(i, 0, 2, 128);
      g.fillStyle = i % 8 ? 'rgba(90,60,30,.1)' : 'rgba(255,245,220,.3)'; g.fillRect(0, i, 128, 2);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
    return t;
  })();
  const sackM = soft(0xD8BE8C, { map: burlapTex }), tieM = soft(0x7A5A45), sackPatchM = soft(0xA9784E, { map: burlapTex });
  const sackGlowM = new THREE.MeshBasicMaterial({ color: 0xFFFBEA, side: THREE.BackSide, transparent: true, opacity: .85, depthWrite: false });
  const sackGround = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,250,225,.75)'); grd.addColorStop(.5, 'rgba(255,248,220,.3)'); grd.addColorStop(1, 'rgba(255,248,220,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  })();
  let sackGeo = null;
  function sackBodyGeo() {
    if (sackGeo) return sackGeo;
    // profile from the bottom up: flat base, round belly, pulled in at the neck, flared frill
    const prof = [[0, 0], [.2, .01], [.3, .06], [.34, .16], [.33, .28], [.26, .4], [.12, .5], [.08, .54], [.1, .58], [.16, .66]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(prof, 18), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {   // lumps from whatever is inside, and soft vertical folds
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(x, z);
      const lump = 1 + (y < .45 ? Math.sin(a * 3 + 1) * .07 + Math.sin(a * 5) * .04 : 0) + (y > .56 ? Math.sin(a * 9) * .18 : Math.sin(a * 11) * .025);
      pos.setX(i, x * lump); pos.setZ(i, z * lump);
    }
    g.computeVertexNormals();
    return (sackGeo = g);
  }
  function addDrop(d) {
    if (drops.has(d.id)) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(sackBodyGeo(), sackM); body.material.side = THREE.DoubleSide; body.scale.set(1.05, 1, .95); g.add(body);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(.095, .022, 6, 14), tieM); tie.rotation.x = Math.PI / 2; tie.position.y = .52; g.add(tie);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .2, 5), tieM); end.position.set(.1, .44, .06); end.rotation.z = .5; g.add(end);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(.14, .12), sackPatchM); patch.position.set(0, .22, .345); patch.rotation.set(-.08, 0, .15); g.add(patch);
    shadows(g);
    // the glow: a slightly larger back-facing shell (reads as a white outline) and a soft light on the ground
    const halo = new THREE.Mesh(sackBodyGeo(), sackGlowM.clone()); halo.scale.set(1.2, 1.12, 1.12); halo.position.y = -.03; g.add(halo);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), sackGround.clone()); pool.rotation.x = -Math.PI / 2; pool.position.y = .03; g.add(pool);
    noInk.add(halo); noInk.add(pool);
    g.position.set(d.x, groundAt(d.x, d.z), d.z); g.rotation.y = d.id;
    scene.add(g);
    drops.set(d.id, { id: d.id, type: 'drop', x: d.x, z: d.z, r: .4, mesh: g, halo, pool, state: {}, items: d.items || null });
  }
  function removeDrop(id) { const d = drops.get(id); if (d) { scene.remove(d.mesh); noInk.delete(d.halo); noInk.delete(d.pool); drops.delete(id); } }
  function clearDrops() { [...drops.keys()].forEach(removeDrop); }
  function pulseDrops(elapsed) {
    drops.forEach(d => { const k = .5 + .5 * Math.sin(elapsed * 2.4 + d.id); d.halo.material.opacity = .45 + k * .5; d.pool.material.opacity = .55 + k * .45; });
  }
  function clearFires() { fires.forEach(f => { setPot(f, null); scene.remove(f.mesh); }); fires = new Map(); }

