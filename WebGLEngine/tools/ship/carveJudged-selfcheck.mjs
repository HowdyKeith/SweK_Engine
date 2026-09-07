#!/usr/bin/env node
// WebGLEngine/tools/ship/carveJudged-selfcheck.mjs -- v4374
//
// THE CARVE THROUGH img2threejs's OWN HARD GATES, AND THE PARAMETER THAT MOVES THE VERDICT IS THE GRID.
//
// ---- WHAT THIS ROUND DELIBERATELY DOES NOT RE-DERIVE -----------------------------------------------------------
//
// This file was first written with four sections and three of them were already on main. That is worth saying
// plainly rather than quietly deleting, because the three were built without knowing v4372 existed:
//
//   * "their hard gates read perfect scores on a hull that is 90% too big, on a carving view" -- v4371 measured
//     it as reprojection and v4372 dismissed it in the right words: "1.000000 by construction and never at
//     risk". A hull's shadow IS the shadow it was carved from. It is true, it is not news, and a round that
//     re-measures it through a second gate has measured the definition twice.
//   * "the gate catches the error from a view the carve did not use" -- v4372 did this properly, by MESHING the
//     hull and rendering it through the lit pipeline from real cameras, and got the sharper statement: THE SAME
//     HULL WITH THE SAME 54.9% ERROR IS REFUSED FROM ONE CAMERA AND PASSES FROM ANOTHER. The verdict is a
//     property of the camera. This file's flat-silhouette version of that was a weaker instrument.
//   * "the judge and the sculptor share one blind spot" -- v4372's reconciliation is more careful and is the one
//     to keep: "they are silhouette statistics being asked a volume question."
//
// So section 1 below CITES those instead of re-running them, with one cheap check that they still hold.
//
// ---- WHAT IS ACTUALLY NEW, AND IT SITS BESIDE v4372 RATHER THAN AGAINST IT --------------------------------------
//
// v4372 found the verdict moves with the CAMERA. *** IT ALSO MOVES WITH THE CARVE'S GRID RESOLUTION -- A NUMBER
// THAT IS NOT A PROPERTY OF THE RECONSTRUCTION AT ALL. *** Same shape, same held-out camera, same method, only
// n changing: a tube is PASSED at n = 32 and n = 96 and REFUSED at n = 64, and its volume error over those three
// (86.7%, 81.1%, 90.0%) does not order the verdicts.
//
// AND THE SCALE HALF IS A FUNCTION OF THE GRID ALONE. At each resolution their scaleDelta comes back IDENTICAL
// for three shapes whose errors span 0.9% to 90.0% -- 0.000000 at n = 32 and 48, 0.083333 at n = 64, 0.059524 at
// n = 96 -- because it is reading a BOUNDING BOX, and a hull's bounding box is its object's plus at most the
// quantisation of the grid the carve ran on. At n = 32 and 48 that rounds to no difference at all and the gate
// has nothing to read; at 64 and 96 it is one voxel, priced at 7 and 5 of their 224 cells. A hundredfold range
// of error, four numbers, and all four of them are properties of n.
//
// THE SHARPEST PAIR THE SWEEP PRODUCES: at n = 64 their gate REFUSES a sphere whose hull is 3.3% too big, and at
// n = 96 it PASSES a tube whose hull is 81.1% too big. Same gate, same camera, same method, two grids.
//
// ---- WHAT THIS IS NOT ------------------------------------------------------------------------------------------
//
// Not a criticism of img2threejs. Their gate scores a render against a PHOTOGRAPH; here it scores a hull against
// its own inputs, the friendliest case it will ever see, and their divine_eye.py documents its own resolution
// ceiling in a comment. The finding is about what happens when a silhouette judge is pointed at a silhouette
// method: two free parameters -- where the camera stands (v4372) and how fine the grid is (here) -- move the
// verdict, and the reconstruction error moves it least of the three.
//
// Every verdict comes from render/divineEye.mjs compare(), their constants, on rendered pixels: shapes painted
// on a NEUTRAL grey ground (v4366's own correction -- their foreground rule reads near-black as foreground), so
// their buildForegroundMask, largest-4-connected-blob filter and 224-grid resample all run for real.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/carveJudged-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import { silhouetteOf, carve, volumeOf, turntable } from "../../mesh/carve.mjs";
import * as DE from "../../render/divineEye.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const BG = [118, 120, 124], FG = [196, 168, 132];
const renderAt = (m, n, UP) => { const W = n * UP, px = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const on = m[((y / UP) | 0) * n + ((x / UP) | 0)], i = (y * W + x) * 4, s = on ? FG : BG;
        px[i] = s[0]; px[i + 1] = s[1]; px[i + 2] = s[2]; px[i + 3] = 255;
    } return { px, W }; };
