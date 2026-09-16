#!/usr/bin/env node
// WebGLEngine/tools/ship/worldColliderBVH-selfcheck.mjs
//
// Gates world/worldColliderBVH.mjs (task board #89): turning a live voxel world's own chunks into real
// mesh/meshBVH.mjs MeshBVHs, so a capsule can be resolved against the ACTUAL rendered surface -- walls,
// overhangs, chunk seams -- instead of world._heightAt's coarse per-column oracle every kaiju has read until
// now. See worldColliderBVH.mjs's own header for why this is per-chunk and lazily cached rather than one
// monolithic BVH, and why the cache invalidation signal is chunk.voxelGen rather than chunk.dirty.
//
// *** A HAND-BUILT WORLD, REAL Chunk INSTANCES, NO VoxelWorld/erosion/wasm -- world/voxelGlb-selfcheck.mjs's
// OWN established pattern (its header: "no VoxelWorld, no WebGL, no erosion"), extended one step further: that
// gate's world is a plain {voxels} object because worldGlbExport.js only ever reads .voxels; this gate also
// needs chunk.set()'s real voxelGen bump (world/chunk.js) to test cache invalidation, so its fixture uses the
// REAL Chunk class -- the exact one every real world hands to this code -- not a second, hand-rolled mimic
// that could quietly drift from it. ***
//
// Six things proven, in order: (1) chunkColliderTris agrees with meshChunk called directly -- no second meshing
// path; (2) a capsule dropped from a bad starting height settles on hand-known floor/wall geometry via REAL
// capsule depenetration, not a height snap; (3) THE MOTIVATING BUG, reproduced and fixed -- two columns where
// world._heightAt is deliberately wrong (one floating above the real surface, one inside rock, the same two
// failure directions world/surfaceProbe.mjs's own measured census documents) resolve correctly against the
// voxels via probeGround, cross-checked against topSolidAt (surfaceProbe.mjs's own, independently-proven
// oracle) rather than against this file's own arithmetic; (4) a chunk-boundary-straddling platform resolves
// using triangles gathered from BOTH chunks, not just whichever one a capsule's center happens to sit in; (5)
// the per-chunk cache rebuilds exactly when chunk.voxelGen moves and returns the SAME object when it has not,
// including through the two raw-write bypasses core/commandRouter.js and world/WorldPersistence.js patch
// alongside Chunk.prototype.set(); (6) the world.colliderBVH property itself is left untouched -- this file
// deliberately does not wire the new adapter into it, so nothing about how BotManager.js/camera.js see a
// _heightAt world changes as a side effect of this gate merely existing.
//
// SABOTAGE-VERIFIED, three tries. (1) Restricting chunksTouchingBox to only the chunk containing `lo` (the
// seam-gathering forgotten) turned section 4's "touches BOTH chunks" check red by name (1 chunk instead of 2)
// -- but the SAME section's settle-height assertion stayed green, because the fixture's own platform happens
// to be fully present on chunk (1,0)'s side alone under this particular drop point (world x=16 rounds INTO
// chunk (1,0), whose local x 0..3 already covers the whole footprint). Not a gate gap: a single-chunk read can
// still be geometrically sufficient depending on where the capsule sits, which is exactly why the explicit
// chunk-count assertion exists as its own check rather than being inferred from the settle height alone. (2)
// Reverting getChunkCollider's gen comparison to an unconditional cache hit (`if (chunk._colliderBVH) return`)
// turned BOTH of section 5's invalidation checks red by name, exactly the real bug this round's own research
// pass predicted a shared-flag race would eventually cause. (3) Passing an empty neighbour table into meshChunk
// (simulating "forgot the neighbour lookup") turned section 1's triangle-count and vertex-diff checks red by
// name (270 vs 252 floats, NaN diff from a border face meshed against phantom air) -- the border-seam bug
// world/chunkMesherCore.js's own v3069 comment already fixed once for RENDERING, reproduced here as proof this
// file's neighbour wiring is real rather than a hand-waved import. Restored, gate re-confirmed all-green after
// each of the three.
"use strict";
import { Chunk } from "../../world/chunk.js";
import {
    chunkColliderTris, getChunkCollider, chunksTouchingBox, makeWorldColliderBVH,
} from "../../world/worldColliderBVH.mjs";
import { meshChunk } from "../../world/chunkMesherCore.js";
import { neighboursOf } from "../../world/worldGlbExport.js";
import { depenetrateCapsule, probeGround } from "../../physics/character/capsuleCollide.mjs";
import { topSolidAt } from "../../world/surfaceProbe.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const S = 16, H = 32;
const STONE = 1;
const RADIUS = 0.4, HEIGHT = 1.8;

