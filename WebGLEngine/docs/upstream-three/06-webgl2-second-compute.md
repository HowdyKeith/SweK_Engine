# WebGL2 backend: only the first particle system's compute runs

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

With `forceWebGL: true`, two particle systems -- each its own `instancedArray` positions and velocities and its own `.compute()` -- stepped twice each: the first moves, the second's buffer stays as it was. On WebGPU both move.

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
    const N = 4, moved = [];
    for (let j = 0; j < 2; j++) {
        const pos = T.instancedArray(new Float32Array(N * 3), "vec3"), vel = T.instancedArray(new Float32Array(Array.from({ length: N * 3 }, (_, i) => (i % 3 === 0 ? 0.1 : 0))), "vec3");
        const step = T.Fn(() => { pos.element(T.instanceIndex).addAssign(vel.element(T.instanceIndex)); })().compute(N);
        await renderer.computeAsync(step); await renderer.computeAsync(step);
        const p = new Float32Array(await renderer.getArrayBufferAsync(pos.value)); moved.push(Math.abs(p[0] - 0.2) < 1e-5);
    }
    renderer.dispose(); return { moved };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
webgpu moved [true, true]; webgl2 moved [true, false]
<!-- observed:end -->

## Expected

both systems move on both backends.

## Cause

Verified by the patch below. `Pipelines.getForCompute` (`src/renderers/common/Pipelines.js`) caches the compute stage by its
shader code. On WebGL 2 the two systems' kernels compile to the same GLSL, so the second compute node gets the first's stage --
and the stage carries the buffers it binds by transform feedback (`transforms`, `nodeAttributes`), which
`WebGLBackend.createComputePipeline` binds: the second dispatch reads and writes the first system's buffers. On WebGPU the two
kernels compile to different WGSL, so each has its own stage.

## A patch

[`patches/06-webgl2-compute-stage-per-buffers.diff`](patches/06-webgl2-compute-stage-per-buffers.diff), a diff against three's `src/` at the r185 tag. A stage that binds buffers by transform feedback is cached by its code and the ids of the attribute nodes it binds; other stages are cached by code as before. A released stage is dropped from the cache by the same key. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
webgpu moved [true, true]; webgl2 moved [true, true]
<!-- patched:end -->

## A fix that works in an application

SweK_Engine's compute-particle gate (`render/temporalTslCompute-selfcheck.mjs`) gives each particle system a renderer of its own, so no stage is shared; it measures the bug on a shared renderer and goes red when three fixes it.
