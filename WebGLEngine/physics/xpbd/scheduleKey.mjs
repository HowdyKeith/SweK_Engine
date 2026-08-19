// WebGLEngine/physics/xpbd/scheduleKey.mjs -- v3600
// ---------------------------------------------------------------------------------------------------------------
// THE SCHEDULE-INDEPENDENCE KEY, AND THE RESIDUAL EVERYBODY WOULD CHECK IT WITH CANNOT PIN THE ANSWER.
//
// matthias-research's 16-GPUCloth.py (MIT, NVIDIA 2022) solves cloth constraints in five passes, four flagged
// independent by graph colouring and one falling back to a JACOBI sweep scaled by jacobiScale = 0.2. The
// sentence that makes it a testable claim is that THE CONVERGED RESULT MUST NOT DEPEND ON THE PARALLEL
// SCHEDULE. Nothing here is vendored, nothing is ported, and no claim is made about anybody else's code --
// what is built is the instrument the sentence would have to be graded by, pointed at THIS tree's own
// clothLoop, whose v3479 decomposed-versus-monolithic rig is already the harness.
//
// ================================================================================================================
// FINDING 1: THE OBVIOUS RESIDUAL IS UNDER-DETERMINED, SO IT IS BLIND BY CONSTRUCTION AND NOT BY BAD LUCK
// ================================================================================================================
//
// The check anybody writes for this key is the XPBD constraint residual, C_j + aTilde_j * lambda_j = 0, driven
// to zero under both schedules. On the 5x5 fixture that is 102 EQUATIONS IN 162 UNKNOWNS -- 60 free position
// components plus 102 multipliers -- SO IT CANNOT PIN A POINT. Measured: colouring and Jacobi both drive it to
// 1.110e-16, machine zero, WHILE SITTING 8.496e-12 APART IN POSITION AND 1.588e-12 APART IN LAMBDA.
//
// *** THE PAIR IS WHAT SATISFIES IT, NOT THE POSITION: x_colour graded against lambda_jacobi reads 6.895e-12
// rather than 1e-16, so each schedule lands on its OWN point of a family the residual cannot distinguish. ***
//
// The half that pins the answer is the other KKT row, x - xPred - M^-1 * sum_j gradC_j(x) lambda_j = 0, which
// nothing in this tree had ever computed. It reads 1.602e-11 for colouring and 4.962e-12 for Jacobi -- FIVE
// ORDERS ABOVE THE CONSTRAINT RESIDUAL, AND DIFFERENT BETWEEN THE TWO. THE DISAGREEMENT IS THE SIZE OF THE
// MOMENTUM RESIDUAL, and a round that had shipped only the constraint residual would have reported a clean
// pass at 1e-16 on a disagreement four orders larger than the number it printed.
//
// ================================================================================================================
// FINDING 2: THE GAP IS STRUCTURAL, AND THE DISCRIMINATOR IS THE EXPONENT RATHER THAN THE SIZE
// ================================================================================================================
//
// 8.5e-12 looks like arithmetic noise and is not. ROUND-OFF SCALES LINEARLY WITH MAGNITUDE. This scales as the
// FOURTH POWER of how far the cloth moved: over a hundredfold sweep of gravity the local exponent reads 3.298,
// 4.041, 3.999, 4.000, 3.999, 3.994, and 4.001 / 4.000 / 3.999 on a second fixture (6x4). It also PLATEAUS in
// iteration count -- unchanged from 200 to 4000 -- so it is a property of the fixed point rather than of
// incomplete convergence. An exponent of 4 is a statement no floating-point account can make. (The leading
// term cancels; WHY it is exactly 4 is REPORTED and not explained, because explaining a measured exponent
// this file did not predict would be numerology.)
//
// ================================================================================================================
// FINDING 3: COLOURING IS NOT ONE SCHEDULE, WHICH REFRAMES THE QUESTION THE KEY WAS ASKING
// ================================================================================================================
//
// *** REVERSING THE COLOUR ORDER DISAGREES WITH FORWARD COLOURING BY 1.708e-11 -- TWICE THE COLOUR-TO-JACOBI
// GAP OF 8.496e-12. *** So a two-way "colouring versus Jacobi" comparison would have installed colouring as
// the reference, and it is not a reference: it is one member of a family of orders whose internal spread is
// LARGER than its distance to the other algorithm. The disagreement is not between the two named algorithms,
// and the key as proposed cannot see that because it only ever runs one colour order.
//
// ================================================================================================================
// FINDING 4: THE jacobiScale BOUNDARY IS TWO THINGS WEARING ONE LABEL, AND EACH ALONE IS WRONG IN A KNOWN
// DIRECTION. IT IS BRACKETED, NOT MEASURED.
// ================================================================================================================
//
// *** THIS FINDING IS ENTIRELY THE RESULT OF ONE DEFECT OF MY OWN, COMMITTED TWICE BEFORE IT WAS CAUGHT: A
// TIMEOUT REPORTED AS A FAILURE. *** The first bisection said the RIGID fixture (structural compliance 0,
// which is what clothLoopKey ships) fails at even jacobiScale 0.05. IT DOES NOT -- IT IS SLOW: residual
// 1.436e-8 at 400 iterations and 2.165e-15 at 2000, against colouring's 3.331e-16 at 400. The same bisection
// then reported the compliant fixture diverging at 1.2, and 1.2 converges perfectly well given 4000
// iterations. BOTH NUMBERS WERE MY ITERATION BUDGET WEARING A STABILITY VERDICT -- this tree's own
// most-named shape, twice in one round, in the function whose entire job is to report a boundary.
//
// ASKED PROPERLY THERE ARE TWO BOUNDARIES AND THEY ARE DIFFERENT QUANTITIES:
//
//   convergenceBoundary  bisects on "did the residual reach tol inside the budget". IT MOVES WITH THE
//                        BUDGET, MONOTONICALLY UPWARD -- budget-bound at 200, then 1.062103 / 1.191580 /
//                        1.282766 / 1.308179 at 400 / 1000 / 4000 / 16000. A stability boundary would not
//                        move with the iteration count, so THIS ONE IS A RATE READING AND A LOWER BOUND.
//   divergenceBoundary   bisects on whether the residual is FINITE AT ALL, which no tolerance enters.
//                        It converges from ABOVE -- 7.549724 / 1.659478 / 1.402834 / 1.376181 on the
//                        compliant fixture, and 1.862458 / 1.193320 / 1.193307 / 1.193261 on the rigid one,
//                        where it agrees to five decimals across a sixteenfold budget. AN UPPER BOUND.
//
// *** SO THE HONEST OUTPUT IS A BRACKET AND NOT A NUMBER: [1.308179, 1.376181] on the compliant fixture at a
// 16000-iteration budget, the two ends approaching from opposite sides. *** Either bisection alone would have
// been reported as "the jacobiScale boundary" and each is wrong in a direction its own construction fixes.
// 16-GPUCloth.py's 0.2 sits far below both, which is a statement about THIS cloth rather than a criticism of
// a value chosen for a different one. And the converged state depends on jacobiScale only in the direction
// finding 2 predicts: 8.528e-12 at 0.05 against 8.451e-12 at 0.4.
//
// WHAT IS NOT CLAIMED: clothLoop IS UNCHANGED. The Jacobi sweep here is an INSTRUMENT to compare against, not
// an alternative solver anybody should switch to, and nothing in this file is wired into the shipped path.
// No device, no baseline row, no promptCost change.
//
// ANTIDOTE (v3196's idiom): if somebody ever wires a Jacobi schedule into clothLoop for real, section 5 goes
// RED and must be rewritten to assert the MOMENTUM residual of the shipped path -- not weakened, not deleted.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { predictPass, solveColorPass } from "./clothLoop.js";

