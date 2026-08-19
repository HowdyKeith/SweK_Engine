// WebGLEngine/tools/roundhouse/frictionBind.mjs -- v3200
//
// COULOMB FRICTION, WHOSE KEY IS A BIFURCATION RATHER THAN A TOLERANCE.
//
// v3199 asked whether xpbd's SEVENTEEN ungraded modules were a batch. *** THEY ARE NOT, AND THE REASON IS NOT A
// DEFICIENCY. *** Reading all seventeen gates: only a handful claim anything checkable OUTSIDE the code --
// friction (mu), volume (an enclosed volume against a target), muscle (a contracted rest), plastic (a yield
// threshold). The other thirteen claim DETERMINISM, GPU/CPU EQUIVALENCE or COUPLING BEHAVIOUR. xpbd's own gate
// opens with "the DETERMINISM: a graph-colored solve must be bit-identical no matter the ordering".
//
// THAT IS WHAT A SOLVER IS. Solver correctness is determinism and convergence, NOT agreement with a closed form,
// and those thirteen are properly gated where they already live. A LAB DEVICE NEEDS AN ANSWER KEY; A SOLVER
// NEEDS A PROOF OF SELF-CONSISTENCY. Confusing the two would have produced thirteen devices grading nothing.
//
// So this takes the one with the sharpest external key.
//
//   "critical"   *** THE KEY IS mu ITSELF. *** A particle holds on a slope whose tangent is below mu and slides
//                above it, and the transition sits AT mu. The device BISECTS for the transition and reports the
//                slope it finds -- a MEASUREMENT of a bifurcation, not a threshold check. Recovered to 2e-5
//                across mu = 0.2 to 1.2.
//   "stickSlide" the pair either side: EXACTLY stuck below (6e-19, which is zero in a float), sliding above.
//   "zeroMu"     THE LOAD-BEARING NEGATIVE. mu = 0 must recover FULL frictionless travel. If it did not, the
//                Coulomb bound would be leaking, and every stick result above would be a solver artefact.
//   "monotone"   more friction, less travel, checked across a sweep rather than at one pair.
//
// TRIG-FREE BY CONSTRUCTION: slopes are given as NORMALS, not angles, so nothing here depends on a
// transcendental and the result is bit-identical across machines.

import { planeFrictionSubstep, slopeNormal } from "../../physics/xpbd/friction.js";

export const FRICTION_OBSERVABLES = [
    "mu", "criticalSlope", "criticalKey", "criticalErrAbs", "criticalErrFrac",
    "travelBelow", "travelAbove", "sticksBelow", "slidesAbove",
    "travelZeroMu", "travelHalfMu", "zeroMuRatio", "monotoneViolations",
];

const DEF = { mu: 0.5, steps: 200, dt: 0.016 };
// *** v3852 -- `constantbound` IS THE PLANT, AND `zeroMu` IS A CONTROL RATHER THAN ONE. *** plantedCoverage
// read this device as UNCOVERED while its header advertised a LOAD-BEARING NEGATIVE, and the census was right
// by its own discriminator: A CONTROL MOVES THE OBSERVABLE TO ITS IDEAL AND A PLANT MOVES IT AWAY. zeroMu
// sets mu = 0 and recovers FULL frictionless travel -- zeroMuRatio goes TO 1 -- which proves the apparatus
// and shows the Coulomb bound is not leaking. That is worth having and IT IS NOT COVERAGE: a subject with a
// good control and no plant has not been shown to CATCH anything. Both are now declared, separately, which is
// exactly how the census accounts for them.
//
// THE PLANT: maxFric = mu instead of mu * depth. Coulomb friction IS the proportionality to normal load --
// press harder, hold harder -- and a constant bound still sticks, still slides, and still produces an
// ordinary trajectory. What it loses is the only thing this device measures: the transition stops sitting at
// tan(theta) = mu, because the bound no longer scales with the slope's normal component.
export const FRICTION_MODES = ["critical", "stickSlide", "zeroMu", "monotone", "constantbound"];

export function frictionDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    return { mode: FRICTION_MODES.includes(want) ? want : "critical", mu: (cfg && cfg.mu) || DEF.mu };
}

/** Distance travelled down a slope of tangent s under friction mu. */
function travel(s, mu, steps = DEF.steps, dt = DEF.dt, constantBound = false) {
    const st = { pos: new Float64Array([0, 0, 0]), vel: new Float64Array([0, 0, 0]), invMass: new Float64Array([1]) };
    const n = slopeNormal(s);
    for (let i = 0; i < steps; i++) planeFrictionSubstep(st, n, 0, mu, { dt, gravity: [0, -10, 0], constantBound });
    return Math.hypot(st.pos[0], st.pos[1], st.pos[2]);
}

