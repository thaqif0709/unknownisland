  // ================= Tree studies (flag `trees3`) =================
  // The island's trees as in the "Unknown Island Trees" studies, shape for shape: the same code
  // grows them (tapered limbs with bark ridges and flared roots, lumpy crowns, leaf cards,
  // ivy, bracket fungus, the pine's boulder and snow, the palm's rings and fronds, the cypress's
  // knees and moss, the giant's buttresses and weeping strands), drawn in the game's own inked,
  // flat-shaded style. Only the ground dressing around them in the studies (rocks, reeds, water)
  // is left to the land itself.
  //
  // Each kind is grown as a few variants (variant 0 is exactly the study's tree), each at three
  // levels of detail grown from the same seed, so the shape never changes with distance: full
  // close by, fewer segments and leaf cards further off, the bare form far away. Variants are
  // built once, on first use, and shared by every tree of that kind (one mesh per material).
  // 100-plants-and-rocks.js asks UI.treeStudies.make(o, rng) while the flag is on.
  const TS = (() => {
    // full detail within the first distance, lighter within the second, the bare form within the third; beyond, a picture of it.
    // At Low graphics (and Auto on phones and tablets: 310-resize.js) never the full detail, and the lighter levels only nearer.
    const LOD_FULL = [10, 24, 40], LOD_LOW = [0, 8, 22];
    const lodDist = () => lowGfx ? LOD_LOW : LOD_FULL;
    const VARIANTS = 4;
    // ---------- seeded randomness (as in the studies) ----------
    let seed = 1;
    const rng = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + rng() * (b - a);
    const RI = (a, b) => Math.floor(R(a, b + 1));
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const C = c => new THREE.Color(c);

    // ---------- textures (the studies' own) ----------
    function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
    function tex(c) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
    function barkCanvas(base, dark, light, style, s = 7) {
      let q = s; const r = () => { q = q * 16807 % 2147483647; return q / 2147483647; };
      return canvas(256, 512, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        if (style === 'plate') {
          for (let i = 0; i < 170; i++) {
            const x = r() * w, y = r() * h, pw = 18 + r() * 36, ph = 26 + r() * 60;
            g.fillStyle = r() < .5 ? light : base; g.globalAlpha = .55;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + pw, y + r() * 8); g.lineTo(x + pw - r() * 6, y + ph); g.lineTo(x - r() * 6, y + ph - r() * 8); g.closePath(); g.fill();
            g.globalAlpha = .8; g.strokeStyle = dark; g.lineWidth = 2 + r() * 2; g.stroke();
          }
        } else {
          const n = style === 'fiber' ? 110 : 52, wob = style === 'fiber' ? 3 : 10;
          for (let i = 0; i < n; i++) {
            let x = r() * w; g.strokeStyle = dark; g.globalAlpha = .35 + r() * .45;
            g.lineWidth = style === 'fiber' ? .8 + r() * 1.6 : 2.5 + r() * 6;
            g.beginPath(); g.moveTo(x, 0);
            for (let y = 0; y <= h; y += 14) { x += (r() - .5) * wob; g.lineTo(x, y); }
            g.stroke();
            if (r() < .5) { g.strokeStyle = light; g.globalAlpha = .18; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 4, 0); g.lineTo(x + 2, h); g.stroke(); }
          }
        }
        g.globalAlpha = .25;
        for (let i = 0; i < 900; i++) { g.fillStyle = r() < .5 ? dark : light; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3); }
        g.globalAlpha = 1;
      });
    }
    function leafCanvas(kind) {
      let q = 4242; const r = () => { q = q * 16807 % 2147483647; return q / 2147483647; };
      return canvas(128, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.35)';
        if (kind === 'oak') {
          for (let i = 0; i < 5; i++) { const y = 26 + i * 18, rr2 = 15 - Math.abs(i - 2) * 2; for (const s of [-1, 1]) { g.beginPath(); g.arc(64 + s * 13, y, rr2, 0, 7); g.fill(); } }
          g.beginPath(); g.ellipse(64, 62, 14, 50, 0, 0, 7); g.fill();
          g.lineWidth = 2; g.beginPath(); g.moveTo(64, 120); g.lineTo(64, 14); g.stroke();
          g.lineWidth = 1; for (let i = 0; i < 5; i++) { const y = 30 + i * 18; g.beginPath(); g.moveTo(64, y + 6); g.lineTo(42, y - 4); g.moveTo(64, y + 6); g.lineTo(86, y - 4); g.stroke(); }
        } else if (kind === 'needle') {
          g.strokeStyle = '#fff'; g.lineCap = 'round';
          for (let i = 0; i < 34; i++) { const a = -1.25 + i / 33 * 2.5, l = 46 + Math.sin(i * 7.1) * 10; g.lineWidth = 2.2; g.beginPath(); g.moveTo(64, 118); g.lineTo(64 + Math.sin(a) * l, 118 - Math.cos(a) * l); g.stroke(); }
          g.lineWidth = 4; g.beginPath(); g.moveTo(64, 124); g.lineTo(64, 60); g.stroke();
        } else if (kind === 'willow') {
          g.beginPath(); g.ellipse(64, 64, 9, 58, 0, 0, 7); g.fill(); g.lineWidth = 1.5; g.beginPath(); g.moveTo(64, 122); g.lineTo(64, 8); g.stroke();
        } else if (kind === 'moss') {
          g.strokeStyle = '#fff'; g.lineWidth = 1.6;
          for (let i = 0; i < 40; i++) { let x = 20 + r() * 88; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y < 30 + r() * 98; y += 8) { x += (r() - .5) * 8; g.lineTo(x, y); } g.stroke(); }
        }
      });
    }
    const T = {
      oak: tex(barkCanvas('#5a4d40', '#241c16', '#8a7c68', 'furrow', 11)),
      pine: tex(barkCanvas('#7a4a34', '#2a1810', '#b07a5a', 'plate', 23)),
      giant: tex(barkCanvas('#5d5f52', '#23251f', '#8f9a7a', 'fiber', 37)),
      cypress: tex(barkCanvas('#7d7262', '#3a322a', '#a89c86', 'fiber', 41)),
      palm: tex(barkCanvas('#8a7556', '#4a3b28', '#b8a27c', 'fiber', 61)),
      leaf: { oak: tex(leafCanvas('oak')), needle: tex(leafCanvas('needle')), willow: tex(leafCanvas('willow')), moss: tex(leafCanvas('moss')) },
    };

    // ---------- materials: the game's flat shading, made once and shared ----------
    const leafyOn = m => { m.userData.leafy = true; return m; };   // (leaves are solid: 380-jumping.js)
    const MAT = {
      bark: { oak: soft(0xffffff, { map: T.oak }), pine: soft(0xffffff, { map: T.pine }), giant: soft(0xffffff, { map: T.giant }),
        cypress: soft(0xffffff, { map: T.cypress }), palm: soft(0xffffff, { map: T.palm }) },
      crown: leafyOn(soft(0xffffff, { vertexColors: true })),   // leaf clumps: the leaves you bump into
      lump: soft(0xffffff, { vertexColors: true }),               // other blobs: rock, snow, hollows, resin
      fronds: leafyOn(soft(0xffffff, { vertexColors: true, side: THREE.DoubleSide })),
      fronds2: soft(0xffffff, { vertexColors: true, side: THREE.DoubleSide }),   // ferns and dead fronds (not solid)
      ivyStem: soft(0x4a4030), fungus: soft(0xd2bf94), snow: soft(0xeef2f4), ice: soft(0xa9c6d0, { transparent: true, opacity: .8 }),
      vine: soft(0x4f6d36), amber: soft(0xe8a03a, { emissive: 0xb86a12, emissiveIntensity: .7 }), bug: soft(0xffd27a, { emissive: 0xffa24a, emissiveIntensity: 1.6 }),
      moss: soft(0xa7ad94), rib: soft(0x6a7a3a), deadRib: soft(0x8a7350), nut: soft(0xffffff, { vertexColors: true }),
    };
    const cardMats = {};   // per texture, solid (crown) or not (ivy, litter, strands, moss)
    function cardMat(kind, solid) {
      const k = kind + (solid ? ':s' : '');
      if (!cardMats[k]) {
        const m = soft(0xffffff, { map: T.leaf[kind], alphaTest: .45, side: THREE.DoubleSide, vertexColors: true });
        if (solid) m.userData.leafy = true;
        m.userData.cards = true;
        cardMats[k] = m;
      }
      return cardMats[k];
    }
    const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });   // drawn only into the shadow map
    const cardDepth = {};   // so leaf cards cast leaf-shaped shadows
    function cardDepthMat(kind) {
      return cardDepth[kind] || (cardDepth[kind] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.leaf[kind], alphaTest: .45 }));
    }

    // ---------- building blocks (the studies', with a level of detail Q) ----------
    let G = null, leafSets = {}, Q = null;
    const add = m => { G.add(m); return m; };
    function tube(pts, r0, r1, o = {}) {
      const curve = new THREE.CatmullRomCurve3(pts), len = curve.getLength();
      const segs0 = o.segs || Math.max(6, Math.round(len * (o.density || 5)));
      const segs = Math.max(2, Math.round(segs0 * Q.seg)), rad = Math.max(3, Math.round((o.radial || 10) * Q.rad)), ph = R(0, 6);
      if (Q.minR && Math.max(r0, r1) < Q.minR) return { curve, r0, r1, o, len, radiusAt: () => r0 };   // (far off, the twigs don't show)
      const fr = curve.computeFrenetFrames(segs, false), pos = [], uv = [], idx = [], P = V();
      const radiusAt = (t, a) => {
        let r = o.bottle ? r1 + (r0 - r1) * Math.pow(1 - t, o.bottle) : r0 + (r1 - r0) * Math.pow(t, o.pow || 1);
        if (o.rings) r *= 1 + .1 * Math.pow(1 - Math.abs(Math.sin(t * Math.PI * o.rings)), 10);
        const fl = o.flare ? o.flare * Math.exp(-t * len * (o.flareK || 2.5)) : 0;
        let k = 1 + (o.bark ?? .07) * Math.sin(a * (o.ridges || 7) + t * 4 + ph) + .035 * Math.sin(a * 3 + t * 13 + ph);
        if (fl) k *= 1 + fl * (.35 + .9 * Math.max(0, Math.sin(a * (o.roots || 5) + ph)) ** 2);
        return r * k;
      };
      for (let i = 0; i <= segs; i++) {
        const t = i / segs; curve.getPointAt(t, P);
        const N = fr.normals[i], B = fr.binormals[i];
        for (let j = 0; j <= rad; j++) {
          const a = j / rad * Math.PI * 2, r = radiusAt(t, a), c = Math.cos(a) * r, s = Math.sin(a) * r;
          pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s);
          uv.push(j / rad * (o.uRep || 2), t * len * (o.vRep || .45));
        }
      }
      for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // (wound so the faces point outward)
      const g = new THREE.BufferGeometry();
      g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      add(new THREE.Mesh(g, o.mat));
      return { curve, r0, r1, o, len, radiusAt };
    }
    function onBark(tb, t, a, lift = .02) {
      const p = tb.curve.getPointAt(t), out = V(Math.cos(a), 0, Math.sin(a));
      return { p: p.addScaledVector(out, tb.radiusAt(t, a) + lift), out };
    }
    function blob(rx, ry, rz, top, bot, o = {}) {
      const g = new THREE.IcosahedronGeometry(1, Math.max(0, (o.detail ?? 3) + Q.det)), a = g.attributes.position, v = V(), cols = [];
      const s = R(0, 9), ct = C(top), cb = C(bot), c = new THREE.Color(), lumps = o.lumps ?? 1;
      for (let i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i);
        const n = 1 + lumps * (.09 * Math.sin(v.x * 5 + s) + .07 * Math.sin(v.y * 9 + s * 2) + .05 * Math.cos(v.z * 13 - s) + .04 * Math.sin((v.x + v.z) * 17 + s));
        const k = THREE.MathUtils.clamp((v.y + 1) / 2 + .15 * Math.sin(v.x * 11 + s), 0, 1);
        c.copy(cb).lerp(ct, k * k); c.offsetHSL(0, 0, (Math.sin(v.z * 23 + s) * .03));
        cols.push(c.r, c.g, c.b);
        a.setXYZ(i, v.x * rx * n, v.y * ry * n, v.z * rz * n);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
      return add(new THREE.Mesh(g, o.mat || MAT.crown));
    }
    function leaf(kind, p, n, s, col, tilt = .7, solid = true) { const k = kind + (solid ? ':s' : ''); (leafSets[k] = leafSets[k] || { kind, solid, list: [] }).list.push({ p, n, s, col: C(col), tilt }); }
    function leafCloud(kind, c, rx, ry, rz, count, s, cols, up = .35) {
      for (let i = 0; i < count; i++) {
        const u = V(R(-1, 1), R(-1, 1) + up, R(-1, 1)).normalize(), k = R(.85, 1.08);
        leaf(kind, V(c.x + u.x * rx * k, c.y + u.y * ry * k, c.z + u.z * rz * k), u, s * R(.7, 1.2), cols[RI(0, cols.length - 1)]);
      }
    }
    // the cards as one geometry per texture (a lighter level keeps every Q.leaf-th, a little bigger)
    function flushLeaves() {
      const d = new THREE.Object3D(), corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, -.5], [.5, .5], [-.5, .5]], uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]], v = V();
      for (const set of Object.values(leafSets)) {
        const pos = [], uv = [], col = [], nrm = [];
        set.list.forEach((l, i) => {
          d.position.copy(l.p); d.lookAt(l.p.clone().add(l.n)); d.rotateZ(R(0, 6.28)); d.rotateX(R(-l.tilt, l.tilt));
          const c = l.col.offsetHSL(R(-.015, .015), 0, R(-.04, .04)).multiplyScalar(.82);   // (a shade darker: flat-lit cards sit in the shaded crown)
          if (!Q.leaf || i % Q.leaf) return;
          d.scale.setScalar(l.s * Math.sqrt(Q.leaf)); d.updateMatrix();
          const nz = V(0, 0, 1).transformDirection(d.matrix);
          corners.forEach(([x, y], k) => { v.set(x, y, 0).applyMatrix4(d.matrix); pos.push(v.x, v.y, v.z); uv.push(...uvs[k]); col.push(c.r, c.g, c.b); nrm.push(nz.x, nz.y, nz.z); });
        });
        if (!pos.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const m = new THREE.Mesh(g, cardMat(set.kind, set.solid)); m.userData.cardKind = set.kind; G.add(m);
      }
      leafSets = {};
    }
    function grow(start, dir, len, r0, depth, P, tips, opts = {}) {
      const n = P.pts, pts = [start.clone()], d = dir.clone().normalize(); let p = start.clone();
      for (let i = 1; i <= n; i++) {
        d.x += R(-1, 1) * P.wander; d.y += R(-1, 1) * P.wander * .5 + P.gravity(depth, i / n); d.z += R(-1, 1) * P.wander; d.normalize();
        p = p.clone().addScaledVector(d, len / n); pts.push(p);
      }
      const r1 = Math.max(P.minR || .012, r0 * P.taper);
      const tb = tube(pts, r0, r1, Object.assign({ mat: P.bark, radial: depth === 0 ? 14 : depth < 2 ? 9 : 6, bark: depth === 0 ? .08 : .05 }, opts));
      if (depth >= P.depth) { tips.push({ p: pts[n], d: d.clone(), r: r1, depth, tb }); return tb; }
      const kids = P.kids(depth);
      for (let k = 0; k < kids; k++) {
        const lead = P.leader && k === kids - 1, t = lead ? 1 : R(P.from(depth), .96);
        const q = tb.curve.getPointAt(t), tan = tb.curve.getTangentAt(t);
        const perp = Math.abs(tan.y) > .9 ? V(1, 0, 0) : V(0, 1, 0);
        perp.cross(tan).normalize().applyAxisAngle(tan, k * 2.39996 + R(0, .7));
        const cd = tan.clone().applyAxisAngle(perp, lead ? R(.05, .25) : P.spread(depth) * R(.8, 1.2));
        grow(q, cd, len * P.lenK * R(.8, 1.1), (r0 + (r1 - r0) * t) * P.childR * R(.85, 1.05), depth + 1, P, tips);
      }
      return tb;
    }
    function frond(base, dir, L, e, o = {}) {
      const pts = [];
      for (let i = 0; i <= 7; i++) { const s = i / 7; pts.push(base.clone().addScaledVector(dir, s * L * Math.cos(e)).add(V(0, s * L * Math.sin(e) - s * s * L * (o.droop ?? .55), 0))); }
      const tb = tube(pts, o.r ?? .06, (o.r ?? .06) * .25, { mat: o.ribMat, radial: 5, bark: 0, density: 6 });
      const pos = [], col = [], up = V(0, 1, 0), cA = C(o.base), cB = C(o.tip);
      const n = o.n ?? 34, wid = o.width ?? .9;
      for (let i = 0; i < n; i++) {
        const t = .06 + i / (n - 1) * .94, p = tb.curve.getPointAt(t), tan = tb.curve.getTangentAt(t);
        const side = V().crossVectors(tan, up).normalize();
        for (const sd of [-1, 1]) {
          const w = (wid * Math.sin(Math.PI * Math.min(1, t * 1.1)) + .12 * wid) * R(.85, 1.1);
          if (i % Q.frond) continue;   // (a lighter level: fewer, the same shape)
          const tip = p.clone().addScaledVector(side, sd * w).addScaledVector(tan, w * .4).add(V(0, -w * (o.fall ?? .4), 0));
          const b1 = p.clone().addScaledVector(tan, -.035 * Q.frond), b2 = p.clone().addScaledVector(tan, .035 * Q.frond);
          const tA = tip.clone().addScaledVector(tan, -.02 * Q.frond), tB = tip.clone().addScaledVector(tan, .02 * Q.frond);
          const mid1 = b1.clone().lerp(tA, .5).add(V(0, .05 * w, 0)), mid2 = b2.clone().lerp(tB, .5).add(V(0, .05 * w, 0));
          for (const q of [b1, b2, mid1, b2, mid2, mid1, mid1, mid2, tA, mid2, tB, tA]) pos.push(q.x, q.y, q.z);
          for (let k = 0; k < 12; k++) { const c = (k < 6 ? cA : cB); col.push(c.r, c.g, c.b); }
        }
      }
      if (pos.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
        add(new THREE.Mesh(g, o.leafMat));
      }
      return tb;
    }

    // ---------- the trees (as in the studies; the ground around them is the land's) ----------
    function oak(o) {
      const bark = MAT.bark.oak, blossom = o.blossom;
      const P = { pts: 5, wander: .22, taper: .5, depth: 4, bark, minR: .016, leader: false,
        gravity: d => d === 0 ? .03 : d === 1 ? 0 : -.05, spread: d => d === 0 ? .85 : .7,
        kids: d => d === 0 ? 4 : d < 3 ? 3 : 2, lenK: .68, childR: .68, from: d => d === 0 ? .55 : .3 };
      const tips = [], trunk = grow(V(0, -.3, 0), V(R(-.08, .08), 1, R(-.08, .08)), 3.4, .62, 0, P, tips, { flare: 1.2, flareK: 2.2, roots: 5 });
      const greens = blossom ? ['#f2b8c8', '#e89cb2', '#f7cbd8', '#e4a6bb'] : ['#6f8d48', '#7f9a50', '#5d7a3c', '#8aa058'];
      for (const t of tips) {
        const s = R(.55, .95), c = t.p.clone().add(V(0, s * .25, 0)), autumn = rng() < .12;
        blob(s, s * .85, s, blossom ? '#efb3c4' : autumn ? '#a9a04a' : '#7d9a52', blossom ? '#8a4f60' : '#25361d').position.copy(c);
        leafCloud('oak', c, s * 1.05, s * .92, s * 1.05, 22, .36, blossom ? greens : autumn ? ['#c0a24a', '#a7843a'] : greens);
      }
      for (let k = 0; k < 7; k++) {   // roots creeping over the ground
        const a = k / 7 * Math.PI * 2 + R(-.2, .2), L = R(2.4, 3.4);
        tube([V(Math.cos(a) * .45, .35, Math.sin(a) * .45), V(Math.cos(a) * 1.2, .14, Math.sin(a) * 1.2), V(Math.cos(a) * 2, .05, Math.sin(a) * 2), V(Math.cos(a) * L, -.12, Math.sin(a) * L)], .22, .03, { mat: bark, radial: 8 });
      }
      const ivy = [], ivyA = R(0, 6);   // ivy winding up the trunk
      for (let i = 0; i <= 44; i++) { const t = .08 + i / 44 * .75, a = ivyA + i * .33, b = onBark(trunk, t, a, .03); ivy.push(b.p); if (i % 2 === 0) leaf('oak', b.p.clone().addScaledVector(b.out, .05), b.out, .16, i % 4 ? '#3f5a2c' : '#4f6d33', .5, false); }
      tube(ivy, .028, .018, { mat: MAT.ivyStem, radial: 5, bark: 0 });
      for (let k = 0; k < 3; k++) {   // bracket fungus, in tiers
        const a = R(0, 6.28), t0 = R(.18, .5);
        for (let j = 0; j < 3; j++) {
          const b = onBark(trunk, t0 + j * .04, a + j * .15, -.02), r = .22 - j * .05;
          const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, .06, 16, 1, false, -Math.PI / 2, Math.PI), MAT.fungus));
          m.position.copy(b.p); m.rotation.y = Math.atan2(b.out.x, b.out.z);
        }
      }
      const hole = onBark(trunk, .4, R(0, 6.28), -.06);   // a hollow knot
      const hm = blob(.2, .3, .1, '#0b0907', '#0b0907', { lumps: .4, mat: MAT.lump }); hm.position.copy(hole.p); hm.rotation.y = Math.atan2(hole.out.x, hole.out.z);
      const lip = blob(.26, .36, .08, '#6a5a48', '#3a2f26', { lumps: .6, mat: MAT.lump }); lip.position.copy(hole.p).addScaledVector(hole.out, -.04); lip.rotation.y = hm.rotation.y;
      for (let i = 0; i < 70; i++) { const a = R(0, 6.28), r = R(.9, 4.5); leaf('oak', V(Math.cos(a) * r, .04, Math.sin(a) * r), V(0, 1, 0), R(.18, .28), blossom ? ['#f2c6d2', '#e3a2b6', '#a5843f'][RI(0, 2)] : ['#8a6a35', '#a5843f', '#6c5631'][RI(0, 2)], .3, false); }   // leaf litter
      flushLeaves();
    }
    function pine(o) {
      const bark = MAT.bark.pine, snow = MAT.snow, snowy = o.snowy;
      const H = 7.6, pts = [];
      for (let i = 0; i <= 8; i++) { const y = i / 8 * H; pts.push(V(Math.pow(y / H, 1.8) * 1.5 + Math.sin(y * 1.3) * .08, y - .2, Math.sin(y * .9) * .1)); }
      const trunk = tube(pts, .34, .05, { mat: bark, radial: 14, flare: .9, flareK: 2.6, roots: 4, bark: .1 });
      const b = blob(1.3, .85, 1.1, '#8d9391', '#5a5f5e', { mat: MAT.lump, detail: 2, lumps: 1.6 }); b.position.set(-1.35, .3, .25);   // the boulder it grew against
      const cap = blob(1.05, .25, .9, '#ffffff', '#cfd8dd', { mat: MAT.lump, detail: 2 }); cap.position.set(-1.4, 1.02, .25); cap.visible = snowy;
      for (let k = 0; k < 4; k++) { const z = R(-.5, .7); tube([V(-.1, .3, z * .3), V(-.6, .8, z * .6), V(-1.3, 1.05, z), V(-2.1, .7, z * 1.2), V(-2.6, -.1, z * 1.3)], .1, .025, { mat: bark, radial: 6 }); }
      for (let k = 0; k < 4; k++) { const a = R(-1.2, 1.2); tube([V(.1, .3, 0), V(Math.cos(a) * 1, .15, Math.sin(a)), V(Math.cos(a) * 2, -.1, Math.sin(a) * 2)], .12, .03, { mat: bark, radial: 6 }); }
      for (let y = 1.3; y < H - .5; y += R(.42, .55)) {   // whorls of branches, stripped bare on the windward side
        const t = y / H, c = trunk.curve.getPointAt(Math.min(.98, t)), count = RI(5, 6), off = R(0, 6.28);
        for (let k = 0; k < count; k++) {
          const a = off + k / count * Math.PI * 2 + R(-.3, .3);
          let L = (1 - t) * 2.7 + .4; const windward = Math.cos(a) < -.2;
          if (windward) L *= .3;
          const dir = V(Math.cos(a) + .35, -.12 - (1 - t) * .15, Math.sin(a)).normalize(), bp = [];
          for (let i = 0; i <= 4; i++) { const s = i / 4; bp.push(c.clone().addScaledVector(dir, L * s).add(V(0, -.14 * s * s * L + (i === 4 ? .1 : 0), 0))); }
          const br = tube(bp, .075 * (1 - t) + .025, .012, { mat: bark, radial: 6, bark: .04 });
          if (windward && rng() < .6) continue;
          for (const s of [.45, .75, 1]) {
            const q = br.curve.getPointAt(s), ps = (.32 + (1 - t) * .38) * (s === 1 ? .8 : 1);
            blob(ps, ps * .32, ps * .9, '#3e5d4c', '#15231d').position.copy(q);
            leafCloud('needle', q, ps, ps * .3, ps * .9, 6, ps * .9, ['#2f4b3d', '#3a5948', '#29423a'], .6);
            if (rng() < .85) { const sc = blob(ps * .85, ps * .2, ps * .75, '#ffffff', '#d2dbe0', { mat: MAT.lump, detail: 2 }); sc.position.copy(q).add(V(0, ps * .22, 0)); sc.visible = snowy; }
            if (t < .45 && s === 1 && rng() < .55) for (let j = 0; j < 3; j++) { const ic = add(new THREE.Mesh(new THREE.ConeGeometry(.025, R(.18, .45), 6), MAT.ice)); ic.position.copy(q).add(V(R(-.15, .15), -.18, R(-.15, .15))); ic.rotation.x = Math.PI; ic.visible = snowy; }
          }
        }
      }
      const top = trunk.curve.getPointAt(1);
      for (let i = 0; i < 3; i++) { const q = top.clone().add(V(0, -.2 + i * .25, 0)), ps = .3 - i * .07; blob(ps, ps * .5, ps, '#3e5d4c', '#15231d').position.copy(q); const sc = blob(ps * .8, ps * .25, ps * .8, '#ffffff', '#d2dbe0', { mat: MAT.lump, detail: 2 }); sc.position.copy(q).add(V(0, ps * .3, 0)); sc.visible = snowy; }
      flushLeaves();
    }
    function giant() {
      const bark = MAT.bark.giant, vine = MAT.vine;
      const H = 14, pts = [];
      for (let i = 0; i <= 7; i++) { const y = i / 7 * H; pts.push(V(Math.sin(y * .25) * .35, y - .3, Math.cos(y * .2) * .2 - .2)); }
      const trunk = tube(pts, 1.05, .42, { mat: bark, radial: 18, flare: 1.8, flareK: .9, roots: 6, bark: .09, vRep: .3 });
      for (let k = 0; k < 6; k++) {   // buttress roots
        const a = k / 6 * Math.PI * 2 + R(-.2, .2), o = trunk.curve.getPointAt(.12);
        tube([V(o.x + Math.cos(a) * .8, 1.8, o.z + Math.sin(a) * .8), V(Math.cos(a) * 1.7, .9, Math.sin(a) * 1.7), V(Math.cos(a) * 2.7, .15, Math.sin(a) * 2.7), V(Math.cos(a) * R(3.4, 4.2), -.25, Math.sin(a) * R(3.4, 4.2))], .38, .08, { mat: bark, radial: 10, bark: .1 });
      }
      const P = { pts: 6, wander: .1, taper: .45, depth: 2, bark, minR: .025, leader: false,
        gravity: (d, f) => -.07 - d * .06 * f, spread: () => .6, kids: () => 3, lenK: .7, childR: .6, from: () => .35 };
      const tips = [];
      for (let k = 0; k < 7; k++) {
        const t = R(.72, .97), a = k * 2.39996, q = trunk.curve.getPointAt(t);
        grow(q, V(Math.cos(a), R(.3, .65), Math.sin(a)), R(3.8, 5.2), .32, 0, P, tips);
      }
      const willow = ['#8fa64e', '#7a9443', '#a4b45c'];
      for (const tp of tips) {
        const s = R(.9, 1.4); blob(s, s * .6, s, '#4d6a35', '#1b2715').position.copy(tp.p).add(V(0, .15, 0));
        leafCloud('willow', tp.p.clone().add(V(0, .15, 0)), s * 1.05, s * .62, s * 1.05, 18, .42, willow, .5);
        for (let j = 0; j < 7; j++) {   // weeping strands
          const st = tp.p.clone().add(V(R(-.8, .8), -.05, R(-.8, .8))), L = R(2.5, 6.5), sp = [];
          for (let i = 0; i <= 4; i++) sp.push(st.clone().add(V(Math.sin(i * 1.3 + j) * .12, -L * i / 4, Math.cos(i * 1.1 + j) * .12)));
          const sd = tube(sp, .026, .008, { mat: vine, radial: 4, bark: 0, density: 3 });
          for (let i = 1; i <= 8; i++) { const q = sd.curve.getPointAt(i / 8.5), a = R(0, 6.28); leaf('willow', q, V(Math.cos(a), 0, Math.sin(a)), R(.18, .26), willow[RI(0, 2)], .4, false); }
        }
      }
      for (let k = 0; k < 3; k++) {   // the vines you climb by
        const vp = [], a0 = k * 2.1;
        for (let i = 0; i <= 50; i++) { const b = onBark(trunk, .02 + i / 50 * .7, a0 + i * .16, .06); vp.push(b.p); if (i % 3 === 0) leaf('willow', b.p.clone().addScaledVector(b.out, .06), b.out, .2, '#5f8a45', .5, false); }
        tube(vp, .07, .045, { mat: vine, radial: 6, bark: .05, density: 3 });
      }
      for (let i = 0; i < 9; i++) { const b = onBark(trunk, R(.1, .42), R(0, 6.28), -.01); const d = blob(.05, .1, .05, '#f0b04a', '#c9781e', { mat: MAT.amber, detail: 1 }); d.position.copy(b.p); }   // resin
      for (let i = 0; i < 12; i++) { const m = add(new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), MAT.bug)); const b = onBark(trunk, R(.04, .22), R(0, 6.28), .05); m.position.copy(b.p); }   // lantern beetles
      for (let k = 0; k < 14; k++) {   // ferns at its feet
        const a = R(0, 6.28), r = R(2, 6), c = V(Math.cos(a) * r, .05, Math.sin(a) * r);
        for (let f = 0; f < 6; f++) { const fa = f / 6 * 6.28 + R(-.3, .3); frond(c, V(Math.cos(fa), 0, Math.sin(fa)), R(.8, 1.3), R(.4, .8), { r: .015, n: 14, width: .2, droop: .6, base: '#3e5c2c', tip: '#6f8f44', leafMat: MAT.fronds2, ribMat: vine }); }
      }
      flushLeaves();
    }
    function cypress() {
      const bark = MAT.bark.cypress;
      const H = 9, pts = [];
      for (let i = 0; i <= 6; i++) { const y = i / 6 * H; pts.push(V(Math.sin(y * .4) * .2, y - .5, Math.cos(y * .3) * .15)); }
      const trunk = tube(pts, 1.25, .12, { mat: bark, radial: 18, bottle: 3, flare: 1, flareK: 1.6, roots: 7, bark: .1, vRep: .35 });
      for (let k = 0; k < 11; k++) {   // knees
        const a = R(0, 6.28), r = R(1.7, 4.2), h = R(.35, 1.15), x = Math.cos(a) * r, z = Math.sin(a) * r;
        tube([V(x, -.4, z), V(x + R(-.1, .1), h * .55, z + R(-.1, .1)), V(x, h, z)], R(.18, .26), .05, { mat: bark, radial: 8, bark: .12 });
      }
      const P = { pts: 4, wander: .15, taper: .4, depth: 1, bark, minR: .02, leader: false,
        gravity: () => -.02, spread: () => .9, kids: () => 3, lenK: .55, childR: .6, from: () => .4 };
      const tips = [];
      for (let k = 0; k < 10; k++) {
        const t = R(.48, .97), a = k * 2.39996, q = trunk.curve.getPointAt(t);
        grow(q, V(Math.cos(a), R(-.05, .25), Math.sin(a)), (1 - t) * 3 + 1.1, .11, 0, P, tips);
      }
      for (const tp of tips) {
        const s = R(.5, .85); blob(s, s * .4, s * .9, '#6b7a3c', '#28311a').position.copy(tp.p);
        leafCloud('needle', tp.p, s, s * .42, s * .9, 12, s * .8, ['#6d7c3e', '#5b6a33', '#7c8a47'], .5);
        for (let j = 0; j < 4; j++) {   // moss hanging like hair
          const st = tp.p.clone().add(V(R(-.6, .6), -.1, R(-.6, .6))), L = R(.9, 2.6), sp = [];
          for (let i = 0; i <= 5; i++) sp.push(st.clone().add(V(Math.sin(i * 2.1 + j) * .08, -L * i / 5, Math.cos(i * 1.7) * .08)));
          tube(sp, .02, .006, { mat: MAT.moss, radial: 4, bark: 0, density: 4 });
          const a = R(0, 6.28); leaf('moss', st.clone().add(V(0, -L * .45, 0)), V(Math.cos(a), 0, Math.sin(a)), L * .7, '#b3b79e', .2, false);
        }
      }
      flushLeaves();
    }
    function palm() {
      const bark = MAT.bark.palm;
      const H = 8.6, pts = [];
      for (let i = 0; i <= 9; i++) { const s = i / 9, y = s * H; pts.push(V(2.3 * Math.pow(s, 1.7) - .25 * Math.sin(s * Math.PI), y - .25, .3 * Math.sin(s * 2))); }
      const trunk = tube(pts, .34, .21, { mat: bark, radial: 14, rings: 46, segs: 200, flare: .7, flareK: 2.8, roots: 8, bark: .03 });
      const T0 = trunk.curve.getPointAt(1);
      blob(.42, .38, .42, '#7a6545', '#4a3b28', { detail: 3, lumps: 1.4, mat: MAT.lump }).position.copy(T0);   // the fibrous crown
      for (let k = 0; k < 13; k++) {
        const a = k * 2.39996 + R(-.15, .15), dir = V(Math.cos(a), 0, Math.sin(a));
        frond(T0.clone().add(V(0, .1, 0)), dir, R(3.2, 4.3), R(-.05, .6), { base: '#4c6a2c', tip: '#a5b65a', leafMat: MAT.fronds, ribMat: MAT.rib });
      }
      for (let k = 0; k < 3; k++) { const a = R(0, 6.28); frond(T0.clone().add(V(0, -.15, 0)), V(Math.cos(a), 0, Math.sin(a)), R(2.4, 3), -1.05, { base: '#7a6040', tip: '#a8895c', leafMat: MAT.fronds2, ribMat: MAT.deadRib, droop: .2, fall: .8, width: .6 }); }
      for (let i = 0; i < 6; i++) {   // coconuts (apart: picking them takes them away)
        const a = i / 6 * 6.28 + R(-.2, .2), nut = blob(.17, .19, .17, i % 2 ? '#7a8a3a' : '#5e4a2a', '#3a2e1c', { detail: 2, lumps: .5, mat: MAT.nut });
        nut.position.copy(T0).add(V(Math.cos(a) * .32, -.35 - R(0, .15), Math.sin(a) * .32)); nut.userData.nut = true;
      }
    }
    const KINDS = {   // builder, the study's seed slot, and the scale it stands at in the game (the studies are drawn larger)
      oak: { build: oak, slot: 0, scale: .62 }, blossom: { build: oak, slot: 0, scale: .6, blossom: true },
      pine: { build: pine, slot: 1, scale: .7 }, pineSnow: { build: pine, slot: 1, scale: .7, snowy: true },
      giant: { build: giant, slot: 2, scale: 1 }, cypress: { build: cypress, slot: 3, scale: .58 }, palm: { build: palm, slot: 5, scale: .58 },
    };
    const LODS = [
      { rad: 1, seg: 1, det: 0, leaf: 1, frond: 1 },          // as drawn in the studies
      { rad: .5, seg: .5, det: -2, leaf: 3, frond: 2 },       // lighter: half the segments, a third of the leaf cards
      { rad: .3, seg: .25, det: -3, leaf: 0, frond: 3, minR: .05 },   // the bare form, far off (no twigs)
    ];

    // ---------- one variant, grown and merged: { parts: [{ geo, mat }], nuts: [{ geo, mat, pos }] } per level ----------
    // `lift` (flag treeheights): the trunk drawn that much longer (in the variant's own units),
    // so a short tree still stands taller than a frog before its leaves start. Everything above
    // the cut (`natural().cut`, low on the trunk under the first leaves) moves up by it: the trunk
    // (and ivy up it) stretches, each branch, leaf card and lump moves as one piece.
    const cache = new Map();
    function variant(kind, v, lod, lift = 0) {
      const key = kind + ':' + v + ':' + lod + ':' + lift;
      if (cache.has(key)) return cache.get(key);
      const K = KINDS[kind], cut = lift ? natural(kind, v).cut : 0;   // (measured first: growing one uses the shared state below)
      G = new THREE.Group(); leafSets = {}; Q = LODS[lod];
      seed = (K.slot + 1) * 7919 + v * 104729;   // variant 0: the study's own tree
      K.build({ blossom: K.blossom, snowy: K.snowy });
      G.updateMatrixWorld(true);
      const byMat = new Map(), nuts = [];
      G.traverse(m => {
        if (!m.isMesh) return;
        if (!m.visible) { m.geometry.dispose(); return; }   // (snow and ice where there's no snow)
        let g = m.geometry.clone().applyMatrix4(m.matrixWorld); m.geometry.dispose();
        if (g.index) g = g.toNonIndexed();
        if (lift) liftUp(g, m.material, cut, lift);
        if (m.userData.nut) { g.userData.shared = true; nuts.push({ geo: g, mat: m.material }); return; }
        if (!byMat.has(m.material)) byMat.set(m.material, []);
        byMat.get(m.material).push(g);
      });
      const parts = [];
      const FAR = new Set([...Object.values(MAT.bark), MAT.crown, MAT.lump, MAT.fronds, MAT.vine, MAT.rib]);   // far off, only the main forms
      for (const [mat, geos] of byMat) {
        if (lod === 2 && !FAR.has(mat)) { geos.forEach(g => g.dispose()); continue; }
        const geo = merge(geos, mat); geo.userData.shared = true; parts.push({ geo, mat });
      }
      G = null;
      // where the canopy starts, for bumping into it (380-jumping.js): low in the crown, not its lowest drooping clump
      const ys = [], lx = [1e9, -1e9], lz = [1e9, -1e9];
      for (const p of parts) if (p.mat.userData.leafy) {
        const a = p.geo.attributes.position.array;
        for (let i = 1; i < a.length; i += 9) { ys.push(a[i]); lx[0] = Math.min(lx[0], a[i - 1]); lx[1] = Math.max(lx[1], a[i - 1]); lz[0] = Math.min(lz[0], a[i + 1]); lz[1] = Math.max(lz[1], a[i + 1]); }
      }
      ys.sort((a, b) => a - b);
      const out = { parts, nuts, leafBottom: ys.length ? ys[Math.floor(ys.length * .15)] : null, leafR: ys.length ? Math.min(lx[1] - lx[0], lz[1] - lz[0]) * .42 : null };
      cache.set(key, out);
      return out;
    }
    // A variant's own height, where its leaves start (low in the crown: the 5th percentile), and
    // where its trunk is cut to lengthen it: measured once on its lighter level.
    const naturals = new Map();
    function natural(kind, v) {
      const key = kind + ':' + v;
      if (naturals.has(key)) return naturals.get(key);
      const vv = variant(kind, v, 1), box = new THREE.Box3(), ys = [];
      for (const p of vv.parts) {
        p.geo.computeBoundingBox(); box.union(p.geo.boundingBox);
        if (p.mat.userData.leafy) { const a = p.geo.attributes.position.array; for (let i = 1; i < a.length; i += 9) ys.push(a[i]); }
      }
      ys.sort((a, b) => a - b);
      const low = ys.length ? ys[Math.floor(ys.length * .05)] : box.max.y * .5;
      const out = { H: box.max.y, low, cut: Math.max(.25, low * .45) };
      naturals.set(key, out);
      return out;
    }
    const STRETCH = new Set([...Object.values(MAT.bark), MAT.ivyStem, MAT.vine]);
    function liftUp(g, mat, cut, d) {
      const a = g.attributes.position, uv = g.attributes.uv, n = a.count;
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < n; i++) { const y = a.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
      if (hi <= cut) return;
      const shift = (from, to) => { for (let i = from; i < to; i++) a.setY(i, a.getY(i) + d); };
      if (lo >= cut) shift(0, n);
      else if (STRETCH.has(mat) && lo < cut * .5 && hi > cut * 2.5) {   // the trunk (and ivy up it) from the ground across the cut: stretched, the bark texture carried on up with it
        for (let i = 0; i < n; i++) if (a.getY(i) > cut) { a.setY(i, a.getY(i) + d); if (uv) uv.setY(i, uv.getY(i) + d * .45); }
      } else if (mat.userData.cards) {   // leaf cards: each (six corners) moves up whole if it's above the cut
        for (let i = 0; i < n; i += 6) { let y = 0; for (let k = 0; k < 6; k++) y += a.getY(i + k); if (y / 6 > cut) shift(i, i + 6); }
      } else if ((lo + hi) / 2 > cut) shift(0, n);   // a branch, a lump, a fungus, the hollow: whole, by where its middle is
      a.needsUpdate = true; if (uv) uv.needsUpdate = true;
    }
    function merge(geos, mat) {
      let n = 0; geos.forEach(g => { n += g.attributes.position.count; });
      const withUv = geos.every(g => g.attributes.uv), withCol = !!mat.vertexColors;
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = withUv ? new Float32Array(n * 2) : null, col = withCol ? new Float32Array(n * 3).fill(1) : null;
      let off = 0;
      for (const g of geos) {
        if (!g.attributes.normal) g.computeVertexNormals();
        pos.set(g.attributes.position.array, off * 3); nrm.set(g.attributes.normal.array, off * 3);
        if (uv) uv.set(g.attributes.uv.array, off * 2);
        if (col && g.attributes.color) col.set(g.attributes.color.array, off * 3);
        off += g.attributes.position.count; g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.computeBoundingSphere();
      return out;
    }

    // ---------- far off: a picture of the tree on a card that turns to face you ----------
    // Drawn once per variant from its lighter level, lit flat (its own colours); the card is shaded
    // by the island's light like the ground, so it darkens at night with the rest.
    const pictures = new Map();
    function picture(kind, v, lift = 0) {
      const key = kind + ':' + v + ':' + lift;
      if (pictures.has(key)) return pictures.get(key);
      const vv = variant(kind, v, 1, lift), grp = new THREE.Group(), sc = new THREE.Scene();
      for (const p of vv.parts) grp.add(new THREE.Mesh(p.geo, p.mat));
      const box = new THREE.Box3().setFromObject(grp), size = box.getSize(V()), c = box.getCenter(V());
      const w = Math.max(size.x, size.z), h = size.y, side = Math.max(w, h), S = 256;
      sc.add(grp, new THREE.AmbientLight(0xffffff, 1));
      const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, .1, side * 4);   // (the card is the tree's own size: no taller, so it doesn't count as tree)
      cam.position.set(c.x, c.y, c.z + side * 2); cam.lookAt(c);
      const rt = new THREE.WebGLRenderTarget(S, S), oldTarget = renderer.getRenderTarget(), oldColor = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
      renderer.setRenderTarget(oldTarget); renderer.setClearColor(oldColor, oldAlpha);
      grp.children.slice().forEach(m => grp.remove(m));   // (the geometry is the variant's, kept)
      const geo = new THREE.PlaneGeometry(w, h); geo.translate(c.x, c.y, 0);
      const nrm = geo.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);   // (lit like the ground beneath it)
      geo.userData.shared = true;
      const out = { geo, mat: soft(0xffffff, { map: rt.texture, alphaTest: .5, side: THREE.DoubleSide }) };
      pictures.set(key, out);
      return out;
    }

    // ---------- a tree in the world: four levels, the one for its distance shown ----------
    const live = new Set();
    // Its level's meshes, put in when it's first shown (most trees only ever show their picture
    // and bare form, so the fuller levels are only grown for the trees you come near).
    function fill(root, l) {
      const lv = root.userData.levels[l], { kind, v, lift } = root.userData.spec;
      if (lv.userData.filled) return;
      lv.userData.filled = true;
      for (const p of variant(kind, v, l, lift).parts) {
        const m = new THREE.Mesh(p.geo, p.mat);
        m.castShadow = false; m.receiveShadow = true;   // (the shadow comes from the bare form: below)
        if (p.mat.userData.cards) { m.customDepthMaterial = cardDepthMat(p.mat.map === T.leaf.oak ? 'oak' : p.mat.map === T.leaf.needle ? 'needle' : p.mat.map === T.leaf.willow ? 'willow' : 'moss'); noInk.add(m); }   // (cards: their alpha shape is their outline)
        lv.add(m);
      }
    }
    // How much longer a tree's trunk is drawn (flag treeheights), in its variant's units: enough that,
    // full grown at `height` m, its leaves start TREES.CLEAR m up (taller than a frog). In steps of
    // a tenth of the tree, so trees share their geometry.
    function liftFor(kind, v, height) {
      const n = natural(kind, v), C = RULES.TREES.CLEAR;
      if (height <= C) return 0;
      const d = (C * n.H - height * n.low) / (height - C);   // (low + d) / (H + d) = C / height
      if (d <= 0) return 0;
      const step = n.H * .1;
      return +(Math.ceil(d / step) * step).toFixed(3);
    }
    function make(kind, rngObj, o = {}) {
      const K = KINDS[kind], v = Math.floor(rngObj() * VARIANTS), root = new THREE.Group(), body = new THREE.Group(), levels = [];
      const look = .92 + rngObj() * .16;
      // its height (flag treeheights, trees): what the island says, full grown; the mesh is scaled by its size (resize1)
      const heights = o.type === 'tree' && WG.feature('treeheights') && o.maxScale;
      const lift = heights ? liftFor(kind, v, RULES.TREES.BASE * o.maxScale) : 0;
      body.scale.setScalar(heights ? RULES.TREES.BASE / (natural(kind, v).H + lift) : K.scale * look); body.rotation.y = rngObj() * Math.PI * 2;
      root.add(body);
      for (let l = 0; l < 3; l++) { const lv = new THREE.Group(); lv.visible = false; body.add(lv); levels.push(lv); }
      const nuts = (kind === 'palm' ? variant(kind, v, 0).nuts : []).map(n => { const m = new THREE.Mesh(n.geo, n.mat); m.castShadow = true; body.add(m); return m; });   // (palms)
      // the shadow, cast by the bare form whatever level is shown (only drawn into the shadow map)
      const shadowHold = new THREE.Group();
      for (const p of variant(kind, v, 2, lift).parts) { const m = new THREE.Mesh(p.geo, SHADOW_ONLY); m.castShadow = true; shadowHold.add(m); noInk.add(m); }
      body.add(shadowHold); root.userData.shadow = shadowHold;
      const pic = picture(kind, v, lift), card = new THREE.Mesh(pic.geo, pic.mat), cardHold = new THREE.Group();
      cardHold.scale.copy(body.scale); cardHold.add(card); root.add(cardHold); noInk.add(card);
      levels.push(cardHold);
      root.userData.prebaked = true; root.userData.levels = levels; root.userData.level = 3; root.userData.card = cardHold;
      root.userData.spec = { kind, v, lift };
      const { leafBottom: lb, leafR } = variant(kind, v, 1, lift);
      if (lb != null) root.userData.leafBottom = Math.max(2.1, lb * body.scale.y);   // (always room to walk underneath)
      if (leafR != null) root.userData.leafR = leafR * body.scale.x;   // (how far the leaves spread, before its fuller levels are grown)
      live.add(root);
      return { g: root, nuts };
    }
    // which level each tree shows, by its distance from the camera (a little give, so it doesn't flicker)
    UI.onFrame(() => {
      const cx = camera.position.x, cz = camera.position.z, D = lodDist();
      for (const root of live) {
        if (!root.parent) { live.delete(root); root.traverse(m => { if (m.isMesh) noInk.delete(m); }); continue; }
        if (!root.userData.levels) continue;
        const d = Math.hypot(root.position.x - cx, root.position.z - cz), cur = root.userData.level;
        let want = d < D[0] ? 0 : d < D[1] ? 1 : d < D[2] ? 2 : 3;
        if (want > cur && d < D[want - 1] + 3) want = cur;   // (hysteresis)
        if (want !== cur) { if (want < 3) fill(root, want); root.userData.levels[cur].visible = false; root.userData.levels[want].visible = true; root.userData.level = want; }
        if (want === 3) root.userData.card.rotation.y = Math.atan2(cx - root.position.x, cz - root.position.z);   // (the picture faces you)
        root.userData.shadow.visible = root.userData.level < 3;
      }
    });

    return {
      // the model for a tree, palm or giant (o: the object; rng: seeded by its id)
      make(o, rngObj) {
        if (o.type === 'palm') return make('palm', rngObj);
        if (o.type === 'giant') return make('giant', rngObj);
        const teeth = WG.feature('region-teeth') && WG.feature('bigworld') && WG.regionAt(o.x, o.z) === 'teeth';
        if (WG.feature('bigworld') && WG.regionAt(o.x, o.z) === 'mire') return make('cypress', rngObj, o);
        if (o.species === 'pine') return make(teeth && heightAt(o.x, o.z) > RULES.TEETH.SNOW_LINE - 45 ? 'pineSnow' : 'pine', rngObj, o);
        return make(o.species === 'blossom' ? 'blossom' : 'oak', rngObj, o);
      },
      variant, live, lodDist,
    };
  })();
  UI.treeStudies = TS;