export const DT = 0.016;
export const GRAVITY = [0, -10, 0];

// The COMPLIANT fixture gives every constraint a positive compliance; the RIGID one is clothLoopKey's own
// shipped stiffness, where the structural constraints are hard. Both are exercised: they behave differently.
export const COMPLIANT = { structural: 0.001, shear: 0.001, bending: 0.01 };
export const RIGID = { structural: 0.0, shear: 0.001, bending: 0.01 };

/** A hanging cloth, top row pinned -- the same construction v3479's clothLoopKey uses. */
export function scene(W = 5, H = 5, stiff = COMPLIANT) {
    const { cons, adj } = buildClothConstraints(W, H, 0.3, stiff);
    const colors = colorConstraints(cons);
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        pos[3 * i] = x * 0.3; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * 0.3;
        invMass[i] = (y === 0) ? 0 : 1;
    }
    // freeDof is the count the under-determination claim rests on, DERIVED rather than typed.
    let free = 0; for (let a = 0; a < N; a++) if (invMass[a] > 0) free++;
    return { cons, adj, colors, W, H, freeDof: 3 * free, init: { pos, vel, invMass } };
}

/** The prediction the solve starts from -- gravity integrated, nothing relaxed. */
export function predicted(sc, gravity = GRAVITY) {
    const n = sc.init.pos.length;
    const buf = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel),
                  pred: new Float64Array(n), prev: new Float64Array(n) };
    predictPass(buf, sc.init.invMass, DT, gravity);
    return buf;
}

