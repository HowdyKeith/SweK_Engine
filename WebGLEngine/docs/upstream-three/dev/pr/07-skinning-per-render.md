# PR 07: Skinning: Update the skeleton once per render.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../07-skinned-pose-once-a-frame.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [SkinnedMesh: the pose follows the bones once per browser frame, not once per render](../07-skinned-pose-once-a-frame.md)
- **Title:** `` Skinning: Update the skeleton once per render. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `skinning-per-render`
- **Patch:** [`patches/07-skinned-pose-every-render.diff`](../patches/07-skinned-pose-every-render.diff) -- `src/nodes/accessors/Skinning.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b skinning-per-render
git apply <path to>/docs/upstream-three/dev/patches/07-skinned-pose-every-render.diff
npm run lint && npm run test-unit
git commit -am "Skinning: Update the skeleton once per render." -m "Related issue: #<issue number>"
git push -u origin skinning-per-render
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

A `SkinnedMesh` rendered twice in one browser frame keeps the first render's pose: `skinning()` updates the skeleton in an `OnObjectUpdate` keyed on `frameId`, which advances once per animation-loop frame, not once per render. Velocity's previous bone matrices step the same way.

The skeleton's update, and the step of its previous bone matrices, are keyed on the render rather than the frame, in `skinning()` and `computeSkinning()` alike.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `skinned` reads `[0, 142]` on `dev` and `[142, 142]` with this patch, as `plain` does on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
