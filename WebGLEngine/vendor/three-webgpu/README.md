# three.js 0.185.1 -- the WebGPU build and TSL (v4319, re-vendored from 0.178.0)

Vendored from the npm tarball `three@0.185.1` (https://registry.npmjs.org/three/-/three-0.185.1.tgz),
`build/three.webgpu.js`, `build/three.core.js`, `build/three.tsl.js` and `LICENSE` (MIT, three.js authors).
Beside, not instead of, `vendor/three/three.module.js` (r160), which main.js and every three.js page still
use: the two builds are separate copies of THREE and must not meet in one page (instanceof breaks).

ONE EDIT: `three.tsl.js` imports `from 'three/webgpu'`, a bare specifier that needs an import map. It is
rewritten here to `from './three.webgpu.js'` so a page (and the ship harness, which loads modules by path)
can import it without one. Nothing else is changed; `three.webgpu.js` imports `./three.core.js` as shipped.

Use: `import * as THREE from "./vendor/three-webgpu/three.webgpu.js"` and
`import { Fn, uv, vec4, ... } from "./vendor/three-webgpu/three.tsl.js"`. `new THREE.WebGPURenderer({ canvas,
forceWebGL })` picks WebGPU or the WebGL2 backend; `await renderer.init()` first.

-- WHY 0.185.1, AND WHY NOT UNTIL NOW --

v4319 tried `three@0.185` and it was refused on that session's headless Chromium: a `GPUTextureViewDescriptor`
carrying a `swizzle` field the browser's WebGPU implementation did not know about
(`GPUTextureComponentSwizzle`), so `0.178.0` was vendored instead because it ran unpatched. `render/threeProbe.mjs`
and `three-probe.html` exist to ask a real rig the same question rather than trust one sandboxed build box's
answer. `tools/ship/three-probe.json` (Keith's rig, Chrome 152, 2026-09-08) says the rig draws `0.185.1` on
WebGPU cleanly -- the refusal was that build box's WebGPU implementation lagging the spec, not a fact about
`0.185.1` itself or about the fleet. `threeProbe-selfcheck.mjs` section 3 grades that record and says so in
its own words: "THE PIN WAS THE BUILD BOX'S: a rig draws the newer build on WebGPU."

npm's current latest at the time of this re-vendor is `0.186.0`; `0.185.1` was picked because it is the exact
build the rig already measured -- moving to `0.186.0` untested would just re-open the same question this file
exists to close.
