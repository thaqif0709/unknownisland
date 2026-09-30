  // ================= Tides: things the sea washes up =================
  let washups = new Map();
  const driftM = soft(0x9A8068), crateM = soft(0xA07A4A), fishM = soft(0xB9C3C6), shellM = soft(0xEBD9C3), shellPinkM = soft(0xE3A89A),
    doorM = soft(0x6E5646), bellM = soft(0xC9A04A), plankM = soft(0x8A6A52), printM = new THREE.MeshBasicMaterial({ color: 0x5E4A3A, transparent: true, opacity: .55, depthWrite: false });
  const glassMats = { glass_green: 0x7FBF8A, glass_blue: 0x6FA3D0, glass_amber: 0xE0A33A, glass_violet: 0xA88BD8 };
  function makeWashup(w) {
    const g = new THREE.Group(), r = mulberry32(w.id * 31 + 7);
    const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    switch (w.key) {
      case 'driftwood': { const l = add(new THREE.CylinderGeometry(.12, .17, 1.8, 8), driftM, 0, .14, 0); l.rotation.z = Math.PI / 2; l.rotation.y = r() * 3;
        const b = add(new THREE.CylinderGeometry(.05, .07, .6, 6), driftM, .3, .2, .15); b.rotation.set(.6, 0, 1.1); break; }
      case 'crate_seeds': case 'crate_oil': { const c = add(new THREE.BoxGeometry(.7, .55, .6), crateM, 0, .25, 0); c.rotation.set(.12, r() * 3, .1);
        add(new THREE.BoxGeometry(.72, .08, .62), driftM, 0, .5, 0).rotation.copy(c.rotation); break; }
      case 'silverfin': { const f = add(new THREE.SphereGeometry(.3, 10, 6), fishM, 0, .08, 0); f.scale.set(1.4, .35, .55);
        const tail = add(new THREE.ConeGeometry(.16, .25, 4), fishM, -.45, .08, 0); tail.rotation.z = Math.PI / 2; break; }
      case 'spiral_shell': case 'conch': { const big = w.key === 'conch' ? 1.8 : 1; const c = add(new THREE.ConeGeometry(.12 * big, .32 * big, 10), w.key === 'conch' ? shellPinkM : shellM, 0, .1, 0); c.rotation.z = 1.3;
        add(new THREE.SphereGeometry(.11 * big, 10, 8), w.key === 'conch' ? shellPinkM : shellM, .12 * big, .09, 0); break; }
      case 'cowrie': add(new THREE.SphereGeometry(.12, 10, 8), shellM, 0, .07, 0).scale.set(1.3, .6, .9); break;
      case 'scallop': { const s2 = add(new THREE.CylinderGeometry(.2, .02, .05, 10, 1, false, 0, Math.PI), shellPinkM, 0, .04, 0); s2.rotation.x = -1.4; break; }
      case 'sand_dollar': add(new THREE.CylinderGeometry(.16, .16, .03, 14), shellM, 0, .03, 0); break;
      case 'door_in_sand': { add(new THREE.BoxGeometry(1.1, 2.1, .12), doorM, 0, 1, 0); add(new THREE.BoxGeometry(1.3, .12, .16), plankM, 0, 2.1, 0);
        add(new THREE.SphereGeometry(.05, 8, 6), bellM, .38, 1, .08); g.rotation.y = r() * 3; break; }
      case 'ringing_bell': { add(new THREE.BoxGeometry(1.6, .1, .4), plankM, 0, .1, 0); add(new THREE.CylinderGeometry(.03, .03, .7, 6), plankM, 0, .5, 0);
        const bell = add(new THREE.CylinderGeometry(.08, .22, .3, 12), bellM, 0, .72, 0); g.userData.bell = bell; break; }
      case 'carved_mask': { const m = add(new THREE.SphereGeometry(.3, 10, 8), plankM, 0, .08, 0); m.scale.set(.8, .25, 1.05);
        for (const sx of [-1, 1]) add(new THREE.BoxGeometry(.1, .03, .025), mouthM, sx * .1, .15, .08).rotation.x = -Math.PI / 2; break; }
      case 'eye_stone': { add(new THREE.SphereGeometry(.18, 12, 9), pondRock, 0, .14, 0);
        const ring = add(new THREE.TorusGeometry(.1, .025, 6, 16), mouthM, 0, .16, .16); ring.scale.z = .5; break; }
      case 'old_tooth': { const t2 = add(new THREE.ConeGeometry(.16, 1.3, 8), shellM, 0, .15, 0); t2.rotation.set(Math.PI / 2 - .2, 0, 1.2); break; }
      case 'sleeper_gift': { add(new THREE.SphereGeometry(.28, 10, 8), clayM, 0, .24, 0).scale.y = .9;
        add(new THREE.CylinderGeometry(.12, .16, .14, 10), clayM, 0, .5, 0); add(new THREE.CircleGeometry(.1, 10), mouthM, 0, .575, 0).rotation.x = -Math.PI / 2; break; }
      case 'your_cloak': { const c = add(new THREE.SphereGeometry(.5, 12, 8), softShared(me ? colorFor(me.id) : 0x8A6A52), 0, .06, 0); c.scale.set(1.3, .18, .9); break; }
      case 'footprints': {   // a line of webbed prints from the sea to the target, and none back
        const tx = w.data.tx, tz = w.data.tz, len = Math.hypot(tx - w.x, tz - w.z), n = Math.min(80, Math.floor(len / .7));
        const a = Math.atan2(tx - w.x, tz - w.z), printGeo = new THREE.CircleGeometry(.11, 5);
        for (let i = 0; i < n; i++) {
          const k = i / n, side = i % 2 ? .16 : -.16, x = w.x + (tx - w.x) * k + Math.cos(a) * side, z = w.z + (tz - w.z) * k - Math.sin(a) * side;
          const m = new THREE.Mesh(printGeo, printM); m.rotation.x = -Math.PI / 2; m.rotation.z = -a; m.scale.set(1, 1.5, 1);
          m.position.set(x - w.x, groundAt(x, z) - groundAt(w.x, w.z) + .04, z - w.z); g.add(m);
        }
        break; }
      default: {
        if (glassMats[w.key]) { const m = new THREE.MeshBasicMaterial({ color: glassMats[w.key], transparent: true, opacity: .85 });
          const gl = add(new THREE.IcosahedronGeometry(.15, 0), m, 0, .08, 0); gl.scale.set(1.3, .6, 1); }
        else add(new THREE.BoxGeometry(.3, .3, .3), crateM, 0, .15, 0);
      }
    }
    g.position.set(w.x, groundAt(w.x, w.z), w.z);
    if (w.key !== 'footprints') shadows(g);
    return g;
  }
  function addWash(w) {
    if (washups.has(w.id)) return;
    const mesh = makeWashup(w);
    scene.add(mesh);
    if (w.key === 'footprints') noInk.add(mesh);
    washups.set(w.id, { ...w, type: 'wash', r: w.key === 'door_in_sand' ? .7 : .4, mesh, state: {} });
  }
  function removeWash(id) { const w = washups.get(id); if (w) { scene.remove(w.mesh); noInk.delete(w.mesh); washups.delete(id); } }
  function clearWash() { [...washups.keys()].forEach(removeWash); }

