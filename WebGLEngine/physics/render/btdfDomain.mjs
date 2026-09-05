// physics/render/btdfDomain.mjs -- v4454 -- WHERE Walter's BTDF over-counts, and it is not the term anyone
// suspected.
//
// *** v4436 MEASURED THE EXCESS. v4447 PROVED IT WAS REAL AND RULED OUT THE INNOCENT EXPLANATION. NEITHER
// COULD SAY WHERE IT CAME FROM, AND BOTH SAID SO. *** v4447 closed by naming two suspects -- the height-
// correlated G2 and the refraction Jacobian -- and said the walk was "now sharp enough to tell them apart".
// It is. THE ANSWER IS NEITHER. The over-count is not in any TERM of eq. 21; it is in the SET OF DIRECTIONS
// the formula is evaluated over. Walter's BTDF is right where it is defined and is being asked outside it.
//
// ---- *** THE FORMULA'S DOMAIN, WHICH IT NEVER STATES *** -------------------------------------------------
//
// Eq. 21 describes ONE microfacet doing ONE refraction. For that story to exist, the half-vector
//
//     h_t = -normalize(etaI * wi + etaO * wo)
//
// must be a facet of an upward-facing heightfield that the incoming light actually strikes:
//
//     (D1)  h_t . n > 0     -- the facet exists, i.e. it points out of the surface and not into it
//     (D2)  h_t . wi > 0    -- the facet is LIT, i.e. its outward face is the one the light arrives on
//
// Outside (D1) and (D2) there is no such microfacet and the correct answer is ZERO. transmission.mjs returns
// a number instead, in two places, and BOTH are absolute values that look like defensive hygiene:
//
//   * `halfVectorT` ends with `h[2] < 0 ? scale(h, -1) : h`. When (D1) fails that flip does not sanitise a
//     sign -- IT INVENTS A DIFFERENT FACET, one pointing the opposite way, and hands it to D as though it
//     were the one the geometry asked for.
//   * `Math.abs(iDotH)` reaches Fresnel and the Jacobian. When (D2) fails that abs does not sanitise a sign
//     -- IT LIGHTS A FACET FROM BEHIND, computing the transmission through a face the light never met.
//
// *** SO THE BUG IS TWO ABS()ES, AND AN ABS IS THE MOST INNOCENT-LOOKING THING IN A SHADER. *** Every term is
// correct. Every line is defensible in isolation. The energy comes from the DOMAIN, which no line owns.
//
// ---- *** THE PROOF THAT IT IS AN OVER-COUNT AND NOT A MODELLING CHOICE *** ---------------------------------
//
// Argue by a bound the formula cannot be allowed to break. Take masking only, G = G1(wi): no shadowing of the
// outgoing ray, the most generous physical choice there is. Then eq. 21 times |wo.n| is ALGEBRAICALLY
//
//     f_t |wo.n| dw_o  =  (1 - F) * [ D(h) G1(wi) |wi.h| / |wi.n| ] dw_h  =  (1 - F) * VNDF(h) dw_h
//
// because the bracket in the middle IS the visible-normal distribution and the Jacobian is exactly what turns
// dw_o into dw_h. The VNDF is a PROBABILITY DENSITY: it integrates to 1 over the hemisphere, by construction,
// for every alpha and every incidence. So the transmitted integral CANNOT EXCEED 1, and cannot exceed the
// (1 - F)-weighted mass either. At alpha 1, cosI 0.25, eta 1.5 this tree measures
//
//     h-space, integral of VNDF                        1.000000   (the instrument, checked first)
//     h-space, integral of (1 - F) * VNDF              0.916252   (the ceiling)
//     o-space, G1(wi), (D1) and (D2) ENFORCED          0.917790   -- the change of variables, exact
//     o-space, G1(wi), AS WRITTEN                      1.878929   -- 2.05x A QUANTITY BOUNDED BY ONE
//
// The third line and the second agree to 1.5e-3, which is the quadrature. The fourth is the bug, and it is
// not a near miss or a tolerance argument: it is twice a probability.
//
// ---- *** AND THE WALK PUTS EXACT ZEROS EXACTLY WHERE THE ABS()ES INVENT ENERGY *** --------------------------
//
// v4447's dielectric walk, restricted to paths that bounce ONCE AND THEN ESCAPE -- which is what a single-
// scattering BTDF models -- binned by |wo.n| over 300,000 paths at alpha 1, cosI 0.25:
//
//     bin |wo.n|     walk, single scatter    walk, multi     Walter's share of its own total
//      0  0.0-0.1              0                 85                  4.03%   <- 100% flipped   (D1)
//      9  0.9-1.0              0              45038                  5.73%   <- 100% backfacing (D2)
//
// NOT "few". NOT "small". ZERO, twice, out of three hundred thousand, and populated only once more than one
// bounce is allowed. A single-scattering model that puts energy where single scattering provably cannot go is
// not approximating anything.
//
// (D1) fails on a closed form rather than a tendency: the raw half-vector points down exactly when
//
//     |wo.n|  <  (nAbove / nBelow) * |wi.n|                                  -- `flipBoundary` below
//
// At cosI 0.25 and eta 1.5 that is |wo.n| < 0.16667, which IS bin 0 and the lower third of bin 1.
//
// ---- *** WHAT THIS ROUND RULES OUT, HAVING SUSPECTED IT LAST ROUND *** --------------------------------------
//
// G is not the culprit. Swapping the height-correlated G2 for the separable G1G1, for masking alone, and for
// no G at all moves the total across 1.24 / 0.93 / 1.88 / 4.70 -- a factor of five -- while the impossible-
// domain SHARE barely moves at all: 46.66%, 48.01%, 51.15%, 51.15%. A term that swings the answer five-fold
// without touching the defect is not the defect. The Jacobian is
// not the culprit either: it is the largest-varying factor across the exit cone (78.1 down to 1.89, a 41x
// swing against D's flat 0.3183) and it is EXACTLY RIGHT -- it is what makes the o-space and h-space
// integrals agree to 1.5e-3 on the honest domain. *** THE BIGGEST-LOOKING TERM WAS THE INNOCENT ONE. ***
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ------------------------------------------------------------------------
//
// That enforcing the domain FIXES the lobe. It does not. At alpha 1, cosI 0.25 the walk's single-scatter truth
// is 0.306083; Walter with G2 as written gives 1.244343 (4.07x) and with the domain enforced 0.663694 (2.17x).
// The domain error is roughly half the excess and the rest is the masking model, which is a different round.
// What is settled is WHERE half of it lives, on a bound rather than on a fit.
//
// That the fix is free. Enforcing (D1) and (D2) makes the lobe darker, and a renderer that has been tuned
// against the bright version will notice. This module therefore DIAGNOSES and does not patch transmission.mjs:
// `btdfDomain` is offered beside eq. 21, not in place of it, so the two can be measured against each other.
//
// That this is visible at production roughness. At alpha 0.05 the impossible domains carry under 1.3% at every
// incidence tested. It is a HIGH-ROUGHNESS defect, which is why smooth-glass renders never caught it.
//
// ---- *** THE TRAP THIS ROUND FELL INTO FIRST, RECORDED BECAUSE IT IS THE FILE'S OWN LESSON *** ---------------
//
// The first G-swap probe integrated the REVERSE transport direction -- fixing the OUTGOING direction and
// sweeping the incoming one -- and got 0.553045 where the forward convention gives 1.244351. Those differ by
// 2.2500, which is eta^2. transmission.mjs's header is ABOUT the eta^2 factor and its own first draft got it
// backwards the same way; the file says so at line 100. *** A NON-RECIPROCAL LOBE PUNISHES A SWAPPED
// CONVENTION WITH A CLEAN, PLAUSIBLE, WRONG NUMBER, AND 0.553 LOOKS FAR MORE LIKE A PHYSICAL ANSWER THAN
// 1.244 DOES. *** The one that looked healthy was the broken measurement.

