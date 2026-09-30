  // ================= Mouse-look (P1, flag mouselook) =================
  // On a computer with a mouse: click the island and the pointer locks, so moving the
  // mouse turns the camera. Esc frees it (and opens settings). Any panel, chat, the intro
  // or dying frees it too, with an ink cursor for menus; closing the last panel locks it
  // again, or shows "Click to continue" when the browser won't allow that without a click.
  // An ink crosshair floats just in front of you and snaps onto whatever E would use.
  // Phones and touch are unchanged.
  const finePointer = matchMedia('(any-pointer: fine)').matches;
  const mouseLookOn = () => WG.feature('mouselook') && finePointer;
  const pointerLocked = () => document.pointerLockElement === stage;
  const lockPill = $('lockPill'), xhair = $('xhair');
  let lookFreedAt = -1e9;        // when the player last freed the pointer (Esc); that Esc must not also close settings
  let freeingByUs = false;       // we asked for the unlock (a panel opened): don't open settings
  let lockWanted = false;        // they've locked once, so closing a panel locks again
  let hadBlocker = true;         // last frame a panel, the intro, death or the title was in the way

  function lockPointer() {
    if (!mouseLookOn() || state !== 'play' || panelOpen() || pointerLocked()) return;
    try {
      const p = stage.requestPointerLock();
      if (p && p.catch) p.catch(() => {});   // refused (too soon after Esc, no click): the pill stays up
    } catch (e) { /* older browsers throw instead */ }
  }
  function freePointer() {
    if (!pointerLocked()) return;
    freeingByUs = true;
    document.exitPointerLock();
  }
  document.addEventListener('pointerlockchange', () => {
    if (pointerLocked()) { lockWanted = true; releaseKeys(); return; }
    if (freeingByUs) { freeingByUs = false; return; }
    // The player pressed Esc (or switched window): open settings, as Esc does without the mouse locked.
    lookFreedAt = performance.now();
    setTimeout(() => { if (state === 'play' && !panelOpen()) togglePanel('settings'); }, 0);
  });
  document.addEventListener('pointerlockerror', () => { freeingByUs = false; });
  lockPill.addEventListener('click', e => { e.stopPropagation(); lockPointer(); });

  // Turning with the mouse while it's locked. The same sensitivity and invert settings as dragging.
  document.addEventListener('mousemove', e => {
    if (!pointerLocked() || state !== 'play') return;
    const dx = clamp(e.movementX || 0, -300, 300), dy = clamp(e.movementY || 0, -300, 300);   // some browsers send a spike on lock
    yaw -= dx * .0026 * prefs.sens;
    pitch = clamp(pitch + dy * .0016 * prefs.sens * (prefs.invertY ? -1 : 1), -1.1, 1.15);
  });

  // The wheel steps through the hotbar; Ctrl+wheel (and a trackpad pinch) zooms instead.
  let wheelSum = 0, wheelAt = 0;
  function wheelSlot(dy) {
    const now = performance.now();
    if (now - wheelAt > 250) wheelSum = 0;
    wheelAt = now;
    wheelSum += dy;
    if (Math.abs(wheelSum) < 40) return;
    const dir = Math.sign(wheelSum);
    wheelSum = 0;
    if (state === 'play' && !blocksInput()) cycleSlot(dir);
  }

  // Crosshair: things P6 can hit register here (fn() -> true while something hittable is aimed at).
  UI.crosshair = { hittable: [] };
  const xv = new THREE.Vector3();
  let xx = innerWidth / 2, xy = innerHeight / 2, xShown = false;
  function aimPoint() {
    const t = target;
    if (t && t.x != null && t.type !== 'spring' && t.type !== 'sea') {
      const tx = t.cx ?? t.x, tz = t.cz ?? t.z;
      return [tx, groundAt(tx, tz) + (t.type === 'drop' || t.type === 'wash' ? .35 : .9), tz];
    }
    // nothing close: a little way in front of you, about chest high
    return [px + Math.sin(face) * 2.2, Math.max(heightAt(px, pz), -.75) + (hop.floor || 0) + hop.y + 1, pz + Math.cos(face) * 2.2];
  }

  let inkCursor = null;
  UI.onFrame(dt => {
    const on = mouseLookOn();
    if (on !== inkCursor) { inkCursor = on; document.documentElement.classList.toggle('inkcursor', on); }
    const blocker = state !== 'play' || panelOpen();
    const locked = pointerLocked();
    if (locked && (blocker || !on)) freePointer();
    // the last panel just closed: lock again (the browser may say no; then the pill asks for a click)
    if (on && !blocker && hadBlocker && lockWanted && !locked) lockPointer();
    hadBlocker = blocker;
    const pill = on && !blocker && !locked;
    if (pill !== !lockPill.classList.contains('hidden')) {
      lockPill.textContent = lockWanted ? 'Click to continue' : 'Click to look around';
      lockPill.classList.toggle('hidden', !pill);
    }

    // crosshair
    const show = on && state === 'play' && !blocker;
    if (show !== xShown) { xShown = show; xhair.classList.toggle('hidden', !show); }
    if (!show) return;
    const [ax, ay, az] = aimPoint();
    xv.set(ax, ay, az).project(camera);
    if (xv.z > 1) return;
    const sx = (xv.x * .5 + .5) * innerWidth, sy = (-xv.y * .5 + .5) * innerHeight, k = Math.min(1, dt * 18);
    xx += (sx - xx) * k; xy += (sy - xy) * k;
    xhair.style.transform = `translate(${xx.toFixed(1)}px,${xy.toFixed(1)}px)`;
    const hit = UI.crosshair.hittable.some(fn => { try { return fn(); } catch (e) { return false; } });
    xhair.classList.toggle('hit', hit);
    xhair.classList.toggle('use', !hit && !!(target || bucketAction()));
  });
