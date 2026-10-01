  // ================= Rafts and zip lines (P10, flag rafts) =================
  // A raft in hand: E sets it on the water in front of you. E beside a raft climbs aboard
  // (two fit); the first aboard paddles with the walking keys ('raft-steer'), and E steps
  // ashore. A zip line kit in hand: E sets the top post, E again lower down strings the line;
  // E by a top post rides it down. While you ride, the server moves you (UI.ride takes the
  // walking keys in 390-loop.js); this draws the rafts, the lines and their posts.
  const raftsOn = () => WG.feature('rafts');
  const RR = () => RULES.RAFT, ZR = () => RULES.ZIP;
  const rafts = new Map();     // id -> { id, x, z, a (drawn), tx, tz, ta (from the server), riders, g }
  const zips = new Map();      // id -> { ...line, g }
  const zipRiders = new Map(); // player id -> { zip, at (performance.now()) }
  const RAFT_SEATS = [[0, -.55], [0, .55], [.5, 0], [-.5, 0]];   // as on the server (systems/rafts.js)
  const RAFT_DECK = .22;
  let myRaft = null, lastSteer = { dx: 0, dz: 0, go: 0, at: 0 };

  // ---- the look of things ----
  const raftLogM = softShared(0x9A7055), zipRopeM = new THREE.LineBasicMaterial({ color: 0x5A4632 });
  function raftModel() {
    const g = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 2.2, 8), i % 2 ? logM : raftLogM);
      log.rotation.x = Math.PI / 2; log.position.set(i * .27, 0, 0); g.add(log);
    }
    for (const z of [-.7, .7]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, .06, .14), logM); bar.position.set(0, .13, z); g.add(bar); }
    shadows(g);
    return g;
  }
  function zipModel(z) {
    const g = new THREE.Group();
    for (const [x, y, zz] of [[z.ax, z.ay, z.az], [z.bx, z.by, z.bz]]) {
      const gy = groundAt(x, zz), post = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, y - gy + .25, 7), logM);
      post.position.set(x, (y + gy + .25) / 2, zz); g.add(post);
    }
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(z.ax, z.ay, z.az), new THREE.Vector3(z.bx, z.by, z.bz)]);
    g.add(new THREE.Line(geo, zipRopeM));
    shadows(g);
    return g;
  }
  UI.heldModels.raft = (g, add) => { for (const x of [-.06, 0, .06]) add(new THREE.CylinderGeometry(.03, .03, .34, 6), logM, x, -.05, .05).rotation.x = Math.PI / 2; };
  UI.heldModels.zipline = (g, add) => { add(new THREE.TorusGeometry(.08, .025, 6, 14), softShared(0xC9A97A), 0, -.05, .05); };
  Object.assign(UI.itemIcons, {
    raft(g, fill) {
      for (let i = 0; i < 5; i++) fill(i % 2 ? '#8A6248' : '#9A7055', () => g.rect(10 + i * 9, 14, 8, 38));
      g.lineWidth = 4; g.beginPath(); g.moveTo(8, 22); g.lineTo(56, 22); g.moveTo(8, 44); g.lineTo(56, 44); g.stroke();
    },
    zipline(g, fill) {
      fill('#A57A55', () => g.rect(8, 14, 6, 42)); fill('#A57A55', () => g.rect(50, 30, 6, 26));
      g.lineWidth = 2; g.beginPath(); g.moveTo(11, 16); g.lineTo(53, 32); g.stroke();
      fill('#D9803A', () => g.arc(30, 24, 5, 0, 7));
    },
  });

  // ---- what the server tells us ----
  function setRaft(v) {
    let r = rafts.get(v.id);
    if (!r) { r = { id: v.id, x: v.x, z: v.z, a: v.a, g: raftModel() }; scene.add(r.g); rafts.set(v.id, r); }
    Object.assign(r, { tx: v.x, tz: v.z, ta: v.a, riders: v.riders || [] });
    const mine = me && r.riders.includes(me.id);
    if (mine && myRaft !== r.id) { myRaft = r.id; UI.ride = raftRide; }
    else if (!mine && myRaft === r.id) { myRaft = null; if (UI.ride === raftRide) UI.ride = null; }
  }
  function dropRaft(id) { const r = rafts.get(id); if (!r) return; scene.remove(r.g); rafts.delete(id); if (myRaft === id) { myRaft = null; UI.ride = null; } }
  function setZip(v) { if (zips.has(v.id)) scene.remove(zips.get(v.id).g); const z = { ...v, len: Math.hypot(v.bx - v.ax, v.by - v.ay, v.bz - v.az) }; z.g = zipModel(z); scene.add(z.g); zips.set(v.id, z); }
  UI.net.on('rafts', m => { (m.list || []).forEach(setRaft); (m.gone || []).forEach(dropRaft); });
  UI.net.on('zips', m => { (m.list || []).forEach(setZip); });
  UI.net.on('ride', m => {
    if (m.zip == null) zipRiders.delete(m.id); else zipRiders.set(m.id, { zip: m.zip, at: performance.now() });
    if (me && m.id === me.id) UI.ride = m.zip == null ? (UI.ride === zipRide ? null : UI.ride) : zipRide;
  });
  UI.net.on('welcome', m => {
    [...rafts.keys()].forEach(dropRaft); zips.forEach(z => scene.remove(z.g)); zips.clear(); zipRiders.clear();
    myRaft = null; UI.ride = null;
    (m.rafts || []).forEach(setRaft); (m.zips || []).forEach(setZip);
  });

  // ---- riding ----
  const seatOf = (r, i) => { const [ox, oz] = RAFT_SEATS[i % RAFT_SEATS.length], c = Math.cos(r.a), s = Math.sin(r.a); return { x: r.x + ox * c + oz * s, z: r.z - ox * s + oz * c }; };
  const turnTo = (from, to, k) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return from + d * k; };
  const raftRide = {
    step(dt, ix, iz) {
      const r = rafts.get(myRaft);
      if (!r || !me) { UI.ride = null; return false; }
      // the frog at the back paddles: where the keys point (from the camera), and how hard
      if (r.riders[0] === me.id && net) {
        const l = Math.hypot(ix, iz);
        let dx = 0, dz = 0, go = 0;
        if (l > .08) {
          const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
          dx = rx * ix + fx * iz; dz = rz * ix + fz * iz; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; go = Math.min(1, l);
        }
        const now = performance.now(), changed = Math.abs(dx - lastSteer.dx) > .05 || Math.abs(dz - lastSteer.dz) > .05 || Math.abs(go - lastSteer.go) > .05;
        if ((changed && now - lastSteer.at > 80) || (go > 0 && now - lastSteer.at > 600)) {
          net.send({ t: 'raft-steer', dx: +dx.toFixed(3), dz: +dz.toFixed(3), go: +go.toFixed(2) });
          lastSteer = { dx, dz, go, at: now };
        }
      }
      const seat = seatOf(r, Math.max(0, r.riders.indexOf(me.id)));
      px = seat.x; pz = seat.z;
      face = turnTo(face, r.a, Math.min(1, dt * 6));
      hop.y = RAFT_DECK + Math.sin(performance.now() / 600) * .03 - Math.max(groundAt(px, pz), -.75);
      return Math.hypot(r.tx - r.x, r.tz - r.z) > .05;
    },
  };
  const zipRide = {
    step() {
      const ride = me && zipRiders.get(me.id), z = ride && zips.get(ride.zip);
      if (!z) { UI.ride = null; return false; }
      const k = Math.min(1, (performance.now() - ride.at) / 1000 * ZR().SPEED / z.len);
      px = z.ax + (z.bx - z.ax) * k; pz = z.az + (z.bz - z.az) * k;
      face = Math.atan2(z.bx - z.ax, z.bz - z.az);
      hop.y = Math.max(0, z.ay + (z.by - z.ay) * k - ZR().HANG - Math.max(groundAt(px, pz), -.75));
      return true;
    },
  };

  // ---- E ----
  const nearRaft = () => { let best = null, bd = RR().REACH; rafts.forEach(r => { const d = Math.hypot(r.x - px, r.z - pz); if (d < bd && r.riders.length < RR().SEATS) { bd = d; best = r; } }); return best; };
  const nearZipTop = () => { let best = null, bd = ZR().REACH; zips.forEach(z => { const d = Math.hypot(z.ax - px, z.az - pz); if (d < bd) { bd = d; best = z; } }); return best; };
  UI.rafts = {
    act() {
      if (!raftsOn() || state !== 'play' || !net || knockT > 0) return false;
      if (myRaft) { net.send({ t: 'raft-off' }); return true; }
      if (UI.ride) return true;
      const k = heldKey();
      if (k === 'raft') { const a = aimFace(); net.send({ t: 'raft-place', x: +(px + Math.sin(a) * 2.5).toFixed(2), z: +(pz + Math.cos(a) * 2.5).toFixed(2) }); startSwing(hero); return true; }
      if (k === 'zipline') { net.send({ t: 'zip-tie' }); startSwing(hero); return true; }
      const r = nearRaft(); if (r) { net.send({ t: 'raft-board', id: r.id }); return true; }
      const z = nearZipTop(); if (z) { net.send({ t: 'zip-ride', id: z.id }); return true; }
      return false;
    },
  };

  // ---- every frame ----
  const rideTag = document.createElement('div');
  rideTag.className = 'revivetag hidden';
  document.body.appendChild(rideTag);
  UI.onFrame(dt => {
    const t = performance.now() / 1000;
    rafts.forEach(r => {
      r.x += (r.tx - r.x) * Math.min(1, dt * 8); r.z += (r.tz - r.z) * Math.min(1, dt * 8); r.a = turnTo(r.a, r.ta, Math.min(1, dt * 6));
      r.g.position.set(r.x, Math.max(heightAt(r.x, r.z), 0) + .08 + Math.sin(t * 1.6 + r.id) * .03, r.z);
      r.g.rotation.set(Math.sin(t * 1.1 + r.id) * .03, r.a, Math.cos(t * 1.3 + r.id) * .03);
    });
    // hanging from a line: arms up (you and anyone else)
    zipRiders.forEach((_, id) => {
      const av = me && id === me.id ? hero : remotes.get(id) && remotes.get(id).av;
      if (av) { av.armL.rotation.x = -2.9; av.armR.rotation.x = -2.9; }
    });
    // what E would do here
    let say = '';
    if (raftsOn() && state === 'play') {
      const k = heldKey();
      if (myRaft) say = `${keyLabel(prefs.binds.act)}: step ashore` + (rafts.get(myRaft) && rafts.get(myRaft).riders[0] === me.id ? ' · walk keys paddle' : '');
      else if (!UI.ride && k !== 'raft' && k !== 'zipline') {
        if (nearRaft()) say = `Press ${keyLabel(prefs.binds.act)} to climb aboard the raft`;
        else if (nearZipTop()) say = `Press ${keyLabel(prefs.binds.act)} to ride the zip line`;
      }
    }
    rideTag.classList.toggle('hidden', !say);
    if (say) rideTag.textContent = say;
  });
  if (window.__dbg) __dbg.rafts = () => ({ rafts: [...rafts.values()].map(r => ({ id: r.id, x: r.tx, z: r.tz, riders: r.riders })), zips: [...zips.keys()], riding: myRaft ? 'raft' : UI.ride === zipRide ? 'zip' : null });
