# PR 11: GLSLNodeBuilder: Fix `instanceIndex` in computes that are not instanced.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../11-webgl2-compute-instance-index.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [WebGLBackend: a compute writing a plain storage buffer reads every instanceIndex as 0](../11-webgl2-compute-instance-index.md)
- **Title:** `` GLSLNodeBuilder: Fix `instanceIndex` in computes that are not instanced. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `webgl-compute-instance-index`
- **Patch:** [`patches/11-webgl2-compute-invocation-index.diff`](../patches/11-webgl2-compute-invocation-index.diff) -- `src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b webgl-compute-instance-index
git apply <path to>/docs/upstream-three/dev/patches/11-webgl2-compute-invocation-index.diff
npm run lint && npm run test-unit
git commit -am "GLSLNodeBuilder: Fix \`instanceIndex\` in computes that are not instanced." -m "Related issue: #<issue number>"
git push -u origin webgl-compute-instance-index
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

On the WebGL backend, a compute whose first buffer is a plain storage buffer reads every `instanceIndex` as 0: it is drawn as `count` points, not instanced, and `instanceIndex` is `gl_InstanceID`.

A compute's `instanceIndex` (and `invocationLocalIndex`) reads `gl_InstanceID + gl_VertexID`: in a compute drawn as points the instance is 0, in one drawn instanced the vertex is.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `storageBuffer` reads 1 on WebGL 2 on `dev` and 8 with this patch, as `instancedArray` does and as WebGPU does on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.

#<issue number of 14> (a compute reading a buffer whose class differs from its first's) has its own patch, which draws every compute instanced and fixes this issue as well. If that one is preferred, this PR can be closed.
