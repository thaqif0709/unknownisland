  // ================= Hit chips =================
  // Small debris flung from a chop or mine hit - wood splinters or stone/ore chips -
  // tumbling out and settling under gravity. A small reused pool, like the smoke puffs.
  // Not added to `noInk`: that set is for things managed by opacity (like the smoke
  // puffs) which the two-pass renderer force-shows after the normal pass; a chip's
  // on/off pooling is done with `.visible`, so it must stay out of that set, and
  // getting a normal ink outline while tumbling suits solid debris anyway.
  const CHIP_N = 24, chipMeshes = [];
  for (let i = 0; i < CHIP_N; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .05), new THREE.MeshBasicMaterial({ color: 0x8A6A4A }));
    m.visible = false; m.userData.life = 0;
    scene.add(m);
    chipMeshes.push(m);
  }
  function spawnChips(o) {
    const cy = groundAt(o.x, o.z), tall = o.type === 'tree' || o.type === 'palm';
    const color = o.type === 'ore' ? (o.ore === 'copper' ? 0xC9793A : 0xAEB6BC) : o.type === 'rock' ? 0x8A8171 : 0x8A6A4A;
    let spawned = 0;
    for (const m of chipMeshes) {
      if (spawned >= 6) break;
      if (m.userData.life > 0) continue;
      const a = Math.random() * Math.PI * 2, spd = 1.1 + Math.random() * 1.4;
      m.position.set(o.x, cy + (tall ? 1 + Math.random() * .6 : .35 + Math.random() * .2), o.z);
      m.material.color.setHex(color);
      m.userData = { life: 1, vx: Math.cos(a) * spd, vy: 1.8 + Math.random() * 1.4, vz: Math.sin(a) * spd,
        spinX: (Math.random() - .5) * 14, spinY: (Math.random() - .5) * 10, dur: .45 + Math.random() * .2 };
      m.scale.setScalar(.7 + Math.random() * .6);
      m.visible = true;
      spawned++;
    }
  }
  function updateChips(dt) {
    for (const m of chipMeshes) {
      const u = m.userData;
      if (!u || u.life <= 0) continue;
      u.life -= dt / u.dur;
      if (u.life <= 0) { m.visible = false; continue; }
      u.vy -= 9 * dt;
      m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
      m.rotation.x += u.spinX * dt; m.rotation.y += u.spinY * dt;
    }
  }

