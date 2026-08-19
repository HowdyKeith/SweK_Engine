# Round 331 — Worker pool tier 1: weld → normals mesh post-processing

Foundation for the CPU worker pool system. Three new files, no
touching of `gpuAssetLoader.js` or `glbParser.js` (the integration
approach for those is an open architectural question — separate
round). Opt-in only, console-driven for now.

This is the **tier 1** of the master plan from user memory:
- Tier 1 (this round): weld → normals pipeline
- Tier 2 (deferred): speculative parallel fallback meshes
- Tier 3 (deferred): worker-pool ECG lights, OffscreenCanvas
  thumbnails, mesh QC badges

After this, the engine has CPU mesh-processing infrastructure
ready for any future round that wants to clean up generated
geometry without blocking the main thread.

---

## Three new files

### `worker/meshPostProcessor.worker.js`

The kernel. Runs inside a Web Worker, but ALSO works as a regular
ES module so Node can import the pure functions for testing.

Exports three functions:
- `weld(positions, indices, epsilon = 1e-4)` — bucket vertices by
  epsilon-quantized position, dedupe, remap indices
- `recomputeNormals(positions, indices)` — area-weighted smooth
  normals via face-normal accumulation
- `weldAndNormals(positions, indices, epsilon)` — combined pipeline

