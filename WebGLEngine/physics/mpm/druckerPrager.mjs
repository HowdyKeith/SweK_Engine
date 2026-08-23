// physics/mpm/druckerPrager.mjs -- v3799
//
// *** DRUCKER-PRAGER PLASTICITY: THE MODEL THAT GIVES GRANULAR MATERIAL A FRICTION ANGLE. v3792's return
// mapping was a SINGULAR-VALUE CLAMP -- it makes deformation permanent past a threshold and models no
// friction at all, which is why v3797 had to say a pile with the wrong angle of repose would pass every check.
// This is the yield surface that has an angle in it. ***
//
// *** THE KEYS ARE PROPERTIES OF THE SURFACE AND ARE EXACT. I had hoped to grade the pile angle against
// physics/mechanics/contactKeys.mjs, which adjudicates friction against the REAL box3d -- but
// frictionRestitutionAvailable() READS FALSE HERE because box3d WASM does not build in this sandbox. RATHER
// THAN INVENT A REFERENCE, the keys come from the surface itself:
//   1. A STRESS INSIDE THE SURFACE IS UNTOUCHED. Below yield the material is elastic and the return mapping
//      must be the IDENTITY -- not nearly, exactly.
//   2. A STRESS OUTSIDE IS PROJECTED ONTO THE SURFACE. After return the yield function is EXACTLY zero.
//   3. COHESIONLESS MATERIAL CANNOT PULL. Hydrostatic tension collapses to the apex: sand has no tensile
//      strength, and a model that lets it hang together under tension is modelling rock.
//   4. THE DEVIATORIC DIRECTION IS PRESERVED. The projection scales the deviator; it must not rotate it. ***
//
// Formulated on the PRINCIPAL LOGARITHMIC STRAIN, which is the standard MPM form (Klar et al. / Stomakhin
// lineage): yield is checked on the Hencky strain of the elastic part, not on the stress directly.

import { svd2, fromSvd } from "./plasticity.mjs";

/** alpha from a friction angle, in the standard Drucker-Prager fit to Mohr-Coulomb (2D, plane strain). */
export function alphaOf(frictionDeg, { deaf = false } = {}) {
    // *** v3799 -- `deaf` DEFAULTS TO FALSE AND IS THE PLANT: it returns a FIXED alpha whatever angle it is
    // handed, so the friction angle reaches the API and NOT THE YIELD SURFACE. That is this tree's deaf-knob
    // shape (v3783 planted it deliberately, v3790 shipped one by accident) in a constitutive setting: every
    // run completes, every number is finite, the surface still projects correctly -- AND THE MATERIAL STOPS
    // CARING WHAT KIND OF SAND IT IS. ***
    if (deaf) return Math.sqrt(2 / 3) * (2 * Math.sin(Math.PI / 6)) / (3 - Math.sin(Math.PI / 6));
    const f = frictionDeg * Math.PI / 180;
    return Math.sqrt(2 / 3) * (2 * Math.sin(f)) / (3 - Math.sin(f));
}

/**
 * The yield function on principal logarithmic strains.
 * eps = ln(singular values); its trace is the volumetric part and the remainder is the deviator.
 * @returns {{ f, devNorm, trace, dev }} f <= 0 is inside the surface
 */
export function yieldOf(sing, { mu, lambda, alpha }) {
    const e = sing.map((s) => Math.log(s));
    const trace = e.reduce((a, b) => a + b, 0);
    const dev = e.map((v) => v - trace / 2);                 // 2D: subtract the mean over TWO axes
    const devNorm = Math.hypot(...dev);
    // the standard MPM yield: |dev| + alpha * (2*mu + 2*lambda)/(2*mu) * trace, with the second term the
    // pressure contribution. Positive trace is EXPANSION, which for cohesionless material means tension.
    const f = devNorm + alpha * (2 * mu + 2 * lambda) / (2 * mu) * trace;
    return { f, devNorm, trace, dev };
}

/**
 * DRUCKER-PRAGER RETURN MAPPING on the elastic deformation gradient.
 * @param {boolean} noApex  the plant: skip the tension case, so cohesionless material can PULL
 */
