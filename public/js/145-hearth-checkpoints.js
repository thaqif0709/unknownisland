  // ================= Hearth checkpoints (task P4, flag `checkpoints`) =================
  // Hold V (sit) beside a lit clay hearth, anyone's, and you curl up asleep (under a blanket,
  // eyes shut, z's rising: 120-castaways.js); a few seconds later the fire remembers you, and
  // you wake there after a knockdown or dying. Your
  // checkpoint shows on the map as a flag in your colour (friends' fainter) and as a small
  // pennant on the hearth. The server decides (server/systems/checkpoints.js).
  const CP_REACH = 3;
  const checkpoints = new Map();   // player id -> the hearth (fire id) they wake at (people on the island now)
  const cpOn = () => WG.feature('checkpoints');
  let sleepAsked = false;
  function nearLitHearth() {
    let best = null, bd = CP_REACH;
    fires.forEach(f => { if (f.kind === 'hearth' && f.fuel > 0) { const d = Math.hypot(f.x - px, f.z - pz); if (d < bd) { bd = d; best = f; } } });
    return best;
  }
  // Sleeping shows with the hood pulled down over the face; the hood goes back as it was after.
  function setSleeping(av, on) {
    if (!av || !!av.sleeping === !!on) return;
    if (on) { av.hoodBefore = av.hoodUp.visible; setHood(av, true); } else if (av.hoodBefore != null) setHood(av, av.hoodBefore);
    av.sleeping = !!on;
  }
  // Pennants: a little flag on each hearth someone wakes at, in the cloak colour of one of them (yours first).
  const pennantPole = new THREE.CylinderGeometry(.018, .022, 1.1, 6), pennantCloth = new THREE.BufferGeometry();
  pennantCloth.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -.26, 0, .42, -.12, 0], 3)); pennantCloth.computeVertexNormals();
  let pennants = [];
  function refreshPennants() {
    pennants.forEach(m => scene.remove(m)); pennants = [];
    if (!cpOn()) return;
    const owner = new Map();
    checkpoints.forEach((fid, pid) => { if (!owner.has(fid) || (me && pid === me.id)) owner.set(fid, pid); });
    owner.forEach((pid, fid) => {
      const f = fires.get(fid); if (!f) return;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(pennantPole, logM); pole.position.y = .55; g.add(pole);
      const cloth = new THREE.Mesh(pennantCloth, soft(colorFor(pid), { side: THREE.DoubleSide })); cloth.position.set(.02, 1.08, 0); g.add(cloth);
      g.position.set(f.x + .95, groundAt(f.x + .95, f.z + .3), f.z + .3); g.userData.fire = fid; shadows(g);
      scene.add(g); pennants.push(g);
    });
  }
  UI.net.on('welcome', m => {
    checkpoints.clear(); sleepAsked = false;
    for (const [id, fid] of Object.entries(m.checkpoints || {})) checkpoints.set(+id, fid);
    if (hero) hero.sleeping = false;
    m.players.forEach(p => { const r = remotes.get(p.id); if (r) setSleeping(r.av, p.sleep); });
    refreshPennants();
  });
  UI.net.on('join', m => { const r = remotes.get(m.player.id); if (r) setSleeping(r.av, m.player.sleep); });
  UI.net.on('leave', m => { if (checkpoints.delete(m.id)) refreshPennants(); });
  UI.net.on('checkpoint', m => { if (m.fire == null) checkpoints.delete(m.id); else checkpoints.set(m.id, m.fire); refreshPennants(); });
  UI.net.on('unfire', () => refreshPennants());
  UI.net.on('fire', () => refreshPennants());
  UI.net.on('sleep', m => { const av = me && m.id === me.id ? hero : (remotes.get(m.id) || {}).av; setSleeping(av, m.on); });
  // By a lit hearth, holding V (sit) sleeps there: you sit at once, a ring fills, and you
  // curl up. A tap still just sits down or stands up; standing up wakes you.
  const SLEEP_HOLD = .7;   // seconds
  let vAt = -1, vWasSitting = false, hintedFor = null;
  const sleepRing = document.createElement('div');
  sleepRing.className = 'eatring hidden'; sleepRing.setAttribute('aria-hidden', 'true');
  sleepRing.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="19" class="fg" pathLength="100"/></svg>';
  document.body.appendChild(sleepRing);
  const sleepArc = sleepRing.querySelector('.fg');
  const endHold = () => { vAt = -1; sleepRing.classList.add('hidden'); };
  UI.sitHold = {
    // V pressed: true if it's ours (by a lit hearth, not asleep yet)
    down() {
      if (!cpOn() || state !== 'play' || sleepAsked || !nearLitHearth()) return false;
      vAt = performance.now(); vWasSitting = sitting;
      if (!sitting) setSitting(true);
      return true;
    },
  };
  window.addEventListener('keyup', e => {
    if (e.code !== prefs.binds.sit || vAt < 0) return;
    if (!sleepAsked && vWasSitting && (performance.now() - vAt) / 1000 < SLEEP_HOLD) setSitting(false);   // a tap while sitting: stand up
    endHold();
  });
  UI.onFrame(() => {
    if (!cpOn() || state !== 'play' || !net || !net.open) return;
    if (vAt >= 0 && !sleepAsked) {
      const f = nearLitHearth();
      if (!f || !sitting) { endHold(); return; }
      const k = Math.min(1, (performance.now() - vAt) / 1000 / SLEEP_HOLD);
      sleepRing.classList.toggle('hidden', k < .1);
      sleepArc.style.strokeDasharray = `${(k * 100).toFixed(1)} 100`;
      if (k >= 1) {
        sleepAsked = true; endHold();
        net.send({ t: 'sleep', on: true, fire: f.id });
        if (checkpoints.get(me.id) !== f.id) toast('You curl up by the hearth…');
      }
    }
    // sitting by a lit hearth without sleeping: say how, once per sit
    if (sitting && !sleepAsked && vAt < 0) { const f = nearLitHearth(); if (f && hintedFor !== f.id) { hintedFor = f.id; toast(`Hold ${keyLabel(prefs.binds.sit)} to sleep by the hearth.`); } }
    if (!sitting) hintedFor = null;
    if (!sitting && sleepAsked) { sleepAsked = false; net.send({ t: 'sleep', on: false }); }
  });
  // The map: your checkpoint as a flag in your colour, friends' fainter.
  UI.mapLayers.push({
    draw(g, at, dotScale) {
      if (!cpOn()) return;
      checkpoints.forEach((fid, pid) => {
        const f = fires.get(fid); if (!f) return;
        const [cx, cy] = at(f.x, f.z), mine = me && pid === me.id;
        g.save(); g.globalAlpha = mine ? 1 : .5;
        markerShape(g, 'checkpoint', cx + 6 * dotScale, cy - 5 * dotScale, dotScale * (mine ? 1.5 : 1), mapCol(pid));
        g.restore();
      });
    },
  });
  // For tests and the console.
  UI.checkpoints = { get map() { return new Map(checkpoints); }, get pennants() { return pennants.length; } };
