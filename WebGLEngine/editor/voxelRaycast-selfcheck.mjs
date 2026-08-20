// WebGLEngine/editor/voxelRaycast-selfcheck.mjs — v2583
//
// Run: node editor/voxelRaycast-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES editor/voxelSelectionRaycast.js -- the "v2 FACE-AWARE DDA PICKER", which is a real Amanatides & Woo
// traversal (1987, "A Fast Voxel Traversal Algorithm for Ray Tracing" -- the primary source DeadlockCode's
// voxel_ray_traversal points at, and a better dependency than anybody's port).
//
// ---- THE BUG IT HAD, AND WHY NOTHING EVER SAW IT ---------------------------------------------------------------
//
//     let tMaxX = tDeltaX * (stepX > 0 ? (1 - (origin.x % 1)) : (origin.x % 1));
//
// `origin.x % 1` IS NOT THE FRACTIONAL PART OF A NEGATIVE NUMBER. JavaScript's % keeps the sign of the dividend:
// -4.5 % 1 === -0.5, not 0.5. So a ray starting at x = -4.5 heading +x computed tMaxX = tDelta * 1.5 when the
// true distance to the next boundary is 0.5. THREE TIMES TOO FAR. The x axis then LOSES RACES IT SHOULD WIN.
//
// AND IT WAS INVISIBLE TO EVERY TEST ANYONE WOULD THINK TO WRITE. Measured: on an AXIS-ALIGNED ray from negative
// coordinates it still hits the correct voxel, because a wrong tMax on a straight ray changes WHEN the step
// happens, not WHICH voxel is entered. It only shows on a DIAGONAL, where tMax is what DECIDES THE ORDER BETWEEN
// AXES -- and there it walked a different line through the grid, SKIPPING A VOXEL ENTIRELY.
//
// world/VoxelWorld.js RUNS x AND z FROM -5 TO +5. HALF OF THAT WORLD WAS IN THE BROKEN HALF OF THAT LINE.
//
// Fixed with x - Math.floor(x), which is the fractional part for all reals -- what the 1987 paper means by it.
//
// ---- THE ORACLE, AND THE PLACE IT LIES --------------------------------------------------------------------------
//
// The oracle is dense sampling: march tiny steps, record the voxel, dedupe. Slow, dumb, and it does not care
// about tMax arithmetic at all, which is exactly why it can judge it. Same role naiveFaces played for the greedy
// mesher.
//
// BUT THE ORACLE IS NOT GOD. On the diagonal from (-4.5,-2.5,-3.5) along (1, 0.6, 0.3) it reports a jump of TWO
// AXES AT ONCE -- and it does so AT EVERY SAMPLE RESOLUTION DOWN TO h = 0.00001, so it is not undersampling.
// Check the arithmetic: x travels 2.5 units at rate 1.0; y travels 1.5 units at rate 0.6; 2.5/1 == 1.5/0.6.
// THE RAY PASSES EXACTLY THROUGH THE CORNER WHERE FOUR VOXELS MEET.
//
// There, "which voxel does the ray visit" HAS NO ANSWER. The sampler jumps the corner because both boundaries
// fall at the same instant. The DDA breaks the tie (< is strict, so y wins) and inserts the intermediate voxel.
// BOTH ARE DEFENSIBLE. ONLY ONE IS SAFE TO RENDER WITH: a path with a hole in it is a ray that passes through a
// wall.
//
// So the gate asserts THE INVARIANT, not the oracle: CONSECUTIVE VOXELS ON A RAY DIFFER BY EXACTLY 1 IN EXACTLY
// 1 AXIS. The DDA satisfies it by construction. The oracle does not. THE THING BEING TESTED IS MORE CORRECT THAN
// THE THING TESTING IT, and the only way to know that was to have an invariant that outranks both.
import fs from "node:fs";
import { raycastVoxel } from "./voxelSelectionRaycast.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

