# VelocityNode: a morphed mesh's previous position is the unmorphed one

**three.js r185** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

Rendering three's own `velocity` node for a `Mesh` whose relative morph target (+1 in x) has its influence changing by 0.3 a frame -- the same motion as the plain mesh -- reads the displacement from the unmorphed geometry.

## Reproduction

Save as an `.html` file and open it; it prints the numbers for both backends.

<!-- repro:begin -->
```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
const run = async (forceWebGL) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType });
    // draws three's own velocity node; returns its mean over the pixels drawn, in pixels, after three frames
    const material = () => { const m = new THREE.MeshBasicNodeMaterial(); m.fragmentNode = T.vec4(T.velocity, 0.0, 1.0); m.blending = THREE.NoBlending; return m; };
    const velocityOf = async (scene, step) => {
        for (const k of [0, 1, 2]) { step(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera); }
        const v = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D); let n = 0, x = 0;
        for (let i = 0; i < D * D; i++) if (v[i * 4 + 3] > 0.5) { n++; x += v[i * 4] * D / 2; }
        return +(x / n).toFixed(3);
    };
    // the reference: a plain mesh moving 0.3 a frame -- three's velocity is right on it
    const plainMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material()), plainScene = new THREE.Scene(); plainScene.add(plainMesh);
    const plain = await velocityOf(plainScene, (k) => { plainMesh.position.x = -0.5 + 0.3 * k; plainMesh.updateMatrixWorld(); });
    const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), n = g.attributes.position.count, d = new Float32Array(n * 3); for (let i = 0; i < n; i++) d[i * 3] = 1;
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = true;
    const mesh = new THREE.Mesh(g, material()), scene = new THREE.Scene(); scene.add(mesh); mesh.morphTargetInfluences = [0];
    const morphed = await velocityOf(scene, (k) => { mesh.morphTargetInfluences[0] = -0.5 + 0.3 * k; });
    renderer.dispose(); return { plain, morphed };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
plain 5.612, morphed 1.871 (px, both backends)
<!-- observed:end -->

## Expected

`morphed` equal to `plain`.

## Where it seems to come from

Nothing keeps the previous morph influences, and `positionPrevious` is taken before morphing, so the previous point is the unmorphed one.

## A fix that works in an application

SweK_Engine's motion stage (`render/temporalTsl.mjs`) keeps the influences as they were at the last draw, and `positionPrevious` morphed by them; its gates hold the result to a reference on both backends.
