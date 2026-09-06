// WebGLEngine/tools/ship/auditCap.mjs -- v4490
//
// THE REGISTER AUDIT'S CAP WAS TYPED, NEVER DERIVED, AND TWO OF THE THIRTY GATES IT CAPS EXCEED IT.
//
// ---- WHAT A CAP DOES WHEN IT IS TOO SMALL ----------------------------------------------------------------------
//
// tools/ship/freezeRegisterAudit.mjs runs every gate in the red register and writes down its exit code and its
// failing lines, so tools/ship/registerDrift-selfcheck.mjs can hold each register entry to what its gate
// actually says. That gate exists because of a specific failure, in its own words: "TWICE IN ONE SESSION A
// STANDING RED TURNED OUT TO BE UNOPENED MAIL" -- reds that were accurate, registered, and that nobody had
// read.
//
// A gate the freeze kills at the cap is recorded as `exit: "timeout"`, and tools/ship/registerRender.mjs then
// renders that entry as "the audit captured no failing line: exit timeout after N ms, past the capture cap".
// *** THE REGISTER SHOWS A BOUND WHERE THE GATE'S OWN SENTENCE SHOULD BE, WHICH IS THE UNOPENED MAIL AGAIN,
// *** ARRIVING THROUGH THE TOOL BUILT TO PREVENT IT. ***
//
// ---- *** MEASURED: THE SLOWEST REGISTERED GATE IS 441 SECONDS AND THE CAP WAS 120. *** ------------------------
//
// Run singly on a quiet box, the thirty gates in the register take:
//
//     shaderRefs-selfcheck            439,821 ms      3.7x the old cap
//     doorKinds-selfcheck             159,201 ms      1.3x
//     referenceKind-selfcheck          90,874 ms
//     orphanDisposition-selfcheck      84,126 ms
//     graveyard-selfcheck              82,359 ms
//     gateReach-selfcheck              12,784 ms      <- the sixth is already six times faster than the fifth
//     ...
//     unattendedHold-selfcheck             70 ms
//
// Median 1,597 ms. THE SLOWEST IS 275 TIMES THE MEDIAN. A single typed number over a distribution that skewed
// is not a threshold, it is a coin toss about the tail, and it came up wrong for two of thirty.
//
// ---- *** AND THE KNOB WAS ADDED INSTEAD OF THE DEFAULT BEING FIXED, WITH THE MEASUREMENT IN HAND. *** ----------
//
// freezeRegisterAudit.mjs's own comment, at v4471: "their runtimes (75 s to 151 s) are why SWEK_AUDIT_CAP_MS
// exists." So a round measured three gates at up to 151 seconds, added an environment override, AND LEFT THE
// DEFAULT AT 120. The override made the problem solvable by whoever remembered it and left the default wrong
// for whoever did not -- and eighteen rounds later the tail had grown from 151 s to 441 s and nobody was
// passing the variable.
//
// The cap is DERIVED here: twice the slowest measured runtime, rounded up to the next minute. Twice, not a
// margin picked to look generous -- a gate that doubles is a gate that has changed, and the check below
// reports the headroom every run so the next crossing is visible before it is a timeout.
//
// ---- *** AND THE ROUND BEFORE THIS ONE GOT IT WRONG, FROM TWO SAMPLES THAT STRADDLED ONE GATE. *** -------------
//
// v4489 tried to clear this red, re-froze at 120,000 ms and saw doorKinds time out with a captured line, then
// re-froze at 300,000 ms and saw shaderRefs do the same, and concluded: "there is no cap where both pass, so
// registerDrift's rule that a timeout must carry no line is stricter than its own stated intent." THAT WAS
// WRONG, AND THE MISTAKE WAS NOT SUBTLE: 300,000 sits between doorKinds at 159,201 and shaderRefs at 439,821,
// so the two probes bracketed one gate's runtime and the conclusion was drawn from the bracket. THE GATES WERE
// NEVER TIMED. Timed, they take 159 s and 440 s -- both finish, a cap above both is ordinary, and at 600,000 ms
// the audit has zero timeout rows and registerDrift is green.
//
// TWO PROBES ARE NOT A SWEEP, and a conclusion about "no value works" needs the value it is about to have been
// measured rather than guessed at twice. That is the same shape as v4483's thrown-away measurement and v4488's
// f32 hypothesis, except those two were tested before being believed and this one was not.
"use strict";

