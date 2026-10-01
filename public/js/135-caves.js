  // ================= Caves (task W9, flag `caves`) =================
  // Caves you walk into, with no loading: the tunnel is drawn under the ground, the ground is
  // cut away at the mouth (040-terrain.js), and while you're in one (myCave) you walk on its
  // floor between its walls instead of on the ground. Deep inside it's dark, there's no fog,
  // and a torch in someone's hand lights the way. Sea caves fill with the tide.
  // The shapes come from the server in `welcome.caves` (server/shared/caves.js does the maths
  // on both sides). See docs/roadmap/CONTRACTS.md section 18.
  const CAVE = Caves.CAVE;
  let myCave = null;          // the cave you're in, or null above ground
  let caveDraw = [];          // { cave, mesh, water }
  const caveById = id => caveList.find(c => c.id === id) || null;
  // The floor under a frog in cave `id` (falls back to the ground if they've just left it).
  function caveFloorAt(id, x, z) { const c = caveById(id), hit = c && Caves.caveHit(c, x, z); return hit ? hit.floor : groundAt(x, z); }
  const caveRock = new THREE.Color(0x857D72), caveSand = new THREE.Color(0x9A8A6C), caveTmp = new THREE.Color();
  const caveMat = soft(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
  const caveWaterMat = soft(0x5E8494, { transparent: true, opacity: .88 });

  // Split a cave's segments into chains of node indices (the main way in, then any branch).
  function caveChains(cave) {
    const chains = [];
    for (const [i, j] of cave.segs) {
      const last = chains[chains.length - 1];
      if (last && last[last.length - 1] === i) last.push(j); else chains.push([i, j]);
    }
    return chains;
  }
  // The tunnel as one mesh: a ring (flat floor, straight walls, an arched roof) every ~0.6 m
  // along each chain, rounded shut at dead ends. Where a branch meets the main way, each
  // leaves out the triangles that fall inside the other, so they open into one another.
  function buildCave(cave) {
    const FLOOR = [-1, -.5, 0, .5, 1], WALL = [.15, .35, .6, .8], ARCH = 11, P = FLOOR.length + WALL.length * 2 + ARCH;
    const pos = [], col = [], idx = [], widx = [], wpos = [];
    const chains = caveChains(cave);
    const others = chains.map((ch, ci) => ({ nodes: cave.nodes, bbox: cave.bbox, segs: chains.flatMap((c2, cj) => (cj === ci ? [] : c2.slice(1).map((n, k) => [c2[k], n]))) }));
    const bump = (s, a) => fbm(s * .35 + a * 1.7, a * 2.3 + cave.nodes.length);
    chains.forEach((chain, ci) => {
      // samples along the chain
      const S = [];
      for (let k = 0; k < chain.length - 1; k++) {
        const A = cave.nodes[chain[k]], B = cave.nodes[chain[k + 1]], L = Math.hypot(B.x - A.x, B.z - A.z), n = Math.max(1, Math.round(L / .6));
        for (let q = k === 0 ? 0 : 1; q <= n; q++) { const u = q / n; S.push({ x: A.x + (B.x - A.x) * u, z: A.z + (B.z - A.z) * u, y: A.y + (B.y - A.y) * u, w: A.w + (B.w - A.w) * u, h: A.h + (B.h - A.h) * u, s: A.s + (B.s - A.s) * u }); }
      }
      S.forEach((p, i) => { const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; p.dx = (b.x - a.x) / l; p.dz = (b.z - a.z) / l; });
      // a dead end: shrink to a rounded end past the last node
      const e = S[S.length - 1];
      for (let k = 1; k <= 3; k++) { const ang = k / 3 * Math.PI / 2; S.push({ ...e, x: e.x + e.dx * e.w * Math.sin(ang) * .95, z: e.z + e.dz * e.w * Math.sin(ang) * .95, lat: k === 3 ? 0 : Math.cos(ang), cap: true }); }
      const base = pos.length / 3;
      for (const p of S) {
        const rx = -p.dz, rz = p.dx, lat = p.lat ?? 1;
        const put = (u, y, floor, out) => {
          const L = u * p.w * lat * (1 + out);
          pos.push(p.x + rx * L, y, p.z + rz * L);
          const dark = cave.sea ? Math.min(1, p.s / 16) : 1;
          caveTmp.copy(floor ? caveSand : caveRock).lerp(caveRock, floor ? dark * .6 : 0).multiplyScalar(.85 + bump(p.s, u * 3) * .3);
          col.push(caveTmp.r, caveTmp.g, caveTmp.b);
        };
        // the ring: floor, the right wall up, the arch over, the left wall down (walls in bands,
        // so a branch's opening can be cut out of them neatly)
        for (const u of FLOOR) put(u, p.y, true, 0);
        for (const f of WALL) put(1, p.y + p.h * CAVE.WALL * f, false, 0);
        for (let k = 0; k < ARCH; k++) {
          const a = k / (ARCH - 1) * Math.PI, u = Math.cos(a), n = p.cap ? 0 : bump(p.s, a) * .14;
          put(u, Caves.roofAt(p.y, p.w, p.h, Math.abs(u) * p.w) + n * p.h * Math.sin(a) * .5, false, n);
        }
        for (const f of [...WALL].reverse()) put(-1, p.y + p.h * CAVE.WALL * f, false, 0);
      }
      // quads between rings; skip the ones inside another chain (the opening at a junction)
      const inOther = (a, b, c) => {
        const x = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, y = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, z = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
        const hit = others[ci].segs.length && Caves.caveHit(others[ci], x, z);
        // (a branch reaches a little way into the passage it leaves, and the main way keeps a
        // little wall above and below the opening, so no gaps show where they meet)
        return hit && (ci > 0 ? hit.d < hit.w - .7 && y > hit.floor - .1 && y < hit.roof + .1 : hit.d < hit.w * .97 && y > hit.floor + .12 && y < hit.roof - .12);
      };
      for (let i = 0; i < S.length - 1; i++) {
        for (let k = 0; k < P; k++) {
          const a = base + i * P + k, b = base + i * P + (k + 1) % P, c = a + P, d = b + P;
          for (const tri of [[a, c, b], [b, c, d]]) {
            if ((ci > 0 || k >= FLOOR.length - 1) && inOther(...tri)) continue;   // the main way keeps its floor where a branch starts
            idx.push(...tri);
            if (k < FLOOR.length - 1 && !S[i + 1].cap) widx.push(...tri);   // floor: also the water's shape
          }
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, caveMat); mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    let water = null;
    if (cave.sea) {   // the tide inside: the floor's shape, raised to the water's height
      for (let v = 0; v < pos.length; v += 3) wpos.push(pos[v], 0, pos[v + 2]);
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      wg.setIndex(widx); wg.computeVertexNormals();
      for (let v = 1; v < wg.attributes.normal.array.length; v += 3) wg.attributes.normal.array[v] = Math.abs(wg.attributes.normal.array[v]);   // face up
      water = new THREE.Mesh(wg, caveWaterMat); water.frustumCulled = false;
      scene.add(water);
    }
    return { cave, mesh, water };
  }
  function clearCaves() {
    for (const d of caveDraw) { scene.remove(d.mesh); d.mesh.geometry.dispose(); if (d.water) { scene.remove(d.water); d.water.geometry.dispose(); } }
    caveDraw = [];
  }

  // The sea is one big plane at sea level; inside a cave's footprint it mustn't show through
  // the floor. A mask texture over the nearest cave tells the sea's shader where not to draw.
  const MASK_N = 128, caveMaskData = new Uint8Array(MASK_N * MASK_N * 4);
  const caveMask = new THREE.DataTexture(caveMaskData, MASK_N, MASK_N, THREE.RGBAFormat);
  caveMask.magFilter = caveMask.minFilter = THREE.NearestFilter;
  const caveBox = { value: new THREE.Vector4(0, 0, 1, 0) };   // x0, z0, size, on
  let maskFor = null;
  function fillMask(c) {
    maskFor = c;
    if (!c) { caveBox.value.w = 0; return; }
    const [x0, z0, x1, z1] = c.bbox, size = Math.max(x1 - x0, z1 - z0);
    for (let j = 0; j < MASK_N; j++) for (let i = 0; i < MASK_N; i++) {
      const hit = Caves.caveHit(c, x0 + (i + .5) / MASK_N * size, z0 + (j + .5) / MASK_N * size);
      caveMaskData[(j * MASK_N + i) * 4] = hit && hit.d < hit.w + .4 ? 255 : 0;
    }
    caveMask.needsUpdate = true;
    caveBox.value.set(x0, z0, size, 1);
  }
  for (const m of [seaMat, seaInkMat]) {
    m.onBeforeCompile = sh => {
      sh.uniforms.caveMask = { value: caveMask }; sh.uniforms.caveBox = caveBox;
      sh.vertexShader = 'varying vec2 vCaveXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCaveXZ = (modelMatrix * vec4(transformed, 1.)).xz;');
      sh.fragmentShader = 'uniform sampler2D caveMask; uniform vec4 caveBox; varying vec2 vCaveXZ;\n' + sh.fragmentShader.replace('void main() {',
        'void main() {\n  if (caveBox.w > .5) { vec2 cu = (vCaveXZ - caveBox.xy) / caveBox.z; if (cu.x > 0. && cu.y > 0. && cu.x < 1. && cu.y < 1. && texture2D(caveMask, cu).r > .5) discard; }');
    };
    m.needsUpdate = true;
  }

  // Walking. Where would a step to (nx, nz) take you?
  //   { k: 'surface' }  the ground, as usual (exit: true when it takes you out of a cave)
  //   { k: 'in', cave, hit }  a cave floor (enter: true when it takes you in)
  //   { k: 'block' }  a wall, deep water, or too big a step
  const SURF = { k: 'surface' }, BLOCK = { k: 'block' };
  let caveSaid = 0;
  function caveSay(msg) { const now = performance.now(); if (now - caveSaid > 6000) { caveSaid = now; toast(msg); } }
  function caveStep(nx, nz) {
    if (!caveList.length) return SURF;
    if (myCave) {
      const hit = Caves.caveHit(myCave, nx, nz), cur = Caves.caveHit(myCave, px, pz);
      if (hit) {
        const lv = Caves.waterLevel(myCave, t);
        if (lv != null && lv - hit.floor > CAVE.PUSH && (!cur || lv - hit.floor > lv - cur.floor)) { caveSay('The water is too deep that way.'); return BLOCK; }
        return { k: 'in', cave: myCave, hit };
      }
      // out of the cave: only at the mouth, onto ground about as high as the floor
      const g = heightAt(nx, nz);
      if (!cur || cur.s > CAVE.MOUTH || Caves.groundCut(caveList, nx, nz, g) || Math.abs(g - cur.floor) > CAVE.STEP_UP) return BLOCK;
      return { k: 'surface', exit: true };
    }
    const hit = Caves.caveAt(caveList, nx, nz);
    if (!hit) return SURF;
    const g = heightAt(nx, nz);
    if (!Caves.groundCut(caveList, nx, nz, g)) return SURF;   // on the ground above a cave
    // stepping onto a cave's floor: only at its mouth, from ground about as high
    if (hit.s > CAVE.MOUTH || Math.abs(hit.floor - heightAt(px, pz)) > CAVE.STEP_UP) return BLOCK;
    const lv = Caves.waterLevel(hit.cave, t);
    if (lv != null && lv - hit.floor > CAVE.PUSH - .2) { caveSay('The sea fills the cave’s mouth. It might be open at low tide.'); return BLOCK; }
    return { k: 'in', cave: hit.cave, hit, enter: true };
  }
  // The step was taken.
  function caveCommit(r) {
    if (r.enter) {
      myCave = r.cave;
      if (!(stats.inv.torch > 0)) caveSay('It gets dark quickly in here. A torch would help.');
    } else if (r.exit) myCave = null;
    if (hero) hero.under = myCave ? myCave.id : 0;
  }
  // How deep the water is where you stand (0 if none), and your floor.
  const caveDepth = () => { const hit = myCave && Caves.caveHit(myCave, px, pz), lv = hit && Caves.waterLevel(myCave, t); return lv != null && hit ? Math.max(0, lv - hit.floor) : 0; };
  const myFloor = () => (myCave ? caveFloorAt(myCave.id, px, pz) : null);

  // Keep the camera inside the tunnel: as far back as it wants to be if that's still inside,
  // ducking under the roof, otherwise pulled in towards you.
  const camTo = new THREE.Vector3();
  function caveCamera() {
    const f = myFloor(), head = f + 1.3 + (camLift || 0);
    camTo.copy(camera.position);
    for (let k = 1; k >= 0; k -= .05) {
      const x = px + (camTo.x - px) * k, z = pz + (camTo.z - pz) * k, hit = Caves.caveHit(myCave, x, z);
      if (!(hit && hit.d < hit.w - .3) && k > .05) continue;
      const y = hit ? Math.max(hit.floor + .6, Math.min(head + (camTo.y - head) * k, hit.roof - .35)) : head + .2;
      camera.position.set(x, y, z);
      break;
    }
    camera.lookAt(px, head, pz);
  }

  // Torchlight: a small pool of lights on the nearest torches (yours first).
  const torchLights = [];
  for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xFFA84A, 0, 13, 1.5); scene.add(l); torchLights.push(l); }
  const torchV = new THREE.Vector3();
  function torchOf(av) { return av && av.heldKey === 'torch' && av.held && av.held.userData.flame; }

  UI.net.on('welcome', m => {
    const list = WG.feature('caves') ? (m.caves || []) : [];
    const was = caveList.map(c => c.id).join(','), now = list.map(c => c.id).join(',');
    caveList = list; myCave = null; if (hero) hero.under = 0;
    // the outline pass must see the tunnel from inside too (its insides are the backs of its faces)
    normalMat.side = caveList.length ? THREE.DoubleSide : THREE.FrontSide;
    if (was !== now) {
      clearCaves();
      caveDraw = caveList.map(buildCave);
      // the ground at the mouths changes: rebuild those chunks, and take away anything standing there
      for (const c of [...chunks.values()]) if (caveList.some(cv => cv.bbox[0] < (c.cx + 1) * CH && cv.bbox[2] > c.cx * CH && cv.bbox[1] < (c.cz + 1) * CH && cv.bbox[3] > c.cz * CH)) unloadChunk(c);
      for (const [k, list2] of buckets) {
        const keep = list2.filter(o => !(caveList.length && Caves.groundCut(caveList, o.x, o.z, heightAt(o.x, o.z))) || (removeMesh(o), false));
        if (keep.length !== list2.length) buckets.set(k, keep);
      }
      fillMask(null);
    }
    m.players.forEach(p => { const r = remotes.get(p.id); if (r) r.av.under = p.under || 0; });
  });
  UI.net.on('join', m => { const r = remotes.get(m.player.id); if (r) r.av.under = m.player.under || 0; });
  UI.net.on('snap', m => { for (const e of m.p) { const r = remotes.get(e[0]); if (r) r.av.under = e[7] || 0; } });
  UI.net.on('correct', m => { if (m.under != null) { myCave = m.under ? caveById(m.under) : null; if (hero) hero.under = myCave ? myCave.id : 0; } });
  UI.net.on('respawned', () => { myCave = null; if (hero) hero.under = 0; });

  // For tests and the console (__dbg.cave()): where you are, and a real step (walk) past the checks.
  function caveDbg() {
    return { in: myCave ? myCave.id : null, dark: caveDk, caves: caveList, level: caveList[0] && Caves.waterLevel(caveList[0], t), lights: torchLights.map(l => l.intensity),
      walk: (x, z) => { const r = caveStep(x, z); if (r.k !== 'block') { px = x; pz = z; caveCommit(r); } return r.k; } };
  }
  let caveDk = 0, maskT = 0;
  UI.onFrame(dt => {
    if (!caveList.length) { torchLights.forEach(l => { l.intensity = 0; }); return; }
    // the sea's mask follows the nearest cave
    if ((maskT -= dt) <= 0) {
      maskT = 1;
      let best = null, bd = 220;
      for (const c of caveList) { const d = Math.hypot((c.bbox[0] + c.bbox[2]) / 2 - camera.position.x, (c.bbox[1] + c.bbox[3]) / 2 - camera.position.z); if (d < bd) { bd = d; best = c; } }
      if (best !== maskFor) fillMask(best);
    }
    // the tide inside sea caves
    for (const d of caveDraw) if (d.water) { d.water.position.y = Caves.waterLevel(d.cave, t); d.water.visible = !Cut.on; }
    // underground: the camera stays inside, daylight fades with depth, no fog
    const hit = myCave && inGame() ? Caves.caveHit(myCave, px, pz) : null;
    caveDk += ((hit ? Caves.darkness(hit) : 0) - caveDk) * Math.min(1, dt * 2);
    if (myCave && inGame() && !Cut.on) caveCamera();
    if (caveDk > .01) {
      sun.intensity *= 1 - caveDk * .97; hemi.intensity *= 1 - caveDk * .9;
      mist.visible = caveDk < .5; clouds.forEach(c => { c.visible = caveDk < .5; });
    } else if (!Cut.on) { mist.visible = true; clouds.forEach(c => { c.visible = true; }); }
    if (myCave) inkMat.uniforms.seeFar.value = 0;
    // torches: yours, then the nearest others (with the torchlight flag, 138-torches.js lights them everywhere)
    if (WG.feature('torchlight')) { torchLights.forEach(l => { l.intensity = 0; }); return; }
    const lit = [];
    const mine = torchOf(hero); if (mine) lit.push(mine);
    remotes.forEach(r => { const f = torchOf(r.av); if (f) lit.push(f); });
    const now = performance.now() / 1000;
    torchLights.forEach((l, i) => {
      const f = lit[i];
      if (!f) { l.intensity = 0; return; }
      f.getWorldPosition(torchV); l.position.copy(torchV); l.position.y += .15;
      l.intensity = 1.5 + Math.sin(now * 13 + i * 2) * .18 + Math.sin(now * 7.3 + i) * .12;
      f.scale.set(1, 1 + Math.sin(now * 17 + i) * .18, 1);
    });
  });
