// shipview.js — v1247
// Reusable 3D ship viewer for the space-sim connector panels (EVE / X4 / Starfield).
// mountShipView(container, opts) -> { setModel(url), setSpin(on), dispose() }
// Loads a .glb if opts.glbUrl is given (drop ship GLBs in GPU_Assets/ships/), else
// renders a stylised procedural ship so the panel always shows something. Uses the
// vendored three + GLTFLoader + OrbitControls. ES module; import from an HTML module
// script. Real EVE/X4 ship GLBs must be sourced separately (licensing) — point glbUrl
// at one when you have it.
import * as THREE from "/vendor/three/three.module.js";
import { GLTFLoader } from "/vendor/three/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "/vendor/three/jsm/controls/OrbitControls.js";

export function mountShipView(container, opts = {}) {
  const bg = opts.bg != null ? opts.bg : 0x04090d;
  let spin = opts.autoSpin !== false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(0, 1.1, 5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xafe6ff, 0x10202a, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0x6fb8ff, 0.5); fill.position.set(-4, 1, -3); scene.add(fill);
  scene.add(new THREE.AmbientLight(0x224455, 0.5));

  let pivot = null;
  const loader = new GLTFLoader();

  function clear() {
    if (!pivot) return;
    scene.remove(pivot);
    pivot.traverse(o => { if (o.geometry) o.geometry.dispose && o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()); } });
    pivot = null;
  }

  function frame(obj, target = 2.4) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = target / maxDim;
    obj.scale.setScalar(s);
    obj.position.sub(center.multiplyScalar(s));
  }

  function proceduralShip() {
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x9fb6c4, metalness: 0.7, roughness: 0.35 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x5ff0e6, metalness: 0.4, roughness: 0.3, emissive: 0x0a3a38, emissiveIntensity: 0.6 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x5fb8ff, emissive: 0x3a86ff, emissiveIntensity: 1.4 });
    // fuselage
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 2.6, 16), hullMat);
    body.rotation.z = Math.PI / 2; g.add(body);
    // nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 16), accentMat);
    nose.rotation.z = -Math.PI / 2; nose.position.x = 1.6; g.add(nose);
    // wings
    const wingGeo = new THREE.BoxGeometry(1.0, 0.06, 1.9);
    const wing = new THREE.Mesh(wingGeo, hullMat); wing.position.set(-0.2, 0, 0); g.add(wing);
    // engine glow
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 16), glowMat);
    eng.rotation.z = Math.PI / 2; eng.position.x = -1.35; g.add(eng);
    return g;
  }

  function setProcedural() {
    clear();
    pivot = new THREE.Group();
    pivot.add(proceduralShip());
    frame(pivot);
    scene.add(pivot);
  }

  function setModel(url) {
    if (!url) { setProcedural(); return; }
    loader.load(url, (gltf) => {
      clear();
      pivot = new THREE.Group();
      pivot.add(gltf.scene);
      frame(pivot);
      scene.add(pivot);
    }, undefined, () => { setProcedural(); });   // fall back on any load error
  }

  // v1249 — AVATAR MODE: a flying ship in space that reacts to energy / alerts /
  // impacts / incoming messages. Self-contained: looks alive with no inputs ("flying
  // through space is normal"). Enabled with opts.avatar.
  const avatar = !!opts.avatar;
  let energy = 0.5, alertLvl = "green", shudder = 0, dodgeY = 0, dodgeTargetY = 0, weave = 0;
  let shield = null, shieldFlash = 0; const orbs = []; let ufo = null; let autoT = 3 + Math.random() * 4;
  let stars = null;
  if (avatar) { spin = false; scene.background = new THREE.Color(0x02040a); stars = makeStars(); buildShield(); }

  function makeStars() {
    const N = 320, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = (Math.random() - 0.5) * 10; pos[i * 3 + 2] = -Math.random() * 50; }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.06, transparent: true, opacity: 0.9 }));
    scene.add(pts); return pts;
  }
  function buildShield() {
    shield = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(shield);
  }
  function spawnOrb(color) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10),
      new THREE.MeshStandardMaterial({ color: color || 0xffcf6b, emissive: color || 0xff8a3c, emissiveIntensity: 1.4 }));
    o.position.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.0, -22);
    scene.add(o); orbs.push(o); return o;
  }
  function spawnUfo() {
    if (ufo) return;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.16, 18), new THREE.MeshStandardMaterial({ color: 0x9aa6b0, metalness: 0.6, roughness: 0.4 })));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5fffa0, emissive: 0x1f8a4a, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }));
    dome.position.y = 0.08; g.add(dome);
    g.position.set(-7, 2.4, -12); scene.add(g); ufo = g;
  }
  function doImpact() { shieldFlash = Math.max(shieldFlash, 0.85); shudder = Math.max(shudder, 0.5); }

  function updateAvatar() {
    const t = performance.now() / 1000;
    if (stars) {
      const sp = 0.12 + energy * 0.6, p = stars.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { p[i + 2] += sp; if (p[i + 2] > 4) { p[i] = (Math.random() - 0.5) * 16; p[i + 1] = (Math.random() - 0.5) * 10; p[i + 2] = -50; } }
      stars.geometry.attributes.position.needsUpdate = true;
    }
    if (pivot) {
      const bob = Math.sin(t * 1.4) * 0.12;
      const erratic = (alertLvl === "yellow") ? Math.sin(t * 7) * 0.25 + (Math.random() - 0.5) * 0.05 : 0;
      weave += (((alertLvl === "yellow") ? Math.sin(t * 2.3) * 0.4 : 0) - weave) * 0.05;
      dodgeY += (dodgeTargetY - dodgeY) * 0.08;
      const sh = shudder > 0 ? (Math.random() - 0.5) * shudder * 0.3 : 0; if (shudder > 0) shudder *= 0.86;
      pivot.position.y = bob + dodgeY + sh;
      pivot.position.x = sh * 0.5;
      pivot.rotation.z = erratic;
      pivot.rotation.y = -Math.PI / 2 + weave;
      pivot.rotation.x = -energy * 0.12 + sh * 0.2;
    }
    if (shield) { if (shieldFlash > 0) { shieldFlash *= 0.88; if (shieldFlash < 0.02) shieldFlash = 0; } shield.material.opacity = shieldFlash; shield.scale.setScalar(1 + shieldFlash * 0.15); if (pivot) shield.position.copy(pivot.position); }
    if (alertLvl === "red" && Math.random() < 0.012) doImpact();
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i]; o.position.z += 0.18 + energy * 0.25;
      if (o.position.z > -4.2 && o.position.z < -1.8) dodgeTargetY = (o.position.y > 0 ? -1 : 1) * 1.1;
      if (o.position.z > 5) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); orbs.splice(i, 1); if (!orbs.length) dodgeTargetY = 0; }
    }
    if (ufo) { ufo.position.x += 0.03; ufo.rotation.y += 0.06; if (Math.random() < 0.02) spawnOrb(0x5fffa0); if (ufo.position.x > 8) { scene.remove(ufo); ufo = null; } }
    autoT -= 0.016; if (autoT <= 0) { autoT = 5 + Math.random() * 8; if (Math.random() < 0.82) spawnOrb(0xffcf6b); else spawnUfo(); }
  }

  function resize() {
    const w = container.clientWidth || 280, h = container.clientHeight || 200;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
  }
  const ro = ("ResizeObserver" in window) ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container); else addEventListener("resize", resize);
  resize();

  let raf = 0, alive = true;
  function tick() {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    if (spin && pivot) pivot.rotation.y += 0.008;
    if (avatar) updateAvatar();
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  // initial content
  setModel(opts.glbUrl);

  return {
    setModel,
    setSpin(on) { spin = !!on; },
    setEnergy(v) { energy = Math.max(0, Math.min(1, +v || 0)); },          // 0..1 liveliness/speed
    setAlert(level) { alertLvl = (level === "red" || level === "yellow") ? level : "green"; },
    impact() { doImpact(); },                                              // shield flash + shudder
    incoming() { spawnOrb(0xffcf6b); },                                    // a message to dodge
    ufo() { spawnUfo(); },                                                 // UFO flyby
    dispose() { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); clear(); renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); },
  };
}
