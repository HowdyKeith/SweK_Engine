# InstancedMesh past the uniform buffer: the third render in a browser frame draws the second's matrices

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

An `InstancedMesh` of more instances than a uniform buffer holds (1024 matrices at 65536 bytes), rendered three times into one
target in one browser frame, an instance moved before each render: the third render draws it where the second put it. With one
instance, each render draws it where it was put.

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
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const run = async (forceWebGL) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType }), material = new THREE.MeshBasicNodeMaterial(), M = new THREE.Matrix4();
    let sameFrame = true;
    // the last instance put at x = +1, then 0, then -1, each rendered over the last without a clear in one browser frame, the
    // others scaled to nothing: the pixels drawn in the left, middle and right thirds -- all three if each render drew it where put
    const thrice = async (count, dynamic) => {
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material, count), scene = new THREE.Scene(); scene.add(mesh);
        if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, M.makeScale(0, 0, 0));
        const draw = async (x, clear) => { mesh.setMatrixAt(count - 1, M.makeTranslation(x, 0, 0)); mesh.instanceMatrix.needsUpdate = true;
            renderer.setRenderTarget(target); renderer.autoClear = clear; await renderer.renderAsync(scene, camera); renderer.autoClear = true; };
        await frame(); await draw(0, true);
        await frame(); const f = renderer.info.frame; await draw(1, true); await draw(0, false); await draw(-1, false); sameFrame = sameFrame && renderer.info.frame === f;
        const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D), thirds = [0, 0, 0];
        for (let p = 0; p < D * D; p++) if (px[p * 4 + 3] > 0.5) thirds[Math.min(2, Math.floor((p % D) / (D / 3)))]++;
        return thirds;
    };
    const one = await thrice(1, false), many = await thrice(5000, false), manyDynamic = await thrice(5000, true);
    renderer.dispose(); return { one, many, manyDynamic, sameFrame };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
one [142, 144, 142], many [0, 144, 142], manyDynamic [142, 144, 142] -- pixels in the left, middle and right thirds; the renders in one browser frame: true (both backends)
<!-- observed:end -->

## Expected

`many` drawn in all three thirds, as `one` is.

## Cause

Verified by the patch below. Past the uniform buffer (`getUniformBufferLimit()`), `instance()` (`src/nodes/accessors/Instance.js`)
draws the matrices from an `InstancedInterleavedBuffer` over the attribute's array, and syncs that buffer's version with the
attribute's in an `OnFrameUpdate` -- once a browser frame for each program -- which runs after the draw's attributes are
uploaded (`_geometries.updateForRender` before `_nodes.updateForRender`). So each render uploads what the last one synced: the
first render of a frame what the last frame synced, the second what the first did -- the array is shared, so either upload
carries the matrices as they are -- and the third finds nothing new and draws the second's. Marking the attribute
`DynamicDrawUsage`, which uploads it at every draw, draws it where it is (`manyDynamic`).

## A patch

[`patches/08-instanced-sync-before-upload.diff`](patches/08-instanced-sync-before-upload.diff), a diff against three's `src/` at the r185 tag. The version is synced in an `OnBeforeObjectUpdate`: before each draw, and before its buffers are uploaded. It changes the same import line of `Instance.js` as [01](01-velocity-instancedmesh.md)'s patch; applied together, that line is merged by hand. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
one [142, 144, 142], many [142, 144, 142], manyDynamic [142, 144, 142] -- pixels in the left, middle and right thirds; the renders in one browser frame: true (both backends)
<!-- patched:end -->

## A fix that works in an application

`mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)` before the mesh is first drawn, or one render a browser frame.
SweK_Engine's motion stage (`render/temporalTsl.mjs`) renders once a frame; `render/temporalTslMany-selfcheck.mjs` holds this
behaviour of three's.
