# VelocityNode: an InstancedMesh's previous instance matrix is its current one

**three.js r185** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

Reading three's `velocity` through MRT, one render per browser frame, for an `InstancedMesh` whose instance moves 0.3 a frame
reads no motion at all with one instance, and twice the motion with 1100 -- past the uniform buffer, where the matrices are drawn
from an attribute. A plain `Mesh` making the same motion reads it right.

## Reproduction

Save as an `.html` file and open it; it prints the numbers for both backends.

<!-- repro:begin -->
```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const run = async (forceWebGL) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    // three's velocity through MRT, as it is meant to be read
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType, count: 2 }); target.textures[0].name = "output"; target.textures[1].name = "velocity";
    renderer.setMRT(T.mrt({ output: T.output, velocity: T.velocity }));
    const material = () => { const m = new THREE.MeshBasicNodeMaterial(); m.blending = THREE.NoBlending; return m; };
    // velocity's mean over the pixels drawn, in pixels, after three frames -- one render per browser frame
    const velocityOf = async (scene, step) => {
        for (const k of [0, 1, 2]) { await frame(); step(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera); }
        const c = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 0), v = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 1); let n = 0, x = 0;
        for (let i = 0; i < D * D; i++) if (c[i * 4 + 3] > 0.5) { n++; x += v[i * 4] * D / 2; }
        return +(x / n).toFixed(3);
    };
    // the reference: a plain mesh moving 0.3 a frame -- three's velocity is right on it
    const plainMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material()), plainScene = new THREE.Scene(); plainScene.add(plainMesh);
    const plain = await velocityOf(plainScene, (k) => { plainMesh.position.x = -0.5 + 0.3 * k; plainMesh.updateMatrixWorld(); });
    // the same motion as instance 0 of an InstancedMesh: one instance, and 1100 -- past the uniform buffer, so the matrices are an attribute
    const M = new THREE.Matrix4(), instancedOf = async (count) => {
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material(), count), scene = new THREE.Scene(); scene.add(mesh);
        for (let i = 1; i < count; i++) mesh.setMatrixAt(i, M.makeScale(0, 0, 0));
        return velocityOf(scene, (k) => { mesh.setMatrixAt(0, M.makeTranslation(-0.5 + 0.3 * k, 0, 0)); mesh.instanceMatrix.needsUpdate = true; });
    };
    const instanced = await instancedOf(1), many = await instancedOf(1100);
    renderer.dispose(); return { plain, instanced, many };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
plain 5.612, instanced 0.000, many 11.224 (px, both backends)
<!-- observed:end -->

## Expected

`instanced` and `many` equal to `plain`.

## Cause

Verified by the patch below. `instance()` (`src/nodes/accessors/Instance.js`) copies the current matrices into the previous ones
in an `OnObjectUpdate`, which runs as the object is drawn -- after the application has set this frame's matrices:

- within the uniform buffer (one instance here) the previous matrices the shader reads are this draw's own: 0 px;
- past it (1100 instances) they are drawn from an `InstancedInterleavedBuffer` made over the copy's array, which nothing marks
  for upload, so it keeps the matrices it was made with -- the first frame's: at the third frame, two frames' motion.

And a buffer marked in `OnObjectUpdate` reaches the GPU a draw late: the draw's attributes are uploaded
(`_geometries.updateForRender`) before its object events run (`_nodes.updateForRender`).

## A patch

[`patches/01-instance-previous-matrix.diff`](patches/01-instance-previous-matrix.diff), a diff against three's `src/` at the r185 tag. Each draw's matrices are kept and become the previous ones at the next draw, in an `OnBeforeObjectUpdate` so they are uploaded with it; the interleaved buffer made over them is marked for upload too. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
plain 5.612, instanced 5.612, many 5.612 (px, both backends)
<!-- patched:end -->

Drawn by the material itself rather than through MRT, the instanced mesh meets another bug first:
[04](04-velocity-outside-mrt.md).

## Paths the reproduction does not take

The matrices as a `StorageInstancedBufferAttribute` -- written on the CPU, and written by a compute pass -- measured the
same way (velocity through MRT, one render per browser frame), on r185's build and with the patch:

<!-- paths:begin -->
storage matrices written on the CPU: r185 11.224, patched 5.612 (px, WebGPU); WebGL2 draws the mesh in neither
storage matrices written by a compute pass: r185 1.496, patched 1.496 (px, WebGPU) -- not reached; WebGL2 throws in both
<!-- paths:end -->

A compute pass writes the matrices on the GPU, and the patch copies the CPU array, so it does not reach them: their previous
matrices would need a copy made on the GPU before the pass runs. On WebGL 2 neither build draws an `InstancedMesh` whose
matrices are a storage attribute.

## A fix that works in an application

SweK_Engine's motion stage (`render/temporalTsl.mjs`) keeps the object's instance matrices as they were at its last draw (kept after the draw, e.g. in `updateAfter`), uploaded as the previous ones; its gates hold the result to a reference on both backends.
