  // ================= Creative mode (admins, for testing) =================
  // Like Minecraft's, but only the flying: an admin (the ADMINS env var) types /creative (or
  // /gamemode creative) in chat, then double-taps Space (or the Jump button) to fly, and again
  // to stop. Flying: the walking keys move you fast (RULES.CREATIVE.FLY_SPEED) where the camera
  // looks, Space rises, Shift (or Run on a phone) sinks; over the sea and the Veil too. Sink onto
  // the ground and you land. Not in caves. /normal turns it off; it's off after a rejoin too.
  let creative = false, flying = false, flyAbs = 0, lastJumpTap = 0;
  const CR = () => RULES.CREATIVE;
  const canFly = () => creative && state === 'play' && !myCave && !climb && knockT <= 0;
  const flyFloor = () => Math.max(groundAt(px, pz), 0);   // the ground, or the sea's surface
  const flyBase = () => Math.max(groundAt(px, pz), -.75);   // what your height is drawn from (as in poseCastaway)
  function setFlying(on) {
    on = !!on && canFly();
    if (flying === on) return;
    flying = on;
    if (flying) {
      flyAbs = flyBase() + Math.max(hop.y, 0) + .6;   // lift off a little
      hop.air = true; hop.v = 0; hop.fwd = 0; hop.charge = -1; hop.abs = null; glide = false;
      if (sitting) setSitting(false);
    } else { hop.air = true; hop.v = 0; hop.fwd = 0; hop.abs = null; }   // let go: you drop from here
    creativeTag.querySelector('span').textContent = flying ? 'flying: Space up, Shift down, double-tap Space to stop' : 'double-tap Space to fly';
  }
  const creativeTag = document.createElement('div');
  creativeTag.className = 'creativetag hidden';
  creativeTag.innerHTML = 'Creative <span>double-tap Space to fly</span>';
  document.body.appendChild(creativeTag);
  UI.net.on('mode', m => {
    creative = !!m.creative;
    if (!creative) setFlying(false);
    creativeTag.classList.toggle('hidden', !creative);
  });
  UI.net.on('welcome', () => { creative = false; setFlying(false); creativeTag.classList.add('hidden'); });   // off after a rejoin
  // double-tap Space (or the Jump button) toggles flying
  function jumpTap() {
    if (!creative || state !== 'play' || blocksInput()) return;
    const now = performance.now();
    if (now - lastJumpTap < 320) { setFlying(!flying); lastJumpTap = 0; } else lastJumpTap = now;
  }
  window.addEventListener('keydown', e => { if (e.code === prefs.binds.jump && !e.repeat) jumpTap(); });
  $('btnJump').addEventListener('pointerdown', jumpTap);
  // One frame of flying, from the loop with the walking input (ix, iz; iz > 0 is forward).
  // Returns whether you moved.
  function flyStep(dt, ix, iz) {
    if (!canFly()) { setFlying(false); return false; }
    const free = !blocksInput();
    const up = free ? (keys[prefs.binds.jump] || jumpBtnHeld ? 1 : 0) - (keys[prefs.binds.sprint] || runToggle ? 1 : 0) : 0;
    const l = Math.hypot(ix, iz);
    let moved = false;
    if (l > .08) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const dx = rx * ix + fx * iz, dz = rz * ix + fz * iz, s = CR().FLY_SPEED * Math.min(1, l) * dt;
      const nx = px + dx * s, nz = pz + dz * s;
      if (Math.hypot(nx - SPAWN.x, nz - SPAWN.z) < 6000) { px = nx; pz = nz; }   // not off into the endless sea
      const tf = Math.atan2(dx, dz);
      let df = tf - face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
      face += df * Math.min(1, dt * 12);
      moved = true;
    }
    flyAbs += up * CR().RISE_SPEED * dt;
    const floor = flyFloor();
    flyAbs = Math.min(flyAbs, floor + CR().MAX_HEIGHT);
    if (flyAbs <= floor) {
      flyAbs = floor;
      // sinking onto the ground lands you (not onto deep sea or the Veil: you hover there)
      if (up < 0 && groundAt(px, pz) > -1 && !veilBlocks(px, pz)) {
        setFlying(false);
        hop.y = Math.max(0, floor - flyBase()); hop.air = hop.y > .02;
        return moved;
      }
    }
    hop.y = flyAbs - flyBase();
    return moved || up !== 0;
  }
  if (window.__dbg) __dbg.creative = () => ({ creative, flying, y: hop.y, abs: flyAbs });
