// =============================================================================
// FILE: /engine/idleTasks.js
// ROUND: 191
// =============================================================================
//
// Four background tasks the IdleScheduler can run during idle frames. Each
// is a factory returning a `tick(deadline) => boolean` plus optional
// `setup(ctx)` / `teardown()` hooks. Tasks are independent — enable or
// disable any subset via localStorage.
//
// 1. makeDecorDensifier(ctx)        — sprinkles tiny "rock" entities across
//                                      the surface so the world reads as
//                                      detailed without one-shot spawn cost.
// 2. makeVoxelAutomata(ctx)         — runs a CPU-only cellular automaton
//                                      simulation; produces a debug overlay
//                                      canvas (mounted by HUD) showing the
//                                      pattern evolve. Pure proof-of-life
//                                      that idle CPU is being used.
// 3. makeMeshDecimator(ctx)         — when assetLoader fires a mesh-swap
//                                      (e.g. Trellis output lands), runs
//                                      quadric error metric edge-collapse
//                                      decimation incrementally to produce
//                                      a half-poly LOD. Stores on
//                                      mesh.lodMesh. Round 197 upgrade
//                                      from v191's vertex-cluster method.
// 4. makeBiomeEdgeDecor(ctx)        — biome-aware version of #1: detects
//                                      biome boundary cells and places
//                                      transitional decor (different kinds
//                                      per biome pair).
//
// Each task receives `ctx` from main.js:
//   { router, world, biomeMap, assetLoader, terrainTop(x,z) }
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Decor Densifier
// -----------------------------------------------------------------------------
// Scatters small "stone" decorations across the surface. Uses the existing
// `obelisk` asset at very small scale so we don't need a new asset registered.
// 1-3 placements per tick, up to a hard cap. Tracks placed entity IDs so
// the user can clear them via a console command if desired.

export function makeDecorDensifier(ctx, opts = {}) {
    const target     = opts.target     ?? 240;      // max total decorations
    const perTick    = opts.perTick    ?? 2;
    const region     = opts.region     ?? 140;
    const center     = opts.center     ?? { x: 0, z: 30 };
    const seed       = opts.seed       ?? 8675309;
    const placed     = [];                          // spawned entity ids
    let rngState     = seed >>> 0;
    const rand = () => {
        // Mulberry32 — small, deterministic, fast
        rngState = (rngState + 0x6D2B79F5) >>> 0;
        let t = rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    return {
        name:  "decor_densifier",
        label: "🪨 decor densifier",
        ids:   placed,                              // exposed for console clearing
        tick(deadline) {
            if (!ctx.router || !ctx.world) return false;
            if (placed.length >= target) return false;
            let count = 0;
            while (count < perTick && deadline.timeRemaining() > 1) {
                const dx = (rand() - 0.5) * region;
                const dz = (rand() - 0.5) * region;
                const x  = Math.floor(center.x + dx);
                const z  = Math.floor(center.z + dz);
                const top = ctx.terrainTop ? ctx.terrainTop(x, z) : null;
                if (!top) { count++; continue; }
                // Skip lava / water / ash so rocks don't float on weird surfaces
                if (top.material === 10 || top.material === 12 || top.material === 11) {
                    count++; continue;
                }
                // Skip near the showcase row so we don't clutter the demo strip
                if (Math.abs(z - 30) < 5 && x >= -25 && x <= 25) { count++; continue; }
                const scale = 0.18 + rand() * 0.22;     // tiny stones
                const yaw   = rand() * Math.PI * 2;
                const result = ctx.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "obelisk",                  // cheap procedural placeholder
                    kind:    "obelisk",
                    x, y: top.y + 1, z, scale, yaw,
                });
                if (result?.ok && result.id != null) placed.push(result.id);
                count++;
            }
            return placed.length < target;
        },
    };
}

// -----------------------------------------------------------------------------
// 2. Voxel Automata (CPU-only cellular automaton with debug overlay)
// -----------------------------------------------------------------------------
// 96x96 toroidal grid running Conway's Game of Life with a "Brian's Brain"
// twist (dying cells linger as a fade trail before going dark again). Pure
// CPU work — no engine wiring at all. Outputs an offscreen canvas that the
// HUD can mount as a tiny preview. Demonstrates idle-CPU consumption
// visibly: when you look at the HUD, the pattern is visibly evolving.

