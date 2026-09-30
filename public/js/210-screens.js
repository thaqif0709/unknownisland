  // ================= Screens (login, ready, messages) =================
  const TOKEN_KEY = 'unknown-island-token';
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
  const setToken = v => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
  let memToken = null;   // fallback when storage is blocked
  const token = () => getToken() || memToken;

  function showView(id, title) {
    ['vAuth', 'vReady', 'vMsg'].forEach(v => $(v).classList.toggle('on', v === id));
    $('oTitle').textContent = title || 'Unknown Island';
    ui.overlay.classList.remove('gone');
  }
  function hideOverlay() { ui.overlay.classList.add('gone'); }
  function showMsg(title, text, btn, onBtn) {
    showView('vMsg', title);
    $('msgText').textContent = text;
    const b = $('msgBtn');
    b.hidden = !btn; b.textContent = btn || '';
    b.onclick = onBtn || null;
    if (btn) b.focus({ preventScroll: true });
  }

  let signupMode = false;
  function setMode(signup) {
    signupMode = signup;
    $('tabLogin').setAttribute('aria-selected', String(!signup));
    $('tabSignup').setAttribute('aria-selected', String(signup));
    $('lInvite').hidden = !signup;
    $('inInvite').required = signup;
    $('inPass').autocomplete = signup ? 'new-password' : 'current-password';
    $('authGo').textContent = signup ? 'Join the island' : 'Log in';
    $('authErr').textContent = '';
  }
  $('tabLogin').addEventListener('click', () => setMode(false));
  $('tabSignup').addEventListener('click', () => setMode(true));
  function showAuth(err) {
    showView('vAuth');
    $('authErr').textContent = err || '';
  }
  function showReady() {
    showView('vReady');
    $('readyText').textContent = `Welcome back, ${me.name}. Your friends might already be out there.`;
    $('goIsland').focus({ preventScroll: true });
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token() ? { Authorization: 'Bearer ' + token() } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
  }

  $('fAuth').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('authGo');
    btn.disabled = true; $('authErr').textContent = '';
    try {
      const body = { username: $('inName').value, password: $('inPass').value };
      if (signupMode) body.invite = $('inInvite').value;
      const r = await api(signupMode ? '/api/signup' : '/api/login', body);
      if (!r.ok) { $('authErr').textContent = r.data.error || 'That didn’t work. Try again.'; return; }
      setToken(r.data.token); memToken = r.data.token;
      me = { id: r.data.player.id, name: r.data.player.username };
      $('inPass').value = '';
      showReady();
    } catch (err) {
      $('authErr').textContent = 'Couldn’t reach the island. Check your connection.';
    } finally { btn.disabled = false; }
  });

  $('logout').addEventListener('click', async () => {
    try { await api('/api/logout', {}); } catch (e) {}
    setToken(null); memToken = null; me = null;
    showAuth();
  });

  $('goIsland').addEventListener('click', () => { Sound.init(); enterIsland(); });

  async function boot() {
    if (!token()) return showAuth();
    showMsg('Unknown Island', 'Waking the island up… (this can take up to a minute if nobody has played for a while)');
    try {
      const r = await api('/api/me');
      if (r.ok) { me = { id: r.data.player.id, name: r.data.player.username }; showReady(); }
      else if (r.status === 401) { setToken(null); showAuth(); }
      else showMsg('Hmm', 'The island isn’t answering right now.', 'Try again', boot);
    } catch (e) {
      showMsg('Hmm', 'Couldn’t reach the island. Check your connection.', 'Try again', boot);
    }
  }