// ---------------------------------------------------------------------------
// THE FIXTURE: two real Chunk instances, side by side along X (chunk (0,0) covers world x 0..16, chunk (1,0)
// covers world x 16..32), hand-carved so every section below has known-correct geometry to check against.
//   * a floor at y = 0..2 (top solid y=2, walkable surface y=3) across BOTH chunks
//   * a wall at world x=8, full z range, y = 0..10 (chunk (0,0) only)
//   * a raised platform straddling the x=16 seam: world x 12..20, y = 0..5 (walkable surface y=6)
function buildWorld() {
    const c00 = new Chunk(0, 0, S, H), c10 = new Chunk(1, 0, S, H);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) for (let y = 0; y <= 2; y++) {
        c00.set(x, y, z, STONE); c10.set(x, y, z, STONE);
    }
    for (let z = 0; z < S; z++) for (let y = 0; y <= 10; y++) c00.set(8, y, z, STONE);           // the wall
    for (let x = 12; x < S; x++) for (let z = 0; z < S; z++) for (let y = 0; y <= 5; y++) c00.set(x, y, z, STONE);   // platform, chunk (0,0) half
    for (let x = 0; x < 4; x++) for (let z = 0; z < S; z++) for (let y = 0; y <= 5; y++) c10.set(x, y, z, STONE);    // platform, chunk (1,0) half

    const chunks = new Map([["0,0", c00], ["1,0", c10]]);
    // *** THE WRONG _heightAt -- BY CONSTRUCTION, NOT A BUG, MIRRORING world/surfaceProbe.mjs's OWN MEASURED
    // SHAPE. *** Real correct answer everywhere is 3 (floor surface). Column (3,3) reports 10 -- floating well
    // above the real surface, one of the two directions surfaceProbe.mjs measured ("_heightAt runs up to 7
    // voxels ABOVE the real surface"). Column (3,12) reports 1 -- a solid voxel (STONE fills y=0..2), the
    // OTHER measured direction ("as well as 17 below it": a body placed there stands inside rock).
    const _heightAt = (x, z) => {
        const ix = Math.round(x), iz = Math.round(z);
        if (ix === 3 && iz === 3) return 10;
        if (ix === 3 && iz === 12) return 1;
        return 3;
    };
    const isAir = (x, y, z) => {
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        const chunk = chunks.get(cx + "," + cz);
        if (!chunk) return true;
        return chunk.get(x - cx * S, y, z - cz * S) === 0;
    };
    return { chunkSize: S, chunkHeight: H, chunks, _heightAt, isAir };
}

console.log("worldColliderBVH-selfcheck -- meshing a live voxel world into real per-chunk collision geometry\n");

// ---------------------------------------------------------------------------
console.log("1. chunkColliderTris AGREES WITH meshChunk CALLED DIRECTLY -- NO SECOND MESHING PATH");
{
    const world = buildWorld();
    const direct = meshChunk({ voxels: world.chunks.get("0,0").voxels, neighbors: neighboursOf(world.chunks, 0, 0), size: S, height: H, cx: 0, cz: 0, skipWater: true });
    const viaFile = chunkColliderTris(world, 0, 0);
    ok("!! same triangle count", viaFile.length === direct.verts.length, `${viaFile.length} vs ${direct.verts.length} floats`);
    let maxDiff = 0;
    for (let i = 0; i < viaFile.length; i++) maxDiff = Math.max(maxDiff, Math.abs(viaFile[i] - direct.verts[i]));
    ok("!! *** identical vertex data, up to the Float32->Float64 cast *** ", maxDiff < 1e-5, `max diff ${maxDiff.toExponential(3)}`);
    ok("triangle count is a multiple of 3 vertices (9 floats)", viaFile.length % 9 === 0);

    const bvh = getChunkCollider(world, 0, 0);
    ok("!! MeshBVH built from it reports the same triangle count", bvh.count === viaFile.length / 9, `bvh.count=${bvh.count}`);
    ok("a chunk with no entry (outside the loaded grid) returns null, not a crash", getChunkCollider(world, 99, 99) === null);
}

