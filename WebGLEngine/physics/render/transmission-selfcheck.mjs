// physics/render/transmission-selfcheck.mjs -- v4436 -- the gate for physics/render/transmission.mjs.
//
// *** WHAT MAKES THIS FILE DIFFERENT FROM v4432'S IS THAT MOST OF IT IS EXACT. *** The principled BSDF could
// be MEASURED and almost nothing about it could be ASSERTED, and its one attempted exact limit -- the mirror
// -- turned out to be a failed integral. A dielectric interface has laws instead of limits, and four of them
// hold to machine precision here rather than to a tolerance somebody picked.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Swap nAbove/nBelow inside btdf (the role-vs-side bug this file was written after)  -> 5 RED
//  B. Drop the eta_o^2 from the BTDF numerator                                           -> 4 RED
//  C. Use Schlick where the exact Fresnel belongs                                        -> 10 RED
//     The index-matched limit is what makes this so loud: Schlick reflects 1.15e-1 off an interface that is
//     not there, where exact Fresnel reflects 2.6e-31. v4432 could only see this as a 2.1e-2 disagreement to
//     be traced; here it is wrong against an exact zero.
//  D. Remove the h[2] < 0 flip from halfVectorT                 -> 0 RED, THEN 1 RED AFTER THE REPAIR
//     *** A SABOTAGE THAT GOES ZERO RED IS A FINDING, AND THIS IS THE SECOND ROUND RUNNING THAT ONE FOUND
//     UNFALSIFIABLE CODE. *** The flip cost nothing because D() is asked for Math.abs(h[2]) and the
//     denominator is squared -- every consumer had already discarded the sign. It is a real postcondition
//     that nothing asserted, which is v4435's path check in a different file one round later. Section 2 now
//     asserts the postcondition itself: air-to-glass never needs the flip, glass-to-air always does.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the transmission excess is understood. It is measured (1.28276 worst) and its half is identified --
// the reflection lobe is cleared against an independently graded module -- but WHY Walter's single-scatter
// BTDF gains rather than loses is not derived here, and this gate holds it to a RANGE so that a change in
// either direction is a red rather than a silence. That nothing checks the sampler: every number is
// quadrature, which is item 11's whole reason for existing. And that the lobe is coloured, dispersive, or
// nested -- one interface, one index, grey.

// ---- *** SABOTAGES, RESULTS BY NAME *** --------------------------------------------------------------
//
//   G. chi+ also rejects grazing facets (|i.h| < 0.3)        -> 5 RED
//   H. halfVectorT stops flipping the half-vector up         -> 6 RED
//   I. the Beta G2 becomes the reflection form               -> 3 RED
//   J. chi+ drops the outgoing-side test                     -> 5 RED
//   K. chi+ drops the incident-side test                     -> 4 RED
//
// J was the branch that went 0 RED at v4458 and is now reachable from two directions at once.

// ---- *** SABOTAGES, RESULTS BY NAME *** --------------------------------------------------------------
//
//   A. chi+ drops the incident-side test                     -> 3 RED
//   B. chi+ drops the outgoing-side test                     -> 4 RED
//   C. the Beta G2 becomes the reflection form               -> 2 RED
//   D. the Beta G2 becomes the separable form                -> 2 RED
//   E. chiPlus becomes a no-op                               -> 4 RED
//   F. the probe's noFresnel is ignored                      -> 3 RED
//
// *** B WENT 0 RED THE FIRST TIME, AND THAT IS WHERE THIS ROUND'S OWN DEFECT WAS FOUND. *** With the first
// version of validHalfT the back-face test was unreachable -- on 460,800 configurations across eight index
// ratios the earlier tests already implied it. Chasing the unreachable branch found the reason: that version
// required the RAW half-vector to point up, which holds going INTO glass and fails coming OUT, so it returned
// ZERO transmission for every direction leaving glass -- and no row in this file could see it, because every
// row used LIMITS.glass. A predicate exercised on one side of a branch, committed inside the round whose
// whole subject is a term nobody exercised. The repair made B reachable and it now goes 4 RED.

