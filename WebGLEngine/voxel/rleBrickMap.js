// voxel/rleBrickMap.js
//
// A COARSE OCCUPANCY MIP derived from the canonical RLE (v3042). One byte per BxBxB brick: 1 if the brick holds
// any solid voxel, 0 if it holds none. Same discipline as rleVolumeCache -- the RLE is the source, this is a
// derived cache that gets verified and re-derived, never written back into.
//
// WHY: a DDA marching through open air over an RLE-backed world pays an O(log runs) BINARY SEARCH per step, and
// a world is mostly air. The brick map answers "is there anything in this whole 8x8x8 region" with one byte
// lookup, so the expensive query is only made where something could be hit.
//
// THE INVARIANT IS ASYMMETRIC, AND THAT ASYMMETRY IS THE WHOLE SAFETY ARGUMENT:
//
//   brick says OCCUPIED, contains nothing   ->   WASTEFUL. Costs traversal speed. Nothing is ever missed.
//   brick says EMPTY, contains a solid      ->   UNSAFE.   The marcher skips a voxel it should have hit.
//                                                          A ray passes through a wall. Silently.
//
// So the two directions are NOT the same failure and verifyBrickMap does not report them as one number. A map
// that is merely conservative is still correct; a map that is optimistic anywhere is broken everywhere it is
// optimistic, and nothing downstream will look wrong -- the wall just is not there. An exact map satisfies both;
// a SAFE map satisfies the second. The gate asserts both directions separately, because a check that only tested
// "empty bricks are empty" would pass an all-ones map, and a check that only tested "occupied bricks are
// occupied" would pass an all-zeros map. Either one alone is a control that cannot fail.
//
// Browser-safe: imports only sibling voxel modules.

import { rleDims, buildIndex, getRLEIndexed, SOLID_NONZERO } from "./voxelRLE.js";
import { rleFingerprint } from "./rleVolumeCache.js";

export const DEFAULT_BRICK = 8;

// v3153 -- ONE DEFINITION OF SOLID, EXPORTED, so build and verify cannot drift apart. There were TWO
// independent `(t) => t !== 0` defaults in this file -- one in brickMapFromRLE, one in verifyBrickMap --
// and six copies of the same lambda across the voxel modules. Identical today, and nothing holding them so.
// v3154 -- MOVED to voxelRLE.js, the base every voxel path already imports, and RE-EXPORTED here so v3153's
// callers keep working. A second definition would have been the exact thing v3153 removed.
export { SOLID_NONZERO } from "./voxelRLE.js";

// Brick-grid index, X-fastest, same convention as the volume cache -- so this can itself become a small 3D
// texture later without a fifth index order appearing in the tree.
export function brickIndex(bx, by, bz, d) { return bx + d.bx * (by + d.by * bz); }

export function brickDims(rle, brick = DEFAULT_BRICK) {
    const d = rleDims(rle);
    return {
        brick,
        bx: Math.ceil(d.sx / brick), by: Math.ceil(d.sy / brick), bz: Math.ceil(d.sz / brick),
        sx: d.sx, sy: d.sy, sz: d.sz,
    };
}

// Derive the map. isSolid(type) decides what counts as solid (default: non-zero).
export function brickMapFromRLE(rle, opts = {}) {
    // ?? not ||  -- the gate caught this: with || a brick size of 0 was FALSY and silently became 8, so a
    // caller asking for something impossible got a plausible map back instead of a refusal.
    const brick = opts.brick == null ? DEFAULT_BRICK : opts.brick;
    if (!Number.isInteger(brick) || brick < 1) throw new Error("brickMapFromRLE: brick must be a positive integer");
    const isSolid = opts.isSolid || SOLID_NONZERO;
    const d = brickDims(rle, brick);
    const prefix = buildIndex(rle);
    const data = new Uint8Array(d.bx * d.by * d.bz);

    for (let z = 0; z < d.sz; z++)
        for (let y = 0; y < d.sy; y++)
            for (let x = 0; x < d.sx; x++)
                if (isSolid(getRLEIndexed(rle, prefix, x, y, z)))
                    data[brickIndex((x / brick) | 0, (y / brick) | 0, (z / brick) | 0, d)] = 1;

    // v3153 -- THE MAP CARRIES THE PREDICATE IT WAS BUILT WITH, beside the fingerprint of the RLE it was built
    // from. It already recorded WHICH WORLD it describes and not WHAT QUESTION it answers about it, and those
    // are equally necessary: a brick map is a claim of the form "under THIS notion of solid, this brick is
    // empty", and half of that was unrecorded.
    return { data, ...d, srcFingerprint: rleFingerprint(rle), isSolid };
}

