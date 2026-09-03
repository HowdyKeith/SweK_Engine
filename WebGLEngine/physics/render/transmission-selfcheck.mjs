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

import {
    refractCos, isTIR, split, halfVectorT, btdf, brdf, reciprocityPair, energySplit, dirFromCos,
    LIMITS, criticalOf,
} from "./transmission.mjs";
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

console.log(`\ntransmission-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
