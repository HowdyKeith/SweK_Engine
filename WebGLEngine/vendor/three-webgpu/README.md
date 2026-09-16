# three.js 0.184.0 -- the WebGPU build and TSL (v4319, bumped at v4537)

Vendored from the npm tarball `three@0.184.0` (https://registry.npmjs.org/three/-/three-0.184.0.tgz),
`build/three.webgpu.js`, `build/three.core.js`, `build/three.tsl.js` and `LICENSE` (MIT, three.js authors).
Beside, not instead of, `vendor/three/three.module.js` (r160), which main.js and every three.js page still
use: the two builds are separate copies of THREE and must not meet in one page (instanceof breaks).

ONE EDIT: `three.tsl.js` imports `from 'three/webgpu'`, a bare specifier that needs an import map. It is
rewritten here to `from './three.webgpu.js'` so a page (and the ship harness, which loads modules by path)
can import it without one. Nothing else is changed; `three.webgpu.js` imports `./three.core.js` as shipped.

Use: `import * as THREE from "./vendor/three-webgpu/three.webgpu.js"` and
`import { Fn, uv, vec4, ... } from "./vendor/three-webgpu/three.tsl.js"`. `new THREE.WebGPURenderer({ canvas,
forceWebGL })` picks WebGPU or the WebGL2 backend; `await renderer.init()` first.

## Why 0.184 and not the newest -- MEASURED, not chosen

v4319 pinned 0.178 because three@0.185 REFUSED on this shell's Chromium: r185 gained a
`GPUTextureViewDescriptor` class carrying `this.swizzle = 'rgba'`, and this browser's WebGPU has no such
member -- `Failed to read the 'swizzle' property from 'GPUTextureViewDescriptor'`. That is a fact about the
BROWSER rather than about three, and it is still true today.

*** NOBODY HAD TESTED THE BOUNDARY. *** render/threeProbe.mjs carried `PROBE_VERSIONS = ["0.185.1"]` -- the
newest -- and the gate's own closing line named the gap: "unchecked here: versions other than 0.185.1". The
version that mattered was never the newest; it was the OLDEST one that clears the requirement. Measured at
v4537, with the tree's own probe page on this box:

    0.178 (was vendored)   no GPUTextureViewDescriptor class, no this.swizzle   draws on WebGPU
    0.184.0                no GPUTextureViewDescriptor class, no this.swizzle   DRAWS ON WebGPU, rev 184
    0.185.1                the class, and `this.swizzle = 'rgba'` twice         REFUSES on WebGPU

The refusal arrives AT 0.185, so 0.184 is the last version before it. PROBE_VERSIONS covers both sides of
that line now, so the boundary is asserted every run rather than remembered.
