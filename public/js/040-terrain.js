  // ================= Terrain (streamed in chunks) =================
  // The island is big, so only the area around you is built: square chunks of
  // terrain (1-unit grid) load as you approach and unload behind you.
  const CH = 32, VIEW = 4, PROP_VIEW = 3, DECOR_VIEW = 2;
  const C = h => new THREE.Color(h);
  const cSand = C(0xE9D7AE), cWet = C(0xD4BE92), cDeep = C(0x7E9EAE), cGrassA = C(0xA3B27E), cGrassB = C(0x7F9A64),
    cForest = C(0x6F8A5A), cHigh = C(0x9AA283), cRock = C(0xA9A193), cMoss = C(0x7C9A6B), cSnow = C(0xF1F4F6);
  const tmp = new THREE.Color();
  function smoothT(a, b, x) { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }
  function colorAt(x, z, h) {
    if (h < .05) return tmp.copy(cWet).lerp(cDeep, clamp(-h / 2.5, 0, 1));
    if (h < .95) return tmp.copy(cSand).lerp(cGrassA, smoothT(.75, .95, h));
    tmp.copy(cGrassA).lerp(cGrassB, fbm(x * .12 + 5, z * .12));
    tmp.lerp(cForest, smoothT(.46, .56, WG.forestMask(x, z)) * .7);
    tmp.lerp(cHigh, smoothT(8, 11, h));
    tmp.lerp(cRock, smoothT(14, 18, h) * .9);
    const sp = WG.nearestSpring(x, z); if (Math.hypot(x - sp.x, z - sp.z) < 6) tmp.lerp(cMoss, .4);
    // snow on the Teeth (C6, flag region-teeth), above RULES.TEETH.SNOW_LINE
    const SL = RULES.TEETH.SNOW_LINE;
    if (h > SL - 30 && WG.feature('region-teeth') && WG.regionAt(x, z) === 'teeth') tmp.lerp(cSnow, smoothT(SL - 30, SL + 10, h) * .92);
    return tmp;
  }
  // Ground height on the drawn triangles (same split as PlaneGeometry), so feet
  // and props sit exactly on what you see.
  function groundAt(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const ha = heightAt(ix, iz), hb = heightAt(ix, iz + 1), hc = heightAt(ix + 1, iz + 1), hd = heightAt(ix + 1, iz);
    return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }
  const terrainMat = soft(0xffffff, { vertexColors: true });
  let caveList = [];   // the caves (W9, 135-caves.js): the ground is cut away where a cave's mouth comes up through it
  function buildTerrain(cx, cz) {
    const x0 = cx * CH, z0 = cz * CH, N = CH + 1;
    // heights with a one-cell border so normals match across chunk edges
    const H = new Float32Array((N + 2) * (N + 2));
    let any = false;
    for (let j = 0; j < N + 2; j++) for (let i = 0; i < N + 2; i++) {
      const h = heightAt(x0 + i - 1, z0 + j - 1); H[j * (N + 2) + i] = h; if (h > -4) any = true;
    }
    if (!any) return null;   // open sea: nothing to draw under the water
    const geo = new THREE.PlaneGeometry(CH, CH, CH, CH);
    geo.rotateX(-Math.PI / 2); geo.translate(x0 + CH / 2, 0, z0 + CH / 2);
    const pos = geo.attributes.position, nrm = geo.attributes.normal, cols = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const i = Math.round(pos.getX(v) - x0) + 1, j = Math.round(pos.getZ(v) - z0) + 1, h = H[j * (N + 2) + i];
      pos.setY(v, h);
      const dx = H[j * (N + 2) + i + 1] - H[j * (N + 2) + i - 1], dz = H[(j + 1) * (N + 2) + i] - H[(j - 1) * (N + 2) + i];
      const l = Math.hypot(dx, 2, dz); nrm.setXYZ(v, -dx / l, 2 / l, -dz / l);
      const c = colorAt(pos.getX(v), pos.getZ(v), h); cols[v * 3] = c.r; cols[v * 3 + 1] = c.g; cols[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    // a cave mouth: leave out the triangles where the tunnel comes up through the ground
    if (caveList.some(c => c.bbox[0] < x0 + CH && c.bbox[2] > x0 && c.bbox[1] < z0 + CH && c.bbox[3] > z0)) {
      const idx = geo.index.array, keep = [];
      for (let k = 0; k < idx.length; k += 3) {
        const a = idx[k], b = idx[k + 1], c = idx[k + 2];
        const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3, y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
        if (!Caves.groundCut(caveList, x, z, y)) keep.push(a, b, c);
      }
      geo.setIndex(keep);
    }
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, terrainMat); m.receiveShadow = true;
    return m;
  }

  // The sea is a big plane that follows the camera; waves are computed in world space.
  const SEA_W = 560, SEA_SEG = 112;
  const seaGeo = new THREE.PlaneGeometry(SEA_W, SEA_W, SEA_SEG, SEA_SEG); seaGeo.rotateX(-Math.PI / 2);
  const seaMat = soft(0x6F8FA3, { transparent: true, opacity: .92 });
  const seaInkMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.receiveShadow = true; sea.frustumCulled = false;
  scene.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  // Springs: a pool ringed with stones in each basin.
  const pondMat = soft(0x8FB3BF), pondRock = soft(0xB3AC9F);
  for (const sp of WG.SPRINGS) {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), pondMat);
    pond.rotation.x = -Math.PI / 2; pond.position.set(sp.x, 1.72, sp.z); pond.receiveShadow = true;
    scene.add(pond);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + .2, r = 2.45;
      const m = ball(.35 + (i % 3) * .1, pondRock, 12, 10); m.scale.y = .7;
      const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
      m.position.set(x, heightAt(x, z) + .1, z); m.castShadow = true;
      scene.add(m);
    }
  }

