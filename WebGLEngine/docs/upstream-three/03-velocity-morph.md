# VelocityNode: a morphed mesh's previous position is the unmorphed one

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

Reading three's `velocity` through MRT, one render per browser frame, for a `Mesh` whose relative morph target (+1 in x) has its
influence changing by 0.3 a frame -- the same motion as the plain mesh -- reads the displacement from the unmorphed geometry.

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
    const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), n = g.attributes.position.count, d = new Float32Array(n * 3); for (let i = 0; i < n; i++) d[i * 3] = 1;
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = true;
    const mesh = new THREE.Mesh(g, material()), scene = new THREE.Scene(); scene.add(mesh); mesh.morphTargetInfluences = [0];
    const morphed = await velocityOf(scene, (k) => { mesh.morphTargetInfluences[0] = -0.5 + 0.3 * k; });
    renderer.dispose(); return { plain, morphed };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
plain 5.612, morphed 1.871 (px, both backends)
<!-- observed:end -->

## Expected

`morphed` equal to `plain`.

## Cause

Verified by the patch below. `morphReference()` (`src/nodes/accessors/Morph.js`) morphs `positionLocal` by the current
influences; nothing keeps the influences of the last draw, and `positionPrevious` is left unmorphed: 1.871 px is the morphed
point's distance from the unmorphed one at the third frame (influence 0.1).

## A patch

[`patches/03-morph-previous-influences.diff`](patches/03-morph-previous-influences.diff), a diff against three's `src/` at the r185 tag. When `needsPreviousData()`, the base and influences of the last draw are kept per mesh (swapped in the existing `OnObjectUpdate`) and `positionPrevious` is morphed by them. Per-instance morphs (`morphTexture` on an `InstancedMesh`) are left as they are. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
plain 5.612, morphed 5.612 (px, both backends)
<!-- patched:end -->

## Paths the reproduction does not take

Several targets, absolute targets, and per-instance morphs, measured the same way, on r185's build and with the patch:

<!-- paths:begin -->
three relative targets, moving it in x and y: r185 14.801, 9.251, patched 5.551, 3.700 (px x, y, both backends)
the same as absolute targets: r185 14.801, 9.251, patched 5.551, 3.700 (px x, y, both backends)
per-instance morphs (an InstancedMesh's morphTexture): r185 1.871, patched 1.871 (px, both backends) -- not reached
<!-- paths:end -->

Per-instance morphs (`morphTexture` on an `InstancedMesh`) are left as they are: the patch morphs `positionPrevious` only
where a mesh has one set of influences.

## A fix that works in an application

SweK_Engine's motion stage (`render/temporalTsl.mjs`) keeps the influences as they were at the last draw, and `positionPrevious` morphed by them; its gates hold the result to a reference on both backends.
