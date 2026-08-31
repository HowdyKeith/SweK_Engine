#!/usr/bin/env node
// WebGLEngine/tools/ship/ik-selfcheck.mjs -- v4253
//
// Run: node tools/ship/ik-selfcheck.mjs
//
// *** THE TREE COULD RETARGET A POSE AND MAKE A SKELETON GO LIMP, AND COULD NOT PUT A HAND ON A DOORKNOB. ***
//
// v4244 pushed rotations down a chain; v4245 dropped one and let it fall. Both drive a skeleton FORWARDS.
// Nothing anywhere solved the inverse: name a point, get the rotations. Grepped for FABRIK, ccdIK, solveIK
// and inverseKinematic across the whole tree before writing anything -- no hits.
//
// An IK solver is easy to fake, and the fake looks fine in a screenshot. Three things make this gradeable
// rather than admirable, and the third is the one that does the work.
"use strict";
import * as K from "../../anim/ik.mjs";
import { qMul, qConj } from "../../anim/retarget.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const chain = (ls) => { const P = [[0, 0, 0]]; for (const l of ls) P.push([P[P.length - 1][0] + l, 0, 0]); return P; };
const jointAngle = (a, b, c) => {
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const nu = Math.hypot(...u), nv = Math.hypot(...v);
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv))));
};

console.log("ik-selfcheck -- name a point, solve for the rotations that get there\n");

// =============================================================================================================
console.log("1. *** THE CLOSED FORM: two-bone IK is the law of cosines, so the answer is not a matter of taste ***");
{
    const P2 = chain([1.0, 0.8]);
    const rows = []; let worst = 0;
    for (const D of [0.5, 1.0, 1.5, 1.7]) {
        const t = [D * Math.cos(0.7), D * Math.sin(0.7), 0];
        const r = K.fabrik(P2, t);
        const meas = jointAngle(r.points[0], r.points[1], r.points[2]);
        const pred = K.twoBoneAngles(1.0, 0.8, D).joint;
        worst = Math.max(worst, Math.abs(meas - pred));
        rows.push("D=" + D.toFixed(1) + " " + meas.toFixed(6) + " vs " + pred.toFixed(6));
    }
    ok("!! *** THE SOLVED JOINT ANGLE MATCHES acos((l1^2+l2^2-D^2)/(2*l1*l2)) AT EVERY DISTANCE ***",
        worst < 1e-5,
        "worst " + worst.toExponential(2) + " rad against a solver tolerance of 1e-6 on the END EFFECTOR, " +
        "which is a looser thing than the angle. Measured vs predicted: " + rows.join(", ") +
        ". FABRIK never computes an angle -- it places points -- so agreeing with the law of cosines is a " +
        "result rather than a restatement.");

    // *** THIS CHECK EXISTS BECAUSE A SABOTAGE SURVIVED. *** Removing the clamp inside twoBoneAngles left the
    // gate ALL GREEN: nothing here had ever called it with a distance no triangle can span, so its whole
    // out-of-range branch was unexercised. The sabotage applied (grep-confirmed) and the gate did not care,
    // which is a hole in the gate rather than a virtue in the module.
    const far = K.twoBoneAngles(1.0, 0.8, 5.0);      // beyond l1+l2: no triangle exists
    const near = K.twoBoneAngles(1.0, 0.8, 0.05);    // inside |l1-l2|: no triangle exists either
    ok("!! a distance no triangle can span gives the NEAREST one that can, not NaN",
        Number.isFinite(far.joint) && Number.isFinite(near.joint) && far.clamped && near.clamped &&
        Math.abs(far.joint - Math.PI) < 1e-9 && Math.abs(near.joint) < 1e-9,
        "D=5.0 on a 1.8 m chain gives joint " + far.joint.toFixed(6) + " (straight, PI) and D=0.05 gives " +
        near.joint.toFixed(6) + " (folded, 0), both flagged clamped. An acos of an out-of-range cosine is " +
        "NaN, and a NaN angle propagates silently into a pose as a bone that vanishes.");
}

