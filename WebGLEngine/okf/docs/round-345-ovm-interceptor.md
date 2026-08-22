---
type: doc
title: "Round 345 — Demo #1: TRELLIS-2 O-Voxel Interceptor (.ovm)"
tags: ["swek-engine", "round-doc"]
---

# Round 345 — Demo #1: TRELLIS-2 O-Voxel Interceptor (.ovm)

Last of the three core topic demos. v343 was MLP-per-fragment, v344 was Flow Matching + RLE binary, v345 is **sparse voxel ingestion** with the dual-grid displacement trick that makes voxels look organic instead of Minecraft-cubic.

## What landed

### `engine/ovmFormat.js`

The binary format spec:

```
Offset  Type     Field
------  -------  -----------------------------------
0-3     uint32   Magic = 0x214D564F ("OVM!" LE)
4-7     uint32   Active node count (N)
8+      N × 22 bytes:
          0-5    int16 × 3   Sparse coords (X, Y, Z)
          6-17   f32   × 3   Dual-grid shape offset
          18-21  u8    × 4   PBR material RGBA
```

Why this exists: TRELLIS-2's Sparse-Compression VAE produces a 5%-sparse latent grid. A dense 64³ tensor with full PBR is ~1MB; the sparse representation is ~70KB for the same content. The 22-byte stride matches the WebGL2 instanced-attribute layout exactly — one `gl.bufferData()` and you're done.

Int16 coords (not uint16) so negative-origin grids work, useful for TRELLIS-2's latent space which centers on the origin. Float32 offsets even though they could be int8 quantized — keeps the precision for the dual-grid effect and avoids a JS-side decode step.

### `engine/ovmGenerator.js`

Four synthetic generators so the demo runs without a real TRELLIS-2 hook:

| Generator | What it makes | Where shape offset matters |
|---|---|---|
| `sphere(radius, smoothness)` | Solid sphere | Surface voxels get radial offsets — contours the analytical sphere |
| `torus(majorR, minorR, smoothness)` | Donut | Surface voxels offset along the minor-radius gradient |
| `roundedBox(size, cornerRadius, smoothness)` | Chamfered box | Edge/corner voxels offset toward the rounded surface |
| `terrain(size, amplitude, smoothness)` | Sine-wave heightfield | Top-layer voxels get an upward offset for a softer hillside |

Each generator returns the `{ count, coords, offsets, materials }` struct that `encodeOVM()` accepts. Tested round-trip: all four encode and decode byte-exact.

### `demos/ovm/ovmDemo.js` — the dual-grid renderer

The shader follows the spec from your `lastai_finally.txt` doc:

```glsl
// Vertex shader — per-instance shape_offset shifts the cube
vec3 deformed_vertex = a_box_vertex + i_shape_offset;
vec3 world_pos = u_origin + (deformed_vertex + i_spatial_coord) * u_voxel_scale;
```

The `i_shape_offset` is per-instance (one offset per voxel, applied to all 8 corners of that cube). Effect: each cube is shifted along its surface normal proportional to how close it is to the analytical surface. The grid lines disappear and you see a wavy, organic shape.

Fragment shader does Lambertian diffuse with a single directional light, mixing the PBR base color with `(diffuse + 0.3)` ambient. Per-instance material color is uploaded as `Uint8Array` with `vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, ...)` — normalized to `[0,1]` on the GPU, no JS-side conversion.

### Panel features

- **Generator dropdown** — sphere / torus / rounded box / terrain
- **Smoothness slider** — 0 to 0.5, controls offset magnitude. **Slide to 0 to see the rigid Minecraft-cube version of the same shape** for direct comparison
- **🔄 Regenerate** — apply current settings
- **💾 Export .ovm** — download the current asset as binary
- **📂 Import .ovm** — load any .ovm file (synthetic or from a future TRELLIS-2 hook)

## Comparison with v343/v344

| Demo | Asset | Inference per frame | Storage |
|---|---|---|---|
| v343 NRC | Static grid | 131-weight MLP runs per fragment | 524 bytes (weight texture) |
| v344 Flow | Dynamic grid | None (CPU integrator) | ~5KB (.vx RLE) |
| **v345 OVM** | **Static sparse list** | **None (just attribute upload)** | **22 B/voxel** |

OVM is the production format — small, fast, no compute. The other two demos generate data; OVM ingests it.

## Tests — 1274/1274 cumulative

`test_v345.mjs` adds 58 tests across 13 groups:

- **T1** Format constants verified: magic decodes to "OVM!" when read little-endian, 8B header, 22B node
- **T2-T4** Round-trip: empty asset, single voxel with negative int16 coords + negative float offsets, 3-voxel sequence preserves order byte-exact
- **T5** Bbox: min/max/center/size correct on multi-voxel sample, empty bbox zeroed
- **T6** Error paths: bad magic, too-small buffer, mismatched array lengths, wrong typed-array kinds, truncated body
- **T7-T10** Generators: sphere has correct voxel count (~925 for r=6), all voxels within radius, **surface voxels have nonzero offsets and interior voxels have zero offsets** (the dual-grid invariant), torus has the central hole, rounded box has the chamfered corners, terrain has grass/dirt color stratification
- **T11** All four generators encode cleanly through `encodeOVM`+`decodeOVM`
- **T12** `smoothness = 0` produces fully rigid Minecraft-style cubes (no offsets anywhere) — confirms the smoothness parameter actually works
- **T13** Main wiring intact

## Try it

```js
engineVersion()    // "v345"
demos.set("ovm")
```

In the panel:
1. Pick **sphere**, smoothness **0.40**, regenerate
2. Drop smoothness to **0** — same voxels, rigid Minecraft cubes
3. Crank back to **0.50** — voxels stretch toward the analytical surface
4. Try **terrain** with smoothness 0.30 — the hills smooth out
5. Click **💾 Export .ovm** — file downloads, instance count and byte size in the status line
6. Click **📂 Import .ovm** — pick the file you just exported, it round-trips

If you wire up a Python TRELLIS-2 hook later that emits the same 22-byte stride format, drop the file into `splat.load()`'s sibling — same JS reader, same WebGL pipeline.

## On the demo trilogy

Three rounds, three architectural patterns. Together they cover the full lifecycle of an AI-generated voxel asset:

- **NRC (v343)** — Inference inside the renderer
- **Flow (v344)** — Inference in JS, integrate to a generated state
- **OVM (v345)** — Pre-generated sparse data, just render

Anyone reading the engine source now has working reference implementations of three completely different "AI meets rendering" approaches.

## Next

The doc you sent had extensions still pending:

- **v346** — AO bitmask (8 corners × 4 bits per voxel as uint32 instance attr) + PCF shadow mapping, both layered on top of the OVM renderer
- **v347** — Frustum chunks (16³ grouping) + sparse-voxel-octree LoD transitions

Plus the sister formats from `lastai_finally.txt`:

- **v348+** — `MOL!` molecular, `MTO!` medical, `WND!` fluid, `P3D!` low-VRAM Pixal3D mesh

Pick one.
