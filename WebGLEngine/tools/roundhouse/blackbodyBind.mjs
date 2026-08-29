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
    stefanBoltzmannSigma, wienConstant, K_BOLTZ, H_PLANCK, C_LIGHT,
} from "../../physics/thermal/blackbody.mjs";

export const BLACKBODY_OBSERVABLES = [
    "wienLambdaRoot", "wienLambdaMax", "wienLambdaAgreeRel",
    "wienNuRoot", "wienNuMax", "wienNuAgreeRel",
    "peakProductRatio",
    "bose4Quad", "bose4Closed", "bose4Rel",
    "bose3Quad", "bose3Closed", "bose3Rel",
    "sigma", "wienB", "sigmaFromBoseRel",
];

// *** v4055 -- tLo AND tHi ARE GONE, AND THE OBSERVABLE THAT USED THEM WAS A TAUTOLOGY. ***
// knobLiveness reported tHi as insensitive: flat on the near ladder, waking only at 6e8. The reading was
// right and the cause was not slack in a bound. Its one use was
//
//     exitanceQuarticRel: rel(exitance(tHi) / exitance(tLo), Math.pow(tHi / tLo, 4))
//
// and exitance(T) is `stefanBoltzmannSigma() * Math.pow(T, 4)`, so the left side is sigma*tHi^4 / sigma*tLo^4
// -- ALGEBRAICALLY THE RIGHT SIDE. The old comment beside it said "sigma cancels in the ratio, so this needs
// no constant at all: it is a statement about the exponent". Sigma does cancel; the exponent does not survive
// either, because the 4 is on BOTH sides. What was left graded IEEE754: does pow(a,4)/pow(b,4) equal
// pow(a/b,4). MEASURED at 0 or one ulp (2.5e-16) for temperature ratios spanning twelve orders of magnitude,
// AND FOR tLo === tHi. *** A KEY THAT CANNOT FAIL IS WORSE THAN NO KEY: it reports a passing number and makes
// the device look graded on a law it never touches. *** The 6e8 wake was pow() losing precision, nothing else.
const DEF = { tMax: 8, steps: 400000 };

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
        // *** THE LINK THIS MODULE NEVER GRADED, PUT WHERE THE TAUTOLOGY WAS. *** sigma is TYPED here as the
        // closed form 2 pi^5 k^4 / (15 h^3 c^2), and the Bose integral is computed separately -- and NOTHING
        // checked that the two agree. They must: sigma = 2 pi k^4 / (h^3 c^2) times the integral of
        // x^3/(e^x - 1), which is Gamma(4) zeta(4) = pi^4/15. So this compares the DIMENSIONFUL ANCHOR against
        // the DIMENSIONLESS IDENTITY by a different route -- pi^5/15 typed on one side, Gamma*zeta on the
        // other -- and a wrong power of pi, a 15 written for a 90, or a zeta returning the wrong argument
        // moves it off zero. That last one is not hypothetical: MEASURED_V3811 records zeta.js returning
        // zeta(3) for zeta(2.5). Unlike what it replaces, THIS ONE CAN FAIL.
        sigmaFromBoseRel: rel(2 * Math.PI * Math.pow(K_BOLTZ, 4)
                              / (Math.pow(H_PLANCK, 3) * C_LIGHT * C_LIGHT) * b4c,
                              stefanBoltzmannSigma()),
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
