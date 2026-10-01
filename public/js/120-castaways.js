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
      case 'pickaxe': case 'ironpick': {   // (the iron one a cold blue-grey, P3)
        const head = key === 'ironpick' ? softShared(0x9AA4B0) : rockM[1];
        add(new THREE.CylinderGeometry(.02, .024, .42, 6), logM, 0, -.24, 0);
        add(new THREE.ConeGeometry(.022, .2, 5), head, 0, -.45, .1).rotation.x = Math.PI / 2;
        add(new THREE.ConeGeometry(.022, .2, 5), head, 0, -.45, -.1).rotation.x = -Math.PI / 2; break; }
      case 'shovel': add(new THREE.CylinderGeometry(.02, .024, .46, 6), logM, 0, -.26, 0);   // a flat blade at the end
        add(new THREE.BoxGeometry(.13, .15, .02), rockM[1], 0, -.53, 0); break;
      // weapons (P6): a grip in the fist, the rest hanging down
      case 'sword_wood': case 'sword_bronze': case 'sword_iron': case 'sword_silver': case 'sword_obsidian': {
        const blade = softShared({ sword_wood: 0xB98A62, sword_bronze: 0xC08A4A, sword_iron: 0x9AA4B0, sword_silver: 0xDDE3EA, sword_obsidian: 0x2E2B3A }[key]);
        add(new THREE.CylinderGeometry(.022, .022, .12, 6), logM, 0, -.04, 0);
        add(new THREE.BoxGeometry(.16, .025, .04), logM, 0, -.11, 0);
        add(new THREE.BoxGeometry(.05, .46, .015), blade, 0, -.35, 0); break; }
      case 'spear': add(new THREE.CylinderGeometry(.018, .02, .9, 6), logM, 0, -.2, 0);
        add(new THREE.ConeGeometry(.04, .14, 5), rockM[1], 0, -.72, 0).rotation.x = Math.PI; break;
      case 'club': add(new THREE.CylinderGeometry(.06, .025, .5, 7), logM, 0, -.26, 0); break;
      case 'sling': add(new THREE.CylinderGeometry(.006, .006, .3, 4), softShared(0xD9C9A6), 0, -.15, 0);
        add(new THREE.SphereGeometry(.04, 6, 4), softShared(0xC8B48A), 0, -.31, 0); break;
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
    // (holding a tool for the job, P3: that one, an iron pickaxe say; else the usual)
    const job = kind === 'chop' ? 'axe' : kind === 'mine' ? 'pick' : null, own = av.heldKey && WG.ITEM_INFO[av.heldKey];
    setSwingTool(av, !job ? null : own && (own.tool === job || own.kind === 'weapon') ? av.heldKey : job === 'axe' ? 'axe' : 'pickaxe');   // (a weapon swings as itself, P6)
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
    const eyesOpen = [], eyesShut = [];
    for (const sx of [-1, 1]) {
      add(ball(.125, frogM, 16, 12), sx * .2, .24, .08, head);
      eyesOpen.push(add(ball(.1, ringM, 14, 10), sx * .215, .26, .155, head)); eyesOpen[eyesOpen.length - 1].scale.z = .6;
      eyesOpen.push(add(ball(.07, irisM, 12, 8), sx * .22, .26, .2, head)); eyesOpen[eyesOpen.length - 1].scale.z = .5;
      eyesOpen.push(add(ball(.022, shineM, 6, 4), sx * .22 + .03, .29, .235, head));
      // asleep: a lid over the eye, and a closed, contented curve
      const lid = add(ball(.1, frogM, 14, 10), sx * .215, .26, .158, head); lid.scale.z = .62; lid.visible = false; eyesShut.push(lid);
      const shut = add(new THREE.Mesh(new THREE.TorusGeometry(.055, .011, 5, 16, Math.PI * .8), mouthM), sx * .215, .255, .222, head);
      shut.rotation.set(-.1, sx * .25, Math.PI + Math.PI * .1); shut.visible = false; eyesShut.push(shut);
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

    const av = { root, body, head, legL, legR, armL, armR, walk: 0, swingT: 0, hoodUp, hoodDown, sit: 0, eyesOpen, eyesShut, cloak };
    av.armL.rotation.z = -.18; av.armR.rotation.z = .18;
    av.armR.rotation.order = 'YXZ';   // yaw applies after the pitch, so a chop can sweep sideways (same pose as before while y is 0)
    shadows(root);
    scene.add(root);
    return av;
  }
  function removeCastaway(av) { scene.remove(av.root); sleepZs(av, 0, 0); sleepBlanket(av, 0, 0); }
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

  // Climbing (arms reaching up in turn, legs pushing) and gliding (arms and cloak spread
  // wide, leaning into the air), task P9. Runs after poseCastaway and applyHop.
  function poseTravel(av, kind, t, moving) {
    av._travel = kind;
    if (kind === 'climb') {
      const s = Math.sin(t * (moving ? 7 : 1.2));
      av.armL.rotation.x = -2.7 + s * .35; av.armR.rotation.x = -2.7 - s * .35;
      av.armL.rotation.z = -.3; av.armR.rotation.z = .3;
      av.legL.rotation.x = -.6 + s * .45; av.legR.rotation.x = -.6 - s * .45;
    } else {
      const flap = Math.sin(t * 2.2) * .06;
      av.armL.rotation.x = av.armR.rotation.x = -.25;
      av.armL.rotation.z = -1.35 - flap; av.armR.rotation.z = 1.35 + flap;
      av.legL.rotation.x = .45; av.legR.rotation.x = .6;
      av.body.rotation.x = .35;
    }
  }
  function poseCastaway(av, x, z, face, moving, dead, dt, elapsed) {
    if (av._travel) { av.armL.rotation.z = -.18; av.armR.rotation.z = .18; av.body.rotation.x = 0; av._travel = null; }   // back from climbing or gliding
    const gh = av.under ? caveFloorAt(av.under, x, z) : groundAt(x, z), y = av.under ? gh : Math.max(gh, -.75);   // in a cave: its floor (W9)
    av.root.position.set(x, y, z);
    av.root.rotation.y = face; av.root.rotation.z = 0;
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
    // asleep by a hearth (P4): curled up on your side, knees tucked, head down
    av.sleepK = (av.sleepK || 0) + ((av.sleeping && !moving ? 1 : 0) - (av.sleepK || 0)) * Math.min(1, dt * 7);   // settled in about half a second
    const q = av.sleepK, shut = q > .5;
    if (av.eyesShut && av.eyesShut[0].visible !== shut) { av.eyesShut.forEach(m => { m.visible = shut; }); av.eyesOpen.forEach(m => { m.visible = !shut; }); }
    if (q > .01) {
      av.root.rotation.z = -1.3 * q;
      av.root.position.y += .3 * q;
      av.head.rotation.x = .25 * k + .35 * q;
      av.armL.rotation.x = -.1 * q; if (!av.held) av.armR.rotation.x = -.1 * q;   // arms down by the sides, under the blanket
      av.body.position.y += Math.sin(elapsed * 1.4) * .01 * q;   // slow breathing
      // legs along the body, lightly curled, instead of knees up as when sitting
      const r = 1 - q, kL2 = av.legL.userData.knee, kR2 = av.legR.userData.knee;
      av.legL.rotation.x = av.legR.rotation.x = av.legL.rotation.x * r - .45 * q;
      kL2.rotation.x = kR2.rotation.x = kL2.rotation.x * r + .7 * q;
      av.legL.position.z = av.legR.position.z = av.legL.position.z * r;
      av.legL.rotation.z *= r; av.legR.rotation.z *= r;
    }
    sleepBlanket(av, q, dt);   // (after the pose, so they fit the frog lying down)
    sleepZs(av, q, dt);
  }  // Asleep (P4): a thick blanket in the cloak's colour, draped over the curled-up frog up to the
  // neck and spilling onto the ground round it in soft folds, like a cartoon bedspread. Its
  // shape is measured from the frog's own pose once it has settled: rays straight down give
  // the height of the body under each point, the cloth sags from there to the ground, and the
  // hem wobbles. It sits in the world (not on the tilted body), facing the way the frog faces.
  const drapeRay = new THREE.Raycaster(), rayFrom = new THREE.Vector3(), rayDown = new THREE.Vector3(0, -1, 0), hp = new THREE.Vector3();
  function buildBlanket(av) {
    av.root.updateMatrixWorld(true);
    const yaw = av.root.rotation.y, cy = Math.cos(yaw), sy = Math.sin(yaw), ox = av.root.position.x, oz = av.root.position.z;
    const g0 = groundAt(ox, oz);
    const toWorld = (u, w) => [ox + u * cy + w * sy, oz - u * sy + w * cy];   // (u along the lying body, w across it)
    const parts = [];
    av.body.traverse(m => { if (m.isMesh && !isIn(m, av.head)) parts.push(m); });
    av.head.getWorldPosition(hp);
    const headU = (hp.x - ox) * cy - (hp.z - oz) * sy;   // how far along the body the head is
    const U0 = -.62, U1 = headU - .14, W0 = -.42, W1 = .55, NU = 32, NW = 22;
    // the top edge reaches further up on the front (+w: where the chest and arms are), tucked
    // under the chin, and stays lower at the back of the neck
    const topU = j => { const w = W0 + (W1 - W0) * j / NW; return U1 + .26 * Math.min(1, Math.max(0, (w + .05) / .35)); };
    const uAt = (i, j) => U0 + (topU(j) - U0) * i / NU;
    // the body's height under each point of a grid
    const H = [];
    for (let i = 0; i <= NU; i++) {
      H.push([]);
      for (let j = 0; j <= NW; j++) {
        const u = uAt(i, j), w = W0 + (W1 - W0) * j / NW, [x, z] = toWorld(u, w);
        rayFrom.set(x, g0 + 4, z); drapeRay.set(rayFrom, rayDown);
        const hit = drapeRay.intersectObjects(parts, false)[0];
        H[i].push(hit ? Math.max(0, hit.point.y - groundAt(x, z)) : 0);
      }
    }
    // cloth: laid over the body, falling away at a slope, never lower than the ground
    const du = (U1 - U0) / NU, dw = (W1 - W0) / NW, SLOPE = 1.9, R = 6;
    const pos = [], top = [];
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NW; j++) {
      let h = 0;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
        const hn = (H[i + a] || [])[j + b]; if (!hn) continue;
        h = Math.max(h, hn - SLOPE * Math.hypot(a * du, b * dw));
      }
      const edge = Math.min(i, NU - i, j, NW - j);
      let u = uAt(i, j), w = W0 + dw * j;
      // the hem: wavy, and pushed in and out a little, so it isn't a rectangle
      const along = i === 0 || i === NU ? j / NW : i / NU;          // how far along this edge (0-1)
      const wave = Math.sin(along * Math.PI * 5 + (j === 0 ? 0 : 2)) * .06 + Math.sin(along * Math.PI * 2 + 1) * .04;
      if (edge === 0) { if (i === 0 || i === NU) u += (i === 0 ? -1 : 1) * wave * .7; else w += (j === 0 ? -1 : 1) * wave; }
      const sag = h > .05 ? .07 : .025;                              // thick where it lies over the frog
      const folds = h > .03 && h < .4 ? Math.sin(u * 7 + w * 1.5) * .03 * Math.min(1, h * 6) : 0;   // soft creases down the sides
      const [x, z] = toWorld(u, w);
      pos.push(u, Math.max(groundAt(x, z) - g0 + .03 + (edge === 0 ? .02 + wave * .15 : 0), groundAt(x, z) - g0 + h + sag + folds), w);
      top.push(h);
    }
    const idx = [];
    for (let i = 0; i < NU; i++) for (let j = 0; j < NW; j++) {
      const a = i * (NW + 1) + j, b = a + 1, c = a + NW + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const g = new THREE.Group();
    const cloth = new THREE.Mesh(geo, soft(av.cloak, { side: THREE.DoubleSide })); g.add(cloth);
    // the top edge, turned down under the chin: a fat soft roll in a paler shade, for thickness
    const rollPts = [];
    for (let j = 0; j <= NW; j++) { const n = NU * (NW + 1) + j; rollPts.push(new THREE.Vector3(pos[n * 3] - .02, pos[n * 3 + 1] + .02, pos[n * 3 + 2])); }
    const roll = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rollPts), 40, .065, 8, false),
      soft(new THREE.Color(av.cloak).lerp(new THREE.Color(0xE9D7AE), .35).getHex()));
    g.add(roll);
    // and the hem all round the other three sides, rolled a little so the cloth looks thick
    const ring = [];
    for (let i = NU; i >= 0; i--) ring.push([i, 0]);          // down one side ...
    for (let j = 1; j <= NW; j++) ring.push([0, j]);          // ... across the foot ...
    for (let i = 1; i <= NU; i++) ring.push([i, NW]);         // ... and up the other side
    const hem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring.map(([i, j]) => { const n = i * (NW + 1) + j; return new THREE.Vector3(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]); })), 120, .03, 6, false), cloth.material);
    g.add(hem);
    g.position.set(ox, g0, oz); g.rotation.y = yaw;
    shadows(g);
    return g;
  }
  const isIn = (m, group) => { for (let o = m; o; o = o.parent) if (o === group) return true; return false; };
  function sleepBlanket(av, q, dt) {
    if (q < .5 || !av.cloak) {
      if (av.drape) { scene.remove(av.drape); av.drape.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material.dispose) m.material.dispose(); }); av.drape = null; }
      return;
    }
    if (!av.drape && q > .97) { av.drape = buildBlanket(av); av.drape.userData.k = 0; scene.add(av.drape); }   // settled: lay it over
    if (av.drape) {
      const k = av.drape.userData.k = Math.min(1, av.drape.userData.k + dt * 4);   // floats down onto the frog
      av.drape.scale.set(1, .4 + .6 * k, 1); av.drape.position.y = groundAt(av.drape.position.x, av.drape.position.z) + (1 - k) * .5;
    }
  }
  // A few small z's drifting up from a sleeper's head, fading as they rise.
  let zTex = null;
  function zTexture() {
    if (zTex) return zTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 52px "Patrick Hand", "Comic Sans MS", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = '#2B211F'; g.strokeText('z', 32, 34);
    g.fillStyle = '#F5ECD7'; g.fillText('z', 32, 34);
    zTex = new THREE.CanvasTexture(c);
    return zTex;
  }
  const zPos = new THREE.Vector3();
  function sleepZs(av, q, dt) {
    if (q < .5) { if (av.zs) { av.zs.forEach(z => { scene.remove(z); noInk.delete(z); }); av.zs = null; } return; }
    if (!av.zs) {
      av.zs = [0, 1, 2].map(i => {
        const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false }));
        z.userData.t = i / 3; scene.add(z); noInk.add(z); return z;
      });
    }
    av.head.localToWorld(zPos.set(0, .32, 0));   // the top of the head (on its side, that's to one side)
    for (const z of av.zs) {
      const t = z.userData.t = (z.userData.t + dt / 2.4) % 1;   // each one rises for 2.4 s, out of the head
      z.position.set(zPos.x + Math.sin(t * 5 + z.id) * .12 * t, zPos.y + .05 + t * 1.3, zPos.z + t * .15);
      z.scale.setScalar(.12 + t * .4);
      z.material.opacity = Math.min(1, t * 8) * (1 - t * t);
    }
  }


