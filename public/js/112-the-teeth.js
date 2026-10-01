  // ================= The Teeth (task C6, flag `region-teeth`) =================
  // How the Teeth's own things look, what E says over them, their item icons and bugs; the
  // warmth bar (server/systems/warmth.js: 'warmth'); and the snow: falling flakes up in the Teeth,
  // and a blizzard ('teeth': { blizzard }) that whitens the air and closes it in. The server
  // spawns their things only while the flag is on (server/regions/teeth.js `spawnMore`) and
  // decides what E does (server/systems/teeth.js); this part only draws.
  const teethOn = () => WG.feature('region-teeth') && WG.feature('bigworld');
  const TT = () => RULES.TEETH;
  const teethM = {
    ice: new THREE.MeshLambertMaterial({ color: 0xBFE3F0, transparent: true, opacity: .85 }), crystal: new THREE.MeshBasicMaterial({ color: 0xD6C8F2 }),
    crystalRock: soft(0x8C8794), pine: soft(0x6A5240), sap: new THREE.MeshBasicMaterial({ color: 0xD9A441 }), snow: soft(0xF4F6F8),
    fur: soft(0xEDE9E2), water: new THREE.MeshBasicMaterial({ color: 0x1E3440 }), rim: soft(0xCFE4EE),
  };
  oreM.silver = soft(0xE8ECF2);   // silver ore: bright white flecks (the silver sword)

  Object.assign(UI.things, {
    // a slab of blue ice standing up out of the snow
    ice: {
      solid: true, swing: 'mine',
      label: () => `Break off ice${has('pickaxe') ? '' : ' (a pickaxe gets more)'}`,
      make(rng) {
        const g = new THREE.Group(), slabs = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(rr(rng, .35, .55), rr(rng, .5, 1.1), rr(rng, .25, .4)), teethM.ice);
          s.position.set(rr(rng, -.3, .3), .3, rr(rng, -.2, .2)); s.rotation.set(rr(rng, -.2, .2), rng() * 3, rr(rng, -.25, .25)); slabs.add(s);
        }
        g.add(slabs);
        return { g, parts: { slabs } };
      },
      state(o, s) { o.parts.slabs.children.forEach((c, i) => { c.visible = i < (s.left ?? 3); }); },
    },
    // pale crystal growing out of a grey rock
    crystal: {
      solid: true, swing: 'mine',
      label: () => `Prise out crystal${has('pickaxe') ? '' : ' (needs a pickaxe)'}`,
      make(rng) {
        const g = new THREE.Group(), rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.5, 0), teethM.crystalRock);
        rock.scale.set(1, .6, 1); rock.position.y = .2; g.add(rock);
        const points = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(.08, rr(rng, .4, .7), 5), teethM.crystal);
          c.position.set(rr(rng, -.25, .25), .55, rr(rng, -.25, .25)); c.rotation.set(rr(rng, -.4, .4), 0, rr(rng, -.4, .4)); points.add(c);
        }
        g.add(points);
        return { g, parts: { points } };
      },
      state(o, s) { o.parts.points.children.forEach((c, i) => { c.visible = i < (s.left ?? 2) * 2; }); },
    },
    // a pine stump split by the frost, weeping resin
    pinesap: {
      solid: false, swing: null,
      label: o => ((o.state.left ?? 2) > 0 ? 'Scrape pine resin' : 'A split pine (scraped dry)'),
      make(rng) {
        const g = new THREE.Group(), stump = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, .9, 8), teethM.pine); stump.position.y = .45; g.add(stump);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .06, 8), teethM.snow); cap.position.y = .92; g.add(cap);
        const drops = new THREE.Group();
        for (let i = 0; i < 3; i++) { const a = rng() * 6.28, d = ball(.06, teethM.sap, 6, 4); d.scale.set(1, 1.6, 1); d.position.set(Math.sin(a) * .34, rr(rng, .3, .7), Math.cos(a) * .34); drops.add(d); }
        g.add(drops);
        return { g, parts: { drops } };
      },
      state(o, s) { o.parts.drops.visible = (s.left ?? 2) > 0; },
    },
    // a hollow in the snow where a hare slept, with tufts of shed fur
    hare: {
      solid: false, swing: null,
      label: o => (o.state.picked ? 'A hare’s form (only snow in it)' : 'Gather shed hare fur'),
      make(rng) {
        const g = new THREE.Group(), bank = new THREE.Mesh(new THREE.TorusGeometry(.35, .12, 6, 12), teethM.snow); bank.rotation.x = Math.PI / 2; bank.position.y = .05; g.add(bank);
        const tufts = new THREE.Group();
        for (let i = 0; i < 4; i++) { const t = ball(rr(rng, .06, .09), teethM.fur, 6, 4); t.position.set(rr(rng, -.2, .2), .06, rr(rng, -.2, .2)); tufts.add(t); }
        g.add(tufts);
        return { g, parts: { tufts } };
      },
      state(o, s) { o.parts.tufts.visible = !s.picked; },
    },
    // a round hole in a frozen pool: black water under a rim of ice
    icehole: {
      solid: false, swing: null,
      label: () => (has('rod') ? 'Ice hole: hold E with your rod to fish' : 'An ice hole (a rod would reach down)'),
      make() {
        const g = new THREE.Group(), pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 18), teethM.ice); pool.rotation.x = -Math.PI / 2; pool.position.y = .03; g.add(pool);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(.45, 14), teethM.water); hole.rotation.x = -Math.PI / 2; hole.position.y = .05; g.add(hole);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.48, .06, 5, 14), teethM.rim); rim.rotation.x = Math.PI / 2; rim.position.y = .06; g.add(rim);
        return { g };
      },
    },
  });

  // Item icons for what the Teeth give you.
  Object.assign(UI.itemIcons, {
    ice(g, fill) { fill('#BFE3F0', () => { g.moveTo(14, 46); g.lineTo(20, 16); g.lineTo(46, 12); g.lineTo(52, 40); g.lineTo(34, 54); g.closePath(); }); g.lineWidth = 1.5; g.beginPath(); g.moveTo(22, 20); g.lineTo(30, 44); g.stroke(); },
    crystal(g, fill) { fill('#D6C8F2', () => { g.moveTo(32, 6); g.lineTo(44, 30); g.lineTo(32, 58); g.lineTo(20, 30); g.closePath(); }); g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 30); g.lineTo(44, 30); g.moveTo(32, 6); g.lineTo(32, 58); g.stroke(); },
    pine_resin(g, fill) { fill('#D9A441', () => { g.moveTo(32, 10); g.quadraticCurveTo(50, 36, 44, 46); g.quadraticCurveTo(32, 58, 20, 46); g.quadraticCurveTo(14, 36, 32, 10); g.closePath(); }); fill('#3F6A4A', () => g.rect(28, 4, 8, 8)); },
    hare_fur(g, fill) { fill('#EDE9E2', () => { for (let i = 0; i < 5; i++) g.ellipse(16 + i * 8, 34 + (i % 2) * 6, 9, 12, .3, 0, 7); }); },
    silver(g, fill) { fill('#8E8A92', () => g.ellipse(32, 36, 22, 16, 0, 0, 7)); [[24, 32], [36, 28], [40, 40], [28, 42]].forEach(([x, y]) => fill('#F4F6FA', () => g.arc(x, y, 4, 0, 7))); },
    fur_cloak(g, fill) { fill('#B9A58A', () => { g.moveTo(32, 8); g.lineTo(54, 54); g.lineTo(10, 54); g.closePath(); }); fill('#EDE9E2', () => g.rect(14, 10, 36, 10)); },
    ice_char: fishIcon('#C9614F', .9),
  });

  // The Teeth's bugs.
  const teethBugM = { white: new THREE.MeshBasicMaterial({ color: 0xF4F4F0 }), wing: new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: .7, side: THREE.DoubleSide }),
    clear: new THREE.MeshBasicMaterial({ color: 0xCFE8F2, transparent: true, opacity: .6 }) };
  Object.assign(UI.bugLooks, {
    // a white moth that flies into the wind over the snow at night
    snow_moth: {
      make(g, add) {
        add(new THREE.CylinderGeometry(.015, .01, .1, 4), teethBugM.white, 0, 0, 0).rotation.x = Math.PI / 2;
        for (const sx of [-1, 1]) { const w = add(new THREE.CircleGeometry(.09, 5), teethBugM.wing, sx * .07, 0, 0); w.rotation.x = -Math.PI / 2; g.userData['wing' + sx] = w; }
      },
      move(b, e, gy) { return [b.x + Math.sin(e * .6) * 2, gy + 1.4 + Math.sin(e * 1.7) * .4, b.z + Math.sin(e * .4) * 1.5]; },
    },
    // a tiny clear louse, basking on the ice
    ice_louse: {
      make(g, add) { add(new THREE.SphereGeometry(.035, 6, 4), teethBugM.clear, 0, 0, 0).scale.set(1, .5, 1.4); },
      move(b, e, gy) { return [b.x + Math.sin(e * .15) * .3, gy + .05, b.z + Math.cos(e * .12) * .3]; },
    },
  });

  // ---- warmth: a bar under the others, shown up in the Teeth or while you're still cold ----
  const warmCss = document.createElement('style');
  warmCss.textContent = `.b-warmth i{background:linear-gradient(90deg,#7FA8C9,#E3A15A)} .stat.warmth.low span{color:#4F7FA8}
  .frost{position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;transition:opacity .6s;box-shadow:inset 0 0 120px 40px rgba(220,236,246,.85)}`;
  document.head.appendChild(warmCss);
  const warmStat = document.createElement('div');
  warmStat.className = 'stat warmth hidden';
  warmStat.innerHTML = '<span>Warmth</span><div class="bar b-warmth"><i id="bWarmth"></i></div>';
  const tempEl = document.getElementById('temp');
  tempEl.parentNode.insertBefore(warmStat, tempEl);
  const frost = document.createElement('div');
  frost.className = 'frost'; frost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frost);
  let warmth = 100, blizzard = 0;
  UI.net.on('welcome', m => { warmth = m.warmth ?? 100; blizzard = (m.teeth && m.teeth.blizzard) || 0; });
  UI.net.on('warmth', m => { warmth = m.v; });
  UI.net.on('teeth', m => { blizzard = m.blizzard || 0; });
  const inTeethNow = () => teethOn() && inGame() && WG.regionAt(px, pz) === 'teeth';

  // ---- snow: flakes falling round you up in the Teeth; a blizzard drives them sideways ----
  const snow = (() => {
    const N = 700, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), seed = [], r = mulberry32(260);
    for (let i = 0; i < N; i++) seed.push([r() * 40 - 20, r() * 20, r() * 40 - 20, .6 + r() * .6, r() * 6.28]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.5, 'rgba(255,255,255,.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xFFFFFF, size: .09, map: new THREE.CanvasTexture(c), transparent: true, opacity: .95, depthWrite: false }));
    pts.frustumCulled = false; pts.visible = false;
    scene.add(pts); noInk.add(pts);
    return { pts, update(e, n, gale, cx, cy, cz) {
      pts.visible = n > 0; if (!n) return;
      for (let i = 0; i < N; i++) {
        const [ox, oy, oz, sp, ph] = seed[i], j = i * 3;
        if (i >= n) { pos[j + 1] = -999; continue; }
        const y = ((oy - e * 2.2 * sp * (1 + gale)) % 20 + 20) % 20;
        pos[j] = cx + ((ox + e * gale * 9 * sp + Math.sin(e + ph) * .4 + 20) % 40 + 40) % 40 - 20;
        pos[j + 1] = cy - 6 + y;
        pos[j + 2] = cz + oz + Math.cos(e * .7 + ph) * .4;
      }
      geo.attributes.position.needsUpdate = true;
    } };
  })();
  const fogWas = { near: 0, far: 0, mine: false }, white = new THREE.Color(0xE8EEF2);
  let snowT = 0;
  UI.onFrame(dt => {
    const here = inTeethNow(), high = here && heightAt(px, pz) > TT().SNOW_LINE - 40;
    // the warmth bar
    const show = teethOn() && inGame() && (here || warmth < 100);
    warmStat.classList.toggle('hidden', !show);
    if (show) { document.getElementById('bWarmth').style.setProperty('--v', warmth.toFixed(0) + '%'); warmStat.classList.toggle('low', warmth < TT().WARMTH.LOW); }
    frost.style.opacity = show && warmth < TT().WARMTH.LOW ? ((1 - warmth / TT().WARMTH.LOW) * .9).toFixed(2) : '0';
    // snow instead of rain up there; flakes on still days too, a storm of them in a blizzard
    snowT += dt;
    const storm = here && blizzard > 0;
    if (here) rain.update(0, false);
    snow.update(snowT, storm ? 700 : high && (env.rain || env.fogStorm) ? 350 : high ? 90 : 0, storm ? Math.min(2, blizzard) : 0, camera.position.x, camera.position.y, camera.position.z);
    // a blizzard closes the air in, white (put back as it was after)
    if (storm && !Cut.on) {
      if (!fogWas.mine) { fogWas.near = scene.fog.near; fogWas.far = scene.fog.far; fogWas.mine = true; }
      scene.fog.near = Math.min(scene.fog.near, 4); scene.fog.far = Math.min(scene.fog.far, blizzard > 1 ? 30 : 42);
      scene.fog.color.lerp(white, .7);
    } else if (fogWas.mine) {
      fogWas.mine = false;
      if (scene.fog.far <= 42) { scene.fog.near = fogWas.near; scene.fog.far = fogWas.far; }
    }
  });
  UI.teeth = { get warmth() { return warmth; }, get blizzard() { return blizzard; }, get bar() { return !warmStat.classList.contains('hidden'); }, get snow() { return snow.pts.visible; } };   // (for tests and the console)
