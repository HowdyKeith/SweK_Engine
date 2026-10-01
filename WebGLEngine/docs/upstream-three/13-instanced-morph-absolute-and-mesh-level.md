# InstancedMesh with per-instance morphs: absolute targets throw, and so does a mesh-level morphTargetInfluences

**three.js r185, 0.185.1** (`three.webgpu.js`), `WebGPURenderer` on WebGPU and with `forceWebGL: true` -- measured in headless Chromium
(SwiftShader). DRAFT, not posted.

An `InstancedMesh` whose instances morph separately (`setMorphAt`) draws only when its morph targets are relative and the mesh
has no `morphTargetInfluences` of its own. With absolute targets the render throws; with a `morphTargetInfluences` array on the
mesh beside the per-instance ones it throws too, relative or absolute.

## Reproduction

Save as an `.html` file and open it; it prints the numbers for both backends.

<!-- repro:begin -->
```html
<!doctype html><meta charset="utf-8"><title>repro</title>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.webgpu.js", "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.tsl.js" } }</script>
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
<!-- repro:end -->

## Observed

<!-- observed:begin -->
relative 16.0/12 0.0/12; absolute throws: Cannot read properties of undefined (reading 'reduce'); relative+mesh throws: Cannot set properties of null (setting '0'); absolute+mesh throws: Cannot set properties of null (setting '0') -- each instance's centre x/width in pixels (both backends)
<!-- observed:end -->

## Expected

All four as `relative`: the morphed instance 16 pixels right, the other at the middle, both 12 pixels wide.

## Cause

Verified by the patch below. `morphReference` (`src/nodes/accessors/Morph.js`) reads per-instance influences from the
instance's row of `mesh.morphTexture`, but two things beside that read are the mesh's own:

- the base, by which the position is scaled before the targets are added. It is a uniform set in `OnObjectUpdate` from
  `object.morphTargetInfluences` -- 1 for relative targets, 1 less their sum for absolute ones -- and an `InstancedMesh` with
  per-instance morphs has no such array, so `.reduce` throws. `setMorphAt` already writes each instance's own base into
  column 0 of its row, and nothing reads it.
- the influences array. Made whenever the mesh has `morphTargetInfluences`, it is updated in every `OnObjectUpdate`; per
  instance the shader never reads it, so the node is never built, its value buffer is `null`, and `update()` writes into it.

## A patch

[`patches/13-morph-per-instance-base.diff`](patches/13-morph-per-instance-base.diff), a diff against three's `src/` at the r185 tag. Per instance, the base is read from column 0 of the instance's row, the mesh-level influences array is not made, and the mesh-level base is computed only where there is an array to compute it from. Applied to r185's build, the
reproduction prints:

<!-- patched:begin -->
relative 16.0/12 0.0/12; absolute 16.0/12 0.0/12; relative+mesh 16.0/12 0.0/12; absolute+mesh 16.0/12 0.0/12 -- each instance's centre x/width in pixels (both backends)
<!-- patched:end -->

The widths are the base's test: scaled by a mesh-level base of 1 rather than its own 0.5, the morphed instance with absolute
targets would be drawn half as wide again. [03](03-velocity-morph.md)'s patch reads the previous base from the same column
of its copy of the texture.

## A fix that works in an application

Use relative morph targets (`geometry.morphTargetsRelative = true`) for per-instance morphs, and leave the `InstancedMesh`'s own
`morphTargetInfluences` unset.
