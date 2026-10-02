# WebGL2 backend: a compute writing a plain storage buffer reads every instanceIndex as 0

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

On the WebGL 2 backend, a compute whose output is a `StorageBufferAttribute` reads `instanceIndex` as 0 in every invocation.
`computeSkinning` is one such compute: every vertex is skinned from the first vertex's position, skin indices and weights, so a
box comes out as a single point. The same compute writing an `instancedArray` is right, and so is WebGPU either way.

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
<!-- repro:end -->

## Observed

<!-- observed:begin -->
webgpu: storageBuffer 8, instancedArray 8; webgl2: storageBuffer 1, instancedArray 8 -- the distinct points the compute wrote, of a box's 8 corners
<!-- observed:end -->

## Expected

`storageBuffer` 8 on both backends.

## Cause

Verified by the patch below. The WebGL backend runs a compute as a transform-feedback draw of points
(`src/renderers/webgl-fallback/WebGLBackend.js`, `compute()`): `drawArraysInstanced( POINTS, 0, 1, count )` when its first
buffer is a `StorageInstancedBufferAttribute`, otherwise `drawArrays( POINTS, 0, count )`. `GLSLNodeBuilder.getInstanceIndex()`
always returns `gl_InstanceID`, which a non-instanced draw holds at 0, so every read indexed by it -- here the position, skin
index and skin weight `computeSkinning` reads from textures by `instanceIndex` -- reads element 0. The writes are transform-
feedback outputs, one per point, so they land in the right places with the wrong values.

## A patch

[`patches/11-webgl2-compute-invocation-index.diff`](patches/11-webgl2-compute-invocation-index.diff), a diff against three's `src/` at the r185 tag. In a compute, `instanceIndex` is `gl_InstanceID + gl_VertexID`: one of the two counts the invocation and the other is 0, whichever way the compute is drawn. `getInvocationLocalIndex()` read `gl_InstanceID` too and is changed the same way. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
webgpu: storageBuffer 8, instancedArray 8; webgl2: storageBuffer 8, instancedArray 8 -- the distinct points the compute wrote, of a box's 8 corners
<!-- patched:end -->

## Paths the reproduction does not take

`invocationLocalIndex`, which read `gl_InstanceID` too, in a compute of 128 writing a plain storage buffer, on r185's build and
with the patch:

<!-- paths:begin -->
invocationLocalIndex in a compute of 128 writing a plain storage buffer: r185 1, patched 64 distinct values on WebGL2; 64 on WebGPU, both builds
<!-- paths:end -->

The default workgroup is 64, so 64 distinct values is every invocation's own. A neighbouring fault this patch does not reach --
a buffer read as a vertex attribute is fetched by its own class, so one whose class differs from the dispatch's reads its first
element everywhere -- is [14](14-webgl2-compute-buffer-class.md)'s subject, and patch 14, which dispatches every compute
instanced, fixes this draft's reproduction by itself as well.

## A fix that works in an application

Write a compute's output to an `instancedArray` (a `StorageInstancedBufferAttribute`) rather than a `StorageBufferAttribute`, so the WebGL backend draws it instanced.