import {
    refractCos, isTIR, split, halfVectorT, btdf, brdf, reciprocityPair, energySplit, dirFromCos,
    LIMITS, criticalOf, validHalfT, g2Transmission, BTDF_VERDICT_V4458 as V,
} from "./transmission.mjs";
import { refract, split as walkSplit } from "./dielectricWalk.mjs";
import { rng, sampleHeight, sampleVNDF } from "./microsurfaceWalk.mjs";
import { G1 } from "./microfacet.mjs";
import { directionalAlbedo as ggxAlbedo } from "./microfacet.mjs";
import { fresnel } from "./fresnel.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const near = (n, got, want, tol, d = "") =>
    ok(n, Math.abs(got - want) <= tol, `${d}${d ? "   " : ""}got ${got} want ${want} (tol ${tol})`);
const say = (m) => console.log("  ----  " + m);

console.log("transmission-selfcheck -- rough specular transmission, and four laws that are exact\n");

// ---- 1. SNELL, AND R + T = 1 -----------------------------------------------------------------------------
console.log("1. the smooth interface -- exact, at every angle");

// *** THE TOLERANCE HERE IS RELATIVE, AND AN ABSOLUTE ONE IS NOT ACHIEVABLE NEAR NORMAL INCIDENCE. *** At
// cos 0.999 the sine is sqrt(1 - 0.999^2): a difference of two near-equal numbers, so the result carries
// about four digits fewer than the inputs do. Asserting 1e-15 absolute there is asserting something about
// IEEE 754 rather than about Snell, and it went red on a correct refraction.
for (const c of [0.999, 0.9, 0.6, 0.3, 0.05]) {
    const ct = refractCos(c, 1 / 1.5);
    const sinI = Math.sqrt(1 - c * c), sinT = Math.sqrt(1 - ct * ct);
    const rel = Math.abs(1 * sinI - 1.5 * sinT) / Math.max(1e-300, sinI);
    near(`Snell holds at cos ${c} (relative)`, rel, 0, 1e-12);
}
let worstSum = 0;
for (let k = 0; k <= 40; k++) {
    const c = k / 40;
    for (const [a, b] of [[1, 1.5], [1.5, 1], [1, 1.33], [1.33, 2.4]]) {
        const f = fresnel(c, a, b);
        worstSum = Math.max(worstSum, Math.abs(f.R + f.T - 1));
    }
}
// *** THIS SWEEP STARTS AT COS 0 RATHER THAN NEAR IT, AND THAT IS WHERE IT FOUND SOMETHING. ***
// physics/render/fresnel.mjs returned T = NaN at exactly grazing incidence -- the projected-solid-angle
// ratio is (n2 cosT)/(n1 cosI), so cosI = 0 is Infinity times a |t|^2 of zero. Its own gate tests cos 1e-3,
// 1e-5 and 1e-7: approaching a boundary is not evaluating it, and a NaN in T propagates silently through
// every R + T downstream. Repaired at v4436 as a branch, alongside the TIR branch it sits next to.
near("R + T = 1 across 164 (angle, index-pair) samples, cos 0 INCLUDED", worstSum, 0, 1e-14,
     "past the critical angle T is 0 and R is 1 by branch; at exactly grazing, likewise");

// ---- 2. THE CRITICAL ANGLE, AND THE HALF OF IT THAT IS NOT TRUE OF A ROUGH SURFACE ------------------------
console.log("\n2. the critical angle -- a branch on the smooth interface, a falloff on a rough one");

const crit = criticalOf(1.5, 1);
near("criticalCos(1.5, 1) is the analytic value", crit, Math.sqrt(1 - (1 / 1.5) ** 2), 1e-15);
ok("there is no critical angle going into the denser medium", criticalOf(1, 1.5) === null);
ok("just inside the critical angle transmits, just outside does not",
   !isTIR(crit + 1e-9, 1.5, 1) && isTIR(crit - 1e-9, 1.5, 1));
let leak = 0;
for (let k = 0; k <= 30; k++) leak = Math.max(leak, split(crit * k / 30, 1.5, 1).T);
ok("the SMOOTH interface transmits exactly zero past critical, at every angle", leak === 0,
   "exactly 0 and not 'below a tolerance' -- fresnel.mjs takes the branch rather than returning a small number");

