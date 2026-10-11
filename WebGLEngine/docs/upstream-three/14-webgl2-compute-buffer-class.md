# WebGL2 backend: a compute reads the first element of any buffer whose class differs from its output's

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

On the WebGL 2 backend, a compute that copies from a `StorageInstancedBufferAttribute` into a `StorageBufferAttribute` -- or
from a plain one into an instanced one -- reads the first element in every invocation. Both buffers of the same class copy
correctly, and so does WebGPU either way.

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
<!-- repro:end -->

## Observed

<!-- observed:begin -->
webgpu: instancedIntoPlain 1 2 3 4 5 6, plainIntoInstanced 1 2 3 4 5 6; webgl2: instancedIntoPlain 1 1 1 1 1 1, plainIntoInstanced 1 1 1 1 1 1 -- the x of each element the compute copied
<!-- observed:end -->

## Expected

`1 2 3 4 5 6` in all four.

## Cause

Verified by the patch below. The WebGL backend runs a compute as a transform-feedback draw of points
(`src/renderers/webgl-fallback/WebGLBackend.js`, `compute()`): instanced -- one point, `count` instances -- when its FIRST buffer
is a `StorageInstancedBufferAttribute`, otherwise `count` points. A buffer the compute reads (not through a PBO) is a vertex
attribute, and `_createVao()` gives it the divisor of its OWN class: an instanced buffer steps per instance, a plain one per
vertex. So in a draw of `count` points an instanced buffer holds at its first element, and in a draw of one point a plain
buffer does. Only buffers of the dispatch's class are read as they should be.

## A patch

[`patches/14-webgl2-compute-per-invocation.diff`](patches/14-webgl2-compute-per-invocation.diff), a diff against three's `src/` at the r185 tag. A compute is always one point and `count` instances, and its vertex array -- one of its own, under a key of its own -- steps every attribute once per instance, whatever the buffer's class. `instanceIndex`, which the GLSL builder reads as `gl_InstanceID`, is then the invocation in every compute, so [11](11-webgl2-compute-instance-index.md)'s reproduction is right with this patch alone as well. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
webgpu: instancedIntoPlain 1 2 3 4 5 6, plainIntoInstanced 1 2 3 4 5 6; webgl2: instancedIntoPlain 1 2 3 4 5 6, plainIntoInstanced 1 2 3 4 5 6 -- the x of each element the compute copied
<!-- patched:end -->

## A fix that works in an application

Give every buffer a WebGL 2 compute reads the same class as the one it writes: all `instancedArray` (`StorageInstancedBufferAttribute`),
or all `StorageBufferAttribute`.
