  // ================= Plants and rocks =================
  // Positions come from the server; small visual details (leaf angles, colors)
  // come from an RNG seeded by the object's id so everyone sees the same thing.
  const trunkM = [soft(0x9A7A5E), soft(0x8A6A52)], barkM = soft(0x7A5A45);
  const palmLeaf = [soft(0x86A06A), soft(0x6F8F5A)]; palmLeaf.forEach(m => { m.userData.leafy = true; });   // (the leafy texture is defined just below)
  // Foliage texture, inked: little scalloped leaf marks all over, and toward the
  // underside (the bottom of the texture on spheres and cones) a darker band with
  // cross-hatching, so every clump of leaves reads as lit from above.
  const leafTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d'), r = mulberry32(808);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
    const sh = g.createLinearGradient(0, 0, 0, 256);
    sh.addColorStop(0, 'rgba(255,255,230,0)'); sh.addColorStop(.45, 'rgba(0,0,0,0)'); sh.addColorStop(.75, 'rgba(20,30,20,.22)'); sh.addColorStop(1, 'rgba(10,15,10,.42)');
    g.fillStyle = sh; g.fillRect(0, 0, 256, 256);
    g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {   // leaf scallops, darker lower down
      const x = r() * 256, y = r() * 256, s2 = 5 + r() * 6, a = (r() - .5) * .8, dark = .18 + y / 256 * .3;
      g.strokeStyle = `rgba(30,45,25,${dark})`; g.lineWidth = 1.8;
      g.beginPath(); g.arc(x, y, s2, a + .3, a + Math.PI - .3); g.stroke();
    }
    for (let i = 0; i < 70; i++) {   // light flecks where the sun catches the top
      const x = r() * 256, y = r() * 110;
      g.fillStyle = `rgba(255,252,220,${.25 + r() * .25})`; g.beginPath(); g.ellipse(x, y, 3 + r() * 3, 1.6, (r() - .5), 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(20,28,18,.28)'; g.lineWidth = 1.4;   // hatching in the shade
    for (let x = -256; x < 256; x += 7) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 70, 186); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
    return t;
  })();
  const leafy = c => { const m = soft(c, { map: leafTex }); m.userData.leafy = true; return m; };
  const treeLeaf = [leafy(0x6E8F5E), leafy(0x809A62), leafy(0x5C7D55), leafy(0xD8928F)];   // the pink one is blossom
  const coconutM = soft(0x7A5A45), berryM = soft(0xC4574F, { shininess: 60, specular: 0x666666 }), bushM = [leafy(0x6A8A5A), leafy(0x7C9868)];
  const rockM = [soft(0xA9A193), soft(0x948E83)];

  function makePalm(rng) {
    const g = new THREE.Group();
    const hgt = 4 + rng() * 1.6, bend = .2 + rng() * .35, segs = 7;
    for (let i = 0; i < segs; i++) {
      const f = i / segs;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(.16 - f * .05, .2 - f * .05, hgt / segs + .06, 12), trunkM[i % 2]);
      s.position.set(bend * 3 * f * f, hgt * (i + .5) / segs, 0); s.rotation.z = -bend * f * 1.6;
      g.add(s);
    }
    const top = new THREE.Vector3(bend * 3, hgt, 0);
    for (let k = 0; k < 7; k++) {
      const piv = new THREE.Group(); piv.position.copy(top); piv.rotation.y = k / 7 * Math.PI * 2 + rng() * .3;
      const tilt = new THREE.Group(); tilt.rotation.x = .35 + rng() * .3; piv.add(tilt);
      const leaf = ball(1, palmLeaf[k % 2], 8, 5); leaf.scale.set(.36, .07, 1.35); leaf.position.z = 1.2;
      tilt.add(leaf); g.add(piv);
    }
    const nuts = [];
    for (let k = 0; k < 3; k++) {
      const n = ball(.17, coconutM, 8, 6);
      const a = k / 3 * Math.PI * 2;
      n.position.set(top.x + Math.cos(a) * .22, top.y - .22, Math.sin(a) * .22);
      g.add(n); nuts.push(n);
    }
    g.rotation.y = rng() * Math.PI * 2;
    return { g, nuts };
  }
  const pineM = [leafy(0x4F6F5A), leafy(0x5E7F66)], blueberryM = soft(0x5873A8, { shininess: 60, specular: 0x666666 });
  // Every tree, bush and stone gets its own shape from an RNG seeded by its id,
  // so all players see the same island.
  const rr = (rng, a, b) => a + rng() * (b - a);
  function makeTree(rng, species) {
    const g = new THREE.Group();
    if (species === 'pine') {
      const tiers = 2 + ((rng() * 3) | 0), hf = rr(rng, .8, 1.35), wf = rr(rng, .75, 1.2);
      const trunkH = rr(rng, 1, 1.6) * hf;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.14, .24, trunkH, 12), barkM); t.position.y = trunkH / 2; g.add(t);
      const m = pineM[(rng() * 2) | 0];
      let y = trunkH * .75;
      for (let i = 0; i < tiers; i++) {
        const k = i / tiers, r = (1.4 - k * .9) * wf * rr(rng, .9, 1.1), h = (1.5 - k * .4) * hf;
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18), m); c.position.set(rr(rng, -.06, .06), y + h / 2, rr(rng, -.06, .06)); g.add(c);
        y += h * .58;
      }
      const tip = ball(.13, m, 10, 8); tip.position.y = y + .5 * hf; g.add(tip);
    } else {
      // round, tall, wide or forked canopies on trunks of different heights and leans
      const shape = ['round', 'round', 'tall', 'wide', 'forked'][(rng() * 5) | 0];
      const trunkH = rr(rng, 1.6, 2.8) * (shape === 'tall' ? 1.2 : shape === 'wide' ? .8 : 1);
      const lean = rr(rng, -.12, .12);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rr(rng, .14, .2), rr(rng, .24, .34), trunkH, 12), barkM);
      trunk.position.set(Math.sin(lean) * trunkH / 2, trunkH / 2, 0); trunk.rotation.z = -lean; g.add(trunk);
      const top = new THREE.Vector3(Math.sin(lean) * trunkH, trunkH, 0);
      const m = species === 'blossom' ? treeLeaf[3] : treeLeaf[(rng() * 3) | 0];
      const blob = (x, y, z, r, sy = 1) => { const b = ball(r, m); b.position.set(top.x + x, top.y + y, top.z + z); b.scale.y = sy; g.add(b); };
      if (shape === 'forked') {
        for (const side of [-1, 1]) {
          const bl = rr(rng, .8, 1.2), ang = side * rr(rng, .45, .7);
          const br = new THREE.Mesh(new THREE.CylinderGeometry(.09, .13, bl, 10), barkM);
          br.position.set(top.x + Math.sin(ang) * bl / 2, top.y - .2 + Math.cos(ang) * bl / 2, 0); br.rotation.z = -ang; g.add(br);
          const cx = Math.sin(ang) * bl, cy = Math.cos(ang) * bl - .2;
          blob(cx, cy + .45, 0, rr(rng, .75, 1)); blob(cx + side * .35, cy + .2, rr(rng, -.3, .3), rr(rng, .5, .7));
        }
      } else {
        const n = 3 + ((rng() * 4) | 0);
        const sx = shape === 'wide' ? 1.6 : shape === 'tall' ? .6 : 1, sy = shape === 'tall' ? 1.7 : shape === 'wide' ? .55 : 1;
        // the main clump always swallows the top of the trunk; the others sit inside its height
        const R = rr(rng, 1, 1.35), my = R * sy * .45;
        blob(0, my, 0, R, shape === 'wide' ? .75 : shape === 'tall' ? sy : 1);
        for (let i = 0; i < n; i++) {
          const a = rng() * 6.28, d = rr(rng, .45, .85) * sx;
          blob(Math.cos(a) * d, clamp(rr(rng, .2, 1.3) * sy, my - R * .3, my + R * sy * .55), Math.sin(a) * d, rr(rng, .55, .95), shape === 'wide' ? .8 : 1);
        }
      }
    }
    g.rotation.y = rng() * 6.28;
    return g;
  }
  const berryGeo = new THREE.IcosahedronGeometry(.085, 0);
  function makeBush(rng, species) {
    const g = new THREE.Group();
    const m = bushM[(rng() * 2) | 0];
    const n = 3 + ((rng() * 4) | 0), flat = rr(rng, .7, 1.1), spread = rr(rng, .3, .55);
    const blobs = [[0, .42 * flat, 0, rr(rng, .5, .66)]];
    for (let i = 0; i < n; i++) { const a = rng() * 6.28; blobs.push([Math.cos(a) * spread, rr(rng, .25, .45) * flat, Math.sin(a) * spread, rr(rng, .3, .48)]); }
    blobs.forEach(([x, y, z, sz]) => { const b = ball(sz, m, 10, 7); b.position.set(x, y, z); b.scale.y = flat; g.add(b); });
    // berries sit on the outside of the bush's lumps
    const berries = new THREE.Group();
    const bm = species === 'blueberry' ? blueberryM : berryM;
    for (let i = 0; i < 8; i++) {
      const [x, y, z, sz] = blobs[(rng() * blobs.length) | 0], a = rng() * 6.28, up = rr(rng, 0, .9);
      const b = new THREE.Mesh(berryGeo, bm);
      b.position.set(x + Math.cos(a) * sz * Math.cos(up) * .95, y + Math.sin(up) * sz * flat * .95, z + Math.sin(a) * sz * Math.cos(up) * .95);
      berries.add(b);
    }
    g.add(berries);
    return { g, berries };
  }
  // Lumpy stones: an icosahedron pushed in and out by noise, squashed and turned.
  function lumpy(radius, rng, detail = 1) {
    const geo = new THREE.IcosahedronGeometry(radius, detail), p = geo.attributes.position, seed = rng() * 100;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = .72 + WG.vnoise(x * 2.2 / radius + seed, (z + y * .7) * 2.2 / radius) * .5;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const pebbleM = soft(0xD9C9A6), mossM = soft(0x7C9A6B);
  function makeRock(rng, s, species) {
    const g = new THREE.Group();
    const mat = species === 'pebble' ? pebbleM : rockM[(rng() * 2) | 0];
    const main = new THREE.Mesh(lumpy(.62 * s, rng), mat);
    main.scale.set(rr(rng, .8, 1.25), species === 'pebble' ? rr(rng, .35, .55) : rr(rng, .5, .9), rr(rng, .75, 1.15));
    main.rotation.y = rng() * 6.28; main.position.y = .12 * s; g.add(main);
    const extra = species === 'pebble' ? 2 + ((rng() * 3) | 0) : (rng() * 3) | 0;   // little stones beside it
    for (let i = 0; i < extra; i++) {
      const a = rng() * 6.28, d = rr(rng, .55, .9) * s, r = rr(rng, .14, .28) * s;
      const st = new THREE.Mesh(lumpy(r, rng, 0), mat); st.scale.y = rr(rng, .5, .8);
      st.position.set(Math.cos(a) * d, r * .3, Math.sin(a) * d); st.rotation.y = rng() * 6.28; g.add(st);
    }
    if (species === 'mossy') {
      const moss = ball(.45 * s, mossM, 14, 8); moss.scale.set(rr(rng, .9, 1.2), .3, rr(rng, .7, 1)); moss.position.y = .4 * s * main.scale.y + .08; g.add(moss);
    }
    return g;
  }
  const oreRockM = soft(0x8E8A92), oreM = { copper: soft(0xD0803F), iron: soft(0xD5D8DA) };
  function makeOre(rng, s, ore) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(lumpy(.66 * s, rng), ore === 'iron' ? soft(0x6E6570) : oreRockM);
    m.scale.set(rr(rng, .9, 1.2), rr(rng, .65, .95), rr(rng, .8, 1.1)); m.rotation.y = rng() * 6.28; m.position.y = .28 * s; g.add(m);
    for (let i = 0; i < 7; i++) {
      const a = rng() * 6.28, y = .15 + rng() * .5;
      const n = new THREE.Mesh(new THREE.IcosahedronGeometry(.12 + rng() * .06, 0), oreM[ore]);
      n.position.set(Math.cos(a) * .58 * s, y * s, Math.sin(a) * .5 * s); n.rotation.set(rng() * 3, rng() * 3, 0); g.add(n);
    }
    return g;
  }
  const dirtM = soft(0x9A6E4C), holeM = soft(0x4A3328), sproutM = soft(0x6E8F5E);
  function makeDig(rng) {
    const g = new THREE.Group();
    const mound = new THREE.Group();
    const d = ball(.45, dirtM, 10, 6); d.scale.set(1, .32, 1); d.position.y = .03; mound.add(d);
    for (let i = 0; i < 3; i++) {   // little crumbs so it reads as "soft soil"
      const c = ball(.09, dirtM, 6, 4); const a = rng() * 6.28; c.position.set(Math.cos(a) * .5, .03, Math.sin(a) * .5); mound.add(c);
    }
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(.05, .25, 6), sproutM); sprout.position.set(.1, .22, 0); mound.add(sprout);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), holeM); hole.rotation.x = -Math.PI / 2; hole.position.y = .04;
    g.add(mound, hole);
    return { g, mound, hole };
  }

  // Objects: the layout (positions, species, sizes) comes from /api/world once;
  // states come from the server. Meshes exist only for objects in loaded chunks.
  let objects = [];
  let buckets = new Map();   // chunk key -> objects in that chunk
  const isFlora = o => o.type === 'palm' || o.type === 'tree' || o.type === 'bush';
  const ckey = (cx, cz) => cx + ',' + cz;
  function setLayout(list) {
    for (const o of objects) removeMesh(o);
    objects = list.map(src => ({ id: src.id, type: src.type, x: src.x, z: src.z, r: src.r, s: src.s, maxScale: src.maxScale, size: 1,
      species: src.species, ore: src.ore, climb: src.climb, state: WG.defaultState(src.type), mesh: null }));
    buckets = new Map();
    for (const o of objects) {
      const k = ckey(Math.floor(o.x / CH), Math.floor(o.z / CH));
      if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(o);
    }
    for (const c of chunks.values()) if (c.props) buildProps(c);
  }
  // Merge all the little meshes of one object into one mesh per material, so a
  // tree costs a couple of draw calls instead of eight. Parts that change on
  // their own (coconuts, berries, dig mound/hole) are merged separately and kept.
  const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4();
  function bake(group, keep = []) {
    group.updateMatrixWorld(true);
    _inv.copy(group.matrixWorld).invert();
    const kept = new Set(keep.filter(Boolean));
    const isKept = m => { for (let p = m; p && p !== group; p = p.parent) if (kept.has(p)) return true; return false; };
    const byMat = new Map(), victims = [];
    group.traverse(m => {
      if (!m.isMesh || isKept(m)) return;
      _rel.multiplyMatrices(_inv, m.matrixWorld);
      let g = m.geometry.clone().applyMatrix4(_rel);
      if (g.index) g = g.toNonIndexed();
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(g); victims.push(m);
    });
    victims.forEach(m => { m.parent.remove(m); m.geometry.dispose(); });
    for (const [mat, geos] of byMat) { const mesh = new THREE.Mesh(mergeGeos(geos), mat); if (mat.userData.leafy) mesh.receiveShadow = true; group.add(mesh); }
    return group;
  }
  function mergeGeos(geos) {
    let n = 0; geos.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), withUv = geos.every(g => g.attributes.uv), uv = withUv ? new Float32Array(n * 2) : null;
    let off = 0;
    geos.forEach(g => { pos.set(g.attributes.position.array, off * 3); nrm.set(g.attributes.normal.array, off * 3); if (uv) uv.set(g.attributes.uv.array, off * 2); off += g.attributes.position.count; g.dispose(); });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }

  function buildMesh(o) {
    const rng = mulberry32(o.id * 7919 + 13);
    const studies = UI.treeStudies && WG.feature('trees3');   // the trees as in the studies (102-tree-studies.js)
    const grown = UI.trees && WG.feature('trees2');   // the lighter new models (101-tree-models.js)
    if (o.type === 'palm') { const p = studies ? UI.treeStudies.make(o, rng) : grown ? UI.trees.palm(rng, o) : makePalm(rng); o.mesh = p.g; o.nuts = p.nuts; }
    else if (o.type === 'tree') o.mesh = studies ? UI.treeStudies.make(o, rng).g : grown ? UI.trees.tree(rng, o) : makeTree(rng, o.species);
    else if (o.type === 'bush') { const b = makeBush(rng, o.species); o.mesh = b.g; o.berryMesh = b.berries; }
    else if (o.type === 'ore') o.mesh = makeOre(rng, o.s || 1, o.ore);
    else if (o.type === 'dig') { const d = makeDig(rng); o.mesh = d.g; o.mound = d.mound; o.hole = d.hole; }
    else if (UI.things[o.type]) { const t = UI.things[o.type].make(rng, o); o.mesh = t.g; o.parts = t.parts || {}; }   // a region's own (C3 ...)
    else o.mesh = makeRock(rng, o.s || 1, o.species);
    if (o.berryMesh) bake(o.berryMesh);
    if (o.mound) bake(o.mound);
    if (!o.mesh.userData.prebaked) bake(o.mesh, [...(o.nuts || []), o.berryMesh, o.mound, o.hole, ...Object.values(o.parts || {})]);   // (the tree studies come merged, in levels of detail)
    o.mesh.position.set(o.x, groundAt(o.x, o.z), o.z);
    shadows(o.mesh);
    scene.add(o.mesh);
    applyState(o);
  }
  const disposeTree = obj => obj.traverse(m => { if (m.geometry && m.geometry !== crestGeo && !m.geometry.userData.shared) m.geometry.dispose(); });   // (shared: one tree study's geometry serves many trees)
  function removeMesh(o) {
    if (!o.mesh) return;
    scene.remove(o.mesh); disposeTree(o.mesh);
    o.mesh = o.nuts = o.berryMesh = o.mound = o.hole = o.parts = null;
  }
  function buildProps(c) { for (const o of buckets.get(c.key) || []) if (!o.mesh) buildMesh(o); c.props = true; }
  function dropProps(c) { for (const o of buckets.get(c.key) || []) removeMesh(o); c.props = false; }
  function applyState(o) {
    if (!o.mesh) return;
    const s = o.state;
    o.mesh.visible = !s.gone;
    if (o.type === 'palm') { const per = o.nuts.length > 3 ? 2 : 1; o.nuts.forEach((n, i) => { n.visible = i < s.coconuts * per; }); }   // (the studies' palm hangs two for each)
    if (o.type === 'bush') o.berryMesh.visible = !!s.berries;
    if (o.type === 'dig') { o.mound.visible = !s.dug; o.hole.visible = !!s.dug; }
    const th = UI.things[o.type]; if (th && th.state) th.state(o, s);
    resize1(o);
  }
  // Plants grow toward their own full-grown size (see RULES.FLORA).
  function resize1(o) {
    if (!isFlora(o)) return;
    o.size = WG.sizeOf(o, o.state, day, t);
    if (o.mesh) o.mesh.scale.setScalar(o.size);
  }
  const radius = o => isFlora(o) ? o.r * o.size : o.r;
  // Objects in the chunks around a point (for targeting and collisions).
  function nearbyObjects(x, z, fn) {
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of buckets.get(ckey(cx + i, cz + j)) || []) fn(o);
  }

