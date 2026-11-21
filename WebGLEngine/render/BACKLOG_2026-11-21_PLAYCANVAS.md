# What PlayCanvas does that SweK doesn't: the backlog (2026-11-21; UNNUMBERED)

Keith, 2026-11-21: "let's write these items into the backlog and while we wait for round 5, start with GPU sort for splats." The comparison is in `docs/playcanvas-comparison.md`. PlayCanvas (github.com/playcanvas/engine, `2.25.0-beta.10`) is MIT: code lifted from it keeps `Copyright (c) 2011-2026 PlayCanvas Ltd.` and the licence text beside it. Each item gets a self-check before it's called done, and each lift is checked against SweK's own version where one exists.

| id | what | PlayCanvas source | status |
|---|---|---|---|
| `splat-gpu-sort` | Sort splats back to front on the graphics card instead of the CPU | `src/scene/graphics/radix-sort/compute-radix-sort-multipass.js` and its three WGSL chunks (`src/scene/shader-lib/wgsl/chunks/radix-sort/`) | **SORT DONE 2026-11-21, NOT YET DRAWN FROM:** `render/splatSortGPU.mjs` (PlayCanvas's 4-bit multipass radix sort on raw WebGPU, plus SweK's depth keys on the card). `tools/ship/splatSortGPU-selfcheck.mjs` holds it to the CPU sort: the same permutation, ties included, from 1 to 100,000 keys. Next: a WebGPU splat renderer that draws from its index buffer (engine/SplatRenderer.js is WebGL2 and cannot), and its time on a real GPU (`node tools/ship/realGpuRun.mjs --native --only splatSortGPU`); here it ran on SwiftShader, a CPU |
| `splat-lod-streaming` | Splats at scale: a level-of-detail octree, streaming with a budget balancer, the compressed `.sog` format | `src/scene/gsplat-unified/` (octree, budget balancer, frustum culler), `src/scene/gsplat/gsplat-sog-*.js` | open; waits on `splat-gpu-sort`. Port the ideas and data structures; the files are tied to PlayCanvas's device layer |
| `clustered-lights` | Scenes with many lights: clustered lighting and a local-light shadow atlas | `src/scene/lighting/world-clusters.js`, `src/scene/renderer/world-clusters-allocator.js`, `src/scene/lighting/light-texture-atlas.js` | open |
| `smaa` | SMAA anti-aliasing | `src/extras/effects/smaa/` (GLSL and WGSL) | open |
| `volumetric-fog` | Volumetric fog | `src/extras/effects/volumetric-fog/` | open |
| `gpu-timer-overlay` | An on-screen per-pass GPU timer (timestamp queries), the numbers the real-GPU runs time in gates, live on any page | `src/extras/mini-stats/` (`gpu-timer.js`, `mini-stats.js`) | open |
| `camera-controllers` | One shared set of orbit, fly and focus camera controls | `src/extras/input/controllers/` | open |
| `gizmos` | Translate, rotate and scale gizmos, a view cube, an infinite grid | `src/extras/gizmo/`, `src/extras/grid/` | open; only if SweK wants in-page editing |
| `usdz-export` | USDZ export, so an iPhone opens a SweK model in AR Quick Look | `src/extras/exporters/usdz-exporter.js` | open |
