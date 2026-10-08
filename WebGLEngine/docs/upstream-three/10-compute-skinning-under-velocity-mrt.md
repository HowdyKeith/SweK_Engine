# computeSkinning under a velocity MRT: the compute shader names positionPrevious and never runs

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

A `computeSkinning` compute built while the renderer's MRT has a `velocity` output -- as it does in any application drawing
motion vectors -- writes nothing on WebGPU. The same compute built with no MRT set writes the skinned positions. Nothing is
reported but an uncaptured validation error: the shader does not compile, so the compute pass never runs and its buffer keeps
its zeros.

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
    // a box carried by one bone at x = 0.5, skinned by a compute into a buffer of its own
    const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), n = g.attributes.position.count;
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicNodeMaterial()); mesh.bind(new THREE.Skeleton([bone]));
    bone.position.x = 0.5; bone.updateMatrixWorld(true);
    // the mean x the compute wrote: 0.5 where it ran
    const skinnedX = async () => {
        const out = T.instancedArray(n, "vec4");
        await renderer.computeAsync(T.Fn(() => { out.element(T.instanceIndex).assign(T.vec4(T.computeSkinning(mesh), 1)); })().compute(n));
        const f = new Float32Array(await renderer.getArrayBufferAsync(out.value)); let x = 0; for (let i = 0; i < n; i++) x += f[i * 4];
        return +(x / n).toFixed(3);
    };
    renderer.setMRT(null); const noMRT = await skinnedX();
    // the same compute, built while the renderer's MRT has a velocity output -- as it does in an application drawing motion vectors
    renderer.setMRT(T.mrt({ output: T.output, velocity: T.velocity })); const velocityMRT = await skinnedX();
    renderer.dispose(); return { noMRT, velocityMRT };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
webgpu: noMRT 0.5, velocityMRT 0; webgl2: noMRT 0.5, velocityMRT 0.5 -- the mean x the compute wrote, the bone at 0.5
<!-- observed:end -->

## Expected

`velocityMRT` equal to `noMRT` on both backends.

## Cause

Verified by the patch below. `computeSkinning` (`src/nodes/accessors/Skinning.js`) builds the previous skinned position when
`builder.needsPreviousData()`, and assigns it to `positionPrevious`. `needsPreviousData()` (`src/nodes/core/NodeBuilder.js`)
asks only whether the renderer's MRT has a `velocity` output, or the object wants velocity -- not whether this build is a
render. For a compute it is true whenever the MRT is, and the WGSL names `positionPrevious`, which a compute shader does not
declare: `unresolved value 'positionPrevious'`, the pipeline invalid, the pass skipped. The GLSL a compute becomes on WebGL 2
declares it, so the same build runs there.

## A patch

[`patches/10-compute-needs-no-previous-data.diff`](patches/10-compute-needs-no-previous-data.diff), a diff against three's `src/` at the r185 tag. `needsPreviousData()` is false for a compute build: a compute pass draws nothing, so it has no motion to measure. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
webgpu: noMRT 0.5, velocityMRT 0.5; webgl2: noMRT 0.5, velocityMRT 0.5 -- the mean x the compute wrote, the bone at 0.5
<!-- patched:end -->

## A fix that works in an application

Clear the MRT around the compute's first run -- `renderer.setMRT( null )`, compute, then set it back -- so it is built without the velocity output.