import { D, G1, G2 } from "./microfacet.mjs";
import { fresnel } from "./fresnel.mjs";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const indexOn = (dir, nAbove, nBelow) => (dir[2] >= 0 ? nAbove : nBelow);

/**
 * The transmission half-vector WITHOUT the upward flip -- the facet the geometry actually asks for, sign and
 * all. transmission.mjs's `halfVectorT` is this followed by `h[2] < 0 ? -h : h`, and that last step is half
 * of what this module is about, so it cannot be imported from there.
 */
export function rawHalfVector(wi, wo, nAbove, nBelow) {
    const etaI = indexOn(wi, nAbove, nBelow), etaO = indexOn(wo, nAbove, nBelow);
    return norm([
        -(etaI * wi[0] + etaO * wo[0]),
        -(etaI * wi[1] + etaO * wo[1]),
        -(etaI * wi[2] + etaO * wo[2]),
    ]);
}

/**
 * The exact incidence below which (D1) fails: for |wo.n| under this, the raw half-vector points DOWN and no
 * upward-facing microfacet refracts wi into wo at all. Closed form, not a fitted threshold.
 */
export const flipBoundary = (cosI, nAbove, nBelow) => (nAbove / nBelow) * Math.abs(cosI);

export const DOMAIN = Object.freeze({
    honest: "honest",             // (D1) and (D2) both hold -- eq. 21 means something here
    flipped: "flipped",           // (D1) fails: the facet points into the surface
    backfacing: "backfacing",     // (D2) fails: the facet exists but its lit face is the other one
    both: "both",                 // neither holds
    notTransmission: "notTransmission",   // wi and wo are on the same side; no BTDF configuration
});