export function makeVoxelAutomata(ctx, opts = {}) {
    const W      = opts.size ?? 96;
    const H      = opts.size ?? 96;
    const N      = W * H;
    let   gen    = 0;
    const cells  = new Uint8Array(N);     // 0 = dead, 1 = alive, 2 = dying
    const next   = new Uint8Array(N);
    // Random initial seed — 22% live
    for (let i = 0; i < N; i++) cells[i] = (Math.random() < 0.22) ? 1 : 0;

    // Offscreen canvas for the HUD to embed
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = "image-rendering:pixelated; image-rendering:crisp-edges;";
    const ictx = canvas.getContext("2d", { willReadFrequently: false });
    const imgData = ictx.createImageData(W, H);

    function neighbors(x, y) {
        // 8-neighbor count with toroidal wrap. Hot loop — inline.
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
            const yy = (y + dy + H) % H;
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const xx = (x + dx + W) % W;
                if (cells[yy * W + xx] === 1) n++;
            }
        }
        return n;
    }

    function paint() {
        const data = imgData.data;
        for (let i = 0, j = 0; i < N; i++, j += 4) {
            const v = cells[i];
            if (v === 1) {              // alive — cyan
                data[j]   = 80;  data[j+1] = 220; data[j+2] = 255; data[j+3] = 255;
            } else if (v === 2) {       // dying — dim amber
                data[j]   = 90;  data[j+1] = 60;  data[j+2] = 20;  data[j+3] = 255;
            } else {                    // dead — near-black
                data[j]   = 8;   data[j+1] = 10;  data[j+2] = 18;  data[j+3] = 255;
            }
        }
        ictx.putImageData(imgData, 0, 0);
    }
    paint();

    return {
        name:  "voxel_automata",
        label: "🧬 voxel automata",
        canvas,
        gen() { return gen; },
        tick(deadline) {
            // Each tick advances the simulation by one generation, then
            // re-paints the canvas. ~96x96 = 9216 cells; on a modern CPU
            // this is well under 1ms. Re-occupy idle frames forever.
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = y * W + x;
                    const here = cells[i];
                    const n = neighbors(x, y);
                    if (here === 1) {
                        // Live cell — Conway rules with a "dying" delay
                        next[i] = (n === 2 || n === 3) ? 1 : 2;
                    } else if (here === 2) {
                        next[i] = 0;          // dying → dead
                    } else {
                        next[i] = (n === 3) ? 1 : 0;
                    }
                }
                if (deadline.timeRemaining() < 0.2) break;     // safety
            }
            cells.set(next);
            gen++;
            // Periodic re-seed when populations collapse, so the
            // simulation never looks "stuck" to a glance
            let alive = 0;
            for (let i = 0; i < N; i++) if (cells[i] === 1) alive++;
            if (alive < 12 || alive > N * 0.6) {
                for (let i = 0; i < N; i++) cells[i] = (Math.random() < 0.22) ? 1 : 0;
            }
            paint();
            return true;       // never finishes — perpetual background sim
        },
    };
}

// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// 3. Mesh Decimator (Round 197 — quadric error metric edge-collapse)
// -----------------------------------------------------------------------------
// Replaced v191's vertex-cluster decimator with the real Garland-Heckbert
// algorithm. Same output shape on mesh.lodMesh, much better silhouette
// preservation at high reduction (60-80%). Each tick runs one bounded
// chunk of decimation work via createQuadricDecimator's incremental
// step() interface. Output identical to before:
//   mesh.lodMesh = {
//       positions, indices, vertexCount, indexCount, reductionPct
//   }

import { createQuadricDecimator } from "./quadricDecimate.js";

export function makeMeshDecimator(ctx, opts = {}) {
    const targetRatio = opts.targetRatio ?? 0.5;
    const queue = [];     // [{ name, mesh, runner }]
    const done  = new Map();

    if (ctx.assetLoader?.onMeshSwap) {
        ctx.assetLoader.onMeshSwap((name, oldMesh, newMesh) => {
            if (!newMesh || (newMesh.vertexCount ?? 0) < 500) return;
            const positions = newMesh._rawPositions;
            const indices   = newMesh._rawIndices;
            if (!positions || !indices) return;
            // Skip if already decimated
            if (newMesh.lodMesh) return;
            const runner = createQuadricDecimator(positions, indices, { targetRatio });
            queue.push({ name, mesh: newMesh, runner, vertCount: newMesh.vertexCount });
        });
    }

    return {
        name:  "mesh_decimator",
        label: "📐 mesh decimator",
        queue, done,
        tick(deadline) {
            if (queue.length === 0) return true;     // idle but registered
            const job = queue[0];
            const more = job.runner.step(deadline);
            if (!more && job.runner.isDone()) {
                const result = job.runner.getResult();
                job.mesh.lodMesh = result;
                done.set(job.name, {
                    from: job.vertCount,
                    to:   result.vertexCount,
                    triFrom: job.runner.ctx.T0,
                    triTo:   result.indexCount / 3,
                    reductionPct: result.reductionPct,
                });
                console.log(`[mesh_decimator] "${job.name}": ${job.vertCount} → ${result.vertexCount} verts (${result.reductionPct}% off), ${job.runner.ctx.T0} → ${result.indexCount / 3} tris  [quadric]`);
                queue.shift();
            }
            return true;
        },
    };
}

