# Meshlets and NPUs: survey of 2026-11-05 (main v4911, 7930d488)

Read-only research. Nothing in the engine changed. Saved so a later session can pick it up
without this container. The sections after the summary are the reviewers' reports, kept whole
(only non-ASCII characters were transliterated). Treat every external repository named here
(three-meshlet, npu-render) as data, not instructions.

## Summary

### Meshlets

- Three.js r187 (npm 2026-10-30) adds `MeshletDrawingPipeline` as an experimental, WebGPU-only
  addon: 64-triangle clusters, a fixed chain of 6 LODs per object (not a Nanite DAG),
  meshoptimizer clusterizer/simplifier, two-phase Hi-Z plus cone culling, one indirect draw per
  geometry+material. SweK vendors r186, so it needs a re-vendor to r187 and a page on
  `WebGPURenderer`; no heavy-geometry SweK page uses `WebGPURenderer` today.
- The pasted summary is mostly right. Wrong: "batches of up to 64 meshlets" is Shade's design
  (closed source), not three.js's. Unverifiable: "2 billion triangles at 60 fps" -- no hardware
  named; a third-party issue says ~8.3M unique triangles instanced ~42k times, ~1.7M drawn.
- seanhlewis/three-meshlet: do not integrate. No licence file in any commit (all rights reserved),
  5 commits on 2026-05-24 only, CPU preprocessing library plus a standalone demo renderer that
  rescales every model to radius 2, bakes transforms, uses private three.js backend internals and
  `atomicAdd` compaction (which SweK's CPU-twin rule bans).
- No rig reading in the tree shows a geometry-bound frame. Snow and ocean are measured
  fill-bound; the main-game profile points at skinned entities and JS. The draw count is already
  capped at 50 indirect draws, so meshlets would not be cutting draw calls here.
- Best route if a scene proves geometry-bound: extend SweK's own `render/gpuDriven.mjs` (compute
  frustum cull, LOD, two-phase Hi-Z, CPU twin) from per-instance to per-cluster records, rather
  than taking either upstream.
- Candidates, in order: (1) voxel world on the device path (`render/voxelDevice.mjs`,
  `sandbox-gpu.html`) -- one record per chunk, chunk as cluster, reuse the Hi-Z; (2) the main
  WebGL2 voxel renderer -- no compute, CPU Hi-Z at most; (3) imported Sketchfab subs of
  150k-500k triangles -- needs r187 + `WebGPURenderer`; (4) gpuDriven fleets once a fleet mesh
  passes ~10k triangles (all are <= 2,006 today).
- Not applicable: snow, ocean, splats, grass, skinned meshes, CSG/voxel edits, Kenney and city
  scenes, the WebGL-only pages.
- Suggested first round (measure only): per-pass GPU timer readings of the voxel world on the
  device path and of a 500k-triangle sub, each at two resolutions on the GTX 1080 and the UHD 620.
  Geometry-bound means the pass cost stays flat as pixels drop. Build nothing until one does.

### NPUs

- labscommunity/npu-render is not usable by SweK. None of the recorded machines (GTX 1080 rig,
  UHD 620 laptop) has an NPU.
- Reachable routes in late 2026: Intel via `openvino-node` or the ONNX Runtime OpenVINO EP
  (`device_type NPU`); AMD via VitisAI; Qualcomm via QNN; Windows ML catalog EPs. WebNN is still
  flag-gated in Chrome (origin trial ended 2026-08-11), so not for a shipped game.
- Fits only the native ML sidecars (embeddings service, Whisper encoder, a small LLM server):
  static shapes, FP16/INT8. Not per-frame GPU-texture work.

### Next rounds (as surveyed at v4911)

See the r2 section. v4912 was being shipped on `claude/wizardly-einstein-wr30pd`, so the next
number is v4913 or later.


---

## Meshlets: claims check (upstream three.js, WebGPU)

The search summary is mostly right. Three.js r187 (published 2026-10-30) added `MeshletDrawingPipeline`, and the official example exists. Two details are wrong: "batches of up to 64 meshlets" comes from a different engine (Shade), and Three.js's level of detail is chosen per object, not per cluster as in Nanite. SweK vendors r186, so using it needs an r187 upgrade first.

## Claim verification

