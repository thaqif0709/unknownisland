  // ---- boss: the Hanging Mother (C4, the Weeping Wood's boss; the V16.32 "Hero Boss Lab" model, part for part) ----
  // A great spider with a woman's head: a dark chitin abdomen bristling with hair over a thorax,
  // eight jointed legs that end in long four-fingered hands, hair along the shins; a human face
  // (brow, cheeks, nose, mouth, ears) with exactly two round glowing spider eyes, under heavy,
  // centre-parted dark hair of uneven lengths; and three great vines from her back up into the
  // canopy. Up in the canopy (extra 1) she hangs far overhead; on a snatch she drops to the
  // ground on her hands; with her vines cut she lies tipped over. Her three vines are also
  // separate mobs (mother_vine), the ones you cut. Everything is baked into one mesh per
  // material (100-plants-and-rocks.js `bake`).
  {
    const { V, add, def, limb } = BK;
    const mm = {
      chitin: softShared(0x29251f), dark: softShared(0x151311), hair: softShared(0x443a31), joint: softShared(0x201c18),
      skin: softShared(0x171513), skinDark: softShared(0x0b0a09), lip: softShared(0x070606), black: softShared(0x1d1e1c),
      hair1: softShared(0x100b09), hair2: softShared(0x211512), hairHi: softShared(0x3a241d),
      vine: softShared(0x27351d), vineMoss: softShared(0x485633),
      eye: new THREE.MeshStandardMaterial({ color: 0xffb34c, roughness: .25, emissive: 0xff8a22, emissiveIntensity: 2.7 }),
    };
    const strand = (par, pts, segs, r, sides, m) => add(par, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, sides, false), m);

    function makeHead(body) {
      const head = new THREE.Group(); head.position.set(0, 2.62, 2.30); body.add(head);
      add(head, def(.60, .78, .54, 701, 2), mm.skin, [0, .02, 0]);   // skull
      add(head, def(.47, .45, .43, 702, 2), mm.skin, [0, -.48, .08]).scale.z = .92;   // jaw
      for (const sx of [-1, 1]) add(head, def(.105, .19, .065, 710 + (sx > 0 ? 1 : 0), 1), mm.skinDark, [sx * .59, -.03, .02]).rotation.z = sx * .08;   // ears
      for (const sx of [-1, 1]) {   // brow ridge and cheeks
        add(head, def(.25, .09, .12, 720 + (sx > 0 ? 1 : 0), 1), mm.skinDark, [sx * .25, .20, .47]);
        add(head, def(.22, .18, .11, 730 + (sx > 0 ? 1 : 0), 1), mm.skin, [sx * .29, -.18, .45]);
      }
      add(head, def(.095, .29, .13, 740, 1), mm.skin, [0, -.02, .53]);   // nose bridge, tip and nostrils
      add(head, def(.14, .095, .16, 741, 1), mm.skinDark, [0, -.22, .59]);
      for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(.035, 8, 6), mm.black, [sx * .065, -.24, .70], [1, 1, .45]);
      for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(.115, 18, 14), mm.eye, [sx * .22, .12, .615], [1, 1, .38]);   // exactly two round spider eyes
      add(head, new THREE.SphereGeometry(.15, 14, 8), mm.lip, [0, -.42, .515], [1.55, .55, .28]);   // the mouth
      // the hair: a full crown and back, then centre-parted strands sweeping outward at uneven lengths
      const { hair1, hair2, hairHi } = mm;
      add(head, def(.72, .76, .60, 760, 2), hair1, [0, .32, -.10]);
      add(head, def(.68, .67, .53, 761, 2), hair2, [0, .16, -.32]);
      for (const side of [-1, 1]) for (let i = 0; i < 118; i++) {   // the crown, short to extra long
        const u = i / 117, layer = (i % 11) / 10, band = i % 8;
        const lengthBoost = [-.38, -.18, .05, .28, .52, .78, .18, .95][band];
        const shoulderX = side * (.27 + u * .42 + layer * .065), endX = side * (.45 + u * .39 + layer * .07), endY = -.50 - u * .72 - lengthBoost - (i % 4) * .055, wave = Math.sin(i * 1.37) * .065;
        strand(head, [V(side * (.018 + u * .245), .79 - u * .22, .13 - u * .055), V(side * (.13 + u * .23) + wave * .25, .62 - u * .10, .49), V(shoulderX + wave, .22 - u * .20, .60), V(endX + wave * 1.25, endY, .36 + (i % 3) * .025)],
          17, .017 + (i % 6) * .0024, 6, i % 13 === 0 ? hairHi : (i % 3 === 0 ? hair2 : hair1));
      }
      for (const side of [-1, 1]) for (let i = 0; i < 38; i++) {   // locks framing the face (clear of the eyes, nose and mouth)
        const u = i / 37, drop = [.45, .68, .92, 1.18, .58, 1.42][i % 6];
        strand(head, [V(side * (.025 + u * .15), .79 - u * .10, .16), V(side * (.20 + u * .13), .62, .55), V(side * (.38 + u * .12), .25 - u * .14, .66), V(side * (.47 + u * .18), -.18 - drop - u * .22, .46)],
          16, .022 + (i % 5) * .0028, 7, i % 7 === 0 ? hairHi : (i % 2 ? hair2 : hair1));
      }
      for (const side of [-1, 1]) for (let i = 0; i < 64; i++) {   // thick side curtains, ends uneven
        const u = i / 63, len = [.25, .55, .88, .42, 1.05, .68, 1.28, .34, .82][i % 9], x = side * (.45 + u * .33), sway = Math.sin(i * 1.71) * .075 + Math.cos(i * .63) * .035;
        strand(head, [V(side * (.34 + u * .27), .49 - u * .20, .25), V(x + sway * .35, .08, .58), V(x + sway, -.55, .50), V(x + sway * 1.55, -.58 - len - u * .36, .27 + (i % 4) * .025)],
          16, .016 + (i % 5) * .0026, 6, i % 11 === 0 ? hairHi : (i % 3 === 0 ? hair2 : hair1));
      }
      for (const side of [-1, 1]) for (let i = 0; i < 26; i++) {   // shorter broken layers at the temples
        const u = i / 25;
        strand(head, [V(side * (.10 + u * .30), .70 - u * .20, .16), V(side * (.32 + u * .24), .50 - u * .12, .57), V(side * (.47 + u * .22), .12 - u * .32, .53)], 10, .014 + (i % 4) * .0025, 6, i % 5 === 0 ? hairHi : hair2);
      }
      for (const side of [-1, 1]) for (let i = 0; i < 24; i++) {   // a few long flyaways, pushed back from the face
        const extra = (i % 6) * .14;
        strand(head, [V(side * (.09 + i * .012), .74 - i * .009, .11), V(side * (.43 + i * .022), .50 - i * .016, .45), V(side * (.68 + i * .030), -.18 - extra, .32), V(side * (.76 + i * .035), -.52 - extra * 1.45, .20)],
          12, .009 + (i % 4) * .0018, 5, i % 4 === 0 ? hairHi : hair2);
      }
    }

    function makeMother() {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const { chitin, dark, hair, joint } = mm;
      add(body, def(2.25, 1.55, 2.55, 31, 2), chitin, [0, 5.15, -.75]).rotation.x = .12;   // abdomen
      add(body, def(1.75, 1.05, 1.7, 42, 2), dark, [0, 3.65, .65]);   // thorax
      for (let i = 0; i < 110; i++) {   // bristles over the abdomen
        const a = i * 2.399963, u = ((i * 37) % 101) / 100, yy = 4.15 + u * 2.0, rr = Math.sqrt(Math.max(0, 1 - ((yy - 5.15) / 1.55) ** 2)), x = Math.cos(a) * 2.18 * rr, z = -.75 + Math.sin(a) * 2.48 * rr, h = .16 + ((i * 13) % 7) * .018;
        const q = add(body, new THREE.CylinderGeometry(.018, .035, h, 5), hair, [x, yy, z]);
        q.lookAt(V(x * 1.12, yy + (yy - 5.15) * .12, -.75 + (z + .75) * 1.12)); q.rotateX(Math.PI / 2);
      }
      for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {   // eight jointed legs, each ending in a long-fingered hand
        const front = (1.5 - k) * .78, spread = 2.0 + k * .42;
        const hip = V(side * 1.18, 3.75, .65 + front), knee = V(side * (3.0 + spread * .35), 4.15 + (k === 0 ? .2 : 0), 1.05 + front * 1.42),
          ankle = V(side * (4.45 + spread * .42), 2.55, 1.15 + front * 1.72), foot = V(side * (5.15 + spread * .5), 1.25, 1.35 + front * 2.0), tip = V(side * (5.5 + spread * .52), .75, 1.52 + front * 2.08);
        limb(body, hip, knee, .30, .23, chitin); add(body, new THREE.SphereGeometry(.34, 9, 7), joint, [knee.x, knee.y, knee.z]);
        limb(body, knee, ankle, .24, .16, chitin); add(body, new THREE.SphereGeometry(.23, 8, 6), joint, [ankle.x, ankle.y, ankle.z]);
        limb(body, ankle, foot, .16, .10, dark);
        const wristEnd = foot.clone().add(tip.clone().sub(foot).normalize().multiplyScalar(.42));
        limb(body, foot, wristEnd, .105, .085, chitin);
        const hand = new THREE.Group(); hand.position.copy(wristEnd); body.add(hand);
        add(hand, def(.24, .32, .105, 80 + k + (side > 0 ? 10 : 0), 1), chitin, [0, -.18, 0]);
        const fingerX = [-.15, -.05, .05, .15], fingerLen = [.48, .58, .56, .45];
        for (let fi = 0; fi < 4; fi++) {
          const base = V(fingerX[fi], -.39, .02), mid = V(fingerX[fi], -.39 - fingerLen[fi] * .52, .06), end = V(fingerX[fi], -.39 - fingerLen[fi], -.01);
          limb(hand, base, mid, .038, .028, chitin); add(hand, new THREE.SphereGeometry(.032, 7, 5), joint, [mid.x, mid.y, mid.z]); limb(hand, mid, end, .028, .013, chitin);
        }
        limb(hand, V(side * .20, -.18, .02), V(side * .34, -.33, .06), .044, .030, chitin);   // the thumb
        limb(hand, V(side * .34, -.33, .06), V(side * .40, -.49, 0), .030, .014, chitin);
        for (let j = 0; j < 8; j++) { const p = ankle.clone().lerp(foot, (j + 1) / 9); limb(body, p, p.clone().add(V(side * .22, .10, (j % 2 ? 1 : -1) * .10)), .018, .004, hair); }   // hair along the shin
      }
      makeHead(body);
      // the three great vines she hangs by, each fused into her back at its own point, moss along them
      const anchors = [V(-1.28, 5.62, -.36), V(.00, 6.18, -.72), V(1.24, 5.55, -.22)], tops = [V(-2.35, 11.8, -.55), V(.15, 12.9, -1.05), V(2.55, 12.1, -.40)];
      for (let vi = 0; vi < 3; vi++) {
        const a = anchors[vi], top = tops[vi];
        const curve = new THREE.CatmullRomCurve3([a, V(a.x + (vi - 1) * .18, 7.15, a.z + .10), V(top.x + (vi === 1 ? .12 : -.10), 9.35, top.z - .08), top]);
        add(body, new THREE.TubeGeometry(curve, 28, .13, 8, false), mm.vine);
        for (let n = 0; n < 8 - 1; n++) { const p = curve.getPoint((n + 1) / 8); add(body, new THREE.SphereGeometry(.075 + (n % 2) * .018, 7, 5), mm.vineMoss, [p.x + .06 * Math.sin(n * 2.1 + vi), p.y, p.z + .05 * Math.cos(n * 1.7 + vi)], [1.25, .55, 1]); }
      }
      bake(body);   // over a thousand parts: one mesh per material
      BK.solidShadows(body);
      body.position.y = UP_Y;
      g.userData = { body };
      return g;
    }
    // her height: hanging up among the branches, down on her hands on a snatch, tipped over once fallen
    const UP_Y = 10.5, DOWN_Y = 0, FALLEN_Y = .6;
    UI.mobs.register('boss_mother', {
      make: makeMother,
      pose(m, dt, now) {
        const { body } = m.mesh.userData, up = m.extra === 1;
        const y = up ? UP_Y : m.state === 'fallen' ? FALLEN_Y : DOWN_Y;
        body.position.y += (y - body.position.y) * Math.min(1, dt * (up ? 2.5 : 10));
        body.rotation.z = up ? Math.sin(now / 1200) * .06 : m.state === 'fallen' ? 1.3 : 0;
      },
    });
    UI.mobs.register('mother_vine', {
      make() {
        const g = new THREE.Group(), v = new THREE.Mesh(new THREE.CylinderGeometry(.18, .26, 22, 7), softShared(0x4F7A3A));
        v.position.y = 11; v.castShadow = true; g.add(v);
        return g;
      },
      pose(m, dt, now) { m.mesh.rotation.z = Math.sin(now / 700 + m.id) * .03; },
    });
  }
