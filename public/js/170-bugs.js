  // ================= Bugs =================
  // Server decides where; here they flit, hover, hop or crawl around that spot.
  let bugs = new Map();
  const bugMats = { firefly: new THREE.MeshBasicMaterial({ color: 0xE8F27A }), moon_moth: new THREE.MeshBasicMaterial({ color: 0xF3EAD6 }),
    cricket: soft(0x6F8F4A), bark_beetle: soft(0x3E3430), dragonfly: soft(0x5F7FA8), wing: new THREE.MeshBasicMaterial({ color: 0xE9F1F3, transparent: true, opacity: .55 }),
    snailShell: new THREE.MeshBasicMaterial({ color: 0xCFE6EA, transparent: true, opacity: .6 }), snail: soft(0xE7DCC8), heart: new THREE.MeshBasicMaterial({ color: 0xD9605A }),
    rain_beetle: soft(0x3F5F6A), shroomCap: new THREE.MeshBasicMaterial({ color: 0x9FE3C8 }), shroomStem: new THREE.MeshBasicMaterial({ color: 0xE9F1DA }),
    lanternFish: soft(0x3E4A5A), lure: new THREE.MeshBasicMaterial({ color: 0xF3D27A }) };
  const GLOW_BUGS = new Set(['firefly', 'moon_moth', 'glow_mushroom', 'lantern_fish']);
  function makeBug(key) {
    const g = new THREE.Group(), add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    if (key === 'firefly') { add(new THREE.SphereGeometry(.07, 8, 6), bugMats.firefly, 0, 0, 0); add(new THREE.SphereGeometry(.05, 6, 4), bugMats.bark_beetle, 0, .02, .06); }
    else if (key === 'moon_moth') { add(new THREE.SphereGeometry(.04, 6, 4), bugMats.moon_moth, 0, 0, 0);
      for (const sx of [-1, 1]) { const w = add(new THREE.CircleGeometry(.16, 8), bugMats.moon_moth, sx * .13, 0, 0); w.rotation.x = -Math.PI / 2; g.userData['wing' + sx] = w; } }
    else if (key === 'dragonfly') { const b = add(new THREE.CylinderGeometry(.02, .015, .4, 6), bugMats.dragonfly, 0, 0, 0); b.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) for (const dz of [-.04, .06]) { const w = add(new THREE.PlaneGeometry(.26, .06), bugMats.wing, sx * .14, .01, dz); w.rotation.x = -Math.PI / 2; } }
    else if (key === 'cricket') { add(new THREE.SphereGeometry(.07, 8, 6), bugMats.cricket, 0, 0, 0).scale.set(.7, .7, 1.5); }
    else if (key === 'glass_snail') { add(new THREE.SphereGeometry(.05, 8, 6), bugMats.snail, 0, .03, .08).scale.set(1, .6, 2.2);
      add(new THREE.SphereGeometry(.03, 6, 4), bugMats.heart, 0, .1, 0); add(new THREE.SphereGeometry(.09, 10, 8), bugMats.snailShell, 0, .1, 0); }
    else if (key === 'rain_beetle') { add(new THREE.SphereGeometry(.08, 8, 6), bugMats.rain_beetle, 0, 0, 0).scale.set(1, .6, 1.2); }
    else if (key === 'glow_mushroom') { for (const [x, z, k] of [[0, 0, 1], [.14, .08, .7], [-.1, .12, .55]]) {
        add(new THREE.CylinderGeometry(.025 * k, .035 * k, .22 * k, 6), bugMats.shroomStem, x, .11 * k, z);
        add(new THREE.SphereGeometry(.09 * k, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bugMats.shroomCap, x, .2 * k, z); } }
    else if (key === 'lantern_fish') { add(new THREE.SphereGeometry(.14, 10, 8), bugMats.lanternFish, 0, 0, 0).scale.set(1.6, .8, .8);
      const st = add(new THREE.CylinderGeometry(.008, .008, .2, 4), bugMats.lanternFish, .16, .14, 0); st.rotation.z = -.6;
      add(new THREE.SphereGeometry(.045, 8, 6), bugMats.lure, .24, .22, 0); }
    else if (UI.bugLooks[key]) UI.bugLooks[key].make(g, add);   // a region's own (C3 ...)
    else { add(new THREE.SphereGeometry(.08, 8, 6), bugMats.bark_beetle, 0, 0, 0).scale.set(1, .55, 1.3); }
    return g;
  }
  function syncBugs(list) {
    const seen = new Set();
    for (const [id, key, x, z] of list) {
      seen.add(id);
      if (!bugs.has(id)) { const mesh = makeBug(key); scene.add(mesh); if (GLOW_BUGS.has(key)) noInk.add(mesh);
        bugs.set(id, { id, key, x, z, type: 'bug', r: .3, mesh, state: {}, ph: Math.random() * 6.28 }); }
    }
    for (const [id, b] of bugs) if (!seen.has(id)) { scene.remove(b.mesh); noInk.delete(b.mesh); bugs.delete(id); }
  }
  function animateBugs(elapsed) {
    bugs.forEach(b => {
      const e = elapsed + b.ph, gy = groundAt(b.x, b.z);
      let x = b.x, z = b.z, y = gy;
      if (b.key === 'firefly' || b.key === 'moon_moth') { x += Math.sin(e * .7) * .8; z += Math.cos(e * .5) * .8; y += 1 + Math.sin(e * 1.3) * .3; }
      else if (b.key === 'dragonfly') { x += Math.sin(e * .9) * 1.2; z += Math.sin(e * .6) * 1.2; y += .9 + Math.sin(e * 5) * .05; }
      else if (b.key === 'cricket') { y += .07 + Math.max(0, Math.sin(e * 2.2)) * .35; x += Math.sin(e * .3) * .6; }
      else if (b.key === 'glow_mushroom') { y = gy; }
      else if (b.key === 'lantern_fish') { x += Math.sin(e * .4) * 1.4; z += Math.cos(e * .33) * 1.4; y = Math.max(gy, -.5) + .05 + Math.sin(e * 1.5) * .04; }
      else if (b.key === 'glass_snail') { x += Math.sin(e * .08) * .3; y += .01; }
      else if (UI.bugLooks[b.key] && UI.bugLooks[b.key].move) [x, y, z] = UI.bugLooks[b.key].move(b, e, gy);
      else { x += Math.sin(e * .25) * .5; z += Math.cos(e * .2) * .5; y += .05; }
      b.mesh.position.set(x, y, z); if (b.key !== 'glow_mushroom') b.mesh.rotation.y = e * .5;
      b.cx = x; b.cz = z;   // where it actually is, for catching
      if (b.mesh.userData['wing-1']) { const f = Math.sin(e * 14) * .6; b.mesh.userData['wing-1'].rotation.y = f; b.mesh.userData.wing1.rotation.y = -f; }
    });
  }

