  // ---- minigame: pull and ease ----
  // Hold (mouse, finger or Space) to pull the marker up, let go to let it sink; keep it in
  // the fish's zone. The same fixed steps as the server (MinigameSim), and every change of
  // the button is noted by step, so the server can replay it exactly.
  UI.minigames.register('pull', {
    open(p, answer, body) {
      const s = MinigameSim.pullSetup(p), steps = MinigameSim.pullSteps(s), STEP = MinigameSim.PULL.STEP_MS;
      body.innerHTML = `<div class="mgpull"><canvas width="120" height="360"></canvas><div class="mgpullside"><p class="mgq">Hold to pull, let go to ease.</p>
        <div class="mgscore"><i></i></div><p class="mgnote" id="mgPullNeed"></p></div></div>`;
      const cv = body.querySelector('canvas'), g = cv.getContext('2d'), score = body.querySelector('.mgscore i');
      body.querySelector('#mgPullNeed').textContent = `Keep it in for ${Math.round(p.need * 100)}% of the time.`;
      const st = { m: .5, v: 0 }, flips = [];
      let held = false, down = false, i = 0, inside = 0, acc = 0, last = performance.now(), raf = 0;
      const press = on => { held = on; };
      cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (err) {} press(true); });
      ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => press(false)));
      const key = e => { if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); press(e.type === 'keydown'); } };
      window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true);
      this.stop = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true); };
      const frame = now => {
        acc += Math.min(250, now - last); last = now;
        while (acc >= STEP && i < steps) {
          acc -= STEP;
          if (held !== down && flips.length < 600) { down = held; flips.push(i); }
          MinigameSim.pullStep(st, down);
          if (Math.abs(st.m - MinigameSim.pullZone(s, (i + 1) * STEP / 1000)) <= s.hw) inside++;
          i++;
        }
        // draw: the water column, the fish's zone, the marker
        const W = cv.width, H = cv.height, y = v => H - v * H, z = MinigameSim.pullZone(s, i * STEP / 1000);
        g.fillStyle = '#5F7FA8'; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(245,236,215,.85)'; g.fillRect(8, y(z + s.hw), W - 16, s.hw * 2 * H);
        g.strokeStyle = '#2B211F'; g.lineWidth = 3; g.strokeRect(8, y(z + s.hw), W - 16, s.hw * 2 * H);
        g.fillStyle = Math.abs(st.m - z) <= s.hw ? '#E0A33A' : '#C4574F';
        g.beginPath(); g.ellipse(W / 2, y(st.m), 22, 9, 0, 0, 7); g.fill(); g.stroke();
        score.style.width = `${Math.round(100 * inside / Math.max(1, i))}%`;
        if (i >= steps) { this.stop(); answer({ flips }); return; }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    },
    close() { if (this.stop) this.stop(); this.stop = null; },
    result() { if (this.stop) this.stop(); },
  });
