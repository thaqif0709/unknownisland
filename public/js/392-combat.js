  // ================= Fighting (P6, flag combat) =================
  // Attack with a left click while the mouse is locked (or the attack key, R, or the Attack
  // button on a phone); hold it for a heavy swing. You swing whatever is in your hand (a
  // weapon, a tool, or your fist) where you're aiming, and the server decides what it hits
  // ('attack'). Double-tap Shift (or swipe the Attack button) to roll out of the way
  // ('dodge'). Knocked down by a blow that would have killed you, you're down until a friend
  // holds E beside you ('revive'), or you wake at your hearth.
  const combatOn = () => WG.feature('combat');
  const K = () => RULES.COMBAT;
  const aimFace = () => Math.atan2(-Math.sin(yaw), -Math.cos(yaw));   // where the camera (and the crosshair) look
  const weaponNow = () => { const s = slotsOn() && selSlot >= 0 ? stats.slots[selSlot] : null; return s && K().WEAPONS[s.k] ? s.k : 'fist'; };
  let attackAt = -1, lastSwingAt = 0;
  let roll = null;          // { t, dx, dz } while rolling
  let lastSprintTap = 0;
  let downedEnd = 0;        // performance.now() when I come to, 0 when I'm not down
  const downedOthers = new Map();   // id -> performance.now() they come to
  let revivingId = null, reviveT = 0;

  function canFight() { return combatOn() && state === 'play' && !blocksInput() && knockT <= 0 && !downedEnd && !stats.down; }
  function attackStart() { if (canFight() && attackAt < 0) attackAt = performance.now(); }
  function attackRelease() {
    if (attackAt < 0) return;
    const held = (performance.now() - attackAt) / 1000;
    attackAt = -1;
    if (!canFight()) return;
    const w = K().WEAPONS[weaponNow()], heavy = held >= K().HEAVY.HOLD && nrg.energy >= K().HEAVY.ENERGY && !nrg.exhausted;
    const now = performance.now(), gap = w.swing * (heavy ? K().HEAVY.SWING : 1) * 1000;
    if (now - lastSwingAt < gap - 50) return;
    lastSwingAt = now;
    face = aimFace();
    if (heavy) nrg.energy = Math.max(0, nrg.energy - K().HEAVY.ENERGY);
    if (net) net.send({ t: 'attack', heavy, a: +face.toFixed(3) });
    startSwing(hero, weaponNow() === 'fist' ? null : heavy ? 'mine' : 'chop', heavy ? .5 : .35);
  }
  function dodge() {
    if (!canFight() || roll || climb) return;
    const D = K().DODGE;
    if (nrg.exhausted || nrg.energy < D.ENERGY) { toast('Too tired to roll.'); return; }
    nrg.energy -= D.ENERGY;
    // the way you're walking (camera-relative), or straight back
    let ix = (held('right') ? 1 : 0) - (held('left') ? 1 : 0) + joy.x, iz = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0) - joy.y;
    if (Math.hypot(ix, iz) < .1) { ix = 0; iz = -1; }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let dx = rx * ix + fx * iz, dz = rz * ix + fz * iz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    roll = { t: 0, dx, dz };
    if (net) net.send({ t: 'dodge' });
  }

  // ---- input ----
  window.addEventListener('keydown', e => {
    if (e.repeat || !combatOn()) return;
    if (e.code === prefs.binds.attack) attackStart();
    if (e.code === prefs.binds.sprint && state === 'play' && !blocksInput()) {   // double-tap: roll
      const now = performance.now();
      if (now - lastSprintTap < 320) { dodge(); lastSprintTap = 0; } else lastSprintTap = now;
    }
  });
  window.addEventListener('keyup', e => { if (e.code === prefs.binds.attack) attackRelease(); });
  stage.addEventListener('pointerdown', e => { if (e.button === 0 && e.pointerType === 'mouse' && pointerLocked()) attackStart(); });
  window.addEventListener('pointerup', e => { if (e.button === 0 && e.pointerType === 'mouse') attackRelease(); });
  // phones: the Attack button (tap, or hold for heavy); swipe it to roll
  const btnAttack = $('btnAttack');
  let swipe = null;
  btnAttack.addEventListener('pointerdown', e => { e.preventDefault(); swipe = { x: e.clientX, y: e.clientY }; attackStart(); });
  btnAttack.addEventListener('pointermove', e => {
    if (swipe && Math.hypot(e.clientX - swipe.x, e.clientY - swipe.y) > 40) { swipe = null; attackAt = -1; dodge(); }
  });
  ['pointerup', 'pointercancel'].forEach(t => btnAttack.addEventListener(t, () => { if (swipe) attackRelease(); swipe = null; }));
  UI.net.on('welcome', () => { btnAttack.hidden = !combatOn(); downedEnd = 0; downedOthers.clear(); });

  // ---- what the server tells us ----
  UI.net.on('downed', m => {
    const until = performance.now() + m.until * 1000;
    if (me && m.id === me.id) { downedEnd = until; attackAt = -1; roll = null; } else downedOthers.set(m.id, until);
  });
  UI.net.on('revived', m => { if (me && m.id === me.id) downedEnd = 0; else downedOthers.delete(m.id); });
  UI.net.on('fx', m => {
    const r = me && m.id !== me.id ? remotes.get(m.id) : null;
    if (!r) return;
    if (m.k === 'attack') startSwing(r.av, 'chop');
    else if (m.k === 'heavy') startSwing(r.av, 'mine', .5);
    else if (m.k === 'dodge') r.rollT = 0;
  });
  // a sling stone (or a thrown torch) in flight, a torch bursting into fire, and a Stilled
  // breaking into fog
  const shots = [], bursts = [];
  const stoneGeo = new THREE.SphereGeometry(.07, 6, 4);
  const torchGeo = new THREE.CylinderGeometry(.04, .05, .5, 6);
  const torchM = new THREE.MeshBasicMaterial({ color: 0xFF9A3C });
  const burstGeo = new THREE.SphereGeometry(1, 14, 10);
  const fxFloor = (under, x, z) => (under ? caveFloorAt(under, x, z) : groundAt(x, z));
  UI.net.on('shot', m => {
    const to = m.to || [m.x + Math.sin(m.a) * 14, m.z + Math.cos(m.a) * 14];
    const torch = m.k === 'torch', mesh = new THREE.Mesh(torch ? torchGeo : stoneGeo, torch ? torchM : rockM[0]);
    scene.add(mesh);
    shots.push({ mesh, torch, under: m.under || 0, x0: m.x, z0: m.z, x1: to[0], z1: to[1], t: 0, d: Math.hypot(to[0] - m.x, to[1] - m.z) });
  });
  UI.net.on('burst', m => {
    const mesh = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color: 0xFFB050, transparent: true, opacity: .55, depthWrite: false }));
    mesh.position.set(m.x, fxFloor(m.under, m.x, m.z) + .3, m.z);
    mesh.scale.setScalar(.2);
    scene.add(mesh);
    bursts.push({ mesh, r: m.r || 2, t: 0 });
    if (!m.under) for (let i = 0; i < 5; i++) emitPuff({ x: m.x + (Math.random() - .5) * m.r, z: m.z + (Math.random() - .5) * m.r, kind: 'campfire' });
  });
  UI.net.on('fogburst', m => { for (let i = 0; i < 6; i++) emitPuff({ x: m.x + (Math.random() - .5) * .8, z: m.z + (Math.random() - .5) * .8, kind: 'campfire' }); });

  // ---- reviving: hold E beside a friend who's down ----
  const reviveTag = document.createElement('div');
  reviveTag.className = 'revivetag hidden';
  document.body.appendChild(reviveTag);
  const reviveRing = document.createElement('div');
  reviveRing.className = 'eatring hidden'; reviveRing.setAttribute('aria-hidden', 'true');
  reviveRing.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="19" class="fg" pathLength="100"/></svg>';
  document.body.appendChild(reviveRing);
  const reviveArc = reviveRing.querySelector('.fg');
  const downedNear = () => {
    let best = null, bd = K().DOWNED.REACH;
    downedOthers.forEach((until, id) => {
      const r = remotes.get(id); if (!r || performance.now() > until) return;
      const q = r.remote.sample(), d = Math.hypot(q.x - px, q.z - pz);
      if (d < bd) { bd = d; best = { id, name: r.name || 'your friend' }; }
    });
    return best;
  };
  window.addEventListener('keydown', e => {
    if (e.code !== prefs.binds.act || e.repeat || !canFight()) return;
    const f = downedNear();
    if (!f) return;
    revivingId = f.id; reviveT = 0;
    if (net) net.send({ t: 'revive', id: f.id });
  });
  window.addEventListener('keyup', e => { if (e.code === prefs.binds.act) { revivingId = null; reviveRing.classList.add('hidden'); } });

  // ---- every frame ----
  const downTag = document.createElement('div');
  downTag.className = 'downtag hidden';
  document.body.appendChild(downTag);
  UI.onFrame(dt => {
    const now = performance.now();
    // rolling: moved along, tumbling
    if (roll) {
      const D = K().DODGE, sp = D.DIST / D.TIME;
      roll.t += dt;
      const nx = px + roll.dx * sp * dt, nz = pz + roll.dz * sp * dt;
      if ((myCave || heightAt(nx, nz) > -1) && !veilBlocks(nx, nz) && caveStep(nx, nz).k !== 'block') { px = nx; pz = nz; }
      if (hero) hero.root.rotation.x = Math.min(1, roll.t / D.TIME) * Math.PI * 2;
      if (roll.t >= D.TIME) { roll = null; if (hero) hero.root.rotation.x = 0; }
    }
    remotes.forEach((r, id) => {
      if (r.rollT != null) { r.rollT += dt; r.av.root.rotation.x = Math.min(1, r.rollT / K().DODGE.TIME) * Math.PI * 2; if (r.rollT >= K().DODGE.TIME) { r.rollT = null; r.av.root.rotation.x = 0; } }
      const until = downedOthers.get(id);
      if (until && now < until) r.av.root.rotation.x = -1.45;   // lying where they fell
    });
    // down: lying there, counting down
    if (downedEnd && now > downedEnd + 1500) downedEnd = 0;
    if (downedEnd && hero) hero.root.rotation.x = -1.45;
    downTag.classList.toggle('hidden', !downedEnd);
    if (downedEnd) downTag.textContent = `You're down. A friend can pick you up (${Math.max(0, Math.ceil((downedEnd - now) / 1000))} s)`;
    // a friend down nearby: hold E to pick them up
    const f = combatOn() && state === 'play' && !downedEnd ? downedNear() : null;
    reviveTag.classList.toggle('hidden', !f);
    if (f) reviveTag.textContent = `Hold ${keyLabel(prefs.binds.act)} to pick ${f.name} up`;
    if (revivingId != null) {
      if (!f || f.id !== revivingId) { revivingId = null; reviveRing.classList.add('hidden'); }
      else {
        reviveT += dt;
        const k = Math.min(1, reviveT / K().DOWNED.REVIVE);
        reviveRing.classList.remove('hidden');
        reviveArc.style.strokeDasharray = `${(k * 100).toFixed(1)} 100`;
        if (k >= 1) { if (net) net.send({ t: 'revive', id: revivingId, done: true }); revivingId = null; reviveRing.classList.add('hidden'); }
      }
    }
    // sling stones and thrown torches (a torch flies slower, higher, tumbling)
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t += dt * (s.torch ? 16 : 30) / Math.max(1, s.d);
      const k = Math.min(1, s.t), x = s.x0 + (s.x1 - s.x0) * k, z = s.z0 + (s.z1 - s.z0) * k;
      s.mesh.position.set(x, fxFloor(s.under, x, z) + 1 + Math.sin(k * Math.PI) * (s.torch ? 1.4 : .6), z);
      if (s.torch) s.mesh.rotation.x += dt * 12;
      if (k >= 1) { scene.remove(s.mesh); shots.splice(i, 1); }
    }
    // a torch's burst: a flash of fire that swells to its reach and fades
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt / .6;
      b.mesh.scale.setScalar(Math.max(.2, Math.min(1, b.t * 1.6)) * b.r);
      b.mesh.material.opacity = .55 * Math.max(0, 1 - b.t);
      if (b.t >= 1) { scene.remove(b.mesh); b.mesh.material.dispose(); bursts.splice(i, 1); }
    }
  });
  if (window.__dbg) __dbg.combat = () => ({ downed: !!downedEnd, rolling: !!roll, others: [...downedOthers.keys()], bursts: bursts.length, shots: shots.length });
