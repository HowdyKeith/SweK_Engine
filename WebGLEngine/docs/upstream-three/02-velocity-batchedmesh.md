# VelocityNode: a BatchedMesh's previous position never gets the instance's matrix

**three.js r185** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

Reading three's `velocity` through MRT, one render per browser frame, for a `BatchedMesh` whose one instance moves 0.3 a frame
reads its displacement from the bare geometry. A plain `Mesh` making the same motion reads it right.

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
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const run = async (forceWebGL) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    // three's velocity through MRT, as it is meant to be read
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType, count: 2 }); target.textures[0].name = "output"; target.textures[1].name = "velocity";
    renderer.setMRT(T.mrt({ output: T.output, velocity: T.velocity }));
    const material = () => { const m = new THREE.MeshBasicNodeMaterial(); m.blending = THREE.NoBlending; return m; };
    // velocity's mean over the pixels drawn, in pixels, after three frames -- one render per browser frame
    const velocityOf = async (scene, step) => {
        for (const k of [0, 1, 2]) { await frame(); step(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera); }
        const c = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 0), v = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 1); let n = 0, x = 0;
        for (let i = 0; i < D * D; i++) if (c[i * 4 + 3] > 0.5) { n++; x += v[i * 4] * D / 2; }
        return +(x / n).toFixed(3);
    };
    // the reference: a plain mesh moving 0.3 a frame -- three's velocity is right on it
    const plainMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material()), plainScene = new THREE.Scene(); plainScene.add(plainMesh);
    const plain = await velocityOf(plainScene, (k) => { plainMesh.position.x = -0.5 + 0.3 * k; plainMesh.updateMatrixWorld(); });
    const mesh = new THREE.BatchedMesh(1, 100, 300, material()), id = mesh.addInstance(mesh.addGeometry(new THREE.BoxGeometry(0.6, 0.6, 0.6)));
    mesh.frustumCulled = false; mesh.perObjectFrustumCulled = false; const scene = new THREE.Scene(); scene.add(mesh); const M = new THREE.Matrix4();
    const batched = await velocityOf(scene, (k) => { mesh.setMatrixAt(id, M.makeTranslation(-0.5 + 0.3 * k, 0, 0)); });
    renderer.dispose(); return { plain, batched };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
plain 5.612, batched 1.871 (px, both backends)
<!-- observed:end -->

## Expected

`batched` equal to `plain`.

## Cause

Verified by the patch below. `batch()` (`src/nodes/accessors/Batch.js`) assigns `positionLocal = batchingMatrix * positionLocal`
and leaves `positionPrevious` untouched, so the previous point is the geometry without any instance matrix: 1.871 px is the
instance's distance from the origin at the third frame (x = 0.1), where one frame's motion is 5.612. Nothing keeps the matrices
of the last draw to read.

## A patch

[`patches/02-batch-previous-matrices.diff`](patches/02-batch-previous-matrices.diff), a diff against three's `src/` at the r185 tag. When `needsPreviousData()`, a copy of the batch's matrices texture as it was at the last draw -- kept per batch, swapped in an `OnObjectUpdate`, re-made if the batch re-makes its texture -- is read by the same index and applied to `positionPrevious`. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
plain 5.612, batched 5.612 (px, both backends)
<!-- patched:end -->

## Paths the reproduction does not take

A batch grown by `setInstanceCount`, which re-makes its matrices texture, measured the same way, on r185's build and with the
patch:

<!-- paths:begin -->
a batch grown by setInstanceCount, its material then updated: r185 1.871 then 7.482, patched 5.612 then 5.612 (px, both backends)
<!-- paths:end -->

The patch makes its copy again at the new size and keeps the last draw's matrices -- the layout is linear, so they are its
first entries. three itself draws a grown batch from its old matrices texture until the batch's material is updated, which
is a separate report; the material is updated here.

## A fix that works in an application

SweK_Engine's motion stage (`render/temporalTsl.mjs`) keeps a copy of `_matricesTexture` as it was at the last draw, read by the same `indirectId`, applied to `positionPrevious`; its gates hold the result to a reference on both backends.
