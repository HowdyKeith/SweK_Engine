# WebGLBackend: a compute reads the first element of any buffer whose class differs from its first buffer's

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

On the WebGL 2 backend, a compute that copies from a `StorageInstancedBufferAttribute` into a `StorageBufferAttribute` -- or from a plain one into an instanced one -- reads the first element in every invocation. Both buffers of the same class copy correctly, and so does WebGPU either way.

**Expected:** `1 2 3 4 5 6` in all four.

**Cause.** The WebGL backend runs a compute as a transform-feedback draw of points (`WebGLBackend.compute()`): instanced -- one point, `count` instances -- when its first buffer is a `StorageInstancedBufferAttribute`, otherwise `count` points. A buffer the compute reads (not through a PBO) is a vertex attribute, and `WebGLVertexArrayUtils._createVAO()` gives it the divisor of its own class: an instanced buffer steps per instance, a plain one per vertex. So in a draw of `count` points an instanced buffer holds at its first element, and in a draw of one point a plain buffer does.

**Fix.** The patch draws every compute as one point and `count` instances, from a vertex array of its own whose every attribute steps once per instance. `instanceIndex`, which the GLSL builder reads as `gl_InstanceID`, is then the invocation in every compute, so the plain-storage-buffer issue filed beside this one ("a compute writing a plain storage buffer reads every instanceIndex as 0") is fixed by this patch alone as well. Against `dev` at 576b084; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/renderers/webgl-fallback/WebGLBackend.js b/src/renderers/webgl-fallback/WebGLBackend.js
index 4f109bf..6d63d74 100644
--- a/src/renderers/webgl-fallback/WebGLBackend.js
+++ b/src/renderers/webgl-fallback/WebGLBackend.js
@@ -940,7 +940,9 @@ class WebGLBackend extends Backend {
 
 		const { programGPU, transformBuffers, attributes } = this.get( pipeline );
 
-		const vaoGPU = this.vertexArrayUtils.getVAO( pipeline, attributes );
+		// a compute reads every buffer once per invocation, whatever the buffer's class
+
+		const vaoGPU = this.vertexArrayUtils.getVAO( pipeline, attributes, true );
 
 		state.setVertexState( vaoGPU );
 
@@ -969,15 +971,10 @@ class WebGLBackend extends Backend {
 
 		}
 
-		if ( attributes[ 0 ].isStorageInstancedBufferAttribute ) {
-
-			gl.drawArraysInstanced( gl.POINTS, 0, 1, count );
-
-		} else {
-
-			gl.drawArrays( gl.POINTS, 0, count );
+		// one point, an instance per invocation: every attribute steps once per instance (see WebGLVertexArrayUtils), and
+		// instanceIndex is gl_InstanceID whichever class the first buffer is
 
-		}
+		gl.drawArraysInstanced( gl.POINTS, 0, 1, count );
 
 		gl.endTransformFeedback();
 		gl.bindTransformFeedback( gl.TRANSFORM_FEEDBACK, null );
diff --git a/src/renderers/webgl-fallback/utils/WebGLVertexArrayUtils.js b/src/renderers/webgl-fallback/utils/WebGLVertexArrayUtils.js
index 46bf163..60fcbf7 100644
--- a/src/renderers/webgl-fallback/utils/WebGLVertexArrayUtils.js
+++ b/src/renderers/webgl-fallback/utils/WebGLVertexArrayUtils.js
@@ -38,9 +38,10 @@ class WebGLVertexArrayUtils {
 	 *
 	 * @param {RenderObject|ComputePipeline} owner - The render object or compute pipeline using the VAO.
 	 * @param {Array<BufferAttribute>} attributes - An array of buffer attributes.
+	 * @param {boolean} [perInvocation=false] - Whether every attribute steps once per instance, as a compute reads them.
 	 * @return {WebGLVertexArrayObject} The VAO.
 	 */
-	getVAO( owner, attributes ) {
+	getVAO( owner, attributes, perInvocation = false ) {
 
 		const backend = this.backend;
 		const ownerData = backend.get( owner );
@@ -69,6 +70,10 @@ class WebGLVertexArrayUtils {
 
 		}
 
+		// a compute's VAO steps every attribute per instance, so it is not shared with a draw's
+
+		if ( perInvocation === true ) key += ':compute';
+
 		// get cache entry
 
 		let entry = this.cache.get( key );
@@ -97,7 +102,7 @@ class WebGLVertexArrayUtils {
 
 		if ( vaoGPU === undefined ) {
 
-			vaoGPU = this._createVAO( attributes );
+			vaoGPU = this._createVAO( attributes, perInvocation );
 
 			entry.vaos.set( variant, vaoGPU );
 
@@ -210,9 +215,10 @@ class WebGLVertexArrayUtils {
 	 *
 	 * @private
 	 * @param {Array<BufferAttribute>} attributes - An array of buffer attributes.
+	 * @param {boolean} [perInvocation=false] - Whether every attribute steps once per instance, as a compute reads them.
 	 * @return {WebGLVertexArrayObject} The VAO.
 	 */
-	_createVAO( attributes ) {
+	_createVAO( attributes, perInvocation = false ) {
 
 		const { gl, state } = this.backend;
 
@@ -252,7 +258,11 @@ class WebGLVertexArrayUtils {
 
 			}
 
-			if ( attribute.isInstancedBufferAttribute && ! attribute.isInterleavedBufferAttribute ) {
+			if ( perInvocation === true ) {
+
+				gl.vertexAttribDivisor( i, 1 );
+
+			} else if ( attribute.isInstancedBufferAttribute && ! attribute.isInterleavedBufferAttribute ) {
 
 				gl.vertexAttribDivisor( i, attribute.meshPerAttribute );
 
```

</details>

**Until then:** Give every buffer a WebGL 2 compute reads the same class as the one it writes: all `instancedArray`, or all `StorageBufferAttribute`.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare the WebGL 2 copies with the WebGPU ones.

### Code

```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
// six elements, x = 1..6, copied by a compute -- from an instanced buffer into a plain one, and from a plain one into an
// instanced one -- each on a renderer of its own (two computes of one code on one WebGL 2 renderer meet another bug)
const copied = async (forceWebGL, fromInstanced) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const n = 6, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a[i * 4] = i + 1;
    const Src = fromInstanced ? THREE.StorageInstancedBufferAttribute : THREE.StorageBufferAttribute, Out = fromInstanced ? THREE.StorageBufferAttribute : THREE.StorageInstancedBufferAttribute;
    const from = T.storage(new Src(a, 4), "vec4", n).toReadOnly(), outA = new Out(n, 4), to = T.storage(outA, "vec4", n);
    await renderer.computeAsync(T.Fn(() => { to.element(T.instanceIndex).assign(from.element(T.instanceIndex)); })().compute(n));
    const f = new Float32Array(await renderer.getArrayBufferAsync(outA));
    renderer.dispose(); return Array.from({ length: n }, (_, i) => f[i * 4]).join(" ");
};
const run = async (forceWebGL) => ({ instancedIntoPlain: await copied(forceWebGL, true), plainIntoInstanced: await copied(forceWebGL, false) });
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 576b084 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
webgpu: instancedIntoPlain 1 2 3 4 5 6, plainIntoInstanced 1 2 3 4 5 6; webgl2: instancedIntoPlain 1 1 1 1 1 1, plainIntoInstanced 1 1 1 1 1 1 -- the x of each element the compute copied
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
webgpu: instancedIntoPlain 1 2 3 4 5 6, plainIntoInstanced 1 2 3 4 5 6; webgl2: instancedIntoPlain 1 2 3 4 5 6, plainIntoInstanced 1 2 3 4 5 6 -- the x of each element the compute copied
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
