// tools/roundhouse/debyeBind.mjs
//
// DEBYE JOINS THE ROUNDHOUSE -- the thermal family's second device, and the first whose ANSWER KEY IS ANOTHER
// MODULE'S INDEPENDENT RESULT rather than a closed form written down here.
//
// *** THE LOW-TEMPERATURE SLOPE OF A SOLID IS BLACKBODY'S RADIATION INTEGRAL, AND THAT IS THE WHOLE POINT. ***
// A blackbody has infinitely many photon modes; a crystal of N atoms has exactly 3N phonon modes, so the same
// Bose-Einstein sum runs to a ceiling instead of to infinity. As T -> 0 the ceiling stops mattering and the
// solid's capacity collapses onto the radiation answer:
//
//     C_V/(Nk) = 9 x_D^-3 INT_0^{x_D} x^4 e^x/(e^x-1)^2 dx  ->  9 * [4 INT_0^inf x^3/(e^x-1) dx] * (T/Theta)^3
//                                                           =  9 * 4 * (pi^4/15) * (T/Theta)^3
//                                                           =  (12 pi^4 / 5) (T/Theta)^3
//
// The factor of 4 is one integration by parts. The pi^4/15 is BLACKBODY'S, reached here through its own
// boseIntegral -- so lowTCoeffFromBose is computed by a module that knows nothing about solids, and graded
// against a slope MEASURED off this module's own quadrature. Two modules meet on 233.7818, and neither one
// alone is asked to be right about it.
//
// *** THE PLANT IS A REAL HISTORICAL WRONG ANSWER, WHICH IS THE STRONGEST KIND. *** Einstein (1907) put all 3N
// oscillators at ONE frequency and got an EXPONENTIAL freeze-out at low T instead of T^3. It took measurement
// and Debye's spectrum of frequencies to settle it. This is a METHOD plant in the v3850 sense: the inputs are
// untouched, the reading is untouched, and a different physical model is substituted underneath.
//
// AND IT IS BLIND WHERE THE HISTORY SAYS IT SHOULD BE, WHICH IS WHY IT IS WORTH HAVING. Einstein and Debye BOTH
// give Dulong-Petit at high T -- measured 3.33e-5 against 2.00e-5 relative at T/Theta = 50, so a Dulong-Petit
// check alone cannot tell them apart. They diverge only in the cold: at T/Theta = 0.05 the ratio is 8e-5, an
// Einstein capacity four orders of magnitude too small. THE HIGH-T AGREEMENT IS THE BLIND PARTNER and the gate
// asserts it stays blind, because a plant that a classical-limit check could catch would be a much weaker plant.

import { debyeCv, debyeEnergyPerTheta, einsteinCv, DULONG_PETIT, LOWT_COEFF } from "../../physics/thermal/debye.mjs";
import { boseIntegral } from "../../physics/thermal/blackbody.mjs";

export const DEBYE_OBSERVABLES = [
    "cvHighT", "dulongPetitRel",
    "cvLowT", "lowTSlope", "lowTSlopeRel",
    "lowTCoeffFromBose", "boseJoinRel",
    "cvMid", "dUdTMid", "derivativeRel",
];

const DEF = { tHigh: 50, tLow: 0.02, tMid: 1, h: 1e-5 };

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

function buildDebye({ mode = "capacity", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT, and it is one substitution: the Debye spectrum becomes Einstein's single frequency. Nothing
    // about the inputs or the readings changes -- a different model answers the same question.
    const cv = config.planted ? einsteinCv : debyeCv;

    const cvHighT = cv(c.tHigh);
    const cvLowT = cv(c.tLow);
    const cvMid = cv(c.tMid);

    // The low-T coefficient reached WITHOUT this module: 9 * 4 * INT_0^inf x^3/(e^x-1) dx, the second factor
    // being blackbody's. A solid's cold heat capacity, computed by the radiation module.
    const lowTCoeffFromBose = 9 * 4 * boseIntegral(4);

    // dU/dT by central difference. The energy integral and the capacity integral are different functions and
    // share no quadrature, so this is a second route rather than a restatement -- and it is left on the HONEST
    // energy on purpose: under the plant the capacity moves and the energy does not, so derivativeRel is where
    // a substituted model shows up as an internal contradiction.
    const hh = c.tMid * c.h;
    const dUdTMid = (debyeEnergyPerTheta(c.tMid + hh) - debyeEnergyPerTheta(c.tMid - hh)) / (2 * hh);

    return {
        cvHighT, dulongPetitRel: rel(cvHighT, DULONG_PETIT),
        cvLowT,
        lowTSlope: cvLowT / Math.pow(c.tLow, 3),
        lowTSlopeRel: rel(cvLowT / Math.pow(c.tLow, 3), LOWT_COEFF),
        lowTCoeffFromBose, boseJoinRel: rel(lowTCoeffFromBose, LOWT_COEFF),
        cvMid, dUdTMid, derivativeRel: rel(cvMid, dUdTMid),
    };
}

const DEBYE_MODES = ["capacity"];   // v4074 -- the single source `modes` and `defaults()` both read

export const debyeDevice = {
    plantKind: "method",
    modes: DEBYE_MODES,
    name: "debye-heat-capacity-vs-einstein",
    observables: DEBYE_OBSERVABLES,
    build: buildDebye,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "capacity"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: DEBYE_MODES.includes(mode) ? mode : DEBYE_MODES[0], config: { ...DEF } }),
};
