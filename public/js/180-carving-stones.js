  // ================= The Sleeper's carving stones =================
  // Standing stones with a carved face. The text is drawn on a canvas; when the
  // Sleeper changes it, the old words flake away and the new ones ink themselves in.
  const carveStoneM = soft(0x8E877C), carveDarkM = soft(0x6F685F);
  let carvings = new Map();
  function makeCarvingStone(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.62, .8, 2.1, 7), carveStoneM); body.scale.z = .55; body.position.y = 1.05; g.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.3, .62, .4, 7), carveStoneM); top.scale.z = .55; top.position.y = 2.3; g.add(top);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, .2, 7), carveDarkM); foot.position.y = .08; g.add(foot);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 400;
    const tex = new THREE.CanvasTexture(canvas);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.96, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    face.position.set(0, 1.25, .47); g.add(face); noInk.add(face);
    g.position.set(c.x, groundAt(c.x, c.z) - .05, c.z); g.rotation.y = c.face;
    shadows(g); face.castShadow = false; scene.add(g);
    return { mesh: g, face, canvas, tex };
  }
  function wrapText(g, text, width) {
    const lines = [], words = String(text).split(/\s+/);
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  // Draw one carving. reveal: 0-1 how much of the new text has inked in; fade: how much of the old text is left.
  function drawCarving(c, reveal = 1, fade = 0) {
    const g = c.canvas.getContext('2d'), W = 256, H = 400;
    g.clearRect(0, 0, W, H);
    const carve = (text, alpha, clipY, worn) => {
      g.save(); g.globalAlpha = alpha;
      if (clipY < H) { g.beginPath(); g.rect(0, 0, W, clipY); g.clip(); }
      g.font = '600 30px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      const lines = wrapText(g, text, 214), y0 = Math.max(60, 190 - lines.length * 19);
      lines.forEach((l, i) => {
        const r = mulberry32(i * 31 + l.length);
        g.fillStyle = 'rgba(233,225,207,.55)'; g.fillText(l, W / 2 + 1.5, y0 + i * 40 + 2);   // the groove's lit edge
        g.fillStyle = worn ? '#4A433C' : '#221A18'; g.fillText(l, W / 2 + (r() - .5) * 2, y0 + i * 40);
      });
      // a spiral mark above, like the oldest carvings
      g.strokeStyle = worn ? '#4A433C' : '#221A18'; g.lineWidth = 4; g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += .2) { const rr = 16 * (1 - a / (Math.PI * 5.4)); g.lineTo(W / 2 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
      g.stroke(); g.restore();
      return y0 + lines.length * 40;
    };
    if (fade > 0 && c.old) carve(c.old, fade, H, c.oldWorn);
    const end = carve(c.text, c.state === 'idle' ? .55 : 1, reveal >= 1 ? H : 60 + reveal * 300, c.state === 'idle');
    if (c.tally && reveal >= 1) {   // tally marks: one scratch per part done
      const [have, need] = c.tally;
      g.strokeStyle = '#221A18'; g.lineWidth = 4; g.lineCap = 'round';
      const n = Math.min(need, 12), x0 = W / 2 - n * 7;
      for (let i = 0; i < n; i++) { g.globalAlpha = i < have ? 1 : .22; g.beginPath(); g.moveTo(x0 + i * 14 + 7, end + 18); g.lineTo(x0 + i * 14 + 4, end + 50); g.stroke(); }
      g.globalAlpha = 1;
    }
    if (fade > 0) {   // flakes where the old words are breaking away
      g.fillStyle = '#8E877C';
      for (let i = 0; i < 90 * fade; i++) g.fillRect(Math.random() * W, 60 + Math.random() * 300, 3, 3);
    }
    c.tex.needsUpdate = true;
  }
  function setCarvings(list, changedId, why) {
    for (const v of list) {
      let c = carvings.get(v.id);
      if (!c) { c = Object.assign({ id: v.id, type: 'carving', r: .8, state: {} }, makeCarvingStone(v)); carvings.set(v.id, c); }
      const textChanged = c.text !== undefined && c.text !== v.text;
      if (textChanged) { c.old = c.text; c.oldWorn = c.stateName === 'idle'; c.anim = 0; }
      Object.assign(c, { key: v.key, x: v.x, z: v.z, text: v.text, stateName: v.state, tally: v.tally, offer: v.offer });
      if (c.anim == null) drawCarving(c);   // otherwise the re-inking redraws it
    }
    if (why === 'new' && state === 'play') { const c = carvings.get(changedId); if (c && Math.hypot(c.x - px, c.z - pz) < 60) toast('Somewhere close, stone scrapes on stone.'); }
    if (!ui.carvingPanel.classList.contains('gone')) renderCarving();
  }
  function animateCarvings(dt) {
    carvings.forEach(c => {
      if (c.anim == null) return;
      c.anim += dt / 3;
      if (c.anim >= 1) { c.anim = null; c.old = null; drawCarving(c); return; }
      drawCarving(c, clamp((c.anim - .35) / .65, 0, 1), clamp(1 - c.anim / .4, 0, 1));
    });
  }
  function clearCarvings() { carvings.forEach(c => { scene.remove(c.mesh); noInk.delete(c.face); }); carvings = new Map(); }

