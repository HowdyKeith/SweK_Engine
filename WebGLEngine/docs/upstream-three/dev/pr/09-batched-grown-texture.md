# PR 09: RenderObject: Add the batch's matrices texture to the dynamic cache key.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../09-batched-grown-old-texture.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [BatchedMesh: grown by setInstanceCount, it is drawn from its old matrices texture](../09-batched-grown-old-texture.md)
- **Title:** `` RenderObject: Add the batch's matrices texture to the dynamic cache key. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `batched-grown-texture`
- **Patch:** [`patches/09-batched-texture-in-dynamic-key.diff`](../patches/09-batched-texture-in-dynamic-key.diff) -- `src/renderers/common/RenderObject.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b batched-grown-texture
git apply <path to>/docs/upstream-three/dev/patches/09-batched-texture-in-dynamic-key.diff
npm run lint && npm run test-unit
git commit -am "RenderObject: Add the batch's matrices texture to the dynamic cache key." -m "Related issue: #<issue number>"
git push -u origin batched-grown-texture
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

A `BatchedMesh` grown by `setInstanceCount()` keeps drawing from its old (disposed) matrices texture until its material is updated: the dynamic cache key holds nothing of the batch, so the render object is never made again.

The batch's matrices texture is added to `getDynamicCacheKey()`, so a grown batch's render object is made again.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `grown` stops at 28 from the growth on `dev` and reads 22.4, 28, 33, 39, 44.5 with this patch, as `grownMaterialUpdated` does on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
