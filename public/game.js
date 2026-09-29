// Unknown Island client: rendering (three.js, soft and cute), input,
// login screens, and talking to the server. The server decides what actually
// happens; this file predicts your own movement and draws everything.
(() => {
  'use strict';
  const WG = window.WorldGen;
  const { heightAt, fbm, clamp, SPRING, SPAWN, mulberry32, isNight, phaseName } = WG;
  let RULES = WG.RULES;

  // ================= Renderer =================
  const stage = document.getElementById('stage');
  const coarse = matchMedia('(pointer: coarse)').matches;
  // Preview: ?style=pixel renders at low resolution with a limited, dithered palette.
  const PIXEL = new URLSearchParams(location.search).get('style') === 'pixel';
  if (PIXEL) document.documentElement.classList.add('pixel');
  const renderer = new THREE.WebGLRenderer({ antialias: !PIXEL });
  renderer.setPixelRatio(PIXEL ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PIXEL ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  let pixelRT = null, pixelPost = null;
  if (PIXEL) {
    pixelRT = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: pixelRT.texture }, res: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
        float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
        float bayer(vec2 a){ return b2(.5 * a) * .25 + b2(a); }
        void main(){
          vec2 px = floor(vUv * res);
          vec3 c = texture2D(tDiffuse, (px + .5) / res).rgb;
          c = pow(c, vec3(.95)) * 1.04;
          float d = bayer(px) - .5;
          c = floor(c * 8. + d * .35 + .5) / 8.;     // 9 levels per channel, light ordered dither
          gl_FragColor = vec4(c, 1.);
        }`,
      depthTest: false, depthWrite: false,
    });
    const ps = new THREE.Scene(); ps.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    pixelPost = { scene: ps, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xBDE8FF, 60, 180);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 400);

  // ================= Materials & lights =================
  // Smooth shading with a faint sheen: soft, toy-like surfaces.
  const matCache = new Map();
  const soft = (c, extra) => new THREE.MeshPhongMaterial(Object.assign({ color: c, shininess: 12, specular: 0x161616 }, extra || {}));
  const softShared = c => { if (!matCache.has(c)) matCache.set(c, soft(c)); return matCache.get(c); };
  const shadows = obj => obj.traverse(m => { if (m.isMesh) m.castShadow = true; });
  const ball = (r, m, w = 18, h = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);

  const hemi = new THREE.HemisphereLight(0xFFFFFF, 0xCDB894, .6);
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
  const cSand = C(0xFBE6B4), cWet = C(0xF0D29C), cDeep = C(0x86D8E6), cGrassA = C(0xAEE27E), cGrassB = C(0x80CC6C), cRock = C(0xCFC8BC), cMoss = C(0x78C77E);
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
  tGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  const seaGeo = new THREE.PlaneGeometry(420, 420, 70, 70); seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, soft(0x62D0E6, { transparent: true, opacity: .82, shininess: 40, specular: 0x444444 }));
  sea.receiveShadow = true;
  scene.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  const pond = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), soft(0x8FE6F4, { shininess: 60, specular: 0x555555 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(SPRING.x, 1.62, SPRING.z);
  pond.receiveShadow = true;
  scene.add(pond);
  const pondRock = soft(0xD8D2C8);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + .2, r = 2.45;
    const m = ball(.35 + (i % 3) * .1, pondRock, 12, 10); m.scale.y = .7;
    const x = SPRING.x + Math.cos(a) * r, z = SPRING.z + Math.sin(a) * r;
    m.position.set(x, heightAt(x, z) + .1, z);
    m.castShadow = true;
    scene.add(m);
  }

  // ================= Flowers and little plants (decoration only) =================
  // Each species grows where it likes: sea pinks on the sand, daisies and tulips
  // on the lowland grass, bluebells by the spring, lavender up the hill,
  // mushrooms in shady patches, and grass tufts everywhere green.
  {
    const frng = mulberry32(4242);
    const lambert = c => new THREE.MeshLambertMaterial({ color: c });
    const white = new THREE.Color(0xFFFFFF);
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
        scene.add(im);
      }
    }
    const stemM = lambert(0x6BBF5E), tint = lambert(0xFFFFFF);
    const nearSpring = (x, z) => Math.hypot(x - SPRING.x, z - SPRING.z);
    const shade = (x, z) => fbm(x * .2 + 30, z * .2 - 7);
    // sea pinks: little pink puffs on the dry sand
    species(60, h => h > .6 && h < .95, [[stemGeo, stemM, 0, null, [1, .14, 1]], [G.puff, tint, .15, ['#FFB3C7', '#FF9EBB', '#FFD1DE'].map(c => new THREE.Color(c))]]);
    // daisies: white petals with a yellow middle
    species(140, (h, x, z) => h > 1.1 && h < 3.4 && nearSpring(x, z) > 7, [[stemGeo, stemM, 0, null, [1, .22, 1]],
      [G.petals, tint, .22, [white]], [G.dot, lambert(0xFFD43B), .24]]);
    // tulips: bright cups on taller stems
    species(90, (h, x, z) => h > 1.2 && h < 3 && shade(x, z) < .5, [[stemGeo, stemM, 0, null, [1, .32, 1]],
      [G.cup, tint, .32, ['#FF5C7A', '#FFB547', '#FF8FB1', '#C77DFF', '#FFFFFF'].map(c => new THREE.Color(c))]]);
    // bluebells around the spring
    species(80, (h, x, z) => h > 1.1 && nearSpring(x, z) > 3 && nearSpring(x, z) < 9, [[stemGeo, stemM, 0, null, [1, .2, 1]],
      [G.bell, tint, .2, ['#6F8BFF', '#8EA6FF', '#5C6BC0'].map(c => new THREE.Color(c))], [G.bell, tint, .14, ['#8EA6FF'].map(c => new THREE.Color(c))]]);
    // lavender up the hill
    species(110, h => h > 3.4 && h < 6.6, [[stemGeo, stemM, 0, null, [1, .18, 1]], [G.spike, lambert(0xA98BEA), .3]]);
    // mushrooms in shady patches of the lowland
    species(40, (h, x, z) => h > 1.2 && h < 4.5 && shade(x, z) > .58, [[stemGeo, lambert(0xFFF4E6), 0, null, [3.2, .14, 3.2]],
      [G.cap, tint, .12, ['#FF5C5C', '#E0795A', '#FFB547'].map(c => new THREE.Color(c))], [G.dot, lambert(0xFFFFFF), .2, null, [.6, .6, .6]]]);
    // grass tufts
    species(420, h => h > 1 && h < 6, [[G.tuft, lambert(0x7FCB63), .14], [G.tuft, lambert(0x92D670), .12, null, [.8, .8, .8]]]);
  }

  // ================= Plants and rocks =================
  // Positions come from the server; small visual details (leaf angles, colors)
  // come from an RNG seeded by the object's id so everyone sees the same thing.
  const trunkM = [soft(0xB98A5E), soft(0xA67A52)], barkM = soft(0x9B6E4C);
  const palmLeaf = [soft(0x7FD36B), soft(0x62C26A)];
  const treeLeaf = [soft(0x7CCB6B), soft(0x95D66F), soft(0x5FBA6E), soft(0xF7B6CB)];   // the pink one is blossom
  const coconutM = soft(0x9A6B45), berryM = soft(0xFF5C7A, { shininess: 60, specular: 0x666666 }), bushM = [soft(0x6CC468), soft(0x84D172)];
  const rockM = [soft(0xCBC5BC), soft(0xB9B3AB)];

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
  const pineM = [soft(0x4FA86A), soft(0x5DB878)], blueberryM = soft(0x5B7BE8, { shininess: 60, specular: 0x666666 });
  function makeTree(rng, species) {
    const g = new THREE.Group();
    if (species === 'pine') {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.16, .24, 1.4, 12), barkM); t.position.y = .7; g.add(t);
      const m = pineM[(rng() * 2) | 0];
      [[1.35, 1.5, 1.2], [1.05, 1.3, 2.05], [.72, 1.1, 2.8]].forEach(([r, h, y]) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18), m); c.position.y = y; g.add(c);
      });
      const tip = ball(.14, m, 10, 8); tip.position.y = 3.4; g.add(tip);
    } else {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.2, .3, 2.2, 12), barkM); t.position.y = 1.1; g.add(t);
      const m = species === 'blossom' ? treeLeaf[3] : treeLeaf[(rng() * 3) | 0];
      [[0, 2.9, 0, 1.25], [.75, 2.55, .3, .85], [-.6, 2.6, -.25, .8], [.1, 3.55, -.1, .8]].forEach(([x, y, z, sz]) => {
        const b = ball(sz, m); b.position.set(x, y, z); g.add(b);
      });
    }
    g.rotation.y = rng() * 6.28;
    return g;
  }
  function makeBush(rng, species) {
    const g = new THREE.Group();
    const m = bushM[(rng() * 2) | 0];
    [[0, .45, 0, .6], [.42, .35, .1, .42], [-.4, .33, -.1, .44], [.05, .32, .42, .4]].forEach(([x, y, z, sz]) => {
      const b = ball(sz, m, 14, 10); b.position.set(x, y, z); g.add(b);
    });
    const berries = new THREE.Group();
    const bm = species === 'blueberry' ? blueberryM : berryM;
    for (let i = 0; i < 8; i++) {
      const a = rng() * 6.28, y = .3 + rng() * .45;
      const b = ball(.09, bm, 10, 8);
      b.position.set(Math.cos(a) * .66, y, Math.sin(a) * .66); berries.add(b);
    }
    g.add(berries);
    return { g, berries };
  }
  const pebbleM = soft(0xE6D6B8), mossM = soft(0x86C77A);
  function makeRock(rng, s, species) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.62 * s, 2), species === 'pebble' ? pebbleM : rockM[(rng() * 2) | 0]);
    m.scale.set(1, species === 'pebble' ? .45 : .6, .85); m.rotation.y = rng() * 3; m.position.y = .15 * s;
    g.add(m);
    if (species === 'mossy') {
      const moss = ball(.5 * s, mossM, 14, 8); moss.scale.set(1, .35, .8); moss.position.y = .45 * s; g.add(moss);
    }
    return g;
  }
  const oreRockM = soft(0x9C97A6), oreM = { copper: soft(0xF08C4A, { shininess: 80, specular: 0x886644 }), iron: soft(0xE4E9F2, { shininess: 90, specular: 0x999999 }) };
  function makeOre(rng, s, ore) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.66 * s, 2), ore === 'iron' ? soft(0x7E6F78) : oreRockM);
    m.scale.set(1, .75, .9); m.position.y = .3 * s; g.add(m);
    for (let i = 0; i < 7; i++) {
      const a = rng() * 6.28, y = .15 + rng() * .5;
      const n = new THREE.Mesh(new THREE.IcosahedronGeometry(.12 + rng() * .06, 0), oreM[ore]);
      n.position.set(Math.cos(a) * .58 * s, y * s, Math.sin(a) * .5 * s); n.rotation.set(rng() * 3, rng() * 3, 0); g.add(n);
    }
    return g;
  }
  const dirtM = soft(0xA9784F), holeM = soft(0x5E4030), sproutM = soft(0x7CCB6B);
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
      o.mesh.position.set(o.x, heightAt(o.x, o.z), o.z);
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
  const SHIRTS = [0xFF7A8A, 0x6EC6FF, 0x8EDB7A, 0xFFC857, 0xB79CFF, 0x5FD6C4, 0xFF9ED2, 0xFFA66B, 0x7B8CFF, 0xE0E0E0];
  const shirtFor = id => SHIRTS[(id - 1) % SHIRTS.length];
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const shortsM = soft(0x5B6FB5), skinM = soft(0xFFD2B0), hatM = soft(0xFFE3A3), shoeM = soft(0x8A5A44);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x2A2438 }), shineM = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const blushM = new THREE.MeshBasicMaterial({ color: 0xFF9AA8, transparent: true, opacity: .7 });

  // A chibi castaway: big round head, small round body, stubby limbs.
  function makeCastaway(shirt) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const shirtM = softShared(shirt);
    const torso = ball(.32, shirtM); torso.scale.set(1, 1.05, .85); torso.position.y = .92; body.add(torso);
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(.27, .29, .2, 16), shortsM); shorts.position.y = .66; body.add(shorts);
    const head = ball(.38, skinM, 24, 18); head.position.y = 1.55; body.add(head);
    for (const sx of [-1, 1]) {
      const eye = ball(.055, eyeM, 10, 8); eye.scale.z = .6; eye.position.set(sx * .13, 1.58, .345); body.add(eye);
      const shine = ball(.018, shineM, 6, 4); shine.position.set(sx * .13 + .02, 1.6, .375); body.add(shine);
      const cheek = ball(.06, blushM, 10, 8); cheek.scale.set(1, .6, .4); cheek.position.set(sx * .22, 1.47, .3); body.add(cheek);
    }
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.54, .56, .05, 28), hatM); brim.position.y = 1.82; body.add(brim);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM); crown.position.y = 1.83; body.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.305, .305, .07, 20), shirtM); band.position.y = 1.87; body.add(band);
    function limb(x, y, len, w, m, endM, endR) {
      const p = new THREE.Group(); p.position.set(x, y, 0);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(w, w, len, 10), m); c.position.y = -len / 2; p.add(c);
      const e = ball(endR, endM, 10, 8); e.position.set(0, -len, endM === shoeM ? .04 : 0); if (endM === shoeM) e.scale.set(1, .7, 1.3); p.add(e);
      body.add(p); return p;
    }
    const av = {
      root, body,
      legL: limb(-.13, .6, .42, .08, skinM, shoeM, .11), legR: limb(.13, .6, .42, .08, skinM, shoeM, .11),
      armL: limb(-.34, 1.08, .34, .065, skinM, skinM, .08), armR: limb(.34, 1.08, .34, .065, skinM, skinM, .08),
      walk: 0, swingT: 0,
    };
    av.armL.rotation.z = -.25; av.armR.rotation.z = .25;
    shadows(root);
    scene.add(root);
    return av;
  }
  function removeCastaway(av) { scene.remove(av.root); }

  function poseCastaway(av, x, z, face, moving, dead, dt, elapsed) {
    const gh = heightAt(x, z), y = Math.max(gh, -.75);
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
  const logM = soft(0x9B6A48), flameA = new THREE.MeshBasicMaterial({ color: 0xFF9A3C }), flameB = new THREE.MeshBasicMaterial({ color: 0xFFE27A });
  const clayM = soft(0xD08C5C);
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
    g.position.set(src.x, heightAt(src.x, src.z), src.z);
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
  let prefs = { binds: { ...DEFAULT_BINDS }, sens: 1, invertY: false };
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
    if (PIXEL) {
      const k = Math.max(2, Math.round(h / 190));   // about 190 "pixels" tall
      pixelRT.setSize(Math.ceil(w / k), Math.ceil(h / k));
      pixelPost.mat.uniforms.res.value.set(Math.ceil(w / k), Math.ceil(h / k));
    }
    camera.aspect = w / h; camera.fov = w / h < .8 ? 68 : 55;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ================= Sky =================
  const skyKeys = [
    [0, 0x2B2F5E, 0x7A86D8, .08], [.2, 0x3A3F7A, 0x8C94E0, .1], [.25, 0xFFC4B0, 0xFFD0B0, .5], [.32, 0xBDE8FF, 0xFFF4E0, .9],
    [.5, 0xA8E0FF, 0xFFFFFF, 1], [.68, 0xC2E6FF, 0xFFF0D6, .85], [.75, 0xFFB3A0, 0xFFB38A, .5], [.8, 0x4A4E90, 0x9FA5E8, .1], [1, 0x2B2F5E, 0x7A86D8, .08]
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
    const ang = (t - .25) * Math.PI * 2, sunH = Math.sin(ang);
    sun.position.set(px + Math.cos(ang) * 40, Math.max(sunH, .15) * 40, pz - 18);
    sun.target.position.set(px, 0, pz);
    sun.color.copy(sunCol); sun.intensity = .15 + sunI * .58;
    hemi.intensity = .35 + sunI * .2;
    hemi.color.set(sunI < .2 ? 0x9CA4F0 : 0xFFFFFF);
    const night = isNight(t);

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
      tagV.set(s.x, Math.max(heightAt(s.x, s.z), -.75) + 2.3, s.z).project(camera);
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

    if (PIXEL) {
      renderer.setRenderTarget(pixelRT); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(pixelPost.scene, pixelPost.cam);
    } else renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  boot();
  tick();
})();
