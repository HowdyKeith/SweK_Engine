# PR: Tests: Use an r32float storage texture in the textureBarrier test.

<!-- DRAFT, NOT POSTED. A pull request with no issue: a unit test that fails on adapters without 'texture-formats-tier2'.
Held by tools/ship/threeTextureBarrier-selfcheck.mjs, which runs three's own test file before and after the diff. -->

- **Title:** `` Tests: Use an r32float storage texture in the textureBarrier test. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `test-texture-barrier-r32float`
- **Patch:** [`texture-barrier-r32float.diff`](texture-barrier-r32float.diff) -- `test/unit/src/nodes/tsl/GPUBarriers.tests.js`
  (the file as it stands at `11738a9` is kept beside it as [`GPUBarriers.tests.js.txt`](GPUBarriers.tests.js.txt); it is unchanged
  through `286e2d8`, 13 October)

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b test-texture-barrier-r32float
git apply <path to>/docs/upstream-three/dev/unit/texture-barrier-r32float.diff
npm run lint && npm run test-unit
git commit -am "Tests: Use an r32float storage texture in the textureBarrier test."
git push -u origin test-texture-barrier-r32float
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: none (follows #34918, which added the test)

**Description**

The `textureBarrier` test in `GPUBarriers.tests.js` makes its `StorageTexture` `FloatType` with the default `RGBAFormat`, which is `rgba32float`, and accesses it `read_write`. Core WebGPU allows `read_write` storage access only on `r32float`, `r32sint` and `r32uint`; `rgba32float` needs the optional `texture-formats-tier2` feature. On an adapter without it the bind group layout fails validation:

```
Texture format TextureFormat::RGBA32Float does not support storage texture access StorageTextureAccess::ReadWrite.
```

The kernel never runs, the output keeps its zero, and the test reports a sum of 0 where it expects 10. That reads like a barrier bug, but the barrier never runs.

The test only reads `.r` back, so this sets `storageTex.format = RedFormat`, which makes it `r32float`, and says why in the comment that already explains `FloatType`.

Tested in headless Chromium with SwiftShader (Vulkan), whose adapter does not offer `texture-formats-tier2`. On `dev` the test fails with the error above. With this patch it passes, its texture `r32float`, and the `storageBarrier` test beside it still passes. `npm run test-unit` on `dev` with this patch: 1894 tests, 1892 passed, 1 todo, 1 failed. The failure is the integer `mod()` test on the WebGL 2 backend (ANGLE over SwiftShader), which fails on `dev` the same way. The 169 WebGPU and 169 WebGL 2 GPU tests all ran, none skipped. `npm run lint` is clean.

One limit, not changed here: on SwiftShader the test also passes with the `textureBarrier()` call removed, because the four invocations of one workgroup run in lockstep. So on such an adapter it shows that the barrier compiles, validates and runs in a correct kernel, not that it orders anything.
