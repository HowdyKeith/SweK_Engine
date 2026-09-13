// physics/render/splitSum-selfcheck.mjs -- v4539
//
// Run: node physics/render/splitSum-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** THE LUT IS NOT GRADED AGAINST A TOLERANCE. IT IS GRADED AGAINST A NUMBER THIS TREE ALREADY HAD. ***
// At F0 = 1 Schlick's Fresnel is identically 1, so the split sum's second integral IS the directional albedo --
// and physics/render/energyCompensation.mjs computes directional albedo by a completely different route (a
// marched grid or a VNDF sampler, chosen by albedoEstimator's rule), written for a completely different
// purpose, and already gated. Two independent derivations of one quantity have to agree, and where they do
// not, the disagreement has to sit where the weaker of them says it is weak.
import { brdfLutEntry, brdfLut, lookupLut, splitSumBrdf, prefilterEnv, splitSumError } from "./splitSum.mjs";
import { buildTable, albedoAt } from "./energyCompensation.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

console.log("1. *** THE ANCHOR: A + B IS THE DIRECTIONAL ALBEDO, and this tree already knows what that is ***");
{
    const rows = [];
    let worst = 0, worstAt = "", typical = [];
    for (const alpha of [0.1, 0.3, 0.6, 1.0]) {
        const T = buildTable(alpha, { K: 32 });
        for (const mu of [0.2, 0.5, 0.9]) {
            const { A, B } = brdfLutEntry(mu, alpha, { samples: 4096 });
            const E = albedoAt(T, mu);
            const d = Math.abs(A + B - E);
            typical.push(d);
            if (d > worst) { worst = d; worstAt = `alpha ${alpha}, mu ${mu}`; }
            rows.push({ alpha, mu, sum: A + B, E, d });
        }
    }
    typical.sort((a, b) => a - b);
    const med = typical[typical.length >> 1];
    ok("!! *** TWO INDEPENDENT DERIVATIONS OF THE DIRECTIONAL ALBEDO AGREE ***",
       med < 2e-4 && worst < 1e-2 && worstAt.startsWith("alpha 0.1"),
       `12 points over alpha 0.1-1.0: median disagreement ${med.toExponential(2)}, worst ${worst.toExponential(2)} ` +
       `at ${worstAt}. The LUT is GGX half-vector importance sampling; the reference is a marched grid or a ` +
       "VNDF sampler picked by albedoEstimator. Nothing is shared between them but the physics.");

    ok("!! and the one bad point is where the REFERENCE says it is weak, not where the new code is",
       worstAt.startsWith("alpha 0.1"),
       `worst at ${worstAt}. energyCompensation's own header: "THE ROWS OF THIS TABLE NEAREST GRAZING WERE ` +
       'WRONG BY A QUARTER AT alpha 0.05 ... a narrow lobe at a grazing view falls between grid lines." A ' +
       "cross-check whose largest disagreement lands on the reference's stated weak spot is telling you " +
       "something; one that disagrees uniformly everywhere is telling you the two are unrelated.");
}

console.log("\n2. *** ENERGY: single-scatter GGX loses light and must never make it ***");
{
    // *** THE GRID HAS TO REACH WHERE THE EFFECT LIVES, AND AN 8x8 ONE DOES NOT. *** The overshoot sits at
    // the FINEST roughness -- alpha 0.031, a lobe so narrow that few importance samples land in it -- and an
    // 8x8 grid's coarsest alpha is 0.0625, which never sees it: that grid reads 0.9977 at 256 samples and the
    // row asserting an overshoot fails on a tree where the overshoot is real. Sixteen rows in alpha reach
    // 0.031. It is the same narrow-lobe regime the anchor's worst disagreement sits in, which is not a
    // coincidence -- both are the estimator running out of samples where the lobe is smallest.
    const conv = [];
    for (const n of [256, 4096, 16384]) {
        let worst = 0, at = "";
        for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) {
            const mu = (i + 0.5) / 8, al = (j + 0.5) / 16;
            const e = brdfLutEntry(mu, al, { samples: n });
            if (e.A + e.B > worst) { worst = e.A + e.B; at = `mu ${mu.toFixed(3)} alpha ${al.toFixed(3)}`; }
        }
        conv.push({ n, worst, at });
    }
    const big = conv[conv.length - 1];
    ok("!! *** CONVERGED, A+B IS UNDER 1 -- AND AT A SHIPPABLE SAMPLE COUNT IT IS NOT ***",
       big.worst < 1 && conv[0].worst > 1,
       conv.map((c) => `${c.n}: ${c.worst.toFixed(8)} (${c.at})`).join("; ") +
       `. The excess SHRINKS with samples, so it is Monte Carlo noise and not a bias -- but a table baked at ` +
       "256 samples exceeds 1 by 1.6e-4 and one baked at 16,384 does not. *** THAT IS A SHIPPING DECISION AND " +
       "NOT A CURIOSITY: *** a renderer that multiplies by A+B without clamping can return more light than it " +
       "received, from a table that looks fine. The number says how many samples buy the guarantee.");
}

