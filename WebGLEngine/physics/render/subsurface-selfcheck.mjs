// physics/render/subsurface-selfcheck.mjs -- v4443 -- the gate for physics/render/subsurface.mjs.
//
// *** THIS IS THE FIFTH AND LAST OF THE GAPS v4432 NAMED IN ITS OWN HONEST SCOPE, and it is the one where
// the most can be ASSERTED rather than measured, *** because Christensen and Burley's profile is normalised
// by construction and the classical dipole is not. Almost every row below is an exact identity.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. 4 pi for 8 pi in the profile's denominator   -> 0 RED, THEN 1 RED AFTER THE REPAIR
//     *** THE ZERO WAS THE ROUND'S BEST FINDING AND IT WAS AGAINST THIS GATE'S HEADLINE ROW. *** normalisation()
//     integrated a HAND-SUBSTITUTED copy of the integrand -- d cancelled analytically, so the answer was
//     bit-identical across d and read as the strongest assertion in the file -- and it NEVER CALLED profile().
//     A normalisation that re-derives its own integrand grades the copy. It integrates the real profile now,
//     which costs the bit-identity and buys a check that can fail.
//  B. Drop the second exponential's factor of 3           -> 2 RED
//  C. Swap the CDF's 1/4 and 3/4 weights                  -> 2 RED
//  D. Return d rather than 2.5 d from meanRadius          -> 1 RED
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the fitted albedo relation is right. It is a CURVE FIT and is labelled `fitted` in the module; no row
// here asserts anything exact about it, and section 6 asserts only that it is monotone and finite where a
// renderer would ask. That the profile is coupled to anything: this is a radial distribution, and WIRING IT
// INTO principled.mjs's diffuse lobe IS NOT DONE -- a BSSRDF needs a surface to integrate over and the
// composed model has none, so the fifth gap is closed as a MODEL and left open as an INTEGRATION. And that
// any of it is spectral: one channel, one scattering distance, grey.

import { profile, cdf, meanRadius, normalisation, sampleRadius, fractionWithin, fitted } from "./subsurface.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("subsurface-selfcheck -- a profile that is normalised by construction, and the proof is one line\n");

// ---- 1. THE NORMALISATION IDENTITY ----------------------------------------------------------------------
console.log("1. the integral is one, and it is one for every d");

const ds = [1e-3, 1e-2, 0.1, 1, 7, 100, 1e6];
const norms = ds.map((d) => normalisation(d, { N: 20000 }));
say(`normalisation at d = ${ds.join(", ")}: all ${norms[0].toFixed(12)}`);
// *** THIS ROW WAS BIT-IDENTICAL AND VACUOUS, AND A SABOTAGE FOUND OUT. *** normalisation() used to integrate
// a HAND-SUBSTITUTED copy of the integrand with d cancelled analytically -- so the equality was a tautology of
// the substitution, and replacing 8 pi with 4 pi inside profile() cost ZERO RED because the check never called
// profile(). It integrates the real thing now: d enters the arithmetic, the identity across d becomes a
// MEASURED property of the model rather than a property of the algebra, and the sabotage bites.
ok("!! the normalisation agrees across seven decades of d to floating-point noise",
   Math.max(...norms) - Math.min(...norms) < 1e-14,
   `spread ${(Math.max(...norms) - Math.min(...norms)).toExponential(2)} -- measured, not cancelled by hand`);

// And the shortfall is the QUADRATURE, proven by refining it rather than assumed -- v4432's rule, sixth round.
const ladder = [20000, 100000, 500000, 2000000].map((N) => normalisation(1, { N }));
say(`refining the quadrature: ${ladder.map((v) => v.toFixed(12)).join("  ")}`);
ok("!! ...and it converges to exactly one as the quadrature refines, so the residual is the instrument",
   ladder.every((v, i) => i === 0 || Math.abs(v - 1) < Math.abs(ladder[i - 1] - 1)) &&
   Math.abs(ladder[ladder.length - 1] - 1) < 1e-9,
   `${(1 - ladder[0]).toExponential(2)} down to ${(1 - ladder[ladder.length - 1]).toExponential(2)}`);

// ---- 2. THE CLOSED FORMS -------------------------------------------------------------------------------
console.log("\n2. three things with closed forms, asserted as exact");

ok("CDF(0) is exactly zero for every d", ds.every((d) => cdf(0, d) === 0));
ok("CDF(inf) is one to machine precision", ds.every((d) => Math.abs(cdf(1e12 * d, d) - 1) < 1e-15));
ok("the CDF is monotone", (() => {
    for (const d of [0.1, 1, 10]) {
        let prev = -1;
        for (let k = 0; k <= 400; k++) {
            const v = cdf((k / 40) * d, d);
            if (v < prev) return false;
            prev = v;
        }
    }
    return true;
})());
// *** E[r] = 2.5 d EXACTLY, and it is checked against a quadrature that could disagree. ***
// *** THE MEASURE IS (1/4)(e^-u + e^(-u/3)) du AND THE FIRST VERSION OF THIS QUADRATURE USED 1/2. *** It was
// checked by hand at d = 2, where a factor-of-two error returns 5.000 -- WHICH IS EXACTLY THE RIGHT-LOOKING
// ANSWER, because 2.5 d at d = 2 is 5 and 2 x 2.5 is also 5. A constant that scales with the parameter you
// tested at is invisible at that parameter, and the fix is to test the DIMENSIONLESS ratio E[r]/d instead,
// which has one right answer at every d.
const meanQuad = (() => {
    const N = 400000, uMax = 200, du = uMax / N;
    let m = 0;
    for (let i = 0; i < N; i++) { const u = (i + 0.5) * du; m += u * 0.25 * (Math.exp(-u) + Math.exp(-u / 3)) * du; }
    return m;
})();
say(`mean radius: closed form 2.5d, quadrature gives ${meanQuad.toFixed(9)}d`);
ok("!! the mean radius is exactly 2.5 d", ds.every((d) => meanRadius(d) === 2.5 * d));
ok("...and a quadrature that could have disagreed does not", Math.abs(meanQuad - 2.5) < 1e-6);