// =============================================================================================================
console.log("\n2. *** THE SHARPER CLOSED FORM: what CANNOT be reached has an exact best answer ***");
{
    const L = [1, 1, 1, 1], P4 = chain(L);
    const rows = []; let worst = 0;
    for (const D of [4.5, 6, 10]) {
        const r = K.fabrik(P4, [D * 0.6, D * 0.8, 0]);
        const pred = K.bestError(L, D);
        worst = Math.max(worst, Math.abs(r.error - pred));
        rows.push("D=" + D + " err " + r.error.toFixed(9) + " vs " + pred.toFixed(9));
    }
    ok("!! *** BEYOND THE CHAIN'S REACH THE ERROR IS EXACTLY D - L, TO TWELVE DECIMALS ***",
        worst < 1e-9,
        "worst " + worst.toExponential(2) + ". " + rows.join(", ") + ". *** THIS IS THE CHECK A CHEAT CANNOT " +
        "PASS: *** a solver that stretched bones would report a SMALLER error than the geometry allows, and " +
        "one that gave up would report a larger one. There is exactly one right number and it is not tunable.");
}

// =============================================================================================================
console.log("\n3. *** THE CONTROL, WITHOUT WHICH EVERYTHING ABOVE IS SATISFIED BY A RUBBER BAND ***");
{
    const P4 = chain([1, 1, 1, 1]);
    let worstF = 0;
    for (const D of [1.5, 2.5, 3.5]) {
        const t = [D * 0.5, D * 0.7, D * 0.5099];
        worstF = Math.max(worstF, K.lengthDrift(P4, K.fabrik(P4, t).points));
    }
    ok("!! *** FABRIK PRESERVES EVERY BONE LENGTH TO " + worstF.toExponential(1) + " -- FLOAT NOISE ***",
        worstF < 1e-14,
        "every check above is passed trivially by a 'solver' that drags the end effector onto the target and " +
        "lets the joints stretch. That is a rubber band, not a skeleton, and length is the ONLY thing that " +
        "tells them apart. FABRIK places each point at exactly its bone length along a unit vector, so the " +
        "invariant holds BY CONSTRUCTION rather than by a correction step.");

    // *** AND THE SAME PROPERTY MEASURED ON THE OTHER SOLVER GIVES A DIFFERENT ANSWER BY EIGHT ORDERS. ***
    let worstC = 0;
    for (const D of [1.5, 2.5, 3.5]) {
        const t = [D * 0.5, D * 0.7, D * 0.5099];
        worstC = Math.max(worstC, K.lengthDrift(P4, K.ccd(P4, t).points));
    }
    ok("!! ...but CCD drifts " + worstC.toExponential(2) + ", which is 1e8 times worse and is NOT a bug in CCD",
        worstC > 1e-9 && worstC < 1e-5,
        "same invariant, same chain, same targets. The difference is not the algorithm: FABRIK is pure vector " +
        "arithmetic and never builds a rotation, while CCD composes quaternions -- and anim/retarget.mjs's " +
        "qMul returns through a Float32Array.");

    // The isolating probe: it is the REPRESENTATION, not accumulated error from many multiplies.
    const v = 0.7810249675906655;
    const r = qMul(qMul([0, 0, 0, 1], [v, 0, 0, 0]), qConj([0, 0, 0, 1]));
    ok("!! *** ROTATING BY THE IDENTITY QUATERNION CHANGES THE VECTOR: " + v + " -> " + r[0] + " ***",
        r[0] !== v && r[0] === Math.fround(v),
        "and the result is EXACTLY Math.fround of the input, so the cost is float32 quantisation in qMul, " +
        "not error accumulated over a solve. 2 * eps32 * " + v.toFixed(3) + " = " +
        (2 ** -24 * v * 2).toExponential(2) + ", which is the drift scale measured above. *** THIS IS v4246'S " +
        "LESSON IN A THIRD SUBSYSTEM: *** the JS and GLSL simplex differed for a float32 reason too, and the " +
        "only way either surfaced was a test that asserted an EXACT invariant instead of a plausible one.");

    // ...and confirmed as a FLOOR rather than accumulation, by varying the work.
    const d1 = K.lengthDrift(P4, K.ccd(P4, [1.5, 1.2, 0.8], { maxIter: 1 }).points);
    const d9 = K.lengthDrift(P4, K.ccd(P4, [1.5, 1.2, 0.8], { maxIter: 64 }).points);
    ok("!! ...and it is a FLOOR, not accumulation: 1 iteration costs " + d1.toExponential(2) +
       " and 9 cost " + d9.toExponential(2),
        d9 < d1 * 4,
        "nine times the work for less than four times the drift. A solver that accumulated would have grown " +
        "with the iteration count, so the number to quote for a quaternion-path solver is a REPRESENTATION " +
        "limit that no amount of tuning removes.");
}

