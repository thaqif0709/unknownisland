  // ---- the boss models' shared kit (the "Hero Boss Lab" V15 studies' own helpers) ----
  // The bosses' looks are copied part for part from the studies, so these helpers are the
  // studies' own, number for number: a lumpy ellipsoid (`def`), a straight limb, a tapered tube
  // of limbs, a plank, a rock, a jointed chain with knuckles. Colours are the studies' palette,
  // drawn with the game's toon materials. `BK.fx` holds the studies' living effects (drifting
  // motes, falling drips, rising sparks, fireflies), which stay out of the ink pass and move
  // each frame while their boss is in the scene.
  const BK = (() => {
    const C = { wood: 0x3b3025, wood2: 0x574332, bone: 0xa99e86, stone: 0x4a4b45, stone2: 0x68675e, moss: 0x34422f, pale: 0xc9c6bb, black: 0x1d1e1c, kelp: 0x293a2c };
    const M = {};
    for (const k in C) M[k] = softShared(C[k]);
    M.glow = new THREE.MeshStandardMaterial({ color: 0xd0a15a, roughness: .55, emissive: 0xa65b1e, emissiveIntensity: 2.8 });
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    function add(par, geo, m, p = [0, 0, 0], s = [1, 1, 1]) { const q = new THREE.Mesh(geo, m); q.position.set(...p); q.scale.set(...s); par.add(q); return q; }
    function def(rx, ry, rz, seed = 1, d = 3) {
      const g = new THREE.IcosahedronGeometry(1, d), a = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i);
        const n = 1 + .07 * Math.sin(v.x * 7 + seed) + .04 * Math.sin(v.y * 13 + seed * 2) + .035 * Math.cos(v.z * 17 - seed);
        a.setXYZ(i, v.x * rx * n, v.y * ry * n, v.z * rz * n);
      }
      g.computeVertexNormals(); return g;
    }
    function limb(par, a, b, r0, r1, m) {
      const d = b.clone().sub(a), q = add(par, new THREE.CylinderGeometry(r1, r0, d.length(), 7), m);
      q.position.copy(a.clone().add(b).multiplyScalar(.5)); q.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return q;
    }
    function taperTube(par, ps, r0, r1, m) {
      for (let i = 0; i < ps.length - 1; i++) { const t = i / (ps.length - 1), u = (i + 1) / (ps.length - 1); limb(par, ps[i], ps[i + 1], THREE.MathUtils.lerp(r0, r1, t), THREE.MathUtils.lerp(r0, r1, u), m); }
    }
    function plank(par, p, sz, rot, m) { const q = add(par, new THREE.BoxGeometry(sz[0], sz[1], sz[2], 2, 1, 3), m, p); q.rotation.set(...rot); return q; }
    function rock(par, p, s, m, seed) { const q = add(par, def(.55 * s, .42 * s, .52 * s, seed, 2), m, [p.x, p.y, p.z]); q.rotation.set(seed * .31, seed * .47, seed * .19); return q; }
    function jointChain(par, points, r0, r1, m) {
      taperTube(par, points, r0, r1, m);
      for (let i = 1; i < points.length - 1; i++) add(par, def(r0 * .9, r0 * .75, r0 * .9, 100 + i, 2), m, [points[i].x, points[i].y, points[i].z]);
    }

    // ---------- living effects ----------
    const live = new Set();   // effect objects, each animated while its boss is in the scene
    function track(o) { live.add(o); noInk.add(o); return o; }
    function pointCloud(par, count, spread, y0, y1, color, size = .035, opacity = .5) {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = i * 2.399, r = spread * Math.sqrt(((i * 37) % count) / Math.max(1, count - 1));
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y0 + ((i * 53) % count) / Math.max(1, count - 1) * (y1 - y0); pos[i * 3 + 2] = Math.sin(a) * r * .72;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true }));
      pts.frustumCulled = false; par.add(pts); return track(pts);
    }
    function fireflies(par, count, spread, y0, y1, color = 0xc9ff8b) {
      const g = new THREE.Group(); g.userData.fireflies = true;
      for (let i = 0; i < count; i++) {
        const a = i * 2.399, r = .45 + spread * ((i * 31) % count) / Math.max(1, count - 1);
        const q = add(g, new THREE.SphereGeometry(.018 + (i % 3) * .006, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55 + (i % 3) * .12 }),
          [Math.cos(a) * r, y0 + ((i * 17) % count) / Math.max(1, count - 1) * (y1 - y0), Math.sin(a) * r * .72]);
        q.userData.phase = i * .73; noInk.add(q);
      }
      par.add(g); return track(g);
    }
    const fx = {
      pointCloud, fireflies,
      drips(par, count, spread, y0, y1, color) { const p = pointCloud(par, count, spread, y0, y1, color, .025, .45); p.userData.fallSpeed = .45; return p; },
      silk(par, count, spread, y0, y1) { const p = pointCloud(par, count, spread, y0, y1, 0xd7d0c2, .018, .28); p.userData.driftSpeed = .06; return p; },
    };
    // each frame: motes rise, fall and drift (wrapping round between 0 and 10.5 m), fireflies wander and pulse
    let t = 0;
    UI.onFrame(dt => {
      dt = Math.min(dt, .05); t += dt;
      for (const o of live) {
        let r = o; while (r.parent) r = r.parent;
        if (r !== scene) { live.delete(o); noInk.delete(o); o.traverse(q => noInk.delete(q)); continue; }   // (its boss is gone)
        if (o.userData.fireflies) {
          o.children.forEach((q, i) => {
            const ph = q.userData.phase || i * .73;
            q.position.x += Math.sin(t * 1.3 + ph) * dt * .018; q.position.y += Math.cos(t * 1.7 + ph) * dt * .012; q.position.z += Math.sin(t * .9 + ph * 1.7) * dt * .015;
            q.material.opacity = .25 + .7 * (.5 + .5 * Math.sin(t * 3.2 + ph));
          });
          continue;
        }
        const rise = o.userData.riseSpeed || 0, fall = o.userData.fallSpeed || 0, drift = o.userData.driftSpeed || 0;
        if (!(rise || fall || drift)) continue;
        const a = o.geometry.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) {
          a[i + 1] += (rise - fall) * dt; a[i] += Math.sin(t * .8 + i * .013) * drift * dt; a[i + 2] += Math.cos(t * .55 + i * .021) * drift * .55 * dt;
          if (a[i + 1] > 11) a[i + 1] = .05;
          if (a[i + 1] < 0) a[i + 1] = 10.5;
        }
        o.geometry.attributes.position.needsUpdate = true;
      }
    });
    // shadows for the solid parts only (the effects cast none)
    const solidShadows = obj => obj.traverse(m => { if (m.isMesh) m.castShadow = !noInk.has(m) && !m.material.transparent; });
    return { C, M, V, add, def, limb, taperTube, plank, rock, jointChain, fx, solidShadows };
  })();