/**
 * What each gate in the red register takes, run singly. Measured at v4490 by
 * tools/ship/freezeRegisterAudit.mjs at a cap high enough that nothing was killed, so every figure is a
 * runtime and not a bound -- which is the whole point and is asserted by the gate.
 */
export const RUNTIMES = Object.freeze([
    Object.freeze({ gate: "tools/ship/shaderRefs-selfcheck.mjs", ms: 439821 }),
    Object.freeze({ gate: "tools/ship/doorKinds-selfcheck.mjs", ms: 159201 }),
    Object.freeze({ gate: "tools/ship/referenceKind-selfcheck.mjs", ms: 90796 }),
    Object.freeze({ gate: "tools/ship/orphanDisposition-selfcheck.mjs", ms: 83351 }),
    Object.freeze({ gate: "tools/ship/graveyard-selfcheck.mjs", ms: 82231 }),
    Object.freeze({ gate: "tools/ship/gateReach-selfcheck.mjs", ms: 12577 }),
    Object.freeze({ gate: "tools/ship/boundaryLint-selfcheck.mjs", ms: 8092 }),
    Object.freeze({ gate: "tools/ship/canvasFill-selfcheck.mjs", ms: 6441 }),
    Object.freeze({ gate: "tools/ship/avatarServerViews-selfcheck.mjs", ms: 6406 }),
    Object.freeze({ gate: "tools/ship/wgslSpec-selfcheck.mjs", ms: 4101 }),
]);

/** The old default, and what it cost. */
export const OLD_DEFAULT_MS = 120000;

/** How the cap is arrived at, so a later round changes the RULE and not a number. */
export const RULE = Object.freeze({
    multiple: 2,
    roundToMs: 60000,
    why: "a gate that has doubled has changed, and a cap is supposed to catch a hang rather than a slow run",
});

/** Twice the slowest measured runtime, rounded up to the next minute. Derived, never typed. */
export function derivedCap(runtimes = RUNTIMES, rule = RULE) {
    const slowest = Math.max(...runtimes.map((r) => r.ms));
    return Math.ceil(slowest * rule.multiple / rule.roundToMs) * rule.roundToMs;
}

/** Which gates a given cap would kill. The freeze's own history, replayable. */
export function killedBy(capMs, runtimes = RUNTIMES) {
    return runtimes.filter((r) => r.ms >= capMs).map((r) => r.gate);
}

/**
 * *** THE CIRCULARITY THIS FILE HAS TO AVOID, STATED WHERE IT IS EASY TO BREAK. ***
 *
 * The cap is derived from runtimes the freeze measured, and the freeze measures them under the cap. If a gate
 * ever slows past the cap, its recorded `ms` becomes the cap, and a cap derived from that reading would
 * justify itself forever. The gate closes the loop two ways: the audit must contain ZERO timeout rows, and the
 * slowest row must sit under the cap by at least this margin. A row at the cap is a bound wearing a
 * measurement, and neither check passes if one is there.
 */
export const MIN_HEADROOM = 1.5;

export function headroom(capMs, runtimes = RUNTIMES) {
    return capMs / Math.max(...runtimes.map((r) => r.ms));
}

export const MEASURED_AT_V4490 = Object.freeze({
    at: "v4490",
    registeredGates: 30,
    slowestMs: 439821,
    medianMs: 1597,
    slowestOverMedian: 275,
    overOldDefault: 2,
    overSixtySeconds: 5,
    derivedCapMs: 900000,
    // v4471 measured 75-151 s, added SWEK_AUDIT_CAP_MS, and left the default at 120,000.
    knobAddedAt: "v4471",
    knobEraSlowestMs: 151000,
    defaultUnchangedFor: 19,     // v4471 to v4490
    // What v4489 concluded, and why it was wrong.
    priorConclusion: "no cap satisfies registerDrift's timeout rule, so the rule is too strict",
    priorConclusionWrong: true,
    priorProbes: Object.freeze([120000, 300000]),
    priorProbesStraddled: "tools/ship/doorKinds-selfcheck.mjs at 159,201 ms",
});
