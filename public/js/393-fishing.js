  // ================= Fishing (P7, flag fishing) =================
  // With a rod in hand, hold E (or the Act button) to charge a cast and let go to throw: the
  // longer you hold, the further it goes ('cast'). The bobber floats where it lands; when it
  // goes under, E within a second hooks the fish ('hook') and a minigame (285) decides the
  // catch. E while nothing bites reels in. Beside a friend landing a fish, E grabs the line
  // with them ('fish-help', once). Everyone's line and bobber are drawn from 'fishing'.
  const fishingOn = () => WG.feature('fishing');
  const FR = () => RULES.FISHING;
  const rodInHand = () => slotsOn() && selSlot >= 0 && !!stats.slots && !!stats.slots[selSlot] && stats.slots[selSlot].k === 'rod';
  const fishLines = new Map();   // player id -> { x, z, s, bob, line, biteT }
  let castCharge = 0, releasedAt = 0, biteUntil = 0;
  const helped = new Set();  // friends whose catch I've already helped with

  // The rod in the hand: a long thin pole held out and up, a little reel near the grip.
  UI.heldModels.rod = (g, add) => {
    const d = new THREE.Vector3(0, .35, .94).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    add(new THREE.CylinderGeometry(.012, .022, 1.3, 6), logM, d.x * .55, d.y * .55, d.z * .55).quaternion.copy(q);
    add(new THREE.CylinderGeometry(.04, .04, .03, 10), softShared(0x8C8F94), .04, .06, .12).rotation.z = Math.PI / 2;
  };
  Object.assign(UI.itemIcons, {
    rod(g, fill) {
      g.lineWidth = 5; g.beginPath(); g.moveTo(12, 56); g.lineTo(54, 8); g.stroke();
      g.lineWidth = 3; g.strokeStyle = '#A57A55'; g.beginPath(); g.moveTo(12, 56); g.lineTo(54, 8); g.stroke(); g.strokeStyle = '#2B211F';
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(54, 8); g.quadraticCurveTo(60, 30, 50, 48); g.stroke();
      fill('#D9534F', () => g.arc(50, 50, 4, 0, 7)); fill('#8C8F94', () => g.arc(20, 46, 5, 0, 7));
    },
    bait(g, fill) {
      fill('#8A5A6A', () => g.ellipse(32, 40, 20, 12, 0, 0, 7));
      [[24, 36], [36, 34], [30, 44], [40, 42]].forEach(([x, y]) => fill('#C8A860', () => g.ellipse(x, y, 3, 5, .4, 0, 7)));
    },
    silverfin: fishIcon('#B9C3C6'), pool_minnow: fishIcon('#9FB7A8', .75), lantern_fish: fishIcon('#F2C14E', .9, true), cooked_fish: fishIcon('#B97A4A', 1, false, true),
  });
  function fishIcon(col, s = 1, glow = false, cooked = false) {
    return (g, fill, INK) => {
      if (glow) { g.fillStyle = 'rgba(242,193,78,.35)'; g.beginPath(); g.arc(30, 32, 26, 0, 7); g.fill(); }
      fill(col, () => g.ellipse(28, 32, 20 * s, 10 * s, 0, 0, 7));
      fill(col, () => { g.moveTo(28 + 18 * s, 32); g.lineTo(28 + 32 * s, 22); g.lineTo(28 + 32 * s, 42); g.closePath(); });
      g.fillStyle = INK; g.beginPath(); g.arc(28 - 12 * s, 29, 2.5, 0, 7); g.fill();
      if (cooked) { g.lineWidth = 2; g.beginPath(); for (const dx of [-6, 2, 10]) { g.moveTo(28 + dx, 24); g.lineTo(24 + dx, 40); } g.stroke(); }
    };
  }

  // ---- input ----
  function startCast() { if (!castCharge) castCharge = performance.now(); }
  function releaseCast() {
    if (!castCharge) return;
    const held = (performance.now() - castCharge) / 1000;
    castCharge = 0; releasedAt = performance.now();
    if (!rodInHand() || state !== 'play' || !net) return;
    face = aimFace();   // where the camera looks, as attacks aim (392)
    net.send({ t: 'cast', power: +Math.min(1, held / FR().CAST.CHARGE).toFixed(3), a: +face.toFixed(3) });
    startSwing(hero, 'chop', .4);
  }
  // A friend nearby landing a fish whom I haven't helped yet.
  function friendToHelp() {
    if (!me) return null;
    let best = null, bd = FR().HELP_REACH;
    fishLines.forEach((l, id) => {
      if (id === me.id || l.s !== 'fight' || helped.has(id)) return;
      const r = remotes.get(id); if (!r) return;
      const q = r.remote.sample(), d = Math.hypot(q.x - px, q.z - pz);
      if (d < bd) { bd = d; best = { id, name: r.name || 'your friend' }; }
    });
    return best;
  }
  // E (from 230-actions.js act()): true when fishing took it.
  UI.fishing = {
    act() {
      if (!fishingOn() || state !== 'play' || !net || knockT > 0) return false;
      const f = friendToHelp();
      if (f && !rodInHand()) { helped.add(f.id); net.send({ t: 'fish-help', id: f.id }); return true; }
      if (!rodInHand()) return false;
      if (performance.now() - releasedAt < 400) return true;   // the click that follows a tap on the Act button
      if (me && fishLines.has(me.id)) { net.send({ t: 'hook' }); biteUntil = 0; return true; }
      startCast();
      return true;
    },
  };
  window.addEventListener('keyup', e => { if (e.code === prefs.binds.act) releaseCast(); });
  $('btnAct').addEventListener('pointerdown', () => { if (fishingOn() && rodInHand() && state === 'play' && !(me && fishLines.has(me.id))) startCast(); });
  ['pointerup', 'pointercancel'].forEach(t => $('btnAct').addEventListener(t, releaseCast));

  // ---- fishLines and bobbers ----
  const bobTop = softShared(0xD9534F), bobBottom = softShared(0xF4EFE2);
  const lineM = new THREE.LineBasicMaterial({ color: 0x2B211F });
  function lineFor(id) {
    let l = fishLines.get(id);
    if (l) return l;
    const bob = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bobTop);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bobBottom);
    bob.add(top, bottom);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, lineM);
    line.frustumCulled = false;
    scene.add(bob, line);
    l = { bob, line, x: 0, z: 0, s: null, t: 0 };
    fishLines.set(id, l);
    return l;
  }
  function dropLine(id) {
    const l = fishLines.get(id); if (!l) return;
    scene.remove(l.bob, l.line); l.line.geometry.dispose();
    fishLines.delete(id); helped.delete(id);
  }
  function setLine(m) {
    if (!m.s) { dropLine(m.id); if (me && m.id === me.id) biteUntil = 0; return; }
    const l = lineFor(m.id);
    l.x = m.x; l.z = m.z; l.s = m.s;
    const sp = WG.nearestSpring(m.x, m.z);
    l.y = Math.hypot(m.x - sp.x, m.z - sp.z) < FR().SPRING_R ? 1.72 : 0;   // a spring's pool, or the sea
  }
  UI.net.on('fishing', setLine);
  UI.net.on('welcome', m => { [...fishLines.keys()].forEach(dropLine); castCharge = 0; biteUntil = 0; (m.fishing || []).forEach(setLine); });
  UI.net.on('fish-bite', m => { biteUntil = performance.now() + m.ms; });
  // the minigame's clock gets longer when a friend helps (P8's panel keeps the total in ms)
  UI.net.on('minigame-time', m => { const g = UI.minigames.current(); if (g && g.id === m.id) g.ms = m.ms; });

  // ---- every frame ----
  const fishTag = document.createElement('div');
  fishTag.className = 'revivetag hidden';
  document.body.appendChild(fishTag);
  const castRing = document.createElement('div');
  castRing.className = 'eatring hidden'; castRing.setAttribute('aria-hidden', 'true');
  castRing.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="19" class="fg" pathLength="100"/></svg>';
  document.body.appendChild(castRing);
  const castArc = castRing.querySelector('.fg');
  const rodTip = new THREE.Vector3();
  UI.onFrame(dt => {
    const now = performance.now();
    if (castCharge && (!rodInHand() || state !== 'play')) castCharge = 0;
    castRing.classList.toggle('hidden', !castCharge);
    if (castCharge) castArc.style.strokeDasharray = `${(Math.min(1, (now - castCharge) / 1000 / FR().CAST.CHARGE) * 100).toFixed(1)} 100`;
    const f = fishingOn() && state === 'play' ? friendToHelp() : null;
    const biting = biteUntil > now;
    fishTag.classList.toggle('hidden', !biting && !f);
    if (biting) fishTag.textContent = `A bite! Press ${keyLabel(prefs.binds.act)}!`;
    else if (f) fishTag.textContent = `Press ${keyLabel(prefs.binds.act)} to help ${f.name} with the line`;
    fishLines.forEach((l, id) => {
      const av = me && id === me.id ? hero : remotes.get(id) && remotes.get(id).av;
      if (!av) return;
      l.t += dt;
      // the bobber: floating, gone under when it bites, dragged about while landing it
      const wob = l.s === 'bite' ? -.1 + Math.sin(l.t * 30) * .04 : l.s === 'fight' ? Math.sin(l.t * 9) * .05 : Math.sin(l.t * 2.2) * .02;
      const dx = l.s === 'fight' ? Math.sin(l.t * 2.3) * .4 : 0, dz = l.s === 'fight' ? Math.cos(l.t * 1.7) * .4 : 0;
      l.bob.position.set(l.x + dx, l.y + .04 + wob, l.z + dz);
      // the line, from the rod's rodTip (or the hand) to the bobber
      if (av.held) { av.held.updateMatrixWorld(); rodTip.set(0, .42, 1.12).applyMatrix4(av.held.matrixWorld); }
      else rodTip.set(av.root.position.x, av.root.position.y + 1.4, av.root.position.z);
      const pos = l.line.geometry.attributes.position;
      pos.setXYZ(0, rodTip.x, rodTip.y, rodTip.z); pos.setXYZ(1, l.bob.position.x, l.bob.position.y, l.bob.position.z);
      pos.needsUpdate = true;
      // holding the rod out; reeling hard while landing one
      av.armR.rotation.x = l.s === 'fight' ? -1.2 + Math.sin(l.t * 14) * .2 : -.95;
    });
  });
  if (window.__dbg) __dbg.fishing = () => ({ lines: [...fishLines.entries()].map(([id, l]) => ({ id, s: l.s, x: l.x, z: l.z })), charging: !!castCharge, biting: biteUntil > performance.now() });
