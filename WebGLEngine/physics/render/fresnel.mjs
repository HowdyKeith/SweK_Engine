// WebGLEngine/physics/render/fresnel.mjs -- v3491
//
// *** THE PIECE v3490 DELIBERATELY LEFT OUT. *** The white furnace test there sets F = 1 precisely to take
// Fresnel out of the picture, because with a real Fresnel term energy LEGITIMATELY LEAVES the reflection lobe
// -- it is transmitted, not lost -- and the furnace deficit would stop meaning "this model fails to conserve
// energy". THOSE TWO DEFICITS LOOK IDENTICAL FROM THE NUMBER ALONE AND ONE IS A MODEL FAILURE WHILE THE OTHER
// IS PHYSICS.
//
// Everything here is DERIVED from Snell's law and the boundary conditions rather than ported, and NO REFERENCE
// VALUE IS TYPED -- every key below is recovered from behaviour and compared against a closed form the loop is
// never told.
//
// ================================================================================================
// FOUR EXACT FACTS, AND THE TWO EVERYBODY CHECKS ARE THE TWO THAT CATCH NOTHING
// ================================================================================================
//
//   NORMAL INCIDENCE   F0 = ((n1 - n2) / (n1 + n2))^2                 -- the number every renderer exposes
//   GRAZING            F -> 1 as cos(theta) -> 0                      -- for any index pair
//   BREWSTER           R_p is EXACTLY ZERO at theta = atan(n2/n1)      -- in ONE polarisation only
//   TOTAL INTERNAL     R = 1 for theta >= asin(n2/n1) when n1 > n2     -- a bifurcation, not a value
//
// *** F0 AND GRAZING ARE WHERE ANYBODY CHECKS BY HAND, AND BOTH PLANTS IN THIS FILE SURVIVE THEM BIT-IDENTICAL.
// The polarisation swap is caught ONLY by Brewster; the missing transmission factor ONLY by energy conservation.
// A suite holding the two obvious keys would certify both faults. ***
//
// AND THE ENERGY CHECK IS ONLY A CHECK BECAUSE T IS COMPUTED INDEPENDENTLY: R + T = 1 is worthless if T is
// defined as 1 - R. The transmitted fraction carries a factor (n2 cos_t) / (n1 cos_i) -- the ratio of projected
// solid angles across the interface -- and FORGETTING IT IS THE COMMONEST MISTAKE IN THIS SUBJECT, because
// |t|^2 alone looks like a transmittance and is not one.
"use strict";

/** The reflectance at normal incidence -- the parameter every material system exposes. */
export const F0of = (n1, n2) => { const d = (n1 - n2) / (n1 + n2); return d * d; };
/** Brewster's angle and the critical angle, as COSINES so the whole file stays in cos and needs no arccos. */
export const brewsterCos = (n1, n2) => 1 / Math.sqrt(1 + (n2 / n1) * (n2 / n1));
export const criticalCos = (n1, n2) => (n1 <= n2 ? null : Math.sqrt(1 - (n2 / n1) * (n2 / n1)));

/**
 * The exact Fresnel equations for an unpolarised beam, plus both polarisations and both transmittances.
 *
 *   pForS               -- PLANT: use the s amplitude where the p amplitude belongs. It is what you get by
 *                          copying one line twice, and BREWSTER'S ZERO IS THE ONLY THING THAT NOTICES.
 *   noTransmissionFactor-- PLANT: report |t|^2 as the transmittance, dropping the projected-solid-angle ratio.
 */
const ct0 = (n1, n2) => { const s = n1 / n2; return Math.sqrt(Math.max(0, 1 - s * s)); };

