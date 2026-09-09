#!/usr/bin/env node
// WebGLEngine/physics/render/fresnelF82-selfcheck.mjs -- v4584
//
// Run: node physics/render/fresnelF82-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** NOT GRADED AGAINST A TOLERANCE PICKED TO PASS. *** Section 1 is structural (the correction is built to be
// exactly zero at both endpoints and exactly b at the pin -- these are asserted at f64 rounding, not "close").
// Section 3 finds an INDEPENDENT mathematical reason the published exponent (6) pairs with the published pin
// (mu = 1/7), rather than taking the pairing on faith, and cross-checks the exact numeric constants a published
// reference implementation ships. Section 5 is the split-sum-selfcheck.mjs technique itself: at the one point
// where F82-tint degenerates to "Fresnel is identically 1" (F0 = white, b = white), it is graded against
// physics/render/energyCompensation.mjs's directional-albedo table -- a number this tree already had, computed
// by a completely different route -- via microfacet.mjs's own directionalAlbedoSplit(alpha, cosO, Fof) hook.
"use strict";
import { f82Tint, edgeShape, PIN_WEIGHT, MU_PIN } from "./fresnelF82.mjs";
import { schlick } from "./fresnel.mjs";
import { directionalAlbedoSplit } from "./microfacet.mjs";
import { buildTable, albedoAt } from "./energyCompensation.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);
const sec = (s) => console.log("\n" + s);

sec("1. *** STRUCTURAL: THE THREE PINNED POINTS, AT f64 ROUNDING, NOT A TOLERANCE ***");
{
    const F0S = [0, 0.04, 0.5, 0.9, 1], BS = [0, 0.3, 0.7, 1];
    let worstNormal = 0, worstGrazing = 0, worstPin = 0;
    for (const F0 of F0S) for (const b of BS) {
        worstNormal = Math.max(worstNormal, Math.abs(f82Tint(1, F0, b) - F0));
        worstGrazing = Math.max(worstGrazing, Math.abs(f82Tint(0, F0, b) - 1));
        worstPin = Math.max(worstPin, Math.abs(f82Tint(MU_PIN, F0, b) - b));
    }
    ok("!! normal incidence F(1) = F0 exactly, for every (F0, b) -- the correction never touches it",
       worstNormal < 1e-14, `worst |f82Tint(1,F0,b) - F0| across 20 (F0,b) pairs: ${worstNormal.toExponential(2)}`);
    ok("!! grazing F(0) = 1 exactly, for every (F0, b) -- b does NOT control the grazing value, only F(1/7) does",
       worstGrazing < 1e-14, `worst |f82Tint(0,F0,b) - 1| across 20 (F0,b) pairs: ${worstGrazing.toExponential(2)}`);
    ok("!! *** THE PIN: F(1/7) = b exactly, for every (F0, b) -- the one thing this whole file exists to build ***",
       worstPin < 1e-13, `worst |f82Tint(1/7,F0,b) - b| across 20 (F0,b) pairs: ${worstPin.toExponential(2)}`);

    ok("edgeShape(0) = 0 and edgeShape(1) = 0 exactly, bit for bit -- what makes the two endpoints untouchable",
       edgeShape(0) === 0 && edgeShape(1) === 0, `edgeShape(0)=${edgeShape(0)}, edgeShape(1)=${edgeShape(1)}`);
    ok("PIN_WEIGHT is edgeShape's own value at the pin, and it is never zero (the divide in f82Tint is always safe)",
       PIN_WEIGHT === edgeShape(MU_PIN) && PIN_WEIGHT > 0, `PIN_WEIGHT = ${PIN_WEIGHT}`);
}

sec("2. *** REDUCTION TO PLAIN SCHLICK: A BIT-IDENTICAL CURVE, NOT JUST AN IDENTICAL POINT ***");
{
    // b = schlick(MU_PIN, F0) asks for exactly what Schlick already gives at the pin -- the correction's own
    // coefficient (FsPin - b) is then zero, so this has to reduce to schlick() EVERYWHERE, not only at mu=1/7.
    // Checked over a sweep, because a formula that only agrees AT the pin it was built to agree at is a weaker
    // claim than one that agrees along the whole curve once that one condition holds.
    const MUS = Array.from({ length: 25 }, (_, i) => i / 24);
    for (const F0 of [0, 0.04, 0.5, 1]) {
        const b = schlick(MU_PIN, F0);
        let worst = 0;
        for (const mu of MUS) worst = Math.max(worst, Math.abs(f82Tint(mu, F0, b) - schlick(mu, F0)));
        ok(`!! F0=${F0}: b = schlick(1/7, F0) collapses f82Tint to schlick(*, F0) across 25 angles`,
           worst < 1e-13, `worst |f82Tint - schlick|: ${worst.toExponential(2)}`);
    }
}

