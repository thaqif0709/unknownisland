  // ---- boss: the Hanging Mother (C4, the Weeping Wood's boss) ----
  // A huge pale body wrapped in silk, hanging head-down from the canopy by long arms (extra 1:
  // up there, out of reach); dropped, she sprawls on the ground. Her three vines are separate
  // mobs: thick green ropes from the ground up into the dark.
  const motherM = { skin: softShared(0xE6E0D6), silk: softShared(0xF4F1EA), eye: new THREE.MeshBasicMaterial({ color: 0x9FB7C6 }), vine: softShared(0x4F7A3A) };
  UI.mobs.register('boss_mother', {
    make() {
      const g = new THREE.Group(), body = new THREE.Group();
      const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; body.add(mesh); return mesh; };
      add(new THREE.SphereGeometry(1.3, 14, 10), motherM.silk, 0, 0, 0).scale.set(1, 1.5, 1);
      add(new THREE.SphereGeometry(.7, 12, 9), motherM.skin, 0, -1.9, 0);
      for (const sx of [-1, 1]) add(new THREE.SphereGeometry(.13, 8, 6), motherM.eye, sx * .3, -2.1, .55);
      const arms = [];
      for (let i = 0; i < 4; i++) { const a = add(new THREE.CylinderGeometry(.09, .06, 8, 6), motherM.skin, Math.cos(i * 1.57) * .6, 5, Math.sin(i * 1.57) * .6); arms.push(a); }
      g.add(body);
      g.userData = { body, arms };
      return g;
    },
    pose(m, dt, now) {
      const { body, arms } = m.mesh.userData, up = m.extra === 1;
      const y = up ? 16 : m.state === 'snatch' ? 2.4 : 1.4;
      body.position.y += (y - body.position.y) * Math.min(1, dt * (up ? 2.5 : 10));
      arms.forEach(a => { a.visible = up || m.state === 'snatch'; });
      body.rotation.z = up ? Math.sin(now / 1200) * .06 : m.state === 'fallen' ? 1.3 : 0;
    },
  });
  UI.mobs.register('mother_vine', {
    make() {
      const g = new THREE.Group(), v = new THREE.Mesh(new THREE.CylinderGeometry(.18, .26, 22, 7), motherM.vine);
      v.position.y = 11; v.castShadow = true; g.add(v);
      return g;
    },
    pose(m, dt, now) { m.mesh.rotation.z = Math.sin(now / 700 + m.id) * .03; },
  });
