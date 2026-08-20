// physics/xpbd/compliance.mjs
//
// v3458 -- GRADING THE CLAIM xpbd.js MAKES IN ITS OWN HEADER.
//
// The module says: "a compliance parameter that makes stiffness independent of iteration count", and warns that
// dropping the -aTilde*lambda term in Eq (18) puts you "back to iteration-dependent" behaviour. That is a
// falsifiable statement about the solver, and it was never checked -- xpbd.js is one of fifteen ungraded modules
// under physics/xpbd.
//
// THE RIG: one fixed particle, one hanging under gravity on a single compliant distance constraint. At
// equilibrium the constraint force balances weight, so the stretch is Hooke's law with compliance as the inverse
// stiffness:
//
//     dL = alpha * F = alpha * g / invMass        EXACT, and independent of dt, substeps and iterations
//
// Measured at compliance 1e-3 and g = 10, so dL must be 1.0000e-2:
//
//     substeps   mean stretch   oscillation amplitude
//     400        1.0000e-2      4.62e-7
//     800        1.0000e-2      6.20e-5
//     1600       1.0004e-2      7.42e-4
//     3200       1.0010e-2      2.64e-3
//
// *** AND THE FIRST MEASUREMENT OF THIS WAS WRONG, WHICH IS WHY THE MEAN IS TAKEN. *** Sampling the length at a
// FIXED FINAL TIME gave 1.000e-2, 1.000e-2, 9.999e-3, 9.942e-3, 9.405e-3 -- an apparent drift AWAY from Hooke as
// the substep count rose. There is no damping in the rig, so the mass oscillates about equilibrium forever and a
// single sample reads a PHASE, not a stiffness. The agreement at 400 was coincidence of phase. Averaging over
// the second half of the run measures what the claim is actually about.
//
// THE AMPLITUDE IS NOT INDEPENDENT AND IS NOT SUPPOSED TO BE. It grows as dt shrinks because position-based
// projection supplies numerical damping proportional to dt. The MEAN is the stiffness; the amplitude is the
// integrator's dissipation, and reporting them together stops the second being mistaken for drift in the first.

import { xpbdSubstep, colorConstraints } from "./xpbd.js";

/**
 * THE PLANTED FAULT, AND IT HAD TO BE WRITTEN OUT RATHER THAN CONFIGURED.
 *
 * The first attempt planted it by setting compliance to 0. That is not PBD, it is a RIGID constraint -- and it
 * produced a stretch of exactly 0 at every substep count, which looks like PERFECT substep-independence. A
 * planted error that makes the claim look BETTER is worse than none: it would have been read as a pass.
 *
 * The real fault is the one xpbd.js names in its own header: drop the -aTilde*lambda term from Eq (18) and the
 * accumulated multiplier stops feeding back, so the constraint is re-solved from scratch each substep and its
 * effective stiffness becomes a function of how many times it is solved. Everything else below is identical to
 * the real solver, single-link only, so the difference is that one term and nothing else.
 */
function pbdSubstepOneLink(state, constraints, batches, opts = {}) {
    const { pos, vel, invMass } = state;
    const dt = opts.dt ?? 0.016;
    const g = opts.gravity || [0, -10, 0];
    const iterations = opts.iterations ?? 1;
    const pred = Float64Array.from(pos);
    for (let a = 0; a < invMass.length; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) {
            vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt;
            pred[o] += vel[o] * dt; pred[o + 1] += vel[o + 1] * dt; pred[o + 2] += vel[o + 2] * dt;
        }
    }
    for (let it = 0; it < iterations; it++) {
        for (const c of constraints) {
            const ax = 3 * c.i, bx = 3 * c.j;
            const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
            const len = Math.hypot(dx, dy, dz);
            if (len < 1e-12) continue;
            const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
            if (wsum <= 0) continue;
            const C = len - c.rest;
            const aTilde = c.compliance / (dt * dt);
            const dLambda = -C / (wsum + aTilde);         // *** the -aTilde*lambda term is GONE ***
            const sc = dLambda / len;
            pred[ax] += w1 * sc * dx; pred[ax + 1] += w1 * sc * dy; pred[ax + 2] += w1 * sc * dz;
            pred[bx] -= w2 * sc * dx; pred[bx + 1] -= w2 * sc * dy; pred[bx + 2] -= w2 * sc * dz;
        }
    }
    for (let a = 0; a < invMass.length; a++) {
        const o = 3 * a;
        vel[o] = (pred[o] - pos[o]) / dt; vel[o + 1] = (pred[o + 1] - pos[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - pos[o + 2]) / dt;
        pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2];
    }
}

