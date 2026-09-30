  // ---- mob: the Crawler (C2) ----
  // The thing in the sea cave: the Stilled's pale, flat colour (no outlines, no shading, so
  // it shows as a hole in the dark), three times the size, all long arms and legs. It hangs
  // from the roof when it lurks (extra[0] 'c') and drops to the floor to hunt ('f');
  // extra[1] is the height of the floor or roof under it. Its scream (a 'scream' message)
  // plays a clip from public/sfx/crawler/ if any are listed in list.json there, otherwise a
  // made-up screech, and shakes the view.
  const crawlerMat = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(0xD9D0BD) } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 col; void main(){ gl_FragColor = vec4(col, 0.); }',
    blending: THREE.NoBlending,
  });
  const crawlerMouthMat = new THREE.MeshBasicMaterial({ color: 0x16100E });
  // A limb between two points (in the parent's space).
  function crawlerLimb(parent, a, b, r0, r1) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), crawlerMat);
    m.position.copy(a).addScaledVector(d, .5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.renderOrder = 10; parent.add(m);
    return m;
  }
  function makeCrawler(id) {
    const g = new THREE.Group(), inner = new THREE.Group(), body = new THREE.Group();
    g.add(inner); inner.add(body);
    const part = (parent, geo, x, y, z, sx = 1, sy = 1, sz = 1, mat = crawlerMat) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.renderOrder = 10; parent.add(m); return m; };
    part(body, new THREE.SphereGeometry(.45, 12, 9), 0, .95, 0, .8, .55, 2);        // a long, low back
    part(body, new THREE.SphereGeometry(.3, 10, 8), 0, .9, -.95, 1, .7, 1.2);      // haunches
    const head = new THREE.Group(); head.position.set(0, 1.05, 1.15); body.add(head);
    part(head, new THREE.SphereGeometry(.26, 12, 9), 0, 0, .12, 1, .8, 1.35);      // a smooth, eyeless head
    const jaw = part(head, new THREE.BoxGeometry(.3, .035, .06), 0, -.07, .45, 1, 1, 1, crawlerMouthMat);   // the mouth: a dark slit
    const legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = new THREE.Group(); hip.position.set(sx * .3, .95, sz * .7); body.add(hip);
      const knee = new THREE.Vector3(sx * 1.05, .75, sz * .55), foot = new THREE.Vector3(sx * 1.6, -.95, sz * 1.05);
      crawlerLimb(hip, new THREE.Vector3(0, 0, 0), knee, .1, .075);
      crawlerLimb(hip, knee, foot, .075, .035);
      legs.push({ hip, sx, sz, phase: (sx * sz > 0 ? 0 : Math.PI) });
    }
    g.userData = { inner, body, head, jaw, legs, lastX: null, lastZ: null, speed: 0, screamAt: -1e9 };
    g.rotation.y = WG.hash2(id, 9) * 6;
    return g;
  }
  UI.mobs.register('crawler', {
    make: makeCrawler,
    pose(m, dt, now) {
      const u = m.mesh.userData, [surf, y] = m.extra || ['f', m.mesh.position.y], s = (now - m.stateAt) / 1000;
      // how fast it's moving, for the gait
      const p = m.mesh.position;
      if (u.lastX != null && dt > 0) u.speed += (Math.hypot(p.x - u.lastX, p.z - u.lastZ) / dt - u.speed) * Math.min(1, dt * 6);
      u.lastX = p.x; u.lastZ = p.z;
      // on the floor, or upside down along the roof
      p.y = y;
      const flip = surf === 'c' ? Math.PI : 0;
      u.inner.rotation.z += (flip - u.inner.rotation.z) * Math.min(1, dt * 5);
      // legs: a scuttle, faster the faster it goes
      u.walk = (u.walk || 0) + dt * (2 + u.speed * 2.2);
      for (const l of u.legs) {
        const k = Math.sin(u.walk + l.phase);
        l.hip.rotation.y = k * .35 * Math.min(1, u.speed / 2 + .15);
        l.hip.rotation.z = -l.sx * Math.max(0, -Math.cos(u.walk + l.phase)) * .25 * Math.min(1, u.speed / 2);
      }
      // rearing before the lunge, lunging, shrinking back from light
      const pitch = m.state === 'windup' ? -Math.min(1, s / .8) * .45 : m.state === 'strike' || (m.state === 'recover' && s < .3) ? .35 : 0;
      u.body.rotation.x += (pitch - u.body.rotation.x) * Math.min(1, dt * 10);
      const shrink = m.state === 'recoil' ? .82 : 1;
      u.body.scale.setScalar(u.body.scale.x + (shrink - u.body.scale.x) * Math.min(1, dt * 6));
      // screaming: the head thrown back, the mouth wide, shaking
      const sc = (now - u.screamAt) / 1000;
      const open = sc < 1.3 ? Math.sin(Math.min(1, sc / 1.3) * Math.PI) : 0;
      u.jaw.scale.y = 1 + open * 7; u.jaw.position.y = -.07 - open * .1;
      u.head.rotation.x = -open * .6 + (m.state === 'lurk' ? Math.sin(now / 900) * .15 : 0);
      u.head.rotation.z = open * Math.sin(now / 30) * .15 + (m.state === 'lurk' ? Math.sin(now / 1300) * .3 : 0);   // the head tilts, listening
    },
  });

  // ---- the scream ----
  let crawlerClips = null;   // decoded AudioBuffers from public/sfx/crawler/ (null: none, use the made-up one)
  let crawlerShake = 0;
  fetch('/sfx/crawler/list.json').then(r => (r.ok ? r.json() : [])).then(list => { crawlerClips = Array.isArray(list) && list.length ? list.map(f => ({ file: f, buf: null })) : null; }).catch(() => {});
  function screamSound(vol, pan, muffled) {
    if (!Sound.ctx || prefs.sounds === false || vol <= 0) return;
    const c = Sound.ctx;
    if (c.state === 'suspended') c.resume();
    const out = c.createGain(); out.gain.value = vol;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = muffled ? 600 : 9000;
    let node = lp; out.connect(lp);
    if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, pan)); lp.connect(pn); node = pn; }
    node.connect(c.destination);
    const t0 = c.currentTime + .02;
    if (crawlerClips) {   // one of Thaqif's clips, picked at random
      const clip = crawlerClips[(Math.random() * crawlerClips.length) | 0];
      const play = buf => { const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = .9 + Math.random() * .2; src.connect(out); src.start(); };
      if (clip.buf) return play(clip.buf);
      fetch('/sfx/crawler/' + clip.file).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(buf => { clip.buf = buf; play(buf); }).catch(() => {});
      return;
    }
    // made up until then: a rising, tearing shriek over a rasp of noise
    for (const [f0, f1, type, g] of [[380, 1650, 'sawtooth', .22], [510, 2100, 'square', .08], [260, 900, 'sawtooth', .14]]) {
      const o = c.createOscillator(), gn = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + .5); o.frequency.exponentialRampToValueAtTime(f1 * .55, t0 + 1.6);
      lfo.frequency.value = 37; lg.gain.value = f0 * .12; lfo.connect(lg); lg.connect(o.frequency);
      gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(g, t0 + .06); gn.gain.setValueAtTime(g, t0 + 1.1); gn.gain.exponentialRampToValueAtTime(.001, t0 + 1.7);
      o.connect(gn); gn.connect(out); o.start(t0); lfo.start(t0); o.stop(t0 + 1.75); lfo.stop(t0 + 1.75);
    }
    Sound.burst(t0, 1.4, 'bandpass', 2600, .8, .35 * vol, pan);
  }
  UI.net.on('scream', m => {
    const mob = UI.mobs.all().get(m.id);
    if (mob) mob.mesh.userData.screamAt = performance.now();
    if (!me || state !== 'play') return;
    const d = Math.hypot(m.x - px, m.z - pz), hear = 70;
    if (d > hear) return;
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    const pan = d > .1 ? ((m.x - px) * -f.z + (m.z - pz) * f.x) / d / (Math.hypot(f.x, f.z) || 1) : 0;
    const inside = myCave && myCave.id === m.under;
    screamSound(.55 * (1 - d / hear) ** 1.2 + .1, pan, !inside);
    crawlerShake = Math.max(crawlerShake, (inside ? 1.2 : .5) * (1 - d / hear));
    if (!inside) toast('A scream, somewhere under the ground.');
  });
  // the shake (after the cave camera has placed the view)
  UI.onFrame(dt => {
    if (crawlerShake <= 0) return;
    crawlerShake = Math.max(0, crawlerShake - dt);
    const k = Math.min(1, crawlerShake) * .12;
    camera.position.x += (Math.random() - .5) * k; camera.position.y += (Math.random() - .5) * k; camera.position.z += (Math.random() - .5) * k;
  });
  UI.crawler = { scream: screamSound };
