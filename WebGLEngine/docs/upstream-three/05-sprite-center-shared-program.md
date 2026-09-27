# Sprite: `center` is taken from the first sprite that built a shared program

**three.js r185** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

A `Sprite` whose `center` is (0.5, 0.5) is drawn off-centre if a sprite with a different `center` and a like material was drawn first. With an unlike material it is drawn where it should be. The colour pass, not only velocity.

## Reproduction

Save as an `.html` file and open it; it prints the numbers for both backends.

<!-- repro:begin -->
```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.tsl.js" } }</script>
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
<!-- repro:end -->

## Observed

<!-- observed:begin -->
offCentre 38.5, centredAfter 38.5, centredUnlike 31.5 (both backends)
<!-- observed:end -->

## Expected

`centredAfter` equal to `centredUnlike` (31.5): a centred sprite drawn where a centred sprite is.

## Where it seems to come from

`SpriteNodeMaterial.setupPositionView` builds `reference('center', 'vec2', object)` for the object being built, and the render object's cache key (`getMaterialCacheKey`) holds nothing of that object -- so every like sprite shares the program, and with it the first sprite's `center`. The same shape would affect any node built with a reference to `builder.object` in a program shared across objects.

## A fix that works in an application

SweK_Engine's motion stage (`render/temporalTsl.mjs`) keeps `center` as a per-object uniform updated each draw (an object-group uniform read from the object being drawn), or the object's centre in the cache key; its gates hold the result to a reference on both backends.
