# BatchedMesh: grown by setInstanceCount, it is drawn from its old matrices texture

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

A `BatchedMesh` whose instance count is grown by `setInstanceCount` -- which re-makes its matrices texture -- is drawn from
then on as it was before it grew: `setMatrixAt` moves nothing. With the batch's material marked `needsUpdate` after the growth,
it moves.

## Reproduction

Save as an `.html` file and open it; it prints the numbers for both backends.

<!-- repro:begin -->
```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const run = async (forceWebGL) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType }), M = new THREE.Matrix4();
    // one instance moving 0.3 a frame; before the third frame the batch grows from 1 instance to 64: the centre (x, in pixels)
    // of what each frame draws
    const walk = async (updateMaterial) => {
        const batch = new THREE.BatchedMesh(1, 100, 300, new THREE.MeshBasicNodeMaterial()), id = batch.addInstance(batch.addGeometry(new THREE.BoxGeometry(0.6, 0.6, 0.6)));
        batch.frustumCulled = false; batch.perObjectFrustumCulled = false; const scene = new THREE.Scene(); scene.add(batch); const xs = [];
        for (let k = 0; k < 5; k++) {
            await frame();
            if (k === 2) { batch.setInstanceCount(64); if (updateMaterial) batch.material.needsUpdate = true; }
            batch.setMatrixAt(id, M.makeTranslation(-0.5 + 0.3 * k, 0, 0));
            renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera);
            const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D); let s = 0, n = 0;
            for (let p = 0; p < D * D; p++) if (px[p * 4 + 3] > 0.5) { s += p % D; n++; }
            xs.push(+(s / n).toFixed(1));
        }
        return xs;
    };
    const grown = await walk(false), grownMaterialUpdated = await walk(true);
    renderer.dispose(); return { grown, grownMaterialUpdated };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
grown [22.4, 28, 28, 28, 28], grownMaterialUpdated [22.4, 28, 33, 39, 44.5] -- the centre x of each frame's pixels, the batch grown before the third (both backends)
<!-- observed:end -->

## Expected

`grown` moving on after the growth, as `grownMaterialUpdated` does.

## Cause

Verified by the patch below. The render object's cache key holds the batch's matrices texture (`getMaterialCacheKey()` in
`src/renderers/common/RenderObject.js`), but `RenderObjects.get` compares the whole key only when the material's version or
the dynamic key changes (`needsUpdate`), and the dynamic key holds nothing of the batch. `setInstanceCount` re-makes the
texture, disposes the old one and copies the matrices over; the render object, never made again, keeps drawing from the old.

## A patch

[`patches/09-batched-texture-in-dynamic-key.diff`](patches/09-batched-texture-in-dynamic-key.diff), a diff against three's `src/` at the r185 tag. A batch's matrices texture is in the dynamic key, so a batch that grows is drawn by a render object made again. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
grown [22.4, 28, 33, 39, 44.5], grownMaterialUpdated [22.4, 28, 33, 39, 44.5] -- the centre x of each frame's pixels, the batch grown before the third (both backends)
<!-- patched:end -->

## A fix that works in an application

`batch.material.needsUpdate = true` after `setInstanceCount` grows the batch. SweK_Engine's motion stage
(`render/temporalTsl.mjs`) refuses a grown batch by name.
