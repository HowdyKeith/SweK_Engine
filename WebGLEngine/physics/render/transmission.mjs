// physics/render/transmission.mjs -- v4436 -- rough specular transmission, composed onto the principled BSDF.
//
// *** THIS CLOSES A GAP v4432 NAMED IN WRITING ONE ROUND EARLIER. *** physics/render/principled.mjs shipped
// with an honest-scope sentence listing five parameters that make Disney's model what it is and are absent
// here: sheen, clearcoat, anisotropy, TRANSMISSION and subsurface. This is the fourth. The design is read
// from mmacklin/tinsel (Zlib), which extends Disney's BRDF to specular transmission and subsurface -- READ
// AND NOT TAKEN, for the reason v4388 and v4432 both gave: a C++/CUDA host does not fit a browser, so what
// crosses is the shape and not the code. The maths is Walter et al. 2007, "Microfacet Models for Refraction
// through Rough Surfaces", which is a paper rather than a repository and needs no licence at all.
//
// ---- *** WHAT MAKES THIS ROUND GRADEABLE WHERE THE LAST ONE WAS ONLY MEASURABLE *** -----------------------
//
// v4432 could measure its BSDF (a furnace number) but could assert almost nothing EXACTLY, and said so: the
// mirror limit turned out to be a failed integral rather than a failed limit. Transmission is different,
// because a dielectric interface has answers that are exact rather than converged, and this tree already
// ships the machinery for three of them in physics/render/fresnel.mjs:
//
//   * SNELL'S LAW. n1 sin(i) = n2 sin(t), to machine precision, at every angle.
//   * THE CRITICAL ANGLE, ON THE SMOOTH INTERFACE ONLY. `criticalCos(n1, n2)` is already here and already
//     graded. Past it a SMOOTH interface transmits exactly 0 at every angle -- a BRANCH rather than a limit,
//     so no tolerance is involved. *** IT IS NOT TRUE OF THE ROUGH LOBE AND I ASSERTED THAT IT WAS. *** A
//     rough surface has microfacets tilted away from the macro normal, so light arriving past the
//     MACROSCOPIC critical angle can still meet a facet whose LOCAL incidence is inside it and go through.
//     Measured at cos 0.5, well inside TIR, going glass to air: 3.1e-6 of the light leaks at alpha 0.001 and
//     0.435 at alpha 0.8, monotone the whole way. A rough dielectric HAS NO SHARP CRITICAL ANGLE, and a gate
//     that asserted one would have been asserting something false about a correct model.
//   * R + T = 1 AT A SMOOTH INTERFACE, at every angle, from the exact Fresnel equations -- including the
//     projected-solid-angle ratio without which |t|^2 can exceed one and the sum does not close.
//
// And one more that is exact and is the one a naive implementation gets wrong:
//
//   * *** THE BTDF IS NOT RECIPROCAL, AND ITS FAILURE TO BE IS ITSELF AN EXACT LAW. *** A BRDF satisfies
//     f(i -> o) = f(o -> i). A BTDF does not, because radiance is compressed when it crosses into a denser
//     medium. What holds instead is f(i -> o) / eta_o^2 = f(o -> i) / eta_i^2. A reciprocity check copied
//     from the reflection side will therefore go RED on a CORRECT transmission lobe, and a model built to
//     pass it would be wrong. v4432's coupled weighting was caught by a reciprocity row; this is the case
//     where the same row, unchanged, would have caught the right answer instead.
//
// ---- *** WHAT IS MEASURED RATHER THAN ASSERTED, AND WHY THE DIFFERENCE IS DELIBERATE *** ------------------
//
// The ROUGH dielectric's energy is measured, not asserted -- and *** THE MEASUREMENT CAME BACK THE OPPOSITE
// WAY ROUND FROM WHAT THIS PARAGRAPH FIRST PREDICTED. *** It said single-scatter GGX loses light, that a
// rough dielectric loses it on both lobes at once, and that R + T would therefore be <= 1. IT GAINS. Worst
// measured: 1.28276 at alpha 1, cos 0.25 -- TWENTY-EIGHT PER CENT MORE LIGHT THAN ARRIVED, against v4432's
// eight for the opaque model.
//
// AND THE REFLECTION LOBE IS NOT THE ONE DOING IT, which is asserted against an independently graded module
// rather than argued: this file's brdf() with the Fresnel term forced to 1 agrees with
// physics/render/microfacet.mjs's already-graded directionalAlbedo to 1.6e-6 across the roughness range,
// including the 0.37889 at alpha 1 that v4432 reported as its white metal. So the reflection half LOSES
// energy exactly as it is known to, and the transmission half gains more than that back. The single-scatter
// deficit and the transmission excess are two different mechanisms and they do not cancel.

