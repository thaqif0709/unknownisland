  // ================= Recipe book & settings =================
  function togglePanel(which) {
    const el = ui[which];
    const opening = el.classList.contains('gone');
    closePanels();
    if (!opening) return;
    if (which !== 'map') releaseKeys();   // the map doesn't block movement, so don't drop held keys
    if (which === 'book') renderBook(); else if (which === 'journal') renderJournal(); else if (which === 'board') renderBoard();
    else if (panelHooks[which] && panelHooks[which].onOpen) panelHooks[which].onOpen();
    else if (which === 'carvingPanel') renderCarving(); else if (which === 'map') renderMap(); else renderSettings();
    el.classList.remove('gone');
    const first = el.querySelector('.x');
    if (first) first.focus({ preventScroll: true });
  }
  function closePanels() {
    waitingBind = null;
    PANELS.forEach(k => {
      if (ui[k].classList.contains('gone')) return;
      ui[k].classList.add('gone');
      if (panelHooks[k] && panelHooks[k].onClose) panelHooks[k].onClose();
    });
    if (chatOpen()) closeChat();
  }
  document.querySelectorAll('.panel').forEach(p => p.addEventListener('click', e => {
    if (e.target === p || e.target.closest('[data-close]')) closePanels();
  }));

  function renderBook() {
    $('recipes').innerHTML = WG.RECIPES.filter(r => !(r.flag && !WG.feature(r.flag))).map(r => {
      const owned = r.kind === 'tool' && has(r.id);
      const locked = r.needs && !has(r.needs);
      const ok = canAfford(r) && !owned && !locked;
      const cost = Object.entries(r.cost).map(([k, n]) => {
        const have = stats.inv[k] || 0;
        return `<span class="${have >= n ? 'ok' : 'no'}">${esc(WG.ITEMS[k])} ${Math.min(have, n)}/${n}</span>`;
      }).join('');
      const btn = owned ? 'You have one' : r.kind === 'fire' ? 'Build' : 'Make';
      return `<div class="recipe${ok ? ' can' : ''}"><div class="r-top"><b>${esc(r.name)}</b><span class="kind">${{ tool: 'Tool', fire: 'Fire', bucket: 'Bucket', item: 'Item' }[r.kind] || ''}</span></div>
        <p>${esc(r.desc)}</p><div class="r-bot"><div class="cost">${cost}</div>
        <button type="button" class="main" data-build="${r.id}"${ok ? '' : ' disabled'}>${btn}</button></div></div>`;
    }).join('');
  }
  $('recipes').addEventListener('click', e => {
    const b = e.target.closest('[data-build]');
    if (!b || b.disabled) return;
    const r = WG.recipeById(b.dataset.build);
    build(r.id);
    if (r.kind === 'fire') closePanels();   // step back and see it
  });

  function renderBinds() {
    $('binds').innerHTML = ACTIONS.filter(([, , , flag]) => !flag || WG.feature(flag)).map(([a, name]) =>
      `<div class="bind"><span>${esc(name)}</span><button type="button" data-bind="${a}" class="${waitingBind === a ? 'wait' : ''}">${waitingBind === a ? 'Press a key\u2026' : esc(keyLabel(prefs.binds[a]))}</button></div>`).join('');
  }
  function renderSettings() {
    renderBinds();
    $('chatKeyLbl').textContent = keyLabel(prefs.binds.chat);
    $('dropKeyLbl').textContent = keyLabel(prefs.binds.drop);
    $('sens').value = prefs.sens;
    $('invertY').checked = prefs.invertY;
    $('mouseNote').hidden = !mouseLookOn();
    $('quality').value = prefs.quality;
    $('sounds').checked = prefs.sounds !== false;
  }
  $('binds').addEventListener('click', e => {
    const b = e.target.closest('[data-bind]');
    if (!b) return;
    waitingBind = waitingBind === b.dataset.bind ? null : b.dataset.bind;
    renderBinds();
  });
  $('resetKeys').addEventListener('click', () => { prefs.binds = { ...DEFAULT_BINDS }; waitingBind = null; savePrefs(); renderBinds(); });
  $('sens').addEventListener('input', e => { prefs.sens = +e.target.value; savePrefs(); });
  $('invertY').addEventListener('change', e => { prefs.invertY = e.target.checked; savePrefs(); });
  $('quality').addEventListener('change', e => { prefs.quality = e.target.value; savePrefs(); applyQuality(); });
  $('sounds').addEventListener('change', e => { prefs.sounds = e.target.checked; savePrefs(); if (prefs.sounds) Sound.init(); });
  $('resume').addEventListener('click', closePanels);
  $('rewatch').addEventListener('click', () => { closePanels(); if (state === 'play') startCutscene(true); });
  $('logout2').addEventListener('click', async () => {
    closePanels();
    leaveToTitle();
    try { await api('/api/logout', {}); } catch (e) {}
    setToken(null); memToken = null; me = null;
    showAuth();
  });

  const joyEl = $('joy'), knob = $('joyKnob');
  const joy = { id: null, sx: 0, sy: 0, x: 0, y: 0 };
  const orb = { id: null, lx: 0, ly: 0 };
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && mouseLookOn()) { lockPointer(); return; }   // mouse-look: a click locks the pointer instead of dragging
    if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * .45 && joy.id === null) {
      joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.x = joy.y = 0;
      joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.style.display = 'block';
      knob.style.transform = '';
    } else if (orb.id === null) { orb.id = e.pointerId; orb.lx = e.clientX; orb.ly = e.clientY; }
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.sx, dy = e.clientY - joy.sy; const l = Math.hypot(dx, dy);
      if (l > 45) { dx *= 45 / l; dy *= 45 / l; }
      joy.x = dx / 45; joy.y = dy / 45; knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (e.pointerId === orb.id) {
      yaw -= (e.clientX - orb.lx) * .007 * prefs.sens;
      pitch = clamp(pitch + (e.clientY - orb.ly) * .004 * prefs.sens * (prefs.invertY ? -1 : 1), -1.1, 1.15);   // below .18 you look up
      orb.lx = e.clientX; orb.ly = e.clientY;
    }
  });
  const endPtr = e => {
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = 'none'; }
    if (e.pointerId === orb.id) orb.id = null;
  };
  stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', e => {
    if (!mouseLookOn()) { camDist = clamp(camDist + e.deltaY * .01, 5, 16); return; }
    e.preventDefault();   // no page zoom or scrolling
    if (e.ctrlKey) camDist = clamp(camDist + e.deltaY * .03, 5, 16);   // Ctrl+wheel, or a trackpad pinch: zoom
    else wheelSlot(e.deltaY);
  }, { passive: false });

