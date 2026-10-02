# WebGLBackend: a storage buffer named without its count shares its attribute node's hash, and the compute never links

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

On the WebGL 2 backend, a compute that reads `storage( attribute, 'vec3' )` -- the count left to its default -- does not run: the program fails to link (`Two transform feedback varyings specify the same output variable`) and the output buffer keeps its zeros. The same compute with the count given, `storage( attribute, 'vec3', count )`, is right, and so is WebGPU either way.

**Expected:** `withoutCount` equal to `withCount` on both backends.

**Cause.** With `bufferCount` 0, `StorageBufferNode.getHash()` (`src/nodes/accessors/StorageBufferNode.js`) shares its hash among all nodes of the same buffer through `builder.globalCache`, keyed by the buffer. `BufferAttributeNode.getHash()` (`src/nodes/accessors/BufferAttributeNode.js`) does the same, through the same entry under the same key. On WebGL 2 a storage buffer is read through a `BufferAttributeNode` of that very buffer, so the two nodes find each other's entry and get one hash. The builder takes them for one node: the attribute is never declared, the storage node is built twice and registers its transform-feedback output twice, and `transformFeedbackVaryings` is handed the same varying twice.

**Fix.** The patch keeps a slot of its own for each of the two node classes in the buffer's shared entry, so a storage node and an attribute node of one buffer never share a hash. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/BufferAttributeNode.js b/src/nodes/accessors/BufferAttributeNode.js
index b80504a..30d93a3 100644
--- a/src/nodes/accessors/BufferAttributeNode.js
+++ b/src/nodes/accessors/BufferAttributeNode.js
@@ -173,14 +173,14 @@ class BufferAttributeNode extends InputNode {
 
 			if ( bufferData === undefined ) {
 
-				bufferData = {
-					node: this
-				};
+				bufferData = {};
 
 				builder.globalCache.setData( this.value, bufferData );
 
 			}
 
+			if ( bufferData.node === undefined ) bufferData.node = this;
+
 			id = bufferData.node.id;
 
 		} else {
diff --git a/src/nodes/accessors/StorageBufferNode.js b/src/nodes/accessors/StorageBufferNode.js
index e7ca04d..166446b 100644
--- a/src/nodes/accessors/StorageBufferNode.js
+++ b/src/nodes/accessors/StorageBufferNode.js
@@ -176,15 +176,18 @@ class StorageBufferNode extends BufferNode {
 
 			if ( bufferData === undefined ) {
 
-				bufferData = {
-					node: this
-				};
+				bufferData = {};
 
 				builder.globalCache.setData( this.value, bufferData );
 
 			}
 
-			id = bufferData.node.id;
+			// a BufferAttributeNode of the same buffer shares its hash through this entry too -- as it does on WebGL 2, where
+			// this node reads its buffer through one -- so each keeps a slot of its own, or the two nodes get one hash
+
+			if ( bufferData.storageNode === undefined ) bufferData.storageNode = this;
+
+			id = bufferData.storageNode.id;
 
 		} else {
 
```

</details>

**Until then:** Give `storage()` its count: `storage( attribute, type, attribute.count )`.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `withoutCount` with `withCount` on WebGL 2.

### Code

```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
// six vec3 elements, x = 1..6, copied by a compute into a buffer of vec4 -- the source named with its count, and without.
// Each on a renderer of its own: two computes of the same code on one WebGL 2 renderer meet a different bug.
const copied = async (forceWebGL, withCount) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const n = 6, src = new Float32Array(n * 3); for (let i = 0; i < n; i++) src[i * 3] = i + 1;
    const attr = new THREE.StorageBufferAttribute(src, 3), from = withCount ? T.storage(attr, "vec3", n) : T.storage(attr, "vec3");
    const outA = new THREE.StorageBufferAttribute(n, 4), to = T.storage(outA, "vec4", n);
    await renderer.computeAsync(T.Fn(() => { to.element(T.instanceIndex).assign(T.vec4(from.toReadOnly().element(T.instanceIndex), 1)); })().compute(n));
    const f = new Float32Array(await renderer.getArrayBufferAsync(outA));
    renderer.dispose(); return Array.from({ length: n }, (_, i) => f[i * 4]).join(" ");
};
const run = async (forceWebGL) => ({ withCount: await copied(forceWebGL, true), withoutCount: await copied(forceWebGL, false) });
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
webgpu: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6; webgl2: withCount 1 2 3 4 5 6, withoutCount 0 0 0 0 0 0 -- the x of each element the compute copied
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
webgpu: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6; webgl2: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6 -- the x of each element the compute copied
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
