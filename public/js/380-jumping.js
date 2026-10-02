  // ================= Jumping =================
  // Roughly how tall each kind of obstacle is (from how its model is built), so a
  // jump that's higher than the top passes over it. Trees, palms, lanterns, the
  // board and the carving stones are always too tall.
  const _box = new THREE.Box3();
  const canopyRadius = o => (topOf(o), o._canopy || .5);
  const FROG_H = 1.75;   // how tall a frog is, for bumping into leaves
  // The leaves of a tree are solid: bump your head on them from below, or be stopped by them from the side.
  function leafCeiling(x, z, y) {
    let c = Infinity;
    nearbyObjects(x, z, o => {
      if ((o.type !== 'tree' && o.type !== 'palm') || o.state.gone || !o.mesh) return;
      topOf(o);
      if (y < o._leafBottom && Math.hypot(o.x - x, o.z - z) < o._leafR) c = Math.min(c, o._leafBottom);
    });
    return c;
  }
  function topOf(o) {
    // measured from the model when it's built (cached until it grows or changes)
    if (o.mesh && (o.type === 'rock' || o.type === 'ore' || o.type === 'bush' || o.type === 'tree' || o.type === 'palm' || UI.things[o.type])) {
      const key = o.mesh.uuid + ':' + o.mesh.scale.y.toFixed(3);
      if (o._topKey !== key) {
        o.mesh.updateMatrixWorld(true); _box.setFromObject(o.mesh);
        o._top = Math.max(.2, _box.max.y - o.mesh.position.y);
        o._canopy = Math.max(.4, Math.min(_box.max.x - _box.min.x, _box.max.z - _box.min.z) * .32);   // the flat-ish middle of the leafy top
        if (o.type === 'tree' || o.type === 'palm') {   // where the leaves start, and how far they spread
          const lb = new THREE.Box3(); let any = false;
          o.mesh.traverse(m => { if (m.isMesh && m.material && m.material.userData.leafy) { lb.union(new THREE.Box3().setFromObject(m)); any = true; } });
          o._leafBottom = any ? lb.min.y - o.mesh.position.y : o._top;
          if (o.mesh.userData.leafBottom != null) o._leafBottom = o.mesh.userData.leafBottom * o.mesh.scale.y;   // (the tree studies say where their canopy starts: 102-tree-studies.js)
          o._leafR = any ? Math.min(lb.max.x - lb.min.x, lb.max.z - lb.min.z) * .42 : .5;
        }
        o._topKey = key;
      }
      return o._top;
    }
    switch (o.type) {
      case 'rock': return (o.species === 'pebble' ? .45 : .85) * (o.s || 1);
      case 'ore': return 1.1 * (o.s || 1);
      case 'bush': return 1.2 * (o.size || 1);
      case 'fire': return o.kind === 'hearth' ? .6 : .7;
      default: return Infinity;
    }
  }
  // A short hop: up about a frog's height, legs tucked, a squash on landing.
  // Purely for fun (and for friends to see); it doesn't change where you can walk.
  const JUMP_V = 5.4, GRAVITY = 17, AIR = 2 * JUMP_V / GRAVITY;
  // Hold to charge: a tap is a normal hop, a full charge (CHARGE_FULL s) goes three times as high
  // and launches you forward in the direction you're facing.
  const CHARGE_FULL = .55, LEAP_SPEED = 4.2;   // forward speed of a full-charge leap (walking is 4.6)
  let jumpBtnHeld = false; let camLift = 0;
  const hop = { y: 0, v: 0, air: false, land: 0, charge: -1 };
  const canJump = () => !(state !== 'play' || hop.air || climb || flying || knockT > 0 || stats.down || nrg.exhausted || panelOpen() || (myCave ? caveDepth() > CAVE.WADE : heightAt(px, pz) < .1));   // not while wading
  function startCharge() {
    if (climb) { letGo(); return; }   // on a trunk or a cliff, Space lets go (385-climbing.js)
    if (canJump() && hop.charge < 0) { if (sitting) setSitting(false); hop.charge = 0; }
  }
  // Sitting (V): moving, jumping or getting knocked down stands you up again.
  let sitting = false, sentCharge = false;
  function setSitting(on) {
    if (on && (state !== 'play' || hop.air || knockT > 0 || stats.down)) return;
    if (sitting === !!on) return;
    sitting = !!on; if (hero) hero.sitting = sitting;
    if (net) net.send({ t: 'sit', on: sitting });
  }
  function releaseJump() {
    if (hop.charge < 0) return;
    const k = clamp(hop.charge / CHARGE_FULL, 0, 1), mul = 1 + k * 2;   // height x1 .. x3
    hop.charge = -1;
    if (!canJump()) return;
    hop.air = true; hop.v = JUMP_V * Math.sqrt(mul); hop.mul = mul;   // height grows with speed squared
    hop.fwd = k * LEAP_SPEED; hop.fx = Math.sin(face); hop.fz = Math.cos(face);   // the leap forward (none for a tap)
    WG.spendJump(nrg, mul);   // the server charges the same
    if (net) net.send({ t: 'jump', mul });
  }
  function jump() { startCharge(); releaseJump(); }
  window.addEventListener('blur', () => { hop.charge = -1; });
  // What you can stand on: rocks, ore and bushes whose top you've reached. Returns
  // the height of the highest one under your feet that isn't above y.
  const STANDABLE = { rock: 1, ore: 1, bush: 1, tree: 1, palm: 1 };
  function floorAt(x, z, y) {
    let f = 0;
    nearbyObjects(x, z, o => {
      if (!STANDABLE[o.type] || o.state.gone) return;
      const top = topOf(o);
      const zone = (o.type === 'tree' || o.type === 'palm') ? canopyRadius(o) : radius(o) * .85 + .15;
      if (top <= y + .08 && top > f && Math.hypot(o.x - x, o.z - z) < zone) f = top;
    });
    return f;
  }
  function stepHop(h, dt) {   // own frog: simple physics
    stepHopInner(h, dt);
    h.gPrev = groundAt(px, pz); h.xPrev = px; h.zPrev = pz;   // for noticing a cliff edge next frame
  }
  const JUMP_TOP = JUMP_V * JUMP_V * 3 / (2 * GRAVITY);   // the highest a full-charge jump goes (about 2.6 m)
  function stepHopInner(h, dt) {
    if (flying || UI.ride) { h.floor = 0; h.air = true; h.charge = -1; h.land = 0; return; }   // flying, or riding a raft or a line, moves you (387, 394)
    if (climb) { h.floor = 0; h.air = false; h.charge = -1; h.abs = null; glide = false; return; }   // climbing moves you (385-climbing.js)
    if (h.charge >= 0) { h.charge += dt; if (!canJump()) h.charge = -1; }
    else if ((keys[prefs.binds.jump] || jumpBtnHeld) && canJump()) h.charge = 0;   // pressed just before landing: start charging now
    h.floor = floorAt(px, pz, h.y);
    const charging = h.charge >= 0;   // tell friends so they see you crouch
    if (charging !== sentCharge && net && net.open) { sentCharge = charging; net.send({ t: 'charge', on: charging }); }
    if (h.air && travelOn()) {
      // With travel on, height in the air is kept against the sea, not the ground under you, so
      // leaping off a cliff drops you to the ground below (and a glide carries you out over it).
      const g = groundAt(px, pz);
      if (h.abs == null) h.abs = g + h.y;
      if (updateGlide(h)) h.v = -RULES.TRAVEL.GLIDE_FALL * ((stats.inv.leaf_glider || 0) > 0 && WG.feature('region-wood') ? RULES.WOOD.GLIDER_FALL : 1);   // (a leaf glider in the bag sinks slower, C4)
      else h.v -= GRAVITY * dt;
      h.abs += h.v * dt; h.y = h.abs - g;
    } else if (h.air) h.v -= GRAVITY * dt, h.y += h.v * dt;
    if (h.air) {
      if (h.v > 0) { const ceil = leafCeiling(px, pz, h.y - h.v * dt); if (h.y + FROG_H > ceil) { h.y = Math.max(h.floor, ceil - FROG_H); h.v = 0; if (h.abs != null) h.abs = groundAt(px, pz) + h.y; } }   // bonk: the leaves stop you
      if (h.y <= h.floor) { h.y = h.floor; h.v = 0; h.air = false; h.land = .18; h.fwd = 0; h.abs = null; glide = false; }
    }
    else {
      h.abs = null;
      // walked off a cliff (the ground under you dropped far more steeply than any slope you can
      // walk down): fall from where you were, rather than snapping down to the ground below
      const g = groundAt(px, pz), drop = h.gPrev != null ? h.gPrev - g : 0;
      if (!myCave && drop > .35 && drop > Math.hypot(px - h.xPrev, pz - h.zPrev) * 1.5) {
        h.air = true; h.v = 0; h.y += drop; h.abs = g + h.y; h.fwd = 0;
      }
      else if (h.y > h.floor + .02) { h.air = true; h.v = 0; }   // walked off the edge: drop
      else h.y = h.floor;
      if (h.land > 0) h.land -= dt;
    }
  }
  const hopHeight = (tt, mul = 1) => Math.max(0, JUMP_V * Math.sqrt(mul) * tt - GRAVITY * tt * tt / 2);   // friends: replay the same arc
  const airTime = mul => 2 * JUMP_V * Math.sqrt(mul) / GRAVITY;
  // lift the frog, tuck the legs while airborne, squash for a moment after landing
  function applyHop(av, y, airborne, land, crouch = 0) {
    if (crouch > 0) {   // winding up: squat down, bend the knees
      const k = Math.min(1, crouch) * .22;
      av.body.scale.set(1 + k * .5, 1 - k, 1 + k * .5); av.legL.rotation.x = av.legR.rotation.x = -k * 2;
    }
    if (y > 0) av.root.position.y += y;   // (y includes whatever you're standing on)
    if (airborne) {   // tucked legs and raised arms only while actually in the air
      av.legL.rotation.x = -.7; av.legR.rotation.x = -.4;
      if (!av.swingT || av.swingT <= 0) { av.armL.rotation.x = -1.1; if (!av.held) av.armR.rotation.x = -1.1; }
    }
    if (!airborne && land > 0) { const k = land / .18 * .18; av.body.scale.set(1 + k * .6, 1 - k, 1 + k * .6); }
  }

