  // ---- minigame: ripple memory ----
  // The carving marks light up one after another in the water; tap them back in order.
  const RIPPLE_MARKS = [
    'M16 4a12 12 0 1 0 .1 0Z',                                   // ring
    'M16 16m-3 0a3 3 0 1 1 6 0a6 6 0 1 1-12 0a9 9 0 1 1 18 0',     // spiral
    'M3 12q4.3-6 8.6 0t8.6 0t8.6 0M3 21q4.3-6 8.6 0t8.6 0t8.6 0', // waves
    'M3 16q13-12 26 0q-13 12-26 0ZM16 16m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', // eye
    'M16 4L28 27H4Z',                                            // peak
    'M16 3V29M5 10L27 22M27 10L5 22',                            // star
  ];
  UI.minigames.register('ripple', {
    timers: [],
    open(p, answer, body) {
      const seq = p.seq, got = [];
      body.innerHTML = `<p class="mgq" id="mgRippleHint">Watch the water&hellip;</p><div class="mgmarks">${Array.from({ length: p.symbols }, (_, i) =>
        `<button type="button" class="mgmark" data-i="${i}" disabled aria-label="Mark ${i + 1}"><svg viewBox="0 0 32 32"><path d="${RIPPLE_MARKS[i % RIPPLE_MARKS.length]}"/></svg></button>`).join('')}</div>
        <div class="mgdots">${seq.map(() => '<i></i>').join('')}</div>`;
      const marks = [...body.querySelectorAll('.mgmark')], dots = [...body.querySelectorAll('.mgdots i')], hint = body.querySelector('#mgRippleHint');
      const flash = (i, cls, ms) => { marks[i].classList.add(cls); this.timers.push(setTimeout(() => marks[i].classList.remove(cls), ms)); };
      seq.forEach((v, k) => this.timers.push(setTimeout(() => flash(v, 'lit', p.showMs * .75), 400 + k * p.showMs)));
      this.timers.push(setTimeout(() => { hint.textContent = 'Now you. Same order.'; marks.forEach(m => { m.disabled = false; }); }, 400 + seq.length * p.showMs));
      body.querySelector('.mgmarks').addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (!b || b.disabled) return;
        got.push(+b.dataset.i);
        flash(+b.dataset.i, 'tap', 250);
        dots[got.length - 1].classList.add('on');
        if (got.length === seq.length) { marks.forEach(m => { m.disabled = true; }); answer({ seq: got }); }
      });
    },
    close() { this.timers.forEach(clearTimeout); this.timers = []; },
  });
