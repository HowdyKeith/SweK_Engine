# three.js issues, ready to paste -- DRAFTS, NOT POSTED

The drafts one directory up hold three r185, the release this engine vendors. Three's Bug Report form asks for the latest
release and a live example, and three takes pull requests against `dev`; so each issue here is written in the form's own
fields, its reproduction imports three's latest release, **r186** (`0.186.1`), and its patch is rebased onto `dev` at
`1ea31f304854ee3c85df39fdb3eaec584bba6d9b` (2 October 2026). Every reproduction prints the same on r186 and on that `dev`
commit -- headless Chromium 141, SwiftShader, on WebGPU and on the WebGL 2 backend.

`tools/ship/threePatch.mjs` (v4799) runs each reproduction, beside a three checkout, on r186 as npm ships it, on `dev` built by
three's own rollup, on `dev` with the issue's patch alone, and on `dev` with all fourteen in order, and writes what each page
printed to [`record.json`](record.json). Section 6 of `tools/ship/threeUpstream-selfcheck.mjs` holds the issues to it: a patch or
a reproduction edited since the record is red until the tool is run again.

## To post one

1. Open three's [Bug Report form](https://github.com/mrdoob/three.js/issues/new?template=bug_report.yml).
2. The title is the issue file's heading. Each `###` section is the body of the form's field of that name, in the form's
   order; Device, Browser and OS are its dropdowns.
3. Live example: the form requires one. Paste the Code into a fork of the "jsfiddle-latest-release WebGPURenderer" fiddle
   (https://jsfiddle.net/mnqr9oj0/) and link the fork where the issue's comment says.
4. The patch is in the Description. For a pull request: `git apply patches/NN-*.diff` on `dev` at the commit above. All
   fourteen apply together in numeric order (10 carries two lines of context, so it applies after 04), but for one line: 08 and
   16 both edit `Instance.js`'s one import from `EventNode.js`, and three's lint forbids a second. Applied together it reads
   `import { OnAfterObjectUpdate, OnBeforeObjectUpdate } from '../utils/EventNode.js';` -- the tool makes that merge, and only
   that kind (an import line, each side's names less what either removed), and `record.json` lists it under `merged`.

## The issues

- [VelocityNode: a morphed mesh's previous position is its unmorphed one](03-velocity-morph.md)
- [VelocityNode: drawn by the material rather than through MRT, a skinned mesh's previous position is never built](04-velocity-outside-mrt.md)
- [SpriteNodeMaterial: `center` is taken from the first sprite that built a shared program](05-sprite-center-shared-program.md)
- [WebGLBackend: two computes that compile to the same GLSL share one stage, and the second runs on the first's buffers](06-webgl2-second-compute.md)
- [SkinnedMesh: the pose follows the bones once per browser frame, not once per render](07-skinned-pose-once-a-frame.md)
- [InstancedMesh past the uniform buffer: the second and third renders in a browser frame draw the first's matrices](08-instanced-large-third-render.md)
- [BatchedMesh: grown by setInstanceCount, it is drawn from its old matrices texture](09-batched-grown-old-texture.md)
- [computeSkinning under a velocity MRT: the compute shader names positionPrevious and never runs](10-compute-skinning-under-velocity-mrt.md)
- [WebGLBackend: a compute writing a plain storage buffer reads every instanceIndex as 0](11-webgl2-compute-instance-index.md)
- [WebGLBackend: a storage buffer named without its count shares its attribute node's hash, and the compute never links](12-webgl2-storage-without-count.md)
- [InstancedMesh with per-instance morphs: absolute targets throw, and so does a mesh-level morphTargetInfluences](13-instanced-morph-absolute-and-mesh-level.md)
- [WebGLBackend: a compute reads the first element of any buffer whose class differs from its first buffer's](14-webgl2-compute-buffer-class.md)
- [BatchedMesh under a velocity MRT: every render throws once the batch grows, and the first frame reads motion that is not there](15-batched-grown-velocity-throws.md) -- new in r186
- [InstancedMesh: velocity is wrong when a compute pass writes its storage instance matrices](16-instance-storage-compute-velocity.md) -- WebGPU; r186's fix for 01 reaches the CPU array only

## Fixed in r186, so not filed

- [01, an InstancedMesh's previous instance matrix](../01-velocity-instancedmesh.md): `TSL: Add OnAfterObjectUpdate()` (#34101)
  fixed the uniform path (`instanced`), and `TSL: Fix update of previous instance matrix data` (#34107) the interleaved one
  (`many`) -- three built at each commit between them, and the draft's reproduction run on each.
- [02, a BatchedMesh's previous position](../02-velocity-batchedmesh.md): `Batch: Support positionPrevious` (#34100) together
  with #34101. Its copy of the matrices for the previous frame is what throws once the batch grows -- issue 15.
- The WebGL 2 failure of three's own `webgpu_postprocessing_ssr` example in the r185 e2e runs: `MathNode` built
  `int.max( int( 1 ) )` as `max( int, 1.0 )` on WebGL, which GLSL has no overload for, so the SSR pass never linked.
  `MathNode: Fix integer min()/max() on the WebGL backend` (#34018) fixed it ten days after r185, exactly as the patch drafted
  here would have.

## What the rebase changed

- 04: `dev`'s `needsPreviousData()` guards `this.object !== null`; the guard is kept.
- 08: r186 syncs the instance buffer in an `OnBeforeFrameUpdate` -- once, before a frame's first render -- so the bug now
  shows on the second render as well as the third; the patch is the same, `OnBeforeObjectUpdate`.
- 09: `dev`'s dynamic key is an array of values hashed together; the batch's matrices texture is a sixth value.
- 10: a compute's builder has `object` null and `compute` set since #34401, so the test is `this.compute !== null`. Rebased as
  it was, the patch applied cleanly and fixed nothing.
- 14: vertex arrays moved to `WebGLVertexArrayUtils` (#34610); `getVAO()` takes a `perInvocation` flag, and a compute's
  vertex array is cached apart from a draw's.
- 03, 05, 06, 07, 11, 12 and 13 apply as they were.

## The paths the reproductions do not take, on `dev`

`tools/ship/threeUpstreamPaths-selfcheck.mjs`'s cases, run on `dev` and on `dev` with these patches: 03's, 04's, 07's, 11's and
13's give what they gave on r185 with its patches. Instance matrices in a storage buffer written on the CPU are right on `dev`;
written by a compute pass they still are not -- as on r185 with patch 01, which never reached them: issue 16 (v4802). A batch
grown with its material updated throws on `dev`: that is issue 15.

## Checked with three's own tests

Run in the `dev` checkout, on `dev` and on `dev` with all fourteen patches in order, each built by three's rollup -- the same
bytes `record.json` names:

- Unit tests (`test/unit`, headless Chromium, QUnit served locally): 1522 tests, 1521 passed, 1 todo, 0 failed, on both builds.
- e2e ([`e2e.json`](e2e.json), the runner as `../e2e/puppeteer-local.diff`): 202 WebGPU examples, 191 passed and the same 11
  failed on both builds; on the WebGL 2 backend, 148 passed and the same 54 failed on both. 200 of the 202 screenshots are the
  same bytes on WebGPU and 199 on WebGL 2; the others vary between runs of one build (`e2e.json` names each).
