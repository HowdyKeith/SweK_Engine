# SkinnedMesh: the pose follows the bones once per browser frame

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

A `SkinnedMesh` rendered twice in one browser frame, its bone moved between the renders, is drawn in the first render's pose
both times. A plain `Mesh` moved the same way is drawn where it was put. Rendering a scene more than once a frame is ordinary:
several views, a pass that renders it again, a capture loop that does not wait for `requestAnimationFrame`.

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
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType }), material = new THREE.MeshBasicNodeMaterial();
    let sameFrame = true;
    // the object put at x = +1 and rendered, then at x = -1 and rendered over it without a clear, in one browser frame: the pixels
    // drawn left and right of the centre -- both halves if each render drew the object where it was put
    const twice = async (scene, put) => {
        const draw = async (x, clear) => { put(x); renderer.setRenderTarget(target); renderer.autoClear = clear; await renderer.renderAsync(scene, camera); renderer.autoClear = true; };
        await frame(); await draw(0, true);
        await frame(); const f = renderer.info.frame; await draw(1, true); await draw(-1, false); sameFrame = sameFrame && renderer.info.frame === f;
        const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D); let left = 0, right = 0;
        for (let p = 0; p < D * D; p++) if (px[p * 4 + 3] > 0.5) { if (p % D < D / 2) left++; else right++; }
        return [left, right];
    };
    const plainMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material), plainScene = new THREE.Scene(); plainScene.add(plainMesh);
    const plain = await twice(plainScene, (x) => { plainMesh.position.x = x; plainMesh.updateMatrixWorld(); });
    // the same box as a SkinnedMesh of one bone carrying every vertex, the bone moved; and again, the skeleton updated by hand
    const skinnedOf = () => {
        const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), n = g.attributes.position.count;
        g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
        g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
        const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(g, material), scene = new THREE.Scene(); scene.add(bone); scene.add(mesh); mesh.bind(new THREE.Skeleton([bone]));
        return { scene, bone, mesh };
    };
    const a = skinnedOf(), skinned = await twice(a.scene, (x) => { a.bone.position.x = x; a.bone.updateMatrixWorld(true); });
    const b = skinnedOf(), skinnedUpdated = await twice(b.scene, (x) => { b.bone.position.x = x; b.bone.updateMatrixWorld(true); b.mesh.skeleton.update(); });
    renderer.dispose(); return { plain, skinned, skinnedUpdated, sameFrame };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
plain [142, 142], skinned [0, 142], skinnedUpdated [142, 142] -- pixels left and right of the centre; the renders in one browser frame: true (both backends)
<!-- observed:end -->

## Expected

`skinned` drawn in both halves, as `plain` is.

## Cause

Verified by the patch below. `skinning()` (`src/nodes/accessors/Skinning.js`) calls `skeleton.update()` -- which turns the
bones into `boneMatrices` -- in an `OnObjectUpdate` that runs it once per `frameId`, and `frameId` advances once per browser
frame of the renderer's animation loop, not once per render. The same test steps the previous bone matrices that velocity reads.
A plain mesh's previous matrix steps once per render (`VelocityNode` steps it in an `OBJECT` update, which runs for each object in each render), so a skinned
mesh's velocity also follows the frame while a plain mesh's follows the render. Updating the skeleton by hand before each
render draws it where it is (`skinnedUpdated`).

## A patch

[`patches/07-skinned-pose-every-render.diff`](patches/07-skinned-pose-every-render.diff), a diff against three's `src/` at the r185 tag. The test is keyed on the render (`renderId`) instead of the frame, so the pose is updated and the previous bone matrices step once per render -- as a plain mesh's previous matrix does. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
plain [142, 142], skinned [142, 142], skinnedUpdated [142, 142] -- pixels left and right of the centre; the renders in one browser frame: true (both backends)
<!-- patched:end -->

With two renders in one frame, against a plain mesh moved the same way (the velocity's x, in pixels, in each render):

<!-- paths:begin -->
two renders a frame, the bone moved before the frame: r185 5.612 then 5.612, patched 5.612 then 0.000, a plain mesh 5.612 then 0.000 (px x, both backends)
two renders a frame, the bone moved again between them: r185 5.612 then 5.612, patched 2.806 then 2.806, a plain mesh 2.806 then 2.806 (px x, both backends)
computed twice a frame, the bone moved 0.15 between: the second compute moved r185 0.000, patched 0.150 (x, both backends)
<!-- paths:end -->

r185 measures every render's velocity from the pose of the frame before, so a skin moved once in a frame shows that move in
both renders, where a plain mesh shows it only in the first. `computeSkinning` updates the skeleton under the same test, and
`renderer.compute` advances the render id as a render does, so the patch's second hunk makes a second compute in a frame
use the bones as they are.

Measured there and not changed by the patch: in r185, `computeSkinning` writes zeros on WebGPU while an MRT with velocity is
set, and on WebGL 2 every vertex reads the first vertex's position. Neither is this draft's subject.

## A fix that works in an application

Call `skeleton.update()` before each render the bones have moved for. SweK_Engine's motion stage (`render/temporalTsl.mjs`) updates each skeleton itself before each draw that asks for velocity, and steps its previous bones once per render of its own pass.
