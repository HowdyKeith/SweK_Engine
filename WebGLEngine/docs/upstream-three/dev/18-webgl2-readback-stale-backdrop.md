# WebGLBackend: after readRenderTargetPixelsAsync, a transmission material keeps the backdrop of its target's previous render

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

On the WebGL 2 backend, a transmission material (`MeshPhysicalMaterial` with `transmission > 0`) rendered into a render target whose pixels were read back with `readRenderTargetPixelsAsync()` keeps showing the backdrop of the render before the read: the wall behind the lens moves, the wall's pixels beside the lens change (4 of the 8 sampled), and not one pixel seen through the lens does -- for every later render into that target. WebGPU draws it right. It is not new: r185 prints the same. Without the readback between the renders, or with a render into another framebuffer between them, the lens is right.

**Expected:** `lensMoved` like `wallMoved` on WebGL 2, as on WebGPU (`wallMoved 4, lensMoved 8`).

**Cause.** `WebGLState.bindFramebuffer()` caches what is bound to `gl.FRAMEBUFFER`, but binding `gl.FRAMEBUFFER` binds both the draw and the read framebuffer, and the cache records only the draw side. `WebGLTextureUtils.copyTextureToBuffer()` (behind `readRenderTargetPixelsAsync()`) binds `gl.READ_FRAMEBUFFER` to a framebuffer of its own and leaves it at `null`. The next render binds the same target to `gl.FRAMEBUFFER`, the cache says it already is, and the bind never reaches GL -- so the read binding stays on the default framebuffer, and `copyFramebufferToTexture()` (the viewport texture the transmission samples) copies from it instead of from the target. Read from the code, the same holds for any `copyFramebufferToTexture()` that copies with `copyTexSubImage2D` (no multisampling, no depth) after a readback, not only transmission's.

**Fix.** The patch records the read binding when `gl.FRAMEBUFFER` is bound, and treats `gl.FRAMEBUFFER` as cached only while the draw and the read binding are the same framebuffer; once one of them is bound alone to another, the next `gl.FRAMEBUFFER` bind reaches GL. Against `dev` at 1ea31f3; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/renderers/webgl-fallback/utils/WebGLState.js b/src/renderers/webgl-fallback/utils/WebGLState.js
index 60d8e40..d7fffe9 100644
--- a/src/renderers/webgl-fallback/utils/WebGLState.js
+++ b/src/renderers/webgl-fallback/utils/WebGLState.js
@@ -1121,19 +1121,20 @@ class WebGLState {
 
 			currentBoundFramebuffers[ target ] = framebuffer;
 
-			// gl.DRAW_FRAMEBUFFER is equivalent to gl.FRAMEBUFFER
+			// gl.FRAMEBUFFER binds the draw and the read framebuffer at once
 
-			if ( target === gl.DRAW_FRAMEBUFFER ) {
+			if ( target === gl.FRAMEBUFFER ) {
 
-				currentBoundFramebuffers[ gl.FRAMEBUFFER ] = framebuffer;
+				currentBoundFramebuffers[ gl.DRAW_FRAMEBUFFER ] = framebuffer;
+				currentBoundFramebuffers[ gl.READ_FRAMEBUFFER ] = framebuffer;
 
 			}
 
-			if ( target === gl.FRAMEBUFFER ) {
+			// so it is only cached while both are the same framebuffer: once the read or the draw binding differs, the next bind must reach GL
 
-				currentBoundFramebuffers[ gl.DRAW_FRAMEBUFFER ] = framebuffer;
+			const drawFramebuffer = currentBoundFramebuffers[ gl.DRAW_FRAMEBUFFER ];
 
-			}
+			currentBoundFramebuffers[ gl.FRAMEBUFFER ] = ( drawFramebuffer === currentBoundFramebuffers[ gl.READ_FRAMEBUFFER ] ) ? drawFramebuffer : undefined;
 
 			return true;
 
```

</details>

**Until then:** After `readRenderTargetPixelsAsync()`, render once into another framebuffer -- `renderer.setRenderTarget( null ); renderer.render( new Scene(), camera );` is enough -- so the next bind of the target reaches GL.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `lensMoved` with `wallMoved` on each backend.

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
    const D = 64, target = new THREE.RenderTarget(D, D);
    // render into the one target, then read it back: the red channel of eight pixels in a row through the lens's centre, and of eight beside it on the wall
    const draw = async (x) => { wall.position.x = x; wall.updateMatrixWorld(); renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera);
        const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D), s = Math.ceil(D * 4 / 256) * 64, at = (u, v) => px[(v * s + u) * 4];
        return { lens: Array.from({ length: 8 }, (_, i) => at(28 + i, 32)), wall: Array.from({ length: 8 }, (_, i) => at(2 + i, 32)) }; };
    const moved = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
    // the wall moves a quarter between two renders: of eight pixels in a row, how many changed
    const c = await draw(0), d = await draw(0.25);
    renderer.dispose();
    return { wallMoved: moved(c.wall, d.wall), lensMoved: moved(c.lens, d.lens) };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 1ea31f3 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
webgpu: wallMoved 4, lensMoved 8; webgl2: wallMoved 4, lensMoved 0 -- of eight pixels in a row, how many changed when the wall moved, the target read back after each render
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
webgpu: wallMoved 4, lensMoved 8; webgl2: wallMoved 4, lensMoved 8 -- of eight pixels in a row, how many changed when the wall moved, the target read back after each render
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
