// physics/em/fresnelJoin.mjs
//
// FOUR DECLARATIONS OF FRESNEL REFLECTION IN ONE TREE, PLUS A FIFTH THING WEARING THE SAME NAME, AND NOTHING HAD
// EVER COMPARED ANY OF THEM.
//
// This module exists because of what the v3628 census turned up rather than because a formula was missing. The
// angle-dependent Fresnel equations were ALREADY HERE, in physics/render/fresnel.mjs (v3491), with Brewster's
// zero and total internal reflection and two deliberate plants. What was missing is the JOIN: a place where the
// separate declarations meet and are made to agree, or shown not to.
//
//   1. physics/em/maxwell.mjs      fresnelNormal(n1, n2) = (n1-n2)/(n1+n2)     AMPLITUDE, signed, normal only
//   2. physics/render/fresnel.mjs  F0of(n1, n2) = ((n1-n2)/(n1+n2))^2          POWER
//                                  fresnel(cosI, n1, n2) -> {Rs, Rp, R, T}     POWER, all angles, exact
//                                  rp(cosI, n1, n2)                            AMPLITUDE, so its SIGN survives
//                                  schlick(cosI, F0)                           APPROXIMATION
//   3. water/waterMath.js          reflectance0(n1, n2), fresnelSchlick(c, R0) POWER + a SECOND Schlick
//   4. physics/optics/fresnel.js   fresnelCS(x) -> the FRESNEL INTEGRALS C, S   A DIFFERENT FUNCTION ENTIRELY
//
// *** THE LABEL DOES FOUR DIFFERENT JOBS AND THREE DIFFERENT KINDS OF WORK. Between (1) and (2) the difference is
// AMPLITUDE versus POWER -- a square, so the two numbers differ by a factor of 5 at a glass interface (-0.2 and
// 0.04) and NEITHER IS WRONG. Between (2) and (3) it is a genuine duplicate. Between those and (4) there is no
// relationship at all: Fresnel's diffraction integrals and Fresnel's reflection coefficients share a man, not a
// subject, and joining them because both say "fresnel" IS EXACTLY HOW ising.L HAPPENED. This file joins the
// first three and REFUSES the fourth, by name. ***
//
// AND A SIGN CONVENTION SITS INSIDE THE JOIN. At normal incidence s and p polarisation are physically
// indistinguishable -- there is no plane to tell them apart -- so any sign difference between the two is PURE
// CONVENTION. maxwell's fresnelNormal(1, 1.5) reads -0.2 and render's rp(1, 1, 1.5) reads +0.2. Same magnitude,
// opposite sign, both defensible, and the only safe join is through the SQUARE. Comparing them directly would
// report a fault that does not exist; comparing their squares reports the agreement that does.
//
// BROWSER-SAFE: imports only two ESM siblings. water/waterMath.js is CommonJS and cannot be imported here, so
// its two functions are INJECTED -- the gate supplies the real ones, and a caller that supplies nothing gets a
// stated absence rather than a silent skip.

import { fresnelNormal } from "./maxwell.mjs";
import { F0of, fresnel, rp, schlick, brewsterCos, criticalCos } from "../render/fresnel.mjs";

/**
 * THE REGISTER. Declared here, VERIFIED AGAINST THE FILES BY THE GATE -- a register nobody checks is the second
 * declaration this whole round is about. `kind` is the load-bearing field: it is what makes two numbers that
 * differ by a factor of five both correct.
 */
export const DECLARATIONS = [
    { module: "physics/em/maxwell.mjs", symbol: "fresnelNormal", kind: "amplitude", angles: "normal only" },
    { module: "physics/render/fresnel.mjs", symbol: "F0of", kind: "power", angles: "normal only" },
    { module: "physics/render/fresnel.mjs", symbol: "fresnel", kind: "power", angles: "all, exact" },
    { module: "physics/render/fresnel.mjs", symbol: "rp", kind: "amplitude", angles: "all, exact" },
    { module: "physics/render/fresnel.mjs", symbol: "schlick", kind: "power", angles: "all, APPROXIMATE" },
    { module: "water/waterMath.js", symbol: "reflectance0", kind: "power", angles: "normal only" },
    { module: "water/waterMath.js", symbol: "fresnelSchlick", kind: "power", angles: "all, APPROXIMATE" },
];

