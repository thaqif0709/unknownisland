// Unknown Island client: rendering (three.js + watercolor post pass), input,
// login screens, and talking to the server. The server decides what actually
// happens; this file predicts your own movement and draws everything.
(() => {
  'use strict';
  const WG = window.WorldGen;
  const { heightAt, fbm, clamp, SPRING, SPAWN, mulberry32, isNight, phaseName } = WG;
  let RULES = WG.RULES;

  // ================= Renderer & post (watercolor) =================
  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const PR = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(PR);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xD9E8EC, 45, 150);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 400);

  const rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

  function makePaper() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
    const img = g.getImageData(0, 0, 512, 512), d = img.data;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const n = fbm(x * .06, y * .06) * .55 + fbm(x * .5, y * .5) * .3 + Math.random() * .15;
      const v = 90 + n * 130; const i = (y * 512 + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
    for (let i = 0; i < 260; i++) { const x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * 6.28, l = 6 + Math.random() * 14;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  const postMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, paper: { value: makePaper() }, res: { value: new THREE.Vector2(1, 1) }, night: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform sampler2D paper; uniform vec2 res; uniform float night;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
      float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
      void main(){
        vec2 px = 1.0 / res;
        vec2 asp = vec2(res.x/res.y, 1.);
        vec2 wob = (vec2(fbm(vUv*asp*7.+3.1), fbm(vUv*asp*7.+8.7)) - .5) * .009;
        vec2 uv = vUv + wob;
        vec3 c = texture2D(tDiffuse, uv).rgb * .36;
        c += texture2D(tDiffuse, uv + vec2( px.x*2.5, 0.)).rgb * .16;
        c += texture2D(tDiffuse, uv + vec2(-px.x*2.5, 0.)).rgb * .16;
        c += texture2D(tDiffuse, uv + vec2(0.,  px.y*2.5)).rgb * .16;
        c += texture2D(tDiffuse, uv + vec2(0., -px.y*2.5)).rgb * .16;
        vec3 e1 = texture2D(tDiffuse, uv + vec2(px.x*1.6, px.y*.8)).rgb;
        vec3 e2 = texture2D(tDiffuse, uv - vec2(px.x*1.6, px.y*.8)).rgb;
        vec3 e3 = texture2D(tDiffuse, uv + vec2(-px.y*.8, px.y*1.6)).rgb;
        vec3 e4 = texture2D(tDiffuse, uv - vec2(-px.y*.8, px.y*1.6)).rgb;
        float edge = smoothstep(.07, .32, length(e1-e2) + length(e3-e4));
        float wash = fbm(vUv*asp*2.6 + 1.7);
        float gran = texture2D(paper, vUv * res / 512.).r;
        float l = dot(c, vec3(.299,.587,.114));
        c = mix(c, vec3(l), .12);
        c = c * .9 + .07;
        c = mix(c, c*c*1.15, .35 * smoothstep(.35,.75,wash));
        c = mix(c, vec3(.97,.95,.9), .14 * smoothstep(.55,.25,wash) * (1.-night*.8));
        c *= mix(.84, 1.06, gran);
        c = mix(c, c * .55, edge * .65);
        vec2 q = (vUv - .5) * vec2(1.06, 1.);
        float vig = smoothstep(.78, .42, length(q) + (fbm(vUv*asp*4.)-.5)*.28);
        vec3 paperCol = mix(vec3(.97,.95,.9), vec3(.83,.81,.86), night);
        c = mix(paperCol * mix(.9,1.03,gran), c, vig);
        gl_FragColor = vec4(c, 1.);
      }`,
    depthTest: false, depthWrite: false
  });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  // ================= Materials & lights =================
  const gradData = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const gradMap = new THREE.DataTexture(gradData, 3, 1, THREE.RGBAFormat);
  gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter; gradMap.needsUpdate = true;
  const matCache = new Map();
  const toon = (c, extra) => new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: gradMap }, extra || {}));
  const toonShared = c => { if (!matCache.has(c)) matCache.set(c, toon(c)); return matCache.get(c); };

  const hemi = new THREE.HemisphereLight(0xE8F0FF, 0xB08A6A, .6);
  const sun = new THREE.DirectionalLight(0xFFF1DC, .9);
  scene.add(hemi, sun, sun.target);

  // A fixed pool of fire lights, moved to the nearest lit fires each frame.
  // (A light per fire would slow things down as the island fills with fire pits.)
  const fireLights = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xFF9A4A, 0, 14, 1.6); scene.add(l); fireLights.push(l); }

  // ================= Terrain =================
  const SIZE = 112, SEG = 150;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const pos = tGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const C = h => new THREE.Color(h);
  const cSand = C(0xEBD5A3), cWet = C(0xCDB78C), cDeep = C(0x7FA8AE), cGrassA = C(0xA3C46F), cGrassB = C(0x6E9E5A), cRock = C(0xA7A08E), cMoss = C(0x5E8C5A);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    if (h < .05) tmp.copy(cWet).lerp(cDeep, clamp(-h / 2.5, 0, 1));
    else if (h < .95) tmp.copy(cSand);
    else {
      tmp.copy(cGrassA).lerp(cGrassB, fbm(x * .12 + 5, z * .12));
      if (h > 5.8) tmp.lerp(cRock, clamp((h - 5.8) / 1.5, 0, .85));
      if (Math.hypot(x - SPRING.x, z - SPRING.z) < 5) tmp.lerp(cMoss, .5);
    }
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(tGeo, toon(0xffffff, { vertexColors: true })));

  const seaGeo = new THREE.PlaneGeometry(420, 420, 70, 70); seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, toon(0x6FB0C2, { transparent: true, opacity: .82 }));
  scene.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  const pond = new THREE.Mesh(new THREE.CircleGeometry(2.25, 28), toon(0x8FC9D6));
  pond.rotation.x = -Math.PI / 2; pond.position.set(SPRING.x, 1.62, SPRING.z);
  scene.add(pond);
  const pondRock = toon(0x9E9A8C);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + .2, r = 2.45;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(.35 + (i % 3) * .1, 0), pondRock);
    const x = SPRING.x + Math.cos(a) * r, z = SPRING.z + Math.sin(a) * r;
    m.position.set(x, heightAt(x, z) + .1, z); m.rotation.set(i, i * 2, 0);
    scene.add(m);
  }

  // ================= Props =================
  // Positions come from the server; small visual details (leaf angles, sizes)
  // come from an RNG seeded by the object's id so everyone sees the same thing.
  const trunkM = toon(0x9C7B5B), barkM = toon(0x7A5A45);
  const palmLeaf = [toon(0x7FAE5A), toon(0x5E9950)];
  const treeLeaf = [toon(0x5F9656), toon(0x789F4E), toon(0x4C8062)];
  const coconutM = toon(0x7B5536), berryM = toon(0xC8404F), bushM = toon(0x5A8A4E), rockM = [toon(0xAAA496), toon(0x94907F)];

  function makePalm(rng) {
    const g = new THREE.Group();
    const hgt = 4 + rng() * 1.6, bend = .2 + rng() * .35, segs = 6;
    for (let i = 0; i < segs; i++) {
      const f = i / segs;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(.15 - f * .05, .2 - f * .05, hgt / segs + .08, 6), trunkM);
      s.position.set(bend * 3 * f * f, hgt * (i + .5) / segs, 0); s.rotation.z = -bend * f * 1.6;
      g.add(s);
    }
    const top = new THREE.Vector3(bend * 3, hgt, 0);
    for (let k = 0; k < 7; k++) {
      const piv = new THREE.Group(); piv.position.copy(top); piv.rotation.y = k / 7 * Math.PI * 2 + rng() * .3;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.38, 2.8, 4), palmLeaf[k % 2]);
      const a = Math.PI / 2 + .35 + rng() * .3;
      leaf.rotation.x = a; leaf.position.set(0, Math.cos(a) * 1.35, Math.sin(a) * 1.35); leaf.scale.z = .22;
      piv.add(leaf); g.add(piv);
    }
    const nuts = [];
    for (let k = 0; k < 3; k++) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), coconutM);
      const a = k / 3 * Math.PI * 2;
      n.position.set(top.x + Math.cos(a) * .22, top.y - .25, Math.sin(a) * .22);
      g.add(n); nuts.push(n);
    }
    g.rotation.y = rng() * Math.PI * 2;
    return { g, nuts };
  }
  function makeTree(rng) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, 2.2, 6), barkM); t.position.y = 1.1; g.add(t);
    const m = treeLeaf[(rng() * 3) | 0];
    [[0, 2.9, 0, 1.4], [.7, 2.5, .3, .9], [-.5, 3.4, -.3, .9]].forEach(([x, y, z, s]) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), m); b.position.set(x, y, z); b.rotation.set(rng() * 3, rng() * 3, 0); g.add(b);
    });
    g.rotation.y = rng() * 6.28;
    return g;
  }
  function makeBush(rng) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.75, 0), bushM); b.scale.set(1, .7, 1); b.position.y = .42; g.add(b);
    const berries = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = rng() * 6.28, y = .35 + rng() * .4;
      const s = new THREE.Mesh(new THREE.SphereGeometry(.08, 6, 5), berryM);
      s.position.set(Math.cos(a) * .7, y, Math.sin(a) * .7); berries.add(s);
    }
    g.add(berries);
    return { g, berries };
  }
  function makeRock(rng, s) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(.62 * s, 0), rockM[(rng() * 2) | 0]);
    m.scale.set(1, .65, .9); m.rotation.set(rng() * 3, rng() * 3, rng() * 3); m.position.y = .18 * s;
    const g = new THREE.Group(); g.add(m); return g;
  }

  let objects = [];
  function buildProps(list) {
    objects.forEach(o => scene.remove(o.mesh));
    objects = list.map(src => {
      const o = { id: src.id, type: src.type, x: src.x, z: src.z, r: src.r, s: src.s, state: src.state || WG.defaultState(src.type) };
      const rng = mulberry32(o.id * 7919 + 13);
      if (o.type === 'palm') { const p = makePalm(rng); o.mesh = p.g; o.nuts = p.nuts; }
      else if (o.type === 'tree') o.mesh = makeTree(rng);
      else if (o.type === 'bush') { const b = makeBush(rng); o.mesh = b.g; o.berryMesh = b.berries; }
      else o.mesh = makeRock(rng, o.s || 1);
      o.mesh.position.set(o.x, heightAt(o.x, o.z), o.z);
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
  }
  // Title-screen backdrop until the server sends the real island.
  buildProps(WG.generateObjects(7));

  // ================= Castaways =================
  const SHIRTS = [0xD9665E, 0x5E8FD9, 0x6FAE5B, 0xD9A23E, 0x9A6BC4, 0x4FB0A8, 0xE07FA6, 0x8A7A5A, 0xC7703A, 0x5C6BC0];
  const shirtFor = id => SHIRTS[(id - 1) % SHIRTS.length];
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const shortsM = toon(0x4F6E9A), skinM = toon(0xD6A07A), hatM = toon(0xE3C27A), hairM = toon(0x4A3528);
  const blobM = new THREE.MeshBasicMaterial({ color: 0x3A3050, transparent: true, opacity: .22, depthWrite: false });

  function makeCastaway(shirt) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
    body.add(box(.56, .66, .32, toonShared(shirt), 0, 1.25, 0), box(.52, .3, .3, shortsM, 0, .86, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(.21, 14, 10), skinM); head.position.y = 1.8; body.add(head);
    const beard = new THREE.Mesh(new THREE.SphereGeometry(.17, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hairM);
    beard.position.set(0, 1.74, .06); body.add(beard);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.44, .46, .04, 16), hatM); brim.position.y = 1.95; body.add(brim);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(.24, .26, 12), hatM); crown.position.y = 2.09; body.add(crown);
    function limb(x, y, len, w, m, foot) {
      const p = new THREE.Group(); p.position.set(x, y, 0);
      p.add(box(w, len, w + .02, m, 0, -len / 2, 0));
      if (foot) p.add(box(w + .02, .1, .3, skinM, 0, -len, .06));
      body.add(p); return p;
    }
    const av = {
      root, body,
      legL: limb(-.14, .8, .75, .18, skinM, true), legR: limb(.14, .8, .75, .18, skinM, true),
      armL: limb(-.36, 1.55, .58, .13, skinM), armR: limb(.36, 1.55, .58, .13, skinM),
      blob: new THREE.Mesh(new THREE.CircleGeometry(.45, 18), blobM),
      walk: 0, swingT: 0,
    };
    av.blob.rotation.x = -Math.PI / 2;
    scene.add(root, av.blob);
    return av;
  }
  function removeCastaway(av) { scene.remove(av.root, av.blob); }

  function poseCastaway(av, x, z, face, moving, dead, dt, elapsed) {
    const gh = heightAt(x, z), y = Math.max(gh, -.75);
    av.root.position.set(x, y, z);
    av.root.rotation.y = face;
    av.blob.position.set(x, Math.max(gh, 0) + .03, z);
    if (dead) { av.root.rotation.x = Math.max(-1.45, av.root.rotation.x - dt * 3); return; }
    av.root.rotation.x = 0;
    if (moving) av.walk += dt * 9; else av.walk *= .9;
    const s = Math.sin(av.walk) * (moving ? .75 : 0);
    av.legL.rotation.x = s; av.legR.rotation.x = -s;
    av.armL.rotation.x = -s * .8;
    if (av.swingT > 0) { av.swingT -= dt; const k = av.swingT / .35; av.armR.rotation.x = -2.4 * Math.sin(k * Math.PI); }
    else av.armR.rotation.x = s * .8;
    av.body.position.y = moving ? Math.abs(Math.cos(av.walk)) * .05 : Math.sin(elapsed * 2) * .01;
  }

  // ================= Fires =================
  let fires = new Map();
  const logM = toon(0x6B4A36), flameA = new THREE.MeshBasicMaterial({ color: 0xF28C38 }), flameB = new THREE.MeshBasicMaterial({ color: 0xFFD66B });
  function addFire(src) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(.16, 0), rockM[i % 2]); s.position.set(Math.cos(a) * .55, .08, Math.sin(a) * .55); g.add(s); }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .9, 6), logM); l.rotation.set(Math.PI / 2 - .35, i * 2.1, 0); l.position.y = .18; g.add(l); }
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(.3, .85, 7), flameA); f1.position.y = .55;
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(.16, .55, 6), flameB); f2.position.y = .45;
    g.add(f1, f2);
    g.position.set(src.x, heightAt(src.x, src.z), src.z);
    scene.add(g);
    const f = { id: src.id, type: 'fire', x: src.x, z: src.z, r: .6, mesh: g, flames: [f1, f2], fuel: src.fuel, state: {} };
    fires.set(f.id, f);
    return f;
  }
  function clearFires() { fires.forEach(f => scene.remove(f.mesh)); fires = new Map(); }

  // ================= State =================
  let state = 'title';              // title | connecting | play | dead
  let t = .3, day = 1;
  let me = null;                    // { id, name }
  let stats = { health: 100, hunger: 80, thirst: 70, wood: 0, stone: 0, warm: false };
  let px = SPAWN.x, pz = SPAWN.z, face = Math.PI, cooldown = 0, deadT = 0, deathInfo = null;
  let yaw = 0, pitch = .55, camDist = 9;
  let warnedNightDay = 0, target = null;
  let hero = null;
  const remotes = new Map();        // id -> { name, remote, av, tag }
  let net = null, lastSent = { at: 0, x: 0, z: 0, face: 0, moving: false };

  const $ = id => document.getElementById(id);
  const ui = { hud: $('hud'), inv: $('inv'), prompt: $('prompt'), toast: $('toast'), overlay: $('overlay'), online: $('online'),
    touch: $('touchUi'), banner: $('banner'), tags: $('tags') };
  let toastTimer = 0;
  function toast(msg) { ui.toast.textContent = msg; ui.toast.classList.add('on'); toastTimer = 2.6; }

  function showHud(on) {
    [ui.hud, ui.inv, ui.online, ui.touch].forEach(el => el.classList.toggle('hidden', !on));
    if (!on) ui.prompt.classList.add('hidden');
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
    const av = makeCastaway(shirtFor(p.id));
    remotes.set(p.id, { name: p.name, remote: new Net.Remote(p.x, p.z, p.face), av, tag, dead: p.dead });
  }
  function renderOnline() {
    const rows = [`<span><i style="background:${hex(shirtFor(me.id))}"></i>${esc(me.name)} (you)</span>`];
    remotes.forEach((r, id) => rows.push(`<span><i style="background:${hex(shirtFor(id))}"></i>${esc(r.name)}</span>`));
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
        hero = makeCastaway(shirtFor(me.id));
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
        Object.assign(stats, { health: m.health, hunger: m.hunger, thirst: m.thirst, wood: m.wood, stone: m.stone, warm: m.warm });
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
    Object.assign(stats, { health: you.health, hunger: you.hunger, thirst: you.thirst, wood: you.wood, stone: you.stone });
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
      const d = Math.hypot(o.x - px, o.z - pz) - o.r;
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
      case 'palm': return o.state.coconuts > 0 ? 'Pick a coconut' : 'Chop the palm';
      case 'tree': return 'Chop the tree';
      case 'bush': return o.state.berries ? 'Eat berries' : 'Bush (picked clean)';
      case 'rock': return 'Gather stone';
      case 'fire': return stats.wood > 0 ? (o.fuel > 0 ? 'Add wood to the fire' : 'Relight with wood') : 'Fire (needs wood)';
    }
  }
  function targetKey(o) {
    if (o.type === 'spring' || o.type === 'sea') return o.type;
    return (o.type === 'fire' ? 'f' : 'o') + o.id;
  }
  function act() {
    if (state !== 'play' || cooldown > 0 || !target || !net) return;
    cooldown = .45;
    if (['palm', 'tree', 'rock', 'fire'].includes(target.type)) hero.swingT = .35;
    net.send({ t: 'act', target: targetKey(target) });
  }
  function buildFire() {
    if (state !== 'play' || !net) return;
    if (stats.wood < RULES.FIRE_WOOD || stats.stone < RULES.FIRE_STONE) {
      toast(`A fire needs ${RULES.FIRE_WOOD} wood and ${RULES.FIRE_STONE} stone. You have ${stats.wood} and ${stats.stone}.`);
      return;
    }
    const fx = px + Math.sin(face) * 1.6, fz = pz + Math.cos(face) * 1.6;
    if (heightAt(fx, fz) < .35) { toast('Too wet here. Build it on dry ground.'); return; }
    net.send({ t: 'build', x: fx, z: fz });
  }
  $('btnAct').addEventListener('click', act);
  $('btnFire').addEventListener('click', buildFire);

  // ================= Input =================
  const keys = {};
  window.addEventListener('keydown', e => {
    if (state !== 'play') return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'e' || e.key === 'E') act();
    if (e.key === 'f' || e.key === 'F') buildFire();
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

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
      yaw -= (e.clientX - orb.lx) * .007; pitch = clamp(pitch + (e.clientY - orb.ly) * .004, .18, 1.15);
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
    rt.setSize(Math.floor(w * PR), Math.floor(h * PR));
    postMat.uniforms.res.value.set(w * PR, h * PR);
    camera.aspect = w / h; camera.fov = w / h < .8 ? 68 : 55;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ================= Sky =================
  const skyKeys = [
    [0, 0x2F3358, 0x6F7AB8, .05], [.2, 0x3C4170, 0x7F86C0, .06], [.25, 0xF0B8A2, 0xFFC7A0, .45], [.32, 0xD3E3E6, 0xFFF1DC, .9],
    [.5, 0xDCEAEC, 0xFFF6E6, 1], [.68, 0xE8DCC4, 0xFFE6C2, .85], [.75, 0xE7A08F, 0xFFA87A, .45], [.8, 0x4B4F7E, 0x8C8FC8, .08], [1, 0x2F3358, 0x6F7AB8, .05]
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
  let elapsed = 0, lastDayLabel = '';
  const inGame = () => state === 'play' || state === 'dead';

  function tick() {
    const dt = Math.min(clock.getDelta(), .05); elapsed += dt;

    // Time runs locally between server snapshots.
    if (inGame()) { t += dt / RULES.DAY_LEN; if (t >= 1) t -= 1; }
    else if (state === 'title' || state === 'connecting') t = .3 + Math.sin(elapsed * .02) * .02;

    const sunI = sky(t);
    scene.background = skyCol; scene.fog.color.copy(skyCol);
    const ang = (t - .25) * Math.PI * 2, sunH = Math.sin(ang);
    sun.position.set(px + Math.cos(ang) * 40, Math.max(sunH, .15) * 40, pz - 18);
    sun.target.position.set(px, 0, pz);
    sun.color.copy(sunCol); sun.intensity = .15 + sunI * .8;
    hemi.intensity = .38 + sunI * .35;
    hemi.color.set(sunI < .2 ? 0x8C92D8 : 0xE8F0FF);
    const night = isNight(t);
    postMat.uniforms.night.value += ((night ? 1 : 0) - postMat.uniforms.night.value) * Math.min(1, dt * .8);

    const sp = seaGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
      sp.setY(i, Math.sin(x * .25 + elapsed * 1.1) * .06 + Math.cos(z * .3 + elapsed * .9) * .06);
    }
    sp.needsUpdate = true;

    // Fires: burn down locally, the server corrects about once a second.
    const lit = [];
    fires.forEach(f => {
      if (inGame()) f.fuel = Math.max(0, f.fuel - dt);
      const on = f.fuel > 0, s = on ? clamp(f.fuel / 40, .35, 1) : 0;
      f.flames.forEach((fl, i) => { fl.visible = on; fl.scale.set(s * (1 + Math.sin(elapsed * 13 + i) * .08), s * (1 + Math.sin(elapsed * 17 + i * 2) * .15), s); });
      if (on) lit.push({ f, s, d: Math.hypot(f.x - px, f.z - pz) });
    });
    lit.sort((a, b) => a.d - b.d);
    fireLights.forEach((l, i) => {
      const e = lit[i];
      if (!e) { l.intensity = 0; return; }
      l.position.set(e.f.x, heightAt(e.f.x, e.f.z) + 1.1, e.f.z);
      l.intensity = (1.5 + Math.sin(elapsed * 11 + i) * .25) * e.s;
    });

    // Your own castaway: moved locally, reported to the server.
    let moving = false;
    if (state === 'play') {
      let ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x;
      let iz = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) - joy.y;
      const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
      if (l > .08) {
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const dx = rx * ix + fx * iz, dz = rz * ix + fz * iz;
        const spd = (heightAt(px, pz) < .1 ? RULES.WADE_SPEED : RULES.WALK_SPEED) * Math.min(1, l);
        let nx = px + dx * spd * dt, nz = pz + dz * spd * dt;
        if (heightAt(nx, nz) > -1) {
          const push = o => {
            if (o.state.gone) return;
            const ox = nx - o.x, oz = nz - o.z, d = Math.hypot(ox, oz), min = o.r + .3;
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
      const changed = Math.abs(px - lastSent.x) > .01 || Math.abs(pz - lastSent.z) > .01 || Math.abs(face - lastSent.face) > .02 || moving !== lastSent.moving;
      if (net && net.open && ((changed && now - lastSent.at > 66) || now - lastSent.at > 1000)) {
        net.send({ t: 'pos', x: px, z: pz, face, moving });
        lastSent = { at: now, x: px, z: pz, face, moving };
      }
    }
    if (hero) poseCastaway(hero, px, pz, face, moving, state === 'dead', dt, elapsed);

    // Other castaways, played back smoothly.
    remotes.forEach(r => {
      const s = r.remote.sample();
      poseCastaway(r.av, s.x, s.z, s.face, !!s.moving, !!s.dead, dt, elapsed);
      tagV.set(s.x, Math.max(heightAt(s.x, s.z), -.75) + 2.55, s.z).project(camera);
      const dist = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
      if (tagV.z > 1 || dist > 45) r.tag.style.display = 'none';
      else {
        r.tag.style.display = '';
        r.tag.style.transform = `translate(${(tagV.x * .5 + .5) * innerWidth}px,${(-tagV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
      }
    });
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
      if (lab) { ui.prompt.innerHTML = `<kbd>E</kbd>${lab}`; ui.prompt.classList.remove('hidden'); $('btnAct').textContent = lab.split(' ').slice(0, 2).join(' '); }
      else { ui.prompt.classList.add('hidden'); $('btnAct').textContent = 'Act'; }

      $('bHealth').style.setProperty('--v', stats.health + '%');
      $('bFood').style.setProperty('--v', stats.hunger + '%');
      $('bWater').style.setProperty('--v', stats.thirst + '%');
      const dl = `Day ${day} <small>${phaseName(t)}</small>`;
      if (dl !== lastDayLabel) { $('dayLabel').innerHTML = dl; lastDayLabel = dl; }
      const temp = $('temp');
      if (night) { temp.textContent = stats.warm ? 'Warm by the fire' : 'Cold'; temp.className = 'temp ' + (stats.warm ? 'warm' : 'cold'); }
      else { temp.textContent = ''; temp.className = 'temp'; }
      $('iWood').textContent = stats.wood; $('iStone').textContent = stats.stone;
      $('craftHint').textContent = stats.wood >= RULES.FIRE_WOOD && stats.stone >= RULES.FIRE_STONE ? 'Press F to build a fire' : `A fire needs ${RULES.FIRE_WOOD} wood and ${RULES.FIRE_STONE} stone`;
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

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    requestAnimationFrame(tick);
  }

  boot();
  tick();
})();