// ---------------------------------------------------------------------------
console.log("\n2. A CAPSULE DROPPED FROM A BAD STARTING HEIGHT SETTLES ON REAL GEOMETRY VIA REAL DEPENETRATION");
{
    const world = buildWorld();
    const bvh = makeWorldColliderBVH(world);
    // A tiny gravity-integrate-then-depenetrate loop, the same shape simulation/BotManager.js's own
    // _stepBotCapsule uses (task #85) -- not a height snap, a real capsule falling and being pushed out.
    let feet = [2, 8, 2], vy = 0;
    for (let i = 0; i < 120; i++) {
        vy -= 9.8 * (1 / 60);
        feet = [feet[0], feet[1] + vy * (1 / 60), feet[2]];
        const r = depenetrateCapsule(feet, RADIUS, HEIGHT, bvh);
        feet = r.pos;
        if (r.grounded) { vy = 0; break; }
    }
    report("settled feet", `y=${feet[1].toFixed(4)}`);
    ok("!! *** settles at the known floor surface (y=3), not the starting guess (y=15) ***", Math.abs(feet[1] - 3) < 1e-3, `feet.y=${feet[1].toFixed(4)}`);

    // The wall at x=8: walking a capsule straight into it must push it back, not let it tunnel through --
    // proof this is LATERAL collision, not a disguised height lookup.
    let wfeet = [5, 3, 5];
    for (let i = 0; i < 30; i++) {
        wfeet = [wfeet[0] + 0.3, wfeet[1], wfeet[2]];   // wish to walk straight at the wall
        const r = depenetrateCapsule(wfeet, RADIUS, HEIGHT, bvh);
        wfeet = r.pos;
    }
    report("against the wall", `x=${wfeet[0].toFixed(4)}`);
    ok("!! *** a capsule walked straight at the wall (x=8) is held OUTSIDE it, not tunnelled through ***",
        wfeet[0] < 8 - RADIUS + 1e-3, `x=${wfeet[0].toFixed(4)}, wall face at x=${(8 - RADIUS).toFixed(4)}`);
}

// ---------------------------------------------------------------------------
console.log("\n3. THE MOTIVATING BUG: world._heightAt IS WRONG AT TWO COLUMNS, THE VOXELS ARE NOT");
{
    const world = buildWorld();
    const bvh = makeWorldColliderBVH(world);
    for (const [x, z, label] of [[3, 3, "model floats ABOVE the real surface"], [3, 12, "model reads INSIDE rock"]]) {
        const modelH = world._heightAt(x, z);
        const realTop = topSolidAt(world, x, z);   // surfaceProbe.mjs's own, independently-proven oracle
        const hit = probeGround([x, 20, z], RADIUS, bvh, { maxDist: 25 });
        report(`column (${x},${z}) -- ${label}`, `_heightAt=${modelH}  realTop+1=${realTop + 1}  probeGround.y=${hit ? hit.point[1].toFixed(4) : "MISS"}`);
        ok(`!! _heightAt is confirmed wrong here (that's the fixture, not the finding)`, modelH !== realTop + 1);
        ok(`!! *** the new collider finds the REAL voxel surface, agreeing with topSolidAt, not with _heightAt ***`,
            !!hit && Math.abs(hit.point[1] - (realTop + 1)) < 1e-6, hit ? `diff=${Math.abs(hit.point[1] - (realTop + 1)).toExponential(3)}` : "no hit");
    }
    // And the control column: where the model IS right, this still agrees -- not just "always disagrees with _heightAt".
    const hitOk = probeGround([3, 20, 8 + 3], RADIUS, bvh, { maxDist: 25 });   // away from the wall, plain floor
    ok("!! a column where the model is CORRECT also resolves correctly (not a blanket override)",
        !!hitOk && Math.abs(hitOk.point[1] - 3) < 1e-6);
}

