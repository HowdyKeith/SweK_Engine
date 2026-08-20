// v1258 (#6) — shared FPS reference scene. Builds the same grid + landmark cubes
// into any three scene, using a fixed seed so the controller (fpscontrol.html) and
// the browser mirror (fpsmirror.html) render the IDENTICAL world — only the camera
// pose differs (one authoritative, one mirrored from /fps/state).
//
// import { buildFpsScene } from "./fpsScene.js";  buildFpsScene(THREE, scene);

// deterministic PRNG so both surfaces lay out cubes identically
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFpsScene(THREE, scene, opts) {
  opts = opts || {};
  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1018, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(6, 12, 4); scene.add(key);

  const grid = new THREE.GridHelper(120, 120, 0x244a66, 0x152c3e); scene.add(grid);

  const cols = [0x4fd08a, 0x5fb0ff, 0xffb454, 0xff6f8b, 0xb98bff];
  const mat = (h) => new THREE.MeshStandardMaterial({ color: h, roughness: 0.7, metalness: 0.1 });
  const rnd = mulberry32(opts.seed != null ? opts.seed : 1337);
  const n = opts.count != null ? opts.count : 40;
  for (let i = 0; i < n; i++) {
    const s = 0.6 + rnd() * 2.4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat(cols[i % cols.length]));
    m.position.set((rnd() - 0.5) * 90, s / 2, (rnd() - 0.5) * 90);
    scene.add(m);
  }
  return scene;
}
