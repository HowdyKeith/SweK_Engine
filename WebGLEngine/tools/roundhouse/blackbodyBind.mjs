// tools/roundhouse/blackbodyBind.mjs
//
// v4017 -- BLACKBODY JOINS THE ROUNDHOUSE. The thermal family has had excellent selfchecks since v3811 and no
// device: physics/thermal/blackbody.mjs proves Wien, the Gamma(s)zeta(s) identity and the exact SI constants,
// but nothing in the roundhouse could REACH it, so gradedCoverage counted it among the 143 ungraded and
// plantedCoverage could not see the plant its own header describes.
//
// *** EVERY OBSERVABLE HERE IS A TWO-ROUTE AGREEMENT, AND NOT ONE REFERENCE VALUE IS TYPED IN THIS FILE. ***
// That is deliberate and it is the difference between this bind and its own selfcheck. The selfcheck compares
// sigma and b against PUBLISHED CODATA, which is a legitimate outside key -- the same class as the published
// zeta zeros this lab already grades against. A bind is not the place to repeat it: a device that carried its
// own copy of 5.670374419e-8 would be a second declaration of a number, and this tree has spent whole rounds on
// what a second declaration costs. So the device reports what the module can check WITHOUT any outside number:
//
//   WIEN PEAKS        a Newton root of x - n(1 - e^-x) against an INDEPENDENT golden-section maximiser of
//                     x^n/(e^x - 1). Two routes sharing no code: one solves the stationarity condition, the
//                     other never forms it and simply climbs the function.
//   THE BOSE INTEGRAL quadrature of INT x^(s-1)/(e^x-1) against Gamma(s)*zeta(s) reached through TWO OTHER
//                     MODULES -- zeta from physics/zeta.js, Gamma from physics/md/maxwellSpeed.mjs. Three
//                     modules meeting on a number none of them alone computes.
//   THE T^4 LAW       exitance(600)/exitance(300) must be exactly 16. A ratio needs no constant: sigma cancels.
//
// *** THE PLANT IS THE LOAD-BEARING NEGATIVE THE MODULE'S OWN HEADER NAMES, AND IT IS A READER PLANT. ***
// The wavelength peak and the frequency peak ARE NOT THE SAME PHOTON. Converting one to the other with
// lambda*nu = c is the mistake everyone makes: the peak of a distribution depends on whether you bin in
// d(lambda) or d(nu), and the Jacobian reshapes it. Planted, the frequency root is READ as the wavelength root
// (x_nu := x_lambda = 4.9651 instead of 2.8214) and peakProductRatio goes 0.5683 -> 1.0.
//
// It is a READER plant in the v3400 sense and the census should say so: the spectrum is not touched, no input
// produces this failure, and the Newton solver and the maximiser still agree with each other perfectly. What
// breaks is how one number is READ off another.
//
// AND THE PLANT HAS A BLIND PARTNER, WHICH IS A PROPERTY RATHER THAN A GAP. sigma and Wien's b are built from
// the WAVELENGTH root alone, and the bose integrals do not touch either peak, so bose4Rel, bose3Rel, sigma,
// wienB and exitanceQuarticRel are BIT-IDENTICAL under the plant. A device where every observable moved would
// be a device where the plant was too broad to localise anything.

import {
    wienRootNewton, wienPeakMaximise, boseIntegral, boseClosed,
    stefanBoltzmannSigma, wienConstant, exitance,
} from "../../physics/thermal/blackbody.mjs";

export const BLACKBODY_OBSERVABLES = [
    "wienLambdaRoot", "wienLambdaMax", "wienLambdaAgreeRel",
    "wienNuRoot", "wienNuMax", "wienNuAgreeRel",
    "peakProductRatio",
    "bose4Quad", "bose4Closed", "bose4Rel",
    "bose3Quad", "bose3Closed", "bose3Rel",
    "sigma", "wienB", "exitanceQuarticRel",
];

const DEF = { tMax: 8, steps: 400000, tLo: 300, tHi: 600 };

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

function buildBlackbody({ mode = "spectrum", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const q = { tMax: c.tMax, steps: c.steps };

    const xLambda = wienRootNewton(5);
    const xLambdaMax = wienPeakMaximise(5);
    // THE PLANT, and it is exactly one substitution. lambda*nu = c would make the frequency peak sit at the
    // wavelength peak's x. Everything upstream is untouched -- this is a misreading, not a miscomputation.
    const xNu = config.planted ? xLambda : wienRootNewton(3);
    const xNuMax = wienPeakMaximise(3);

    const b4q = boseIntegral(4, q), b4c = boseClosed(4);
    const b3q = boseIntegral(3, q), b3c = boseClosed(3);

    return {
        wienLambdaRoot: xLambda, wienLambdaMax: xLambdaMax, wienLambdaAgreeRel: rel(xLambda, xLambdaMax),
        wienNuRoot: xNu, wienNuMax: xNuMax, wienNuAgreeRel: rel(xNu, xNuMax),
        // 0.5683 honestly; 1.0 under the plant. THE NUMBER THAT IS NOT ONE is the whole finding.
        peakProductRatio: xNu / xLambda,
        bose4Quad: b4q, bose4Closed: b4c, bose4Rel: rel(b4q, b4c),
        bose3Quad: b3q, bose3Closed: b3c, bose3Rel: rel(b3q, b3c),
        sigma: stefanBoltzmannSigma(), wienB: wienConstant(),
        // sigma cancels in the ratio, so this needs no constant at all: it is a statement about the exponent.
        exitanceQuarticRel: rel(exitance(c.tHi) / exitance(c.tLo), Math.pow(c.tHi / c.tLo, 4)),
    };
}

const BLACKBODY_MODES = ["spectrum"];   // v4074 -- the single source `modes` and `defaults()` both read

export const blackbodyDevice = {
    plantKind: "reader",
    modes: BLACKBODY_MODES,
    name: "blackbody-wien-and-the-bose-identity",
    observables: BLACKBODY_OBSERVABLES,
    build: buildBlackbody,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "spectrum"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: BLACKBODY_MODES.includes(mode) ? mode : BLACKBODY_MODES[0], config: { ...DEF } }),
};