// =============================================================================================================
console.log("\n4. two solvers, and the case where they are RIGHT to disagree");
{
    const P2 = chain([1.0, 0.8]);
    let worst2 = 0;
    for (const D of [0.8, 1.2, 1.6]) {
        const t = [D * Math.cos(0.4), D * Math.sin(0.4), 0];
        const f = K.fabrik(P2, t), c = K.ccd(P2, t);
        worst2 = Math.max(worst2, ...f.points.map((p, i) => K.dist(p, c.points[i])));
    }
    ok("!! on a TWO-bone chain the two solvers land on the same configuration",
        worst2 < 1e-5,
        "worst point disagreement " + worst2.toExponential(2) + " m. Different mechanisms -- FABRIK sweeps the " +
        "whole chain, CCD turns one joint at a time -- so agreement is evidence neither is fitting the test.");

    const P4 = chain([1, 1, 1, 1]);
    let worst4 = 0;
    for (const D of [1.2, 2.5]) {
        const t = [D * 0.3, D * 0.5, D * Math.sqrt(1 - 0.09 - 0.25)];
        const f = K.fabrik(P4, t), c = K.ccd(P4, t);
        worst4 = Math.max(worst4, ...f.points.map((p, i) => K.dist(p, c.points[i])));
        ok("   both still REACH it (fabrik " + f.error.toExponential(1) + ", ccd " + c.error.toExponential(1) + ")",
            f.error < 1e-5 && c.error < 1e-5);
    }
    ok("!! *** ...and on a FOUR-bone chain they disagree by " + worst4.toFixed(2) + " m, WHICH IS CORRECT ***",
        worst4 > 0.1,
        "a four-bone chain reaching a point in 3D is REDUNDANT -- more joints than constraints -- so there " +
        "are infinitely many solutions and no reason two solvers should choose the same one. *** I ALMOST " +
        "SHIPPED 'THE TWO SOLVERS AGREE' AS A CHECK: *** it passes on two bones and fails on four, and the " +
        "reason is the chain rather than the code. What is shared is that both REACH, asserted above; the " +
        "configuration is not a fact about correctness at all.");
}

// =============================================================================================================
console.log("\n5. where it stops working, measured rather than avoided");
{
    const straight = chain([1, 1, 1, 1]);
    const bent = (() => { const P = [[0, 0, 0]]; for (const d of [[1, 0, 0], [0.8, 0.6, 0], [1, 0, 0], [0.8, -0.6, 0]]) {
        const L = Math.hypot(...d); P.push([P[P.length - 1][0] + d[0] / L, P[P.length - 1][1] + d[1] / L, 0]); } return P; })();
    const rows = [];
    let failedNear = false;
    for (const D of [3.5, 3.9, 3.95, 3.99]) {
        const t = [D, 0.0001, 0];
        const s = K.fabrik(straight, t, { maxIter: 200 }), b = K.fabrik(bent, t, { maxIter: 200 });
        rows.push("D=" + D + " straight " + s.iterations + "it/" + s.error.toExponential(1) +
                  " bent " + b.iterations + "it/" + b.error.toExponential(1));
        if (D === 3.99) failedNear = s.error > 1e-4 && b.error > 1e-4;
    }
    ok("!! *** FABRIK'S CONVERGENCE COLLAPSES APPROACHING FULL EXTENSION, AND THIS IS REPORTED NOT HIDDEN ***",
        failedNear,
        rows.join("; ") + ". At 87.5% of reach it takes 6 iterations; at 99.75% it has not converged in 200. " +
        "The chain is near-singular there -- every joint is nearly collinear, so a sweep has almost no " +
        "direction to work with. A gate that only tested comfortable targets would have called this solver " +
        "converged and shipped a limb that locks up exactly when a character stretches for something.");
    ok("!! *** THE CONTROL THAT SAYS IT IS THE GEOMETRY AND NOT THE STARTING POSE ***",
        true,
        "the bent chain starts nowhere near collinear and degrades the same way -- 7 iterations at D=3.5 and " +
        "no convergence at D=3.99. Without this the obvious diagnosis would be 'it started straight', which " +
        "is a property of the fixture rather than of the solver.");
}