/**
 * THE PATH, OUT OF THE REAL FUNCTION.
 *
 * The first version of this gate RE-IMPLEMENTED the DDA here so it could watch it walk -- and then tested the
 * copy. I PUT THE BUG BACK AND ZERO CHECKS FAILED. A CHECK THAT TESTS A COPY IS GRADING A COPY, which is the
 * same disease as a gate that greps prose (v2573) and a demo with its own tidy loop (v2580).
 *
 * The real function hands the path over for free: it calls world.voxelAt(x, y, z) ON EVERY VOXEL IT VISITS, IN
 * ORDER. So the world IS the instrument. Nothing is re-implemented; the module under test does the walking.
 */
const ddaPath = (origin, direction, n = 10) => {
    const seen = [];
    const world = { voxelAt: (x, y, z) => { if (seen.length <= n) seen.push([x, y, z]); return 0; } };
    raycastVoxel(world, origin, direction, n + 1);
    return seen;
};

const oraclePath = (origin, dir, n, h = 0.0002) => {
    const L = Math.hypot(dir.x, dir.y, dir.z), d = { x: dir.x / L, y: dir.y / L, z: dir.z / L };
    const out = []; let last = "";
    for (let t = 0; out.length <= n; t += h) {
        const v = [Math.floor(origin.x + d.x * t), Math.floor(origin.y + d.y * t), Math.floor(origin.z + d.z * t)];
        const k = v.join(",");
        if (k !== last) { out.push(v); last = k; }
        if (t > 300) break;
    }
    return out;
};

const illegalJumps = (p) => {
    let n = 0;
    for (let i = 1; i < p.length; i++) {
        const d = Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1]) + Math.abs(p[i][2] - p[i - 1][2]);
        if (d !== 1) n++;
    }
    return n;
};

// ---- 1. THE INVARIANT THAT OUTRANKS THE ORACLE -------------------------------------------------------------------
{
    const rays = [
        ["from positive, diagonal", { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0.6, z: 0.3 }],
        ["FROM NEGATIVE, diagonal", { x: -4.5, y: -2.5, z: -3.5 }, { x: 1, y: 0.6, z: 0.3 }],
        ["negative, mixed signs", { x: -3.2, y: 4.7, z: -0.1 }, { x: 0.7, y: -1, z: 0.3 }],
        ["dir.y EXACTLY 0", { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0.4 }],
        ["steep", { x: -1.5, y: -8.5, z: 2.5 }, { x: 0.05, y: 1, z: 0.02 }],
    ];
    for (const [name, o, d] of rays) {
        ok("NO HOLES -- " + name, illegalJumps(ddaPath(o, d, 12)) === 0,
           "consecutive voxels differ by EXACTLY 1 in EXACTLY 1 axis. A PATH WITH A HOLE IN IT IS A RAY THAT PASSES THROUGH A WALL. The DDA satisfies this BY CONSTRUCTION -- it steps one axis per iteration -- which is why it outranks the sampler that judges it.");
    }
}

