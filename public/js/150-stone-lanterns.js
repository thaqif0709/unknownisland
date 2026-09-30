  // ================= Stone lanterns =================
  // Old stone lanterns: a stepped base, a pillar, a lamp box and a wide roof.
  // Lit, the lamp box glows and a light from the pool is lent to it.
  let lanterns = new Map();
  const lanternStoneM = soft(0xA59E92), lanternDarkM = soft(0x7E776D);
  const glowOnM = new THREE.MeshBasicMaterial({ color: 0xF3C35A }), glowOffM = new THREE.MeshBasicMaterial({ color: 0x3A3230 });
  function makeLantern(big) {
    const g = new THREE.Group(), k = big ? 1.8 : 1;
    const add = (geo, m, y) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y * k; mesh.scale.setScalar(k); g.add(mesh); return mesh; };
    add(new THREE.CylinderGeometry(.55, .62, .18, 6), lanternDarkM, .09);
    add(new THREE.CylinderGeometry(.42, .48, .14, 6), lanternStoneM, .25);
    add(new THREE.CylinderGeometry(.16, .2, .9, 8), lanternStoneM, .77);
    add(new THREE.CylinderGeometry(.38, .3, .12, 6), lanternStoneM, 1.28);
    add(new THREE.BoxGeometry(.5, .42, .5), lanternStoneM, 1.55);
    const glow = add(new THREE.BoxGeometry(.52, .24, .3), glowOffM, 1.56);
    const glow2 = add(new THREE.BoxGeometry(.3, .24, .52), glowOffM, 1.56);
    add(new THREE.ConeGeometry(.62, .42, 6), lanternDarkM, 1.97);
    add(new THREE.SphereGeometry(.09, 8, 6), lanternStoneM, 2.24);
    bake(g, [glow, glow2]);
    shadows(g);
    return { g, glows: [glow, glow2] };
  }
  function setLantern(src) {
    let l = lanterns.get(src.id);
    if (!l) {
      const { g, glows } = makeLantern(src.big);
      g.position.set(src.x, groundAt(src.x, src.z), src.z); g.rotation.y = src.id * 1.3;
      scene.add(g);
      l = { id: src.id, type: 'lantern', x: src.x, z: src.z, big: src.big, r: src.big ? .9 : .55, mesh: g, glows, state: {} };
      lanterns.set(src.id, l);
    }
    Object.assign(l, { lit: src.lit, fuel: src.fuel, have: src.have, need: src.need, clear: src.clear || 0, reclaim: src.reclaim ?? 1 });
    l.glows.forEach(m => { m.material = l.lit ? glowOnM : glowOffM; });
  }
  function clearLanterns() { lanterns.forEach(l => scene.remove(l.mesh)); lanterns = new Map(); }
  const lanternRadius = l => l.big ? RULES.LANTERN.BIG_RADIUS : RULES.LANTERN.RADIUS;

