// WebGLEngine/physics/vibrationKnob.mjs -- v3596
// ---------------------------------------------------------------------------------------------------------------
// THE THIRD LAB-SCENE PROPOSER, AND THE HEADLINE KEY PASSES A MODE THAT DOES NOT EXIST.
//
// physics/vibrations.js exports modeFreq(state, j) = 2*sqrt(k/m)*sin(j*pi/(2(N+1))) -- the exact normal-mode
// frequency of a discrete chain. GRADING AGAINST IT DIRECTLY WOULD BE A MIRROR (v3201), so the frequency is
// RECOVERED FROM THE TRAJECTORY: velocity-Verlet the chain, time the descending zero crossings of x[0], and
// compare. Two routes, one number, and the integrator is never told the formula.
//
// MEASURED (N = 12, dt = 1/120, 40k steps): relErr 1.68e-7, 6.63e-7, 1.46e-6, 2.50e-6, 5.09e-6, 7.84e-6,
// 1.01e-5, 1.14e-5 at j = 1, 2, 3, 4, 6, 8, 10, 12 -- MONOTONE IN j and rising as omega^2, which is exactly
// velocity-Verlet's O(dt^2 omega^2) period error. So the key works and the integrator is good.
//
// *** AND THAT KEY, ALONE, CERTIFIES MODE 25 ON A TWELVE-MASS CHAIN. ***
//
// A chain of N masses has EXACTLY N modes. Above that, two things happen and only one of them looks wrong:
//
//   j = N+1 = 13 -- THE MODE DOES NOT EXIST AND THE CHAIN NEVER MOVES. sin(13*pi*(n+1)/13) = sin(pi*(n+1)) = 0
//   at every mass, so setMode writes an initial amplitude of 8.09e-16: MACHINE ZERO. The crossing detector
//   still finds 60 crossings OF FLOAT DUST and reports omega = 1.130265 against a closed form of 2.000000.
//   A DEAD FIXTURE THAT STILL PRODUCES A NUMBER -- v3177's shape, caught here only because the amplitude is
//   checked before the frequency is believed.
//
//   *** j = 14 ALIASES ONTO j = 12 AND BOTH ROUTES ALIAS THE SAME WAY, SO THE KEY READS A CLEAN PASS. ***
//   sin(14*pi/26) = sin(pi - 14*pi/26) = sin(12*pi/26), so the TRAJECTORY comes back at 1.985440 and the
//   CLOSED FORM at 1.985418 -- relErr 1.14e-5, IDENTICAL TO HONEST MODE 12. Measured the same way: j = 18
//   aliases to 8 (7.84e-6), j = 24 to 2 (6.63e-7), j = 25 to 1 (1.68e-7). THE HIGHER THE FAKE MODE, THE
//   BETTER IT SCORES. Two independent routes agreeing is worth nothing when they share the assumption that
//   is wrong -- the two-route discipline's own blind spot, and the first time this tree has caught it.
//
// SO THE ADJUDICATOR IS THREE PARTS AND THE FREQUENCY IS ONLY ONE OF THEM. The other two are recovered from
// behaviour rather than declared as a bound on j: (1) the mode must actually be EXCITED, and (2) j must be the
// SMALLEST index that produces this frequency, which is what "this is mode j" means. Nothing here reads N to
// decide the answer -- N decides the chain, and the chain decides which j are real.
//
// THE SCORE IS A COST AND IT PULLS THE WRONG WAY ON PURPOSE (proposers.SCORE_IS_A_REWARD): a high mode is
// CHEAPER TO MEASURE because its period is short -- 380 steps per period at j = 12 against 3128 at j = 1,
// MEASURED, an 8.2x difference at a fixed dt. So the search wants the highest mode it can get and walks
// straight into the alias region, where the adjudicator refuses. A score that agreed with the verdict would
// make the loop decorative.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { makeChain, setMode, modeFreq, chainStep } from "./vibrations.js";

export const CHAIN_N = 12;
export const DT = 1 / 120;
export const STEPS = 40000;
// The excitation floor is DERIVED FROM THE AMPLITUDE THE CALLER ASKED FOR, not typed: a real mode keeps
// essentially all of it (2.98e-1 of 3.0e-1) and a non-existent one keeps 8.09e-16. Anything within twelve
// orders of the request is a mode; anything at machine zero is not. The two populations are not close.
export const AMP = 0.3;
export const EXCITED_FLOOR = AMP * 1e-9;