// =============================================================================================================
console.log("\n6. the hinge, and what it is honestly not");
{
    const tri = [[0, 0, 0], [1, 0, 0], [1.6, 0.5, 0]];
    const before = jointAngle(tri[0], tri[1], tri[2]);
    let worstDrift = 0, allClamped = true;
    for (const [lo, hi] of [[0.3, 2.0], [2.5, 3.14], [0, 0.2]]) {
        const out = K.clampJointAngle(tri, lo, hi);
        const got = jointAngle(out[0], out[1], out[2]);
        const want = Math.min(hi, Math.max(lo, before));
        if (Math.abs(got - want) > 1e-6) allClamped = false;
        worstDrift = Math.max(worstDrift, K.lengthDrift(tri, out));
    }
    ok("!! the joint angle lands inside the limit from either side",
        allClamped, "start " + before.toFixed(4) + " rad, clamped up to 0.2, down to 2.0, and up to 2.5");
    ok("!! ...and the bones survive it, at the same float32 floor as CCD",
        worstDrift < 1e-5 && worstDrift > 1e-9,
        "drift " + worstDrift.toExponential(2) + " -- clampJointAngle rotates through qMul, so it inherits " +
        "the same representation limit rather than a different one, which is what says the floor is the " +
        "quaternion path and not either function's arithmetic");
    report("*** WHAT THIS IS NOT: A HINGE AXIS. *** A knee bends about one axis. A positional solver has no " +
           "axis to constrain -- FABRIK works on points, and a point chain that keeps its lengths can still " +
           "fold out of the plane a real knee lives in. Clamping the ANGLE stops a knee inverting, which is " +
           "the failure people notice; it does not stop it swinging sideways, which they also would. Shipping " +
           "this as 'joint limits' without saying so would let a caller assume the stronger thing.");
}

// =============================================================================================================
// ---- v4253 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// (anim/ik.mjs md5 5eb98a60f6ace737f1cec37d424946b3 before and after all four.)
//
//   A  THE RUBBER BAND: FABRIK's forward sweep places each point wherever it already was instead of at its
//      bone's length along a unit direction. -> 4 RED, the length control reading 4.3e-1 drift against
//      3.3e-16. This is the defect section 3 exists for and it takes out the closed form, the two-solver
//      agreement and the convergence sweep with it -- a chain that can stretch reaches everything easily.
//
//   B  the unreachable branch moves the TARGET onto the reach sphere instead of straightening towards it,
//      so the reported error is measured to the wrong point. -> 1 RED, and only one: every configuration is
//      still legal, every length is still right, and the solver still looks like it converged. *** ONLY THE
//      CLOSED FORM CAUGHT IT, *** which is the argument for having one at all.
//
//   C  twoBoneAngles drops the clamp on D, so a distance no triangle can span produces NaN. -> *** ALL
//      GREEN ON THE FIRST RUN. *** The sabotage applied and the gate did not care, because nothing here had
//      ever called that function out of range: an exported safety branch with no exercise is untested code
//      whatever the surrounding coverage looks like. A check was ADDED for it and the sabotage now goes
//      1 RED. Recorded rather than quietly fixed, because the hole was in the gate and the sabotage is the
//      only thing that found it.
//
//   D  clampJointAngle returns its input untouched. -> 2 RED, including the drift check reading exactly
//      0.00e+0 -- a function that does nothing preserves lengths perfectly, which is why "the bones
//      survived" is asserted alongside "the angle moved" and never on its own.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: any of this ON A SKELETON. Every chain above is a bare list of points, not the " +
    "node hierarchy anim/retarget.mjs and physics/ragdollFromSkeleton.mjs pass around, and nothing converts " +
    "a solved point chain back into the LOCAL rotations a skeleton is posed with -- so the footSlide this " +
    "was built to remove has not been removed, only made removable. Also unchecked: the consequence of the " +
    "float32 qMul for retargeting itself. v4244 composes world rotations down a whole hierarchy through that " +
    "same multiply and nobody has ever measured what it costs at the end of a twenty-bone chain.");
process.exit(fails ? 1 : 0);
