# VelocityNode: drawn by the material rather than through MRT, a skinned mesh's previous position is never built

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

Three's `velocity` node drawn by the material itself -- `material.fragmentNode = vec4( velocity, 0, 1 )`, say, rather than read through `mrt( { velocity } )` -- reads a `SkinnedMesh`'s motion from the geometry without its bones. The same mesh read through MRT is right.

**Expected:** `drawn` equal to `plain`.

**Cause.** Skinning, instancing, batching and morphing build the previous position only when `builder.needsPreviousData()` (`src/nodes/core/NodeBuilder.js`), which is true when the renderer's MRT has a `velocity` output or the object is flagged `useVelocity` -- not when the material draws `velocity` itself. The previous point is then the geometry as it stands, without the bone: 1.871 px is the bone's distance from the origin at the third frame (x = 0.1), where one frame's motion is 5.612.

**Fix.** The patch makes `needsPreviousData()` also look through the material's own nodes for a `VelocityNode`, once per build. Against `dev` at 576b084; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/accessors/VelocityNode.js b/src/nodes/accessors/VelocityNode.js
index 515a70c..ebf7f0d 100644
--- a/src/nodes/accessors/VelocityNode.js
+++ b/src/nodes/accessors/VelocityNode.js
@@ -35,6 +35,15 @@ class VelocityNode extends Node {
 
 		super( 'vec2' );
 
+		/**
+		 * This flag can be used for type testing.
+		 *
+		 * @type {boolean}
+		 * @readonly
+		 * @default true
+		 */
+		this.isVelocityNode = true;
+
 		/**
 		 * An optional projection matrix that overrides the camera's projection matrix.
 		 *
diff --git a/src/nodes/core/NodeBuilder.js b/src/nodes/core/NodeBuilder.js
index de53c08..d4f41a0 100644
--- a/src/nodes/core/NodeBuilder.js
+++ b/src/nodes/core/NodeBuilder.js
@@ -48,6 +48,46 @@ const typeFromArray = new Map( [
 	[ Float32Array, 'float' ]
 ] );
 
+/**
+ * Whether a material's own node graph reads the velocity node -- velocity drawn as a
+ * fragment or color node, not through an MRT output -- in which case the previous
+ * positions instancing, skinning, batching and morphing keep must be built too.
+ *
+ * @private
+ * @param {?Material} material - The material.
+ * @return {boolean} Whether a velocity node is among its nodes.
+ */
+const _usesVelocity = ( material ) => {
+
+	if ( material === null || material.isNodeMaterial !== true ) return false;
+
+	const seen = new Set(), stack = [];
+
+	for ( const key in material ) {
+
+		const value = material[ key ];
+
+		if ( value !== null && typeof value === 'object' && value.isNode === true ) stack.push( value );
+
+	}
+
+	while ( stack.length > 0 ) {
+
+		const node = stack.pop();
+
+		if ( seen.has( node ) ) continue;
+		seen.add( node );
+
+		if ( node.isVelocityNode === true ) return true;
+
+		for ( const child of node.getChildren() ) stack.push( child );
+
+	}
+
+	return false;
+
+};
+
 const _toFloat = ( value ) => {
 
 	if ( /e/g.test( value ) ) {
@@ -3572,7 +3612,13 @@ class NodeBuilder {
 
 		const mrt = this.renderer.getMRT();
 
-		return ( mrt && mrt.has( 'velocity' ) ) || ( this.object !== null && getDataFromObject( this.object ).useVelocity === true );
+		if ( ( mrt && mrt.has( 'velocity' ) ) || ( this.object !== null && getDataFromObject( this.object ).useVelocity === true ) ) return true;
+
+		// velocity drawn by the material itself, outside MRT: looked for once per build
+
+		if ( this._materialUsesVelocity === undefined ) this._materialUsesVelocity = _usesVelocity( this.material );
+
+		return this._materialUsesVelocity;
 
 	}
 
```

</details>

**Until then:** Read velocity through `mrt( { velocity } )` rather than from the material.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `drawn` with `plain`. (`mrtSameFrame`, three renders in one browser frame, is the skinned-pose issue filed beside this one -- "SkinnedMesh: the pose follows the bones once per browser frame"; with its patch applied as well the page prints the line under "With the patch" below, and then `mrtSameFrame` as `plain`.)

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

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 576b084 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
plain 5.612, drawn 1.871, mrt 5.612, mrtSameFrame 0.000 (px, both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
plain 5.612, drawn 5.612, mrt 5.612, mrtSameFrame 0.000 (px, both backends)
<!-- patched:end -->

With the patch and the skinned-pose patch together (`mrtSameFrame` is that issue's):

<!-- together:begin -->
plain 5.612, drawn 5.612, mrt 5.612, mrtSameFrame 5.612 (px, both backends)
<!-- together:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