/** Frequency recovered FROM THE TRAJECTORY. It never calls modeFreq -- that is the whole point. */
export function recoverFreq(j, { N = CHAIN_N, dt = DT, steps = STEPS, amp = AMP } = {}) {
    const s = makeChain({ N });
    setMode(s, j, amp);
    let initAmp = 0;
    for (let n = 0; n < N; n++) initAmp = Math.max(initAmp, Math.abs(s.x[n]));
    let prev = s.x[0], first = null, last = null, count = 0;
    for (let i = 1; i <= steps; i++) {
        chainStep(s, dt);
        const cur = s.x[0];
        // Descending crossings only, linearly interpolated. One-sided because a full period is crossing to
        // crossing of the SAME sign of slope; counting both would halve the period and pass on a wrong number.
        if (prev > 0 && cur <= 0) {
            const t = (i - 1 + prev / (prev - cur)) * dt;
            if (first === null) first = t;
            last = t; count++;
        }
        prev = cur;
    }
    const period = count >= 3 ? (last - first) / (count - 1) : null;
    return { j, initAmp, crossings: count, period,
             omega: period ? (2 * Math.PI) / period : null,
             stepsPerPeriod: period ? period / dt : null };
}

/**
 * *** THE VERDICT, AND THE FREQUENCY IS THE LAST OF THE THREE RATHER THAN THE FIRST. ***
 * excited  -- the mode exists at all (refuses j = N+1 and its multiples, where the chain never moves)
 * distinct -- j is the SMALLEST index producing this frequency (refuses every alias, which the frequency
 *             key alone reads as a clean pass)
 * accurate -- the recovered frequency matches the closed form within the integrator's own dt floor
 */
export function adjudicate(j, opts = {}) {
    const N = opts.N ?? CHAIN_N;
    if (!Number.isInteger(j) || j < 1)
        return { pass: false, evidence: { j, reason: "a mode index is a positive integer" } };

    const r = recoverFreq(j, opts);
    if (!(r.initAmp > EXCITED_FLOOR))
        return { pass: false, evidence: { j, initAmp: r.initAmp, floor: EXCITED_FLOOR,
                 reason: "THE MODE DOES NOT EXIST: setMode wrote machine zero at every mass, so there is " +
                         "nothing oscillating and any frequency read off it is float dust" } };
    if (r.omega === null)
        return { pass: false, evidence: { j, crossings: r.crossings, reason: "too few crossings to time a period" } };

    // THE ALIAS TEST, RECOVERED RATHER THAN DECLARED: run the lower indices and see whether one of them
    // already produces this frequency. Nothing here consults N to decide -- if a lower j gets there first,
    // this j is a second name for it. A bound `j <= N` would be the same verdict typed instead of measured,
    // and would say nothing about WHICH mode was actually excited.
    let aliasOf = null;
    for (let lower = 1; lower < j && aliasOf === null; lower++) {
        const lr = recoverFreq(lower, opts);
        if (lr.omega !== null && lr.initAmp > EXCITED_FLOOR &&
            Math.abs(lr.omega - r.omega) / r.omega < 1e-6) aliasOf = lower;
    }
    if (aliasOf !== null)
        return { pass: false, evidence: { j, aliasOf, omega: r.omega,
                 reason: "AN ALIAS, NOT A MODE: a chain of " + N + " masses has " + N + " modes, and this " +
                         "index reproduces mode " + aliasOf + " exactly. THE FREQUENCY KEY CANNOT SEE THIS -- " +
                         "the closed form aliases identically, so both routes agree on a mode that is not there" } };

    const closed = modeFreq(makeChain({ N }), j);
    const relErr = Math.abs(r.omega - closed) / closed;
    // TOLERANCE DERIVED FROM THE INTEGRATOR, NOT CHOSEN: velocity-Verlet's period error is O((omega*dt)^2),
    // so the bound scales with the mode's own frequency instead of being one number that is loose at the
    // bottom of the sweep and tight at the top. The headroom is measured -- worst observed ratio of
    // relErr to (omega*dt)^2 across j = 1..12 is under 1/20 -- and stated rather than tuned until it passed.
    const tol = VERLET_HEADROOM * Math.pow(closed * (opts.dt ?? DT), 2);
    return { pass: relErr <= tol,
             evidence: { j, omega: r.omega, closed, relErr, tol, stepsPerPeriod: r.stepsPerPeriod,
                         law: "omega = 2*sqrt(k/m)*sin(j*pi/(2(N+1))), recovered from zero crossings of the " +
                              "integrated chain and never read from the formula" } };
}
export const VERLET_HEADROOM = 0.2;

