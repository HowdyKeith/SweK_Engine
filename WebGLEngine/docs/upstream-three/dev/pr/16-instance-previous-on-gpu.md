# PR 16: Instance: Keep previous storage instance matrices on the GPU.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../16-instance-storage-compute-velocity.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [InstancedMesh: velocity is wrong when a compute pass writes its storage instance matrices](../16-instance-storage-compute-velocity.md)
- **Title:** `` Instance: Keep previous storage instance matrices on the GPU. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `instance-previous-on-gpu`
- **Patch:** [`patches/16-instance-previous-on-gpu.diff`](../patches/16-instance-previous-on-gpu.diff) -- `src/nodes/accessors/Instance.js`, `src/renderers/common/Backend.js`, `src/renderers/common/Renderer.js`, `src/renderers/webgl-fallback/WebGLBackend.js`, `src/renderers/webgpu/WebGPUBackend.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b instance-previous-on-gpu
git apply <path to>/docs/upstream-three/dev/patches/16-instance-previous-on-gpu.diff
npm run lint && npm run test-unit
git commit -am "Instance: Keep previous storage instance matrices on the GPU." -m "Related issue: #<issue number>"
git push -u origin instance-previous-on-gpu
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

Under a velocity MRT, an `InstancedMesh` whose storage instance matrices are written by a compute pass has the wrong velocity: the previous matrices are a copy of the CPU array, which a compute pass never writes.

For storage matrices, before each draw a copy of the last draw's matrices becomes the previous matrices and the current matrices become the last draw's -- two buffer-to-buffer copies, after the compute and before the draw. This adds `renderer.copyBufferToBuffer( src, dst )` (WebGPU `copyBufferToBuffer`, WebGL 2 `copyBufferSubData`), which creates each buffer, and uploads it if its CPU data changed, before copying. Non-storage matrices keep the CPU copy.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU (the WebGL 2 backend draws no `InstancedMesh` with storage matrices, on `dev` or with this patch): the instance moved by a compute reads 1.496 px on `dev` and 5.612 with this patch, as when its matrices are set on the CPU. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.

This edits the same import line of `Instance.js` as the PR for #<issue number of 08>. If both are merged, that line imports `OnAfterObjectUpdate, OnBeforeObjectUpdate`.
