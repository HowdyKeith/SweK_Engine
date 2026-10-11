# three.js 0.186.1 -- the WebGPU build and TSL (v4805, re-vendored from 0.185.1; v4319 from 0.178.0)

Vendored from the npm tarball `three@0.186.1` (https://registry.npmjs.org/three/-/three-0.186.1.tgz),
`build/three.webgpu.js`, `build/three.core.js`, `build/three.tsl.js` and `LICENSE` (MIT, three.js authors).
Beside, not instead of, `vendor/three/three.module.js` (r160 until 2026-09-14, 0.185.1 until v4807, 0.186.1
since -- the same three.core.js as this directory, byte for byte), which main.js and every three.js page use: the two builds are separate copies of THREE and must not meet in one page (instanceof breaks).

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

-- v4805: 0.185.1 -> 0.186.1, AND WHAT THAT REOPENS --

The rig answered for `0.185.1`; nothing has answered for `0.186.1` on a rig. It was moved anyway, for what r186 fixes in the
engine's own path: three's previous instance matrix (#34101, #34107) and a batch's previous position (#34100) -- the r185
drafts 01 and 02, which `docs/upstream-three/dev/README.md` records as fixed -- and because the issues ready to post are
written against r186, so the engine now runs the release they are filed on. This build box draws it on WebGPU and on WebGL 2
through the ship harness (`tools/ship/webgpuHarness.mjs`: Chromium 141, SwiftShader) -- while `three-probe.html` on this box's
headless shell still refuses WebGPU with v4319's swizzle error, as it did for 0.185.1; that is the build box's answer, which is exactly what v4319's refusal taught
this file not to take for the fleet's. `threeProbe-selfcheck.mjs` section 3 says RIG-PENDING for `0.186.1` until
`three-probe.html`, opened on a rig, saves a new `tools/ship/three-probe.json`.

The `0.185.1` files are kept, unchanged, in `vendor/three-webgpu-r185/`: the r185 drafts and their patches run on them, and
nothing else does. The bytes here are npm's: `docs/upstream-three/dev/record.json` names each file's sha256
(`releaseFiles`), and `threeUpstream-selfcheck.mjs` section 6 holds this directory to it.
