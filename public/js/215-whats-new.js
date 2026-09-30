  // ================= What's new (on the start screen) =================
  // A short list of what changed, for the people playing, above "Go to the island". It opens
  // by itself the first time someone sees a new set of notes (NEWS.id), then stays folded.
  // A line with `flag` only shows while that feature is switched on (asked of the server,
  // since the start screen comes before the welcome). Put the newest notes here when you
  // switch something on for players; the full history is the Hidden Pages changelog.
  const NEWS = {
    id: '2026-09-30c',
    when: '30 Sept',
    lines: [
      { flag: 'slots', html: '<b>A bag.</b> Press I (phones: Bag) for 30 more slots. Drag stacks between the bag and the hotbar. Coconuts and berries go in it now: hold E with one in your hand to eat it.' },
      { flag: 'bigworld', html: '<b>The island is much bigger.</b> Where you arrive is only the Landing: cross the sandy neck on its north shore. Some new lands are open; the rest wait behind a wall of fog, the Veil.' },
      { flag: 'bigworld', html: '<b>A first look:</b> the new lands are bare for now. Their creatures and stories come later.' },
      { flag: 'farview', html: '<b>You can see for kilometres</b>, out to the mountains.' },
      { flag: 'bigworld', html: '<b>The map</b> (M) fills in wherever anyone walks. Drag it and zoom it.' },
      { html: '<b>Call out</b> (C, or Call on a phone): friends hear you from your direction and see where on the map.' },
      { flag: 'caves', html: '<b>Caves.</b> There’s one somewhere on the Landing, open only at low tide. It’s dark in there: make a <b>torch</b> (wood and seeds).' },
      { flag: 'checkpoints', html: '<b>Camp out:</b> sit (V) by a lit clay hearth to sleep there. You wake beside it after a knockdown.' },
      { html: '<b>A day is 20 minutes:</b> 15 of daylight and 5 of night.' },
      { html: '<b>Chopping and mining look different:</b> an axe sweeps into trees, a pickaxe comes down on stone.' },
    ],
  };
  let newsFlags = null;
  function renderNews() {
    const box = $('news'), on = f => !f || (newsFlags ? !!newsFlags[f] : WG.feature(f));
    const lines = NEWS.lines.filter(l => on(l.flag));
    box.hidden = !lines.length;
    if (!lines.length) return;
    $('newsList').innerHTML = lines.map(l => `<li>${l.html}</li>`).join('');
    $('newsWhen').textContent = NEWS.when;
    let seen = null; try { seen = localStorage.getItem('ui.newsSeen'); } catch (e) { /* private window */ }
    const fresh = seen !== NEWS.id;
    $('newsNew').classList.toggle('seen', !fresh);
    if (fresh) box.open = true;
  }
  $('news').addEventListener('toggle', () => { if (!$('news').open) { try { localStorage.setItem('ui.newsSeen', NEWS.id); } catch (e) { /* ok */ } $('newsNew').classList.add('seen'); } });
  $('goIsland').addEventListener('click', () => { try { localStorage.setItem('ui.newsSeen', NEWS.id); } catch (e) { /* ok */ } });
  fetch('/api/hiddenpages').then(r => r.json()).then(d => { newsFlags = d.features || {}; renderNews(); }).catch(() => renderNews());
  renderNews();
