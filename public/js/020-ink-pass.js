  // ================= Ink pass =================
  // Illustration look: the scene is drawn once for colour + depth and once for
  // normals; a full-screen pass then inks every silhouette and crease with a
  // thick dark line and adds a little paper grain.
  const colorRT = new THREE.WebGLRenderTarget(2, 2);
  colorRT.depthTexture = new THREE.DepthTexture(2, 2);
  colorRT.depthTexture.type = THREE.UnsignedIntType;
  const normalRT = new THREE.WebGLRenderTarget(2, 2);
  const normalMat = new THREE.MeshNormalMaterial();
  // Fog map: a small texture around you holding fog density (0-1) from the
  // shared fog rule, so the fog drawn here is the same fog the server uses.
  const FOG_N = 64, FOG_CELL = 4, FOG_SIZE = FOG_N * FOG_CELL;
  const fogData = new Uint8Array(FOG_N * FOG_N * 4);
  const fogTex = new THREE.DataTexture(fogData, FOG_N, FOG_N, THREE.RGBAFormat);
  fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter;
  const fogOrigin = new THREE.Vector2();
  const inkMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: colorRT.texture }, tDepth: { value: colorRT.depthTexture }, tNormal: { value: normalRT.texture },
      res: { value: new THREE.Vector2(1, 1) }, width: { value: 2 }, near: { value: camera.near }, far: { value: camera.far },
      useNormals: { value: 1 },
      ink: { value: new THREE.Color(0x2B211F) },
      fogTex: { value: fogTex }, fogOrigin: { value: fogOrigin }, fogSize: { value: FOG_SIZE },
      invProj: { value: camera.projectionMatrixInverse }, camWorld: { value: camera.matrixWorld }, camPos: { value: camera.position },
      night: { value: 0 }, time: { value: 0 }, dread: { value: 0 }, seeFar: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      uniform sampler2D tColor, tDepth, tNormal, fogTex;
      uniform vec2 res, fogOrigin; uniform float width, near, far, useNormals, fogSize, night, time, dread, seeFar;
      uniform vec3 ink, camPos; uniform mat4 invProj, camWorld;
      varying vec2 vUv;
      float lin(vec2 uv){ float z = texture2D(tDepth, uv).x * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
      vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).rgb * 2. - 1.; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
      float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
      float bayer(vec2 a){ return b2(.5 * a) * .25 + b2(a); }
      float fogField(vec2 xz){
        vec2 f = (xz - fogOrigin) / fogSize;
        if (f.x < 0. || f.y < 0. || f.x > 1. || f.y > 1.) return 1.;   // beyond the map: assume the worst
        return texture2D(fogTex, f).r;
      }
      void main(){
        // dread: the lines start to tremble
        vec2 jit = vec2(sin(time * 23. + vUv.y * 90.), cos(time * 19. + vUv.x * 70.)) * dread * dread * 1.6 / res;
        vec2 uv = vUv + jit;
        vec4 c4 = texture2D(tColor, uv);
        vec3 col = c4.rgb;
        float raw = texture2D(tDepth, uv).x;
        float d0 = lin(uv);
        bool sky = d0 >= far * .98;
        // ---- fog: density along the view, from where you stand and where you look ----
        float fCam = fogField(camPos.xz);
        float fog = fCam * .85;
        if (!sky) {
          vec4 v = invProj * vec4(uv * 2. - 1., raw * 2. - 1., 1.); v /= v.w;
          vec3 wp = (camWorld * v).xyz;
          float fPix = fogField(wp.xz);
          fog = max(max(fPix * smoothstep(1.5, 18., d0), fCam * smoothstep(2., 16., d0)), fPix * .35);
        }
        fog = clamp(fog * (.85 + noise(gl_FragCoord.xy * .015 + time * .06) * .3) * seeFar, 0., 1.);
        float bay = bayer(floor(gl_FragCoord.xy / 2.));
        // ---- ink lines (they blow out wider as dread rises) ----
        float e = 0.;
        if (!sky) {
          vec3 n0 = nrm(uv);
          vec2 o = width * (1. + dread * 1.3) / res;
          for (int i = 0; i < 4; i++) {
            vec2 dir = i == 0 ? vec2(1., 0.) : i == 1 ? vec2(-1., 0.) : i == 2 ? vec2(0., 1.) : vec2(0., -1.);
            vec2 suv = uv + dir * o;
            float d = lin(suv);
            e = max(e, smoothstep(.03, .06, (d - d0) / d0));
            if (useNormals > .5) e = max(e, smoothstep(.45, .7, 1. - dot(n0, nrm(suv))));
          }
          e *= 1. - smoothstep(60., 120., d0);
          e *= mix(1., step(fog * .95, bay), fog);   // in fog, the linework dissolves into dots
        }
        col = mix(col, ink, e * .92);
        // ---- fog is drawn as stipple and cross-hatching that swallows the design ----
        vec3 fogTint = mix(vec3(.66, .63, .58), vec3(.22, .2, .21), night);
        col = mix(col, fogTint, fog * .62);   // the fog itself: a soft haze
        float dk = smoothstep(.55, .9, dread);   // dots and hatching only come in at high dread
        vec2 fp = gl_FragCoord.xy;
        float stip = bay < fog * .85 ? 1. : 0.;
        float h1 = step(.8, fract((fp.x + fp.y) / 6.)) * smoothstep(.45, .6, fog);
        float h2 = step(.8, fract((fp.x - fp.y) / 6.)) * smoothstep(.7, .85, fog);
        float mark = max(stip * .75, max(h1, h2));
        col = mix(col, mix(vec3(.45, .42, .4), ink, .2 + night * .8), mark * .45 * dk);
        // ---- dread: colour drains, stippling spreads, ink creeps in from the edges ----
        float l = dot(col, vec3(.299, .587, .114));
        col = mix(col, vec3(l), dread * .85);
        col = mix(col, ink, (bay < dread * .45 ? 1. : 0.) * step(l, .6) * smoothstep(.6, .85, dread) * .6);
        vec2 q = (vUv - .5) * vec2(res.x / res.y, 1.);
        float edge = length(q) * 1.1 + (noise(vUv * 5. + time * .04) - .5) * .4;
        col = mix(col, ink, smoothstep(.0, .04, edge - (1.3 - dread * .8)));
        // The Stilled: negative space. No outline, no shading, no fog tint, only
        // a little of the fog's stipple nibbling at them so they're half seen.
        if (c4.a < .5) col = mix(c4.rgb, vec3(.55, .52, .48), mark * .35);
        col *= .96 + hash(floor(gl_FragCoord.xy / 2.)) * .06;           // paper grain
        gl_FragColor = vec4(col, 1.);
      }`,
    depthTest: false, depthWrite: false,
  });
  // Rebuild the fog map around a point (a few times a second).
  const fogHeights = new Map();
  let fogEnv = {};
  function updateFogMap(cx, cz, tt, lights) {
    const ox = Math.floor(cx / FOG_CELL) * FOG_CELL - FOG_SIZE / 2, oz = Math.floor(cz / FOG_CELL) * FOG_CELL - FOG_SIZE / 2;
    fogOrigin.set(ox, oz);
    if (fogHeights.size > 30000) fogHeights.clear();
    for (let j = 0; j < FOG_N; j++) for (let i = 0; i < FOG_N; i++) {
      const x = ox + (i + .5) * FOG_CELL, z = oz + (j + .5) * FOG_CELL, k = x + ',' + z;
      let h = fogHeights.get(k); if (h === undefined) { h = heightAt(x, z); fogHeights.set(k, h); }
      fogData[(j * FOG_N + i) * 4] = WG.fogAt(x, z, h, tt, lights, fogEnv) * 255;
    }
    fogTex.needsUpdate = true;
  }
  const inkScene = new THREE.Scene();
  inkScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), inkMat));
  const inkCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const noInk = new Set();   // things drawn with their own outlines (clouds), hidden from the normal pass

