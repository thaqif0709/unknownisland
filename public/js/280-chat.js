  // ================= Chat =================
  // Enter (or /) opens the box; Enter sends, Esc closes. The server handles the
  // commands (/w, /r, /who, /help). Lines fade after a while unless the box is open.
  const chatLog = $('chatLog'), chatForm = $('chatForm'), chatInput = $('chatInput');
  let lastWhisperTo = null;
  function addChat(m, old) {
    const el = document.createElement('p'), who = (name, id) => `<b style="color:${id ? hex(new THREE.Color(colorFor(id)).multiplyScalar(.75).getHex()) : 'inherit'}">${esc(name)}</b>`;
    el.className = m.kind || 'all';
    if (m.kind === 'whisper') el.innerHTML = m.to ? `To ${who(m.to, m.toId)}: ${esc(m.text)}` : `${who(m.from, m.id)} whispers: ${esc(m.text)}`;
    else if (m.kind === 'system') el.textContent = m.text;
    else el.innerHTML = `${who(m.from, m.id)}: ${esc(m.text)}`;
    if (m.kind === 'whisper' && m.to) lastWhisperTo = m.to;
    chatLog.appendChild(el);
    while (chatLog.children.length > 60) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    if (old) el.classList.add('old'); else setTimeout(() => el.classList.add('old'), 14000);
    // a speech bubble over their head (not for whispers)
    if (!old && m.kind === 'all' && me && m.id !== me.id) { const r = remotes.get(m.id); if (r) { r.bubble = m.text; r.bubbleT = Math.min(9, 3 + m.text.length / 12); renderTag(r); } }
  }
  const chatOpen = () => !chatForm.hidden;
  function openChat(prefill) {
    if (state !== 'play' || Cut.on) return;
    releaseKeys();
    ui.chat.classList.add('open'); chatForm.hidden = false;
    chatInput.value = prefill || '';
    chatInput.focus({ preventScroll: true });
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function closeChat() { ui.chat.classList.remove('open'); chatForm.hidden = true; chatInput.blur(); }
  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text && net) net.send({ t: 'chat', text });
    closeChat();
  });
  chatInput.addEventListener('keydown', e => {
    e.stopPropagation();   // typing never moves your frog
    if (e.code === 'Escape') { e.preventDefault(); closeChat(); }
    // Tab after "/w " cycles through the names of people on the island
    if (e.code === 'Tab') {
      e.preventDefault();
      const mm = /^\/(w|whisper|tell|msg)\s+(\S*)$/i.exec(chatInput.value);
      if (!mm) { if (!chatInput.value && lastWhisperTo) chatInput.value = `/w ${lastWhisperTo} `; return; }
      const names = [...remotes.values()].map(r => r.name), start = mm[2].toLowerCase();
      const hit = names.find(n => n.toLowerCase().startsWith(start) && n.toLowerCase() !== start) || names[0];
      if (hit) chatInput.value = `/${mm[1]} ${hit} `;
    }
  });
  chatInput.addEventListener('blur', () => { if (!chatInput.value) setTimeout(() => { if (document.activeElement !== chatInput) closeChat(); }, 150); });
  $('btnChat').addEventListener('click', () => chatOpen() ? closeChat() : openChat(''));
  function renderTag(r) {
    r.tag.innerHTML = (r.bubble ? `<span class="bubble">${esc(r.bubble)}</span>` : '') + esc(r.name);
  }

