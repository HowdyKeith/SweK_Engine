# WebGLBackend: two computes that compile to the same GLSL share one stage, and the second runs on the first's buffers

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

With `forceWebGL: true`, two particle systems -- each its own `instancedArray` positions and velocities and its own `.compute()` -- stepped twice each: the first moves, the second's buffer stays as it was. On WebGPU both move.

**Expected:** both systems move on both backends.

**Cause.** `Pipelines.getForCompute()` (`src/renderers/common/Pipelines.js`) caches the compute stage by its shader code. On WebGL 2 the two systems' kernels compile to the same GLSL, so the second compute node gets the first's stage -- and the stage carries the buffers it binds by transform feedback (`transforms`, `nodeAttributes`), which `WebGLBackend.createComputePipeline()` binds: the second dispatch reads and writes the first system's buffers. On WebGPU the two kernels compile to different WGSL, so each has its own stage.

**Fix.** The patch keys a compute stage by its code and, on the WebGL backend, by the buffers it binds as well; a released stage is dropped from the cache by the key it was cached by. Against `dev` at 576b084; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/renderers/common/Pipelines.js b/src/renderers/common/Pipelines.js
index 78237db..6c421b9 100644
--- a/src/renderers/common/Pipelines.js
+++ b/src/renderers/common/Pipelines.js
@@ -107,14 +107,17 @@ class Pipelines extends DataMap {
 
 			// programmable stage
 
-			let stageCompute = this.programs.compute.get( nodeBuilderState.computeShader );
+			const stageKey = this._getComputeStageKey( nodeBuilderState );
+
+			let stageCompute = this.programs.compute.get( stageKey );
 
 			if ( stageCompute === undefined ) {
 
 				if ( previousPipeline && previousPipeline.computeProgram.usedTimes === 0 ) this._releaseProgram( previousPipeline.computeProgram );
 
 				stageCompute = new ProgrammableStage( nodeBuilderState.computeShader, 'compute', computeNode.name, nodeBuilderState.transforms, nodeBuilderState.nodeAttributes );
-				this.programs.compute.set( nodeBuilderState.computeShader, stageCompute );
+				stageCompute.cacheKey = stageKey;
+				this.programs.compute.set( stageKey, stageCompute );
 
 				backend.createProgram( stageCompute );
 				this.info.createProgram( stageCompute );
@@ -421,6 +424,31 @@ class Pipelines extends DataMap {
 
 	}
 
+	/**
+	 * Returns the key a compute stage is cached by. Stages that bind buffers
+	 * by transform feedback (WebGL 2) carry the attributes they read and write,
+	 * so two compute nodes that compile to the same code but use different
+	 * buffers need different stages. Other stages are shared by code.
+	 *
+	 * @private
+	 * @param {NodeBuilderState} nodeBuilderState - The compute node's builder state.
+	 * @return {string} The cache key.
+	 */
+	_getComputeStageKey( nodeBuilderState ) {
+
+		const { computeShader, transforms, nodeAttributes } = nodeBuilderState;
+
+		if ( ! transforms || transforms.length === 0 ) return computeShader;
+
+		const ids = [];
+
+		for ( const transform of transforms ) ids.push( transform.attributeNode.id );
+		for ( const nodeAttribute of nodeAttributes ) ids.push( nodeAttribute.node.id );
+
+		return computeShader + '\n// ' + ids.join( ',' );
+
+	}
+
 	/**
 	 * Computes a cache key representing a render pipeline.
 	 *
@@ -458,7 +486,7 @@ class Pipelines extends DataMap {
 	 */
 	_releaseProgram( program ) {
 
-		const code = program.code;
+		const code = program.cacheKey !== undefined ? program.cacheKey : program.code;
 		const stage = program.stage;
 
 		this.programs[ stage ].delete( code );
```

</details>

**Until then:** A renderer of its own for each system, so no stage is shared.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare the second system's `moved` on the two backends.

### Code

```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.tsl.js" } }</script>
<pre id="out">running...</pre>
<script type="module">
import * as THREE from "three"; import * as T from "three/tsl";
const report = (r) => { window.__result = r; document.getElementById("out").textContent = JSON.stringify(r, null, 1); };
const run = async (forceWebGL) => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
    const N = 4, moved = [];
    for (let j = 0; j < 2; j++) {
        const pos = T.instancedArray(new Float32Array(N * 3), "vec3"), vel = T.instancedArray(new Float32Array(Array.from({ length: N * 3 }, (_, i) => (i % 3 === 0 ? 0.1 : 0))), "vec3");
        const step = T.Fn(() => { pos.element(T.instanceIndex).addAssign(vel.element(T.instanceIndex)); })().compute(N);
        await renderer.computeAsync(step); await renderer.computeAsync(step);
        const p = new Float32Array(await renderer.getArrayBufferAsync(pos.value)); moved.push(Math.abs(p[0] - 0.2) < 1e-5);
    }
    renderer.dispose(); return { moved };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 576b084 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
webgpu moved [true, true]; webgl2 moved [true, false]
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
webgpu moved [true, true]; webgl2 moved [true, true]
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
