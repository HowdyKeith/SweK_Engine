// physics/xpbd/frictionKey.mjs
//
// v3461 -- COULOMB'S THRESHOLD AS AN ANSWER KEY.
//
// frictionalContact.js resolves friction inside the XPBD position solve. The exact key is the oldest result in
// the subject: a body on a slope stays put while tan(theta) <= mu and slides above it. The critical angle is
// atan(mu) EXACTLY, independent of mass, gravity, timestep and iteration count.
//
// Measured by bisecting the slope angle at which a particle starts to travel:
//
//     mu     measured critical   atan(mu) exact
//     0.2    11.40281            11.30993
//     0.5    26.65797            26.56505
//     0.8    38.75277            38.65981
//     1.0    45.09300            45.00000
//
// *** THE ERROR IS A CONSTANT 0.093 DEGREES AT EVERY mu, NOT A PROPORTIONAL ONE, AND THAT IS THE CLUE. ***
// A solver bias would scale with mu or with the angle. A constant offset points at the MEASUREMENT, and it is:
// a particle just past critical needs time to travel far enough to be called "sliding". Lengthening the run
// collapses it, at second order --
//
//     steps   offset (deg)
//     300     0.09292
//     600     0.02298      ratio 4.04
//     1200    0.00573      ratio 4.01
//
// -- so the solver's threshold CONVERGES ON atan(mu) and the residual is the detector's dead time. Reporting
// "matches to 8e-3" would have been true and would have hidden that the agreement is exact in the limit.
//
// A NOTE ON ARGUMENT SHAPE, CHECKED BEFORE MEASURING THIS TIME: mu is POSITIONAL in both exports --
// solveFrictionalContacts(pred, prev, invMass, pairs, batches, radius, mu) and
// frictionalPileSubstep(state, floorN, floorD, mu, opts). Last round beta was passed per-constraint when it
// lived in opts, and the silent miss read as "damping does nothing".

import { frictionalPileSubstep } from "./frictionalContact.js";

/** Does a particle on a slope of theta travel further than a threshold within the run? */
export function slidesAt(thetaDeg, mu, { steps = 600, travelThreshold = 0.05, dt = 1 / 120, gravity = -10, iterations = 8 } = {}) {
    const t = thetaDeg * Math.PI / 180;
    const floorN = [Math.sin(t), Math.cos(t), 0];
    const state = { pos: Float64Array.from([0, 0.5, 0]), vel: new Float64Array(3), invMass: Float64Array.from([1]) };
    for (let s = 0; s < steps; s++) {
        frictionalPileSubstep(state, floorN, 0, mu, { dt, gravity: [0, gravity, 0], iterations });
    }
    const travel = Math.hypot(state.pos[0], state.pos[2]);
    return { slides: travel > travelThreshold, travel, finite: Number.isFinite(travel) };
}

/** Bisect the slope angle at which sliding begins. */
export function criticalAngle(mu, opts = {}) {
    let lo = 1, hi = 80;
    for (let i = 0; i < 22; i++) {
        const m = (lo + hi) / 2;
        if (slidesAt(m, mu, opts).slides) hi = m; else lo = m;
    }
    return (lo + hi) / 2;
}

export const coulombExact = (mu) => Math.atan(mu) * 180 / Math.PI;

/** The threshold across several mu, against the closed form. */
export function thresholdSweep(mus = [0.2, 0.5, 0.8, 1.0], opts = {}) {
    const rows = mus.map((mu) => {
        const measured = criticalAngle(mu, opts);
        const exact = coulombExact(mu);
        return { mu, measured, exact, offsetDeg: measured - exact, errFrac: Math.abs(measured - exact) / exact };
    });
    const offsets = rows.map((r) => r.offsetDeg);
    const spread = Math.max(...offsets) - Math.min(...offsets);
    return {
        rows, offsets, worstErrFrac: Math.max(...rows.map((r) => r.errFrac)),
        // a CONSTANT offset across mu means the residual is the detector, not the solver
        offsetIsConstant: spread < 0.01,
        meanOffset: offsets.reduce((a, b) => a + b, 0) / offsets.length,
    };
}

/** The offset against run length -- it must fall, and at second order if it is dead time. */
export function offsetConvergence(mu = 0.5, stepList = [300, 600, 1200], opts = {}) {
    const rows = stepList.map((steps) => {
        const measured = criticalAngle(mu, { ...opts, steps });
        return { steps, measured, offsetDeg: measured - coulombExact(mu) };
    });
    const offs = rows.map((r) => Math.abs(r.offsetDeg));
    const ratios = offs.slice(1).map((o, i) => offs[i] / o);
    return {
        rows, offsets: offs, ratios,
        converges: offs.every((o, i) => i === 0 || o < offs[i - 1]),
        secondOrder: ratios.every((r) => r > 3.2 && r < 5),
    };
}
