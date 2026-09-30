  // ---- minigame: untangle the line ----
  // Tap a piece to turn it (right-click or Shift turns it back). The line comes in from the
  // left at the arrow; once it runs out of the right edge (any row) it's sent straight away.
  UI.minigames.register('untangle', {
    open(p, answer, body) {
      const { n, entry, tiles } = p, rots = tiles.map(t => t[1]);
      const px = Math.min(76, Math.floor(Math.min(420, innerWidth - 90) / n));
      body.innerHTML = `<p class="mgq">Turn the pieces so the line runs from the arrow out of the right side.</p>
        <div class="mguntangle" style="--n:${n};--px:${px}px"><i class="mgend in" style="--row:${entry}"></i>
        <div class="mggrid">${tiles.map((_, i) => `<button type="button" class="mgtile" data-i="${i}" aria-label="Turn this piece"><canvas width="${px * 2}" height="${px * 2}"></canvas></button>`).join('')}</div></div>`;
      const cells = [...body.querySelectorAll('.mgtile')];
      const draw = lit => cells.forEach((b, i) => {
        const g = b.firstChild.getContext('2d'), s = px * 2, h = s / 2;
        g.clearRect(0, 0, s, s);
        g.lineCap = 'round';
        const sides = MinigameSim.tileSides(tiles[i][0], rots[i]), pt = d => [h + [0, h, 0, -h][d], h + [-h, 0, h, 0][d]];
        const path = () => {
          g.beginPath();
          const [a, b2] = sides.map(pt);
          g.moveTo(a[0], a[1]);
          if ((sides[0] + 2) % 4 === sides[1]) g.lineTo(b2[0], b2[1]); else g.quadraticCurveTo(h, h, b2[0], b2[1]);
          g.stroke();
        };
        g.strokeStyle = '#2B211F'; g.lineWidth = s * .2; path();
        g.strokeStyle = lit && lit.includes(i) ? '#E0A33A' : '#F5ECD7'; g.lineWidth = s * .11; path();
      });
      const turn = (i, d) => {
        rots[i] = (rots[i] + d + 4) % 4;
        const lit = MinigameSim.untangleRun(n, entry, tiles, rots);
        draw(lit);
        if (lit) { cells.forEach(c => { c.disabled = true; }); answer({ rots: rots.slice() }); }
      };
      body.querySelector('.mggrid').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) turn(+b.dataset.i, e.shiftKey ? -1 : 1); });
      body.querySelector('.mggrid').addEventListener('contextmenu', e => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); turn(+b.dataset.i, -1); } });
      draw(null);
    },
  });
