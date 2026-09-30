  // ================= Dread: false things =================
  // At high dread you see a frog where no one is: at the edge of your view,
  // gone when you look straight at it or walk up to it. Sometimes it waits
  // behind you and is only there when you turn round.
  let phantom = null, phantomNext = 12;
  const _v = new THREE.Vector3();
  function viewAngle(x, y, z) {   // angle between the camera's forward and a point
    _v.set(x, y, z).sub(camera.position).normalize();
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    return Math.acos(clamp(f.dot(_v), -1, 1));
  }
  function updatePhantom(dt) {
    const d = stats.dread;
    if (phantom) {
      phantom.life -= dt;
      const a = viewAngle(phantom.x, groundAt(phantom.x, phantom.z) + 1, phantom.z);
      const inView = a < camera.fov * Math.PI / 360 * 1.1;
      if (inView) phantom.seen = true;
      const gone = phantom.life <= 0 || Math.hypot(phantom.x - px, phantom.z - pz) < 7 || a < .2
        || (phantom.behind && phantom.seen && (phantom.seenFor = (phantom.seenFor || 0) + (inView ? dt : 0)) > .6);
      if (gone || d < 45 || state !== 'play') { removeCastaway(phantom.av); phantom = null; phantomNext = 6 + Math.random() * 14 * (1.3 - d / 100); }
      else poseCastaway(phantom.av, phantom.x, phantom.z, Math.atan2(px - phantom.x, pz - phantom.z), 0, false, dt, 0);
      return;
    }
    if (state !== 'play' || Cut.on || d < 65 || (phantomNext -= dt) > 0) return;
    const behind = Math.random() < .4;
    const camYaw = Math.atan2(px - camera.position.x, pz - camera.position.z);   // direction you're looking
    const side = (Math.random() < .5 ? -1 : 1) * (behind ? Math.PI * (.75 + Math.random() * .2) : .5 + Math.random() * .25);
    const ang = camYaw + side, dist = 11 + Math.random() * 8;
    const x = px + Math.sin(ang) * dist, z = pz + Math.cos(ang) * dist;
    if (heightAt(x, z) < .3) { phantomNext = 2; return; }
    const friends = [...remotes.keys()];
    const colour = friends.length ? colorFor(friends[(Math.random() * friends.length) | 0]) : CLOAKS[(Math.random() * CLOAKS.length) | 0];
    phantom = { av: makeCastaway(colour), x, z, life: 5 + Math.random() * 4, behind, seen: false };
  }

