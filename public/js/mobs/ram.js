  // ---- boss: the White Ram (C6, the Teeth's boss) ----
  // A ram the size of a hut in a heavy white fleece, with horns that curl twice. It paws the
  // snow before a charge (state 'paw'), runs head down ('charge'), and dazed after hitting rock
  // (extra 1) it sways with its head low and stars of frost round its horns.
  const ramM = { fleece: softShared(0xF2F0EA), face: softShared(0x3E3A3A), horn: softShared(0xBFAE8E), leg: softShared(0x6A625A), daze: new THREE.MeshBasicMaterial({ color: 0xDDEBF4 }) };
  UI.mobs.register('boss_ram', {
    make() {
      const g = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
      const add = (geo, m, x, y, z, p = body) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; p.add(mesh); return mesh; };
      add(new THREE.SphereGeometry(1.6, 14, 10), ramM.fleece, 0, 2.3, 0).scale.set(1, .85, 1.45);
      for (let i = 0; i < 9; i++) add(new THREE.SphereGeometry(.6, 8, 6), ramM.fleece, Math.sin(i) * 1.2, 2.6 + Math.cos(i * 2) * .5, -1.4 + i * .35);   // the curls of the fleece
      const legs = [];
      for (const [x, z] of [[-.8, 1.2], [.8, 1.2], [-.8, -1.2], [.8, -1.2]]) legs.push(add(new THREE.CylinderGeometry(.22, .18, 1.5, 6), ramM.leg, x, .75, z));
      head.position.set(0, 2.6, 2.2); body.add(head);
      add(new THREE.SphereGeometry(.6, 10, 8), ramM.face, 0, 0, .3, head).scale.set(.8, .9, 1.3);
      for (const sx of [-1, 1]) {
        const horn = add(new THREE.TorusGeometry(.55, .17, 6, 14, Math.PI * 1.7), ramM.horn, sx * .55, .25, 0, head);
        horn.rotation.set(0, sx * Math.PI / 2, 0);
      }
      const stars = new THREE.Group();
      for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(.12, 0), ramM.daze); s.position.set(Math.sin(i * 1.26) * .9, 1, Math.cos(i * 1.26) * .9); stars.add(s); }
      head.add(stars); stars.visible = false;
      g.add(body);
      g.userData = { body, head, legs, stars };
      return g;
    },
    pose(m, dt, now) {
      const { body, head, legs, stars } = m.mesh.userData, dazed = m.extra === 1;
      const run = m.state === 'charge', paw = m.state === 'paw';
      head.rotation.x = run ? .55 : dazed ? .7 : paw ? .3 : 0;
      body.rotation.z = dazed ? Math.sin(now / 250) * .08 : 0;
      legs.forEach((l, i) => { l.rotation.x = run ? Math.sin(now / 70 + i * 1.6) * .7 : paw && i === 0 ? Math.sin(now / 120) * .6 : 0; });
      stars.visible = dazed; stars.rotation.y = now / 300;
    },
  });
