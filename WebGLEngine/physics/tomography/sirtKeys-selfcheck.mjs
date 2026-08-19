// physics/tomography/sirtKeys-selfcheck.mjs -- v3846
//
// TIER-2 GRADING FOR THE SIRT / LANDWEBER PAIR, AGAINST GENUINE EXTERNAL KEYS -- values from OUTSIDE the
// engine's own machinery, so agreement is evidence and not a mirror. This is the shape v3842 used on the SPH
// stability pair: the gate is a PURE CONSUMER, no shipped module changed to make it pass.
//
// *** WHY THIS DEVICE NEEDED EXTERNAL KEYS MORE THAN MOST: EVERY CLAIM IT HAD WAS SELF-REFERENTIAL. *** sirt's
// own gate checked that one step equals step * B b (an identity between two spellings of the same code), that
// the residual falls (measured by the same residual() the iteration drives), and that the reconstruction
// correlates with the truth it was built from. NONE OF THOSE CAN SEE A WRONG OPERATOR -- and v3615 found one
// that had been there since v3613. The three keys below all come from outside the tree.
//
//   A. THE ADJOINT IS A DEFINITION, NOT AN OPINION. <A x, y> = <x, A^T y> for ALL x and y is what "transpose"
//      MEANS. It needs no tolerance argument and no reference implementation -- two inner products either
//      agree or the operator is not the adjoint. This is what v3615 used to overturn a shipped claim, and it
//      is the reason the split in v3846 is a fact rather than a preference.
//
//   B. LANDWEBER'S STEP BOUND IS A CLOSED FORM. The classical convergence theorem says the iteration
//      x <- x + lambda A^T (b - A x) converges iff 0 < lambda < 2 / sigma_max(A)^2, with sigma_max(A)^2 =
//      lambda_max(A^T A). *** THIS IS AN EXACT BOUNDARY, THE SAME SHAPE AS THE VON NEUMANN CFL LIMIT v3842
//      GRADED cfl.js AGAINST. *** Below it the residual is monotone; above it the iteration diverges. The key
//      is the bound, not the solver, and powerStep is graded for sitting inside it BY A DERIVED MARGIN.
//
//   C. STATIONARITY OF THE NORMAL EQUATIONS. A minimiser of ||A x - b||^2 has gradient -2 A^T (b - A x) = 0.
//      That is calculus, not tomography. So the gradient norm must COLLAPSE relative to its value at x = 0 --
//      and the theorem only applies when the operator IS the adjoint, which is exactly why the shipped pair
//      has no stationarity claim available to it at all.
//
// One-core sandbox: every number here is a ratio, a defect or a monotonicity verdict, never a millisecond.
// RUNTIME 1.6 s MEASURED with time(1) around the run, against verify.mjs's 180 s per-gate budget. It is cheap
// because N = 32 is enough: these are IDENTITIES AND BOUNDARIES, and neither needs a big grid to be decisive.
"use strict";
import { radon, angleSet, phantomField, backProject } from "./ct.js";
import { landweber, matchedBackProject, powerStep } from "./reconOps.mjs";
import { sirtDescent, MEASURED_V3846 } from "./sirt.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const say = (m) => console.log("  " + m);

const N = 32, nDet = 32, na = 16, angles = angleSet(na);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296 - 0.5);
const dotImg = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i] * b[i]; return t; };
const dotSino = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) for (let d = 0; d < nDet; d++) t += a[i][d] * b[i][d]; return t; };

