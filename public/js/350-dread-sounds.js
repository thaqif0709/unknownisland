  // ================= Dread: sounds =================
  // Faint footsteps behind you and whispers, made from filtered noise.
  const Sound = {
    ctx: null, noise: null, next: 8,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const len = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, len, len), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      } catch (e) { this.ctx = null; }
    },
    burst(at, dur, filterType, freq, q, gain, pan) {
      const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise; f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + dur * .25); g.gain.linearRampToValueAtTime(0, at + dur);
      let node = g;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
      src.connect(f); f.connect(g); node.connect(c.destination);
      src.start(at, Math.random() * .5, dur + .05);
      return f;
    },
    bell(x, z) {
      if (!this.ctx || prefs.sounds === false) return;
      const c = this.ctx, t0 = c.currentTime, d = Math.hypot(x - px, z - pz), vol = Math.max(0, .25 - d / 200);
      for (const [f, g] of [[523, 1], [1318, .4], [2093, .2]]) {
        const o = c.createOscillator(), gn = c.createGain(); o.type = 'sine'; o.frequency.value = f;
        gn.gain.setValueAtTime(vol * g, t0); gn.gain.exponentialRampToValueAtTime(.0001, t0 + 3);
        o.connect(gn); gn.connect(c.destination); o.start(t0); o.stop(t0 + 3.1);
      }
    },
    breath() {   // something enormous breathing under the ground: two slow swells of low noise
      if (!this.ctx || prefs.sounds === false) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t0 = this.ctx.currentTime;
      for (let i = 0; i < 2; i++) { this.burst(t0 + i * 3.2, 2.2, 'lowpass', 180, .7, .35, 0); this.burst(t0 + i * 3.2 + 1.2, 1.6, 'lowpass', 120, .7, .22, 0); }
    },
    rumble() {
      if (!this.ctx || prefs.sounds === false) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.burst(this.ctx.currentTime, 1.8, 'lowpass', 70, 1, .5, 0);
    },
    footsteps() {
      const c = this.ctx, pan = Math.random() * 1.6 - .8, n = 3 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) this.burst(c.currentTime + i * .55, .14, 'lowpass', 280, 1, .22, pan);
    },
    whisper() {
      const c = this.ctx, t0 = c.currentTime, pan = Math.random() * 1.6 - .8;
      for (let i = 0; i < 3; i++) {
        const f = this.burst(t0 + i * .35, .9, 'bandpass', 2200 + Math.random() * 1400, 7, .05, pan);
        f.frequency.linearRampToValueAtTime(1400 + Math.random() * 1600, t0 + i * .35 + .9);
      }
    },
    update(dt) {
      if (!this.ctx || prefs.sounds === false || state !== 'play') return;
      const d = stats.dread;
      if (d < 40 || (this.next -= dt) > 0) return;
      this.next = 4 + Math.random() * 10 * (1.4 - d / 100);
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (d > 55 && Math.random() < .5) this.whisper(); else this.footsteps();
    },
  };