// -----------------------------------------------------------------------------
// 4. Biome Edge Decor (biome-aware boundary embellishment)
// -----------------------------------------------------------------------------
// Walks random surface points. If the point sits on a biome boundary
// (any neighbor in cardinal/diagonal directions belongs to a different
// biome), place a small transitional decoration. Each biome pair gets
// a characteristic kind, so plains→jungle gets ferns, plains→sand gets
// dune grass, etc.
//
// MVP uses obelisk at varying scale/tint as the universal placeholder
// since the engine doesn't have separate fern/grass-tuft assets yet —
// the visible pattern is "more density at biome edges" which is the
// portfolio story. A future round can register proper assets.

export function makeBiomeEdgeDecor(ctx, opts = {}) {
    const target  = opts.target  ?? 180;
    const perTick = opts.perTick ?? 1;
    const region  = opts.region  ?? 140;
    const center  = opts.center  ?? { x: 0, z: 30 };
    const placed  = [];
    let seed = (opts.seed ?? 19937) >>> 0;
    const rand = () => {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    return {
        name:  "biome_edge_decor",
        label: "🌾 biome edge decor",
        ids:   placed,
        tick(deadline) {
            if (!ctx.router || !ctx.biomeMap || !ctx.world) return false;
            if (placed.length >= target) return false;
            let count = 0;
            while (count < perTick && deadline.timeRemaining() > 1) {
                count++;
                const dx = (rand() - 0.5) * region;
                const dz = (rand() - 0.5) * region;
                const x  = Math.floor(center.x + dx);
                const z  = Math.floor(center.z + dz);
                const here = ctx.biomeMap.getBiomeAt(x, z);
                let isEdge = false;
                // Cardinal-only neighbor check (faster than 8-way and
                // sufficient for boundary detection)
                for (const [ox, oz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    if (ctx.biomeMap.getBiomeAt(x + ox, z + oz) !== here) { isEdge = true; break; }
                }
                if (!isEdge) continue;
                const top = ctx.terrainTop ? ctx.terrainTop(x, z) : null;
                if (!top) continue;
                if (top.material === 10 || top.material === 12 || top.material === 11) continue;
                // Slightly larger than densifier so the biome-edge
                // decor visually reads as deliberate clusters
                const scale = 0.28 + rand() * 0.32;
                const yaw   = rand() * Math.PI * 2;
                const result = ctx.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "obelisk",
                    kind: "obelisk",
                    x, y: top.y + 1, z, scale, yaw,
                });
                if (result?.ok && result.id != null) placed.push(result.id);
            }
            return placed.length < target;
        },
    };
}

// -----------------------------------------------------------------------------
// 5. Mesh Post-Processor (Round 196)
// -----------------------------------------------------------------------------
// Listens for assetLoader.onMeshSwap and runs three pure-JS post-processing
// passes on each meaningfully-sized mesh: hole-fill, Laplacian smoothing,
// normal recomputation. The passes live in engine/meshPostProcess.js;
// this factory just orchestrates the multi-phase pipeline across idle
// ticks so big Trellis outputs don't block the main thread.
//
// Output is stored on the mesh as:
//   mesh.processed = {
//       positions,           // smoothed Float32Array
//       indices,             // hole-filled (typed array, same kind as input)
//       normals,             // recomputed Float32Array, area-weighted
//       addedTriangles,      // count of holes filled
//       unfilledHoles,       // count of holes too complex to fill
//       reductionPct: 0,     // for parity with the decimator's output shape
//   };
//
// A future renderer round can prefer mesh.processed over mesh.positions
// once the renderer is taught to consume the smoothed buffers. For now
// the data is computed and stored — pure win on idle CPU, no risk to
// the live render path.
//
// Phases per mesh:
//   "holefill"  → run fillSingleTriangleHoles (fast, one-shot)
//   "smooth"    → run laplacianSmooth (~10-100ms per iteration depending
//                  on size; we split iterations across ticks if heavy)
//   "normals"   → run recomputeNormals (fast, one-shot)
//   "done"      → attach result, log summary, pop from queue

import {
    fillSingleTriangleHoles as _fillHoles,
    laplacianSmooth as _smooth,
    recomputeNormals as _normals,
} from "./meshPostProcess.js";

