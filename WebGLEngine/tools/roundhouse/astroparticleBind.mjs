// tools/roundhouse/astroparticleBind.mjs
//
// v3501 -- THE ASTROPARTICLE DEVICE. First of the astroparticle field; friedmann, lensing, jeans and halo are
// the modes that follow (each already carries a module-level selfcheck; oscillation did not, and this is its
// first gate as well as the device's).
//
// MODES:
//   "oscillation"  two-flavour neutrino survival, graded on FOUR keys that are DELIBERATELY of different power,
//                  to demonstrate the one lesson oscillation.js was written to teach: a suite can be green while
//                  the physics is wrong by a factor.
//
//     UNITARITY  P(survive) + P(transition) = 1 exactly, transition computed INDEPENDENTLY (not as 1-survive),
//                so the sum is a real test. It is sin^2 + cos^2 in physics notation and holds at every energy,
//                baseline, angle and mass splitting -- a wrong conversion factor cannot touch it.
//     AMPLITUDE  the deepest dip reaches 1 - sin^2(2 theta), set by the MIXING ANGLE alone; a numerical search
//                for the dip is checked against that closed form. The phase decides WHERE the dip is, not how
//                deep, so a wrong constant leaves this untouched too.
//     PHASE      the closed-form first-minimum L/E matches the numerical search -- self-consistent, and (because
//                both use the same coefficient) also blind to the constant.
//     COEFF      the oscillation coefficient DERIVED from hbar c (OSC_COEFF, never typed) matches the known
//                1.266932 to 5e-7. *** THIS IS THE ONLY KEY THAT SEES THE CONSTANT. ***
//
// THE PLANTED ERROR DROPS THE DERIVED CONSTANT (coeff -> 1), the module's own injectable demonstration. Unitarity
// stays exactly 0, amplitude and phase stay green -- and only coeffErr moves, from 5e-7 to 2e-1. A device grading
// only "is it unitary" or "is the dip the right depth" would pass a neutrino sector wrong by 27%; the check that
// catches it is the one chosen deliberately, which is the whole reason oscillation.js derives the constant rather
// than typing it.

import { survival, transition, minSurvival, firstMinimumLE, findFirstMinimum, OSC_COEFF }
    from "../../physics/astroparticle/oscillation.js";
import { expand, fitExponent, ageInHubbleTimes, closure, eOfA, AGE_MATTER_EXACT, AGE_RADIATION_EXACT }
    from "../../physics/astroparticle/friedmann.js";
import { magnifications, magnificationDifference, totalMagnification, einsteinRadius, peakMagnification,
    G_SI, C_LIGHT, M_SUN, PARSEC } from "../../physics/astroparticle/lensing.js";
import { omegaSquared, jeansK, growthRate } from "../../physics/astroparticle/jeans.js";
import { vCirc, mIsothermal, mDisk, enclosedNumeric, massDiscrepancy, G_ASTRO } from "../../physics/astroparticle/halo.js";

// The known (literature) oscillation coefficient. OSC_COEFF is derived from hbar c and NEVER typed; this typed
// value is the INDEPENDENT reference the derivation is checked against -- the derivation is not allowed to define
// its own answer.
const LIT_COEFF = 1.266932;

export const ASTROPARTICLE_OBSERVABLES = [
    "unitarityErr", "amplitudeErr", "phaseErr", "coeffErr",
    "unitary", "amplitudeFromAngle", "phaseFromConstant", "constantDerived",
    "closureErr", "matterExponentErr", "radiationExponentErr", "matterAgeErr", "radiationAgeErr",
    "closes", "matterRegime", "radiationRegime", "ageNotBlind",
    "hubbleConstantErr", "efoldErr", "hubbleConstant", "notPowerLaw",
    "invariantErr", "totalErr", "radiusErr", "invariant", "totalConsistent", "radiusDerived", "peakMovesUnderPlant",
    "thresholdErr", "noGravityMinOmega2", "marginalAtJeansK", "noGravityStable", "collapsesWithGravity",
    "flatErr", "integratorErr", "keplerErr", "discrepancyFactor", "flatIsIsothermal", "integratorMatches", "keplerFalloff", "discrepancyMeasured",
    "planted",
];

