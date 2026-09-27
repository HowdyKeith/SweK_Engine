# VelocityNode: an InstancedMesh's velocity ignores its previous instance matrix

**three.js r185** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

Rendering three's own `velocity` node (TSL) for an `InstancedMesh` whose instance moves 0.3 a frame reads the displacement from the **bare geometry**, not from the instance's previous placement. A plain `Mesh` making the same motion reads it right.

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
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material(), 1), scene = new THREE.Scene(); scene.add(mesh); const M = new THREE.Matrix4();
    const instanced = await velocityOf(scene, (k) => { mesh.setMatrixAt(0, M.makeTranslation(-0.5 + 0.3 * k, 0, 0)); mesh.instanceMatrix.needsUpdate = true; });
    renderer.dispose(); return { plain, instanced };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
plain 5.612, instanced 1.871 (px, both backends)
<!-- observed:end -->

## Expected

`instanced` equal to `plain` (5.612 px).

## Where it seems to come from

The instanced path (`instancedMesh()` in three.webgpu.js) registers `OnObjectUpdate` to copy `matrices.array` into `previousInstanceMatrix.array` before the draw. What reaches the GPU as the previous matrix reads like the identity: 1.871 px is exactly the current position's distance from the origin (x = 0.1 at the third frame), where 5.612 px is one frame's motion. This is a reading of the source, not a verified cause.

## A fix that works in an application

SweK_Engine's motion stage (`render/temporalTsl.mjs`) keeps the object's instance matrices as they were at its last draw (kept after the draw, e.g. in `updateAfter`), uploaded as the previous ones; its gates hold the result to a reference on both backends.
