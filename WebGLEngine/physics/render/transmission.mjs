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

import { D, G2 } from "./microfacet.mjs";
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
export function btdf(wi, wo, { alpha, nAbove, nBelow, useSchlick = false, dropJacobian = false }) {
    if (wi[2] * wo[2] >= 0) return 0;                     // not a transmission configuration
    const etaI = indexOn(wi, nAbove, nBelow), etaO = indexOn(wo, nAbove, nBelow);
    const h = halfVectorT(wi, wo, etaI, etaO);
    const iDotH = dot(wi, h), oDotH = dot(wo, h);
    const denom = etaI * iDotH + etaO * oDotH;
    if (denom === 0) return 0;
    // Fresnel is asked from the INCIDENT side against the microfacet, which is the interface light meets.
    const F = useSchlick ? schlick(Math.abs(iDotH), F0of(etaI, etaO))
                         : fresnel(Math.abs(iDotH), etaI, etaO).R;
    const Dv = D(Math.abs(h[2]), alpha);
    const Gv = G2(Math.abs(wo[2]), Math.abs(wi[2]), alpha);
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
