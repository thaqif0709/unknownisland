  // ================= Shore ripples =================
  // Curling wave crests on the water just off the coast, washing in and out.
  function crestTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    const path = () => {
      g.beginPath();
      g.moveTo(14, 70);
      g.bezierCurveTo(60, 28, 150, 20, 196, 44);
      for (let a = 0; a < Math.PI * 2.4; a += .12) { const r = 22 * (1 - a / (Math.PI * 2.9)); g.lineTo(196 + 4 - Math.cos(a) * r, 44 + 22 - Math.sin(a + Math.PI / 2) * r - 22 + r); }
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    path(); g.lineWidth = 16; g.strokeStyle = '#2B211F'; g.stroke();
    path(); g.lineWidth = 8; g.strokeStyle = '#F3EAD6'; g.stroke();
    return new THREE.CanvasTexture(c);
  }
  const crestMat = new THREE.MeshBasicMaterial({ map: crestTexture(), transparent: true, depthWrite: false, fog: true });
  const crestGeo = new THREE.PlaneGeometry(2.6, 1); crestGeo.rotateX(-Math.PI / 2);
  const crests = new Set();
  // A few crests in each chunk, in shallow water just off a beach, lying along the coast.
  function buildCrests(cx, cz) {
    const out = [], r = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x9e37);
    for (let tries = 0; tries < 40 && out.length < 5; tries++) {
      const x = cx * CH + r() * CH, z = cz * CH + r() * CH, h = heightAt(x, z);
      if (h > -.45 || h < -1.3) continue;
      const gx = heightAt(x + 1, z) - heightAt(x - 1, z), gz = heightAt(x, z + 1) - heightAt(x, z - 1), gl = Math.hypot(gx, gz);
      if (gl < .05) continue;
      const dx = gx / gl, dz = gz / gl;   // uphill = towards the shore
      const m = new THREE.Mesh(crestGeo, crestMat.clone());
      m.position.set(x, .16, z);
      m.rotation.y = Math.atan2(-dz, dx) + (r() - .5) * .4;
      m.renderOrder = 2;
      m.userData = { x, z, dx, dz, phase: r() * 6.28 };
      scene.add(m); crests.add(m); noInk.add(m); out.push(m);
    }
    return out;
  }
  function updateCrests(elapsed, light) {
    for (const m of crests) {
      const u = m.userData, k = (Math.sin(elapsed * .55 + u.phase) + 1) / 2;   // 0..1, washing in and out
      m.position.x = u.x + u.dx * k * .9; m.position.z = u.z + u.dz * k * .9;
      m.material.opacity = Math.sin(k * Math.PI) * .95;
      m.material.color.setScalar(light);
    }
  }

