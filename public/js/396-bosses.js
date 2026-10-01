  // ================= Bosses (C0, flag bosses) =================
  // What the server says of each boss ('boss': waiting, fighting or beaten): a health bar at
  // the top while you're near its fight, a mark on the map, the ground shaking under its heavy
  // blows ('bossfx'), and once it's beaten an echo where it fell: E there earns its trophy
  // ('boss-echo') if you weren't in the fight. Each boss's look is in public/js/mobs/.
  const bossesOn = () => WG.feature('bosses');
  const BR = () => RULES.BOSSES;
  const bossList = new Map();   // id -> { id, name, state, x, z, r, hp, max, phase, phases, mob, echo? }
  let bossShake = 0;

  const bossCss = document.createElement('style');
  bossCss.textContent = `.bossbar{position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(440px,80vw);z-index:5;pointer-events:none;text-align:center;
    font:600 14px/1.2 inherit;color:#F4EFE2;text-shadow:0 1px 2px rgba(0,0,0,.6)}
  .bossbar.hidden{display:none}
  .bossbar .track{position:relative;height:12px;margin-top:5px;border:2px solid #2B211F;border-radius:7px;background:rgba(43,33,31,.45);overflow:hidden}
  .bossbar .fill{position:absolute;inset:0 auto 0 0;background:#C4574F;transition:width .2s}
  .bossbar .mark{position:absolute;top:0;bottom:0;width:2px;background:#2B211F}`;
  document.head.appendChild(bossCss);
  const bossBar = document.createElement('div');
  bossBar.className = 'bossbar hidden'; bossBar.setAttribute('role', 'status');
  bossBar.innerHTML = '<span class="name"></span><div class="track"><i class="fill"></i></div>';
  document.body.appendChild(bossBar);

  // ---- the echo where a beaten boss fell: a pale, slowly turning flame ----
  const echoM = new THREE.MeshBasicMaterial({ color: 0xE8E2F4, transparent: true, opacity: .45, depthWrite: false });
  function setEcho(b) {
    if (b.state === 'beaten' && !b.echo) {
      b.echo = new THREE.Mesh(new THREE.ConeGeometry(.45, 1.6, 9, 1, true), echoM);
      b.echo.position.set(b.x, Math.max(groundAt(b.x, b.z), 0) + .9, b.z);
      scene.add(b.echo);
    } else if (b.state !== 'beaten' && b.echo) { scene.remove(b.echo); b.echo = null; }
  }
  function setBoss(v) {
    const b = bossList.get(v.id) || {};
    Object.assign(b, v);
    bossList.set(v.id, b);
    setEcho(b);
  }
  UI.net.on('boss', setBoss);
  UI.net.on('welcome', m => { bossList.forEach(b => b.echo && scene.remove(b.echo)); bossList.clear(); (m.bosses || []).forEach(setBoss); });
  UI.net.on('mobhit', m => { bossList.forEach(b => { if (b.mob === m.id) { b.hp = m.hp; b.max = m.max; } }); });
  UI.net.on('bossfx', m => { if (Math.hypot(m.x - px, m.z - pz) < BR().SHAKE) bossShake = Math.max(bossShake, .45); });

  const nearEcho = () => { let best = null; bossList.forEach(b => { if (b.state === 'beaten' && Math.hypot(b.x - px, b.z - pz) < BR().ECHO) best = b; }); return best; };
  UI.bosses = {
    phaseOf(mobId) { let ph = 0; bossList.forEach(b => { if (b.mob === mobId) ph = b.phase; }); return ph; },
    // E (from 230-actions.js act()): at a beaten boss's echo
    act() {
      if (!bossesOn() || state !== 'play' || !net) return false;
      const b = nearEcho();
      if (!b) return false;
      net.send({ t: 'boss-echo', id: b.id });
      return true;
    },
  };

  // ---- the map: where it waits or fights (red), or its echo (pale) ----
  UI.mapLayers.push({
    draw(g, at, dotScale) {
      if (!bossesOn()) return;
      bossList.forEach(b => {
        if (b.x == null) return;
        const [cx, cy] = at(b.x, b.z), r = 6 * dotScale;
        g.save();
        g.globalAlpha = b.state === 'beaten' ? .5 : 1;
        g.fillStyle = b.state === 'beaten' ? '#E8E2F4' : '#C4574F'; g.strokeStyle = '#2B211F'; g.lineWidth = 1.5 * dotScale;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
        if (b.state !== 'beaten') { g.beginPath(); g.moveTo(cx - r * .5, cy - r * .5); g.lineTo(cx + r * .5, cy + r * .5); g.moveTo(cx + r * .5, cy - r * .5); g.lineTo(cx - r * .5, cy + r * .5); g.stroke(); }
        g.restore();
      });
    },
  });

  // ---- every frame: the bar, the echo's prompt, the shake ----
  const echoTag = document.createElement('div');
  echoTag.className = 'revivetag hidden';
  document.body.appendChild(echoTag);
  UI.onFrame(dt => {
    let near = null;
    if (bossesOn() && state === 'play') bossList.forEach(b => { if (b.state === 'fighting' && Math.hypot(b.x - px, b.z - pz) < b.r * 1.5) near = b; });
    bossBar.classList.toggle('hidden', !near);
    if (near) {
      bossBar.querySelector('.name').textContent = near.name;
      bossBar.querySelector('.fill').style.width = `${Math.max(0, Math.min(100, near.hp / near.max * 100)).toFixed(1)}%`;
      const track = bossBar.querySelector('.track'), def = near.phases || 1;
      if (track.dataset.phases !== String(def)) {   // a notch where each phase begins (evenly, as the server's are near enough)
        track.querySelectorAll('.mark').forEach(e => e.remove());
        track.dataset.phases = def;
        for (let i = 1; i < def; i++) { const mk = document.createElement('i'); mk.className = 'mark'; mk.style.left = `${(i / def * 100).toFixed(1)}%`; track.appendChild(mk); }
      }
    }
    const echo = bossesOn() && state === 'play' ? nearEcho() : null;
    echoTag.classList.toggle('hidden', !echo);
    if (echo) echoTag.textContent = `Press ${keyLabel(prefs.binds.act)} to touch the echo of ${echo.name.replace(/^The /, 'the ')}`;
    bossList.forEach(b => { if (b.echo) { b.echo.rotation.y += dt * .8; b.echo.material.opacity = .3 + Math.sin(performance.now() / 700) * .12; } });
    if (bossShake > 0) {
      bossShake -= dt;
      const k = Math.max(0, bossShake) * .5;
      camera.position.x += (Math.random() - .5) * k; camera.position.y += (Math.random() - .5) * k; camera.position.z += (Math.random() - .5) * k;
    }
  });
  if (window.__dbg) __dbg.bosses = () => ({ list: [...bossList.values()].map(b => ({ id: b.id, state: b.state, hp: b.hp, max: b.max, phase: b.phase })), bar: !bossBar.classList.contains('hidden'), shaking: bossShake > 0 });
