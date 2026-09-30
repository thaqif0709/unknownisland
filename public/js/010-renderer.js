  // ================= Renderer =================
  const stage = document.getElementById('stage');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  let PR = Math.min(window.devicePixelRatio || 1, 2);   // lowered by the Low graphics setting
  renderer.setPixelRatio(PR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xEFE3C8, 50, 125);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 400);

