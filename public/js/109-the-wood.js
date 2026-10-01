  // ================= The Weeping Wood (task C4, flag `region-wood`) =================
  // How the Wood's own things look, what E says over them, and their item icons and bugs.
  // The server spawns them only while the flag is on (server/regions/wood.js `spawnMore`) and
  // decides what E does (server/systems/wood.js); this part only draws.
  const woodM = {
    bark: soft(0x5E4A3C), barkDark: soft(0x4A3A2F), canopy: soft(0x3F6A3A), canopy2: soft(0x4E7A44), vine: soft(0x5F8A45),
    resin: new THREE.MeshBasicMaterial({ color: 0xE0A33A }), stump: soft(0x7A6048),
    fruitLeaf: soft(0x557F4A), fruit: new THREE.MeshBasicMaterial({ color: 0xB48AE0 }),
    leaf: soft(0x6FA055), amber: new THREE.MeshBasicMaterial({ color: 0xE8A03A }), root: soft(0x6B5240),
  };
  woodM.canopy.userData.leafy = true; woodM.canopy2.userData.leafy = true;

  Object.assign(UI.things, {
    // a giant: a trunk like a tower, roots flaring out, a roof of leaves far up, vines down its side
    giant: {
      solid: true, swing: 'chop',
      label: () => `Hew hardwood${has('axe') ? '' : ' (needs an axe)'} · walk into it to climb its vines`,
      make(rng) {
        const g = new THREE.Group(), h = rr(rng, 60, 90), r0 = rr(rng, 2.2, 2.6);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r0 * .55, r0, h, 12), woodM.bark); trunk.position.y = h / 2; g.add(trunk);
        for (let i = 0; i < 5; i++) {   // roots
          const a = i / 5 * 6.28 + rng(), root = new THREE.Mesh(new THREE.ConeGeometry(.9, 4, 6), woodM.barkDark);
          root.position.set(Math.sin(a) * r0, 1.2, Math.cos(a) * r0); root.rotation.set(Math.cos(a) * .9, 0, -Math.sin(a) * .9); g.add(root);
        }
        for (let i = 0; i < 3; i++) {   // the roof of leaves
          const c = ball(rr(rng, 9, 13), i % 2 ? woodM.canopy : woodM.canopy2, 10, 8);
          c.scale.set(1, .35, 1); c.position.set(rr(rng, -4, 4), h - 4 + i * 3, rr(rng, -4, 4)); g.add(c);
        }
        for (let i = 0; i < 6; i++) {   // vines down the trunk (what you climb)
          const a = i / 6 * 6.28 + rng() * .4, v = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, h - 6, 4), woodM.vine);
          v.position.set(Math.sin(a) * (r0 * .8 + .1), (h - 6) / 2, Math.cos(a) * (r0 * .8 + .1)); g.add(v);
        }
        return { g };
      },
    },
    // a broken stump, weeping amber drops of resin
    resin: {
      solid: false, swing: null,
      label: o => ((o.state.left ?? 2) > 0 ? 'Scrape resin' : 'Resin (scraped dry)'),
      make(rng) {
        const g = new THREE.Group(), stump = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, .7, 9), woodM.stump); stump.position.y = .35; g.add(stump);
        const drops = new THREE.Group();
        for (let i = 0; i < 4; i++) { const a = rng() * 6.28, d = ball(.06, woodM.resin, 6, 4); d.scale.set(1, 1.6, 1); d.position.set(Math.sin(a) * .4, rr(rng, .2, .6), Math.cos(a) * .4); drops.add(d); }
        g.add(drops);
        return { g, parts: { drops } };
      },
      state(o, s) { o.parts.drops.visible = (s.left ?? 2) > 0; },
    },
    // a curtain of vines hanging from a fallen branch
    vine: {
      solid: false, swing: 'chop',
      label: o => (o.state.picked ? 'Vines (cut back)' : 'Cut vine rope'),
      make(rng) {
        const g = new THREE.Group(), branch = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 2.2, 6), woodM.barkDark);
        branch.rotation.z = Math.PI / 2 + rr(rng, -.2, .2); branch.position.y = 2.2; g.add(branch);
        const long = new THREE.Group(), stub = new THREE.Group();
        for (let i = 0; i < 6; i++) {
          const x = -.9 + i * .36, l = rr(rng, 1.6, 2.1);
          const s = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, l, 4), woodM.vine); s.position.set(x, 2.2 - l / 2, rr(rng, -.05, .05)); long.add(s);
          const t = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .3, 4), woodM.vine); t.position.set(x, 2.05, 0); stub.add(t);
        }
        g.add(long, stub);
        return { g, parts: { long } };
      },
      state(o, s) { o.parts.long.visible = !s.picked; },
    },
    // a bush hung with strange glowing fruit
    fruit: {
      solid: false, swing: null,
      label: o => (o.state.picked ? 'Strange-fruit bush (picked)' : 'Pick strange fruit'),
      make(rng) {
        const g = new THREE.Group(), b = ball(.6, woodM.fruitLeaf, 10, 8); b.scale.set(1, .75, 1); b.position.y = .45; g.add(b);
        const fruits = new THREE.Group();
        for (let i = 0; i < 5; i++) { const a = rng() * 6.28, f = ball(.09, woodM.fruit, 6, 4); f.scale.set(1, 1.4, 1); f.position.set(Math.sin(a) * .55, rr(rng, .3, .8), Math.cos(a) * .55); fruits.add(f); }
        g.add(fruits);
        return { g, parts: { fruits } };
      },
      state(o, s) { o.parts.fruits.visible = !s.picked; },
    },
    // leaves bigger than you, on tall stalks
    bigleaf: {
      solid: false, swing: null,
      label: o => (o.state.picked ? 'Giant leaves (the big one is taken)' : 'Take a giant leaf'),
      make(rng) {
        const g = new THREE.Group(), big = new THREE.Group();
        const leaf = (parent, a, size, tilt) => {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, size * .8, 4), woodM.leaf); st.position.set(Math.sin(a) * .1, size * .4, Math.cos(a) * .1); parent.add(st);
          const l = ball(size * .5, woodM.leaf, 10, 6); l.scale.set(.6, .06, 1); l.position.set(Math.sin(a) * size * .35, size * .8, Math.cos(a) * size * .35); l.rotation.set(tilt, a, 0); parent.add(l);
        };
        leaf(big, rng() * 6.28, rr(rng, 1.6, 2), -.3);
        for (let i = 0; i < 2; i++) leaf(g, rng() * 6.28, rr(rng, .7, 1), -.5);
        g.add(big);
        return { g, parts: { big } };
      },
      state(o, s) { o.parts.big.visible = !s.picked; },
    },
    // a knot of old roots with amber caught in it
    amber: {
      solid: false, swing: 'mine',
      label: () => `Break out amber${has('pickaxe') ? '' : ' (a pickaxe gets more)'}`,
      make(rng) {
        const g = new THREE.Group(), lumps = new THREE.Group();
        for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.12, .18, 1.4, 6), woodM.root); r.rotation.set(rr(rng, -.4, .4), rng() * 6.28, Math.PI / 2 - .2); r.position.y = .15; g.add(r); }
        for (let i = 0; i < 3; i++) { const a = ball(rr(rng, .08, .13), woodM.amber, 6, 4); a.position.set(rr(rng, -.4, .4), .25, rr(rng, -.3, .3)); lumps.add(a); }
        g.add(lumps);
        return { g, parts: { lumps } };
      },
      state(o, s) { o.parts.lumps.children.forEach((l, i) => { l.visible = i < (s.left ?? 2) + 1; }); },
    },
  });

  // Item icons for what the Wood gives you (fish: the fishing part's).
  Object.assign(UI.itemIcons, {
    hardwood(g, fill) { fill('#5E4A3C', () => g.rect(10, 22, 44, 20)); fill('#8A6A52', () => g.ellipse(54, 32, 6, 10, 0, 0, 7)); g.lineWidth = 1.5; g.beginPath(); g.moveTo(14, 28); g.lineTo(48, 28); g.moveTo(14, 36); g.lineTo(48, 36); g.stroke(); },
    resin(g, fill) { fill('#E0A33A', () => { g.moveTo(32, 10); g.quadraticCurveTo(50, 36, 44, 46); g.quadraticCurveTo(32, 58, 20, 46); g.quadraticCurveTo(14, 36, 32, 10); g.closePath(); }); },
    vine_rope(g) { g.lineWidth = 5; g.strokeStyle = '#5F8A45'; g.beginPath(); for (let i = 0; i < 4; i++) g.arc(32, 32, 8 + i * 5, i * .6, i * .6 + 4.8); g.stroke(); },
    strange_fruit(g, fill) { fill('#B48AE0', () => g.ellipse(32, 36, 14, 18, 0, 0, 7)); fill('#557F4A', () => g.ellipse(36, 14, 10, 4, -.5, 0, 7)); },
    giant_leaf(g, fill) { fill('#6FA055', () => g.ellipse(32, 32, 14, 26, .6, 0, 7)); g.beginPath(); g.moveTo(16, 50); g.lineTo(48, 14); g.stroke(); },
    amber(g, fill) { fill('#E8A03A', () => { g.moveTo(14, 40); g.lineTo(24, 16); g.lineTo(44, 14); g.lineTo(52, 34); g.lineTo(38, 52); g.closePath(); }); g.fillStyle = '#7A4A20'; g.beginPath(); g.arc(34, 32, 3, 0, 7); g.fill(); },
    bow(g) { g.lineWidth = 5; g.strokeStyle = '#5E4A3C'; g.beginPath(); g.arc(40, 32, 26, 2.2, 4.1); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = '#D9C9A6'; g.beginPath(); g.moveTo(26, 11); g.lineTo(26, 53); g.stroke(); },
    arrow(g, fill) { g.lineWidth = 3; g.beginPath(); g.moveTo(12, 52); g.lineTo(50, 14); g.stroke(); fill('#8E8A84', () => { g.moveTo(54, 10); g.lineTo(42, 16); g.lineTo(48, 22); g.closePath(); }); fill('#E8E2D4', () => { g.moveTo(12, 52); g.lineTo(10, 42); g.lineTo(20, 46); g.closePath(); }); },
    catfish: fishIcon('#7A6A52', 1.05), glass_carp: fishIcon('#D8E8EC', .85),
    leaf_glider(g, fill) { fill('#6FA055', () => { g.moveTo(6, 40); g.quadraticCurveTo(32, 6, 58, 40); g.quadraticCurveTo(32, 30, 6, 40); g.closePath(); }); g.beginPath(); g.moveTo(32, 22); g.lineTo(32, 54); g.stroke(); },
  });
  UI.heldModels.bow = (g, add) => {
    const d = new THREE.Vector3(0, 1, .1).normalize();
    add(new THREE.TorusGeometry(.32, .025, 5, 16, Math.PI * .9), softShared(0x5E4A3C), 0, -.25, .12).rotation.set(0, Math.PI / 2, Math.PI * .55);
    add(new THREE.CylinderGeometry(.004, .004, .6, 3), softShared(0xD9C9A6), 0, -.25, -.05);
    void d;
  };

  // The Wood's bugs.
  const woodBugM = { glow: new THREE.MeshBasicMaterial({ color: 0xF2A541 }), shell: soft(0x3A2E26), glass: new THREE.MeshBasicMaterial({ color: 0xDDEFF2, transparent: true, opacity: .45 }),
    body: soft(0x4E6A5A), mantis: soft(0x6A5444) };
  Object.assign(UI.bugLooks, {
    // a beetle with a back like a coal: crawls up and down the trunks at night
    lantern_beetle: {
      make(g, add) { add(new THREE.SphereGeometry(.07, 8, 6), woodBugM.glow, 0, 0, 0).scale.set(1, .6, 1.3); add(new THREE.SphereGeometry(.035, 6, 4), woodBugM.shell, 0, .01, .08); },
      move(b, e, gy) { return [b.x + Math.sin(e * .2) * .3, gy + .3 + (Math.sin(e * .4) + 1) * 1.2, b.z + Math.cos(e * .2) * .3]; },
    },
    // glass wings you can barely see, flitting in the light between the trunks
    glasswing: {
      make(g, add) {
        add(new THREE.CylinderGeometry(.012, .012, .12, 4), woodBugM.body, 0, 0, 0).rotation.x = Math.PI / 2;
        for (const sx of [-1, 1]) { const w = add(new THREE.CircleGeometry(.1, 6), woodBugM.glass, sx * .08, 0, 0); w.rotation.x = -Math.PI / 2; g.userData['wing' + sx] = w; }
      },
      move(b, e, gy) { return [b.x + Math.sin(e * .9) * 1.4, gy + 1.1 + Math.sin(e * 2.1) * .3, b.z + Math.cos(e * .7) * 1.2]; },
    },
    // bark-coloured and still: you only see it when it moves (it hardly does)
    bark_mantis: {
      make(g, add) {
        add(new THREE.CylinderGeometry(.015, .02, .18, 4), woodBugM.mantis, 0, 0, 0).rotation.x = 1.1;
        for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(.008, .008, .1, 4), woodBugM.mantis, sx * .03, .05, .07).rotation.x = -.6;
      },
      move(b, e, gy) { return [b.x + Math.sin(e * .03) * .1, gy + .5, b.z]; },
    },
  });
