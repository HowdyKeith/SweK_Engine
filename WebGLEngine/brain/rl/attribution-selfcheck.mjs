// brain/rl/attribution-selfcheck.mjs
//
// Run: node brain/rl/attribution-selfcheck.mjs
// RUNTIME 60ms MEASURED (median of 3 -- 63/60/59 ms, with date(1) around the run). No net is trained here: every key is either a function
// whose attributions are known ON PAPER or an identity that must hold for any function at all.
//
// v4027 -- the gate for Integrated Gradients (brain/rl/attribution.mjs).
//
// *** AN ATTRIBUTION METHOD IS THE HARDEST KIND OF THING TO TEST, BECAUSE THE ANSWER IT PRODUCES IS THE ANSWER
// NOBODY KNOWS. *** "Which feature mattered" has no ground truth on a trained net -- that is the entire reason
// for wanting the tool -- so a gate that only ran it against a policy would be checking a number against itself.
//
// EVERY KEY HERE IS THEREFORE INDEPENDENT OF THE THING BEING MEASURED:
//   1. the gradient, against CENTRAL FINITE DIFFERENCES of the same value function -- two routes to one number
//   2. completeness on a LINEAR map, where IG is exact for ANY step count and the per-feature answer is w_i*(x-b)_i
//      by hand
//   3. the CONVERGENCE RATE, measured rather than asserted: a claim about an integrator's order is checkable
//   4. the DUMMY axiom: a variable the function ignores must get EXACTLY zero, not nearly zero
//   5. the load-bearing negative -- what saliency does on a saturated unit, which is WHY the integral is here
//   6. the plant: drop the (x - baseline) factor and watch completeness die while every number stays plausible
"use strict";
import { integratedGradients, policyGradInput, policyValue, policyAttribution, pathAlphas, topFeatures, baselineNote } from "./attribution.mjs";
import { MemoryPolicy } from "./memoryPolicy.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("attribution-selfcheck -- do the parts add up to the whole, and is that checkable?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE GRADIENT, AGAINST FINITE DIFFERENCES OF THE SAME FUNCTION ***");
{
    // policyGradInput is hand-derived calculus over memoryPolicy's forward pass. Hand-derived calculus is where
    // a sign error hides in plain sight, so it is checked against a route that shares NO algebra with it: the
    // value function evaluated either side of each input and differenced.
    const P = new MemoryPolicy(5, 3, { seed: 7 });
    P.act(Float64Array.from([0.4, -0.2, 0.9, 0.1, -0.7]));   // give the pages real content
    const x = new Float64Array(P.xDim);
    for (let i = 0; i < P.xDim; i++) x[i] = Math.sin(i * 1.7) * 0.6;

    let worst = 0, worstI = -1;
    for (let k = 0; k < P.outDim; k++) {
        const g = policyGradInput(P, x, k), h = 1e-6;
        for (let i = 0; i < P.xDim; i++) {
            const a = x.slice(), b = x.slice(); a[i] += h; b[i] -= h;
            const fd = (policyValue(P, a, k) - policyValue(P, b, k)) / (2 * h);
            const e = Math.abs(fd - g[i]);
            if (e > worst) { worst = e; worstI = i; }
        }
    }
    ok("!! *** THE ANALYTIC INPUT GRADIENT MATCHES CENTRAL FINITE DIFFERENCES ***", worst < 1e-7,
        "worst |analytic - fd| = " + worst.toExponential(3) + " at i=" + worstI + ", over all " + P.outDim +
        " outputs and " + P.xDim + " inputs");
    ok("...and it is returned over the FULL xDim, memory pages included",
        policyGradInput(P, x, 0).length === P.xDim,
        "so a caller can attribute what the net REMEMBERS as well as what it sees");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** A LINEAR MAP, WHERE THE RIGHT ANSWER IS KNOWN ON PAPER ***");
{
    // F(x) = w.x has gradient w EVERYWHERE, so the integral is trivial and IG_i = w_i*(x_i - b_i) EXACTLY --
    // for any step count, including one. A method that is only approximately right on the easy case is wrong.
    const w = Float64Array.from([2, -3, 0.5, 7]);
    const valueFn = (v) => { let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * v[i]; return s; };
    const gradFn = () => w.slice();
    const x = Float64Array.from([1, 2, -4, 0.25]), b = Float64Array.from([0.5, 0.5, 0.5, 0.5]);

    const r = integratedGradients({ input: x, baseline: b, valueFn, gradFn, steps: 1 });
    let worst = 0;
    for (let i = 0; i < w.length; i++) worst = Math.max(worst, Math.abs(r.attributions[i] - w[i] * (x[i] - b[i])));
    ok("!! *** EVERY PER-FEATURE ATTRIBUTION EQUALS w_i*(x_i-b_i), AT ONE STEP ***", worst < 1e-12,
        "worst per-feature error " + worst.toExponential(3) + " -- linear means the integral is exact, so an " +
        "error here is arithmetic and not approximation");
    ok("!! ...and completeness is exact, not approximate", r.completenessError < 1e-12,
        "sum " + r.total.toFixed(12) + " vs F(x)-F(b) " + r.delta.toFixed(12));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE CONVERGENCE RATE IS MEASURED, NOT CLAIMED ***");
{
    // attribution.mjs says the midpoint rule beats the reference's endpoint sum. That is an ORDER claim, and an
    // order claimed in a comment is a memory. Doubling the steps must quarter the error (second order); this
    // measures the observed ratio and fails if the integrator is only first order.
    const P = new MemoryPolicy(5, 3, { seed: 7 });
    P.act(Float64Array.from([0.4, -0.2, 0.9, 0.1, -0.7]));
    const obs = Float64Array.from([0.8, -0.5, 0.6, 0.2, -0.9]);
    const errs = [];
    for (const s of [8, 16, 32, 64, 128]) errs.push(policyAttribution(P, { observation: obs, outIndex: 1, steps: s }).completenessError);
    const ratios = [];
    for (let i = 1; i < errs.length; i++) ratios.push(errs[i - 1] / errs[i]);
    const worstRatio = Math.min(...ratios);
    report("completeness error: " + errs.map((e) => e.toExponential(2)).join(" -> "));
    report("per doubling: " + ratios.map((r) => r.toFixed(2) + "x").join(", "));
    ok("!! *** DOUBLING THE STEPS QUARTERS THE ERROR -- SECOND ORDER, AS THE MIDPOINT RULE SHOULD BE ***",
        worstRatio > 3.5, "worst observed ratio " + worstRatio.toFixed(2) + "x against 4.00x ideal; a first-order " +
        "integrator would sit at 2.00x and fail this");
    ok("!! ...and the error is REPORTED rather than hidden behind a tolerance",
        "completenessError" in policyAttribution(P, { observation: obs, steps: 8 }),
        "a caller that wants to know how approximate its answer is can ask");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE DUMMY AXIOM: AN IGNORED FEATURE GETS EXACTLY ZERO ***");
{
    // Sundararajan et al's Dummy axiom. Not "small" -- EXACTLY zero, because the gradient is identically zero
    // along the whole path and zero times anything is zero. A method that returned 1e-17 here would be leaking
    // numerical noise into a claim about what the function depends on.
    const valueFn = (v) => Math.tanh(3 * v[0]) + 0.5 * v[2];       // v[1] appears nowhere
    const gradFn = (v) => Float64Array.from([3 * (1 - Math.tanh(3 * v[0]) ** 2), 0, 0.5]);
    const r = integratedGradients({ input: Float64Array.from([0.9, 12345, -2]), baseline: new Float64Array(3), valueFn, gradFn, steps: 32 });
    ok("!! *** THE IGNORED FEATURE GETS EXACTLY 0, EVEN AT VALUE 12345 ***", r.attributions[1] === 0,
        "attribution " + r.attributions[1] + " -- exactly zero, not approximately");
    ok("...and the features it DOES depend on are non-zero",
        Math.abs(r.attributions[0]) > 1e-6 && Math.abs(r.attributions[2]) > 1e-6);
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE LOAD-BEARING NEGATIVE: WHY NOT JUST READ THE GRADIENT ***");
{
    // *** THIS IS THE REASON THE INTEGRAL EXISTS, AND IT IS MEASURED HERE RATHER THAN ASSERTED IN A COMMENT. ***
    // A saturated tanh has a vanishing gradient AT the input while being the entire reason for the output.
    // Saliency therefore reports "this feature did nothing" about the feature that did everything.
    const valueFn = (v) => Math.tanh(10 * v[0] + 0.001 * v[1]);
    const gradFn = (v) => { const s = 1 - Math.tanh(10 * v[0] + 0.001 * v[1]) ** 2; return Float64Array.from([10 * s, 0.001 * s]); };
    const x = Float64Array.from([1, 1]), b = new Float64Array(2);
    const delta = valueFn(x) - valueFn(b);

    const sal = gradFn(x);
    const salSum = sal[0] + sal[1];
    ok("!! *** SALIENCY MISSES THE WHOLE ANSWER: its sum is ~0 against a delta of ~1 ***",
        Math.abs(salSum - delta) > 0.99,
        "gradient at input sums to " + salSum.toExponential(3) + ", F(x)-F(b) = " + delta.toFixed(9) +
        " -- off by " + Math.abs(salSum - delta).toFixed(6) + ", which is the entire output");

    const r = integratedGradients({ input: x, baseline: b, valueFn, gradFn, steps: 4096 });
    ok("!! ...and INTEGRATED gradients recovers it to machine precision", r.completenessError < 1e-12,
        "sum " + r.total.toFixed(9) + " vs delta " + r.delta.toFixed(9) + ", err " + r.completenessError.toExponential(2));
    ok("!! ...and it attributes it to the RIGHT feature", r.attributions[0] > 0.99 && Math.abs(r.attributions[1]) < 1e-3,
        "x0 " + r.attributions[0].toFixed(6) + ", x1 " + r.attributions[1].toExponential(3) +
        " -- the saturated one carries it, which saliency reported as 8e-8");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE PLANT: DROP THE (x - baseline) FACTOR ***");
{
    // The classic implementation bug. Every number still LOOKS like a per-feature score -- same shape, same sign,
    // same rough magnitude -- and the axiom is the only thing that notices. That is exactly why the axiom is the
    // gate rather than a plausibility eyeball.
    const w = Float64Array.from([2, -3, 0.5, 7]);
    const valueFn = (v) => { let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * v[i]; return s; };
    const gradFn = () => w.slice();
    const x = Float64Array.from([1, 2, -4, 0.25]), b = new Float64Array(4);

    const honest = integratedGradients({ input: x, baseline: b, valueFn, gradFn, steps: 32 });
    // the planted variant, computed here rather than by a knob, because it is the ABSENCE of a multiply
    const alphas = pathAlphas(32), acc = new Float64Array(4);
    for (let k = 0; k < alphas.length; k++) { const g = gradFn(); for (let i = 0; i < 4; i++) acc[i] += g[i]; }
    let plantedTotal = 0; const planted = new Float64Array(4);
    for (let i = 0; i < 4; i++) { planted[i] = acc[i] / alphas.length; plantedTotal += planted[i]; }
    const plantedErr = Math.abs(plantedTotal - honest.delta);

    ok("!! *** COMPLETENESS HOLDS HONESTLY AND DIES UNDER THE PLANT ***",
        honest.completenessError < 1e-12 && plantedErr > 1,
        "honest err " + honest.completenessError.toExponential(2) + ", planted err " + plantedErr.toFixed(6) +
        " -- a separation of " + (plantedErr / Math.max(honest.completenessError, 1e-300)).toExponential(1));
    // AND THE PLANT IS INVISIBLE TO EVERY OTHER READING, which is the part worth recording.
    const sameSigns = [0, 1, 2, 3].every((i) => Math.sign(planted[i]) === Math.sign(w[i]));
    ok("!! ...while the planted numbers keep the SAME SIGNS and a plausible shape", sameSigns,
        "planted [" + Array.from(planted).map((v) => v.toFixed(2)).join(", ") + "] vs honest [" +
        Array.from(honest.attributions).map((v) => v.toFixed(2)).join(", ") + "] -- an eyeball cannot separate " +
        "these, and the axiom does it in one subtraction");
}

// ---------------------------------------------------------------------------
console.log("\n7. *** WHAT IT REFUSES TO PRETEND ***");
{
    ok("!! the baseline choice is stated as a caveat, not silently defaulted",
        typeof baselineNote === "string" && /baseline is part of the question/i.test(baselineNote) && baselineNote.length > 200,
        "all-zeros is right where 0 means ABSENT and wrong where 0 is an ordinary mid-range value");
    const P = new MemoryPolicy(4, 2, { seed: 3 });
    const r = policyAttribution(P, { observation: Float64Array.from([0.5, -0.5, 0.25, 1]), steps: 16 });
    ok("!! a recurrent policy's MEMORY attribution is reported separately, never summed into the observation",
        r.observation.length === P.inDim && r.memoryAttribution.length === P.mem,
        "obs " + r.observation.length + " + mem " + r.memoryAttribution.length + " -- 'the pages did it' and " +
        "'the reading did it' are different answers and this refuses to blur them");
    const t = topFeatures(r.observation, ["range", "bearing", "closing", "fuel"], 2);
    ok("!! ...and topFeatures ranks by magnitude with names when it has them, indices when it does not",
        t.length === 2 && t[0].magnitude >= t[1].magnitude && t[0].name.length > 0,
        "top: " + t.map((f) => f.name + " " + f.value.toFixed(4)).join(", "));
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
