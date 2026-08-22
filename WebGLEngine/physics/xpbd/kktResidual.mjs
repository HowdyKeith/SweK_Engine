// WebGLEngine/physics/xpbd/kktResidual.mjs -- v3602
// ---------------------------------------------------------------------------------------------------------------
// THE SHIPPED CLOTH SOLVER, GRADED ON THE HALF OF ITS OWN KKT SYSTEM NOBODY HAD EVER ASKED ABOUT.
//
// v3600 built momentumResidual to settle a question about SCHEDULES and left a bigger one open: the shipped
// clothLoop runs five iterations and has never been graded on the row that decides WHERE THE CLOTH ENDS UP.
// Every key this tree has on XPBD -- v3479's byte-for-byte equivalence, the free-fall closed form, the
// compliance plants -- grades the constraint row or the decomposition. NONE of them asks whether the
// accumulated displacement is the sum of the corrections that were supposed to produce it.
//
//   CONSTRAINT ROW   C_j(x) + aTilde_j * lambda_j = 0        -- "are the constraints satisfied"
//   MOMENTUM ROW     x - xPred - M^-1 sum_j gradC_j(x) lambda_j = 0   -- "did the solver move it THERE"
//
// ================================================================================================================
// FINDING 1: THE TWO ROWS BEHAVE OPPOSITELY UNDER ITERATION, AND ONLY ONE OF THEM CONVERGES
// ================================================================================================================
//
// MEASURED on the shipped 5x5 cloth: the momentum residual reads 3.886e-11 / 6.115e-11 / 8.924e-11 at 1 / 2 / 5
// iterations and then STOPS -- 8.765e-11 at 10, 9.326e-11 at 50, AND 9.326e-11 AT FIVE HUNDRED. It RISES with
// early iterations and PLATEAUS at a floor. The constraint residual over the same sweep does the opposite and
// goes to machine zero.
//
// *** SO "CONVERGED" MEANS ONE ROW AND NOT THE OTHER. Iterating harder drives the constraint residual to 1e-16
// and CANNOT TOUCH the momentum residual, because that floor is not an iteration deficit -- it is the amount
// the constraint DIRECTIONS rotated while the solve was moving the particles along them. *** A reader who had
// only ever seen the constraint residual would reasonably conclude that more iterations buy accuracy in both.
//
// ================================================================================================================
// FINDING 2: THE ANSWER KEY IS AN IDENTITY, AND IT IS EXACT WHERE THE DIRECTIONS CANNOT ROTATE
// ================================================================================================================
//
// One constraint, one pinned particle, one free one on the line between them: the correction is always along a
// direction that does not move, so the momentum row is EXACT -- 2.776e-17 at 1, 2, 3 AND 5 iterations, machine
// zero rather than small. THAT IS THE KEY, and it needs no tolerance anybody chose: a solver whose momentum row
// is nonzero THERE is not accumulating its own corrections, which is a different and much worse fault than a
// linearisation error. The cloth's 8.9e-11 is then a MEASURED departure from an exact reference rather than a
// number compared against a threshold.
//
// ================================================================================================================
// FINDING 3: THE FLOOR IS STEEP IN dt, WHICH IS WHY IT HAS NEVER MATTERED -- AND THAT IS NOW MEASURED
// ================================================================================================================
//
// Halving the substep: 8.924e-11 -> 1.053e-13 -> 5.672e-16 -> 4.956e-16, so it falls by ~3 orders per halving
// until it lands on the floating-point floor by dt = 0.004 and stops. THE SHIPPED dt = 0.016 SITS AT 8.9e-11
// AND THE VERDICT IS THAT THIS HALF OF THE SYSTEM IS FINE. That is the honest output of the round: a claim
// nobody had checked is now CHECKED AND PASSING, which is a different thing from a defect hunt that found
// nothing -- the number exists now, and the next person to change the solver has something to compare against.
//
// ================================================================================================================
// FINDING 4, THE LOAD-BEARING NEGATIVE: THE MOMENTUM ROW MUST INCLUDE EVERY CONSTRAINT SET THAT MOVED THE
// PARTICLE, AND clothFrame HAS TWO
// ================================================================================================================
//
// clothFrame solves the mesh constraints and then, when radius > 0, DISCOVERS A SECOND CONSTRAINT SET (the
// self-collision pairs) with its own lambda array and solves that too. A momentum row written over the mesh
// constraints alone -- which is the obvious way to write it, and the way v3600 wrote it because collision was
// off -- reads **2.061e-1 ON A PERFECTLY CORRECT SOLVER** at radius 0.4 with 48 pairs, NINE ORDERS above the
// collision-free 8.924e-11. Including both sets brings it to 2.661e-2.
//
// *** AND THE OMITTED VALUE IS NOT NOISE, IT IS THE DISPLACEMENT THE FORGOTTEN SET CAUSED: mainOnly reads
// 2.061e-1 against a measured total motion of 2.061e-1. A momentum row that forgets a constraint set reports
// exactly the movement it cannot account for, WHICH LOOKS LIKE A CATASTROPHIC SOLVER FAULT AND IS A BOOKKEEPING
// ERROR IN THE CHECK. *** This is the fault this round would most plausibly have shipped.
//
// WHAT IS NOT CLAIMED, AND IT IS A REFUSAL RATHER THAN AN OMISSION: v3600 measured the schedule gap scaling as
// displacement^4 and I tried to use it to PREDICT the collision case. IT DOES NOT TRANSFER -- measured/predicted
// is 7.095 at radius 0.4 and 2.568 at 0.5, not even consistently wrong. A POWER LAW MEASURED ON ONE LEVER
// (gravity, one constraint set) IS NOT A LAW ABOUT ANOTHER (a second constraint set, a hundredfold larger
// displacement), and asserting it would have been numerology. The exponent stays a fact about the gravity sweep.
//
// clothLoop IS UNCHANGED. This grades the shipped path; it does not alter it. No device, no baseline change.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { predictPass, solveColorPass } from "./clothLoop.js";
import { findCollisionPairs } from "./selfCollide.js";
import { constraintResidual, momentumResidual } from "./scheduleKey.mjs";