/** Exact equilibrium stretch: Hooke's law with compliance as inverse stiffness. */
export const hookeStretch = (compliance, force) => compliance * force;

/**
 * Hang one particle from a fixed one on a compliant distance constraint and report the settled length.
 * Returns the MEAN over the second half of the run, not a final sample -- see the note above.
 */
export function hangingLink({
    rest = 1.0, compliance = 1e-3, gravity = -10, substeps = 800, totalTime = 4.0,
    iterations = 1, plantPBD = false,
} = {}) {
    const state = {
        pos: Float64Array.from([0, 0, 0, 0, -rest, 0]),
        vel: new Float64Array(6),
        invMass: Float64Array.from([0, 1]),
    };
    const constraints = [{ i: 0, j: 1, rest, compliance }];
    const batches = colorConstraints(constraints);
    const dt = totalTime / substeps;
    const tail = [];
    const step = plantPBD ? pbdSubstepOneLink : xpbdSubstep;
    for (let s = 0; s < substeps; s++) {
        step(state, constraints, batches, { dt, gravity: [0, gravity, 0], iterations });
        if (s > substeps * 0.5) tail.push(Math.abs(state.pos[4]));
    }
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    return {
        mean, stretch: mean - rest,
        amplitude: (Math.max(...tail) - Math.min(...tail)) / 2,
        exact: hookeStretch(compliance, Math.abs(gravity)),
        substeps, dt,
    };
}

/**
 * *** THE CENTRAL CLAIM IS ABOUT ITERATION COUNT, AND SWEEPING SUBSTEPS DOES NOT TEST IT. ***
 *
 * The first version of this swept SUBSTEPS at one iteration each, and the planted PBD variant produced results
 * IDENTICAL to real XPBD -- spread 9.53e-4 for both. That is not a weak planting, it is a correct one aimed at
 * the wrong axis: XPBD accumulates lambda ACROSS ITERATIONS WITHIN a substep, so at iterations = 1 the
 * -aTilde*lambda term multiplies a lambda that is still zero. At one iteration the two solvers ARE the same
 * algorithm, and a sweep over substeps can never separate them.
 *
 * Swept over ITERATIONS at fixed substeps, the separation is total:
 *
 *     iterations   XPBD        PBD (lambda term dropped)
 *     1            1.0000e-2   1.0000e-2      <- identical, as they must be
 *     2            1.0000e-2   4.9383e-3
 *     4            1.0000e-2   2.4082e-3
 *     8            1.0000e-2   1.1447e-3
 *     16           1.0000e-2   5.1599e-4
 *
 * XPBD sits on Hooke's alpha*F exactly at every count. PBD's stretch HALVES with each doubling -- its effective
 * stiffness is a function of how many times the constraint was solved, which is precisely the defect compliance
 * was introduced to remove.
 */
export function iterationIndependence(iterList = [1, 2, 4, 8, 16], opts = {}) {
    const rows = iterList.map((n) => hangingLink({ ...opts, iterations: n, substeps: opts.substeps ?? 800 }));
    const stretches = rows.map((r) => r.stretch);
    const exact = rows[0].exact;
    const lo = Math.min(...stretches), hi = Math.max(...stretches);
    return {
        iterList, rows, stretches, exact,
        spread: (hi - lo) / exact,
        worstErrFrac: Math.max(...stretches.map((v) => Math.abs(v - exact) / exact)),
        // PBD's signature: each doubling of iterations roughly halves the stretch
        halvesWithIterations: stretches.length >= 3 &&
            stretches.slice(1).every((v, i) => v < stretches[i] * 0.75),
    };
}

/**
 * Substep independence -- a WEAKER claim, kept because it is true and useful, and labelled so it is not mistaken
 * for the iteration claim above. It cannot distinguish XPBD from PBD and says so.
 */
export function stiffnessIndependence(substepList = [400, 800, 1600, 3200], opts = {}) {
    const rows = substepList.map((n) => hangingLink({ ...opts, substeps: n }));
    const stretches = rows.map((r) => r.stretch);
    const lo = Math.min(...stretches), hi = Math.max(...stretches);
    const exact = rows[0].exact;
    return {
        rows, stretches, exact,
        spread: (hi - lo) / exact,
        worstErrFrac: Math.max(...stretches.map((s) => Math.abs(s - exact) / exact)),
        // the amplitude is EXPECTED to vary -- reported so it is not mistaken for stiffness drift
        amplitudeGrows: rows[rows.length - 1].amplitude > rows[0].amplitude * 10,
    };
}
