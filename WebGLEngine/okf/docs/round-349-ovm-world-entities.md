---
type: doc
title: "Round 349 — `window.ovm.load(url)` — OVM as world entity"
tags: ["swek-engine", "round-doc"]
---

# Round 349 — `window.ovm.load(url)` — OVM as world entity

Mirror of v348 for sparse voxel assets. The matching gap closes: every active asset format now has a console API for world-entity loading.

## What landed

### `engine/OvmRenderer.js`

Multi-entity sparse voxel renderer. Each loaded asset becomes an entity with its own instance buffers (coords, offsets, materials, AO bitmasks), all drawn through one shared shader program + shared cube geometry.

Pipeline features carried through from the v345/v346 demo:
- **Indexed cube** (8 unique corners + 36 indices) → `gl_VertexID & 7` gives corner index
- **Per-instance shape_offset** displacement (dual-grid)
- **Per-instance RGBA PBR material**
- **Per-instance uint32 AO bitmask** (8 corners × 4 bits)

What was intentionally **simplified** for world rendering:
- **No PCF shadow framebuffer per entity.** The main world has its own shadow pass on TEXTURE3. We don't duplicate that work per OVM entity — AO carries the crevice-darkening that makes the dual-grid look read correctly. If you want the full demo lighting, use `demos.set("ovm")` for inspection.
- **No toggles.** AO is always-on (it's a baked attribute, costs nothing to keep enabled).

API:
```js
add({ asset, position?, rotation?, scale?, voxelScale?, tint?, name? }) → id
remove(id) → boolean
clear() → number removed
list() → [{ id, name, position, ... }]
update(id, patch) → boolean
render(camera) → void
```

`voxelScale` (per-voxel size, default 1) and `scale` (entity uniform scale) are independent — useful for making a sphere asset twice as big *as a whole* (scale=2) vs making its individual voxels bigger but keeping the count fixed (voxelScale=2).

### `window.ovm` console API

```js
window.ovm.load(url, opts)    // fetch → decode → AO compute → add
window.ovm.add(asset, opts)   // skip fetch, add already-decoded asset
window.ovm.list()
window.ovm.clear()
window.ovm.remove(id)
window.ovm.update(id, patch)
```

**AO is computed on load.** The `.ovm` format intentionally doesn't bake AO into the file (it's purely a function of coords — `computeAOBitmasks(coords, count)`). On `window.ovm.load`, AO is computed once after decode and uploaded with the rest of the instance buffers. From that point it's static; no per-frame cost.

### Demo integration

The `ovm` demo gains a **📍 Place in world** button. Same pattern as v348 p3d:

1. `demos.set("ovm")`
2. Pick generator (sphere/torus/roundedBox/terrain), adjust smoothness
3. Click **📍 Place in world** — drops the asset as a world entity via `window.ovm.add`
4. Exit the demo (`demos.set(null)`) to see it positioned in front of the camera

## The asset pipeline matrix — now complete for active formats

| Format | Console API | Status |
|---|---|---|
| `.ply` (splat) | `window.splat.load(url)` | ✅ v341 |
| `.p3d` (mesh) | `window.p3d.load(url)` | ✅ v348 |
| **`.ovm` (voxels)** | **`window.ovm.load(url)`** | ✅ **v349** |
| `.vx` (RLE voxels) | demo only | viewer (compression demo) |
| `.obj` / `.glb` | existing asset pipeline | wired (TripoSR/Hunyuan output path) |

Three different "AI meets rendering" formats now load identically:
```js
await splat.load("http://127.0.0.1:8188/view?filename=scene.ply")
await p3d.load("http://127.0.0.1:8188/view?filename=mesh.p3d")
await ovm.load("http://127.0.0.1:8188/view?filename=asset.ovm")
```

If you wire up a TRELLIS-2 Python interceptor that emits `.ovm` (using the 22-byte stride from the doc), the JS side already knows how to render it.

## Tests — 1479/1479 cumulative

`test_v349.mjs` adds 60 tests across 14 groups using a stub WebGL2 context with **integer attribute pointer tracking**:

- **T1-T2** Construct, AO auto-computed on missing — verified by tracking `Uint32Array` uploads in the stub GL
- **T3** Pre-baked AO from `generateWithAO` is uploaded as-is (one Uint32Array bufferData call)
- **T4** Input validation rejects plain arrays where typed arrays are required
- **T5** `list()` returns defensive copies
- **T6** `update()` for position/rotation/scale/tint
- **T7** `voxelScale` (per-voxel size) distinct from entity scale
- **T8** `remove()` + `clear()` semantics
- **T9** Multi-entity render drew 13,680 indices total (36 × instance count for both entities)
- **T10** `dispose()` cleans up GL resources
- **T11** Main wiring: `OvmRenderer` imported, instance created, `window.ovm` exposed with all 6 methods, AO computation function imported, render hook in main loop, profiler section labeled
- **T12** Demo gains Place-in-world button + handler
- **T13** End-to-end: synthetic asset → encodeOVM → decodeOVM → compute AO → renderer.add → render
- **T14** Asset pipeline matrix complete: splat + p3d + ovm all exposed

Stub GL test for the integer attribute pointer specifically (`vertexAttribIPointer` at location 5 with `UNSIGNED_INT`) confirms the AO upload path uses the capital-I integer variant — that's the v346 invariant continuing to hold.

## Try it

```js
engineVersion()   // "v349"

// From the demo
demos.set("ovm")
// → pick "torus", smoothness 0.4, click 📍 Place in world
demos.set(null)   // exit demo
ovm.list()
// [{ id: 1, name: "torus-from-demo-...", position: [0,5,-10], voxelCount: 408, ... }]
ovm.update(1, { rotation: 1.2, voxelScale: 0.5 })

// From a Pixal3D-style external pipeline
await ovm.load("/assets/my_trellis_output.ovm")

// Mix with other asset types
await splat.load("/assets/scene.ply")
await p3d.load("/assets/mesh.p3d")
await ovm.load("/assets/asset.ovm")
// All three render in the same world via the main loop
```

## Lineup

| Round | What |
|---|---|
| ✅ v343-v346 | Demo trilogy + AO + shadows |
| ✅ v347 | P3D + editable installs |
| ✅ v348 | `window.p3d.load(url)` |
| ✅ **v349** | **`window.ovm.load(url)`** (this) |
| v350+ | Sister formats: `MOL!` molecular / `MTO!` medical / `WND!` fluid (from lastai_finally.txt) |

Three of the four sister formats remain. P3D was the most practically valuable (low-VRAM was tuned for your 1080); the next-most-striking is likely `MOL!` molecular (AlphaFold ribbons rendered in real time would be a portfolio piece). Or skip ahead to frustum chunks + octree LoD if the rendering load matters more than file variety.