// ONE JACOBI SWEEP: every constraint is evaluated against the SAME snapshot and the corrections are summed and
// applied together, which is what makes it a different SCHEDULE rather than a different solver. `scale` is
// 16-GPUCloth.py's jacobiScale. Nothing here reads clothLoop's per-colour ordering.
export function jacobiPass(pred, invMass, cons, lam, dt, scale) {
    const dP = new Float64Array(pred.length);
    for (let j = 0; j < cons.length; j++) {
        const c = cons[j], w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
        if (wsum === 0) continue;
        const ax = 3 * c.i, bx = 3 * c.j;
        const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-12) continue;
        const C = len - c.rest, aTilde = c.compliance / (dt * dt);
        const dLambda = (-C - aTilde * lam[j]) / (wsum + aTilde);
        lam[j] += scale * dLambda;
        const s = scale * dLambda / len;
        dP[ax] += w1 * s * dx; dP[ax + 1] += w1 * s * dy; dP[ax + 2] += w1 * s * dz;
        dP[bx] -= w2 * s * dx; dP[bx + 1] -= w2 * s * dy; dP[bx + 2] -= w2 * s * dz;
    }
    for (let k = 0; k < pred.length; k++) pred[k] += dP[k];
}

/** Run one substep to `iters` under a named schedule. colourOrder lets the gate drive a SECOND colouring. */
export function runSchedule(sc, iters, mode, { scale = 0.2, colourOrder = null, gravity = GRAVITY } = {}) {
    const buf = predicted(sc, gravity);
    const lam = new Float64Array(sc.cons.length);
    const order = colourOrder || sc.colors.map((_, i) => i);
    for (let it = 0; it < iters; it++) {
        if (mode === "colour") for (const ci of order) solveColorPass(buf.pred, sc.init.invMass, sc.cons, sc.colors[ci], lam, DT, false);
        else jacobiPass(buf.pred, sc.init.invMass, sc.cons, lam, DT, scale);
    }
    return { pred: Float64Array.from(buf.pred), lam, xPred: Float64Array.from(predicted(sc, gravity).pred) };
}

/** THE CHECK EVERYBODY WRITES: worst |C_j + aTilde_j lambda_j|. 102 equations in 162 unknowns. */
export function constraintResidual(pred, cons, lam, dt = DT) {
    let m = 0;
    for (let j = 0; j < cons.length; j++) {
        const c = cons[j], ax = 3 * c.i, bx = 3 * c.j;
        const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        m = Math.max(m, Math.abs((len - c.rest) + (c.compliance / (dt * dt)) * lam[j]));
    }
    return m;
}

/** THE HALF THAT PINS THE ANSWER: worst |x - xPred - M^-1 sum_j gradC_j(x) lambda_j|. */
export function momentumResidual(pred, xPred, invMass, cons, lam) {
    const acc = new Float64Array(pred.length);
    for (let j = 0; j < cons.length; j++) {
        const c = cons[j], ax = 3 * c.i, bx = 3 * c.j;
        const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-12) continue;
        const nx = dx / len, ny = dy / len, nz = dz / len, L = lam[j], wi = invMass[c.i], wj = invMass[c.j];
        acc[ax] += wi * L * nx; acc[ax + 1] += wi * L * ny; acc[ax + 2] += wi * L * nz;
        acc[bx] -= wj * L * nx; acc[bx + 1] -= wj * L * ny; acc[bx + 2] -= wj * L * nz;
    }
    let m = 0;
    for (let k = 0; k < pred.length; k++) m = Math.max(m, Math.abs(pred[k] - xPred[k] - acc[k]));
    return m;
}