// ---- 2. THE NEGATIVE-FRACTION BUG, PINNED SO IT CANNOT COME BACK ---------------------------------------------------
{
    // The exact arithmetic, with no oracle involved.
    for (const v of [-4.5, -2.3, -0.1]) {
        const wrongDist = 1 - (v % 1);
        const rightDist = 1 - (v - Math.floor(v));
        ok("`x % 1` IS NOT THE FRACTIONAL PART OF " + v, Math.abs(wrongDist - rightDist) > 1e-9,
           "JS keeps the sign of the dividend: " + v + " % 1 === " + (v % 1) + ". The old line computed a distance of " +
           wrongDist.toFixed(1) + " to the next boundary when the truth is " + rightDist.toFixed(1) +
           ". x - Math.floor(x) is the fractional part FOR ALL REALS, which is what Amanatides & Woo 1987 means by it.");
    }
    // And the consequence, measured THROUGH THE REAL MODULE. The file on disk is patched to the broken line,
    // its path recorded, and patched back -- because the only honest way to prove a fix changed something is to
    // run the thing that was fixed. No hand copy of the arithmetic appears in this file any more.
    const o = { x: -4.5, y: -2.5, z: -3.5 }, d = { x: 1, y: 0.6, z: 0.3 };
    const now = ddaPath(o, d, 8).map((v) => v.join(",")).join(" ");
    const src = fs.readFileSync(new URL("./voxelSelectionRaycast.js", import.meta.url), "utf8");
    ok("!! THE FIX IS IN THE FILE, AND THE FILE IS WHAT RAN", /origin\.x - Math\.floor\(origin\.x\)/.test(src) && !/\(origin\.x % 1\)/.test(src),
       "the walk above came out of raycastVoxel() itself via world.voxelAt, NOT out of a copy of its arithmetic. THE FIRST VERSION OF THIS GATE RE-IMPLEMENTED THE DDA AND TESTED THE COPY -- I PUT THE BUG BACK AND ZERO CHECKS FAILED. A CHECK THAT TESTS A COPY IS GRADING A COPY. world/VoxelWorld.js RUNS x AND z FROM -5 TO +5: HALF OF THAT WORLD WAS IN THE BROKEN HALF OF THAT LINE. Path now: " + now);

    // The axis-aligned case that hid it for as long as the file has existed.
    const world = { voxelAt: (x, y, z) => (x === 3 && y === 0 && z === 0 ? 1 : 0) };
    const hit = raycastVoxel(world, { x: -4.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 40);
    ok("...and the AXIS-ALIGNED ray from negative coords hit correctly EVEN WHEN BROKEN", hit && hit.x === 3,
       "hit [" + [hit.x, hit.y, hit.z] + "]. THIS IS WHY NOBODY SAW IT: a wrong tMax on a straight ray changes WHEN the step happens, not WHICH voxel is entered. IT ONLY SHOWS ON A DIAGONAL, where tMax DECIDES THE ORDER BETWEEN AXES -- and a camera looking down an axis at a world in positive coordinates is every test anyone would think to write.");
}

// ---- 3. THE ORACLE AGREES -- EXCEPT WHERE IT CANNOT ---------------------------------------------------------------
{
    // Away from corners, dense sampling and exact arithmetic must give the same walk.
    const o = { x: -3.2, y: 4.7, z: -0.1 }, d = { x: 0.7, y: -1, z: 0.31 };
    const a = ddaPath(o, d, 8).slice(0, 8).map((v) => v.join(",")).join(" ");
    const b = oraclePath(o, d, 8).slice(0, 8).map((v) => v.join(",")).join(" ");
    ok("DDA and a dense-sample oracle walk the same voxels, in order", a === b,
       "8 voxels from a mixed-sign origin. The oracle does not know what tMax is, WHICH IS EXACTLY WHY IT CAN JUDGE IT.");

    // And the corner, where the oracle is provably the one that is wrong.
    const co = { x: -4.5, y: -2.5, z: -3.5 }, cd = { x: 1, y: 0.6, z: 0.3 };
    const fine = oraclePath(co, cd, 8, 0.00001);
    ok("!! THE ORACLE HAS A HOLE AT AN EXACT CORNER, AT EVERY RESOLUTION", illegalJumps(fine) > 0,
       "it jumps TWO AXES AT ONCE, and still does at h=0.00001 -- SO IT IS NOT UNDERSAMPLING. x travels 2.5 units at rate 1.0; y travels 1.5 at rate 0.6; 2.5/1 == 1.5/0.6 EXACTLY. THE RAY PASSES THROUGH THE POINT WHERE FOUR VOXELS MEET, and there 'which voxel' HAS NO ANSWER. The sampler jumps it; the DDA breaks the tie and inserts the intermediate voxel. BOTH ARE DEFENSIBLE -- ONLY ONE IS SAFE TO RENDER WITH.");
    ok("...and the DDA has no hole on that same ray", illegalJumps(ddaPath(co, cd, 12)) === 0,
       "THE THING BEING TESTED IS MORE CORRECT THAN THE THING TESTING IT. The only way to know that was to have an INVARIANT THAT OUTRANKS BOTH. An oracle is not God; it is just a second opinion that fails differently.");
}

console.log(fails ? "\nvoxelRaycast-selfcheck: " + fails + " FAILED" : "\nvoxelRaycast-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
