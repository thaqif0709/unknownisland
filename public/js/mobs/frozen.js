  // ---- mob: the Frozen (C6, the Teeth's Stilled) ----
  // A frog-sized figure white with frost, stooped into the wind, trailing a little drift of snow;
  // after its touch it stands still a moment (state 'still').
  const frozenM = { frost: softShared(0xE9F0F4), ice: new THREE.MeshLambertMaterial({ color: 0xBFDCEA, transparent: true, opacity: .8 }), eye: new THREE.MeshBasicMaterial({ color: 0x8FB4C8 }) };
  UI.mobs.register('frozen', {
    make() {
      const g = new THREE.Group(), body = new THREE.Group();
      const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); body.add(mesh); return mesh; };
      add(new THREE.CylinderGeometry(.18, .3, 1.05, 8), frozenM.frost, 0, .55, 0);
      add(new THREE.SphereGeometry(.22, 10, 8), frozenM.frost, 0, 1.2, .05);
      for (const sx of [-1, 1]) add(new THREE.SphereGeometry(.035, 6, 4), frozenM.eye, sx * .08, 1.22, .24);
      const arms = [];
      for (const sx of [-1, 1]) { const a = add(new THREE.CylinderGeometry(.05, .035, .7, 5), frozenM.ice, sx * .26, .8, .15); a.rotation.x = -1.1; arms.push(a); }
      for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(.04, .2, 4), frozenM.ice, Math.sin(i * 1.6) * .2, .95, Math.cos(i * 1.6) * .2).rotation.x = Math.PI;   // icicles
      g.add(body);
      g.userData = { body, arms };
      return g;
    },
    pose(m, dt, now) {
      const { body, arms } = m.mesh.userData, still = m.state === 'still';
      body.rotation.x = .25 + (still ? 0 : Math.sin(now / 500 + m.id) * .05);
      body.position.y = still ? 0 : Math.abs(Math.sin(now / 380 + m.id)) * .05;
      arms.forEach((a, i) => { a.rotation.x = still ? -.2 : -1.1 + Math.sin(now / 420 + i * 3) * .15; });
    },
  });
