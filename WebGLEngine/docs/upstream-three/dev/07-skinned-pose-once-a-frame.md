# SkinnedMesh: the pose follows the bones once per browser frame, not once per render

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

A `SkinnedMesh` rendered twice in one browser frame, its bone moved between the renders, is drawn in the first render's pose both times. A plain `Mesh` moved the same way is drawn where it was put. Rendering a scene more than once a frame is ordinary: several views, a pass that renders it again, a capture loop that does not wait for `requestAnimationFrame`.

**Expected:** `skinned` drawn in both halves, as `plain` is.

**Cause.** `skinning()` (`src/nodes/accessors/Skinning.js`) calls `skeleton.update()` -- which turns the bones into `boneMatrices` -- in an `OnObjectUpdate` that runs it once per `frameId`, and `frameId` advances once per browser frame of the renderer's animation loop, not once per render. The same test steps the previous bone matrices that velocity reads, so a skinned mesh's velocity also follows the frame while a plain mesh's follows the render. Updating the skeleton by hand before each render draws it where it is (`skinnedUpdated`).

**Fix.** The patch keys the skeleton's update -- and the step of its previous bone matrices -- on the render rather than the frame, in `skinning()` and `computeSkinning()` alike. Against `dev` at 576b084; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/Skinning.js b/src/nodes/accessors/Skinning.js
index 437e0c0..b6e2b5c 100644
--- a/src/nodes/accessors/Skinning.js
+++ b/src/nodes/accessors/Skinning.js
@@ -237,13 +237,13 @@ export const skinning = /*@__PURE__*/ Fn( ( [ skinnedMesh ], builder ) => {
 	const bindMatrixInverseNode = reference( 'bindMatrixInverse', 'mat4' );
 	const boneMatricesNode = getBoneMatricesNode( builder, skinnedMesh.skeleton );
 
-	OnObjectUpdate( ( { object, frameId } ) => {
+	OnObjectUpdate( ( { object, renderId } ) => {
 
 		const skeleton = object.skeleton;
 
-		if ( _skeletonsUpdated.get( skeleton ) !== frameId ) {
+		if ( _skeletonsUpdated.get( skeleton ) !== renderId ) {
 
-			_skeletonsUpdated.set( skeleton, frameId );
+			_skeletonsUpdated.set( skeleton, renderId );
 
 			const skeletonData = _previousBoneMatricesData.get( skeleton );
 
@@ -312,11 +312,11 @@ export const computeSkinning = /*@__PURE__*/ Fn( ( [ skinnedMesh, toPosition = n
 
 	const skeleton = skinnedMesh.skeleton;
 
-	OnObjectUpdate( ( { frameId } ) => {
+	OnObjectUpdate( ( { renderId } ) => {
 
-		if ( _skeletonsUpdated.get( skeleton ) !== frameId ) {
+		if ( _skeletonsUpdated.get( skeleton ) !== renderId ) {
 
-			_skeletonsUpdated.set( skeleton, frameId );
+			_skeletonsUpdated.set( skeleton, renderId );
 
 			const state = _previousBoneMatricesData.get( skeleton );
 
```

</details>

**Until then:** Call `skeleton.update()` before each render the bones have moved for.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `skinned` with `plain`.

### Code

```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js" } }</script>
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

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 576b084 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
plain [142, 142], skinned [0, 142], skinnedUpdated [142, 142] -- pixels left and right of the centre; the renders in one browser frame: true (both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
plain [142, 142], skinned [142, 142], skinnedUpdated [142, 142] -- pixels left and right of the centre; the renders in one browser frame: true (both backends)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