/** THEIR verdict, end to end. */
const judge = (refMask, renMask, n, UP) => { const a = renderAt(refMask, n, UP), b = renderAt(renMask, n, UP);
    return DE.compare(a.px, b.px, a.W, a.W); };

/** Every fixture scaled to the grid, so a resolution sweep changes n and NOTHING else about the shape. */
const shapes = (n) => { const c = n / 2, s = n / 64; return {
    sphere: (i, j, k) => (i + 0.5 - c) ** 2 + (j + 0.5 - c) ** 2 + (k + 0.5 - c) ** 2 < 144 * s * s,
    cup:    (i, j, k) => { const x = i + 0.5 - c, y = j + 0.5 - c, z = k + 0.5 - c, r2 = x * x + z * z;
                           return Math.abs(y) < 12 * s && r2 < 144 * s * s && !(r2 < 64 * s * s && y > -6 * s); },
    tube:   (i, j, k) => { const x = i + 0.5 - c, y = j + 0.5 - c, z = k + 0.5 - c, r2 = x * x + z * z;
                           return Math.abs(y) < 12 * s && r2 < 144 * s * s && !(r2 < 64 * s * s); },
}; };
const HELD_OUT = Math.PI / 16 + 0.11;          // a camera no view carved from
const upFor = (n) => Math.max(1, Math.round(448 / n));
const hullAt = (f, n) => { const Y = turntable(8);
    const h = carve(Y.map((yaw) => ({ m: silhouetteOf(f, n, { yaw }), yaw })), n);
    return { h, fn: (i, j, k) => h[i + n * (j + n * k)], over: (volumeOf(h, n) - volumeOf(f, n)) / volumeOf(f, n) }; };

console.log("\n0. THE HARNESS RETURNS BOTH VERDICTS, and the constants are theirs");
{
    const n = 64, U = upFor(n), S = shapes(n);
    const cube = (i, j, k) => Math.abs(i + 0.5 - 32) < 12 && Math.abs(j + 0.5 - 32) < 12 && Math.abs(k + 0.5 - 32) < 12;
    const wrong = judge(silhouetteOf(cube, n, { yaw: 0 }), silhouetteOf(S.sphere, n, { yaw: 0 }), n, U);
    const same = judge(silhouetteOf(cube, n, { yaw: 0 }), silhouetteOf(cube, n, { yaw: 0 }), n, U);
    ok("their gate REFUSES a sphere offered as a reconstruction of a cube", wrong.passesHardGates === false && wrong.iou < DE.IOU_HARD_MIN,
        `IoU ${wrong.iou.toFixed(6)}; ${wrong.hardFailures.join("; ")}`);
    ok("  and PASSES a cube offered as itself, with their mask finding a real foreground rather than the whole frame",
        same.passesHardGates === true && same.iou === 1 && same.renCoverage > 0.05 && same.renCoverage < 0.5 && same.renDiscarded === 0,
        `IoU ${same.iou.toFixed(6)}, coverage ${(same.renCoverage * 100).toFixed(1)}%, ${(same.renDiscarded * 100).toFixed(1)}% discarded by their largest-blob filter`);
    ok("  and the ported constants are unedited", DE.MASK_GRID_SIZE === 224 && DE.IOU_HARD_MIN === 0.85 && DE.SCALE_HARD_MAX === 0.08,
        `grid ${DE.MASK_GRID_SIZE}, IoU floor ${DE.IOU_HARD_MIN}, scale ceiling ${DE.SCALE_HARD_MAX}`);
}

