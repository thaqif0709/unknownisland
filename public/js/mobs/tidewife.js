  // ---- boss: the Tidewife (C1, the Landing's boss; the V15 "Hero Boss Lab" model, part for part) ----
  // A huge crab whose shell is a shipwreck: a deep carapace under curved hull planking, ship's
  // ribs flaring out like the shell's rim, a face of broken bow timbers and splinter teeth, four
  // pairs of jointed walking legs with iron bands at the joints, two massive claws of hull and
  // wreck beams, lantern eyestalks, a whole ruined deck on her back (quarterdeck, railings, hatch,
  // cabin, capstan, barrels, crates, rope coils), heavy moss, rot, fungus and barnacles, a torn
  // sail on a snapped mast, kelp hanging under her (gone once it's burned: the snapshot's extra is
  // 1 while it's on her), and her shore's air: drips of seawater, salt mist and shore flies.
  // She rears and crashes down (her lanterns blaze, their stalks stretch), swings a claw, heaves
  // a beam of the wreck (bossfx 'wreck'). The static parts are baked into one mesh per material
  // (100-plants-and-rocks.js `bake`); the claws, eyestalks, kelp, sail and effects stay apart
  // because they move. One light for both lanterns (every light costs every material in view).
  {
    const { M, V, add, def, limb, taperTube, plank, jointChain, fx } = BK;
    const tm = { shell: softShared(0xaaa48f), shellDark: softShared(0x6d685a), inner: softShared(0x403e37), wetMoss: softShared(0x35412b), darkMoss: softShared(0x263226),
      rot: softShared(0x17120e), rotEdge: softShared(0x3b291b), fungus: softShared(0x9a9176) };
    const TW_Y = -.06;   // her feet on the ground

    function clawBarnacles(crab) {
      function barnaclePatch(center, normal, spreadX, spreadY, count, seed) {
        const n = normal.clone().normalize(), ref = Math.abs(n.y) < .85 ? V(0, 1, 0) : V(1, 0, 0);
        const tangent = new THREE.Vector3().crossVectors(ref, n).normalize(), bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize();
        for (let i = 0; i < count; i++) {
          // an irregular hashed scatter with gaps, so a colony doesn't read as rows or rings
          const h1 = Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453, h2 = Math.sin((i + 1) * 269.5 + seed * 183.3) * 24634.6345;
          const rx = (h1 - Math.floor(h1)) * 2 - 1, ry = (h2 - Math.floor(h2)) * 2 - 1;
          if ((i + seed) % 11 === 0) continue;
          const fall = Math.sqrt(Math.max(.08, 1 - Math.min(1, rx * rx + ry * ry) * .18));
          const off = tangent.clone().multiplyScalar(rx * spreadX * fall).add(bitangent.clone().multiplyScalar(ry * spreadY * fall));
          const c = center.clone().add(off).add(n.clone().multiplyScalar(.008)), r = .025 + ((i * 17 + seed) % 7) * .009, h = .022 + ((i * 11 + seed) % 5) * .008;
          const q = add(crab, new THREE.CylinderGeometry(r * .64, r, h, 7), (i + seed) % 5 === 0 ? tm.shellDark : tm.shell, [c.x, c.y, c.z]);   // a squat shell
          q.quaternion.setFromUnitVectors(V(0, 1, 0), n);
          const cap = c.clone().add(n.clone().multiplyScalar(h * .52));
          add(crab, new THREE.CylinderGeometry(r * .26, r * .34, .006, 7), tm.inner, [cap.x, cap.y, cap.z]).quaternion.copy(q.quaternion);   // its dark opening
          if (i % 5 === 0) {   // a little one beside it
            const sc = c.clone().add(tangent.clone().multiplyScalar(r * 1.05)).add(bitangent.clone().multiplyScalar(r * .35)), sr = r * .48;
            add(crab, new THREE.CylinderGeometry(sr * .62, sr, .014, 6), tm.shellDark, [sc.x, sc.y, sc.z]).quaternion.copy(q.quaternion);
          }
        }
      }
      for (const side of [-1, 1]) {
        barnaclePatch(V(side * 2.78, 1.55, .77), V(0, .12, 1), .72, .48, 20, side < 0 ? 3 : 7);
        barnaclePatch(V(side * 3.38, 1.82, .68), V(0, .18, 1), .66, .42, 18, side < 0 ? 11 : 17);
        barnaclePatch(V(side * 3.05, 1.42, .12), V(0, -.05, -1), .72, .38, 16, side < 0 ? 23 : 29);
        barnaclePatch(V(side * 2.45, 2.02, .42), V(side, .2, .08), .48, .4, 14, side < 0 ? 31 : 37);
        barnaclePatch(V(side * 3.72, 1.46, .38), V(side, .05, .15), .42, .34, 12, side < 0 ? 41 : 43);
      }
      // colonies on the carapace and the wreck
      barnaclePatch(V(-1.72, 2.58, 1.28), V(-.12, .55, .82), .66, .5, 18, 51);
      barnaclePatch(V(-.35, 2.86, 1.55), V(0, .62, .78), .58, .42, 15, 57);
      barnaclePatch(V(1.12, 2.67, 1.42), V(.08, .58, .81), .7, .48, 18, 61);
      barnaclePatch(V(-2.2, 2.2, .48), V(-.72, .45, .3), .46, .36, 13, 67);
      barnaclePatch(V(2.18, 2.3, .55), V(.72, .45, .3), .48, .36, 13, 71);
      barnaclePatch(V(-1.15, 2.34, -1.18), V(-.08, .5, -.86), .52, .38, 12, 73);
      barnaclePatch(V(1.48, 2.42, -1.02), V(.1, .48, -.87), .5, .36, 12, 79);
    }

    const sailMat = new THREE.MeshStandardMaterial({ color: 0x817967, roughness: 1, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: .9 });
    function sailRig(crab) {
      // the mast rises from the wrecked deck, the yard crosses it near the top
      const mastBase = V(.38, 2.55, -.42), mastTop = V(.58, 7.65, -.48);
      limb(crab, mastBase, mastTop, .14, .085, M.wood2);
      const yardL = V(-1.72, 6.65, -.48), yardR = V(2.78, 6.65, -.48);
      limb(crab, yardL, yardR, .105, .072, M.wood2);
      taperTube(crab, [mastTop, V(.66, 8.02, -.5), V(.54, 8.38, -.52)], .075, .016, M.wood2);   // the snapped tip
      taperTube(crab, [mastTop, yardL], .012, .004, M.bone); taperTube(crab, [mastTop, yardR], .012, .004, M.bone);   // rigging
      taperTube(crab, [yardL, mastBase], .009, .003, M.bone); taperTube(crab, [yardR, mastBase], .009, .003, M.bone);
      // the sail hangs from the yard; its lower edge narrows and hangs above the deck
      const geo = new THREE.BufferGeometry(), cols = 15, rows = 11, pos = [], uv = [], idx = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const u = x / (cols - 1), v = y / (rows - 1), topX = yardL.x + (yardR.x - yardL.x) * u, bottomX = .5 + (u - .5) * 1.38 * 2;
        pos.push(THREE.MathUtils.lerp(topX, bottomX, v), 6.62 - v * 3.15, -.5 + Math.sin(u * Math.PI * 2 + v * 2.4) * .035); uv.push(u, v);
      }
      for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
        if (((x * 7 + y * 11) % 23) < 3 || (y > 7 && ((x + y) % 4 === 0 || x < 2 || x > cols - 4))) continue;   // ragged holes and a torn hem
        const q = y * cols + x, r = q + 1, c = q + cols, d = c + 1; idx.push(q, c, r, r, c, d);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const sail = new THREE.Mesh(geo, sailMat); sail.userData.base = Float32Array.from(pos); crab.add(sail);
      // lashings along the yard, long frayed strips below
      for (let i = 0; i < 11; i++) { const x = THREE.MathUtils.lerp(yardL.x, yardR.x, (i + 1) / 12); taperTube(crab, [V(x, 6.7, -.48), V(x, 6.53, -.5)], .012, .004, M.bone); }
      for (let i = 0; i < 13; i++) { const x = .5 + ((i + 1) / 14 - .5) * 2.65; taperTube(crab, [V(x, 3.5, -.49), V(x + Math.sin(i) * .1, 3.05 - (i % 4) * .14, -.45), V(x + Math.cos(i) * .16, 2.58 - (i % 5) * .12, -.42)], .014, .002, M.bone); }
      return sail;
    }

    function rotAndMoss(crab) {
      const { wetMoss, darkMoss } = tm;
      for (let i = 0; i < 185; i++) {   // broad overlapping mats of moss, about a fifth of her
        const a = i * 2.399, band = (i % 23) / 22, x = Math.sin(a) * (.72 + band * 2.25), z = Math.cos(a) * (.58 + band * 1.55), y = .82 + ((i * 29) % 37) / 36 * 2.25;
        add(crab, def(.22 + (i % 7) * .055, .035 + (i % 4) * .014, .18 + (i % 6) * .045, 2200 + i, 2), i % 6 === 0 ? darkMoss : wetMoss, [x, y, z]).rotation.set((i % 3 - 1) * .12, a * .08, (i % 5 - 2) * .06);
      }
      for (let i = 0; i < 76; i++) {   // damp moss and algae hanging from seams and underneath
        const a = i * 1.77, x = Math.sin(a) * (1.15 + (i % 8) * .22), z = Math.cos(a) * (.75 + (i % 6) * .16), y = 1.15 + (i % 5) * .22;
        taperTube(crab, [V(x, y, z), V(x + Math.sin(i) * .08, y - .32 - (i % 4) * .08, z), V(x + Math.cos(i) * .12, y - .65 - (i % 6) * .1, z + .06)], .026, .003, i % 5 === 0 ? darkMoss : wetMoss);
      }
      const clusters = [[-1.65, 2.45, .25, 1.05, .12, .72], [1.45, 2.55, -.15, 1.15, .13, .78], [-.55, 2.92, .15, 1.25, .11, .72], [.65, 2.82, .55, 1.0, .12, .68],
        [-2.75, 1.55, .5, .72, .1, .55], [2.72, 1.62, .45, .78, .1, .58], [-3.15, 1.12, -.35, .62, .09, .48], [3.1, 1.2, -.28, .65, .09, .5],
        [-1.95, 1.08, -1.25, .72, .09, .5], [1.9, 1.0, -1.2, .7, .09, .52]];
      clusters.forEach((c, ci) => {   // thick colonies on the deck, shoulders, claws and legs
        for (let j = 0; j < 16; j++) {
          const aa = j * 2.399 + ci * .63, rr = .12 + (j % 5) * .1;
          add(crab, def(.18 + (j % 4) * .045, .035, .14 + (j % 3) * .05, 3000 + ci * 20 + j, 2), j % 5 === 0 ? darkMoss : wetMoss,
            [c[0] + Math.cos(aa) * rr * c[3], c[1] + Math.sin(j * .8) * c[4], c[2] + Math.sin(aa) * rr * c[5]]).rotation.set((j % 3 - 1) * .12, aa, (j % 5 - 2) * .05);
        }
      });
      for (const side of [-1, 1]) for (let i = 0; i < 58; i++) {   // moss islands
        const t = ((i * 23) % 57) / 56, a = i * 2.399, x = side * (2.35 + t * 1.5), y = 1.2 + Math.sin(t * Math.PI) * .82 + Math.sin(a) * .08, z = .45 + Math.cos(a) * (.32 + (i % 4) * .055);
        add(crab, def(.18 + (i % 5) * .045, .035 + (i % 3) * .012, .14 + (i % 4) * .04, 3600 + i + (side > 0 ? 100 : 0), 2), i % 6 === 0 ? darkMoss : wetMoss, [x, y, z]).rotation.set((i % 3 - 1) * .18, a, (i % 5 - 2) * .08);
      }
      for (let i = 0; i < 38; i++) {   // moss curtains from the oldest wreck
        const x = -2.35 + (i % 13) * .39, z = -.95 + (i % 7) * .31, y = 2.35 + (i % 5) * .16;
        taperTube(crab, [V(x, y, z), V(x + Math.sin(i) * .08, y - .42 - (i % 4) * .1, z + .04), V(x + Math.cos(i * .7) * .13, y - .9 - (i % 7) * .11, z + .08)], .035, .004, i % 4 === 0 ? darkMoss : wetMoss);
      }
      for (let i = 0; i < 31; i++) {   // rotten hollows with their fibres showing
        const a = i * 2.21, x = Math.sin(a) * (1.15 + (i % 7) * .27), z = Math.cos(a) * (.8 + (i % 5) * .23), y = 1.28 + ((i * 13) % 17) * .095;
        add(crab, def(.09 + (i % 4) * .035, .018, .16 + (i % 5) * .035, 2400 + i, 2), tm.rot, [x, y, z]).rotation.set((i % 3 - 1) * .2, a, (i % 5 - 2) * .09);
        for (let j = 0; j < 3; j++) taperTube(crab, [V(x + (j - 1) * .055, y + .015, z - .12), V(x + (j - 1) * .075, y + .025, z + .02), V(x + (j - 1) * .04, y + .01, z + .13)], .012, .003, tm.rotEdge);
      }
      for (let i = 0; i < 52; i++) {   // splinters breaking the old timber's outline
        const side = i % 2 ? -1 : 1, y = .65 + (i % 13) * .19, z = -1.35 + (i % 9) * .32, x = side * (2.15 + (i % 7) * .12);
        taperTube(crab, [V(x, y, z), V(x + side * (.16 + (i % 4) * .05), y + (i % 3 - 1) * .08, z + .04), V(x + side * (.32 + (i % 5) * .06), y - .04, z + (i % 3 - 1) * .08)], .022, .002, i % 4 ? M.wood2 : tm.rotEdge);
      }
      for (let i = 0; i < 19; i++) {   // little shelf fungi on the dampest wood
        const a = i * 2.7, x = Math.sin(a) * (1.45 + (i % 5) * .24), z = Math.cos(a) * (.85 + (i % 4) * .2), y = 1.0 + (i % 8) * .26;
        add(crab, new THREE.SphereGeometry(.09 + (i % 3) * .025, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), tm.fungus, [x, y, z], [1.5, .28, 1]).rotation.set((i % 3 - 1) * .2, a, (i % 4 - 1.5) * .1);
      }
    }

    // a group turning about point p (its parts were placed in the body's space)
    function pivot(group, p) { group.children.forEach(c => c.position.sub(p)); group.position.copy(p); return group; }

    function makeTidewife() {
      const g = new THREE.Group(), crab = new THREE.Group(); g.add(crab);
      const glow = M.glow.clone();   // (her own, so her lanterns can blaze)

      // a broad, deep carapace: hull belly and wreck shell
      add(crab, def(3.15, 1.18, 2.45, 801, 4), M.black, [0, 1.72, -.05]);
      add(crab, def(2.85, .88, 2.18, 803, 4), M.wood2, [0, 2.12, -.12]);
      for (let i = -14; i <= 14; i++) {   // curved hull planking over the shell
        const x = i * .205, crown = .48 * (1 - Math.pow(Math.abs(i) / 15, 1.7));
        const q = add(crab, new THREE.BoxGeometry(.16, .105, 4.25, 2, 1, 5), i % 4 ? M.wood : M.wood2, [x, 2.45 + crown, -.18]);
        q.rotation.z = -i * .018; q.rotation.x = (i % 3 - 1) * .018;
      }
      for (const sx of [-1, 1]) for (let j = 0; j < 9; j++) {   // ship's ribs flaring out like the shell's rim
        const z = -1.72 + j * .43;
        taperTube(crab, [V(sx * 1.55, 2.05, z), V(sx * 2.55, 2.15, z * .94), V(sx * 3.08, 1.6, z * .86)], .095, .035, j % 3 ? M.wood2 : M.wood);
      }
      // the face: broken bow timbers and splinter teeth
      add(crab, def(1.55, .56, .82, 808, 3), M.wood, [0, 1.68, 2.12]);
      for (let i = -5; i <= 5; i++) plank(crab, [i * .25, 1.78 + Math.abs(i) * .025, 2.52], [.2, .16, .82], [.06 * (i % 2), -.05 * i, 0], i % 3 ? M.wood : M.wood2);
      for (let i = 0; i < 9; i++) { const q = add(crab, new THREE.ConeGeometry(.055, .5 + (i % 3) * .15, 6), M.wood2, [-.92 + i * .23, 1.42, 2.87]); q.rotation.x = Math.PI / 2; q.rotation.z = (i % 2 - .5) * .18; }

      // four pairs of walking legs, three jointed segments each, iron bands at the joints
      for (const sx of [-1, 1]) for (let j = 0; j < 4; j++) {
        const z = 1.18 - j * .82, hip = V(sx * 2.18, 1.55, z), knee = V(sx * (3.45 + j * .18), 1.12, z + .12), ankle = V(sx * (4.25 + j * .28), .55, z + .42), foot = V(sx * (4.85 + j * .34), .12, z + .82);
        add(crab, def(.32, .3, .34, 820 + j + (sx > 0 ? 10 : 0), 2), M.wood2, [hip.x, hip.y, hip.z]);
        jointChain(crab, [hip, knee, ankle, foot], .24, .055, j % 2 ? M.wood : M.wood2);
        for (const p of [knee, ankle]) add(crab, new THREE.TorusGeometry(.18, .028, 6, 12), M.black, [p.x, p.y, p.z]).rotation.y = Math.PI / 2;
      }

      // two massive claws: a palm of hull and planks, pincers of long curved wreck beams (each turns about its shoulder)
      const arms = [];
      for (const sx of [-1, 1]) {
        const arm = new THREE.Group(), shoulder = V(sx * 2.25, 1.7, 1.45);
        jointChain(arm, [shoulder, V(sx * 3.25, 1.85, 2.0), V(sx * 3.9, 1.62, 2.75)], .42, .22, M.wood2);
        add(arm, def(1.05, .72, 1.28, 850 + (sx > 0 ? 1 : 0), 3), M.wood, [sx * 4.35, 1.75, 3.38]);
        for (let k = -3; k <= 3; k++) plank(arm, [sx * (4.28 + k * .08), 1.78 + k * .055, 3.38], [.18, .13, 2.05], [0, sx * .08 * k, .04 * k], k % 2 ? M.wood2 : M.wood);
        const base = V(sx * 4.45, 1.8, 4.15);
        taperTube(arm, [base, V(sx * 4.75, 2.35, 4.85), V(sx * 4.55, 2.7, 5.55), V(sx * 4.12, 2.52, 6.05)], .30, .045, M.wood2);
        taperTube(arm, [base, V(sx * 4.82, 1.45, 4.88), V(sx * 4.72, 1.18, 5.58), V(sx * 4.28, 1.38, 6.0)], .32, .045, M.wood);
        crab.add(pivot(arm, shoulder)); arms.push(arm);
      }

      // lantern eyes: ship's lanterns on crab eyestalks (the stalk stretches when she rears)
      const eyes = [];
      for (const sx of [-1, 1]) {
        const s0 = V(sx * .62, 2.22, 2.25), s1 = V(sx * .72, 3.08, 2.55), st = new THREE.Group(), stalk = new THREE.Group(), lamp = new THREE.Group();
        taperTube(stalk, [V(0, 0, 0), s1.clone().sub(s0)], .085, .045, M.wood2);
        add(lamp, new THREE.CylinderGeometry(.22, .27, .13, 8), M.black, [0, .32, 0]);
        add(lamp, new THREE.CylinderGeometry(.25, .2, .13, 8), M.black, [0, -.31, 0]);
        const glass = add(lamp, new THREE.CylinderGeometry(.18, .18, .52, 10), glow);
        const flame = add(lamp, new THREE.SphereGeometry(.075, 10, 7), new THREE.MeshBasicMaterial({ color: 0xffc35a }), [0, -.055, 0], [1, 1.45, 1]);
        const halo = add(lamp, new THREE.SphereGeometry(.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: .11, blending: THREE.AdditiveBlending, depthWrite: false }), [0, 0, 0], [1, 1.15, 1]);
        for (let c = 0; c < 6; c++) { const aa = c / 6 * Math.PI * 2, xx = Math.cos(aa) * .205, zz = Math.sin(aa) * .205; limb(lamp, V(xx, -.27, zz), V(xx, .27, zz), .018, .018, M.black); }
        add(lamp, new THREE.TorusGeometry(.16, .025, 6, 14), M.black, [0, .5, 0]).rotation.x = Math.PI / 2;
        lamp.position.copy(s1).sub(s0); st.position.copy(s0); st.add(stalk, lamp); crab.add(st);
        eyes.push({ stalk, lamp, tip: lamp.position.clone(), glass, flame, halo, seed: sx < 0 ? 1.7 : 4.3, fseed: sx < 0 ? 2.2 : 5.1, hseed: sx < 0 ? 3.1 : 6.2 });
      }

      // the whole wrecked deck on her back
      const deck = new THREE.Group(); deck.position.set(0, 2.72, -.2); deck.rotation.z = -.035; crab.add(deck);
      for (let i = -13; i <= 13; i++) { const edge = Math.abs(i) / 14; plank(deck, [i * .19, .02, -.05], [.16, .09, 3.65 * (1 - edge * .32)], [0, (i % 3 - 1) * .008, (i % 5 - 2) * .006], i % 4 ? M.wood : M.wood2); }
      for (let i = -6; i <= 6; i++) plank(deck, [i * .18, .34, -1.22], [.16, .08, 1.35], [0, 0, (i % 3 - 1) * .01], i % 3 ? M.wood2 : M.wood);   // the quarterdeck
      for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) {   // broken railings and posts
        const z = -1.55 + i * .43, h = .45 + (i % 3) * .12;
        limb(deck, V(sx * 2.25, .05, z), V(sx * 2.25, .05 + h, z), .035, .025, M.wood2);
        if (i < 7) limb(deck, V(sx * 2.25, .38, z), V(sx * 2.25, .38, -1.55 + (i + 1) * .43), .025, .018, M.wood2);
      }
      add(deck, new THREE.BoxGeometry(1.05, .035, .72), M.black, [.65, .11, .15]);   // the hatch, open and dark
      for (const [x, z, w, d] of [[.65, -.25, 1.2, .08], [.65, .55, 1.2, .08], [.08, .15, .08, .72], [1.22, .15, .08, .72]]) plank(deck, [x, .16, z], [w, .09, d], [0, 0, 0], M.wood2);
      plank(deck, [-1.05, .48, -.95], [1.15, .9, .12], [0, .05, 0], M.wood2); plank(deck, [-1.58, .48, -.5], [.12, .9, .85], [0, 0, 0], M.wood);   // what's left of the cabin
      add(deck, new THREE.BoxGeometry(.34, .34, .04), M.black, [-1.05, .55, -.88]);
      add(deck, new THREE.CylinderGeometry(.19, .25, .55, 10), M.wood2, [-.45, .34, .35]);   // the capstan
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; limb(deck, V(-.45, .55, .35), V(-.45 + Math.cos(a) * .55, .55, .35 + Math.sin(a) * .55), .025, .018, M.wood); }
      for (let i = 0; i < 3; i++) add(deck, new THREE.CylinderGeometry(.18, .18, .5, 10), M.wood, [1.25 + i * .38, .28, -.85 + i * .15]).rotation.z = Math.PI / 2;   // barrels
      for (let i = 0; i < 4; i++) plank(deck, [-.35 + i * .38, .25, -1.55], [.34, .34, .34], [0, i * .11, 0], i % 2 ? M.wood : M.wood2);   // crates
      for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) add(deck, new THREE.TorusGeometry(.18 + i * .035, .012, 5, 20), M.wood2, [1.35 + j * .28, .13, .55 + j * .28]).rotation.x = Math.PI / 2;   // rope coils

      // a curtain of kelp underneath (its own group: it burns away)
      const kelp = new THREE.Group(); crab.add(kelp);
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, q = add(kelp, new THREE.PlaneGeometry(.12 + (i % 5) * .045, 1.2 + (i % 9) * .18, 1, 6), M.kelp, [Math.sin(a) * 2.55, .58, Math.cos(a) * 1.85]); q.rotation.y = a; q.rotation.z = Math.sin(i * .9) * .16; }
      rotAndMoss(crab);
      clawBarnacles(crab);
      const sail = sailRig(crab);
      // her shore's air: dripping seawater, salt mist, shore flies
      const fxs = [fx.drips(crab, 105, 4.5, .1, 3.5, 0x9eb7b0), fx.pointCloud(crab, 150, 5, .1, 2.8, 0xc5d2ca, .022, .22), fx.fireflies(crab, 22, 4.2, .3, 2.6, 0x8c826d)];
      const light = new THREE.PointLight(0xffad45, 3, 7.5, 2); light.position.set(0, 3.08, 2.55); crab.add(light);   // (both lanterns)

      // about two thousand parts: bake what doesn't move into one mesh per material
      bake(crab, [...arms, ...eyes.map(e => e.stalk), ...eyes.map(e => e.lamp), kelp, sail, ...fxs]);
      arms.forEach(a => bake(a));
      eyes.forEach(e => { bake(e.stalk); bake(e.lamp, [e.glass, e.flame, e.halo]); });
      BK.solidShadows(crab); sail.castShadow = true;
      crab.position.y = TW_Y;
      g.userData = { body: crab, eyes, arms, kelp, sail, light, glow };
      return g;
    }

    UI.mobs.register('boss_tidewife', {
      make: makeTidewife,
      pose(m, dt, now) {
        const { body, eyes, arms, kelp, sail, light, glow } = m.mesh.userData, s = (now - m.stateAt) / 1000, t = now / 1000;
        kelp.visible = m.extra !== 0;
        kelp.children.forEach((k, i) => { k.rotation.x = Math.sin(now / 500 + i) * .15; });

        const rear = m.state === 'rear' ? Math.min(1, s / .5) : m.state === 'recover' && s < .3 ? 1 - s / .3 : 0;
        body.rotation.x += (-.65 * rear - body.rotation.x) * Math.min(1, dt * 12);
        // the lanterns flicker; rearing up, they blaze and their stalks stretch
        const lf = .78 + Math.sin(t * 8.7 + 1.3) * .12 + Math.sin(t * 17.3 + 2.73) * .07 + Math.sin(t * 31.1 + .91) * .035;
        light.intensity = 3 * (1 + rear * .8) * Math.max(.52, lf); light.position.y = 3.08 + rear * .6;
        const gf = .84 + Math.sin(t * 9.1 + 1.7) * .08 + Math.sin(t * 23.7 + 2.38) * .045;
        glow.emissiveIntensity = 1.4 * (1 + rear * 1.2) * Math.max(.65, gf);
        eyes.forEach(({ stalk, lamp, tip, flame, halo, fseed, hseed }) => {
          const k = 1 + rear * .6; stalk.scale.y = k; lamp.position.set(tip.x, tip.y * k, tip.z);
          const f = .9 + Math.sin(t * 12.5 + fseed) * .08 + Math.sin(t * 27.4 + fseed) * .045;
          flame.scale.set(.92 + f * .07, 1.15 + f * .32, .92 + f * .07);
          const h = Math.max(.55, .82 + Math.sin(t * 8.4 + hseed) * .1 + Math.sin(t * 19.2 + hseed) * .055);
          halo.material.opacity = (.07 + h * .055) * (1 + rear); halo.scale.setScalar(.92 + h * .13);
        });

        const swipe = m.state === 'claw' ? Math.sin(Math.min(1, s / .9) * Math.PI) : 0, heave = m.state === 'throw' ? Math.min(1, s / .6) : 0;
        arms[1].rotation.y = -swipe * .9; arms[0].rotation.x = -heave * 1.2;

        // the torn sail: its top stays rigged, the lower cloth moves more
        const a = sail.geometry.attributes.position.array, b = sail.userData.base;
        for (let i = 0; i < a.length; i += 3) {
          const u = (i / 3) % 15 / 14, v = Math.floor((i / 3) / 15) / 10;
          a[i] = b[i] + Math.sin(t * 1.35 + v * 3.8 + u * 5.5) * (.025 + .12 * v); a[i + 2] = b[i + 2] + Math.sin(t * 1.7 + u * 4.2 + v * 2.3) * (.035 + .16 * v);
        }
        sail.geometry.attributes.position.needsUpdate = true; sail.geometry.computeVertexNormals();
        body.position.y = TW_Y + Math.sin(now / 400) * .04 + (UI.bosses && UI.bosses.phaseOf(m.id) ? Math.sin(now / 90) * .02 : 0);
      },
    });
  }

  // The wreck beam she heaves (bossfx 'wreck').
  const twBeamMat = softShared(0x3b3025);
  const twBeams = [];
  UI.net.on('bossfx', m => {
    if (m.k !== 'wreck') return;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(.25, .2, 1.6), twBeamMat); scene.add(beam);
    twBeams.push({ beam, fx: m.fx, fz: m.fz, x: m.x, z: m.z, t: 0, ms: m.ms || 1400 });
  });
  UI.onFrame(dt => {
    for (let i = twBeams.length - 1; i >= 0; i--) {
      const b = twBeams[i]; b.t += dt * 1000;
      const k = Math.min(1, b.t / b.ms), x = b.fx + (b.x - b.fx) * k, z = b.fz + (b.z - b.fz) * k;
      b.beam.position.set(x, Math.max(groundAt(x, z), 0) + .3 + Math.sin(k * Math.PI) * 6, z);
      b.beam.rotation.set(k * 8, Math.atan2(b.x - b.fx, b.z - b.fz), 0);
      if (k >= 1) { scene.remove(b.beam); b.beam.geometry.dispose(); twBeams.splice(i, 1); }
    }
  });