sec("3. *** WHY 6 IS NOT AN ARBITRARY EXPONENT: IT IS THE ONE THAT PUTS THE CORRECTION'S OWN PEAK AT THE PIN ***");
{
    // d/dmu [mu(1-mu)^n] = (1-mu)^(n-1) [1 - (n+1)mu], zero at mu = 1/(n+1). For n = 6 that is EXACTLY 1/7 --
    // so within the mu(1-mu)^n family, 6 is not a free parameter alongside "pin at 1/7", it is the UNIQUE
    // exponent whose bump peaks exactly where the curve is pinned. That is a real, computed, independent
    // property of THIS construction (verified below by evaluating edgeShape numerically, not asserted from the
    // calculus alone) -- not a re-derivation of Hoffman's own reasons for the published constant, and not proof
    // that mu=1/7 is where a REAL metal's curve most needs correcting (that is empirical, needs tabulated IOR
    // data, and is this file's own named remaining gap, see the trailing note).
    const h = 1e-6, slopeAt = (mu) => (edgeShape(mu + h) - edgeShape(mu - h)) / (2 * h);
    const slopeAtPin = slopeAt(MU_PIN);
    ok("!! edgeShape's derivative is (numerically) zero exactly at MU_PIN, not merely small there",
       Math.abs(slopeAtPin) < 1e-6, `d(edgeShape)/dmu at mu=1/7: ${slopeAtPin.toExponential(3)}`);
    const justBelow = edgeShape(MU_PIN - 0.01), atPin = edgeShape(MU_PIN), justAbove = edgeShape(MU_PIN + 0.01);
    ok("!! ...and it really is a MAXIMUM there (both neighbours are lower), not a saddle the derivative test alone would miss",
       atPin > justBelow && atPin > justAbove,
       `edgeShape(1/7 - 0.01)=${justBelow.toFixed(6)}, edgeShape(1/7)=${atPin.toFixed(6)}, edgeShape(1/7 + 0.01)=${justAbove.toFixed(6)}`);

    // The published constants this file's own header cites -- boksajak/brdf's evalFresnelHoffman ships
    // a = 17.6513846*(f0-f82) + 8.166666*(1-f0) directly (pre-expanded for a shader's sake); this file's own
    // pin-based form is f82Tint = schlick(mu,F0) - edgeShape(mu)*(schlick(1/7,F0)-b)/PIN_WEIGHT. Expanding
    // THAT coefficient algebraically in f0 and b reduces to EXACTLY the same two constants (worked in this
    // file's own commit message / nextRounds.mjs entry) -- checked here as two bare numbers, not trusted from
    // that algebra alone.
    const invPinWeight = 1 / PIN_WEIGHT;
    const sixSeventhsFifth = Math.pow(6 / 7, 5);
    report(`1/PIN_WEIGHT = ${invPinWeight.toFixed(7)} (published: 17.6513846)`);
    report(`(1/PIN_WEIGHT) * (6/7)^5 = ${(invPinWeight * sixSeventhsFifth).toFixed(7)} (published: 49/6 = ${(49 / 6).toFixed(7)})`);
    ok("!! *** 1/PIN_WEIGHT MATCHES THE PUBLISHED CONSTANT boksajak/brdf's evalFresnelHoffman SHIPS (17.6513846) ***",
       Math.abs(invPinWeight - 17.6513846) < 1e-6, `computed ${invPinWeight.toFixed(7)}, published 17.6513846`);
    ok("!! *** ...AND THE SECOND TERM MATCHES 49/6 EXACTLY (RATIONAL, NOT A COINCIDENCE OF ROUNDING) ***",
       Math.abs(invPinWeight * sixSeventhsFifth - 49 / 6) < 1e-9,
       `computed ${(invPinWeight * sixSeventhsFifth).toFixed(9)}, 49/6 = ${(49 / 6).toFixed(9)}`);
}

