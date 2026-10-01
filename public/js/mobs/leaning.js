  // ---- mob: the Leaning (C3, flag region-stair) ----
  // The Stilled of the Stairs: tall, thin and pale (drawn as a hole in the world like the
  // Stilled), leaning back into the wind with ragged strips of itself streaming downwind.
  // It faces where the wind blows; extra = [gusting (1/0), wind angle]. In a gust it rights
  // itself and the strips thrash: that's when it moves (server/mobs/leaning.js).
  const leaningMat = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(0xE4E0D6) } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 col; void main(){ gl_FragColor = vec4(col, 0.); }',
    blending: THREE.NoBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  function makeLeaning(id) {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const part = (parent, geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, leaningMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.renderOrder = 10; parent.add(m); return m; };
    part(inner, new THREE.CylinderGeometry(.1, .2, 1.7, 8), 0, .95, 0);                 // a long, narrow body
    part(inner, new THREE.SphereGeometry(.22, 10, 8), 0, 1.95, 0, .9, 1.3, .8);         // a long, smooth head
    for (const sx of [-1, 1]) {                                                          // arms held back, like wings in the wind
      const arm = part(inner, new THREE.CylinderGeometry(.035, .025, 1.1, 5), sx * .2, 1.25, .25); arm.rotation.set(.9, 0, sx * .35);
    }
    const strips = [];
    for (let i = 0; i < 5; i++) {                                                        // ragged strips trailing downwind
      const s = new THREE.Group(); s.position.set((i - 2) * .07, 1.85 - i * .28, .08); inner.add(s);
      part(s, new THREE.PlaneGeometry(.09, .9 - i * .08).rotateX(Math.PI / 2).translate(0, 0, .45 - i * .04), 0, 0, 0);
      strips.push(s);
    }
    g.userData = { inner, strips, ph: WG.hash2(id, 5) * 6 };
    scene.add(g);
    return g;
  }
  UI.mobs.register('leaning', {
    make: makeLeaning,
    pose(m, dt, now) {
      const u = m.mesh.userData, gust = m.extra && m.extra[0] ? 1 : 0, t = now / 1000 + u.ph;
      u.gust = (u.gust || 0) + (gust - (u.gust || 0)) * Math.min(1, dt * 4);
      // leaning back into the wind when still; nearly upright, trembling, when it's carried
      u.inner.rotation.x = -.38 * (1 - u.gust) - .08 + Math.sin(t * 9) * .05 * u.gust;
      u.inner.rotation.z = Math.sin(t * .7) * .04;
      u.strips.forEach((s, i) => {
        s.rotation.x = Math.sin(t * (1.5 + u.gust * 9) + i) * (.15 + u.gust * .35) - .1;
        s.rotation.y = Math.sin(t * (1.1 + u.gust * 7) + i * 1.7) * (.1 + u.gust * .3);
      });
    },
  });
