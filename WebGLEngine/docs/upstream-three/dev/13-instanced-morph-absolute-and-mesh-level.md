# InstancedMesh with per-instance morphs: absolute targets throw, and so does a mesh-level morphTargetInfluences

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

An `InstancedMesh` whose instances morph separately (`setMorphAt`) draws only when its morph targets are relative and the mesh has no `morphTargetInfluences` of its own. With absolute targets the render throws; with a `morphTargetInfluences` array on the mesh beside the per-instance ones it throws too, relative or absolute.

**Expected:** All four as `relative`: the morphed instance 16 pixels right, the other at the middle, both 12 pixels wide.

**Cause.** `morphReference()` (`src/nodes/accessors/Morph.js`) reads per-instance influences from the instance's row of `mesh.morphTexture`, but two things beside that read are the mesh's own. The base, by which the position is scaled before the targets are added, is a uniform set in `OnObjectUpdate` from `object.morphTargetInfluences` -- 1 for relative targets, 1 less their sum for absolute ones -- and an `InstancedMesh` with per-instance morphs has no such array, so `.reduce` throws; `setMorphAt` already writes each instance's own base into column 0 of its row, and nothing reads it. And the influences array, made whenever the mesh has `morphTargetInfluences`, is updated in every `OnObjectUpdate`; per instance the shader never reads it, so its node is never built, its value buffer is `null`, and the update writes into it.

**Fix.** The patch reads each instance's base from column 0 of its row, and builds and updates the mesh-level influences only where they are read. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/Morph.js b/src/nodes/accessors/Morph.js
index e9b9319..a9ad02d 100644
--- a/src/nodes/accessors/Morph.js
+++ b/src/nodes/accessors/Morph.js
@@ -194,6 +194,10 @@ export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ] ) => {
 
 	if ( morphTargetsCount === 0 ) return;
 
+	// per instance, the influences and the base are read from the instance's row of the mesh's morphTexture
+
+	const morphsPerInstance = mesh.count > 1 && ( mesh.morphTexture !== null && mesh.morphTexture !== undefined );
+
 	// Init
 
 	let morphInfluenceData = _morphInfluencesData.get( mesh );
@@ -202,7 +206,7 @@ export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ] ) => {
 
 		morphInfluenceData = {
 			base: uniform( 1 ),
-			influences: mesh.morphTargetInfluences ? uniformArray( mesh.morphTargetInfluences, 'float' ) : null,
+			influences: ( mesh.morphTargetInfluences && morphsPerInstance === false ) ? uniformArray( mesh.morphTargetInfluences, 'float' ) : null,
 			count: morphTargetsCount
 		};
 
@@ -216,8 +220,10 @@ export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ] ) => {
 
 	const { texture: bufferMap, stride, size } = getEntry( geometry );
 
-	if ( hasMorphPosition === true ) positionLocal.mulAssign( base );
-	if ( hasMorphNormals === true ) normalLocal.mulAssign( base );
+	const baseNode = morphsPerInstance ? textureLoad( mesh.morphTexture, ivec2( int( 0 ), int( instanceIndex ) ) ).r : base;
+
+	if ( hasMorphPosition === true ) positionLocal.mulAssign( baseNode );
+	if ( hasMorphNormals === true ) normalLocal.mulAssign( baseNode );
 
 	const width = int( size.width );
 
@@ -279,7 +285,7 @@ export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ] ) => {
 
 		} else {
 
-			base.value = 1 - object.morphTargetInfluences.reduce( ( a, b ) => a + b, 0 );
+			base.value = object.morphTargetInfluences ? 1 - object.morphTargetInfluences.reduce( ( a, b ) => a + b, 0 ) : 1;
 
 		}
 
```

</details>

**Until then:** Relative morph targets (`geometry.morphTargetsRelative = true`) for per-instance morphs, and the `InstancedMesh`'s own `morphTargetInfluences` left unset.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `absolute`, `relative+mesh` and `absolute+mesh` with `relative`.

### Code

```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
// two instances of a box with one morph target that moves it +1 in x: the lower instance at influence 0.5, the upper at 0.
// Where each is drawn, and how wide -- for relative and absolute targets, with and
// without a mesh-level morphTargetInfluences beside the per-instance ones. A plain box of the same size is 12 pixels wide here.
const run = async (forceWebGL) => {
    const out = {};
    for (const [name, relative, meshLevel] of [["relative", true, false], ["absolute", false, false], ["relative+mesh", true, true], ["absolute+mesh", false, true]]) {
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 5; camera.updateMatrixWorld();
        const D = 64, target = new THREE.RenderTarget(D, D);
        const g = new THREE.BoxGeometry(0.4, 0.4, 0.4), p = g.attributes.position, d = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) d.set(relative ? [1, 0, 0] : [p.getX(i) + 1, p.getY(i), p.getZ(i)], i * 3);
        g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = relative;
        const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicNodeMaterial({ color: 0xffffff }), 2), M = new THREE.Matrix4();
        mesh.setMatrixAt(0, M.makeTranslation(0, -0.5, 0)); mesh.setMatrixAt(1, M.makeTranslation(0, 0.5, 0));
        if (meshLevel) mesh.morphTargetInfluences = [0];
        const dummy = new THREE.Mesh(g); dummy.morphTargetInfluences = [0.5]; mesh.setMorphAt(0, dummy); dummy.morphTargetInfluences = [0]; mesh.setMorphAt(1, dummy); mesh.morphTexture.needsUpdate = true;
        const scene = new THREE.Scene(); scene.add(mesh);
        try {
            renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera);
            // each instance as "centre x/width", in pixels: centre from the middle, width from its leftmost lit pixel to its rightmost
            const c = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D); const half = (lo) => { let n = 0, x = 0, a = D, b = -1;
                for (let y = lo; y < lo + D / 2; y++) for (let i = 0; i < D; i++) if (c[(y * D + i) * 4] > 128) { n++; x += i + 0.5 - D / 2; a = Math.min(a, i); b = Math.max(b, i); }
                return n ? `${(x / n).toFixed(1)}/${b - a + 1}` : "none"; };
            out[name] = [half(0), half(D / 2)].sort((p, q) => parseFloat(q) - parseFloat(p)).join(" ");
        } catch (e) { out[name] = "throws: " + String(e && e.message || e).slice(0, 70); }
        renderer.dispose();
    }
    return out;
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
relative 16.0/12 0.0/12; absolute throws: Cannot read properties of undefined (reading 'reduce'); relative+mesh throws: Cannot set properties of null (setting '0'); absolute+mesh throws: Cannot set properties of null (setting '0') -- each instance's centre x/width in pixels (both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
relative 16.0/12 0.0/12; absolute 16.0/12 0.0/12; relative+mesh 16.0/12 0.0/12; absolute+mesh 16.0/12 0.0/12 -- each instance's centre x/width in pixels (both backends)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
