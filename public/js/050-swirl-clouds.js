  // ================= Swirl clouds =================
  // Curly clouds like the manes and smoke in tattoo flash, drawn on a canvas
  // with their own ink outline and drifting slowly around the island.
  // Three kinds: long and flat, tall and stacked, or a small puff. Sizes and curls vary.
  function cloudTexture(seed) {
    // Curled clouds in the old inked style: a few round lobes heaped together,
    // a spiral curl in the big ones, and long tapering wisps trailing off the
    // sides that flick up at the tip. Every cloud is drawn from its own seed.
    const W = 512, H = 320, r = mulberry32(seed), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), INK = '#2B211F';
    const kind = r() < .3 ? 'small' : r() < .6 ? 'tall' : 'wide';
    const cx = W / 2 + (r() - .5) * 40, baseY = H - 95;
    // lobes: [x, y, radius], biggest at the back and middle
    const lobes = [];
    const big = kind === 'small' ? 48 : 64;
    lobes.push([cx + (r() - .5) * 30, baseY - big * (kind === 'tall' ? 1.05 : .8), big * (kind === 'tall' ? 1.12 : 1)]);
    const sideN = kind === 'small' ? 1 : 2;
    for (const dir of [-1, 1]) for (let i = 0; i < sideN; i++) {
      const rad = big * (.7 - i * .14 + r() * .12);
      lobes.push([cx + dir * (big * (.75 + i * .7) + r() * 12), baseY - rad * .75 - r() * 10, rad]);
    }
    if (kind === 'tall') lobes.push([cx + (r() - .5) * 40, baseY - big * 1.62, big * .7]);   // sunk into the pile, not perched on it
    // wisps: tapered ribbons from the base out to one or both sides
    const wisps = [];
    const sides = r() < .45 ? [-1, 1] : [r() < .5 ? -1 : 1];
    for (const dir of sides) wisps.push({ dir, len: (kind === 'small' ? 110 : 150) + r() * 70, amp: 10 + r() * 16, up: r() < .7 });
    const wispPath = w => {
      // grow out of the side of the outermost lobe on that side
      const edge = lobes.reduce((m, l) => (w.dir * l[0] > w.dir * m[0] ? l : m), lobes[0]);
      const x0 = edge[0] + w.dir * edge[2] * .35, y0 = edge[1] + edge[2] * .62, pts = [];
      w.len = Math.min(w.len, (w.dir > 0 ? W - 14 - x0 : x0 - 14));   // stay inside the picture
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, x = x0 + w.dir * w.len * t;
        const y = y0 - Math.sin(t * Math.PI * 1.1) * w.amp * (1 - t * .4) - (w.up ? Math.pow(Math.max(0, t - .7) / .3, 2) * 26 : 0);
        pts.push([x, y, 15 * Math.pow(1 - t, 1.15) + .8]);
      }
      g.beginPath();
      pts.forEach(([x, y, wd], i) => { const [nx, ny] = i < pts.length - 1 ? pts[i + 1] : pts[i - 1]; const a = Math.atan2(ny - y, nx - x) * (i < pts.length - 1 ? 1 : 1) + Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * wd, y + Math.sin(a) * wd); });
      for (let i = pts.length - 1; i >= 0; i--) { const [x, y, wd] = pts[i]; const [nx, ny] = i < pts.length - 1 ? pts[i + 1] : pts[i - 1]; const a = Math.atan2(ny - y, nx - x) + Math.PI / 2; g.lineTo(x - Math.cos(a) * wd, y - Math.sin(a) * wd); }
      g.closePath();
    };
    const circle = (x, y, rad) => { g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); };
    // 1) the ink silhouette
    g.lineJoin = 'round'; g.lineCap = 'round';
    wisps.forEach(w => { wispPath(w); g.lineWidth = 9; g.strokeStyle = INK; g.stroke(); });
    g.fillStyle = INK; lobes.forEach(([x, y, rad]) => { circle(x, y, rad + 4.5); g.fill(); });
    // 2) fills: wisps, then lobes back to front with a soft shadow along the bottom
    wisps.forEach(w => { wispPath(w); g.fillStyle = '#F4F6F8'; g.fill(); });
    const order = lobes.slice().sort((a, b) => a[1] - b[1]);   // top of the pile first (furthest back), front lobes last
    // back lobes first; the ones in front overlap them. The biggest lobe and one
    // side lobe carry a curl: a single spiral that starts at the lobe's lower
    // edge (facing the middle of the cloud) and winds in about one and a quarter turns.
    // curls go on the front lobes (the lowest ones), where nothing covers them
    const front = order.slice().reverse();
    const curled = new Set(kind === 'small' ? [front[0]] : [front[0], front[1 + ((r() * Math.min(2, front.length - 1)) | 0)]]);
    order.forEach((l, i) => {
      const [x, y, rad] = l;
      g.fillStyle = '#C9D5E2'; circle(x, y, rad); g.fill();
      g.fillStyle = '#FBFCFD'; circle(x - rad * .04, y - rad * .12, rad * .9); g.fill();
      if (i > 0) {   // a front lobe: ink its rounded edge where it sits over the lobe behind
        g.beginPath(); g.arc(x, y, rad, Math.PI * 1.05, Math.PI * 1.95); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      }
      if (!curled.has(l)) return;
      const toMid = x < cx ? 1 : -1, dirn = -toMid;   // wind toward the middle of the cloud
      const a0 = Math.PI / 2 + toMid * .6, turns = 1.25, R0 = rad * .78, ccx = x + toMid * rad * .12, ccy = y + rad * .05;
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 * turns; a += .06) {
        const k = a / (Math.PI * 2 * turns), rr = R0 * Math.pow(1 - k, 1.25) + rad * .06;
        const px2 = ccx + Math.cos(a0 + dirn * a) * rr, py2 = ccy + Math.sin(a0 + dirn * a) * rr;
        a ? g.lineTo(px2, py2) : g.moveTo(px2, py2);
      }
      g.lineWidth = 3.4; g.strokeStyle = 'rgba(43,33,31,.6)'; g.stroke();
    });
    const t = new THREE.CanvasTexture(c);
    t.userData = { kind: kind === 'small' ? 'small' : 'big', aspect: H / W };
    return t;
  }
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const map = cloudTexture(100 + i * 7);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, fog: false, depthWrite: false }));
    const bx = WG.hash2(i, 1) * 260, bz = WG.hash2(i, 2) * 260;
    const w = map.userData.kind === 'small' ? 36 + WG.hash2(i, 3) * 12 : 56 + WG.hash2(i, 3) * 26;
    sp.userData = { bx, bz, y: 52 + (i % 4) * 6 + WG.hash2(i, 4) * 6, speed: .6 + WG.hash2(i, 5) * .6 };
    sp.scale.set(w, w * map.userData.aspect, 1);
    scene.add(sp); clouds.push(sp); noInk.add(sp);
  }

  // Smoky mist: a soft, continuous haze around the horizon. Built from many
  // overlapping soft blobs (no outlines), faded out at the top and bottom, and
  // drawn so the left and right edges wrap without a seam.
  function mistTexture() {
    const W = 2048, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = mulberry32(77);
    const puff = (x, y, rx, ry, a) => {
      for (const ox of [-W, 0, W]) {   // wrap around
        const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
        grd.addColorStop(0, `rgba(243,232,208,${a})`); grd.addColorStop(.55, `rgba(238,226,200,${a * .55})`); grd.addColorStop(1, 'rgba(236,224,198,0)');
        g.save(); g.translate(x + ox, y); g.scale(1, ry / rx); g.translate(-(x + ox), -y);
        g.fillStyle = grd; g.beginPath(); g.arc(x + ox, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
      }
    };
    for (let i = 0; i < 90; i++) puff(r() * W, 110 + (r() - .5) * 70, 120 + r() * 220, 30 + r() * 40, .12 + r() * .16);
    for (let i = 0; i < 40; i++) puff(r() * W, 105 + (r() - .5) * 40, 60 + r() * 90, 14 + r() * 16, .1 + r() * .12);   // denser wisps
    // fade to nothing at the top and bottom so it melts into the sky
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(.3, 'rgba(0,0,0,1)'); fade.addColorStop(.62, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2;
    return t;
  }
  const mist = new THREE.Mesh(new THREE.CylinderGeometry(220, 220, 90, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: mistTexture(), transparent: true, opacity: .85, side: THREE.BackSide, fog: false, depthWrite: false }));
  mist.renderOrder = -1;
  scene.add(mist); noInk.add(mist);

  // Sun and moon: inked discs that follow the real sky path. East is +x, north is -z;
  // the sun rises in the east, passes a little to the south, and sets in the west.
  // The moon is opposite, so it rises in the east as the sun sets.
  const SUN_TILT = .3;
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  function discTexture(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    if (kind === 'sun') {
      g.strokeStyle = '#2B211F'; g.lineWidth = 7; g.lineCap = 'round';
      for (let i = 0; i < 12; i++) {   // short wavy rays
        const a = i / 12 * Math.PI * 2;
        g.beginPath(); g.moveTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84);
        g.quadraticCurveTo(128 + Math.cos(a + .12) * 100, 128 + Math.sin(a + .12) * 100, 128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116); g.stroke();
      }
      g.fillStyle = '#2B211F'; g.beginPath(); g.arc(128, 128, 76, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#F2C45A'; g.beginPath(); g.arc(128, 128, 69, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#E8A640'; g.beginPath(); g.arc(140, 140, 48, 0, Math.PI * 2); g.fill();
    } else {
      // kind is 'moon' + phase (0-7). 0 is the Drowning Moon: dark, rimmed in sea-green.
      const ph = +kind.slice(4) || 0, R = 73, lit = '#F3EAD6', dark = ph === 0 ? '#27403F' : '#4A4658';
      g.fillStyle = '#2B211F'; g.beginPath(); g.arc(128, 128, 80, 0, Math.PI * 2); g.fill();
      g.fillStyle = dark; g.beginPath(); g.arc(128, 128, R, 0, Math.PI * 2); g.fill();
      if (ph === 0) { g.strokeStyle = '#6FA39A'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, R - 4, 0, Math.PI * 2); g.stroke(); }
      else {
        // lit half (right while waxing, left while waning), then the terminator as an ellipse
        const waxing = ph < 4, k = Math.cos(ph / 8 * Math.PI * 2);   // 1 new, -1 full
        g.fillStyle = lit; g.beginPath(); g.arc(128, 128, R, -Math.PI / 2, Math.PI / 2, !waxing); g.closePath(); g.fill();
        g.fillStyle = k > 0 ? dark : lit; g.beginPath(); g.ellipse(128, 128, Math.max(.5, R * Math.abs(k)), R, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(160,150,130,.5)'; [[106, 150, 10], [150, 104, 8], [140, 160, 6]].forEach(([x, y, rr]) => { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); });
      }
    }
    return new THREE.CanvasTexture(c);
  }
  const moonTex = [];
  const moonTexture = ph => moonTex[ph] || (moonTex[ph] = discTexture('moon' + ph));
  const skyDisc = kind => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(kind), transparent: true, fog: false, depthWrite: false }));
    sp.scale.set(kind === 'sun' ? 46 : 34, kind === 'sun' ? 46 : 34, 1); sp.renderOrder = -2;
    scene.add(sp); noInk.add(sp); return sp;
  };
  const sunDisc = skyDisc('sun'), moonDisc = skyDisc('moon4');
  // Their glow: a soft halo behind each (added light, so it brightens the sky round them), and
  // for the sun slow-turning beams. Placed and faded with the discs in 390-loop.js.
  function glowTexture(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    if (kind === 'rays') {   // soft beams, wider at the end, fading out
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2 + (i % 2) * .08, w = i % 2 ? .07 : .12, len = i % 2 ? 100 : 124;
        const grad = g.createRadialGradient(128, 128, 20, 128, 128, len);
        grad.addColorStop(0, 'rgba(255,236,170,.75)'); grad.addColorStop(1, 'rgba(255,236,170,0)');
        g.fillStyle = grad; g.beginPath(); g.moveTo(128, 128);
        g.lineTo(128 + Math.cos(a - w) * len, 128 + Math.sin(a - w) * len); g.lineTo(128 + Math.cos(a + w) * len, 128 + Math.sin(a + w) * len); g.closePath(); g.fill();
      }
    } else {
      const col = kind === 'sun' ? '255,214,120' : '214,226,255';
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, `rgba(${col},1)`); grad.addColorStop(.22, `rgba(${col},.55)`); grad.addColorStop(.5, `rgba(${col},.16)`); grad.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    }
    return new THREE.CanvasTexture(c);
  }
  const skyGlow = (kind, order) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(kind), transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.renderOrder = order; scene.add(sp); noInk.add(sp); return sp;
  };
  const sunGlow = skyGlow('sun', -4), sunRays = skyGlow('rays', -3), moonGlow = skyGlow('moon', -4);
  // the haze round the camera is drawn over the sky; the moon (and its glow) shine through it
  moonDisc.renderOrder = 1; moonGlow.renderOrder = 1; moonDisc.material.depthTest = moonGlow.material.depthTest = true;
  let env = { phase: 4, lightMul: 1 };
  function setEnv(e) {
    env = Object.assign({ lightMul: 1 }, e || {});
    fogEnv = { drowning: !!env.drowning, fogStorm: !!env.fogStorm, calm: !!env.calm, press: !!env.press };
    moonDisc.material.map = moonTexture(env.phase || 0); moonDisc.material.needsUpdate = true;
    fogTimer = 0;
  }

  // Rain: short inked streaks falling around the camera.
  const rain = (() => {
    const N = 900, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 6), seed = [];
    const r = mulberry32(99);
    for (let i = 0; i < N; i++) seed.push([r() * 40 - 20, r() * 24, r() * 40 - 20, .8 + r() * .4]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x5E6A74, transparent: true, opacity: .55, fog: false }));
    lines.frustumCulled = false; lines.visible = false;
    scene.add(lines); noInk.add(lines);
    return { update(elapsed, on, heavy, cx, cy, cz) {
      lines.visible = on; if (!on) return;
      const n = heavy ? N : N / 2, fall = heavy ? 26 : 18, slant = heavy ? .35 : .12;
      for (let i = 0; i < N; i++) {
        const [ox, oy, oz, sp] = seed[i], y = cy - 8 + ((oy - elapsed * fall * sp) % 24 + 24) % 24;
        const x = cx + ox, z = cz + oz, j = i * 6;
        if (i >= n) { pos.fill(0, j, j + 6); pos[j + 1] = pos[j + 4] = -99; continue; }
        pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; pos[j + 3] = x + slant; pos[j + 4] = y + .7; pos[j + 5] = z;
      }
      geo.attributes.position.needsUpdate = true;
    } };
  })();
  let flash = 0, nextFlash = 8, tremor = 0, nextTremor = 20;   // lightning; small tremors on Drowning nights

  // Fireflies: soft blinking lights over the grass and among the trees at night.
  const fireflies = (() => {
    // They live in an 80-unit window that follows you (wrapping in world space),
    // so there are always some nearby without simulating the whole island.
    const N = 150, WIN = 80, r = mulberry32(555), base = [];
    for (let i = 0; i < N; i++) base.push({ ox: r() * WIN, oz: r() * WIN, ph: r() * 6.28, sp: .6 + r() * .9, ph2: r() * 6.28, cx: NaN, cz: NaN, h: 0 });
    const wrap = (v, c) => c + ((((v - c) % WIN) + WIN * 1.5) % WIN) - WIN / 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,220,1)'); grd.addColorStop(.25, 'rgba(230,245,140,.9)'); grd.addColorStop(1, 'rgba(200,230,90,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .55, map: new THREE.CanvasTexture(c), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false;
    scene.add(pts); noInk.add(pts);
    return { pts, base, update(elapsed, amount, fx, fz) {
      pts.visible = amount > .01;
      if (!pts.visible) return;
      const p = geo.attributes.position.array, col = geo.attributes.color.array;
      base.forEach((f, i) => {
        const { ph, sp, ph2 } = f, x = wrap(f.ox, fx), z = wrap(f.oz, fz);
        if (Math.abs(x - f.cx) > .5 || Math.abs(z - f.cz) > .5) { f.cx = x; f.cz = z; f.h = heightAt(x, z); f.land = f.h > 1.1 && f.h < 12; }
        const h = f.h;
        p[i * 3] = x + Math.sin(elapsed * .35 * sp + ph) * .9;
        p[i * 3 + 1] = h + .7 + Math.sin(elapsed * .8 * sp + ph2) * .35;
        p[i * 3 + 2] = z + Math.cos(elapsed * .3 * sp + ph2) * .9;
        const blink = f.land ? Math.pow(Math.max(0, Math.sin(elapsed * 1.7 * sp + ph)), 3) * amount : 0;
        col[i * 3] = .9 * blink; col[i * 3 + 1] = 1 * blink; col[i * 3 + 2] = .5 * blink;
      });
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    } };
  })();