/** The one thing that is NOT in the family, recorded so nobody joins it later. */
export const NOT_THIS_FRESNEL = {
    module: "physics/optics/fresnel.js", symbol: "fresnelCS",
    why: "the Fresnel INTEGRALS C(x), S(x) of near-field diffraction. Same man, different subject. Joining " +
        "these to the reflection coefficients because both are called Fresnel is the ising.L shape.",
};

/**
 * All the routes to ONE number at normal incidence, with the conversion that makes them comparable stated
 * rather than applied silently. `water` is { reflectance0 } or null.
 */
export function normalIncidenceRoutes(n1, n2, water = null) {
    const amp = fresnelNormal(n1, n2);                 // signed amplitude
    const rows = [
        { name: "maxwell.fresnelNormal", raw: amp, kind: "amplitude", asPower: amp * amp },
        { name: "render.F0of", raw: F0of(n1, n2), kind: "power", asPower: F0of(n1, n2) },
        { name: "render.rp(cos=1)", raw: rp(1, n1, n2), kind: "amplitude", asPower: rp(1, n1, n2) ** 2 },
        { name: "render.fresnel(cos=1).R", raw: fresnel(1, n1, n2).R, kind: "power", asPower: fresnel(1, n1, n2).R },
    ];
    if (water && typeof water.reflectance0 === "function") {
        rows.push({ name: "water.reflectance0", raw: water.reflectance0(n1, n2), kind: "power", asPower: water.reflectance0(n1, n2) });
    }
    const powers = rows.map((r) => r.asPower);
    const spread = Math.max(...powers) - Math.min(...powers);
    // The RAW spread is what a naive comparison would report, and it is large and meaningless.
    const rawSpread = Math.max(...rows.map((r) => r.raw)) - Math.min(...rows.map((r) => r.raw));
    return { rows, spread, rawSpread, waterPresent: !!(water && water.reflectance0) };
}

/** Are the two Schlick implementations the same function? Injected, so the answer is about the tree. */
export function schlickDuplication(waterSchlick, { F0 = 0.04, samples = 201 } = {}) {
    if (typeof waterSchlick !== "function") return null;      // stated absence, never a silent pass
    let worst = 0;
    for (let i = 0; i < samples; i++) {
        const c = i / (samples - 1);
        worst = Math.max(worst, Math.abs(schlick(c, F0) - waterSchlick(c, F0)));
    }
    return { worst, identical: worst === 0, samples };
}

/**
 * GRADE THE APPROXIMATION AGAINST THE LAW. Schlick is not a fault -- it is what almost every real-time renderer
 * ships, and it is exact at both ends. The question is where it stops being a model of this physics, and there
 * are two places where the answer is not "a bit off" but "the feature is absent".
 */
export function schlickAudit(n1, n2, { samples = 2001 } = {}) {
    const F0 = F0of(n1, n2);
    let worstAbs = 0, worstAt = 0;
    for (let i = 1; i < samples; i++) {
        const c = i / samples;
        const e = Math.abs(schlick(c, F0) - fresnel(c, n1, n2).R);
        if (e > worstAbs) { worstAbs = e; worstAt = c; }
    }
    // BREWSTER: the p reflectance is EXACTLY zero, and Schlick has no polarisation in it, so it cannot be zero.
    const cb = brewsterCos(n1, n2);
    const brewster = { cosI: cb, angleDeg: 180 / Math.PI * Math.acos(cb), exactRp: fresnel(cb, n1, n2).Rp, schlick: schlick(cb, F0) };
    // TOTAL INTERNAL REFLECTION: only exists for n1 > n2, and there R is exactly 1 over a whole RANGE.
    const cc = criticalCos(n1, n2);
    const tir = cc === null ? null : [1, 0.8, 0.5, 0.2].map((f) => {
        const c = cc * f;
        return { cosI: c, exactR: fresnel(c, n1, n2).R, schlick: schlick(c, F0), ratio: fresnel(c, n1, n2).R / schlick(c, F0) };
    });
    return { F0, worstAbs, worstAt, brewster, tir, criticalCos: cc };
}

/** R + T = 1. An identity with no reference value, which is why it is the check a wrong model cannot survive. */
export function energyClosure(n1, n2, { samples = 400, opts = {} } = {}) {
    let worst = 0, worstAt = 0;
    for (let i = 1; i <= samples; i++) {
        const c = i / samples;
        const f = fresnel(c, n1, n2, opts);
        if (f.tir) continue;
        const e = Math.abs(f.R + f.T - 1);
        if (e > worst) { worst = e; worstAt = c; }
    }
    return { worst, worstAt };
}
