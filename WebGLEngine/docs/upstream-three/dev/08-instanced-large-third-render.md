# InstancedMesh past the uniform buffer: the second and third renders in a browser frame draw the first's matrices

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

An `InstancedMesh` of more instances than a uniform buffer holds (1024 matrices at 65536 bytes), rendered three times into one target in one browser frame, an instance moved before each render: the second and third renders draw it where the first put it. With one instance, each render draws it where it was put. (r185 drew the third where the second put it; r186 syncs once before the frame's first render instead.)

**Expected:** `many` drawn in all three thirds, as `one` is.

**Cause.** Past the uniform buffer, `instance()` (`src/nodes/accessors/Instance.js`) draws the matrices from an `InstancedInterleavedBuffer` over the attribute's array, and syncs that buffer's version with the attribute's in an `OnBeforeFrameUpdate` -- once per browser frame, before the frame's first render. A second or third render in the same frame finds the version already synced and uploads nothing, so it draws the matrices the first uploaded. Marking the attribute `DynamicDrawUsage`, which uploads it at every draw, draws it where it is (`manyDynamic`).

**Fix.** The patch syncs the version in an `OnBeforeObjectUpdate`: before each draw, and before its buffers are uploaded. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/Instance.js b/src/nodes/accessors/Instance.js
index 2723fa9..df3e544 100644
--- a/src/nodes/accessors/Instance.js
+++ b/src/nodes/accessors/Instance.js
@@ -1,6 +1,6 @@
 
 import { vec3, mat4, Fn } from '../tsl/TSLBase.js';
-import { OnAfterObjectUpdate, OnBeforeFrameUpdate } from '../utils/EventNode.js';
+import { OnAfterObjectUpdate, OnBeforeObjectUpdate } from '../utils/EventNode.js';
 import { normalLocal, transformNormal } from './Normal.js';
 import { positionLocal, positionPrevious } from './Position.js';
 import { varyingProperty } from '../core/PropertyNode.js';
@@ -172,10 +172,11 @@ export const instance = /*@__PURE__*/ Fn( ( [ matrices, colors = null ], builder
 
 	}
 
-	// Synchronization of dynamic buffer updates per frame.
+	// Synchronization of dynamic buffer updates before each draw, and before its buffers are uploaded: once a frame, the
+	// second and third renders of a frame drew the first's matrices
 	if ( interleavedMatrix !== null || interleavedColor !== null ) {
 
-		OnBeforeFrameUpdate( () => {
+		OnBeforeObjectUpdate( () => {
 
 			if ( interleavedMatrix !== null && interleavedMatrix.version !== matrices.version ) {
 
```

</details>

**Until then:** `mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage )` before the mesh is first drawn, or one render a browser frame.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `many` with `one`.

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
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType }), material = new THREE.MeshBasicNodeMaterial(), M = new THREE.Matrix4();
    let sameFrame = true;
    // the last instance put at x = +1, then 0, then -1, each rendered over the last without a clear in one browser frame, the
    // others scaled to nothing: the pixels drawn in the left, middle and right thirds -- all three if each render drew it where put
    const thrice = async (count, dynamic) => {
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material, count), scene = new THREE.Scene(); scene.add(mesh);
        if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, M.makeScale(0, 0, 0));
        const draw = async (x, clear) => { mesh.setMatrixAt(count - 1, M.makeTranslation(x, 0, 0)); mesh.instanceMatrix.needsUpdate = true;
            renderer.setRenderTarget(target); renderer.autoClear = clear; await renderer.renderAsync(scene, camera); renderer.autoClear = true; };
        await frame(); await draw(0, true);
        await frame(); const f = renderer.info.frame; await draw(1, true); await draw(0, false); await draw(-1, false); sameFrame = sameFrame && renderer.info.frame === f;
        const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D), thirds = [0, 0, 0];
        for (let p = 0; p < D * D; p++) if (px[p * 4 + 3] > 0.5) thirds[Math.min(2, Math.floor((p % D) / (D / 3)))]++;
        return thirds;
    };
    const one = await thrice(1, false), many = await thrice(5000, false), manyDynamic = await thrice(5000, true);
    renderer.dispose(); return { one, many, manyDynamic, sameFrame };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
one [142, 144, 142], many [0, 0, 142], manyDynamic [142, 144, 142] -- pixels in the left, middle and right thirds; the renders in one browser frame: true (both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
one [142, 144, 142], many [142, 144, 142], manyDynamic [142, 144, 142] -- pixels in the left, middle and right thirds; the renders in one browser frame: true (both backends)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