// *** AND THE ROUGH LOBE DOES NOT, WHICH IS CORRECT AND WAS ASSERTED WRONG IN THE FIRST DRAFT. *** A facet
// tilted away from the macro normal can present a local incidence inside the critical angle. So the falsifier
// is not "zero" but "monotone in roughness, and vanishing with it".
const leakByAlpha = [0.001, 0.005, 0.02, 0.05, 0.15, 0.4, 0.8]
    .map((a) => energySplit({ alpha: a, ...LIMITS.fromGlass }, 0.5, { N: 384, M: 192 }).T);
say(`past-critical leakage at cos 0.5 by alpha: ${leakByAlpha.map((v) => v.toExponential(2)).join("  ")}`);
ok("the rough lobe leaks past the macroscopic critical angle -- and the leak is monotone in roughness",
   leakByAlpha.every((v, i) => i === 0 || v > leakByAlpha[i - 1]));
ok("...and vanishes with roughness, which is what says it is facet tilt and not a leak in the branch",
   leakByAlpha[0] < 1e-5 && leakByAlpha[leakByAlpha.length - 1] > 0.4);

// ---- 3. THE LAW THE BTDF OBEYS INSTEAD OF RECIPROCITY -----------------------------------------------------
// *** SABOTAGE D READ ZERO RED, WHICH IS THE SECOND ROUND RUNNING THAT A ZERO FOUND UNFALSIFIABLE CODE. ***
// halfVectorT flips its result to the upper hemisphere, and removing the flip cost NOTHING -- because D() is
// asked for Math.abs(h[2]) and the denominator is squared, so every consumer had already thrown the sign
// away. The flip is a real postcondition and it was simply never checked, so it is checked here directly:
// air-to-glass never needs the flip (the denser side's cosine dominates) and glass-to-air ALWAYS needs it.
// A postcondition nothing asserts is v4435's path check in a different file, one round later.
for (const [name, p, ci, co] of [
    ["air to glass", { alpha: 0.3, ...LIMITS.glass }, 0.6, -0.8],
    ["glass to air", { alpha: 0.3, ...LIMITS.fromGlass }, 0.9, -0.5],
]) {
    const wi = dirFromCos(ci, 1), wo = dirFromCos(Math.abs(co), -1);
    const etaI = wi[2] >= 0 ? p.nAbove : p.nBelow, etaO = wo[2] >= 0 ? p.nAbove : p.nBelow;
    const h = halfVectorT(wi, wo, etaI, etaO);
    ok(`halfVectorT returns an upper-hemisphere normal, ${name}`, h[2] >= 0, `h.z = ${h[2].toFixed(6)}`);
}

console.log("\n3. non-reciprocity, which is itself an exact law");

let worstEta = 0, worstPlain = 0;
for (const ci of [0.2, 0.45, 0.7, 0.9]) {
    for (const co of [0.3, 0.55, 0.8]) {
        const p = { alpha: 0.3, ...LIMITS.glass };
        const r = reciprocityPair(dirFromCos(ci, 1), dirFromCos(co, -1), p);
        if (r.fwd === 0) continue;
        worstEta = Math.max(worstEta, Math.abs(r.fwdScaled - r.revScaled) / r.fwdScaled);
        worstPlain = Math.max(worstPlain, Math.abs(r.fwd / r.rev - 1));
    }
}
near("f(i->o)/etaO^2 == f(o->i)/etaI^2 across 12 direction pairs", worstEta, 0, 1e-12);
ok("...and PLAIN reciprocity fails by exactly (nBelow/nAbove)^2 on the same pairs",
   Math.abs(worstPlain - (1.5 * 1.5 - 1)) < 1e-9,
   `a reciprocity row copied from the reflection side would go RED on a CORRECT lobe -- it is off by ${(1.5 ** 2).toFixed(2)}x`);

// ---- 4. THE INDEX-MATCHED LIMIT, WHERE EXACT AND SCHLICK DISAGREE ABOUT AN EXACT ANSWER -------------------
console.log("\n4. no interface at all -- the limit with a right answer to be wrong against");

