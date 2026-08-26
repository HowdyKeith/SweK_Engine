// tools/roundhouse/becBind.mjs
//
// BOSE-EINSTEIN CONDENSATION JOINS THE ROUNDHOUSE -- the Bose gas that blackbody and debye are NOT. Photons and
// phonons have no conserved number: created and destroyed freely, their chemical potential is pinned at zero and
// nothing ever condenses. A gas of MASSIVE atoms conserves N, so mu is a real variable, and when it climbs to
// zero a macroscopic fraction falls into the single-particle ground state.
//
// *** THE CONDENSATION THRESHOLD IS REACHED BY THREE MODULES THAT SHARE NO CODE. *** zeta(3/2) = 2.6123753 is
// the ceiling the excited states hit at z = 1, and it is computed here as blackbody's boseIntegral(3/2) divided
// by a Gamma from physics/md/maxwellSpeed.mjs, graded against physics/zeta.js's zeta. Three modules meeting on a
// number none of them computes alone -- and the half-integer order only became reachable when v3812 gave zeta.js
// a real-s power, which makes this module the consumer that fix was waiting for.
//
// *** THE LOAD-BEARING NEGATIVE IS A DIVERGENCE: THERE IS NO CONDENSATION IN TWO DIMENSIONS. *** The ceiling in d
// dimensions is zeta(d/2), and zeta(1) is the harmonic series -- it DIVERGES. An infinite ceiling can hold every
// atom at any temperature, so a 2D Bose gas never condenses. The device reports zeta(d/2) at d = 1, 2, 3, 4 and
// the 2D entry is literally Infinity: a finite number there would be a claim that BEC exists in 2D, which is a
// famous wrong answer and not a rounding error.
//
// *** THE PLANT IS THE EXPONENT, AND IT IS INVISIBLE AT BOTH ENDS OF THE CURVE. *** N0/N = 1 - (T/Tc)^{3/2}, and
// the 3/2 comes from the three-dimensional density of states. Planted, it is 1 - (T/Tc)^1. EVERY exponent gives
// exactly 1 at T = 0 and exactly 0 at Tc, so both endpoints are bit-identical and only the interior moves --
// measured 0.646447 against 0.500000 at T/Tc = 0.5. A device that checked only "all condensed at zero, none at
// Tc" would certify a gas with the wrong dimensionality. plantKind METHOD.

import {
    criticalDensity, condensateFraction, cvPeak, ceilingForDimension, boseFunctionAtOne,
} from "../../physics/thermal/bec.mjs";
import { zeta } from "../../physics/zeta.js";

export const BEC_OBSERVABLES = [
    "criticalDensity", "criticalFromBoseIntegral", "criticalFromZeta", "criticalJoinRel",
    "cvPeakValue",
    "condensateAtZero", "condensateAtTc", "condensateAtHalf", "exponentRecovered", "exponentRel",
    "ceiling1D", "ceiling2D", "ceiling3D", "ceiling4D", "twoDimensionsDiverge",
];

const DEF = { tMid: 0.5, exponent: 1.5 };

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

function buildBec({ mode = "condensation", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT: the wrong density of states. Any exponent pins both endpoints, so only the interior can tell.
    const frac = config.planted
        ? (t) => (t < 1 ? 1 - Math.pow(t, 1) : 0)
        : condensateFraction;

    const mid = frac(c.tMid);
    // Recover the exponent from the curve itself rather than reading the constant back: p = ln(1-f)/ln(t).
    const pRecovered = Math.log(1 - mid) / Math.log(c.tMid);

    return {
        criticalDensity: criticalDensity(),
        criticalFromBoseIntegral: boseFunctionAtOne(1.5),   // blackbody's integral / a Gamma from a third module
        criticalFromZeta: zeta(1.5),
        criticalJoinRel: rel(boseFunctionAtOne(1.5), zeta(1.5)),

        cvPeakValue: cvPeak(),

        condensateAtZero: frac(0), condensateAtTc: frac(1), condensateAtHalf: mid,
        exponentRecovered: pRecovered, exponentRel: rel(pRecovered, c.exponent),

        ceiling1D: ceilingForDimension(1), ceiling2D: ceilingForDimension(2),
        ceiling3D: ceilingForDimension(3), ceiling4D: ceilingForDimension(4),
        // 1 when the 2D ceiling is infinite, which is WHY there is no BEC in two dimensions.
        twoDimensionsDiverge: Number.isFinite(ceilingForDimension(2)) ? 0 : 1,
    };
}

export const becDevice = {
    plantKind: "method",
    modes: ["condensation"],
    name: "bose-einstein-condensation-and-the-2d-divergence",
    observables: BEC_OBSERVABLES,
    build: buildBec,
    defaults: ({ mode } = {}) => ({ mode: mode || "condensation", config: { ...DEF } }),
};
