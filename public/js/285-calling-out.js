  // ================= Calling out to friends (task P11) =================
  // Press C (or Call on a phone) to call out: a two-note frog call that friends within
  // RULES.CALL.HEAR metres hear from your direction (muffled if a cave is between you), a
  // bubble over your head, a note with the direction for anyone further off, and a ring on
  // everyone's map for RULES.CALL.SHOW seconds. The server allows one call every RULES.CALL.GAP s.
  const calls = [];   // { id, name, x, z, at } (performance.now() ms), newest last
  let lastCallAt = -1e9;
  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  // The way from you to (x, z) as a compass word (north is -z).
  const compassTo = (x, z) => COMPASS[Math.round(((Math.atan2(x - px, -(z - pz)) / (Math.PI * 2)) * 8 + 8)) % 8];

  function callOut() {
    if (state !== 'play' || !net || !net.open || knockT > 0) return;
    const now = performance.now(), gap = RULES.CALL.GAP * 1000;
    if (now - lastCallAt < gap) { toast('Catch your breath before calling again.'); return; }
    lastCallAt = now;
    Sound.init();
    net.send({ t: 'call' });
  }
  $('btnCall').addEventListener('click', callOut);

  // The call itself: two falling notes with a wobble, like a frog's "hoo-oo". vol 0..1,
  // pan -1 (left) .. 1 (right), muffled: through rock.
  function callSound(vol, pan, muffled) {
    const c = Sound.ctx;
    if (!c || vol <= 0) return;
    if (c.state === 'suspended') c.resume();
    const out = c.createGain(); out.gain.value = vol;
    let node = out;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = muffled ? 450 : 2400 - (1 - vol) * 1200;   // far away: softer and duller
    node.connect(lp); node = lp;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
    node.connect(c.destination);
    const t0 = c.currentTime + .02;
    [[0, 520, 430, .34], [.42, 470, 360, .5]].forEach(([at, f0, f1, dur]) => {
      const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f0, t0 + at); o.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
      lfo.frequency.value = 23; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);   // the throaty wobble
      g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(.9, t0 + at + .04); g.gain.exponentialRampToValueAtTime(.001, t0 + at + dur);
      o.connect(g); g.connect(out);
      o.start(t0 + at); lfo.start(t0 + at); o.stop(t0 + at + dur + .05); lfo.stop(t0 + at + dur + .05);
    });
  }

  UI.net.on('call', m => {
    calls.push({ id: m.id, name: m.name, x: m.x, z: m.z, at: performance.now() });
    if (calls.length > 30) calls.shift();
    if (!me) return;
    const mine = m.id === me.id, d = mine ? 0 : Math.hypot(m.x - px, m.z - pz), hear = RULES.CALL.HEAR;
    // where the sound comes from, relative to where the camera looks
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    const l = Math.hypot(m.x - px, m.z - pz) || 1, pan = mine ? 0 : ((m.x - px) * -f.z + (m.z - pz) * f.x) / l / Math.hypot(f.x, f.z);
    const muffled = !mine && (m.under || 0) !== (myCave ? myCave.id : 0);
    if (mine) callSound(.3, 0, false);
    else if (d < hear) callSound(.12 + .5 * (1 - d / hear) ** 1.5, pan, muffled);
    if (mine) { toast('You call out. Everyone can see where on their map for a minute.'); return; }
    const r = remotes.get(m.id);
    if (r) { r.bubble = 'Hoo-oo!'; r.bubbleT = 3; renderTag(r); }
    if (d > 40) toast(`${m.name} calls out${d < hear ? '' : ', far off'} to the ${compassTo(m.x, m.z)}${d < hear ? '' : ` (about ${Math.round(d / 50) * 50 || 50} m)`}. Look on the map.`);
  });
  UI.net.on('welcome', () => { calls.length = 0; });

  // The map: a ring where each call came from, fading over a minute, with the caller's name.
  UI.mapLayers.push({
    draw(g, at, dotScale, full) {
      const now = performance.now(), life = RULES.CALL.SHOW * 1000;
      for (const c of calls) {
        const age = now - c.at; if (age > life) continue;
        const k = 1 - age / life, [cx, cy] = at(c.x, c.z), pulse = (age / 1000) % 1.6 / 1.6;
        g.save();
        g.globalAlpha = .9 * k;
        g.strokeStyle = mapCol(c.id); g.lineWidth = 2.2 * dotScale;
        g.beginPath(); g.arc(cx, cy, (7 + pulse * 16) * dotScale, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = k; g.fillStyle = mapCol(c.id);
        g.beginPath(); g.arc(cx, cy, 3 * dotScale, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#2B211F'; g.stroke();
        if (full && me && c.id !== me.id) { g.font = '600 12px sans-serif'; g.fillStyle = '#2B211F'; g.fillText(c.name, cx + 8, cy - 7); }
        g.restore();
      }
    },
  });
  // For tests and the console.
  UI.calls = { get list() { return calls.slice(); }, sound: callSound };
