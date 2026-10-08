# SpriteNodeMaterial: `center` is taken from the first sprite that built a shared program

<!-- DRAFT, NOT POSTED. Three's Bug Report form (https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml), field by field: the title is this heading, and each ### section below is the body of the field of that name. -->

### Description

A `Sprite` whose `center` is (0.5, 0.5) is drawn off-centre if a sprite with a different `center` and a like material was drawn first. With an unlike material it is drawn where it should be. This is the colour pass, not only velocity.

**Expected:** `centredAfter` equal to `centredUnlike` (31.5): a centred sprite drawn where a centred sprite is.

**Cause.** `SpriteNodeMaterial.setupPositionView()` (`src/materials/nodes/SpriteNodeMaterial.js`) builds `reference( 'center', 'vec2', object )` -- a reference bound to the sprite being built, which it reads at every update. The render object's cache key holds nothing of that sprite, so every like sprite shares the program, and with it the first sprite's `center`.

**Fix.** The patch reads `center` through a reference that is not bound to one object, so it is read from the sprite being drawn. Against `dev` at 576b084; I can open it as a pull request:

<details><summary>Patch</summary>

```diff
diff --git a/src/materials/nodes/SpriteNodeMaterial.js b/src/materials/nodes/SpriteNodeMaterial.js
index e03f2c2..4bd4d94 100644
--- a/src/materials/nodes/SpriteNodeMaterial.js
+++ b/src/materials/nodes/SpriteNodeMaterial.js
@@ -132,7 +132,10 @@ class SpriteNodeMaterial extends NodeMaterial {
 
 		if ( object.center && object.center.isVector2 === true ) {
 
-			const center = reference( 'center', 'vec2', object );
+			// the center of the sprite being drawn: sprites with like materials share one program, and a reference bound to
+			// the object that built it would read that sprite's center for every one of them
+
+			const center = reference( 'center', 'vec2' );
 
 			alignedPosition = alignedPosition.sub( center.sub( 0.5 ) );
 
```

</details>

**Until then:** A material of its own for each sprite whose `center` differs.

### Reproduction steps

1. Save the code below as an `.html` file and open it in Chrome.
2. It renders on WebGPU, then again with `forceWebGL: true` (the WebGL 2 backend), and prints what it measured on both.
3. Compare `centredAfter` with `centredUnlike`.

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
    const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType });
    // the mean x of the pixels a lone sprite covers
    const meanX = async (cx, unlike) => {
        const m = new THREE.SpriteNodeMaterial({ color: 0xffffff }); if (unlike) m.alphaTest = 0.01;
        const s = new THREE.Sprite(m); s.scale.set(0.8, 0.8, 1); s.center.set(cx, 0.5); const scene = new THREE.Scene(); scene.add(s);
        renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera); const c = await renderer.readRenderTargetPixelsAsync(target, 0, 0, D, D);
        let n = 0, x = 0; for (let i = 0; i < D * D; i++) if (c[i * 4] > 0.5) { n++; x += i % D; } return +(x / n).toFixed(2);
    };
    const offCentre = await meanX(0.0, false), centredAfter = await meanX(0.5, false), centredUnlike = await meanX(0.5, true);
    renderer.dispose(); return { offCentre, centredAfter, centredUnlike };
};
report({ webgpu: await run(false), webgl2: await run(true) });
</script>
```

### Live example

<!-- Before posting: paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle (https://jsfiddle.net/mnqr9oj0/) and link the fork here. -->

### Screenshots

What the page prints, the same on r186 and on `dev` at 576b084 (headless Chromium 141, SwiftShader):

<!-- observed:begin -->
offCentre 38.5, centredAfter 38.5, centredUnlike 31.5 (both backends)
<!-- observed:end -->

With the patch:

<!-- patched:begin -->
offCentre 38.5, centredAfter 31.5, centredUnlike 31.5 (both backends)
<!-- patched:end -->

### Version

r186

### Device

Desktop

### Browser

Chrome

### OS

Linux