// The physical sweep. dm2 kept where the first oscillation minimum lands inside the numerical search window, so
// amplitude and phase are read off a dip the search can actually reach.
const THETAS = [0.2, 0.5, Math.PI / 4, 1.0];         // includes maximal mixing (pi/4)
const DMS = [2.5e-3, 5e-3, 1e-2];                    // first minima ~496, 248, 124 km/GeV
const LS = [180, 295, 810, 1300], ES = [0.6, 1, 2.5, 3];
const SAMPLES = 40000;                               // search resolution; keeps the device build well under a second

function keysFor(coeff) {
    let unit = 0, amp = 0, phase = 0;
    for (const theta of THETAS) for (const dm2 of DMS) {
        for (const L of LS) for (const E of ES) {
            const s = survival({ theta, dm2, L, E, coeff }), t = transition({ theta, dm2, L, E, coeff });
            unit = Math.max(unit, Math.abs(s + t - 1));
        }
        const fm = findFirstMinimum({ theta, dm2, coeff, samples: SAMPLES });
        amp = Math.max(amp, Math.abs(fm.p - minSurvival(theta)));
        const le = firstMinimumLE(dm2, coeff);
        phase = Math.max(phase, Math.abs(le - fm.LE) / le);
    }
    return { unit, amp, phase, coeffErr: Math.abs(coeff - LIT_COEFF) / LIT_COEFF };
}

function buildAstroparticle({ mode = "oscillation", config = {} } = {}) {
    const blank = {
        unitarityErr: null, amplitudeErr: null, phaseErr: null, coeffErr: null,
        unitary: null, amplitudeFromAngle: null, phaseFromConstant: null, constantDerived: null,
        closureErr: null, matterExponentErr: null, radiationExponentErr: null, matterAgeErr: null, radiationAgeErr: null,
        closes: null, matterRegime: null, radiationRegime: null, ageNotBlind: null,
        hubbleConstantErr: null, efoldErr: null, hubbleConstant: null, notPowerLaw: null,
        invariantErr: null, totalErr: null, radiusErr: null, invariant: null, totalConsistent: null, radiusDerived: null, peakMovesUnderPlant: null,
        thresholdErr: null, noGravityMinOmega2: null, marginalAtJeansK: null, noGravityStable: null, collapsesWithGravity: null,
        flatErr: null, integratorErr: null, keplerErr: null, discrepancyFactor: null, flatIsIsothermal: null, integratorMatches: null, keplerFalloff: null, discrepancyMeasured: null,
        planted: !!config.planted,
    };
    if (mode === "oscillation") {
        const coeff = config.planted ? 1 : OSC_COEFF;   // the built-in plant: drop the derived constant
        const k = keysFor(coeff);
        return {
            ...blank,
            unitarityErr: k.unit, amplitudeErr: k.amp, phaseErr: k.phase, coeffErr: k.coeffErr,
            unitary: k.unit === 0,
            amplitudeFromAngle: k.amp < 1e-5,
            phaseFromConstant: k.phase < 1e-3,
            constantDerived: k.coeffErr < 1e-4,
        };
    }
    if (mode === "friedmann") {
        return friedmannKeys(!!config.planted);
    }
    if (mode === "lensing") {
        return lensingKeys(!!config.planted);
    }
    if (mode === "jeans") {
        return jeansKeys(!!config.planted);
    }
    if (mode === "halo") {
        return haloKeys(!!config.planted);
    }
    if (mode === "desitter") {
        return deSitterKeys(!!config.planted);
    }
    return blank;
}