export const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

/** Both schedules to convergence, with BOTH residuals and the gap. The comparison the key actually needs. */
export function scheduleGap(sc, iters = 4000, { scale = 0.2, gravity = GRAVITY } = {}) {
    const c = runSchedule(sc, iters, "colour", { gravity });
    const j = runSchedule(sc, iters, "jacobi", { scale, gravity });
    const im = sc.init.invMass;
    let moved = 0;
    for (let i = 0; i < c.pred.length; i++) moved = Math.max(moved, Math.abs(c.pred[i] - sc.init.pos[i]));
    return {
        moved,
        constraintColour: constraintResidual(c.pred, sc.cons, c.lam),
        constraintJacobi: constraintResidual(j.pred, sc.cons, j.lam),
        crossPair: constraintResidual(c.pred, sc.cons, j.lam),   // x_colour graded against lambda_jacobi
        momentumColour: momentumResidual(c.pred, c.xPred, im, sc.cons, c.lam),
        momentumJacobi: momentumResidual(j.pred, j.xPred, im, sc.cons, j.lam),
        posGap: maxDiff(c.pred, j.pred),
        lamGap: maxDiff(c.lam, j.lam),
    };
}

/** Two COLOURINGS against each other -- the comparison the two-way framing of the key cannot make. */
export function colourOrderGap(sc, iters = 4000) {
    const fwd = sc.colors.map((_, i) => i), rev = [...fwd].reverse();
    const a = runSchedule(sc, iters, "colour", { colourOrder: fwd });
    const b = runSchedule(sc, iters, "colour", { colourOrder: rev });
    return { posGap: maxDiff(a.pred, b.pred),
             residualFwd: constraintResidual(a.pred, sc.cons, a.lam),
             residualRev: constraintResidual(b.pred, sc.cons, b.lam) };
}

/** The gap against how far the cloth moved. Round-off would give 1; this gives 4. */
export function gapExponent(sc, gs = [-1, -2, -5, -10, -20, -50, -100], iters = 4000) {
    const rows = [];
    let pm = null, pg = null;
    for (const gy of gs) {
        const r = scheduleGap(sc, iters, { gravity: [0, gy, 0] });
        const e = pm ? Math.log(r.posGap / pg) / Math.log(r.moved / pm) : null;
        rows.push({ g: gy, moved: r.moved, gap: r.posGap, exponent: e });
        pm = r.moved; pg = r.posGap;
    }
    return rows;
}

// A LOWER BOUND, AND IT IS NAMED FOR WHAT IT MEASURES. THE BUDGET IS A PARAMETER AND NOT A CONSTANT, BECAUSE
// THE FIRST VERSION OF THIS FUNCTION RETURNED MY OWN ITERATION BUDGET WEARING A STABILITY VERDICT. A caller
// that cannot reach `tol` inside `iters` gets `budgetBound: true` rather than a boundary, so "slow" can never
// be read as "unstable" -- and the returned number MOVES with `iters`, which is the evidence that it is a rate.
export function convergenceBoundary(sc, { iters = 4000, tol = 1e-9, lo = 0.05, hi = 4.0, steps = 34 } = {}) {
    const converges = (s) => {
        const r = runSchedule(sc, iters, "jacobi", { scale: s });
        const res = constraintResidual(r.pred, sc.cons, r.lam);
        return Number.isFinite(res) && res < tol;
    };
    if (!converges(lo)) return { budgetBound: true, lo, iters, tol, boundary: null };
    let a = lo, b = hi;
    for (let k = 0; k < steps; k++) { const m = (a + b) / 2; if (converges(m)) a = m; else b = m; }
    return { budgetBound: false, boundary: a, iters, tol };
}

