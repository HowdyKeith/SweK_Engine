---
type: doc
title: "Round 347 — Pixal3D low-VRAM mesh (.p3d) + editable install catalog"
tags: ["swek-engine", "round-doc"]
---

# Round 347 — Pixal3D low-VRAM mesh (.p3d) + editable install catalog

Two parts:

1. **`.p3d` mesh viewer** — the output format of the Pixal3D low-VRAM Python pipeline described in `lastai_finally.txt`. Different from `.ovm` — it's a real triangle mesh (verts + indices), not sparse voxels.
2. **Editable install catalog** — bridge's `INSTALL_CATALOG` extracted to `ai-bridge/install_catalog.json`. Edit the JSON, save, click ▶ — the bridge re-reads on every call. No Node restart.

## Part 1 — `.p3d` format and viewer

### Format spec

```
Offset  Type     Field
------  -------  -----------------------------------
0-3     uint32   Magic = 0x21443350 ("P3D!" LE)
4-7     uint32   Vertex count (V)
8-11    uint32   Face count (F)
12+     V × 12 bytes:  float32 × 3  (X, Y, Z)
12+V*12: F × 6 bytes:  uint16 × 3   (i0, i1, i2)
```

12-byte header + raw vertex bytes + raw index bytes. No normals (computed on load via `computeMeshNormals`), no UVs, no materials. The format is intentionally tiny because Pixal3D's whole purpose is staying under 8GB VRAM on Pascal cards — the JSON metadata bloat that comes with glTF would defeat that.

### Why uint16 indices

Tight on file size. Matches Pascal GPU's preferred index buffer width. Caps a single submesh at 65,535 verts — enough for typical Pixal3D marching-cubes output on a 32³ latent grid. Test T6 verifies the encoder rejects `>65535` verts with a clear error message.

### Why no normals in the file

The Pixal3D paper / spec emits raw vertex positions only — normals get computed client-side. Saves ~33% file size and means the rendering side can choose smooth or flat shading. The demo uses `computeMeshNormals()` for area-weighted smooth normals (Gouraud shading); test T8 verifies icosphere normals point radially outward (smoothing works).

### Demo features

- **4 generators**: icosphere (subdivided 3 times → 642 verts/1280 tris), UV sphere, torus, twisted ribbon
- **Auto-rotate** — slow Y-axis spin so you can see the silhouette
- **Wireframe overlay** — see triangle topology over the shaded mesh
- **Export/Import** — full round-trip

### Why this is useful beyond demo

This same format is what your Trellis pipeline could emit if you wired up the low-VRAM Python optimizations from the doc:

- `torch.backends.cuda.matmul.allow_tf32 = False` (Pascal can't TF32)
- `cpu_offload_with_hook` from `accelerate` (one model block in VRAM at a time)
- Mixed-precision (`torch.autocast` with `float16`)
- Marching cubes on CPU (not GPU — prevents OOM cascades on extraction)
- Per-stage `torch.cuda.empty_cache()`

The doc's `export_to_webgl_raw()` Python snippet emits exactly this format. Run the pipeline, drop the `.p3d` into the demo, and the viewer renders it.

## Part 2 — Editable install catalog

### What changed

`ai-bridge/server.js` had a 95-line inline `INSTALL_CATALOG` JavaScript object. That's now:

- **`ai-bridge/install_catalog.json`** — the actual catalog (26 entries; 23 runnable + 3 metadata/info)
- **`loadInstallCatalog()`** function in server.js — reads JSON on each request, `mtime`-cached, graceful degrade to last-good-cache on parse errors

### What the user gets

**Edit the JSON file in any text editor. Save. Next click of ▶ in the panel uses the new commands.** No Node restart. No engine rebuild.

The panel's footer now shows the catalog file path:

```
Edit installs: /path/to/ai-bridge/install_catalog.json · ✓ 23 entries · re-read on every ▶ click
```

If the JSON is malformed:

```
Edit installs: /path/to/install_catalog.json · ⚠ parse error: Unexpected token at line 5 · re-read on every ▶ click
```

Bridge serves last-good-cache when a parse error happens, so a typo in mid-edit doesn't break running operations.

### New install entries for P3D!

Three new items added to the catalog and the install panel:

| ID | Purpose |
|---|---|
| `py-accelerate` | `accelerate` lib — provides `cpu_offload_with_hook` (the load-bearing optimization for 8GB cards) |
| `py-safetensors` | Safe tensor serialization — usually transitive but explicit for the Pixal3D venv |
| `py-pixal3d-stack` | **One-shot install**: `trimesh` + `accelerate` + `safetensors` + `numpy==1.26.4` + `scipy` in one pip command. Pin numpy 1.26 because >2.0 breaks many Trellis-era libs. |

### Live edit test verified

The bridge was started in-process, baseline catalog read (23 entries), then the JSON file was edited on disk to add a new entry, and a second GET confirmed the bridge picked up the new entry (24 entries) including its mtime change — all without restart. Then a `POST /install/exec` with `dryRun:true` for the new entry returned the resolved command. Test artifact in /tmp/v347_bridge.log.

## Tests — 1370/1370 cumulative

`test_v347.mjs` adds 68 tests across 12 groups:

- **T1-T8** P3D format: magic decodes to literal "P3D!", round-trip identity (empty/single tri/all 4 generators), error paths (bad magic, too-small, non-multiple-of-3, wrong array type, uint16 overflow, truncation), bbox calc, normal computation (flat triangle → +Z; icosphere → radial)
- **T9** Catalog JSON parses; has `py-pixal3d-stack` / `py-accelerate` / `py-safetensors`; stack installs all required libs incl. pinned numpy; metadata `_doc` keys present
- **T10** Server.js refactored: references the JSON file, has `loadInstallCatalog` function, uses mtime caching, inline literal removed, 4 call sites use the function
- **T11** Install panel: P3D entries present, mentions `cpu_offload_with_hook`, fetches `/install/catalog`, shows source path in footer
- **T12** Main wiring: v347, P3dDemo imported, render hook wired

## Try it

```js
engineVersion()   // "v347"
demos.set("p3d")
```

In the demo panel:
1. Default **icosphere** loads with auto-rotate on
2. Toggle **wireframe** to see the 1280-triangle topology
3. Try **torus** — slimmer file (~13KB), more triangles per square unit
4. **Export .p3d** — file downloads
5. **Import .p3d** — the same file round-trips

For the install panel:
1. Open the Install dock tab on the left edge
2. Scroll to **Python packages**
3. Three new items: `py-accelerate`, `py-safetensors`, `py-pixal3d-stack`
4. Click ▶ on `py-pixal3d-stack` — installs everything for the Pixal3D pipeline in one shot
5. Footer shows the catalog source path; edit `ai-bridge/install_catalog.json` to add/modify entries

## The bigger lineup

| Round | What |
|---|---|
| ✅ v343-v345 | Demo trilogy (NRC / Flow / OVM) |
| ✅ v346 | OVM + AO + PCF shadows |
| ✅ v347 | P3D! mesh viewer + editable install catalog (this) |
| v348+ | Frustum chunks + octree LoD on OVM |
| v349+ | Sister formats: `MOL!` molecular / `MTO!` medical / `WND!` fluid |

The Pixal3D Python pipeline itself (the actual encoder that converts model output to `.p3d`) is left as user-side work — install the deps with `py-pixal3d-stack`, then port the Python from `lastai_finally.txt` into your Trellis env to generate real `.p3d` files. The JS viewer in this round will render them.