console.log("\n3. *** THE FACTORISATION IS EXACT ON A CONSTANT ENVIRONMENT AND NOWHERE ELSE ***");
{
    const uniform = () => 1;
    const gradient = (d) => 0.5 + 0.5 * d[2];
    const spot = (d) => (d[2] > 0.98 ? 50 : 0.05);
    const at = (env, alpha) => splitSumError(env, 0.7, alpha, 0.04, { samples: 8192 });
    const u1 = at(uniform, 0.1), u5 = at(uniform, 0.5);
    const g1 = at(gradient, 0.1), g5 = at(gradient, 0.5);
    const s1 = at(spot, 0.1), s5 = at(spot, 0.5);
    ok("!! a constant environment factorises EXACTLY -- the product of the averages IS the average",
       u1.relErr < 1e-12 && u5.relErr < 1e-12,
       `uniform: relative error ${u1.relErr.toExponential(2)} at alpha 0.1 and ${u5.relErr.toExponential(2)} at ` +
       "0.5. Not a tolerance: the two integrals are the same integral when L is constant over the lobe.");

    ok("!! *** AND THE ERROR GROWS WITH BOTH LOBE WIDTH AND ENVIRONMENT CONTRAST, which is the cost ***",
       g5.relErr > g1.relErr && s5.relErr > s1.relErr && s1.relErr > g1.relErr && s5.relErr > 0.2,
       `gradient ${(100 * g1.relErr).toFixed(2)}% at alpha 0.1 -> ${(100 * g5.relErr).toFixed(2)}% at 0.5; ` +
       `a small bright light ${(100 * s1.relErr).toFixed(2)}% -> ${(100 * s5.relErr).toFixed(2)}%. Both are ` +
       "measured on the SAME sample set as the truth they are compared to, so what is reported is the " +
       "FACTORISATION and not two Monte Carlo errors being differenced. A third of the answer is what the " +
       "split sum costs on a sharp light and a rough surface -- the case it is least suited to and the one " +
       "every renderer using it has anyway.");
}

console.log("\n4. the prefiltered environment, and the table a renderer actually samples");
{
    const uniform = () => 1;
    let worstU = 0;
    for (const a of [0.05, 0.3, 0.7, 1.0]) for (const R of [[0, 0, 1], [1, 0, 0], [0.6, 0.6, 0.53]]) {
        const n = Math.hypot(R[0], R[1], R[2]);
        worstU = Math.max(worstU, Math.abs(prefilterEnv(uniform, [R[0] / n, R[1] / n, R[2] / n], a) - 1));
    }
    ok("!! a constant environment prefilters to exactly itself, at every roughness and direction",
       worstU < 1e-12,
       `worst deviation from 1 over 4 roughnesses x 3 directions: ${worstU.toExponential(2)}. A normalised ` +
       "kernel applied to a constant returns the constant, so this is an identity and a basis change that " +
       "quietly failed to normalise would break it.");

    const lut = brdfLut({ K: 16, R: 16, samples: 512 });
    let worstL = 0;
    for (const mu of [0.15, 0.45, 0.85]) for (const al of [0.15, 0.45, 0.85]) {
        const got = lookupLut(lut, mu, al);
        const want = brdfLutEntry(mu, al, { samples: 4096 });
        worstL = Math.max(worstL, Math.abs(splitSumBrdf(got.A, got.B, 0.04) - splitSumBrdf(want.A, want.B, 0.04)));
    }
    ok("!! the BILINEAR LOOKUP is what gets graded, because it is what a sampler does",
       worstL < 5e-3,
       `worst F0*A+B difference between a 16x16 bilinear fetch and a direct 4,096-sample evaluation, at ` +
       `F0 = 0.04: ${worstL.toExponential(2)}. Grading the table's cells instead of the fetch would miss ` +
       "everything interpolation does, which is the only thing a renderer ever sees.");
}

// ---- SABOTAGE LOG -- graded on EXIT CODES, each restored before the next --------------------------------------
//   A  the (1 - Fc) / Fc split swapped between A and B          exit 1
//   B  G2 dropped from gVis (no shadowing-masking)              exit 1
//   C  the GGX half-vector sampled with alpha^2 -> alpha        exit 1
//   D  prefilterEnv divides by `samples` instead of the weight  exit 1
//   E  splitSumError forms the product from a SECOND sample set exit 1
//
// *** E IS THE ONE WORTH READING, AND WHAT I FIRST WROTE HERE WAS WRONG. *** The entry claimed a second
// sample set would make the UNIFORM environment read about 2% where the true answer is zero. It does not: a
// constant returns 1 whichever directions you sample, so both averages stay identical and the uniform identity
// holds at 0.000% either way. The claim was plausible, was written before the sabotage was run, and would have
// shipped as a measurement. It is replaced by what actually happens.
//
// What a second sample set destroys is the MONOTONICITY, which is the part that carries meaning:
//
//     shared sample set     gradient 2.06% -> 4.62%     spot 13.82% -> 32.83%     (grows with lobe width)
//     second sample set     gradient 2.06% -> 3.91%     spot 15.89% ->  9.78%     (INVERTED)
//
// At alpha 0.5 the lobe is wide and a small bright light is caught to a different degree by two different
// sample sets; that disagreement is larger than the factorisation error and it swamps the trend, reversing it.
// The row fires on the ordering rather than on any single number, which is why it fires at all -- an assertion
// on one value would have accepted 9.78% as easily as 32.83%. Sharing the sample set is what makes the
// difference reported the FACTORISATION rather than two Monte Carlo estimates differencing their own noise.

console.log(fails ? "\nsplitSum-selfcheck: " + fails + " FAILED" : "\nsplitSum-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