The Worker bootstrap at the bottom registers a `message` handler
that routes operations by name and replies with transferable
buffers. The bootstrap only fires inside an actual Worker context
(`self.postMessage` exists, `window` doesn't) — Node import is a
no-op for the bootstrap section.

### `simulation/WorkerPool.js`

Generic worker pool. Built for this use case but task-agnostic —
any operation name + cloneable payload + optional transfer list.

API:
```js
const pool = new WorkerPool({ workerUrl, size, label });
const result = await pool.submit("weldAndNormals", payload, [transferBufs]);
pool.stats();    // { jobs, failures, totalMs, avgMs, pending }
pool.dispose();
```

Worker count defaults to `floor(hardwareConcurrency / 2)`, clamped
to [1, 4]. Round-robin distribution, no priority queue. Workers
auto-register with the ECG HUD (`ui/workerActivity.js`) on
construction for the tier 3 visualization (lazy import — pool
works if that module is missing).

### `simulation/MeshPostProcessor.js`

High-level wrapper. Lazy-initializes the worker pool on first job.
Exposes one main method:

```js
const meshPP = new MeshPostProcessor();
const result = await meshPP.process({
    positions: float32Array,    // transferred — caller's array is detached!
    indices:   uint16Or32Array, // transferred — caller's array is detached!
    epsilon:   1e-4,
    name:      "kaiju_water",   // optional, for per-mesh stats
});
// → { positions, indices, normals, originalCount, weldedCount, durationMs }
```

The typed arrays' buffers are TRANSFERRED to the worker (zero-copy).
After calling `process()`, the caller's input arrays are detached
and unusable. This is documented in the function header. Clone
before submitting if you need to keep the originals.

Per-name stats persist on the post-processor; `meshPP.allStats()`
returns a list with `{ name, weldedFrom, weldedTo, ratio,
durationMs }`. Useful for portfolio readouts ("typical kaiju mesh
welded 1834 → 612 verts, 67% reduction, 4.2ms").

---

## Console API

Wired in main.js as `window.meshPP`:

```js
meshPP.process(data)        // run a single mesh through the pipeline
meshPP.setEnabled(true)     // flip the on-flag (for future auto-mode)
meshPP.enabled()            // current flag
meshPP.stats()              // pool-wide: jobs, failures, totalMs, avgMs
meshPP.statsFor(name)       // per-mesh stats (if you passed name to process)
meshPP.allStats()           // list of all per-mesh stats
meshPP.dispose()            // terminate workers
```

Disabled by default. The flag isn't actively read by anything yet
— it's a hook for the (future) auto-integration round when the
asset-loader/glbParser path gets wired up.

---

## Why opt-in

Two reasons:

1. **The architectural question is open.** From userMemories:
   *"An open question remains about whether to apply surgical edits
   directly to gpuAssetLoader.js and glbParser.js or use the generic
   shim pattern."* Wiring the post-processor into the loader is a
   design decision that should be made deliberately — not
   bundled with the kernel implementation. v331 ships the
   kernels; the integration round resolves that question.

2. **It's destructive (in a useful way).** Welding removes
   duplicated vertices and changes normals. If a mesh was
   intentionally exported with seams (e.g., the OBJ has separate
   normals at corners for hard edges), welding smooths them away.
   Auto-applying to every loaded mesh could ruin the look of
   things that don't need cleanup.

When you're ready to integrate, the typical pattern is:
- After `_loadOBJFromText` parses a mesh, check `meshPP.enabled()`
- If on, fire-and-forget `meshPP.process(...)` with a callback
  that re-uploads the cleaned-up buffers to the GPU
- Mesh appears un-welded for the first ~5ms, then upgrades

Or you can apply it to one specific mesh at a time from the
console while inspecting results — the per-name stats are designed
for that workflow.

---

## Tests — 701/701 cumulative

`test_mesh_pp_v331.mjs` adds 43 tests in three sections:

**weld (T1-T7, 18 tests):**
- T1: dedupes identical positions, remaps indices
- T2: 1μm-apart verts collapse (epsilon = 1e-4)
- T3: 1mm-apart verts stay separate (well beyond epsilon)
- T4-T5: preserves Uint16 / Uint32 index type
- T6: handles empty input
- T7: cube with 24 separated corners → 8 unique

**recomputeNormals (T8-T13, 12 tests):**
- T8-T9: single triangle in XY plane → +Z, in YZ plane → +X
- T10: two coplanar triangles → all 4 verts share +Y normal
- T11: tetrahedron with outward winding → apex normal ≈ +Y, base
  vertices point in their respective diagonal directions
- T12: collinear (degenerate) triangle → zero normals
- T13: orphan vertex (no incident triangles) stays at (0,0,0)

**weldAndNormals (T14-T15, 13 tests):**
- T14: 6-vert duplicated triangle → 3 verts + correct normals
- T15: cube with 24 verts → 8 unique, all unit-length diagonal
  normals (each corner sums 3 face normals from its 3 incident faces)

T10 and T11 caught winding-handedness bugs in my test assertions
on first run — the kernels were right, my "expected outward" was
wrong. Fixing the windings in the test was the actual work; the
kernels passed correctly once the asserted-outward direction
matched the right-hand rule.

---

## Try it

A simple test from the console:

```js
// Take a mesh that's known to have duplicated corners (anything OBJ-
// loaded — the parser keeps face-vertex separation by default):
const meshData = {
    positions: new Float32Array([
        0,0,0, 1,0,0, 0,1,0,    // tri 1
        0,0,0, 1,0,0, 0,1,0,    // tri 2 — exact dupes
    ]),
    indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
};
const result = await meshPP.process(meshData);
console.log(`welded ${result.originalCount} → ${result.weldedCount}`);
console.log(`normals[0..2]:`, result.normals.slice(0, 3));
// Expect: "welded 6 → 3", normals[0..2] = [0, 0, 1]
```

Or run it on an actual loaded asset (clone the buffers first since
transfer detaches):

```js
const mesh = assetLoader.getMesh("kaiju_water");   // hypothetical accessor
const result = await meshPP.process({
    positions: new Float32Array(mesh.positions),    // clone
    indices:   new Uint16Array(mesh.indices),       // clone
    name: "kaiju_water",
});
meshPP.statsFor("kaiju_water");
// → { weldedFrom: 1834, weldedTo: 612, ratio: 0.334, durationMs: 4.2 }
```

---

## What's NOT in v331

- **No auto-integration with asset loader.** Pending architectural
  decision. Manual `meshPP.process()` is the entry point.
- **No GPU buffer upload helper.** Caller is responsible for
  uploading the cleaned mesh back to WebGL.
- **No tangent recomputation.** Tier 1 is positions/indices/normals
  only. Tangents would require UV data and a separate kernel.
- **No LOD generation.** Could be a future tier.
- **No mesh validation / repair.** Degenerate triangles aren't
  removed (their normals come out as zero — that's it). Holes
  aren't filled. Non-manifold geometry isn't flagged.

---

## Status — three rounds in the original-docket queue

This is the first of three rounds I outlined for the original
docket pivot:

- **v331: WorkerPool tier 1 — weld → normals**  (this round)
- **v332: OBJ floating preview canvas** — draggable handle,
  renders above the bench panel
- **v333: AI MODELS panel extension** — Trellis/ComfyUI status
  row + per-model quick-test buttons

The CS arc is parked. v320-v330 ship as a coherent unit;
validation is on you.

Worker pool foundation laid. Next: the OBJ preview canvas, then
the panel polish, then back to the deeper integration questions
(asset loader wiring, Trellis 2 + DINOv3, the open architectural
question about surgical vs shim).
