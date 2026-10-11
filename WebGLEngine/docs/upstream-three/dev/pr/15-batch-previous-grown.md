# PR 15: Batch: Remake the previous matrices when the batch grows.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../15-batched-grown-velocity-throws.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [BatchedMesh under a velocity MRT: every render throws once the batch grows, and the first frame reads motion that is not there](../15-batched-grown-velocity-throws.md)
- **Title:** `` Batch: Remake the previous matrices when the batch grows. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `batch-previous-grown`
- **Patch:** [`patches/15-batch-previous-grown.diff`](../patches/15-batch-previous-grown.diff) -- `src/nodes/accessors/Batch.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b batch-previous-grown
git apply <path to>/docs/upstream-three/dev/patches/15-batch-previous-grown.diff
npm run lint && npm run test-unit
git commit -am "Batch: Remake the previous matrices when the batch grows." -m "Related issue: #<issue number>"
git push -u origin batch-previous-grown
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

Under a velocity MRT, a `BatchedMesh` throws on every render once `setInstanceCount()` grows it, and its first frame reads motion that is not there: the previous matrices are a copy made once at the batch's first size, and never marked for upload.

The copy is made again at the new size when the batch's node is built again, the last draw's matrices kept as its first entries, and it is marked for upload when it is made.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: at and after the growth `dev` throws `RangeError: offset is out of bounds` and this patch reads 5.612 px, a plain mesh's; a still batch's first frame reads 7.482 px on `dev` and 0 with this patch. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
