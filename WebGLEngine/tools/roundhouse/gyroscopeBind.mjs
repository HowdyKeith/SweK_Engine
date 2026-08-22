// WebGLEngine/tools/roundhouse/gyroscopeBind.mjs -- v3197
//
// THE GYROSCOPE AS A GRADED DEVICE, AND ITS KEY IS AN ORDER RATHER THAN A VALUE.
//
// v3195's census named this one; v3196 graded figureEight and left it. A spinning gyroscope PRECESSES instead
// of falling, and the textbook rate is
//
//     omega_p = tau / L
//
// *** MEASURED, THAT IS NOT EXACT -- AND THE INTERESTING PART IS HOW IT IS WRONG. *** rate * L gives 11.785,
// 11.948 and 11.987 against an applied torque of exactly 12, so the relative error is 1.8%, 0.4%, 0.1% as the
// spin doubles. THE ERROR FALLS AS 1/L SQUARED: the ratio on doubling is 4.115, 4.031, 4.008, 4.002, converging
// on exactly 4.
//
// SO THE OBSERVABLE IS THE RATIO, NOT THE ERROR. A device grading "rate*L is close to tau" would be asserting a
// tolerance nobody derived; one grading "the error QUARTERS when the spin DOUBLES" is asserting the order of
// the approximation, which is a fact about the physics and needs no tolerance at all. That is probe's
// firstorder mode one order up, and it is why this device's default is not its sharpest mode.
//
//   "precess"  the claim: rate * L against tau, with the 1/L^2 shortfall reported rather than hidden
//   "order"    THE SHARP ONE: the error ratio on doubling must be 4
//   "sabotage" THE LOAD-BEARING NEGATIVE: point the torque ALONG the axis instead of across it and the thing
//              SPINS UP AND TIPS instead of precessing. If this still precessed, the precession check would be
//              measuring the integrator rather than the mechanics.
//   "hold"     tilt and |L| are held while it precesses -- also approximate, also improving with spin

import { makeGyro, gyroStep, axisOf, cosTilt, spinMag } from "../../physics/gyroscope.js";

export const GYRO_OBSERVABLES = [
    "omega", "torque", "steps", "rateMeasured", "rateTimesL", "rateErrFrac",
    "orderRatio", "orderRatioExpected", "orderErrFrac", "orderRatioSeq", "orderRatioFirst", "orderRatioLast",
    "tiltDrift", "spinDrift", "precessed", "spunUp", "axisFrozen",
];

const DEF = { omega: 40, torque: 12, steps: 3000, dt: 1 / 60 };
export const GYRO_MODES = ["precess", "order", "sabotage", "hold"];

export function gyroscopeDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    return { mode: GYRO_MODES.includes(want) ? want : "precess", omega: (cfg && cfg.omega) || DEF.omega };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * One run. `along` swaps the torque direction from ACROSS the axis to ALONG it -- the sabotage, applied here
 * rather than in the physics module, because a device must not edit the thing it grades.
 */
function run({ omega, torque, steps, dt, along = false }) {
    const s = makeGyro({ omega });
    const t0 = cosTilt(s), L0 = spinMag(s), a0 = axisOf(s);
    let sweep = 0, prev = [a0[0], a0[2]];
    for (let i = 0; i < steps; i++) {
        if (along) {
            // TORQUE ALONG THE AXIS. There is no lever arm across the spin, so nothing turns the axis: it
            // simply gains angular momentum and falls.
            const L = s.L, m = Math.hypot(L[0], L[1], L[2]);
            const ah = [L[0] / m, L[1] / m, L[2] / m];
            L[0] += torque * ah[0] * dt; L[1] += torque * ah[1] * dt; L[2] += torque * ah[2] * dt;
        } else {
            gyroStep(s, { tipTorque: torque, dt });
        }
        const a = axisOf(s), cur = [a[0], a[2]];
        // ACCUMULATED AZIMUTH, unwrapped. A raw atan2 difference jumps by 2*pi once per revolution, and a
        // device that measured the jump would report a precession rate that depended on where it started.
        const d = Math.atan2(cur[1], cur[0]) - Math.atan2(prev[1], prev[0]);
        sweep += ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        prev = cur;
    }
    const T = steps * dt;
    return {
        rate: sweep / T, L0,
        tiltDrift: Math.abs(cosTilt(s) - t0),
        spinDrift: Math.abs(spinMag(s) - L0),
        sweep,
    };
}

/** Relative shortfall of rate*L against tau, at one spin. */
function errAt(omega, torque, steps, dt) {
    const r = run({ omega, torque, steps, dt });
    return Math.abs(Math.abs(r.rate) * omega - torque) / torque;
}

