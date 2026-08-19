// physics/xpbd/dampingKey.mjs
//
// v3460 -- GRADING XPBD DAMPING, AND THE KEY THAT SEPARATES IT FROM A BUG.
//
// xpbdDamped.js implements Macklin-Muller Eq 26, adding a velocity-damping term to the multiplier update with
// gamma = (aTilde * betaTilde) / dt. Its header says the term "bleeds energy out of motion ALONG the constraint
// WITHOUT TOUCHING THE ELASTIC RESPONSE", and that sentence is the whole test:
//
//   THE TRANSIENT MUST CHANGE   amplitude falls monotonically as beta rises
//   THE EQUILIBRIUM MUST NOT    the settled stretch stays exactly Hooke's alpha * F
//
// A damper that shifted the resting length would be a spring with the wrong stiffness wearing a damper's name,
// and an amplitude check alone would pass it. Measured at compliance 1e-3, g = 10, 1200 substeps over 6 s:
//
//     beta     mean stretch   amplitude
//     0        1.0000e-2      1.199e-6
//     1e-3     1.0000e-2      1.197e-6
//     1e-2     1.0000e-2      1.178e-6
//     1e-1     1.0000e-2      1.004e-6
//     1        1.0000e-2      1.994e-7
//
// Six-fold amplitude reduction, equilibrium untouched to every digit shown.
//
// *** AND beta IS AN OPTS PARAMETER, NOT A PER-CONSTRAINT ONE. *** The first measurement passed it as
// c.damping on each constraint and got amplitude 1.20e-6 at EVERY beta -- identical to the undamped solver,
// because the key was silently ignored. That reads as "damping does nothing", which would have been a serious
// false accusation against a working module. It is the ninth silently-ignored key this session and the first
// aimed at a module's opts rather than a device's config, where strictConfig cannot see it.

import { xpbdSubstepDamped } from "./xpbdDamped.js";
import { xpbdSubstep, colorConstraints } from "./xpbd.js";

/**
 * Hang one particle from a fixed one and drive it with the DAMPED solver.
 * beta goes in opts -- see the note above about what passing it per-constraint produces.
 */
export function dampedLink({
    rest = 1.0, compliance = 1e-3, gravity = -10, beta = 0,
    substeps = 1200, totalTime = 6.0, iterations = 1, useUndamped = false,
} = {}) {
    const state = {
        pos: Float64Array.from([0, 0, 0, 0, -rest, 0]),
        vel: new Float64Array(6),
        invMass: Float64Array.from([0, 1]),
    };
    const constraints = [{ i: 0, j: 1, rest, compliance }];
    const batches = colorConstraints(constraints);
    const dt = totalTime / substeps;
    const step = useUndamped ? xpbdSubstep : xpbdSubstepDamped;
    const tail = [];
    for (let s = 0; s < substeps; s++) {
        step(state, constraints, batches, { dt, gravity: [0, gravity, 0], iterations, beta });
        if (s > substeps * 0.6) tail.push(Math.abs(state.pos[4]));
    }
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    return {
        beta, mean, stretch: mean - rest,
        amplitude: (Math.max(...tail) - Math.min(...tail)) / 2,
        exact: compliance * Math.abs(gravity),
        finite: tail.every((v) => Number.isFinite(v)),
    };
}

/** Sweep beta and report both halves of the claim: transient falls, equilibrium holds. */
export function dampingSweep(betas = [0, 1e-3, 1e-2, 1e-1, 1], opts = {}) {
    const rows = betas.map((b) => dampedLink({ ...opts, beta: b }));
    const amps = rows.map((r) => r.amplitude);
    const stretches = rows.map((r) => r.stretch);
    const exact = rows[0].exact;
    const lo = Math.min(...stretches), hi = Math.max(...stretches);
    return {
        rows, amps, stretches, exact,
        amplitudeMonotoneDown: amps.every((a, i) => i === 0 || a <= amps[i - 1]),
        amplitudeReduction: amps[0] / amps[amps.length - 1],
        equilibriumSpread: (hi - lo) / exact,
        worstStretchErrFrac: Math.max(...stretches.map((s) => Math.abs(s - exact) / exact)),
        allFinite: rows.every((r) => r.finite),
    };
}

/** beta = 0 must reproduce the undamped solver -- an attained limit, not an approached one. */
export function reducesToUndamped(opts = {}) {
    const d = dampedLink({ ...opts, beta: 0 });
    const u = dampedLink({ ...opts, useUndamped: true });
    return {
        damped: d, undamped: u,
        stretchRelDiff: Math.abs(d.stretch - u.stretch) / Math.abs(u.stretch),
        amplitudeRelDiff: Math.abs(d.amplitude - u.amplitude) / Math.abs(u.amplitude),
    };
}
