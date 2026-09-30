  // ================= Far view (task W3, flag `farview`) =================
  // Past the detailed terrain around you, a coarse ring of land reaches out to about 2 km
  // (1 km on phones), with a flat sea beyond, so mountains and the Veil show on the horizon.
  // It uses the terrain's own colours (land behind the Veil is fog-pale) and is rebuilt a few
  // rows per frame as you move. Its shader cuts a hole around you exactly where the detailed
  // chunks are (FAR_HOLE) and sinks it a little near that hole, so the coarse ring never pokes
  // through the real ground. If the frame rate drops, it shrinks.
  const farOn = () => WG.feature('farview') && !lowGfx;
  let FAR_R = coarse ? 1000 : 2000;
  const FAR_N = 72, FAR_SINK = 1.5;
  const FAR_HOLE = 114;   // the detailed chunks (VIEW) always cover 116 m around you, wherever you stand in yours
  const farMe = { value: new THREE.Vector3(0, 0, FAR_HOLE) };   // x, z of the player; hole radius
  const farMat = terrainMat.clone();
  farMat.onBeforeCompile = sh => {
    sh.uniforms.farMe = farMe;
    const head = 'uniform vec3 farMe;\nvarying vec2 vFarXZ;\n';
    sh.vertexShader = head + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vFarXZ = transformed.xz;
      transformed.y -= ${FAR_SINK.toFixed(1)} + 4. * (1. - smoothstep(farMe.z, farMe.z + 60., distance(transformed.xz, farMe.xy)));`);
    sh.fragmentShader = head + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (distance(vFarXZ, farMe.xy) < farMe.z) discard;');
  };
  const farVeil = new THREE.Color(0xE9E4DA);
  let farMesh = null, farJob = null, farCentre = null;
  const farSea = new THREE.Mesh(new THREE.RingGeometry(240, 6000, 72, 1), soft(0x6F8FA3));
  farSea.rotation.x = -Math.PI / 2; farSea.position.y = -.6; farSea.visible = false; farSea.receiveShadow = false;
  scene.add(farSea);
  // Build the ring around a centre, one row of the grid at a time (so walking never stutters).
  function* farBuild(cx, cz, R) {
    const n = FAR_N, cell = R * 2 / n, x0 = Math.round(cx / cell) * cell - R, z0 = Math.round(cz / cell) * cell - R, N = n + 1;
    const H = new Float32Array(N * N), pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = x0 + i * cell, z = z0 + j * cell, h = heightAt(x, z), k = j * N + i;
        H[k] = h;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const c = h > .05 && veilBlocks(x, z) ? farVeil : colorAt(x, z, h);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      yield;
    }
    const nrm = new Float32Array(N * N * 3), idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, dx = H[j * N + Math.min(n, i + 1)] - H[j * N + Math.max(0, i - 1)], dz = H[Math.min(n, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
      const l = Math.hypot(dx, 4 * cell, dz); nrm[k * 3] = -dx / l; nrm[k * 3 + 1] = 4 * cell / l; nrm[k * 3 + 2] = -dz / l;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const mx = x0 + (i + .5) * cell - cx, mz = z0 + (j + .5) * cell - cz, d = Math.hypot(mx, mz);
      if (d > R) continue;
      const a = j * N + i, b = a + 1, c = a + N, e = c + 1;
      if (Math.max(H[a], H[b], H[c], H[e]) < -1) continue;   // open sea: the far sea covers it
      idx.push(a, c, b, b, c, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeBoundingSphere();
    if (farMesh) { scene.remove(farMesh); noInk.delete(farMesh); farMesh.geometry.dispose(); }
    farMesh = new THREE.Mesh(geo, farMat);
    scene.add(farMesh); noInk.add(farMesh);   // too far for ink lines, and it mustn't hide the near ground from them
  }
  // Back to the ordinary view (as it always was): 400 m of camera, haze from 50 to 125 m.
  function farOff() {
    if (farMesh) { scene.remove(farMesh); noInk.delete(farMesh); farMesh.geometry.dispose(); farMesh = null; }
    farJob = null; farCentre = null; farSea.visible = false;
    inkMat.uniforms.farFog.value = 0;
    if (!Cut.on) {
      if (camera.far !== 400 || camera.near !== .1) { camera.far = 400; camera.near = .1; camera.updateProjectionMatrix(); inkMat.uniforms.far.value = 400; inkMat.uniforms.near.value = .1; }
      scene.fog.near = 50; scene.fog.far = 125;
    }
  }
  // For tests and the console: UI.farView.radius = 2000; UI.farView.lock = true (no auto-shrink).
  UI.farView = { get radius() { return FAR_R; }, set radius(v) { FAR_R = v; farCentre = null; }, lock: false, get built() { return !!farMesh && !farJob; }, get mesh() { return farMesh; }, get centre() { return farCentre; } };
  UI.net.on('welcome', () => farOff());   // start again with whatever the server says now
  UI.net.on('regions', () => { farCentre = null; });   // the Veil moved: repaint the horizon
  let fpsT = 0, fpsN = 0;
  UI.onFrame(dt => {
    if (!farOn() || Cut.on) { if (farMesh || farSea.visible) farOff(); return; }
    // camera range and haze reach out to the ring
    const reach = FAR_R + 300;
    if (camera.far !== reach || camera.near !== .25) {
      camera.far = reach; camera.near = .25; camera.updateProjectionMatrix();
      inkMat.uniforms.far.value = reach; inkMat.uniforms.near.value = .25;
    }
    scene.fog.near = 160; scene.fog.far = FAR_R * .98;
    inkMat.uniforms.farFog.value = 1;
    inkMat.uniforms.fogFrontU.value = WG.fogFront(t, fogEnv);
    farSea.visible = true; farSea.position.x = camera.position.x; farSea.position.z = camera.position.z;
    // rebuild when you've moved a couple of cells, a few rows per frame
    const cx = inGame() ? px : TITLE.x, cz = inGame() ? pz : TITLE.z, cell = FAR_R * 2 / FAR_N;
    farMe.value.x = cx; farMe.value.y = cz;
    if (!farJob && (!farCentre || Math.hypot(cx - farCentre.x, cz - farCentre.z) > cell * 2)) { farCentre = { x: cx, z: cz }; farJob = farBuild(cx, cz, FAR_R); }
    if (farJob) { const t0 = performance.now(); while (performance.now() - t0 < 4) if (farJob.next().done) { farJob = null; break; } }
    // a slow machine: pull the horizon in (once every few seconds at most)
    fpsT += dt; fpsN++;
    if (fpsT > 4) {
      if (!UI.farView.lock && fpsN / fpsT < 24 && FAR_R > 600) { FAR_R = Math.max(600, Math.round(FAR_R * .65)); farCentre = null; }
      fpsT = 0; fpsN = 0;
    }
  });