for (const c of [0.9, 0.5, 0.1]) {
    const ex = energySplit({ alpha: 0.3, ...LIMITS.indexMatched }, c, { N: 192, M: 96 });
    const sc = energySplit({ alpha: 0.3, ...LIMITS.indexMatched, useSchlick: true }, c, { N: 192, M: 96 });
    ok(`at cos ${c} the exact Fresnel reflects nothing off an interface that is not there`, ex.R < 1e-20,
       `${ex.R.toExponential(2)}`);
    ok(`...and Schlick reflects ${sc.R.toExponential(2)} off it, because F0 + (1-F0)(1-cos)^5 keeps its grazing term`,
       sc.R > ex.R * 1e10 && sc.R > 1e-4);
}
near("index-matched refraction does not bend", refractCos(0.37, 1), 0.37, 1e-15);

// ---- 5. THE ENERGY, MEASURED -- AND IT GAINS ------------------------------------------------------------
console.log("\n5. the furnace, and the number came back the other way round");

// The reflection lobe is CLEARED against an independently graded module before the transmission lobe is
// blamed. Forcing the Fresnel term to 1 with a huge index contrast makes brdf() the pure GGX albedo.
let worstGgx = 0;
for (const a of [0.1, 0.3, 0.6, 1.0]) {
    const graded = ggxAlbedo(a, 0.7);
    let R = 0; const N = 384, M = 192, wi = dirFromCos(0.7, 1);
    for (let i = 0; i < N; i++) {
        const ph = (2 * Math.PI * (i + 0.5)) / N, cp = Math.cos(ph), sp = Math.sin(ph);
        for (let j = 0; j < M; j++) {
            const ct = (j + 0.5) / M, st = Math.sqrt(1 - ct * ct);
            R += brdf(wi, [st * cp, st * sp, ct], { alpha: a, nAbove: 1, nBelow: 1e9 }) * ct * (2 * Math.PI / (N * M));
        }
    }
    worstGgx = Math.max(worstGgx, Math.abs(R - graded));
}
near("this file's reflection lobe IS microfacet.mjs's graded albedo", worstGgx, 0, 1e-5,
     "so when the total exceeds one, the reflection half is not the half doing it");

const nearSmooth = energySplit({ alpha: 0.02, ...LIMITS.glass }, 0.7, { N: 768, M: 384 });
const fr = split(0.7, 1, 1.5);
near("as roughness goes to zero the split becomes Fresnel's -- R", nearSmooth.R, fr.R, 5e-4);
near("...and T", nearSmooth.T, fr.T, 5e-4);

let worstTotal = 0, worstAt = null;
for (const a of [0.05, 0.2, 0.4, 0.6, 0.8, 1.0]) {
    for (const c of [0.25, 0.4, 0.55, 0.7, 0.85, 0.98]) {
        const e = energySplit({ alpha: a, ...LIMITS.glass }, c, { N: 288, M: 144 });
        if (e.total > worstTotal) { worstTotal = e.total; worstAt = { a, c }; }
    }
}
say(`worst R + T over 36 (alpha, cos) combinations: ${worstTotal.toFixed(5)} at alpha ${worstAt.a}, cos ${worstAt.c}`);
// *** HELD TO A RANGE, NOT A CEILING. *** The excess is real and unexplained; asserting "<= 1" would assert
// something false, and asserting nothing would let it drift. A range makes a move in EITHER direction a red.
ok("!! the rough dielectric CREATES energy, and it is held to a range rather than to a bound",
   worstTotal > 1.2 && worstTotal < 1.4,
   `${worstTotal.toFixed(5)} -- v4432 measured 1.0796 creating energy on the OPAQUE model; the transmission ` +
   "lobe more than triples that, and the mechanism is not derived here");

// ---- 6. v4458 -- THE TWO CANDIDATES v4447 NAMED, TOLD APART -------------------------------------------------
//
// v4447 left the lobe convicted and the mechanism open: "a question about Walter's Jacobian or the
// height-correlated G2". Section 5 above still asserts the SHIPPED excess, because the defaults have not
// changed; this section says which term makes it.
console.log("\n6. which term over-counts: the Jacobian, or the height-correlated G2?");

