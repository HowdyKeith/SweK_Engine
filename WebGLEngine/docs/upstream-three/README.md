# three.js bug reports -- DRAFTS, NOT POSTED

Found while building SweK_Engine's FSR3 frame generation on three.js r185 (v4752-v4762). Each draft carries a minimal
standalone reproduction that imports three from a CDN, the cause, and a patch against three's `src/` at the r185 tag
(`patches/`, v4771). `tools/ship/threeUpstream-selfcheck.mjs` runs every reproduction against the vendored r185 on both backends
and holds the numbers each draft states; then applies each draft's patch alone to a copy of r185's build, runs the reproduction
on it, and holds the fix and the numbers the draft states for it; `tools/ship/threeUpstreamPaths-selfcheck.mjs` (v4773) runs each
patch on the paths its reproduction does not take, and holds each draft's "paths" block. Posting them is the maintainer's call.

- [VelocityNode: an InstancedMesh's previous instance matrix is its current one](01-velocity-instancedmesh.md) -- observed: plain 5.612, instanced 0.000, many 11.224 (px, both backends); patched: plain 5.612, instanced 5.612, many 5.612 (px, both backends)
- [VelocityNode: a BatchedMesh's previous position never gets the instance's matrix](02-velocity-batchedmesh.md) -- observed: plain 5.612, batched 1.871 (px, both backends); patched: plain 5.612, batched 5.612 (px, both backends)
- [VelocityNode: a morphed mesh's previous position is the unmorphed one](03-velocity-morph.md) -- observed: plain 5.612, morphed 1.871 (px, both backends); patched: plain 5.612, morphed 5.612 (px, both backends)
- [VelocityNode drawn outside MRT: the previous positions are never built](04-velocity-outside-mrt.md) -- observed: plain 5.612, drawn 1.871, mrt 5.612, mrtSameFrame 0.000 (px, both backends); patched: plain 5.612, drawn 5.612, mrt 5.612, mrtSameFrame 0.000 (px, both backends)
- [Sprite: `center` is taken from the first sprite that built a shared program](05-sprite-center-shared-program.md) -- observed: offCentre 38.5, centredAfter 38.5, centredUnlike 31.5 (both backends); patched: offCentre 38.5, centredAfter 31.5, centredUnlike 31.5 (both backends)
- [WebGL2 backend: only the first particle system's compute runs](06-webgl2-second-compute.md) -- observed: webgpu moved [true, true]; webgl2 moved [true, false]; patched: webgpu moved [true, true]; webgl2 moved [true, true]
- [SkinnedMesh: the pose follows the bones once per browser frame](07-skinned-pose-once-a-frame.md) -- observed: plain [142, 142], skinned [0, 142], skinnedUpdated [142, 142] -- pixels left and right of the centre; the renders in one browser frame: true (both backends); patched: plain [142, 142], skinned [142, 142], skinnedUpdated [142, 142] -- pixels left and right of the centre; the renders in one browser frame: true (both backends)
- [InstancedMesh past the uniform buffer: the third render in a browser frame draws the second's matrices](08-instanced-large-third-render.md) -- observed: one [142, 144, 142], many [0, 144, 142], manyDynamic [142, 144, 142] -- pixels in the left, middle and right thirds; the renders in one browser frame: true (both backends); patched: one [142, 144, 142], many [142, 144, 142], manyDynamic [142, 144, 142] -- pixels in the left, middle and right thirds; the renders in one browser frame: true (both backends)
- [BatchedMesh: grown by setInstanceCount, it is drawn from its old matrices texture](09-batched-grown-old-texture.md) -- observed: grown [22.4, 28, 28, 28, 28], grownMaterialUpdated [22.4, 28, 33, 39, 44.5] -- the centre x of each frame's pixels, the batch grown before the third (both backends); patched: grown [22.4, 28, 33, 39, 44.5], grownMaterialUpdated [22.4, 28, 33, 39, 44.5] -- the centre x of each frame's pixels, the batch grown before the third (both backends)
- [computeSkinning under a velocity MRT: the compute shader names positionPrevious and never runs](10-compute-skinning-under-velocity-mrt.md) -- observed: webgpu: noMRT 0.5, velocityMRT 0; webgl2: noMRT 0.5, velocityMRT 0.5 -- the mean x the compute wrote, the bone at 0.5; patched: webgpu: noMRT 0.5, velocityMRT 0.5; webgl2: noMRT 0.5, velocityMRT 0.5 -- the mean x the compute wrote, the bone at 0.5
- [WebGL2 backend: a compute writing a plain storage buffer reads every instanceIndex as 0](11-webgl2-compute-instance-index.md) -- observed: webgpu: storageBuffer 8, instancedArray 8; webgl2: storageBuffer 1, instancedArray 8 -- the distinct points the compute wrote, of a box's 8 corners; patched: webgpu: storageBuffer 8, instancedArray 8; webgl2: storageBuffer 8, instancedArray 8 -- the distinct points the compute wrote, of a box's 8 corners
- [WebGL2 backend: a storage buffer named without its count gives its attribute node's hash, and the compute never links](12-webgl2-storage-without-count.md) -- observed: webgpu: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6; webgl2: withCount 1 2 3 4 5 6, withoutCount 0 0 0 0 0 0 -- the x of each element the compute copied; patched: webgpu: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6; webgl2: withCount 1 2 3 4 5 6, withoutCount 1 2 3 4 5 6 -- the x of each element the compute copied
- [InstancedMesh with per-instance morphs: absolute targets throw, and so does a mesh-level morphTargetInfluences](13-instanced-morph-absolute-and-mesh-level.md) -- observed: relative 16.0/12 0.0/12; absolute throws: Cannot read properties of undefined (reading 'reduce'); relative+mesh throws: Cannot set properties of null (setting '0'); absolute+mesh throws: Cannot set properties of null (setting '0') -- each instance's centre x/width in pixels (both backends); patched: relative 16.0/12 0.0/12; absolute 16.0/12 0.0/12; relative+mesh 16.0/12 0.0/12; absolute+mesh 16.0/12 0.0/12 -- each instance's centre x/width in pixels (both backends)

## Checked with three's own tools (v4774)

In a checkout of three's `r185` tag -- release 0.185.1, the one vendored here and the one every number above was measured on:

- `npm run build` of the tag, unpatched: `three.webgpu.js` and `three.core.js` are the vendored files byte for byte
  (`three.tsl.js` differs only by the vendoring's one edit, its import of `three/webgpu` made relative).
- The patches applied with `git apply`, in order -- all nine since v4775, all eleven since v4790, all twelve since v4792, all thirteen since v4793; 08 changes the same import line of `Instance.js` as
  01, and that line was merged by hand, to `import { OnBeforeObjectUpdate } from '../utils/EventNode.js';` --
  `npm run lint-core` is clean, and `npm run build` makes the same bytes the gates' applier makes from the vendored build, but
  for the order of the names in its one import from `three.core.js`: rollup lists them by first use, and patch 02 uses three of
  them earlier.
- Three's unit tests (`test/unit`, run in headless Chromium with QUnit served locally): 1311 tests, 1310 passed, 1 todo,
  0 failed, with the six and with the nine, again at v4786 with 07 keyed on the render, at v4788 with 03 reaching per-instance morphs, at v4790 with all eleven, at v4792 with all twelve, and at v4793 with all thirteen -- the same as the unpatched tag. They exercise none of the paths the patches change.
- All of them together, on one build (since v4787; thirteen since v4793): every reproduction, and every path in `tools/ship/threeUpstreamPaths-selfcheck.mjs`,
  prints what it prints with its own patch alone -- but for 04's `mrtSameFrame`, which patch 07 fixes as well (04's "together" block).
- Three's e2e tests (`test/e2e`), at v4789 in a checkout of the r185 tag with its examples, run by
  [`e2e/puppeteer-local.diff`](e2e/puppeteer-local.diff) -- three's runner with this box's flags for presenting WebGPU on
  SwiftShader, and the workaround this tree's harness installs for its Chromium rejecting three's string `swizzle` -- recorded in
  [`e2e/v4789.json`](e2e/v4789.json) for the nine [`e2e/v4790.json`](e2e/v4790.json) for eleven [`e2e/v4792.json`](e2e/v4792.json) for twelve and [`e2e/v4793.json`](e2e/v4793.json) for all thirteen: 187 WebGPU examples, 176 passed and the same 11 failed on r185 and with the patches, each
  for the same reason (seven a 2D view of a 3D texture -- since v4791 known to be this Chromium's (141): it fails any `writeTexture` into a 3D
  texture with `RENDER_ATTACHMENT` usage in raw WebGPU, three or no three, on a view it makes itself; two a fetch that failed here; one video,
  `RAF is not defined`; one XR layers example 0.4% of its pixels off); 185 of the 187 screenshots the same bytes, and the
  other two vary between runs of one build, whichever build it is. The WebGL examples load `three.module.js`, which no patch changes.

`tools/ship/threeUpstream-selfcheck.mjs` holds the hash of each build; a patch changed since makes the patched one stale.
