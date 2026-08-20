// WebGLEngine/physics/centrifugeKnob.mjs -- v3597
// ---------------------------------------------------------------------------------------------------------------
// THE SECOND CANDIDATE SCENE, AND THE KEY THE TRIAGE PROPOSED IS FOR PHYSICS THIS MODULE DOES NOT HAVE.
//
// labScenes' centrifuge row says: "sedimentation equilibrium in a rotating frame has a closed form: the
// concentration profile is exponential in omega^2 r^2, so the knob enters the ANSWER analytically."
//
// *** THERE IS NO SEDIMENTATION EQUILIBRIUM IN physics/centrifuge.js, BECAUSE THERE IS NO DIFFUSION. ***
// centrifugeStep is `p.r += s * w2 * p.r * dt` and a clamp -- verified: no Math.random, no kT, no Boltzmann,
// no diffusion term anywhere in the file. An equilibrium profile is the balance between sedimentation and
// BROWNIAN back-diffusion, and with only the first term every particle drifts to the wall and stays there.
// An adjudicator written against that profile would have been grading a model nobody implemented -- which is
// worse than an invented adjudicator, because it would look like real physics right up until it failed.
//
// *** AND v3590's SUPPORTING MEASUREMENT WAS A MIRROR. *** The row's key2 records radialSpeed at omega
// 1, 2, 4, 8, 16 giving ratios of EXACTLY 4.000 per doubling and calls that the exponent the physics
// predicts. radialSpeed IS `sedCoeff(...) * omega * omega * p.r` -- reading omega^2 back out of a function
// that multiplies by omega^2. EXACTLY 4.000 to four digits over a 16x sweep is the give-away (v3543: the
// mirror agreed too exactly). Nothing was integrated, so nothing was tested.
//
// ================================================================================================================
// WHAT IS ACTUALLY GRADEABLE, AND THE ALIASING QUESTION v3596 SAID TO ASK FIRST
// ================================================================================================================
//
// v3596 found that a recovered frequency and a closed form ALIASED IDENTICALLY and agreed about a mode that
// did not exist. The worry carried into this round was the same shape: an exponent recovered from a FIT and
// an exponent sitting in a CLOSED FORM can be the same number for the wrong reason.
//
// *** MEASURED, AND THEY DO NOT ALIAS -- AND THE PROOF IS THAT THEY DISAGREE BY A PREDICTABLE AMOUNT. ***
// The doubling time's exponent against omega reads -1.995913 / -1.998974 / -1.999743 / -1.999936 at
// dt = 1/60, 1/240, 1/960, 1/3840. NOT -2, and the error QUARTERS AS dt QUARTERS: 4.09e-3, 1.03e-3, 2.57e-4,
// 6.4e-5. IF THE FIT WERE READING THE CLOSED FORM BACK IT WOULD RETURN EXACTLY -2 AT EVERY dt AND THE CHECK
// WOULD BE VACUOUS. The gap is the discretisation, it converges at the order forward Euler claims, and that
// convergence is what makes the key a measurement rather than a restatement. ASKING THE QUESTION IS WHAT
// TURNED A SUSPECT KEY INTO A GOOD ONE.
//
// SO THE VERDICT SPLITS TWO CLAIMS THAT ARE USUALLY CONFLATED (v3423's rule, one level up on the knob):
//   1. DOES THE STEPPER DO WHAT IT SAYS -- forward Euler on dr/dt = k r is r_{n+1} = r_n(1 + k dt), whose
//      EXACT rate is ln(1 + k dt)/dt, NOT k. Measured against that: 1.87e-13 down to 3.25e-15. EXACT, and
//      graded as an identity with no tolerance anybody chose.
//   2. IS THE ANSWER PHYSICS OR THE STEPPER -- the departure from the CONTINUOUS law is the leading term
//      x/2 with x = k dt, PREDICTED FROM THE SERIES AND NOT FITTED: measured/predicted = 0.9999, 0.9991,
//      0.9975, 0.9904 at omega 20, 60, 100, 200.
//   A CHECK AGAINST k ALONE WOULD CALL THE EXACT DISCRETE ANSWER AN ERROR; A CHECK AGAINST ln(1+x)/x ALONE
//   WOULD PASS AN INTEGRATOR THAT CONVERGED ON NOTHING.
//
// AND THE REFUSAL BOUNDARY IS MATHEMATICS RATHER THAN A THRESHOLD: ln(1+x) has radius of convergence 1, so
// at x >= 1 a leading-order description of the truncation error means nothing and the reported doubling time
// stops being about the physics. Measured at x = 2.133 (omega 1200): the run takes 87% LONGER than the
// continuous law says, and the leading-term prediction is out by 19%.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { sedCoeff, centrifugeStep } from "./centrifuge.js";

