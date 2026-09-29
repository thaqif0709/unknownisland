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
  scene.fog = new THREE.Fog(0xEFE3C8, 60, 170);
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
  const inkMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorRT.texture }, tDepth: { value: colorRT.depthTexture }, tNormal: { value: normalRT.texture },
      res: { value: new THREE.Vector2(1, 1) }, width: { value: 2 }, near: { value: camera.near }, far: { value: camera.far },
      useNormals: { value: 1 },
      ink: { value: new THREE.Color(0x2B211F) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      uniform sampler2D tColor, tDepth, tNormal; uniform vec2 res; uniform float width, near, far, useNormals; uniform vec3 ink;
      varying vec2 vUv;
      float lin(vec2 uv){ float z = texture2D(tDepth, uv).x * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
      vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).rgb * 2. - 1.; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 col = texture2D(tColor, vUv).rgb;
        float d0 = lin(vUv);
        float e = 0.;
        if (d0 < far * .98) {
          vec3 n0 = nrm(vUv);
          vec2 o = width / res;
          for (int i = 0; i < 4; i++) {
            vec2 dir = i == 0 ? vec2(1., 0.) : i == 1 ? vec2(-1., 0.) : i == 2 ? vec2(0., 1.) : vec2(0., -1.);
            vec2 uv = vUv + dir * o;
            float d = lin(uv);
            e = max(e, smoothstep(.03, .06, (d - d0) / d0));          // silhouettes (drawn on the nearer shape)
            if (useNormals > .5) e = max(e, smoothstep(.45, .7, 1. - dot(n0, nrm(uv))));    // creases
          }
          e *= 1. - smoothstep(60., 120., d0);                           // lines fade with distance
        }
        col = mix(col, ink, e * .92);
        col *= .96 + hash(floor(gl_FragCoord.xy / 2.)) * .06;           // paper grain
        gl_FragColor = vec4(col, 1.);
      }`,
    depthTest: false, depthWrite: false,
  });
  const inkScene = new THREE.Scene();
  inkScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), inkMat));
  const inkCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const noInk = [];   // things drawn with their own outlines (clouds), hidden from the normal pass

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
  const ball = (r, m, w = 18, h = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);

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

  // ================= Terrain =================
  const SIZE = 112, SEG = 150;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const pos = tGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const C = h => new THREE.Color(h);
  const cSand = C(0xE9D7AE), cWet = C(0xD4BE92), cDeep = C(0x7E9EAE), cGrassA = C(0xA3B27E), cGrassB = C(0x7F9A64), cRock = C(0xA9A193), cMoss = C(0x7C9A6B);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    if (h < .05) tmp.copy(cWet).lerp(cDeep, clamp(-h / 2.5, 0, 1));
    else if (h < .95) tmp.copy(cSand).lerp(cGrassA, smoothT(.75, .95, h));
    else {
      tmp.copy(cGrassA).lerp(cGrassB, fbm(x * .12 + 5, z * .12));
      if (h > 5.8) tmp.lerp(cRock, clamp((h - 5.8) / 1.5, 0, .85));
      if (Math.hypot(x - SPRING.x, z - SPRING.z) < 5) tmp.lerp(cMoss, .4);
    }
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  function smoothT(a, b, x) { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }
  // The terrain is drawn as flat triangles between samples of heightAt, so to
  // stand exactly on what you see, things use the same triangles.
  const GRID = SIZE / SEG, HALF = SIZE / 2;
  const tH = new Float32Array((SEG + 1) * (SEG + 1));
  for (let i = 0; i < tH.length; i++) tH[i] = pos.getY(i);
  function groundAt(x, z) {
    const gx = (x + HALF) / GRID, gz = (z + HALF) / GRID;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    if (ix < 0 || iz < 0 || ix >= SEG || iz >= SEG) return heightAt(x, z);
    const fx = gx - ix, fz = gz - iz, W = SEG + 1;
    const ha = tH[ix + iz * W], hb = tH[ix + (iz + 1) * W], hc = tH[ix + 1 + (iz + 1) * W], hd = tH[ix + 1 + iz * W];
    return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tGeo, soft(0xffffff, { vertexColors: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  const seaGeo = new THREE.PlaneGeometry(420, 420, 70, 70); seaGeo.rotateX(-Math.PI / 2);
  const seaMat = soft(0x6F8FA3, { transparent: true, opacity: .92 });
  const seaInkMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.receiveShadow = true;
  scene.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  const pond = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), soft(0x8FB3BF, { shininess: 60, specular: 0x555555 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(SPRING.x, 1.62, SPRING.z);
  pond.receiveShadow = true;
  scene.add(pond);
  const pondRock = soft(0xB3AC9F);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + .2, r = 2.45;
    const m = ball(.35 + (i % 3) * .1, pondRock, 12, 10); m.scale.y = .7;
    const x = SPRING.x + Math.cos(a) * r, z = SPRING.z + Math.sin(a) * r;
    m.position.set(x, heightAt(x, z) + .1, z);
    m.castShadow = true;
    scene.add(m);
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
  for (let i = 0; i < 11; i++) {
    const map = cloudTexture(100 + i * 7);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, fog: false, depthWrite: false }));
    const a = i / 11 * Math.PI * 2 + WG.hash2(i, 1) * .4, rad = 28 + (i % 3) * 16 + WG.hash2(i, 2) * 8;
    const w = map.userData.kind === 'small' ? 10 + WG.hash2(i, 3) * 6 : 18 + WG.hash2(i, 3) * 14;
    sp.userData = { a, rad, y: 18 + (i % 4) * 4 + WG.hash2(i, 4) * 4, speed: .003 + WG.hash2(i, 5) * .004 };
    sp.scale.set(w, w / 2, 1);
    scene.add(sp); clouds.push(sp); noInk.push(sp);
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
  scene.add(mist); noInk.push(mist);

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
      g.fillStyle = '#2B211F'; g.beginPath(); g.arc(128, 128, 80, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#F3EAD6'; g.beginPath(); g.arc(128, 128, 73, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out';   // crescent
      g.beginPath(); g.arc(168, 104, 70, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#2B211F'; g.lineWidth = 7; g.beginPath(); g.arc(168, 104, 70, Math.PI * .62, Math.PI * 1.33); g.stroke();
      g.fillStyle = '#D9CDB4'; [[96, 150, 10], [80, 110, 7]].forEach(([x, y, rr]) => { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); });
    }
    return new THREE.CanvasTexture(c);
  }
  const skyDisc = kind => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(kind), transparent: true, fog: false, depthWrite: false }));
    sp.scale.set(kind === 'sun' ? 46 : 34, kind === 'sun' ? 46 : 34, 1); sp.renderOrder = -2;
    scene.add(sp); noInk.push(sp); return sp;
  };
  const sunDisc = skyDisc('sun'), moonDisc = skyDisc('moon');

  // Fireflies: soft blinking lights over the grass and among the trees at night.
  const fireflies = (() => {
    const N = 150, r = mulberry32(555), base = [];
    while (base.length < N) {
      const x = (r() - .5) * 64, z = (r() - .5) * 64, h = heightAt(x, z);
      if (h > 1.1 && h < 5.5) base.push([x, h, z, r() * 6.28, .6 + r() * .9, r() * 6.28]);
    }
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
    scene.add(pts); noInk.push(pts);
    return { pts, base, update(elapsed, amount) {
      pts.visible = amount > .01;
      if (!pts.visible) return;
      const p = geo.attributes.position.array, col = geo.attributes.color.array;
      base.forEach(([x, h, z, ph, sp, ph2], i) => {
        p[i * 3] = x + Math.sin(elapsed * .35 * sp + ph) * .9;
        p[i * 3 + 1] = h + .7 + Math.sin(elapsed * .8 * sp + ph2) * .35;
        p[i * 3 + 2] = z + Math.cos(elapsed * .3 * sp + ph2) * .9;
        const blink = Math.pow(Math.max(0, Math.sin(elapsed * 1.7 * sp + ph)), 3) * amount;
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
    scene.add(sp); puffs.push(sp); noInk.push(sp);
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
  const crests = [];
  {
    const n = 44, crestGeo = new THREE.PlaneGeometry(2.6, 1); crestGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + (WG.hash2(i, 3) - .5) * .1;
      // walk in from the open sea to just off the beach
      let r = ISL + 14;
      while (r > 5 && heightAt(Math.cos(a) * r, Math.sin(a) * r) < -.55) r -= .25;
      const off = 1.2 + WG.hash2(i, 7) * 1.6;
      const x = Math.cos(a) * (r + off), z = Math.sin(a) * (r + off);
      const m = new THREE.Mesh(crestGeo, crestMat.clone());
      m.position.set(x, .16, z);
      m.rotation.y = -a + Math.PI / 2 + (WG.hash2(i, 11) - .5) * .4;   // lie along the coast
      m.renderOrder = 2;
      m.userData = { x, z, a, phase: WG.hash2(i, 5) * 6.28 };
      scene.add(m); crests.push(m); noInk.push(m);
    }
  }
  function updateCrests(elapsed, light) {
    for (const m of crests) {
      const u = m.userData, k = (Math.sin(elapsed * .55 + u.phase) + 1) / 2;   // 0..1, washing in and out
      const push = k * .9;
      m.position.x = u.x - Math.cos(u.a) * push; m.position.z = u.z - Math.sin(u.a) * push;
      m.material.opacity = Math.sin(k * Math.PI) * .95;
      m.material.color.setScalar(light);
    }
  }

  // ================= Flowers and little plants (decoration only) =================
  // Each species grows where it likes: sea pinks on the sand, daisies and tulips
  // on the lowland grass, bluebells by the spring, lavender up the hill,
  // mushrooms in shady patches, and grass tufts everywhere green.
  {
    const frng = mulberry32(4242);
    const lambert = c => soft(c, { depthWrite: false });
    const white = new THREE.Color(0xF3EAD6);
    const stemGeo = new THREE.CylinderGeometry(.018, .022, 1, 5); stemGeo.translate(0, .5, 0);
    const G = {
      puff: new THREE.SphereGeometry(.1, 10, 8),
      petals: (() => { const g = new THREE.CylinderGeometry(.13, .13, .03, 12); return g; })(),
      dot: new THREE.SphereGeometry(.05, 8, 6),
      cup: (() => { const g = new THREE.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, 0, Math.PI * .62); g.rotateX(Math.PI); g.translate(0, .07, 0); return g; })(),
      bell: new THREE.SphereGeometry(.055, 8, 6),
      spike: new THREE.CylinderGeometry(.035, .05, .28, 8),
      cap: new THREE.SphereGeometry(.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      tuft: new THREE.ConeGeometry(.07, .32, 5),
    };
    const dummy = new THREE.Object3D();
    // parts: [geometry, material, y offset, per-instance colors (optional), scale]
    function species(count, where, parts) {
      const spots = [];
      for (let tries = 0; spots.length < count && tries < count * 40; tries++) {
        const x = (frng() - .5) * 72, z = (frng() - .5) * 72, h = heightAt(x, z);
        if (Math.hypot(x - SPRING.x, z - SPRING.z) < 2.9) continue;
        if (where(h, x, z)) spots.push([x, h, z, .75 + frng() * .5, frng() * 6.28, frng()]);
      }
      for (const [geo, mat, y, colors, sc] of parts) {
        const im = new THREE.InstancedMesh(geo, mat, spots.length);
        spots.forEach(([x, h, z, k, rot, r], i) => {
          dummy.position.set(x, h + y * k, z); dummy.rotation.set(0, rot, 0);
          const v = sc || [1, 1, 1]; dummy.scale.set(v[0] * k, v[1] * k, v[2] * k); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          if (colors) im.setColorAt(i, colors[(r * colors.length) | 0]);
        });
        im.receiveShadow = true;
        scene.add(im); noInk.push(im);
      }
    }
    const stemM = lambert(0x6F8F5A), tint = lambert(0xFFFFFF);
    // (depthWrite off + hidden from the normal pass = no ink lines on tiny things)
    const nearSpring = (x, z) => Math.hypot(x - SPRING.x, z - SPRING.z);
    const shade = (x, z) => fbm(x * .2 + 30, z * .2 - 7);
    // sea pinks: little pink puffs on the dry sand
    species(60, h => h > .6 && h < .95, [[stemGeo, stemM, 0, null, [1, .14, 1]], [G.puff, tint, .15, ['#D9A09A', '#C98A86', '#E8C0B4'].map(c => new THREE.Color(c))]]);
    // daisies: white petals with a yellow middle
    species(140, (h, x, z) => h > 1.1 && h < 3.4 && nearSpring(x, z) > 7, [[stemGeo, stemM, 0, null, [1, .22, 1]],
      [G.petals, tint, .22, [white]], [G.dot, lambert(0xE0A33A), .24]]);
    // tulips: bright cups on taller stems
    species(90, (h, x, z) => h > 1.2 && h < 3 && shade(x, z) < .5, [[stemGeo, stemM, 0, null, [1, .32, 1]],
      [G.cup, tint, .32, ['#C4574F', '#E0A33A', '#D98C8C', '#8C7BA8', '#F1E6CC'].map(c => new THREE.Color(c))]]);
    // bluebells around the spring
    species(80, (h, x, z) => h > 1.1 && nearSpring(x, z) > 3 && nearSpring(x, z) < 9, [[stemGeo, stemM, 0, null, [1, .2, 1]],
      [G.bell, tint, .2, ['#5F7FA8', '#7E97B8', '#4F6687'].map(c => new THREE.Color(c))], [G.bell, tint, .14, ['#7E97B8'].map(c => new THREE.Color(c))]]);
    // lavender up the hill
    species(110, h => h > 3.4 && h < 6.6, [[stemGeo, stemM, 0, null, [1, .18, 1]], [G.spike, lambert(0x8C7BA8), .3]]);
    // mushrooms in shady patches of the lowland
    species(40, (h, x, z) => h > 1.2 && h < 4.5 && shade(x, z) > .58, [[stemGeo, lambert(0xEFE3C8), 0, null, [3.2, .14, 3.2]],
      [G.cap, tint, .12, ['#B8504A', '#C0704F', '#E0A33A'].map(c => new THREE.Color(c))], [G.dot, lambert(0xFFFFFF), .2, null, [.6, .6, .6]]]);
    // grass tufts
    species(160, h => h > 1 && h < 6, [[G.tuft, lambert(0x7F9A64), .14], [G.tuft, lambert(0x93A873), .12, null, [.8, .8, .8]]]);
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
      const leaf = ball(1, palmLeaf[k % 2], 14, 8); leaf.scale.set(.36, .07, 1.35); leaf.position.z = 1.2;
      tilt.add(leaf); g.add(piv);
    }
    const nuts = [];
    for (let k = 0; k < 3; k++) {
      const n = ball(.17, coconutM, 12, 10);
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
  function makeBush(rng, species) {
    const g = new THREE.Group();
    const m = bushM[(rng() * 2) | 0];
    const n = 3 + ((rng() * 4) | 0), flat = rr(rng, .7, 1.1), spread = rr(rng, .3, .55);
    const blobs = [[0, .42 * flat, 0, rr(rng, .5, .66)]];
    for (let i = 0; i < n; i++) { const a = rng() * 6.28; blobs.push([Math.cos(a) * spread, rr(rng, .25, .45) * flat, Math.sin(a) * spread, rr(rng, .3, .48)]); }
    blobs.forEach(([x, y, z, sz]) => { const b = ball(sz, m, 14, 10); b.position.set(x, y, z); b.scale.y = flat; g.add(b); });
    // berries sit on the outside of the bush's lumps
    const berries = new THREE.Group();
    const bm = species === 'blueberry' ? blueberryM : berryM;
    for (let i = 0; i < 8; i++) {
      const [x, y, z, sz] = blobs[(rng() * blobs.length) | 0], a = rng() * 6.28, up = rr(rng, 0, .9);
      const b = ball(.085, bm, 10, 8);
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
    const d = ball(.45, dirtM, 16, 10); d.scale.set(1, .32, 1); d.position.y = .03; mound.add(d);
    for (let i = 0; i < 3; i++) {   // little crumbs so it reads as "soft soil"
      const c = ball(.09, dirtM, 8, 6); const a = rng() * 6.28; c.position.set(Math.cos(a) * .5, .03, Math.sin(a) * .5); mound.add(c);
    }
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(.05, .25, 6), sproutM); sprout.position.set(.1, .22, 0); mound.add(sprout);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), holeM); hole.rotation.x = -Math.PI / 2; hole.position.y = .04;
    g.add(mound, hole);
    return { g, mound, hole };
  }

  let objects = [];
  const isFlora = o => o.type === 'palm' || o.type === 'tree' || o.type === 'bush';
  function buildProps(list) {
    objects.forEach(o => scene.remove(o.mesh));
    objects = list.map(src => {
      const o = { id: src.id, type: src.type, x: src.x, z: src.z, r: src.r, s: src.s, maxScale: src.maxScale, size: 1,
        species: src.species, ore: src.ore, state: src.state || WG.defaultState(src.type) };
      const rng = mulberry32(o.id * 7919 + 13);
      if (o.type === 'palm') { const p = makePalm(rng); o.mesh = p.g; o.nuts = p.nuts; }
      else if (o.type === 'tree') o.mesh = makeTree(rng, o.species);
      else if (o.type === 'bush') { const b = makeBush(rng, o.species); o.mesh = b.g; o.berryMesh = b.berries; }
      else if (o.type === 'ore') o.mesh = makeOre(rng, o.s || 1, o.ore);
      else if (o.type === 'dig') { const d = makeDig(rng); o.mesh = d.g; o.mound = d.mound; o.hole = d.hole; }
      else o.mesh = makeRock(rng, o.s || 1, o.species);
      o.mesh.position.set(o.x, groundAt(o.x, o.z), o.z);
      shadows(o.mesh);
      scene.add(o.mesh);
      applyState(o);
      return o;
    });
  }
  function applyState(o) {
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
    o.mesh.scale.setScalar(o.size);
  }
  const radius = o => isFlora(o) ? o.r * o.size : o.r;
  // Title-screen backdrop until the server sends the real island.
  let day = 1, t = .3;
  buildProps(WG.generateObjects(7));

  // ================= Castaways =================
  // Each player's backpack has its own colour so friends can tell each other apart.
  const PACKS = [0xB9A04A, 0xC4574F, 0x5F7FA8, 0x7C9A6B, 0x8C7BA8, 0xD0803F, 0x5E9A92, 0xD98C8C, 0x4F6687, 0x9A7A5E];
  const packFor = id => PACKS[(id - 1) % PACKS.length];
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const frogM = soft(0x7DBB3C), spotM = soft(0x4E8A2E), throatM = soft(0xC9DC86), vestM = soft(0xE9E4D2), sleeveM = soft(0xE07B39),
    gloveM = soft(0x3F6B45), webM = soft(0xE8872E), shortsM = soft(0xD9D2BC), bootM = soft(0xE3DCC8), strapM = soft(0x8C8A4E);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xE8872E }), irisM = new THREE.MeshBasicMaterial({ color: 0x3A2620 }),
    shineM = new THREE.MeshBasicMaterial({ color: 0xFFF8EA }), mouthM = new THREE.MeshBasicMaterial({ color: 0x2B211F });
  const blushM = new THREE.MeshBasicMaterial({ color: 0xE0705A, transparent: true, opacity: .6 });
  const cyl = (rt, rb, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  // A frog castaway: big bulging eyes, scarf-collared vest, gauntlets, boots and a backpack.
  function makeCastaway(pack) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const add = (m, x, y, z, parent = body) => { m.position.set(x, y, z); parent.add(m); return m; };

    // legs: green shins, chunky cream boots, orange webbed toes
    function leg(x) {
      const p = new THREE.Group(); p.position.set(x, .6, 0); body.add(p);
      add(cyl(.065, .06, .4, frogM), 0, -.2, 0, p);
      add(cyl(.105, .1, .2, bootM), 0, -.5, 0, p);               // sole at -.6 = the ground
      add(cyl(.108, .108, .045, strapM), 0, -.44, 0, p);
      for (const dx of [-.05, 0, .05]) { const toe = add(ball(.04, webM, 8, 6), dx, -.58, .12, p); toe.scale.set(1, .5, 1.5); }
      return p;
    }
    const legL = leg(-.12), legR = leg(.12);
    add(cyl(.23, .27, .22, shortsM), 0, .64, 0);
    // vest with zip, and the big scarf collar
    add(cyl(.22, .25, .44, vestM, 16), 0, .95, 0);
    add(box(.02, .36, .02, strapM), 0, .95, .245);
    const collar = add(new THREE.Mesh(new THREE.TorusGeometry(.17, .08, 10, 22), vestM), 0, 1.19, 0); collar.rotation.x = Math.PI / 2;
    const hood = add(ball(.17, vestM, 12, 10), 0, 1.22, -.15); hood.scale.set(1.2, .8, .8);
    // head: wide and flat, pale throat, dark spots, bulging eyes, long smile
    const head = new THREE.Group(); head.position.y = 1.42; body.add(head);
    add(ball(.3, frogM, 24, 16), 0, .06, 0, head).scale.set(1.3, .78, 1.05);
    add(ball(.27, throatM, 18, 12), 0, -.04, .04, head).scale.set(1.18, .45, 1);
    [[-.16, .2, -.12, .06], [.05, .25, -.06, .05], [.2, .14, -.14, .055], [-.28, .06, -.02, .04], [.1, .16, -.24, .045]].forEach(([x, y, z, r]) => {
      add(ball(r, spotM, 10, 8), x, y, z, head).scale.set(1, .45, 1);
    });
    for (const sx of [-1, 1]) {
      add(ball(.125, frogM, 16, 12), sx * .2, .24, .08, head);
      add(ball(.1, ringM, 14, 10), sx * .215, .26, .155, head).scale.z = .6;
      add(ball(.07, irisM, 12, 8), sx * .22, .26, .2, head).scale.z = .5;
      add(ball(.022, shineM, 6, 4), sx * .22 + .03, .29, .235, head);
      add(ball(.045, blushM, 8, 6), sx * .3, .02, .2, head).scale.set(1, .6, .4);
    }
    const mouth = add(new THREE.Mesh(new THREE.TorusGeometry(.27, .011, 5, 28, Math.PI * .62), mouthM), 0, .12, .235, head);
    mouth.rotation.z = -Math.PI / 2 - Math.PI * .31;
    // arms: orange sleeves, dark green gauntlets, orange webbed hands
    function arm(x) {
      const p = new THREE.Group(); p.position.set(x, 1.1, 0); body.add(p);
      add(cyl(.06, .055, .18, sleeveM), 0, -.09, 0, p);
      add(cyl(.085, .075, .2, gloveM), 0, -.28, 0, p);
      add(ball(.065, webM, 10, 8), 0, -.42, 0, p).scale.set(1, 1.1, .7);
      for (const dx of [-.04, 0, .04]) add(ball(.026, webM, 6, 5), dx, -.49, 0, p);
      return p;
    }
    const armL = arm(-.3), armR = arm(.3);
    // backpack (per-player colour) with a dark green pocket and shoulder straps
    const packM = softShared(pack), flapM = softShared(new THREE.Color(pack).multiplyScalar(.78).getHex());
    const bag = new THREE.Group(); bag.position.set(0, .98, -.3); body.add(bag);
    add(box(.44, .5, .26, packM), 0, 0, 0, bag);
    add(box(.46, .17, .28, flapM), 0, .2, 0, bag);
    add(box(.3, .18, .08, gloveM), 0, -.1, -.16, bag);
    for (const sx of [-1, 1]) add(box(.08, .22, .18, gloveM), sx * .26, -.08, 0, bag);
    for (const sx of [-1, 1]) add(box(.05, .38, .03, strapM), sx * .12, .98, .245);

    const av = { root, body, legL, legR, armL, armR, walk: 0, swingT: 0 };
    av.armL.rotation.z = -.2; av.armR.rotation.z = .2;
    shadows(root);
    scene.add(root);
    return av;
  }
  function removeCastaway(av) { scene.remove(av.root); }

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
  function clearFires() { fires.forEach(f => scene.remove(f.mesh)); fires = new Map(); }

  // ================= State =================
  let state = 'title';              // title | connecting | play | dead
  let me = null;                    // { id, name }
  let stats = { health: 100, hunger: 80, thirst: 70, inv: { wood: 0, stone: 0 }, tools: [], warm: false };
  const nrg = { energy: 100, exhausted: false, rest: 0 };   // predicted locally, corrected by the server
  let running = false, runToggle = false;
  let px = SPAWN.x, pz = SPAWN.z, face = Math.PI, cooldown = 0, deadT = 0, deathInfo = null;
  let yaw = 0, pitch = .55, camDist = 9;
  let warnedNightDay = 0, target = null;
  let hero = null;
  const remotes = new Map();        // id -> { name, remote, av, tag }
  let net = null, lastSent = { at: 0, x: 0, z: 0, face: 0, moving: false, sprint: false };

  const $ = id => document.getElementById(id);
  const ui = { hud: $('hud'), inv: $('inv'), prompt: $('prompt'), toast: $('toast'), overlay: $('overlay'), online: $('online'),
    touch: $('touchUi'), banner: $('banner'), tags: $('tags'), gear: $('btnSettings'), book: $('book'), settings: $('settings') };
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

  $('goIsland').addEventListener('click', enterIsland);

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
  function enterIsland() {
    state = 'connecting';
    showMsg('Unknown Island', 'Rowing out to the island…');
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
    const av = makeCastaway(packFor(p.id));
    remotes.set(p.id, { name: p.name, remote: new Net.Remote(p.x, p.z, p.face), av, tag, dead: p.dead });
  }
  function renderOnline() {
    const rows = [`<span><i style="background:${hex(packFor(me.id))}"></i>${esc(me.name)} (you)</span>`];
    remotes.forEach((r, id) => rows.push(`<span><i style="background:${hex(packFor(id))}"></i>${esc(r.name)}</span>`));
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
        buildProps(m.objects);
        clearFires(); m.fires.forEach(addFire);
        resetRemotes(); m.players.forEach(addRemote);
        if (hero) removeCastaway(hero);
        hero = makeCastaway(packFor(me.id));
        applySelf(m.you);
        renderOnline();
        ui.banner.classList.add('hidden');
        hideOverlay();
        showHud(true);
        if (m.you.dead) { state = 'dead'; deadT = 2; deathInfo = { cause: '', day }; }
        else {
          const wasPlaying = state === 'play';
          state = 'play';
          if (!wasPlaying) toast(stats.thirst < 60 ? 'Thirsty. There might be fresh water inland.' : `Day ${day} on ${m.island.name}.`);
        }
        break;
      }
      case 'snap':
        t = m.time; day = m.day;
        for (const [id, x, z, f, moving, dead] of m.p) {
          const r = remotes.get(id);
          if (r) { r.remote.push(x, z, f, moving, dead); r.dead = !!dead; }
        }
        break;
      case 'me':
        Object.assign(stats, { health: m.health, hunger: m.hunger, thirst: m.thirst, inv: m.inv, tools: m.tools, warm: m.warm });
        // Energy runs locally for a snappy feel; follow the server if we drift.
        if (Math.abs(nrg.energy - m.energy) > 12 || nrg.exhausted !== m.exhausted) { nrg.energy = m.energy; nrg.exhausted = m.exhausted; }
        if (!ui.book.classList.contains('gone')) renderBook();
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
        if (m.o != null && objects[m.o]) objects[m.o].mesh.rotation.z = .06;
        if (me && m.id !== me.id) { const r = remotes.get(m.id); if (r) r.av.swingT = .35; }
        break;
      }
      case 'toast': toast(m.msg); break;
      case 'dawn':
        if (state === 'play') toast(`Morning of day ${m.day}. You made it through the night.`);
        break;
      case 'correct': px = m.x; pz = m.z; break;
      case 'died': state = 'dead'; deadT = 0; deathInfo = { cause: m.cause, day: m.day }; ui.prompt.classList.add('hidden'); break;
      case 'respawned':
        applySelf(m.you);
        hero.root.rotation.x = 0;
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
    Object.assign(stats, { health: you.health, hunger: you.hunger, thirst: you.thirst, inv: you.inv, tools: you.tools });
    Object.assign(nrg, { energy: you.energy, exhausted: you.exhausted, rest: 0 });
  }

  function leaveToTitle() {
    if (net) { net.close(); net = null; }
    state = 'title';
    showHud(false);
    ui.banner.classList.add('hidden');
    resetRemotes();
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
    objects.forEach(check); fires.forEach(check);
    if (bestO) return bestO;
    if (Math.hypot(px - SPRING.x, pz - SPRING.z) < RULES.SPRING_REACH) return { type: 'spring' };
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
      case 'fire': { const n = o.kind === 'hearth' ? 'hearth' : 'fire';
        return (stats.inv.wood || 0) > 0 ? (o.fuel > 0 ? `Add wood to the ${n}` : 'Relight with wood') : `${n[0].toUpperCase() + n.slice(1)} (needs wood)`; }
    }
  }
  const has = tool => stats.tools.includes(tool);
  function targetKey(o) {
    if (o.type === 'spring' || o.type === 'sea') return o.type;
    return (o.type === 'fire' ? 'f' : 'o') + o.id;
  }
  function act() {
    if (state !== 'play' || cooldown > 0 || !target || !net) return;
    cooldown = .45;
    if (['palm', 'tree', 'rock', 'fire', 'ore', 'dig'].includes(target.type)) hero.swingT = .35;
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
  $('btnSettings').addEventListener('click', () => togglePanel('settings'));
  $('btnRun').addEventListener('click', () => { runToggle = !runToggle; $('btnRun').setAttribute('aria-pressed', String(runToggle)); });

  // ================= Input =================
  // Controls are stored by physical key (e.code), so they work on any keyboard layout.
  const ACTIONS = [
    ['forward', 'Walk forward', 'KeyW'], ['back', 'Walk back', 'KeyS'], ['left', 'Walk left', 'KeyA'], ['right', 'Walk right', 'KeyD'],
    ['sprint', 'Sprint (hold)', 'ShiftLeft'], ['act', 'Use / pick up', 'KeyE'], ['build', 'Quick-build campfire', 'KeyF'],
    ['book', 'Recipe book', 'KeyB'],
  ];
  const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
  const PREFS_KEY = 'unknown-island-prefs';
  let prefs = { binds: { ...DEFAULT_BINDS }, sens: 1, invertY: false, quality: 'auto' };
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
  const panelOpen = () => !ui.book.classList.contains('gone') || !ui.settings.classList.contains('gone');
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
    if (e.code === 'Escape') { e.preventDefault(); if (panelOpen()) closePanels(); else if (state === 'play') togglePanel('settings'); return; }
    if (panelOpen()) { if (e.code === prefs.binds.book && !ui.book.classList.contains('gone')) closePanels(); return; }
    if (state !== 'play') return;
    if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
    keys[e.code] = true;
    if (e.code === prefs.binds.act) act();
    if (e.code === prefs.binds.build) build('campfire');
    if (e.code === prefs.binds.book) togglePanel('book');
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

  // ================= Recipe book & settings =================
  function togglePanel(which) {
    const el = which === 'book' ? ui.book : ui.settings;
    const opening = el.classList.contains('gone');
    closePanels();
    if (!opening) return;
    releaseKeys();
    if (which === 'book') renderBook(); else renderSettings();
    el.classList.remove('gone');
    const first = el.querySelector('.x');
    if (first) first.focus({ preventScroll: true });
  }
  function closePanels() {
    waitingBind = null;
    ui.book.classList.add('gone'); ui.settings.classList.add('gone');
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

  // ================= Loop =================
  const clock = new THREE.Clock();
  const tagV = new THREE.Vector3();
  let elapsed = 0, lastDayLabel = '', growTimer = 0;
  const inGame = () => state === 'play' || state === 'dead';

  function tick() {
    const dt = Math.min(clock.getDelta(), .05); elapsed += dt;

    // Time runs locally between server snapshots.
    if (inGame()) { t += dt / RULES.DAY_LEN; if (t >= 1) t -= 1; }
    else if (state === 'title' || state === 'connecting') t = .3 + Math.sin(elapsed * .02) * .02;

    const sunI = sky(t);
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
    fireflies.update(elapsed, clamp((-sunDir.y + .08) / .25, 0, 1));
    sun.color.copy(sunCol); sun.intensity = .15 + sunI * .58;
    hemi.intensity = .35 + sunI * .2;
    hemi.color.set(sunI < .2 ? 0x8E9AB8 : 0xFFF6E6);
    const night = isNight(t);

    const cloudTint = .35 + sunI * .65;
    updateCrests(elapsed, cloudTint);
    updatePuffs(dt, elapsed);
    clouds.forEach(c => {
      const u = c.userData, a = u.a + elapsed * u.speed;
      c.position.set(Math.cos(a) * u.rad, u.y, Math.sin(a) * u.rad);
      c.material.color.setRGB(cloudTint, cloudTint, Math.min(1, cloudTint * 1.08));
    });
    const sp = seaGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
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
    lit.sort((a, b) => a.d - b.d);
    fireLights.forEach((l, i) => {
      const e = lit[i];
      if (!e) { l.intensity = 0; return; }
      l.position.set(e.f.x, heightAt(e.f.x, e.f.z) + 1.1, e.f.z);
      l.intensity = (1.5 + Math.sin(elapsed * 11 + i) * .25) * e.s;
    });

    // Your own castaway: moved locally, reported to the server.
    let moving = false, wantSprint = false;
    if (state === 'play') {
      const free = !panelOpen();
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
          objects.forEach(push); fires.forEach(push);
          px = nx; pz = nz;
        }
        const tf = Math.atan2(dx, dz);
        let df = tf - face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
        face += df * Math.min(1, dt * 12);
        moving = true;
      }
      const now = performance.now();
      const changed = Math.abs(px - lastSent.x) > .01 || Math.abs(pz - lastSent.z) > .01 || Math.abs(face - lastSent.face) > .02
        || moving !== lastSent.moving || wantSprint !== lastSent.sprint;
      if (net && net.open && ((changed && now - lastSent.at > 66) || now - lastSent.at > 1000)) {
        net.send({ t: 'pos', x: px, z: pz, face, moving, sprint: wantSprint });
        lastSent = { at: now, x: px, z: pz, face, moving, sprint: wantSprint };
      }
    }
    if (hero) poseCastaway(hero, px, pz, face, moving ? (running ? 2 : 1) : 0, state === 'dead', dt, elapsed);

    // Other castaways, played back smoothly.
    remotes.forEach(r => {
      const s = r.remote.sample();
      poseCastaway(r.av, s.x, s.z, s.face, s.moving, !!s.dead, dt, elapsed);
      tagV.set(s.x, Math.max(groundAt(s.x, s.z), -.75) + 2.05, s.z).project(camera);
      const dist = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
      if (tagV.z > 1 || dist > 45) r.tag.style.display = 'none';
      else {
        r.tag.style.display = '';
        r.tag.style.transform = `translate(${(tagV.x * .5 + .5) * innerWidth}px,${(-tagV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
      }
    });
    if ((growTimer -= dt) <= 0) { growTimer = 1; objects.forEach(resize1); }
    objects.forEach(o => { if (o.mesh.rotation.z > 0) o.mesh.rotation.z = Math.max(0, o.mesh.rotation.z - dt * .4); });

    // HUD
    if (state === 'play') {
      cooldown = Math.max(0, cooldown - dt);
      if (warnedNightDay !== day && t > .72 && t < .8) {
        warnedNightDay = day;
        toast([...fires.values()].some(f => f.fuel > 0) ? 'Night is coming. Keep a fire fed.' : 'It’s getting dark and cold. A fire would help.');
      }
      target = findTarget();
      const lab = label(target);
      if (lab) { ui.prompt.innerHTML = `<kbd>${esc(keyLabel(prefs.binds.act))}</kbd>${esc(lab)}`; ui.prompt.classList.remove('hidden'); $('btnAct').textContent = lab.split(' ').slice(0, 2).join(' '); }
      else { ui.prompt.classList.add('hidden'); $('btnAct').textContent = 'Act'; }

      $('bHealth').style.setProperty('--v', stats.health + '%');
      $('bFood').style.setProperty('--v', stats.hunger + '%');
      $('bWater').style.setProperty('--v', stats.thirst + '%');
      $('bEnergy').style.setProperty('--v', nrg.energy + '%');
      $('energyBar').classList.toggle('tired', nrg.exhausted);
      const dl = `Day ${day} <small>${phaseName(t)}</small>`;
      if (dl !== lastDayLabel) { $('dayLabel').innerHTML = dl; lastDayLabel = dl; }
      const temp = $('temp');
      if (nrg.exhausted) { temp.textContent = 'Exhausted. Catch your breath.'; temp.className = 'temp cold'; }
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
      camera.position.set(Math.sin(a) * 52, 24, Math.cos(a) * 52);
      camera.lookAt(0, 1, 0);
    } else {
      const py = Math.max(heightAt(px, pz), -.75);
      const cx = px + Math.sin(yaw) * Math.cos(pitch) * camDist;
      const cz = pz + Math.cos(yaw) * Math.cos(pitch) * camDist;
      let cy = py + 1.2 + Math.sin(pitch) * camDist;
      cy = Math.max(cy, heightAt(cx, cz) + .8, .8);
      camera.position.set(cx, cy, cz);
      camera.lookAt(px, py + 1.3, pz);
    }

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
