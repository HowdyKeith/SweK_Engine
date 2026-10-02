# WebGLBackend: a compute writing a plain storage buffer reads every instanceIndex as 0

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

On the WebGL 2 backend, a compute whose output is a `StorageBufferAttribute` reads `instanceIndex` as 0 in every invocation. `computeSkinning` is one such compute: every vertex is skinned from the first vertex's position, skin indices and weights, so a box comes out as a single point. The same compute writing an `instancedArray` is right, and so is WebGPU either way.

**Expected:** `storageBuffer` 8 on both backends.

**Cause.** The WebGL backend runs a compute as a transform-feedback draw of points (`WebGLBackend.compute()` in `src/renderers/webgl-fallback/WebGLBackend.js`): `drawArraysInstanced( POINTS, 0, 1, count )` when its first buffer is a `StorageInstancedBufferAttribute`, otherwise `drawArrays( POINTS, 0, count )`. `GLSLNodeBuilder.getInstanceIndex()` always returns `gl_InstanceID`, which a draw that is not instanced holds at 0, so every read indexed by it reads element 0. The writes are transform-feedback outputs, one per point, so they land in the right places with the wrong values.

**Fix.** The patch reads a compute's `instanceIndex` (and `invocationLocalIndex`) as `gl_InstanceID + gl_VertexID`: in a compute drawn as points the instance is 0, in one drawn instanced the vertex is. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js b/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js
index 73ea390..4592b4b 100644
--- a/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js
+++ b/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js
@@ -1313,6 +1313,11 @@ ${ flowData.code }
 	 */
 	getInstanceIndex() {
 
+		// a compute is drawn as points -- instanced when its first buffer is instanced, as many points otherwise -- so its
+		// invocation is whichever of the two counts, the other being 0
+
+		if ( this.shaderStage === 'compute' ) return 'uint( gl_InstanceID + gl_VertexID )';
+
 		return 'uint( gl_InstanceID )';
 
 	}
@@ -1328,7 +1333,7 @@ ${ flowData.code }
 
 		const size = workgroupSize.reduce( ( acc, curr ) => acc * curr, 1 );
 
-		return `uint( gl_InstanceID ) % ${size}u`;
+		return `uint( gl_InstanceID + gl_VertexID ) % ${size}u`;
 
 	}
 
```

</details>

**Until then:** Write a compute's output to an `instancedArray` (a `StorageInstancedBufferAttribute`) rather than a `StorageBufferAttribute`, so the WebGL backend draws it instanced.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `storageBuffer` on the two backends.

### Code

```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
const run = async (forceWebGL) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    // a box at rest on one bone, skinned by a compute: its 24 vertices sit on the box's 8 corners
    const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), n = g.attributes.position.count;
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicNodeMaterial()); mesh.bind(new THREE.Skeleton([bone]));
    // how many distinct points the compute wrote, into a storage buffer or an instanced one
    const corners = async (out, attr) => {
        await renderer.computeAsync(T.Fn(() => { out.element(T.instanceIndex).assign(T.vec4(T.computeSkinning(mesh), 1)); })().compute(n));
        const f = new Float32Array(await renderer.getArrayBufferAsync(attr)), seen = new Set();
        for (let i = 0; i < n; i++) seen.add([0, 1, 2].map((c) => f[i * 4 + c].toFixed(3)).join());
        return seen.size;
    };
    const plain = new THREE.StorageBufferAttribute(n, 4), storageBuffer = await corners(T.storage(plain, "vec4", n), plain);
    const inst = T.instancedArray(n, "vec4"), instancedArray = await corners(inst, inst.value);
    renderer.dispose(); return { storageBuffer, instancedArray };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
webgpu: storageBuffer 8, instancedArray 8; webgl2: storageBuffer 1, instancedArray 8 -- the distinct points the compute wrote, of a box's 8 corners
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
webgpu: storageBuffer 8, instancedArray 8; webgl2: storageBuffer 8, instancedArray 8 -- the distinct points the compute wrote, of a box's 8 corners
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
