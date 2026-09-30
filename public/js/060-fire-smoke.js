  // ================= Fire smoke =================
  // Inked swirl puffs that rise from lit fires, grow and fade.
  // Soft wisps: a few overlapping blurred blobs per texture, no outline, so
  // they read as smoke; several shapes so the column never looks stamped.
  function puffTexture(seed) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), r = mulberry32(seed);
    for (let i = 0; i < 7; i++) {
      const x = 64 + (r() - .5) * 46, y = 64 + (r() - .5) * 40, rad = 18 + r() * 26, a = .3 + r() * .25;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(236,230,220,${a})`); grd.addColorStop(.55, `rgba(222,214,202,${a * .6})`); grd.addColorStop(1, 'rgba(220,212,200,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    // a faint curl, the only hint of ink
    g.globalAlpha = .18; g.strokeStyle = '#6B5E55'; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath();
    for (let a = 0; a < Math.PI * 2.4; a += .1) { const rr = 20 * (1 - a / (Math.PI * 2.8)); g.lineTo(64 + Math.cos(a + seed) * rr, 64 + Math.sin(a + seed) * rr); }
    g.stroke();
    return new THREE.CanvasTexture(c);
  }
  const puffTexs = [11, 23, 37, 51].map(puffTexture), puffs = [];
  const smokeDark = new THREE.Color(0x5E574F), smokeLight = new THREE.Color(0xB8B0A4);
  for (let i = 0; i < 70; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexs[i % puffTexs.length], transparent: true, depthWrite: false }));
    sp.visible = false; sp.userData = { life: 0 };
    scene.add(sp); puffs.push(sp); noInk.add(sp);
  }
  let puffNext = 0;
  function emitPuff(f) {
    const sp = puffs.find(p => p.userData.life <= 0);
    if (!sp) return;
    const big = f.kind === 'hearth' ? 1.3 : 1;
    sp.userData = { life: 1, x: f.x + (Math.random() - .5) * .25, z: f.z + (Math.random() - .5) * .25, y: groundAt(f.x, f.z) + .75 * big,
      big, sway: Math.random() * 6.28, spin: (Math.random() - .5) * .8, dur: 4.5 + Math.random() * 2, drift: .5 + Math.random() * .5 };
    sp.visible = true;
  }
  function updatePuffs(dt, elapsed) {
    for (const sp of puffs) {
      const u = sp.userData;
      if (u.life <= 0) continue;
      u.life -= dt / u.dur;
      if (u.life <= 0) { sp.visible = false; continue; }
      const k = 1 - u.life;
      // rises, slows, and leans with the breeze as it goes
      sp.position.set(u.x + Math.sin(elapsed * .6 + u.sway) * .3 * k + k * k * u.drift * 1.6, u.y + Math.sqrt(k) * 4.2, u.z + Math.cos(elapsed * .5 + u.sway) * .3 * k);
      const size = (.55 + k * 2.6) * u.big;
      sp.scale.set(size, size * (.9 + k * .2), 1);
      sp.material.rotation = u.sway + k * u.spin;
      sp.material.color.copy(smokeDark).lerp(smokeLight, Math.min(1, k * 1.6));
      sp.material.opacity = Math.min(1, k * 6) * Math.pow(u.life, .8) * .85;
    }
  }

