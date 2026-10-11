# VelocityNode drawn outside MRT: the previous positions are never built

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

Three's `velocity` node drawn by the material itself -- `material.fragmentNode = vec4( velocity, 0, 1 )`, say, rather than read
through `mrt( { velocity } )` -- reads a `SkinnedMesh`'s motion from the geometry without its bones. The same mesh read through
MRT is right, rendered once per browser frame; rendered three times in one browser frame, it reads no motion.

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
    const D = 64, single = new THREE.RenderTarget(D, D, { type: THREE.FloatType }), pair = new THREE.RenderTarget(D, D, { type: THREE.FloatType, count: 2 });
    pair.textures[0].name = "output"; pair.textures[1].name = "velocity";
    // three's velocity node after three renders, its mean over the pixels drawn, in pixels: drawn by the material itself or read
    // through MRT; one render per browser frame, or all three in one
    const velocityOf = async (make, { mrt, paced }) => {
        const material = new THREE.MeshBasicNodeMaterial(); material.blending = THREE.NoBlending;
        if (!mrt) material.fragmentNode = T.vec4(T.velocity, 0.0, 1.0);
        const { scene, step } = make(material), target = mrt ? pair : single;
        renderer.setMRT(mrt ? T.mrt({ output: T.output, velocity: T.velocity }) : null);
        for (const k of [0, 1, 2]) { if (paced) await frame(); step(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera); }
        const c = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 0), v = mrt ? await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D, 1) : c; let n = 0, x = 0;
        for (let i = 0; i < D * D; i++) if (c[i * 4 + 3] > 0.5) { n++; x += v[i * 4] * D / 2; }
        return +(x / n).toFixed(3);
    };
    // the reference: a plain mesh moving 0.3 a frame -- three's velocity is right on it, even with all three renders in one frame
    const plainOf = (material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material), scene = new THREE.Scene(); scene.add(mesh);
        return { scene, step: (k) => { mesh.position.x = -0.5 + 0.3 * k; mesh.updateMatrixWorld(); } };
    };
    // the same motion made by one bone carrying every vertex
    const skinnedOf = (material) => {
        const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), n = g.attributes.position.count;
        g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
        g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
        const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(g, material), scene = new THREE.Scene(); scene.add(bone); scene.add(mesh); mesh.bind(new THREE.Skeleton([bone]));
        return { scene, step: (k) => { bone.position.x = -0.5 + 0.3 * k; bone.updateMatrixWorld(true); } };
    };
    const plain = await velocityOf(plainOf, { mrt: true, paced: false });
    const drawn = await velocityOf(skinnedOf, { mrt: false, paced: true }), mrt = await velocityOf(skinnedOf, { mrt: true, paced: true });
    const mrtSameFrame = await velocityOf(skinnedOf, { mrt: true, paced: false });
    renderer.dispose(); return { plain, drawn, mrt, mrtSameFrame };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```
<!-- repro:end -->

## Observed

<!-- observed:begin -->
plain 5.612, drawn 1.871, mrt 5.612, mrtSameFrame 0.000 (px, both backends)
<!-- observed:end -->

## Expected

`drawn` equal to `plain`.

## Cause

Verified by the patch below. Skinning and instancing build the previous position only when `builder.needsPreviousData()`
(`src/nodes/core/NodeBuilder.js`), which is true when the renderer's MRT has a `velocity` output or the object is flagged
`useVelocity` -- not when the material draws `velocity` itself. The previous point is then the geometry as it stands, without
the bone: 1.871 px is the bone's distance from the origin at the third frame (x = 0.1), where one frame's motion is 5.612.
Patches 02 and 03 build their previous positions under the same test, so they meet it too.

`mrtSameFrame` is another matter, and the patch leaves it: a skeleton's previous bone matrices step once per `frameId`
(`src/nodes/accessors/Skinning.js`), and `frameId` advances once per browser frame of the renderer's animation loop, not once
per render. A second render in the same frame reads the previous bones as the current ones. A plain mesh, measured the same way,
reads its motion (`plain`). A post-process that renders the scene more than once a frame, or an application rendering outside
`setAnimationLoop`, meets it. It is [07](07-skinned-pose-once-a-frame.md)'s subject, and patch 07 steps the bones once per
render; with it applied as well -- here, all nine patches together -- the reproduction prints:

<!-- together:begin -->
plain 5.612, drawn 5.612, mrt 5.612, mrtSameFrame 5.612 (px, both backends)
<!-- together:end -->

## A patch

[`patches/04-velocity-outside-mrt.diff`](patches/04-velocity-outside-mrt.diff), a diff against three's `src/` at the r185 tag. `needsPreviousData()` is also true when the material's own nodes include the velocity node, looked for once per build; `VelocityNode` gains `isVelocityNode` to be found by. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
plain 5.612, drawn 5.612, mrt 5.612, mrtSameFrame 0.000 (px, both backends)
<!-- patched:end -->

## Paths the reproduction does not take

The velocity node drawn by the material's `colorNode`, not its `fragmentNode`, on r185's build and with the patch:

<!-- paths:begin -->
the velocity node drawn by the colorNode: r185 1.871, patched 5.612 (px, both backends)
<!-- paths:end -->

## A fix that works in an application

SweK_Engine's motion stage (`render/temporalTsl.mjs`) keeps the previous bone matrices per skeleton at its last draw, and the skeleton updated before each draw that asks for velocity; its gates hold the result to a reference on both backends.