/** Which of the four cases a direction pair is in. This is the whole finding, as a function. */
export function classify(wi, wo, { nAbove, nBelow }) {
    if (wi[2] * wo[2] >= 0) return DOMAIN.notTransmission;
    const h = rawHalfVector(wi, wo, nAbove, nBelow);
    const down = h[2] <= 0, dark = dot(wi, h) <= 0;
    return down && dark ? DOMAIN.both : down ? DOMAIN.flipped : dark ? DOMAIN.backfacing : DOMAIN.honest;
}

/**
 * Walter eq. 21 with the domain enforced and the masking term SELECTABLE, so that the bound argument above
 * can be run on the term it applies to. `g` is one of "g2" (height-correlated, what transmission.mjs ships),
 * "separable" (G1 G1), "masking" (G1 of the incoming only -- the one bounded by the VNDF), or "none".
 *
 * `enforce: false` reproduces transmission.mjs exactly, abs()es and all, which is what makes the difference
 * between the two calls the measurement rather than a rewrite.
 */
export function btdfDomain(wi, wo, { alpha, nAbove, nBelow, g = "g2", enforce = true }) {
    if (wi[2] * wo[2] >= 0) return 0;
    const etaI = indexOn(wi, nAbove, nBelow), etaO = indexOn(wo, nAbove, nBelow);
    const hRaw = rawHalfVector(wi, wo, nAbove, nBelow);
    const iDotH = dot(wi, hRaw), oDotH = dot(wo, hRaw);
    if (enforce && (hRaw[2] <= 0 || iDotH <= 0)) return 0;
    const denom = etaI * iDotH + etaO * oDotH;
    if (denom === 0) return 0;
    const F = fresnel(Math.abs(iDotH), etaI, etaO).R;
    const Dv = D(enforce ? hRaw[2] : Math.abs(hRaw[2]), alpha);
    const ci = Math.abs(wi[2]), co = Math.abs(wo[2]);
    const Gv = g === "g2" ? G2(co, ci, alpha)
        : g === "separable" ? G1(co, alpha) * G1(ci, alpha)
        : g === "masking" ? G1(ci, alpha)
        : 1;
    const jac = (Math.abs(iDotH) * Math.abs(oDotH)) / (ci * co);
    return jac * (etaO * etaO * (1 - F) * Gv * Dv) / (denom * denom);
}

/**
 * The transmitted integral split by which part of the domain it came from. The incident direction is FIXED
 * and the outgoing one is swept, matching `energySplit`'s convention -- see the trap in this file's header
 * for what the other convention costs.
 */