// *** THE CONFIGURATION WITH A CLOSED-FORM ANSWER, AND IT TESTS THE CHANGE OF VARIABLE AND NOTHING ELSE. ***
// Going INTO the denser medium there is no total internal reflection at all, so with masking reduced to
// G1(i) and Fresnel switched off, every visible microfacet refracts and the transmitted integral must be
// EXACTLY 1 -- not converged, not bounded. No G2, no F, no walk, no multiple scattering.
const probe = (alpha, cosI, chiPlus) =>
    energySplit({ alpha, ...LIMITS.glass, g2: "g1i", noFresnel: true, chiPlus }, cosI, { N: 1024, M: 512 }).T;
{
    const rows = [[1, 0.25], [1, 0.5], [1, 0.7], [1, 0.9], [0.6, 0.5], [0.4, 0.25], [0.4, 0.7], [0.2, 0.5], [0.05, 0.7]];
    const shipped = rows.map(([a, c]) => probe(a, c, false));
    const fixed = rows.map(([a, c]) => probe(a, c, true));
    say(`probe as shipped:  ${shipped.map((v) => v.toFixed(4)).join(" ")}`);
    say(`probe with chi+:   ${fixed.map((v) => v.toFixed(4)).join(" ")}`);
    ok("!! *** THE JACOBIAN IS INNOCENT: with chi+ restored the probe is 1 at every roughness and angle ***",
       fixed.every((v) => Math.abs(v - 1) < 3e-3),
       `worst departure ${Math.max(...fixed.map((v) => Math.abs(v - 1))).toExponential(2)} from an EXACT 1. ` +
       "Walter's change of variable is right and was never the problem.");
    ok("!! ...and as shipped the same probe reads up to 2.06, which is the missing chi+ and only that",
       Math.max(...shipped) > 2 && shipped[shipped.length - 1] < 1.01,
       `worst ${Math.max(...shipped).toFixed(6)} at alpha 1, and 1.0021 at alpha 0.05 -- the fabrication ` +
       "vanishes with roughness, which is why the lobe looked correct where a renderer usually lives");
}

// *** THE ROW THIS ROUND FIRST WROTE HERE IS RETIRED, AND SECTION 7 IS WHY. *** It pinned "the chi+ is exact
// INTO the denser medium and INCOMPLETE OUT OF IT" and said the gap would go red when the predicate was
// completed. The predicate needed no completing: the TARGET was wrong. Section 7 carries the resolution and
// the empty population that hid it, because a retired claim deleted without its reason is how a tree forgets
// what it learned.

// *** AND THE SECOND SUSPECT IS GUILTY TOO, SEPARATELY. *** With chi+ restored the lobe is still bright, and
// the walk's SINGLE-BOUNCE transmission is the exact thing a single-scatter lobe should equal.
{
    const T = (alpha, cosO, opts) => energySplit({ alpha, ...LIMITS.glass, ...opts }, cosO, { N: 1024, M: 512 }).T;
    let worstBeta = 0, worstSep = 0;
    for (const r of V.rows) {
        const w = walkSplit(r.cosO, r.alpha, 1, 1.5, { n: 200000, seed: 13, onlyBounces: 1 }).T;
        const chiOnly = T(r.alpha, r.cosO, { chiPlus: true });
        const beta = T(r.alpha, r.cosO, { chiPlus: true, g2: "beta" });
        const sep = T(r.alpha, r.cosO, { chiPlus: true, g2: "separable" });
        say(`alpha ${r.alpha} cos ${r.cosO}: shipped ${r.shipped.toFixed(6)}  chi+ ${chiOnly.toFixed(6)}  ` +
            `+separable ${sep.toFixed(6)}  +BETA ${beta.toFixed(6)}  | walk one bounce ${w.toFixed(6)}`);
        worstBeta = Math.max(worstBeta, Math.abs(beta - w));
        worstSep = Math.max(worstSep, Math.abs(sep - w));
    }
    ok("!! *** BOTH CORRECTIONS TOGETHER REPRODUCE THE WALK'S SINGLE BOUNCE ***",
       worstBeta < 2e-3,
       `worst departure ${worstBeta.toExponential(2)} over six configurations, against a walk standard error ` +
       "near 1e-3 at 200k paths. A single-scatter lobe should equal a single bounce, and now it does.");
    ok("!! and WALTER'S OWN separable G1(i)G1(o) would NOT have fixed it -- the obvious repair, ruled out",
       worstSep > 0.15,
       `worst departure ${worstSep.toExponential(2)}, five times the correction that remains. The 2007 paper ` +
       "uses the separable form; it lands at 0.4847 where the truth is 0.3066 at alpha 1, cos 0.25.");
}