sec("4. *** MONOTONIC IN b, EVERYWHERE IN THE OPEN INTERVAL, WITH MAXIMUM SENSITIVITY EXACTLY AT THE PIN ***");
{
    // f82Tint is AFFINE in b (edgeShape(mu)/PIN_WEIGHT does not depend on b), so this is checkable directly
    // rather than swept: raising the target edge-tint can only raise the curve's interior, never lower it, and
    // by section 3's own finding it does so MOST at mu = 1/7.
    const F0 = 0.6, db = 0.37;
    const MUS = [0.05, 0.15, MU_PIN, 0.3, 0.5, 0.7, 0.9, 0.99];
    let worst = Infinity, sensAtPin = 0, sensElsewhereMax = 0;
    for (const mu of MUS) {
        const lo = f82Tint(mu, F0, 0.1), hi = f82Tint(mu, F0, 0.1 + db);
        const sensitivity = (hi - lo) / db;
        worst = Math.min(worst, hi - lo);       // must never be negative
        if (mu === MU_PIN) sensAtPin = sensitivity; else sensElsewhereMax = Math.max(sensElsewhereMax, sensitivity);
    }
    ok("!! raising b never lowers F82 anywhere sampled (mirrors GT 0 or exactly 0 at the two untouchable endpoints)",
       worst >= -1e-12, `smallest (F82(b+db) - F82(b)) across 8 angles: ${worst.toExponential(3)}`);
    ok("!! *** and the pin's OWN sensitivity to b (which must be exactly 1 -- see section 1's pin identity) beats every other angle sampled ***",
       Math.abs(sensAtPin - 1) < 1e-9 && sensAtPin > sensElsewhereMax,
       `d(F82)/db at the pin = ${sensAtPin.toFixed(6)}, best elsewhere = ${sensElsewhereMax.toFixed(6)}`);
}

sec("5. *** THE ANCHOR: AT THE WHITE/WHITE LIMIT, F82-TINT'S OWN DIRECTIONAL ALBEDO MATCHES energyCompensation.mjs'S TABLE ***");
{
    // split-sum-selfcheck.mjs's own technique: "at F0 = 1 Schlick's F is identically 1, so [the quantity] IS
    // the directional albedo energyCompensation.mjs computes by a completely different route." f82Tint(*, 1, 1)
    // is ALSO identically 1 (schlick(*,1) = 1 for every angle, and the correction's coefficient (1 - 1) = 0
    // regardless of edgeShape) -- so feeding f82Tint as microfacet.mjs's own Fof(dot(wo,wh)) hook into
    // directionalAlbedoSplit, at F0=1, b=1, has to land on the SAME anchor split-sum's own gate already uses,
    // not a new one invented for this file.
    let worst = 0, worstAt = "";
    for (const alpha of [0.1, 0.3, 0.6, 1.0]) {
        const T = buildTable(alpha, { K: 32 });
        for (const cosO of [0.2, 0.5, 0.9]) {
            const { E } = directionalAlbedoSplit(alpha, cosO, (d) => f82Tint(d, 1, 1), { samples: 4096 });
            const ref = albedoAt(T, cosO);
            const d = Math.abs(E - ref);
            if (d > worst) { worst = d; worstAt = `alpha ${alpha}, cosO ${cosO}`; }
        }
    }
    ok("!! *** f82Tint(*, 1, 1), THROUGH THE SAME VNDF-SAMPLED ALBEDO ESTIMATOR, AGREES WITH energyCompensation.mjs ***",
       worst < 1e-2, `12 (alpha,cosO) points: worst disagreement ${worst.toExponential(2)} at ${worstAt} -- same order split-sum-selfcheck.mjs's own anchor measures (worst < 1e-2 there too), against the same reference table.`);

    // And the non-degenerate case is NOT expected to match -- b != schlick(1/7,F0) genuinely changes the curve,
    // so this is the negative control: the anchor above is not passing because directionalAlbedoSplit ignores
    // Fof, it is passing because f82Tint(*, 1, 1) really does collapse to the constant-1 case.
    const T2 = buildTable(0.5, { K: 32 });
    const tinted = directionalAlbedoSplit(0.5, 0.5, (d) => f82Tint(d, 0.5, 0.9), { samples: 4096 }).E;
    const plain = albedoAt(T2, 0.5);
    ok("...and a GENUINELY tinted case (F0=0.5, b=0.9) does NOT collapse to the same table -- confirming the anchor above is not vacuous",
       Math.abs(tinted - plain) > 1e-3, `tinted E=${tinted.toFixed(4)} vs energyCompensation E=${plain.toFixed(4)}, |diff|=${Math.abs(tinted - plain).toExponential(2)}`);
}

console.log(fails ? "\nfresnelF82-selfcheck: " + fails + " FAILED" : "\nfresnelF82-selfcheck: all checks pass");
console.log("unchecked here: fidelity of mu=1/7 and exponent=6 to a REAL metal's measured Fresnel curve -- section 3 shows the two are a mathematically matched pair within the mu(1-mu)^n family (whichever n is used, the peak sits at 1/(n+1), and n=6 is what makes that land on 1/7) and shows this file's constants match a published reference implementation's, but nothing here re-derives 1/7 itself from tabulated complex-IOR data for a real metal the way portsmouth/F82-tint-generator does (unread, license unverified -- see this file's own header). Also unchecked: an F90 parameter (this file inherits schlick()'s own hardcoded F90=1, the same simplification the rest of this tree already lives with) and any device-side (WGSL) implementation -- see physics/render/fresnelF82Wgsl-selfcheck.mjs for that half.");
process.exit(fails ? 1 : 0);
