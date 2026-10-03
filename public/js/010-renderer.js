  // ================= Renderer =================
  const stage = document.getElementById('stage');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  let PR = Math.min(window.devicePixelRatio || 1, 1.5);   // (at most 1.5x the screen's pixels: the ink look needs no more; lowered by the Low graphics setting)
  renderer.setPixelRatio(PR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;   // (the loop asks for it once a frame, before the colour pass: 390-loop.js)
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xEFE3C8, 50, 125);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 400);

