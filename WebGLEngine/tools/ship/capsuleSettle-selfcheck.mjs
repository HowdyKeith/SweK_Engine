// WebGLEngine/tools/ship/capsuleSettle-selfcheck.mjs -- v4646
//
// Gates physics/character/capsuleSettle.mjs: the per-frame "settle a body that is already overlapping"
// contract, as distinct from capsuleMove.mjs's swept moveCapsule().
//
// *** SECTION 3 IS THE REASON THIS FILE EXISTS AND NOT JUST THE MODULE. *** The function was ported from
// claude/shader-porting-swek-ozgvb0, and porting it onto MAIN's segmentTriangle instead of copying the
// branch's own segmentTriangleClosest changed its answers -- measured at up to 0.32 in settled position over
// 400 deterministic random scenes, with contact COUNTS identical in all 400. The cause is a missing case,
// not a tolerance: the branch's version considers only the segment's endpoints against the triangle and the
// segment against the three EDGES, and never asks whether the segment passes through the face INTERIOR.
"use strict";
import { settleCapsule, GROUND_SUPPORT_NORMAL_Y } from "../../physics/character/capsuleSettle.mjs";
import { segmentTriangle } from "../../physics/character/capsuleMove.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const tri = (...v) => Float64Array.from(v.flat());
const R = 0.4, H = 1.8;

// A floor at y=0, two triangles, big enough that a capsule at the origin is nowhere near an edge.
const FLOOR = tri([-5,0,-5],[5,0,-5],[5,0,5], [-5,0,-5],[5,0,5],[-5,0,5]);
// A wall in the YZ plane at x=0.
const WALL  = tri([0,-5,-5],[0,5,-5],[0,5,5], [0,-5,-5],[0,5,5],[0,-5,5]);

console.log("capsuleSettle-selfcheck -- settle a body that is already overlapping\n");

console.log("1. THE CONTRACT: A BODY EMBEDDED IN A FLOOR COMES OUT, AND ONE THAT IS CLEAR IS NOT MOVED");
{
    const s = settleCapsule([0, -0.1, 0], R, H, FLOOR);
    ok("!! *** an embedded body is pushed out along the oriented normal and reads grounded ***",
       Math.abs(s.pos[1]) < 1e-9 && s.grounded === true && s.contacts > 0,
       `settled y=${s.pos[1].toFixed(6)}, grounded=${s.grounded}, contacts=${s.contacts}`);
    const clear = settleCapsule([0, 2, 0], R, H, FLOOR);
    ok("  CONTROL: a body well clear of the floor is not moved and is not grounded",
       clear.pos[1] === 2 && clear.grounded === false && clear.contacts === 0,
       `y=${clear.pos[1]}, grounded=${clear.grounded}, contacts=${clear.contacts}`);
    const empty = settleCapsule([0, -0.1, 0], R, H, new Float64Array(0));
    ok("  CONTROL: with no triangles at all nothing moves -- so section 1 is reading the mesh",
       empty.pos[1] === -0.1 && empty.contacts === 0, `y=${empty.pos[1]}`);
}