// The planted history: matter dilutes as a^(-2) (curvature-like) instead of a^(-3). Radiation (a^-4) and the
// closure identity are untouched by construction, which is the whole demonstration -- a wrong matter exponent
// leaves the radiation regime and the sum-to-one identity green. Identical to the module's expand at mp = 3.
function expandPlanted({ Om = 0, Or = 0, OL = 0, a0 = 1e-6, aEnd = 1, steps = FRIED_STEPS, mp = 3 } = {}) {
    const O = closure({ Om, Or, OL });
    const e = (a) => Math.sqrt(Or / (a * a * a * a) + Om / Math.pow(a, mp) + O.Ok / (a * a) + OL);
    const g = (a) => 1 / (a * e(a));
    let tau = 0; const h = (aEnd - a0) / steps; const track = [];
    for (let i = 0; i < steps; i++) {
        const a = a0 + i * h;
        const k1 = g(a), k2 = g(a + h / 2), k3 = g(a + h / 2), k4 = g(a + h);
        tau += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
        if (i % Math.max(1, Math.floor(steps / 400)) === 0) track.push({ a: a + h, tau });
    }
    return { tau, track };
}

const FRIED_STEPS = 40000;

function friedmannKeys(planted) {
    const blank = {
        unitarityErr: null, amplitudeErr: null, phaseErr: null, coeffErr: null,
        unitary: null, amplitudeFromAngle: null, phaseFromConstant: null, constantDerived: null,
        closureErr: null, matterExponentErr: null, radiationExponentErr: null, matterAgeErr: null, radiationAgeErr: null,
        closes: null, matterRegime: null, radiationRegime: null, ageNotBlind: null, planted,
    };
    // MATTER regime: the module's expand when correct, the a^-2 reimplementation when planted.
    const mTrack = planted ? expandPlanted({ Om: 1, mp: 2 }) : expand({ Om: 1, Or: 0, OL: 0, steps: FRIED_STEPS });
    const matterExponentErr = Math.abs(fitExponent(mTrack.track) - 2 / 3);
    const matterAgeErr = Math.abs(mTrack.tau - AGE_MATTER_EXACT);
    // RADIATION regime: always the module (the plant is on the matter term alone) -- must stay green under the plant.
    const rTrack = expand({ Om: 0, Or: 1, OL: 0, steps: FRIED_STEPS });
    const radiationExponentErr = Math.abs(fitExponent(rTrack.track) - 1 / 2);
    const radiationAgeErr = Math.abs(rTrack.tau - AGE_RADIATION_EXACT);
    // CLOSURE: Om + Or + Ok + OL = 1 by DEFINITION (Ok is the remainder) -- an identity, blind to any dilution error.
    const O = closure({ Om: 0.3, Or: 1e-4, OL: 0.7 });
    const closureErr = Math.abs(O.Om + O.Or + O.Ok + O.OL - 1);
    return {
        ...blank,
        closureErr, matterExponentErr, radiationExponentErr, matterAgeErr, radiationAgeErr,
        closes: closureErr === 0,
        matterRegime: matterExponentErr < 1e-5,
        radiationRegime: radiationExponentErr < 1e-5,
        ageNotBlind: matterAgeErr < 1e-5,   // the flat matter-only age = 2/3, the one key a wrong dilution moves
    };
}

// A canonical stellar microlensing geometry, and the planted Einstein radius (wrong 2GM/c^2 factor instead of 4).
const LENS = { M: 0.3 * M_SUN, dL: 4e3 * PARSEC, dS: 8e3 * PARSEC };
const LENS_US = [0.05, 0.1, 0.3, 0.5, 1.0, 1.7, 3.0];
const einsteinPlanted = ({ M, dL, dS }) =>
    Math.sqrt((2 * G_SI * M / (C_LIGHT * C_LIGHT)) * (dS - dL) / (dL * dS));   // factor 2, not 4

