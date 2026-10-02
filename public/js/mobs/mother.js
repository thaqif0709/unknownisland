  // ---- boss: the Hanging Mother (C4, the Weeping Wood's boss; the V15 "Hero Boss Lab" model, part for part) ----
  // A gigantic hanging orb-weaver, upside down: a black abdomen in segmented plates under a coat
  // of old silk, hair and forest litter, a pale face tucked beneath with glowing eyes and hooked
  // mouthparts, eight jointed legs with knuckled joints reaching up into the canopy, three
  // load-bearing vines fused into her back, an anchor web with cocoons hanging in it, and the
  // Wood's air around her: drifting silk, spores and pale fireflies. Up in the canopy (extra 1)
  // she sways far overhead; on a snatch she drops until her mouth touches the ground; with her
  // vines cut she lies tipped over. Her three vines are separate mobs (mother_vine). The static
  // parts are baked into one mesh per material (100-plants-and-rocks.js `bake`); the little
  // eyes flicker.
  {
    const { M, V, add, def, taperTube, jointChain, fx } = BK;
    const mm = { silk: softShared(0xc8c2ad), bark: softShared(0x2b251e), moss: softShared(0x35412b) };
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8efb0 });
    function detailPass(g, eyes) {
      for (let i = 0; i < 72; i++) {   // layered webbing and hair across the body and joints
        const a = i * 2.399, r = .65 + (i % 11) * .085, y = 2.45 - ((i * 17) % 61) / 60 * 4.45;
        taperTube(g, [V(Math.cos(a) * r, y, Math.sin(a) * r * .72), V(Math.cos(a + .7) * (r + .28), y - .28 - Math.sin(i) * .12, Math.sin(a + .7) * (r + .28) * .72)], .008, .0015, mm.silk);
      }
      for (let i = 0; i < 54; i++) {   // old bark, lichen and moss caught in the abdomen's coat
        const a = i * 2.17, y = -1.15 + ((i * 23) % 53) / 52 * 3.9, r = 1.0 - (Math.abs(y - .5) * .07);
        add(g, def(.12 + (i % 4) * .035, .025, .09 + (i % 3) * .03, 5100 + i, 1), i % 4 ? mm.moss : mm.bark, [Math.cos(a) * r, y, Math.sin(a) * r * .72]).rotation.set(a * .08, a, (i % 5 - 2) * .08);
      }
      for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) {   // tiny eyes: pinpoints that flicker on their own
        const eye = add(g, new THREE.SphereGeometry(.025 + j * .006, 8, 6), eyeMat, [sx * (.13 + j * .07), -1.77 + j * .035, 1.31]);
        eye.userData.flickerSeed = 7 + j + sx * 1.7; eyes.push(eye);
      }
    }
    function makeMother() {
      const g = new THREE.Group(), body = new THREE.Group(), eyes = [];
      add(body, def(1.55, 2.55, 1.28, 1001, 4), M.black, [0, .65, -.18]);   // abdomen
      add(body, def(1.08, .9, 1.0, 1003, 4), M.black, [0, -1.25, .08]);     // cephalothorax
      for (let r = 0; r < 8; r++) add(body, new THREE.TorusGeometry(1.18 - r * .035, .055, 7, 28), r % 3 ? M.black : M.wood2, [0, 2.05 - r * .43, -.15]).rotation.x = Math.PI / 2;   // abdomen plates
      add(body, def(.52, .4, .35, 1007, 3), M.pale, [0, -1.8, .96]);   // the face, tucked beneath
      for (const sx of [-1, 1]) {
        add(body, new THREE.SphereGeometry(.052, 12, 7), M.glow, [sx * .18, -1.79, 1.28]);
        taperTube(body, [V(sx * .16, -1.95, 1.18), V(sx * .25, -2.18, 1.38), V(sx * .08, -2.32, 1.48)], .055, .012, M.bone);   // hooked mouthparts
      }
      for (let i = 0; i < 8; i++) {   // eight jointed legs reaching up into the canopy
        const side = i < 4 ? -1 : 1, j = i % 4, z = .82 - j * .52;
        const p0 = V(side * .72, -.95 + j * .16, z), p1 = V(side * (1.45 + j * .14), -.55 + j * .12, z * 1.08),
          p2 = V(side * (2.28 + j * .23), .45 + (j % 2) * .48, z * 1.34), p3 = V(side * (3.12 + j * .3), 2.18 + (j % 2) * .55, z * 1.7),
          p4 = V(side * (3.72 + j * .38), 4.25 + (j % 3) * .42, z * 2.05);
        jointChain(body, [p0, p1, p2, p3, p4], .13, .018, M.stone2);
        for (let f = -1; f <= 1; f++) taperTube(body, [p4, p4.clone().add(V(side * .18, .35, f * .11)), p4.clone().add(V(side * .08, .58, f * .16))], .015, .002, M.stone2);
      }
      for (let i = 0; i < 125; i++) {   // forest litter, vines, silk and hair grown into her outer coat
        const aa = i * 2.399, rad = .38 + (i % 15) * .065;
        const st = V(Math.sin(aa) * rad, 1.35 + (i % 7) * .18, Math.cos(aa) * rad * .72),
          md = V(Math.sin(aa) * (1 + (i % 6) * .08), -.45 - (i % 11) * .1, Math.cos(aa) * (.72 + (i % 5) * .07)),
          en = V(Math.sin(aa) * (1.1 + (i % 5) * .12), -2.25 - (i % 9) * .16, Math.cos(aa) * (.8 + (i % 4) * .08));
        taperTube(body, [st, md, en], .018, .003, i % 8 === 0 ? M.moss : (i % 5 === 0 ? M.bone : M.black));
      }
      for (let i = 0; i < 3; i++) {   // three load-bearing vines fused into her back
        const aa = i / 3 * Math.PI * 2 + .3;
        taperTube(body, [V(Math.cos(aa) * .5, 2.2, Math.sin(aa) * .4), V(Math.cos(aa) * 1.05, 4.4, Math.sin(aa) * .85), V(Math.cos(aa) * 2.1, 8.0, Math.sin(aa) * 1.75)], .12, .04, M.moss);
      }
      for (let i = 0; i < 24; i++) {   // the anchor web
        const aa = i / 24 * Math.PI * 2;
        taperTube(body, [V(Math.cos(aa) * .7, 1.8, Math.sin(aa) * .5), V(Math.cos(aa) * 2.2, 4.6 + (i % 5) * .45, Math.sin(aa) * 1.8)], .009, .002, M.bone);
      }
      for (let i = 0; i < 11; i++) {   // cocoons hanging beside her (in the studies they hang from the scene, 4.9 below her centre)
        const x = -2 + (i % 6) * .75, z = -1.25 + (i % 4) * .72;
        taperTube(body, [V(x, 7.0 - 4.9, z), V(x * .92, 3.7 + (i % 3) * .45 - 4.9, z)], .012, .005, M.bone);
        add(body, def(.18, .48, .15, 1100 + i, 2), M.bone, [x * .92, 3.3 + (i % 3) * .45 - 4.9, z]);
      }
      detailPass(body, eyes);
      // the Wood's air: drifting silk, spores and moth-pale fireflies
      const fxs = [fx.silk(body, 210, 4.7, -2.4, 8), fx.pointCloud(body, 145, 4.2, -1.5, 7.2, 0x9f9b79, .027, .3), fx.fireflies(body, 34, 3.7, -.5, 6.5, 0xc8d987)];
      bake(body, [...eyes, ...fxs]);   // hundreds of parts: one mesh per material (the eyes stay apart, they flicker)
      BK.solidShadows(body);
      body.position.y = 15.5;
      g.add(body);
      g.userData = { body, eyes };
      return g;
    }
    UI.mobs.register('boss_mother', {
      make: makeMother,
      pose(m, dt, now) {
        // up in the canopy (her mouth some 13 m up), dropped on a snatch (her mouth at the ground), or tipped over once fallen
        const { body, eyes } = m.mesh.userData, up = m.extra === 1, t = now / 1000;
        const y = up ? 15.5 : m.state === 'snatch' ? 2.4 : 1.8;
        body.position.y += (y - body.position.y) * Math.min(1, dt * (up ? 2.5 : 10));
        body.rotation.z = up ? Math.sin(now / 1200) * .06 : m.state === 'fallen' ? 1.3 : 0;
        for (const e of eyes) { const k = e.userData.flickerSeed, f = .72 + Math.sin(t * 5.3 + k) * .18 + Math.sin(t * 13.7 + k) * .08; e.scale.setScalar(Math.max(.55, f)); }
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
