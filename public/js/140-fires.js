  // ================= Fires =================
  let fires = new Map();
  const logM = soft(0x7A5A45);
  // Flames in layers, like a flash-sheet fire: deep red tongues outside, then
  // orange, yellow, and a pale core. Each tongue leans out and flickers on its own.
  const flameMats = [0xB8402A, 0xE2742C, 0xF2B33D, 0xFFEBA6].map(c => new THREE.MeshBasicMaterial({ color: c }));
  const emberM = new THREE.MeshBasicMaterial({ color: 0xD9542A }), charM = soft(0x3E302A);
  // a teardrop: round belly low down, drawn up into a soft tip that curls a little
  const tongueGeo = [0, 1, 2].map(k => {
    const prof = []; for (let i = 0; i <= 10; i++) { const t2 = i / 10; prof.push(new THREE.Vector2(.15 * Math.sin(Math.PI * Math.pow(t2, .55)) * (1 - t2 * .25) + .001, t2 * .7)); }
    const g2 = new THREE.LatheGeometry(prof, 9);
    const pos = g2.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) + Math.sin(y * 4 + k) * .06 * y * y); }
    g2.computeVertexNormals(); return g2; });
  function makeFlames(g) {
    const tongues = [];
    const layer = (n, w, h, rad, lean, mat, y0) => {
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + Math.random() * .6, holder = new THREE.Group();
        const t = new THREE.Mesh(tongueGeo[i % 3], mat); t.scale.set(w / .15, h / .7, w / .15); holder.add(t);
        holder.position.set(Math.cos(a) * rad, y0, Math.sin(a) * rad);
        holder.rotation.set(Math.sin(a) * lean, Math.random() * 6, -Math.cos(a) * lean);
        g.add(holder); tongues.push({ m: holder, ph: Math.random() * 6.28, sp: 8 + Math.random() * 7, h: 1 });
      }
    };
    layer(6, .1, .34, .2, .55, flameMats[0], .07);    // low red licks, flared out
    layer(4, .13, .62, .09, .22, flameMats[1], .1);   // the tall orange body
    layer(3, .1, .5, .04, .1, flameMats[2], .13);     // yellow inside
    layer(1, .07, .3, 0, 0, flameMats[3], .15);       // pale heart
    // embers glowing between the logs
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, r = .1 + Math.random() * .28, e = ball(.045 + Math.random() * .03, i % 3 ? emberM : charM, 6, 5);
      e.position.set(Math.cos(a) * r, .1, Math.sin(a) * r); g.add(e); tongues.push({ m: e, ember: true, ph: Math.random() * 6.28 }); }
    return tongues;
  }
  const clayM = soft(0xB8704F);
  function addFire(src) {
    const g = new THREE.Group();
    const kind = WG.FIRES[src.kind] ? src.kind : 'campfire';
    if (kind === 'hearth') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .2, 12, 28), clayM); ring.rotation.x = -Math.PI / 2; ring.position.y = .14;
      ring.castShadow = true; g.add(ring);
    } else for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const s = ball(.15, rockM[i % 2], 10, 8); s.scale.y = .7; s.position.set(Math.cos(a) * .55, .08, Math.sin(a) * .55); s.castShadow = true; g.add(s); }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .9, 10), logM); l.rotation.set(Math.PI / 2 - .35, i * 2.1, 0); l.position.y = .18; l.castShadow = true; g.add(l); }
    const fg = new THREE.Group(); g.add(fg);
    const flames = makeFlames(fg);
    g.position.set(src.x, groundAt(src.x, src.z), src.z);
    scene.add(g);
    const f = { id: src.id, type: 'fire', kind, x: src.x, z: src.z, r: kind === 'hearth' ? .8 : .6, mesh: g, flameGroup: fg, flames, fuel: src.fuel, state: {} };
    setPot(f, src.pot);
    fires.set(f.id, f);
    return f;
  }
  // A bucket boiling on a fire: sits on two sticks above the flames, with a
  // countdown tag over it (and steam once it's ready).
  function setPot(f, pot) {
    if (f.potMesh) { f.mesh.remove(f.potMesh); f.potMesh = null; }
    if (f.potTag) { f.potTag.remove(); f.potTag = null; }
    f.pot = pot ? { mat: pot.mat, left: pot.left } : null;
    if (!pot) return;
    const g = new THREE.Group(), b = bucketModel(pot.mat, pot.left > 0 ? 'sea' : 'clean', 1.3); b.position.y = .62; g.add(b);
    for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.2, 6), logM); st.position.set(sx * .28, .5, 0); st.rotation.z = sx * .35; g.add(st); }
    f.mesh.add(g); f.potMesh = g;
    f.potTag = document.createElement('div'); f.potTag.className = 'pottag'; ui.tags.appendChild(f.potTag);
  }
  function updatePots(dt) {
    fires.forEach(f => {
      if (!f.pot) return;
      if (f.pot.left > 0 && f.fuel > 0) {
        f.pot.left = Math.max(0, f.pot.left - dt);
        if (f.pot.left === 0) { const p2 = f.pot; setPot(f, p2); }   // swap to clean water
      }
      tagV.set(f.x, groundAt(f.x, f.z) + 1.35, f.z).project(camera);
      const d = Math.hypot(f.x - camera.position.x, f.z - camera.position.z);
      if (tagV.z > 1 || d > 35 || !inGame()) { f.potTag.style.display = 'none'; return; }
      f.potTag.style.display = '';
      const l = Math.ceil(f.pot.left);
      f.potTag.textContent = f.pot.left <= 0 ? 'Clean water ready' : f.fuel > 0 ? `Boiling ${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}` : 'Fire\u2019s out: add wood';
      f.potTag.className = 'pottag' + (f.pot.left <= 0 ? ' ready' : f.fuel > 0 ? '' : ' cold');
      f.potTag.style.transform = `translate(${(tagV.x * .5 + .5) * innerWidth}px,${(-tagV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
      if (f.pot.left <= 0 && Math.random() < dt * 3 && d < 40) emitPuff({ ...f, kind: 'campfire', steam: true });
    });
  }

