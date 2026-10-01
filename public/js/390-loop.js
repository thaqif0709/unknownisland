  // ================= Loop =================
  const clock = new THREE.Clock();
  const tagV = new THREE.Vector3();
  let elapsed = 0, lastDayLabel = '', growTimer = 0;
  const inGame = () => state === 'play' || state === 'dead';

  function tick() {
    const raw = clock.getDelta(), dt = Math.min(raw, .05); elapsed += dt;
    if (window.__dbg) renderer.info.reset();
    // Everything around this point is loaded: you in the game, the title view otherwise.
    if (Cut.on) updateCutscene(Math.min(raw, .25));   // real time, so slow devices don't stretch it
    const focusX = Cut.on ? Cut.focus.x : inGame() ? px : TITLE.x, focusZ = Cut.on ? Cut.focus.z : inGame() ? pz : TITLE.z;
    updateChunks(focusX, focusZ);

    // Time runs locally between server snapshots.
    if (inGame()) { t = WG.advanceT(t, dt); if (t >= 1) t -= 1; }
    else if (state === 'title' || state === 'connecting') t = .3 + Math.sin(elapsed * .02) * .02;
    if (Cut.on && Cut.tod != null) {   // t holds the island's real time here (snaps keep it right)
      const d = ((t - Cut.tod) % 1 + 1.5) % 1 - .5;   // shortest way round the clock
      t = (Cut.tod + d * (Cut.blend || 0) + 1) % 1;
    }
    if (window.__dbg && __dbg.t != null) t = __dbg.t;   // debug only

    let sunI = sky(t);
    const grey = Cut.on && Cut.grey ? Cut.grey : inGame() ? (env.storm ? .45 : env.rain ? .25 : env.fogStorm ? .2 : 0) : 0;
    if (grey) { skyCol.lerp(cA.setRGB(.55, .55, .56), grey); sunI *= 1 - grey * .6; }
    if (inGame() && env.storm && (nextFlash -= dt) <= 0) { nextFlash = 6 + Math.random() * 14; flash = .25; }
    if (flash > 0) { flash -= dt; skyCol.lerp(cA.setRGB(1, 1, .96), Math.max(0, flash) * 3); sunI = Math.max(sunI, flash * 3); }
    if (Cut.on) {   // under the waves: dark water closes in
      const k = Cut.under || 0; skyCol.lerp(teal, k); sunI *= 1 - k * .8;
      scene.fog.near = lerp(50, 4, k); scene.fog.far = lerp(125, 62, k);
      const dry = k < .5; clouds.forEach(c2 => { c2.visible = dry; }); mist.visible = dry;
      const far = dry ? 400 : 58;   // underwater you can't see the island at all
      if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); inkMat.uniforms.far.value = far; }
    }
    scene.background = skyCol; scene.fog.color.copy(skyCol).lerp(cB.set(0xEFE6D2), .35 * sunI);
    const ang = (t - .25) * Math.PI * 2;
    sunDir.set(Math.cos(ang), Math.sin(ang), SUN_TILT).normalize();
    moonDir.set(-Math.cos(ang), -Math.sin(ang), SUN_TILT).normalize();
    const lightDir = sunDir.y > -.05 ? sunDir : moonDir;   // shadows follow whichever is up
    sun.position.set(px + lightDir.x * 50, Math.max(lightDir.y, .12) * 50, pz + lightDir.z * 50);
    sun.target.position.set(px, 0, pz);
    // the sun and moon sit just inside the camera's far limit (2 km with the far view), so far-off
    // hills never rise in front of them; scaled to look the same size as at 300 m
    const skyD = Math.max(300, camera.far * .92), skyK = skyD / 300;
    sunDisc.position.copy(camera.position).addScaledVector(sunDir, skyD); sunDisc.visible = sunDir.y > -.12;
    moonDisc.position.copy(camera.position).addScaledVector(moonDir, skyD); moonDisc.visible = moonDir.y > -.12;
    sunDisc.scale.set(46 * skyK, 46 * skyK, 1); moonDisc.scale.set(34 * skyK, 34 * skyK, 1);
    // their glow: brightest high in a clear sky, dimmer low down (and the moon's with its phase);
    // the halo breathes a little and the sun's beams turn slowly
    const sunUp = clamp((sunDir.y + .12) / .3, 0, 1), moonUp = clamp((moonDir.y + .12) / .3, 0, 1);
    const clear = env.weather === 'storm' || env.weather === 'fogstorm' ? .25 : env.weather === 'rain' ? .5 : 1, breathe = 1 + Math.sin(elapsed * .9) * .05;
    for (const [s, d, k] of [[sunGlow, sunDir, 190], [sunRays, sunDir, 150], [moonGlow, moonDir, 170]]) {
      s.position.copy(camera.position).addScaledVector(d, skyD * 1.002); s.scale.set(k * skyK * breathe, k * skyK * breathe, 1);
    }
    const moonLit = 1 - Math.abs(((env.phase || 0) % 8) - 4) / 4;   // 1 full, 0 new
    sunGlow.material.opacity = .85 * sunUp * clear; sunRays.material.opacity = .45 * sunUp * clear;
    moonGlow.material.opacity = (.25 + .75 * moonLit) * moonUp * clear;
    sunRays.material.rotation = elapsed * .03;
    sunGlow.visible = sunRays.visible = sunDisc.visible; moonGlow.visible = moonDisc.visible;
    if (Cut.on && Cut.under > .5) sunDisc.visible = moonDisc.visible = false;
    mist.position.copy(camera.position); mist.position.y = camera.position.y + 12;
    mist.rotation.y = elapsed * .004;
    // the haze takes on the sky's colour (lighter), and thins out by day so the blue shows
    mist.material.color.copy(skyCol).lerp(cB.setRGB(1, 1, 1), .45).multiplyScalar(.6 + sunI * .4);
    mist.material.opacity = .85 - sunI * .45;
    fireflies.update(elapsed, clamp((-sunDir.y + .08) / .25, 0, 1) * (env.rain ? .15 : 1), focusX, focusZ);
    rain.update(elapsed, inGame() && !!env.rain && !(Cut.on && Cut.under > .5), !!env.storm, camera.position.x, camera.position.y, camera.position.z);
    sun.color.copy(sunCol); sun.intensity = .15 + sunI * .58;
    hemi.intensity = .35 + sunI * .2;
    hemi.color.set(sunI < .2 ? 0x8E9AB8 : 0xFFF6E6);
    const night = isNight(t);

    // fog map and the ink shader's fog/dread inputs
    if ((fogTimer -= dt) <= 0) {
      fogTimer = .25;
      const lights = [], k = env.lightMul || 1;   // rain shrinks every light
      fires.forEach(f => { if (f.fuel > 0) lights.push({ x: f.x, z: f.z, r: WG.FIRES[f.kind].warm * 1.4 * k }); });
      lanterns.forEach(l => { if (l.clear > 0) lights.push({ x: l.x, z: l.z, r: l.clear * k }); });   // shrinks as the fog reclaims it
      if (inGame() && myPatches.includes('firefly_jar')) lights.push({ x: px, z: pz, r: 3.5 });
      if (Cut.on && Cut.light) lights.push(Cut.light);
      remotes.forEach(r => { if (r.patches && r.patches.includes('firefly_jar') && !r.dead) { const q = r.remote.sample(); lights.push({ x: q.x, z: q.z, r: 3.5 }); } });
      updateFogMap(focusX, focusZ, t, lights);
    }
    if ((mapTimer -= dt) <= 0) {
      mapTimer = .3;
      if (!ui.map.classList.contains('gone')) renderMap();
      if (!ui.minimap.classList.contains('hidden')) renderMinimap();
    }
    if (window.__dbg && __dbg.forceDread != null) stats.dread = __dbg.forceDread;   // debug only
    dreadShown += ((inGame() ? stats.dread / 100 : 0) - dreadShown) * Math.min(1, dt * 1.5);
    inkMat.uniforms.dread.value = dreadShown;
    inkMat.uniforms.seeFar.value = inGame() && myPatches.includes('moon_wing') ? .65 : 1;
    inkMat.uniforms.night.value = WG.nightFactor(t);
    inkMat.uniforms.time.value = elapsed;
    if (knockT > 0) knockT -= dt;
    updatePhantom(dt);
    updateExtra(dt);
    Sound.update(dt);
    const cloudTint = .35 + sunI * .65;
    updateCrests(elapsed, cloudTint);
    updatePuffs(dt, elapsed);
    updateChips(dt);
    clouds.forEach(c => {
      // drift east with the wind; wrap within 260 units of you so the sky is never empty
      const u = c.userData, W = 260, wx = u.bx + elapsed * u.speed;
      c.position.set(focusX + ((((wx - focusX) % W) + W * 1.5) % W) - W / 2, u.y, focusZ + ((((u.bz - focusZ) % W) + W * 1.5) % W) - W / 2);
      c.material.color.setRGB(cloudTint, cloudTint, Math.min(1, cloudTint * 1.08));
    });
    const cell = SEA_W / SEA_SEG;
    sea.position.set(Math.round(camera.position.x / cell) * cell, 0, Math.round(camera.position.z / cell) * cell);
    const sp = seaGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = seaBase[i * 3] + sea.position.x, z = seaBase[i * 3 + 2] + sea.position.z;
      sp.setY(i, (Math.sin(x * .25 + elapsed * 1.1) * .09 + Math.cos(z * .3 + elapsed * .9) * .09) * seaAmp);
    }
    sp.needsUpdate = true;

    // Fires: burn down locally, the server corrects about once a second.
    const lit = [];
    fires.forEach(f => {
      if (inGame()) f.fuel = Math.max(0, f.fuel - dt * WG.FIRES[f.kind].burn);
      const on = f.fuel > 0, s = on ? clamp(f.fuel / 40, .35, 1) * (f.kind === 'hearth' ? 1.3 : 1) : 0;
      f.flameGroup.scale.setScalar(s || 1);
      f.flames.forEach(fl => {
        if (fl.ember) { fl.m.visible = true; fl.m.material = on && Math.sin(elapsed * 2 + fl.ph) > -.6 ? emberM : charM; return; }
        fl.m.visible = on;
        if (!on) return;
        const k = Math.sin(elapsed * fl.sp + fl.ph), k2 = Math.sin(elapsed * fl.sp * .63 + fl.ph * 2);
        fl.m.scale.set(1 - k * .08, 1 + k * .22 + k2 * .1, 1 - k * .08);
        fl.m.rotation.y += .6 / 60;
      });
      if (on) lit.push({ f, s, d: Math.hypot(f.x - px, f.z - pz) });
    });
    if ((puffNext -= dt) <= 0) {
      puffNext = lowGfx ? .5 : .22;
      for (const e of lit) if (Math.hypot(e.f.x - camera.position.x, e.f.z - camera.position.z) < 50) emitPuff(e.f);
    }
    lanterns.forEach(l => {
      if (l.lit && inGame()) { l.fuel = Math.max(0, l.fuel - dt); }
      if (l.lit) lit.push({ f: l, s: 1, d: Math.hypot(l.x - px, l.z - pz), lantern: true });
    });
    lit.sort((a, b) => a.d - b.d);
    fireLights.forEach((l, i) => {
      const e = lit[i];
      if (!e) { l.intensity = 0; return; }
      const h = e.lantern ? (e.f.big ? 2.8 : 1.6) : 1.1;
      l.position.set(e.f.x, groundAt(e.f.x, e.f.z) + h, e.f.z);
      l.distance = e.lantern ? (e.f.big ? 30 : 18) : 14;
      l.intensity = e.lantern ? 1.4 + Math.sin(elapsed * 3 + i) * .1 : (1.5 + Math.sin(elapsed * 11 + i) * .25) * e.s;
    });

    // Your own castaway: moved locally, reported to the server.
    let moving = false, wantSprint = false;
    if (state === 'play') {
      const free = !blocksInput() && knockT <= 0 && !stats.down;
      let ix = free ? (held('right') || keys.ArrowRight ? 1 : 0) - (held('left') || keys.ArrowLeft ? 1 : 0) + joy.x : 0;
      let iz = free ? (held('forward') || keys.ArrowUp ? 1 : 0) - (held('back') || keys.ArrowDown ? 1 : 0) - joy.y : 0;
      const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
      wantSprint = free && l > .08 && (held('sprint') || runToggle) && !flying;   // (flying: Shift sinks instead)
      running = WG.stepEnergy(nrg, dt, wantSprint, travelDrain());   // (climbing and gliding use energy too)
      if (flying) moving = flyStep(dt, ix, iz);   // creative mode (387-creative.js)
      else if (climb) { stepClimb(dt, ix, iz); moving = climbMoving; }   // on a trunk or a cliff (385-climbing.js)
      else if (glide) { const [gx, gz] = glideDir(ix, iz); hop.fwd = RULES.TRAVEL.GLIDE_SPEED; hop.fx = gx; hop.fz = gz; }
      const leaping = !climb && !flying && hop.air && hop.fwd > 0;
      if (!climb && !flying && (l > .08 || leaping)) {
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const dx = rx * ix + fx * iz, dz = rz * ix + fz * iz;
        // a bit slower through the air, so you can land on the rock you jumped at instead of sailing past it
        // (and none while gliding: the glide's drift carries you, steered by the keys)
        const spd = glide ? 0 : ((myCave ? caveDepth() > CAVE.WADE : heightAt(px, pz) < .1) ? RULES.WADE_SPEED : RULES.WALK_SPEED) * WG.speedMult(running, nrg.exhausted) * Math.min(1, l) * (hop.air ? .6 : 1);
        let nx = px + dx * spd * dt, nz = pz + dz * spd * dt;
        if (l > .08 && !leaping && tryGrab(dx / l, dz / l)) { nx = px; nz = pz; }   // walked into a climbable trunk or cliff: grab it
        else if (cliffBlocks(nx, nz)) { nx = px; nz = pz; }   // too steep to walk up
        if (leaping) { nx += hop.fx * hop.fwd * dt; nz += hop.fz * hop.fwd * dt; }   // a charged jump carries you forward
        // caves (W9): their walls, and the way in and out at the mouth; slide along walls
        let cs = caveStep(nx, nz);
        if (cs.k === 'block') { if (caveStep(nx, pz).k !== 'block') nz = pz; else if (caveStep(px, nz).k !== 'block') nx = px; cs = caveStep(nx, nz); }
        // the Veil: you can't walk into land that isn't open yet; it turns you around
        const veiled = cs.k === 'surface' && veilBlocks(nx, nz) && !veilBlocks(px, pz);
        if (veiled) veilTurn();
        if (cs.k !== 'block' && (cs.k === 'in' || heightAt(nx, nz) > -1) && !veiled) {
          const under = cs.k === 'in';   // in a cave, the things up on the ground aren't in your way
          const push = o => {
            if (o.state.gone || o.type === 'dig' || (UI.things[o.type] && UI.things[o.type].solid === false)) return;
            if (hop.y > 0 && hop.y >= topOf(o) - .05) return;   // high enough (or standing on top): pass over it
            // off the ground (jumping, or standing on something) and up among the leaves: they're solid.
            // On foot you walk under and around trees as before, so palms and their coconuts stay reachable.
            if ((o.type === 'tree' || o.type === 'palm') && o.mesh && hop.y > .05 && hop.y + FROG_H > o._leafBottom && hop.y < o._top) {
              const ox = nx - o.x, oz = nz - o.z, d = Math.hypot(ox, oz), min = o._leafR + .25;   // up among the leaves: they're solid
              if (d < min && d > 0) { nx = o.x + ox / d * min; nz = o.z + oz / d * min; }
              return;
            }
            const ox = nx - o.x, oz = nz - o.z, d = Math.hypot(ox, oz), min = radius(o) + .3;
            if (d < min && d > 0) { nx = o.x + ox / d * min; nz = o.z + oz / d * min; }
          };
          if (!under) { nearbyObjects(nx, nz, push); fires.forEach(push); lanterns.forEach(push); carvings.forEach(push); if (board) push(board); }
          // other frogs are solid too (unless you jump clean over one)
          if (hop.y < 1.5) remotes.forEach(r => {
            if (r.dead || (r.av.under || 0) !== (under ? cs.cave.id : 0)) return;
            const q = r.remote.sample(), ox = nx - q.x, oz = nz - q.z, d = Math.hypot(ox, oz), min = .7;
            if (d < min && d > 0) { nx = q.x + ox / d * min; nz = q.z + oz / d * min; }
          });
          px = nx; pz = nz;
          caveCommit(cs);
        }
        if (l > .08) {
          const tf = Math.atan2(dx, dz);
          let df = tf - face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
          face += df * Math.min(1, dt * 12);
          moving = true;
          if (sitting) setSitting(false);   // walking off stands you up
        }
      }
      if (!climb) slideOffCliff(dt);   // on a cliff without holding on: down you go
      const now = performance.now();
      const cam = Math.atan2(px - camera.position.x, pz - camera.position.z);   // which way you're looking
      const pose = travelPose(), standNow = pose ? hop.y : (hop.floor || 0);   // how high you are, for friends
      const changed = Math.abs(px - lastSent.x) > .01 || Math.abs(pz - lastSent.z) > .01 || Math.abs(face - lastSent.face) > .02
        || moving !== lastSent.moving || wantSprint !== lastSent.sprint || Math.abs(cam - lastSent.cam) > .04 || Math.abs(standNow - (lastSent.stand || 0)) > .05 || pose !== lastSent.pose;
      if (net && net.open && !(window.__dbg && __dbg.noSend) && ((changed && now - lastSent.at > 66) || now - lastSent.at > 1000)) {
        net.send({ t: 'pos', x: px, z: pz, face, moving, sprint: wantSprint, cam, stand: +standNow.toFixed(2), pose: pose || undefined, under: myCave ? myCave.id : undefined });
        lastSent = { at: now, x: px, z: pz, face, moving, sprint: wantSprint, cam, stand: standNow, pose };
      }
    }
    stepHop(hop, dt);
    if (hero) {
      poseCastaway(hero, px, pz, face, moving ? (running ? 2 : 1) : 0, state === 'dead' || knockT > 0, dt, elapsed); applyHop(hero, hop.y, hop.air, hop.land, hop.charge >= 0 ? hop.charge / CHARGE_FULL : 0);
      if (travelPose()) poseTravel(hero, travelPose(), elapsed, moving);
    }

    animateBugs(elapsed);
    updatePots(dt);
    pulseDrops(elapsed);
    animateCarvings(dt);
    if (state === 'play' && env.drowning && isNight(t) && (nextTremor -= dt) <= 0) { nextTremor = 25 + Math.random() * 35; tremor = 1.6; Sound.rumble(); }
    washups.forEach(w => { if (w.mesh.userData.bell) w.mesh.userData.bell.rotation.z = Math.sin(elapsed * 3 + w.id) * .25; });

    // Other castaways, played back smoothly.
    remotes.forEach(r => {
      const s = r.remote.sample();
      if (r.knockT > 0) r.knockT -= dt;
      if (r.bubble && (r.bubbleT -= dt) <= 0) { r.bubble = null; renderTag(r); }
      poseCastaway(r.av, s.x, s.z, s.face, s.moving, !!s.dead || r.knockT > 0, dt, elapsed);
      r.standS = (r.standS || 0) + ((r.stand || 0) - (r.standS || 0)) * Math.min(1, dt * 8);   // standing on a rock
      r.av.root.position.y += r.standS;
      if (r.pose) poseTravel(r.av, r.pose === 1 ? 'climb' : 'glide', elapsed, s.moving);   // climbing or gliding (P9)
      if (r.chargeAt && !r.hop) applyHop(r.av, 0, false, 0, Math.min(1, (performance.now() - r.chargeAt) / 1000 / CHARGE_FULL));   // crouching to jump
      if (r.hop) { r.chargeAt = 0; const A = airTime(r.hop.mul); r.hop.t += dt; const air = r.hop.t < A; applyHop(r.av, air ? hopHeight(r.hop.t, r.hop.mul) : 0, air, air ? 0 : .18 - (r.hop.t - A)); if (r.hop.t > A + .18) r.hop = null; }
      tagV.set(s.x, r.av.root.position.y - r.standS + 2.05, s.z).project(camera);
      const dist = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
      if (tagV.z > 1 || dist > 45) r.tag.style.display = 'none';
      else {
        r.tag.style.display = '';
        r.tag.style.transform = `translate(${(tagV.x * .5 + .5) * innerWidth}px,${(-tagV.y * .5 + .5) * innerHeight}px) translate(-50%,-100%)`;
      }
    });
    if ((growTimer -= dt) <= 0) { growTimer = 1; objects.forEach(o => { if (o.mesh) resize1(o); }); chunkObjs.forEach(o => { if (o.mesh) resize1(o); }); }
    nearbyObjects(px, pz, o => { if (o.mesh && o.mesh.rotation.z > 0) o.mesh.rotation.z = Math.max(0, o.mesh.rotation.z - dt * .4); });

    // HUD
    if (state === 'play') {
      cooldown = Math.max(0, cooldown - dt);
      if (warnedNightDay !== day && t > .72 && t < .8) {
        warnedNightDay = day;
        if (env.drowning) toast('The Drowning Moon tonight. The fog will come in thick, and the lanterns will drink their oil fast.');
        else toast([...fires.values()].some(f => f.fuel > 0) ? 'Night is coming. Keep a fire fed.' : 'It’s getting dark and cold. A fire would help.');
      }
      target = Cut.on ? null : findTarget();
      const ba = bucketAction();
      const food = !target && !ba && UI.consumable && UI.consumable();
      const lab = ba && ba.label ? ba.label : food ? `Hold to eat the ${WG.ITEMS[food.key.replace(/\d+$/, '')].toLowerCase()}` : label(target);
      if (lab) { ui.prompt.innerHTML = `<kbd>${esc(keyLabel(prefs.binds.act))}</kbd>${esc(lab)}`; ui.prompt.classList.remove('hidden'); $('btnAct').textContent = lab.split(' ').slice(0, 2).join(' '); }
      else { ui.prompt.classList.add('hidden'); $('btnAct').textContent = 'Act'; }

      $('bHealth').style.setProperty('--v', stats.health + '%');
      updateHurt(dt);
      $('bFood').style.setProperty('--v', stats.hunger + '%');
      $('bWater').style.setProperty('--v', stats.thirst + '%');
      $('bEnergy').style.setProperty('--v', nrg.energy + '%');
      $('bDread').style.setProperty('--v', stats.dread + '%');
      $('energyBar').classList.toggle('tired', nrg.exhausted);
      const wx = { rain: ' \u00b7 rain', storm: ' \u00b7 storm', fogstorm: ' \u00b7 fog storm' }[env.weather] || '';
      // countdown to the next nightfall or dawn (real minutes:seconds)
      const toT = target => WG.secondsUntil(t, target);
      const left = night ? toT(.22) : toT(.8), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      const clock = `<span class="timer${night ? ' night' : left < 30 ? ' soon' : ''}">${night ? '\u263e Dawn in' : '\u2600 Night in'} ${mm}:${String(ss).padStart(2, '0')}</span>`;
      const dl = `Day ${day} <small>${phaseName(t)}</small>${clock}<span class="sky${env.drowning ? ' drown' : ''}">${esc(WG.MOON_NAMES[env.phase || 0])}${wx}</span>`;
      if (dl !== lastDayLabel) { $('dayLabel').innerHTML = dl; lastDayLabel = dl; }
      const temp = $('temp');
      if (knockT > 0 || stats.down) { temp.textContent = 'Knocked down\u2026'; temp.className = 'temp cold'; }
      else if (nrg.exhausted) { temp.textContent = 'Exhausted. Catch your breath.'; temp.className = 'temp cold'; }
      else if (stats.fog > .5) { temp.textContent = 'The fog is thick here.'; temp.className = 'temp cold'; }
      else if (night) { temp.textContent = stats.warm ? 'Warm by the fire' : 'Cold'; temp.className = 'temp ' + (stats.warm ? 'warm' : 'cold'); }
      else { temp.textContent = ''; temp.className = 'temp'; }
      renderInventory();
    }

    if (state === 'dead') {
      deadT += dt;
      if (deadT > 1.4 && ui.overlay.classList.contains('gone')) showDeath();
    }

    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('on'); }

    // Camera
    if (!inGame()) {
      const a = elapsed * .05;
      camera.position.set(TITLE.x + Math.sin(a) * 60, 30, TITLE.z + Math.cos(a) * 60);
      camera.lookAt(TITLE.x, 2, TITLE.z);
    } else {
      // Past the lowest orbit angle the camera stops sinking, comes in closer
      // behind the frog and tilts up, so you can look at the sky and treetops.
      // follow you up onto a rock (or a trunk, or a glide), smoothly; and down a long fall (higher
      // above the ground than any jump goes), so the view stays on you instead of the ground below
      const liftTo = (climb || glide || flying) ? hop.y : hop.air ? Math.max(hop.floor || 0, hop.y - JUMP_TOP) : (hop.floor || 0);
      camLift += (liftTo - camLift) * Math.min(1, dt * (hop.air && hop.y > JUMP_TOP ? 12 : 6));
      const py = (myCave ? myFloor() : Math.max(heightAt(px, pz), -.75)) + camLift, LOW = .18;   // in a cave: its floor (W9)
      const up = Math.max(0, LOW - pitch), orbit = Math.max(pitch, LOW - up * .12);
      const dist = camDist * (1 - Math.min(up, 1) * .45);
      const cx = px + Math.sin(yaw) * Math.cos(orbit) * dist;
      const cz = pz + Math.cos(yaw) * Math.cos(orbit) * dist;
      let cy = py + 1.2 + Math.sin(orbit) * dist;
      cy = Math.max(cy, heightAt(cx, cz) + .8, .8);
      camera.position.set(cx, cy, cz);
      if (tremor > 0) { tremor -= dt; const k = Math.min(1, tremor) * .07; camera.position.x += (Math.random() - .5) * k; camera.position.y += (Math.random() - .5) * k; }
      camera.lookAt(px, py + 1.3 + Math.tan(Math.min(up * 1.1, 1.3)) * dist, pz);
    }

    for (const fn of UI.frameFns) fn(dt);
    if (Cut.on) { camera.position.copy(cutCam); camera.lookAt(cutLook); }
    if (window.__dbg && __dbg.camOverride) { const c = __dbg.camOverride; camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); camera.updateMatrixWorld(); }   // debug only
    renderer.setRenderTarget(colorRT); renderer.render(scene, camera);
    if (lowGfx) { renderer.setRenderTarget(null); renderer.render(inkScene, inkCam); requestAnimationFrame(tick); return; }
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null; scene.overrideMaterial = normalMat;
    noInk.forEach(o => { o.visible = false; });
    sea.visible = false;
    renderer.setRenderTarget(normalRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
    scene.overrideMaterial = null;
    // The sea goes into the normal buffer in a flat odd colour, so the shoreline reads as a crease and gets inked.
    sea.visible = true; sea.material = seaInkMat;
    renderer.autoClear = false; renderer.render(sea, camera); renderer.autoClear = true;
    sea.material = seaMat;
    noInk.forEach(o => { o.visible = true; });
    scene.background = bg; scene.fog = fog;
    renderer.setRenderTarget(null); renderer.render(inkScene, inkCam);
    requestAnimationFrame(tick);
  }

  boot();
  tick();