// AN UPPER BOUND, AND NO TOLERANCE ENTERS IT. Bisecting on whether the residual is FINITE AT ALL asks a
// question a budget cannot answer wrongly in the same direction: a slow run is finite, so it counts as
// stable here, and only a genuinely divergent one overflows. It approaches the true boundary FROM ABOVE
// because a slowly diverging run needs enough iterations to reach infinity.
export function divergenceBoundary(sc, { iters = 4000, lo = 0.05, hi = 8.0, steps = 30 } = {}) {
    const finite = (s) => {
        const r = runSchedule(sc, iters, "jacobi", { scale: s });
        return Number.isFinite(constraintResidual(r.pred, sc.cons, r.lam));
    };
    if (!finite(lo)) return { boundary: null, iters };
    let a = lo, b = hi;
    for (let k = 0; k < steps; k++) { const m = (a + b) / 2; if (finite(m)) a = m; else b = m; }
    return { boundary: a, iters };
}

/** The two bisections together. Neither is the boundary; the pair brackets it from opposite sides. */
export function relaxationBracket(sc, opts = {}) {
    const lower = convergenceBoundary(sc, opts), upper = divergenceBoundary(sc, opts);
    return { lower: lower.budgetBound ? null : lower.boundary, upper: upper.boundary,
             budgetBound: lower.budgetBound, iters: opts.iters ?? 4000 };
}

/** Residual against iteration count -- the reading that tells a slow schedule from a divergent one. */
export function convergenceTrace(sc, mode, its = [400, 2000, 10000], scale = 0.2) {
    return its.map((it) => {
        const r = runSchedule(sc, it, mode, { scale });
        return { iters: it, residual: constraintResidual(r.pred, sc.cons, r.lam) };
    });
}

export const MEASURED_V3600 = {
    source: "matthias-research/16-GPUCloth.py (MIT, NVIDIA 2022) -- colouring vs Jacobi at jacobiScale 0.2",
    fixture: "5x5 hanging cloth, top row pinned, 102 constraints, 60 free position components",
    // FINDING 1
    constraintResidualBothSchedules: 1.110e-16,
    positionGapAtConvergence: 8.496e-12,
    lambdaGapAtConvergence: 1.588e-12,
    crossPairResidual: 6.895e-12,
    momentumResidualColour: 1.602e-11,
    momentumResidualJacobi: 4.962e-12,
    underDetermined: "102 equations in 162 unknowns -- the constraint residual cannot pin a point",
    // FINDING 2
    gapExponentAgainstDisplacement: 4.0,
    exponentRuns: [3.298, 4.041, 3.999, 4.000, 3.999, 3.994],
    exponentSecondFixture: [4.001, 4.000, 3.999],
    roundOffWouldBe: 1,
    // FINDING 3
    colourOrderGap: 1.708e-11,
    colourOrderGapExceedsSchedule: true,
    // FINDING 4
    convergenceBoundaryByBudget: { 200: null, 400: 1.062103, 1000: 1.191580, 4000: 1.282766, 16000: 1.308179 },
    divergenceBoundaryByBudgetCompliant: { 200: 7.549724, 1000: 1.659478, 4000: 1.402834, 16000: 1.376181 },
    divergenceBoundaryByBudgetRigid: { 200: 1.862458, 1000: 1.193320, 4000: 1.193307, 16000: 1.193261 },
    bracketAt16000Compliant: [1.308179, 1.376181],
    shippedJacobiScale: 0.2,
    // THE CORRECTION
    myOwnDefect: "THE FIRST BISECTION REPORTED A TIMEOUT AS A FAILURE, TWICE. The rigid fixture was called " +
                 "unstable at jacobiScale 0.05; it is SLOW -- residual 1.436e-8 at 400 iterations and " +
                 "2.165e-15 at 2000, against colouring's 3.331e-16 at 400. The same bisection then reported " +
                 "divergence at 1.2, and 1.2 converges given 4000 iterations. BOTH NUMBERS WERE MY ITERATION " +
                 "BUDGET WEARING A STABILITY VERDICT. The convergence bisection is now NAMED as a rate and " +
                 "reports budgetBound; a second bisection on FINITENESS supplies the upper bound.",
    whatThisIsNot: "NOT a port and NOT a claim about matthias-research's code. clothLoop IS UNCHANGED -- the " +
                   "Jacobi sweep is an instrument to compare against, not a solver to switch to. No device, " +
                   "no baseline row, no promptCost change.",
};