console.log("== KEY A: the adjoint is a DEFINITION -- <Ax,y> == <x,By> for all x,y ==");
{
    const defectOf = (B) => {
        let worst = 0, scale = 0;
        for (let t = 0; t < 5; t++) {
            const x = new Float64Array(N * N).map(rnd);
            const y = Array.from({ length: na }, () => new Float64Array(nDet).map(rnd));
            const lhs = dotSino(radon(x, N, angles, nDet), y);
            const rhs = dotImg(x, B(y, N, angles, nDet));
            worst = Math.max(worst, Math.abs(lhs - rhs));
            scale = Math.max(scale, Math.abs(lhs));
        }
        return { worst, scale };
    };
    const shipped = defectOf(backProject), matched = defectOf(matchedBackProject);
    say(`shipped backProject   defect ${shipped.worst.toExponential(4)}  against inner products of size ${shipped.scale.toExponential(3)}`);
    say(`matchedBackProject    defect ${matched.worst.toExponential(4)}  against inner products of size ${matched.scale.toExponential(3)}`);

    ok(matched.worst < 1e-10 * matched.scale,
        `matchedBackProject IS the adjoint to machine precision (${matched.worst.toExponential(3)})`);
    ok(shipped.worst > 0.5 * shipped.scale,
        `*** backProject IS NOT THE ADJOINT, AND THE DEFECT IS THE SIZE OF THE ANSWER: ${shipped.worst.toExponential(4)} ` +
        `against an inner product of ${shipped.scale.toExponential(3)}. This is not a scaling slip -- radon GATHERS by ` +
        `sampling and backProject SPLATS with rounding, the classic unmatched pair, STRUCTURAL rather than a bug ***`);
    ok(shipped.worst / matched.worst > 1e12,
        `and the two are separated by ${(shipped.worst / matched.worst).toExponential(1)} -- no tolerance choice ` +
        "could put these on the same side of a line");
}

console.log("\n== KEY B: Landweber's step bound 0 < lambda < 2/sigma_max^2 is a CLOSED FORM ==");
{
    // sigma_max(A)^2 = lambda_max(A^T A), estimated with the MATCHED operator -- the only one for which
    // "A^T A" names the matrix the theorem is about.
    const lamMax = powerStep((r) => matchedBackProject(r, N, angles, nDet), N, angles, nDet).lambdaMax;
    const bound = 2 / lamMax;
    const derived = powerStep((r) => matchedBackProject(r, N, angles, nDet), N, angles, nDet).step;
    const truth = phantomField(N, [{ cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1, phi: 0 }]);
    const b = radon(truth, N, angles, nDet);
    const runAt = (lambda) => {
        const r = landweber(b, N, angles, nDet, { iters: 400, step: lambda, every: 100,
                                                  adjoint: (rr) => matchedBackProject(rr, N, angles, nDet) });
        const h = r.history.map((e) => e.residual);
        return { residual: r.residual, monotone: h.every((v, i) => i === 0 || v <= h[i - 1]) };
    };
    say(`lambda_max(A^T A) = ${lamMax.toExponential(6)}   theorem bound 2/lambda_max = ${bound.toExponential(6)}`);

    // B1. THE BOUNDARY IS WHERE THE THEOREM SAYS, AND IT IS SHARP TO ONE PERCENT EITHER SIDE.
    const inside = runAt(0.99 * bound), outside = runAt(1.01 * bound);
    say(`lambda = 0.99 x bound -> residual ${inside.residual.toExponential(3)}, monotone ${inside.monotone}`);
    say(`lambda = 1.01 x bound -> residual ${outside.residual.toExponential(3)}, monotone ${outside.monotone}`);
    ok(inside.monotone && inside.residual < 1,
        `just INSIDE the bound the residual is monotone and small (${inside.residual.toExponential(3)})`);
    ok(!outside.monotone && outside.residual > 1e3,
        `*** and just OUTSIDE it the iteration DIVERGES to ${outside.residual.toExponential(3)} -- the boundary ` +
        "is sharp to one percent either side, which is what makes it a KEY and not a guideline ***");

    for (const f of [0.25, 0.5, 0.9]) {
        const r = runAt(f * bound);
        ok(r.monotone, `lambda = ${f} x bound converges monotonically (residual ${r.residual.toExponential(3)})`);
    }
    for (const f of [1.1, 1.5]) {
        const r = runAt(f * bound);
        ok(!Number.isFinite(r.residual) || r.residual > 1e6,
            `lambda = ${f} x bound diverges (residual ${r.residual.toExponential(3)})`);
    }

    // B2. *** THE SHIPPED powerStep IS GRADED AGAINST THE BOUND IT WAS NEVER TOLD. *** It solves for 1/lambda_max
    //     by power iteration and knows nothing about the factor of 2; that it lands at exactly half the
    //     theorem's ceiling is the theorem agreeing with the code, not the code quoting the theorem.
    ok(derived > 0 && derived < bound,
        `powerStep's DERIVED step ${derived.toExponential(6)} sits inside the bound`);
    ok(Math.abs(derived / bound - 0.5) < 1e-9,
        `*** and it lands at EXACTLY half the ceiling (${(derived / bound).toFixed(10)}) -- powerStep computes ` +
        "1/lambda_max and is never told the theorem's factor of 2, so this is the closed form agreeing with the " +
        "code rather than the code restating the closed form ***");
}

