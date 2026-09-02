# three.js 0.178.0 -- the WebGPU build and TSL (v4319)

Vendored from the npm tarball `three@0.178.0` (https://registry.npmjs.org/three/-/three-0.178.0.tgz),
`build/three.webgpu.js`, `build/three.core.js`, `build/three.tsl.js` and `LICENSE` (MIT, three.js authors).
Beside, not instead of, `vendor/three/three.module.js` (r160), which main.js and every three.js page still
use: the two builds are separate copies of THREE and must not meet in one page (instanceof breaks).

ONE EDIT: `three.tsl.js` imports `from 'three/webgpu'`, a bare specifier that needs an import map. It is
rewritten here to `from './three.webgpu.js'` so a page (and the ship harness, which loads modules by path)
can import it without one. Nothing else is changed; `three.webgpu.js` imports `./three.core.js` as shipped.

Use: `import * as THREE from "./vendor/three-webgpu/three.webgpu.js"` and
`import { Fn, uv, vec4, ... } from "./vendor/three-webgpu/three.tsl.js"`. `new THREE.WebGPURenderer({ canvas,
forceWebGL })` picks WebGPU or the WebGL2 backend; `await renderer.init()` first.