console.log("\n2. THE PUSH IS CLAMPED, WHICH IS THE WHOLE DIFFERENCE FROM A SWEPT MOVE");
{
    // Deep overlap: one call may not finish the job, and that is the design -- it resolves over frames.
    const deep = settleCapsule([0, -1.2, 0], R, H, FLOOR, { iterations: 1 });
    const step = Math.abs(deep.pos[1] - (-1.2));
    ok("!! a single pass moves at most radius * maxStepFrac, not the whole penetration",
       step <= R * 0.8 + 1e-12 && step > 0, `moved ${step.toFixed(4)} of 1.2, cap is ${(R * 0.8).toFixed(4)}`);
    // *** THIS ROW FIRST ASSERTED THE BODY COMES BACK UP TO y=0, AND THAT WAS THE ROW BEING WRONG. ***
    // From 1.2 deep it settles at y=-1.8, where the capsule's TOP is exactly one radius from the floor: it
    // left through the near side. The normal is oriented toward the body's own centre, and at that depth the
    // centre is BELOW the floor, so down is out. "Comes back up" was an assumption about direction that the
    // contract never makes -- the contract is that the overlap is gone. That is what is asked here.
    const many = settleCapsule([0, -1.2, 0], R, H, FLOOR, { iterations: 64 });
    const axLo = [0, many.pos[1] + R, 0], axHi = [0, many.pos[1] + Math.max(R, H - R), 0];
    const clearance = Math.min(segmentTriangle(axLo, axHi, FLOOR, 0).dist,
                               segmentTriangle(axLo, axHi, FLOOR, 9).dist);
    // *** AND THE DIRECTION IS ASSERTED, BECAUSE THE FIRST VERSION OF THIS ROW WAS SIGN-BLIND. *** It asked
    // only for clearance, and a sabotage that deleted normalToward's orientation flip entirely -- leaving
    // main's faceNormal, which always points UP -- went 0-RED against the whole file. With the orientation
    // gone the body is pushed up to y=0 instead of down to -1.8, and "clearance >= radius" is satisfied
    // either way. From 1.2 deep the centre is BELOW the floor, so out is DOWN, and that is the claim.
    ok("  ...and enough passes DO finish it, leaving by the side the body's own centre is on",
       clearance >= R - 1e-9 && many.pos[1] < -1.2,
       `settled y=${many.pos[1].toFixed(4)} (started -1.2, must go DOWN), axis clearance ${clearance.toFixed(4)} vs radius ${R}`);
}

console.log("\n3. *** THE CASE THE PORTED VERSION MISSED: AN AXIS THROUGH THE FACE INTERIOR ***");
{
    // The capsule axis runs vertically through a horizontal floor's interior. True distance is ZERO.
    const q = segmentTriangle([0, -1, 0], [0, 1, 0], FLOOR, 0);
    ok("!! *** segmentTriangle reports 0 for a segment that pierces the face, not the distance to an edge ***",
       q.dist === 0, `dist=${q.dist}`);
    // The branch's own version scored 1.000000 on this exact configuration while main scores 0.000000, and a
    // control segment outside the face agreed to the digit (15.811388 both). At radius 0.4 a reported
    // distance of 1.0 makes pen = 0.4 - 1.0 NEGATIVE, so the contact is skipped entirely: a body that has
    // gone through a wall reads as not touching it.
    // Started just on the -x side so the body's centre picks a side unambiguously, with the axis crossing
    // the wall plane. It must come out on THAT side -- magnitude alone would pass for either.
    const through = settleCapsule([-0.05, -1.0, 0], R, H, WALL, { iterations: 64 });
    ok("!! *** a body whose axis has gone THROUGH a wall is still found, and pushed out on its own side ***",
       through.pos[0] <= -R + 1e-9 && through.contacts > 0,
       `ended x=${through.pos[0].toFixed(4)} (needs x <= ${-R}), contacts=${through.contacts}`);
}

console.log("\n4. THE PLANT THE LAB DEVICE USES, AND WHAT IT IS BLIND TO");
{
    const truth = settleCapsule([0, -0.1, 0], R, H, FLOOR);
    const plant = settleCapsule([0, -0.1, 0], R, H, FLOOR, { plantGroundedFlip: true });
    ok("!! plantGroundedFlip inverts the ground verdict on a floor",
       truth.grounded === true && plant.grounded === false, `true=${truth.grounded} planted=${plant.grounded}`);
    ok("  ...and position and contact count are BLIND to it, which is why a device graded on those says nothing",
       plant.pos.every((v, i) => v === truth.pos[i]) && plant.contacts === truth.contacts,
       "identical position and contacts -- only `grounded` moves");
    ok("  and the threshold is imported rather than restated, so there is ONE definition of ground",
       GROUND_SUPPORT_NORMAL_Y === 0.5, `${GROUND_SUPPORT_NORMAL_Y}`);
}

console.log(`\ncapsuleSettle-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