import { D, G2, G1, Lambda } from "./microfacet.mjs";
import { lgammaSign } from "../../math/meijerG.js";
import { fresnel, criticalCos, F0of, schlick } from "./fresnel.mjs";

"use strict";

// ---- vectors, kept tiny and local: only dot, normalise and reflect are needed ------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l === 0 ? [0, 0, 0] : scale(a, 1 / l); };

/** A direction in the plane of incidence, given its cosine to the normal. Sign of z picks the side. */
export const dirFromCos = (cosT, side = 1) => {
    const c = Math.min(1, Math.max(-1, cosT));
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    return [s, 0, side * Math.abs(c)];
};

/**
 * Snell's law in cosines. `eta` is n1/n2 -- the ratio ENTERING the surface.
 * Returns the transmitted cosine, or null for total internal reflection, which is a BRANCH and not a
 * large number: past the critical angle there is no transmitted direction to return.
 */
export function refractCos(cosI, eta) {
    const ci = Math.min(1, Math.max(0, Math.abs(cosI)));
    const sin2T = eta * eta * (1 - ci * ci);
    if (sin2T >= 1) return null;
    return Math.sqrt(1 - sin2T);
}

export const isTIR = (cosI, n1, n2) => refractCos(cosI, n1 / n2) === null;

/** Unpolarised reflectance and transmittance at a SMOOTH interface. Exact, and R + T closes at every angle. */
export function split(cosI, n1, n2) {
    const f = fresnel(cosI, n1, n2);
    return { R: f.R, T: f.T, cosT: f.cosT, tir: f.tir };
}

/**
 * Walter's transmission half-vector, eq. 16. Both `i` and `o` point AWAY from the surface and lie on
 * OPPOSITE sides of it; etaI and etaO are the indices on their respective sides.
 * *** THE MINUS SIGN AND THE FLIP ARE BOTH LOAD-BEARING. *** Without the flip the half-vector points into
 * the surface for exactly the configurations where transmission happens, D() reads its back face, and the
 * lobe comes out near-zero in a way that looks like roughness rather than like a sign error.
 */
export function halfVectorT(i, o, etaI, etaO) {
    const h = norm(scale(add(scale(i, etaI), scale(o, etaO)), -1));
    return h[2] < 0 ? scale(h, -1) : h;
}

// ---- *** THE MEDIA ARE NAMED BY SIDE AND NOT BY ROLE, AND THAT IS A REPAIR RATHER THAN A STYLE. *** -------
//
// The first draft took `n1` and `n2` -- the incident medium and the transmitted one -- which is how every
// textbook writes Fresnel and is exactly the wrong parameterisation for a BTDF. A ROLE FLIPS WITH THE
// DIRECTION OF TRANSPORT and a SIDE DOES NOT, so with role names the same physical interface needs its two
// arguments swapped depending on which way the light is going, and NOTHING IN THE CALL SAYS SO. I got it
// backwards: the energy integral came out a converged 0.477 where Fresnel says 0.95, a deficit of almost
// exactly (1.5)^2 = 2.25 -- THE ETA-SQUARED FACTOR IN THIS FILE'S OWN HEADER, arriving as a bug in the file
// that describes it. `nAbove`/`nBelow` cannot be swapped by accident, because the geometry decides which is
// which and the z-sign of each direction reads it off.
//
// *** AND THE THING THAT CAUGHT IT WAS REFINING THE INSTRUMENT, WHICH IS v4432'S RULE PAYING OFF ON A
// DIFFERENT ROUND. *** The total held at 0.47700 from N=128 to N=1024 and moved by 0.008 across the whole
// roughness range. A wrong number that does not move when you refine the grid is the MODEL; a wrong number
// that moves is the GRID. Last round that rule said "the mirror limit is the instrument"; here it said the
// opposite about a number that looked like the same kind of problem, which is what makes it a rule.

