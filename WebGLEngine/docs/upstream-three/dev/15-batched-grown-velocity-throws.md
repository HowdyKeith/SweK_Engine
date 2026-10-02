# BatchedMesh: grown by setInstanceCount under a velocity MRT, every render throws `RangeError: offset is out of bounds`

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

A `BatchedMesh` rendered with an MRT that has a `velocity` output throws on every render after its instance count is grown with `setInstanceCount`: `RangeError: offset is out of bounds`. Before the growth it draws, and its velocity is a plain mesh's. New in r186 with the batch's previous matrices (#34100); r185 did not throw.

**Expected:** `atGrowth` and `after` equal to `plain`.

**Cause.** `batch()` (`src/nodes/accessors/Batch.js`) keeps a copy of the batch's matrices texture for the previous matrices, made once per batch at its size then (`getPreviousNode()`), and after each draw copies the current matrices into it: `previousMatricesTexture.image.data.set( object._matricesTexture.image.data )` in an `OnAfterObjectUpdate`. `setInstanceCount` re-makes the matrices texture larger; the copy stays the old size, and `set()` throws.

**Fix.** The patch makes the copy again at the new size when the batch's node is built again, the last draw's matrices kept as its first entries, and leaves the copy as it is until then. The new copy is marked for upload when it is made: without that, the growth frame's velocity read an empty texture. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/Batch.js b/src/nodes/accessors/Batch.js
index f0b2e65..dcf6370 100644
--- a/src/nodes/accessors/Batch.js
+++ b/src/nodes/accessors/Batch.js
@@ -81,11 +81,24 @@ function getPreviousNode( batchMesh, id ) {
 
 	let data = _previousBatchingMatrices.get( batchMesh );
 
-	if ( data === undefined ) {
+	const { image, format, type } = batchMesh._matricesTexture;
 
-		const { image, format, type } = batchMesh._matricesTexture;
+	// a batch that grew (setInstanceCount) has a larger matrices texture: its copy is made again at the new size, the last
+	// draw's matrices kept as its first entries
 
-		const previousMatricesTexture = new DataTexture( image.data.slice(), image.width, image.height, format, type );
+	if ( data === undefined || data.previousMatricesTexture.image.data.length !== image.data.length ) {
+
+		const array = image.data.slice();
+
+		if ( data !== undefined ) {
+
+			array.set( data.previousMatricesTexture.image.data.subarray( 0, Math.min( array.length, data.previousMatricesTexture.image.data.length ) ) );
+			data.previousMatricesTexture.dispose();
+
+		}
+
+		const previousMatricesTexture = new DataTexture( array, image.width, image.height, format, type );
+		previousMatricesTexture.needsUpdate = true;
 
 		data = {
 			previousMatricesTexture,
@@ -152,8 +165,13 @@ export const batch = /*@__PURE__*/ Fn( ( [ batchMesh ], builder ) => {
 		OnAfterObjectUpdate( ( { object } ) => {
 
 			const previousBatchData = _previousBatchingMatrices.get( object );
+			const previous = previousBatchData.previousMatricesTexture.image.data, current = object._matricesTexture.image.data;
+
+			// until the batch's node is built again at its new size, the copy is the old size and is left as it is
+
+			if ( previous.length !== current.length ) return;
 
-			previousBatchData.previousMatricesTexture.image.data.set( object._matricesTexture.image.data );
+			previous.set( current );
 			previousBatchData.previousMatricesTexture.needsUpdate = true;
 
 		} );
```

</details>

**Until then:** Construct the `BatchedMesh` with the instance count it will need, rather than growing it with `setInstanceCount`.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `atGrowth` and `after` with `plain`. (The page marks the batch's material for update after growing it, as the issue "BatchedMesh: grown by setInstanceCount, it is drawn from its old matrices texture" filed beside this one needs.)

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
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType, count: 2 }), M = new THREE.Matrix4();
    target.textures[0].name = "output"; target.textures[1].name = "velocity";
    renderer.setMRT(T.mrt({ output: T.output, velocity: T.velocity }));
    const material = () => { const m = new THREE.MeshBasicNodeMaterial(); m.blending = THREE.NoBlending; return m; };
    // a box moving 0.3 a frame in x, one render a frame: the mean x velocity over the pixels it covers after n frames, in pixels
    const velocityOf = async (scene, step, n) => { try {
        for (let k = 0; k < n; k++) { await frame(); step(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera); }
        const c = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 0), v = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 1); let m = 0, x = 0;
        for (let i = 0; i < D * D; i++) if (c[i * 4 + 3] > 0.5) { m++; x += v[i * 4] * D / 2; }
        return m ? (x / m).toFixed(3) : "nothing drawn";
    } catch (e) { return "throws " + e.name + ": " + e.message; } };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material()), scene = new THREE.Scene(); scene.add(mesh);
    const plain = await velocityOf(scene, (k) => { mesh.position.x = -0.5 + 0.3 * k; mesh.updateMatrixWorld(); }, 3);
    // the same box as a BatchedMesh's one instance; the batch grows (setInstanceCount) before the third frame, its material updated
    const grown = (n) => { const batch = new THREE.BatchedMesh(1, 100, 300, material()), id = batch.addInstance(batch.addGeometry(new THREE.BoxGeometry(0.6, 0.6, 0.6)));
        batch.frustumCulled = false; batch.perObjectFrustumCulled = false; const s = new THREE.Scene(); s.add(batch);
        return velocityOf(s, (k) => { if (k === 2) { batch.setInstanceCount(64); batch.material.needsUpdate = true; } batch.setMatrixAt(id, M.makeTranslation(-0.5 + 0.3 * k, 0, 0)); }, n); };
    const atGrowth = await grown(3), after = await grown(4);
    renderer.dispose(); return { plain, atGrowth, after };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
plain 5.612, atGrowth throws RangeError: offset is out of bounds, after throws RangeError: offset is out of bounds -- the batch's mean x velocity in pixels, grown before the third frame (both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
plain 5.612, atGrowth 5.612, after 5.612 -- the batch's mean x velocity in pixels, grown before the third frame (both backends)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