// Occupancy of the brick CONTAINING voxel (x,y,z). Out of the volume reads 0 -- there is nothing outside the
// chunk to hit, and this must agree with whatever isSolid the marcher uses or the skip would be unsound.
export function brickForVoxel(map, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= map.sx || y >= map.sy || z >= map.sz) return 0;
    return map.data[brickIndex((x / map.brick) | 0, (y / map.brick) | 0, (z / map.brick) | 0, map)];
}

// VERIFY, both directions, separately. Reports coordinates and refuses to repair -- same contract as
// compareVolumeToRLE. Returns:
//   unsafe   -- bricks marked empty that contain a solid, each with the voxel that proves it
//   wasteful -- bricks marked occupied that contain nothing
//   safe     -- unsafe.length === 0   (traversal is CORRECT; it may be slower than necessary)
//   ok       -- safe AND wasteful.length === 0   (the map is EXACT)
export function verifyBrickMap(map, rle, opts = {}) {
    const d = rleDims(rle);
    if (map.sx !== d.sx || map.sy !== d.sy || map.sz !== d.sz) {
        return { ok: false, safe: false, unsafe: [], wasteful: [], unsafeCount: 0, wastefulCount: 0, listed: 0, bricks: 0,
                 reason: "dimension mismatch: map " + map.sx + "x" + map.sy + "x" + map.sz + " vs rle " + d.sx + "x" + d.sy + "x" + d.sz };
    }
    // v3153 -- USE THE PREDICATE THE MAP WAS BUILT WITH. This had its OWN default, independent of the
    // build's, so verifying a custom-built map with the default checked it against a DIFFERENT notion of
    // solid. DEMONSTRATED: a 48x32x48 chunk with one type-5 voxel, mapped with a predicate calling 5 AIR,
    // reports "EXACT, none optimistic" under that predicate and "UNSAFE: 1 of 144 bricks claim EMPTY and
    // hold a solid" under the default. THE SAME MAP, TWO ANSWERS, and nothing recorded which question was
    // being asked -- so the verdict had no subject.
    if (opts.isSolid && map.isSolid && opts.isSolid !== map.isSolid) {
        // A DIFFERENT predicate is not a stricter check, it is a check of a DIFFERENT MAP. Refusing beats
        // returning a verdict nobody can name the subject of.
        return { ok: false, safe: false, unsafe: [], wasteful: [], unsafeCount: 0, wastefulCount: 0,
                 listed: 0, bricks: 0,
                 reason: "the predicate passed is not the one this map was built with -- verifying against a "
                       + "different notion of solid answers a question about a map that was never built" };
    }
    const isSolid = opts.isSolid || map.isSolid || SOLID_NONZERO;
    const maxReport = opts.maxReport == null ? 4 : opts.maxReport;
    const prefix = buildIndex(rle);
    const B = map.brick;
    const unsafe = [], wasteful = [];
    let unsafeCount = 0, wastefulCount = 0;

    for (let bz = 0; bz < map.bz; bz++)
        for (let by = 0; by < map.by; by++)
            for (let bx = 0; bx < map.bx; bx++) {
                const claim = map.data[brickIndex(bx, by, bz, map)];
                let found = null;
                for (let z = bz * B; z < Math.min((bz + 1) * B, d.sz) && !found; z++)
                    for (let y = by * B; y < Math.min((by + 1) * B, d.sy) && !found; y++)
                        for (let x = bx * B; x < Math.min((bx + 1) * B, d.sx) && !found; x++)
                            if (isSolid(getRLEIndexed(rle, prefix, x, y, z))) found = { x, y, z };
                // COUNT ALWAYS, LIST ONLY THE FIRST FEW. v3042 shipped these the other way round: the push was
                // guarded by maxReport, so unsafe.length / wasteful.length WERE THE CAP, not the total, and the
                // page dutifully reported "4 bricks claim occupied and hold nothing" for an all-ones map over a
                // 54%-occupied world, where the true answer is ~66. A number that is really a limit, printed
                // where a measurement belongs. Keith's screenshot is what caught it.
                if (claim === 0 && found) { unsafeCount++; if (unsafe.length < maxReport) unsafe.push({ bx, by, bz, provenBy: found }); }
                if (claim !== 0 && !found) { wastefulCount++; if (wasteful.length < maxReport) wasteful.push({ bx, by, bz }); }
            }

    return {
        ok: unsafeCount === 0 && wastefulCount === 0,
        safe: unsafeCount === 0,
        unsafe, wasteful,                       // the first maxReport of each, for pointing at
        unsafeCount, wastefulCount,             // the totals, which are what a sentence should quote
        listed: maxReport,
        bricks: map.data.length, reason: null,
    };
}

