  // ---- boss: the Straw Giant (C0's practice boss; admins call it with /boss practice) ----
  // The straw dummy (dummy.js) grown huge. It leans back to wind up and slams forward; once
  // it's angry (its second phase) its straw bristles and it shakes.
  UI.mobs.register('boss_practice', {
    make() { const g = makeDummy(); g.scale.setScalar(2.4); return g; },
    pose(m, dt, now) {
      const b = m.mesh.userData.body, s = (now - m.stateAt) / 1000, angry = UI.bosses && UI.bosses.phaseOf(m.id) > 0;
      const lean = m.state === 'slam' || m.state === 'sweep' ? -Math.min(1, s / 1.1) * .5
        : m.state === 'recover' ? .6 * Math.max(0, 1 - s / .8) : 0;
      b.rotation.x += (lean - b.rotation.x) * Math.min(1, dt * 10);
      b.rotation.z = angry ? Math.sin(now / 45) * .04 : 0;
      if (m.state === 'sweep') b.rotation.y = Math.sin(s * 5) * .6; else b.rotation.y *= .9;
    },
  });
