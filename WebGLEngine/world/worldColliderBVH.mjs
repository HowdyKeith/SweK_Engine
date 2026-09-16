// WebGLEngine/world/worldColliderBVH.mjs -- task board #89.
//
// *** KAIJU LIVE EXCLUSIVELY IN world._heightAt VOXEL WORLDS AND HAVE NEVER HAD REAL COLLISION GEOMETRY. ***
// simulation/BotManager.js's own header records the split: a world exposes EITHER world.colliderBVH (a
// mesh/meshBVH.mjs MeshBVH, read by camera.js and BotManager.js for capsule-vs-triangle depenetration) OR
// world._heightAt (a coarse per-column height oracle, read by the flow-field solver and, until this file,
// by every kaiju). This is the missing half: a REAL MeshBVH, built from the SAME voxels the world actually
// renders, for a world that until now has only ever answered "how tall is this column."
//
// *** IT REUSES THE MESHER THE RENDERER ALREADY USES -- world/worldGlbExport.js's own reason, restated here
// because the same argument applies. *** world/chunkMesherCore.js's meshChunk() is what render/voxelrenderer.js
// actually dispatches (inline and via worker/chunkMesher.worker.js) for the default always-on blocky terrain
// path every kaiju world renders. Its `verts` output is already an unindexed, world-space, 9-floats-per-
// triangle buffer -- the exact layout mesh/meshBVH.mjs's MeshBVH constructor wants, modulo a Float32->Float64
// cast. Meshing a SECOND time with different logic would give kaiju collision against a surface the screen
// does not agree with; going through meshChunk means it cannot drift.
//
// *** WHY PER-CHUNK, NOT ONE BVH FOR THE WHOLE WORLD. *** Measured (tools/bench/meshPerf.mjs, task #89's own
// research pass): meshing averages ~2.5 ms/chunk on realistic terrain (890 tris), and world/splatWalkWorld.mjs's
// own measured MeshBVH build rate is ~3.65 us/triangle. A default 15x15 grid (225 chunks, ~200,000 triangles)
// would cost on the order of 1.2-1.5 SECONDS to mesh-and-build as one monolithic BVH -- worse for a grown world
// (up to 1,089 chunks) -- and would need redoing WHOLESALE on every single voxel edit, unlike
// world/platformCarryWorld.mjs's own "rebuild everything every call" trick, which only works there because its
// triangle count is in the double digits (its own header says so). A per-chunk MeshBVH, built lazily on first
// touch and rebuilt only for the chunk that actually changed, keeps every one of those costs bounded and local.
//
// *** THE CACHE INVALIDATION SIGNAL IS chunk.voxelGen, NOT chunk.dirty. *** `dirty` is owned by the render
// pipeline: render/voxelrenderer.js both reads and CLEARS it (voxelrenderer.js:1787,1819,1825,1840) as part of
// its own per-frame mesh queue. A second, independent reader checking `dirty` races the renderer for the same
// bit -- by the time this file looks, render may already have flipped it back to false for an edit this file
// never saw. `voxelGen` (world/chunk.js's Chunk.prototype.set, plus the two bulk-write bypasses patched
// alongside it in core/commandRouter.js and world/WorldPersistence.js) is a monotonically increasing counter
// nobody else reads or clears -- this file's own per-chunk "built from" stamp is the only thing compared
// against it, so there is nothing to race.
"use strict";
import { MeshBVH } from "../mesh/meshBVH.mjs";
import { meshChunk } from "./chunkMesherCore.js";
import { neighboursOf } from "./worldGlbExport.js";

/**
 * Mesh one chunk into a flat Float64Array triangle soup, or an empty one if the chunk is missing, unloaded,
 * or produced no geometry. `skipWater` defaults true -- water is not something a kaiju's feet should be held
 * up by, matching world/worldGlbExport.js's own default and the amphibious kinds' separate, explicit water-
 * level handling in simulation/KaijuManager.js.
 */
export function chunkColliderTris(world, cx, cz, opts = {}) {
    const chunk = world?.chunks?.get?.(cx + "," + cz);
    if (!chunk || !chunk.voxels || !chunk.voxels.length) return new Float64Array(0);
    const S = world.chunkSize || 16;
    const H = Math.floor(chunk.voxels.length / (S * S));
    if (H < 1) return new Float64Array(0);
    let r;
    try {
        r = meshChunk({
            voxels: chunk.voxels, neighbors: neighboursOf(world.chunks, cx, cz),
            size: S, height: H, cx, cz, skipWater: opts.skipWater !== false,
        });
    } catch { return new Float64Array(0); }
    if (!r || !r.verts || !r.verts.length) return new Float64Array(0);
    // Float32Array -> Float64Array: MeshBVH's own centroid/bounds math is in doubles, and a caller comparing
    // its own doubles against these triangles (as this file's gate does) would otherwise see a spurious
    // float32-rounding diff that has nothing to do with collision correctness.
    return Float64Array.from(r.verts);
}

/**
 * The chunk's MeshBVH, built lazily and cached ON THE CHUNK OBJECT ITSELF (chunk._colliderBVH), rebuilt only
 * when chunk.voxelGen has moved past the generation it was last built from. A brand-new chunk object (grown
 * grid, streamed in, regenerated) simply has no cache entry yet -- nothing to invalidate, nothing to leak: it
 * is garbage-collected along with the chunk the moment the chunk itself is evicted from world.chunks.
 *
 * Returns null for a chunk that does not exist (not yet loaded / outside the grid) -- distinct from a chunk
 * that exists and is genuinely empty air, which returns a valid, zero-triangle MeshBVH (mesh/meshBVH.mjs's
 * own constructor already handles count=0 correctly: every query on it simply finds nothing).
 */