export const DT = 0.016, GRAVITY = [0, -10, 0];
export const SHIPPED_ITERATIONS = 5;            // clothFrame's own default
export const SHIPPED_STIFF = { structural: 0.0, shear: 0.001, bending: 0.01 };

export function scene(W = 5, H = 5, stiff = SHIPPED_STIFF) {
    const { cons, adj } = buildClothConstraints(W, H, 0.3, stiff);
    const colors = colorConstraints(cons);
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        pos[3 * i] = x * 0.3; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * 0.3; invMass[i] = (y === 0) ? 0 : 1;
    }
    return { cons, adj, colors, init: { pos, vel, invMass } };
}

// ONE SUBSTEP OF THE SHIPPED PATH, with xPred and BOTH lambda arrays carried out so the momentum row can be
// written over every constraint set that actually moved a particle. Same passes clothFrame runs, same order.
export function shippedSubstep(sc, { iters = SHIPPED_ITERATIONS, radius = 0, gravity = GRAVITY, dt = DT } = {}) {
    const im = sc.init.invMass, n = sc.init.pos.length;
    const buf = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel),
                  pred: new Float64Array(n), prev: new Float64Array(n) };
    predictPass(buf, im, dt, gravity);
    const xPred = Float64Array.from(buf.pred);
    const lam = new Float64Array(sc.cons.length);
    for (let it = 0; it < iters; it++) for (const col of sc.colors) solveColorPass(buf.pred, im, sc.cons, col, lam, dt, false);
    let coll = [], lamC = new Float64Array(0);
    if (radius > 0) {
        const pairs = findCollisionPairs(buf.pred, im.length, 2 * radius, 2 * radius, sc.adj);
        coll = pairs.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: 0 }));
        lamC = new Float64Array(coll.length);
        for (const c of colorConstraints(coll)) solveColorPass(buf.pred, im, coll, c, lamC, dt, true);
    }
    let moved = 0;
    for (let i = 0; i < n; i++) moved = Math.max(moved, Math.abs(buf.pred[i] - sc.init.pos[i]));
    return { pred: Float64Array.from(buf.pred), xPred, lam, coll, lamC, moved };
}

/** BOTH ROWS of the KKT system for one shipped substep. The pair is the point; neither alone is the state. */
export function kktRows(sc, opts = {}) {
    const r = shippedSubstep(sc, opts);
    const allCons = [...sc.cons, ...r.coll];
    const allLam = Float64Array.from([...r.lam, ...r.lamC]);
    return {
        constraint: constraintResidual(r.pred, sc.cons, r.lam, opts.dt ?? DT),
        momentum: momentumResidual(r.pred, r.xPred, sc.init.invMass, allCons, allLam),
        momentumMeshOnly: momentumResidual(r.pred, r.xPred, sc.init.invMass, sc.cons, r.lam),
        collisionPairs: r.coll.length, moved: r.moved,
    };
}

/** THE ANSWER KEY: one constraint whose direction cannot rotate -- the momentum row is EXACT there. */
export function exactFixture() {
    const cons = [{ i: 0, j: 1, rest: 0.3, compliance: 0.0 }];
    const invMass = new Float64Array([0, 1]);
    const pos = new Float64Array([0, 0, 0, 0.5, 0, 0]), vel = new Float64Array(6);
    return { cons, adj: new Set(), colors: [[0]], init: { pos, vel, invMass } };
}

/** Both rows against iteration count. They move in OPPOSITE directions -- that is the finding. */
export function iterationSweep(sc, its = [1, 2, 5, 10, 50, 500]) {
    return its.map((iters) => { const k = kktRows(sc, { iters });
        return { iters, constraint: k.constraint, momentum: k.momentum }; });
}

