# BatchedMesh: grown by setInstanceCount, it is drawn from its old matrices texture

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

A `BatchedMesh` whose instance count is grown by `setInstanceCount` -- which re-makes its matrices texture -- is drawn from then on as it was before it grew: `setMatrixAt` moves nothing. With the batch's material marked `needsUpdate` after the growth, it moves.

**Expected:** `grown` moving on after the growth, as `grownMaterialUpdated` does.

**Cause.** The render object's cache key holds the batch's matrices texture (`getMaterialCacheKey()` in `src/renderers/common/RenderObject.js`), but `RenderObjects.get()` compares the whole key only when the material's version or the dynamic key changes, and the dynamic key (`getDynamicCacheKey()`) holds nothing of the batch. `setInstanceCount` re-makes the texture, disposes the old one and copies the matrices over; the render object, never made again, keeps drawing from the old.

**Fix.** The patch adds the batch's matrices texture to the dynamic key, so a grown batch's render object is made again. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/renderers/common/RenderObject.js b/src/renderers/common/RenderObject.js
index b4d87d7..b0f16fa 100644
--- a/src/renderers/common/RenderObject.js
+++ b/src/renderers/common/RenderObject.js
@@ -2,7 +2,7 @@ import { hashArray, hashString } from '../../nodes/core/NodeUtils.js';
 
 let _id = 0;
 const _protoKeysCache = new WeakMap();
-const _cacheKeyValues = [ 0, 0, 0, 0, 0 ];
+const _cacheKeyValues = [ 0, 0, 0, 0, 0, 0 ];
 
 function getKeys( obj ) {
 
@@ -955,6 +955,10 @@ class RenderObject {
 		_cacheKeyValues[ 3 ] = this.renderer.contextNode.id;
 		_cacheKeyValues[ 4 ] = this.renderer.contextNode.version;
 
+		// a batch that grows re-makes its textures, and must be drawn from the new ones
+
+		_cacheKeyValues[ 5 ] = this.object.isBatchedMesh ? this.object._matricesTexture.id : 0;
+
 		return hashArray( _cacheKeyValues );
 
 	}
```

</details>

**Until then:** `batch.material.needsUpdate = true` after `setInstanceCount` grows the batch.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `grown` with `grownMaterialUpdated` from the third frame on.

### Code

```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js" } }</script>
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

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
grown [22.4, 28, 28, 28, 28], grownMaterialUpdated [22.4, 28, 33, 39, 44.5] -- the centre x of each frame's pixels, the batch grown before the third (both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
grown [22.4, 28, 33, 39, 44.5], grownMaterialUpdated [22.4, 28, 33, 39, 44.5] -- the centre x of each frame's pixels, the batch grown before the third (both backends)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