/**
 * A HIGH MODE IS CHEAPER TO MEASURE, and that is the whole preference: at a fixed dt its period is short, so
 * a step budget covers many cycles -- 380 steps per period at j = 12 against 3128 at j = 1, MEASURED.
 * Computed from the closed form directly (arithmetic, no run) and NEVER from adjudicate(), which is
 * proposers.SCORE_IS_A_REWARD's independence rule. It pulls straight past the last real mode.
 */
export function score(j, opts = {}) {
    const N = opts.N ?? CHAIN_N;
    return Number.isInteger(j) && j >= 1 ? modeFreq(makeChain({ N }), j) : -Infinity;
}

/**
 * Candidates spanning the real modes AND both ways of being wrong.
 * *** A SEARCH THAT ONLY OFFERS VALUES ITS OWN ADJUDICATOR ACCEPTS HAS ALREADY DECIDED. ***
 * 13 is N+1 (the chain never moves); 14 and 25 are aliases of 12 and 1, and the frequency key passes both.
 */
export function propose({ current = 3 } = {}) {
    return [1, 4, 8, 12, 13, 14, 25].filter((v) => v !== current);
}

export const MEASURED_V3596 = {
    theKeyPassesAModeThatIsNotThere:
        "*** j = 14 ON A TWELVE-MASS CHAIN COMES BACK AT omega 1.985440 AGAINST A CLOSED FORM OF 1.985418, " +
        "relErr 1.14e-5 -- IDENTICAL TO HONEST MODE 12. *** sin(14pi/26) = sin(12pi/26), so the trajectory " +
        "and the formula alias the same way and agree perfectly about a mode the chain does not have. " +
        "j = 18 -> 8 (7.84e-6), j = 24 -> 2 (6.63e-7), j = 25 -> 1 (1.68e-7): THE HIGHER THE FAKE MODE, THE " +
        "BETTER IT SCORES. Two independent routes agreeing proves nothing when they share the wrong assumption.",
    theDeadModeStillProducesANumber:
        "j = N+1 = 13 writes an initial amplitude of 8.09e-16 -- MACHINE ZERO, because sin(pi*(n+1)) is zero " +
        "at every mass -- and the crossing detector still finds 60 crossings of float dust and reports " +
        "omega = 1.130265 against a closed form of 2.000000. A dead fixture that answers rather than refusing.",
    theIntegratorIsGood:
        "relErr 1.68e-7 / 6.63e-7 / 1.46e-6 / 2.50e-6 / 5.09e-6 / 7.84e-6 / 1.01e-5 / 1.14e-5 at " +
        "j = 1, 2, 3, 4, 6, 8, 10, 12 -- MONOTONE and rising as omega^2, which is velocity-Verlet's own " +
        "O(dt^2 omega^2) period error. So the tolerance is scaled by (omega*dt)^2 rather than being one flat " +
        "number, and the sweep is what says the shape is right.",
    theCostIsReal:
        "380 steps per period at j = 12 against 3128 at j = 1 at dt = 1/120 -- an 8.2x measured difference, " +
        "which is why 'prefer the highest mode' is a cost argument and not a device for manufacturing tension.",
};

export function reportLines() {
    const L = [];
    L.push("[vibrationKnob] the mode knob, and what the frequency key cannot see");
    L.push("");
    L.push("   j   omega(recovered)  closed        relErr      verdict");
    for (const j of [1, 4, 8, 12, 13, 14, 25]) {
        const v = adjudicate(j);
        const e = v.evidence;
        L.push("  " + String(j).padStart(3) + "  " +
               (e.omega != null ? e.omega.toFixed(6) : "--").padEnd(17) +
               (e.closed != null ? e.closed.toFixed(6) : "--").padEnd(13) +
               (e.relErr != null ? e.relErr.toExponential(2) : "--").padEnd(11) +
               (v.pass ? "PASS" : "refused: " + String(e.reason || "").slice(0, 58)));
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