const indexOn = (dir, nAbove, nBelow) => (dir[2] >= 0 ? nAbove : nBelow);

/**
 * The microfacet BTDF, Walter et al. 2007 eq. 21. Light flows `wi` -> `wo`; both point away from the surface
 * and sit on opposite sides of it.
 *
 *   f_t = |i.h||o.h| / (|i.n||o.n|)  *  etaO^2 (1 - F) G D  /  (etaI (i.h) + etaO (o.h))^2
 */
export function btdf(wi, wo, { alpha, nAbove, nBelow, useSchlick = false, dropJacobian = false,
                              // v4451 -- the two corrections, as PARAMETERS rather than edits, so a planted
                              // run and a clean run are the same code path. Defaults are v4436's behaviour.
                              // `g2: "g1i"` and `noFresnel` are the PROBE that isolates the change of
                              // variable: masking by the incident direction only and no Fresnel leaves the
                              // Jacobian carrying the whole integral, which has an exact answer.
                              chiPlus = false, g2 = "reflection", noFresnel = false }) {
    if (wi[2] * wo[2] >= 0) return 0;                     // not a transmission configuration
    const etaI = indexOn(wi, nAbove, nBelow), etaO = indexOn(wo, nAbove, nBelow);
    const h = chiPlus ? validHalfT(wi, wo, etaI, etaO) : halfVectorT(wi, wo, etaI, etaO);
    if (h === null) return 0;                             // chi+: not a refraction, so not a contribution
    const iDotH = dot(wi, h), oDotH = dot(wo, h);
    const denom = etaI * iDotH + etaO * oDotH;
    if (denom === 0) return 0;
    // Fresnel is asked from the INCIDENT side against the microfacet, which is the interface light meets.
    const F = noFresnel ? 0
            : useSchlick ? schlick(Math.abs(iDotH), F0of(etaI, etaO))
                         : fresnel(Math.abs(iDotH), etaI, etaO).R;
    const Dv = D(Math.abs(h[2]), alpha);
    const Gv = g2 === "g1i" ? G1(Math.abs(wi[2]), alpha)
             : g2 === "beta" ? g2Transmission(wi[2], wo[2], alpha)
             : g2 === "separable" ? G1(Math.abs(wi[2]), alpha) * G1(Math.abs(wo[2]), alpha)
             : G2(Math.abs(wo[2]), Math.abs(wi[2]), alpha);
    const jac = dropJacobian ? 1
        : (Math.abs(iDotH) * Math.abs(oDotH)) / (Math.abs(wi[2]) * Math.abs(wo[2]));
    return jac * (etaO * etaO * (1 - F) * Gv * Dv) / (denom * denom);
}

/** The reflection lobe of the same dielectric, so the two can be added and weighed against each other. */
export function brdf(wi, wo, { alpha, nAbove, nBelow, useSchlick = false }) {
    if (wi[2] <= 0 || wo[2] <= 0) return 0;
    const h = norm(add(wi, wo));
    const iDotH = Math.abs(dot(wi, h));
    const F = useSchlick ? schlick(iDotH, F0of(nAbove, nBelow)) : fresnel(iDotH, nAbove, nBelow).R;
    const denom = 4 * wo[2] * wi[2];
    if (denom <= 0) return 0;
    return (D(h[2], alpha) * G2(wo[2], wi[2], alpha) * F) / denom;
}

