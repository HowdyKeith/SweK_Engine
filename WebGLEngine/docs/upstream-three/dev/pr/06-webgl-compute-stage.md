# PR 06: Pipelines: Key compute stages by their buffers on the WebGL backend.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../06-webgl2-second-compute.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [WebGLBackend: two computes that compile to the same GLSL share one stage, and the second runs on the first's buffers](../06-webgl2-second-compute.md)
- **Title:** `` Pipelines: Key compute stages by their buffers on the WebGL backend. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `webgl-compute-stage`
- **Patch:** [`patches/06-webgl2-compute-stage-per-buffers.diff`](../patches/06-webgl2-compute-stage-per-buffers.diff) -- `src/renderers/common/Pipelines.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b webgl-compute-stage
git apply <path to>/docs/upstream-three/dev/patches/06-webgl2-compute-stage-per-buffers.diff
npm run lint && npm run test-unit
git commit -am "Pipelines: Key compute stages by their buffers on the WebGL backend." -m "Related issue: #<issue number>"
git push -u origin webgl-compute-stage
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

On the WebGL backend, two computes whose kernels compile to the same GLSL share one stage, and the stage carries the buffers it binds by transform feedback -- so the second dispatch reads and writes the first system's buffers.

A compute stage is keyed by its code and, on the WebGL backend, by the buffers it binds as well; a released stage is dropped from the cache by the key it was cached by. WebGPU is unchanged.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `moved` is `[true, false]` on WebGL 2 on `dev` -- the second system never moves -- and `[true, true]` with this patch, as on WebGPU on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
