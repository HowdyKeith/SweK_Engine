// WebGLEngine/physics/gyroKnob.mjs -- v3591
// ---------------------------------------------------------------------------------------------------------------
// THE FIRST PROPOSER FOR A PHYSICS-LAB SCENE, AND ITS ADJUDICATOR IS PROVEN TO REFUSE.
//
// v3587 assessed twelve lab scenes and registered none. v3588 measured the strongest candidate and WITHDREW it.
// v3589 and v3590 drove the rest, refuting two more and leaving five that hold. THIS REGISTERS ONE, and the bar
// it has to clear is knobRegistry's, stated there: an instrument gets a knob proposer WHEN IT ALREADY OWNS A KEY
// THE PROPOSER CANNOT INFLUENCE, and every adjudicator must be exercised with a value that MUST fail and one
// that MUST pass.
//
// ================================================================================================================
// THE KEY: rate * omega = tau, AND THE CONSTANT IS ONE NOBODY FEEDS IT
// ================================================================================================================
//
// A fast top under a tipping torque precesses at tau / (I * omega). Multiply the measured rate by the spin and
// the answer must be THE APPLIED TORQUE -- a quantity the measurement never sees, because the rate comes from
// unwrapping the axis angle out of the trajectory. Measured across a 16x sweep at dt = 1/60:
//
//     omega        10        20        40        80       160
//     rate*omega  11.808    11.938    11.970    11.977    11.979      <- tau = 12
//
// ================================================================================================================
// AND IT REFUSES AT LOW SPIN, WHICH IS PHYSICS RATHER THAN A CONTRIVANCE
// ================================================================================================================
//
// The law is the FAST-TOP approximation: it assumes the precession is slow compared with the spin, so it must
// fail when they are comparable. It does, and hard:
//
//     omega       0.5       1        2        5       10       20
//     rel error   0.80     0.61     0.33    0.063    0.016    0.0052
//
// *** SO THE ADJUDICATOR SAYS NO ON ITS OWN SUBJECT MATTER, NOT ON A BROKEN INPUT. *** An adjudicator that only
// rejects nonsense (a NaN, a negative mass) has never been tested against the thing it is for. This one rejects
// omega = 2 -- a perfectly well-formed spin at which the CLOSED FORM IS SIMPLY NOT TRUE.
//
// ================================================================================================================
// THE TOLERANCE IS DERIVED FROM dt, NOT CHOSEN
// ================================================================================================================
//
// The error does not vanish at high spin; it settles onto a floor. *** THAT FLOOR IS THE TIMESTEP, AND IT IS
// FIRST ORDER: *** 3.44e-3, 1.72e-3, 4.30e-4, 1.08e-4 at dt = 1/30, 1/60, 1/240, 1/960 -- halving with dt.
//
// So the bound is TOL_PER_DT * dt with a small constant read off that line, rather than a number picked to make
// the current run pass. An adjudicator demanding exact agreement would reject every correct answer, which is
// v3570's friction offset in a new subject; one with a hand-picked 5% would accept omega = 5, where the law is
// 6.3% wrong.
"use strict";
import { pathToFileURL } from "node:url";
import { makeGyro, gyroStep, axisOf } from "./gyroscope.js";

/** From the dt sweep: rel error ~ 0.10 * dt. The 2x headroom is stated, not hidden inside the constant. */
// v3594 -- ONE DECLARATION OF THE RIG'S CONSTANTS. precessionRate defaulted tipTorque to 12 and I to 1 in
// its signature, adjudicate spelled `opts.tipTorque ?? 12` again, and score() needed a third copy -- so
// they are declared here once and read by all three. Two copies that agree today are still two copies.
export const TIP_TORQUE = 12;
export const INERTIA = 1;
export const TOL_PER_DT = 0.10;
export const TOL_HEADROOM = 2;