export const DT = 1 / 60;
export const PARTICLE = { a: 0.02, rho: 2, r0: 0.1 };
export const FLUID = { rhoF: 1, eta: 1 };
// THE SERIES' OWN RADIUS, NOT A CHOSEN BOUND. ln(1+x) converges for |x| < 1; beyond it the expansion whose
// leading term this key uses does not exist, so the question stops being askable rather than the answer
// becoming bad. Stated as a NAME so nobody reads it as a tuned tolerance.
export const SERIES_RADIUS = 1;

export const rateFor = (omega, o = {}) =>
    sedCoeff(o.a ?? PARTICLE.a, o.rho ?? PARTICLE.rho, o.rhoF ?? FLUID.rhoF, o.eta ?? FLUID.eta) * omega * omega;

/**
 * Doubling time measured FROM THE INTEGRATED TRAJECTORY. The crossing is interpolated GEOMETRICALLY within
 * the step, because the growth is exponential in the step index and a linear interpolation would leave a
 * dt-sized quantisation that swamps the very departure this key is about -- my first probe read 0.80000
 * against a true 0.78555 for exactly that reason, a 1.8% artefact of the stopping rule wearing a physics
 * verdict. It never calls rateFor.
 */
export function doublingTime(omega, o = {}) {
    const dt = o.dt ?? DT, r0 = o.r0 ?? PARTICLE.r0, cap = o.maxSteps ?? 8e6;
    const p = { a: o.a ?? PARTICLE.a, rho: o.rho ?? PARTICLE.rho, r: r0, species: 0 };
    let t = 0;
    for (let i = 0; i < cap; i++) {
        const prev = p.r;
        centrifugeStep([p], { omega, dt, rhoF: o.rhoF ?? FLUID.rhoF, eta: o.eta ?? FLUID.eta, rMax: 1e9 });
        t += dt;
        if (!(p.r > prev)) return null;              // not growing: nothing to time
        if (p.r >= 2 * r0) {
            const f = Math.log((2 * r0) / prev) / Math.log(p.r / prev);
            return t - dt + f * dt;
        }
    }
    return null;
}

/** The exponent of the doubling time against omega, FITTED. The continuous law says -2; the stepper does not. */
export function omegaExponent(o = {}) {
    const ws = o.omegas ?? [20, 40, 60, 80, 100];
    const xs = ws.map((w) => Math.log(w)), ys = ws.map((w) => Math.log(doublingTime(w, o)));
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return num / den;
}

export function adjudicate(omega, o = {}) {
    if (!Number.isFinite(omega) || omega <= 0)
        return { pass: false, evidence: { omega, reason: "spin rate must be finite and positive" } };
    const dt = o.dt ?? DT;
    const k = rateFor(omega, o), x = k * dt;

    // *** THE BOUNDARY IS THE SERIES, NOT A TOLERANCE. *** Beyond it the leading-term description this key
    // rests on does not exist, so the device is refused rather than graded loosely.
    if (x >= SERIES_RADIUS)
        return { pass: false, evidence: { omega, x, radius: SERIES_RADIUS,
                 reason: "PAST THE EXPANSION'S RADIUS: s*omega^2*dt >= 1, so ln(1+x)'s series does not " +
                         "converge and a leading-order account of the truncation error has no meaning. The " +
                         "run is reporting the stepper rather than the physics -- at x = 2.13 it takes 87% " +
                         "longer to double than the continuous law says" } };

    const T = doublingTime(omega, o);
    if (T === null)
        return { pass: false, evidence: { omega, reason: "the particle never doubled its radius in the budget" } };

    // (1) THE STEPPER AGAINST ITS OWN EXACT RATE -- an identity, graded at machine precision.
    const discreteRate = Math.log(1 + x) / dt;
    const tDiscrete = Math.LN2 / discreteRate;
    const relDiscrete = Math.abs(T - tDiscrete) / tDiscrete;
    if (!(relDiscrete < 1e-9))
        return { pass: false, evidence: { omega, T, tDiscrete, relDiscrete,
                 reason: "the stepper does not reproduce its OWN exact discrete rate ln(1+k dt)/dt, which is " +
                         "an identity rather than an approximation" } };

    // (2) THE DEPARTURE FROM THE PHYSICS IS THE LEADING TERM, PREDICTED FROM THE SERIES AND NOT FITTED.
    // ln(1+x)/x = 1 - x/2 + x^2/3 - ..., so T/tContinuous - 1 = x/2 to leading order. The bound on the
    // prediction is THE NEXT TERM'S OWN SIZE -- there is no constant here anybody chose.
    const tContinuous = Math.LN2 / k;
    const departure = (T - tContinuous) / tContinuous;
    const predicted = x / 2, nextTerm = (x * x) / 3;
    const missed = Math.abs(departure - predicted);
    return { pass: missed <= nextTerm,
             evidence: { omega, x, T, tDiscrete, tContinuous, relDiscrete, departure, predicted,
                         nextTerm, missed, ratio: departure / predicted,
                         law: "r(t) = r0 exp(s omega^2 t); forward Euler's exact rate is ln(1+k dt)/dt and " +
                              "its departure from k is x/2 to leading order, with x = s omega^2 dt" } };
}

