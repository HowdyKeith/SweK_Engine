# VelocityNode: a morphed mesh's previous position is its unmorphed one

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

Read through `mrt( { output, velocity } )`, one render per browser frame, a `Mesh` whose relative morph target (+1 in x) has its influence changing by 0.3 a frame -- the same motion as the plain mesh moved 0.3 a frame -- reads its motion from the unmorphed geometry: the velocity is the morphed point's distance from the unmorphed one, not from where it was drawn last frame.

**Expected:** `morphed` equal to `plain`.

**Cause.** `morphReference()` (`src/nodes/accessors/Morph.js`) morphs `positionLocal` by the current influences; nothing keeps the influences of the last draw, and `positionPrevious` is left unmorphed. 1.871 px is the morphed point's distance from the unmorphed one at the third frame (influence 0.1).

**Fix.** The patch keeps each mesh's influences as they were at its last draw -- and, for an `InstancedMesh` with per-instance morphs, a copy of its `morphTexture` -- and morphs `positionPrevious` by them when previous data is needed. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/Morph.js b/src/nodes/accessors/Morph.js
index e9b9319..5ed8131 100644
--- a/src/nodes/accessors/Morph.js
+++ b/src/nodes/accessors/Morph.js
@@ -3,14 +3,15 @@ import { float, Fn, ivec2, int, If, uniform } from '../tsl/TSLBase.js';
 import { Loop } from '../utils/LoopNode.js';
 import { OnObjectUpdate } from '../utils/EventNode.js';
 import { textureLoad } from './TextureNode.js';
-import { positionLocal } from './Position.js';
+import { positionLocal, positionPrevious } from './Position.js';
 import { normalLocal } from './Normal.js';
 import { instanceIndex, vertexIndex } from '../core/IndexNode.js';
 
 import { DataArrayTexture } from '../../textures/DataArrayTexture.js';
+import { DataTexture } from '../../textures/DataTexture.js';
 import { Vector2 } from '../../math/Vector2.js';
 import { Vector4 } from '../../math/Vector4.js';
-import { FloatType } from '../../constants.js';
+import { FloatType, RedFormat } from '../../constants.js';
 import { uniformArray } from './UniformArrayNode.js';
 
 const _morphTextures = /*@__PURE__*/ new WeakMap();
@@ -182,7 +183,7 @@ function getEntry( geometry ) {
  * @function
  * @param {Mesh} mesh - The mesh.
  */
-export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ] ) => {
+export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ], builder ) => {
 
 	const { geometry } = mesh;
 
@@ -267,6 +268,87 @@ export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ] ) => {
 
 	} );
 
+	// the previous position, for motion vectors: morphed by the influences of the last draw, kept here
+
+	const perInstance = mesh.count > 1 && ( mesh.morphTexture !== null && mesh.morphTexture !== undefined );
+
+	if ( hasMorphPosition === true && builder.needsPreviousData() && perInstance === false && influences !== null ) {
+
+		if ( morphInfluenceData.previousInfluences === undefined ) {
+
+			morphInfluenceData.previousBase = uniform( 1 );
+			morphInfluenceData.previousInfluences = uniformArray( mesh.morphTargetInfluences.slice(), 'float' );
+			morphInfluenceData.lastBase = null;
+			morphInfluenceData.lastInfluences = null;
+
+		}
+
+		const { previousBase, previousInfluences } = morphInfluenceData;
+
+		positionPrevious.assign( positionPrevious.mul( previousBase ) );
+
+		Loop( morphTargetsCount, ( { i } ) => {
+
+			const influence = previousInfluences.element( i ).toVar();
+
+			If( influence.notEqual( 0 ), () => {
+
+				positionPrevious.assign( positionPrevious.add( getMorph( {
+					bufferMap,
+					influence,
+					stride,
+					width,
+					depth: i,
+					offset: int( 0 )
+				} ) ) );
+
+			} );
+
+		} );
+
+	}
+
+	// per instance, the influences are read from the mesh's morphTexture: the previous ones from a copy of the last draw's
+
+	if ( hasMorphPosition === true && builder.needsPreviousData() && perInstance === true ) {
+
+		if ( morphInfluenceData.previousMorphTexture === undefined ) {
+
+			const { data, width: w, height: h } = mesh.morphTexture.image;
+
+			morphInfluenceData.previousMorphTexture = new DataTexture( data.slice(), w, h, RedFormat, FloatType );
+			morphInfluenceData.previousMorphTexture.needsUpdate = true;
+			morphInfluenceData.lastMorph = data.slice();
+
+		}
+
+		const { previousMorphTexture } = morphInfluenceData;
+
+		// the base too: a column of its own in each instance's row, 1 less the influences' sum where the targets are absolute
+
+		positionPrevious.assign( positionPrevious.mul( textureLoad( previousMorphTexture, ivec2( int( 0 ), int( instanceIndex ) ) ).r ) );
+
+		Loop( morphTargetsCount, ( { i } ) => {
+
+			const influence = textureLoad( previousMorphTexture, ivec2( int( i ).add( 1 ), int( instanceIndex ) ) ).r.toVar();
+
+			If( influence.notEqual( 0 ), () => {
+
+				positionPrevious.assign( positionPrevious.add( getMorph( {
+					bufferMap,
+					influence,
+					stride,
+					width,
+					depth: i,
+					offset: int( 0 )
+				} ) ) );
+
+			} );
+
+		} );
+
+	}
+
 	// Update
 
 	OnObjectUpdate( ( { object } ) => {
@@ -290,6 +372,32 @@ export const morphReference = /*@__PURE__*/ Fn( ( [ mesh ] ) => {
 
 		}
 
+		const data = morphInfluenceData;
+
+		if ( data.previousInfluences !== undefined ) {
+
+			// the last draw's influences are this draw's previous ones; this draw's are kept for the next
+
+			data.previousBase.value = data.lastBase === null ? base.value : data.lastBase;
+			data.previousInfluences.array = data.lastInfluences === null ? object.morphTargetInfluences.slice() : data.lastInfluences;
+			data.previousInfluences.update();
+
+			data.lastBase = base.value;
+			data.lastInfluences = object.morphTargetInfluences.slice();
+
+		}
+
+		if ( data.previousMorphTexture !== undefined ) {
+
+			// the last draw's per-instance influences are this draw's previous ones; this draw's are kept for the next
+
+			data.previousMorphTexture.image.data.set( data.lastMorph );
+			data.previousMorphTexture.needsUpdate = true;
+
+			data.lastMorph.set( object.morphTexture.image.data );
+
+		}
+
 	} );
 
 }, 'void' );
```

</details>

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `morphed` with `plain`.

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

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
plain 5.612, morphed 1.871 (px, both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
plain 5.612, morphed 5.612 (px, both backends)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