export function makeMeshPostProcessor(ctx, opts = {}) {
    const minVerts = opts.minVerts ?? 500;       // skip cheap procedural placeholders
    const maxVerts = opts.maxVerts ?? 200000;    // skip absurdly large meshes
    const smoothIterations = opts.iterations ?? 3;
    const smoothLambda     = opts.lambda     ?? 0.5;

    const queue = [];          // [{ name, mesh, phase, ...workState }]
    const done  = new Map();   // name → summary

    if (ctx.assetLoader?.onMeshSwap) {
        ctx.assetLoader.onMeshSwap((name, oldMesh, newMesh) => {
            if (!newMesh) return;
            const verts = newMesh.vertexCount ?? 0;
            if (verts < minVerts || verts > maxVerts) return;
            const positions = newMesh._rawPositions;
            const indices   = newMesh._rawIndices;
            if (!positions || !indices) return;
            // Skip if already processed (don't redo work on a re-swap of
            // the same mesh)
            if (newMesh.processed) return;
            queue.push({
                name,
                mesh: newMesh,
                phase: "holefill",
                positions,
                indices,
                workPos: null,
                workIdx: null,
                addedTris: 0,
                unfilled:  0,
                smoothIter: 0,
            });
        });
    }

    return {
        name:  "mesh_postprocess",
        label: "✨ mesh post-process",
        queue, done,
        // Round 284 — public enqueue API. Lets the asset pipeline
        // route its imported meshes through the idle scheduler before
        // voxelization. Returns a Promise that resolves with the
        // processed { positions, indices, normals, addedTriangles,
        // unfilledHoles } shape when the job completes. The job runs
        // on the same yield-friendly idle scheduler, so the renderer
        // keeps 60fps while it processes.
        //
        // Use this from console:
        //   const ip = window.idleTasks.postproc;
        //   const r = await ip.enqueue("mesh_xyz", positions, indices);
        enqueue(name, positions, indices, opts = {}) {
            return new Promise((resolve) => {
                // Synthesize a minimal mesh-like object so the existing
                // pipeline can store the result on .processed at the end.
                const meshShim = {
                    vertexCount: positions.length / 3,
                    _resolve: resolve,
                };
                queue.push({
                    name,
                    mesh: meshShim,
                    phase: "holefill",
                    positions,
                    indices,
                    workPos: null,
                    workIdx: null,
                    addedTris: 0,
                    unfilled:  0,
                    smoothIter: 0,
                    _externalResolve: resolve,
                });
            });
        },
        tick(deadline) {
            if (queue.length === 0) return true;   // idle but registered
            const job = queue[0];

            if (job.phase === "holefill") {
                const r = _fillHoles(job.positions, job.indices);
                job.workIdx   = r.indices;
                job.addedTris = r.addedTriangles;
                job.unfilled  = r.unfilledHoles;
                job.phase = "smooth";
                return true;
            }

            if (job.phase === "smooth") {
                // Single-iteration step so we can yield between iterations
                // when the mesh is large. Reuse workPos across ticks.
                const startPos = job.workPos || job.positions;
                const oneIter = _smooth(startPos, job.workIdx, {
                    iterations: 1,
                    lambda: smoothLambda,
                    smoothBoundary: false,
                });
                job.workPos = oneIter;
                job.smoothIter++;
                if (job.smoothIter >= smoothIterations) {
                    job.phase = "normals";
                }
                return true;
            }

            if (job.phase === "normals") {
                const normals = _normals(job.workPos, job.workIdx);
                // Attach result to the mesh
                job.mesh.processed = {
                    positions:      job.workPos,
                    indices:        job.workIdx,
                    normals,
                    addedTriangles: job.addedTris,
                    unfilledHoles:  job.unfilled,
                    reductionPct:   0,
                };
                done.set(job.name, {
                    verts:          job.workPos.length / 3,
                    addedTris:      job.addedTris,
                    unfilledHoles:  job.unfilled,
                    iters:          smoothIterations,
                });
                console.log(`[mesh_postprocess] "${job.name}": ${job.workPos.length / 3} verts smoothed (${smoothIterations} iters), ${job.addedTris} hole tri(s) filled${job.unfilled ? `, ${job.unfilled} complex hole(s) skipped` : ""}, normals recomputed`);
                // Round 200 — apply the smoothed data to the live GL
                // buffers so the renderer immediately shows the improved
                // mesh. Same vertex count means no VAO invalidation.
                if (ctx.assetLoader?.applyProcessedMesh) {
                    ctx.assetLoader.applyProcessedMesh(job.name);
                }
                // Round 284 — resolve the public-enqueue Promise if
                // this job was enqueued externally rather than via the
                // onMeshSwap hook.
                if (job._externalResolve) {
                    try {
                        job._externalResolve({
                            positions: job.workPos,
                            indices:   job.workIdx,
                            normals,
                            addedTriangles: job.addedTris,
                            unfilledHoles:  job.unfilled,
                            smoothIterations,
                        });
                    } catch {}
                }
                queue.shift();
                return true;
            }

            // Shouldn't reach here; defensive cleanup
            queue.shift();
            return true;
        },
    };
}
