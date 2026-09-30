  // ---- minigame: read the water ----
  // Two pictures of the same patch of pond; three things differ. Tap them on the right-hand
  // picture (tap a mark again to take it back), then press Done.
  function drawPond(cv, items, marks) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, INK = '#2B211F';
    g.fillStyle = '#6F93B0'; g.fillRect(0, 0, W, H);
    g.lineWidth = 2.5; g.strokeStyle = INK; g.lineJoin = g.lineCap = 'round';
    for (const o of items) {
      const x = o.x * W, y = o.y * H, r = 13 * o.s;
      g.beginPath();
      switch (o.k) {
        case 'lily': g.fillStyle = '#7C9A6B'; g.moveTo(x, y); g.arc(x, y, r, .35, Math.PI * 2 - .05); g.closePath(); g.fill(); g.stroke(); break;
        case 'reed': g.strokeStyle = '#4E6B3F'; g.lineWidth = 3; for (const dx of [-5, 0, 5]) { g.moveTo(x + dx, y + r); g.quadraticCurveTo(x + dx * 1.6, y, x + dx * .6, y - r * 1.4); } g.stroke(); g.strokeStyle = INK; g.lineWidth = 2.5; break;
        case 'ripple': g.strokeStyle = '#F5ECD7'; g.ellipse(x, y, r, r * .55, 0, 0, 7); g.moveTo(x + r * .5, y); g.ellipse(x, y, r * .5, r * .28, 0, 0, 7); g.stroke(); g.strokeStyle = INK; break;
        case 'stone': g.fillStyle = '#A9A193'; g.ellipse(x, y, r, r * .7, .3, 0, 7); g.fill(); g.stroke(); break;
        case 'fish': g.fillStyle = '#E0A33A'; g.ellipse(x, y, r, r * .45, 0, 0, 7); g.moveTo(x - r, y); g.lineTo(x - r * 1.6, y - r * .5); g.lineTo(x - r * 1.6, y + r * .5); g.closePath(); g.fill(); g.stroke(); break;
        default: g.fillStyle = '#C9A04A'; g.ellipse(x, y, r * .9, r * .45, -.6, 0, 7); g.fill(); g.stroke(); break;   // leaf
      }
    }
    for (const [mx, my] of marks || []) { g.strokeStyle = '#C4574F'; g.lineWidth = 4; g.beginPath(); g.arc(mx * W, my * H, 17, 0, 7); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 2.5;
  }
  UI.minigames.register('water', {
    open(p, answer, body) {
      const size = Math.max(150, Math.min(240, Math.floor((Math.min(560, innerWidth - 60) - 16) / 2)));
      body.innerHTML = `<p class="mgq">Three things are different on the right. Tap them.</p>
        <div class="mgwater"><canvas width="${size}" height="${size}" aria-label="The pond before"></canvas><canvas width="${size}" height="${size}" class="tap" aria-label="The pond now: tap the differences"></canvas></div>
        <button type="button" class="mgbtn" id="mgWaterDone" disabled>Done (0 of 3)</button>`;
      const [a, b] = body.querySelectorAll('canvas'), done = body.querySelector('#mgWaterDone'), marks = [];
      const redraw = () => { drawPond(a, p.left); drawPond(b, p.right, marks); done.disabled = marks.length < 3; done.textContent = `Done (${marks.length} of 3)`; };
      b.addEventListener('click', e => {
        const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        const near = marks.findIndex(m => Math.hypot(m[0] - x, m[1] - y) < .07);
        if (near >= 0) marks.splice(near, 1); else if (marks.length < 5) marks.push([+x.toFixed(3), +y.toFixed(3)]);
        redraw();
      });
      done.addEventListener('click', () => { done.disabled = true; b.style.pointerEvents = 'none'; answer({ marks }); });
      redraw();
    },
  });
