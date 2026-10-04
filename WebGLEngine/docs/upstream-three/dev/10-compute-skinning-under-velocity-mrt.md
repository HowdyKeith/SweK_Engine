# computeSkinning under a velocity MRT: the compute shader names positionPrevious and never runs

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

A `computeSkinning` compute built while the renderer's MRT has a `velocity` output -- as it does in any application drawing motion vectors -- writes nothing on WebGPU. The same compute built with no MRT set writes the skinned positions. Nothing is reported but an uncaptured validation error, `unresolved value 'positionPrevious'`: the shader does not compile, so the compute pass never runs and its buffer keeps its zeros.

**Expected:** `velocityMRT` equal to `noMRT` on both backends.

**Cause.** `computeSkinning()` (`src/nodes/accessors/Skinning.js`) builds the previous skinned position when `builder.needsPreviousData()`, and assigns it to `positionPrevious`. `needsPreviousData()` (`src/nodes/core/NodeBuilder.js`) asks whether the renderer's MRT has a `velocity` output, or the object wants velocity -- not whether this build is a compute (`builder.compute`). For a compute it is true whenever the MRT is, and the WGSL names `positionPrevious`, which a compute shader does not declare. The GLSL a compute becomes on WebGL 2 declares it, so the same build runs there.

**Fix.** The patch makes `needsPreviousData()` false for a compute build: a compute pass draws nothing, so it has no motion to measure. Against `dev` at 576b084; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/nodes/core/NodeBuilder.js b/src/nodes/core/NodeBuilder.js
index de53c08..819b631 100644
--- a/src/nodes/core/NodeBuilder.js
+++ b/src/nodes/core/NodeBuilder.js
@@ -3571,4 +3571,8 @@ class NodeBuilder {
 	needsPreviousData() {
 
+		// a compute pass draws nothing, so it has no motion to measure -- and positionPrevious does not exist in its shader
+
+		if ( this.compute !== null ) return false;
+
 		const mrt = this.renderer.getMRT();
 
```

</details>

**Until then:** Clear the MRT around the compute's first run -- `renderer.setMRT( null )`, compute, then set it back -- so it is built without the velocity output.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `velocityMRT` with `noMRT` on WebGPU.

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
    // a box carried by one bone at x = 0.5, skinned by a compute into a buffer of its own
    const g = new THREE.BoxGeometry(0.6, 0.6, 0.6), n = g.attributes.position.count;
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicNodeMaterial()); mesh.bind(new THREE.Skeleton([bone]));
    bone.position.x = 0.5; bone.updateMatrixWorld(true);
    // the mean x the compute wrote: 0.5 where it ran
    const skinnedX = async () => {
        const out = T.instancedArray(n, "vec4");
        await renderer.computeAsync(T.Fn(() => { out.element(T.instanceIndex).assign(T.vec4(T.computeSkinning(mesh), 1)); })().compute(n));
        const f = new Float32Array(await renderer.getArrayBufferAsync(out.value)); let x = 0; for (let i = 0; i < n; i++) x += f[i * 4];
        return +(x / n).toFixed(3);
    };
    renderer.setMRT(null); const noMRT = await skinnedX();
    // the same compute, built while the renderer's MRT has a velocity output -- as it does in an application drawing motion vectors
    renderer.setMRT(T.mrt({ output: T.output, velocity: T.velocity })); const velocityMRT = await skinnedX();
    renderer.dispose(); return { noMRT, velocityMRT };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 576b084 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
webgpu: noMRT 0.5, velocityMRT 0; webgl2: noMRT 0.5, velocityMRT 0.5 -- the mean x the compute wrote, the bone at 0.5
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
webgpu: noMRT 0.5, velocityMRT 0.5; webgl2: noMRT 0.5, velocityMRT 0.5 -- the mean x the compute wrote, the bone at 0.5
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