function lensingKeys(planted) {
    const blank = {
        unitarityErr: null, amplitudeErr: null, phaseErr: null, coeffErr: null,
        unitary: null, amplitudeFromAngle: null, phaseFromConstant: null, constantDerived: null,
        closureErr: null, matterExponentErr: null, radiationExponentErr: null, matterAgeErr: null, radiationAgeErr: null,
        closes: null, matterRegime: null, radiationRegime: null, ageNotBlind: null,
        invariantErr: null, totalErr: null, radiusErr: null, invariant: null, totalConsistent: null, radiusDerived: null,
        peakMovesUnderPlant: null, planted,
    };
    // THE INVARIANT (blind): mu_+ - mu_- = 1, from the two INDEPENDENT magnifications. A function of u alone, so
    // it carries no theta_E and cannot see an Einstein-radius error. And a consistency identity: total = sum.
    let invariantErr = 0, totalErr = 0;
    for (const u of LENS_US) {
        invariantErr = Math.max(invariantErr, Math.abs(magnificationDifference(u) - 1));
        const m = magnifications(u);
        totalErr = Math.max(totalErr, Math.abs(totalMagnification(u) - (m.plus + m.minus)));
    }
    // THE RADIUS (not blind): the module's einstein radius vs an independent Schwarzschild-radius route
    // (4GM/c^2 = 2 R_s). The plant uses the wrong 2GM/c^2 factor, so the radius is off by sqrt(1/2).
    const Rs = 2 * G_SI * LENS.M / (C_LIGHT * C_LIGHT);
    const thetaRef = Math.sqrt(2 * Rs * (LENS.dS - LENS.dL) / (LENS.dL * LENS.dS));
    const thetaMod = planted ? einsteinPlanted(LENS) : einsteinRadius(LENS);
    const radiusErr = Math.abs(thetaMod - thetaRef) / thetaRef;
    // The CONSEQUENCE the invariant is blind to: at a fixed physical alignment beta, u0 = beta/theta_E, so a wrong
    // theta_E moves u0 and the peak magnification the telescope records -- while mu_+ - mu_- there is still 1.
    const beta = 0.4 * thetaRef;                              // a fixed angle on the sky
    const peakTrue = peakMagnification(beta / thetaRef);
    const peakSeen = peakMagnification(beta / thetaMod);
    const peakMovesUnderPlant = Math.abs(peakSeen - peakTrue) > 1e-3;   // true only when the radius is wrong
    return {
        ...blank,
        invariantErr, totalErr, radiusErr,
        invariant: invariantErr < 1e-12,
        totalConsistent: totalErr < 1e-12,
        radiusDerived: radiusErr < 1e-6,
        peakMovesUnderPlant,
    };
}

// The Jeans instability. All closed-form (the grid Poisson simulation is corroborated in the selfcheck, not run
// per build). The plant flips the sign of the gravity term in the dispersion relation.
const JEANS_P = { cs: 1, rho0: 1, G: 1 };
const JEANS_KS = [0.37, 1, 2, 3, 5, 8, 20];                       // spans the crossover k_J = sqrt(4 pi) ~ 3.545
const omega2Planted = (k, { cs, rho0, G }) => cs * cs * k * k + 4 * Math.PI * G * rho0;   // WRONG sign on gravity

function jeansKeys(planted) {
    const blank = {
        unitarityErr: null, amplitudeErr: null, phaseErr: null, coeffErr: null,
        unitary: null, amplitudeFromAngle: null, phaseFromConstant: null, constantDerived: null,
        closureErr: null, matterExponentErr: null, radiationExponentErr: null, matterAgeErr: null, radiationAgeErr: null,
        closes: null, matterRegime: null, radiationRegime: null, ageNotBlind: null,
        invariantErr: null, totalErr: null, radiusErr: null, invariant: null, totalConsistent: null, radiusDerived: null, peakMovesUnderPlant: null,
        thresholdErr: null, noGravityMinOmega2: null, marginalAtJeansK: null, noGravityStable: null, collapsesWithGravity: null,
        planted,
    };
    const w2 = planted ? omega2Planted : omegaSquared;
    // THE CROSSOVER IDENTITY: at k_J the dispersion is marginal, omega^2 = 0 exactly. The plant's sign flip makes
    // it 8 pi G rho instead -- so this is the key that SEES the error.
    const kJ = jeansK(JEANS_P);
    const thresholdErr = Math.abs(w2(kJ, JEANS_P));
    // THE THEOREM (blind): with G = 0 the gravity term vanishes whatever its sign, so omega^2 = cs^2 k^2 > 0 for
    // every k -- collapse never happens, identically. A stronger statement than any numerical comparison, and it
    // cannot see the sign error.
    let minNoG = Infinity, anyUnstableNoG = false;
    for (const k of JEANS_KS) { const v = w2(k, { cs: 1, rho0: 1, G: 0 }); minNoG = Math.min(minNoG, v); if (v < 0) anyUnstableNoG = true; }
    // POSITIVE CONTROL / the physics the plant destroys: WITH gravity, a long wavelength (k < k_J) collapses.
    // Correct: omega^2(k=1) < 0 (unstable). Planted (+ sign): omega^2(k=1) > 0 -- structure never forms.
    const collapsesWithGravity = w2(1.0, JEANS_P) < 0;
    return {
        ...blank,
        thresholdErr, noGravityMinOmega2: minNoG,
        marginalAtJeansK: thresholdErr < 1e-9,
        noGravityStable: !anyUnstableNoG && minNoG > 0,
        collapsesWithGravity,
    };
}

