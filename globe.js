/* ============================================================
   3 Boyutlu Dünya Haritası — Three.js gerçekçi interaktif küre
   ============================================================ */
(function () {
  "use strict";

  const TEX = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/";
  const R = 1;                       // dünya yarıçapı
  const canvas = document.getElementById("scene");

  // ---------- Renderer / Scene / Camera ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 1000);
  camera.position.set(0.4, 0.9, 3.0);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.55;
  controls.minDistance = 1.35;
  controls.maxDistance = 6.5;
  controls.enablePan = false;
  controls.zoomSpeed = 0.8;

  // ---------- Lighting ----------
  const sunDir = new THREE.Vector3(0.55, 0.28, 0.78).normalize();
  const sunLight = new THREE.DirectionalLight(0xfff4e6, 1.15);
  sunLight.position.copy(sunDir).multiplyScalar(6);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x16263f, 1.0));

  // ---------- Groups (axial tilt -> spin) ----------
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = -23.5 * Math.PI / 180;
  scene.add(tiltGroup);

  const spinGroup = new THREE.Group();
  spinGroup.rotation.y = -2.1;     // başlangıçta Avrupa/Afrika önde
  tiltGroup.add(spinGroup);

  // ---------- Loading manager ----------
  const loadPct = document.getElementById("loadPct");
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => {
    loadPct.textContent = Math.round((loaded / total) * 100) + "%";
  };
  manager.onLoad = () => {
    const l = document.getElementById("loader");
    l.classList.add("hide");
    setTimeout(() => l.remove(), 900);
  };
  manager.onError = (url) => console.error("[TEXTURE ERROR]", url);
  const loader = new THREE.TextureLoader(manager);
  const load = (f) => {
    const t = loader.load(TEX + f);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };

  const dayMap   = load("earth_atmos_2048.jpg");
  const nightMap = load("earth_lights_2048.png");
  const specMap  = load("earth_specular_2048.jpg");
  const cloudMap = load("earth_clouds_1024.png");

  // ---------- Earth (custom day/night shader) ----------
  const earthUniforms = {
    dayTexture:   { value: dayMap },
    nightTexture: { value: nightMap },
    specularMap:  { value: specMap },
    sunDirection: { value: sunDir.clone() }
  };

  const earthMat = new THREE.ShaderMaterial({
    uniforms: earthUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main(){
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      uniform sampler2D specularMap;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main(){
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(sunDirection);
        float diff = dot(N, L);

        vec3 day = texture2D(dayTexture, vUv).rgb;
        vec3 night = texture2D(nightTexture, vUv).rgb;

        // gündüz/gece geçişi (yumuşak terminatör)
        float t = smoothstep(-0.18, 0.30, diff);
        // hafif gün ışığı tonlaması
        vec3 lit = day * (0.25 + 0.95 * clamp(diff, 0.0, 1.0));
        vec3 col = mix(night * 1.7, lit, t);

        // okyanuslarda güneş parıltısı
        float water = texture2D(specularMap, vUv).r;
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 60.0) * water * smoothstep(0.0, 0.2, diff);
        col += vec3(0.45, 0.55, 0.62) * spec * 1.4;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), earthMat);
  spinGroup.add(earth);

  // ---------- Clouds ----------
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.012, 72, 72),
    new THREE.MeshPhongMaterial({
      color: 0xffffff,
      alphaMap: cloudMap,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      emissive: 0x223044,
      emissiveIntensity: 0.35
    })
  );
  spinGroup.add(clouds);

  // ---------- Atmosphere glow ----------
  const atmosMat = new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: sunDir.clone() }, glowColor: { value: new THREE.Color(0x4a9eff) } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main(){
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform vec3 glowColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main(){
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float rim = pow(1.0 - abs(dot(N, V)), 3.0);
        float day = smoothstep(-0.4, 0.55, dot(N, normalize(sunDirection)));
        float a = rim * (0.25 + 0.95 * day);
        gl_FragColor = vec4(glowColor, a);
      }
    `
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 64, 64), atmosMat);
  scene.add(atmosphere); // sahnede sabit (dönmez), kamera ile rim hesaplanır

  // ---------- Starfield ----------
  (function makeStars() {
    const N = 4200;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // küre yüzeyinde rastgele yön, büyük yarıçap
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u, phi = Math.acos(2 * v - 1);
      const r = 60 + Math.random() * 340;
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi);
      pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      const tone = Math.random();
      if (tone > 0.92) c.setHSL(0.58, 0.5, 0.85);
      else if (tone > 0.84) c.setHSL(0.09, 0.4, 0.82);
      else c.setHSL(0, 0, 0.6 + Math.random() * 0.4);
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.7, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    scene.add(new THREE.Points(g, m));
  })();

  // ---------- Marker (pin) ----------
  const markerGroup = new THREE.Group();
  markerGroup.visible = false;
  spinGroup.add(markerGroup);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0x7fd0ff })
  );
  markerGroup.add(dot);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.04, 40),
    new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  markerGroup.add(ring);
  let ringT = 0;

  // ---------- Coordinate helpers ----------
  function latLonToVec3(lat, lon, radius) {
    const latR = lat * Math.PI / 180;
    const u = (lon + 180) / 360;
    const phi = u * 2 * Math.PI;
    const cosLat = Math.cos(latR);
    return new THREE.Vector3(
      -Math.cos(phi) * cosLat,
       Math.sin(latR),
       Math.sin(phi) * cosLat
    ).multiplyScalar(radius);
  }
  function vec3ToLatLon(v) {
    const n = v.clone().normalize();
    const lat = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) * 180 / Math.PI;
    let phi = Math.atan2(n.z, -n.x);
    let u = phi / (2 * Math.PI);
    if (u < 0) u += 1;
    const lon = u * 360 - 180;
    return { lat, lon };
  }
  function nearestCountry(lat, lon) {
    let best = null, bestD = Infinity;
    for (const c of window.COUNTRY_CENTROIDS) {
      const dLat = (c.lat - lat);
      let dLon = (c.lon - lon);
      if (dLon > 180) dLon -= 360; if (dLon < -180) dLon += 360;
      // enlem ağırlıklı (boylam mesafesi enleme göre daralır)
      const k = Math.cos(((c.lat + lat) / 2) * Math.PI / 180);
      const d = dLat * dLat + (dLon * k) * (dLon * k);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { country: best, dist: Math.sqrt(bestD) };
  }
  function fmtCoord(v, pos, neg) {
    const dir = v >= 0 ? pos : neg;
    return Math.abs(v).toFixed(2) + "° " + dir;
  }
  function localTime(lon) {
    // boylama göre kabaca UTC ofseti
    const off = Math.round(lon / 15);
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const d = new Date(utc + off * 3600000);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const sign = off >= 0 ? "+" : "−";
    return `${hh}:${mm} (UTC${sign}${Math.abs(off)})`;
  }

  // ---------- Picking ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null, dragged = false;

  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
    dragged = false;
    canvas.classList.add("grabbing");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (down && (Math.abs(e.clientX - down.x) > 5 || Math.abs(e.clientY - down.y) > 5)) dragged = true;
  });
  canvas.addEventListener("pointerup", (e) => {
    canvas.classList.remove("grabbing");
    if (!down || dragged) { down = null; return; }
    down = null;
    pick(e.clientX, e.clientY);
  });

  const card = document.getElementById("card");
  const elName = document.getElementById("cardName");
  const elLat = document.getElementById("cardLat");
  const elLon = document.getElementById("cardLon");
  const elTime = document.getElementById("cardTime");
  const elEye = document.getElementById("cardEyebrow");
  const elFoot = document.getElementById("cardFoot");
  const pinLabel = document.getElementById("pinLabel");
  const pinTag = pinLabel.querySelector(".tag");

  function pick(px, py) {
    ndc.x = (px / window.innerWidth) * 2 - 1;
    ndc.y = -(py / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(earth, false);
    if (!hits.length) return;

    const worldPoint = hits[0].point.clone();
    const local = earth.worldToLocal(worldPoint.clone());
    const { lat, lon } = vec3ToLatLon(local);
    const { country, dist } = nearestCountry(lat, lon);

    // marker'ı yüzeye yerleştir (spinGroup yerel uzayında)
    const localSurface = latLonToVec3(lat, lon, R * 1.005);
    markerGroup.position.copy(localSurface);
    markerGroup.lookAt(localSurface.clone().multiplyScalar(2)); // ring yüzeye teğet
    markerGroup.visible = true;
    ringT = 0;

    // bilgi kartı
    const onLand = dist < 16; // merkeze uzaksa muhtemelen okyanus
    elEye.textContent = onLand ? "Ülke" : "Konum";
    elName.textContent = onLand ? country.name : "Açık Deniz";
    elLat.textContent = fmtCoord(lat, "K", "G");
    elLon.textContent = fmtCoord(lon, "D", "B");
    elTime.textContent = localTime(lon);
    elFoot.textContent = onLand
      ? `En yakın ülke merkezi baz alınmıştır. Başka bir noktaya tıklayarak keşfe devam edin.`
      : `Seçilen nokta bir kıtaya yakın değil. Kara parçalarına tıklayın.`;
    card.classList.add("show");

    pinTag.textContent = onLand ? country.name : "Açık Deniz";
  }

  // ---------- HUD buttons ----------
  let autoRotate = true;
  const btnRotate = document.getElementById("btnRotate");
  btnRotate.addEventListener("click", () => {
    autoRotate = !autoRotate;
    btnRotate.classList.toggle("active", autoRotate);
  });

  const btnClouds = document.getElementById("btnClouds");
  btnClouds.addEventListener("click", () => {
    clouds.visible = !clouds.visible;
    btnClouds.classList.toggle("active", !clouds.visible);
  });

  const btnReset = document.getElementById("btnReset");
  btnReset.addEventListener("click", () => {
    controls.reset();
    camera.position.set(0.4, 0.9, 3.0);
    card.classList.remove("show");
    markerGroup.visible = false;
    pinLabel.style.opacity = 0;
  });
  controls.saveState();

  // pause auto-rotate briefly after user interaction
  let resumeAt = 0;
  controls.addEventListener("start", () => { resumeAt = performance.now() + 4000; });

  // ---------- Label tracking ----------
  const tmp = new THREE.Vector3();
  const earthCenterW = new THREE.Vector3();
  const markerW = new THREE.Vector3();
  function updateLabel() {
    if (!markerGroup.visible) { pinLabel.style.opacity = 0; return; }
    markerGroup.getWorldPosition(markerW);
    earth.getWorldPosition(earthCenterW);
    // arka yüzde mi?
    const toCam = camera.position.clone().sub(earthCenterW).normalize();
    const toMark = markerW.clone().sub(earthCenterW).normalize();
    if (toCam.dot(toMark) < 0.12) { pinLabel.style.opacity = 0; return; }

    tmp.copy(markerW).project(camera);
    const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
    pinLabel.style.left = x + "px";
    pinLabel.style.top = y + "px";
    pinLabel.style.opacity = 1;
  }

  // ---------- Resize ----------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- Animate ----------
  const clock = new THREE.Clock();
  function tick() {
    const dt = clock.getDelta();
    const now = performance.now();

    if (autoRotate && now > resumeAt) {
      spinGroup.rotation.y += dt * 0.045;
    }
    clouds.rotation.y += dt * 0.012; // bulutlar biraz daha hızlı

    // ring nabız
    if (markerGroup.visible) {
      ringT += dt;
      const s = 1 + (ringT % 1.6) * 1.8;
      ring.scale.setScalar(s);
      ring.material.opacity = Math.max(0, 0.8 * (1 - (ringT % 1.6) / 1.6));
    }

    controls.update();
    updateLabel();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // hata ayıklama / tweak erişimi
  window.__globe = {
    scene, camera, controls, spinGroup, tiltGroup, earth, clouds, atmosphere,
    dayMap, nightMap, specMap, cloudMap, renderer,
    render: () => renderer.render(scene, camera),
    setSpin: (y) => { spinGroup.rotation.y = y; },
    stop: () => { autoRotate = false; }
  };
})();
