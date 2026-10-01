  // ================= The Stairs (task C3, flag `region-stair`) =================
  // How the Stairs' own things look, what E says over them, and their item icons and bugs.
  // The server spawns them only while the flag is on (server/regions/stair.js `spawnMore`) and
  // decides what E does (server/systems/stair.js); this part only draws.
  const stairM = {
    flint: soft(0x4E5866), cortex: soft(0xE6DFCF),
    herb: soft(0x6F9A55), herbDark: soft(0x587F47), bloom: soft(0xF4EFE2), stub: soft(0x7D8F5E),
    flaxStem: soft(0x7E9A6A), flaxBloom: soft(0x7FA6D8),
    brick: soft(0xA65A3F), brick2: soft(0xB86C4E), moss: soft(0x7C9868),
    standing: soft(0x8E8A84), carve: soft(0x4A4440),
  };
  oreM.tin = soft(0xA9C2CE);   // tin ore: pale blue-grey flecks (bronze, once tools wear out: P3)

  // a sprig of something in a little clump: n stalks from the middle, leaning out
  function stalks(g, rng, n, h, mat, spread) {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, lean = rr(rng, .1, spread), hh = h * rr(rng, .75, 1.1);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(.012, .016, hh, 4), mat);
      st.position.set(Math.cos(a) * Math.sin(lean) * hh / 2, hh / 2 * Math.cos(lean), Math.sin(a) * Math.sin(lean) * hh / 2);
      st.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      g.add(st);
      st.userData.tip = new THREE.Vector3(Math.cos(a) * Math.sin(lean) * hh, hh * Math.cos(lean), Math.sin(a) * Math.sin(lean) * hh);
    }
  }

  Object.assign(UI.things, {
    // flint nodules in the turf: dark, glassy lumps with a chalky white crust
    flint: {
      solid: false, swing: 'mine',
      label: o => `Prise out flint${has('pickaxe') ? '' : ' (a pickaxe gets more)'}`,
      make(rng) {
        const g = new THREE.Group(), second = new THREE.Group();
        const lump = (parent, r, x, z) => {
          const m = new THREE.Mesh(lumpy(r, rng, 0), stairM.flint); m.scale.set(1, .6, rr(rng, .8, 1.2)); m.position.set(x, r * .25, z); m.rotation.y = rng() * 6.28; parent.add(m);
          const c = ball(r * .55, stairM.cortex, 8, 6); c.scale.set(1, .5, 1); c.position.set(x + r * .35, r * .5, z - r * .2); parent.add(c);
        };
        lump(g, .22, 0, 0);
        lump(second, .16, .26, .18);
        g.add(second);
        return { g, parts: { second } };
      },
      state(o, s) { o.parts.second.visible = (s.left ?? 2) > 1; },
    },
    // healing herbs: a low rosette of broad leaves with tiny white flowers
    herb: {
      solid: false, swing: null,
      label: o => (o.state.picked ? 'Healing herbs (picked; new leaves tomorrow)' : 'Pick healing herbs'),
      make(rng) {
        const g = new THREE.Group(), full = new THREE.Group(), stub = new THREE.Group();
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * 6.28 + rng() * .4, leaf = ball(.13, i % 2 ? stairM.herb : stairM.herbDark, 8, 6);
          leaf.scale.set(.55, .22, 1); leaf.position.set(Math.sin(a) * .14, .07, Math.cos(a) * .14); leaf.rotation.set(-.35, a, 0); full.add(leaf);
        }
        for (let i = 0; i < 3; i++) {
          const a = rng() * 6.28, d = rr(rng, .02, .1), h = rr(rng, .22, .3);
          const st = new THREE.Mesh(new THREE.CylinderGeometry(.008, .01, h, 4), stairM.herbDark); st.position.set(Math.sin(a) * d, h / 2, Math.cos(a) * d); full.add(st);
          const fl = ball(.035, stairM.bloom, 6, 4); fl.position.set(Math.sin(a) * d, h + .01, Math.cos(a) * d); full.add(fl);
        }
        for (let i = 0; i < 4; i++) { const a = i * 1.6, s = ball(.04, stairM.stub, 6, 4); s.scale.set(1, .5, 1); s.position.set(Math.sin(a) * .06, .02, Math.cos(a) * .06); stub.add(s); }
        g.add(full, stub);
        return { g, parts: { full, stub } };
      },
      state(o, s) { o.parts.full.visible = !s.picked; o.parts.stub.visible = !!s.picked; },
    },
    // flax: a clump of thin grey-green stems, each with a small sky-blue flower
    flax: {
      solid: false, swing: null,
      label: o => (o.state.picked ? 'Flax (cut back; it grows again)' : 'Cut flax'),
      make(rng) {
        const g = new THREE.Group(), full = new THREE.Group(), stub = new THREE.Group();
        stalks(full, rng, 9, .75, stairM.flaxStem, .35);
        full.children.slice().forEach(st => { const f = new THREE.Mesh(new THREE.CircleGeometry(.045, 5), stairM.flaxBloom); f.position.copy(st.userData.tip); f.rotation.x = -Math.PI / 2 + rr(rng, -.4, .4); full.add(f); });
        stalks(stub, rng, 7, .12, stairM.stub, .2);
        g.add(full, stub);
        return { g, parts: { full, stub } };
      },
      state(o, s) { o.parts.full.visible = !s.picked; o.parts.stub.visible = !!s.picked; },
    },
    // a tumbledown wall of old brick, mossy on top, with fallen bricks round its feet
    ruin: {
      swing: 'mine',
      label: () => 'Work bricks loose from the old wall',
      make(rng) {
        const g = new THREE.Group(), rows = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
        const L = rr(rng, 1.9, 2.5), BW = .34, BH = .16;
        let y = 0;
        for (let row = 0; row < 7; row++) {
          // the top rows crumble: shorter, ragged ends; they're what goes first as bricks are taken
          const part = row < 3 ? g : rows[Math.min(2, row - 3)];
          const left = -L / 2 + (row > 2 ? rr(rng, 0, .5) * (row - 2) / 2 : 0), right = L / 2 - (row > 2 ? rr(rng, 0, .7) * (row - 2) / 2 : 0);
          for (let x = left + (row % 2 ? BW / 2 : 0); x < right - .05; x += BW + .02) {
            if (row > 3 && rng() < .18) continue;   // gaps where bricks fell
            const b = new THREE.Mesh(new THREE.BoxGeometry(Math.min(BW, right - x), BH, .4), rng() < .5 ? stairM.brick : stairM.brick2);
            b.position.set(x + Math.min(BW, right - x) / 2, y + BH / 2, rr(rng, -.02, .02)); b.rotation.y = rr(rng, -.04, .04); part.add(b);
          }
          y += BH + .015;
        }
        for (let i = 0; i < 3; i++) {   // moss along the top
          const m = ball(.2, stairM.moss, 8, 6); m.scale.set(1.4, .35, .9); m.position.set(rr(rng, -L / 5, L / 5), y - (BH + .015) * 2.6, 0); rows[2].add(m);
        }
        for (let i = 0; i < 5; i++) {   // fallen bricks
          const b = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, .2), stairM.brick); const side = rng() < .5 ? -1 : 1;
          b.position.set(rr(rng, -L / 2, L / 2), BH / 2, side * rr(rng, .4, .8)); b.rotation.set(rr(rng, -.3, .3), rng() * 6.28, rr(rng, -.3, .3)); g.add(b);
        }
        rows.forEach(r => g.add(r));
        g.rotation.y = rng() * 6.28;
        return { g, parts: { r1: rows[0], r2: rows[1], r3: rows[2] } };
      },
      // three loads of bricks in it: each one takes the top off
      state(o, s) { const left = s.left ?? 3; o.parts.r3.visible = left > 2; o.parts.r2.visible = left > 1; o.parts.r1.visible = left > 0; },
    },
    // a standing stone: taller than three frogs, worn, with marks near the top
    standing: {
      label: () => 'Touch the standing stone',
      make(rng) {
        const g = new THREE.Group(), h = rr(rng, 2.3, 2.8);
        const slab = new THREE.Mesh(new THREE.CylinderGeometry(.26, .36, h, 6), stairM.standing);
        slab.scale.set(1.35, 1, .62); slab.position.y = h / 2 - .1; g.add(slab);
        const cap = ball(.3, stairM.standing, 8, 6); cap.scale.set(1.15, .45, .6); cap.position.y = h - .12; g.add(cap);
        for (let i = 0; i < 4; i++) {   // worn marks on the face
          const m = new THREE.Mesh(new THREE.BoxGeometry(i % 2 ? .05 : .16, i % 2 ? .16 : .04, .03), stairM.carve);
          m.position.set(rr(rng, -.14, .14), h - .45 - i * .17, .2); g.add(m);
        }
        for (let i = 0; i < 3; i++) { const a = rng() * 6.28, st = new THREE.Mesh(lumpy(.14, rng, 0), stairM.standing); st.scale.y = .5; st.position.set(Math.cos(a) * .55, .05, Math.sin(a) * .45); g.add(st); }
        g.rotation.set(rr(rng, -.05, .05), rng() * 6.28, rr(rng, -.06, .06));
        return { g };
      },
    },
  });

  // Item icons for what the Stairs give you.
  Object.assign(UI.itemIcons, {
    flint(g, fill) {
      fill('#4E5866', () => { g.moveTo(12, 40); g.lineTo(22, 18); g.lineTo(40, 12); g.lineTo(54, 26); g.lineTo(48, 48); g.lineTo(26, 54); g.closePath(); });
      fill('#E6DFCF', () => { g.moveTo(40, 12); g.lineTo(54, 26); g.lineTo(48, 30); g.lineTo(38, 20); g.closePath(); });
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(24, 26); g.lineTo(34, 40); g.moveTo(30, 22); g.lineTo(42, 36); g.stroke();
    },
    herbs(g, fill) {
      g.beginPath(); g.moveTo(32, 58); g.lineTo(32, 20); g.stroke();
      [[-1, 44], [1, 36], [-1, 28], [1, 22]].forEach(([s, y]) => fill('#6F9A55', () => g.ellipse(32 + s * 11, y, 11, 5, s * -.5, 0, 7)));
      fill('#F4EFE2', () => g.arc(32, 14, 5, 0, 7));
    },
    flax(g, fill) {
      g.lineWidth = 2.5; [[-10, -6], [-3, -2], [4, 2], [11, 6]].forEach(([dx, tx]) => { g.beginPath(); g.moveTo(32 + dx / 2, 58); g.lineTo(32 + dx + tx, 16); g.stroke(); });
      g.lineWidth = 3; fill('#C9A35A', () => g.rect(22, 40, 20, 6));
      [[-10, -6], [4, 2], [11, 6]].forEach(([dx, tx]) => fill('#7FA6D8', () => g.arc(32 + dx + tx, 13, 5, 0, 7)));
    },
    bricks(g, fill) {
      fill('#A65A3F', () => g.rect(8, 34, 34, 16)); fill('#B86C4E', () => g.rect(22, 16, 34, 16));
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(14, 40); g.lineTo(20, 40); g.moveTo(30, 22); g.lineTo(38, 22); g.stroke();
    },
    tin(g, fill) {
      fill('#8E8A92', () => { g.moveTo(10, 42); g.lineTo(20, 18); g.lineTo(40, 14); g.lineTo(54, 30); g.lineTo(46, 50); g.lineTo(22, 52); g.closePath(); });
      g.fillStyle = '#A9C2CE'; [[24, 28, 5], [38, 24, 4], [34, 40, 6], [46, 36, 3]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.lineWidth = 1.5; g.stroke(); });
    },
  });

  // The Stairs' bugs.
  const bugM = { beetle: soft(0x8A8A86), ridge: soft(0x6A6966), hopper: soft(0x9AAE5A), moth: new THREE.MeshBasicMaterial({ color: 0xC9D2DA }) };
  Object.assign(UI.bugLooks, {
    // grey and ridged, like a pebble: plods about in the sun
    stone_beetle: {
      make(g, add) {
        add(new THREE.SphereGeometry(.09, 8, 6), bugM.beetle, 0, 0, 0).scale.set(1, .55, 1.3);
        for (const dx of [-.035, .035]) add(new THREE.BoxGeometry(.012, .03, .2), bugM.ridge, dx, .045, 0);
      },
      move(b, e, gy) { return [b.x + Math.sin(e * .15) * .4, gy + .04, b.z + Math.cos(e * .12) * .4]; },
    },
    // long and green; big hops from step to step
    terrace_grasshopper: {
      make(g, add) {
        add(new THREE.SphereGeometry(.06, 8, 6), bugM.hopper, 0, 0, 0).scale.set(.7, .7, 2);
        for (const sx of [-1, 1]) { const l = add(new THREE.CylinderGeometry(.008, .008, .16, 4), bugM.hopper, sx * .05, .03, -.05); l.rotation.x = .9; }
      },
      move(b, e, gy) { return [b.x + Math.sin(e * .35) * .9, gy + .06 + Math.max(0, Math.sin(e * 1.8)) * .6, b.z + Math.cos(e * .27) * .5]; },
    },
    // pale, high on the steps at night, flying sideways on the wind (flaps like the moon moth)
    wind_moth: {
      make(g, add) {
        add(new THREE.SphereGeometry(.035, 6, 4), bugM.moth, 0, 0, 0);
        for (const sx of [-1, 1]) { const w = add(new THREE.CircleGeometry(.13, 6), bugM.moth, sx * .11, 0, 0); w.rotation.x = -Math.PI / 2; g.userData['wing' + sx] = w; }
      },
      move(b, e, gy) { return [b.x + Math.sin(e * 1.1) * 1.6, gy + 1.3 + Math.sin(e * 2.3) * .4, b.z + Math.sin(e * .5) * .6]; },
    },
  });
