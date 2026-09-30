  // ---- mob: the straw dummy (the framework's test mob; admins spawn it with /spawn dummy) ----
  // A sack of straw on a post with a stick for arms. It leans back while it winds up and
  // slams forward when it strikes.
  function makeDummy() {
    const g = new THREE.Group(), body = new THREE.Group();
    const straw = softShared(0xD8B866), post = softShared(0x8C6B4A), cloth = softShared(0xB8A07A);
    const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(g, new THREE.CylinderGeometry(.07, .09, 1.1, 7), post, 0, .55, 0);
    add(body, new THREE.CylinderGeometry(.3, .36, .8, 9), straw, 0, .4, 0);
    add(body, new THREE.SphereGeometry(.26, 10, 8), cloth, 0, 1.05, 0);
    add(body, new THREE.CylinderGeometry(.04, .04, 1.4, 6), post, 0, .62, 0).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) add(body, new THREE.SphereGeometry(.09, 7, 5), straw, sx * .72, .62, 0);
    body.position.y = .9;
    g.add(body);
    g.userData.body = body;
    return g;
  }
  UI.mobs.register('dummy', {
    make: makeDummy,
    pose(m, dt, now) {
      const b = m.mesh.userData.body, s = (now - m.stateAt) / 1000;
      const lean = m.state === 'windup' ? -Math.min(1, s / .9) * .5
        : m.state === 'strike' || (m.state === 'recover' && s < .25) ? .7
        : m.state === 'recover' ? .7 * Math.max(0, 1 - (s - .25) / .6)
        : m.state === 'stagger' ? Math.sin(s * 30) * .15 : 0;
      b.rotation.x += (lean - b.rotation.x) * Math.min(1, dt * 14);
    },
  });
