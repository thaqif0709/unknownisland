  // ================= The Veil (task W5, with the big world) =================
  // Lands the Sleeper hasn't opened yet sit behind a wall of fog. You can see it banked up
  // along their borders; walk into it and you're turned around (the server checks too).
  let openRegions = new Set(['landing']);
  const veilOn = () => WG.feature('bigworld');
  // Is this spot behind the Veil? (Water never is.)
  function veilBlocks(x, z) {
    if (!veilOn()) return false;
    const r = WG.regionAt(x, z);
    return r !== 'sea' && !openRegions.has(r);
  }
  let veilTurnAt = 0;
  function veilTurn() {
    const now = performance.now();
    if (now - veilTurnAt < 1500) return;
    veilTurnAt = now;
    yaw += Math.PI; face += Math.PI;
    toast('The fog closes in, and when it thins you are facing the way you came.');
    if (net && net.open) net.send({ t: 'veil' });
  }
  UI.net.on('welcome', m => { openRegions = new Set(m.regions || ['landing']); veilDirty = true; });
  UI.net.on('regions', m => { openRegions = new Set(m.open || ['landing']); veilDirty = true; });
  UI.net.on('veil', () => veilTurn());

  // The fog bank: puffs along every border between open and locked land near you, rebuilt
  // as you move. Drawn like smoke (no ink), but thick: its own dense puff textures.
  function veilTexture(seed) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), r = mulberry32(seed);
    for (let i = 0; i < 9; i++) {
      const x = 64 + (r() - .5) * 50, y = 70 + (r() - .5) * 36, rad = 22 + r() * 26, a = .55 + r() * .3;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(240,236,228,${a})`); grd.addColorStop(.6, `rgba(228,222,212,${a * .7})`); grd.addColorStop(1, 'rgba(225,218,208,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    return new THREE.CanvasTexture(c);
  }
  const veilTexs = [5, 17, 29].map(veilTexture);
  const VEIL_STEP = 12, VEIL_R = 180, VEIL_MAX = 420;
  const veilPuffs = [];
  let veilDirty = true, veilCentre = null, veilUsed = 0;
  function veilPuff() {
    if (veilUsed < veilPuffs.length) return veilPuffs[veilUsed++];
    if (veilPuffs.length >= VEIL_MAX) return null;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: veilTexs[veilPuffs.length % veilTexs.length], color: 0xF2EEE6, transparent: true, depthWrite: false, fog: false }));
    scene.add(sp); noInk.add(sp); veilPuffs.push(sp); veilUsed++;
    return sp;
  }
  function rebuildVeil(x0, z0) {
    veilUsed = 0;
    if (veilOn()) {
      const n = Math.round(VEIL_R / VEIL_STEP), gx = Math.round(x0 / VEIL_STEP), gz = Math.round(z0 / VEIL_STEP);
      const locked = new Map(), key = (i, j) => i + ',' + j;
      for (let i = -n - 1; i <= n + 1; i++) for (let j = -n - 1; j <= n + 1; j++) locked.set(key(i, j), veilBlocks((gx + i) * VEIL_STEP, (gz + j) * VEIL_STEP));
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        if (!locked.get(key(i, j)) || i * i + j * j > n * n) continue;
        // how far into the locked land: thickest at the edge, thinning over two cells
        let edge = 3;
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (locked.get(key(i + a, j + b)) === false) edge = Math.min(edge, Math.max(Math.abs(a), Math.abs(b)));
        if (edge > 2) continue;
        const r = mulberry32((gx + i) * 7349 + (gz + j) * 1301), wx = (gx + i) * VEIL_STEP, wz = (gz + j) * VEIL_STEP;
        for (let k = 0; k < (edge === 1 ? 3 : 2); k++) {
          const sp = veilPuff(); if (!sp) break;
          const px2 = wx + (r() - .5) * VEIL_STEP, pz2 = wz + (r() - .5) * VEIL_STEP, s = 20 + r() * 16;
          sp.position.set(px2, Math.max(0, heightAt(px2, pz2)) + s * .3 + r() * 6, pz2);
          sp.scale.set(s * 1.4, s, 1);
          sp.userData.base = sp.position.y; sp.userData.ph = r() * 6.28;
          sp.material.opacity = edge === 1 ? .95 : .7;
        }
      }
    }
    for (let i = 0; i < veilPuffs.length; i++) veilPuffs[i].visible = i < veilUsed;
  }
  UI.onFrame(dt => {
    const cx = inGame() ? px : TITLE.x, cz = inGame() ? pz : TITLE.z;
    if (veilDirty || !veilCentre || Math.hypot(cx - veilCentre.x, cz - veilCentre.z) > 30) {
      rebuildVeil(cx, cz); veilCentre = { x: cx, z: cz }; veilDirty = false;
    }
    const tt = performance.now() / 1000;   // a slow heave, so the wall looks alive
    for (let i = 0; i < veilUsed; i++) { const sp = veilPuffs[i]; sp.position.y = sp.userData.base + Math.sin(tt * .4 + sp.userData.ph) * 1.2; }
  });

