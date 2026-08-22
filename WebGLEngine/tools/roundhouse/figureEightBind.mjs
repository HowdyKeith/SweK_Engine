// WebGLEngine/tools/roundhouse/figureEightBind.mjs -- v3196
//
// THE FIGURE-EIGHT CHOREOGRAPHY AS A GRADED DEVICE.
//
// v3195 measured that 22 of 96 proven physics modules are graded, and Keith named this one. It is the best
// first candidate in the list because ITS KEY IS CLOSURE, and closure fails LOUDLY rather than drifting: an
// orbit either comes back to where it started or it does not.
//
// Found numerically by Moore in 1993, proved to exist by Chenciner and Montgomery in 2000, and it survives only
// at Simo's exact initial conditions. Three equal masses on ONE curve, each a third of a period behind the next.
//
//   "period"       THE CLAIM. Integrate one period; every body must return. Measured 5.3e-6 at 20k steps.
//   "choreography" THE HALF THAT MAKES IT A CHOREOGRAPHY RATHER THAN THREE ORBITS. A third of a period in,
//                  body one must be where body three STARTED -- the origin. Measured 1.3e-4.
//   "perturbed"    *** THE LOAD-BEARING NEGATIVE, AND IT FAILS BY A PREDICTED AMOUNT. *** Nudge one coordinate
//                  and the return distance grows LINEARLY in the nudge: 1e-4, 1e-3 and 1e-2 give 230x, 2300x
//                  and 23000x the clean return. A negative that merely "got worse" would be satisfied by any
//                  broken integrator; ONE THAT SCALES AS PREDICTED IS EVIDENCE THE SOLUTION IS ISOLATED.
//   "conserve"     Energy and angular momentum, which a symplectic velocity-Verlet must hold. Measured 8.6e-16
//                  and 1.3e-15 -- machine precision, so a drift of 1e-9 would be a broken integrator rather
//                  than a tolerance question.
//
// EVERY KEY IS ANALYTIC OR EXACT-BY-CONSTRUCTION. Nothing is remembered, nothing needs a reference run.

import { makeFigureEight, orbitStep, FIG8_PERIOD } from "../../physics/figureEight.js";
import { totalEnergy, angularMomentum } from "../../physics/orbit.js";

export const FIG8_OBSERVABLES = [
    "steps", "period", "returnDist", "thirdDist", "energyDriftFrac", "angMomDrift",
    "nudge", "returnRatio", "linearityErrFrac", "closes",
];

const DEF = { steps: 20000 };
// *** v3852 -- `euler` IS THE PLANT, AND `perturbed` NEVER WAS ONE. *** plantedCoverage read this device as
// UNCOVERED for hundreds of versions while its header advertised a LOAD-BEARING NEGATIVE, and the census was
// right: `perturbed` nudges the INITIAL CONDITIONS, so the orbit genuinely stops being the figure-eight and
// closure correctly fails. THAT IS A SENSITIVITY SWEEP AND IT PROVES THE SOLUTION IS ISOLATED -- it is not a
// defect, and no gate catching it has caught a bug. A PLANT HAS TO BE A WRONG METHOD ON THE RIGHT PROBLEM.
//
// `euler` is that: the same initial conditions, integrated by explicit Euler instead of velocity-Verlet.
// MEASURED at the default 20000 steps: returnDist 5.3051e-6 -> 5.5357e-2, a separation of 1.04e4, with
// energyDriftFrac going 8.6255e-16 -> 9.8144e-3. The orbit is right, the reading is right, and the
// INTEGRATOR IS NO LONGER SYMPLECTIC -- which is the one property every claim on this device rests on.
export const FIG8_MODES = ["period", "choreography", "perturbed", "conserve", "euler"];

export function figureEightDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    // The validator already LISTS every mode, so the plant cannot silently revert (v3806's flip2d lesson).
    return { mode: FIG8_MODES.includes(want) ? want : "period", steps: (cfg && cfg.steps) || DEF.steps };
}

const mag = (v) => (Array.isArray(v) ? Math.hypot(...v) : Math.abs(v));

