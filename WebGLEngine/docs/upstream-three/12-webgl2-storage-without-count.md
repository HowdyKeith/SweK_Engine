# WebGL2 backend: a storage buffer named without its count gives its attribute node's hash, and the compute never links

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

On the WebGL 2 backend, a compute that reads `storage( attribute, 'vec3' )` -- the count left to its default -- does not run: the
program fails to link (`Two transform feedback varyings specify the same output variable`) and the output buffer keeps its
zeros. The same compute with the count given, `storage( attribute, 'vec3', count )`, is right, and so is WebGPU either way.

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
<!-- repro:end -->

## Observed

<!-- observed:begin -->
webgpu: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6; webgl2: withCount 1 2 3 4 5 6, withoutCount 0 0 0 0 0 0 -- the x of each element the compute copied
<!-- observed:end -->

## Expected

`withoutCount` equal to `withCount` on both backends.

## Cause

Verified by the patch below. With `bufferCount` 0, `StorageBufferNode.getHash()` (`src/nodes/accessors/StorageBufferNode.js`)
shares its hash among all nodes of the same buffer through `builder.globalCache`, keyed by the buffer: the first node to
ask stores itself as `{ node }`, and every later one takes that node's id. `BufferAttributeNode.getHash()`
(`src/nodes/accessors/BufferAttributeNode.js`) does the same, through the same entry under the same key. On WebGL 2 a storage
buffer is read through a `BufferAttributeNode` of that very buffer (`getAttributeData()`), so the two nodes find each
other's entry and get ONE hash. The builder takes them for one node: the attribute is never declared, the storage node is
built twice and registers its transform-feedback output twice, and `transformFeedbackVaryings` is handed the same varying
twice. With a count the storage node hashes by its own id and the two never meet.

## A patch

[`patches/12-storage-hash-own-slot.diff`](patches/12-storage-hash-own-slot.diff), a diff against three's `src/` at the r185 tag. The two nodes keep a slot each in the shared entry -- `node` for the attribute, `storageNode` for the storage buffer -- so nodes of one kind still share a hash and the two kinds no longer share one. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
webgpu: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6; webgl2: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6 -- the x of each element the compute copied
<!-- patched:end -->

Run on ONE renderer, the two computes of the reproduction generate the same code once the patch lets the second link, and
r185's WebGL 2 backend then keeps one compute stage for both -- [06](06-webgl2-second-compute.md)'s subject -- so the second
writes nothing; with patch 06 as well it is right. The reproduction gives each case a renderer of its own for that reason.

## A fix that works in an application

Give `storage()` its count: `storage( attribute, type, attribute.count )`. A `StorageBufferAttribute` passed with no type is given
its count by three already.
