  // ================= State =================
  let state = 'title';              // title | connecting | play | dead
  let me = null;                    // { id, name }
  let stats = { health: 100, hunger: 80, thirst: 70, inv: { wood: 0, stone: 0 }, tools: [], warm: false, dread: 0, fog: 0, down: false };
  let knockT = 0, dreadShown = 0, fogTimer = 0;
  const nrg = { energy: 100, exhausted: false, rest: 0 };   // predicted locally, corrected by the server
  let running = false, runToggle = false;
  let px = SPAWN.x, pz = SPAWN.z, face = Math.PI, cooldown = 0, deadT = 0, deathInfo = null;
  let yaw = 0, pitch = .55, camDist = 9;
  let warnedNightDay = 0, target = null;
  let hero = null;
  const remotes = new Map();        // id -> { name, remote, av, tag }
  let net = null, lastSent = { at: 0, x: 0, z: 0, face: 0, moving: false, sprint: false, cam: 0 };

  const $ = id => document.getElementById(id);
  const ui = { hud: $('hud'), inv: $('inv'), prompt: $('prompt'), toast: $('toast'), overlay: $('overlay'), online: $('online'),
    touch: $('touchUi'), banner: $('banner'), tags: $('tags'), gear: $('btnSettings'), book: $('book'), settings: $('settings'), journal: $('journal'),
    board: $('boardPanel'), carvingPanel: $('carvingPanel'), chat: $('chat'), map: $('map'), minimap: $('minimap') };
  let myPatches = [], hoodDown = false;
  function toggleHood() {
    if (state !== 'play' || !hero) return;
    hoodDown = !hoodDown; setHood(hero, !hoodDown);   // show it straight away; the server tells everyone
    if (net) net.send({ t: 'hood', down: hoodDown });
  }
  const WEATHER_SAY = { clear: 'The sky clears.', rain: 'It starts to rain. Fires burn smaller in the wet.',
    storm: 'A storm rolls in. The sea will bring things up tomorrow.', fogstorm: 'The fog is coming in, in broad daylight.' };
  let toastTimer = 0;
  function toast(msg) { if (Cut.on) return; ui.toast.textContent = msg; ui.toast.classList.add('on'); toastTimer = 2.6; }

  function showHud(on) {
    [ui.hud, ui.inv, ui.online, ui.touch, ui.gear, ui.chat, ui.minimap].forEach(el => el.classList.toggle('hidden', !on));
    if (!on) { ui.prompt.classList.add('hidden'); closePanels(); closeChat(); }
  }

