  // ================= Intro cutscene =================
  // Plays once, on your first arrival (and from Settings). Everything is drawn
  // live: a sea chart inked on a canvas, then the island itself with scripted
  // camera paths, weather and the ink shader. About 70 seconds; skippable.
  const BEATS = [['chart', 0, 11], ['storm', 11, 25], ['below', 25, 33], ['beach', 33, 45], ['name', 45, 53], ['fog', 53, 63], ['title', 63, 73]];
  const CUT_LEN = 73;
  const cutEl = { root: $('cut'), chart: $('cutChart'), cap: $('cutCap'), name: $('cutName'), title: $('cutTitle'), flash: $('cutFlash'),
    veil: $('cutVeil'), under: $('cutUnder'), skip: $('cutSkip') };
  let Cut = { on: false }, seaAmp = 1;
  const teal = new THREE.Color(0x3C6466);
  const lerp = (a, b, k) => a + (b - a) * k, ease = k => k * k * (3 - 2 * k);
  // the island's outline for the chart: walk in from the sea along each bearing
  let coast = null;
  function coastline() {
    if (coast) return coast;
    coast = [];
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 90) {
      let r = WG.ISL + 60; while (r > 0 && heightAt(Math.cos(a) * r, Math.sin(a) * r) <= 0) r -= 1.5;
      coast.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    coast.push(coast[0]);
    return coast;
  }
  function partial(g, pts, frac) {   // stroke the first frac of a polyline
    const n = Math.max(0, Math.min(pts.length - 1, (pts.length - 1) * frac));
    if (n <= 0) return;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= Math.floor(n); i++) g.lineTo(pts[i][0], pts[i][1]);
    const f = n - Math.floor(n), a = pts[Math.floor(n)], b = pts[Math.min(pts.length - 1, Math.floor(n) + 1)];
    g.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f); g.stroke();
  }
  function drawChart(u) {
    const c = cutEl.chart, W = c.width = innerWidth, H = c.height = innerHeight, g = c.getContext('2d'), INK = '#2B211F';
    const k = (a, b) => clamp((u - a) / (b - a), 0, 1);
    g.fillStyle = '#E6D8B5'; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
    vg.addColorStop(0, 'rgba(120,90,50,0)'); vg.addColorStop(1, 'rgba(90,60,30,.45)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.strokeStyle = INK; g.lineCap = g.lineJoin = 'round';
    // frame
    g.lineWidth = 3; const m = 24;
    partial(g, [[m, m], [W - m, m], [W - m, H - m], [m, H - m], [m, m]], k(.02, .14));
    g.lineWidth = 1.5; partial(g, [[m + 8, m + 8], [W - m - 8, m + 8], [W - m - 8, H - m - 8], [m + 8, H - m - 8], [m + 8, m + 8]], k(.04, .16));
    // compass rose and rhumb lines
    const rx = W * .2, ry = H * .74, R = Math.min(W, H) * .09;
    g.lineWidth = 1; g.globalAlpha = .45;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; partial(g, [[rx, ry], [rx + Math.cos(a) * W, ry + Math.sin(a) * W]], k(.1 + i * .008, .3 + i * .008)); }
    g.globalAlpha = 1; g.lineWidth = 2.5;
    if (u > .12) {
      g.save(); g.globalAlpha = k(.12, .24);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? R * .55 : R;
        g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + Math.cos(a - .18) * rr * .3, ry + Math.sin(a - .18) * rr * .3); g.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr);
        g.lineTo(rx + Math.cos(a + .18) * rr * .3, ry + Math.sin(a + .18) * rr * .3); g.closePath(); g.fillStyle = i % 2 ? '#E6D8B5' : INK; g.fill(); g.stroke();
      }
      g.font = '600 20px Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center'; g.fillText('N', rx, ry - R - 8);
      g.restore();
    }
    // the island, small, in the middle of the sea
    const S = Math.min(W, H) * .16 / WG.ISL, cx = W * .56, cy = H * .46;
    const pts = coastline().map(([x, z]) => [cx + x * S, cy + z * S]);
    g.lineWidth = 3; partial(g, pts, k(.25, .6));
    if (u > .5) {   // hatching off the shore, and a few waves
      g.save(); g.globalAlpha = k(.5, .62); g.lineWidth = 1.2;
      pts.forEach(([x, y], i) => { if (i % 3) return; const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; g.beginPath(); g.moveTo(x + dx / l * 4, y + dy / l * 4); g.lineTo(x + dx / l * 13, y + dy / l * 13); g.stroke(); });
      const r = mulberry32(5);
      for (let i = 0; i < 18; i++) { const x = W * (.1 + r() * .8), y = H * (.1 + r() * .8); if (Math.hypot(x - cx, y - cy) < WG.ISL * S * 1.5) continue;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 7, y - 6, x + 14, y); g.quadraticCurveTo(x + 21, y + 6, x + 28, y); g.stroke(); }
      g.restore();
    }
    // the label, in old handwriting, letter by letter
    if (u > .62) {
      const word = 'Unknown', n = Math.floor(k(.62, .8) * word.length + .001);
      g.font = 'italic 600 ' + Math.round(Math.min(W, H) * .07) + 'px Georgia, "Times New Roman", serif'; g.fillStyle = INK; g.textAlign = 'left';
      const full = g.measureText(word).width;
      g.fillText(word.slice(0, n), cx - full / 2, cy + WG.ISL * S + Math.min(W, H) * .1);
    }
    // it dissolves into stippled dark
    const d = k(.84, 1);
    if (d > 0) {
      g.fillStyle = '#0E0B0A'; const dots = Math.floor(d * d * W * H / 40);
      for (let i = 0; i < dots; i++) g.fillRect(Math.random() * W, Math.random() * H, 2.5, 2.5);
      g.globalAlpha = clamp((d - .6) / .4, 0, 1); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    }
  }
  function makeReedBoat() {
    const g = new THREE.Group(), reedM = soft(0xC9B27A), tieM = soft(0x7A5A45);
    for (const sx of [-.2, .2]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, 3, 10), reedM);
      b.rotation.x = Math.PI / 2; b.position.set(sx, .15, 0); g.add(b);
      for (const e of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.24, .9, 10), reedM); c.rotation.x = e * Math.PI / 2 + e * -.35; c.position.set(sx, .32, e * 1.85); g.add(c); }
    }
    for (const z of [-.9, 0, .9]) { const t2 = new THREE.Mesh(new THREE.TorusGeometry(.42, .04, 6, 16), tieM); t2.position.set(0, .15, z); t2.scale.y = .7; g.add(t2); }
    const frog = makeCastaway(me ? colorFor(me.id) : CLOAKS[0]); scene.remove(frog.root);
    frog.root.scale.setScalar(.8); frog.root.position.set(0, .2, -.3); frog.root.rotation.set(.5, .3, 0); frog.armL.rotation.x = -2.2; frog.armR.rotation.x = -2.4;
    g.add(frog.root);
    shadows(g); scene.add(g);
    return g;
  }
  function makeSleeperShape() {   // too big to make sense of: a curved back with ridges, one closed eye
    const g = new THREE.Group(), skin = soft(0x0F1516), ridge = soft(0x080B0C);
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), skin); back.scale.set(60, 5, 14); g.add(back);
    for (let i = 0; i < 9; i++) { const r2 = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), ridge); r2.scale.set(4, 2.2, 3); r2.position.set(-44 + i * 11, 4.2 - Math.abs(i - 4) * .45, 0); g.add(r2); }
    scene.add(g);
    return g;
  }
  function beatAt(T) { for (const b of BEATS) if (T < b[2]) return { key: b[0], u: (T - b[1]) / (b[2] - b[1]), at: T - b[1] }; return { key: 'end', u: 1, at: 0 }; }
  function caption(text) {
    if (Cut.capText === text) return;
    Cut.capText = text;
    cutEl.cap.classList.remove('on');
    clearTimeout(Cut.capTimer);
    if (text) Cut.capTimer = setTimeout(() => { cutEl.cap.textContent = text; cutEl.cap.classList.add('on'); }, 500);
  }
  function startCutscene(rewatch) {
    if (Cut.on || !hero) return;
    closePanels(); showHud(false); releaseKeys();
    const spot = rewatch ? { x: SPAWN.x, z: SPAWN.z } : { x: px, z: pz };
    const actor = makeCastaway(colorFor(me.id)); setPatches(actor, rewatch ? [] : myPatches);
    const lie = Math.PI * .85;   // lying with the head up the beach
    Cut = { on: true, T: 0, rewatch, spot, actor, lie, savedEnv: env, boat: makeReedBoat(), shape: makeSleeperShape(), stilled: makeStilled(7),
      wreck: [], focus: { x: spot.x, z: spot.z + 60 }, waves: 0, flashes: [.25, .55, .8], grey: 0, light: null };
    Cut.stilled.visible = false;
    for (const [i, key, dx, dz] of [[1, 'driftwood', -9, 1.5], [2, 'crate_seeds', -5.5, 2.4], [3, 'driftwood', -12, 3.2], [4, 'driftwood', 3, 2]]) {
      const w = makeWashup({ id: 9000 + i, key, x: spot.x + dx, z: spot.z + dz, data: {} }); scene.add(w); Cut.wreck.push(w);
    }
    hero.root.visible = false;
    cutEl.root.classList.remove('gone'); cutEl.veil.style.opacity = 0; cutEl.title.className = 'title'; cutEl.name.classList.remove('on');
    cutEl.chart.style.display = 'block'; cutEl.chart.style.opacity = 1;
    Sound.init();
    if (net) net.send({ t: 'intro' });
  }
  function endCutscene(skipped) {
    if (!Cut.on) return;
    const C = Cut;
    removeCastaway(C.actor); scene.remove(C.boat); scene.remove(C.shape); scene.remove(C.stilled); C.wreck.forEach(w => scene.remove(w));
    clearTimeout(C.capTimer);
    clouds.forEach(c2 => { c2.visible = true; }); mist.visible = true;
    if (camera.far !== 400) { camera.far = 400; camera.updateProjectionMatrix(); inkMat.uniforms.far.value = 400; }
    Cut = { on: false }; seaAmp = 1; seaMat.side = THREE.FrontSide; sea.visible = true; scene.fog.near = 50; scene.fog.far = 125;
    setEnv(C.savedEnv);
    if (hero) { hero.root.visible = true; hero.root.rotation.x = 0; }
    cutEl.cap.classList.remove('on'); cutEl.name.classList.remove('on'); cutEl.title.className = 'title';
    cutEl.under.style.opacity = 0; cutEl.flash.style.opacity = 0; cutEl.chart.style.display = 'none';
    // hand over: a soft fade if the camera has to jump (skipped, or watched from elsewhere)
    if (skipped || C.rewatch) { cutEl.veil.style.transition = 'none'; cutEl.veil.style.opacity = 1; requestAnimationFrame(() => { cutEl.veil.style.transition = 'opacity .9s'; cutEl.veil.style.opacity = 0; }); }
    setTimeout(() => { if (!Cut.on) { cutEl.root.classList.add('gone'); cutEl.veil.style.transition = ''; } }, 1000);
    if (state === 'play') showHud(true);
    if (net) net.send({ t: 'intro-seen' });
    if (!C.rewatch) setTimeout(() => toast('Thirsty. There might be fresh water inland.'), 900);
  }
  cutEl.skip.addEventListener('click', () => endCutscene(true));

  // Runs every frame while the cutscene is on: sets the time of day, weather,
  // camera and overlays for the current beat.
  const cutCam = new THREE.Vector3(), cutLook = new THREE.Vector3();
  function updateCutscene(dt) {
    const C = Cut;
    C.T += dt;
    if (C.T >= CUT_LEN || state !== 'play') { endCutscene(false); return; }
    const b = beatAt(C.T), u = b.u, sp = C.spot, bx = sp.x + 12, bz = sp.z + 75;
    const boatY = x => Math.sin(x * .25 + elapsed * 1.1) * .09 * seaAmp + Math.cos(bz * .3 + elapsed * .9) * .09 * seaAmp;
    C.under = 0; C.light = null; C.grey = 0;
    C.boat.visible = b.key === 'storm' || b.key === 'below';
    C.shape.visible = b.key === 'below';
    // waves on the sound track
    if ((C.waves -= dt) <= 0 && ['chart', 'storm', 'beach', 'name'].includes(b.key) && Sound.ctx && prefs.sounds !== false) {
      C.waves = 3.2; if (Sound.ctx.state === 'suspended') Sound.ctx.resume(); Sound.burst(Sound.ctx.currentTime, 3, 'lowpass', b.key === 'storm' ? 700 : 450, .6, b.key === 'storm' ? .3 : .16, (Math.random() - .5) * .6);
    }
    cutEl.chart.style.display = b.key === 'chart' ? 'block' : 'none';
    cutEl.under.style.opacity = 0;
    if (b.key === 'chart') {
      drawChart(u); C.tod = .95;
      caption(u > .15 && u < .9 ? 'On every old sea chart, this place is marked Unknown.' : '');
      cutCam.set(bx + 8, 3, bz + 8); cutLook.set(bx, 0, bz);
    } else if (b.key === 'storm') {
      C.tod = .95; seaAmp = 4;
      if (!C.stormSet) { C.stormSet = true; setEnv({ phase: 0, weather: 'storm', rain: true, storm: true, lightMul: .7 }); cutEl.veil.style.transition = 'opacity 1.2s'; cutEl.veil.style.opacity = 1; requestAnimationFrame(() => { cutEl.veil.style.opacity = 0; }); }
      for (const f of C.flashes) if (u >= f && !C['f' + f]) { C['f' + f] = true; flash = .3; cutEl.flash.style.transition = 'none'; cutEl.flash.style.opacity = .95;
        requestAnimationFrame(() => { cutEl.flash.style.transition = 'opacity .35s'; cutEl.flash.style.opacity = 0; }); Sound.rumble(); }
      C.boat.position.set(bx, boatY(bx) + .05, bz); C.boat.rotation.set(Math.sin(elapsed * 1.3) * .25, .4 + Math.sin(elapsed * .4) * .2, Math.sin(elapsed * 1.7) * .2);
      const a = .9 + u * 1.2;
      cutCam.set(bx + Math.sin(a) * 9, 3.2 + Math.sin(elapsed * .8) * .4, bz + Math.cos(a) * 9); cutLook.set(bx, .6, bz);
      caption(u > .1 && u < .92 ? 'Sailors say the fog around it hums at night, and that the island is never in the same place twice.' : '');
    } else if (b.key === 'below') {
      C.tod = .95; seaAmp = 3; seaMat.side = THREE.DoubleSide;
      if (!C.belowSet) { C.belowSet = true; Sound.breath(); caption(''); }
      C.boat.position.set(bx, boatY(bx) + .05, bz);
      const sink = ease(clamp(u / .35, 0, 1));
      C.under = sink; C.light = { x: bx, z: bz, r: 45 };   // no stipple fog down here, only murk
      sea.visible = sink < .5;
      // sink below and look back up at the boat; the shape passes between, dark against the surface
      cutCam.set(bx - 6, lerp(3, -9, sink), bz + lerp(14, 16, sink)); cutLook.set(bx, lerp(.5, -7, sink), bz - 6);
      C.shape.position.set(bx + lerp(-110, 100, ease(clamp((u - .25) / .7, 0, 1))), -19, bz - 22);
      cutEl.under.style.opacity = sink;
      cutEl.veil.style.transition = 'none'; cutEl.veil.style.opacity = clamp((u - .82) / .18, 0, 1);
    } else {
      // on the beach: grey morning, the frog in the sand
      if (!C.beachSet) { C.beachSet = true; seaAmp = 1; seaMat.side = THREE.FrontSide; sea.visible = true; setEnv({ phase: 4, weather: 'clear', lightMul: 1 }); cutEl.veil.style.transition = 'opacity 1.6s'; cutEl.veil.style.opacity = 0; }
      C.tod = .28 + (C.T - 33) / 40 * .04; C.grey = .45;
      const lx = sp.x, lz = sp.z, gy = groundAt(lx, lz);
      C.actor.root.position.set(lx, gy, lz); C.actor.root.rotation.set(-1.45, C.lie, 0);
      const head = _v.set(0, 1.35, 0); C.actor.root.localToWorld(head);
      if (b.key === 'beach') {
        const k = ease(u);
        cutCam.set(lerp(lx - 16, lx - 3.2, k), groundAt(lx - 10, lz + 3) + lerp(2.6, 1.7, k), lerp(lz + 3.5, lz + 2.2, k));
        cutLook.set(lerp(lx - 8, head.x, k), gy + .4, lerp(lz + 1, head.z, k));
        caption(u > .15 ? 'You wake on a grey beach. You don’t remember arriving.' : '');
      } else if (b.key === 'name') {
        const k = ease(u);
        cutCam.set(head.x + lerp(1.1, .55, k), head.y + lerp(1, .55, k), head.z + lerp(.6, .3, k)); cutLook.copy(head);
        cutEl.name.classList.toggle('on', u > .2 && u < .92);
        caption(u > .3 ? 'Stitched inside the collar is a name that isn’t yours.' : '');
      } else if (b.key === 'fog') {
        if (!C.fogSet) { C.fogSet = true; setEnv({ phase: 4, weather: 'fogstorm', fogStorm: true, lightMul: 1 }); }
        C.light = { x: lx, z: lz, r: 11 };
        C.actor.armR.rotation.x = Math.sin(C.T * 3) * .25 - .2;   // stirring
        const k = ease(clamp(u / .8, 0, 1));
        cutCam.set(lx + lerp(1, 3, k), gy + lerp(1.2, 16, k), lz + lerp(1.5, 20, k)); cutLook.set(lx, gy + lerp(.3, 2, k), lz - lerp(0, 25, k));
        const sx = lx - 5, sz = lz - 17;
        C.stilled.visible = u > .6 && u < .72;   // there, and gone
        C.stilled.position.set(sx, groundAt(sx, sz), sz); C.stilled.rotation.y = Math.atan2(lx - sx, lz - sz);
        caption(u > .1 && u < .9 ? 'Anyone who washes up here doesn’t wash back out.' : '');
      } else if (b.key === 'title') {
        if (!C.titleSet) { C.titleSet = true; setEnv(C.savedEnv); caption(''); cutEl.title.className = 'title on'; }
        if (u > .78) cutEl.title.className = 'title on out';
        C.blend = ease(clamp((u - .3) / .65, 0, 1));   // morning light slides into the island's real hour
        const up = ease(clamp((u - .25) / .3, 0, 1));
        C.actor.root.rotation.x = -1.45 * (1 - up); C.actor.root.rotation.y = lerp(C.lie, face, up);
        // ease from the high shot down into the ordinary camera behind the frog
        const k = ease(clamp((u - .3) / .6, 0, 1)), fx = lx, fz = lz, fy = Math.max(heightAt(fx, fz), -.75);
        const pp = Math.max(pitch, .18);
        const hx = fx + Math.sin(yaw) * Math.cos(pp) * camDist, hz = fz + Math.cos(yaw) * Math.cos(pp) * camDist, hy = Math.max(fy + 1.2 + Math.sin(pp) * camDist, heightAt(hx, hz) + .8);
        cutCam.set(lerp(lx + 3, hx, k), lerp(gy + 16, hy, k), lerp(lz + 20, hz, k)); cutLook.set(fx, lerp(gy + 2, fy + 1.3, k), lerp(lz - 25, fz, k));
      }
      C.focus = { x: lx, z: lz };
      return;
    }
    C.focus = { x: bx, z: bz - 40 };
  }