export function reportLines() {
    const L = [];
    const sc = scene(5, 5, COMPLIANT), rg = scene(5, 5, RIGID);
    L.push("[scheduleKey] Does the converged cloth depend on the parallel schedule?");
    L.push("");
    L.push("  fixture: " + sc.W + "x" + sc.H + " hanging cloth, " + sc.cons.length + " constraints, " +
           sc.colors.length + " colours, " + sc.freeDof + " free position components");
    L.push("  the constraint residual is therefore " + sc.cons.length + " equations in " +
           (sc.freeDof + sc.cons.length) + " unknowns -- IT CANNOT PIN A POINT");
    L.push("");
    const g = scheduleGap(sc);
    L.push("1. BOTH SCHEDULES AT CONVERGENCE (compliant fixture, 4000 iterations)");
    L.push("     constraint residual   colour " + g.constraintColour.toExponential(3) +
           "   jacobi " + g.constraintJacobi.toExponential(3) + "   <- the check everybody writes");
    L.push("     momentum residual     colour " + g.momentumColour.toExponential(3) +
           "   jacobi " + g.momentumJacobi.toExponential(3) + "   <- the half that pins the answer");
    L.push("     |x_colour - x_jacobi| " + g.posGap.toExponential(3) +
           "        |lambda gap| " + g.lamGap.toExponential(3));
    L.push("     x_colour graded against lambda_jacobi: " + g.crossPair.toExponential(3) +
           "  -- THE PAIR SATISFIES IT, NOT THE POSITION");
    L.push("");
    const co = colourOrderGap(sc);
    L.push("2. AND COLOURING IS NOT ONE SCHEDULE");
    L.push("     forward vs reversed colour order: " + co.posGap.toExponential(3) +
           "   against colour-vs-jacobi " + g.posGap.toExponential(3));
    L.push("     " + (co.posGap > g.posGap
        ? "*** THE SPREAD WITHIN COLOURING EXCEEDS ITS DISTANCE TO JACOBI -- colouring is not a reference ***"
        : "the spread within colouring is smaller than its distance to jacobi"));
    L.push("");
    L.push("3. THE GAP IS STRUCTURAL: round-off scales as displacement^1, this scales as ^4");
    L.push("     gravity   moved         gap           local exponent");
    for (const r of gapExponent(sc)) {
        L.push("     " + String(r.g).padStart(5) + "     " + r.moved.toExponential(3) + "     " +
               r.gap.toExponential(3) + "     " + (r.exponent === null ? "--" : r.exponent.toFixed(3)));
    }
    L.push("");
    L.push("4. THE jacobiScale BOUNDARY IS TWO QUANTITIES, AND EACH ALONE IS WRONG IN A KNOWN DIRECTION");
    L.push("     budget   convergence (a RATE, lower bound)   divergence (finiteness, upper bound)");
    for (const it of [400, 1000, 4000]) {
        const br = relaxationBracket(sc, { iters: it });
        L.push("     " + String(it).padStart(6) + "   " +
               (br.budgetBound ? "BUDGET-BOUND" : br.lower.toFixed(6)).padEnd(35) + br.upper.toFixed(6));
    }
    L.push("     A STABILITY BOUNDARY WOULD NOT MOVE WITH THE BUDGET. The pair BRACKETS it; neither IS it.");
    L.push("     16-GPUCloth.py ships jacobiScale 0.2, far below both ends on this cloth.");
    L.push("");
    L.push("5. SLOW IS NOT DIVERGENT -- rigid fixture (structural compliance 0), residual against iterations");
    for (const t of convergenceTrace(rg, "jacobi")) L.push("       jacobi it=" + String(t.iters).padStart(5) + "  " + t.residual.toExponential(3));
    for (const t of convergenceTrace(rg, "colour", [400])) L.push("       colour it=" + String(t.iters).padStart(5) + "  " + t.residual.toExponential(3));
    L.push("");
    L.push("  " + MEASURED_V3600.whatThisIsNot);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
