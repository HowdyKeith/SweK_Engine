# PR 10: NodeBuilder: Need no previous data in compute builds.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../10-compute-skinning-under-velocity-mrt.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [computeSkinning under a velocity MRT: the compute shader names positionPrevious and never runs](../10-compute-skinning-under-velocity-mrt.md)
- **Title:** `` NodeBuilder: Need no previous data in compute builds. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `compute-no-previous`
- **Patch:** [`patches/10-compute-needs-no-previous-data.diff`](../patches/10-compute-needs-no-previous-data.diff) -- `src/nodes/core/NodeBuilder.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b compute-no-previous
git apply <path to>/docs/upstream-three/dev/patches/10-compute-needs-no-previous-data.diff
npm run lint && npm run test-unit
git commit -am "NodeBuilder: Need no previous data in compute builds." -m "Related issue: #<issue number>"
git push -u origin compute-no-previous
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

`computeSkinning()` under a velocity MRT never runs on WebGPU: `needsPreviousData()` is true for a compute build whenever the MRT has `velocity`, and the WGSL then names `positionPrevious`, which a compute shader does not declare.

`needsPreviousData()` is false for a compute build: a compute pass draws nothing, so it has no motion to measure.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `velocityMRT` reads 0 on WebGPU on `dev` -- the compute never runs -- and 0.5 with this patch, as `noMRT` does; WebGL 2 reads 0.5 on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