// *** THE BETA FORM, CONFIRMED OFF THE MICROSURFACE, SHARING NO CODE WITH THE ENERGY INTEGRAL. *** Conditioned
// on a facet being visible from i, the probability the refracted ray escapes below in ONE step is
// G2_t / G1(i) = (1 + Lambda_i) B(1 + Lambda_i, 1 + Lambda_o). Counted on the walk's own heights.
{
    const measure = (cosI, alpha, n = 120000, seed = 5) => {
        const rand = rng(seed), wi = dirFromCos(cosI, 1);
        let refr = 0, esc = 0, pred = 0;
        for (let k = 0; k < n; k++) {
            const wrIn = [-wi[0], -wi[1], -wi[2]];
            const h0 = sampleHeight(wrIn, 1 + 1e-4, rand(), alpha);
            if (!Number.isFinite(h0)) continue;
            const wm = sampleVNDF(wi, alpha, rand(), rand());
            const t = refract(wrIn, wm, 1 / 1.5);
            rand(); rand();
            if (t === null) continue;
            refr++;
            pred += g2Transmission(wi[2], t[2], alpha) / G1(Math.abs(wi[2]), alpha);
            if (!Number.isFinite(sampleHeight([t[0], t[1], -t[2]], -h0, rand(), alpha))) esc++;
        }
        return { measured: esc / refr, predicted: pred / refr };
    };
    let worst = 0;
    for (const [alpha, cosI] of [[1, 0.25], [1, 0.5], [1, 0.7], [0.4, 0.5], [0.2, 0.7]]) {
        const m = measure(cosI, alpha);
        say(`alpha ${alpha} cos ${cosI}: escape measured ${m.measured.toFixed(6)} against (1+Li) B(1+Li,1+Lo) ${m.predicted.toFixed(6)}`);
        worst = Math.max(worst, Math.abs(m.measured / m.predicted - 1));
    }
    ok("!! the Beta form predicts the walk's own escape probability, with no energy integral involved",
       worst < 0.02,
       `worst relative departure ${(100 * worst).toFixed(2)}%. Two routes to the same G2 that share no code: ` +
       "one integrates a BSDF over the hemisphere, the other counts rays leaving a microsurface.");
}

// *** AND THE ENERGY CLOSES THE RIGHT WAY ROUND. *** A single-scatter lobe must LOSE energy -- it has no
// multiple scattering to supply the rest -- and the deficit is what the walk's later bounces return.
{
    // *** ASSERTED BY REFINEMENT, NOT AT ONE GRID, AND THE FIRST VERSION OF THIS CHECK WENT RED FOR EXACTLY
    // THE REASON v4436 WROTE DOWN. *** At N = 288 the corrected total reads 1.00114 at alpha 0.2 -- above
    // one, which would convict the repair. Refine and it falls: 1.001138 -> 0.997470 -> 0.995462 -> 0.994964.
    // A number that MOVES when you refine the grid is the grid. And the contrast is the whole argument:
    // the SHIPPED excess does not move at all -- 1.282772 -> 1.282755 -> 1.282754 -- which is what makes it
    // the model.
    const tot = (a, c, N, opts) => energySplit({ alpha: a, ...LIMITS.glass, ...opts }, c, { N, M: N / 2 }).total;
    const ladder = [288, 512, 1024, 2048].map((N) => tot(0.2, 0.98, N, { chiPlus: true, g2: "beta" }));
    const shippedLadder = [288, 1024, 2048].map((N) => tot(1, 0.25, N, {}));
    say(`corrected at alpha 0.2 cos 0.98, refining: ${ladder.map((v) => v.toFixed(6)).join(" -> ")}`);
    say(`shipped at alpha 1 cos 0.25, refining:     ${shippedLadder.map((v) => v.toFixed(6)).join(" -> ")}`);
    ok("!! the shipped excess is the MODEL: it does not move when the grid is refined",
       Math.abs(shippedLadder[0] - shippedLadder[2]) < 1e-4 && shippedLadder[2] > 1.28,
       `${shippedLadder.map((v) => v.toFixed(6)).join(" -> ")} -- v4436's rule, and the reason the excess was ` +
       "ever believed rather than blamed on the integrator");
    const hard = [[0.05, 0.98], [0.05, 0.85], [0.2, 0.98], [1, 0.25], [0.4, 0.7]];
    const worstFine = Math.max(...hard.map(([a, c]) => tot(a, c, 2048, { chiPlus: true, g2: "beta" })));
    ok("!! *** WITH BOTH CORRECTIONS THE ROUGH DIELECTRIC STOPS CREATING ENERGY ***",
       ladder[3] < ladder[0] && worstFine <= 1.0005,
       `worst R + T at a resolving grid over the five hardest cells: ${worstFine.toFixed(6)}, against the ` +
       "shipped 1.28277. A DEFICIT is the correct sign for a single-scatter lobe, and the walk's later " +
       "bounces are what supply the rest.");
}

