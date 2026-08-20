# Asset Pipeline + Workers: What Parallelizes, What Doesn't

This is the honest answer to "are the asset pipeline tools (InstantMesh, Hunyuan3D, Unique3D, CRM, UltraShape, cuda_voxelizer, mesh_to_vox) taking full advantage of our workers?"

## Short answer

**Not the way the question implies — but for the right reasons.**

The asset pipeline tools are GPU-bound external processes. Running two of them at once means they fight over the same VRAM and the same SM cores. On a GTX 1080 with 8GB, that almost always makes both slower than running them sequentially. CPU worker pools cannot help here.

What *can* be parallelized:
- **Multiple GPU jobs across separate processes** when there's headroom (Node bridge orchestrates this in `/asset-pipeline/race-generators`).
- **CPU-side mesh post-processing** after voxelization (already in the existing `WorkerPool.js` work — weld + normals + thumbnails).
- **CPU-side voxel stamping** — kind of. The actual setVoxel calls have to happen on the main thread because the chunk store isn't transferable. The win is "yield to the renderer between batches" so import doesn't freeze the page. That's `stampAsync` in `tools/voxImporter.js`.

## Where each stage lives

| Stage | Where it runs | Worker-able? |
|---|---|---|
| Image → coarse mesh (InstantMesh, Hunyuan3D, Unique3D, CRM) | Child Python process on the bridge | GPU-bound. Multiple processes possible IF VRAM allows, but they compete. |
| Coarse mesh → refined mesh (UltraShape) | Child Python process on the bridge | Same. |
| Mesh → voxels (cuda_voxelizer, mesh_to_vox) | Child native process on the bridge | GPU-bound. |
| .vox parse | Main thread JS | Cheap (<10ms for 128³); not worth worker overhead. |
| Voxel stamp into world | Main thread JS, setVoxel loop | **Not workerable** (chunk store on main thread), but chunkable + yielding. |
| Greedy mesh of resulting chunks | `chunkMesher.worker.js` (already a worker!) | **Already parallel** — the engine's chunk re-mesh fans out across cores. |
| Weld + normals on imported geometry | `MeshPostProcessor.js` + `WorkerPool.js` (your work-in-progress) | **Parallelizable** when complete. |

## What the bridge actually does in parallel

The bridge is single-threaded Node, but `child_process.spawn` returns immediately and Node's event loop juggles N concurrent subprocesses without blocking. So when you call `asset.raceGenerators()`:

1. Bridge spawns InstantMesh subprocess
2. Bridge spawns Hunyuan3D subprocess (~5ms later)
3. Bridge spawns Unique3D subprocess
4. Bridge spawns CRM subprocess
5. Node async-waits on all four `close` events via `Promise.allSettled`

CPU is barely touched in this orchestration — each subprocess is what's spinning up CUDA, loading model weights, and doing the work. The bridge collects results when each one finishes.

**This is genuine parallelism at the OS process level.** What it can't do is make the GPU 4× faster. On Pascal-class hardware (GTX 1080, 1070 Ti), running four 8GB models simultaneously will OOM. Two might fit if both use low-VRAM modes. The race endpoint surfaces this honestly — failed runs come back with their error in the result, so you can see which combinations work on your hardware.

## When to call `stamp` vs `stampAsync`

- `stamp` for <10K voxels (small props, 32³ test cubes). Synchronous, single tick.
- `stampAsync` for everything else. Yields every 4000 voxels, renderer keeps 60fps.

A 128³ model with 50% fill is ~1 million voxels (after scale=1). With `stamp` that's ~150-300ms of blocked main thread. With `stampAsync` that's ~9-18 frames of "stamping progressing" but the world keeps rendering.

## What's still TBD (genuine improvements possible)

- **Worker-side mesh post-processing on the imported mesh**: when you receive an `.obj` from InstantMesh and BEFORE voxelizing it, you could run weld + normals + decimation on a worker. Currently the mesh goes straight from the bridge to cuda_voxelizer — no JS-side cleanup. If imported meshes have artifacts (degenerate triangles, duplicate vertices) this is where to fix it.

- **Greedy mesh re-batch on import**: stamping forces a re-mesh of touched chunks. Currently each `setVoxel` marks its chunk dirty; the chunk re-mesh fires when the chunk is next drawn. For a big import this is many overlapping dirty notifications — could be coalesced.

- **Pipelined preview**: ComfyUI can yield intermediate decoded latents, InstantMesh can save the multi-view stage before MC, etc. Showing those previews as the pipeline runs is a UX win that's currently unrealized.
