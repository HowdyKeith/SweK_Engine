# PR 03: Morph: Morph the previous position by the last draw's influences.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../03-velocity-morph.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [VelocityNode: a morphed mesh's previous position is its unmorphed one](../03-velocity-morph.md)
- **Title:** `` Morph: Morph the previous position by the last draw's influences. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `velocity-morph`
- **Patch:** [`patches/03-morph-previous-influences.diff`](../patches/03-morph-previous-influences.diff) -- `src/nodes/accessors/Morph.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b velocity-morph
git apply <path to>/docs/upstream-three/dev/patches/03-morph-previous-influences.diff
npm run lint && npm run test-unit
git commit -am "Morph: Morph the previous position by the last draw's influences." -m "Related issue: #<issue number>"
git push -u origin velocity-morph
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

Under a velocity MRT, a morphed mesh's velocity is measured from its unmorphed position: `positionPrevious` is never morphed, and nothing keeps the influences of the last draw.

This keeps each mesh's influences as they were at its last draw -- and, for an `InstancedMesh` with per-instance morphs, a copy of its `morphTexture` -- and morphs `positionPrevious` by them when previous data is needed (`builder.needsPreviousData()`).

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `morphed` reads 1.871 px on `dev` and 5.612 with this patch, as `plain` does on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
