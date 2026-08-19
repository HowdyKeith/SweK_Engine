// tools/roundhouse/mpmStressBind.mjs -- v3791
//
// *** MPM'S CONSTITUTIVE MODEL -- the part that makes material RESIST deformation. v3789 built the transfer
// and v3790 the grid step, both honest that a block would simply fall because NOTHING PRODUCED STRESS. This
// is that half. STILL NO PLASTICITY, so this material is perfectly elastic: squeeze it and it springs back
// for ever. ***
//
// *** THE FINDING OF THE ROUND IS ABOUT FIXTURES, NOT ABOUT THE MODEL. The plant writes P*F instead of P*F^T
// -- the slip the formula invites, since both products are defined -- and WHETHER IT IS VISIBLE AT ALL DEPENDS
// ENTIRELY ON THE DEFORMATION YOU TEST:
//   PURE STRETCH / DILATION -- INVISIBLE. max |sigma difference| 0.0000, because A DIAGONAL F IS ITS OWN
//     TRANSPOSE. *** DILATION IS THE STANDARD SANITY CHECK AND IT CANNOT SEE THIS BUG. ***
//   PURE SHEAR -- the stress moves by 15.3846 but SYMMETRY SURVIVES: the plant SWAPS THE DIAGONAL, so
//     sigma_xx and sigma_yy land on the wrong axes while sigma_xy == sigma_yx still holds.
//   COMPOSED (stretch then shear) -- asymmetry 0 -> 72.6; a general F gives 86.6.
// A KEY IS ONLY AS GOOD AS THE STATE IT IS EVALUATED IN, which this tree learned at v3763 (a key evaluated
// only where its parameter is zero is blind) and again here from the other direction. ***

import { lame, cauchy, firstPiola, det, mul, deformations, advanceF, I2 } from "../../physics/mpm/constitutive.mjs";

export const MPMSTRESS_OBSERVABLES = [
    "restStressMax", "restHolds", "dilationShearMax", "dilationNormalsEqual", "dilationHolds",
    "asymmetry", "symmetryHolds", "shearAsymmetry", "dilationPlantDelta", "shearPlantDelta",
    "J", "E", "nu",
];

export const MPMSTRESS_MODES = ["symmetry", "rest", "dilation", "blindfixtures", "transposed"];

const DEF = { E: 1000, nu: 0.3, stretch: 1.3, shear: 0.2, dilate: 1.1 };

export function mpmStressDefaults(hyp) {
    const h = { mode: "symmetry", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.E = Math.min(1e7, Math.max(1, num(c.E, DEF.E)));
    c.nu = Math.min(0.49, Math.max(0, num(c.nu, DEF.nu)));   // 0.5 is incompressible and lambda diverges
    c.stretch = Math.min(4, Math.max(0.3, num(c.stretch, DEF.stretch)));
    c.dilate = Math.min(4, Math.max(0.3, num(c.dilate, DEF.dilate)));
    h.config = c;
    if (!MPMSTRESS_MODES.includes(h.mode)) h.mode = "symmetry";
    return h;
}

const asymOf = (s) => Math.abs(s[1] - s[2]);
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

export async function buildMpmStress(hyp, base = {}) {
    const h = mpmStressDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const p = lame(c.E, c.nu);
    const useF = h.mode === "transposed";     // *** THE PLANT: P*F instead of P*F^T. ***
    const out = { E: c.E, nu: c.nu };

    if (h.mode === "rest") {
        const { sigma, J } = cauchy(deformations.identity(), p, { useF });
        out.restStressMax = Math.max(...sigma.map(Math.abs));
        out.restHolds = out.restStressMax === 0;   // EXACTLY zero: undisturbed material is unstressed
        out.J = J;
        return out;
    }

    if (h.mode === "dilation") {
        const { sigma, J } = cauchy(deformations.dilation(c.dilate), p, { useF });
        out.dilationShearMax = Math.max(Math.abs(sigma[1]), Math.abs(sigma[2]));
        out.dilationNormalsEqual = sigma[0] === sigma[3];
        out.dilationHolds = out.dilationShearMax === 0 && out.dilationNormalsEqual;
        out.J = J;
        return out;
    }

    if (h.mode === "blindfixtures") {
        // *** THE ROUND'S POINT, MEASURED RATHER THAN ASSERTED: how much does the plant move the stress on the
        // two fixtures anybody would reach for first? ***
        const dil = deformations.dilation(c.dilate), sh = deformations.shear(c.shear);
        out.dilationPlantDelta = maxDiff(cauchy(dil, p).sigma, cauchy(dil, p, { useF: true }).sigma);
        out.shearPlantDelta = maxDiff(cauchy(sh, p).sigma, cauchy(sh, p, { useF: true }).sigma);
        out.shearAsymmetry = asymOf(cauchy(sh, p, { useF: true }).sigma);
        return out;
    }

    // "symmetry" and "transposed": a COMPOSED deformation, which is the only kind that can see the plant.
    const F = mul(deformations.shear(c.shear), deformations.stretchX(c.stretch));
    const { sigma, J } = cauchy(F, p, { useF });
    out.asymmetry = asymOf(sigma);
    out.symmetryHolds = out.asymmetry < 1e-9;
    out.J = J;
    return out;
}

export const mpmStressDevice = {
    modes: MPMSTRESS_MODES,
    // "symmetry" is FIRST so the contract compares the plant against the mode that owns the asymmetry key.
    plantMode: "transposed", plantFlips: "asymmetry", plantKind: "mode",
    name: "mpm-neohookean-stress", observables: MPMSTRESS_OBSERVABLES,
    build: buildMpmStress, defaults: mpmStressDefaults,
};