// Galaxy rotation curves. WHAT THIS MEASURES IS A DISCREPANCY; IT DOES NOT DETECT ANYTHING. The keys are the
// arithmetic of enclosed mass (exact) and the size of the gap (measured) -- nothing else. The plant corrupts the
// numerical integrator's shell integrand; the exact isothermal identity and the Keplerian control catch it.
const HALO_V0 = 200, HALO_RADII = [1, 5, 10, 20, 50];
const rhoIso = (r) => HALO_V0 * HALO_V0 / (4 * Math.PI * G_ASTRO * r * r);
// planted integrator: 4 pi r rho instead of 4 pi r^2 rho (a dropped radius) -- the classic shell-volume slip.
function enclosedPlanted(rho, r, { steps = 20000 } = {}) {
    let s = 0; const h = r / steps;
    for (let i = 0; i < steps; i++) { const a = (i + 0.5) * h; s += 4 * Math.PI * a * rho(a) * h; }
    return s;
}

function haloKeys(planted) {
    const blank = {
        unitarityErr: null, amplitudeErr: null, phaseErr: null, coeffErr: null,
        unitary: null, amplitudeFromAngle: null, phaseFromConstant: null, constantDerived: null,
        closureErr: null, matterExponentErr: null, radiationExponentErr: null, matterAgeErr: null, radiationAgeErr: null,
        closes: null, matterRegime: null, radiationRegime: null, ageNotBlind: null,
        invariantErr: null, totalErr: null, radiusErr: null, invariant: null, totalConsistent: null, radiusDerived: null, peakMovesUnderPlant: null,
        thresholdErr: null, noGravityMinOmega2: null, marginalAtJeansK: null, noGravityStable: null, collapsesWithGravity: null,
        flatErr: null, integratorErr: null, keplerErr: null, discrepancyFactor: null, flatIsIsothermal: null, integratorMatches: null, keplerFalloff: null, discrepancyMeasured: null,
        planted,
    };
    // THE EXACT IDENTITY (the trusted control): for a singular isothermal sphere M(r) = v0^2 r / G, so vCirc is
    // EXACTLY v0 at every radius -- a flat rotation curve is what the isothermal halo IS, not what it approximates.
    let flatErr = 0;
    for (const r of HALO_RADII) flatErr = Math.max(flatErr, Math.abs(vCirc(mIsothermal(HALO_V0)(r), r) - HALO_V0));
    // THE INTEGRATOR (the not-blind key): the numerical enclosed-mass integral vs that closed form. The identity
    // is the control the module built precisely to validate the integrator used on profiles with no closed form.
    const encl = planted ? enclosedPlanted : enclosedNumeric;
    let integratorErr = 0;
    for (const r of HALO_RADII) {
        const num = encl(rhoIso, r), exact = HALO_V0 * HALO_V0 * r / G_ASTRO;
        integratorErr = Math.max(integratorErr, Math.abs(num - exact) / exact);
    }
    // THE KEPLERIAN CONTROL: outside all mass, v falls as r^-1/2, so v*sqrt(r) is constant.
    const Mp = 1e11, ref = vCirc(Mp, HALO_RADII[0]) * Math.sqrt(HALO_RADII[0]);
    let keplerErr = 0;
    for (const r of HALO_RADII) keplerErr = Math.max(keplerErr, Math.abs(vCirc(Mp, r) * Math.sqrt(r) - ref) / ref);
    // THE DISCREPANCY -- the ONLY thing this claims, and it is a MEASUREMENT, not a detection: the factor by which
    // the enclosed mass a flat curve requires exceeds the luminous disk. Reported, never adjudicated pass/fail.
    const d = massDiscrepancy({ mVisible: mDisk(6e10, 3), vObserved: 200, r: 30 });
    return {
        ...blank,
        flatErr, integratorErr, keplerErr, discrepancyFactor: d.factor,
        flatIsIsothermal: flatErr === 0,
        integratorMatches: integratorErr < 1e-6,
        keplerFalloff: keplerErr < 1e-9,
        discrepancyMeasured: Number.isFinite(d.factor) && d.factor > 1,   // a gap exists; WHAT it is, this cannot say
    };
}

