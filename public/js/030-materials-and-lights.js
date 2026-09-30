  // ================= Materials & lights =================
  // Flat cel shading: three solid tones per colour, like an inked illustration.
  const gradMap = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter; gradMap.needsUpdate = true;
  const matCache = new Map();
  const soft = (c, extra) => {
    const { shininess, specular, ...rest } = extra || {};
    return new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: gradMap }, rest));
  };
  const softShared = c => { if (!matCache.has(c)) matCache.set(c, soft(c)); return matCache.get(c); };
  const shadows = obj => obj.traverse(m => { if (m.isMesh) m.castShadow = true; });
  const ball = (r, m, w = 12, h = 9) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);

  const hemi = new THREE.HemisphereLight(0xFFFFFF, 0xB8A27E, .6);
  const sun = new THREE.DirectionalLight(0xFFF4E0, .9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(hemi, sun, sun.target);

  // A fixed pool of fire lights, moved to the nearest lit fires each frame.
  // (A light per fire would slow things down as the island fills with fire pits.)
  const fireLights = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xFFA25A, 0, 14, 1.6); scene.add(l); fireLights.push(l); }

