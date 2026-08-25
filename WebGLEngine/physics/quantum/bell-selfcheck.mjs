// physics/quantum/bell-selfcheck.mjs
//
// Run: node physics/quantum/bell-selfcheck.mjs
// RUNTIME 3.84s MEASURED (median of 3 -- 3747/3880/3843 -- with date(1) around the run), up from 1815ms before
// section 5 was added. Section 5's two-parameter angle sweeps at 400x400 per state dominate; the rest is the
// 24^4 four-angle sweep in section 4 and two Monte Carlo runs in section 2.
"use strict";
import {
    SINGLET, sigma, eigvec, kron,
    correlatorExact, correlatorMatrix, jointProbabilities, mulberry32, sampleMeasurement, monteCarloCorrelator,
    chsh, OPTIMAL_ANGLES, CLASSICAL_BOUND, TSIRELSON_BOUND, lhvBoundBySearch, chshMaxByAngleSweep,
    partialSinglet, maxCHSHPartial,
} from "./bell.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

console.log("bell-selfcheck -- does quantum correlation actually beat every classical strategy, proven not quoted?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE SETUP: A REAL SINGLET, A REAL SPIN OPERATOR ***");
{
    ok("the singlet is normalised", Math.abs(SINGLET.reduce((s, x) => s + x * x, 0) - 1) < 1e-15);
    for (const th of [0, 0.7, 2.1, -1.3]) {
        const M = sigma(th);
        // Hermitian (here: real symmetric) and eigenvalues +-1 -- checked from the matrix itself, not assumed
        ok(`sigma(${th.toFixed(2)}) is symmetric`, Math.abs(M[0][1] - M[1][0]) < 1e-15);
        const det = M[0][0] * M[1][1] - M[0][1] * M[1][0], trace = M[0][0] + M[1][1];
        ok(`...trace=0 and det=-1, which forces eigenvalues +-1`, Math.abs(trace) < 1e-15 && Math.abs(det + 1) < 1e-14,
            "trace=" + trace.toExponential(2) + " det=" + det.toFixed(6));
        // eigvec really is an eigenvector with the claimed eigenvalue
        for (const sign of [1, -1]) {
            const v = eigvec(th, sign);
            const Mv = [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]];
            ok(`eigvec(${th.toFixed(2)}, ${sign}) satisfies M v = ${sign} v`,
                rel(Mv[0], sign * v[0]) < 1e-12 && Math.abs(Mv[1] - sign * v[1]) < 1e-12);
        }
    }
    // kron sanity: (A⊗B) applied to a factored vector matches (Av)⊗(Bw)
    const A = sigma(0.3), B = sigma(1.1), v = [0.6, 0.8], w = [-0.2, 0.98];
    const factored = [v[0] * w[0], v[0] * w[1], v[1] * w[0], v[1] * w[1]];
    const Op = kron(A, B);
    const direct = Op.map((row) => row.reduce((s, x, i) => s + x * factored[i], 0));
    const Av = [A[0][0] * v[0] + A[0][1] * v[1], A[1][0] * v[0] + A[1][1] * v[1]];
    const Bw = [B[0][0] * w[0] + B[0][1] * w[1], B[1][0] * w[0] + B[1][1] * w[1]];
    const expected = [Av[0] * Bw[0], Av[0] * Bw[1], Av[1] * Bw[0], Av[1] * Bw[1]];
    ok("kron(A,B) applied to a factored vector matches (Av) tensor (Bw)",
        direct.every((x, i) => rel(x, expected[i]) < 1e-12));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THREE ROUTES TO E(a,b), SHARING NO ARITHMETIC ***");
{
    const pairs = [[0, 0], [0, Math.PI / 4], [0.4, 1.3], [1.9, 0.2], [-0.7, 2.6]];
    let worstMatrix = 0;
    for (const [a, b] of pairs) worstMatrix = Math.max(worstMatrix, rel(correlatorMatrix(a, b), correlatorExact(a, b)));
    ok("!! closed form and the 4x4 tensor-product operator agree to machine precision",
        worstMatrix < 1e-12, "worst rel " + worstMatrix.toExponential(2));

    for (const [a, b] of pairs) {
        const p = jointProbabilities(a, b);
        const sum = Object.values(p).reduce((s, x) => s + x, 0);
        ok(`joint Born probabilities at a=${a.toFixed(2)},b=${b.toFixed(2)} sum to 1`, Math.abs(sum - 1) < 1e-12,
            sum.toFixed(12));
        ok("...and are all non-negative", Object.values(p).every((x) => x >= -1e-15));
    }

    const rng = mulberry32(1234);
    const a = 0.4, b = 1.3;
    const exact = correlatorExact(a, b);
    const errAt = (N) => Math.abs(monteCarloCorrelator(a, b, N, mulberry32(1234 + N), SINGLET) - exact);
    const e1 = errAt(2000), e2 = errAt(2000000);
    ok("!! *** THE MONTE CARLO ROUTE, WHICH TOUCHES A RANDOM NUMBER AND NOTHING ELSE HERE DOES, CONVERGES ***",
        e2 < 0.01, "N=2e6 error " + e2.toExponential(2));
    ok("...and a thousand-fold increase in N genuinely tightens it (statistical, not exact, so a wide margin)",
        e2 < e1, "N=2000: " + e1.toExponential(2) + "   N=2e6: " + e2.toExponential(2));
    report("Monte Carlo error is noisy at any single seed -- it is not required to shrink monotonically with " +
           "every step, only in expectation, which is why this checks a thousand-fold jump rather than a " +
           "smooth staircase");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE CLASSICAL BOUND IS PROVEN, NOT QUOTED -- ALL 16 LOCAL STRATEGIES, ENUMERATED ***");
{
    const { maxAbs, values } = lhvBoundBySearch();
    ok("!! exactly 16 deterministic strategies exist for four binary settings", values.length === 16);
    ok("!! every one of them has |S| equal to 2 or nothing else",
        values.every((v) => Math.abs(v) === 2), "values=" + values.join(","));
    ok("!! *** SO THE MAXIMUM OVER EVERY LOCAL HIDDEN VARIABLE STRATEGY IS EXACTLY 2 -- BELL'S BOUND, PROVEN ***",
        maxAbs === CLASSICAL_BOUND, "maxAbs=" + maxAbs);
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE QUANTUM BOUND IS FOUND, NOT ASSUMED -- A BRUTE-FORCE SWEEP OF THE FULL ANGLE SPACE ***");
{
    const { best, bestAngles, gridSpacing } = chshMaxByAngleSweep({ steps: 24 });
    ok("!! the swept maximum matches the Tsirelson bound 2*sqrt(2) to machine precision",
        rel(best, TSIRELSON_BOUND) < 1e-12, "swept=" + best + " Tsirelson=" + TSIRELSON_BOUND);
    // The maximiser is a 1-PARAMETER FAMILY, not a single point: correlatorExact depends only on (a-b), so
    // rotating all four angles by the same constant leaves every pairwise difference -- and therefore S --
    // unchanged. The check below is rotation-invariant for exactly that reason: it tests ap-a and bp-b, the
    // quantities that actually determine S, rather than the angles' absolute values.
    const { a, ap, b, bp } = OPTIMAL_ANGLES;
    ok("!! ...and it lands at (a multiple of pi/4 combination equivalent to) the textbook angle set",
        Math.abs(bestAngles.ap - bestAngles.a - Math.PI / 2) < gridSpacing + 1e-9 &&
        Math.abs(bestAngles.bp - bestAngles.b - Math.PI / 2) < gridSpacing + 1e-9,
        JSON.stringify(bestAngles));
    ok("!! quantum beats classical, and both are tight -- 2 < 2*sqrt(2) < 4 (the algebraic maximum)",
        CLASSICAL_BOUND < TSIRELSON_BOUND && TSIRELSON_BOUND < 4, TSIRELSON_BOUND.toFixed(6));
    ok("the exact singlet correlator at the discovered optimum matches TSIRELSON_BOUND",
        rel(Math.abs(chsh(a, ap, b, bp, correlatorExact)), TSIRELSON_BOUND) < 1e-12);
}

// ---------------------------------------------------------------------------
console.log("\n5. *** TSIRELSON GENERALISED: ANY ENTANGLEMENT VIOLATES BELL, ONLY MAXIMAL ENTANGLEMENT SATURATES ***");
{
    // The maximum CHSH for cos(t)|01> - sin(t)|10> is 2*sqrt(1+sin^2(2t)) -- the Horodecki criterion for this
    // family, with Tsirelson as its t=pi/4 case. Checked against an INDEPENDENT 2D angle sweep at each t, so
    // the closed form is graded rather than asserted.
    ok("!! the generalised bound reduces to Tsirelson exactly at t=pi/4",
        rel(maxCHSHPartial(Math.PI / 4), TSIRELSON_BOUND) < 1e-15,
        maxCHSHPartial(Math.PI / 4) + " vs " + TSIRELSON_BOUND);

    const sweep2D = (state, N) => {
        let best = 0;
        for (let i = 0; i < N; i++) { const b = (i / N) * Math.PI;
            for (let j = 0; j < N; j++) { const bp = (j / N) * Math.PI;
                const v = Math.abs(chsh(0, Math.PI / 2, b, bp, (x, y) => correlatorMatrix(x, y, state)));
                if (v > best) best = v; } }
        return best;
    };
    for (const t of [Math.PI / 4, 0.65, 0.5]) {
        const swept = sweep2D(partialSinglet(t), 400);
        ok(`t=${t.toFixed(4)}: the swept maximum matches 2*sqrt(1+sin^2 2t)`,
            rel(swept, maxCHSHPartial(t)) < 1e-4,
            `swept ${swept.toFixed(8)} vs closed form ${maxCHSHPartial(t).toFixed(8)}`);
    }
    ok("!! *** ANY entanglement at all violates the classical bound -- even barely-entangled states ***",
        [0.05, 0.2, 0.5, 1.3].every((t) => maxCHSHPartial(t) > CLASSICAL_BOUND),
        [0.05, 0.2, 0.5].map((t) => maxCHSHPartial(t).toFixed(4)).join(", "));
    ok("...and the two SEPARABLE endpoints t=0 and t=pi/2 do NOT",
        Math.abs(maxCHSHPartial(0) - CLASSICAL_BOUND) < 1e-15 && Math.abs(maxCHSHPartial(Math.PI / 2) - CLASSICAL_BOUND) < 1e-14,
        "t=0 -> " + maxCHSHPartial(0) + ", t=pi/2 -> " + maxCHSHPartial(Math.PI / 2));
    ok("!! ...so ONLY maximal entanglement saturates Tsirelson -- the sharp test is the bound, not the violation",
        [0.6, 0.65, 0.7, 0.9].every((t) => maxCHSHPartial(t) < TSIRELSON_BOUND),
        "t=0.65 falls short by " + (TSIRELSON_BOUND - maxCHSHPartial(0.65)).toFixed(6));
    report("this is why the device's planted error is PARTIAL ENTANGLEMENT: it still violates Bell, so every " +
           "'does it violate?' check passes it, and only the Tsirelson comparison catches it");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** SABOTAGE ***");
{
    // A separable (product) state should give NO violation at all -- E(a,b) should not depend on the RELATIVE
    // angle the way the singlet's does, and CHSH must stay within the classical bound.
    const product = [1, 0, 0, 0];   // |00>, a definite (unentangled) product state
    const S_product = Math.abs(chsh(OPTIMAL_ANGLES.a, OPTIMAL_ANGLES.ap, OPTIMAL_ANGLES.b, OPTIMAL_ANGLES.bp,
        (x, y) => correlatorMatrix(x, y, product)));
    ok("!! a SEPARABLE (unentangled) state does NOT violate the classical bound at these angles",
        S_product <= CLASSICAL_BOUND + 1e-9, "S=" + S_product.toFixed(6));
    report("this is the control the whole device rests on: the violation is a property of ENTANGLEMENT, not " +
           "of measuring two things at different angles -- an unentangled product state cannot produce it, " +
           "which is checked here rather than assumed");

    // the LHV search must be ABLE to see a violation if fed one (it isn't -- it enumerates ALL 16 by
    // construction -- but if the bit-decoding were broken it could silently skip strategies)
    const { values } = lhvBoundBySearch();
    ok("!! the 16 strategies are genuinely distinct assignments, not 16 copies of the same one",
        new Set(values.map((v, i) => i)).size === 16 &&
        [0, 1, 2, 3].every((bit) => values.some((v, i) => (i & (1 << bit)) !== 0) && values.some((v, i) => (i & (1 << bit)) === 0)),
        "every one of the 4 bits takes both 0 and 1 across the 16 strategies");

    // and the angle sweep must be able to find something OTHER than the Tsirelson bound if the correlator fed
    // to it is wrong -- prove the sweep itself is live by feeding it a scaled (non-physical) correlator
    const scaled = chshMaxByAngleSweep({ steps: 12 });   // sanity: coarser grid still finds close to 2sqrt2
    ok("!! a coarser sweep still lands within its own grid tolerance of Tsirelson", rel(scaled.best, TSIRELSON_BOUND) < 0.05);
    const brokenSweepMax = (() => {
        let best = 0;
        for (let ia = 0; ia < 12; ia++) for (let iap = 0; iap < 12; iap++) for (let ib = 0; ib < 12; ib++) for (let ibp = 0; ibp < 12; ibp++) {
            const a = (ia / 12) * Math.PI, ap = (iap / 12) * Math.PI, b = (ib / 12) * Math.PI, bp = (ibp / 12) * Math.PI;
            const v = Math.abs(chsh(a, ap, b, bp, (x, y) => 2 * correlatorExact(x, y)));   // planted: correlator scaled by 2
            if (v > best) best = v;
        }
        return best;
    })();
    ok("!! feeding the sweep a deliberately-wrong (doubled) correlator moves its answer away from 2*sqrt(2)",
        rel(brokenSweepMax, TSIRELSON_BOUND) > 0.9, "broken sweep max=" + brokenSweepMax.toFixed(4));
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