console.log("\n1. THE TWO CLAIMS THIS ROUND CITES INSTEAD OF RE-DERIVING (v4371, v4372)");
{
    const n = 64, U = upFor(n), S = shapes(n), H = hullAt(S.tube, n);
    let perfect = true;
    for (const yaw of turntable(8)) { const v = judge(silhouetteOf(S.tube, n, { yaw }), silhouetteOf(H.fn, n, { yaw }), n, U);
        if (!(v.iou === 1 && v.scaleDelta === 0 && v.passesHardGates)) perfect = false; }
    ok(`on a CARVING view their gates still read 1.000000 and 0.000000 on a hull ${(H.over * 100).toFixed(1)}% too big -- kept as one cheap check, not a section`,
        perfect && H.over > 0.5,
        "v4371 measured this as reprojection and v4372 named it exactly: \"1.000000 by construction and never at risk\". A hull's shadow IS the shadow it was carved from");
    report("AND THE CAMERA-DEPENDENCE IS v4372's, MEASURED PROPERLY THERE: it MESHES the hull and renders it through " +
           "the lit pipeline, and finds the same hull at the same 54.9% error REFUSED from one camera (IoU 0.9298, " +
           "scale 0.1023) and PASSED from another (0.9484, 0.0548). This file's flat-silhouette version of that was a " +
           "weaker instrument and is not repeated. What follows is the parameter v4372 did not vary.");
}

console.log("\n2. *** THE VERDICT MOVES WITH THE CARVE'S GRID -- SAME SHAPE, SAME CAMERA, SAME METHOD ***");
const SWEEP = {};
{
    const NS = [32, 48, 64, 96], names = ["sphere", "cup", "tube"];
    for (const name of names) { SWEEP[name] = {};
        for (const n of NS) { const f = shapes(n)[name], H = hullAt(f, n);
            const v = judge(silhouetteOf(f, n, { yaw: HELD_OUT }), silhouetteOf(H.fn, n, { yaw: HELD_OUT }), n, upFor(n));
            SWEEP[name][n] = { over: H.over, iou: v.iou, scale: v.scaleDelta, pass: v.passesHardGates }; } }
    const T = SWEEP.tube;
    ok(`*** the tube is PASSED at n=32 and n=96 and REFUSED at n=64, and its volume error (${NS.map((n) => (T[n].over * 100).toFixed(1) + "%").join(", ")}) does not order the verdicts ***`,
        T[32].pass && T[48].pass && !T[64].pass && T[96].pass && T[96].over > 0.75,
        NS.map((n) => `n=${n} ${(T[n].over * 100).toFixed(1)}% ${T[n].pass ? "PASS" : "REFUSED"}`).join(", ") +
        " -- the ONE refusal is at the middle grid, and the two passes bracket it in error as well as in resolution");
    // THE SCALE HALF IS A FUNCTION OF THE GRID ALONE
    let sameAcrossShapes = true, spread = [];
    for (const n of NS) { const vals = new Set(names.map((k) => SWEEP[k][n].scale.toFixed(6)));
        if (vals.size !== 1) sameAcrossShapes = false;
        spread.push(`n=${n}: ${[...vals][0]} for errors ${names.map((k) => (SWEEP[k][n].over * 100).toFixed(1) + "%").join("/")}`); }
    ok("*** and their scaleDelta is a function of the GRID ALONE: at every resolution it is the identical number for three shapes whose errors span 0.9% to 90.0% ***",
        sameAcrossShapes, spread.join("   |   "));
    const A = SWEEP.sphere[64], B = SWEEP.tube[96];
    ok(`*** the pair that says it outright: at n=64 their gate REFUSES a hull ${(A.over * 100).toFixed(1)}% too big, and at n=96 it PASSES one ${(B.over * 100).toFixed(1)}% too big ***`,
        A.pass === false && B.pass === true && B.over > A.over * 20,
        `sphere n=64 ${(A.over * 100).toFixed(1)}% scale ${A.scale.toFixed(6)} REFUSED; tube n=96 ${(B.over * 100).toFixed(1)}% scale ${B.scale.toFixed(6)} PASS. Same gate, same camera, same method, two grids -- and a factor of ${(B.over / A.over).toFixed(0)} in error pointing the other way`);
}

