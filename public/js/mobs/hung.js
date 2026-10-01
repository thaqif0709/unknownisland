  // ---- mob: the Hung (C4, the Weeping Wood's Stilled) ----
  // A pale, thin figure hanging by its long arms from the dark above (its extra: 1 up in the
  // branches, 2 climbing back up, 0 on the ground). Up there it sways, far overhead; when it
  // creaks it shivers; dropped, it crouches on the ground until it climbs back up.
  const hungM = { skin: softShared(0xE9E4DA), arm: softShared(0xD9D2C6) };
  UI.mobs.register('hung', {
    make() {
      const g = new THREE.Group(), body = new THREE.Group();
      const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); body.add(mesh); return mesh; };
      add(new THREE.CylinderGeometry(.16, .22, 1.1, 8), hungM.skin, 0, 0, 0);
      add(new THREE.SphereGeometry(.2, 10, 8), hungM.skin, 0, .72, 0).scale.set(1, 1.2, 1);
      const arms = [];
      for (const sx of [-1, 1]) { const a = add(new THREE.CylinderGeometry(.04, .03, 5, 5), hungM.arm, sx * .14, 3.2, 0); arms.push(a); }
      g.add(body);
      g.userData = { body, arms };
      return g;
    },
    pose(m, dt, now) {
      const { body, arms } = m.mesh.userData, up = m.extra === 1, climbing = m.extra === 2;
      const target = up ? 9 : climbing ? 4.5 : .6;
      body.position.y += (target - body.position.y) * Math.min(1, dt * (up ? 3 : 8));
      arms.forEach(a => { a.visible = up || climbing; });
      body.rotation.z = up ? Math.sin(now / 900 + m.id) * .08 + (m.state === 'creak' ? Math.sin(now / 40) * .05 : 0) : 0;
      body.rotation.x = up ? 0 : .5;
    },
  });
