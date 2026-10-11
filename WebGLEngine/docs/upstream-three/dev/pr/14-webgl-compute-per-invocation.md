# PR 14: WebGLBackend: Dispatch every compute instanced.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../14-webgl2-compute-buffer-class.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [WebGLBackend: a compute reads the first element of any buffer whose class differs from its first buffer's](../14-webgl2-compute-buffer-class.md)
- **Title:** `` WebGLBackend: Dispatch every compute instanced. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `webgl-compute-per-invocation`
- **Patch:** [`patches/14-webgl2-compute-per-invocation.diff`](../patches/14-webgl2-compute-per-invocation.diff) -- `src/renderers/webgl-fallback/WebGLBackend.js`, `src/renderers/webgl-fallback/utils/WebGLVertexArrayUtils.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b webgl-compute-per-invocation
git apply <path to>/docs/upstream-three/dev/patches/14-webgl2-compute-per-invocation.diff
npm run lint && npm run test-unit
git commit -am "WebGLBackend: Dispatch every compute instanced." -m "Related issue: #<issue number>"
git push -u origin webgl-compute-per-invocation
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

On the WebGL backend, a compute reads only the first element of any buffer whose class differs from its first buffer's: it is drawn as `count` points or as one instanced point depending on its first buffer, and each buffer steps per vertex or per instance by its own class.

Every compute is drawn as one point and `count` instances, from a vertex array of its own whose every attribute steps once per instance, so `instanceIndex` (`gl_InstanceID`) is the invocation in every compute.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: an instanced buffer read into a plain one, and the reverse, give `1 1 1 1 1 1` on WebGL 2 on `dev` and `1 2 3 4 5 6` with this patch. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.

This also fixes #<issue number of 11> (a compute writing a plain storage buffer reads every `instanceIndex` as 0), which has a smaller patch of its own in a separate PR; only one of the two is needed for that issue.
