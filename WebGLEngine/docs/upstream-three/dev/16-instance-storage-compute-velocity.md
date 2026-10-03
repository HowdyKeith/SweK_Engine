# InstancedMesh: velocity is wrong when a compute pass writes its storage instance matrices

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

An `InstancedMesh` whose `instanceMatrix` is a `StorageInstancedBufferAttribute` written by a compute pass -- as a GPU particle or crowd system writes them -- reports the wrong velocity under a velocity MRT: 1.496 px where a plain mesh making the same move reads 5.612. Written on the CPU (`setMatrixAt`), the same storage matrices are right in r186. WebGPU only: the WebGL 2 backend draws no `InstancedMesh` with storage matrices at all.

**Expected:** `storageCompute` equal to `plain`.

**Cause.** `instance()` (`src/nodes/accessors/Instance.js`) keeps the previous matrices as a copy of the attribute's CPU array, refreshed after each draw: `previousInstanceMatrix.array.set( matrices.array )` in an `OnAfterObjectUpdate`. A compute pass writes the GPU buffer and never the CPU array, so the copy holds the matrices as they were created -- the instance's previous position is wherever its first matrices put it, every frame. 1.496 px is that position's distance from where the instance is.

**Fix.** The patch keeps a storage matrix's previous matrices on the GPU. Before each draw, a copy of the last draw's matrices becomes the previous matrices and the matrices as they are now become the last draw's -- two buffer-to-buffer copies, ordered after the compute and before the draw. It adds `renderer.copyBufferToBuffer( src, dst )` for that (WebGPU `copyBufferToBuffer`, WebGL 2 `copyBufferSubData`), which creates each buffer, and uploads it if its CPU data changed, before copying. Non-storage matrices keep the CPU copy as before. It edits the same import line of `Instance.js` as the third-render issue's patch ("InstancedMesh past the uniform buffer"); applied together, that line imports `OnAfterObjectUpdate, OnBeforeObjectUpdate`. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/Instance.js b/src/nodes/accessors/Instance.js
index 2723fa9..fbfe9b8 100644
--- a/src/nodes/accessors/Instance.js
+++ b/src/nodes/accessors/Instance.js
@@ -1,6 +1,6 @@
 
 import { vec3, mat4, Fn } from '../tsl/TSLBase.js';
-import { OnAfterObjectUpdate, OnBeforeFrameUpdate } from '../utils/EventNode.js';
+import { OnAfterObjectUpdate, OnBeforeFrameUpdate, OnBeforeObjectUpdate } from '../utils/EventNode.js';
 import { normalLocal, transformNormal } from './Normal.js';
 import { positionLocal, positionPrevious } from './Position.js';
 import { varyingProperty } from '../core/PropertyNode.js';
