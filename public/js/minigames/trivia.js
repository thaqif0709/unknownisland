  // ---- minigame: island trivia ----
  UI.minigames.register('trivia', {
    open(p, answer, body) {
      body.innerHTML = `<p class="mgq">${esc(p.q)}</p><div class="mgchoices">${p.answers.map((a, i) =>
        `<button type="button" class="mgbtn" data-i="${i}">${esc(a)}</button>`).join('')}</div>`;
      body.querySelector('.mgchoices').addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        body.querySelectorAll('.mgbtn').forEach(x => { x.disabled = true; });
        b.classList.add('picked');
        answer({ choice: +b.dataset.i });
      });
    },
  });
