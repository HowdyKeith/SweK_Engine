# Transmission: after a render into another target, the material shows that target's backdrop

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

A transmission material (`MeshPhysicalMaterial` with `transmission > 0`) drawn into one render target and then into another shows, in the second, the backdrop copied for the first: the wall behind the lens moves between the two renders, and the wall's pixels beside the lens change (4 of the 8 sampled, the stripes being 4 texels wide) while not one pixel seen through the lens does. On WebGPU and WebGL 2 alike; r185 drew both right. Any application rendering into more than one target -- an upscaler's render and display targets, a post-processing chain, a frame generator -- shows, through every transmission surface, the view another target saw.

**Expected:** `lensMoved` like `wallMoved`: the lens's pixels change when what is behind it does (r185 prints `wallMoved 4, lensMoved 8` on both backends).

**Cause.** The viewport texture node keeps one copy of the framebuffer per render target (`ViewportTextureNode.updateReference()` sets its `value` to the current target's copy) and fills it in `updateBefore()`. Since #34162 a render object that did not change takes a `SHARED` refresh: `updateBefore()` still runs, so the current target's copy is filled, but `Bindings.updateSharedForRender()` updates only the shared uniform buffers -- the sampled texture binding keeps the texture it was last bound to, another target's copy. A plain `MeshPhysicalMaterial` has no node properties, so `NodeMaterialObserver` never forces it to a full refresh. Bisected between r185 and r186: #34162 is the first commit that prints `lensMoved 0`.

**Fix.** The patch makes a shared refresh follow a texture node that switched textures: `updateSharedForRender()` runs the full update for a bind group whose sampled texture no longer refers to its node's current texture (`binding.texture !== binding.textureNode.value`), and only for that group, so an unchanged render object still skips the rest. Against `dev` at 576b084; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/renderers/common/Bindings.js b/src/renderers/common/Bindings.js
index 5350ae3..c7a52aa 100644
--- a/src/renderers/common/Bindings.js
+++ b/src/renderers/common/Bindings.js
@@ -241,6 +241,17 @@ class Bindings extends DataMap {
 
 		for ( const bindGroup of bindings ) {
 
+			// a texture node can switch textures between renders, e.g. the viewport texture which keeps one copy per render target,
+			// so a bind group referring to a previous texture requires a full update
+
+			if ( this._needsTextureUpdate( bindGroup ) === true ) {
+
+				this._update( bindGroup, bindings );
+
+				continue;
+
+			}
+
 			for ( const binding of bindGroup.bindings ) {
 
 				if ( ( binding.isNodeUniformsGroup === true || binding.isNodeUniformBuffer === true ) && binding.groupNode.shared === true ) {
@@ -267,6 +278,25 @@ class Bindings extends DataMap {
 
 	}
 
+	/**
+	 * Returns `true` if a sampled texture of the given bind group no longer refers to the current texture of its node.
+	 *
+	 * @private
+	 * @param {BindGroup} bindGroup - The bind group.
+	 * @return {boolean} Whether the bind group requires a texture update or not.
+	 */
+	_needsTextureUpdate( bindGroup ) {
+
+		for ( const binding of bindGroup.bindings ) {
+
+			if ( binding.isSampledTexture === true && binding.textureNode !== undefined && binding.texture !== binding.textureNode.value ) return true;
+
+		}
+
+		return false;
+
+	}
+
 	/**
 	 * Deletes the bindings for the given compute node.
 	 *
```

</details>

**Until then:** Use a `MeshPhysicalNodeMaterial` and give it a node property -- `material.colorNode = color( 0xffffff )` is enough: a material with a node property always takes the full refresh. (`material.needsUpdate = true` between the renders does not help.)

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `lensMoved` with `wallMoved`.

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
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    // a striped wall, and a clear lens in front of it: a plain physical material with transmission
    const stripes = new THREE.DataTexture(Uint8Array.from({ length: 64 }, (_, i) => (i % 8 < 4 ? 255 : 40)), 16, 1, THREE.RGBAFormat);
    stripes.magFilter = THREE.NearestFilter; stripes.needsUpdate = true;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: stripes }));
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0, ior: 1.5, thickness: 0.4 }));
    lens.position.z = 0.5; const scene = new THREE.Scene(); scene.add(wall, lens, new THREE.AmbientLight(0xffffff, 1));
    const D = 64, target = () => new THREE.RenderTarget(D, D);
    // the red channel of eight pixels in a row through the lens's centre, and of eight beside it on the wall
    const draw = async (x, rt) => { wall.position.x = x; wall.updateMatrixWorld(); renderer.setRenderTarget(rt); await renderer.renderAsync(scene, camera);
        const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, D, D), s = Math.ceil(D * 4 / 256) * 64, at = (u, v) => px[(v * s + u) * 4];
        return { lens: Array.from({ length: 8 }, (_, i) => at(28 + i, 32)), wall: Array.from({ length: 8 }, (_, i) => at(2 + i, 32)) }; };
    const moved = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
    // the wall moves a quarter between a render into one target and a render into another: of eight pixels in a row, how many changed
    const c = await draw(0, target()), d = await draw(0.25, target());
    renderer.dispose();
    return { wallMoved: moved(c.wall, d.wall), lensMoved: moved(c.lens, d.lens) };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 576b084 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
webgpu: wallMoved 4, lensMoved 0; webgl2: wallMoved 4, lensMoved 0 -- of eight pixels in a row, how many changed when the wall moved
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
webgpu: wallMoved 4, lensMoved 8; webgl2: wallMoved 4, lensMoved 8 -- of eight pixels in a row, how many changed when the wall moved
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