/**
 * A FAST SPIN IS CHEAPER TO MEASURE and that is the whole preference: the doubling time falls as omega^-2,
 * so a run at omega 100 finishes in 0.786s of simulated time against 19.50s at omega 20 -- 25x, MEASURED.
 * Arithmetic only, never a call to adjudicate() (proposers.SCORE_IS_A_REWARD's independence rule).
 * *** AND IT PULLS STRAIGHT PAST THE SERIES BOUNDARY, WHICH IS THE TENSION THE LOOP EXISTS FOR: *** the
 * cheapest spin is the fastest, and the fastest spins are exactly where forward Euler stops integrating the
 * ODE it claims to integrate.
 */
export function score(omega, o = {}) {
    return Number.isFinite(omega) && omega > 0 ? rateFor(omega, o) : -Infinity;
}

/** Candidates spanning the good band AND the far side of the series boundary (x = 1 sits near omega 822). */
export function propose({ current = 30 } = {}) {
    return [20, 60, 100, 200, 400, 900, 1500].filter((v) => v !== current);
}

export const MEASURED_V3597 = {
    theProposedKeyIsForAnotherModel:
        "*** THE TRIAGE ROW ASKED FOR AN EXPONENTIAL CONCENTRATION PROFILE AT SEDIMENTATION EQUILIBRIUM AND " +
        "physics/centrifuge.js HAS NO DIFFUSION TERM. *** No Math.random, no kT, no Boltzmann, no diffusion " +
        "anywhere in the file -- centrifugeStep is drift plus a clamp, so every particle reaches the wall and " +
        "there is no equilibrium to have a profile. Grading against it would have been grading a model nobody " +
        "implemented, which looks like real physics until the day it fails.",
    theSupportingMeasurementWasAMirror:
        "key2 recorded radialSpeed ratios of EXACTLY 4.000 per doubling of omega and called that the " +
        "exponent the physics predicts. radialSpeed IS sedCoeff(...)*omega*omega*r, so it reads omega^2 back " +
        "out of a function that multiplies by omega^2. FOUR EXACT DIGITS OVER A 16x SWEEP IS THE GIVE-AWAY.",
    theExponentsDoNotAlias:
        "*** v3596 SAID TO CHECK WHETHER A FITTED EXPONENT AND A CLOSED-FORM ONE ALIAS. THEY DO NOT, AND THE " +
        "PROOF IS THAT THEY DISAGREE BY A CONVERGING AMOUNT. *** The doubling time's exponent against omega " +
        "reads -1.995913 / -1.998974 / -1.999743 / -1.999936 at dt = 1/60, 1/240, 1/960, 1/3840 -- error " +
        "4.09e-3, 1.03e-3, 2.57e-4, 6.4e-5, QUARTERING WITH dt. A fit reading the closed form back would " +
        "return exactly -2 at every dt and the check would be vacuous.",
    twoClaimsUsuallyConflated:
        "relDiscrete 1.87e-13 / 1.49e-14 / 3.25e-15 at omega 20 / 60 / 100 -- the stepper reproduces its OWN " +
        "exact rate to machine precision -- while the departure from the CONTINUOUS law is 2.96e-4 / 2.66e-3 " +
        "/ 7.39e-3 and QUARTERS when dt quarters. Measured/predicted x/2 = 0.9999 / 0.9991 / 0.9975 / 0.9904 " +
        "at omega 20 / 60 / 100 / 200, falling to 0.8137 at x = 2.13.",
    theCostIsReal:
        "doubling time 19.50s at omega 20 against 0.786s at omega 100 -- 25x, which is why 'prefer a fast " +
        "spin' is a cost argument rather than a device for manufacturing tension.",
};

export function reportLines() {
    const L = [];
    L.push("[centrifugeKnob] the omega knob, and the two claims a single check would conflate");
    L.push("");
    L.push("  omega   x=s*w2*dt   departure   predicted   verdict");
    for (const w of [20, 100, 400, 900, 1500]) {
        const v = adjudicate(w), e = v.evidence;
        L.push("  " + String(w).padStart(5) + "   " +
               (e.x != null ? e.x.toExponential(2) : "--").padEnd(11) +
               (e.departure != null ? e.departure.toExponential(2) : "--").padEnd(12) +
               (e.predicted != null ? e.predicted.toExponential(2) : "--").padEnd(12) +
               (v.pass ? "PASS" : "refused: " + String(e.reason || "").slice(0, 46)));
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
