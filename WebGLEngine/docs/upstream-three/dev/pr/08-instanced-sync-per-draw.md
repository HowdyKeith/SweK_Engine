# PR 08: Instance: Sync large instance buffers before each draw.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../08-instanced-large-third-render.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [InstancedMesh past the uniform buffer: the second and third renders in a browser frame draw the first's matrices](../08-instanced-large-third-render.md)
- **Title:** `` Instance: Sync large instance buffers before each draw. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `instanced-sync-per-draw`
- **Patch:** [`patches/08-instanced-sync-before-upload.diff`](../patches/08-instanced-sync-before-upload.diff) -- `src/nodes/accessors/Instance.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b instanced-sync-per-draw
git apply <path to>/docs/upstream-three/dev/patches/08-instanced-sync-before-upload.diff
npm run lint && npm run test-unit
git commit -am "Instance: Sync large instance buffers before each draw." -m "Related issue: #<issue number>"
git push -u origin instanced-sync-per-draw
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

Past the uniform buffer, an `InstancedMesh` rendered more than once in a browser frame draws the first render's matrices on the second and third: the interleaved buffer's version is synced in an `OnBeforeFrameUpdate`, once per frame.

The version is synced in an `OnBeforeObjectUpdate` instead -- before each draw, and before its buffers are uploaded.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `many` reads `[0, 0, 142]` on `dev` and `[142, 144, 142]` with this patch, as `one` (a single instance) does on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