export function domainSplit(cosI, { alpha, nAbove, nBelow, g = "g2", N = 256, M = 128 }) {
    const wi = [Math.sqrt(Math.max(0, 1 - cosI * cosI)), 0, cosI];
    const out = { all: 0, honest: 0, flipped: 0, backfacing: 0, both: 0 };
    for (let a = 0; a < N; a++) {
        const phi = (2 * Math.PI * (a + 0.5)) / N, cp = Math.cos(phi), sp = Math.sin(phi);
        for (let b = 0; b < M; b++) {
            const ct = (b + 0.5) / M, st = Math.sqrt(Math.max(0, 1 - ct * ct));
            const wo = [st * cp, st * sp, -ct];
            const v = btdfDomain(wi, wo, { alpha, nAbove, nBelow, g, enforce: false }) * ct * ((2 * Math.PI) / (N * M));
            out.all += v;
            out[classify(wi, wo, { nAbove, nBelow })] += v;
        }
    }
    out.impossible = out.flipped + out.backfacing + out.both;
    return out;
}

/**
 * The ceiling, computed in HALF-VECTOR space where no change of variables has been applied. `mass` must come
 * out at 1 -- that is the instrument checking itself before it is allowed to convict anything -- and
 * `weighted` is the most a masking-only transmission lobe may integrate to.
 */
export function vndfCeiling(cosI, { alpha, nAbove, nBelow, N = 512, M = 256 }) {
    const wi = [Math.sqrt(Math.max(0, 1 - cosI * cosI)), 0, cosI];
    const g1 = G1(Math.abs(wi[2]), alpha);
    let mass = 0, weighted = 0;
    for (let a = 0; a < N; a++) {
        const phi = (2 * Math.PI * (a + 0.5)) / N, cp = Math.cos(phi), sp = Math.sin(phi);
        for (let b = 0; b < M; b++) {
            const ct = (b + 0.5) / M, st = Math.sqrt(Math.max(0, 1 - ct * ct));
            const h = [st * cp, st * sp, ct], iH = dot(wi, h);
            if (iH <= 0) continue;                      // a facet the light never reaches carries no density
            const d = (D(ct, alpha) * g1 * iH) / Math.abs(wi[2]) * ((2 * Math.PI) / (N * M));
            mass += d;
            weighted += d * (1 - fresnel(iH, nAbove, nBelow).R);
        }
    }
    return { mass, weighted };
}

/**
 * Exit-direction histogram of the walk, split by path length. Single scatter is what eq. 21 models; anything
 * the walk reaches only with more than one bounce is outside the formula's story by construction.
 */
export function walkBins(cosI, { alpha, nAbove, nBelow, walk, rand, n = 60000, bins = 10 }) {
    const single = new Array(bins).fill(0), multi = new Array(bins).fill(0);
    let nSingle = 0, nMulti = 0;
    for (let k = 0; k < n; k++) {
        const r = walk(cosI, alpha, nAbove, nBelow, rand);
        if (r.exit !== "transmitted") continue;
        const j = Math.min(bins - 1, Math.floor(Math.abs(r.dir[2]) * bins));
        if (r.bounces === 1) { single[j]++; nSingle++; } else { multi[j]++; nMulti++; }
    }
    return { single, multi, nSingle, nMulti, n };
}

// The measurements this round is willing to be held to. Frozen so a later round that moves them has to say so.
export const OVERCOUNT_AT_V4454 = Object.freeze({
    at: Object.freeze({ alpha: 1, cosI: 0.25, nAbove: 1, nBelow: 1.5 }),
    vndfMass: 1.000000,
    ceiling: 0.916252,               // h-space, (1 - F) weighted
    maskingEnforced: 0.917790,       // o-space, domain enforced, N 1024 x M 512 -- agrees with the ceiling
    maskingAsWritten: 1.878929,      // o-space, as transmission.mjs ships it -- 2.05x a probability
    g2AsWritten: 1.244343,
    g2Enforced: 0.663694,
    walkSingleScatter: 0.306083,
    impossibleShare: 0.4666,         // flipped + backfacing + both, as a fraction of the as-written g2 total
    impossibleShareByG: Object.freeze({ g2: 0.4666, separable: 0.4801, masking: 0.5115, none: 0.5115 }),
    flipBoundaryHere: 0.166667,
    reverseTransportTrap: Object.freeze({ got: 0.553045, times: 2.25, gives: 1.244351 }),
    zeroBins: Object.freeze({ singleScatterBin0: 0, singleScatterBin9: 0, ofPaths: 300000 }),
});