// ---------------------------------------------------------------------------
console.log("\n4. A CHUNK-BOUNDARY-STRADDLING PLATFORM RESOLVES USING BOTH CHUNKS' TRIANGLES");
{
    const world = buildWorld();
    const bvh = makeWorldColliderBVH(world);
    const lo = [15, 0, 7], hi = [17, 6, 9];   // straddles world x=16, the chunk (0,0)/(1,0) seam
    const touching = chunksTouchingBox(world, lo, hi);
    ok("!! *** the seam-straddling query touches BOTH chunks' colliders ***", touching.length === 2, `${touching.length} chunk(s)`);

    let feet = [16, 9, 8], vy = 0;   // dropped exactly on the seam, over the platform
    for (let i = 0; i < 120; i++) {
        vy -= 9.8 * (1 / 60);
        feet = [feet[0], feet[1] + vy * (1 / 60), feet[2]];
        const r = depenetrateCapsule(feet, RADIUS, HEIGHT, bvh);
        feet = r.pos;
        if (r.grounded) { vy = 0; break; }
    }
    report("settled on the seam", `x=${feet[0].toFixed(3)} y=${feet[1].toFixed(4)}`);
    ok("!! *** settles on the platform's surface (y=6), not falling through a seam gap ***", Math.abs(feet[1] - 6) < 1e-3, `feet.y=${feet[1].toFixed(4)}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. THE PER-CHUNK CACHE REBUILDS EXACTLY WHEN voxelGen MOVES, INCLUDING THROUGH THE TWO BYPASSES");
{
    const world = buildWorld();
    const a = getChunkCollider(world, 0, 0);
    const b = getChunkCollider(world, 0, 0);
    ok("!! an unedited chunk returns the SAME cached MeshBVH object, not a rebuild every call", a === b);

    const chunk = world.chunks.get("0,0");
    const before = a.count;
    chunk.set(1, 20, 1, STONE);   // a real edit through Chunk.prototype.set() -- bumps voxelGen itself
    const c = getChunkCollider(world, 0, 0);
    ok("!! *** an edit through chunk.set() invalidates the cache -- a NEW object with more triangles ***",
        c !== a && c.count > before, `before=${before} after=${c.count}`);

    // core/commandRouter.js's sim:clearWater bypass and world/WorldPersistence.js's restore bypass both write
    // chunk.voxels directly and then bump voxelGen by hand, next to their own chunk.dirty = true line -- this
    // reproduces exactly that pattern (not by invoking those files, which need unrelated app wiring) to prove
    // the pattern itself, patched into world/chunk.js's own cache consumer, actually works.
    const before2 = c.count;
    const idx = chunk.index(2, 20, 2);
    chunk.voxels[idx] = STONE;                       // raw write, bypassing Chunk.prototype.set() on purpose
    chunk.voxelGen = (chunk.voxelGen || 0) + 1;       // the exact line added to both bypass sites
    const d = getChunkCollider(world, 0, 0);
    ok("!! *** the raw-write-plus-manual-bump pattern ALSO invalidates the cache ***", d !== c && d.count > before2, `before=${before2} after=${d.count}`);
}

// ---------------------------------------------------------------------------
console.log("\n6. world.colliderBVH ITSELF IS UNTOUCHED -- THIS FILE DOES NOT WIRE ITSELF IN AS A SIDE EFFECT");
{
    const world = buildWorld();
    getChunkCollider(world, 0, 0);
    makeWorldColliderBVH(world);
    ok("!! world.colliderBVH was never set merely by using this module", world.colliderBVH === undefined,
        "camera.js/_capsuleWorldBVH and BotManager.js/_botCapsuleBVH both read w.colliderBVH directly -- this module must never set it as a side effect, or every existing _heightAt-world consumer silently changes behaviour the moment this file is imported");
}

console.log(fails ? `\nworldColliderBVH-selfcheck: ${fails} FAILED` : "\nworldColliderBVH-selfcheck: all checks pass");
console.log("unchecked here: real procedural World generation (world/world.js's ErosionCache/wasm tiles -- this fixture is hand-built, matching " +
    "voxelGlb-selfcheck.mjs's own established precedent for the same class of gate); performance at real-world scale (measured separately, in " +
    "this task's own research pass, from tools/bench/meshPerf.mjs and splatWalkWorld.mjs's own recorded BVH-build rate, not re-measured here); " +
    "live kaiju wiring (simulation/KaijuManager.js -- a separate change, not made by this file).");
process.exit(fails ? 1 : 0);
