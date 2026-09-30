  // ================= Joining the island =================
  async function enterIsland() {
    state = 'connecting';
    showMsg('Unknown Island', 'Rowing out to the island…');
    try { await layoutReady; } catch (e) { showMsg('Hmm', 'Couldn’t load the island. Check your connection.', 'Try again', () => location.reload()); return; }
    if (net) net.close();
    net = Net.connect(token(), { message: m => { onMessage(m); UI.net.emit(m); }, down: onDown });
  }

  function onDown() {
    if (state === 'play' || state === 'dead') ui.banner.classList.remove('hidden');
  }

  function resetRemotes() {
    remotes.forEach(r => { removeCastaway(r.av); r.tag.remove(); });
    remotes.clear();
  }
  function addRemote(p) {
    if (!me || p.id === me.id || remotes.has(p.id)) return;
    const tag = document.createElement('div');
    tag.textContent = p.name;
    ui.tags.appendChild(tag);
    const av = makeCastaway(colorFor(p.id));
    setPatches(av, p.patches); setHood(av, !p.hoodDown); setHeld(av, p.hold); av.sitting = !!p.sit;
    remotes.set(p.id, { name: p.name, remote: new Net.Remote(p.x, p.z, p.face), av, tag, dead: p.dead, patches: p.patches || [] });
  }
  function renderOnline() {
    const rows = [`<span><i style="background:${mapCol(me.id)}"></i>${esc(me.name)} (you)</span>`];   // same colours as on the map
    remotes.forEach((r, id) => rows.push(`<span><i style="background:${mapCol(id)}"></i>${esc(r.name)}</span>`));
    ui.online.innerHTML = `<b>On the island (${remotes.size + 1})</b>` + rows.join('');
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function onMessage(m) {
    switch (m.t) {
      case 'welcome': {
        RULES = m.rules || RULES;
        me = { id: m.you.id, name: m.you.name };
        day = m.island.day; t = m.island.time;
        warnedNightDay = isNight(t) ? day : 0;
        for (const o of objects) o.state = WG.defaultState(o.type);
        for (const [id, st] of m.states) if (objects[id]) objects[id].state = st;
        for (const o of objects) applyState(o);
        clearFires(); m.fires.forEach(addFire);
        clearDrops(); (m.drops || []).forEach(addDrop);
        clearStilled();
        clearLanterns(); (m.lanterns || []).forEach(setLantern);
        clearWash(); (m.washups || []).forEach(addWash);
        syncBugs(m.bugs || []);
        if (m.journal) journal = m.journal;
        setEnv(m.env);
        notes = m.notes || []; setBoard(m.board);
        clearCarvings(); setCarvings(m.carvings || []);
        $('chatLog').innerHTML = ''; (m.chat || []).forEach(c => addChat(c, true));
        resetRemotes(); m.players.forEach(addRemote);
        if (hero) removeCastaway(hero);
        hero = makeCastaway(colorFor(me.id));
        applySelf(m.you);
        myPatches = m.you.patches || []; setPatches(hero, myPatches);
        hoodDown = !!m.you.hoodDown; setHood(hero, !hoodDown);
        sentHold = null; lastInv = '';
        renderOnline();
        ui.banner.classList.add('hidden');
        hideOverlay();
        showHud(true);
        if (m.you.dead) { state = 'dead'; deadT = 2; deathInfo = { cause: '', day }; }
        else {
          const wasPlaying = state === 'play';
          state = 'play';
          if (m.firstArrival && !m.seenIntro && !wasPlaying) startCutscene(false);
          else if (!wasPlaying) toast(stats.thirst < 60 ? 'Thirsty. There might be fresh water inland.' : `Day ${day} on ${m.island.name}.`);
        }
        break;
      }
      case 'snap':
        t = m.time; day = m.day;
        syncStilled(m.s);
        for (const [id, x, z, f, moving, dead, stand] of m.p) {
          const r = remotes.get(id);
          if (r) { r.remote.push(x, z, f, moving, dead); r.dead = !!dead; r.stand = stand || 0; }
        }
        break;
      case 'me':
        Object.assign(stats, { health: m.health, hunger: m.hunger, thirst: m.thirst, inv: m.inv, tools: m.tools, buckets: m.buckets || [], warm: m.warm,
          dread: m.dread, fog: m.fog, down: m.down });
        // Energy runs locally for a snappy feel; follow the server if we drift.
        if (Math.abs(nrg.energy - m.energy) > 12 || nrg.exhausted !== m.exhausted) { nrg.energy = m.energy; nrg.exhausted = m.exhausted; }
        if (!ui.book.classList.contains('gone')) renderBook();
        if (!ui.carvingPanel.classList.contains('gone')) renderCarving();
        break;
      case 'join': addRemote(m.player); renderOnline(); toast(`${m.player.name} washed up on the island.`); break;
      case 'leave': {
        const r = remotes.get(m.id);
        if (r) { removeCastaway(r.av); r.tag.remove(); remotes.delete(m.id); renderOnline(); toast(`${r.name} left the island.`); }
        break;
      }
      case 'objs':
        for (const [id, s] of m.list) { const o = objectById(id); if (o) { o.state = s; applyState(o); } }
        break;
      case 'fire': if (!fires.has(m.fire.id)) addFire(m.fire); break;
      case 'fires': for (const [id, fuel, left] of m.list) { const f = fires.get(id); if (!f) continue; f.fuel = fuel;
        if (left == null && f.pot) setPot(f, null); else if (left != null && f.pot) f.pot.left = left; } break;
      case 'pot': { const f = fires.get(m.id); if (f) setPot(f, m.pot); break; }
      case 'fx': {
        if (m.o != null && objectById(m.o) && objectById(m.o).mesh) {
          const o = objectById(m.o);
          o.mesh.rotation.z = .06;
          if (['tree', 'palm', 'rock', 'ore'].includes(o.type)) spawnChips(o);
        }
        if (me && m.id !== me.id) {
          const r = remotes.get(m.id);
          if (r) startSwing(r.av, m.o != null && objectById(m.o) ? swingKindFor(objectById(m.o)) : null);
        }
        if (m.k === 'bell') Sound.bell(m.x, m.z);
        break;
      }
      case 'toast': toast(m.msg); break;
      case 'knocked':
        if (me && m.id === me.id) { knockT = RULES.KNOCK ? RULES.KNOCK.DOWN_MS / 1000 : 3; setSitting(false); }
        else { const r = remotes.get(m.id); if (r) r.knockT = 3; }
        break;
      case 'drop': addDrop(m.drop); break;
      case 'lanterns': for (const l of m.list) setLantern(l); break;
      case 'wash': addWash(m.w); break;
      case 'unwash': m.ids.forEach(removeWash); break;
      case 'bugs': syncBugs(m.list); break;
      case 'journal':
        journal.mine[m.key] = m.count; if (m.first) journal.firsts[m.key] = m.first;
        if (m.count === 1) { const e = journal.entries.find(e => e.key === m.key); if (e) stamp(`New in your journal: ${e.name}`); }
        if (!ui.journal.classList.contains('gone')) renderJournal();
        break;
      case 'discovery':
        journal.firsts[m.key] = m.by;
        if (!me || m.by !== me.name) toast(`${m.by} found the first ${m.name.toLowerCase()} on the island.`);
        break;
      case 'env': {
        if (Cut.on) { Cut.savedEnv = m.env; break; }   // applied when the intro ends
        const was = env;
        setEnv(m.env);
        if (state === 'play' && was.weather !== env.weather) toast(WEATHER_SAY[env.weather] || '');
        break;
      }
      case 'carvings': setCarvings(m.list, m.changed, m.why); break;
      case 'hood':
        if (me && m.id === me.id) { hoodDown = m.down; setHood(hero, !hoodDown); }
        else { const r = remotes.get(m.id); if (r) setHood(r.av, !m.down); }
        break;
      case 'chat': addChat(m); break;
      case 'note':
        notes.push(m.note); if (notes.length > 40) notes.shift(); renderScraps();
        if (!ui.board.classList.contains('gone')) renderBoard();
        if (state === 'play' && (!me || m.note.by !== me.name) && board && Math.hypot(board.x - px, board.z - pz) < 40)
          toast(m.note.by ? `${m.note.by} pinned a note to the driftwood board.` : 'There is a new note on the driftwood board.');
        break;
      case 'patches':
        if (me && m.id === me.id) { myPatches = m.list; setPatches(hero, m.list); if (!ui.journal.classList.contains('gone')) renderJournal(); }
        else { const r = remotes.get(m.id); if (r) { r.patches = m.list; setPatches(r.av, m.list); } }
        break;
      case 'unfire': { const f = fires.get(m.id); if (f) { setPot(f, null); scene.remove(f.mesh); fires.delete(m.id); } break; }
      case 'movedrop': { const d = drops.get(m.id); if (d) { d.x = m.x; d.z = m.z; d.mesh.position.set(m.x, groundAt(m.x, m.z), m.z); } break; }
      case 'undrop': removeDrop(m.id); break;
      case 'dropitems': { const d = drops.get(m.id); if (d) d.items = m.items; break; }
      case 'hold': { const r = remotes.get(m.id); if (r) setHeld(r.av, m.key); break; }
      case 'sit': { const r = remotes.get(m.id); if (r) r.av.sitting = !!m.on; break; }
      case 'charge': { const r = remotes.get(m.id); if (r) r.chargeAt = m.on ? performance.now() : 0; break; }
      case 'jump': { const r = remotes.get(m.id); if (r) r.hop = { t: 0, mul: clamp(+m.mul || 1, 1, 3) }; break; }
      case 'dawn':
        if (state === 'play') toast(`Morning of day ${m.day}. You made it through the night.`);
        break;
      case 'correct': px = m.x; pz = m.z; break;
      case 'died': setSitting(false); state = 'dead'; deadT = 0; deathInfo = { cause: m.cause, day: m.day }; ui.prompt.classList.add('hidden'); break;
      case 'respawned':
        applySelf(m.you);
        hero.root.rotation.x = 0;
        myPatches = m.you.patches || myPatches; setPatches(hero, myPatches); setHood(hero, !hoodDown);
        state = 'play'; hideOverlay(); showHud(true);
        toast('You wake up on the beach again.');
        break;
      case 'kicked':
        leaveToTitle();
        showMsg('Unknown Island', m.reason, 'OK', showReady);
        break;
      case 'auth-failed':
        leaveToTitle();
        setToken(null); memToken = null;
        showAuth('Your login expired. Please log in again.');
        break;
    }
  }

  function applySelf(you) {
    px = you.x; pz = you.z; face = you.face;
    Object.assign(stats, { health: you.health, hunger: you.hunger, thirst: you.thirst, inv: you.inv, tools: you.tools, buckets: you.buckets || [], dread: you.dread || 0 });
    Object.assign(nrg, { energy: you.energy, exhausted: you.exhausted, rest: 0 });
  }

  function leaveToTitle() {
    if (net) { net.close(); net = null; }
    state = 'title';
    showHud(false);
    ui.banner.classList.add('hidden');
    resetRemotes(); clearStilled();
    if (hero) { removeCastaway(hero); hero = null; }
  }

  function showDeath() {
    const how = { hunger: 'You starved', thirst: 'You ran out of water', cold: 'The night was too cold' }[deathInfo && deathInfo.cause] || 'You didn’t make it';
    showHud(false);
    showMsg(`Day ${deathInfo ? deathInfo.day : day}`,
      `${how}. You lost what you were carrying. Tip: coconuts and berries grow back every morning, and a fire keeps you warm through the night.`,
      'Wake up on the beach', () => { if (net) net.send({ t: 'respawn' }); });
  }