/**
 * Bisect for the slope at which the particle starts to move.
 *
 * THE MOVING THRESHOLD IS 1e-3, NOT ZERO. A stuck particle travels 6e-19 -- float noise, not motion -- and
 * bisecting against exact zero would chase round-off and never converge. The threshold sits fifteen orders
 * above the noise and fifteen orders below the sliding case, so no plausible value of it changes the answer.
 */
function criticalSlope(mu, constantBound = false) {
    let lo = 1e-3, hi = 4;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (travel(mid, mu, DEF.steps, DEF.dt, constantBound) > 1e-3) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
}

const NONE = {
    criticalSlope: -1, criticalKey: -1, criticalErrAbs: -1, criticalErrFrac: -1,
    travelBelow: -1, travelAbove: -1, sticksBelow: -1, slidesAbove: -1,
    travelZeroMu: -1, travelHalfMu: -1, zeroMuRatio: -1, monotoneViolations: -1,
};

export async function buildFriction(args = {}) {
    const cfg = args.config || {};
    const mu = (cfg && cfg.mu) || DEF.mu;
    const mode = args.mode || frictionDefaults(cfg).mode;

    if (mode === "stickSlide") {
        const below = travel(mu * 0.9, mu), above = travel(mu * 1.1, mu);
        return { ...NONE, mu, travelBelow: below, travelAbove: above,
                 // BELOW IS EXACTLY ZERO IN A FLOAT, so the test is against noise rather than a tolerance the
                 // author picked -- and ABOVE is checked separately, because a solver that froze EVERYTHING
                 // would pass the stick half on its own.
                 sticksBelow: below < 1e-9 ? 1 : 0, slidesAbove: above > 0.1 ? 1 : 0 };
    }

    if (mode === "zeroMu") {
        // THE LOAD-BEARING NEGATIVE. mu = 0 must give full frictionless travel on a slope that would otherwise
        // hold. If the ratio were near 1, the Coulomb bound would be leaking and every stick above is an artefact.
        const free = travel(1.0, 0), held = travel(1.0, 2.0);
        return { ...NONE, mu: 0, travelZeroMu: free, travelHalfMu: held,
                 zeroMuRatio: free / Math.max(held, Number.EPSILON) };
    }

    if (mode === "monotone") {
        // ACROSS A SWEEP, not at one pair: two points cannot distinguish "monotone" from "different".
        const s = 1.0, ms = [0, 0.2, 0.4, 0.6, 0.8];
        const ts = ms.map((m) => travel(s, m));
        let bad = 0;
        for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1] + 1e-12) bad++;
        return { ...NONE, mu, monotoneViolations: bad, travelZeroMu: ts[0], travelHalfMu: ts[ts.length - 1] };
    }

    // The plant runs THIS fixture -- same mu, same bisection, same threshold -- and changes only the friction
    // LAW, so the separation belongs to the physics and not to a second experiment.
    const crit = criticalSlope(mu, mode === "constantbound");
    return { ...NONE, mu, criticalSlope: crit, criticalKey: mu,
             criticalErrAbs: Math.abs(crit - mu), criticalErrFrac: Math.abs(crit - mu) / mu };
}

export const frictionDevice = {
    name: "coulomb-friction-bifurcation",
    // "critical" stays FIRST: it owns criticalErrFrac, and the contract compares the plant against modes[0].
    modes: FRICTION_MODES,
    plantMode: "constantbound", plantFlips: "criticalErrFrac", plantKind: "knob",
    // *** AND THE CONTROL IS DECLARED SEPARATELY AND COUNTED SEPARATELY, ON travelHalfMu AND NOT ON
    // zeroMuRatio -- WHICH I GOT WRONG FIRST AND THE CONTRACT CAUGHT. *** I read "mu = 0 must recover FULL
    // travel" as an observable REACHING 1 and declared zeroMuRatio with ideal 1. It is the opposite: the
    // header says the failure is the ratio being NEAR 1, and it honestly reads 1.6e17. probeControlMode
    // refused it by name ("zeroMuRatio did not reach 1"), which is the control contract doing exactly its job.
    //
    // zeroMuRatio is a SEPARATION demonstration -- "these two must be far apart" -- and the census has no
    // category for that, so it is not forced into one. What IS a reach-the-ideal control is the other half of
    // the same mode: on a slope of tangent 1.0 under mu = 2.0 the particle is EXACTLY stuck, travelHalfMu
    // 3.07e-19, which is zero in a float. The bound does not leak, and that is a value an observable reaches.
    controlMode: "zeroMu", controlPerfects: "travelHalfMu", controlIdeal: 0,
    observables: FRICTION_OBSERVABLES,
    build: buildFriction,
    defaults: frictionDefaults,
};