// ---- 3. SELF-SIMILARITY, AND THE POWER IS PART OF THE CLAIM --------------------------------------------
console.log("\n3. d is a scale and nothing else -- at the SECOND power");

let worstSim = 0;
for (const u of [0.1, 0.5, 2, 10, 40]) {
    const vs = [0.01, 1, 100].map((d) => d * d * profile(u * d, d));
    worstSim = Math.max(worstSim, (Math.max(...vs) - Math.min(...vs)) / vs[0]);
}
ok("!! d^2 R(u d, d) depends only on u, over 15 (u, d) pairs", worstSim < 1e-15,
   `relative spread ${worstSim.toExponential(2)}`);
// *** THE POWER ITSELF IS ASSERTED, BECAUSE THE FIRST DRAFT OF THE HEADER SAID d AND NOT d^2. *** Across
// three decades the mantissa of d R was identical to twelve digits while the exponent stepped by two per
// decade -- the signature of a missed power rather than a wrong formula. R is a density PER UNIT AREA, so it
// carries two inverse lengths. A dimensional slip that leaves every digit right is invisible to anything
// except the exponent, and a row that only checked "the digits match" would have passed it.
// The test is a RATIO and not a difference: a relative spread saturates near 1 whenever the smallest value
// is negligible, so it cannot distinguish "spreads by 100x" from "spreads by 10^12".
ok("!! ...and the FIRST power does NOT collapse, so the exponent is part of what is asserted", (() => {
    const vs = [0.01, 1, 100].map((d) => d * profile(2 * d, d));
    return Math.max(...vs) / Math.min(...vs) > 1e3;
})(), "d R spreads by four orders across the same three d; only d^2 R is invariant");

// ---- 4. THE SEARCHLIGHT LIMIT IS THE SAME CLAIM ---------------------------------------------------------
console.log("\n4. 'as d goes to zero it becomes a BRDF' is self-similarity read along the other axis");

for (const k of [0.5, 2, 8]) {
    const vs = [1e-3, 1, 1e3].map((d) => fractionWithin(k * d, d));
    ok(`the fraction within ${k}d is the same number at d = 1e-3, 1 and 1e3`, new Set(vs).size === 1,
       `${vs[0].toFixed(12)} -- bit-identical, so the limit is not a separate coincidence`);
}
say(`fraction within a fixed 1mm as d shrinks: ${[1, 0.1, 0.01, 1e-3, 1e-4].map((d) => fractionWithin(1, d).toFixed(6)).join("  ")}`);
ok("!! at small d essentially all the light leaves where it entered -- the BRDF limit, measured",
   fractionWithin(1, 1e-4) > 0.9999 && fractionWithin(1, 1) < 0.7);

// ---- 5. THE SAMPLER INVERTS THE THING IT SAMPLES --------------------------------------------------------
console.log("\n5. sampleRadius is the CDF's inverse, checked against the CDF");

let worstInv = 0;
for (const d of [0.05, 1, 40]) {
    for (let k = 1; k < 40; k++) {
        const u = k / 40;
        worstInv = Math.max(worstInv, Math.abs(cdf(sampleRadius(u, d), d) - u));
    }
}
ok("!! cdf(sampleRadius(u)) == u across 117 (u, d) pairs", worstInv < 1e-12, `worst ${worstInv.toExponential(2)}`);
ok("sampleRadius scales with d, because the inverse of a self-similar CDF must",
   Math.abs(sampleRadius(0.7, 10) / sampleRadius(0.7, 1) - 10) < 1e-9);
ok("...and the median sits where the closed form puts it", (() => {
    const m = sampleRadius(0.5, 1);
    return Math.abs(cdf(m, 1) - 0.5) < 1e-12 && m > 1 && m < 3;
})());

// ---- 6. THE FITTED HALF, HELD TO WHAT A FIT CAN OWE -----------------------------------------------------
console.log("\n6. the fit is a fit and nothing is asserted exactly about it");

ok("the scaling factor is finite and positive over the whole albedo range",
   [0, 0.2, 0.5, 0.8, 0.95, 1].every((A) => { const s = fitted.scalingFactor(A); return s > 0 && Number.isFinite(s); }));
ok("distanceFor is the mean free path over that factor, which is the only thing it claims",
   Math.abs(fitted.distanceFor(0.5, 2) - 2 / fitted.scalingFactor(0.5)) < 1e-15);
ok("...and the module says in its own export that it is a fit", /fit to Monte Carlo/.test(fitted.note),
   "labelled so nothing downstream mistakes it for the exact half of the module");

console.log(`\nsubsurface-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