export function getChunkCollider(world, cx, cz, opts = {}) {
    const chunk = world?.chunks?.get?.(cx + "," + cz);
    if (!chunk || !chunk.voxels || !chunk.voxels.length) return null;
    const gen = chunk.voxelGen || 0;
    if (chunk._colliderBVH && chunk._colliderBuiltGen === gen) return chunk._colliderBVH;
    const tris = chunkColliderTris(world, cx, cz, opts);
    const bvh = new MeshBVH(tris);
    chunk._colliderBVH = bvh;
    chunk._colliderBuiltGen = gen;
    return bvh;
}

/** Which (cx,cz) chunk a world-space column falls in, given the world's own chunkSize. */
export function chunkCoordAt(world, wx, wz) {
    const S = world.chunkSize || 16;
    return [Math.floor(wx / S), Math.floor(wz / S)];
}

/** Every loaded chunk's MeshBVH whose XZ footprint overlaps the world-space box [lo, hi]. Chunks span the
 *  world's full height, so only X/Z need to be walked -- Y never selects or excludes a chunk. Missing/unloaded
 *  chunks are simply absent from the result, the same "outside is empty space" convention Chunk.get() uses. */
export function chunksTouchingBox(world, lo, hi, opts = {}) {
    const [cx0, cz0] = chunkCoordAt(world, lo[0], lo[2]);
    const [cx1, cz1] = chunkCoordAt(world, hi[0], hi[2]);
    const out = [];
    for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
            const bvh = getChunkCollider(world, cx, cz, opts);
            if (bvh) out.push(bvh);
        }
    }
    return out;
}

/**
 * A live, multi-chunk adapter satisfying the exact 3-member contract physics/character/capsuleCollide.mjs
 * needs of a `bvh` -- `.tris`, `.trianglesInBox(lo,hi)`, `.raycastFirst(...)` -- fanning each query out to
 * only the (typically 1, occasionally up to 4) per-chunk MeshBVHs whose bounds the query box/ray can reach.
 * Nothing in capsuleCollide.mjs changes: depenetrateCapsule and probeGround already call exactly these three
 * members and nothing else, so this is a drop-in `bvh` for them, not a new collision algorithm.
 *
 * *** `.tris` IS A LIVE, MUTATED VIEW -- READ IT IMMEDIATELY AFTER trianglesInBox/raycastFirst, NOT LATER. ***
 * A single chunk's own `.tris` is a fixed buffer for that chunk's whole lifetime; this adapter's `.tris` is
 * refreshed by EVERY call to trianglesInBox or raycastFirst, because triangle index 0 only means the same
 * thing across two calls if nothing merged a different result set in between. depenetrateCapsule and
 * probeGround both already follow exactly this pattern -- one query, then an immediate synchronous read of the
 * indices it just returned, before anything else touches the bvh -- so this is safe for both of the only two
 * real callers in this tree, and is documented here rather than left for a future caller to discover the hard
 * way.
 */
export function makeWorldColliderBVH(world, opts = {}) {
    let curTris = new Float64Array(0);
    return {
        get tris() { return curTris; },
        get count() { return (curTris.length / 9) | 0; },
        trianglesInBox(lo, hi) {
            const chunks = chunksTouchingBox(world, lo, hi, opts);
            const parts = [];
            for (const bvh of chunks) {
                for (const t of bvh.trianglesInBox(lo, hi)) parts.push(bvh.tris.subarray(t * 9, t * 9 + 9));
            }
            if (!parts.length) { curTris = new Float64Array(0); return []; }
            const merged = new Float64Array(parts.length * 9);
            const out = new Array(parts.length);
            for (let i = 0; i < parts.length; i++) { merged.set(parts[i], i * 9); out[i] = i; }
            curTris = merged;
            return out;
        },
        raycastFirst(ox, oy, oz, dx, dy, dz, maxT = Infinity, eps) {
            // Conservative box around the segment, for CHUNK SELECTION only -- the per-chunk raycastFirst
            // calls below still get the caller's real maxT (and eps, when given), so an Infinity maxT never
            // truncates the actual query, only the heuristic used to decide which chunks are worth asking.
            const boundedT = Number.isFinite(maxT) ? maxT : 1e5;
            const ex = ox + dx * boundedT, ey = oy + dy * boundedT, ez = oz + dz * boundedT;
            const lo = [Math.min(ox, ex), Math.min(oy, ey), Math.min(oz, ez)];
            const hi = [Math.max(ox, ex), Math.max(oy, ey), Math.max(oz, ez)];
            let best = null;
            for (const bvh of chunksTouchingBox(world, lo, hi, opts)) {
                const hit = eps === undefined ? bvh.raycastFirst(ox, oy, oz, dx, dy, dz, maxT)
                                               : bvh.raycastFirst(ox, oy, oz, dx, dy, dz, maxT, eps);
                if (hit && (!best || hit.t < best.hit.t)) best = { hit, bvh };
            }
            if (!best) return null;
            const o = best.hit.tri * 9;
            curTris = best.bvh.tris.subarray(o, o + 9);
            return { t: best.hit.t, tri: 0, point: best.hit.point };
        },
    };
}
