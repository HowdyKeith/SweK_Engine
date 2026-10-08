# three.js 0.185.1 -- KEPT, NOT USED: the build the r185 drafts run on (v4805)

These are the exact bytes `vendor/three-webgpu/` held from 2026-09-08 until v4805, when the engine moved to `0.186.1`:
`build/three.webgpu.js`, `build/three.core.js`, `build/three.tsl.js` and `LICENSE` from the npm tarball `three@0.185.1`
(https://registry.npmjs.org/three/-/three-0.185.1.tgz), with the same one edit -- `three.tsl.js`'s bare
`from 'three/webgpu'` rewritten to `from './three.webgpu.js'`. `three.webgpu.js` is three's own rollup build of its r185 tag
byte for byte (sha256 `50e4013dd390...`, recorded at v4774 by `tools/ship/threeUpstream-selfcheck.mjs`).

NOTHING IN THE ENGINE IMPORTS THIS. It is here for `docs/upstream-three/`: the fourteen r185 drafts and their patches against
three's r185 source, which `tools/ship/threePatch.mjs` applies to this bundle, and which `threeUpstream-selfcheck.mjs`
(sections 1-5) and `threeUpstreamPaths-selfcheck.mjs` run on it, unpatched and patched, on both backends. The drafts ready to
post are `docs/upstream-three/dev/`, against r186 and three's `dev`; these are their history, still held to what r185 does.

Kept rather than dropped because a draft whose reproduction nobody can run is a claim nobody holds -- and because git stores
these blobs once: they are the same objects the tree has carried since 2026-09-08, so the copy costs the repository nothing.