console.log("\n== KEY C: stationarity of the normal equations -- grad ||Ax-b||^2 = -2 A^T(b-Ax) -> 0 ==");
{
    const truth = phantomField(N, [{ cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1, phi: 0 }]);
    const b = radon(truth, N, angles, nDet);
    const gradNorm = (x) => {
        const ax = radon(x, N, angles, nDet);
        const res = ax.map((p, i) => { const q = new Float64Array(nDet); for (let d = 0; d < nDet; d++) q[d] = b[i][d] - p[d]; return q; });
        const g = matchedBackProject(res, N, angles, nDet);
        let n = 0; for (const v of g) n += v * v;
        return Math.sqrt(n);
    };
    const g0 = gradNorm(new Float64Array(N * N));
    const r = sirtDescent(b, N, angles, nDet, { iters: 6000 });
    const gEnd = gradNorm(r.x);
    say(`||A^T(b-Ax)||  at x=0: ${g0.toExponential(4)}   after 6000 matched iterations: ${gEnd.toExponential(4)}`);
    ok(gEnd < g0 / 1e4,
        `*** the gradient of the objective COLLAPSES by ${(g0 / gEnd).toExponential(2)} -- the iteration is ` +
        "approaching a stationary point of ||Ax-b||^2, which is the thing it claims to be doing. THE THEOREM " +
        "ONLY APPLIES WHEN B IS THE ADJOINT: the shipped pair has no stationarity claim available to it at all ***");
    ok(r.residual < 1e-1, `and the residual is down to ${r.residual.toExponential(3)} on a consistent system`);
}

console.log("\n== THE CROSSOVER IS A MEASUREMENT, NOT A KEY, AND IS REPORTED AS ONE ==");
{
    const c = MEASURED_V3846.crossover;
    for (const k of [12, 30, 120]) {
        say(`${String(k).padStart(3)} views   fbp ${c[k].fbp.toFixed(6)}   shipped@300 ${c[k].shipped300.toFixed(6)}   ` +
            `matched(converged) ${c[k].matchedConverged.toFixed(6)}   -> ${c[k].winner.toUpperCase()}`);
    }
    ok(c[12].winner === "shipped" && c[120].winner === "matched",
        "the operators cross over with angle count, which is why v3846 split the default by question rather " +
        "than moving it");
    ok((MEASURED_V3846.creditWhereItIsDue || "").includes("v3617"),
        "and the record credits ct.html, which found this at v3617 -- the crossover is NOT v3846's discovery");
    say("*** NOT THIS ROUND'S FINDING: ct.html has recorded the flip since v3617. What v3846 adds is that the");
    say("    sparse-side gap SATURATES rather than being a budget artefact, and that the fact never left the page.");
    say("*** NO KEY IS CLAIMED FOR THIS. Which reconstruction looks right is not a number this sandbox can");
    say("    settle -- the keys above grade the OBJECTIVE, and the objective is provably not the picture (v3612). ***");
}

console.log("\nWHAT THIS DOES NOT CLAIM: that sirt.mjs reconstructs well. Keys A-C grade the ITERATION as an");
console.log("optimiser -- whether its operator is the adjoint, whether its step is inside the convergence");
console.log("bound, whether it approaches a stationary point. The quality of the PICTURE is FINDING 1's");
console.log("business and is graded against FBP in sirt-selfcheck, not here.");

if (fail) { console.error(`\nsirtKeys-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`\nsirtKeys-selfcheck: all ${pass} pass. The adjoint identity, Landweber's closed-form step bound and`);
console.log("the stationarity of the normal equations -- three keys, all from outside this tree.");
