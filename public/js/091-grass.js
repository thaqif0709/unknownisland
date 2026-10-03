  // ================= Grass (flag grass2) =================
  // Five grasses grown from the tree studies' own parts (102-tree-studies.js), in the same
  // inked toon look: crown tufts (a lumpy crown in miniature bristling with blade cards), blade
  // fans (upright leaf cards with drawn midribs), meadow stalks (twig-thin stalks with seed
  // heads over wispy cards), fern tufts (little fronds round a blob of moss) and moss & clover
  // (low cushions with clover cards and needle sprigs). Each biome grows its own mix, and how
  // thick it grows wanders in patches across the land (bare clearings to dense stands), with
  // each chunk a little thicker or thinner than the next. Built only in the chunks around you
  // (GRASS_VIEW), one geometry per kind of clump drawn as instances that sway in the wind. The
  // blobs and stalks are inked like the trees; the cards' cut-out shape is their outline
  // (noInk). Replaces the old cone tufts in 090-flowers-and-little-plants.js.
  const GRASS = (() => {
    const GRASS_VIEW = 1;   // chunks around yours that have grass (CH m each)
    const wind = { time: { value: 0 } };
    // a toon material whose tips sway (height squared), each clump on its own phase
    function swaying(opts, sway) {
      const m = soft(0xffffff, opts);
      m.onBeforeCompile = sh => {
        sh.uniforms.uTime = wind.time;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float gh = max(transformed.y, 0.0);
          vec3 gp = vec3(0.0);
          #ifdef USE_INSTANCING
            gp = instanceMatrix[3].xyz;
          #endif
          float gust = sin(uTime * 1.3 + gp.x * .23 + gp.z * .17) * .6 + sin(uTime * 2.9 + gp.x * .8 - gp.z * .5) * .25;
          transformed.x += gust * ${sway.toFixed(3)} * gh * gh;
          transformed.z += gust * ${(sway * .45).toFixed(3)} * gh * gh;`);
      };
      m.customProgramCacheKey = () => 'grass-sway-' + sway;
      return m;
    }
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), C = c => new THREE.Color(c);
    const pick = (r, a) => a[Math.floor(r() * a.length)];

    // ---------- the leaf textures, drawn like the tree studies' (white shapes tinted per card, dark veins) ----------
    function canvasTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'), mulberry32(4242)); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }
    const TEX = {
      blade: canvasTex((g, r) => {   // a fan of grass blades, each with its midrib
        g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.35)';
        for (let i = 0; i < 7; i++) {
          const x0 = 40 + i * 8, lean = (i - 3) * 9 + (r() - .5) * 8, h = 80 + r() * 40, w = 6 + r() * 3;
          g.beginPath(); g.moveTo(x0 - w, 128); g.quadraticCurveTo(x0 - w * .6 + lean * .4, 128 - h * .55, x0 + lean, 128 - h); g.quadraticCurveTo(x0 + w * .6 + lean * .4, 128 - h * .55, x0 + w, 128); g.closePath(); g.fill();
          g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0, 128); g.quadraticCurveTo(x0 + lean * .4, 128 - h * .55, x0 + lean, 128 - h + 6); g.stroke();
        }
      }),
      wisp: canvasTex((g, r) => {   // long thin blades
        g.strokeStyle = '#fff'; g.lineCap = 'round';
        for (let i = 0; i < 16; i++) { const x0 = 30 + r() * 68, lean = (r() - .5) * 50, h = 90 + r() * 36; g.lineWidth = 2.5 + r() * 2; g.beginPath(); g.moveTo(x0, 128); g.quadraticCurveTo(x0 + lean * .3, 128 - h * .6, x0 + lean, 128 - h); g.stroke(); }
      }),
      needle: canvasTex(g => {   // the pine's needle card
        g.strokeStyle = '#fff'; g.lineCap = 'round';
        for (let i = 0; i < 34; i++) { const a = -1.25 + i / 33 * 2.5, l = 46 + Math.sin(i * 7.1) * 10; g.lineWidth = 2.2; g.beginPath(); g.moveTo(64, 118); g.lineTo(64 + Math.sin(a) * l, 118 - Math.cos(a) * l); g.stroke(); }
        g.lineWidth = 4; g.beginPath(); g.moveTo(64, 124); g.lineTo(64, 60); g.stroke();
      }),
      clover: canvasTex(g => {   // three round leaflets with veins
        g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.35)';
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - Math.PI / 2, x = 64 + Math.cos(a) * 26, y = 64 + Math.sin(a) * 26; g.beginPath(); g.arc(x, y, 27, 0, 7); g.fill(); g.lineWidth = 1.5; g.beginPath(); g.moveTo(64, 64); g.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.stroke(); }
      }),
    };
    const cardMat = (tex, sway) => swaying({ map: tex, alphaTest: .45, side: THREE.DoubleSide, vertexColors: true }, sway);

    // ---------- building blocks (the studies', lighter) ----------
    // a lumpy blob coloured from its underside to its top
    function blob(r, rx, ry, rz, top, bot, { detail = 1, lumps = 1, at = V(), flat = 0 } = {}) {
      const g = new THREE.IcosahedronGeometry(1, detail), a = g.attributes.position, v = V(), cols = [], s = r() * 9, ct = C(top), cb = C(bot), c = new THREE.Color();
      for (let i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i);
        const n = 1 + lumps * (.09 * Math.sin(v.x * 5 + s) + .07 * Math.sin(v.y * 9 + s * 2) + .05 * Math.cos(v.z * 13 - s) + .04 * Math.sin((v.x + v.z) * 17 + s));
        const k = THREE.MathUtils.clamp((v.y + 1) / 2 + .15 * Math.sin(v.x * 11 + s), 0, 1);
        c.copy(cb).lerp(ct, k * k); c.offsetHSL(0, 0, Math.sin(v.z * 23 + s) * .03); cols.push(c.r, c.g, c.b);
        a.setXYZ(i, v.x * rx * n + at.x, Math.max(v.y, -flat) * ry * n + at.y, v.z * rz * n + at.z);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
      return g.index ? g.toNonIndexed() : g;
    }
    // leaf cards as one geometry: each faces out along n (upright ones stand on their root), spun and tilted, a shade darker
    function cards(r, list) {
      const d = new THREE.Object3D(), corners = [[-.5, 0], [.5, 0], [.5, 1], [-.5, 0], [.5, 1], [-.5, 1]], uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]], v = V(), pos = [], uv = [], col = [], nrm = [];
      for (const l of list) {
        d.position.copy(l.p); d.rotation.set(0, 0, 0);
        if (l.upright) { d.rotation.set(0, Math.atan2(l.n.x, l.n.z), 0); d.rotateX(-(l.lean || 0)); }
        else { d.lookAt(l.p.clone().add(l.n)); d.rotateZ(r() * 6.28); d.rotateX((r() - .5) * 2 * (l.tilt ?? .7)); }
        d.scale.set(l.w ?? l.s, l.s, l.s); d.updateMatrix();
        const c = C(l.col).offsetHSL((r() - .5) * .03, 0, (r() - .5) * .08).multiplyScalar(.82), nz = V(0, 0, 1).transformDirection(d.matrix);
        corners.forEach(([x, y], k) => { v.set(x, l.upright ? y : y - .5, 0).applyMatrix4(d.matrix); pos.push(v.x, v.y, v.z); uv.push(...uvs[k]); col.push(c.r, c.g, c.b); nrm.push(nz.x, nz.y, nz.z); });
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    }
    // a thin tapered stalk along a curve, coloured root to tip (faces outward)
    function stalk(pts, r0, r1, colRoot, colTip, radial = 3, segs = 4) {
      const curve = new THREE.CatmullRomCurve3(pts), fr = curve.computeFrenetFrames(segs, false), pos = [], col = [], idx = [], P = V(), cr = C(colRoot), ct = C(colTip), c = new THREE.Color();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, rr = r0 + (r1 - r0) * t, N = fr.normals[i], B = fr.binormals[i]; curve.getPointAt(t, P); c.copy(cr).lerp(ct, t);
        for (let j = 0; j <= radial; j++) { const a = j / radial * Math.PI * 2; pos.push(P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * rr, P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * rr, P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * rr); col.push(c.r, c.g, c.b); }
      }
      for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      const g = new THREE.BufferGeometry(); g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      return { geo: g.toNonIndexed(), curve };
    }
    // a little frond: a rib with paired leaflets, base colour to tip colour
    function frond(base, dir, L, e, cA, cB, n = 8, wid = .075) {
      const pts = []; for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(base.clone().addScaledVector(dir, t * L * Math.cos(e)).add(V(0, t * L * Math.sin(e) - t * t * L * .45, 0))); }
      const rib = stalk(pts, .012, .004, cA, cB, 3, 4), pos = [], col = [], up = V(0, 1, 0), a = C(cA), b = C(cB);
      for (let i = 0; i < n; i++) {
        const t = .1 + i / (n - 1) * .88, p = rib.curve.getPointAt(t), tan = rib.curve.getTangentAt(t), side = V().crossVectors(tan, up).normalize(), w = wid * Math.sin(Math.PI * Math.min(1, t * 1.05)) + wid * .25;
        for (const sd of [-1, 1]) {
          const tip = p.clone().addScaledVector(side, sd * w).addScaledVector(tan, w * .5).add(V(0, -w * .3, 0)), b1 = p.clone().addScaledVector(tan, -.02), b2 = p.clone().addScaledVector(tan, .02);
          for (const q of [b1, b2, tip]) pos.push(q.x, q.y, q.z);
          const c = a.clone().lerp(b, t); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      return [rib.geo, g];
    }
    function merge(geos) {   // non-indexed coloured geometries into one
      let n = 0; geos.forEach(g => { n += g.attributes.position.count; });
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3); let off = 0;
      for (const g of geos) { pos.set(g.attributes.position.array, off * 3); nrm.set(g.attributes.normal.array, off * 3); col.set(g.attributes.color.array, off * 3); off += g.attributes.position.count; g.dispose(); }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return out;
    }
    const GREENS = ['#6f8d48', '#7f9a50', '#5d7a3c', '#8aa058'];   // the oak's leaf greens

    // ---------- the five clumps: [{ geo, mat, ink }] each, grown once ----------
    const KINDS = {
      crowns: { n: 70, build(r) {
        const mound = merge([blob(r, .24, .16, .22, '#7d9a52', '#25361d', { at: V(0, .1, 0), flat: .4, lumps: 1.3 }), blob(r, .15, .12, .15, '#8aa058', '#2f4422', { detail: 0, at: V(.14, .14, -.06), flat: .4 })]);
        const list = []; for (let i = 0; i < 11; i++) { const u = V(r() * 2 - 1, r() * .9 + .5, r() * 2 - 1).normalize(); list.push({ p: V(u.x * .2, .12 + u.y * .12, u.z * .2), n: u, s: .26 + r() * .16, col: pick(r, GREENS), upright: true, lean: .25 + r() * .35 }); }
        return [{ geo: mound, mat: swaying({ vertexColors: true }, .2), ink: true }, { geo: cards(r, list), mat: cardMat(TEX.blade, .55) }];
      } },
      fans: { n: 130, build(r) {
        const list = []; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + r() * .5; list.push({ p: V(Math.cos(a) * .04, 0, Math.sin(a) * .04), n: V(Math.cos(a), 0, Math.sin(a)), s: .38 + r() * .22, w: .3 + r() * .1, col: pick(r, GREENS), upright: true, lean: .15 + r() * .3 }); }
        return [{ geo: cards(r, list), mat: cardMat(TEX.blade, .6) }];
      } },
      meadow: { n: 55, build(r) {
        const parts = [];
        for (let i = 0; i < 3; i++) {
          const a = r() * 6.28, lean = .12 + r() * .18, h = .8 + r() * .45, dx = Math.cos(a), dz = Math.sin(a);
          parts.push(stalk([V(), V(dx * lean * .2, h * .45, dz * lean * .2), V(dx * lean * .6, h * .8, dz * lean * .6), V(dx * lean, h, dz * lean)], .014, .006, '#5f6e3c', '#a49a5e').geo);
          parts.push(blob(r, .035, .09, .035, '#e3d7a0', '#8d7c45', { detail: 0, lumps: 1.4, at: V(dx * lean, h + .06, dz * lean) }));
        }
        const list = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + r() * .4; list.push({ p: V(Math.cos(a) * .05, 0, Math.sin(a) * .05), n: V(Math.cos(a), 0, Math.sin(a)), s: .42 + r() * .25, w: .32, col: pick(r, ['#7f9a50', '#8aa058', '#a3ad62', '#6f8d48']), upright: true, lean: .2 + r() * .3 }); }
        return [{ geo: merge(parts), mat: swaying({ vertexColors: true }, .3), ink: true }, { geo: cards(r, list), mat: cardMat(TEX.wisp, .45) }];
      } },
      ferns: { n: 45, build(r) {
        const geos = [blob(r, .1, .06, .1, '#5f7d3a', '#22311b', { detail: 0, at: V(0, .03, 0), flat: .3 })];
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + r() * .4; geos.push(...frond(V(0, .04, 0), V(Math.cos(a), 0, Math.sin(a)), .38 + r() * .16, .75 + r() * .3, '#3f5a2c', '#9bb064')); }
        return [{ geo: merge(geos), mat: swaying({ vertexColors: true, side: THREE.DoubleSide }, .35), ink: true }];
      } },
      carpet: { n: 60, build(r) {
        const cush = merge([blob(r, .26, .07, .22, '#93a85e', '#3f5a2c', { lumps: 1.5, at: V(0, .02, 0), flat: .2 }), blob(r, .14, .05, .16, '#a3b26a', '#44602e', { detail: 0, lumps: 1.5, at: V(.2, .02, .1), flat: .2 })]);
        const list = []; for (let i = 0; i < 7; i++) { const a = r() * 6.28, rr = .1 + r() * .25; list.push({ p: V(Math.cos(a) * rr, .07 + r() * .03, Math.sin(a) * rr), n: V((r() - .5) * .4, 1, (r() - .5) * .4).normalize(), s: .1 + r() * .05, col: pick(r, ['#5d7a3c', '#6f8d48', '#4f6d33']), tilt: .35 }); }
        const sprigs = []; for (let i = 0; i < 2; i++) { const a = r() * 6.28; sprigs.push({ p: V(Math.cos(a) * .18, .04, Math.sin(a) * .18), n: V(Math.cos(a), 0, Math.sin(a)), s: .16, col: pick(r, ['#3a5948', '#2f4b3d']), upright: true, lean: .2 }); }
        return [{ geo: cush, mat: swaying({ vertexColors: true }, .05), ink: true }, { geo: cards(r, list), mat: cardMat(TEX.clover, .15) }, { geo: cards(r, sprigs), mat: cardMat(TEX.needle, .3) }];
      } },
    };
    // which grow where, and how much (a share of each kind's n per chunk)
    const MIX = {
      meadow: { crowns: .7, fans: 1, meadow: .6 },
      forest: { ferns: 1, carpet: .8, crowns: .4 },
      highland: { fans: .8, meadow: .5, carpet: .3 },
      spring: { carpet: 1, ferns: .6, fans: .5 },
      beach: { fans: .12 },
    };
    const grown = {};
    const clump = k => grown[k] || (grown[k] = KINDS[k].build(mulberry32(0x9e37 + Object.keys(KINDS).indexOf(k) * 7919)));
    // how thick it grows here: patches that wander from bare to dense
    const thickness = (x, z) => THREE.MathUtils.smoothstep(fbm(x * .035 + 17, z * .035 - 9), .32, .68);

    // ---------- one chunk's grass ----------
    const dummy = new THREE.Object3D();
    function build(cx, cz) {
      const out = [], r = mulberry32((cx * 73129) ^ (cz * 95111) ^ 0x6a55);
      const chunkMul = .6 + r() * .8;   // each chunk a little thicker or thinner than the next
      for (const k of Object.keys(KINDS)) {
        const spots = [], want = Math.round(KINDS[k].n * chunkMul);
        for (let i = 0; i < want * 2.2 && spots.length < want; i++) {
          const x = cx * CH + r() * CH, z = cz * CH + r() * CH, h = heightAt(x, z), share = (MIX[WG.biomeAt(x, z, h)] || {})[k] || 0;
          if (!share || r() > share * thickness(x, z) * 1.25) continue;
          if (k !== 'fans' && h < .95) continue;   // (only the odd fan on the sand)
          const sn = WG.nearestSpring(x, z);
          if (Math.hypot(x - sn.x, z - sn.z) < 2.9 || (caveList.length && Caves.groundCut(caveList, x, z, h))) continue;
          if (h > RULES.TEETH.SNOW_LINE - 20 && WG.feature('region-teeth') && WG.regionAt(x, z) === 'teeth') continue;   // nothing grows in the Teeth's snow
          spots.push([x, groundAt(x, z) - .02, z, .75 + r() * .6, r() * 6.28]);
        }
        if (!spots.length) continue;
        for (const part of clump(k)) {
          const im = new THREE.InstancedMesh(part.geo, part.mat, spots.length);
          spots.forEach(([x, y, z, s, rot], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
          im.receiveShadow = true; im.frustumCulled = false;   // (the instances spread over the chunk; the template's own bounds are tiny)
          scene.add(im); if (!part.ink) noInk.add(im); out.push(im);
        }
      }
      return out;
    }
    function drop(list) { for (const im of list) { scene.remove(im); noInk.delete(im); im.dispose(); } }

    // ---------- the chunks around you have grass ----------
    const live = new Map();   // chunk key -> meshes
    let check = 0;
    UI.net.on('welcome', () => { for (const l of live.values()) drop(l); live.clear(); });   // (the ground may have changed: the big world)
    UI.onFrame(dt => {
      wind.time.value += dt;
      if (!WG.feature('grass2')) { if (live.size) { for (const l of live.values()) drop(l); live.clear(); } return; }
      if ((check -= dt) > 0) return;
      check = .4;
      const ccx = Math.floor(px / CH), ccz = Math.floor(pz / CH), want = new Set();
      for (let i = -GRASS_VIEW; i <= GRASS_VIEW; i++) for (let j = -GRASS_VIEW; j <= GRASS_VIEW; j++) want.add((ccx + i) + ',' + (ccz + j));
      for (const [key, l] of live) if (!want.has(key)) { drop(l); live.delete(key); }
      for (const key of want) if (!live.has(key)) { const [x, z] = key.split(',').map(Number); live.set(key, build(x, z)); break; }   // (one chunk a beat, so it never stalls a frame)
    });
    return { live, build, KINDS, MIX };
  })();
  UI.grass = GRASS;
