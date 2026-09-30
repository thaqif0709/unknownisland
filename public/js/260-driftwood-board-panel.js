  // ================= Driftwood board panel =================
  function renderBoard() {
    const list = notes.slice().reverse();
    $('boardNotes').innerHTML = list.length ? list.map(n => {
      const when = n.at ? new Date(n.at) : null;
      return `<div class="scrap"><p>${esc(n.text)}</p><span>${n.by ? '\u2014 ' + esc(n.by) : 'no name'}${when && !isNaN(when) ? ' \u00b7 ' + when.toLocaleDateString() : ''}</span></div>`;
    }).join('') : '<p class="note">Nothing pinned yet.</p>';
  }
  $('boardForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('boardText').value.trim();
    if (!text || !net) return;
    net.send({ t: 'pin', text });
    $('boardText').value = '';
  });
  $('boardText').addEventListener('keydown', e => { if (e.code !== 'Escape') e.stopPropagation(); });

