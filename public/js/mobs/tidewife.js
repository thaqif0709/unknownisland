  // ---- boss: the Tidewife (C1, the Landing's boss) ----
  // A great crab wearing a wreck for a shell: hull planks for a back, barnacles, two claws, six
  // legs, kelp hanging off her (gone once it's burned: the snapshot's extra is 1 while it's on
  // her), and two barnacle eyes on stalks that come up and glow when she rears. She lifts her
  // front to rear and crashes down; swings a claw; heaves a beam of the wreck (bossfx 'wreck').
  const twM = { hull: softShared(0x6E5646), plank: softShared(0x7E6450), shell: softShared(0x8A6A52), barn: softShared(0xB8B0A0),
    claw: softShared(0xA0563F), leg: softShared(0x7A4636), kelp: softShared(0x4F6B3A),
    eye: new THREE.MeshBasicMaterial({ color: 0x2B3A3C }), eyeLit: new THREE.MeshBasicMaterial({ color: 0x9FD3E6 }) };
  function makeTidewife() {
    const g = new THREE.Group(), body = new THREE.Group();
    const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    // the wreck on her back: an upturned hull of planks
    const hull = add(body, new THREE.SphereGeometry(1.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), twM.hull, 0, 0, 0);
    hull.scale.set(1, .55, 1.25);
    for (let i = -3; i <= 3; i++) add(body, new THREE.BoxGeometry(.18, .06, 3.9), twM.plank, i * .45, .62 - Math.abs(i) * .1, 0).rotation.z = i * .14;
    for (const [x, z] of [[.6, .5], [-.8, -.3], [.2, -1.1], [-.4, .9], [1.1, -.6]]) add(body, new THREE.SphereGeometry(.16, 8, 6), twM.barn, x, .72, z);
    // eyes on stalks at the front: low and dull, up and lit when she rears
    const eyes = [];
    for (const sx of [-1, 1]) {
      const st = new THREE.Group(); st.position.set(sx * .5, .2, 1.75); body.add(st);
      add(st, new THREE.CylinderGeometry(.07, .09, .6, 6), twM.shell, 0, .3, 0);
      const e = add(st, new THREE.SphereGeometry(.2, 10, 8), twM.eye, 0, .65, 0);
      const ring = add(st, new THREE.TorusGeometry(.2, .07, 6, 12), twM.barn, 0, .65, 0); ring.rotation.x = Math.PI / 2;
      eyes.push({ st, e });
    }
    // claws: an arm and a pincer each side, at the front
    const arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 1.4, .1, 1.2); body.add(arm);
      add(arm, new THREE.CylinderGeometry(.16, .2, 1.2, 8), twM.claw, 0, 0, .5).rotation.x = Math.PI / 2;
      const pin = add(arm, new THREE.SphereGeometry(.45, 10, 8), twM.claw, 0, 0, 1.25); pin.scale.set(.8, .6, 1.3);
      add(arm, new THREE.ConeGeometry(.16, .7, 6), twM.claw, sx * .15, .1, 1.85).rotation.x = Math.PI / 2;
      arms.push(arm);
    }
    // legs, three a side
    for (const sx of [-1, 1]) for (const z of [-.9, 0, .8]) add(body, new THREE.CylinderGeometry(.08, .05, 1.5, 6), twM.leg, sx * 1.6, -.25, z).rotation.z = sx * 1.1;
    // kelp, hanging from the hull's rim
    const kelp = new THREE.Group(); body.add(kelp);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; add(kelp, new THREE.BoxGeometry(.18, 1.1, .03), twM.kelp, Math.sin(a) * 1.6, -.1, Math.cos(a) * 2).rotation.y = a; }
    body.position.y = 1.05;
    g.add(body);
    g.userData = { body, eyes, arms, kelp };
    return g;
  }
  UI.mobs.register('boss_tidewife', {
    make: makeTidewife,
    pose(m, dt, now) {
      const { body, eyes, arms, kelp } = m.mesh.userData, s = (now - m.stateAt) / 1000;
      kelp.visible = m.extra !== 0;
      kelp.children.forEach((k, i) => { k.rotation.x = Math.sin(now / 500 + i) * .15; });
      // rearing: front up, eyes up and lit
      const rear = m.state === 'rear' ? Math.min(1, s / .5) : m.state === 'recover' && s < .3 ? 1 - s / .3 : 0;
      body.rotation.x += (-.65 * rear - body.rotation.x) * Math.min(1, dt * 12);
      eyes.forEach(({ st, e }) => { st.scale.y = .6 + rear * .9; e.material = rear > .5 ? twM.eyeLit : twM.eye; });
      // the claw swipe and the heave
      const swipe = m.state === 'claw' ? Math.sin(Math.min(1, s / .9) * Math.PI) : 0, heave = m.state === 'throw' ? Math.min(1, s / .6) : 0;
      arms[1].rotation.y = -swipe * .9; arms[0].rotation.x = -heave * 1.2;
      body.position.y = 1.05 + Math.sin(now / 400) * .04 + (UI.bosses && UI.bosses.phaseOf(m.id) ? Math.sin(now / 90) * .02 : 0);
    },
  });
  // a beam of the wreck, flying where she threw it
  const twBeams = [];
  UI.net.on('bossfx', m => {
    if (m.k !== 'wreck') return;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(.25, .2, 1.6), twM.plank);
    scene.add(beam);
    twBeams.push({ beam, fx: m.fx, fz: m.fz, x: m.x, z: m.z, t: 0, ms: m.ms || 1400 });
  });
  UI.onFrame(dt => {
    for (let i = twBeams.length - 1; i >= 0; i--) {
      const b = twBeams[i];
      b.t += dt * 1000;
      const k = Math.min(1, b.t / b.ms), x = b.fx + (b.x - b.fx) * k, z = b.fz + (b.z - b.fz) * k;
      b.beam.position.set(x, Math.max(groundAt(x, z), 0) + .3 + Math.sin(k * Math.PI) * 6, z);
      b.beam.rotation.set(k * 8, Math.atan2(b.x - b.fx, b.z - b.fz), 0);
      if (k >= 1) { scene.remove(b.beam); b.beam.geometry.dispose(); twBeams.splice(i, 1); }
    }
  });