export async function buildGyroscope(args = {}) {
    const cfg = args.config || {};
    const omega = (cfg && cfg.omega) || DEF.omega;
    const torque = (cfg && cfg.torque) || DEF.torque;
    const steps = (cfg && cfg.steps) || DEF.steps;
    const dt = DEF.dt;
    const mode = args.mode || gyroscopeDefaults(cfg).mode;
    const base = { omega, torque, steps };

    if (mode === "order") {
        // THE SHARP CLAIM. Doubling the spin must QUARTER the error, because the approximation is second order
        // in 1/L. Measured at the top of the range, where the trend has settled.
        const e1 = errAt(160, torque, steps, dt), e2 = errAt(320, torque, steps, dt);
        const ratio = e1 / e2;
        // v3221 -- *** THE DEVICE EMITS THE SEQUENCE IT WAS MEASURED FROM, NOT JUST THE LAST OF IT. ***
        // This gate's header cites "4.115, 4.031, 4.008, 4.002" as the evidence that the error QUARTERS as the
        // spin DOUBLES -- and the device returned only the final ratio, so claimTrace could not reproduce 4.115
        // from any declared mode and recorded it as an untraceable claim. IT WAS NEVER UNTRACEABLE; IT WAS
        // UNEMITTED. The convergence is the whole argument: one ratio near 4 could be a coincidence, four
        // ratios CONVERGING ON 4 as the next unmodelled term fades is what a real expansion does, and a device
        // that reports only the endpoint has thrown away the reason anybody believes it.
        const seq = [];
        for (const L of [20, 40, 80, 160]) seq.push(errAt(L, torque, steps, dt) / errAt(2 * L, torque, steps, dt));
        return { ...base, rateMeasured: -1, rateTimesL: -1, rateErrFrac: e1,
                 orderRatioSeq: seq, orderRatioFirst: seq[0], orderRatioLast: seq[seq.length - 1],
                 orderRatio: ratio, orderRatioExpected: 4, orderErrFrac: Math.abs(ratio - 4) / 4,
                 tiltDrift: -1, spinDrift: -1, precessed: -1, spunUp: -1, axisFrozen: -1 };
    }

    if (mode === "sabotage") {
        const bad = run({ omega, torque, steps, dt, along: true });
        const good = run({ omega, torque, steps, dt });
        return { ...base, rateMeasured: bad.rate, rateTimesL: bad.rate * omega, rateErrFrac: -1,
                 orderRatio: -1, orderRatioExpected: -1, orderErrFrac: -1,
                 tiltDrift: bad.tiltDrift, spinDrift: bad.spinDrift,
                 // *** THE SABOTAGE'S SIGNATURE IS NOT WHAT THE PROSE SAID. *** physics/gyroscope-selfcheck's
                 // header describes the axis-aligned torque as making the gyroscope "spin up and tip". IT DOES
                 // NOT TIP: a torque PARALLEL to L changes its MAGNITUDE and cannot rotate it, so |L| grows by
                 // 600 against 0.35 clean -- seventeen hundred times -- while the tilt moves by 2e-14, which is
                 // round-off. Measured before asserting, and the observables now say what happens rather than
                 // what was written down.
                 precessed: Math.abs(bad.sweep) < Math.abs(good.sweep) * 0.05 ? 0 : 1,
                 spunUp: bad.spinDrift > good.spinDrift * 100 ? 1 : 0,
                 axisFrozen: bad.tiltDrift < 1e-9 ? 1 : 0 };
    }

    if (mode === "hold") {
        const r = run({ omega, torque, steps, dt });
        return { ...base, rateMeasured: r.rate, rateTimesL: r.rate * omega, rateErrFrac: -1,
                 orderRatio: -1, orderRatioExpected: -1, orderErrFrac: -1,
                 tiltDrift: r.tiltDrift, spinDrift: r.spinDrift, precessed: 1, spunUp: 0, axisFrozen: 0 };
    }

    const r = run({ omega, torque, steps, dt });
    return { ...base, rateMeasured: r.rate, rateTimesL: Math.abs(r.rate) * omega,
             rateErrFrac: Math.abs(Math.abs(r.rate) * omega - torque) / torque,
             orderRatio: -1, orderRatioExpected: -1, orderErrFrac: -1,
             tiltDrift: r.tiltDrift, spinDrift: r.spinDrift, precessed: 1, spunUp: 0, axisFrozen: 0 };
}

export const gyroscopeDevice = {
    // v3688 -- THE PLANT HERE IS A MODE, NOT A KNOB, AND IT WAS INVISIBLE TO THE CENSUS UNTIL NOW. "sabotage"
    // points the torque ALONG the spin axis instead of across it -- the load-bearing negative this file's own
    // header describes -- and it OVERTURNS `precessed`, which goes 1 -> 0. Declaring WHICH observable it flips is
    // the whole point: two different modes trivially return different numbers, so "something moved" would prove
    // nothing. A BINARY THE CLAIM RESTS ON is the strongest thing to name here, same class as the integer rank
    // v3687 chose for the LAPACK key.
    plantKind: "mode",
    plantMode: "sabotage",
    plantFlips: "precessed",
    plantIdeal: 1, plantIdealWhy:
        "precessed is the claim itself as a 0/1: a gyroscope under torque MUST precess, so 1 is the ideal and the sabotage arm's 0 is the claim failing outright, with rateMeasured going -2.987e-1 -> 0 beside it",
    name: "gyroscopic-precession",
    modes: GYRO_MODES,
    observables: GYRO_OBSERVABLES,
    build: buildGyroscope,
    defaults: gyroscopeDefaults,
};
