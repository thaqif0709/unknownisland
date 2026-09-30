  // ================= Hurt glow =================
  // Below half health the screen edges glow faintly red (stronger as it drops,
  // with a heartbeat pulse when it's very low), and any damage flashes it.
  let lastHealth = null, hurtFlash = 0;
  function updateHurt(dt) {
    const h = window.__dbg && __dbg.hp != null ? __dbg.hp : stats.health;   // (debug override)
    // a slow drain (cold, hunger) keeps a faint glow on; a big hit flashes strongly
    if (lastHealth != null && h < lastHealth - .05) hurtFlash = Math.min(1, Math.max(hurtFlash, .38 + (lastHealth - h) * .05));
    lastHealth = h;
    hurtFlash = Math.max(0, hurtFlash - dt * 1.2);
    let o = h < 50 ? (50 - h) / 50 * .75 : 0;
    if (h < 25) o *= .75 + .25 * Math.abs(Math.sin(elapsed * 3.2));
    $('hurt').style.opacity = state === 'play' ? Math.min(1, Math.max(o, hurtFlash * .8)).toFixed(3) : 0;
  }