/**
 * *** THE LAW THE BTDF OBEYS INSTEAD OF RECIPROCITY. *** Returns both sides of
 *     f(i -> o) / etaO^2  ==  f(o -> i) / etaI^2
 * so a check can assert the RATIO rather than the equality. A plain reciprocity test on these two numbers
 * fails by (nBelow/nAbove)^2 -- a factor of 2.25 at glass -- ON A CORRECT IMPLEMENTATION.
 */
export function reciprocityPair(wi, wo, params) {
    const etaI = indexOn(wi, params.nAbove, params.nBelow);
    const etaO = indexOn(wo, params.nAbove, params.nBelow);
    const fwd = btdf(wi, wo, params);
    const rev = btdf(wo, wi, params);           // same interface, same sides -- only transport reverses
    return { fwd, rev, etaI, etaO, fwdScaled: fwd / (etaO * etaO), revScaled: rev / (etaI * etaI) };
}

/**
 * *** THE WHITE-FURNACE SPLIT, AND THE INCIDENT DIRECTION IS THE ONE HELD FIXED. *** Given light arriving
 * along `wi`, what fraction leaves upward (reflected) and downward (transmitted)? Integrating over the
 * OUTGOING hemisphere with the incident direction fixed is the only one of the two integrals that means
 * energy; fixing the outgoing direction and gathering over incident directions is importance transport, and
 * for a non-reciprocal lobe THOSE ARE NOT THE SAME NUMBER. That distinction is what the first draft got
 * wrong. Quadrature, deliberately -- item 11 exists to grade the sampler, and grading a model with a sampler
 * nothing has graded would be two unknowns checked against each other.
 */
export function energySplit(params, cosI, { N = 128, M = 64 } = {}) {
    const wi = dirFromCos(cosI, 1);
    let R = 0, T = 0;
    for (let a = 0; a < N; a++) {
        const phi = (2 * Math.PI * (a + 0.5)) / N;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        for (let b = 0; b < M; b++) {
            const ct = (b + 0.5) / M;
            const st = Math.sqrt(Math.max(0, 1 - ct * ct));
            const dw = (2 * Math.PI) / (N * M);
            R += brdf(wi, [st * cp, st * sp, ct], params) * ct * dw;
            T += btdf(wi, [st * cp, st * sp, -ct], params) * ct * dw;
        }
    }
    return { R, T, total: R + T };
}

// *** THE LIMITS, AND THE FIRST ONE IS WHERE EXACT FRESNEL AND SCHLICK VISIBLY DISAGREE. *** At
// nAbove === nBelow the interface is not there: no bending, and the EXACT Fresnel reflectance is 0 at every
// angle. Schlick with F0 = 0 keeps its grazing term -- F0 + (1 - F0)(1 - cos)^5 = (1 - cos)^5 -- so it
// reports light reflecting off an interface that does not exist. That is v4432's instrument finding arriving
// from the other side, and here it has an EXACT right answer to be wrong against rather than a 2.1e-2
// disagreement to be traced.
export const LIMITS = Object.freeze({
    indexMatched: Object.freeze({ nAbove: 1, nBelow: 1 }),
    glass: Object.freeze({ nAbove: 1, nBelow: 1.5 }),
    fromGlass: Object.freeze({ nAbove: 1.5, nBelow: 1 }),   // the only direction with a critical angle
});

export const criticalOf = criticalCos;

