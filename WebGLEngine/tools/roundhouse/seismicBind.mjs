// tools/roundhouse/seismicBind.mjs
//
// v3384 -- THE SEISMOLOGY DEVICE. Second of three new fields; acoustics follows.
//
// MODES:
//   "rays"      the circular-arc key: closed form, angle integration and arc geometry on one ray path
//   "moduli"    Vp/Vs = sqrt(3) for a Poisson solid, and Vs = 0 identically in a fluid -- the shadow zone
//   "interface" R^2 + (Z1/Z2) T^2 = 1, an identity rather than a tolerance
//
// THE PLANTED ERROR IS THE INTEGRATION VARIABLE, not a wrong constant, because that is the mistake this module
// actually makes available. Integrating the ray in DEPTH is the natural-looking choice and dx/dz diverges at the
// turning point -- it returns a plausible distance that is wrong in the fourth digit. Nothing throws, the ray
// still turns, and only comparison against the closed form shows it.

import {
    vP, vS, vpvsFromPoisson, poissonFromVpVs, energyBalance, reflectionCoef,
    turningDepth, turningDistance, turningDistanceIntegrated, turningDistanceFromArc, arcRadius,
} from "../../physics/seismic/rays.mjs";

export const SEISMIC_OBSERVABLES = [
    "closedDistance", "integratedDistance", "arcDistance", "worstRouteDiff",
    "turningDepth", "arcRadius", "vpvs", "vpvsExact", "poissonRoundTrip",
    "vsFluid", "vpFluid", "energyResidual", "reflection", "planted",
];

const DEF = { p: 1 / 6, v0: 3, k: 0.5, nu: 0.25, rho1: 2500, v1: 3000, rho2: 3300, v2: 5000 };

/** The WRONG parametrisation: integrate in depth, where dx/dz diverges at the turning point. */
function distanceByDepth(p, v0, k, steps = 200000) {
    const zt = turningDepth(p, v0, k), h = (zt - 1e-9) / steps;
    let x = 0;
    for (let i = 0; i < steps; i++) { const v = v0 + k * (i + 0.5) * h, s = p * v; x += p * v / Math.sqrt(1 - s * s) * h; }
    return x;
}

function buildSeismic({ mode = "rays", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const blank = {
        closedDistance: null, integratedDistance: null, arcDistance: null, worstRouteDiff: null,
        turningDepth: null, arcRadius: null, vpvs: null, vpvsExact: null, poissonRoundTrip: null,
        vsFluid: null, vpFluid: null, energyResidual: null, reflection: null, planted: !!config.planted,
    };

    if (mode === "moduli") {
        return {
            ...blank,
            vpvs: vpvsFromPoisson(c.nu), vpvsExact: Math.sqrt(3),
            poissonRoundTrip: Math.abs(poissonFromVpVs(vpvsFromPoisson(c.nu)) - c.nu),
            vsFluid: vS(0, c.rho1), vpFluid: vP(2.2e9, 0, c.rho1),
        };
    }
    if (mode === "interface") {
        const Z1 = c.rho1 * c.v1, Z2 = c.rho2 * c.v2;
        return { ...blank, energyResidual: Math.abs(energyBalance(Z1, Z2) - 1), reflection: reflectionCoef(Z1, Z2) };
    }

    const closed = turningDistance(c.p, c.v0, c.k);
    const integ = config.planted ? distanceByDepth(c.p, c.v0, c.k) : turningDistanceIntegrated(c.p, c.v0, c.k);
    const arc = turningDistanceFromArc(c.p, c.v0, c.k);
    return {
        ...blank,
        closedDistance: closed, integratedDistance: integ, arcDistance: arc,
        worstRouteDiff: Math.max(Math.abs(closed - integ), Math.abs(closed - arc)),
        turningDepth: turningDepth(c.p, c.v0, c.k), arcRadius: arcRadius(c.p, c.k),
    };
}

export const seismicDevice = {
    // v3400 -- *** METHOD PLANT, A THIRD KIND THE v3393 BINARY DID NOT HAVE A NAME FOR. *** The physics is
    // right and the reading is right; the EVALUATION is wrong -- the same integral parametrised in depth, where
    // dx/dz diverges at the turning point. Neither "the derivation is wrong" nor "the number was substituted".
    plantKind: "method",
    // v4089 -- NAMED, THE SAME COMPLETION v3851/v4088 gave born/chaos/box3d/acoustics: plantKind was declared
    // but the config.planted flag it reads (`rays` mode only) had no `planted: {}` object saying what it
    // overturns. worstRouteDiff is the max departure of EITHER alternate route from the closed form, so it is
    // the single number that catches the depth-parametrised integral however it goes wrong. MEASURED, both
    // arms: 1.21e-11 -> 8.12e-3.
    planted: { knob: "planted", observable: "worstRouteDiff",
               note: "integrating the ray in depth instead of angle diverges as dx/dz near the turning point; the closed form and the arc-geometry route both stay agreed with the honest integral to 1e-11, and disagree with the depth-parametrised one at the 8e-3 level" },
    modes: ["rays", "moduli", "interface"],
    name: "seismic-rays-and-moduli", observables: SEISMIC_OBSERVABLES, build: buildSeismic,
    defaults: ({ mode } = {}) => ({ mode: mode || "rays", config: { ...DEF } }),
};