export function dpReturn(Fe, Fp, { mu, lambda, alpha, noApex = false } = {}) {
    const { U, S, V } = svd2(Fe);
    const y = yieldOf(S, { mu, lambda, alpha });
    const total = [
        Fe[0] * Fp[0] + Fe[1] * Fp[2], Fe[0] * Fp[1] + Fe[1] * Fp[3],
        Fe[2] * Fp[0] + Fe[3] * Fp[2], Fe[2] * Fp[1] + Fe[3] * Fp[3],
    ];

    // *** CASE 1 -- EXPANSION, AND THE TEST NEEDS A TOLERANCE FOR A REASON I FOUND BY GETTING IT WRONG.
    // Written as a strict `trace > 0` it sent a PURE SHEAR to the apex: [1, 0.35; 0, 1] has determinant 1, so
    // the log-strain trace is ZERO -- and floating point made it a hair positive. A VOLUME-PRESERVING
    // DEFORMATION IS NOT EXPANSION, and calling it separation would have made every shearing particle detach.
    // The tolerance is scaled by the deviator so it means "negligible volume change relative to the shear
    // being done" rather than an absolute epsilon somebody has to justify. ***
    const expanding = y.trace > 1e-12 * Math.max(1, y.devNorm);
    if (!noApex && expanding) {
        const Sc = [1, 1];                                   // zero elastic strain: the material has separated
        return { Fe: fromSvd(U, Sc, V), Fp: null, case: "apex", yieldBefore: y.f, yieldAfter: 0, total, U, V, Sc };
    }
    // CASE 2 -- inside the surface. THE RETURN MAPPING IS THE IDENTITY.
    if (y.f <= 0) {
        return { Fe: Fe.slice(), Fp: Fp.slice(), case: "elastic", yieldBefore: y.f, yieldAfter: y.f, total, U, V, Sc: S };
    }
    // CASE 3 -- outside. Scale the deviator back until the yield function is exactly zero.
    const e = S.map((s) => Math.log(s));
    const trace = e[0] + e[1];
    const dev = e.map((v) => v - trace / 2);
    const devNorm = Math.hypot(...dev);
    // *** devNorm CAN BE ZERO -- hydrostatic loading has NO deviator -- and dividing by it gave NaN. That
    // surfaced through the `noApex` plant, which routes tension here: the plant produced NOT A WRONG NUMBER
    // BUT NO NUMBER, and a NaN is useless as a declared flip because it cannot be compared. Guarded so the
    // planted path yields a finite, wrong answer that a census can read. ***
    if (!(devNorm > 0)) {
        return { Fe: fromSvd(U, [1, 1], V), Fp: null, case: "nodeviator",
                 yieldBefore: y.f, yieldAfter: yieldOf([1, 1], { mu, lambda, alpha }).f, total, U, V, Sc: [1, 1] };
    }
    const shrink = (devNorm - y.f) / devNorm;                // the scale that lands f at zero
    const eNew = dev.map((d) => d * shrink + trace / 2);
    const Sc = eNew.map((v) => Math.exp(v));
    return { Fe: fromSvd(U, Sc, V), Fp: null, case: "yielded",
             yieldBefore: y.f, yieldAfter: yieldOf(Sc, { mu, lambda, alpha }).f, total, U, V, Sc };
}

// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
// v3941 -- SEPARATOR-TOLERANT AND ANCHORED. `split("/")` returns THE WHOLE PATH on Windows, so this
// guard was false and the block below never ran there. The leading "/" matters too: without it
// `.../loopScope.mjs`.endsWith("Scope.mjs") is true, and a sibling could wake somebody else's main
// block. THIS FILE MAY NOT IMPORT node:url -- a browser page imports it -- so a basename compare is
// the strongest form available here, and winPathGuard re-derives that exemption rather than trusting it.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith("/" + process.argv[1].split(/[\\/]/).pop())) {
    import("./constitutive.mjs").then((C) => {
        const p = C.lame(500, 0.3), alpha = alphaOf(30);
        const par = { mu: p.mu, lambda: p.lambda, alpha };
        const I = [1, 0, 0, 1];
        const cases = { "undeformed": I, "small shear": [1, 0.01, 0, 1], "big shear": [1, 0.35, 0, 1],
                        "compressed": [0.9, 0, 0, 0.9], "EXPANDED (tension)": [1.1, 0, 0, 1.1] };
        for (const [name, F] of Object.entries(cases)) {
            const r = dpReturn(F, I, par);
            console.log("[dp] " + name.padEnd(20) + " case " + r.case.padEnd(9) +
                        " f " + r.yieldBefore.toExponential(3) + " -> " + r.yieldAfter.toExponential(3));
        }
    });
}