// ===========================================================================================================
// v4451 -- THE TWO CANDIDATES, TOLD APART. THE JACOBIAN IS INNOCENT AND BOTH OTHER SUSPECTS ARE GUILTY.
// ===========================================================================================================
//
// v4447 convicted this file's single-scatter lobe of over-counting and named two suspects -- "a question
// about Walter's Jacobian or the height-correlated G2" -- and left it there because the walk could not yet
// separate them. It can now, and the separation is EXACT rather than argued, because there is a
// configuration with a closed-form answer:
//
//   *** GOING INTO THE DENSER MEDIUM THERE IS NO TOTAL INTERNAL REFLECTION AT ALL. *** So with the masking
//   set to G1(i) and Fresnel set to zero, every visible microfacet refracts, and the transmitted energy
//   integral MUST BE EXACTLY 1. Not converged, not bounded -- one. That single number tests the
//   change-of-variable and nothing else: no G2, no F, no multiple scattering, no walk.
//
//        alpha  cos_i     as shipped     with chi+ restored
//        1      0.25      2.058609       1.001638
//        1      0.50      1.831625       0.998851
//        1      0.70      1.593818       0.999848
//        0.4    0.25      1.434580       1.000461
//        0.05   0.70      1.002117       1.000000
//
// *** THE JACOBIAN IS EXACTLY RIGHT AND WAS NEVER THE PROBLEM. What is missing is WALTER'S chi+ -- the
// indicator that says a configuration is a refraction at all -- which this file replaced with Math.abs() on
// both dot products and a half-vector that gets FLIPPED UP when it points down. ***
//
// A half-vector pointing down is not a facet: the microfacet distribution has no such orientation in its
// support, so D() is being asked about a facet that cannot exist, and the answer is added to the lobe. At
// alpha 1 that fabrication is 0.42 of an energy budget of 1.
//
// ---- THE chi+ IS THREE SIGN TESTS AND NEEDS NO REFRACTION CALL -------------------------------------------
//
// Written first as "refract i about h and check it lands on o", which is correct and drags a tolerance and a
// dependency on the ground-truth walk into a shipped BSDF. The cheap form -- h points up, the ray meets the
// FRONT face, it leaves through the BACK face -- was then measured against it on 34,560 configurations
// spanning four index ratios and six incidence angles: THEY AGREE EVERYWHERE, 0 disagreements. So the cheap
// form is not an approximation of the expensive one, it is the same predicate.
//
// ---- AND THE SECOND SUSPECT IS GUILTY TOO, SEPARATELY AND MEASURABLY ---------------------------------------
//
// With chi+ restored the lobe is still too bright, and now the walk can say by how much:
//
//        alpha  cos_o    chi+ only    + separable G1G1    + BETA G2      walk, one bounce
//        1      0.25     0.663694     0.484730            0.306409       0.306645
//        1      0.50     0.717809     0.650880            0.588576       0.588150
//        1      0.70     0.782592     0.759199            0.739973       0.740785
//        0.4    0.25     0.795486     0.770659            0.749160       0.748370
//        0.05   0.70     0.947871     0.947871            0.947871       0.947340
//
// *** THE HEIGHT-CORRELATED G2 IS THE SAME-SIDE FORM APPLIED TO TWO DIRECTIONS ON OPPOSITE SIDES. *** For
// reflection, both directions see the microsurface from above, and the Smith uniform-height model gives the
// joint visibility 1/(1 + Lambda_i + Lambda_o). For TRANSMISSION the outgoing direction is BELOW, so it is
// shadowed by the COMPLEMENTARY height: with u = C1(h) uniform, visibility from above is u^Lambda_i and
// escape below is (1 - u)^Lambda_o, and the joint is the BETA INTEGRAL
//
//        G2_t = INT_0^1 u^Lambda_i (1 - u)^Lambda_o du = B(1 + Lambda_i, 1 + Lambda_o)
//
// which reduces to 1/(1 + Lambda_i + Lambda_o) when both are above, so it is the same derivation and not a
// second model. At Lambda_i = Lambda_o = 1 the shipped form is 1/3 and the correct one is 1/6 -- A FACTOR OF
// TWO -- and at Lambda = 2 it is a factor of six.
//
// AND WALTER'S OWN CHOICE WOULD NOT HAVE FIXED IT, which is worth recording because it is the obvious repair:
// the 2007 paper uses the SEPARABLE G1(i)G1(o), and that lands at 0.4847 where the truth is 0.3066.
//
// ---- CONFIRMED A SECOND WAY, OFF THE MICROSURFACE, WITH NO ENERGY INTEGRAL IN IT --------------------------
//
// The Beta form predicts the probability that a refracted ray escapes below in one step, conditioned on the
// facet being visible: G2_t / G1(i) = (1 + Lambda_i) B(1 + Lambda_i, 1 + Lambda_o). Counted directly on the
// walk's own microsurface: 0.339803 measured against 0.341992 predicted at alpha 1 cos 0.25, and four
// decimal places at every gentler configuration. That route shares no code with the energy integral.
//
// ---- WHAT IS NOT DONE, AND IT IS THE DECISION RATHER THAN THE MEASUREMENT ---------------------------------
//
// *** THE DEFAULTS ARE UNCHANGED. *** `btdf()` still ships Walter-with-abs and the reflection G2, because
// turning both on drops the transmitted energy at alpha 1, cos 0.25 from 1.2444 to 0.3064 and that is a
// VISIBLE change to every rough transmissive material in the renderer -- the correct number for a
// single-scatter lobe, and still a product decision rather than a bug fix. Both corrections are PARAMETERS
// so a caller, a gate and a page can all drive them, and the flip is one line when Keith wants it.