console.log("\n3. THE MECHANISM: one voxel of bounding box, priced in their 224 cells");
{
    const rows = [];
    for (const n of [32, 48, 64, 96]) {
        const f = shapes(n).tube, H = hullAt(f, n), U = upFor(n);
        const bb = (m) => DE.bboxOf(DE.maskGrid(renderAt(m, n, U).px, n * U, n * U).grid);
        const a = bb(silhouetteOf(f, n, { yaw: HELD_OUT })), b = bb(silhouetteOf(H.fn, n, { yaw: HELD_OUT }));
        rows.push({ n, U, refW: a[2], hullW: b[2], grew: b[2] - a[2], perVoxel: U });
    }
    const widths = rows.map((r) => `n=${r.n}: ${r.refW}->${r.hullW} cells (+${r.grew})`);
    ok("their bounding box grows by a fixed handful of their 224 cells, and how many cells one voxel is worth is what changes with n",
        rows.every((r) => r.grew >= 0) && rows.some((r) => r.grew > 0) && rows.some((r) => r.grew === 0),
        widths.join("   |   ") + `. At n=64 one voxel is 1/12 of the object's width and their AREA delta reads 0.0833, a hair over their 0.08 ceiling; at n=96 the same one voxel is worth less and the same hull passes`);
    report("SO THE GATE IS NOT INSENSITIVE TO VOLUME BY ACCIDENT OF THIS FIXTURE SET -- it is reading a bounding box, " +
           "and a visual hull's bounding box is the object's bounding box plus at most the quantisation of whatever " +
           "grid the carve ran on. v4372 put it as \"silhouette statistics being asked a volume question\"; this is the " +
           "granularity of the statistic. The practical consequence is the uncomfortable one: a team that made their " +
           "carve FINER to improve it would also make it stop being refused, and neither change is about the model.");
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. Every number below was produced by running it.
//   A  the fixtures stop scaling with n, so a resolution sweep changes the SHAPE as well as the grid -> exit=1,
//      3 red: every error reads 90.0% at every n and the sweep stops being a controlled experiment. This is the
//      sabotage the round needs, because "only n changed" is the whole claim and a fixture set that did not
//      scale would have made a shape difference look like a grid effect.
//   B  their SCALE_HARD_MAX raised from 0.08 to 0.09, just past the n=64 one-voxel margin -> exit=1, 3 red: the
//      constants check names the edit, and both resolution claims die because nothing is refused at n=64 any
//      more. Their ceiling sitting a hair under one voxel at this grid IS the effect; a ceiling that does not is
//      a different gate and the section correctly stops having anything to say.
//   C  carve() drops its last view, so the hulls are no longer consistent with every input -> exit=1, 1 red, and
//      ONLY the citation check in section 1. *** THAT IS THE ROUND'S OWN THESIS ARRIVING AS A SABOTAGE RESULT. ***
//      Making the hulls worse does not disturb the resolution dependence, because the dependence is a property
//      of the GRID and not of the hull's accuracy. A sabotage that fails to move a claim is usually a finding
//      about the claim; here it is the claim.
//
//   AND TWO PROTOCOL FAILURES IN ONE ROUND, BOTH THE SAME SPECIES: AN OPERATION THAT FAILED QUIETLY.
//   (1) Sabotage A was reverted with `git checkout` on a file that was still UNTRACKED, so the checkout failed
//       silently and A was still in place while B and C ran. Both were re-run from a verified copy and the
//       numbers above are the clean ones; the first pass had B at 4 red and C at 4 red, all of them A's.
//   (2) The merge that brought main's v4372 in left a conflict in brain/brain.js, and `git add -A` marked it
//       resolved -- so `git diff --diff-filter=U` reported zero conflicts over a file that still carried its
//       markers. It reached verify, where tools/check.mjs caught it as a SyntaxError at line 2881. The staging
//       command is what hid it, and the gate is what did not.
//   A restore that is not verified is not a restore, and a conflict list taken after `git add -A` is not a
//   conflict list.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a REAL PHOTOGRAPH, which neither the carve nor the judge has met -- every silhouette is " +
    "computed from a solid this tree defines, and their gate's actual job is a render against a photograph where IoU " +
    "never starts at 1. Their five unported soft signals and the VLM layer, so no verdict here is their verdict -- it " +
    "is what their HARD gates let through, which their own contract says no soft signal may overturn. The renders are " +
    "flat two-tone silhouettes, so SSIM and edge overlap are not exercised and are not quoted; v4372's meshed hulls " +
    "through the lit pipeline are the instrument for those. And WHERE between n=64 and n=96 the verdict flips, which " +
    "is a sweep this round did not run -- the same gap v4372 left between its two cameras.");
process.exit(fails ? 1 : 0);
