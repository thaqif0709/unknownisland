// Networking: the WebSocket connection (with automatic reconnect) and smoothing
// of other players' movement.
window.Net = (function () {
  'use strict';

  // Opens /ws, says hello with the session token, and reconnects on drops.
  function connect(token, handlers) {
    let ws = null, stopped = false, retry = 0, retryTimer = null;

    function open() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t: 'hello', token })); };
      ws.onmessage = e => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.t === 'kicked' || msg.t === 'auth-failed') stopped = true;
        // the server decides which feature flags are on (WorldGen.feature(name))
        if (msg.t === 'welcome' && msg.features && window.WorldGen) window.WorldGen.setFeatures(msg.features);
        handlers.message(msg);
      };
      ws.onclose = () => {
        if (stopped) return;
        handlers.down();
        // 1s, 2s, 4s ... up to 15s. The first join after a quiet spell can take
        // a while because the free server has to wake up.
        const wait = Math.min(15000, 1000 * 2 ** retry++);
        retryTimer = setTimeout(open, wait);
      };
    }
    open();

    return {
      send(msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
      get open() { return !!ws && ws.readyState === WebSocket.OPEN; },
      close() { stopped = true; clearTimeout(retryTimer); if (ws) ws.close(); },
    };
  }

  // Keeps recent snapshots of a remote player and plays them back slightly in
  // the past, so movement looks smooth even though updates arrive ~12x a second.
  const DELAY = 150; // ms
  class Remote {
    constructor(x, z, face) { this.buf = [{ at: performance.now(), x, z, face, moving: 0, dead: 0 }]; }
    push(x, z, face, moving, dead) {
      this.buf.push({ at: performance.now(), x, z, face, moving, dead });
      if (this.buf.length > 30) this.buf.shift();
    }
    sample() {
      const t = performance.now() - DELAY, b = this.buf;
      while (b.length > 2 && b[1].at <= t) b.shift();
      const a = b[0], c = b[1];
      if (!c || t <= a.at) return a;
      if (t >= c.at) return c;
      const k = (t - a.at) / (c.at - a.at);
      let df = c.face - a.face;
      while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
      return { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, face: a.face + df * k, moving: c.moving, dead: c.dead };
    }
  }

  return { connect, Remote };
})();