// v3523 -- THE LAMBDA-DOMINATED (de SITTER) REGIME, completing the trilogy the friedmann mode began (matter t^2/3,
// radiation t^1/2). This one is NOT a power law: with only a cosmological constant, E(a) = sqrt(OL) = 1 for EVERY
// a, so the Hubble rate is CONSTANT and the scale factor grows as exp(H0 t). The plant makes Lambda dilute like
// matter (OL/a^3), which destroys the constant-H property; the closure identity stays blind to it.
function deSitterKeys(planted) {
    const blank = {
        unitarityErr: null, amplitudeErr: null, phaseErr: null, coeffErr: null,
        unitary: null, amplitudeFromAngle: null, phaseFromConstant: null, constantDerived: null,
        closureErr: null, matterExponentErr: null, radiationExponentErr: null, matterAgeErr: null, radiationAgeErr: null,
        closes: null, matterRegime: null, radiationRegime: null, ageNotBlind: null,
        hubbleConstantErr: null, efoldErr: null, hubbleConstant: null, notPowerLaw: null,
        invariantErr: null, totalErr: null, radiusErr: null, invariant: null, totalConsistent: null, radiusDerived: null, peakMovesUnderPlant: null,
        thresholdErr: null, noGravityMinOmega2: null, marginalAtJeansK: null, noGravityStable: null, collapsesWithGravity: null,
        flatErr: null, integratorErr: null, keplerErr: null, discrepancyFactor: null, flatIsIsothermal: null, integratorMatches: null, keplerFalloff: null, discrepancyMeasured: null,
        planted,
    };
    // H CONSTANT (the defining property): E(a) = H(a)/H0 = sqrt(OL) = 1 at every a in a Lambda-only universe. The
    // plant makes Lambda dilute like matter (a^-3), so E(a) is no longer 1.
    const E = planted ? (a) => Math.sqrt(1 / (a * a * a)) : (a) => eOfA(a, { Om: 0, Or: 0, Ok: 0, OL: 1 });
    let hubbleConstantErr = 0;
    for (const a of [1e-3, 0.01, 0.1, 0.3, 0.5, 0.8, 1.0]) hubbleConstantErr = Math.max(hubbleConstantErr, Math.abs(E(a) - 1));
    // EXPONENTIAL: with E = 1, dtau/da = 1/a, so tau = ln(aEnd/a0) -- an e-folding per Hubble time. Graded on the
    // REAL module (expand uses the real eOfA), a corroboration that the Lambda-only expansion is exponential.
    const a0 = 0.05, aEnd = 1;
    const efoldErr = Math.abs(expand({ Om: 0, Or: 0, OL: 1, a0, aEnd, steps: 40000 }).tau - Math.log(aEnd / a0));
    // NOT A POWER LAW: a fit exponent on the de Sitter track is nothing like matter (2/3) or radiation (1/2).
    const dsExp = fitExponent(expand({ Om: 0, Or: 0, OL: 1, a0: 1e-3, aEnd: 1, steps: 40000 }).track);
    const notPowerLaw = Math.abs(dsExp - 2 / 3) > 1 && Math.abs(dsExp - 1 / 2) > 1;
    // CLOSURE (blind control): Om + Or + Ok + OL = 1 by definition, untouched by how Lambda scales.
    const O = closure({ Om: 0, Or: 0, OL: 1 });
    const closureErr = Math.abs(O.Om + O.Or + O.Ok + O.OL - 1);
    return {
        ...blank,
        hubbleConstantErr, efoldErr, closureErr,
        hubbleConstant: hubbleConstantErr === 0,
        notPowerLaw,
        closes: closureErr === 0,
    };
}

