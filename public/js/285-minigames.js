  // ================= Minigames (P8) =================
  // The server sets a puzzle ('minigame') and keeps the answer; this shows it in a panel
  // above the hotbar, sends the player's answer ('minigame-answer') and shows the result.
  // Each game draws itself from public/js/minigames/<type>.js (joined right after this part):
  //   UI.minigames.register('trivia', { open(puzzle, answer, body, game), close() })
  // `answer(payload)` sends it (once); `body` is the element to draw in; `game` has
  // { id, type, ms, difficulty }. Esc or the × gives up (the game is lost).
  const MG_KINDS = {};
  UI.minigames = { register(type, def) { MG_KINDS[type] = def; }, current: () => mg };
  let mg = null;   // the game on screen: { id, type, ms, at, def, sent, done }
  const mgEl = document.createElement('div');
  mgEl.className = 'panel gone mg'; mgEl.id = 'minigame';
  mgEl.setAttribute('role', 'dialog'); mgEl.setAttribute('aria-modal', 'true'); mgEl.setAttribute('aria-labelledby', 'mgTitle');
  mgEl.innerHTML = `<div class="sheet"><header><h2 id="mgTitle"></h2><button type="button" class="x" id="mgQuit" aria-label="Give up">&times;</button></header>
    <div class="mgtime" aria-hidden="true"><i id="mgTime"></i></div><div class="mgbody" id="mgBody" tabindex="-1"></div><p class="mgres" id="mgRes" aria-live="polite"></p></div>`;
  document.body.appendChild(mgEl);
  // a stray tap beside the sheet shouldn't lose the fish: only Esc and the × give up
  // (registered before the panels' own backdrop-closes-it listener, so it runs first)
  mgEl.addEventListener('click', e => { if (e.target === mgEl) e.stopImmediatePropagation(); });
  const mgBody = $('mgBody'), mgRes = $('mgRes'), mgTime = $('mgTime');
  UI.panels.register('minigame', {
    el: mgEl,
    onOpen() {},
    onClose() {   // closing it (Esc, ×) before the result gives up
      if (!mg) return;
      if (!mg.done && net) net.send({ t: 'minigame-quit', id: mg.id });
      if (mg.def && mg.def.close) mg.def.close();
      mg = null;
    },
  });
  $('mgQuit').addEventListener('click', () => UI.panels.close('minigame'));

  UI.net.on('minigame', m => {
    if (UI.panels.isOpen('minigame')) UI.panels.close('minigame');
    const def = MG_KINDS[m.type];
    mg = { id: m.id, type: m.type, ms: m.ms, at: performance.now(), def, sent: false, done: false };
    $('mgTitle').textContent = m.name || m.type;
    mgBody.innerHTML = ''; mgRes.textContent = ''; mgRes.className = 'mgres';
    mgEl.dataset.type = m.type;
    UI.panels.open('minigame');
    mgBody.focus({ preventScroll: true });   // not the × (Space or Enter would press it)
    const game = { id: m.id, type: m.type, ms: m.ms, difficulty: m.difficulty };
    const answer = payload => {
      if (!mg || mg.id !== game.id || mg.sent || mg.done) return;
      mg.sent = true;
      if (net) net.send({ t: 'minigame-answer', id: game.id, answer: payload });
      mgRes.textContent = '…';
    };
    if (def) def.open(m.puzzle, answer, mgBody, game);
    else mgBody.textContent = 'This game is not in your client yet. Reload the page.';
  });
  const MG_REASONS = { wrong: 'Not quite.', late: 'Too slow.', early: 'Too soon.', 'gave up': 'You let it go.', replaced: 'Something else came up.' };
  UI.net.on('minigame-result', m => {
    if (!mg || mg.id !== m.id) return;
    mg.done = true;
    mgRes.textContent = m.won ? 'Got it!' : (MG_REASONS[m.reason] || 'Lost.');
    mgRes.className = 'mgres ' + (m.won ? 'won' : 'lost');
    if (mg.def && mg.def.result) mg.def.result(m);
    const id = m.id;
    setTimeout(() => { if (mg && mg.id === id) UI.panels.close('minigame'); }, 1400);
  });
  UI.onFrame(() => {
    if (!mg) return;
    const left = Math.max(0, 1 - (performance.now() - mg.at) / mg.ms);
    mgTime.style.transform = `scaleX(${left.toFixed(3)})`;
    mgTime.classList.toggle('low', left < .25);
  });