export function fresnel(cosI, n1, n2, { pForS = false, noTransmissionFactor = false } = {}) {
    const ci = Math.min(1, Math.max(0, cosI));
    const sinT = (n1 / n2) * Math.sqrt(Math.max(0, 1 - ci * ci));
    // TOTAL INTERNAL REFLECTION IS A BRANCH, NOT A LARGE NUMBER: past the critical angle there is no transmitted
    // ray at all, so R is exactly 1 and no amount of tightening a tolerance would produce that.
    if (sinT >= 1) return { Rs: 1, Rp: 1, R: 1, Ts: 0, Tp: 0, T: 0, tir: true, cosT: 0 };
    // *** EXACTLY GRAZING IS A BRANCH TOO, AND IT WAS RETURNING NaN. *** Found at v4436 by a sweep that
    // included cos = 0 rather than approaching it. The transmission factor is (n2 cosT)/(n1 cosI), which at
    // cosI = 0 is a division by zero multiplied by a |t|^2 of zero -- Infinity * 0 = NaN, and a NaN in T
    // propagates silently through any R + T that consumes it. This gate's own grazing rows test cos = 1e-3,
    // 1e-5 and 1e-7: APPROACHING GRAZING IS NOT AT GRAZING, and the boundary itself was never evaluated.
    // The physical answer needs no limit: at exactly grazing incidence nothing is transmitted.
    if (ci === 0) return { Rs: 1, Rp: 1, R: 1, Ts: 0, Tp: 0, T: 0, tir: false, cosT: ct0(n1, n2) };
    const ct = Math.sqrt(1 - sinT * sinT);
    const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    const rp = pForS ? rs : (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
    const ts = 2 * n1 * ci / (n1 * ci + n2 * ct);
    const tp = 2 * n1 * ci / (n2 * ci + n1 * ct);
    // *** THE RATIO OF PROJECTED SOLID ANGLES. Without it |t|^2 can exceed 1 and R + T does not close. ***
    const k = noTransmissionFactor ? 1 : (n2 * ct) / (n1 * ci);
    const Rs = rs * rs, Rp = rp * rp;
    return { Rs, Rp, R: (Rs + Rp) / 2, Ts: k * ts * ts, Tp: k * tp * tp,
             T: (k * ts * ts + k * tp * tp) / 2, tir: false, cosT: ct };
}

/** The p amplitude on its own, because its SIGN is what locates Brewster and its square hides it. */
export function rp(cosI, n1, n2, o = {}) {
    const ci = Math.min(1, Math.max(0, cosI));
    const sinT = (n1 / n2) * Math.sqrt(Math.max(0, 1 - ci * ci));
    if (sinT >= 1) return 1;
    const ct = Math.sqrt(1 - sinT * sinT);
    if (o.pForS) return (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    return (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
}

/**
 * Schlick's approximation. *** NOT A PLANT AND NOT A FAULT -- it is the model almost every real-time renderer
 * actually ships, and it is EXACT at both ends. What it cannot do is the middle, and in particular it has no
 * polarisation in it at all, so BREWSTER'S ZERO IS NOT MERELY INACCURATE THERE, IT DOES NOT EXIST. ***
 */
export const schlick = (cosI, F0) => F0 + (1 - F0) * Math.pow(1 - Math.min(1, Math.max(0, cosI)), 5);

/**
 * Bisect for the angle where the p amplitude changes SIGN. Nothing in here is told atan(n2/n1): the bracket is
 * driven by a comparison, which is what makes the recovered angle a KEY rather than a restatement.
 */
export function brewsterByBisection(n1, n2, { steps = 60, o = {}, eps = 1e-9 } = {}) {
    let lo = 0.01, hi = 0.999;
    const a = rp(lo, n1, n2, o), b = rp(hi, n1, n2, o);
    // *** THE FIRST VERSION OF THIS GUARD TESTED ONLY THE SIGNS AND WAS FOOLED BY FLOAT DUST: at n1 = n2 the
    // amplitude is identically zero, and the two endpoints came back as 2.76e-14 and 0 -- SIGNS +1 AND 0, which
    // is a "sign change", so it happily bisected on rounding noise and returned an angle for an interface that
    // does not exist. THE DEGENERATE FIXTURE IS THE ONE THAT CAUGHT IT. A magnitude floor is required as well:
    // an endpoint indistinguishable from zero brackets nothing. ***
    if (Math.abs(a) < eps || Math.abs(b) < eps || Math.sign(a) === Math.sign(b)) return null;
    const sLo = Math.sign(a);
    for (let i = 0; i < steps; i++) { const m = (lo + hi) / 2; if (Math.sign(rp(m, n1, n2, o)) === sLo) lo = m; else hi = m; }
    return (lo + hi) / 2;
}

/** Bisect for the critical angle, reading only WHETHER there is a transmitted ray -- a boolean, not a value. */
export function criticalByBisection(n1, n2, { steps = 60 } = {}) {
    let a = 0.999, b = 1e-4;
    if (fresnel(b, n1, n2).tir === fresnel(a, n1, n2).tir) return null;
    const at = fresnel(b, n1, n2).tir;
    for (let i = 0; i < steps; i++) { const m = (a + b) / 2; if (fresnel(m, n1, n2).tir === at) b = m; else a = m; }
    return (a + b) / 2;
}
