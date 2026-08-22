// tools/voxelExtremity-selfcheck.mjs
//
// Run: node tools/voxelExtremity-selfcheck.mjs
//
// *** REWRITTEN AT v3550: THIS GATE TESTED A DUPLICATE THAT NOTHING ELSE IN THE TREE MENTIONS. *** It used to
// import a class called VoxelWorld from voxel/voxelworld.js -- an undocumented, unreferenced stub with its own
// naive mesher and its own extremityBounds, sharing nothing but a class NAME with the real world/VoxelWorld.js
// that every other file discussing "VoxelWorld" (voxelRaycast-selfcheck.mjs, greedyMesh-selfcheck.mjs,
// predictions.html) means. THE GATE WAS PROVING A PROPERTY OF FURNITURE: green forever, and telling nobody
// anything about the class this tree actually talks about. v3177's shape -- a check that passes because the
// system under test does nothing real -- one level up, where the "system" was the wrong file entirely.
//
// world/VoxelWorld.js HAS NO DECLARED WORLD SIZE (generateBlocks places an 11x11 flat footprint wherever it
// likes, not inside a fixed s x s x s grid), so the OLD claim -- "content on face X flags face X of a bounded
// world" -- has no analogue here and is not reproduced. What IS checkable, and is now computeBounds() in
// world/VoxelWorld.js: the bounding box and count of whatever blocks a VoxelWorld instance actually holds. A
// PURE function of the block list, fixture-proven on synthetic input BEFORE being driven against the real
// shipped generate() output -- so a wrong box on the real world and a wrong box on a synthetic one are told
// apart, and neither can pass by imitating the other.
"use strict";
import { VoxelWorld, computeBounds } from "../world/VoxelWorld.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. empty input has no box, and says so rather than returning a degenerate one
let b = computeBounds([]);
ok("!! an empty block list has no box, and says so", b.empty === true && b.count === 0,
   `empty=${b.empty} count=${b.count}`);
b = computeBounds(null);
ok("...and null is treated the same as empty, not a crash", b.empty === true,
   `empty=${b.empty}`);

// 2. a single block is its own box, extent zero on every axis
b = computeBounds([[3, -2, 7]]);
ok("!! a single block is its own box with zero extent", b.count === 1 &&
   b.min[0] === 3 && b.min[1] === -2 && b.min[2] === 7 &&
   b.max[0] === 3 && b.max[1] === -2 && b.max[2] === 7 &&
   b.extent[0] === 0 && b.extent[1] === 0 && b.extent[2] === 0,
   `min ${JSON.stringify(b.min)} max ${JSON.stringify(b.max)} extent ${JSON.stringify(b.extent)}`);

// 3. a synthetic scattered set: the box must be the TRUE min/max, not the first or last block seen
b = computeBounds([[5, 0, 5], [-3, 8, 2], [0, -4, 9], [1, 1, -6]]);
ok("!! the box is the true min/max over ALL blocks, not the first or last one",
   b.min[0] === -3 && b.min[1] === -4 && b.min[2] === -6 &&
   b.max[0] === 5 && b.max[1] === 8 && b.max[2] === 9,
   `min ${JSON.stringify(b.min)} max ${JSON.stringify(b.max)}`);

// 4. negative coordinates are handled correctly (not clamped, not treated as "outside")
b = computeBounds([[-5, 0, -5], [-1, 0, -1]]);
ok("!! negative coordinates are real coordinates, not clamped away", b.min[0] === -5 && b.max[0] === -1,
   `min ${JSON.stringify(b.min)} max ${JSON.stringify(b.max)}`);

// 5. sabotage: swap a min comparison for a max comparison and the true box is lost
{
    function brokenBounds(blocks) {
        if (!blocks || blocks.length === 0) return { empty: true, count: 0 };
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const [x, y, z] of blocks) {
            if (x > minX) minX = x; if (x > maxX) maxX = x;   // SABOTAGE: minX should compare with <
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        return { empty: false, count: blocks.length, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
    }
    const truth = computeBounds([[5, 0, 5], [-3, 0, 0]]);
    const broken = brokenBounds([[5, 0, 5], [-3, 0, 0]]);
    ok("!! the sabotaged comparator disagrees with the real one -- the check has teeth",
        broken.min[0] !== truth.min[0],
        `real minX ${truth.min[0]} vs sabotaged minX ${broken.min[0]} (Infinity means it never updates)`);
}

// 6. driven against the REAL shipped VoxelWorld -- the class this tree's own comments mean
const w = new VoxelWorld();
const real = w.bounds();
ok("!! the real VoxelWorld's shipped footprint is exactly the 11x11 flat platform generateBlocks() builds",
    real.count === 121 &&
    real.min[0] === -5 && real.min[1] === 0 && real.min[2] === -5 &&
    real.max[0] === 5 && real.max[1] === 0 && real.max[2] === 5,
    `count ${real.count} min ${JSON.stringify(real.min)} max ${JSON.stringify(real.max)}`);
ok("...and .bounds() agrees with the pure computeBounds() over the same blocks -- one declaration, not two",
    JSON.stringify(real) === JSON.stringify(computeBounds(w.blocks)),
    "w.bounds() and computeBounds(w.blocks) must be the same call, not two implementations of one idea");
ok("...and getChunks() is untouched -- this round adds a diagnostic, it does not change what ships",
    w.getChunks().length === 1 && typeof w.getChunks()[0] === "object",
    `getChunks() still returns the greedyMesh() result, ${w.getChunks().length} chunk(s)`);

console.log(fails ? "\nvoxelExtremity-selfcheck: " + fails + " FAILED" : "\nvoxelExtremity-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
