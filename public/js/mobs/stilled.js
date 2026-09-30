  // ---- mob: the Stilled ----
  // Pale, faceless figures drawn as holes in the world: flat colour, marked
  // (alpha 0) so the ink pass leaves them without outlines or shading.
  // (The intro cutscene borrows makeStilled too.)
  const stilledMat = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(0xE9E1CF) } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 col; void main(){ gl_FragColor = vec4(col, 0.); }',
    blending: THREE.NoBlending, depthWrite: false,
  });
  function makeStilled(id) {
    const g = new THREE.Group();
    const part = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, stilledMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.renderOrder = 10; g.add(m); return m; };
    part(new THREE.SphereGeometry(.3, 12, 9), 0, 1.62, 0, 1.25, .72, 1);
    for (const sx of [-1, 1]) part(new THREE.SphereGeometry(.11, 8, 6), sx * .19, 1.78, .05);
    part(new THREE.CylinderGeometry(.14, .22, .78, 10), 0, 1.02, 0);
    for (const sx of [-1, 1]) {
      const arm = part(new THREE.CylinderGeometry(.045, .04, .82, 6), sx * .27, .9, .06); arm.rotation.z = sx * .06; arm.rotation.x = -.12;
      part(new THREE.CylinderGeometry(.06, .05, .64, 6), sx * .1, .32, 0);
    }
    g.children[0].rotation.z = (WG.hash2(id, 3) - .5) * .5;   // a head tilted just wrong
    scene.add(g);
    return g;
  }
  UI.mobs.register('stilled', { make: makeStilled });