// *** v4458 -- THE OPEN ROW ABOVE WAS THE CHECK, NOT THE PREDICATE, AND THE REASON IT HID IS AN EMPTY
// POPULATION ON ONE SIDE OF A BRANCH -- THE SAME SHAPE AS THE SABOTAGE THAT WENT 0 RED. ***
//
// This round first pinned "the chi+ is exact INTO the denser medium and INCOMPLETE OUT OF IT": it read 0.393540
// leaving glass against a target of 0.510957, and it did not move under refinement, so it was called the
// predicate. IT WAS THE TARGET. `1 - P(TIR)` counts every visible normal that refracts -- INCLUDING THE ONES
// WHOSE REFRACTED RAY LEAVES UPWARD, which an integral over the lower hemisphere cannot contain and a
// single-scatter lobe must not count. Measured off the microsurface at alpha 1, cos 0.25 leaving glass:
//
//        TIR 0.491565     leaves DOWN 0.392720     leaves UP 0.115715
//
// and the probe reads 0.393541. *** GOING INTO THE DENSER MEDIUM THE UP-LEAVING POPULATION IS EMPTY -- 0.000000
// AT EVERY ROUGHNESS -- because refraction toward the normal cannot turn a downward ray upward. So the wrong
// target agreed with the right one on the whole forward direction, and the first configuration that could
// tell them apart was the one v4436 never measured. ***
console.log("\n7. the chi+ in the direction v4436 never measured, and the target that was wrong");
{
    // the honest target: refracts AND leaves downward, counted on the same microsurface the walk uses
    const fates = (cosI, alpha, ei, eo, n = 200000, seed = 3) => {
        const rand = rng(seed), wi = dirFromCos(cosI, 1);
        let tir = 0, down = 0, up = 0;
        for (let k = 0; k < n; k++) {
            const m = sampleVNDF(wi, alpha, rand(), rand());
            const t = refract([-wi[0], -wi[1], -wi[2]], m, ei / eo);
            if (t === null) { tir++; continue; }
            if (t[2] < 0) down++; else up++;
        }
        return { tir: tir / n, down: down / n, up: up / n };
    };
    const probe = (alpha, cosI, L) =>
        energySplit({ alpha, ...L, g2: "g1i", noFresnel: true, chiPlus: true }, cosI, { N: 1024, M: 512 }).T;

    let worst = 0, upSeen = 0, upForward = 0;
    for (const [L, ei, eo] of [[LIMITS.glass, 1, 1.5], [LIMITS.fromGlass, 1.5, 1]])
        for (const [a, c] of [[1, 0.25], [1, 0.7], [0.4, 0.25], [0.4, 0.7], [0.4, 0.9], [0.05, 0.9]]) {
            const f = fates(c, a, ei, eo), p = probe(a, c, L);
            worst = Math.max(worst, Math.abs(p - f.down));
            if (ei > eo) upSeen = Math.max(upSeen, f.up); else upForward = Math.max(upForward, f.up);
        }
    ok("!! *** THE chi+ IS EXACT IN BOTH DIRECTIONS: the probe is the down-leaving fraction, not 1 - P(TIR) ***",
       worst < 2e-3,
       `worst departure ${worst.toExponential(2)} over twelve rows spanning both index directions, against a ` +
       "sampler standard error near 1e-3. This round first called the predicate incomplete on a target that counted " +
       "refractions the lower hemisphere cannot hold.");
    ok("!! and the population that hid it is EMPTY going into the denser medium",
       upForward === 0 && upSeen > 0.1,
       `refracted rays leaving UPWARD: ${upForward.toFixed(6)} of every sample entering glass, up to ` +
       `${upSeen.toFixed(6)} leaving it. Refraction toward the normal cannot turn a downward ray upward, so ` +
       "the wrong target and the right one agree on the entire forward direction. THE BRANCH WAS NEVER WRONG " +
       "WHERE ANYBODY HAD LOOKED.");

    // *** STRONGER THAN THE INTEGRAL, AND CHEAPER: take REAL refractions off the microsurface and ask whether
    // the formula's reconstruction admits them. This asks about every configuration one at a time rather than
    // about their integral, so a rejection cannot be cancelled by an over-count somewhere else. ***
    let admitted = 0, total = 0, reconstructed = 0;
    for (const [ei, eo] of [[1, 1.5], [1.5, 1], [1, 1.33], [1.33, 1]])
        for (const [a, c] of [[1, 0.25], [1, 0.7], [0.4, 0.5], [0.05, 0.9]]) {
            const rand = rng(9), wi = dirFromCos(c, 1);
            for (let k = 0; k < 20000; k++) {
                const m = sampleVNDF(wi, a, rand(), rand());
                const t = refract([-wi[0], -wi[1], -wi[2]], m, ei / eo);
                if (t === null || t[2] >= 0) continue;
                total++;
                const h = halfVectorT(wi, t, ei, eo);
                if (Math.hypot(h[0] - m[0], h[1] - m[1], h[2] - m[2]) < 1e-9) reconstructed++;
                if (validHalfT(wi, t, ei, eo) !== null) admitted++;
            }
        }
    ok("!! *** EVERY REAL REFRACTION IS ADMITTED BY THE chi+, ONE AT A TIME RATHER THAN IN AN INTEGRAL ***",
       admitted === total && total > 100000,
       `${admitted} of ${total} refractions sampled off the microsurface across four index ratios, and the ` +
       `half-vector reconstructs the SAMPLED FACET NORMAL exactly in ${reconstructed} of them. So the chi+ ` +
       "removes only configurations that are not refractions, which is the property it is for.");
}

