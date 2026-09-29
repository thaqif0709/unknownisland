// Unknown Island client: rendering (three.js, soft and cute), input,
// login screens, and talking to the server. The server decides what actually
// happens; this file predicts your own movement and draws everything.
(() => {
  'use strict';
  const WG = window.WorldGen;
  const { heightAt, fbm, clamp, SPRING, SPAWN, ISL, mulberry32, isNight, phaseName } = WG;
  let RULES = WG.RULES;

  // ================= Renderer =================
  const stage = document.getElementById('stage');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  let PR = Math.min(window.devicePixelRatio || 1, 2);   // lowered by the Low graphics setting
  renderer.setPixelRatio(PR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xEFE3C8, 50, 125);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 400);

  // ================= Ink pass =================
  // Illustration look: the scene is drawn once for colour + depth and once for
  // normals; a full-screen pass then inks every silhouette and crease with a
  // thick dark line and adds a little paper grain.
  const colorRT = new THREE.WebGLRenderTarget(2, 2);
  colorRT.depthTexture = new THREE.DepthTexture(2, 2);
  colorRT.depthTexture.type = THREE.UnsignedIntType;
  const normalRT = new THREE.WebGLRenderTarget(2, 2);
  const normalMat = new THREE.MeshNormalMaterial();
  // Fog map: a small texture around you holding fog density (0-1) from the
  // shared fog rule, so the fog drawn here is the same fog the server uses.
  const FOG_N = 64, FOG_CELL = 4, FOG_SIZE = FOG_N * FOG_CELL;
  const fogData = new Uint8Array(FOG_N * FOG_N * 4);
  const fogTex = new THREE.DataTexture(fogData, FOG_N, FOG_N, THREE.RGBAFormat);
  fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter;
  const fogOrigin = new THREE.Vector2();
  const inkMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorRT.texture }, tDepth: { value: colorRT.depthTexture }, tNormal: { value: normalRT.texture },
      res: { value: new THREE.Vector2(1, 1) }, width: { value: 2 }, near: { value: camera.near }, far: { value: camera.far },
      useNormals: { value: 1 },
      ink: { value: new THREE.Color(0x2B211F) },
      fogTex: { value: fogTex }, fogOrigin: { value: fogOrigin }, fogSize: { value: FOG_SIZE },
      invProj: { value: camera.projectionMatrixInverse }, camWorld: { value: camera.matrixWorld }, camPos: { value: camera.position },
      night: { value: 0 }, time: { value: 0 }, dread: { value: 0 }, seeFar: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      uniform sampler2D tColor, tDepth, tNormal, fogTex;
      uniform vec2 res, fogOrigin; uniform float width, near, far, useNormals, fogSize, night, time, dread, seeFar;
      uniform vec3 ink, camPos; uniform mat4 invProj, camWorld;
      varying vec2 vUv;
      float lin(vec2 uv){ float z = texture2D(tDepth, uv).x * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
      vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).rgb * 2. - 1.; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
      float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
      float bayer(vec2 a){ return b2(.5 * a) * .25 + b2(a); }
      float fogField(vec2 xz){
        vec2 f = (xz - fogOrigin) / fogSize;
        if (f.x < 0. || f.y < 0. || f.x > 1. || f.y > 1.) return 1.;   // beyond the map: assume the worst
        return texture2D(fogTex, f).r;
      }
      void main(){
        // dread: the lines start to tremble
        vec2 jit = vec2(sin(time * 23. + vUv.y * 90.), cos(time * 19. + vUv.x * 70.)) * dread * dread * 1.6 / res;
        vec2 uv = vUv + jit;
        vec4 c4 = texture2D(tColor, uv);
        vec3 col = c4.rgb;
        float raw = texture2D(tDepth, uv).x;
        float d0 = lin(uv);
        bool sky = d0 >= far * .98;
        // ---- fog: density along the view, from where you stand and where you look ----
        float fCam = fogField(camPos.xz);
        float fog = fCam * .85;
        if (!sky) {
          vec4 v = invProj * vec4(uv * 2. - 1., raw * 2. - 1., 1.); v /= v.w;
          vec3 wp = (camWorld * v).xyz;
          float fPix = fogField(wp.xz);
          fog = max(max(fPix * smoothstep(1.5, 18., d0), fCam * smoothstep(2., 16., d0)), fPix * .35);
        }
        fog = clamp(fog * (.85 + noise(gl_FragCoord.xy * .015 + time * .06) * .3) * seeFar, 0., 1.);
        float bay = bayer(floor(gl_FragCoord.xy / 2.));
        // ---- ink lines (they blow out wider as dread rises) ----
        float e = 0.;
        if (!sky) {
          vec3 n0 = nrm(uv);
          vec2 o = width * (1. + dread * 1.3) / res;
          for (int i = 0; i < 4; i++) {
            vec2 dir = i == 0 ? vec2(1., 0.) : i == 1 ? vec2(-1., 0.) : i == 2 ? vec2(0., 1.) : vec2(0., -1.);
            vec2 suv = uv + dir * o;
            float d = lin(suv);
            e = max(e, smoothstep(.03, .06, (d - d0) / d0));
            if (useNormals > .5) e = max(e, smoothstep(.45, .7, 1. - dot(n0, nrm(suv))));
          }
          e *= 1. - smoothstep(60., 120., d0);
          e *= mix(1., step(fog * .95, bay), fog);   // in fog, the linework dissolves into dots
        }
        col = mix(col, ink, e * .92);
        // ---- fog is drawn as stipple and cross-hatching that swallows the design ----
        vec3 fogTint = mix(vec3(.66, .63, .58), vec3(.22, .2, .21), night);
        col = mix(col, fogTint, fog * .5);
        vec2 fp = gl_FragCoord.xy;
        float stip = bay < fog * .85 ? 1. : 0.;
        float h1 = step(.8, fract((fp.x + fp.y) / 6.)) * smoothstep(.45, .6, fog);
        float h2 = step(.8, fract((fp.x - fp.y) / 6.)) * smoothstep(.7, .85, fog);
        float mark = max(stip * .75, max(h1, h2));
        col = mix(col, mix(vec3(.45, .42, .4), ink, .2 + night * .8), mark * .7);
        // ---- dread: colour drains, stippling spreads, ink creeps in from the edges ----
        float l = dot(col, vec3(.299, .587, .114));
        col = mix(col, vec3(l), dread * .85);
        col = mix(col, ink, (bay < dread * .45 ? 1. : 0.) * step(l, .6));
        vec2 q = (vUv - .5) * vec2(res.x / res.y, 1.);
        float edge = length(q) * 1.1 + (noise(vUv * 5. + time * .04) - .5) * .4;
        col = mix(col, ink, smoothstep(.0, .04, edge - (1.3 - dread * .8)));
        // The Stilled: negative space. No outline, no shading, no fog tint, only
        // a little of the fog's stipple nibbling at them so they're half seen.
        if (c4.a < .5) col = mix(c4.rgb, vec3(.55, .52, .48), mark * .35);
        col *= .96 + hash(floor(gl_FragCoord.xy / 2.)) * .06;           // paper grain
        gl_FragColor = vec4(col, 1.);
      }`,
    depthTest: false, depthWrite: false,
  });
  // Rebuild the fog map around a point (a few times a second).
  const fogHeights = new Map();
  let fogEnv = {};
  function updateFogMap(cx, cz, tt, lights) {
    const ox = Math.floor(cx / FOG_CELL) * FOG_CELL - FOG_SIZE / 2, oz = Math.floor(cz / FOG_CELL) * FOG_CELL - FOG_SIZE / 2;
    fogOrigin.set(ox, oz);
    if (fogHeights.size > 30000) fogHeights.clear();
    for (let j = 0; j < FOG_N; j++) for (let i = 0; i < FOG_N; i++) {
      const x = ox + (i + .5) * FOG_CELL, z = oz + (j + .5) * FOG_CELL, k = x + ',' + z;
      let h = fogHeights.get(k); if (h === undefined) { h = heightAt(x, z); fogHeights.set(k, h); }
      fogData[(j * FOG_N + i) * 4] = WG.fogAt(x, z, h, tt, lights, fogEnv) * 255;
    }
    fogTex.needsUpdate = true;
  }
  const inkScene = new THREE.Scene();
  inkScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), inkMat));
  const inkCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const noInk = new Set();   // things drawn with their own outlines (clouds), hidden from the normal pass

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

  // ================= Terrain (streamed in chunks) =================
  // The island is big, so only the area around you is built: square chunks of
  // terrain (1-unit grid) load as you approach and unload behind you.
  const CH = 32, VIEW = 4, PROP_VIEW = 3, DECOR_VIEW = 2;
  const C = h => new THREE.Color(h);
  const cSand = C(0xE9D7AE), cWet = C(0xD4BE92), cDeep = C(0x7E9EAE), cGrassA = C(0xA3B27E), cGrassB = C(0x7F9A64),
    cForest = C(0x6F8A5A), cHigh = C(0x9AA283), cRock = C(0xA9A193), cMoss = C(0x7C9A6B);
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

  // ================= Swirl clouds =================
  // Curly clouds like the manes and smoke in tattoo flash, drawn on a canvas
  // with their own ink outline and drifting slowly around the island.
  // Three kinds: long and flat, tall and stacked, or a small puff. Sizes and curls vary.
  function cloudTexture(seed) {
    const r = mulberry32(seed), c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const kind = r() < .4 ? 'long' : r() < .6 ? 'tall' : 'small';
    const puffs = [];
    const n = kind === 'long' ? 6 + ((r() * 3) | 0) : kind === 'tall' ? 5 : 3 + ((r() * 2) | 0);
    const x0 = kind === 'small' ? 170 : 70, x1 = kind === 'small' ? 340 : 440;
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? i / (n - 1) : .5;
      const rad = (kind === 'long' ? 30 : 42) + r() * (kind === 'small' ? 22 : 26);
      puffs.push([x0 + (x1 - x0) * k + (r() - .5) * 24, 180 - Math.sin(k * Math.PI) * (kind === 'long' ? 34 : 56) + (r() - .5) * 18, rad]);
    }
    if (kind === 'tall') for (let i = 0; i < 3; i++) puffs.push([180 + i * 70 + (r() - .5) * 30, 95 + (r() - .5) * 20, 34 + r() * 16]);
    for (const p of puffs) p[2] = Math.min(p[2], p[1] - 10, 246 - p[1], p[0] - 10, 502 - p[0]);
    g.fillStyle = '#2B211F'; puffs.forEach(([x, y, rad]) => { g.beginPath(); g.arc(x, y, rad + 7, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#F3E3BE'; puffs.forEach(([x, y, rad]) => { g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#E2C78F'; puffs.forEach(([x, y, rad]) => { g.beginPath(); g.arc(x + rad * .18, y + rad * .22, rad * .72, 0, Math.PI * 2); g.fill(); });
    const curls = r() < .5 ? 2 : 1;
    puffs.forEach(([x, y, rad], i) => {
      if ((i + seed) % (curls + 1)) return;
      const turns = 2.6 + r() * 1.2, dirn = r() < .5 ? 1 : -1;
      g.beginPath();
      for (let a = 0; a < Math.PI * turns; a += .1) { const rr = rad * .55 * (1 - a / (Math.PI * (turns + .4))); g.lineTo(x + Math.cos(dirn * a + 2) * rr, y + Math.sin(dirn * a + 2) * rr); }
      g.lineWidth = 6; g.lineCap = 'round'; g.strokeStyle = '#2B211F'; g.stroke();
    });
    const t = new THREE.CanvasTexture(c);
    t.userData = { kind };
    return t;
  }
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const map = cloudTexture(100 + i * 7);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, fog: false, depthWrite: false }));
    const bx = WG.hash2(i, 1) * 260, bz = WG.hash2(i, 2) * 260;
    const w = map.userData.kind === 'small' ? 16 + WG.hash2(i, 3) * 8 : 28 + WG.hash2(i, 3) * 20;
    sp.userData = { bx, bz, y: 48 + (i % 4) * 5 + WG.hash2(i, 4) * 6, speed: .6 + WG.hash2(i, 5) * .6 };
    sp.scale.set(w, w / 2, 1);
    scene.add(sp); clouds.push(sp); noInk.add(sp);
  }

  // Smoky mist: a soft, continuous haze around the horizon. Built from many
  // overlapping soft blobs (no outlines), faded out at the top and bottom, and
  // drawn so the left and right edges wrap without a seam.
  function mistTexture() {
    const W = 2048, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = mulberry32(77);
    const puff = (x, y, rx, ry, a) => {
      for (const ox of [-W, 0, W]) {   // wrap around
        const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
        grd.addColorStop(0, `rgba(243,232,208,${a})`); grd.addColorStop(.55, `rgba(238,226,200,${a * .55})`); grd.addColorStop(1, 'rgba(236,224,198,0)');
        g.save(); g.translate(x + ox, y); g.scale(1, ry / rx); g.translate(-(x + ox), -y);
        g.fillStyle = grd; g.beginPath(); g.arc(x + ox, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
      }
    };
    for (let i = 0; i < 90; i++) puff(r() * W, 110 + (r() - .5) * 70, 120 + r() * 220, 30 + r() * 40, .12 + r() * .16);
    for (let i = 0; i < 40; i++) puff(r() * W, 105 + (r() - .5) * 40, 60 + r() * 90, 14 + r() * 16, .1 + r() * .12);   // denser wisps
    // fade to nothing at the top and bottom so it melts into the sky
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(.3, 'rgba(0,0,0,1)'); fade.addColorStop(.62, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2;
    return t;
  }
  const mist = new THREE.Mesh(new THREE.CylinderGeometry(220, 220, 90, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: mistTexture(), transparent: true, opacity: .85, side: THREE.BackSide, fog: false, depthWrite: false }));
  mist.renderOrder = -1;
  scene.add(mist); noInk.add(mist);

  // Sun and moon: inked discs that follow the real sky path. East is +x, north is -z;
  // the sun rises in the east, passes a little to the south, and sets in the west.
  // The moon is opposite, so it rises in the east as the sun sets.
  const SUN_TILT = .3;
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  function discTexture(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    if (kind === 'sun') {
      g.strokeStyle = '#2B211F'; g.lineWidth = 7; g.lineCap = 'round';
      for (let i = 0; i < 12; i++) {   // short wavy rays
        const a = i / 12 * Math.PI * 2;
        g.beginPath(); g.moveTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84);
        g.quadraticCurveTo(128 + Math.cos(a + .12) * 100, 128 + Math.sin(a + .12) * 100, 128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116); g.stroke();
      }
      g.fillStyle = '#2B211F'; g.beginPath(); g.arc(128, 128, 76, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#F2C45A'; g.beginPath(); g.arc(128, 128, 69, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#E8A640'; g.beginPath(); g.arc(140, 140, 48, 0, Math.PI * 2); g.fill();
    } else {
      // kind is 'moon' + phase (0-7). 0 is the Drowning Moon: dark, rimmed in sea-green.
      const ph = +kind.slice(4) || 0, R = 73, lit = '#F3EAD6', dark = ph === 0 ? '#27403F' : '#4A4658';
      g.fillStyle = '#2B211F'; g.beginPath(); g.arc(128, 128, 80, 0, Math.PI * 2); g.fill();
      g.fillStyle = dark; g.beginPath(); g.arc(128, 128, R, 0, Math.PI * 2); g.fill();
      if (ph === 0) { g.strokeStyle = '#6FA39A'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, R - 4, 0, Math.PI * 2); g.stroke(); }
      else {
        // lit half (right while waxing, left while waning), then the terminator as an ellipse
        const waxing = ph < 4, k = Math.cos(ph / 8 * Math.PI * 2);   // 1 new, -1 full
        g.fillStyle = lit; g.beginPath(); g.arc(128, 128, R, -Math.PI / 2, Math.PI / 2, !waxing); g.closePath(); g.fill();
        g.fillStyle = k > 0 ? dark : lit; g.beginPath(); g.ellipse(128, 128, Math.max(.5, R * Math.abs(k)), R, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(160,150,130,.5)'; [[106, 150, 10], [150, 104, 8], [140, 160, 6]].forEach(([x, y, rr]) => { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); });
      }
    }
    return new THREE.CanvasTexture(c);
  }
  const moonTex = [];
  const moonTexture = ph => moonTex[ph] || (moonTex[ph] = discTexture('moon' + ph));
  const skyDisc = kind => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(kind), transparent: true, fog: false, depthWrite: false }));
    sp.scale.set(kind === 'sun' ? 46 : 34, kind === 'sun' ? 46 : 34, 1); sp.renderOrder = -2;
    scene.add(sp); noInk.add(sp); return sp;
  };
  const sunDisc = skyDisc('sun'), moonDisc = skyDisc('moon4');
  let env = { phase: 4, lightMul: 1 };
  function setEnv(e) {
    env = Object.assign({ lightMul: 1 }, e || {});
    fogEnv = { drowning: !!env.drowning, fogStorm: !!env.fogStorm, calm: !!env.calm, press: !!env.press };
    moonDisc.material.map = moonTexture(env.phase || 0); moonDisc.material.needsUpdate = true;
    fogTimer = 0;
  }

  // Rain: short inked streaks falling around the camera.
  const rain = (() => {
    const N = 900, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 6), seed = [];
    const r = mulberry32(99);
    for (let i = 0; i < N; i++) seed.push([r() * 40 - 20, r() * 24, r() * 40 - 20, .8 + r() * .4]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x5E6A74, transparent: true, opacity: .55, fog: false }));
    lines.frustumCulled = false; lines.visible = false;
    scene.add(lines); noInk.add(lines);
    return { update(elapsed, on, heavy, cx, cy, cz) {
      lines.visible = on; if (!on) return;
      const n = heavy ? N : N / 2, fall = heavy ? 26 : 18, slant = heavy ? .35 : .12;
      for (let i = 0; i < N; i++) {
        const [ox, oy, oz, sp] = seed[i], y = cy - 8 + ((oy - elapsed * fall * sp) % 24 + 24) % 24;
        const x = cx + ox, z = cz + oz, j = i * 6;
        if (i >= n) { pos.fill(0, j, j + 6); pos[j + 1] = pos[j + 4] = -99; continue; }
        pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; pos[j + 3] = x + slant; pos[j + 4] = y + .7; pos[j + 5] = z;
      }
      geo.attributes.position.needsUpdate = true;
    } };
  })();
  let flash = 0, nextFlash = 8, tremor = 0, nextTremor = 20;   // lightning; small tremors on Drowning nights

  // Fireflies: soft blinking lights over the grass and among the trees at night.
  const fireflies = (() => {
    // They live in an 80-unit window that follows you (wrapping in world space),
    // so there are always some nearby without simulating the whole island.
    const N = 150, WIN = 80, r = mulberry32(555), base = [];
    for (let i = 0; i < N; i++) base.push({ ox: r() * WIN, oz: r() * WIN, ph: r() * 6.28, sp: .6 + r() * .9, ph2: r() * 6.28, cx: NaN, cz: NaN, h: 0 });
    const wrap = (v, c) => c + ((((v - c) % WIN) + WIN * 1.5) % WIN) - WIN / 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,220,1)'); grd.addColorStop(.25, 'rgba(230,245,140,.9)'); grd.addColorStop(1, 'rgba(200,230,90,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .55, map: new THREE.CanvasTexture(c), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false;
    scene.add(pts); noInk.add(pts);
    return { pts, base, update(elapsed, amount, fx, fz) {
      pts.visible = amount > .01;
      if (!pts.visible) return;
      const p = geo.attributes.position.array, col = geo.attributes.color.array;
      base.forEach((f, i) => {
        const { ph, sp, ph2 } = f, x = wrap(f.ox, fx), z = wrap(f.oz, fz);
        if (Math.abs(x - f.cx) > .5 || Math.abs(z - f.cz) > .5) { f.cx = x; f.cz = z; f.h = heightAt(x, z); f.land = f.h > 1.1 && f.h < 12; }
        const h = f.h;
        p[i * 3] = x + Math.sin(elapsed * .35 * sp + ph) * .9;
        p[i * 3 + 1] = h + .7 + Math.sin(elapsed * .8 * sp + ph2) * .35;
        p[i * 3 + 2] = z + Math.cos(elapsed * .3 * sp + ph2) * .9;
        const blink = f.land ? Math.pow(Math.max(0, Math.sin(elapsed * 1.7 * sp + ph)), 3) * amount : 0;
        col[i * 3] = .9 * blink; col[i * 3 + 1] = 1 * blink; col[i * 3 + 2] = .5 * blink;
      });
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    } };
  })();

  // ================= Fire smoke =================
  // Inked swirl puffs that rise from lit fires, grow and fade.
  function puffTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#2B211F'; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#DDD2C1'; g.beginPath(); g.arc(64, 64, 49, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#C3B6A3'; g.beginPath(); g.arc(72, 74, 36, 0, Math.PI * 2); g.fill();
    g.beginPath();
    for (let a = 0; a < Math.PI * 3.3; a += .1) { const r = 30 * (1 - a / (Math.PI * 3.7)); g.lineTo(62 + Math.cos(a + 2.4) * r, 62 + Math.sin(a + 2.4) * r); }
    g.lineWidth = 5; g.strokeStyle = '#2B211F'; g.lineCap = 'round'; g.stroke();
    return new THREE.CanvasTexture(c);
  }
  const puffTex = puffTexture(), puffs = [];
  for (let i = 0; i < 36; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    sp.visible = false; sp.userData = { life: 0 };
    scene.add(sp); puffs.push(sp); noInk.add(sp);
  }
  let puffNext = 0;
  function emitPuff(f) {
    const sp = puffs.find(p => p.userData.life <= 0);
    if (!sp) return;
    const big = f.kind === 'hearth' ? 1.3 : 1;
    sp.userData = { life: 1, x: f.x + (Math.random() - .5) * .3, z: f.z + (Math.random() - .5) * .3, y: heightAt(f.x, f.z) + 1.2 * big,
      big, sway: Math.random() * 6.28, spin: (Math.random() - .5) * 1.5 };
    sp.visible = true;
  }
  function updatePuffs(dt, elapsed) {
    for (const sp of puffs) {
      const u = sp.userData;
      if (u.life <= 0) continue;
      u.life -= dt / 3.2;
      if (u.life <= 0) { sp.visible = false; continue; }
      const k = 1 - u.life;
      sp.position.set(u.x + Math.sin(elapsed * .8 + u.sway) * .35 * k, u.y + k * 3.2, u.z + Math.cos(elapsed * .7 + u.sway) * .25 * k);
      const size = (.9 + k * 1.9) * u.big;
      sp.scale.set(size, size, 1);
      sp.material.rotation = u.sway + k * u.spin;
      sp.material.opacity = Math.min(1, u.life * 1.6) * .95;
    }
  }

  // ================= Shore ripples =================
  // Curling wave crests on the water just off the coast, washing in and out.
  function crestTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    const path = () => {
      g.beginPath();
      g.moveTo(14, 70);
      g.bezierCurveTo(60, 28, 150, 20, 196, 44);
      for (let a = 0; a < Math.PI * 2.4; a += .12) { const r = 22 * (1 - a / (Math.PI * 2.9)); g.lineTo(196 + 4 - Math.cos(a) * r, 44 + 22 - Math.sin(a + Math.PI / 2) * r - 22 + r); }
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    path(); g.lineWidth = 16; g.strokeStyle = '#2B211F'; g.stroke();
    path(); g.lineWidth = 8; g.strokeStyle = '#F3EAD6'; g.stroke();
    return new THREE.CanvasTexture(c);
  }
  const crestMat = new THREE.MeshBasicMaterial({ map: crestTexture(), transparent: true, depthWrite: false, fog: true });
  const crestGeo = new THREE.PlaneGeometry(2.6, 1); crestGeo.rotateX(-Math.PI / 2);
  const crests = new Set();
  // A few crests in each chunk, in shallow water just off a beach, lying along the coast.
  function buildCrests(cx, cz) {
    const out = [], r = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x9e37);
    for (let tries = 0; tries < 40 && out.length < 5; tries++) {
      const x = cx * CH + r() * CH, z = cz * CH + r() * CH, h = heightAt(x, z);
      if (h > -.45 || h < -1.3) continue;
      const gx = heightAt(x + 1, z) - heightAt(x - 1, z), gz = heightAt(x, z + 1) - heightAt(x, z - 1), gl = Math.hypot(gx, gz);
      if (gl < .05) continue;
      const dx = gx / gl, dz = gz / gl;   // uphill = towards the shore
      const m = new THREE.Mesh(crestGeo, crestMat.clone());
      m.position.set(x, .16, z);
      m.rotation.y = Math.atan2(-dz, dx) + (r() - .5) * .4;
      m.renderOrder = 2;
      m.userData = { x, z, dx, dz, phase: r() * 6.28 };
      scene.add(m); crests.add(m); noInk.add(m); out.push(m);
    }
    return out;
  }
  function updateCrests(elapsed, light) {
    for (const m of crests) {
      const u = m.userData, k = (Math.sin(elapsed * .55 + u.phase) + 1) / 2;   // 0..1, washing in and out
      m.position.x = u.x + u.dx * k * .9; m.position.z = u.z + u.dz * k * .9;
      m.material.opacity = Math.sin(k * Math.PI) * .95;
      m.material.color.setScalar(light);
    }
  }

  // ================= Flowers and little plants (decoration only) =================
  // Built per chunk near you. Each species grows where it likes: sea pinks on the
  // sand, daisies and tulips in the meadows, mushrooms and ferny tufts in the
  // forest, bluebells by the springs, lavender in the highlands.
  const decorLambert = c => soft(c, { depthWrite: false });
  const DG = {
    stem: (() => { const g = new THREE.CylinderGeometry(.018, .022, 1, 5); g.translate(0, .5, 0); return g; })(),
    puff: new THREE.SphereGeometry(.1, 7, 5),
    petals: new THREE.CylinderGeometry(.13, .13, .03, 8),
    dot: new THREE.SphereGeometry(.05, 6, 4),
    cup: (() => { const g = new THREE.SphereGeometry(.09, 8, 5, 0, Math.PI * 2, 0, Math.PI * .62); g.rotateX(Math.PI); g.translate(0, .07, 0); return g; })(),
    bell: new THREE.SphereGeometry(.055, 6, 4),
    spike: new THREE.CylinderGeometry(.035, .05, .28, 8),
    cap: new THREE.SphereGeometry(.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    tuft: new THREE.ConeGeometry(.07, .32, 5),
  };
  const DM = { stem: decorLambert(0x6F8F5A), tint: decorLambert(0xFFFFFF), yellow: decorLambert(0xE0A33A), lav: decorLambert(0x8C7BA8),
    mushStem: decorLambert(0xEFE3C8), white: decorLambert(0xFFFFFF), tuftA: decorLambert(0x7F9A64), tuftB: decorLambert(0x93A873) };
  const decorCols = a => a.map(c => new THREE.Color(c));
  // species: which biomes, how many per chunk, and its parts [geometry, material, y, colours, scale]
  const DECOR = [
    { biomes: ['beach'], n: 14, parts: [[DG.stem, DM.stem, 0, null, [1, .14, 1]], [DG.puff, DM.tint, .15, decorCols(['#D9A09A', '#C98A86', '#E8C0B4'])]] },
    { biomes: ['meadow'], n: 34, parts: [[DG.stem, DM.stem, 0, null, [1, .22, 1]], [DG.petals, DM.tint, .22, decorCols(['#F3EAD6'])], [DG.dot, DM.yellow, .24]] },
    { biomes: ['meadow'], n: 22, parts: [[DG.stem, DM.stem, 0, null, [1, .32, 1]], [DG.cup, DM.tint, .32, decorCols(['#C4574F', '#E0A33A', '#D98C8C', '#8C7BA8', '#F1E6CC'])]] },
    { biomes: ['spring', 'forest'], n: 14, parts: [[DG.stem, DM.stem, 0, null, [1, .2, 1]], [DG.bell, DM.tint, .2, decorCols(['#5F7FA8', '#7E97B8', '#4F6687'])]] },
    { biomes: ['highland'], n: 30, parts: [[DG.stem, DM.stem, 0, null, [1, .18, 1]], [DG.spike, DM.lav, .3]] },
    { biomes: ['forest'], n: 16, parts: [[DG.stem, DM.mushStem, 0, null, [3.2, .14, 3.2]], [DG.cap, DM.tint, .12, decorCols(['#B8504A', '#C0704F', '#E0A33A'])], [DG.dot, DM.white, .2, null, [.6, .6, .6]]] },
    { biomes: ['meadow', 'forest', 'highland', 'spring'], n: 40, parts: [[DG.tuft, DM.tuftA, .14], [DG.tuft, DM.tuftB, .12, null, [.8, .8, .8]]] },
  ];
  const dummy = new THREE.Object3D();
  function buildDecor(cx, cz) {
    const out = [], r = mulberry32((cx * 92821) ^ (cz * 68917) ^ 0x51f1);
    DECOR.forEach(sp => {
      const spots = [];
      for (let i = 0; i < sp.n * 2 && spots.length < sp.n; i++) {
        const x = cx * CH + r() * CH, z = cz * CH + r() * CH, h = heightAt(x, z);
        const sn = WG.nearestSpring(x, z);
        if (Math.hypot(x - sn.x, z - sn.z) < 2.9) continue;
        if (sp.biomes.includes(WG.biomeAt(x, z, h))) spots.push([x, groundAt(x, z), z, .75 + r() * .5, r() * 6.28, r()]);
      }
      if (!spots.length) return;
      for (const [geo, mat, y, colors, sc] of sp.parts) {
        const im = new THREE.InstancedMesh(geo, mat, spots.length);
        spots.forEach(([x, h, z, k, rot, rr], i) => {
          dummy.position.set(x, h + y * k, z); dummy.rotation.set(0, rot, 0);
          const v = sc || [1, 1, 1]; dummy.scale.set(v[0] * k, v[1] * k, v[2] * k); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          if (colors) im.setColorAt(i, colors[(rr * colors.length) | 0]);
        });
        im.receiveShadow = true;
        scene.add(im); noInk.add(im); out.push(im);
      }
    });
    return out;
  }

  // ================= Plants and rocks =================
  // Positions come from the server; small visual details (leaf angles, colors)
  // come from an RNG seeded by the object's id so everyone sees the same thing.
  const trunkM = [soft(0x9A7A5E), soft(0x8A6A52)], barkM = soft(0x7A5A45);
  const palmLeaf = [soft(0x86A06A), soft(0x6F8F5A)];
  const treeLeaf = [soft(0x6E8F5E), soft(0x809A62), soft(0x5C7D55), soft(0xD8928F)];   // the pink one is blossom
  const coconutM = soft(0x7A5A45), berryM = soft(0xC4574F, { shininess: 60, specular: 0x666666 }), bushM = [soft(0x6A8A5A), soft(0x7C9868)];
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
  const pineM = [soft(0x4F6F5A), soft(0x5E7F66)], blueberryM = soft(0x5873A8, { shininess: 60, specular: 0x666666 });
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
        blob(0, .7 * sy, 0, rr(rng, 1, 1.35), shape === 'wide' ? .75 : 1);
        for (let i = 0; i < n; i++) {
          const a = rng() * 6.28, d = rr(rng, .45, .85) * sx;
          blob(Math.cos(a) * d, rr(rng, .2, 1.3) * sy, Math.sin(a) * d, rr(rng, .55, .95), shape === 'wide' ? .8 : 1);
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
      species: src.species, ore: src.ore, state: WG.defaultState(src.type), mesh: null }));
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
    for (const [mat, geos] of byMat) group.add(new THREE.Mesh(mergeGeos(geos), mat));
    return group;
  }
  function mergeGeos(geos) {
    let n = 0; geos.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    let off = 0;
    geos.forEach(g => { pos.set(g.attributes.position.array, off * 3); nrm.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.computeBoundingSphere();
    return out;
  }

  function buildMesh(o) {
    const rng = mulberry32(o.id * 7919 + 13);
    if (o.type === 'palm') { const p = makePalm(rng); o.mesh = p.g; o.nuts = p.nuts; }
    else if (o.type === 'tree') o.mesh = makeTree(rng, o.species);
    else if (o.type === 'bush') { const b = makeBush(rng, o.species); o.mesh = b.g; o.berryMesh = b.berries; }
    else if (o.type === 'ore') o.mesh = makeOre(rng, o.s || 1, o.ore);
    else if (o.type === 'dig') { const d = makeDig(rng); o.mesh = d.g; o.mound = d.mound; o.hole = d.hole; }
    else o.mesh = makeRock(rng, o.s || 1, o.species);
    if (o.berryMesh) bake(o.berryMesh);
    if (o.mound) bake(o.mound);
    bake(o.mesh, [...(o.nuts || []), o.berryMesh, o.mound, o.hole]);
    o.mesh.position.set(o.x, groundAt(o.x, o.z), o.z);
    shadows(o.mesh);
    scene.add(o.mesh);
    applyState(o);
  }
  const disposeTree = obj => obj.traverse(m => { if (m.geometry && m.geometry !== crestGeo) m.geometry.dispose(); });
  function removeMesh(o) {
    if (!o.mesh) return;
    scene.remove(o.mesh); disposeTree(o.mesh);
    o.mesh = o.nuts = o.berryMesh = o.mound = o.hole = null;
  }
  function buildProps(c) { for (const o of buckets.get(c.key) || []) if (!o.mesh) buildMesh(o); c.props = true; }
  function dropProps(c) { for (const o of buckets.get(c.key) || []) removeMesh(o); c.props = false; }
  function applyState(o) {
    if (!o.mesh) return;
    const s = o.state;
    o.mesh.visible = !s.gone;
    if (o.type === 'palm') o.nuts.forEach((n, i) => { n.visible = i < s.coconuts; });
    if (o.type === 'bush') o.berryMesh.visible = !!s.berries;
    if (o.type === 'dig') { o.mound.visible = !s.dug; o.hole.visible = !!s.dug; }
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

  // ================= Chunk streaming =================
  const chunks = new Map();
  function loadChunk(cx, cz) {
    const c = { key: ckey(cx, cz), cx, cz, terrain: buildTerrain(cx, cz), crests: buildCrests(cx, cz), decor: null, props: false };
    if (c.terrain) scene.add(c.terrain);
    chunks.set(c.key, c);
  }
  function unloadChunk(c) {
    if (c.terrain) { scene.remove(c.terrain); c.terrain.geometry.dispose(); }
    for (const m of c.crests) { scene.remove(m); crests.delete(m); noInk.delete(m); m.material.dispose(); }
    dropDecor(c); dropProps(c);
    chunks.delete(c.key);
  }
  function dropDecor(c) {
    if (!c.decor) return;
    for (const im of c.decor) { scene.remove(im); noInk.delete(im); im.dispose(); }
    c.decor = null;
  }
  // Called every frame: unload far chunks, then build the nearest missing ones
  // within a small time budget so walking never stutters.
  function updateChunks(x, z, budgetMs = 6) {
    const ccx = Math.floor(x / CH), ccz = Math.floor(z / CH);
    for (const c of chunks.values()) {
      const d = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (d > VIEW + 1) { unloadChunk(c); continue; }
      if (c.props && d > PROP_VIEW + 1) dropProps(c);
      if (c.decor && d > DECOR_VIEW + 1) dropDecor(c);
    }
    const want = [];
    for (let i = -VIEW; i <= VIEW; i++) for (let j = -VIEW; j <= VIEW; j++) {
      if (i * i + j * j > (VIEW + .5) ** 2) continue;
      const c = chunks.get(ckey(ccx + i, ccz + j));
      const d = Math.max(Math.abs(i), Math.abs(j)), r2 = i * i + j * j;
      if (!c) want.push([r2, ccx + i, ccz + j, 'chunk']);
      else if (!c.props && d <= PROP_VIEW) want.push([r2 + .3, ccx + i, ccz + j, 'props']);
      else if (!c.decor && d <= DECOR_VIEW) want.push([r2 + .6, ccx + i, ccz + j, 'decor']);
    }
    want.sort((a, b) => a[0] - b[0]);
    const start = performance.now();
    for (const [, cx, cz, what] of want) {
      const c = chunks.get(ckey(cx, cz));
      if (what === 'chunk') loadChunk(cx, cz); else if (what === 'props') buildProps(c); else c.decor = buildDecor(cx, cz);
      if (performance.now() - start > budgetMs) break;
    }
    return want.length;
  }

  let day = 1, t = .3;
  const TITLE = { x: SPAWN.x, z: SPAWN.z - 40 };   // what the title screen looks at
  // Title-screen backdrop: fetch the island layout (also used when joining).
  const layoutReady = fetch('/api/world').then(r => r.json()).then(list => { setLayout(list); return list; });

  // ================= Castaways =================
  // Each player's cloak has its own colour so friends can tell each other apart.
  const CLOAKS = [0x8A6A52, 0x6F7B5A, 0x5F6F85, 0x8C5A4F, 0x6E5F7A, 0x9A8A6A, 0x4F6B66, 0x7A4F4F, 0x5E5A57, 0xA07A4A];
  const colorFor = id => CLOAKS[(id - 1) % CLOAKS.length];
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const frogM = soft(0x7DBB3C), spotM = soft(0x4E8A2E), throatM = soft(0xC9DC86), webM = soft(0xE8872E), ropeM = soft(0xC9A86A);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xE8872E }), irisM = new THREE.MeshBasicMaterial({ color: 0x3A2620 }),
    shineM = new THREE.MeshBasicMaterial({ color: 0xFFF8EA }), mouthM = new THREE.MeshBasicMaterial({ color: 0x2B211F });
  const blushM = new THREE.MeshBasicMaterial({ color: 0xE0705A, transparent: true, opacity: .6 });
  const cyl = (rt, rb, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);

  // A frog castaway in a simple hooded cloak: part wizard, part wanderer.
  function makeCastaway(cloak) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const add = (m, x, y, z, parent = body) => { m.position.set(x, y, z); parent.add(m); return m; };
    const cloakM = softShared(cloak);
    const patchM = softShared(new THREE.Color(cloak).lerp(new THREE.Color(0xE9D7AE), .45).getHex());
    const innerM = softShared(new THREE.Color(cloak).multiplyScalar(.7).getHex());

    // bare green legs and webbed feet under the robe
    function leg(x) {
      const p = new THREE.Group(); p.position.set(x, .6, 0); body.add(p);
      add(cyl(.06, .055, .56, frogM), 0, -.3, 0, p);
      add(ball(.09, frogM, 12, 8), 0, -.57, .05, p).scale.set(1, .35, 1.5);
      for (const dx of [-.05, 0, .05]) add(ball(.035, webM, 8, 6), dx, -.585, .17, p).scale.set(1, .5, 1.3);
      return p;
    }
    const legL = leg(-.11), legR = leg(.11);
    // the robe: loose, long, ragged at the hem, tied with a rope, with a patch sewn on
    add(cyl(.2, .38, .78, cloakM, 18), 0, .74, 0);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, tatter = new THREE.Mesh(new THREE.ConeGeometry(.07, .13 + (i % 3) * .04, 5), cloakM);
      tatter.rotation.x = Math.PI; add(tatter, Math.cos(a) * .35, .31, Math.sin(a) * .35);
    }
    const belt = add(new THREE.Mesh(new THREE.TorusGeometry(.265, .026, 8, 24), ropeM), 0, .88, 0); belt.rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .2, 6), ropeM), .12, .77, .24).rotation.z = .2;   // rope end
    const patch = add(new THREE.Mesh(new THREE.BoxGeometry(.13, .12, .02), patchM), -.2, .62, .26); patch.rotation.set(-.2, -.6, .15);
    const drape = add(new THREE.Mesh(new THREE.TorusGeometry(.17, .09, 10, 22), cloakM), 0, 1.16, 0); drape.rotation.x = Math.PI / 2;
    // head: wide and flat, pale throat, dark spots, bulging eyes, long smile
    const head = new THREE.Group(); head.position.y = 1.42; body.add(head);
    add(ball(.3, frogM, 24, 16), 0, .06, 0, head).scale.set(1.3, .78, 1.05);
    add(ball(.27, throatM, 18, 12), 0, -.04, .04, head).scale.set(1.18, .45, 1);
    [[-.28, .06, -.02, .04], [.26, .08, -.04, .045]].forEach(([x, y, z, r]) => add(ball(r, spotM, 10, 8), x, y, z, head).scale.set(1, .45, 1));
    for (const sx of [-1, 1]) {
      add(ball(.125, frogM, 16, 12), sx * .2, .24, .08, head);
      add(ball(.1, ringM, 14, 10), sx * .215, .26, .155, head).scale.z = .6;
      add(ball(.07, irisM, 12, 8), sx * .22, .26, .2, head).scale.z = .5;
      add(ball(.022, shineM, 6, 4), sx * .22 + .03, .29, .235, head);
      add(ball(.045, blushM, 8, 6), sx * .3, .02, .2, head).scale.set(1, .6, .4);
    }
    const mouth = add(new THREE.Mesh(new THREE.TorusGeometry(.27, .011, 5, 28, Math.PI * .62), mouthM), 0, .12, .235, head);
    mouth.rotation.z = -Math.PI / 2 - Math.PI * .31;
    // the hood: a cowl around the back and top of the head, open at the face, with a drooping tip
    const open = 1.45;
    const hood = add(new THREE.Mesh(new THREE.SphereGeometry(.36, 22, 14, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * .72), cloakM), 0, .06, -.02, head);
    hood.scale.set(1.2, 1.05, 1.12); hood.material.side = THREE.DoubleSide;
    const lining = add(new THREE.Mesh(new THREE.SphereGeometry(.345, 22, 14, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * .72), innerM), 0, .06, -.02, head);
    lining.scale.set(1.2, 1.05, 1.12); lining.material.side = THREE.BackSide;
    const tip = add(new THREE.Mesh(new THREE.ConeGeometry(.13, .46, 12), cloakM), 0, .08, -.5, head);
    tip.rotation.x = -2.35;   // droops down the back
    // arms: wide ragged sleeves, green webbed hands
    function arm(x) {
      const p = new THREE.Group(); p.position.set(x, 1.08, 0); body.add(p);
      add(cyl(.065, .12, .36, cloakM), 0, -.18, 0, p);
      add(ball(.06, frogM, 10, 8), 0, -.4, 0, p).scale.set(1, 1.1, .75);
      for (const dx of [-.035, 0, .035]) add(ball(.024, webM, 6, 5), dx, -.465, 0, p);
      return p;
    }
    const armL = arm(-.27), armR = arm(.27);

    const av = { root, body, legL, legR, armL, armR, walk: 0, swingT: 0 };
    av.armL.rotation.z = -.18; av.armR.rotation.z = .18;
    shadows(root);
    scene.add(root);
    return av;
  }
  function removeCastaway(av) { scene.remove(av.root); }
  // Cloak patches: small stitched squares in the colour of what they were made from.
  const PATCH_COL = { moon_wing: 0xF3EAD6, violet_charm: 0xA88BD8, firefly_jar: 0xE8F27A, silverfin_scale: 0xB9C3C6, conch_charm: 0xE3A89A };
  // [angle round the robe from the front, height]; placed on the robe's surface
  const PATCH_SPOTS = [[.55, .6], [-.35, .92], [2.6, .75]].map(([a, y]) => { const r = .38 - (y - .35) / .78 * .18 + .025; return [Math.sin(a) * r, y, Math.cos(a) * r, a]; });
  const stitchM = new THREE.MeshBasicMaterial({ color: 0x2B211F });
  function setPatches(av, list) {
    if (!av) return;
    if (av.patches) av.body.remove(av.patches);
    av.patches = new THREE.Group(); av.body.add(av.patches);
    (list || []).slice(0, PATCH_SPOTS.length).forEach((key, i) => {
      const [x, y, z, ry] = PATCH_SPOTS[i], m = new THREE.Mesh(new THREE.BoxGeometry(.12, .11, .02), softShared(PATCH_COL[key] || 0xD9C9A6));
      m.position.set(x, y, z); m.rotation.set(0, ry, 0); m.rotateX(-.23); av.patches.add(m);
      const st = new THREE.Mesh(new THREE.BoxGeometry(.13, .012, .024), stitchM); st.position.copy(m.position); st.rotation.copy(m.rotation); av.patches.add(st);
    });
  }

  function poseCastaway(av, x, z, face, moving, dead, dt, elapsed) {
    const gh = groundAt(x, z), y = Math.max(gh, -.75);
    av.root.position.set(x, y, z);
    av.root.rotation.y = face;
    if (dead) { av.root.rotation.x = Math.max(-1.45, av.root.rotation.x - dt * 3); return; }
    av.root.rotation.x = 0;
    if (moving) av.walk += dt * (moving === 2 ? 15 : 10); else av.walk *= .9;
    const s = Math.sin(av.walk) * (moving ? .8 : 0);
    av.legL.rotation.x = s; av.legR.rotation.x = -s;
    av.armL.rotation.x = -s * .9;
    if (av.swingT > 0) { av.swingT -= dt; const k = av.swingT / .35; av.armR.rotation.x = -2.4 * Math.sin(k * Math.PI); }
    else av.armR.rotation.x = s * .9;
    // bouncy walk, gentle breathing when idle
    av.body.position.y = moving ? Math.abs(Math.cos(av.walk)) * .08 : Math.sin(elapsed * 2.2) * .015;
    const sq = moving ? 1 + Math.abs(Math.sin(av.walk)) * .04 : 1 + Math.sin(elapsed * 2.2) * .01;
    av.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  }

  // ================= The Stilled =================
  // Pale, faceless figures drawn as holes in the world: flat colour, marked
  // (alpha 0) so the ink pass leaves them without outlines or shading.
  const stilledMat = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(0xE9E1CF) } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 col; void main(){ gl_FragColor = vec4(col, 0.); }',
    blending: THREE.NoBlending, depthWrite: false,
  });
  function makeStilled(id) {
    const g = new THREE.Group();
    const part = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, stilledMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.renderOrder = 10; g.add(m); return m; };
    part(new THREE.SphereGeometry(.3, 12, 9), 0, 1.62, 0, 1.25, .72, 1);
    for (const sx of [-1, 1]) part(new THREE.SphereGeometry(.11, 8, 6), sx * .19, 1.78, .05);
    part(new THREE.CylinderGeometry(.14, .22, .78, 10), 0, 1.02, 0);
    for (const sx of [-1, 1]) {
      const arm = part(new THREE.CylinderGeometry(.045, .04, .82, 6), sx * .27, .9, .06); arm.rotation.z = sx * .06; arm.rotation.x = -.12;
      part(new THREE.CylinderGeometry(.06, .05, .64, 6), sx * .1, .32, 0);
    }
    g.children[0].rotation.z = (WG.hash2(id, 3) - .5) * .5;   // a head tilted just wrong
    scene.add(g);
    return g;
  }
  const stilled = new Map();   // id -> { remote, mesh }
  function syncStilled(list) {
    const seen = new Set();
    for (const [id, x, z, f] of list || []) {
      seen.add(id);
      let s = stilled.get(id);
      if (!s) { s = { remote: new Net.Remote(x, z, f), mesh: makeStilled(id) }; stilled.set(id, s); }
      else s.remote.push(x, z, f, 0, 0);
    }
    for (const [id, s] of stilled) if (!seen.has(id)) { scene.remove(s.mesh); stilled.delete(id); }
  }
  function clearStilled() { stilled.forEach(s => scene.remove(s.mesh)); stilled.clear(); }

  // ================= Fires =================
  let fires = new Map();
  const logM = soft(0x7A5A45), flameA = new THREE.MeshBasicMaterial({ color: 0xE0843A }), flameB = new THREE.MeshBasicMaterial({ color: 0xF3D48A });
  const clayM = soft(0xB8704F);
  function addFire(src) {
    const g = new THREE.Group();
    const kind = WG.FIRES[src.kind] ? src.kind : 'campfire';
    if (kind === 'hearth') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .2, 12, 28), clayM); ring.rotation.x = -Math.PI / 2; ring.position.y = .14;
      ring.castShadow = true; g.add(ring);
    } else for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const s = ball(.15, rockM[i % 2], 10, 8); s.scale.y = .7; s.position.set(Math.cos(a) * .55, .08, Math.sin(a) * .55); s.castShadow = true; g.add(s); }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .9, 10), logM); l.rotation.set(Math.PI / 2 - .35, i * 2.1, 0); l.position.y = .18; l.castShadow = true; g.add(l); }
    const f1 = ball(.28, flameA, 14, 10); f1.position.y = .5;
    const f2 = ball(.16, flameB, 12, 8); f2.position.y = .48;
    g.add(f1, f2);
    g.position.set(src.x, groundAt(src.x, src.z), src.z);
    scene.add(g);
    if (kind === 'hearth') { f1.scale.setScalar(1.3); f2.scale.setScalar(1.3); }
    const f = { id: src.id, type: 'fire', kind, x: src.x, z: src.z, r: kind === 'hearth' ? .8 : .6, mesh: g, flames: [f1, f2], fuel: src.fuel, state: {} };
    fires.set(f.id, f);
    return f;
  }
  // ================= Stone lanterns =================
  // Old stone lanterns: a stepped base, a pillar, a lamp box and a wide roof.
  // Lit, the lamp box glows and a light from the pool is lent to it.
  let lanterns = new Map();
  const lanternStoneM = soft(0xA59E92), lanternDarkM = soft(0x7E776D);
  const glowOnM = new THREE.MeshBasicMaterial({ color: 0xF3C35A }), glowOffM = new THREE.MeshBasicMaterial({ color: 0x3A3230 });
  function makeLantern(big) {
    const g = new THREE.Group(), k = big ? 1.8 : 1;
    const add = (geo, m, y) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y * k; mesh.scale.setScalar(k); g.add(mesh); return mesh; };
    add(new THREE.CylinderGeometry(.55, .62, .18, 6), lanternDarkM, .09);
    add(new THREE.CylinderGeometry(.42, .48, .14, 6), lanternStoneM, .25);
    add(new THREE.CylinderGeometry(.16, .2, .9, 8), lanternStoneM, .77);
    add(new THREE.CylinderGeometry(.38, .3, .12, 6), lanternStoneM, 1.28);
    add(new THREE.BoxGeometry(.5, .42, .5), lanternStoneM, 1.55);
    const glow = add(new THREE.BoxGeometry(.52, .24, .3), glowOffM, 1.56);
    const glow2 = add(new THREE.BoxGeometry(.3, .24, .52), glowOffM, 1.56);
    add(new THREE.ConeGeometry(.62, .42, 6), lanternDarkM, 1.97);
    add(new THREE.SphereGeometry(.09, 8, 6), lanternStoneM, 2.24);
    bake(g, [glow, glow2]);
    shadows(g);
    return { g, glows: [glow, glow2] };
  }
  function setLantern(src) {
    let l = lanterns.get(src.id);
    if (!l) {
      const { g, glows } = makeLantern(src.big);
      g.position.set(src.x, groundAt(src.x, src.z), src.z); g.rotation.y = src.id * 1.3;
      scene.add(g);
      l = { id: src.id, type: 'lantern', x: src.x, z: src.z, big: src.big, r: src.big ? .9 : .55, mesh: g, glows, state: {} };
      lanterns.set(src.id, l);
    }
    Object.assign(l, { lit: src.lit, fuel: src.fuel, have: src.have, need: src.need, clear: src.clear || 0, reclaim: src.reclaim ?? 1 });
    l.glows.forEach(m => { m.material = l.lit ? glowOnM : glowOffM; });
  }
  function clearLanterns() { lanterns.forEach(l => scene.remove(l.mesh)); lanterns = new Map(); }
  const lanternRadius = l => l.big ? RULES.LANTERN.BIG_RADIUS : RULES.LANTERN.RADIUS;

  // ================= Tides: things the sea washes up =================
  let washups = new Map();
  const driftM = soft(0x9A8068), crateM = soft(0xA07A4A), fishM = soft(0xB9C3C6), shellM = soft(0xEBD9C3), shellPinkM = soft(0xE3A89A),
    doorM = soft(0x6E5646), bellM = soft(0xC9A04A), plankM = soft(0x8A6A52), printM = new THREE.MeshBasicMaterial({ color: 0x5E4A3A, transparent: true, opacity: .55, depthWrite: false });
  const glassMats = { glass_green: 0x7FBF8A, glass_blue: 0x6FA3D0, glass_amber: 0xE0A33A, glass_violet: 0xA88BD8 };
  function makeWashup(w) {
    const g = new THREE.Group(), r = mulberry32(w.id * 31 + 7);
    const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    switch (w.key) {
      case 'driftwood': { const l = add(new THREE.CylinderGeometry(.12, .17, 1.8, 8), driftM, 0, .14, 0); l.rotation.z = Math.PI / 2; l.rotation.y = r() * 3;
        const b = add(new THREE.CylinderGeometry(.05, .07, .6, 6), driftM, .3, .2, .15); b.rotation.set(.6, 0, 1.1); break; }
      case 'crate_seeds': case 'crate_oil': { const c = add(new THREE.BoxGeometry(.7, .55, .6), crateM, 0, .25, 0); c.rotation.set(.12, r() * 3, .1);
        add(new THREE.BoxGeometry(.72, .08, .62), driftM, 0, .5, 0).rotation.copy(c.rotation); break; }
      case 'silverfin': { const f = add(new THREE.SphereGeometry(.3, 10, 6), fishM, 0, .08, 0); f.scale.set(1.4, .35, .55);
        const tail = add(new THREE.ConeGeometry(.16, .25, 4), fishM, -.45, .08, 0); tail.rotation.z = Math.PI / 2; break; }
      case 'spiral_shell': case 'conch': { const big = w.key === 'conch' ? 1.8 : 1; const c = add(new THREE.ConeGeometry(.12 * big, .32 * big, 10), w.key === 'conch' ? shellPinkM : shellM, 0, .1, 0); c.rotation.z = 1.3;
        add(new THREE.SphereGeometry(.11 * big, 10, 8), w.key === 'conch' ? shellPinkM : shellM, .12 * big, .09, 0); break; }
      case 'cowrie': add(new THREE.SphereGeometry(.12, 10, 8), shellM, 0, .07, 0).scale.set(1.3, .6, .9); break;
      case 'scallop': { const s2 = add(new THREE.CylinderGeometry(.2, .02, .05, 10, 1, false, 0, Math.PI), shellPinkM, 0, .04, 0); s2.rotation.x = -1.4; break; }
      case 'sand_dollar': add(new THREE.CylinderGeometry(.16, .16, .03, 14), shellM, 0, .03, 0); break;
      case 'door_in_sand': { add(new THREE.BoxGeometry(1.1, 2.1, .12), doorM, 0, 1, 0); add(new THREE.BoxGeometry(1.3, .12, .16), plankM, 0, 2.1, 0);
        add(new THREE.SphereGeometry(.05, 8, 6), bellM, .38, 1, .08); g.rotation.y = r() * 3; break; }
      case 'ringing_bell': { add(new THREE.BoxGeometry(1.6, .1, .4), plankM, 0, .1, 0); add(new THREE.CylinderGeometry(.03, .03, .7, 6), plankM, 0, .5, 0);
        const bell = add(new THREE.CylinderGeometry(.08, .22, .3, 12), bellM, 0, .72, 0); g.userData.bell = bell; break; }
      case 'carved_mask': { const m = add(new THREE.SphereGeometry(.3, 10, 8), plankM, 0, .08, 0); m.scale.set(.8, .25, 1.05);
        for (const sx of [-1, 1]) add(new THREE.BoxGeometry(.1, .03, .025), mouthM, sx * .1, .15, .08).rotation.x = -Math.PI / 2; break; }
      case 'eye_stone': { add(new THREE.SphereGeometry(.18, 12, 9), pondRock, 0, .14, 0);
        const ring = add(new THREE.TorusGeometry(.1, .025, 6, 16), mouthM, 0, .16, .16); ring.scale.z = .5; break; }
      case 'old_tooth': { const t2 = add(new THREE.ConeGeometry(.16, 1.3, 8), shellM, 0, .15, 0); t2.rotation.set(Math.PI / 2 - .2, 0, 1.2); break; }
      case 'sleeper_gift': { add(new THREE.SphereGeometry(.28, 10, 8), clayM, 0, .24, 0).scale.y = .9;
        add(new THREE.CylinderGeometry(.12, .16, .14, 10), clayM, 0, .5, 0); add(new THREE.CircleGeometry(.1, 10), mouthM, 0, .575, 0).rotation.x = -Math.PI / 2; break; }
      case 'your_cloak': { const c = add(new THREE.SphereGeometry(.5, 12, 8), softShared(me ? colorFor(me.id) : 0x8A6A52), 0, .06, 0); c.scale.set(1.3, .18, .9); break; }
      case 'footprints': {   // a line of webbed prints from the sea to the target, and none back
        const tx = w.data.tx, tz = w.data.tz, len = Math.hypot(tx - w.x, tz - w.z), n = Math.min(80, Math.floor(len / .7));
        const a = Math.atan2(tx - w.x, tz - w.z), printGeo = new THREE.CircleGeometry(.11, 5);
        for (let i = 0; i < n; i++) {
          const k = i / n, side = i % 2 ? .16 : -.16, x = w.x + (tx - w.x) * k + Math.cos(a) * side, z = w.z + (tz - w.z) * k - Math.sin(a) * side;
          const m = new THREE.Mesh(printGeo, printM); m.rotation.x = -Math.PI / 2; m.rotation.z = -a; m.scale.set(1, 1.5, 1);
          m.position.set(x - w.x, groundAt(x, z) - groundAt(w.x, w.z) + .04, z - w.z); g.add(m);
        }
        break; }
      default: {
        if (glassMats[w.key]) { const m = new THREE.MeshBasicMaterial({ color: glassMats[w.key], transparent: true, opacity: .85 });
          const gl = add(new THREE.IcosahedronGeometry(.15, 0), m, 0, .08, 0); gl.scale.set(1.3, .6, 1); }
        else add(new THREE.BoxGeometry(.3, .3, .3), crateM, 0, .15, 0);
      }
    }
    g.position.set(w.x, groundAt(w.x, w.z), w.z);
    if (w.key !== 'footprints') shadows(g);
    return g;
  }
  function addWash(w) {
    if (washups.has(w.id)) return;
    const mesh = makeWashup(w);
    scene.add(mesh);
    if (w.key === 'footprints') noInk.add(mesh);
    washups.set(w.id, { ...w, type: 'wash', r: w.key === 'door_in_sand' ? .7 : .4, mesh, state: {} });
  }
  function removeWash(id) { const w = washups.get(id); if (w) { scene.remove(w.mesh); noInk.delete(w.mesh); washups.delete(id); } }
  function clearWash() { [...washups.keys()].forEach(removeWash); }

  // ================= Bugs =================
  // Server decides where; here they flit, hover, hop or crawl around that spot.
  let bugs = new Map();
  const bugMats = { firefly: new THREE.MeshBasicMaterial({ color: 0xE8F27A }), moon_moth: new THREE.MeshBasicMaterial({ color: 0xF3EAD6 }),
    cricket: soft(0x6F8F4A), bark_beetle: soft(0x3E3430), dragonfly: soft(0x5F7FA8), wing: new THREE.MeshBasicMaterial({ color: 0xE9F1F3, transparent: true, opacity: .55 }),
    snailShell: new THREE.MeshBasicMaterial({ color: 0xCFE6EA, transparent: true, opacity: .6 }), snail: soft(0xE7DCC8), heart: new THREE.MeshBasicMaterial({ color: 0xD9605A }),
    rain_beetle: soft(0x3F5F6A), shroomCap: new THREE.MeshBasicMaterial({ color: 0x9FE3C8 }), shroomStem: new THREE.MeshBasicMaterial({ color: 0xE9F1DA }),
    lanternFish: soft(0x3E4A5A), lure: new THREE.MeshBasicMaterial({ color: 0xF3D27A }) };
  const GLOW_BUGS = new Set(['firefly', 'moon_moth', 'glow_mushroom', 'lantern_fish']);
  function makeBug(key) {
    const g = new THREE.Group(), add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    if (key === 'firefly') { add(new THREE.SphereGeometry(.07, 8, 6), bugMats.firefly, 0, 0, 0); add(new THREE.SphereGeometry(.05, 6, 4), bugMats.bark_beetle, 0, .02, .06); }
    else if (key === 'moon_moth') { add(new THREE.SphereGeometry(.04, 6, 4), bugMats.moon_moth, 0, 0, 0);
      for (const sx of [-1, 1]) { const w = add(new THREE.CircleGeometry(.16, 8), bugMats.moon_moth, sx * .13, 0, 0); w.rotation.x = -Math.PI / 2; g.userData['wing' + sx] = w; } }
    else if (key === 'dragonfly') { const b = add(new THREE.CylinderGeometry(.02, .015, .4, 6), bugMats.dragonfly, 0, 0, 0); b.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) for (const dz of [-.04, .06]) { const w = add(new THREE.PlaneGeometry(.26, .06), bugMats.wing, sx * .14, .01, dz); w.rotation.x = -Math.PI / 2; } }
    else if (key === 'cricket') { add(new THREE.SphereGeometry(.07, 8, 6), bugMats.cricket, 0, 0, 0).scale.set(.7, .7, 1.5); }
    else if (key === 'glass_snail') { add(new THREE.SphereGeometry(.05, 8, 6), bugMats.snail, 0, .03, .08).scale.set(1, .6, 2.2);
      add(new THREE.SphereGeometry(.03, 6, 4), bugMats.heart, 0, .1, 0); add(new THREE.SphereGeometry(.09, 10, 8), bugMats.snailShell, 0, .1, 0); }
    else if (key === 'rain_beetle') { add(new THREE.SphereGeometry(.08, 8, 6), bugMats.rain_beetle, 0, 0, 0).scale.set(1, .6, 1.2); }
    else if (key === 'glow_mushroom') { for (const [x, z, k] of [[0, 0, 1], [.14, .08, .7], [-.1, .12, .55]]) {
        add(new THREE.CylinderGeometry(.025 * k, .035 * k, .22 * k, 6), bugMats.shroomStem, x, .11 * k, z);
        add(new THREE.SphereGeometry(.09 * k, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bugMats.shroomCap, x, .2 * k, z); } }
    else if (key === 'lantern_fish') { add(new THREE.SphereGeometry(.14, 10, 8), bugMats.lanternFish, 0, 0, 0).scale.set(1.6, .8, .8);
      const st = add(new THREE.CylinderGeometry(.008, .008, .2, 4), bugMats.lanternFish, .16, .14, 0); st.rotation.z = -.6;
      add(new THREE.SphereGeometry(.045, 8, 6), bugMats.lure, .24, .22, 0); }
    else { add(new THREE.SphereGeometry(.08, 8, 6), bugMats.bark_beetle, 0, 0, 0).scale.set(1, .55, 1.3); }
    return g;
  }
  function syncBugs(list) {
    const seen = new Set();
    for (const [id, key, x, z] of list) {
      seen.add(id);
      if (!bugs.has(id)) { const mesh = makeBug(key); scene.add(mesh); if (GLOW_BUGS.has(key)) noInk.add(mesh);
        bugs.set(id, { id, key, x, z, type: 'bug', r: .3, mesh, state: {}, ph: Math.random() * 6.28 }); }
    }
    for (const [id, b] of bugs) if (!seen.has(id)) { scene.remove(b.mesh); noInk.delete(b.mesh); bugs.delete(id); }
  }
  function animateBugs(elapsed) {
    bugs.forEach(b => {
      const e = elapsed + b.ph, gy = groundAt(b.x, b.z);
      let x = b.x, z = b.z, y = gy;
      if (b.key === 'firefly' || b.key === 'moon_moth') { x += Math.sin(e * .7) * .8; z += Math.cos(e * .5) * .8; y += 1 + Math.sin(e * 1.3) * .3; }
      else if (b.key === 'dragonfly') { x += Math.sin(e * .9) * 1.2; z += Math.sin(e * .6) * 1.2; y += .9 + Math.sin(e * 5) * .05; }
      else if (b.key === 'cricket') { y += .07 + Math.max(0, Math.sin(e * 2.2)) * .35; x += Math.sin(e * .3) * .6; }
      else if (b.key === 'glow_mushroom') { y = gy; }
      else if (b.key === 'lantern_fish') { x += Math.sin(e * .4) * 1.4; z += Math.cos(e * .33) * 1.4; y = Math.max(gy, -.5) + .05 + Math.sin(e * 1.5) * .04; }
      else if (b.key === 'glass_snail') { x += Math.sin(e * .08) * .3; y += .01; }
      else { x += Math.sin(e * .25) * .5; z += Math.cos(e * .2) * .5; y += .05; }
      b.mesh.position.set(x, y, z); if (b.key !== 'glow_mushroom') b.mesh.rotation.y = e * .5;
      b.cx = x; b.cz = z;   // where it actually is, for catching
      if (b.mesh.userData['wing-1']) { const f = Math.sin(e * 14) * .6; b.mesh.userData['wing-1'].rotation.y = f; b.mesh.userData.wing1.rotation.y = -f; }
    });
  }

  // ================= The Sleeper's carving stones =================
  // Standing stones with a carved face. The text is drawn on a canvas; when the
  // Sleeper changes it, the old words flake away and the new ones ink themselves in.
  const carveStoneM = soft(0x8E877C), carveDarkM = soft(0x6F685F);
  let carvings = new Map();
  function makeCarvingStone(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.62, .8, 2.1, 7), carveStoneM); body.scale.z = .55; body.position.y = 1.05; g.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.3, .62, .4, 7), carveStoneM); top.scale.z = .55; top.position.y = 2.3; g.add(top);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, .2, 7), carveDarkM); foot.position.y = .08; g.add(foot);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 400;
    const tex = new THREE.CanvasTexture(canvas);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.96, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    face.position.set(0, 1.25, .47); g.add(face); noInk.add(face);
    g.position.set(c.x, groundAt(c.x, c.z) - .05, c.z); g.rotation.y = c.face;
    shadows(g); face.castShadow = false; scene.add(g);
    return { mesh: g, face, canvas, tex };
  }
  function wrapText(g, text, width) {
    const lines = [], words = String(text).split(/\s+/);
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  // Draw one carving. reveal: 0-1 how much of the new text has inked in; fade: how much of the old text is left.
  function drawCarving(c, reveal = 1, fade = 0) {
    const g = c.canvas.getContext('2d'), W = 256, H = 400;
    g.clearRect(0, 0, W, H);
    const carve = (text, alpha, clipY, worn) => {
      g.save(); g.globalAlpha = alpha;
      if (clipY < H) { g.beginPath(); g.rect(0, 0, W, clipY); g.clip(); }
      g.font = '600 30px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      const lines = wrapText(g, text, 214), y0 = Math.max(60, 190 - lines.length * 19);
      lines.forEach((l, i) => {
        const r = mulberry32(i * 31 + l.length);
        g.fillStyle = 'rgba(233,225,207,.55)'; g.fillText(l, W / 2 + 1.5, y0 + i * 40 + 2);   // the groove's lit edge
        g.fillStyle = worn ? '#4A433C' : '#221A18'; g.fillText(l, W / 2 + (r() - .5) * 2, y0 + i * 40);
      });
      // a spiral mark above, like the oldest carvings
      g.strokeStyle = worn ? '#4A433C' : '#221A18'; g.lineWidth = 4; g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += .2) { const rr = 16 * (1 - a / (Math.PI * 5.4)); g.lineTo(W / 2 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
      g.stroke(); g.restore();
      return y0 + lines.length * 40;
    };
    if (fade > 0 && c.old) carve(c.old, fade, H, c.oldWorn);
    const end = carve(c.text, c.state === 'idle' ? .55 : 1, reveal >= 1 ? H : 60 + reveal * 300, c.state === 'idle');
    if (c.tally && reveal >= 1) {   // tally marks: one scratch per part done
      const [have, need] = c.tally;
      g.strokeStyle = '#221A18'; g.lineWidth = 4; g.lineCap = 'round';
      const n = Math.min(need, 12), x0 = W / 2 - n * 7;
      for (let i = 0; i < n; i++) { g.globalAlpha = i < have ? 1 : .22; g.beginPath(); g.moveTo(x0 + i * 14 + 7, end + 18); g.lineTo(x0 + i * 14 + 4, end + 50); g.stroke(); }
      g.globalAlpha = 1;
    }
    if (fade > 0) {   // flakes where the old words are breaking away
      g.fillStyle = '#8E877C';
      for (let i = 0; i < 90 * fade; i++) g.fillRect(Math.random() * W, 60 + Math.random() * 300, 3, 3);
    }
    c.tex.needsUpdate = true;
  }
  function setCarvings(list, changedId, why) {
    for (const v of list) {
      let c = carvings.get(v.id);
      if (!c) { c = Object.assign({ id: v.id, type: 'carving', r: .8, state: {} }, makeCarvingStone(v)); carvings.set(v.id, c); }
      const textChanged = c.text !== undefined && c.text !== v.text;
      if (textChanged) { c.old = c.text; c.oldWorn = c.stateName === 'idle'; c.anim = 0; }
      Object.assign(c, { key: v.key, x: v.x, z: v.z, text: v.text, stateName: v.state, tally: v.tally, offer: v.offer });
      if (c.anim == null) drawCarving(c);   // otherwise the re-inking redraws it
    }
    if (why === 'new' && state === 'play') { const c = carvings.get(changedId); if (c && Math.hypot(c.x - px, c.z - pz) < 60) toast('Somewhere close, stone scrapes on stone.'); }
    if (!ui.carvingPanel.classList.contains('gone')) renderCarving();
  }
  function animateCarvings(dt) {
    carvings.forEach(c => {
      if (c.anim == null) return;
      c.anim += dt / 3;
      if (c.anim >= 1) { c.anim = null; c.old = null; drawCarving(c); return; }
      drawCarving(c, clamp((c.anim - .35) / .65, 0, 1), clamp(1 - c.anim / .4, 0, 1));
    });
  }
  function clearCarvings() { carvings.forEach(c => { scene.remove(c.mesh); noInk.delete(c.face); }); carvings = new Map(); }

  // ================= The driftwood board =================
  // Grey driftwood planks on two posts, by the first lantern. Notes are paper scraps.
  let board = null;
  const paperM = soft(0xF3EAD6);
  function setBoard(b) {
    if (board) scene.remove(board.mesh);
    board = null; if (!b) return;
    const g = new THREE.Group(), add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    for (const sx of [-.8, .8]) add(new THREE.CylinderGeometry(.07, .09, 2, 7), driftM, sx, 1, 0).rotation.z = sx * .03;
    for (const [y, w, rz] of [[1.55, 2.1, .02], [1.2, 1.9, -.03], [.85, 2, .015]]) add(new THREE.BoxGeometry(w, .32, .08), driftM, 0, y, 0).rotation.z = rz;
    const scraps = new THREE.Group(); g.add(scraps);
    g.position.set(b.x, groundAt(b.x, b.z), b.z); g.rotation.y = -.6;
    shadows(g); scene.add(g);
    board = { type: 'board', x: b.x, z: b.z, r: .9, mesh: g, scraps, state: {} };
    renderScraps();
  }
  function renderScraps() {
    if (!board) return;
    board.scraps.clear();
    notes.slice(-7).forEach((n, i) => {
      const r = mulberry32(n.id * 17 + 3), m = new THREE.Mesh(new THREE.PlaneGeometry(.34, .26), paperM);
      m.position.set(-.75 + (i % 4) * .5 + r() * .08, 1.45 - Math.floor(i / 4) * .45 + r() * .06, .05); m.rotation.z = (r() - .5) * .4;
      board.scraps.add(m);
    });
  }
  let notes = [];

  // Sacks of things dropped when someone was knocked down.
  let drops = new Map();
  const sackM = soft(0xB59A72), tieM = soft(0x7A5A45);
  function addDrop(d) {
    if (drops.has(d.id)) return;
    const g = new THREE.Group();
    const sack = ball(.32, sackM); sack.scale.set(1, .75, .9); sack.position.y = .22; g.add(sack);
    const neck = new THREE.Mesh(new THREE.ConeGeometry(.12, .22, 8), sackM); neck.position.y = .5; g.add(neck);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(.09, .025, 6, 12), tieM); tie.rotation.x = Math.PI / 2; tie.position.y = .45; g.add(tie);
    g.position.set(d.x, groundAt(d.x, d.z), d.z); g.rotation.y = d.id;
    shadows(g); scene.add(g);
    drops.set(d.id, { id: d.id, type: 'drop', x: d.x, z: d.z, r: .4, mesh: g, state: {} });
  }
  function removeDrop(id) { const d = drops.get(id); if (d) { scene.remove(d.mesh); drops.delete(id); } }
  function clearDrops() { drops.forEach(d => scene.remove(d.mesh)); drops = new Map(); }
  function clearFires() { fires.forEach(f => scene.remove(f.mesh)); fires = new Map(); }

  // ================= State =================
  let state = 'title';              // title | connecting | play | dead
  let me = null;                    // { id, name }
  let stats = { health: 100, hunger: 80, thirst: 70, inv: { wood: 0, stone: 0 }, tools: [], warm: false, dread: 0, fog: 0, down: false };
  let knockT = 0, dreadShown = 0, fogTimer = 0;
  const nrg = { energy: 100, exhausted: false, rest: 0 };   // predicted locally, corrected by the server
  let running = false, runToggle = false;
  let px = SPAWN.x, pz = SPAWN.z, face = Math.PI, cooldown = 0, deadT = 0, deathInfo = null;
  let yaw = 0, pitch = .55, camDist = 9;
  let warnedNightDay = 0, target = null;
  let hero = null;
  const remotes = new Map();        // id -> { name, remote, av, tag }
  let net = null, lastSent = { at: 0, x: 0, z: 0, face: 0, moving: false, sprint: false, cam: 0 };

  const $ = id => document.getElementById(id);
  const ui = { hud: $('hud'), inv: $('inv'), prompt: $('prompt'), toast: $('toast'), overlay: $('overlay'), online: $('online'),
    touch: $('touchUi'), banner: $('banner'), tags: $('tags'), gear: $('btnSettings'), book: $('book'), settings: $('settings'), journal: $('journal'),
    board: $('boardPanel'), intro: $('intro'), carvingPanel: $('carvingPanel') };
  let myPatches = [];
  const WEATHER_SAY = { clear: 'The sky clears.', rain: 'It starts to rain. Fires burn smaller in the wet.',
    storm: 'A storm rolls in. The sea will bring things up tomorrow.', fogstorm: 'The fog is coming in, in broad daylight.' };
  let toastTimer = 0;
  function toast(msg) { ui.toast.textContent = msg; ui.toast.classList.add('on'); toastTimer = 2.6; }

  function showHud(on) {
    [ui.hud, ui.inv, ui.online, ui.touch, ui.gear].forEach(el => el.classList.toggle('hidden', !on));
    if (!on) { ui.prompt.classList.add('hidden'); closePanels(); }
  }

  // ================= Screens (login, ready, messages) =================
  const TOKEN_KEY = 'unknown-island-token';
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
  const setToken = v => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
  let memToken = null;   // fallback when storage is blocked
  const token = () => getToken() || memToken;

  function showView(id, title) {
    ['vAuth', 'vReady', 'vMsg'].forEach(v => $(v).classList.toggle('on', v === id));
    $('oTitle').textContent = title || 'Unknown Island';
    ui.overlay.classList.remove('gone');
  }
  function hideOverlay() { ui.overlay.classList.add('gone'); }
  function showMsg(title, text, btn, onBtn) {
    showView('vMsg', title);
    $('msgText').textContent = text;
    const b = $('msgBtn');
    b.hidden = !btn; b.textContent = btn || '';
    b.onclick = onBtn || null;
    if (btn) b.focus({ preventScroll: true });
  }

  let signupMode = false;
  function setMode(signup) {
    signupMode = signup;
    $('tabLogin').setAttribute('aria-selected', String(!signup));
    $('tabSignup').setAttribute('aria-selected', String(signup));
    $('lInvite').hidden = !signup;
    $('inInvite').required = signup;
    $('inPass').autocomplete = signup ? 'new-password' : 'current-password';
    $('authGo').textContent = signup ? 'Join the island' : 'Log in';
    $('authErr').textContent = '';
  }
  $('tabLogin').addEventListener('click', () => setMode(false));
  $('tabSignup').addEventListener('click', () => setMode(true));
  function showAuth(err) {
    showView('vAuth');
    $('authErr').textContent = err || '';
  }
  function showReady() {
    showView('vReady');
    $('readyText').textContent = `Welcome back, ${me.name}. Your friends might already be out there.`;
    $('goIsland').focus({ preventScroll: true });
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token() ? { Authorization: 'Bearer ' + token() } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
  }

  $('fAuth').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('authGo');
    btn.disabled = true; $('authErr').textContent = '';
    try {
      const body = { username: $('inName').value, password: $('inPass').value };
      if (signupMode) body.invite = $('inInvite').value;
      const r = await api(signupMode ? '/api/signup' : '/api/login', body);
      if (!r.ok) { $('authErr').textContent = r.data.error || 'That didn’t work. Try again.'; return; }
      setToken(r.data.token); memToken = r.data.token;
      me = { id: r.data.player.id, name: r.data.player.username };
      $('inPass').value = '';
      showReady();
    } catch (err) {
      $('authErr').textContent = 'Couldn’t reach the island. Check your connection.';
    } finally { btn.disabled = false; }
  });

  $('logout').addEventListener('click', async () => {
    try { await api('/api/logout', {}); } catch (e) {}
    setToken(null); memToken = null; me = null;
    showAuth();
  });

  $('goIsland').addEventListener('click', () => { Sound.init(); enterIsland(); });

  async function boot() {
    if (!token()) return showAuth();
    showMsg('Unknown Island', 'Waking the island up… (this can take up to a minute if nobody has played for a while)');
    try {
      const r = await api('/api/me');
      if (r.ok) { me = { id: r.data.player.id, name: r.data.player.username }; showReady(); }
      else if (r.status === 401) { setToken(null); showAuth(); }
      else showMsg('Hmm', 'The island isn’t answering right now.', 'Try again', boot);
    } catch (e) {
      showMsg('Hmm', 'Couldn’t reach the island. Check your connection.', 'Try again', boot);
    }
  }

  // ================= Joining the island =================
  async function enterIsland() {
    state = 'connecting';
    showMsg('Unknown Island', 'Rowing out to the island…');
    try { await layoutReady; } catch (e) { showMsg('Hmm', 'Couldn’t load the island. Check your connection.', 'Try again', () => location.reload()); return; }
    if (net) net.close();
    net = Net.connect(token(), { message: onMessage, down: onDown });
  }

  function onDown() {
    if (state === 'play' || state === 'dead') ui.banner.classList.remove('hidden');
  }

  function resetRemotes() {
    remotes.forEach(r => { removeCastaway(r.av); r.tag.remove(); });
    remotes.clear();
  }
  function addRemote(p) {
    if (!me || p.id === me.id || remotes.has(p.id)) return;
    const tag = document.createElement('div');
    tag.textContent = p.name;
    ui.tags.appendChild(tag);
    const av = makeCastaway(colorFor(p.id));
    setPatches(av, p.patches);
    remotes.set(p.id, { name: p.name, remote: new Net.Remote(p.x, p.z, p.face), av, tag, dead: p.dead, patches: p.patches || [] });
  }
  function renderOnline() {
    const rows = [`<span><i style="background:${hex(colorFor(me.id))}"></i>${esc(me.name)} (you)</span>`];
    remotes.forEach((r, id) => rows.push(`<span><i style="background:${hex(colorFor(id))}"></i>${esc(r.name)}</span>`));
    ui.online.innerHTML = `<b>On the island (${remotes.size + 1})</b>` + rows.join('');
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function onMessage(m) {
    switch (m.t) {
      case 'welcome': {
        RULES = m.rules || RULES;
        me = { id: m.you.id, name: m.you.name };
        day = m.island.day; t = m.island.time;
        warnedNightDay = isNight(t) ? day : 0;
        for (const o of objects) o.state = WG.defaultState(o.type);
        for (const [id, st] of m.states) if (objects[id]) objects[id].state = st;
        for (const o of objects) applyState(o);
        clearFires(); m.fires.forEach(addFire);
        clearDrops(); (m.drops || []).forEach(addDrop);
        clearStilled();
        clearLanterns(); (m.lanterns || []).forEach(setLantern);
        clearWash(); (m.washups || []).forEach(addWash);
        syncBugs(m.bugs || []);
        if (m.journal) journal = m.journal;
        setEnv(m.env);
        notes = m.notes || []; setBoard(m.board);
        clearCarvings(); setCarvings(m.carvings || []);
        resetRemotes(); m.players.forEach(addRemote);
        if (hero) removeCastaway(hero);
        hero = makeCastaway(colorFor(me.id));
        applySelf(m.you);
        myPatches = m.you.patches || []; setPatches(hero, myPatches);
        renderOnline();
        ui.banner.classList.add('hidden');
        hideOverlay();
        showHud(true);
        if (m.you.dead) { state = 'dead'; deadT = 2; deathInfo = { cause: '', day }; }
        else {
          const wasPlaying = state === 'play';
          state = 'play';
          if (m.firstArrival && !wasPlaying) showIntro();
          else if (!wasPlaying) toast(stats.thirst < 60 ? 'Thirsty. There might be fresh water inland.' : `Day ${day} on ${m.island.name}.`);
        }
        break;
      }
      case 'snap':
        t = m.time; day = m.day;
        syncStilled(m.s);
        for (const [id, x, z, f, moving, dead] of m.p) {
          const r = remotes.get(id);
          if (r) { r.remote.push(x, z, f, moving, dead); r.dead = !!dead; }
        }
        break;
      case 'me':
        Object.assign(stats, { health: m.health, hunger: m.hunger, thirst: m.thirst, inv: m.inv, tools: m.tools, warm: m.warm,
          dread: m.dread, fog: m.fog, down: m.down });
        // Energy runs locally for a snappy feel; follow the server if we drift.
        if (Math.abs(nrg.energy - m.energy) > 12 || nrg.exhausted !== m.exhausted) { nrg.energy = m.energy; nrg.exhausted = m.exhausted; }
        if (!ui.book.classList.contains('gone')) renderBook();
        if (!ui.carvingPanel.classList.contains('gone')) renderCarving();
        break;
      case 'join': addRemote(m.player); renderOnline(); toast(`${m.player.name} washed up on the island.`); break;
      case 'leave': {
        const r = remotes.get(m.id);
        if (r) { removeCastaway(r.av); r.tag.remove(); remotes.delete(m.id); renderOnline(); toast(`${r.name} left the island.`); }
        break;
      }
      case 'objs':
        for (const [id, s] of m.list) { const o = objects[id]; if (o) { o.state = s; applyState(o); } }
        break;
      case 'fire': if (!fires.has(m.fire.id)) addFire(m.fire); break;
      case 'fires': for (const [id, fuel] of m.list) { const f = fires.get(id); if (f) f.fuel = fuel; } break;
      case 'fx': {
        if (m.o != null && objects[m.o] && objects[m.o].mesh) objects[m.o].mesh.rotation.z = .06;
        if (me && m.id !== me.id) { const r = remotes.get(m.id); if (r) r.av.swingT = .35; }
        if (m.k === 'bell') Sound.bell(m.x, m.z);
        break;
      }
      case 'toast': toast(m.msg); break;
      case 'knocked':
        if (me && m.id === me.id) { knockT = RULES.KNOCK ? RULES.KNOCK.DOWN_MS / 1000 : 3; }
        else { const r = remotes.get(m.id); if (r) r.knockT = 3; }
        break;
      case 'drop': addDrop(m.drop); break;
      case 'lanterns': for (const l of m.list) setLantern(l); break;
      case 'wash': addWash(m.w); break;
      case 'unwash': m.ids.forEach(removeWash); break;
      case 'bugs': syncBugs(m.list); break;
      case 'journal':
        journal.mine[m.key] = m.count; if (m.first) journal.firsts[m.key] = m.first;
        if (m.count === 1) { const e = journal.entries.find(e => e.key === m.key); if (e) stamp(`New in your journal: ${e.name}`); }
        if (!ui.journal.classList.contains('gone')) renderJournal();
        break;
      case 'discovery':
        journal.firsts[m.key] = m.by;
        if (!me || m.by !== me.name) toast(`${m.by} found the first ${m.name.toLowerCase()} on the island.`);
        break;
      case 'env': {
        const was = env;
        setEnv(m.env);
        if (state === 'play' && was.weather !== env.weather) toast(WEATHER_SAY[env.weather] || '');
        break;
      }
      case 'carvings': setCarvings(m.list, m.changed, m.why); break;
      case 'note':
        notes.push(m.note); if (notes.length > 40) notes.shift(); renderScraps();
        if (!ui.board.classList.contains('gone')) renderBoard();
        if (state === 'play' && (!me || m.note.by !== me.name) && board && Math.hypot(board.x - px, board.z - pz) < 40)
          toast(m.note.by ? `${m.note.by} pinned a note to the driftwood board.` : 'There is a new note on the driftwood board.');
        break;
      case 'patches':
        if (me && m.id === me.id) { myPatches = m.list; setPatches(hero, m.list); if (!ui.journal.classList.contains('gone')) renderJournal(); }
        else { const r = remotes.get(m.id); if (r) { r.patches = m.list; setPatches(r.av, m.list); } }
        break;
      case 'unfire': { const f = fires.get(m.id); if (f) { scene.remove(f.mesh); fires.delete(m.id); } break; }
      case 'movedrop': { const d = drops.get(m.id); if (d) { d.x = m.x; d.z = m.z; d.mesh.position.set(m.x, groundAt(m.x, m.z), m.z); } break; }
      case 'undrop': removeDrop(m.id); break;
      case 'dawn':
        if (state === 'play') toast(`Morning of day ${m.day}. You made it through the night.`);
        break;
      case 'correct': px = m.x; pz = m.z; break;
      case 'died': state = 'dead'; deadT = 0; deathInfo = { cause: m.cause, day: m.day }; ui.prompt.classList.add('hidden'); break;
      case 'respawned':
        applySelf(m.you);
        hero.root.rotation.x = 0;
        myPatches = m.you.patches || myPatches; setPatches(hero, myPatches);
        state = 'play'; hideOverlay(); showHud(true);
        toast('You wake up on the beach again.');
        break;
      case 'kicked':
        leaveToTitle();
        showMsg('Unknown Island', m.reason, 'OK', showReady);
        break;
      case 'auth-failed':
        leaveToTitle();
        setToken(null); memToken = null;
        showAuth('Your login expired. Please log in again.');
        break;
    }
  }

  function applySelf(you) {
    px = you.x; pz = you.z; face = you.face;
    Object.assign(stats, { health: you.health, hunger: you.hunger, thirst: you.thirst, inv: you.inv, tools: you.tools, dread: you.dread || 0 });
    Object.assign(nrg, { energy: you.energy, exhausted: you.exhausted, rest: 0 });
  }

  function leaveToTitle() {
    if (net) { net.close(); net = null; }
    state = 'title';
    showHud(false);
    ui.banner.classList.add('hidden');
    resetRemotes(); clearStilled();
    if (hero) { removeCastaway(hero); hero = null; }
  }

  function showDeath() {
    const how = { hunger: 'You starved', thirst: 'You ran out of water', cold: 'The night was too cold' }[deathInfo && deathInfo.cause] || 'You didn’t make it';
    showHud(false);
    showMsg(`Day ${deathInfo ? deathInfo.day : day}`,
      `${how}. You lost what you were carrying. Tip: coconuts and berries grow back every morning, and a fire keeps you warm through the night.`,
      'Wake up on the beach', () => { if (net) net.send({ t: 'respawn' }); });
  }

  // ================= Actions =================
  function findTarget() {
    let bestO = null, bd = 1e9;
    const check = o => {
      if (o.state.gone) return;
      const d = Math.hypot(o.x - px, o.z - pz) - radius(o);
      if (d < RULES.REACH && d < bd) { bd = d; bestO = o; }
    };
    nearbyObjects(px, pz, check); fires.forEach(check); drops.forEach(check); lanterns.forEach(check); washups.forEach(check);
    if (board) check(board);
    carvings.forEach(check);
    bugs.forEach(b => { const d = Math.hypot((b.cx ?? b.x) - px, (b.cz ?? b.z) - pz); if (d < 1.9 && d < bd) { bd = d; bestO = b; } });
    if (bestO) return bestO;
    const sn = WG.nearestSpring(px, pz);
    if (Math.hypot(px - sn.x, pz - sn.z) < RULES.SPRING_REACH) return { type: 'spring' };
    if (heightAt(px, pz) < .25) return { type: 'sea' };
    return null;
  }
  function label(o) {
    if (!o) return '';
    switch (o.type) {
      case 'spring': return 'Drink from the spring';
      case 'sea': return 'Drink seawater';
      case 'palm': return o.state.coconuts > 0 ? 'Pick a coconut' : o.state.planted != null ? 'Chop the young palm' : 'Chop the palm';
      case 'tree': return o.state.planted != null ? 'Chop the young tree' : 'Chop the tree';
      case 'bush': return o.state.berries ? 'Eat berries' : 'Bush (picked clean)';
      case 'rock': return o.species === 'pebble' ? 'Pick up stones' : 'Gather stone';
      case 'ore': return has('pickaxe') ? `Mine ${o.ore === 'iron' ? 'iron' : 'copper'} ore` : `${o.ore === 'iron' ? 'Iron' : 'Copper'} ore (needs a pickaxe)`;
      case 'dig': return o.state.dug ? 'Dug up (settles by morning)' : has('shovel') ? 'Dig for clay' : 'Soft soil (needs a shovel)';
      case 'drop': return 'Pick up the scattered things';
      case 'carving': return o.offer && o.tally ? `Read the ${o.key} stone (it wants ${WG.ITEMS[o.offer].toLowerCase()})` : `Read the ${o.key} stone`;
      case 'board': return notes.length ? `Read the driftwood board (${notes.length} note${notes.length > 1 ? 's' : ''})` : 'The driftwood board (pin a note)';
      case 'wash': return o.kind === 'strange' ? (o.key === 'door_in_sand' ? 'Try the door' : o.key === 'ringing_bell' ? 'Touch the bell' : o.key === 'footprints' ? 'Look at the footprints' : 'Pick it up') : `Pick up: ${o.label.replace(/^A /, 'a ')}`;
      case 'bug': { const e = journal.entries.find(e => e.key === o.key); return `Catch the ${(e ? e.name : 'bug').toLowerCase()}`; }
      case 'lantern': {
        const oil = (stats.inv.oil || 0) > 0;
        if (o.lit) return oil ? `Add lamp oil (burns ${Math.ceil(o.fuel / RULES.DAY_LEN * 24)} more hours)` : 'A lit stone lantern';
        if (!oil && o.reclaim < 1) return `Gone cold. The fog is creeping back (${Math.round(o.reclaim * 100)}%)`;
        if (!oil) return o.big ? `Great stone lantern (needs lamp oil from ${o.need} frogs)` : 'Old stone lantern (needs lamp oil)';
        return o.big ? `Offer lamp oil (${o.have}/${o.need} frogs)` : 'Light it with lamp oil';
      }
      case 'fire': { const n = o.kind === 'hearth' ? 'hearth' : 'fire';
        return (stats.inv.wood || 0) > 0 ? (o.fuel > 0 ? `Add wood to the ${n}` : 'Relight with wood') : `${n[0].toUpperCase() + n.slice(1)} (needs wood)`; }
    }
  }
  const has = tool => stats.tools.includes(tool);
  function targetKey(o) {
    if (o.type === 'spring' || o.type === 'sea') return o.type;
    return ({ fire: 'f', drop: 'd', lantern: 'l', wash: 'w', bug: 'b' }[o.type] || 'o') + o.id;
  }
  function act() {
    if (state !== 'play' || cooldown > 0 || !target || !net || knockT > 0) return;
    cooldown = .45;
    if (target.type === 'board') { togglePanel('board'); return; }
    if (target.type === 'carving') { readCarving(target); return; }
    if (['palm', 'tree', 'rock', 'fire', 'ore', 'dig', 'lantern'].includes(target.type)) hero.swingT = .35;
    net.send({ t: 'act', target: targetKey(target) });
  }
  // Build a recipe: tools are made on the spot, fires are placed in front of you.
  function build(id) {
    if (state !== 'play' || !net) return;
    const r = WG.recipeById(id);
    if (!r) return;
    if (r.kind === 'tool') { net.send({ t: 'build', recipe: id }); return; }
    const fx = px + Math.sin(face) * 1.6, fz = pz + Math.cos(face) * 1.6;
    if (heightAt(fx, fz) < .35) { toast('Too wet here. Build it on dry ground.'); return; }
    net.send({ t: 'build', recipe: id, x: fx, z: fz });
  }
  const canAfford = r => Object.entries(r.cost).every(([k, n]) => (stats.inv[k] || 0) >= n);
  $('btnAct').addEventListener('click', act);
  $('btnBook').addEventListener('click', () => togglePanel('book'));
  $('btnJournal').addEventListener('click', () => togglePanel('journal'));
  $('btnSettings').addEventListener('click', () => togglePanel('settings'));
  $('btnRun').addEventListener('click', () => { runToggle = !runToggle; $('btnRun').setAttribute('aria-pressed', String(runToggle)); });

  // ================= Input =================
  // Controls are stored by physical key (e.code), so they work on any keyboard layout.
  const ACTIONS = [
    ['forward', 'Walk forward', 'KeyW'], ['back', 'Walk back', 'KeyS'], ['left', 'Walk left', 'KeyA'], ['right', 'Walk right', 'KeyD'],
    ['sprint', 'Sprint (hold)', 'ShiftLeft'], ['act', 'Use / pick up', 'KeyE'], ['build', 'Quick-build campfire', 'KeyF'],
    ['book', 'Recipe book', 'KeyB'], ['journal', 'Journal', 'KeyJ'],
  ];
  const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
  const PREFS_KEY = 'unknown-island-prefs';
  let prefs = { binds: { ...DEFAULT_BINDS }, sens: 1, invertY: false, quality: 'auto', sounds: true };
  try { const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (saved) prefs = { ...prefs, ...saved, binds: { ...DEFAULT_BINDS, ...saved.binds } }; } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} };
  function keyLabel(code) {
    if (!code) return '—';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const names = { ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt',
      AltRight: 'Right Alt', Space: 'Space', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps Lock', Backquote: '`', Backspace: 'Backspace',
      ArrowUp: '\u2191', ArrowDown: '\u2193', ArrowLeft: '\u2190', ArrowRight: '\u2192' };
    return names[code] || code.replace(/^Numpad/, 'Num ');
  }

  const keys = {};
  const held = a => !!keys[prefs.binds[a]];
  let waitingBind = null;
  const PANELS = ['book', 'settings', 'journal', 'board', 'carvingPanel'];
  const panelOpen = () => PANELS.some(k => !ui[k].classList.contains('gone')) || !ui.intro.classList.contains('gone');
  window.addEventListener('keydown', e => {
    if (waitingBind) {
      e.preventDefault();
      if (e.code !== 'Escape') {
        // Taking a key another action uses swaps them.
        const other = Object.keys(prefs.binds).find(a => a !== waitingBind && prefs.binds[a] === e.code);
        if (other) prefs.binds[other] = prefs.binds[waitingBind];
        prefs.binds[waitingBind] = e.code;
        savePrefs();
      }
      waitingBind = null;
      renderBinds();
      return;
    }
    if (state !== 'play' && state !== 'dead') return;
    if (e.code === 'Escape') { e.preventDefault(); if (!ui.intro.classList.contains('gone')) closeIntro(); else if (panelOpen()) closePanels(); else if (state === 'play') togglePanel('settings'); return; }
    if (panelOpen()) {
      if ((e.code === prefs.binds.book && !ui.book.classList.contains('gone')) || (e.code === prefs.binds.journal && !ui.journal.classList.contains('gone'))) closePanels();
      return;
    }
    if (state !== 'play') return;
    if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
    keys[e.code] = true;
    if (e.code === prefs.binds.act) act();
    if (e.code === prefs.binds.build) build('campfire');
    if (e.code === prefs.binds.book) togglePanel('book');
    if (e.code === prefs.binds.journal) togglePanel('journal');
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  const releaseKeys = () => { for (const k in keys) keys[k] = false; };
  window.addEventListener('blur', releaseKeys);

  let lastInv = '';
  function renderInventory() {
    const key = JSON.stringify([stats.inv, stats.tools, prefs.binds.book]);
    if (key === lastInv) return;
    lastInv = key;
    $('invList').innerHTML = Object.keys(WG.ITEMS).filter(k => k === 'wood' || k === 'stone' || stats.inv[k] > 0)
      .map(k => `<span>${esc(WG.ITEMS[k])} <b>${stats.inv[k] || 0}</b></span>`).join('');
    $('toolList').innerHTML = stats.tools.map(t => `<span>${esc(WG.recipeById(t).name)}</span>`).join('');
    const ready = WG.RECIPES.filter(r => canAfford(r) && !(r.kind === 'tool' && has(r.id)) && !(r.needs && !has(r.needs))).length;
    $('craftHint').textContent = ready
      ? `You can make ${ready} thing${ready > 1 ? 's' : ''}. Press ${keyLabel(prefs.binds.book)} for recipes.`
      : `Press ${keyLabel(prefs.binds.book)} for the recipe book.`;
  }

  // ================= Journal (a tattoo flash sheet) =================
  let journal = { entries: [], firsts: {}, mine: {} };
  const JCATS = [['bugs', 'Bugs'], ['moon', 'Under the full moon'], ['shells', 'Shells'], ['glass', 'Sea glass'], ['tide', 'From the tide'], ['strange', 'Strange tides'], ['relics', 'Left by the stones']];
  const iconCache = new Map();
  // Each entry gets a small inked design, drawn once.
  function flashIcon(key, known) {
    const id = key + (known ? '' : '?');
    if (iconCache.has(id)) return iconCache.get(id);
    const c = document.createElement('canvas'); c.width = c.height = 120;
    const g = c.getContext('2d'), INK = '#2B211F';
    g.lineWidth = 5; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = INK;
    const fill = (col, draw) => { g.beginPath(); draw(); g.fillStyle = col; g.fill(); g.stroke(); };
    if (!known) {
      g.setLineDash([6, 8]); g.beginPath(); g.arc(60, 60, 34, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.font = 'bold 40px sans-serif'; g.fillStyle = INK; g.textAlign = 'center'; g.fillText('?', 60, 74);
    } else if (key === 'firefly' || key === 'moon_moth') {
      const moth = key === 'moon_moth';
      for (const sx of [-1, 1]) fill(moth ? '#F3EAD6' : '#E9F1F3', () => g.ellipse(60 + sx * 24, 52, 22, moth ? 26 : 12, sx * .5, 0, Math.PI * 2));
      fill(moth ? '#D9CDB4' : '#E8D24A', () => g.ellipse(60, 64, 10, 24, 0, 0, Math.PI * 2));
      if (!moth) { g.fillStyle = 'rgba(232,242,122,.55)'; g.beginPath(); g.arc(60, 80, 16, 0, Math.PI * 2); g.fill(); }
    } else if (key === 'dragonfly') {
      for (const [y, l] of [[46, 34], [58, 30]]) for (const sx of [-1, 1]) fill('#DCE9EC', () => g.ellipse(60 + sx * l * .8, y, l * .8, 8, 0, 0, Math.PI * 2));
      fill('#5F7FA8', () => g.ellipse(60, 64, 7, 34, 0, 0, Math.PI * 2));
    } else if (key === 'cricket' || key === 'bark_beetle') {
      const beetle = key === 'bark_beetle';
      for (const sx of [-1, 1]) for (const y of [48, 62, 76]) { g.beginPath(); g.moveTo(60, y); g.lineTo(60 + sx * 34, y + (beetle ? 8 : 14)); g.stroke(); }
      fill(beetle ? '#4A3A34' : '#7C9A6B', () => g.ellipse(60, 62, beetle ? 20 : 14, beetle ? 28 : 32, 0, 0, Math.PI * 2));
      fill(beetle ? '#4A3A34' : '#7C9A6B', () => g.arc(60, 30, 10, 0, Math.PI * 2));
      if (beetle) { g.beginPath(); g.moveTo(60, 38); g.lineTo(60, 88); g.stroke(); }
    } else if (key === 'carved_mask') {
      fill('#8A6A52', () => g.ellipse(60, 60, 30, 40, 0, 0, Math.PI * 2));
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(60 + sx * 22, 48); g.quadraticCurveTo(60 + sx * 12, 54, 60 + sx * 4, 48); g.stroke(); }
      g.beginPath(); g.moveTo(40, 78); g.quadraticCurveTo(60, 90, 80, 78); g.stroke();
      g.beginPath(); g.moveTo(60, 22); g.lineTo(60, 34); g.moveTo(46, 26); g.lineTo(50, 36); g.moveTo(74, 26); g.lineTo(70, 36); g.stroke();
    } else if (key === 'eye_stone') {
      fill('#B3AC9F', () => g.arc(60, 60, 36, 0, Math.PI * 2));
      fill('#2B211F', () => g.ellipse(60, 60, 18, 12, 0, 0, Math.PI * 2));
      g.fillStyle = '#E9E1CF'; g.beginPath(); g.arc(66, 56, 4, 0, 7); g.fill();
    } else if (key === 'old_tooth') {
      fill('#EBD9C3', () => { g.moveTo(30, 30); g.quadraticCurveTo(80, 20, 92, 96); g.quadraticCurveTo(70, 60, 30, 50); g.closePath(); });
      g.beginPath(); g.moveTo(36, 40); g.quadraticCurveTo(66, 38, 82, 80); g.stroke();
    } else if (key === 'glass_snail') {
      fill('#E7DCC8', () => g.ellipse(56, 82, 40, 10, 0, 0, Math.PI * 2));
      fill('rgba(207,230,234,.8)', () => g.arc(62, 60, 26, 0, Math.PI * 2));
      g.beginPath(); for (let a = 0; a < Math.PI * 3; a += .15) { const r = 20 * (1 - a / (Math.PI * 3.3)); g.lineTo(62 + Math.cos(a) * r, 60 + Math.sin(a) * r); } g.stroke();
      g.fillStyle = '#D9605A'; g.beginPath(); g.arc(62, 60, 5, 0, 7); g.fill();
      g.beginPath(); g.moveTo(22, 78); g.lineTo(14, 62); g.moveTo(28, 78); g.lineTo(26, 60); g.stroke();
    } else if (key === 'rain_beetle') {
      for (const sx of [-1, 1]) for (const y of [50, 64, 78]) { g.beginPath(); g.moveTo(60, y); g.lineTo(60 + sx * 32, y + 10); g.stroke(); }
      fill('#3F5F6A', () => g.ellipse(60, 64, 22, 28, 0, 0, Math.PI * 2)); fill('#3F5F6A', () => g.arc(60, 32, 10, 0, Math.PI * 2));
      g.fillStyle = '#CFE6EA'; [[52, 56], [68, 70], [56, 80]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 3, 5, 0, 0, 7); g.fill(); });
    } else if (key === 'glow_mushroom') {
      for (const [x, y, k] of [[48, 90, 1], [80, 94, .7]]) {
        fill('#E9F1DA', () => g.rect(x - 6 * k, y - 40 * k, 12 * k, 40 * k));
        fill('#9FE3C8', () => { g.moveTo(x - 28 * k, y - 38 * k); g.quadraticCurveTo(x, y - 80 * k, x + 28 * k, y - 38 * k); g.closePath(); });
      }
      g.fillStyle = 'rgba(159,227,200,.4)'; g.beginPath(); g.arc(56, 50, 40, 0, 7); g.fill();
    } else if (key === 'lantern_fish') {
      fill('#3E4A5A', () => g.ellipse(52, 66, 34, 20, 0, 0, Math.PI * 2));
      fill('#3E4A5A', () => { g.moveTo(84, 66); g.lineTo(104, 50); g.lineTo(104, 82); g.closePath(); });
      g.beginPath(); g.moveTo(34, 50); g.quadraticCurveTo(30, 20, 14, 26); g.stroke();
      g.fillStyle = 'rgba(243,210,122,.5)'; g.beginPath(); g.arc(14, 26, 14, 0, 7); g.fill(); fill('#F3D27A', () => g.arc(14, 26, 6, 0, 7));
      g.fillStyle = '#F3EAD6'; g.beginPath(); g.arc(34, 62, 4, 0, 7); g.fill();
    } else if (key === 'spiral_shell' || key === 'conch') {
      fill(key === 'conch' ? '#E3A89A' : '#EBD9C3', () => { g.moveTo(22, 80); g.quadraticCurveTo(60, 10, 98, 50); g.quadraticCurveTo(80, 95, 22, 80); });
      g.beginPath(); for (let a = 0; a < Math.PI * 4; a += .15) { const r = 22 * (1 - a / (Math.PI * 4.4)); g.lineTo(66 + Math.cos(a) * r, 56 + Math.sin(a) * r); } g.stroke();
    } else if (key === 'cowrie') {
      fill('#EBD9C3', () => g.ellipse(60, 60, 26, 36, 0, 0, Math.PI * 2));
      g.beginPath(); g.moveTo(60, 32); g.quadraticCurveTo(52, 60, 60, 88); g.stroke();
      g.fillStyle = '#B08A6A'; [[48, 44], [72, 52], [50, 74], [70, 78]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
    } else if (key === 'scallop') {
      fill('#E3A89A', () => { g.moveTo(60, 94); g.lineTo(20, 46); g.quadraticCurveTo(60, 8, 100, 46); g.closePath(); });
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(60, 92); g.lineTo(60 + i * 16, 30 + Math.abs(i) * 6); g.stroke(); }
    } else if (key === 'sand_dollar') {
      fill('#EBD9C3', () => g.arc(60, 60, 36, 0, Math.PI * 2));
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.ellipse(60 + Math.cos(a) * 16, 60 + Math.sin(a) * 16, 4, 10, a + Math.PI / 2, 0, 7); g.stroke(); }
    } else if (key.startsWith('glass_')) {
      fill({ glass_green: '#7FBF8A', glass_blue: '#6FA3D0', glass_amber: '#E0A33A', glass_violet: '#A88BD8' }[key],
        () => { g.moveTo(30, 58); g.lineTo(52, 26); g.lineTo(90, 40); g.lineTo(96, 76); g.lineTo(58, 94); g.closePath(); });
      g.beginPath(); g.moveTo(52, 26); g.lineTo(62, 60); g.lineTo(96, 76); g.moveTo(62, 60); g.lineTo(58, 94); g.stroke();
    } else if (key === 'silverfin') {
      fill('#B9C3C6', () => g.ellipse(54, 60, 34, 16, 0, 0, Math.PI * 2));
      fill('#B9C3C6', () => { g.moveTo(86, 60); g.lineTo(106, 44); g.lineTo(106, 76); g.closePath(); });
      g.fillStyle = INK; g.beginPath(); g.arc(34, 56, 3, 0, 7); g.fill();
    } else if (key === 'door_in_sand') {
      fill('#8A6A52', () => g.rect(38, 18, 44, 76)); g.beginPath(); g.moveTo(20, 94); g.lineTo(100, 94); g.stroke();
      g.fillStyle = '#C9A04A'; g.beginPath(); g.arc(74, 58, 4, 0, 7); g.fill();
    } else if (key === 'ringing_bell') {
      fill('#8A6A52', () => g.rect(16, 88, 88, 10));
      fill('#C9A04A', () => { g.moveTo(44, 78); g.quadraticCurveTo(44, 30, 60, 28); g.quadraticCurveTo(76, 30, 76, 78); g.closePath(); });
      for (const sx of [-1, 1]) { g.beginPath(); g.arc(60, 54, 34, sx > 0 ? -.4 : Math.PI - .4 + .8, sx > 0 ? .4 : Math.PI + .4); g.stroke(); }
    } else if (key === 'your_cloak') {
      fill(me ? hex(colorFor(me.id)) : '#8A6A52', () => { g.moveTo(40, 24); g.lineTo(80, 24); g.lineTo(96, 96); g.lineTo(24, 96); g.closePath(); });
      fill('#D9C9A6', () => g.rect(52, 60, 16, 14));
    } else if (key === 'footprints') {
      for (let i = 0; i < 4; i++) { const x = 44 + (i % 2) * 30, y = 96 - i * 24; fill('#6E5646', () => g.ellipse(x, y, 7, 10, 0, 0, 7));
        for (const dx of [-7, 0, 7]) { g.beginPath(); g.arc(x + dx, y - 12, 3, 0, 7); g.fillStyle = '#6E5646'; g.fill(); } }
    } else fill('#D9C9A6', () => g.arc(60, 60, 30, 0, Math.PI * 2));
    const url = c.toDataURL();
    iconCache.set(id, url);
    return url;
  }
  function renderJournal() {
    const found = Object.keys(journal.mine).length;
    $('journalCount').textContent = `${found} of ${journal.entries.length} found`;
    $('journalBody').innerHTML = renderCloak() + JCATS.map(([cat, title]) => {
      const list = journal.entries.filter(e => e.category === cat);
      if (!list.length) return '';
      return `<h3>${esc(title)}</h3><div class="flash">` + list.map(e => {
        const n = journal.mine[e.key] || 0, known = n > 0, first = journal.firsts[e.key];
        return `<figure class="flashcard ${known ? '' : 'unknown'} r-${esc(e.rarity)}">
          <img src="${flashIcon(e.key, known)}" alt="">
          <figcaption><b>${known ? esc(e.name) : '???'}</b>
          ${known ? `<span class="desc">${esc(e.description)}</span><span class="meta">Found ${n}\u00d7${first ? ` \u00b7 first found by ${esc(first)}` : ''}</span>`
                  : first ? `<span class="meta">Someone has found this</span>` : ''}</figcaption></figure>`;
      }).join('') + '</div>';
    }).join('');
  }
  // Your cloak: stitch patches made from things you've found (up to PATCH_SLOTS).
  function renderCloak() {
    const slots = RULES.PATCH_SLOTS || 3;
    return `<h3>Your cloak <small>(${myPatches.length} of ${slots} patches)</small></h3><div class="patches">` + WG.PATCHES.map(pt => {
      const on = myPatches.includes(pt.key), found = (journal.mine[pt.needs] || 0) > 0;
      const need = journal.entries.find(e => e.key === pt.needs);
      const btn = on ? `<button type="button" class="link" data-patch="${pt.key}" data-on="0">Unpick</button>`
        : found ? `<button type="button" class="main" data-patch="${pt.key}" data-on="1"${myPatches.length >= slots ? ' disabled' : ''}>Stitch on</button>`
        : `<span class="meta">Find a ${esc(need ? need.name.toLowerCase() : pt.needs)} first</span>`;
      return `<div class="patch${on ? ' on' : ''}"><i style="background:${hex(PATCH_COL[pt.key])}"></i><div><b>${esc(found || on ? pt.name : '???')}</b>
        ${found || on ? `<span class="desc">${esc(pt.perk)} <em>${esc(pt.cost)}</em></span>` : ''}</div>${btn}</div>`;
    }).join('') + '</div>';
  }
  $('journalBody').addEventListener('click', e => {
    const b = e.target.closest('[data-patch]');
    if (!b || b.disabled || !net) return;
    net.send({ t: 'patch', key: b.dataset.patch, on: b.dataset.on === '1' });
  });

  // ================= Driftwood board panel =================
  function renderBoard() {
    const list = notes.slice().reverse();
    $('boardNotes').innerHTML = list.length ? list.map(n => {
      const when = n.at ? new Date(n.at) : null;
      return `<div class="scrap"><p>${esc(n.text)}</p><span>${n.by ? '\u2014 ' + esc(n.by) : 'no name'}${when && !isNaN(when) ? ' \u00b7 ' + when.toLocaleDateString() : ''}</span></div>`;
    }).join('') : '<p class="note">Nothing pinned yet.</p>';
  }
  $('boardForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('boardText').value.trim();
    if (!text || !net) return;
    net.send({ t: 'pin', text });
    $('boardText').value = '';
  });
  $('boardText').addEventListener('keydown', e => { if (e.code !== 'Escape') e.stopPropagation(); });

  // ================= Reading a carving =================
  let reading = null;
  function readCarving(c) {
    reading = c;
    togglePanel('carvingPanel');
    if (isNight(t)) {   // at night you can hear it
      Sound.init(); Sound.breath();
      $('carveEar').textContent = 'You press your ear to the stone. Something far beneath it is breathing, slow and deep.';
    } else $('carveEar').textContent = '';
  }
  function renderCarving() {
    const c = reading && carvings.get(reading.id);
    if (!c) return;
    $('carveTitle').textContent = `The ${c.key} stone`;
    $('carveText').textContent = c.text;
    $('carveText').className = 'carved ' + (c.stateName || '');
    const [have, need] = c.tally || [0, 0];
    $('carveTally').textContent = c.tally && need > 1 ? `Marks scratched beneath: ${have} of ${need}.` : '';
    $('carveNote').textContent = c.stateName === 'active' ? 'Nobody knows what happens if it is ignored. It changes at dawn.'
      : c.stateName === 'done' ? 'The carving is fresh. Something was given back.' : c.stateName === 'failed' ? 'The words look angry, somehow.' : 'Old words, worn soft.';
    const b = $('carveOffer'), n = c.offer ? (stats.inv[c.offer] || 0) : 0;
    b.hidden = !(c.offer && c.stateName === 'active');
    b.disabled = n <= 0;
    b.textContent = n > 0 ? `Leave ${Math.min(n, need - have)} ${WG.ITEMS[c.offer].toLowerCase()} at its foot` : `You have no ${c.offer ? WG.ITEMS[c.offer].toLowerCase() : ''}`;
  }
  $('carveOffer').addEventListener('click', () => { if (reading && net) { net.send({ t: 'act', target: 'c' + reading.id }); if (hero) hero.swingT = .35; } });

  // ================= First arrival =================
  function showIntro() {
    ui.intro.classList.remove('gone');
    $('introGo').focus({ preventScroll: true });
  }
  function closeIntro() { ui.intro.classList.add('gone'); toast('Thirsty. There might be fresh water inland.'); }
  $('introGo').addEventListener('click', closeIntro);

  let stampT = null;
  function stamp(msg) { const el = $('stamp'); el.textContent = msg; el.classList.add('on'); clearTimeout(stampT); stampT = setTimeout(() => el.classList.remove('on'), 3200); }

  // ================= Recipe book & settings =================
  function togglePanel(which) {
    const el = ui[which];
    const opening = el.classList.contains('gone');
    closePanels();
    if (!opening) return;
    releaseKeys();
    if (which === 'book') renderBook(); else if (which === 'journal') renderJournal(); else if (which === 'board') renderBoard();
    else if (which === 'carvingPanel') renderCarving(); else renderSettings();
    el.classList.remove('gone');
    const first = el.querySelector('.x');
    if (first) first.focus({ preventScroll: true });
  }
  function closePanels() {
    waitingBind = null;
    PANELS.forEach(k => ui[k].classList.add('gone'));
  }
  document.querySelectorAll('.panel').forEach(p => p.addEventListener('click', e => {
    if (e.target === p || e.target.closest('[data-close]')) closePanels();
  }));

  function renderBook() {
    $('recipes').innerHTML = WG.RECIPES.map(r => {
      const owned = r.kind === 'tool' && has(r.id);
      const locked = r.needs && !has(r.needs);
      const ok = canAfford(r) && !owned && !locked;
      const cost = Object.entries(r.cost).map(([k, n]) => {
        const have = stats.inv[k] || 0;
        return `<span class="${have >= n ? 'ok' : 'no'}">${esc(WG.ITEMS[k])} ${Math.min(have, n)}/${n}</span>`;
      }).join('');
      const btn = owned ? 'You have one' : r.kind === 'tool' ? 'Make' : 'Build';
      return `<div class="recipe${ok ? ' can' : ''}"><div class="r-top"><b>${esc(r.name)}</b><span class="kind">${r.kind === 'tool' ? 'Tool' : 'Fire'}</span></div>
        <p>${esc(r.desc)}</p><div class="r-bot"><div class="cost">${cost}</div>
        <button type="button" class="main" data-build="${r.id}"${ok ? '' : ' disabled'}>${btn}</button></div></div>`;
    }).join('');
  }
  $('recipes').addEventListener('click', e => {
    const b = e.target.closest('[data-build]');
    if (!b || b.disabled) return;
    const r = WG.recipeById(b.dataset.build);
    build(r.id);
    if (r.kind === 'fire') closePanels();   // step back and see it
  });

  function renderBinds() {
    $('binds').innerHTML = ACTIONS.map(([a, name]) =>
      `<div class="bind"><span>${esc(name)}</span><button type="button" data-bind="${a}" class="${waitingBind === a ? 'wait' : ''}">${waitingBind === a ? 'Press a key\u2026' : esc(keyLabel(prefs.binds[a]))}</button></div>`).join('');
  }
  function renderSettings() {
    renderBinds();
    $('sens').value = prefs.sens;
    $('invertY').checked = prefs.invertY;
    $('quality').value = prefs.quality;
    $('sounds').checked = prefs.sounds !== false;
  }
  $('binds').addEventListener('click', e => {
    const b = e.target.closest('[data-bind]');
    if (!b) return;
    waitingBind = waitingBind === b.dataset.bind ? null : b.dataset.bind;
    renderBinds();
  });
  $('resetKeys').addEventListener('click', () => { prefs.binds = { ...DEFAULT_BINDS }; waitingBind = null; savePrefs(); renderBinds(); });
  $('sens').addEventListener('input', e => { prefs.sens = +e.target.value; savePrefs(); });
  $('invertY').addEventListener('change', e => { prefs.invertY = e.target.checked; savePrefs(); });
  $('quality').addEventListener('change', e => { prefs.quality = e.target.value; savePrefs(); applyQuality(); });
  $('sounds').addEventListener('change', e => { prefs.sounds = e.target.checked; savePrefs(); if (prefs.sounds) Sound.init(); });
  $('resume').addEventListener('click', closePanels);
  $('logout2').addEventListener('click', async () => {
    closePanels();
    leaveToTitle();
    try { await api('/api/logout', {}); } catch (e) {}
    setToken(null); memToken = null; me = null;
    showAuth();
  });

  const joyEl = $('joy'), knob = $('joyKnob');
  const joy = { id: null, sx: 0, sy: 0, x: 0, y: 0 };
  const orb = { id: null, lx: 0, ly: 0 };
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * .45 && joy.id === null) {
      joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.x = joy.y = 0;
      joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.style.display = 'block';
      knob.style.transform = '';
    } else if (orb.id === null) { orb.id = e.pointerId; orb.lx = e.clientX; orb.ly = e.clientY; }
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.sx, dy = e.clientY - joy.sy; const l = Math.hypot(dx, dy);
      if (l > 45) { dx *= 45 / l; dy *= 45 / l; }
      joy.x = dx / 45; joy.y = dy / 45; knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (e.pointerId === orb.id) {
      yaw -= (e.clientX - orb.lx) * .007 * prefs.sens;
      pitch = clamp(pitch + (e.clientY - orb.ly) * .004 * prefs.sens * (prefs.invertY ? -1 : 1), .18, 1.15);
      orb.lx = e.clientX; orb.ly = e.clientY;
    }
  });
  const endPtr = e => {
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = 'none'; }
    if (e.pointerId === orb.id) orb.id = null;
  };
  stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', e => { camDist = clamp(camDist + e.deltaY * .01, 5, 16); }, { passive: true });

  // ================= Resize =================
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const rw = Math.floor(w * PR), rh = Math.floor(h * PR);
    colorRT.setSize(rw, rh); normalRT.setSize(rw, rh);
    inkMat.uniforms.res.value.set(rw, rh);
    inkMat.uniforms.width.value = Math.max(1.5, rh / 420);   // line thickness follows screen size
    camera.aspect = w / h; camera.fov = w / h < .8 ? 68 : 55;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // Graphics quality. Low: normal resolution, no shadows, outlines from depth only
  // (one scene pass instead of two). Auto picks Low on phones and tablets.
  let lowGfx = false;
  function applyQuality() {
    lowGfx = prefs.quality === 'low' || (prefs.quality !== 'high' && coarse);
    PR = lowGfx ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(PR);
    sun.castShadow = !lowGfx;
    inkMat.uniforms.useNormals.value = lowGfx ? 0 : 1;
    resize();
  }
  applyQuality();
  if (/[?&]debug/.test(location.search)) { renderer.info.autoReset = false; window.__dbg = { renderer, scene, camera, chunks, objects: () => objects, stats, stilled,
    pos: () => ({ x: px, z: pz }), lookAt: (x, z) => { yaw = Math.atan2(-(x - px), -(z - pz)); },
    washups: () => washups, bugs: () => bugs, previewJournal: keys => { keys.forEach(k => { journal.mine[k] = 1 + (k.length % 3); journal.firsts[k] = journal.firsts[k] || 'aiman'; }); },
    setEnv: e => setEnv(e), carvings: () => carvings, read: id => readCarving(carvings.get(id)),
    recarve: (id, text, st) => { const c = carvings.get(id); setCarvings([{ id, key: c.key, x: c.x, z: c.z, face: c.mesh.rotation.y, text, state: st || 'active', tally: [2, 5] }], id, 'new'); }, face: () => face, gy: () => groundAt(px, pz), board: () => board, openPanel: w => togglePanel(w), patches: l => { myPatches = l; setPatches(hero, l); },
    lanterns: () => lanterns, previewLantern: (id, lit) => { const l = lanterns.get(id); setLantern({ ...l, lit, fuel: 400 }); } }; }

  // ================= Sky =================
  const skyKeys = [
    [0, 0x2E3444, 0x7E8AAE, .1], [.2, 0x3A4052, 0x8E9AB8, .12], [.25, 0xE8B89A, 0xFFD2A8, .5], [.32, 0xF0E2C4, 0xFFF1DC, .9],
    [.5, 0xF1E6CC, 0xFFF6E6, 1], [.68, 0xEFDDBE, 0xFFE9C8, .85], [.75, 0xD98C7A, 0xFFB38A, .5], [.8, 0x46485E, 0x9CA3C4, .12], [1, 0x2E3444, 0x7E8AAE, .1]
  ];
  const cA = new THREE.Color(), cB = new THREE.Color(), skyCol = new THREE.Color(), sunCol = new THREE.Color();
  function sky(tt) {
    let i = 0; while (i < skyKeys.length - 2 && tt > skyKeys[i + 1][0]) i++;
    const a = skyKeys[i], b = skyKeys[i + 1], f = (tt - a[0]) / (b[0] - a[0]);
    skyCol.copy(cA.set(a[1])).lerp(cB.set(b[1]), f);
    sunCol.copy(cA.set(a[2])).lerp(cB.set(b[2]), f);
    return a[3] + (b[3] - a[3]) * f;
  }

  // ================= Dread: false things =================
  // At high dread you see a frog where no one is: at the edge of your view,
  // gone when you look straight at it or walk up to it. Sometimes it waits
  // behind you and is only there when you turn round.
  let phantom = null, phantomNext = 12;
  const _v = new THREE.Vector3();
  function viewAngle(x, y, z) {   // angle between the camera's forward and a point
    _v.set(x, y, z).sub(camera.position).normalize();
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    return Math.acos(clamp(f.dot(_v), -1, 1));
  }
  function updatePhantom(dt) {
    const d = stats.dread;
    if (phantom) {
      phantom.life -= dt;
      const a = viewAngle(phantom.x, groundAt(phantom.x, phantom.z) + 1, phantom.z);
      const inView = a < camera.fov * Math.PI / 360 * 1.1;
      if (inView) phantom.seen = true;
      const gone = phantom.life <= 0 || Math.hypot(phantom.x - px, phantom.z - pz) < 7 || a < .2
        || (phantom.behind && phantom.seen && (phantom.seenFor = (phantom.seenFor || 0) + (inView ? dt : 0)) > .6);
      if (gone || d < 45 || state !== 'play') { removeCastaway(phantom.av); phantom = null; phantomNext = 6 + Math.random() * 14 * (1.3 - d / 100); }
      else poseCastaway(phantom.av, phantom.x, phantom.z, Math.atan2(px - phantom.x, pz - phantom.z), 0, false, dt, 0);
      return;
    }
    if (state !== 'play' || d < 65 || (phantomNext -= dt) > 0) return;
    const behind = Math.random() < .4;
    const camYaw = Math.atan2(px - camera.position.x, pz - camera.position.z);   // direction you're looking
    const side = (Math.random() < .5 ? -1 : 1) * (behind ? Math.PI * (.75 + Math.random() * .2) : .5 + Math.random() * .25);
    const ang = camYaw + side, dist = 11 + Math.random() * 8;
    const x = px + Math.sin(ang) * dist, z = pz + Math.cos(ang) * dist;
    if (heightAt(x, z) < .3) { phantomNext = 2; return; }
    const friends = [...remotes.keys()];
    const colour = friends.length ? colorFor(friends[(Math.random() * friends.length) | 0]) : CLOAKS[(Math.random() * CLOAKS.length) | 0];
    phantom = { av: makeCastaway(colour), x, z, life: 5 + Math.random() * 4, behind, seen: false };
  }

  // ================= Dread: the extra one at the fire =================
  // At camp with friends, warm, at night, with high dread: you count one frog
  // too many round the fire. No name over its head. Only you can see it.
  let extra = null, extraNext = 20;
  function updateExtra(dt) {
    const fire = [...fires.values()].find(f => f.fuel > 0 && Math.hypot(f.x - px, f.z - pz) < 6);
    const friends = fire ? [...remotes.values()].filter(r => { const q = r.remote.sample(); return !r.dead && Math.hypot(q.x - fire.x, q.z - fire.z) < 7; }) : [];
    const ok = state === 'play' && fire && friends.length && stats.warm && isNight(t) && stats.dread >= 50;
    if (extra) {
      extra.life -= dt;
      const a = viewAngle(extra.x, groundAt(extra.x, extra.z) + 1, extra.z);
      if (a < .18) extra.stare += dt;
      if (!ok || extra.life <= 0 || extra.stare > 2.5 || Math.hypot(extra.x - px, extra.z - pz) < 1.6) { removeCastaway(extra.av); extra = null; extraNext = 25 + Math.random() * 40; }
      else poseCastaway(extra.av, extra.x, extra.z, Math.atan2(extra.f.x - extra.x, extra.f.z - extra.z), 0, false, dt, elapsed);
      return;
    }
    if (!ok || (extraNext -= dt) > 0) return;
    // a seat on the far side of the fire from you, between the others
    const a = Math.atan2(px - fire.x, pz - fire.z) + Math.PI + (Math.random() - .5) * 1.2, r = 1.8 + Math.random() * .6;
    const x = fire.x + Math.sin(a) * r, z = fire.z + Math.cos(a) * r;
    if (friends.some(f => { const q = f.remote.sample(); return Math.hypot(q.x - x, q.z - z) < 1; })) { extraNext = 3; return; }
    const used = new Set([me.id, ...remotes.keys()].map(colorFor)), free = CLOAKS.filter(c => !used.has(c));
    extra = { av: makeCastaway(free.length ? free[(Math.random() * free.length) | 0] : CLOAKS[0]), x, z, f: fire, life: 30 + Math.random() * 40, stare: 0 };
  }

  // ================= Dread: sounds =================
  // Faint footsteps behind you and whispers, made from filtered noise.
  const Sound = {
    ctx: null, noise: null, next: 8,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const len = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, len, len), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      } catch (e) { this.ctx = null; }
    },
    burst(at, dur, filterType, freq, q, gain, pan) {
      const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise; f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + dur * .25); g.gain.linearRampToValueAtTime(0, at + dur);
      let node = g;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
      src.connect(f); f.connect(g); node.connect(c.destination);
      src.start(at, Math.random() * .5, dur + .05);
      return f;
    },
    bell(x, z) {
      if (!this.ctx || prefs.sounds === false) return;
      const c = this.ctx, t0 = c.currentTime, d = Math.hypot(x - px, z - pz), vol = Math.max(0, .25 - d / 200);
      for (const [f, g] of [[523, 1], [1318, .4], [2093, .2]]) {
        const o = c.createOscillator(), gn = c.createGain(); o.type = 'sine'; o.frequency.value = f;
        gn.gain.setValueAtTime(vol * g, t0); gn.gain.exponentialRampToValueAtTime(.0001, t0 + 3);
        o.connect(gn); gn.connect(c.destination); o.start(t0); o.stop(t0 + 3.1);
      }
    },
    breath() {   // something enormous breathing under the ground: two slow swells of low noise
      if (!this.ctx || prefs.sounds === false) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t0 = this.ctx.currentTime;
      for (let i = 0; i < 2; i++) { this.burst(t0 + i * 3.2, 2.2, 'lowpass', 180, .7, .35, 0); this.burst(t0 + i * 3.2 + 1.2, 1.6, 'lowpass', 120, .7, .22, 0); }
    },
    rumble() {
      if (!this.ctx || prefs.sounds === false) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.burst(this.ctx.currentTime, 1.8, 'lowpass', 70, 1, .5, 0);
    },
    footsteps() {
      const c = this.ctx, pan = Math.random() * 1.6 - .8, n = 3 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) this.burst(c.currentTime + i * .55, .14, 'lowpass', 280, 1, .22, pan);
    },
    whisper() {
      const c = this.ctx, t0 = c.currentTime, pan = Math.random() * 1.6 - .8;
      for (let i = 0; i < 3; i++) {
        const f = this.burst(t0 + i * .35, .9, 'bandpass', 2200 + Math.random() * 1400, 7, .05, pan);
        f.frequency.linearRampToValueAtTime(1400 + Math.random() * 1600, t0 + i * .35 + .9);
      }
    },
    update(dt) {
      if (!this.ctx || prefs.sounds === false || state !== 'play') return;
      const d = stats.dread;
      if (d < 40 || (this.next -= dt) > 0) return;
      this.next = 4 + Math.random() * 10 * (1.4 - d / 100);
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (d > 55 && Math.random() < .5) this.whisper(); else this.footsteps();
    },
  };

  // ================= Loop =================
  const clock = new THREE.Clock();
  const tagV = new THREE.Vector3();
  let elapsed = 0, lastDayLabel = '', growTimer = 0;
  const inGame = () => state === 'play' || state === 'dead';

  function tick() {
    const dt = Math.min(clock.getDelta(), .05); elapsed += dt;
    if (window.__dbg) renderer.info.reset();
    // Everything around this point is loaded: you in the game, the title view otherwise.
    const focusX = inGame() ? px : TITLE.x, focusZ = inGame() ? pz : TITLE.z;
    updateChunks(focusX, focusZ);

    // Time runs locally between server snapshots.
    if (inGame()) { t += dt / RULES.DAY_LEN; if (t >= 1) t -= 1; }
    else if (state === 'title' || state === 'connecting') t = .3 + Math.sin(elapsed * .02) * .02;
    if (window.__dbg && __dbg.t != null) t = __dbg.t;   // debug only

    let sunI = sky(t);
    const grey = inGame() ? (env.storm ? .45 : env.rain ? .25 : env.fogStorm ? .2 : 0) : 0;
    if (grey) { skyCol.lerp(cA.setRGB(.55, .55, .56), grey); sunI *= 1 - grey * .6; }
    if (inGame() && env.storm && (nextFlash -= dt) <= 0) { nextFlash = 6 + Math.random() * 14; flash = .25; }
    if (flash > 0) { flash -= dt; skyCol.lerp(cA.setRGB(1, 1, .96), Math.max(0, flash) * 3); sunI = Math.max(sunI, flash * 3); }
    scene.background = skyCol; scene.fog.color.copy(skyCol);
    const ang = (t - .25) * Math.PI * 2;
    sunDir.set(Math.cos(ang), Math.sin(ang), SUN_TILT).normalize();
    moonDir.set(-Math.cos(ang), -Math.sin(ang), SUN_TILT).normalize();
    const lightDir = sunDir.y > -.05 ? sunDir : moonDir;   // shadows follow whichever is up
    sun.position.set(px + lightDir.x * 50, Math.max(lightDir.y, .12) * 50, pz + lightDir.z * 50);
    sun.target.position.set(px, 0, pz);
    sunDisc.position.copy(camera.position).addScaledVector(sunDir, 300); sunDisc.visible = sunDir.y > -.12;
    moonDisc.position.copy(camera.position).addScaledVector(moonDir, 300); moonDisc.visible = moonDir.y > -.12;
    mist.position.copy(camera.position); mist.position.y = camera.position.y + 12;
    mist.rotation.y = elapsed * .004;
    mist.material.color.setScalar(.45 + sunI * .55);
    fireflies.update(elapsed, clamp((-sunDir.y + .08) / .25, 0, 1) * (env.rain ? .15 : 1), focusX, focusZ);
    rain.update(elapsed, inGame() && !!env.rain, !!env.storm, camera.position.x, camera.position.y, camera.position.z);
    sun.color.copy(sunCol); sun.intensity = .15 + sunI * .58;
    hemi.intensity = .35 + sunI * .2;
    hemi.color.set(sunI < .2 ? 0x8E9AB8 : 0xFFF6E6);
    const night = isNight(t);

    // fog map and the ink shader's fog/dread inputs
    if ((fogTimer -= dt) <= 0) {
      fogTimer = .25;
      const lights = [], k = env.lightMul || 1;   // rain shrinks every light
      fires.forEach(f => { if (f.fuel > 0) lights.push({ x: f.x, z: f.z, r: WG.FIRES[f.kind].warm * 1.4 * k }); });
      lanterns.forEach(l => { if (l.clear > 0) lights.push({ x: l.x, z: l.z, r: l.clear * k }); });   // shrinks as the fog reclaims it
      if (inGame() && myPatches.includes('firefly_jar')) lights.push({ x: px, z: pz, r: 3.5 });
      remotes.forEach(r => { if (r.patches && r.patches.includes('firefly_jar') && !r.dead) { const q = r.remote.sample(); lights.push({ x: q.x, z: q.z, r: 3.5 }); } });
      updateFogMap(focusX, focusZ, t, lights);
    }
    if (window.__dbg && __dbg.forceDread != null) stats.dread = __dbg.forceDread;   // debug only
    dreadShown += ((inGame() ? stats.dread / 100 : 0) - dreadShown) * Math.min(1, dt * 1.5);
    inkMat.uniforms.dread.value = dreadShown;
    inkMat.uniforms.seeFar.value = inGame() && myPatches.includes('moon_wing') ? .65 : 1;
    inkMat.uniforms.night.value = WG.nightFactor(t);
    inkMat.uniforms.time.value = elapsed;
    if (knockT > 0) knockT -= dt;
    updatePhantom(dt);
    updateExtra(dt);
    Sound.update(dt);
    const cloudTint = .35 + sunI * .65;
    updateCrests(elapsed, cloudTint);
    updatePuffs(dt, elapsed);
    clouds.forEach(c => {
      // drift east with the wind; wrap within 260 units of you so the sky is never empty
      const u = c.userData, W = 260, wx = u.bx + elapsed * u.speed;
      c.position.set(focusX + ((((wx - focusX) % W) + W * 1.5) % W) - W / 2, u.y, focusZ + ((((u.bz - focusZ) % W) + W * 1.5) % W) - W / 2);
      c.material.color.setRGB(cloudTint, cloudTint, Math.min(1, cloudTint * 1.08));
    });
    const cell = SEA_W / SEA_SEG;
    sea.position.set(Math.round(camera.position.x / cell) * cell, 0, Math.round(camera.position.z / cell) * cell);
    const sp = seaGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = seaBase[i * 3] + sea.position.x, z = seaBase[i * 3 + 2] + sea.position.z;
      sp.setY(i, Math.sin(x * .25 + elapsed * 1.1) * .09 + Math.cos(z * .3 + elapsed * .9) * .09);
    }
    sp.needsUpdate = true;

    // Fires: burn down locally, the server corrects about once a second.
    const lit = [];
    fires.forEach(f => {
      if (inGame()) f.fuel = Math.max(0, f.fuel - dt * WG.FIRES[f.kind].burn);
      const on = f.fuel > 0, s = on ? clamp(f.fuel / 40, .35, 1) * (f.kind === 'hearth' ? 1.3 : 1) : 0;
      f.flames.forEach((fl, i) => { fl.visible = on; fl.scale.set(s * (1 + Math.sin(elapsed * 13 + i) * .08), s * (1.7 + Math.sin(elapsed * 17 + i * 2) * .25), s); });
      if (on) lit.push({ f, s, d: Math.hypot(f.x - px, f.z - pz) });
    });
    if ((puffNext -= dt) <= 0) {
      puffNext = lowGfx ? .9 : .5;
      for (const e of lit) if (Math.hypot(e.f.x - camera.position.x, e.f.z - camera.position.z) < 50) emitPuff(e.f);
    }
    lanterns.forEach(l => {
      if (l.lit && inGame()) { l.fuel = Math.max(0, l.fuel - dt); }
      if (l.lit) lit.push({ f: l, s: 1, d: Math.hypot(l.x - px, l.z - pz), lantern: true });
    });
    lit.sort((a, b) => a.d - b.d);
    fireLights.forEach((l, i) => {
      const e = lit[i];
      if (!e) { l.intensity = 0; return; }
      const h = e.lantern ? (e.f.big ? 2.8 : 1.6) : 1.1;
      l.position.set(e.f.x, groundAt(e.f.x, e.f.z) + h, e.f.z);
      l.distance = e.lantern ? (e.f.big ? 30 : 18) : 14;
      l.intensity = e.lantern ? 1.4 + Math.sin(elapsed * 3 + i) * .1 : (1.5 + Math.sin(elapsed * 11 + i) * .25) * e.s;
    });

    // Your own castaway: moved locally, reported to the server.
    let moving = false, wantSprint = false;
    if (state === 'play') {
      const free = !panelOpen() && knockT <= 0 && !stats.down;
      let ix = free ? (held('right') || keys.ArrowRight ? 1 : 0) - (held('left') || keys.ArrowLeft ? 1 : 0) + joy.x : 0;
      let iz = free ? (held('forward') || keys.ArrowUp ? 1 : 0) - (held('back') || keys.ArrowDown ? 1 : 0) - joy.y : 0;
      const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
      wantSprint = free && l > .08 && (held('sprint') || runToggle);
      running = WG.stepEnergy(nrg, dt, wantSprint);
      if (l > .08) {
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const dx = rx * ix + fx * iz, dz = rz * ix + fz * iz;
        const spd = (heightAt(px, pz) < .1 ? RULES.WADE_SPEED : RULES.WALK_SPEED) * WG.speedMult(running, nrg.exhausted) * Math.min(1, l);
        let nx = px + dx * spd * dt, nz = pz + dz * spd * dt;
        if (heightAt(nx, nz) > -1) {
          const push = o => {
            if (o.state.gone || o.type === 'dig') return;
            const ox = nx - o.x, oz = nz - o.z, d = Math.hypot(ox, oz), min = radius(o) + .3;
            if (d < min && d > 0) { nx = o.x + ox / d * min; nz = o.z + oz / d * min; }
          };
          nearbyObjects(nx, nz, push); fires.forEach(push); lanterns.forEach(push); carvings.forEach(push); if (board) push(board);
          px = nx; pz = nz;
        }
        const tf = Math.atan2(dx, dz);
        let df = tf - face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
        face += df * Math.min(1, dt * 12);
        moving = true;
      }
      const now = performance.now();
      const cam = Math.atan2(px - camera.position.x, pz - camera.position.z);   // which way you're looking
      const changed = Math.abs(px - lastSent.x) > .01 || Math.abs(pz - lastSent.z) > .01 || Math.abs(face - lastSent.face) > .02
        || moving !== lastSent.moving || wantSprint !== lastSent.sprint || Math.abs(cam - lastSent.cam) > .04;
      if (net && net.open && ((changed && now - lastSent.at > 66) || now - lastSent.at > 1000)) {
        net.send({ t: 'pos', x: px, z: pz, face, moving, sprint: wantSprint, cam });
        lastSent = { at: now, x: px, z: pz, face, moving, sprint: wantSprint, cam };
      }
    }
    if (hero) poseCastaway(hero, px, pz, face, moving ? (running ? 2 : 1) : 0, state === 'dead' || knockT > 0, dt, elapsed);

    animateBugs(elapsed);
    animateCarvings(dt);
    if (state === 'play' && env.drowning && isNight(t) && (nextTremor -= dt) <= 0) { nextTremor = 25 + Math.random() * 35; tremor = 1.6; Sound.rumble(); }
    washups.forEach(w => { if (w.mesh.userData.bell) w.mesh.userData.bell.rotation.z = Math.sin(elapsed * 3 + w.id) * .25; });
    stilled.forEach(s => {
      const p = s.remote.sample();
      s.mesh.position.set(p.x, groundAt(p.x, p.z), p.z); s.mesh.rotation.y = p.face;
    });

    // Other castaways, played back smoothly.
    remotes.forEach(r => {
      const s = r.remote.sample();
      if (r.knockT > 0) r.knockT -= dt;
      poseCastaway(r.av, s.x, s.z, s.face, s.moving, !!s.dead || r.knockT > 0, dt, elapsed);
      tagV.set(s.x, Math.max(groundAt(s.x, s.z), -.75) + 2.05, s.z).project(camera);
      const dist = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
      if (tagV.z > 1 || dist > 45) r.tag.style.display = 'none';
      else {
        r.tag.style.display = '';
        r.tag.style.transform = `translate(${(tagV.x * .5 + .5) * innerWidth}px,${(-tagV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
      }
    });
    if ((growTimer -= dt) <= 0) { growTimer = 1; objects.forEach(o => { if (o.mesh) resize1(o); }); }
    nearbyObjects(px, pz, o => { if (o.mesh && o.mesh.rotation.z > 0) o.mesh.rotation.z = Math.max(0, o.mesh.rotation.z - dt * .4); });

    // HUD
    if (state === 'play') {
      cooldown = Math.max(0, cooldown - dt);
      if (warnedNightDay !== day && t > .72 && t < .8) {
        warnedNightDay = day;
        if (env.drowning) toast('The Drowning Moon tonight. The fog will come in thick, and the lanterns will drink their oil fast.');
        else toast([...fires.values()].some(f => f.fuel > 0) ? 'Night is coming. Keep a fire fed.' : 'It’s getting dark and cold. A fire would help.');
      }
      target = findTarget();
      const lab = label(target);
      if (lab) { ui.prompt.innerHTML = `<kbd>${esc(keyLabel(prefs.binds.act))}</kbd>${esc(lab)}`; ui.prompt.classList.remove('hidden'); $('btnAct').textContent = lab.split(' ').slice(0, 2).join(' '); }
      else { ui.prompt.classList.add('hidden'); $('btnAct').textContent = 'Act'; }

      $('bHealth').style.setProperty('--v', stats.health + '%');
      $('bFood').style.setProperty('--v', stats.hunger + '%');
      $('bWater').style.setProperty('--v', stats.thirst + '%');
      $('bEnergy').style.setProperty('--v', nrg.energy + '%');
      $('bDread').style.setProperty('--v', stats.dread + '%');
      $('energyBar').classList.toggle('tired', nrg.exhausted);
      const wx = { rain: ' \u00b7 rain', storm: ' \u00b7 storm', fogstorm: ' \u00b7 fog storm' }[env.weather] || '';
      const dl = `Day ${day} <small>${phaseName(t)}</small><span class="sky${env.drowning ? ' drown' : ''}">${esc(WG.MOON_NAMES[env.phase || 0])}${wx}</span>`;
      if (dl !== lastDayLabel) { $('dayLabel').innerHTML = dl; lastDayLabel = dl; }
      const temp = $('temp');
      if (knockT > 0 || stats.down) { temp.textContent = 'Knocked down\u2026'; temp.className = 'temp cold'; }
      else if (nrg.exhausted) { temp.textContent = 'Exhausted. Catch your breath.'; temp.className = 'temp cold'; }
      else if (stats.fog > .5) { temp.textContent = 'The fog is thick here.'; temp.className = 'temp cold'; }
      else if (night) { temp.textContent = stats.warm ? 'Warm by the fire' : 'Cold'; temp.className = 'temp ' + (stats.warm ? 'warm' : 'cold'); }
      else { temp.textContent = ''; temp.className = 'temp'; }
      renderInventory();
    }

    if (state === 'dead') {
      deadT += dt;
      if (deadT > 1.4 && ui.overlay.classList.contains('gone')) showDeath();
    }

    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('on'); }

    // Camera
    if (!inGame()) {
      const a = elapsed * .05;
      camera.position.set(TITLE.x + Math.sin(a) * 60, 30, TITLE.z + Math.cos(a) * 60);
      camera.lookAt(TITLE.x, 2, TITLE.z);
    } else {
      const py = Math.max(heightAt(px, pz), -.75);
      const cx = px + Math.sin(yaw) * Math.cos(pitch) * camDist;
      const cz = pz + Math.cos(yaw) * Math.cos(pitch) * camDist;
      let cy = py + 1.2 + Math.sin(pitch) * camDist;
      cy = Math.max(cy, heightAt(cx, cz) + .8, .8);
      camera.position.set(cx, cy, cz);
      if (tremor > 0) { tremor -= dt; const k = Math.min(1, tremor) * .07; camera.position.x += (Math.random() - .5) * k; camera.position.y += (Math.random() - .5) * k; }
      camera.lookAt(px, py + 1.3, pz);
    }

    if (window.__dbg && __dbg.camOverride) { const c = __dbg.camOverride; camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); camera.updateMatrixWorld(); }   // debug only
    renderer.setRenderTarget(colorRT); renderer.render(scene, camera);
    if (lowGfx) { renderer.setRenderTarget(null); renderer.render(inkScene, inkCam); requestAnimationFrame(tick); return; }
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null; scene.overrideMaterial = normalMat;
    noInk.forEach(o => { o.visible = false; });
    sea.visible = false;
    renderer.setRenderTarget(normalRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
    scene.overrideMaterial = null;
    // The sea goes into the normal buffer in a flat odd colour, so the shoreline reads as a crease and gets inked.
    sea.visible = true; sea.material = seaInkMat;
    renderer.autoClear = false; renderer.render(sea, camera); renderer.autoClear = true;
    sea.material = seaMat;
    noInk.forEach(o => { o.visible = true; });
    scene.background = bg; scene.fog = fog;
    renderer.setRenderTarget(null); renderer.render(inkScene, inkCam);
    requestAnimationFrame(tick);
  }

  boot();
  tick();
})();
