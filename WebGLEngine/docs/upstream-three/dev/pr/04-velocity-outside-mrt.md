# PR 04: NodeBuilder: Build previous data when the material draws velocity.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../04-velocity-outside-mrt.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [VelocityNode: drawn by the material rather than through MRT, a skinned mesh's previous position is never built](../04-velocity-outside-mrt.md)
- **Title:** `` NodeBuilder: Build previous data when the material draws velocity. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `velocity-outside-mrt`
- **Patch:** [`patches/04-velocity-outside-mrt.diff`](../patches/04-velocity-outside-mrt.diff) -- `src/nodes/accessors/VelocityNode.js`, `src/nodes/core/NodeBuilder.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b velocity-outside-mrt
git apply <path to>/docs/upstream-three/dev/patches/04-velocity-outside-mrt.diff
npm run lint && npm run test-unit
git commit -am "NodeBuilder: Build previous data when the material draws velocity." -m "Related issue: #<issue number>"
git push -u origin velocity-outside-mrt
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

A material that draws `velocity` itself (as its `colorNode`, outside an MRT) gets no previous position for skinning, instancing, batching or morphing: `needsPreviousData()` looks only at the renderer's MRT and the object's `useVelocity` flag.

`needsPreviousData()` now also looks through the material's own nodes for a `VelocityNode`, once per build.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `drawn` reads 1.871 px on `dev` and 5.612 with this patch, as `mrt` (the same mesh through the MRT) does on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