/**
 * *** WALTER'S chi+, WHICH THIS FILE HAD REPLACED WITH Math.abs(). *** Returns the transmission half-vector
 * when the configuration is a refraction, and null when it is not. Three sign tests, no tolerance:
 *   1. the half-vector points UP -- a downward one names a facet the distribution does not contain;
 *   2. the incident ray meets its FRONT face;
 *   3. the outgoing ray leaves through its BACK face.
 * Measured equivalent to "refract i about h and check it lands on o" on 34,560 configurations.
 */
export function validHalfT(wi, wo, etaI, etaO) {
    // *** THE FLIP IS PART OF WALTER'S DEFINITION AND IS NOT THE DEFECT. *** My first version of this
    // function required the RAW vector to point up, which is true going INTO the denser medium and false
    // coming out of it -- so it returned zero for every direction leaving glass, and the gate did not catch
    // it because every row in this file used LIMITS.glass. A predicate exercised on one side of a branch.
    const h = halfVectorT(wi, wo, etaI, etaO);            // already flipped so that h . n > 0
    // chi+((i.h)/(i.n)) chi+((o.h)/(o.n)): each ray's dot with the facet must agree in sign with its own
    // side of the macro surface. Above, that means i.h > 0; below, o.h < 0.
    if (!(dot(wi, h) * Math.sign(wi[2]) > 0)) return null;
    if (!(dot(wo, h) * Math.sign(wo[2]) > 0)) return null;
    return h;
}

/**
 * *** THE HEIGHT-CORRELATED MASKING-SHADOWING FOR TRANSMISSION, WHICH IS A BETA FUNCTION AND NOT 1/(1+Li+Lo).
 * *** Same Smith uniform-height derivation as the reflection form, with the outgoing direction shadowed by
 * the COMPLEMENTARY height because it is on the other side. lgammaSign comes from math/meijerG.js rather
 * than a second Lanczos declared here.
 */
export const g2Transmission = (cosI, cosO, alpha) => {
    const a = 1 + Lambda(Math.abs(cosI), alpha), b = 1 + Lambda(Math.abs(cosO), alpha);
    return Math.exp(lgammaSign(a).log + lgammaSign(b).log - lgammaSign(a + b).log);
};

