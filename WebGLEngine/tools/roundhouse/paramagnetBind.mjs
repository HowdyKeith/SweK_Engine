// tools/roundhouse/paramagnetBind.mjs
//
// LOCALISED SPINS IN A FIELD JOIN THE ROUNDHOUSE -- the non-interacting neighbour of ising.js, and the fifth
// thermal rung. Ising's spins argue with each other and order at Onsager's T_c; these ignore each other and only
// feel the applied field, so there is no transition, just a smooth competition between alignment and temperature.
//
// *** THE PLANT IS EXACT AT SPIN-HALF, WHICH IS WHY IT IS WORTH HAVING. *** The Brillouin function reduces to
// tanh(y) ONLY for J = 1/2. Treating every spin as spin-half is a real modelling error -- "a paramagnet is just
// tanh" -- and at J = 1/2 IT IS NOT AN ERROR AT ALL: measured agreement 3.7e-16, which is float noise on a
// formula that reaches the same value through a difference of two coth terms. NOT bit-identical, and the gate
// says so with a tolerance rather than an equality, because claiming bit-equality for a number computed two
// different ways is the kind of overclaim that survives until someone changes a compiler.
//
// At J = 5/2 the same substitution is catastrophic and in two independent directions: the Curie slope reads
// 1.000000 instead of (J+1)/(3J) = 0.466667, and saturation at y = 8 reads 0.99999977 instead of 0.98300226.
// plantKind METHOD -- the spin quantum number is ignored, the inputs and readings are untouched.
//
// *** AND THE SCHOTTKY HALF CANNOT SEE IT AT ALL, BECAUSE A TWO-LEVEL SYSTEM HAS NO J. *** The anomaly is the one
// heat capacity in this whole family (Debye's plateau, blackbody's T^3, Fermi's linear, BEC's cusp, the classical
// constant) that RISES TO A PEAK AND FALLS BACK TO ZERO, because a spin has finitely many levels and saturates.
// Its peak solves x tanh(x/2) = 2, a transcendental found here by a Newton root AND an independent maximiser --
// the same two-route shape as blackbody's Wien peak. Every Schottky and entropy observable is blind to the
// magnetisation plant, and that is the point: the bounded spectrum is a separate claim from the spin algebra.
//
// THE THIRD LAW IS HONOURED AND MEASURED: entropy climbs to exactly ln 2 (two states) as the field is switched
// off, and falls to 0 at T = 0 -- unlike Sackur-Tetrode's classical gas, which goes negative and announces that
// it has left its domain.

import {
    brillouin, curieConstant, schottkyC, twoLevelEntropy,
    schottkyPeakNewton, schottkyPeakMaximise, schottkyResidual,
} from "../../physics/statmech/paramagnet.mjs";

export const PARAMAGNET_OBSERVABLES = [
    "bHalf", "tanhY", "halfIsTanhRel",
    "bHighJ", "slopeHighJ", "slopePredictedHighJ", "slopeHighJRel", "satHighJ",
    "curieConstantHalf", "curieConstantHighJ",
    "schottkyNewton", "schottkyMaximise", "schottkyPeakRel", "schottkyCmax", "schottkyResid",
    "schottkyHot", "schottkyCold",
    "entropyHot", "entropyLn2Rel", "entropyCold",
];

const DEF = { y: 0.7, jHigh: 2.5, ySmall: 1e-5, yBig: 8, xHot: 0.01, xCold: 20 };

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

function buildParamagnet({ mode = "spins", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT: every spin is spin-half. Exact at J = 1/2, wrong at every other J.
    const B = config.planted ? (J, y) => Math.tanh(y) : brillouin;

    const xPeak = schottkyPeakNewton();
    const xPeakMax = schottkyPeakMaximise();
    const slopeHi = B(c.jHigh, c.ySmall) / c.ySmall;

    return {
        // Spin-half: the plant's blind spot, because there it is the correct answer.
        bHalf: B(0.5, c.y), tanhY: Math.tanh(c.y), halfIsTanhRel: rel(B(0.5, c.y), Math.tanh(c.y)),

        // Spin-5/2: where ignoring J stops being free.
        bHighJ: B(c.jHigh, c.y),
        slopeHighJ: slopeHi,
        slopePredictedHighJ: (c.jHigh + 1) / (3 * c.jHigh),
        slopeHighJRel: rel(slopeHi, (c.jHigh + 1) / (3 * c.jHigh)),
        satHighJ: B(c.jHigh, c.yBig),

        curieConstantHalf: curieConstant(0.5), curieConstantHighJ: curieConstant(c.jHigh),

        // The Schottky anomaly: a two-level system has no J, so none of this can see the plant.
        schottkyNewton: xPeak, schottkyMaximise: xPeakMax, schottkyPeakRel: rel(xPeak, xPeakMax),
        schottkyCmax: schottkyC(xPeak), schottkyResid: Math.abs(schottkyResidual(xPeak)),
        // Vanishes at BOTH ends -- the bounded spectrum, and the whole load-bearing negative.
        schottkyHot: schottkyC(c.xHot), schottkyCold: schottkyC(c.xCold),

        // The third law, honoured: ln 2 at the top, exactly 0 at the bottom.
        entropyHot: twoLevelEntropy(c.xHot), entropyLn2Rel: rel(twoLevelEntropy(c.xHot), Math.LN2),
        entropyCold: twoLevelEntropy(c.xCold),
    };
}

export const paramagnetDevice = {
    plantKind: "method",
    modes: ["spins"],
    name: "brillouin-paramagnet-and-the-schottky-anomaly",
    observables: PARAMAGNET_OBSERVABLES,
    build: buildParamagnet,
    defaults: ({ mode } = {}) => ({ mode: mode || "spins", config: { ...DEF } }),
};