export function describeBrickMap(res) {
    if (res.reason) return "REFUSED: " + res.reason;
    if (res.ok) return "brick map EXACT: " + res.bricks + " bricks, none optimistic, none wasteful";
    const some = (n) => n + " of " + res.bricks + " brick(s)" + (n > res.listed ? " (first " + res.listed + " listed)" : "");
    if (res.safe) return "brick map SAFE but not exact: " + some(res.wastefulCount) +
        " claim occupied and hold nothing (costs traversal speed, misses nothing)";
    const u = res.unsafe[0];
    return "UNSAFE: " + some(res.unsafeCount) + " claim EMPTY and hold a solid. First at brick (" +
        u.bx + "," + u.by + "," + u.bz + "), disproved by voxel (" +
        u.provenBy.x + "," + u.provenBy.y + "," + u.provenBy.z + ") -- a ray would pass through it" +
        "   [map NOT repaired -- find out why first]";
}

export function occupancy(map) {
    let n = 0;
    for (let i = 0; i < map.data.length; i++) if (map.data[i]) n++;
    return { occupied: n, total: map.data.length, fraction: n / Math.max(map.data.length, 1) };
}

// --- Traversal ---------------------------------------------------------------------------------------------
//
// EXACTLY traverseDDA, one line different: isSolid is only called when the containing brick is occupied. Every
// other piece of state -- stepX/Y/Z, tDelta, tMax, the tie-break order, the face normal, t, the step count --
// evolves identically, so the result is equivalent BY CONSTRUCTION and not merely by testing. The gate tests it
// anyway, over thousands of rays, and sabotages the map to prove the brick consult is load-bearing.
//
// WHAT THIS REDUCES IS QUERIES, NOT STEPS, and the distinction is not cosmetic. The obvious optimisation is to
// jump straight to the brick exit: compute how many voxel crossings remain on each axis and advance tMax by
// n * tDelta in one go. That is arithmetically the same and NUMERICALLY DIFFERENT -- adding n*tDelta once does
// not give the same float as adding tDelta n times, and near a tie the two forms can take different branches and
// return a different first-hit face. The gate MEASURES that divergence rather than assuming it, and the jumping
// form is not shipped as the default until it has an equivalence proof of its own. Trading a proven equivalence
// for an unproven speedup is the wrong direction for this tree.
//
// The saving is real where it matters: over an RLE-backed world, isSolid is an O(log runs) binary search, and a
// ray through open sky pays it every single step. A byte lookup replaces it.
export function traverseBricked(ox, oy, oz, dx, dy, dz, isSolid, map, maxSteps = 256, onVisit = null) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    const bx = stepX > 0 ? (x + 1 - ox) : (ox - x);
    const by = stepY > 0 ? (y + 1 - oy) : (oy - y);
    const bz = stepZ > 0 ? (z + 1 - oz) : (oz - z);
    let tMaxX = dx !== 0 ? bx * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? by * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? bz * tDeltaZ : Infinity;

    let nx = 0, ny = 0, nz = 0, t = 0, queries = 0;
    for (let i = 0; i < maxSteps; i++) {
        if (onVisit) onVisit(x, y, z);
        if (brickForVoxel(map, x, y, z)) {
            queries++;
            if (isSolid(x, y, z)) return { hit: true, vx: x, vy: y, vz: z, nx, ny, nz, t, steps: i, queries };
        }
        if (tMaxX <= tMaxY && tMaxX <= tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
        else if (tMaxY <= tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    }
    return { hit: false, vx: x, vy: y, vz: z, nx: 0, ny: 0, nz: 0, t, steps: maxSteps, queries };
}

// The jumping form, EXPORTED FOR MEASUREMENT, NOT FOR USE -- and v3092 settled that it should STAY that way,
// for a different reason than the one this note used to give.
//
// The old text said the float difference was the open question, and invited a future round to
// PROMOTE IT ONCE THE DIVERGENCE MEASURED ZERO. tools/ship/brickJumpEquivalence-selfcheck.mjs answered that:
// over 21,600 rays across five origins and nine step budgets, compared field for field including t. AND THE
// PROMOTION IS STILL WRONG, because the optimisation is not one.
//
// traverseBricked ALREADY skips isSolid on an empty brick -- that is what the brick map is FOR -- so the two
// make EXACTLY THE SAME NUMBER OF QUERIES, equal to the digit. The jump saves loop ITERATIONS and pays for them
// in per-brick arithmetic: three modulos, three divisions, three floors, three multiplies. Measured at roughly
// 0.72x the speed of the form it was meant to replace. THE STATED REASON AND THE REAL REASON WERE DIFFERENT
// THINGS; keeping it out of the default was right and the argument for it was not.
//
// v3092 also fixed three interface differences that had been read as float noise: maxSteps was not honoured
// (6667 rays over budget by up to 20 voxels), the step counts therefore disagreed on ~60% of rays, and there
// was no queries field at all so a caller reading it got undefined.
export function traverseBrickedJumping(ox, oy, oz, dx, dy, dz, isSolid, map, maxSteps = 256) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0, stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    const bx0 = stepX > 0 ? (x + 1 - ox) : (ox - x), by0 = stepY > 0 ? (y + 1 - oy) : (oy - y), bz0 = stepZ > 0 ? (z + 1 - oz) : (oz - z);
    let tMaxX = dx !== 0 ? bx0 * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? by0 * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? bz0 * tDeltaZ : Infinity;

    const B = map.brick;
    let nx = 0, ny = 0, nz = 0, t = 0, steps = 0, queries = 0;
    // v3092 -- ONE ADVANCE, WRITTEN ONCE. The stepping form and the fallback below must agree crossing for
    // crossing or the two functions are not the same state machine, and two copies of a tie-break is how they
    // would drift apart without anyone noticing.
    const advance = () => {
        if (tMaxX <= tMaxY && tMaxX <= tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
        else if (tMaxY <= tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
        steps++;
    };
    while (steps < maxSteps) {
        if (brickForVoxel(map, x, y, z)) {
            queries++;
            if (isSolid(x, y, z)) return { hit: true, vx: x, vy: y, vz: z, nx, ny, nz, t, steps, queries };
            advance();
            continue;
        }
        // empty brick: how many voxel crossings on each axis before leaving it, and which axis leaves first
        const remX = stepX > 0 ? (B - (x % B + B) % B) : (stepX < 0 ? ((x % B + B) % B) + 1 : Infinity);
        const remY = stepY > 0 ? (B - (y % B + B) % B) : (stepY < 0 ? ((y % B + B) % B) + 1 : Infinity);
        const remZ = stepZ > 0 ? (B - (z % B + B) % B) : (stepZ < 0 ? ((z % B + B) % B) + 1 : Infinity);
        const tExitX = remX === Infinity ? Infinity : tMaxX + (remX - 1) * tDeltaX;
        const tExitY = remY === Infinity ? Infinity : tMaxY + (remY - 1) * tDeltaY;
        const tExitZ = remZ === Infinity ? Infinity : tMaxZ + (remZ - 1) * tDeltaZ;
        const tExit = Math.min(tExitX, tExitY, tExitZ);
        if (!isFinite(tExit)) break;
        const take = (tM, tD) => (tD === Infinity ? 0 : Math.max(0, Math.floor((tExit - tM) / tD) + 1));
        const kx = take(tMaxX, tDeltaX), ky = take(tMaxY, tDeltaY), kz = take(tMaxZ, tDeltaZ);
        if (kx + ky + kz === 0) break;
        // v3092 -- maxSteps MEANT TWO DIFFERENT THINGS AND THAT IS WHY THIS WAS NEVER THE DEFAULT.
        // traverseBricked's budget is a hard bound: the loop runs at most maxSteps times, full stop. Here a
        // single jump added kx+ky+kz in one go and could sail straight past it -- MEASURED at 6667 rays over
        // budget, by up to 20 voxels, while the stepping form was inside it on every single ray. So the two
        // returned different step counts for the same ray and disagreed about where a ray was allowed to end, and
        // that was read as float divergence when it was an interface difference.
        //
        // When the jump would overshoot, single-step the remainder. It costs at most maxSteps crossings and
        // only ever happens on the last brick of a ray, so the saving is untouched; and because it goes through
        // the SAME advance() the stepping form uses, the tail is exact rather than approximately right.
        if (steps + kx + ky + kz > maxSteps) { while (steps < maxSteps) advance(); break; }
        if (tExit === tExitX) { nx = -stepX; ny = 0; nz = 0; } else if (tExit === tExitY) { nx = 0; ny = -stepY; nz = 0; } else { nx = 0; ny = 0; nz = -stepZ; }
        x += stepX * kx; tMaxX += kx * tDeltaX;
        y += stepY * ky; tMaxY += ky * tDeltaY;
        z += stepZ * kz; tMaxZ += kz * tDeltaZ;
        t = tExit;
        steps += kx + ky + kz;
    }
    return { hit: false, vx: x, vy: y, vz: z, nx: 0, ny: 0, nz: 0, t, steps, queries };
}