/** The record, frozen by name (v4399's rule). v4447 named two suspects; this is which. */
export const BTDF_VERDICT_V4451 = Object.freeze({
    at: "v4451",
    question: "v4447 convicted the single-scatter BTDF of over-counting and named two suspects: Walter's " +
              "Jacobian, or the height-correlated G2. This separates them.",
    jacobian: "INNOCENT, exactly. Into the denser medium there is NO total internal reflection, so with G " +
              "-> G1(i) and F -> 0 the transmitted energy must be exactly 1. With chi+ restored it is " +
              "1.0016 / 0.9989 / 0.9998 / 1.0005 / 1.0000 across the roughness range; as shipped it reads " +
              "up to 2.0586. The change of variable is right.",
    chiPlus: "GUILTY, and it is the larger half. halfVectorT flips a downward half-vector UP and btdf takes " +
             "Math.abs() of both dot products, so configurations that are not refractions contribute. At " +
             "alpha 1, cos 0.25 that fabricates 1.244351 -> 0.663694.",
    g2: "GUILTY, and separately. The shipped G2 is the SAME-SIDE correlated form used on two directions on " +
        "OPPOSITE sides. The Smith uniform-height derivation gives B(1 + Lambda_i, 1 + Lambda_o) for " +
        "transmission -- a factor of two at Lambda = 1 and six at Lambda = 2. It closes the rest: " +
        "0.663694 -> 0.306409 against the walk's 0.306645.",
    negative: "Walter's own separable G1(i)G1(o) would NOT have fixed it: 0.484730 against the walk's 0.306645.",
    rows: Object.freeze([
        Object.freeze({ alpha: 1.0, cosO: 0.25, shipped: 1.244343, chiOnly: 0.663694, both: 0.306409, walkOne: 0.306645 }),
        Object.freeze({ alpha: 1.0, cosO: 0.50, shipped: 1.136424, chiOnly: 0.717809, both: 0.588576, walkOne: 0.588150 }),
        Object.freeze({ alpha: 1.0, cosO: 0.70, shipped: 1.068193, chiOnly: 0.782592, both: 0.739973, walkOne: 0.740785 }),
        Object.freeze({ alpha: 0.4, cosO: 0.25, shipped: 1.081828, chiOnly: 0.795486, both: 0.749160, walkOne: 0.748370 }),
        Object.freeze({ alpha: 0.4, cosO: 0.70, shipped: 0.992405, chiOnly: 0.913141, both: 0.911863, walkOne: 0.911595 }),
        Object.freeze({ alpha: 0.05, cosO: 0.70, shipped: 0.949573, chiOnly: 0.947871, both: 0.947871, walkOne: 0.947340 }),
    ]),
    defaultsUnchanged: "btdf() still ships the old behaviour, and this round does NOT propose flipping it " +
                       "yet -- see repairOpen. Turning both corrections on drops alpha 1, cos 0.25 from " +
                       "1.2444 to 0.3064, which is the correct single-scatter number and a visible change to " +
                       "every rough transmissive material. That is a decision, not a patch.",
    repairClosed: "v4452 -- THE REPAIR NEEDED NO COMPLETING; v4451'S TARGET WAS WRONG. The probe compared " +
                  "the lobe against 1 - P(TIR), which counts every visible normal that refracts INCLUDING " +
                  "the ones whose refracted ray leaves UPWARD -- a population an integral over the lower " +
                  "hemisphere cannot hold and a single-scatter lobe must not count. At alpha 1, cos 0.25 " +
                  "leaving glass: TIR 0.491565, leaves down 0.392720, leaves up 0.115715, and the probe " +
                  "reads 0.393541. GOING INTO THE DENSER MEDIUM THE UP-LEAVING POPULATION IS EMPTY AT EVERY " +
                  "ROUGHNESS, so the wrong target agreed with the right one across the whole forward " +
                  "direction and the first configuration that could tell them apart was the one v4436 never " +
                  "measured. Checked one configuration at a time as well as in the integral: 255,525 of " +
                  "255,525 real refractions sampled off the microsurface are admitted, and the half-vector " +
                  "reconstructs the sampled facet normal exactly in all of them.",
    bothDirections: "The corrections hold LEAVING the denser medium too, against the same walk: worst " +
                    "departure 1.46e-3 over six configurations. And the shipped lobe is WORSE in that " +
                    "direction -- 0.553041 against a true 0.053250 at alpha 1, cos 0.25, ten times the " +
                    "truth -- which never showed up in v4436's alarm because R + T leaving glass still " +
                    "reads below one.",
});
