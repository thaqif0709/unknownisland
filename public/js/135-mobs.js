  // ================= Mobs (P5) =================
  // Every creature the server runs (server/mobs/): the Stilled, the test dummy, and later
  // the Crawler and bosses. Each kind draws itself from public/js/mobs/<kind>.js (joined
  // right after this part):
  //   UI.mobs.register('stilled', { make(id) -> Object3D, pose(mob, dt, now) })
  // mob = { id, kind, mesh, state, stateAt, extra, hitAt } is played back from the snapshot
  // ('m': [id, kind, x, z, face, state, extra]). Telegraphs (the warning before an attack)
  // are drawn here as ink shapes on the ground.
  const MOB_KINDS = {};
  UI.mobs = { register(kind, def) { MOB_KINDS[kind] = def; }, all: () => mobs };
  const mobs = new Map();   // id -> mob
  function makeUnknownMob() {   // a kind with no drawing yet: a plain grey peg, so it's at least visible
    const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 1.4, 8), softShared(0x9A948A));
    m.position.y = .7; g.add(m); return g;
  }
  function syncMobs(list) {
    const seen = new Set(), now = performance.now();
    for (const [id, kind, x, z, f, st, extra] of list || []) {
      seen.add(id);
      let m = mobs.get(id);
      if (!m) {
        const def = MOB_KINDS[kind];
        m = { id, kind, remote: new Net.Remote(x, z, f), mesh: def ? def.make(id) : makeUnknownMob(), state: st, stateAt: now, hitAt: 0 };
        if (!m.mesh.parent) scene.add(m.mesh);
        mobs.set(id, m);
      } else m.remote.push(x, z, f, 0, 0);
      if (m.state !== st) { m.state = st; m.stateAt = now; }
      m.extra = extra;
    }
    for (const [id, m] of mobs) if (!seen.has(id)) { scene.remove(m.mesh); mobs.delete(id); }
  }
  function clearMobs() { mobs.forEach(m => scene.remove(m.mesh)); mobs.clear(); clearTelegraphs(); }

  // ---- telegraphs: a ring (or strip, or wedge) inked on the ground that darkens until the blow lands.
  // The shapes are draped over the terrain vertex by vertex, so hills don't swallow half of them.
  const telegraphs = [];
  const tgInk = new THREE.MeshBasicMaterial({ color: 0x2B211F, side: THREE.DoubleSide, depthWrite: false });
  const tgFillMat = () => new THREE.MeshBasicMaterial({ color: 0xC4574F, transparent: true, opacity: .15, side: THREE.DoubleSide, depthWrite: false });
  // A shape built in its own plane (x across, y forward) laid on the ground at (cx, cz), turned by a.
  function drape(geo, cx, cz, a, lift) {
    const pos = geo.attributes.position, ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i), v = pos.getY(i), wx = cx + u * ca + v * sa, wz = cz - u * sa + v * ca;
      pos.setXYZ(i, wx, groundAt(wx, wz) + lift, wz);
    }
    pos.needsUpdate = true; geo.computeBoundingSphere();
    return geo;
  }
  function addTelegraph(m) {
    const g = new THREE.Group(), fill = new THREE.Mesh(undefined, tgFillMat()), a = m.a || 0;
    const put = (geo, mat, lift) => { const mesh = new THREE.Mesh(drape(geo, m.x, m.z, a, lift), mat); mesh.renderOrder = 5; g.add(mesh); return mesh; };
    if (m.shape === 'line') {
      const len = m.len || 4, w = m.w || 1;
      fill.geometry = drape(new THREE.PlaneGeometry(w, len, 2, Math.ceil(len * 2)).translate(0, len / 2, 0), m.x, m.z, a, .1);
      const edge = t => new THREE.PlaneGeometry(t === 'side' ? .09 : w, t === 'side' ? len : .09, 1, t === 'side' ? Math.ceil(len * 2) : 1);
      put(edge('side').translate(-w / 2, len / 2, 0), tgInk, .12); put(edge('side').translate(w / 2, len / 2, 0), tgInk, .12);
      put(edge('end').translate(0, 0, 0), tgInk, .12); put(edge('end').translate(0, len, 0), tgInk, .12);
    } else {
      const r = m.r || 2, cone = m.shape === 'cone', half = cone ? (m.w || .6) : Math.PI;
      const start = cone ? Math.PI / 2 - half : 0, arc = cone ? half * 2 : Math.PI * 2;   // a wedge centred on +y: forward
      fill.geometry = drape(new THREE.RingGeometry(.01, r, 48, 6, start, arc), m.x, m.z, a, .1);
      put(new THREE.RingGeometry(r - .09, r, 48, 1, start, arc), tgInk, .12);
    }
    fill.renderOrder = 5;
    g.add(fill);
    scene.add(g);
    telegraphs.push({ g, fill, start: performance.now(), ms: m.ms || 800 });
  }
  function clearTelegraphs() { telegraphs.forEach(t => scene.remove(t.g)); telegraphs.length = 0; }
  UI.net.on('telegraph', addTelegraph);
  UI.net.on('mobhit', m => { const mob = mobs.get(m.id); if (mob) mob.hitAt = performance.now(); });

  UI.onFrame(dt => {
    const now = performance.now();
    mobs.forEach(m => {
      const p = m.remote.sample();
      m.mesh.position.set(p.x, groundAt(p.x, p.z), p.z);
      m.mesh.rotation.y = p.face;
      const def = MOB_KINDS[m.kind];
      if (def && def.pose) def.pose(m, dt, now);
      const since = now - m.hitAt;   // a shudder when hit
      if (since < 300) m.mesh.rotation.z = Math.sin(since * .06) * .12 * (1 - since / 300); else if (m.hitAt) { m.mesh.rotation.z = 0; m.hitAt = 0; }
    });
    for (let i = telegraphs.length - 1; i >= 0; i--) {
      const t = telegraphs[i], k = (now - t.start) / t.ms;
      if (k >= 1.25) { scene.remove(t.g); telegraphs.splice(i, 1); continue; }
      t.fill.material.opacity = k < 1 ? .15 + k * .4 : .55 * (1.25 - k) * 4;   // darkens to the moment it lands, then fades
    }
  });
