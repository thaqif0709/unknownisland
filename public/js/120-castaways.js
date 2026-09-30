  // ================= Castaways =================
  // Each player's cloak has its own colour so friends can tell each other apart.
  const CLOAKS = [0x8A6A52, 0x6F7B5A, 0x5F6F85, 0x8C5A4F, 0x6E5F7A, 0x9A8A6A, 0x4F6B66, 0x7A4F4F, 0x5E5A57, 0xA07A4A];
  const colorFor = id => CLOAKS[(id - 1) % CLOAKS.length];
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const frogM = soft(0x7DBB3C), spotM = soft(0x4E8A2E), throatM = soft(0xC9DC86), webM = soft(0xE8872E), ropeM = soft(0xC9A86A);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xE8872E }), irisM = new THREE.MeshBasicMaterial({ color: 0x3A2620 }),
    shineM = new THREE.MeshBasicMaterial({ color: 0xFFF8EA }), mouthM = new THREE.MeshBasicMaterial({ color: 0x2B211F });
  const cyl = (rt, rb, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);

  // The robe: an open tube that flares toward the hem, with soft folds and a torn,
  // uneven bottom edge (deep notches, longer tongues of cloth), built once and shared.
  let robeGeo = null;
  function raggedRobe() {
    if (robeGeo) return robeGeo;
    const H = .82, seg = 40, rows = 6, g = new THREE.CylinderGeometry(.2, .4, H, seg, rows, true), pos = g.attributes.position, r = mulberry32(4242);
    const tear = [];   // per column: how far the hem hangs down (+) or is torn up (-)
    for (let j = 0; j <= seg; j++) tear.push(j === seg ? tear[0] : (r() < .22 ? -(.05 + r() * .09) : r() * .07) + Math.sin(j * 1.7) * .015);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(x, z), k = (H / 2 - y) / H;   // 0 top, 1 hem
      const col = Math.round(((a / (Math.PI * 2)) + 1) % 1 * seg) % seg;
      const fold = 1 + Math.sin(a * 7) * .05 * k + Math.sin(a * 3 + 1) * .03 * k;   // folds grow toward the hem
      pos.setX(i, x * fold); pos.setZ(i, z * fold);
      pos.setY(i, y - tear[col] * k * k * (k > .99 ? 1 : .6));
    }
    g.computeVertexNormals();
    return (robeGeo = g);
  }

  // Cowl round the neck (a flared ring of cloth) and the hood's drooping point
  // (a bent teardrop). Both built once and shared.
  let cowl = null, hoodTip = null;
  function cowlGeo() {
    if (cowl) return cowl;
    const prof = [[.2, -.16], [.27, -.1], [.31, 0], [.335, .1], [.33, .17], [.29, .2]].map(([r, y]) => new THREE.Vector2(r, y));
    cowl = new THREE.LatheGeometry(prof, 24);
    const pos = cowl.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(x, z), k = 1 + Math.sin(a * 6) * .03; pos.setX(i, x * k); pos.setZ(i, z * k); }
    cowl.computeVertexNormals();
    return cowl;
  }
  function hoodTipGeo() {
    if (hoodTip) return hoodTip;
    const prof = []; for (let i = 0; i <= 12; i++) { const t2 = i / 12; prof.push(new THREE.Vector2(.19 * Math.pow(1 - t2, 1.3) + .004, t2 * .5)); }
    hoodTip = new THREE.LatheGeometry(prof, 14);
    const pos = hoodTip.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, pos.getZ(i) - y * y * .7); }   // droops as it goes
    hoodTip.computeVertexNormals();
    return hoodTip;
  }
  // A bucket: tapered tub with two hoops and a handle, water on top if full.
  const bucketMats = { wood: soft(0xA57A55), iron: soft(0x8E96A0) }, hoopM = soft(0x4A3A34),
    seaWaterM = new THREE.MeshBasicMaterial({ color: 0x5E8FA8 }), cleanWaterM = new THREE.MeshBasicMaterial({ color: 0x9FD3E6 });
  function bucketModel(mat, water, k = 1) {
    const g = new THREE.Group(), add = (geo, m, y) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y * k; mesh.scale.setScalar(k); g.add(mesh); return mesh; };
    add(new THREE.CylinderGeometry(.17, .13, .26, 14, 1, true), bucketMats[mat] || bucketMats.wood, .13).material.side = THREE.DoubleSide;
    add(new THREE.CircleGeometry(.13, 14), bucketMats[mat] || bucketMats.wood, .005).rotation.x = -Math.PI / 2;
    for (const y of [.06, .2]) add(new THREE.TorusGeometry(.14 + y * .12, .012, 5, 18), hoopM, y).rotation.x = Math.PI / 2;
    const h = add(new THREE.TorusGeometry(.16, .01, 5, 16, Math.PI), hoopM, .26);
    if (water && water !== 'none') add(new THREE.CircleGeometry(.162, 14), water === 'sea' ? seaWaterM : cleanWaterM, .22).rotation.x = -Math.PI / 2;
    shadows(g);
    return g;
  }

  const torchFlameM = new THREE.MeshBasicMaterial({ color: 0xFFB347 });
  // The item in your right hand: a small model of whatever is selected.
  function heldModel(key) {
    if (key.startsWith('bucket:')) { const [, mat, water] = key.split(':'), b = bucketModel(mat, water, .8); b.position.y = -.22; const g0 = new THREE.Group(); g0.add(b); return g0; }
    const g = new THREE.Group(), add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    switch (key) {
      case 'wood': add(new THREE.CylinderGeometry(.06, .06, .34, 8), logM, 0, 0, 0).rotation.z = Math.PI / 2; break;
      case 'stone': add(new THREE.DodecahedronGeometry(.1, 0), rockM[0], 0, 0, 0).scale.set(1.1, .8, 1); break;
      case 'clay': add(new THREE.SphereGeometry(.09, 8, 6), clayM, 0, 0, 0).scale.set(1.2, .8, 1); break;
      case 'copper': case 'iron': add(new THREE.DodecahedronGeometry(.1, 0), rockM[1], 0, 0, 0);
        add(new THREE.SphereGeometry(.035, 6, 4), softShared(key === 'copper' ? 0xD9803A : 0xC9D2DA), .06, .04, .05); break;
      case 'seeds': for (const [x, z] of [[-.03, 0], [.03, .02], [0, -.03]]) add(new THREE.SphereGeometry(.03, 6, 4), softShared(0xC8A860), x, 0, z).scale.set(.8, .6, 1.3); break;
      case 'torch': {   // held out in front, the flame up top (it lights the way underground, W9)
        const d = new THREE.Vector3(0, .5, .87).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        add(new THREE.CylinderGeometry(.022, .028, .42, 6), logM, d.x * .12, d.y * .12, d.z * .12).quaternion.copy(q);
        add(new THREE.SphereGeometry(.055, 8, 6), softShared(0x8A6A52), d.x * .33, d.y * .33, d.z * .33).scale.set(1, 1.3, 1);
        const fl = add(new THREE.ConeGeometry(.06, .2, 7), torchFlameM, d.x * .33, d.y * .33 + .12, d.z * .33);
        g.userData.flame = fl;
        break; }
      case 'oil': add(new THREE.SphereGeometry(.07, 10, 8), softShared(0xE0A33A), 0, 0, 0); add(new THREE.CylinderGeometry(.025, .03, .07, 8), logM, 0, .09, 0); break;
      // Swung tools: a handle hanging from the fist with the head at the tip. The axe
      // blade's edge faces -x, the way the sideways chop sweeps (the right arm sits at +x);
      // the pick's two points lie along z, the plane the overhead strike comes down in.
      case 'axe': add(new THREE.CylinderGeometry(.022, .026, .42, 6), logM, 0, -.24, 0);
        add(new THREE.BoxGeometry(.14, .15, .04), softShared(0x8C6B4A), -.06, -.42, 0); break;
      case 'pickaxe': add(new THREE.CylinderGeometry(.02, .024, .42, 6), logM, 0, -.24, 0);
        add(new THREE.ConeGeometry(.022, .2, 5), rockM[1], 0, -.45, .1).rotation.x = Math.PI / 2;
        add(new THREE.ConeGeometry(.022, .2, 5), rockM[1], 0, -.45, -.1).rotation.x = -Math.PI / 2; break;
      default: add(new THREE.BoxGeometry(.12, .12, .12), sackM, 0, 0, 0);
    }
    shadows(g);
    return g;
  }
  function setHeld(av, key) {
    if (!av || av.heldKey === (key || null)) return;
    if (av.held) { av.armR.remove(av.held); av.held = null; }
    av.heldKey = key || null;
    if (key) { av.held = heldModel(key); av.held.position.set(0, -.5, .07); av.armR.add(av.held); }
  }
  function setHood(av, up) { if (!av) return; av.hoodUp.visible = !!up; av.hoodDown.visible = !up; }
  // The tool shown only while a swing is in progress (axe/pickaxe), separate from
  // whatever hotbar item is normally in hand; hides that item for the moment so
  // you don't appear to be chopping a tree with a fistful of wood.
  function setSwingTool(av, key) {
    if (!av) return;
    if (av.swingTool) { av.armR.remove(av.swingTool); av.swingTool = null; }
    if (key) {
      av.swingTool = heldModel(key);
      av.swingTool.position.set(0, -.5, .07);
      av.armR.add(av.swingTool);
    }
    if (av.held) av.held.visible = !key;
  }
  // Start a swing. 'mine' raises a pickaxe overhead and brings it straight down;
  // 'chop' holds an axe out level and sweeps it sideways; anything else is the
  // plain bare-handed reach used for fires, lanterns and digging.
  function startSwing(av, kind, t = .35) {
    if (!av) return;
    av.swingT = t; av.swingKind = kind || null;
    av.armR.rotation.y = 0; if (av.body) av.body.rotation.y = 0;   // a swing cut short by the next starts square
    setSwingTool(av, kind === 'chop' ? 'axe' : kind === 'mine' ? 'pickaxe' : null);
  }

  // A frog castaway in a simple hooded cloak: part wizard, part wanderer.
  function makeCastaway(cloak) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const add = (m, x, y, z, parent = body) => { m.position.set(x, y, z); parent.add(m); return m; };
    const cloakM = softShared(cloak);
    const patchM = softShared(new THREE.Color(cloak).lerp(new THREE.Color(0xE9D7AE), .45).getHex());
    const innerM = softShared(new THREE.Color(cloak).multiplyScalar(.7).getHex());

    // bare green legs and webbed feet under the robe
    // legs: a thigh from the hip and a shin hanging from the knee, so knees can bend
    function leg(x) {
      const p = new THREE.Group(); p.position.set(x, .6, 0); body.add(p);
      add(cyl(.062, .058, .3, frogM), 0, -.14, 0, p);
      const knee = new THREE.Group(); knee.position.y = -.28; p.add(knee);
      add(ball(.06, frogM, 10, 8), 0, 0, 0, knee);
      add(cyl(.058, .055, .3, frogM), 0, -.14, 0, knee);
      add(ball(.09, frogM, 12, 8), 0, -.29, .05, knee).scale.set(1, .35, 1.5);
      for (const dx of [-.05, 0, .05]) add(ball(.035, webM, 8, 6), dx, -.305, .17, knee).scale.set(1, .5, 1.3);
      p.userData.knee = knee;
      return p;
    }
    const legL = leg(-.11), legR = leg(.11);
    // the robe: loose, long, ragged at the hem, tied with a rope, with a patch sewn on
    add(new THREE.Mesh(raggedRobe(), cloakM), 0, .74, 0);

    const belt = add(new THREE.Mesh(new THREE.TorusGeometry(.265, .026, 8, 24), ropeM), 0, .88, 0); belt.rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .2, 6), ropeM), .12, .77, .24).rotation.z = .2;   // rope end
    const patch = add(new THREE.Mesh(new THREE.BoxGeometry(.13, .12, .02), patchM), -.2, .62, .26); patch.rotation.set(-.2, -.6, .15);
    // the cowl: cloth gathered round the neck that the hood grows out of
    add(new THREE.Mesh(cowlGeo(), cloakM), 0, 1.16, 0);
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
    }
    // a small smile on the front of the face, just under the eyes
    const mouth = add(new THREE.Mesh(new THREE.TorusGeometry(.13, .012, 5, 24, Math.PI * .56), mouthM), 0, .2, .29, head);
    mouth.rotation.set(-.25, 0, -Math.PI / 2 - Math.PI * .28);
    // the hood: a cowl around the back and top of the head, open at the face, with a drooping tip
    const open = 1.45;
    const hoodUp = new THREE.Group(); head.add(hoodUp);
    // reaches further down than before so it meets the cowl with no gap
    const hood = add(new THREE.Mesh(new THREE.SphereGeometry(.36, 22, 16, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * .86), cloakM), 0, .06, -.02, hoodUp);
    hood.scale.set(1.2, 1.05, 1.12); hood.material.side = THREE.DoubleSide;
    const lining = add(new THREE.Mesh(new THREE.SphereGeometry(.345, 22, 16, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * .86), innerM), 0, .06, -.02, hoodUp);
    lining.scale.set(1.2, 1.05, 1.12); lining.material.side = THREE.BackSide;
    // the point grows out of the back of the hood (its wide base sits inside it) and droops
    const tip = add(new THREE.Mesh(hoodTipGeo(), cloakM), 0, .2, -.26, hoodUp);
    tip.rotation.x = -2.2;
    // hood down: fallen back and bunched behind the neck, the point hanging down the back
    const hoodDown = new THREE.Group(); body.add(hoodDown); hoodDown.visible = false;
    const bunch = add(new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 10), cloakM), 0, 1.26, -.2, hoodDown); bunch.scale.set(1.15, .55, .75);
    const fold = add(new THREE.Mesh(new THREE.SphereGeometry(.24, 14, 8), innerM), 0, 1.33, -.15, hoodDown); fold.scale.set(1.05, .3, .6);
    const hang = add(new THREE.Mesh(hoodTipGeo(), cloakM), 0, 1.24, -.3, hoodDown); hang.rotation.x = Math.PI + .35;
    // arms: wide ragged sleeves, green webbed hands
    function arm(x) {
      const p = new THREE.Group(); p.position.set(x, 1.08, 0); body.add(p);
      add(cyl(.065, .12, .36, cloakM), 0, -.18, 0, p);
      add(ball(.06, frogM, 10, 8), 0, -.4, 0, p).scale.set(1, 1.1, .75);
      for (const dx of [-.035, 0, .035]) add(ball(.024, webM, 6, 5), dx, -.465, 0, p);
      return p;
    }
    const armL = arm(-.27), armR = arm(.27);

    const av = { root, body, head, legL, legR, armL, armR, walk: 0, swingT: 0, hoodUp, hoodDown, sit: 0 };
    av.armL.rotation.z = -.18; av.armR.rotation.z = .18;
    av.armR.rotation.order = 'YXZ';   // yaw applies after the pitch, so a chop can sweep sideways (same pose as before while y is 0)
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
    const gh = av.under ? caveFloorAt(av.under, x, z) : groundAt(x, z), y = av.under ? gh : Math.max(gh, -.75);   // in a cave: its floor (W9)
    av.root.position.set(x, y, z);
    av.root.rotation.y = face;
    if (dead) { av.root.rotation.x = Math.max(-1.45, av.root.rotation.x - dt * 3); return; }
    av.root.rotation.x = 0;
    if (moving) av.walk += dt * (moving === 2 ? 15 : 10); else av.walk *= .9;
    const s = Math.sin(av.walk) * (moving ? .8 : 0);
    av.legL.rotation.x = s; av.legR.rotation.x = -s;
    av.armL.rotation.x = -s * .9;
    if (av.swingT > 0) {
      av.swingT -= dt;
      const k = Math.max(0, av.swingT) / .35, p = 1 - k, ease = x => x * x * (3 - 2 * x);
      if (av.swingKind === 'mine') {
        // raise the pickaxe up over the head, then bring it straight down onto the stone
        av.armR.rotation.x = p < .45 ? -2.9 * ease(p / .45)
          : p < .62 ? -2.9 + 2.5 * ((p - .45) / .17) ** 2
          : -.4 * (1 - ease((p - .62) / .38));
      } else if (av.swingKind === 'chop') {
        // arm out level in front, drawn back to the side, then swept across into the trunk
        const side = Math.sign(av.armR.position.x) || 1;
        const lift = p < .2 ? ease(p / .2) : p > .8 ? 1 - ease((p - .8) / .2) : 1;
        const yaw = p < .4 ? 1.2 * ease(p / .4)
          : p < .62 ? 1.2 - 2.2 * ((p - .4) / .22) ** 2
          : -(1 - ease((p - .62) / .38));
        av.armR.rotation.x = -1.45 * lift;
        av.armR.rotation.y = side * yaw;
        av.body.rotation.y = side * yaw * .25;   // the shoulders turn into it a little
      } else av.armR.rotation.x = -2.4 * Math.sin(k * Math.PI);
      if (av.swingT <= 0) {   // swing over: square up and put the tool away
        av.armR.rotation.y = 0; av.body.rotation.y = 0; av.swingKind = null;
        if (av.swingTool) setSwingTool(av, null);
      }
    }
    else av.armR.rotation.x = av.held ? -.6 + s * .25 : s * .9;   // holding something: arm forward
    // bouncy walk, gentle breathing when idle
    av.body.position.y = moving ? Math.abs(Math.cos(av.walk)) * .08 : Math.sin(elapsed * 2.2) * .015;
    const sq = moving ? 1 + Math.abs(Math.sin(av.walk)) * .04 : 1 + Math.sin(elapsed * 2.2) * .01;
    av.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    // sitting: down on the ground, back slouched forward, knees bent up in front
    // with the feet flat, arms resting toward the knees, head hanging a little.
    // av.sit eases 0..1 so sitting down and getting up are smooth.
    av.sit += ((av.sitting && !moving ? 1 : 0) - av.sit) * Math.min(1, dt * 7);
    const k = av.sit, slouch = .38 * k;
    const kL = av.legL.userData.knee, kR = av.legR.userData.knee;
    av.legL.rotation.z = av.legR.rotation.z = 0; av.head.rotation.x = 0; av.body.rotation.x = 0; kL.rotation.x = kR.rotation.x = 0;
    av.legL.position.z = av.legR.position.z = .17 * k;   // hips forward a touch so the knees clear the robe
    if (k > .01) {
      av.body.position.y = -.3 * k;   // the robe's hem rests on the ground, not under it
      av.body.rotation.x = slouch;   // lean forward from the hips
      av.legL.rotation.x = av.legR.rotation.x = -2.15 * k - slouch;   // thighs forward and up
      kL.rotation.x = kR.rotation.x = 2.05 * k;                       // shins folded back down: knees up
      av.legL.rotation.z = -.22 * k; av.legR.rotation.z = .22 * k;
      av.legL.rotation.z = -.12 * k; av.legR.rotation.z = .12 * k;
      if (!(av.swingT > 0)) { av.armL.rotation.x = -1.05 * k; if (!av.held) av.armR.rotation.x = -1.05 * k; }
      av.armL.rotation.z = -.18 + .06 * k; av.armR.rotation.z = .18 - .06 * k;
      av.head.rotation.x = .25 * k;
    }
  }