/**
 * Precession rate from the trajectory. *** THE ANGLE IS UNWRAPPED, AND THE FIRST VERSION OF THIS MEASUREMENT WAS
 * NOT: *** atan2 jumps by 2*pi at the branch cut, so a full turn counted as nearly zero and the rate came back
 * non-monotone in omega -- which I nearly wrote up as the key failing to respond. THE DETECTOR WAS THE FINDING,
 * for the third time in this session after the friction cone and the grating zeros.
 */
export function precessionRate(omega, { dt = 1 / 60, steps = 600, tipTorque = TIP_TORQUE, I = INERTIA } = {}) {
    const s = makeGyro({ omega, I });
    let prev = null, total = 0;
    for (let i = 0; i < steps; i++) {
        gyroStep(s, { tipTorque, dt });
        const a = axisOf(s);
        const th = Math.atan2(a[2], a[0]);
        if (prev !== null) {
            let d = th - prev;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            total += d;
        }
        prev = th;
    }
    return Math.abs(total) / (steps * dt);
}

/** rate * omega, which must come back as the applied torque. */
export function torqueFromTrajectory(omega, opts = {}) {
    return precessionRate(omega, opts) * omega;
}

/**
 * THE ADJUDICATOR. Returns { pass, evidence } in the shape grantLicence re-checks.
 *
 * It compares a quantity recovered from the TRAJECTORY against the torque that was applied, and the bound scales
 * with dt because the residual does.
 */
export function adjudicate(omega, opts = {}) {
    const dt = opts.dt ?? 1 / 60, tipTorque = opts.tipTorque ?? TIP_TORQUE;
    if (!Number.isFinite(omega) || omega <= 0)
        return { pass: false, evidence: { omega, reason: "spin must be finite and positive" } };
    const recovered = torqueFromTrajectory(omega, { ...opts, dt, tipTorque });
    const relErr = Math.abs(recovered - tipTorque) / tipTorque;
    const tol = TOL_PER_DT * dt * TOL_HEADROOM;
    return { pass: relErr <= tol,
             evidence: { omega, dt, tipTorque, recovered, relErr, tol,
                         law: "precession = tipTorque / (I * omega); rate * omega must return the torque" } };
}

/**
 * v3594 -- *** THIS RETURNED THE ADJUDICATOR'S OWN relErr AND IT WAS WRONG IN BOTH DIRECTIONS AT ONCE. ***
 *
 * (1) DIRECTION. runProposer sorts DESCENDING and takes scored[0], so a bigger score is a better candidate --
 *     the convention every earlier proposer follows (1/N, 1/T, 1/reps, dt) and which nothing had written down
 *     until proposers.SCORE_IS_A_REWARD. An ERROR is smaller-is-better, so this handed the adjudicator THE
 *     WORST CANDIDATE IN THE LIST on every run: omega = 2, where the fast-top law is 33% wrong and refused.
 *     The loop's only possible output was a refusal, and it looked like the physics failing.
 *
 * (2) INDEPENDENCE, AND THIS IS THE HALF THAT MATTERS. proposers.mjs's header states in capitals that the
 *     separation between score and adjudicate is "the entire safety property", because a proposer that could
 *     write its own verdict would tune the verdict. THIS DID NOT WRITE THE VERDICT, IT READ IT -- and a search
 *     optimising the number it is graded by has been told the answer. The adjudicator stopped being a second
 *     opinion and became the objective function, silently, while every gate stayed green.
 *
 * WHAT THE CALLER ACTUALLY WANTS, stated as a preference and computed WITHOUT consulting adjudicate():
 * A PRECESSION YOU CAN SEE. The rate is tau/(I*omega), so it goes as 1/omega -- a slow top precesses fast
 * enough to watch and to resolve at a fixed dt, a fast one crawls. That is a real preference a person can
 * defend without knowing what the adjudicator thinks.
 *
 * *** AND IT PULLS EXACTLY AGAINST THE VERDICT, WHICH IS THE POINT RATHER THAN A PROBLEM. *** The fast-top
 * approximation is the thing being graded, and it FAILS at low omega -- 0.80, 0.61, 0.33, 0.063 relative
 * error at omega = 0.5, 1, 2, 5. So the search wants the slowest spin and the key refuses it, which is the
 * HMC tuner's shape (its greedy optimum is 89x worse) in a second subject. A score that agreed with the
 * adjudicator would make the loop decorative.
 *
 * The value is the precession rate itself rather than a bare 1/omega, so the units mean something to a reader
 * and two proposers on this instrument would be comparable. It never calls adjudicate().
 */
