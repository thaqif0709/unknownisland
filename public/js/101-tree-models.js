  // ================= Tree models (flag `trees2`) =================
  // The island's trees, grown from code: a tapered trunk flaring into its roots, inked bark,
  // limbs that branch, lumpy leafy crowns. One builder per kind: the broadleaf (oak and
  // blossom), the pine (bent by the wind in the high places, snowy up in the Teeth), the palm
  // (a ringed trunk and real fronds) and the Mire's drowned cypress. 100-plants-and-rocks.js
  // calls UI.trees.tree / UI.trees.palm while the flag is on (the old shapes otherwise) and bakes
  // each into a mesh or two per material, as before. Phones (`coarse`) get fewer segments.
  // The helpers (barkTube, lumpGeo) are shared with the region parts (the Weeping Wood's giants).
  const LQ = coarse;   // low detail on phones

  // Bark, inked: furrows running up the trunk, little cross-cracks, lighter flecks.
  const barkTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d'), r = mulberry32(4242);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 256);
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = r() * 128; g.strokeStyle = `rgba(40,28,20,${.18 + r() * .22})`; g.lineWidth = 1.2 + r() * 2.2;
      g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= 256; y += 16) { x += (r() - .5) * 6; g.lineTo(x, y); } g.stroke();
    }
    for (let i = 0; i < 40; i++) { const x = r() * 128, y = r() * 256; g.strokeStyle = 'rgba(40,28,20,.22)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4 + r() * 6, y + (r() - .5) * 3); g.stroke(); }
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,250,235,.35)'; g.fillRect(r() * 128, r() * 256, 1.5, 3); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const barked = c => soft(c, { map: barkTex });
  const treeBark = { oak: barked(0x8A6E58), blossom: barked(0x7E6656), pine: barked(0x8E5E48), palm: barked(0xB09272), cypress: barked(0x8E8270) };
  const leafyM = (c, extra) => { const m = soft(c, Object.assign({ map: leafTex }, extra || {})); m.userData.leafy = true; return m; };
  const frondM = [leafyM(0x86A06A, { side: THREE.DoubleSide }), leafyM(0x76955E, { side: THREE.DoubleSide })];
  const deadFrondM = soft(0xA98C62, { side: THREE.DoubleSide }), ribM = soft(0x7A8A4A), crownM = soft(0x8A7050);
  const snowM = soft(0xF2F5F6), cypressLeaf = [leafyM(0x7C8A4A), leafyM(0x6E7E44)], hangMossM = soft(0xB7BBA2);
  const fungusM = soft(0xD6C49A), hollowM = soft(0x2A211B);

  // A tapered tube along a curve: bark ridges, a flared base with root buttresses, palm rings.
  // Returns { geo, curve, radiusAt(t, a) }.
  function barkTube(pts, r0, r1, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts), len = curve.getLength();
    const segs = o.segs || Math.max(2, Math.round(len * (o.density || 2.5))), rad = o.radial || 6, ph = o.ph || 0;
    const fr = curve.computeFrenetFrames(segs, false), pos = [], uv = [], idx = [], P = new THREE.Vector3();
    const radiusAt = (t, a) => {
      let r = o.bottle ? r1 + (r0 - r1) * Math.pow(1 - t, o.bottle) : r0 + (r1 - r0) * t;
      if (o.rings) r *= 1 + .12 * Math.pow(1 - Math.abs(Math.sin(t * Math.PI * o.rings)), 8);
      let k = 1 + (o.bark ?? .06) * Math.sin(a * 5 + t * 4 + ph);
      if (o.flare) { const fl = o.flare * Math.exp(-t * len * (o.flareK || 3)); k *= 1 + fl * (.45 + .45 * (.5 + .5 * Math.sin(a * (o.roots || 5) + ph))); }
      return r * k;
    };
    for (let i = 0; i <= segs; i++) {
      const t = i / segs; curve.getPointAt(t, P);
      const N = fr.normals[i], B = fr.binormals[i];
      for (let j = 0; j <= rad; j++) {
        const a = j / rad * Math.PI * 2, r = radiusAt(t, a), c = Math.cos(a) * r, s = Math.sin(a) * r;
        pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s);
        uv.push(j / rad, t * len * (o.vRep || .45));
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return { geo, curve, radiusAt };
  }
  // A lumpy sphere (keeps the sphere's uvs, so the leafy texture shades it from below).
  function lumpGeo(rng, w = LQ ? 7 : 9, h = LQ ? 5 : 7, lumps = .6) {
    const geo = new THREE.SphereGeometry(1, w, h), a = geo.attributes.position, s = rng() * 9;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      const n = 1 + lumps * (.12 * Math.sin(x * 4 + s) + .09 * Math.sin(y * 6 + s * 2) + .07 * Math.cos(z * 5 - s));
      a.setXYZ(i, x * n, y * n, z * n);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const treePart = (g, geo, mat, p, sx = 1, sy = sx, sz = sx) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.copy(p); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // A point on a tube's bark (height t, angle a) and the way out from it.
  function onTube(tb, t, a, lift = 0) { const out = V3(Math.cos(a), 0, Math.sin(a)); return { p: tb.curve.getPointAt(t).addScaledVector(out, tb.radiusAt(t, a) + lift), out }; }

  // ---- the broadleaf: oak (and blossom), round, tall, wide or forked ----
  function broadleaf(rng, o, blossom) {
    const g = new THREE.Group(), bark = blossom ? treeBark.blossom : treeBark.oak;
    const shape = ['round', 'round', 'tall', 'wide', 'forked'][(rng() * 5) | 0];
    const leafM = blossom ? treeLeaf[3] : treeLeaf[(rng() * 3) | 0];
    const H = rr(rng, 1.7, 2.5) * (shape === 'tall' ? 1.15 : shape === 'wide' ? .85 : 1), r0 = rr(rng, .19, .26);
    const lean = rr(rng, 0, .16), la = rng() * 6.28, tp = [];
    for (let i = 0; i <= 4; i++) { const f = i / 4; tp.push(V3(Math.cos(la) * lean * H * f * f + (i ? rr(rng, -.04, .04) : 0), f * H - .15, Math.sin(la) * lean * H * f * f)); }
    const trunk = barkTube(tp, r0, r0 * .55, { radial: LQ ? 7 : 9, segs: LQ ? 4 : 6, flare: .8, flareK: 4, roots: 5, ph: rng() * 6, bark: .08 });
    treePart(g, trunk.geo, bark);
    // limbs, each forking into twigs, and a clump of leaves at every end
    const nL = shape === 'forked' ? 2 : 3 + ((rng() * 2) | 0), ends = [];
    for (let k = 0; k < nL; k++) {
      const a = la + k / nL * 6.28 + rr(rng, -.4, .4), t = shape === 'forked' ? 1 : rr(rng, .62, 1), base = trunk.curve.getPointAt(t);
      const up = shape === 'tall' ? rr(rng, 1.4, 2.2) : shape === 'wide' ? rr(rng, .35, .7) : shape === 'forked' ? rr(rng, 1.1, 1.5) : rr(rng, .7, 1.2);
      const L = rr(rng, 1, 1.45) * (shape === 'wide' ? 1.35 : 1), d = V3(Math.cos(a), up, Math.sin(a)).normalize(), pts = [base];
      let p = base.clone();
      for (let i = 1; i <= 3; i++) { d.y -= .08; d.normalize(); p = p.clone().addScaledVector(d, L / 3); pts.push(p); }
      const r = r0 * .55 * rr(rng, .8, 1), limb = barkTube(pts, r, r * .45, { radial: LQ ? 5 : 6, segs: LQ ? 3 : 4, ph: rng() * 6 });
      treePart(g, limb.geo, bark);
      ends.push(pts[3]);
      for (let j = 0, nj = 1; j < nj; j++) {
        const tt = rr(rng, .55, .9), q = limb.curve.getPointAt(tt), tan = limb.curve.getTangentAt(tt);
        const side = V3(-tan.z, 0, tan.x).normalize().multiplyScalar(j ? 1 : -1);
        const dd = tan.clone().addScaledVector(side, .9).add(V3(0, .35, 0)).normalize(), L2 = rr(rng, .5, .8);
        const e = q.clone().addScaledVector(dd, L2).add(V3(0, .08, 0));
        treePart(g, barkTube([q, q.clone().addScaledVector(dd, L2 * .5), e], r * .45, .02, { radial: LQ ? 3 : 4, segs: 2 }).geo, bark);
        ends.push(e);
      }
    }
    const minY = 2.25;   // leaves stay above your head (they're solid: 380-jumping.js)
    const top = trunk.curve.getPointAt(1), cr = rr(rng, .85, 1.15) * (shape === 'wide' ? 1.2 : 1);
    const squash = shape === 'tall' ? 1.2 : shape === 'wide' ? .7 : .9;
    treePart(g, lumpGeo(rng), leafM, top.clone().add(V3(0, Math.max(cr * .45, minY + cr * .5 - top.y), 0)), cr, cr * squash, cr);
    for (const e of ends) { const s = rr(rng, .55, .82); treePart(g, lumpGeo(rng), leafM, V3(e.x, Math.max(e.y + s * .3, minY + s * .55), e.z), s, s * squash, s); }
    if (!blossom && rng() < .3) {   // bracket fungus
      const a = rng() * 6.28, t = rr(rng, .25, .45);
      for (let j = 0; j < 2; j++) {
        const b = onTube(trunk, t + j * .08, a + j * .2, -.02), r = .14 - j * .04;
        const m = treePart(g, new THREE.CylinderGeometry(r, r * 1.08, .05, 8, 1, false, -Math.PI / 2, Math.PI), fungusM, b.p);
        m.rotation.y = Math.atan2(b.out.x, b.out.z);
      }
    }
    if (rng() < .2) { const b = onTube(trunk, rr(rng, .3, .5), rng() * 6.28, -.05); treePart(g, new THREE.SphereGeometry(1, 8, 6), hollowM, b.p, .12, .18, .06).rotation.y = Math.atan2(b.out.x, b.out.z); }
    g.rotation.y = rng() * 6.28;
    return g;
  }

  // ---- the pine: tiered boughs; in high, windy places bent and stripped on the windward
  // side; snowy above the Teeth's snow line ----
  // One bough tier: a cone whose rim hangs in lobes, short on the windward side.
  function tierGeo(rng, n, wx, wz, windy) {
    const geo = new THREE.ConeGeometry(1, 1, LQ ? 8 : 11, 2, false), a = geo.attributes.position, ph = rng() * 6, lobes = 4 + ((rng() * 3) | 0);
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i), r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const ang = Math.atan2(z, x), lobe = 1 + .2 * Math.cos(ang * lobes + ph);
      const wind = windy ? (Math.cos(ang) * wx + Math.sin(ang) * wz < -.2 ? .55 : 1.12) : 1;
      const k = lobe * wind, rim = y < -.25;
      a.setXYZ(i, x * k, y - (rim ? .18 * k : 0), z * k);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function pine(rng, o) {
    const g = new THREE.Group(), bark = treeBark.pine, m = pineM[(rng() * 2) | 0];
    const h0 = heightAt(o.x, o.z), teeth = WG.feature('region-teeth') && WG.feature('bigworld') && WG.regionAt(o.x, o.z) === 'teeth';
    const snowy = teeth && h0 > RULES.TEETH.SNOW_LINE - 45, windy = teeth || h0 > 14;
    const hf = rr(rng, .85, 1.3), H = rr(rng, 3.2, 4.3) * hf, bend = windy ? rr(rng, .25, .55) : rr(rng, 0, .1);
    const wa = rr(rng, -.35, .35), wx = Math.cos(wa), wz = Math.sin(wa);   // it leans away from the wind (from the west)
    const tp = [];
    for (let i = 0; i <= 4; i++) { const f = i / 4; tp.push(V3(wx * bend * H * .35 * Math.pow(f, 1.8), f * H - .1, wz * bend * H * .35 * Math.pow(f, 1.8))); }
    const trunk = barkTube(tp, .19 * hf, .03, { radial: LQ ? 6 : 8, segs: LQ ? 4 : 6, flare: .9, flareK: 4, roots: 4, ph: rng() * 6 });
    treePart(g, trunk.geo, bark);
    const tiers = LQ ? 4 : 5 + ((rng() * 2) | 0);
    for (let i = 0; i < tiers; i++) {
      const k = i / tiers, c = trunk.curve.getPointAt(Math.min(.97, .22 + k * .72));
      const r = (1.45 - k * 1.05) * rr(rng, .9, 1.1) * hf * .95, h = .75 * hf, geo = tierGeo(rng, i, wx, wz, windy);
      treePart(g, geo, m, c.clone().add(V3(0, h * .35, 0)), r, h, r);
      if (snowy) treePart(g, geo, snowM, c.clone().add(V3(0, h * .62, 0)), r * .8, h * .55, r * .8);
    }
    const top = trunk.curve.getPointAt(1);
    treePart(g, lumpGeo(rng, 6, 4), snowy ? snowM : m, top.clone().add(V3(0, .25, 0)), .14 * hf, .3 * hf, .14 * hf);
    if (windy) for (let j = 0; j < (LQ ? 2 : 3); j++) {   // bare twigs on the windward side
      const c = trunk.curve.getPointAt(rr(rng, .3, .8)), a = wa + Math.PI + rr(rng, -.8, .8), L = rr(rng, .35, .7);
      treePart(g, barkTube([c, c.clone().add(V3(Math.cos(a) * L * .5, .05, Math.sin(a) * L * .5)), c.clone().add(V3(Math.cos(a) * L, .15, Math.sin(a) * L))], .03, .008, { radial: 3, segs: 2 }).geo, bark);
    }
    if (!windy) g.rotation.y = rng() * 6.28;   // (a bent pine keeps facing the wind)
    return g;
  }

  // ---- the palm: a ringed, leaning trunk and arching fronds ----
  function frondGeo(rng, base, dir, L, e, o = {}) {
    const n = o.n || (LQ ? 9 : 13), droop = o.droop ?? .55, up = V3(0, 1, 0), pts = [];
    for (let i = 0; i <= 5; i++) { const s = i / 5; pts.push(base.clone().addScaledVector(dir, s * L * Math.cos(e)).add(V3(0, s * L * Math.sin(e) - s * s * L * droop, 0))); }
    const curve = new THREE.CatmullRomCurve3(pts), pos = [], uv = [], wid = o.width || .75;
    for (let i = 0; i < n; i++) {
      const t = .1 + i / (n - 1) * .9, p = curve.getPointAt(t), tan = curve.getTangentAt(t), side = V3().crossVectors(tan, up).normalize();
      for (const sd of [-1, 1]) {
        const w = (wid * Math.sin(Math.PI * Math.min(1, t * 1.1)) + .12 * wid) * rr(rng, .85, 1.1);
        const tip = p.clone().addScaledVector(side, sd * w).addScaledVector(tan, w * .35).add(V3(0, -w * (o.fall ?? .45), 0));
        const b1 = p.clone().addScaledVector(tan, -.05), b2 = p.clone().addScaledVector(tan, .05);
        const tA = tip.clone().addScaledVector(tan, -.03), tB = tip.clone().addScaledVector(tan, .03);
        for (const q of [b1, b2, tA, b2, tB, tA]) pos.push(q.x, q.y, q.z);
        uv.push(0, .9, 0, .9, 1, .5, 0, .9, 1, .5, 1, .5);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return { geo, rib: barkTube(pts, .045, .012, { radial: 3, segs: 5, bark: 0 }).geo };
  }
  function palm(rng) {
    const g = new THREE.Group(), hgt = 4 + rng() * 1.6, bend = .2 + rng() * .35, tp = [];
    for (let i = 0; i <= 6; i++) { const f = i / 6; tp.push(V3(bend * 3 * f * f - .15 * Math.sin(f * Math.PI), hgt * f - .1, .12 * Math.sin(f * 2.5))); }
    const rings = LQ ? 12 : 16;
    const trunk = barkTube(tp, .21, .15, { radial: LQ ? 6 : 7, segs: rings * 2, rings, flare: .7, flareK: 5, roots: 7, ph: rng() * 6, bark: .03 });
    treePart(g, trunk.geo, treeBark.palm);
    const top = trunk.curve.getPointAt(1);
    treePart(g, lumpGeo(rng, 7, 5), crownM, top, .26, .24, .26);
    const nf = LQ ? 7 : 8, a0 = rng() * 6.28;
    for (let k = 0; k < nf; k++) {
      const a = a0 + k * 2.39996 + rr(rng, -.15, .15), f = frondGeo(rng, top.clone().add(V3(0, .08, 0)), V3(Math.cos(a), 0, Math.sin(a)), rr(rng, 1.9, 2.5), rr(rng, .05, .55));
      treePart(g, f.geo, frondM[k % 2]); treePart(g, f.rib, ribM);
    }
    if (rng() < .6) {   // an old frond hanging dead (not leafy: you don't bump into it)
      const a = rng() * 6.28, f = frondGeo(rng, top.clone().add(V3(0, -.12, 0)), V3(Math.cos(a), 0, Math.sin(a)), rr(rng, 1.5, 1.9), -1.05, { droop: .2, fall: .8, width: .55 });
      treePart(g, f.geo, deadFrondM); treePart(g, f.rib, deadFrondM);
    }
    const nuts = [];
    for (let k = 0; k < 3; k++) {
      const n = ball(.17, coconutM, 8, 6), a = k / 3 * Math.PI * 2;
      n.position.set(top.x + Math.cos(a) * .22, top.y - .22, top.z + Math.sin(a) * .22);
      g.add(n); nuts.push(n);
    }
    g.rotation.y = rng() * Math.PI * 2;
    return { g, nuts };
  }

  // ---- the Mire's drowned cypress: a swollen trunk, knees, flat pads, moss hanging like hair ----
  function cypress(rng) {
    const g = new THREE.Group(), bark = treeBark.cypress, H = rr(rng, 4.2, 5.6), r0 = rr(rng, .42, .55), tp = [];
    for (let i = 0; i <= 5; i++) { const f = i / 5; tp.push(V3(Math.sin(f * 2 + r0 * 9) * .12, f * H - .3, Math.cos(f * 1.7) * .1)); }
    const trunk = barkTube(tp, r0, .06, { radial: LQ ? 7 : 10, segs: LQ ? 5 : 7, bottle: 3, flare: 1, flareK: 2.5, roots: 6, ph: rng() * 6, bark: .1 });
    treePart(g, trunk.geo, bark);
    for (let k = 0, n = LQ ? 2 : 4; k < n; k++) {   // knees
      const a = rng() * 6.28, d = rr(rng, 1, 2.2), x = Math.cos(a) * d, z = Math.sin(a) * d, h = rr(rng, .3, .6);
      treePart(g, barkTube([V3(x, -.2, z), V3(x + .03, h * .6, z), V3(x, h, z)], .11, .03, { radial: 4, segs: 2 }).geo, bark);
    }
    const leafM = cypressLeaf[(rng() * 2) | 0];
    for (let k = 0, n = LQ ? 5 : 7; k < n; k++) {
      const t = rr(rng, .45, .95), a = k * 2.39996 + rng(), base = trunk.curve.getPointAt(t), L = (1 - t) * 1.6 + .5;
      const d = V3(Math.cos(a), rr(rng, -.05, .25), Math.sin(a)).normalize(), e = base.clone().addScaledVector(d, L);
      treePart(g, barkTube([base, base.clone().addScaledVector(d, L * .5).add(V3(0, .05, 0)), e], .06, .02, { radial: 4, segs: 3 }).geo, bark);
      const s = rr(rng, .5, .78), pad = V3(e.x, Math.max(e.y, 2.3), e.z);
      treePart(g, lumpGeo(rng), leafM, pad, s, s * .34, s * .9);
      for (let j = 0; j < (LQ ? 1 : 2); j++) {   // moss
        const st = pad.clone().add(V3(rr(rng, -.3, .3), -s * .2, rr(rng, -.3, .3))), L2 = rr(rng, .7, 1.5);
        treePart(g, barkTube([st, st.clone().add(V3(.05, -L2 * .5, -.03)), st.clone().add(V3(-.03, -L2, .04))], .025, .006, { radial: 3, segs: 3, bark: 0 }).geo, hangMossM);
      }
    }
    treePart(g, lumpGeo(rng), leafM, trunk.curve.getPointAt(1).add(V3(0, .1, 0)), .45, .25, .45);
    g.rotation.y = rng() * 6.28;
    return g;
  }

  UI.trees = {
    tree(rng, o) {
      if (WG.feature('bigworld') && WG.regionAt(o.x, o.z) === 'mire') return cypress(rng);
      return o.species === 'pine' ? pine(rng, o) : broadleaf(rng, o, o.species === 'blossom');
    },
    palm,
    barkTube, lumpGeo, barkTex,   // (for the region parts: 109-the-wood.js)
  };