export const astroparticleDevice = {
    // v3501 -- KNOB PLANT: the perturbation replaces a derived PHYSICS CONSTANT (the oscillation coefficient)
    // upstream of every observable, so the whole path from the wrong derivation to the reported number is graded.
    plantKind: "knob",
    // v3502 -- FRIEDMANN added. The matter/radiation/Lambda regimes fail differently (beam's static/vibration/
    // buckling structure), so a third regime is not a restatement. closureErr is a DEFINITIONAL identity (Ok is
    // the remainder) and is on the exact-zero register; the flat matter-only age = 2/3 is the one key a wrong
    // dilution moves. The plant sets the matter term to a^-2: matter breaks, radiation and closure stay green.
    // v3516 -- LENSING added. mu_+ - mu_- = 1 exactly (from two INDEPENDENT magnifications) is an invariant that
    // carries no parameter, so it is BLIND to an Einstein-radius error -- the fourth subject in that pattern. The
    // radius derived from G and c (4GM/c^2) is the not-blind key; the plant's wrong 2GM/c^2 factor breaks it and
    // moves the peak magnification a telescope would record, while the invariant stays 1.
    // v3517 -- JEANS added. The star key is a THEOREM: without gravity (G=0) no wavelength is ever unstable, omega^2
    // = cs^2 k^2 > 0 identically -- the "provably cannot happen" regime, the Turing-round shape. The crossover
    // identity omega^2(k_J) = 0 is the key that SEES the plant's gravity-sign flip; the theorem is blind to it,
    // and the sign flip also destroys gravitational collapse (collapsesWithGravity flips false) while G=0 stays green.
    // v3518 -- HALO added, closing round 1. The honest mode: it MEASURES A DISCREPANCY and detects nothing. The
    // exact isothermal identity vCirc(M_iso) = v0 (flat curve IS the isothermal sphere) is the trusted control the
    // module built to validate the numerical integrator; the plant's dropped-radius shell integrand breaks
    // integratorErr while the analytic identity and Keplerian control stay green. discrepancyFactor is reported as
    // a measurement, never as "dark matter detected".
    // v3523 -- desitter added: the Lambda-dominated regime (H constant, exponential growth) completing the
    // matter/radiation power-law trilogy the friedmann mode began. hubbleConstantErr (E(a)=1) is on the register;
    // the plant makes Lambda dilute like matter and the closure identity stays blind.
    modes: ["oscillation", "friedmann", "lensing", "jeans", "halo", "desitter"],
    name: "astroparticle-cosmology-and-neutrinos",
    observables: ASTROPARTICLE_OBSERVABLES,
    build: buildAstroparticle,
    // v3501 -- GUARDED: an undeclared mode returns null (the beamBind refusal), so the device runs the physics it
    // declares or none, never a silent substitution. A mode selects which physics runs.
    defaults: ({ mode } = {}) => {
        const m = mode == null ? "oscillation" : mode;
        return ["oscillation", "friedmann", "lensing", "jeans", "halo", "desitter"].includes(m) ? { mode: m, config: {} } : null;
    },
};
