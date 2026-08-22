// tools/roundhouse/mpmDruckerBind.mjs -- v3799
//
// *** DRUCKER-PRAGER: THE MODEL THAT GIVES GRANULAR MATERIAL A FRICTION ANGLE. v3792's return mapping was a
// SINGULAR-VALUE CLAMP with no friction in it, which is why v3797 had to say a pile with the wrong angle of
// repose would pass every check. ***
//
// *** I INTENDED TO GRADE THE PILE ANGLE AGAINST physics/mechanics/contactKeys.mjs, WHICH ADJUDICATES
// FRICTION AGAINST THE REAL box3d -- AND frictionRestitutionAvailable() READS FALSE HERE, because box3d WASM
// does not build in this sandbox. RATHER THAN INVENT A REFERENCE, the keys come from the yield surface
// itself, where they are exact:
//   INSIDE THE SURFACE THE RETURN MAPPING IS THE IDENTITY -- below yield the material is elastic, and the
//     mapping must change NOTHING. Not nearly: the same numbers back.
//   OUTSIDE IT, THE PROJECTION LANDS THE YIELD FUNCTION AT EXACTLY ZERO.
//   COHESIONLESS MATERIAL CANNOT PULL -- hydrostatic tension collapses to the apex. Sand has no tensile
//     strength, and a model that lets it hang together under tension is modelling ROCK.
//   AND THE FRICTION ANGLE MUST REACH THE SURFACE: a larger angle must admit more shear before yielding, or
//     the parameter is decorative. ***

import { lame } from "../../physics/mpm/constitutive.mjs";
import { alphaOf, yieldOf, dpReturn } from "../../physics/mpm/druckerPrager.mjs";
import { svd2 } from "../../physics/mpm/plasticity.mjs";

export const DP_OBSERVABLES = [
    "elasticUntouched", "yieldAfter", "landsOnSurface", "apexCase", "apexYield",
    "shearAt20", "shearAt40", "shearSpread", "angleMatters", "alpha20", "alpha40", "frictionDeg",
];

export const DP_MODES = ["angle", "surface", "tension", "deafangle"];

const DEF = { E: 500, nu: 0.3, frictionDeg: 30 };

export function dpDefaults(hyp) {
    const h = { mode: "surface", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.frictionDeg = Math.min(60, Math.max(1, num(c.frictionDeg, DEF.frictionDeg)));
    h.config = c;
    if (!DP_MODES.includes(h.mode)) h.mode = "surface";
    return h;
}

const parOf = (c, deg, deaf = false) => { const p = lame(c.E, c.nu); return { mu: p.mu, lambda: p.lambda, alpha: alphaOf(deg, { deaf }) }; };
const I = [1, 0, 0, 1];

/** The largest shear a material of this friction angle carries WITHOUT yielding -- bisected, not assumed. */
/**
 * *** THE SHEAR IS MEASURED UNDER CONFINING COMPRESSION, AND THAT IS THE PHYSICS RATHER THAN A TWEAK.
 * A COHESIONLESS MATERIAL AT ZERO PRESSURE CARRIES NO SHEAR AT ALL -- dry sand on a table has no strength
 * until something presses on it -- so measured on a pure shear BOTH friction angles returned 0.000000 and the
 * friction angle appeared not to matter. IT WAS THE FIXTURE: with no confining pressure there is nothing for
 * friction to act on. Compressed first, a larger angle admits more shear, which is what a friction angle IS. ***
 */
function maxElasticShear(par, squeeze = 0.97) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const F = [squeeze, mid * squeeze, 0, squeeze];       // confining compression PLUS shear
        const y = yieldOf(svd2(F).S, par);
        if (y.f <= 0) lo = mid; else hi = mid;
    }
    return lo;
}

export async function buildDrucker(hyp, base = {}) {
    const h = dpDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const par = parOf(c, c.frictionDeg);
    const out = { frictionDeg: c.frictionDeg };

    if (h.mode === "tension") {
        const r = dpReturn([1.1, 0, 0, 1.1], I, par);
        out.apexCase = r.case;
        out.apexYield = Number.isFinite(r.yieldAfter) ? r.yieldAfter : 1e6;   // finite, so a census can read it
        // after the apex return the elastic strain is zero: the material has separated rather than resisted
        out.landsOnSurface = Math.abs(r.yieldAfter) < 1e-9;
        return out;
    }

    if (h.mode === "angle" || h.mode === "deafangle") {
        const deaf = h.mode === "deafangle";
        // *** THE FRICTION ANGLE MUST REACH THE SURFACE, or the parameter is decorative -- the shape v3783
        // planted deliberately. A larger angle admits more shear before yielding. ***
        out.alpha20 = alphaOf(20); out.alpha40 = alphaOf(40);
        out.shearAt20 = maxElasticShear(parOf(c, 20, deaf));
        out.shearAt40 = maxElasticShear(parOf(c, 40, deaf));
        out.shearSpread = out.shearAt20 > 0 ? out.shearAt40 / out.shearAt20 : 0;
        out.angleMatters = out.shearAt40 > out.shearAt20 * 1.5;
        return out;
    }

    // "surface": the two exact properties of the mapping
    const inside = dpReturn([0.9, 0, 0, 0.9], I, par);
    out.elasticUntouched = inside.case === "elastic" &&
        inside.Fe.every((v, i) => v === [0.9, 0, 0, 0.9][i]);
    const outside = dpReturn([1, 0.05, 0, 1], I, par);
    out.yieldAfter = outside.yieldAfter;
    out.landsOnSurface = outside.case === "yielded" && Math.abs(outside.yieldAfter) < 1e-12;
    return out;
}

export const druckerDevice = {
    modes: DP_MODES,
    // "angle" is FIRST so the contract compares the plant against the mode that owns the spread.
    plantMode: "deafangle", plantFlips: "shearSpread", plantKind: "mode",
    plantNull: 1, plantNullWhy:
        "shearSpread is the ratio of shear strength at two friction angles, so an angle-deaf model gives exactly 1; the honest arm gives 2.12, and shearAt20 and shearAt40 become the SAME number (7.04e-2) under the plant, which is the collapse stated directly",
    name: "mpm-drucker-prager", observables: DP_OBSERVABLES,
    build: buildDrucker, defaults: dpDefaults,
};