// *** AND THE SECOND SUSPECT, CHECKED IN THE DIRECTION IT WAS NEVER CHECKED IN. *** The first half of this round validated the Beta
// G2 against the walk going INTO glass. Leaving glass the shipped lobe is worse -- TEN TIMES the truth at
// grazing -- and the correction holds there too.
console.log("\n8. leaving glass: the same two corrections, against the same ground truth");
{
    let worst = 0, worstShipped = 0;
    for (const [a, c] of [[1, 0.25], [1, 0.7], [1, 0.9], [0.4, 0.7], [0.4, 0.9], [0.05, 0.9]]) {
        const P = (o) => energySplit({ alpha: a, ...LIMITS.fromGlass, ...o }, c, { N: 1024, M: 512 }).T;
        const w = walkSplit(c, a, 1.5, 1, { n: 200000, seed: 13, onlyBounces: 1 }).T;
        const beta = P({ chiPlus: true, g2: "beta" }), shipped = P({});
        say(`alpha ${a} cos ${c}: shipped ${shipped.toFixed(6)}  corrected ${beta.toFixed(6)}  | walk one bounce ${w.toFixed(6)}`);
        worst = Math.max(worst, Math.abs(beta - w));
        worstShipped = Math.max(worstShipped, shipped / Math.max(w, 1e-9));
    }
    ok("!! *** BOTH CORRECTIONS REPRODUCE THE WALK LEAVING THE DENSER MEDIUM TOO ***",
       worst < 2.5e-3,
       `worst departure ${worst.toExponential(2)} over six configurations. The derivation never mentioned ` +
       "which way the light was going, and now neither does the evidence.");
    ok("!! ...and the shipped lobe is worse in this direction, not better",
       worstShipped > 8,
       `up to ${worstShipped.toFixed(1)}x the truth at alpha 1, cos 0.25 -- 0.553041 against 0.053250. ` +
       "v4436 measured R + T going INTO glass, where the total still reads below one leaving it, so the " +
       "worse half of the defect never appeared in the number that raised the alarm.");
}

console.log(`\ntransmission-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