export function score(omega, opts = {}) {
    const { tipTorque = TIP_TORQUE, inertia = INERTIA } = opts;
    return omega > 0 ? tipTorque / (inertia * omega) : Infinity;
}

/**
 * Candidate spins. Deliberately spans the failing region as well as the good one -- A PROPOSER THAT ONLY EVER
 * OFFERS VALUES ITS OWN ADJUDICATOR ACCEPTS IS A SEARCH THAT HAS ALREADY DECIDED.
 */
export function propose({ current = 40 } = {}) {
    return [2, 5, 10, 20, 40, 80, 160].filter((v) => v !== current);
}

export const MEASURED_V3591 = {
    theConstantIsNotFedIn:
        "rate * omega must return THE APPLIED TORQUE, and the rate is unwrapped out of the trajectory's axis " +
        "angle -- so the measurement never sees tau. 11.808, 11.938, 11.970, 11.977, 11.979 across a 16x sweep " +
        "against tau = 12.",
    itRefusesOnItsOwnSubject:
        "*** THE LAW IS THE FAST-TOP APPROXIMATION AND IT FAILS WHEN PRECESSION IS COMPARABLE TO SPIN. *** " +
        "Relative error runs 0.80, 0.61, 0.33, 0.063 at omega = 0.5, 1, 2, 5. So the adjudicator rejects a " +
        "PERFECTLY WELL-FORMED SPIN at which the closed form is simply not true -- rather than only rejecting " +
        "nonsense, which is a control that has never been tested against the thing it is for.",
    theToleranceIsDerived:
        "The error settles onto a floor at high spin, and THE FLOOR IS THE TIMESTEP, FIRST ORDER: 3.44e-3, " +
        "1.72e-3, 4.30e-4, 1.08e-4 at dt = 1/30, 1/60, 1/240, 1/960. So the bound is TOL_PER_DT * dt with 2x " +
        "headroom stated separately, NOT a number picked to make today's run pass. Exact agreement would reject " +
        "every correct answer (v3570's friction offset again); a hand-picked 5% would accept omega = 5, where " +
        "the law is 6.3% wrong.",
    theDetectorWasTheFindingAgain:
        "The first precession measurement came back NON-MONOTONE in omega and I nearly wrote it up as the key " +
        "failing to respond. atan2 jumps by 2*pi at the branch cut, so a full turn counted as nearly zero. " +
        "THIRD TIME THIS SESSION -- after the friction cone's displacement-versus-velocity and the grating " +
        "zeros' threshold-versus-sign-change.",
};

export function reportLines() {
    const L = [];
    L.push("[gyroKnob] precession = tau / (I omega), as a knob adjudicator that refuses");
    L.push("");
    L.push("   omega   rate*omega   rel error   verdict");
    for (const omega of [0.5, 2, 5, 10, 20, 40, 160]) {
        const a = adjudicate(omega);
        L.push("  " + String(omega).padStart(6) + "   " + a.evidence.recovered.toFixed(4).padStart(9) +
               "   " + a.evidence.relErr.toExponential(2).padStart(9) + "   " + (a.pass ? "PASS" : "refuse"));
    }
    L.push("");
    L.push("  tolerance = " + TOL_PER_DT + " * dt * " + TOL_HEADROOM + " -- derived from the dt sweep, not chosen");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