/** One integration, returning everything any mode needs -- ONE runner so a difference cannot be the harness. */
function run(steps, nudge = 0, euler = false) {
    const s = makeFigureEight();
    if (nudge) s.bodies[0].r[0] += nudge;
    const dt = FIG8_PERIOD / steps;
    const r0 = s.bodies.map((b) => b.r.slice());
    const E0 = totalEnergy(s), L0 = mag(angularMomentum(s));
    let third = null;
    const atThird = Math.round(steps / 3) - 1;
    for (let i = 0; i < steps; i++) { orbitStep(s, dt, { euler }); if (i === atThird) third = s.bodies.map((b) => b.r.slice()); }
    let ret = 0;
    for (let i = 0; i < 3; i++) {
        const b = s.bodies[i].r;
        ret = Math.max(ret, Math.hypot(b[0] - r0[i][0], b[1] - r0[i][1], b[2] - r0[i][2]));
    }
    // WORST BODY, NOT THE MEAN. One body failing to return is a broken choreography, and averaging over three
    // would let two good ones hide it -- v3069's aggregate-invariant-under-a-shift, in a different costume.
    return { ret, third, E0, L0, E1: totalEnergy(s), L1: mag(angularMomentum(s)) };
}

export async function buildFigureEight(args = {}) {
    const cfg = args.config || {};
    const steps = Math.max(3000, Math.min(120000, (cfg && cfg.steps) || DEF.steps));
    const mode = args.mode || figureEightDefaults(cfg).mode;
    const base = { steps, period: FIG8_PERIOD };

    if (mode === "perturbed") {
        // THE RETURN DISTANCE IS LINEAR IN THE NUDGE. Two nudges a decade apart must give returns a decade
        // apart, and the deviation from that IS the observable -- not the raw distance, which any broken
        // integrator could inflate.
        const n1 = 1e-4, n2 = 1e-3;
        const clean = run(steps, 0), a = run(steps, n1), b = run(steps, n2);
        const ratio = b.ret / a.ret;
        return { ...base, returnDist: a.ret, thirdDist: -1, energyDriftFrac: -1, angMomDrift: -1,
                 nudge: n1, returnRatio: a.ret / clean.ret,
                 linearityErrFrac: Math.abs(ratio - (n2 / n1)) / (n2 / n1),
                 closes: 0 };
    }

    if (mode === "choreography") {
        const r = run(steps, 0);
        // Body ONE at a third of a period must sit where body THREE started: the origin.
        const d = Math.hypot(r.third[0][0], r.third[0][1], r.third[0][2]);
        return { ...base, returnDist: r.ret, thirdDist: d, energyDriftFrac: -1, angMomDrift: -1,
                 nudge: 0, returnRatio: -1, linearityErrFrac: -1, closes: d < 1e-3 ? 1 : 0 };
    }

    if (mode === "conserve") {
        const r = run(steps, 0);
        return { ...base, returnDist: r.ret, thirdDist: -1,
                 energyDriftFrac: Math.abs((r.E1 - r.E0) / r.E0), angMomDrift: Math.abs(r.L1 - r.L0),
                 nudge: 0, returnRatio: -1, linearityErrFrac: -1, closes: 1 };
    }

    // The `euler` plant runs the SAME initial conditions and the SAME budget as `period` -- only the
    // integrator changes -- so the separation belongs to the method and not to a second fixture. Energy and
    // angular-momentum drift are reported here too, because a non-symplectic step shows in both.
    const r = run(steps, 0, mode === "euler");
    return { ...base, returnDist: r.ret, thirdDist: -1,
             energyDriftFrac: Math.abs((r.E1 - r.E0) / r.E0), angMomDrift: Math.abs(r.L1 - r.L0),
             nudge: 0, returnRatio: -1, linearityErrFrac: -1, closes: r.ret < 1e-4 ? 1 : 0 };
}

export const figureEightDevice = {
    name: "figure-eight-choreography",
    // "period" stays FIRST: it owns returnDist, and the contract compares the plant against modes[0].
    modes: FIG8_MODES,
    plantMode: "euler", plantFlips: "returnDist", plantKind: "knob",
    plantIdeal: 0, plantIdealWhy:
        "returnDist is how far the orbit misses its own starting point after one period, so a closed orbit returns exactly to it and 0 is the ideal; euler goes 5.31e-6 -> 5.54e-2 and `closes` drops 1 -> 0",
    observables: FIG8_OBSERVABLES,
    build: buildFigureEight,
    defaults: figureEightDefaults,
};