@@ -210,20 +210,46 @@ export const instance = /*@__PURE__*/ Fn( ( [ matrices, colors = null ], builder
 
 		const instancedMesh = builder.object;
 
-		OnAfterObjectUpdate( ( { object } ) => {
+		if ( isStorageMatrix ) {
 
-			const { previousInstanceMatrix } = _previousInstanceMatrices.get( object );
+			// storage matrices may be written on the GPU -- by a compute pass -- where their CPU array never sees it, so
+			// the previous matrices are kept on the GPU: before each draw, the last draw's copy becomes the previous
+			// matrices, and the matrices as they are now become the last draw's
 
-			previousInstanceMatrix.array.set( matrices.array );
-			previousInstanceMatrix.version = matrices.version;
+			OnBeforeObjectUpdate( ( { object, renderer } ) => {
 
-			// handle interleaved path
+				const data = _previousInstanceMatrices.get( object );
 
-			const previousInterleavedMatrix = _matrixBuffers.get( previousInstanceMatrix );
+				if ( data.lastInstanceMatrix === undefined ) {
 
-			if ( previousInterleavedMatrix !== undefined ) previousInterleavedMatrix.version = matrices.version;
+					data.lastInstanceMatrix = matrices.clone();
+					renderer.copyBufferToBuffer( matrices, data.lastInstanceMatrix );
 
-		} );
+				}
+
+				renderer.copyBufferToBuffer( data.lastInstanceMatrix, data.previousInstanceMatrix );
+				renderer.copyBufferToBuffer( matrices, data.lastInstanceMatrix );
+
+			} );
+
+		} else {
+
+			OnAfterObjectUpdate( ( { object } ) => {
+
+				const { previousInstanceMatrix } = _previousInstanceMatrices.get( object );
+
+				previousInstanceMatrix.array.set( matrices.array );
+				previousInstanceMatrix.version = matrices.version;
+
+				// handle interleaved path
+
+				const previousInterleavedMatrix = _matrixBuffers.get( previousInstanceMatrix );
+
+				if ( previousInterleavedMatrix !== undefined ) previousInterleavedMatrix.version = matrices.version;
+
+			} );
+
+		}
 
 		const previousInstanceMatrixNode = getPreviousInstance( instancedMesh, matrices, builder );
 		positionPrevious.assign( previousInstanceMatrixNode.mul( positionPrevious ).xyz );
diff --git a/src/renderers/common/Backend.js b/src/renderers/common/Backend.js
index 6b31fbd..c6b9be0 100644
--- a/src/renderers/common/Backend.js
+++ b/src/renderers/common/Backend.js
@@ -373,6 +373,16 @@ class Backend {
 	 */
 	async copyTextureToBuffer( /*texture, x, y, width, height, faceIndex*/ ) {}
 
+	/**
+	 * Copies the data of one storage buffer attribute's GPU buffer into another's, on the GPU,
+	 * ordered after the work submitted before it and before the draws recorded after it.
+	 *
+	 * @abstract
+	 * @param {BufferAttribute} srcAttribute - The source attribute.
+	 * @param {BufferAttribute} dstAttribute - The destination attribute.
+	 */
+	copyBufferToBuffer( /*srcAttribute, dstAttribute*/ ) {}
+
 	/**
 	 * Copies data of the given source texture to the given destination texture.
 	 *
diff --git a/src/renderers/common/Renderer.js b/src/renderers/common/Renderer.js
index 678541a..c59c9ce 100644
--- a/src/renderers/common/Renderer.js
+++ b/src/renderers/common/Renderer.js
@@ -1,6 +1,7 @@
 import Animation from './Animation.js';
 import RenderObjects from './RenderObjects.js';
 import Attributes from './Attributes.js';
+import { AttributeType } from './Constants.js';
 import Geometries from './Geometries.js';
 import Info from './Info.js';
 import Pipelines from './Pipelines.js';
@@ -3243,6 +3244,23 @@ class Renderer {
 
 	}
 
+	/**
+	 * Copies the data of one storage buffer attribute into another, on the GPU. Each is created, and
+	 * uploaded if its CPU data changed, before the copy -- so a buffer a compute pass wrote and one the
+	 * CPU wrote are copied alike.
+	 *
+	 * @param {BufferAttribute} srcAttribute - The source attribute.
+	 * @param {BufferAttribute} dstAttribute - The destination attribute.
+	 */
+	copyBufferToBuffer( srcAttribute, dstAttribute ) {
+
+		this._attributes.update( srcAttribute, AttributeType.STORAGE );
+		this._attributes.update( dstAttribute, AttributeType.STORAGE );
+
+		this.backend.copyBufferToBuffer( srcAttribute, dstAttribute );
+
+	}
+
 	/**
 	 * Copies data of the given source texture into a destination texture.
 	 *
diff --git a/src/renderers/webgl-fallback/WebGLBackend.js b/src/renderers/webgl-fallback/WebGLBackend.js
index 4f109bf..05a851c 100644
--- a/src/renderers/webgl-fallback/WebGLBackend.js
+++ b/src/renderers/webgl-fallback/WebGLBackend.js
@@ -2200,6 +2200,28 @@ class WebGLBackend extends Backend {
 
 	}
 
+	/**
+	 * Copies the data of one storage buffer attribute's GPU buffer into another's, on the GPU,
+	 * in command order.
+	 *
+	 * @param {BufferAttribute} srcAttribute - The source attribute.
+	 * @param {BufferAttribute} dstAttribute - The destination attribute.
+	 */
+	copyBufferToBuffer( srcAttribute, dstAttribute ) {
+
+		const { gl } = this;
+
+		const src = this.get( this.getBufferAttribute( srcAttribute ) ).bufferGPU;
+		const dst = this.get( this.getBufferAttribute( dstAttribute ) ).bufferGPU;
+
+		gl.bindBuffer( gl.COPY_READ_BUFFER, src );
+		gl.bindBuffer( gl.COPY_WRITE_BUFFER, dst );
+		gl.copyBufferSubData( gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, Math.min( srcAttribute.array.byteLength, dstAttribute.array.byteLength ) );
+		gl.bindBuffer( gl.COPY_READ_BUFFER, null );
+		gl.bindBuffer( gl.COPY_WRITE_BUFFER, null );
+
+	}
+
 	/**
 	 * Copies data of the given source texture to the given destination texture.
 	 *
diff --git a/src/renderers/webgpu/WebGPUBackend.js b/src/renderers/webgpu/WebGPUBackend.js
index 1a0880a..6834e83 100644
--- a/src/renderers/webgpu/WebGPUBackend.js
+++ b/src/renderers/webgpu/WebGPUBackend.js
@@ -2962,6 +2962,26 @@ class WebGPUBackend extends Backend {
 
 	}
 
+	/**
+	 * Copies the data of one storage buffer attribute's GPU buffer into another's, on the GPU.
+	 * The copy is submitted at once: after the work already submitted, and before the render
+	 * pass being recorded, which is submitted when the render finishes.
+	 *
+	 * @param {BufferAttribute} srcAttribute - The source attribute.
+	 * @param {BufferAttribute} dstAttribute - The destination attribute.
+	 */
+	copyBufferToBuffer( srcAttribute, dstAttribute ) {
+
+		const src = this.get( this.getBufferAttribute( srcAttribute ) ).buffer;
+		const dst = this.get( this.getBufferAttribute( dstAttribute ) ).buffer;
+
+		const encoder = this.device.createCommandEncoder( { label: 'copyBufferToBuffer' } );
+		encoder.copyBufferToBuffer( src, 0, dst, 0, Math.min( src.size, dst.size ) );
+
+		this.device.queue.submit( [ encoder.finish() ] );
+
+	}
+
 	/**
 	 * Copies data of the given source texture to the given destination texture.
 	 *
```

</details>

**Until then:** Write the matrices on the CPU (`setMatrixAt`), or keep a copy of the last frame's matrices in a second storage buffer with a compute pass of your own and compute the velocity from it.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU and prints what it measured.
3. Compare `storageCompute` with `plain` and `storageCPU`.

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
    // a box moving 0.3 a frame in x, one render a frame: the mean x velocity over the pixels it covers after three frames
    const velocityOf = async (scene, step) => { try {
        for (let k = 0; k < 3; k++) { await frame(); await step(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera); }
        const c = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 0), v = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 1); let m = 0, x = 0;
        for (let i = 0; i < D * D; i++) if (c[i * 4 + 3] > 0.5) { m++; x += v[i * 4] * D / 2; }
        return m ? (x / m).toFixed(3) : "nothing drawn";
    } catch (e) { return "throws " + e.name + ": " + e.message; } };
    const box = () => new THREE.BoxGeometry(0.6, 0.6, 0.6), at = (k) => -0.5 + 0.3 * k;
    const mesh = new THREE.Mesh(box(), material()), s0 = new THREE.Scene(); s0.add(mesh);
    const plain = await velocityOf(s0, (k) => { mesh.position.x = at(k); mesh.updateMatrixWorld(); });
    // the same box as an InstancedMesh's one instance, its matrices in a storage buffer -- written on the CPU ...
    const cpu = new THREE.InstancedMesh(box(), material(), 1), s1 = new THREE.Scene(); s1.add(cpu);
    cpu.instanceMatrix = new THREE.StorageInstancedBufferAttribute(new Float32Array(16), 16);
    const storageCPU = await velocityOf(s1, (k) => { cpu.setMatrixAt(0, M.makeTranslation(at(k), 0, 0)); cpu.instanceMatrix.needsUpdate = true; });
    // ... and written by a compute pass, as a GPU particle or crowd system writes them
    const gpu = new THREE.InstancedMesh(box(), material(), 1), s2 = new THREE.Scene(); s2.add(gpu);
    const mats = new THREE.StorageInstancedBufferAttribute(new Float32Array(16), 16); gpu.instanceMatrix = mats;
    const x = T.uniform(0), node = T.storage(mats, "mat4", 1);
    const write = T.Fn(() => { node.element(0).assign(T.mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1)); })().compute(1);
    const storageCompute = await velocityOf(s2, async (k) => { x.value = at(k); await renderer.computeAsync(write); });
    renderer.dispose(); return { plain, storageCPU, storageCompute };
};
// WebGPU only: the WebGL 2 backend draws no InstancedMesh whose instanceMatrix is a storage buffer at all
report({ webgpu: await run(false) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
plain 5.612, storageCPU 5.612, storageCompute 1.496 -- the instance's mean x velocity in pixels (WebGPU)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
plain 5.612, storageCPU 5.612, storageCompute 5.612 -- the instance's mean x velocity in pixels (WebGPU)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
