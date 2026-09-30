  // ================= Climbing and gliding (P9, flag travel) =================
  // Walk into a climbable palm (the tall ones) or a cliff (ground steeper than
  // RULES.TRAVEL.CLIFF_SLOPE, which you can't walk up) to grab it. W and S climb, A and D
  // go round the trunk or along the cliff, Space lets go. Climbing uses energy; with
  // none left you slide back down. At the top of a trunk, keep climbing to pull yourself
  // onto the leaves; at the top of a cliff you step off onto the ground above.
  // Falling from high enough, hold Space (or the Jump button) to spread your cloak and glide:
  // you sink slowly and drift forward, steering with the keys, for as long as your energy
  // lasts. Friends see both (the pose goes with your position).
  const travelOn = () => WG.feature('travel') && !myCave;   // not in a cave (W9): heights there are the cave's own
  let climb = null;    // { kind: 'trunk', o, ang } or { kind: 'cliff' }; null when not climbing
  let glide = false;
  let climbMoving = false;
  const T = () => RULES.TRAVEL;

  // Energy use this frame (sprinting is counted separately, in stepEnergy).
  const travelDrain = () => glide ? T().GLIDE_ENERGY : climb ? (climbMoving ? T().CLIMB_ENERGY : T().HANG_ENERGY) : 0;
  const travelPose = () => (flying ? 'fly' : climb ? 'climb' : glide ? 'glide' : null);   // (flying: creative mode, 387)

  function climbableNear(x, z) {
    const list = [];
    nearbyObjects(x, z, o => { if (o.climb && !o.state.gone && o.mesh) { topOf(o); list.push(o); } });
    return list;
  }
  // Walking with the input (dx, dz): grab a trunk you're walking into, or a cliff you'd walk
  // up. Returns true if you're climbing now (so the walk doesn't happen).
  function tryGrab(dx, dz) {
    if (!travelOn() || climb || hop.air || nrg.exhausted || nrg.energy <= 0 || state !== 'play') return false;
    const t = WG.climbAt(px, hop.y, pz, climbableNear(px, pz));
    if (t && t.kind === 'trunk' && hop.y < t.top - .2) {
      const tx = t.o.x - px, tz = t.o.z - pz, d = Math.hypot(tx, tz) || 1;
      if ((dx * tx + dz * tz) / d < .6) return false;   // only when walking at it
      climb = { kind: 'trunk', o: t.o, ang: Math.atan2(px - t.o.x, pz - t.o.z) };
      if (sitting) setSitting(false);
      return true;
    }
    // a cliff: the step you're about to take goes up ground too steep to walk
    const ahead = WG.climbAt(px + dx * .5, 0, pz + dz * .5);
    if (ahead && ahead.kind === 'cliff' && heightAt(px + dx * .5, pz + dz * .5) > heightAt(px, pz)) {
      climb = { kind: 'cliff' };
      return true;
    }
    return false;
  }
  // With travel on, you can't walk up a cliff: is the step (nx, nz) one?
  function cliffBlocks(nx, nz) {
    if (!travelOn() || hop.air) return false;
    const c = WG.climbAt(nx, 0, nz);
    return !!(c && c.kind === 'cliff' && heightAt(nx, nz) > heightAt(px, pz) + .02);
  }
  function letGo() {
    if (!climb) return;
    if (climb.kind === 'trunk') {   // push off the trunk and drop (hold Space to glide)
      const a = climb.ang;
      px += Math.sin(a) * .35; pz += Math.cos(a) * .35;
      hop.air = true; hop.v = 0; hop.abs = null;
    }
    climb = null;
  }
  // One frame on a trunk or a cliff; (ix, iz) is the input (iz > 0 is W).
  function stepClimb(dt, ix, iz) {
    const TR = T(), tired = nrg.exhausted || nrg.energy <= 0;
    climbMoving = !tired && (Math.abs(ix) > .1 || Math.abs(iz) > .1);
    if (climb.kind === 'trunk') {
      const o = climb.o;
      if (!o || o.state.gone) { letGo(); return; }
      const top = topOf(o), R = (o.r || .35) + .35;
      if (tired) hop.y -= TR.SLIDE_SPEED * dt;   // out of breath: slide down
      else { hop.y += iz * TR.CLIMB_SPEED * dt; climb.ang += ix * 1.4 * dt; }
      px = o.x + Math.sin(climb.ang) * R; pz = o.z + Math.cos(climb.ang) * R;
      face = climb.ang + Math.PI;   // facing the trunk
      if (hop.y <= 0) { hop.y = 0; if (iz < 0 || tired) climb = null; return; }   // back on the ground
      if (hop.y >= top - .05) {
        hop.y = top - .05;
        if (iz > .5 && !tired) { px = o.x; pz = o.z; hop.y = top; climb = null; hop.air = false; }   // up onto the leaves
      }
      return;
    }
    // a cliff: you move over the face itself (the ground), uphill or down or along
    const s = WG.slopeAt(px, pz);
    if (s.g < TR.CLIFF_SLOPE * .75) { climb = null; return; }   // over the top
    const nx = -s.gx / s.g, nz = -s.gz / s.g;   // out from the face (downhill)
    const up = tired ? -TR.SLIDE_SPEED : iz * TR.CLIMB_SPEED, across = tired ? 0 : ix * TR.CLIMB_SPEED * .6;
    const run = 1 / Math.max(1, s.g);   // climbing 1 m up a steep face moves you less than 1 m across
    const mx = px - nx * up * run * dt + nz * across * dt, mz = pz - nz * up * run * dt - nx * across * dt;
    if (heightAt(mx, mz) > .3 && !veilBlocks(mx, mz)) { px = mx; pz = mz; }
    face = Math.atan2(-nx, -nz);
    hop.y = 0;
    if (tired && s.g < TR.CLIFF_SLOPE) climb = null;
    if (iz < 0 && WG.slopeAt(px, pz).g < TR.CLIFF_SLOPE) climb = null;   // climbed back down off it
  }
  // Not climbing, on a cliff: you slide down it.
  function slideOffCliff(dt) {
    if (!travelOn() || climb || hop.air) return;
    const s = WG.slopeAt(px, pz);
    if (s.g < T().CLIFF_SLOPE || heightAt(px, pz) < .3) return;
    const nx = -s.gx / s.g, nz = -s.gz / s.g;
    px += nx * T().SLIDE_SPEED * dt; pz += nz * T().SLIDE_SPEED * dt;
  }
  // Gliding, from stepHop while in the air: hold Space high enough up, with energy left.
  function updateGlide(h) {
    const want = travelOn() && h.air && h.v <= 0 && (keys[prefs.binds.jump] || jumpBtnHeld) && !nrg.exhausted && nrg.energy > 0
      && h.y - (h.floor || 0) >= (glide ? .25 : T().GLIDE_MIN_HEIGHT);
    glide = want;
    return glide;
  }
  // Which way a glide drifts: where the keys point (camera-relative, like walking), else straight ahead.
  function glideDir(ix, iz) {
    if (Math.hypot(ix, iz) > .08) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const dx = rx * ix + fx * iz, dz = rz * ix + fz * iz, l = Math.hypot(dx, dz);
      return [dx / l, dz / l];
    }
    return [Math.sin(face), Math.cos(face)];
  }
