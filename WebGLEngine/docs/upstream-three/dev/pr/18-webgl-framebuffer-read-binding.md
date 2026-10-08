# PR 18: WebGLState: Track the read framebuffer binding.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../18-webgl2-readback-stale-backdrop.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [WebGLBackend: after readRenderTargetPixelsAsync, a transmission material keeps the backdrop of its target's previous render](../18-webgl2-readback-stale-backdrop.md)
- **Title:** `` WebGLState: Track the read framebuffer binding. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `webgl-framebuffer-read-binding`
- **Patch:** [`patches/18-webgl-framebuffer-read-binding.diff`](../patches/18-webgl-framebuffer-read-binding.diff) -- `src/renderers/webgl-fallback/utils/WebGLState.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b webgl-framebuffer-read-binding
git apply <path to>/docs/upstream-three/dev/patches/18-webgl-framebuffer-read-binding.diff
npm run lint && npm run test-unit
git commit -am "WebGLState: Track the read framebuffer binding." -m "Related issue: #<issue number>"
git push -u origin webgl-framebuffer-read-binding
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

On the WebGL backend, after `readRenderTargetPixelsAsync()` the next bind of the same render target never reaches GL: `bindFramebuffer()` caches `gl.FRAMEBUFFER` but records only the draw side, and the readback leaves the read binding elsewhere. A transmission material rendered into that target then copies its backdrop from the default framebuffer and keeps its first frame.

The read binding is recorded when `gl.FRAMEBUFFER` is bound, and `gl.FRAMEBUFFER` counts as cached only while the draw and read bindings are the same framebuffer; once either is bound alone to another, the next `gl.FRAMEBUFFER` bind reaches GL.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: read back between two renders into one target, 0 of the 8 pixels through the lens change on WebGL 2 on `dev` and 8 with this patch; WebGPU changes 8 on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