/** The floor against dt. Steep, and it lands on the floating-point floor rather than on a physical one. */
export function dtSweep(sc, dts = [0.016, 0.008, 0.004, 0.002]) {
    return dts.map((dt) => ({ dt, momentum: kktRows(sc, { dt }).momentum }));
}

/** THE TRAP: the momentum row written over the mesh constraints alone while collision is active. */
export function omittedSetTrap(sc, radius = 0.4) {
    const k = kktRows(sc, { radius });
    return { radius, pairs: k.collisionPairs, meshOnly: k.momentumMeshOnly, bothSets: k.momentum, moved: k.moved };
}

export const MEASURED_V3602 = {
    supersededByV3604:
        "*** SUPERSEDED AT v3604: every number here was taken at radius 0.4, which the alternating-projection bisection puts ABOVE the feasibility ceiling h*sqrt(5)/2 = 0.335410 -- an unsatisfiable contact set. The honest radius is r <= h/2 = 0.150000, and the 5x5 hanging fixture finds ZERO PAIRS there. See physics/xpbd/clothSoak.mjs. NOT DELETED: the question was asked and settled, and the reading is correct FOR THE CONFIGURATION IT WAS TAKEN AT. ***",
    exactFixtureResidual: 2.776e-17,
    shippedMomentum: 8.924e-11,
    iterationPlateau: { 1: 3.886e-11, 2: 6.115e-11, 5: 8.924e-11, 10: 8.765e-11, 50: 9.326e-11, 500: 9.326e-11 },
    dtSweep: { 0.016: 8.924e-11, 0.008: 1.053e-13, 0.004: 5.672e-16, 0.002: 4.956e-16 },
    trapAt040: { pairs: 48, meshOnly: 2.061e-1, bothSets: 2.661e-2, moved: 2.061e-1 },
    verdict: "THE SHIPPED CLOTH SOLVER PASSES ON ITS MOMENTUM ROW at the shipped configuration (8.9e-11 at " +
             "dt 0.016, 5 iterations). This is a claim nobody had checked, now checked -- not a defect hunt " +
             "that found nothing. The number exists so the next change to the solver has something to move.",
    refused: "v3600's displacement^4 law DOES NOT TRANSFER to the collision lever: measured/predicted is " +
             "7.095 at radius 0.4 and 2.568 at 0.5, not even consistently wrong. A power law measured on one " +
             "lever is not a law about another, and asserting it would have been numerology.",
    notClaimed: "clothLoop IS UNCHANGED -- this grades the shipped path and does not alter it. No device, no " +
                "promptCost / instrument-map / baseline change.",
};

export function reportLines() {
    const L = [], sc = scene();
    L.push("[kktResidual] The shipped cloth solver, on the half of its KKT system nobody asked about");
    L.push("");
    const ex = exactFixture();
    L.push("1. THE ANSWER KEY: one constraint whose direction cannot rotate -> the momentum row is EXACT");
    for (const iters of [1, 2, 5]) L.push("     iters=" + iters + "  momentum = " + kktRows(ex, { iters }).momentum.toExponential(3));
    L.push("");
    L.push("2. THE TWO ROWS MOVE IN OPPOSITE DIRECTIONS UNDER ITERATION");
    L.push("     iters   constraint row      momentum row");
    for (const r of iterationSweep(sc))
        L.push("     " + String(r.iters).padStart(5) + "   " + r.constraint.toExponential(3).padEnd(19) + r.momentum.toExponential(3));
    L.push("     ONE CONVERGES AND ONE PLATEAUS. The floor is the rotation of the constraint directions,");
    L.push("     and no number of iterations touches it.");
    L.push("");
    L.push("3. THE FLOOR AGAINST dt -- steep, and it lands on the floating-point floor");
    for (const r of dtSweep(sc)) L.push("     dt=" + String(r.dt).padEnd(6) + " momentum = " + r.momentum.toExponential(3));
    L.push("");
    L.push("4. THE TRAP: the momentum row over the MESH constraints alone while collision is active");
    for (const rad of [0.4, 0.5]) {
        const t = omittedSetTrap(sc, rad);
        L.push("     radius=" + t.radius + "  pairs=" + String(t.pairs).padStart(3) +
               "  meshOnly=" + t.meshOnly.toExponential(3) + "  bothSets=" + t.bothSets.toExponential(3) +
               "  (motion " + t.moved.toExponential(3) + ")");
    }
    L.push("     A MOMENTUM ROW THAT FORGETS A CONSTRAINT SET REPORTS THE MOVEMENT IT CANNOT ACCOUNT FOR,");
    L.push("     which looks like a catastrophic solver fault and is a bookkeeping error in the check.");
    L.push("");
    L.push("  " + MEASURED_V3602.verdict);
    L.push("  REFUSED: " + MEASURED_V3602.refused);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