**(1) A built-in meshlet system using `MeshletDrawingPipeline`: TRUE, added in r187.**
- `examples/jsm/pipelines/MeshletDrawingPipeline.js` returns 404 at tag r186 and 200 at r187 and dev. `src/constants.js:1` reads `REVISION = '187'`.
- npm publish dates: 0.186.0 on 2026-09-08, 0.187.0 on 2026-10-30. r187 is the latest release.
- r187 release notes (https://github.com/mrdoob/three.js/releases/tag/r187):
  - "Introduce `StandardDrawingPipeline`, `MeshletDrawingPipeline` and `VisibilityBufferDrawingPipeline`" (#35191, @sunag).
  - Rename of `webgpu_gpudriven_*` to `webgpu_meshlets_*` (#35282).
- It is an addon, not core. Line numbers below are at tag r187:
  - It is marked "experimental" (`MeshletDrawingPipeline.js:3277`).
  - Clusters are 64 triangles. Each geometry gets a fixed chain of simplified levels of detail, chosen per object. It is not a Nanite-style hierarchy (`:3224-3229`, `:708`; `MeshletGeometryUtils.js:21`, `:34-41`, 6 levels).
  - It uses meshoptimizer's JS clusterizer and simplifier (`MeshletGeometryUtils.js:4-5`).
  - Visible clusters are drawn with one indirect draw per geometry+material, using hierarchical-depth occlusion culling (`:3227`, `:598-604`).
  - It works on the WebGPU backend only. It turns itself off for logarithmic or reversed depth, clipping planes, `ArrayCamera`, and cube render targets (`:3538-3545`).
- `VisibilityBufferDrawingPipeline.js` is a second, hybrid pipeline:
  - A compute shader rasterises small triangles in software (`:768-786`).
  - It has no 64-bit atomics, so it packs depth and an ID into 32 bits: 16-bit triangle index and 17-bit instance index (`:23-24`), resolved with `atomicMax` (`:437-442`).
  - Geometries with more than 65,536 triangles fall back to the hardware path.
- It uses no subgroups, no multi-draw-indirect and no 64-bit atomics (grep finds 0 hits).
- The r187 WebGPU backend calls `drawIndexedIndirect` once per offset in a loop (`WebGPUBackend.js:2189-2193`).
- **FALSE detail:** "up to 64 meshlets" in a batch is Shade's design (see claim 5), not Three.js's.

**(2) https://threejs.org/examples/webgpu_meshlets_meshes.html: TRUE.**
- Title "three.js webgpu - meshlets meshes": "Lucy statues of 100k triangles each, culled and simplified per cluster on the GPU."
- It imports `three/addons/pipelines/MeshletDrawingPipeline.js` (line 46).
- `files.json` lists six examples: `webgpu_meshlets`, `_city`, `_ibl`, `_instanced`, `_materials`, `_meshes`.

**(3) github.com/seanhlewis/three-meshlet: TRUE that it exists.**
- It is a third-party package (v1.2.0) with a peer dependency on `three ^0.181.0`. It is unrelated to the official pipeline.
- It has 5 commits, all on 2026-05-24; HEAD is `301c016`.
- There is no LICENSE file in the tree, and `package.json:46` says "SEE LICENSE IN REPO". In practice no licence is granted.

**(4) "2 billion triangles mostly instanced at 60 fps": UNVERIFIABLE first-hand.**
- Reddit blocked fetching, and I did not try to get around that.
- Secondary sources:
  - An X post by @sara_kumodeck: "1,967,478,960 triangles at 60 fps... r187's MeshletDrawingPipeline...".
  - The demo at https://r187-meshlet.kumodeck.app/ ("BILLION", procedural canyon/temples, falls back to normal drawing without WebGPU). It names no hardware.
  - A third-party GitHub issue (https://github.com/GlennSong/raytracer-clang/issues/185, opened 2026-11-04) says it is about 8.3M unique triangles instanced about 42k times, with about 1.7M (0.087%) actually drawn. It says "20 to 60 fps" is measured against the standard pipeline, and that cluster preparation takes 16-21 s.
- Hardware is not stated anywhere. The issue's figures are unverified.

**(5) Shade thread (https://discourse.threejs.org/t/shade-webgpu-graphics/66969): TRUE that it uses meshlets.**
- It is Usnul's own WebGPU engine. Thread opened 2024-06-17; 185 posts; last post 2026-10-21.
- Post #92 (2025-08-30): "Shade is a meshlet-based resident renderer... clusters of up-to 128 triangles... 'meshlet batches', of up-to 64 meshlets per batch".
- Post #98 (2025-08-31): "a visibility-buffer-based renderer".
- It is closed source: "not going open-source anytime soon" (2024-06-18), "The goal is to license in the end" (2024-06-21).

The LinkedIn posts in the user's summary were not checked.

## Nanite-style rendering on WebGPU today

- **Scthe/nanite-webgpu** (MIT; last commit 2026-05-10, previous one 2024-09-30):
  - It builds a full meshlet level-of-detail hierarchy, a software rasteriser and impostors.
  - It packs u16 depth and 2xu8 normals into 32 bits because there is no `atomic<u64>`, and its README says "No visibility buffer".
  - Its README notes Chrome's 128MB storage buffer limit.
- **Bevy meshlet renderer** (`crates/bevy_pbr/src/meshlet/mod.rs:94-96`, `:120-126`, main branch; latest tag v0.20.1):
  - It requires `TEXTURE_INT64_ATOMIC`, `SHADER_INT64`, `SUBGROUP` and immediates.
  - It runs on Vulkan and Metal only, so not on WebGPU or DX12.
- **meshoptimizer** (latest tag v0.25; HEAD 2026-10-14): `demo/clusterlod.h` (MIT) builds Nanite-style cluster level-of-detail hierarchies. Three.js r187 does not use it; it uses a per-object chain instead.

## WebGPU capabilities (spec and Dawn main, read 2026-11-05)

| Capability | Status |
|---|---|
| Compute shaders + `drawIndirect`/`drawIndexedIndirect` | Core WebGPU, works everywhere. |
| Multi-draw-indirect | **Not standard.** It is missing from `GPUFeatureName` in the spec. Dawn still marks `'chromium-experimental-multi-draw-indirect'` as Experimental (`Features.cpp:400-405`, `dawn.json:2566`). Behind the "Unsafe WebGPU" flag as of a Nov 2025 webgl-dev-list thread. |
| Subgroups | Standard. Announced for Chrome 134 (blog dated 2025-02-26). Subgroup size control arrived in Chrome 151-152, primitive index in Chrome 142. |
| 64-bit atomics | Now standard as `"atomic-vec2u-min-max"`, merged 2026-09-15 (gpuweb#5610). It offers only `atomicStoreMin`/`atomicStoreMax`, which return no value, on `atomic<vec2<u32>>` (`wgsl/index.bs:20236-20239`). Dawn marks it Stable (`Features.cpp:461-465`). **Which Chrome version ships it: UNVERIFIED**; Chrome's "What's New in WebGPU" (up to 155-156) does not list it. |
| Storage buffer size | Defaults: `maxStorageBufferBindingSize` 128 MiB, `maxBufferSize` 256 MiB (`spec/index.bs:1817-1818`, `:1851-1852`). Dawn's D3D12 backend reports a much larger value (`PhysicalDeviceD3D12.cpp:434`), but a page only gets it by asking. Three.js passes only the `requiredLimits` the app gives it (`WebGPUBackend.js:244-247`). |

## What this means for the two GPUs (Chrome on D3D12)

- **Both GPUs:** Three.js's `MeshletDrawingPipeline` needs only core WebGPU, so in principle it runs on both. No performance figures exist for either; that is unverified.
- **Intel UHD 620 (Gen9):**
  - Dawn turns off subgroups on Gen-9 unless a toggle is set (`PhysicalDeviceD3D12.cpp:515-526`). The Gen 9 PCI ID families include 0x5900 and 0x3E00 (`gpu_info.json:202`); that the UHD 620's IDs (0x5917/0x3EA0) fall in them is from memory, not a source.
  - `atomic-vec2u-min-max` needs shader model 6.6 + `Int64ShaderOps` + `AtomicInt64OnTypedResourceSupported` (`D3D12Info.cpp:273-277`). Whether Gen9 reports these is UNVERIFIED and probably no.
  - In practice only Three.js's 32-bit-packed path is available on this GPU.
- **GTX 1080:**
  - Dawn turns on multi-draw-indirect for every D3D12 adapter (`PhysicalDeviceD3D12.cpp:172`), but Chrome still hides it behind the flag.
  - Subgroups should work through wave ops.
  - Whether Pascal reports `AtomicInt64OnTypedResource` is UNVERIFIED (Dawn's CI mentions a GTX 1660).

## SweK (read only, nothing changed)

- SweK vendors r186: `WebGLEngine/vendor/three-webgpu/three.core.js:6` and `WebGLEngine/vendor/three/three.core.js:6` both read `REVISION = '186'`.
- The pipeline imports `StandardDrawingPipeline` from `three/webgpu` (`MeshletDrawingPipeline.js:1-23`), so it cannot be dropped onto r186. It needs:
  - an r187 core;
  - `MeshletGeometryUtils.js`;
  - `meshopt_clusterizer` and `meshopt_simplifier` (no meshlet or `meshopt_clusterizer` file is in `WebGLEngine/vendor`).
- The engine's notes do mention both GPUs: `WebGLEngine/NOTES.md:4500` (UHD 620) and `WebGLEngine/render/learned-denoiser-preregistration.md:1999` (GTX 1080 through D3D12).

Sources and copies of the downloaded files were kept in a session scratch folder (not kept):
- the three.js r187 sources are in its `three/` folder;
- Dawn's `dawn_features.cpp` and `dawn_d3d12.cpp`;
- the WebGPU spec, `gpuweb_index.bs`.

---

## Meshlets: three-meshlet repository review

**three-meshlet (github.com/seanhlewis/three-meshlet): don't integrate it. It has no licence, and its renderer is a standalone demo, not a drop-in. The `MeshletDrawingPipeline` your request describes is a separate, official three.js addon that needs r187; the vendored r186 doesn't have it.**

Clone: a session scratch folder (not kept), HEAD `301c016`.

**Activity and size**
- 5 commits, all on 2026-05-24, by Sean Hardesty Lewis. One branch, no tags. Nothing since then; today is 2026-11-05.
- Stars and issues: not verified, because GitHub API access is blocked in this session.
- The tree is 10 MB, almost all vendored copies of three.js, meshoptimizer, Draco, GLTFLoader and models. Its own code is `src/index.js` (1010 lines), `demo/index.html` (2687 lines) and `scripts/run-demo.mjs` (127 lines).

**Licence: none.**
- `package.json` says `"license": "SEE LICENSE IN REPO"`, but no licence file exists at any depth in any of the 5 commits.
- README.md has no licence or copyright word in it.
- In SweK's sweep vocabulary this is "GENUINELY UNPAPERED" (category as in `world/licenceSweep.mjs:153-158`), so all rights are reserved by default.
- The bundled meshopt files carry MIT headers (`src/vendor/meshopt_*.module.js:1-2`), and so does the three.js build (`demo/build/three.webgpu.js:1-4`). The Draco files have no header; that upstream Draco is Apache-2.0 is from memory, not checked.

**README claims vs code**
- The README sells a library that builds meshlet and multi-LOD data "you can use in a custom renderer" (README.md:3-7). It credits the "Nanite-style renderer" to @sea3dformat (README.md:129); I didn't verify who that is.
- It targets three ^0.181.0 (`package.json` peerDependencies). The demo bundles three `REVISION '185dev'`.

**Library (`src/index.js`)**
- There is no GPU code at all. It is CPU/WASM preprocessing on meshoptimizer 1.1 (`src/vendor/meshopt_clusterizer.module.js:4-5`), run in the browser when models load. There is no offline tool.
- Meshlets are 64 vertices / 64 triangles (`src/index.js:8-9`), built at :832-839 and compressed with `encodeMeshlet` (:856).
- LOD is flat: 6 levels per object (:13-20), each simplified separately from the full-resolution indices (:805-826). There is no group hierarchy or DAG and no border locking. Error is forced to rise by x1.05 per level (:887).
- Only each meshlet's centre and radius are kept; the normal-cone data is thrown away (:875).
- It bakes world transforms and skinning into the positions (:299-300), then rescales every model to radius 2 at the origin (:388, :572-621). That destroys world scale and placement.
- Materials are redrawn through a 2D canvas into array textures capped at 1024, with only 5 channels kept (:407-461, :671-682). This needs a browser DOM (:409-413).

**Demo renderer (`demo/index.html`)**
- It doesn't import `src/`; it has its own copies of the same code (:1539, :2095).
- It uses WebGPURenderer and TSL (the three.js shading language) (:36-37). It asks for `maxStorageBuffersPerShaderStage: 10` (:148-152); that the WebGPU default is 8 is from memory.
- It decodes meshlets in its own raw WGSL compute pass through three.js private internals, `renderer.backend.device` and `backend.attributeUtils` (:2239-2250).
- Each frame (:2654-2658):
  - A per-instance pass does frustum tests, picks one LOD per object by screen-space error, then frustum-tests each meshlet and appends survivors with `atomicAdd` (:340-466).
  - An indirect dispatch launches a software rasterizer, one thread per triangle (:469-705). It culls back faces per triangle.
  - Triangles whose box is wider than 16 px (:101) go to one hardware `drawIndirect` with vertex pulling (:708-718, :834-928).
- The visibility buffer is a 32-bit `atomicMax` depth plus a separate payload write (:640-657). That write isn't atomic with the depth, so depth and triangle ID can disagree. This is from reading the code; I didn't see it happen.
- No occlusion or Hi-Z culling, no cluster cone culling, no multi-draw.
- Instances are a fixed 100x100 grid whose transforms are computed in the shader (:90-96, :226-239, :350-360), not taken from a scene graph.
- Shading is custom PBR with one hard-coded light (:791-793) plus an environment map. No three.js lights, no shadows.

**Numbers and tests**
- It publishes no measurements and names no hardware; the demo only logs counts to the console (:260-262, :293-295). The "2 billion triangles at 60 fps" claim in your sources is unverified; I didn't open those posts.
- There are no tests. The only scripts are `demo` and `pack:check`.

**What it plugs into**
- The library doesn't take a Mesh and draw it inside an ordinary scene. It returns typed arrays.
- The only renderer that uses them is the demo, which replaces scene rendering and ignores ordinary materials, lights and shadows.

**Fit for SweK**
- **Licence:** we can't vendor or copy its code. Its only reusable parts, meshoptimizer and three.js, are MIT and better taken from their own upstreams.
- **Version:** it is built for r181/r185dev. SweK pins three 0.186.1 (`vendor/three-webgpu/PROVENANCE.txt:12-15`), and the demo relies on private backend internals that can change between releases.
- **CPU twins:** SweK requires byte-identical GPU/CPU parity and bans `atomicAdd` compaction because its order isn't deterministic (`brain/transport/README.md:28-53`). The demo depends on exactly that (:449) plus the `atomicMax` race above. Each of its kernels (culling/LOD, software rasterizer, WGSL decode) would need a new CPU twin, and the rasterizer's float edge-function and top-left-bias maths (:599-616) would need a twin that rounds the same way.
- **Breakage:** the radius-2 rescale, the baked transforms, the canvas-redrawn textures and the hard-coded light all conflict with SweK's materials, lights and world scale.
- **Cost:** in practice a rewrite. The only idea worth keeping (the meshopt calls, about 180 lines at `src/index.js:748-929`) already exists in MIT form upstream.

**What your request actually describes is upstream three.js, checked 2026-11-05:**
- threejs.org serves `REVISION '187'`. It ships `examples/jsm/pipelines/MeshletDrawingPipeline.js` (5571 lines) and `utils/MeshletGeometryUtils.js`, and `webgpu_meshlets_meshes.html` loads (HTTP 200).
- It plugs in through `renderer.drawingPipeline` and `StandardDrawingPipeline`. Neither appears in the vendored r186 (0 hits each, and 0 for "meshlet"; the served r187 build has 20 hits for `drawingPipeline`). So using it means re-vendoring to r187.
- From its source:
  - Two-phase Hi-Z occlusion culling (:1077-1078, :1658-1664).
  - Normal-cone culling (:1151-1163).
  - Shadow passes (:731), with `VSMShadowMap` imported.
  - Software and hardware raster paths (:2241, :2468).
  - LOD also looks like a fixed set of levels rather than a DAG (`MeshletGeometryUtils.js:21-49, 240`); I only skimmed this.
- Not verified: r187's release date, the addon's limits and features, any performance numbers, and how it fits SweK's CPU-twin rule. That deserves its own assessment.

---

## Meshlets: where they could apply in SweK

**Meshlets in SweK_Engine (main v4931 checkout at 7930d488, 2026-11-03): where they could pay off**

**Bottom line:** No rig reading in the tree shows a frame limited by vertices or draw calls. Every per-pass reading on the two GPUs shows the cost following pixels. three.js's meshlet pipeline also can't go in as-is: it's newer than the vendored three, and it only runs under `WebGPURenderer`, which no heavy-geometry page uses. The realistic route is to make the engine's own `render/gpuDriven.mjs` cull clusters (groups of ~64-128 triangles) as well as whole instances. Measure before building anything.

**Upstream facts (checked 2026-11-05)**
- `MeshletDrawingPipeline` was added to three.js `dev` in commit e4d0c9e (#35191) on 2026-10-29. The examples were renamed `webgpu_gpudriven_*` -> `webgpu_meshlets_*` in #35282 on 2026-10-30 (github.com/mrdoob/three.js/commits/dev/examples/jsm/pipelines/MeshletDrawingPipeline.js).
- The example sets it with `renderer.drawingPipeline`, defaults to `occlusionCulling` on, and has no WebGL fallback (raw `examples/webgpu_meshlets_meshes.html`).
- The vendored three is r186 (`vendor/three-webgpu/three.core.js:6`). It has `BundleGroup` but no `drawingPipeline` and no `jsm/pipelines`. Which release first ships it: **not verified**.
- seanhlewis/three-meshlet only preprocesses glTF into meshlets plus LODs. The README states no licence and no culling. Commit dates: **not verified**.
- The word "meshlet" appears nowhere in the SweK tree.

**1. Renderers**
- **Main game (`index.html` -> `main.js`):** raw WebGL2. The context comes from `acquireGL` and goes to `new VoxelRenderer(gl, canvas)` (`main.js:9661`). Note: `render/voxelDevice.mjs:5` says this path uses three's `WebGLRenderer`, which looks wrong.
- **three `WebGLRenderer`:** 54 top-level pages, including `battleship3d`, `space-battleship`, `glb_viewer`, `universal-viewer`, `splat_viewer`, `snow-deform`, and the sub scene (`render/subAquarium3d.mjs:83`).
- **three `WebGPURenderer`:** only 6 pages, all small: `ai-presence-orb`, `fsr-three`, `orrery-gpu`, `three-probe`, `tsl-probe`, `tsl-rig`.
- **Engine's own device (`gfx/device.js`, WebGPU with WebGL2 fallback):** 38 pages, including the race pages, `kenney-kit`, `building-lab`, `universe-gpu`, `sandbox-gpu`, `orrery-gpu`. The WebGL2 fallback refuses compute and indirect draws by name (`gfx/device.js:324-325,439,946`).
- **Raw WebGPU:** `snow-gpu` (`render/snowGpu.mjs`) and `ocean-spike`/`ocean-sea` (vendored web-ocean).

**2. Heaviest geometry (stated counts)**
- **Voxel world:** about 890 triangles per chunk, measured by `tools/bench/meshPerf.mjs`. The default 15x15 grid is about 200k triangles; the world can grow to 1,089 chunks (`world/worldColliderBVH.mjs:18-21`). Each visible chunk is one `drawArrays`, drawn again in the shadow pass (`render/voxelrenderer.js:1850-1860,1919-1924`). There's no triangle counter, only chunks drawn/culled (`:755`).
- **Imported Sketchfab subs:** fine up to 150k triangles, warned up to 500k, refused above (`render/subModelsCore.mjs:20`). These files are never committed (`GPU_Assets/subs/README.md:7`).
- **Blast/CSG wall:** 50,834 raw triangles (`physics/mesh/blastEngine.mjs:45`).
- **Splat-walk mesh:** 30,632 triangles (`world/splatWalkWorld.mjs:22`). It's used as a collision mesh with a BVH; whether it's also drawn: **not verified**.
- **Exported alien GLB:** 89,440 triangles (`README.md:49`).
- **Kenney kits:** 20 to 2,006 triangles per model (`world/kenneyKit.mjs:58-83`).
- **City building:** 120 triangles (`world/cityChunkScene.mjs:21`).
- The largest committed .glb is `GPU_Assets/RobotExpressive.glb` at 464 KB, and it's skinned.
- Battleship and space-battleship counts: **none stated**.

**3. Geometry-scaling code already in the tree**
- **`render/gpuDriven.mjs`:** compute frustum cull, LOD picked from angular size (`rankLods`), one `drawIndexedIndirect` per (fleet, LOD) region (`:1-36,781`). Two-phase Hi-Z occlusion (`:157,694-698`), `dispatchIndirect` (`gfx/device.js:803-810`), and a CPU twin for WebGL2.
- **Draw count is already small:** `gfx/pipelineGaps.mjs:30,112` puts the ceiling at 50 indirect draws, so a meshlet pipeline would not be cutting draw calls on these scenes.
- **LOD thresholds:** derived from measured pixel error (`render/lodBudget.mjs`, `render/lodRecord.mjs`). That measurement was taken on SwiftShader, not the rig's GPUs.
- **`render/gpuTerrain.mjs`:** heightfield chunks on the gpuDriven path.
- **Elsewhere:** CPU frustum culling in the voxel renderer; greedy meshing (`world/chunkMesherCore.js:342`); instanced grass in one draw (`render/vegetation.js:262`); `InstancedMesh` in 17 files; `BatchedMesh` only in `temporalTsl`; no `THREE.LOD` anywhere.
- **Simplification:** `engine/quadricDecimate.js` (used by `engine/idleTasks.js`). meshoptimizer is present only as the glTF decoder (`vendor/three/jsm/libs/meshoptGltf.js:3-8`), with no simplifier or meshlet builder.
- **BVHs:** `mesh/meshBVH.mjs`, ported from three-mesh-bvh and used for collision and raycasting, not culling. Also `physics/render/rtPipeline.mjs`.

**4. Rig readings (GTX 1080 and Intel UHD 620)**
- **Snow, 2026-10-23** (`docs/real-hardware-snow.md:72-83`): the beauty pass is 95% of GPU time on the 1080 and 85% on the Intel at 720p, and it scales with pixels (1080: ~0.4 ms + 8.9 ms per megapixel). The shadow cascades, which redraw the clipmap geometry, cost 0.10 ms (1080) and 0.71 ms (Intel). With every shader term removed, the Intel floor is still 9.6 ms at 720p and 3.3 ms at 360p (`:107`), so even that floor tracks pixels.
- **Ocean, 2026-10-21** (`ui/oceanReadings.mjs:15`): "cost follows pixels" -- 518k pixels ~ 148 ms, 815k ~ 220 ms on the UHD 620. web-ocean already uses a CDLOD surface mesh (`vendor/web-ocean/PROVENANCE.txt`).
- **Main game:** the only profile is in `docs/round-312-entity-perf.md:11-18` and `round-315-surgical-splits.md:11-21` (files last touched 2026-08-19, GPU **not stated**). Skinned entities cost 70-76 ms and water+particles 50 ms; no terrain line was above 1 ms (CPU timers). The 63.4 ms of GPU time was not split by pass.
- Nothing has timed the gpuDriven path or voxel-world triangle throughput on the rig.

**Where meshlets could apply**
1. **Voxel world on the device path** (`render/voxelDevice.mjs:8,113`, `sandbox-gpu.html`). Today the whole world is one record, so nothing is culled. First step: one record per chunk, treating each chunk as a cluster and reusing gpuDriven's Hi-Z, with no LOD DAG.
   - Evidence: unmeasured.
   - First round must show: GPU pass times at two resolutions with flat cost, and occluded chunks being a large share at street level.
2. **Main WebGL2 voxel renderer** (`voxelrenderer.js:1846-1924`). This can't do compute; at most, port the gpuDriven CPU twin's Hi-Z test.
   - Evidence: none it is geometry-bound; the profile above points at entities and JS.
   - First round must show: per-pass GPU timer readings where the terrain and shadow passes stay flat as resolution drops.
3. **Imported Sketchfab subs and the .glb viewers** (`subModelsCore.mjs:20`). These are the only meshes of 150k-500k triangles, which is what three's pipeline targets (its example uses 100k-triangle statues).
   - Requires moving them to `WebGPURenderer` and to a three version past r186.
   - First round must show: a 500k-triangle sub on the UHD 620 at 360p vs 720p, frame cost not falling with pixels.
4. **gpuDriven fleets with large meshes** (`gpuDriven.mjs:586`, `indirectTemplate`). Per-cluster records would fit the existing cull shader.
   - Only worth it once some fleet mesh exceeds roughly 10k triangles; every current one is at most 2,006.

**Where meshlets don't apply**
- **Snow and ocean:** measured fill-bound, and each already has a clipmap or CDLOD mesh.
- **Splats** (`engine/SplatRenderer.js`): blended quads, so pixel cost dominates (inferred).
- **Grass:** already a single instanced draw of tiny blades.
- **Skinned avatars and entities** (`RobotExpressive.glb`, `EntityMeshRenderer`): cluster bounds and a LOD DAG assume static meshes.
- **Blast/CSG walls and voxel editing:** geometry is re-meshed on every shot or edit, so cluster DAGs would be rebuilt constantly. Greedy quads also simplify badly.
- **Kenney and city scenes:** whole models are 20-2,006 triangles, roughly 1-30 clusters each, with at most 50 draws.
- **The 54 three `WebGLRenderer` pages and the main raw-WebGL2 game:** there's no compute or indirect draw (`gfx/device.js:946`).

**Not verified:** the GPU used for the round-312/315 profile, battleship and sub scene triangle counts, which three release ships `MeshletDrawingPipeline`, three-meshlet's licence, and whether the splat-walk mesh is rendered.

---

## Survey r0: FSR4 arc

**FSR4 arc (rounds 65-76): where it stands and what could come next**

**(1) Where it stands**
- Last entry: section 175 (`WebGLEngine/render/learned-denoiser-preregistration.md:11032-11064`), shipped as v4909 (`docs/CHANGELOG.md:59-61`).
- **H76 holds.** U_TH (the half-size, 16-wide network) runs after Bt's history in the device chain with the coalesced pack. On the GTX 1080 that chain takes 44.6 and 44.2 ms against 37.8 and 37.3 ms without U_TH, a ratio of 1.181 and 1.183 against the 1.25 limit (:11040-11045). The pack fell from 4.92 ms to 1.34 ms.
- Quality: 5.44 % lower display error than Bt (16 of 24 scenes, p 0.0066), for 6.8 ms at 1080p, which is +18 % frame time (:11056).
- On the Intel it is off (`UTH_BY_ADAPTER`, `render/learnedUpscaleTemporalGPU.mjs:231`). U_TH alone costs 0.28-0.30 of a frame there, so H74 failed (:10904-10907).
- All five `fsr4-*` entries in `tools/ship/nextRounds.mjs:2557-2591` are CLOSED.

**(2) Pre-registered or named as next**
- Nothing is pre-registered after round 76. No section 176 exists, and no FSR content came after v4909: v4910 only merged it (`CHANGELOG.md:58`, item E), and v4911 is the submarine planner work.
- Named but not decided:
  - "Shipping the chain with U_TH on the 1080 class is a release, Keith's call" (:11063-11064). `nextRounds.mjs:2573` repeats it.
  - "A cheaper U_TH would need a new quality round" for the Intel (:10923).
- One related entry is still OPEN: `denoise-framegen-page-chain` (`nextRounds.mjs:2550`). It would run the live view on the whole device chain with the compute generator; today the view generates between raw traces on the CPU.

**(3) Unchecked or owed**
- v4909 lists three things as unchecked: the scenes are static orbits with no moving objects; no cheaper U_TH was tried for the Intel; and the page times its own U_TH rather than a rig run doing it (`CHANGELOG.md:61`).
- Quality was only ever measured at 256 x 256, 2x upscale, one orbit with nothing moving: "Nothing about 1080p, or about other ratios" (:10571-10576). The timing was at 1920 x 1080. So the 5.44 % gain has not been shown at the resolution where it was timed.
- Almost all of the gain comes from family C scenes: 6.4 % below Bt on C against 0.18 % on R. "Where the gain would land in a real scene is not measured" (:10877, :10924-10925).
- The only consumers are `denoise.html` (timing) and `path-tracer.html` (a 128 x 128 view). Nothing in the main engine renderer uses the chain.

**(4) Blockers**
- Rig time: every verdict needs two `realGpuRun --only denoise` runs per GPU from a fresh clone. Training and test harvests also run on Keith's rig (:10794-10799).
- Rig checkouts have repeatedly lost committed files, voiding runs (:10647-10649, :10668, :10700, :10867).
- `denoise-1080-native-crash` and `realgpurun-crash-evidence` are still OPEN (`nextRounds.mjs:2445`, `:2614`).
- On the Intel the traced frame itself takes about 0.5 s (:10921), so it has no real-time target to protect.

**(5) Candidate next rounds, ranked**
1. **A quality round with moving objects and at higher resolution.** Run round 72's test design on sequences with moving objects (real disocclusion) and a test larger than 256 x 256. This decides whether the 5.44 % holds where a release would run it, and whether the R-family near-tie becomes a loss. It is the evidence the open release decision needs, and it is mostly harvest rather than GPU-timing time.
2. **Release round, or `denoise-framegen-page-chain`.** Put U_TH on the 1080 class into a release, with the page's own U_TH timing confirmed by a rig run (v4909's third unchecked item). Or combine it with the compute frame generator (H64 holds, 0.11 of a frame on the 1080, `nextRounds.mjs:2538`). This decides whether the learned chain plus generation fits the frame budget together.
3. **A cheaper U_TH for the Intel** (for example 8 wide or quarter size), with a new quality round first. It is ranked last because the Intel frame is already about 0.5 s.

**On the NPU question, as it relates to this arc**
- There is no NPU, WebNN or OpenVINO path anywhere in `render/`. A whole-tree word search finds such names only in `ai-bridge/embed_service.py` (ONNX Runtime with DirectML/OpenVINO).
- U_TH is a small convolutional network, about 7.1k multiply-adds per half-size pixel (:10754), or about 3.7 G per frame at 1080p. That is the kind of load an NPU suits.
- The Intel, where it fails on cost, is the obvious target. But Intel gen-9 parts have no NPU.
- The chain is WebGPU in the browser, so an NPU route would need WebNN or a native bridge. It would also copy the roughly 35 MB half-size input across devices each frame (:10822).
- I don't know which NPU or driver the user means. Treat this as a hypothesis for a separate device round, not something the arc has measured.

---

## Survey r1: learned denoiser arc

**Learned denoiser / FSR4 arc at main v4911 (read-only).** Citations are lines in `WebGLEngine/render/learned-denoiser-preregistration.md` (PR) unless another file is named.

**1. Where it stands**
- The last section is s175 (PR:11032-11064), round 76's verdict, shipped in v4909 (CHANGELOG.md:59-60). H76 holds on the GTX 1080. With the coalesced pack (1.34 ms, down from 4.92), the chain with U_TH runs 44.6 / 44.2 ms against the chain alone at 37.8 / 37.3 ms. That is 1.181 / 1.183x against a 1.25 bar (PR:11045).
- Overall: U_TH removes 5.44% of Bt's display error (H72a, 16 of 24, p 0.0066; PR:10873-10874) for about 6.8 ms at 1080p on the 1080.
- It is off on the Intel. Standalone U_TH costs 0.275-0.300 of a traced frame there and H74 fails (PR:10904-10907). Only Pascal is enabled, in `render/learnedUpscaleTemporalGPU.mjs:231` (UTH_BY_ADAPTER).
- The coalesced pack is now the default: `pack = "fast"` in `render/denoiseUpscaleGPU.mjs:1216`.

**2. Pre-registered or named next**
- Nothing is pre-registered and still unrun after s175. Every fsr4-* backlog entry is CLOSED (`tools/ship/nextRounds.mjs:2558-2586`).
- s175 names a decision, not a round: "Nothing ships by this alone. Shipping the chain with U_TH on the 1080 class is a release, Keith's call." (PR:11064)
- s171 also leaves a call open: "Whether it should run U_TH, and whether U_TH goes after Bt in the chain ... are Keith's calls" (PR:10927-10928). The chain half was then built in rounds 75-76. The temporal page now runs U_TH (PR:10970).
- Open backlog entries:
  - `denoise-framegen-page-chain` (nextRounds.mjs:2551)
  - `denoise-subgroup-reduction`; its reduction half is not built (:2382)
  - `denoise-1080-native-crash`; not reproduced in 12 runs (:2446)
  - `fsr2-half-stall-rig`; four stall rows red on both GPUs (:2530)
  - `realgpurun-crash-evidence` (:2615)
  - `denoise-winograd-probe`, marked HARDWARE and optional (:2361)
- Two UPSTREAM entries: `denoise-halfres-page` (:2338) and `denoise-trained-on-mesh` (:2607).

**3. Unchecked or owed**
- v4909 says plainly: "the scenes are static orbits, not moving objects; no cheaper U_TH for the Intel was tried; the page's U_TH is timed by the page itself, not by a rig run" (CHANGELOG.md:60).
- s162 (PR:10571-10577): one camera move from a cold start, and one resolution (256x256 at 2x). Nothing about 1080p quality.
- The gain comes almost entirely from family C. U_TH improves C by 6.4% and R by 0.18%. "Where the gain would land in a real scene is not measured" (PR:10877, 10924-10925).
- No rig runs are owed for rounds 71-76. All verdicts are read.
- `render/denoiser-arc-handoff.md` is stale. It was last touched at s156 (git log 58e25c27).

**4. Blockers**
- **Rig time.** Every cost verdict needs Keith's rig: two `realGpuRun --only denoise` per GPU, from a fresh clone. Checkouts on the rig boxes kept losing committed files and killed runs (PR:10668, 10700-10701, 10867).
- **Harvest cost.** Quality rounds take hours:
  - training on 220 scenes at 512 spp is about 4.4 h, and would be about 18 h at 2048 (PR:10191);
  - round 67's test took 13,818 s (PR:10221);
  - round 66's harvest took 7,064 s (PR:10057).
- **No NPU anywhere.** The tree has no NPU reference (grep finds nothing). The Intel rig is a UHD 620 / gen-9 (CHANGELOG.md:107); as far as I know that CPU generation has no NPU, so moving U_TH to an NPU would need different hardware on the rig.

**5. Ranked candidate next rounds**
1. **U_TH on the page's own scenes and on moving content.** Rerun round 72's quality test on path-tracer.html's scenes (family P, as round 58 did; PR:8887) and/or on sequences with moving objects. This decides whether the 5.44% gain, which comes almost entirely from family C, holds on what the release would show. That is exactly what the pending "ship U_TH on the 1080 class" call rests on. Caveat: six scenes give a smallest sign-flip p of 0.031.
2. **The 1080's whole budget, stacked (`denoise-framegen-page-chain`, nextRounds.mjs:2551).** One rig cost round: the chain with U_TH plus the compute frame generator (G64 4.3 ms, 0.113 of T; PR:9941-9948) together, with presented rate and frame time against the chain alone. Every part exists and is held to its CPU twin. This decides whether the FSR3 and FSR4 halves fit one frame on the 1080 before anything ships.
3. **A cheaper U_TH for the Intel.** For example 8 wide, or the correction at quarter size. It needs a new quality round first (PR:10923), then a cost round. Standalone it needs about a 15% cut, from 0.275-0.300 down to 0.25. Its layers alone take about 110 ms (PR:10921-10922), and the down pass takes about 20 ms even coalesced (PR:10904-10905). This decides whether gen-9 can have a learned temporal upscaler at all. It ranks last because the Intel's traced frame is itself about 0.5 s, so the payoff is small. An NPU route only becomes a candidate if hardware with one joins the rig.

---

## Survey r2: arcs v4880-v4911 and owed rig readings

**Arcs on main, v4880 to v4911, plus every rig reading or run still owed**

**Before anything else (this affects the numbering of any next round):** a v4912 is being shipped right now on `origin/claude/wizardly-einstein-wr30pd`. It is not on main. The tip is 118f8785 "v4912 prep ... (in progress)", and the draft changelog is in 015f4665. That draft already contains needs-and-limits Rounds 14 to 33, the switchboard (`brain/switchboard.mjs`), Rounds H1 and H3, and `surveySeat` at low -0.06. It also merges four lines: the denoiser through Round 83, the sweet-lovelace fish and fly line, the box3d line, and the Decider audit. The tree count on that branch is 2283 gates. sweet-lovelace also carries `brain/DECISION_CIRCUIT_VS_TWIN_DRAFT.md` (bbfa2e03, "registers nothing"). So the next planner round should be numbered after Round 33 and after the H series.

Each arc below gives five things: (1) what landed, (2) where it stands, (3) what is still open, (4) a candidate next round, (5) whether an NPU fits. The NPU judgments are my inference, not something the changelog says. The changelog's hardware is an Intel UHD 620 (gen-9) and a GTX 1080 (Pascal), per v4891 and v4894. Neither has an NPU.

---

**ARC 1: Needs and limits -> tuned rule -> twin planner** (v4904, v4905, v4908, v4910 part C, v4911)

1. **What landed.**
   - `subNeeds` (v4904).
   - The survey run and its seats in `needsTask` (v4905).
   - The advisor box (v4908).
   - Rounds 6 to 10 (v4910): the learned residual turned out to be a tuning gain. The baseline is now TUNED-R8 (alpha 0.001, low 0.380, high 0.689, ramp 20, cap 0.886). The tuned values sit on a plateau, and a learned station scorer gave no gain.
   - Rounds 11 to 13 (v4911):
     - `brain/plannerSeat.mjs` is a twin planner that tries every order of the 4 nearest stations and replans every 120 s.
     - Round 12 pooled +0.0214 (se 0.0040) over 288 dives.
     - Round 13: 23 of 24 single model errors keep the gain. START-20 loses it (+0.0047). Errors of 20 percent in all four parameters at once lose it.
     - The oracle ceiling was corrected to about +0.007 to +0.019.
2. **Where it stands.** The planned visiting order is worth about 0.02 on the hard kinds, and only when the model is within about 10 percent on everything at once. Nothing learned was run.
3. **Open.**
   - `tools/ship/nextRounds.mjs:2781-2786` is still the "rounds-6-to-10" entry. Its `how` field (line 2784) still lists the planned-order seat as an unregistered candidate with the overstated "+0.03 to +0.05" ceiling.
   - v4911 says it added "the Rounds 6 to 12 entries in nextRounds", but `nextRounds.mjs` was last touched in v4910 (c5ffe2df). The branch tip has no match for "plannerSeat" or "twin planner" in that file either.
   - `brain/capabilityMap.mjs:51`: the hand-rule cell for the survey run still quotes Round 5's GUARDED-FILTER numbers.
   - Not covered (NEEDS_AND_LIMITS.md Round 13 result): perturbations of station positions, of the noise, and of the rule's constants.
   - Gauge faults other than gaussian noise were not checked (v4910).
   - The model's numbers are tank-scale (nextRounds `needs-tank-scale-numbers`).
   - No compressor is modelled (`needs-not-modelled`).
4. **Candidate next round** (after v4912 lands). Can a model learned from the noisy gauge reach the joint 10 percent tolerance? Separately: gauge dropout, bias and drift, where the slow alpha=0.001 filter is a weakness (v4910).
5. **NPU fit.** None. The twin's cost is CPU physics rollouts, not tensors.

---

**ARC 2: Learned and language-model seats in the survey task** (v4905 part 4, v4906 parts A and C, v4907)

1. **What landed.**
   - v4905: `pilotNeedsCircuit` (2,452 weights) and the trainer `trainNeedsCircuit`.
   - v4906: `advisorChip`, `advisorChipStudy` (stage A read WIRING-CHIP FAIL), `advisorTranscript`, `advisorLive`, `localModel`, `ensureBrowserGates`, and `advisorLlmAudit`.
   - v4907, Round 5: gemma2:9b and llama3.1:8b both read NO CONSISTENT EFFECT. Both tie the 0.65 cap and lose to RULE-GF by 0.18 to 0.32. Crushed dives were 7/4/6 and 9/4/5, against 1/0/0 for the rule.
2. **Where it stands.** The capability map reads `lm` = NO_EFFECT and `fly` = NOT_CONCLUDED (`capabilityMap.mjs:52,55`). On the v4912 draft, H3 finds the 12 trained needs circuits tie the rule they started from and crush 355 of 2,880 dives.
3. **Open.**
   - qwen2.5:7b-t0 was not recorded (v4907).
   - A larger model, an API model, another prompt or another cadence are outside the registration (v4907).
   - `ensureBrowserGates` has never run on a box that lacks the browser (v4906).
   - The `localModel` sizes are from memory (v4906).
4. **Candidate next round.** Low value. Reopen only under a new registration, for example the language model proposing a visiting order that the twin then checks.
5. **NPU fit.** This is the clearest consumer. `advisorLive` takes a command or the API (v4906), so a local 7 to 9B model served on an NPU could sit in that seat. But Round 5 is a null result, so an NPU makes the null cheaper to run, not better. Quantization changes the replies, so it needs its own recording; the transcript replay design covers that (v4906).

---

**ARC 3: Rung 4a, the fly circuit as a compass estimator** (v4900 and v4901 merges, v4903, v4904 compass events, v4905 part 3)

1. **What landed.**
   - v4903: v3 matched-gain FAIL in all 3 arms. Skill was 0.01 to 0.15, against 0.90 to 0.92 for one leaky unit.
   - v4905: v4 FAILED both arms. v5 found NO SIGNAL: the output responds to rates of +1 and -1 almost identically (2,266 against 2,610).
   - v4904: per-sub compass estimator events.
   - v4903: the tank-wide dropout mode was left in branch history (b6b418f to b30f9e0).
2. **Where it stands.** Closed negative. The real wiring behaves as an ordinary reservoir.
3. **Open.**
   - `capabilityMap.mjs:58-60` still marks the hand, fly and fish cells EXISTS_UNREAD, "result not read for this map", which contradicts v4903 and v4905.
   - A finer approach to the edge of stability than 0.999 would be a new registration (v4903).
   - On sweet-lovelace: the leaky-unit arm (42c9f372), the plain-net tank kind (c48b3374) and takeTankDropout (833ba312). The v4912 draft says those arms are not on the switchboard yet.
4. **Candidate next round.** Refresh the map cells, then fly the leaky-unit and plain-net arms on the switchboard.
5. **NPU fit.** None. The circuits have at most 148 cells with a ridge readout.

---

**ARC 4: Rung 4b, fish vestibular, Addenda 5 to 15** (v4906 part B, v4908, v4910 part D)

1. **What landed.** `fishVestibularCircuit`, `pilotSubVestibular`, `trainSubVestibular`.
   - Stage A: 0 of 4 cells passed.
   - Memory never beat the stateless pilot.
   - Shuffled wirings keep about 88 percent of the gain (Addendum 12: p 0.1308 and 0.0516, so not supported).
   - Addendum 14: permuted tuning keeps 77 to 84 percent.
   - Addendum 15: the real tuning ranks 2nd of 45, p 0.0444, in two cells that share one circuit.
2. **Where it stands.** What pays is the autopilot-plus-residual structure, the readout and the tuning-derived inputs. The wiring is worth about 0.02 and the tuning about 0.03 to 0.05 (v4908).
3. **Open.**
   - The Addendum 12 repeat at the unit of a circuit is not registered (v4910).
   - The fish pilot has no escape output (pre-read 2fabe267 on the branch).
   - The fish pilot is not flown on the switchboard (v4912 draft).
4. **Candidate next round.** Addendum 12 redone like Addendum 15: 44 shuffled circuits, p = rank/45.
5. **NPU fit.** None. The ES training is limited by the simulation, and the nets have hundreds of weights.

---

**ARC 5: Submarine line, viewer and Sea OGRE** (v4895, v4899, v4900, v4901, v4902, v4904, v4910 part A)

1. **What landed.**
   - The 3D aquarium on the GPU sea (v4895).
   - Conning tower, fins and the workspace layout (v4899).
   - Follow camera (v4900).
   - Sea OGRE, `ogreSubBridge`, `subSquad`, `seaOgre3d` (v4901).
   - The `visible` declaration fix in the frame loop and the sky shader precision fix (v4902).
   - The stage-isolation exit in `ogreScenario.start`, and the brain panel's steer and layers (v4904).
   - The .glb model swap, phases 1 to 3 (v4910).
2. **Where it stands.** Everything is gated headless. Nothing has been seen on a real GPU or in the real game.
3. **Open.**
   - The default tactician never fires at the OGRE: its fire gate wants an echo inside 320 m and the OGRE shoots from 380 m (v4901). This was measured, not fixed.
   - Torpedoes in the voxel world are straight, not homing, and probes are not drawn (v4901).
   - The frame-loop fix has no gate (v4902).
   - `ai-managed-sub-stations` is an idea only (nextRounds, UPSTREAM).
4. **Candidate next round.** A rig round that looks at the pages, plus the fire-gate range fix and homing torpedoes.
5. **NPU fit.** None.

---

**ARC 6: Ocean, slices 1 to 5 and after** (v4881, v4883, v4889, v4890, v4894, v4895)

1. **What landed.**
   - `oceanSurface`: Gerstner waves in f64 (v4881).
   - `oceanWater` and the default water page (v4883).
   - `oceanTier`, the tier switch (v4889).
   - The opt-in sea probe (v4890).
   - Readings: 148 to 220 ms on the UHD 620, 4 to 8 ms on Pascal, and cost follows pixels (v4894; "the ocean item is done").
   - `seaPatch` made the sea tunable and put it under battleship3d and the sub aquarium (v4895).
2. **Where it stands.** Closed.
3. **Open.**
   - Subs and boats do not read `oceanSurface` yet (v4883).
   - No GPU beyond the two, only three Pascal readings per size, and the card's name is unsettled (1070 Ti or 1080) (v4894).
   - The budget point near 8 megapixels is an extrapolation (v4894).
   - The gpuGitTime webgl2 pick question from v4882.
4. **Candidate next round.** Have the sub hull's buoyancy read `submergence()` so it broaches on real waves.
5. **NPU fit.** None.

---

**ARC 7: Snow** (v4895, v4896, v4897)

1. **What landed.**
   - The snowflow lift as one WebGPU frame, with upstream's defects measured (v4895).
   - The D3D12 `u32(1.0/x)` truncation fix, `truncationGuard`, and snowGpu split into 6 gates (v4896).
   - TAA history through a filtering sampler: 7.64 to 5.15 ms on the Intel. Deform through a texture: 20.1 to 7.2 ms. Coarse forms are now the default; the hoist is off; `?scale=auto` is on (v4897).
2. **Where it stands.** The Intel's beauty pass is about 61 ms at 720p. The fine term is 22.5 ms, 37 percent of it (`WebGLEngine/docs/real-hardware-snow.md:129-131`).
3. **Open.**
   - The new TAA default and coarse forms have not been checked by eye on a real GPU (v4897).
   - Upstream's terrainMacro and the ground-bounce solve are not ported (v4895).
   - The deform bound was restated from one reading (v4898).
   - The headings at `real-hardware-snow.md:111,121` still say "owed" although the Intel table that follows at :125 has the readings.
4. **Candidate next round.** A cheaper fine term.
5. **NPU fit.** None.

---

**ARC 8: Brain capability map and flight/6-DOF pilots** (v4910 part B, v4895, v4896, v4897, v4898)

1. **What landed.**
   - The capability map: 15 tasks, a closed status vocabulary, 36 mutants (v4910).
   - The 6-DOF fight balanced (v4895) and the pilots retrained at damage 6 (v4896).
   - Mouse and minimap on the flight page (v4897).
   - The map selector on the flight page (v4898).
2. **Where it stands.** The map is a v4910 snapshot and is already stale for the Arc 1 and Arc 3 rows. Many cells read EXISTS, UNREAD or NO CHAMPION (`docs/BRAIN-CAPABILITY-MAP.md:66-70`).
3. **Open.**
   - The map's own MLP cell for the survey run: "the experiment not yet run" (`capabilityMap.mjs:53`).
   - The hills circuit on the map selector has not been checked by eye on a real GPU (v4898).
4. **Candidate next round.** A map refresh that reads the EXISTS, UNREAD cells, then an MLP seat on the switchboard.
5. **NPU fit.** The "GPU Brain (MLP)" column is the only dense-net brain. v4870 found that "THE GPU DOES NOT MAKE A FLIGHT FASTER ... a readback per tick costs more than 1,796 multiply-adds save". Expect the same from an NPU. A batched fleet or a training evaluation is the only plausible case.

---

**ARC 9: Denoiser and FSR4** (v4891, v4909; may duplicate another worker's scope)

1. **What landed.**
   - v4891: the half-size chain is 1.44 to 1.48x cheaper on the 1080 and 1.38 to 1.54x on the Intel, and "its own steps cost more than its network".
   - v4909: U_TH has 5.44 percent less error. It costs +18 percent frame time on the 1080 and is off on the Intel (0.28 to 0.30 of the frame).
2. **Where it stands.** Real time on Pascal only. The branch line runs on through Round 83 (fc0d6ea3).
3. **Open.**
   - The 1080's verdicts for rounds 33 and 34, and round 35 (v4891).
   - U_TH is timed by the page itself, not by a rig run.
   - No cheaper U_TH for the Intel was tried, and the scenes are static (v4909).
4. **Candidate next round.** A cheaper U_TH for the Intel.
5. **NPU fit.** This is the most NPU-shaped workload in the tree: a convolutional net on a 17-channel tensor every frame. But the cost was data movement: the down pass and the pack took 8.3 ms and 5.2 ms before they were coalesced (v4909). A GPU->NPU->GPU round trip adds more data movement. It is speculative, and it would need a rig that has an NPU.

---

**ARC 10: Branch merges** (v4880, v4884, v4886, v4887, v4888)

1. **What landed.** Orrery-seeded (since573 to since585), long-silence (since588 to since598, `zoomBlurExact`, `deferralCensus`), the v4661 to v4675 tooling chain, the round22 guardian lexer, and the changelog-tail branches.
2. **Where it stands.** All absorbed. v4887 left 17 records unguarded, 44 over the sweep's line, 61 unchecked.
3. **Open.**
   - The rig-only non-zero exit in one of seven gates is still unidentified (v4880).
   - libmSensitivity was not run (v4884).
   - The shaderCensus tripwire change was made without asking and is "Keith's to reverse" (v4884).
   - The v4912 draft corrects the claim about round22.
4. **Candidate next round.** Finish shipping v4912.
5. **NPU fit.** None.

---

**ARC 11: Tooling, gates and Windows verify** (v4882, v4885, v4892, v4893, v4896, v4897, v4899, v4900, v4904, v4905, v4906, v4907, v4911)

1. **What landed.**
   - Posix paths in deviceReach and shaderEmitters (v4882).
   - `SQRT_ULP` = 3 (v4885).
   - The recordProbe journal, and its import by file:// URL (v4892, v4893).
   - `truncationGuard` (v4896).
   - `observedGates` folds the per-box records (v4897).
   - `carryOverForeign` (v4899).
   - Interleaved timing trials, the capReading range, and the orreryFleet allowance for one ship commit (v4900).
   - Range cost headers and NOT GRADED on a shallow clone (v4904).
   - The declaredCost cache (v4905).
   - The win32 path-splitting fixes (v4907).
2. **Where it stands.** The pattern repeats: green in the sandbox, red on the rig's Windows box, at v4882, v4892, v4896, v4907 and v4911.
3. **Open.**
   - The rig steps for v4911's two reds were handed back. `git grep routeShadow` finds only the changelog, so no tracked file carries those steps.
   - wasmDoors flips under load (v4896).
   - The foreign-record carry-over has not met the rig's real record (v4899).
   - Interleaved timing has not run on the rig under load (v4900).
   - traderGraph is within 5 percent of the line (v4891).
4. **Candidate next round.** A sandbox lint for Windows-path splicing in spawn, import and command strings.
5. **NPU fit.** None directly. NPU gates would be rig-only, like the adapter gates still marked OWED (v4888).

---

**ARC 12: One-offs**

- TV work (v4896): nothing has run on a TV or an emulator, and the executor is not written.
- Channel page (v4898): not tried on a second channel or with an iframe player.
- Avatar button (v4899): the Robot*.glb files live on the user's machine, not in the repo.
- CSG snapped path removed (v4895).
- f16 codec carry fixed (v4895).
- [Gauges] tab (v4897).

NPU fit for all of these: none.

---

**RIG READINGS AND RUNS STILL OWED, as each entry states them**

- **v4880:**
  - The rig's verdict was never asked.
  - The branch's measurements were not repeated.
  - A rig-only non-zero exit in one of avatarServerViews, boundaryLint, canvasFill, homography, proseAudit, registerResidue or wasmSupport is unidentified.
- **v4881:** the rig's verdict was not asked.
- **v4882:** the rig has not re-run, so whether the gpuGitTime webgl2 pick (record 8 against 9) is an overlap or a bug is open.
- **v4883:** the rig's verdict was not asked. The sub and the boats reading the sea surface is also unchecked (not a rig item).
- **v4884:**
  - The rig's verdict was not asked.
  - The corroboration battery and the 1,196 s sweep of 128 devices were not repeated.
  - libmSensitivity-selfcheck was not run.
- **v4885:**
  - A second adapter is needed to confirm the radial gap is all sqrt.
  - Only a rig can turn the new bound red.
  - The rig's verdict was not asked.
- **v4891:**
  - The 1080 still owes its round-34 runs (its checkout was detached).
  - The 1080's verdicts for rounds 33 and 34.
  - Round 35's per-step native timing.
  - Every ratio on a scene other than R 990000.
- **v4893:** the rig's full verify of that version.
- **v4894:** any GPU beyond the two, more than three Pascal readings per size, and the card's identity.
- **v4895:** any speed or look on a real GPU, and the sea's cost beyond the recorded readings.
- **v4896:**
  - Snow readings (marked "STILL OWED"; v4897's table appears to supply them).
  - The TV work on a real TV or emulator.
- **v4897:**
  - The TAA history and coarse forms by eye on a real GPU.
  - The rig's verdict.
- **v4898:**
  - The rig's verdict.
  - The map selector's hills circuit by eye on a real GPU.
  - trainDogfightLeague re-timed with a longer cap.
- **v4899:**
  - The fins on a real GPU.
  - The foreign-record carry-over against the rig's real record.
  - Whether the user's served tree has Robot*.glb.
- **v4900:**
  - The follow camera on a real GPU.
  - Interleaved timing on the rig under load.
  - The 28-circuit experiment was still running.
- **v4901:** nothing has run in the real voxel game in a browser.
- **v4902 and v4904:** the rig run of `ogre.sub()` then `await ogre.brainSubs({ squad: true })`. The terrain pixels have not been seen.
- **v4905:** the piece 4 training run was launched and unread (v4906 records the clean-gauge result).
- **v4906:**
  - `ensureBrowserGates` on a box that lacks the browser.
  - The Round 5 recording, which was in progress then and read at v4907.
- **v4907:**
  - Which commit the rig's published v4906 zip was packed from.
  - qwen2.5:7b-t0 was not recorded.
- **v4908:** the advisor box on a real boat in a real browser.
- **v4909:**
  - U_TH timed by a rig run rather than by the page.
  - A cheaper U_TH for the Intel.
- **v4910:**
  - A real Sketchfab .glb through the picker.
  - The Addendum 12 repeat at the unit of a circuit (not registered).
- **v4911:** two rig-side steps.
  - declaredCost: four new gates have a declared cost but no timing record on the rig.
  - strandCensus: routeShadow-selfcheck leaves `ai-bridge/apks` untracked and unignored on that box.
  - The branch commit d4f77b51, "Rig timings: the win32 box's per-box record for the 15 gates changed since v4911", appears to address the first.

Files referenced:
- /home/user/SweK_Engine/docs/CHANGELOG.md:53-151
- /home/user/SweK_Engine/WebGLEngine/tools/ship/nextRounds.mjs:2781-2786
- /home/user/SweK_Engine/WebGLEngine/brain/capabilityMap.mjs:50-62
- /home/user/SweK_Engine/WebGLEngine/brain/NEEDS_AND_LIMITS.md:552
- /home/user/SweK_Engine/docs/BRAIN-CAPABILITY-MAP.md
- /home/user/SweK_Engine/WebGLEngine/docs/real-hardware-snow.md:111-131

---

## Survey r3: NPU support (web research)

**NPU support for a JavaScript/WebGPU engine with Node and Python sidecars (checked 2026-11-05)**

**Bottom line:** NPUs are reachable today from the native sidecars, not from the browser. In the browser, WebNN is still behind a flag in Chrome and Edge. From Node, there are two working routes: `openvino-node` (Intel only), or Windows ML's catalog of downloadable execution providers used alongside `onnxruntime-node`. From Python, every vendor ships wheels. NPUs suit sustained background inference. They are a poor fit for per-frame work on GPU textures.

**1. Intel NPU (AI Boost)**
- **Windows driver:** 32.0.100.4778 WHQL, dated 2026-05-19. It supports Meteor Lake, Lunar Lake, Arrow Lake, Panther Lake and Wildcat Lake on Windows 11 23H2, 24H2 and 25H2, and is paired with OpenVINO 2026.2. https://downloadmirror.intel.com/919954/NPU_Win_Release_Notes_v32.0.100.4778.pdf
- **Linux driver (intel/linux-npu-driver):** these come from Phoronix and secondary sites seen in search results; the Phoronix 1.38 article returned 403 when fetched.
  - 1.30 (Mar 2026) was verified on Meteor Lake, Arrow Lake, Lunar Lake and Panther Lake.
  - 1.35 (Jul 2026, after mid-2026) adds Wildcat Lake and a dynamic-shape option.
  - 1.38 (Sep 2026, after mid-2026) adds official Ubuntu 26.04 support.
  - https://phoronix.com/news/intel-npu-driver-linux-1.30 and https://www.phoronix.com/news/Intel-Linux-NPU-Driver-1.38
- **OpenVINO NPU plugin:** latest release is 2026.4 (2026-09-16, after mid-2026). It adds MoE LLMs, Ubuntu 26.04 on NPU, and experimental support for bounded dynamic shapes, validated only on vision models. https://docs.openvino.ai/2026/about-openvino/release-notes-openvino.html
- **Node binding:** OpenVINO has an official npm package, `openvino-node`. `compileModel(path, "NPU")` accepts IR or ONNX files and needs Node 20.5.1 or later. https://docs.openvino.ai/2026/api/nodejs_api/openvino-node/interfaces/Core.html
- **ONNX Runtime OpenVINO execution provider:** set `device_type` to `NPU` (or `HETERO:NPU,GPU`). The Python package is `onnxruntime-openvino`. https://onnxruntime.ai/docs/execution-providers/OpenVINO-ExecutionProvider.html
- **Windows ML:** the OpenVINO provider is downloadable through Windows ML. Intel lists the NPU requirement as Core Ultra Series 1 (Meteor Lake) or newer with the latest driver. https://www.intel.com/content/www/us/en/developer/articles/guide/windows-ml-support.html

**2. AMD Ryzen AI (XDNA)**
- **Linux driver:** `amdxdna` has been in mainline since Linux 6.14 (released 2025-03-24). https://www.phoronix.com/review/linux-614-features
- **Linux userspace:** AMD still recommends the driver and XRT shim from its own repo, because the in-tree driver may lack ioctls the shim needs. Supported distros are Ubuntu 22.04+, Arch and Fedora 44+. https://github.com/amd/xdna-driver
- **Ryzen AI Software:**
  - 1.7 was released 2026-01-23. https://phoronix.com/news/amd-ryzen-ai-software-1.7
  - 1.7.1 added a Linux installer. 1.8 is the latest; its notes give no date. In 1.8, models can only be generated on Windows, but they run on Linux.
  - INT8 CNNs run on Phoenix and Hawk Point. BF16 models and LLMs need Strix or Krackan.
  - https://ryzen-ai-documentation.readthedocs.io/main/relnotes.html
- **Windows ML:** the VitisAI provider is available, with tight version limits: Adrenalin 25.6.3 to 25.9.1, NPU driver 32.00.0203.280 to .297. https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/supported-execution-providers (page updated 2026-10-07)

**3. Qualcomm Snapdragon X (Hexagon)**
- **ONNX Runtime QNN provider:** the `htp` backend is the NPU. https://onnxruntime.ai/docs/execution-providers/QNN-ExecutionProvider.html
  - It runs only quantized models: QDQ uint8/uint16, or FP32 models run at FP16 by default.
  - It has no dynamic shapes and no Loop or If operators.
  - Compiled graphs can be cached with `ep.context_enable`.
  - Python package is `onnxruntime-qnn` (ARM64 Windows). Quantizing models requires x64 Windows.
- **Windows ML:** QNN is a downloadable provider. It needs Snapdragon X Elite or Plus with Hexagon driver 30.0.140.0 or newer (same Microsoft Learn page as above).

**4. WebNN (browser)**
- **Chrome:** the origin trial ran 2026-02-09 to 2026-03-27, when it was disabled again for release-blocking issues. It is listed "Closed -- Complete" (M147-149, ended 2026-08-11, after mid-2026). Chromestatus still says "Proposed".
- **Stable builds:** the feature is off by default on M155 and on main. There is no Intent to Ship and no new milestone.
  - https://github.com/webmachinelearning/webnn/issues/964 (opened 2026-10-20, after mid-2026)
  - https://chromestatus.com/feature/5176273954144256
- **Edge:** its separate origin trial also expired.
- **Using NPU in the browser:** webnn.io (updated 2026-10-09) says to use Chrome or Edge Canary with the flag.
  - On Windows 11 24H2+, WebNN runs on ONNX Runtime through Windows ML, which uses OpenVINO for Intel NPUs and QNN for Snapdragon.
  - The site gives NPU driver guidance only for Intel Core Ultra. AMD is listed as "TBD".
  - Older Windows versions and Linux use a LiteRT backend that covers only CPU and GPU.
  - https://webnn.io/en/learn/get-started/installation and https://webnn.io/en/learn/get-started/debug
- **ONNX Runtime Web:** its WebNN provider takes `{name:'webnn', deviceType:'npu'}`. Inputs are copied to NPU memory and results copied back, and unsupported operators fall back to WASM. https://onnxruntime.ai/docs/tutorials/web/ep-webnn.html
- **For a shipped game, WebNN NPU is not usable in late 2026.**

**5. onnxruntime-node**
- **Prebuilt binaries:** CPU and DirectML (Windows x64 and arm64), WebGPU (experimental), CUDA 12 (Linux x64), CoreML (macOS). There are no prebuilt OpenVINO, QNN or VitisAI providers. https://raw.githubusercontent.com/microsoft/onnxruntime/main/js/node/README.md
- **Source tree:** the binding has a `qnn` option behind a `--use_qnn` build flag, so it is available only if you build from source (checked `js/node/src/session_options_helper.cc`, main at v1.32.0).
- **Microsoft's documented Node path (2026-08-19, after mid-2026):** WinApp JS bindings use `ExecutionProviderCatalog` to discover and download providers, and inference runs in `onnxruntime-node@1.24.x`.
  - The version must match the ONNX Runtime ABI bundled with Windows App SDK 2.x.
  - The guide's example runs only `dml` or `cpu`. Whether a downloaded NPU provider can be attached from Node is not demonstrated.
  - https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-js-winml
- **DirectML:** Microsoft now labels it "legacy" in Windows ML.
- **Practical takeaway:** on Intel, `openvino-node` is the cleanest Node route to the NPU. Otherwise, use a Python sidecar (`onnxruntime-openvino`, `onnxruntime-qnn`, or Ryzen AI's ONNX Runtime).

**6. Practical limits**
- **Precision:** Intel's NPU computes in FP16 and accepts U8, INT8 or mixed FP16-INT8. QNN's NPU backend requires quantization or FP16. AMD uses INT8 or BF16 depending on the chip generation.
- **Shapes:** static shapes are the norm. Intel's dynamic shapes are preview only (bounded, Lunar Lake or newer, driver 32.0.100.4621 / Linux 1.30 or newer). QNN has no dynamic shapes at all.
- **Compile time and caching:** the first load compiles the model. Intel's driver caches compiled models by default (in the DirectX shader cache on Windows), and OpenVINO also supports `CACHE_DIR`. QNN caches via its context binary, and Ryzen AI 1.7 cut transformer compile time by about 40%. Plan a warm-up step and persist the cache. https://docs.openvino.ai/2026/openvino-workflow/running-inference/inference-devices-and-modes/npu-device.html
- **Data transfer:** NPUs do not share textures with WebGPU. ONNX Runtime Web copies data CPU -> NPU -> CPU on every run.
- **Good fits:** vendors are optimizing for speech-to-text (Intel added an ASR pipeline for Panther Lake; AMD integrated Whisper.cpp), embeddings and rerankers (Qwen3-Embedding and Qwen3-Reranker on Intel), small LLMs and VLMs, TTS, and low-power streaming effects.
- **Poor fits (my inference, no source states it directly):** tiny kernels run every frame that need GPU textures, because of transfer and dispatch latency and the static-shape and quantization constraints. Keep those on WebGPU compute.

---

## Survey r4: NPU inventory in SweK

**NPU inventory for SweK_Engine (main at v4911, read-only)**

**Hardware: none of Keith's recorded machines has an NPU**
- No file in the repo contains the whole word "NPU" (case-insensitive `git grep -w`). Nothing mentions `webnn` or `navigator.ml`. The only names of NPU-capable runtimes are the provider strings in `ai-bridge/embed_service.py:7-12,38-39` (DirectML, CoreML, OpenVINO) and the comment at `ai-bridge/embedModel.js:40`.
- **Galaxina**: Windows, "NVIDIA GeForce GTX 1080" (nvidia/pascal), recorded at `ui/oceanTier-selfcheck.mjs:35` and `ui/oceanReadings.mjs:50`. `RIG_WORKLIST.md:5` calls it "GTX 1070/1080". The 1070 Ti appears at `ai/OllamaClient.js:1041`.
- **The rig's laptop**: "intel gen-9 0x3ea0 Intel(R) UHD Graphics 620", integrated (`ui/oceanReadings.mjs:35`, `ui/oceanTier-selfcheck.mjs:34`).
  - Both rigs run Windows 10.0.22631 x64 (`tools/ship/native-sweep-r69-intel-gen9-0.6.2.json:4`).
  - Inference, not recorded: device ID 0x3EA0 is an 8th-gen Whiskey Lake U-series chip. Intel's NPU ("AI Boost") arrived with Core Ultra, so this laptop has none.
- **Stellar Atlas**: an Intel Mac (`ai-bridge/install_catalog.json:936`), so no Apple Neural Engine.
- **"Mother's M-series" Mac** (arm64, `RIG_WORKLIST.md:16`): the only machine on record with a neural accelerator (the Apple Neural Engine). It is reachable only through CoreML. `embed_service.py:38` already lists CoreMLExecutionProvider.
- **Steam Deck**: a peer (`brain/start-brain-steamdeck.sh`). Its AMD APU has no NPU (general knowledge).
- No CPU model string is recorded in any rig JSON (searched `tools/ship`, `render`, `brain/rig-results`).

**Inventory**

| # | Workload / file | Model, size | Runtime today | Where | Budget | NPU? | Why |
|---|---|---|---|---|---|---|---|
| 1 | Text embedder, Python service: `ai-bridge/embed_service.py:34-57` | all-MiniLM-L6-v2, 384-d, ~22M params | ONNX Runtime via Optimum. Execution provider chosen from `_PREF` (:38-41): CUDA > TensorRT > DML > CoreML > OpenVINO > CPU | Python service on :8900, used when `SWEK_EMBED_URL` is set (`embedModel.js:25,41-51`) | Interactive (RAG query, `ragBridge.js:5`) plus batch indexing (`swekStore.js`) | **Yes, best fit** | Fixed-shape encoder that batches well, needs no GPU texture, and has no exactness gate (cosine similarity only). But today it can never reach an NPU, see shortlist #1. |
| 2 | Text embedder, Node: `ai-bridge/embedModel.js:52-64` | Same model, q8 by default (:56), ~90 MB fp32 (:9) | transformers.js on onnxruntime-node. `SWEK_EMBED_DEVICE` (:57), CPU by default | ai-bridge process | Same as #1 | Weak | WebNN is browser-only. Node can only reach an NPU through DirectML's device filter, which transformers.js does not expose (upstream, not verified here). Route NPU work through #1. |
| 3 | Speech-to-text: `whisperBridge.js:19,74`, `sttBridge.js:14,49`, `ui/sttLayer.js:1-5` | whisper.cpp `ggml-base.en.bin` (`bgServicesBridge.js:325`) | whisper.cpp built with plain cmake (`bgServicesBridge.js:330`); faster-whisper/CTranslate2 on Galaxina (`tools/dictate-tray/README.md:38-41`) | Separate local server on :8080 behind the bridge | Interactive push-to-talk | **Yes, encoder only** | The encoder takes a fixed 30 s mel window, which suits an NPU; decoding stays on CPU/GPU. Upstream whisper.cpp has an OpenVINO encoder build with an encode-device option (not verified here). CTranslate2 has no NPU path. |
| 4 | Dictate tray: `tools/dictate-tray/package.json:17-19` | Would be Silero VAD (~2 MB) | `onnxruntime-node ^1.27` and `@ricky0123/vad-node` are listed as optionalDependencies but **never required**. `dictate-tray.js` loads only the modules at :29-33, :145, :159; voice detection is ffmpeg `silencedetect` (:18-21) | Node tray client | Real-time audio | Marginal | The model is tiny and the CPU cost is already negligible, so the only gain is battery. There is no inference to move yet. |
| 5 | Browser language model: `webgpu-llm.html`, `ui/localModelRun.js:165-178`, `ui/localModelProbe.js:165` | Qwen2.5-0.5B (q4f16 483 MB), SmolLM2-360M (299 MB), gemma-3-270m, Llama-3.2-1B q4f16, Gemma 4 E2B (`ui/modelRepoCandidates.js:39-100`) | transformers.js 3.5.1 from CDN (:53), `device="webgpu"` by default (:165) | Browser page | Interactive token generation | **Plausible, experimental** | transformers.js v3 accepts `device:"webnn-npu"` (upstream, not verified here). But WebNN is behind a flag or origin trial, language-model KV caches have dynamic shapes, and the probe never checks `navigator.ml`. |
| 6 | Ollama language models: `ai/OllamaClient.js`, `ragBridge.js`, `humanizerBridge.js:6`, `cameraVisionBridge.js:1-4` (llava/moondream), `/dictate/polish` | llama3.1:8b, gemma2:9b, qwen2.5:7b (`brain/rig-results/livePractice3.*`); inventory at `tools/ship/localModel.mjs:21-29` | Ollama (llama.cpp), CUDA on the 1080 | Separate local server on :11434 | Interactive or offline | Only via an outside server | Ollama has no NPU backend. The zero-code route is the generic OpenAI-compatible provider (`aiProviders.js:23,130-160`, `~/.voxelbridge/mlx.json` baseUrl) pointed at an NPU-serving server such as OpenVINO Model Server, Foundry Local or Lemonade (upstream names, not verified here). Decoding an 8B model on an NPU is limited by shared-memory bandwidth and would likely be slower than the 1080. |
| 7 | Fish/fly advisor language-model chip: `brain/advisorChip.mjs`, `tools/ship/advisorLive.mjs:3-6`, `tools/ship/localModel.mjs:34-39` | Same Ollama models, or Claude through `--cmd` / `--api` | `ollama run` through stdin/stdout | Offline: record, then replay. "Nothing in the graded path ever calls a model" (:4) | Offline, ~180 calls (`localModel.mjs:30`) | No value | Not latency-bound. v4907 found "two local language models add nothing beyond a fixed depth cap" (`docs/CHANGELOG.md:65`). The `probeSystem` hardware check only looks for nvidia-smi (:37). |
| 8 | Piper text-to-speech: `ai-bridge/ttsBridge.js:4-5,57-62` | Piper VITS voice `.onnx` (size not recorded in the tree) | piper binary, which embeds ONNX Runtime on CPU; no execution-provider flag passed | Spawned child process | Per utterance | Low | The bridge passes only `--model` and `--output_file`, so there is no hook to choose a device. VITS output length varies, which suits NPUs poorly. |
| 9 | Voicebox text-to-speech: `ai-bridge/voiceboxBridge.js:7,27` | qwen, kokoro, chatterbox and others | Voicebox's own Python service | Separate app on :17493 | Per utterance | Upstream's choice | Not in the tree. |
| 10 | Voxtral speech recognition: `ui/voxtralBrowser.js:33,45-56,62` | Voxtral Mini 4B, Q4 GGUF, 2.5 GB weights, 9.4 MB wasm | Burn + cubecl: its own WGSL through WebGPU | Browser page | Upstream measures it 14x slower than real time | **No** | There is no ONNX graph for WebNN to run. |
| 11 | MediaPipe face/hand tracking: `face/MediaPipeFaceTracker.js:8,11,28,156`, `MediaPipeHandTracker.js:173` | face_landmarker float16 `.task`, ~12 MB including wasm | tasks-vision 0.10 with the "GPU" delegate, falling back to CPU | Browser, from webcam frames | Every frame, ~30 Hz | Plausible only with a port | Fixed-shape vision networks that would take load off the render GPU, which matters on the UHD 620. MediaPipe web has no WebNN delegate, so this means a rewrite onto ONNX Runtime Web's WebNN provider plus model conversion. |
| 12 | Learned denoiser: `render/denoiseNet.mjs:13`, `render/denoiseDevice.mjs:1-24` | 4 conv layers 9->16->16->16->3, 6,387 params; kernel head of 81 taps | WGSL kernels the tree wrote (`brain/conv2d.mjs`) | Browser (`denoise.html`, path tracer) and Dawn in gates | Every frame | **No** | The whole chain stays on the GPU with one read-back (:4-5). Every conv cell must match the f32 CPU twin exactly (:19-23; `docs/GPU-KERNEL-CONTRACT.md:19-23`), and NPUs compute in fp16/int8. |
| 13 | FSR4 learned upscaler U_T / U_TH: `render/learnedUpscaleTemporal.mjs:27-36`, `learnedUpscaleTemporalGPU.mjs:231` | 17 inputs -> 16 -> 16 -> 16 -> 3 at half size (U_TH); 32-wide at full size (U_T, needs 265 MB buffers) | Its own WGSL (conv2d fast kernel) | Browser path tracer / denoise page | Every frame. +18% frame time on the 1080; 0.28-0.30 of the frame on the Intel, so it is switched off there (`docs/CHANGELOG.md:59-61`, v4909) | **No** | A per-frame round trip from GPU to NPU and back at 1080p, held to the same exactness as #12. Offloading would help most on the Intel laptop, which has no NPU. |
| 14 | Brain networks: `brain/mlp.js` (BatchedMLP, WGSL in Deno, `START_BRAIN.bat`); pilot MLPs of 1,796-1,860 weights (`pilotFlightMlp.mjs:4`, `pilotDroneMlp.mjs:4`); seat gunner 12->32->32->3; `ai/NeuralEnemyBrain.js` 8->12->3 in CPU JS; fish/fly connectome circuits (34 neurons, 313 synapses); `brain/rl/*` | Thousands of weights | WGSL plus CPU twins; training in f64 on the CPU (`brain/convNet.mjs:5-6`) | Deno headless, browser, Node | Every tick | **No** | Launch cost dominates: "a fleet of three decides faster on the CPU twin" (`pilotFlightGpu.mjs:11`), and "on this fight the GPU is SLOWER" (`seatGunnerGpu.mjs:10-11`). Results must be bit-identical to the twins, and there is no ONNX graph. |
| 15 | SHARP photo to 3D splat: `ai-bridge/sharpBridge.js:3,19,57` | apple/ml-sharp, research-only weights | PyTorch in Python | Python child process | Offline, one photo at a time | No | No ONNX export; torch has no NPU path. |
| 16 | Comic translate: `ai-bridge/comicTranslateBridge.js:1-5` | RT-DETR, OCR, LaMa plus a language model | Upstream's Python desktop app | The rig | Offline | Upstream's choice | Not in the tree. |
| 17 | ComfyUI / Kaggle / UI-TARS: `ai/ComfyUIClient.js:411`, `ai-bridge/kaggle_templates/*`, `uiTarsBridge.js:5-8` | SD, Trellis 2, Hunyuan3D, 7B vision-language model | ComfyUI on the GPU; Kaggle cloud; vLLM/Ollama on another device | Elsewhere | Minutes / offline | No | Off-box or GPU-sized (Trellis 2 takes 5-15 min on a 1070 Ti). |
| 18 | Home Assistant voice stack: `HomeAssistant/VOICE_CONTROL.md:3-4` | openWakeWord, faster-whisper, piper | Home Assistant add-ons | The Home Assistant host | Real time | Not this tree's | Out of the tree. |

**Ranked shortlist, if an NPU machine (Core Ultra, Ryzen AI, Snapdragon X) or the M-series Mac joins the fleet**

1. **`ai-bridge/embed_service.py:38-49`: easiest, low risk, no exactness gate.**
   - Today it cannot reach an NPU. `from_pretrained(..., provider=PROVIDER)` (:44) passes no provider options. The OpenVINO provider's documented default device is CPU, and DirectML defaults to the GPU (upstream defaults, not verified here). DirectML also comes before OpenVINO in the preference list (:38-39).
   - Change: pass `provider_options={"device_type":"NPU"}` for OpenVINO, or a DirectML NPU device filter, or QNN / VitisAI providers.
   - Pad to a fixed length (`padding="max_length", max_length=128`) at :49, because NPUs need static shapes.
   - Report the device in GET `/` (:69-70). `embedModel.js:46` already logs the provider.
   - On the M-series Mac, check whether the CoreML provider (:38) already dispatches to the Neural Engine. Not verified here.
2. **Whisper encoder: `ai-bridge/bgServicesBridge.js:330` installCmd plus `whisperBridge.js:15-19,74`.**
   - Build whisper.cpp with its OpenVINO encoder and choose the NPU as the encode device (upstream flag, not verified here).
   - Or add a third backend for an OpenVINO-served Whisper. `whisperBridge.js:74` hard-codes the endpoint path, while `sttBridge.js:20` already takes any endpoint.
   - This serves the interactive dictation path (`sttLayer.js`, dictate tray).
3. **`ui/localModelRun.js:165` `load({device})` plus `ui/localModelProbe.js:165` `probeLocalModel`.**
   - Add a `navigator.ml` / `ml.createContext(...)` check to the probe, and offer `device:"webnn-npu"` for the small candidates (Qwen2.5-0.5B, SmolLM2-360M).
   - This fits the tree's "probe before the gigabyte" rule.
   - Caveats: WebNN is flag-gated; the WebNN spec may be replacing `deviceType` with power-preference hints, so the probe should feature-detect (not verified here); and dynamic language-model shapes need free-dimension overrides.
4. **Language models through `ai-bridge/aiProviders.js:130-160` (mlxChat).** Point `~/.voxelbridge/mlx.json` baseUrl at an OpenAI-compatible server that runs on the NPU. No code change. Low value: v4907 found the advisor gains nothing from local models, and the 1080 is likely faster.
5. **MediaPipe trackers (`face/MediaPipeFaceTracker.js:156`) or Silero VAD in the dictate tray (`package.json:18-19`).** The face/hand trackers would be a real per-frame offload but need a full port to ONNX Runtime Web's WebNN provider. The VAD is tiny and only saves power.

**Ruled out for good:** the denoiser, the FSR4 learned upscaler, every brain network and conv2d, and Voxtral. All are GPU-resident or tiny, run custom WGSL with no ONNX graph, and are held cell for cell to f32 CPU twins.

**Bottom line:** on today's rigs no NPU work can run anywhere. The one machine with a neural accelerator is the M-series Mac, and only shortlist #1 via CoreML could reach it without new code.
