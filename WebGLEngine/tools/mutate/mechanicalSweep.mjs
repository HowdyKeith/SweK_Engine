// WebGLEngine/tools/mutate/mechanicalSweep.mjs -- v4388
//
// *** THE FIRST MECHANICAL MUTATION SWEEP THIS TREE HAS EVER RUN, RECORDED THE WAY v4387 RECORDED THE OTHER. ***
//
// tools/mutate/scan.mjs could name mechanical mutations from the day it was written and never applied one.
// tools/mutate/mechanical.mjs is the runner; this is what it produced.
//
// ---- WHAT THE NUMBERS SAY, INCLUDING THE PART THAT IS ABOUT THE TOOL RATHER THAN THE TREE ----------------------
//
// 19 constants swept across 5 files: 6 CAUGHT, 7 SURVIVED, 6 UNMEASURED.
//
// Beside the hand-picked suite's 10/10 that looks damning, and read carelessly it would be. *** IT IS MOSTLY A
// FINDING ABOUT THE MUTATION OPERATOR. *** scan.mjs perturbs every literal by the same relative 3%, which is a
// PHYSICS mutation: meaningful for a kernel normalising constant, meaningless for an integer tick count or a
// JSON indent. Triaged by hand, five of the seven survivors are numbers a 3% nudge cannot plausibly break:
//
//     inputDelay : 3        an integer tick count; 3.09 is not a defect anyone could ship
//     maxCatchup || 16      likewise
//     redundancy : 4        likewise -- AND THIS ONE SETTLES THE ARGUMENT, see below
//     nextInputTick - 2     likewise
//     JSON.stringify(x, null, 2)   a formatting argument
//
// *** THE redundancy LINE IS THE PROOF, BECAUSE BOTH SUITES MUTATE IT. *** tools/mutate/mutate.mjs's
// hand-picked entry sets that same constant to 0 and is CAUGHT; the mechanical operator sets it to 4.12 and it
// SURVIVES. Same line, same file, opposite verdicts -- so the difference is not gate coverage at all, it is
// whether the mutation is a plausible defect for that KIND of number. A single operator applied to every
// literal manufactures survivors, and a survivor list nobody can trust is worth about as much as a comment.
//
// ---- AND TWO SURVIVORS ARE REAL, CONFIRMED AGAINST THE WHOLE TREE ----------------------------------------------
//
// The other two are physics, and the affected-set verdict was put on trial: each was re-applied and graded by
// the FULL verify -- 934 gates, not the four that reach the file. Both came back ALL GREEN.
//
//     physics/box3dLockstepNet.js:19   const dt = opts.dt || 1 / 30       -> 1 / 30.9
//     physics/box3dLockstep.js:21      shipHalf: opts.shipHalf || 30      -> 30.9
//
// A three-percent change to the LOCKSTEP TIMESTEP passes every gate in the tree. So does a three-percent change
// to the ship half-extent the lockstep adapter is built with. Those are two numbers nothing is checking, and
// they are what scan.mjs was built to find -- found the first time it was actually run.
//
// The narrow answer matching the wide one on both is also the evidence that the affected-set shortcut is sound
// HERE; it is not a proof that it is sound everywhere, and mechanical.mjs's header says which direction the
// graph's 427 unresolved imports can bend it.
"use strict";

import { createHash } from "node:crypto";

/**
 * The fingerprint of a swept CONSTANT SET. The mechanical table is generated rather than written, so what has
 * to be pinned is what scan.mjs produced: file, line, the literal and its replacement. Regenerate after any
 * edit to those files and the fingerprint moves, exactly as v4387's does for the hand-picked table.
 */
export function sweepFingerprint(rows) {
    const h = createHash("sha256");
    for (const r of [...rows].sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line))) {
        h.update(r.file + " " + r.line + " " + r.was + " " + r.now + " ");
    }
    return h.digest("hex").slice(0, 16);
}

/** The files swept, derived from the rows -- what a gate asks git about. */
export const filesOf = (rows) => [...new Set(rows.map((r) => r.file))].sort();

/**
 * *** THE RECORD. *** `state` is the affected-set verdict; `confirmed` is the full-verify trial, present only
 * where one was run. A SURVIVED with no `confirmed` is an accusation that has not been to court.
 *
 * `plausible` is the one HAND JUDGEMENT in this file and it is marked as such rather than smuggled in as data:
 * whether a 3% relative perturbation is a defect anyone could ship for a number of that kind. It is not
 * derivable from the sweep, it is not measured, and the gate treats it as an annotation and never as evidence.
 */
export const SWEEP = Object.freeze({
    version: "v4387",
    commit: "3b4b541",
    rows: Object.freeze([
        { file: "physics/box3dLockstep.js", line: 21, was: "30", now: "30.9", state: "SURVIVED",
          confirmed: "SURVIVED", plausible: true, note: "shipHalf default -- the adapter's body size" },
        { file: "physics/box3dLockstep.js", line: 71, was: "30", now: "30.9", state: "CAUGHT", plausible: true,
          note: "tryStep's dt default; caught after 2 of 4 gates" },
        { file: "physics/box3dLockstepNet.js", line: 18, was: "3", now: "3.09", state: "SURVIVED",
          plausible: false, note: "inputDelay -- an integer tick count" },
        { file: "physics/box3dLockstepNet.js", line: 19, was: "30", now: "30.9", state: "SURVIVED",
          confirmed: "SURVIVED", plausible: true, note: "THE LOCKSTEP TIMESTEP" },
        { file: "physics/box3dLockstepNet.js", line: 20, was: "16", now: "16.48", state: "SURVIVED",
          plausible: false, note: "maxCatchup -- an integer tick count" },
        { file: "physics/box3dLockstepNet.js", line: 38, was: "4", now: "4.12", state: "SURVIVED",
          plausible: false, note: "redundancy -- an integer; mutate.mjs sets it to 0 and IS caught" },
        { file: "physics/box3dLockstepNet.js", line: 110, was: "2", now: "2.06", state: "SURVIVED",
          plausible: false, note: "a tick-window offset" },
        { file: "brain/blobPolicyStore.js", line: 26, was: "5", now: "5.15", state: "CAUGHT", plausible: true,
          note: "SHAPE.heat; caught by the single gate that reaches the file" },
        { file: "brain/blobPolicyStore.js", line: 26, was: "5", now: "5.15", state: "CAUGHT", plausible: true,
          note: "SHAPE.vent" },
        { file: "brain/blobPolicyStore.js", line: 26, was: "2", now: "2.06", state: "CAUGHT", plausible: true,
          note: "SHAPE.bias" },
        { file: "brain/blobPolicyStore.js", line: 51, was: "2", now: "2.06", state: "SURVIVED",
          plausible: false, note: "JSON.stringify indent" },
        { file: "physics/sph/kernels.js", line: 45, was: "315", now: "324.45", state: "CAUGHT", plausible: true,
          note: "poly6 -- caught after ONE gate of 106, which is what cheapest-first buys" },
        { file: "physics/sph/kernels.js", line: 45, was: "64", now: "65.92", state: "CAUGHT", plausible: true,
          note: "poly6's denominator -- also one gate" },
        { file: "physics/sph/kernels.js", line: 52, was: "15", now: "15.45", state: "UNMEASURED",
          plausible: true, note: "a gate in the set exceeded the 120 s cap" },
        { file: "physics/sph/kernels.js", line: 60, was: "45", now: "46.35", state: "UNMEASURED", plausible: true },
        { file: "physics/sph/kernels.js", line: 66, was: "45", now: "46.35", state: "UNMEASURED", plausible: true },
        { file: "simulation/tomo/diffraction.js", line: 55, was: "2", now: "2.06", state: "UNMEASURED",
          plausible: false, note: "TWO_PI's 2" },
        { file: "simulation/tomo/diffraction.js", line: 73, was: "4", now: "4.12", state: "UNMEASURED", plausible: true },
        { file: "simulation/tomo/diffraction.js", line: 78, was: "2", now: "2.06", state: "UNMEASURED", plausible: true },
    ]),
    /** Gates dropped mid-sweep because they were red WITHOUT the mutation -- the lazy control, naming them. */
    droppedAlreadyRed: Object.freeze(["tools/ship/statedRuntime-selfcheck.mjs", "tools/ship/proseAudit-selfcheck.mjs"]),
    note: "the first mechanical sweep this tree has run; 5 files of the 8 the hand-picked ten touch",
});

/** Buckets, derived from the rows. No count is stored beside them -- v4387's lesson, kept. */
export function tally(rows) {
    const s = rows.map((r) => r.state);
    return {
        caught: s.filter((v) => v === "CAUGHT").length,
        survived: s.filter((v) => v === "SURVIVED").length,
        unmeasured: s.filter((v) => v === "UNMEASURED").length,
        total: s.length,
    };
}

/** The survivors worth arguing about: those whose operator was a plausible defect for that kind of number. */
export const plausibleSurvivors = (rows) => rows.filter((r) => r.state === "SURVIVED" && r.plausible);

// ================================================================================================================
// *** v4390 -- THE SAME THREE FILES, SWEPT AGAIN WITH THE OPERATOR CHOSEN BY ROLE. ***
//
// The comparison is the point, so both records live here. tools/mutate/operators.mjs asks what KIND of number
// each constant is before choosing how to break it: a SCALE keeps the relative nudge, a COUNT is set to zero
// and stepped by one, a FORMAT argument is not mutated at all.
//
// PER CONSTANT -- which is the unit that matters, since a COUNT now gets two attempts and is checked if either
// lands -- over the eleven constants in these three files:
//
//     3% only        4 checked, 7 survivors
//     by role        6 checked, 4 survivors, 1 correctly skipped
//
// THREE OF THE SEVEN SURVIVORS WERE FALSE. maxCatchup and redundancy are CAUGHT the moment they are set to 0;
// the JSON indent is SKIPPED, which is a different and honest answer to "is this number checked" -- it is not a
// number anyone should check.
//
// *** AND redundancy IS THE CONTROL, BECAUSE THE ANSWER WAS KNOWN BEFORE THE RUN. *** mutate.mjs's hand-picked
// table sets that same constant to 0 and has been CAUGHT every time the suite has run. If the role operator had
// not caught it, the classifier would have been wrong in the one case with an independent answer. It caught it,
// after ONE gate.
//
// ---- AND THE FOUR THAT SURVIVE ARE ALL THE SAME SHAPE, WHICH IS THE ROUND'S REAL FINDING --------------------
//
// v4389 found that box3dLockstepNet's dt survives because the gates that reach it are DIFFERENTIAL: they build
// two peers and compare them, and a constant both peers share moves both sides of the equality. Sweeping by
// role shows that was not one curiosity. inputDelay set to ZERO survives. So does the history-window offset.
// All four survivors are shared constants in a peer-versus-peer comparison.
//
// *** SO THE RULE IS SHARPER THAN "DIFFERENTIAL GATES ARE BLIND": a differential gate sees a shared constant
// only when something BREAKS THE SYMMETRY. *** Both catches here came from the same gate --
// physics/box3d-lockstep-loss-selfcheck.mjs, the cheapest in the set -- and it is the one that injects PACKET
// LOSS. Redundancy governs what survives a lossy channel and maxCatchup governs whether a peer can ever catch
// up, so under loss the two peers stop being symmetric and diverge for real. dt, inputDelay, shipHalf and the
// window offset have nothing to break their symmetry, and pass.
// ================================================================================================================

export const SWEEP_BY_ROLE = Object.freeze({
    version: "v4389",
    commit: "770deb9",
    files: Object.freeze(["physics/box3dLockstep.js", "physics/box3dLockstepNet.js", "brain/blobPolicyStore.js"]),
    /** One row per CONSTANT, carrying every mutant it was given. `before` is v4389's 3%-only verdict. */
    constants: Object.freeze([
        { file: "physics/box3dLockstep.js", line: 21, was: "30", role: "count", before: "SURVIVED",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "SURVIVED" },
                                  { kind: "offByOne", now: "31", state: "SURVIVED" }]),
          note: "shipHalf -- MISCLASSIFIED as a count; it is a physical half-extent. Still unchecked either way" },
        { file: "physics/box3dLockstep.js", line: 71, was: "30", role: "scale", before: "CAUGHT",
          mutants: Object.freeze([{ kind: "nudge", now: "30.9", state: "CAUGHT" }]),
          note: "tryStep's dt default; caught by lockstepDt-selfcheck, which compares it against an ABSOLUTE" },
        { file: "physics/box3dLockstepNet.js", line: 18, was: "3", role: "count", before: "SURVIVED",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "SURVIVED" },
                                  { kind: "offByOne", now: "4", state: "SURVIVED" }]),
          note: "inputDelay set to ZERO survives -- a new finding, and the same differential blindness as dt" },
        { file: "physics/box3dLockstepNet.js", line: 19, was: "30", role: "scale", before: "SURVIVED",
          mutants: Object.freeze([{ kind: "nudge", now: "30.9", state: "SURVIVED" }]),
          note: "THE LOCKSTEP TIMESTEP; v4389 confirmed this one against the full 934-gate verify" },
        { file: "physics/box3dLockstepNet.js", line: 20, was: "16", role: "count", before: "SURVIVED",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "CAUGHT" },
                                  { kind: "offByOne", now: "17", state: "SURVIVED" }]),
          note: "maxCatchup -- a FALSE survivor under 3%; caught at zero by the packet-loss gate" },
        { file: "physics/box3dLockstepNet.js", line: 38, was: "4", role: "count", before: "SURVIVED",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "CAUGHT" },
                                  { kind: "offByOne", now: "5", state: "SURVIVED" }]),
          note: "THE CONTROL: mutate.mjs sets this to 0 by hand and is caught, so the answer was known first" },
        { file: "physics/box3dLockstepNet.js", line: 110, was: "2", role: "count", before: "SURVIVED",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "SURVIVED" },
                                  { kind: "offByOne", now: "3", state: "SURVIVED" }]),
          note: "the history-window offset -- shared by both peers, so the comparison cannot see it" },
        { file: "brain/blobPolicyStore.js", line: 26, was: "5", role: "count", before: "CAUGHT",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "CAUGHT" },
                                  { kind: "offByOne", now: "6", state: "CAUGHT" }]), note: "SHAPE.heat" },
        { file: "brain/blobPolicyStore.js", line: 26, was: "5", role: "count", before: "CAUGHT",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "CAUGHT" },
                                  { kind: "offByOne", now: "6", state: "CAUGHT" }]), note: "SHAPE.vent" },
        { file: "brain/blobPolicyStore.js", line: 26, was: "2", role: "count", before: "CAUGHT",
          mutants: Object.freeze([{ kind: "zero", now: "0", state: "CAUGHT" },
                                  { kind: "offByOne", now: "3", state: "CAUGHT" }]), note: "SHAPE.bias" },
        { file: "brain/blobPolicyStore.js", line: 51, was: "2", role: "format", before: "SURVIVED",
          mutants: Object.freeze([]),
          note: "JSON.stringify's indent -- not mutated at all now, which is the honest answer" },
    ]),
    caughtBy: Object.freeze({ "physics/box3dLockstepNet.js": "physics/box3d-lockstep-loss-selfcheck.mjs",
                              "physics/box3dLockstep.js": "physics/lockstepDt-selfcheck.mjs",
                              "brain/blobPolicyStore.js": "brain/blob-policy-selfcheck.mjs" }),
});

/**
 * A constant is CHECKED if any mutant it was given was caught; SKIPPED if it was given none; otherwise it
 * SURVIVES. Derived, so the before/after comparison cannot be typed.
 */
export function verdictOf(c) {
    if (!c.mutants.length) return "SKIPPED";
    return c.mutants.some((m) => m.state === "CAUGHT") ? "CHECKED" : "SURVIVED";
}

/** The before/after, per constant. The only place the comparison is computed. */
export function operatorComparison(constants = SWEEP_BY_ROLE.constants) {
    const after = constants.map(verdictOf);
    return {
        total: constants.length,
        beforeChecked: constants.filter((c) => c.before === "CAUGHT").length,
        beforeSurvived: constants.filter((c) => c.before === "SURVIVED").length,
        afterChecked: after.filter((v) => v === "CHECKED").length,
        afterSurvived: after.filter((v) => v === "SURVIVED").length,
        afterSkipped: after.filter((v) => v === "SKIPPED").length,
        rescued: constants.filter((c, i) => c.before === "SURVIVED" && after[i] !== "SURVIVED"),
    };
}

// ================================================================================================================
// *** v4391 -- THE SAME TWO LOCKSTEP FILES, SWEPT AFTER THE MISSING CHECKS WERE WRITTEN. ***
//
// physics/lockstepConstants-selfcheck.mjs gives each of v4390's four survivors the check its actual blindness
// needs. Re-sweeping is the only honest way to say whether that worked, and it is what caught the two places
// where the FIRST DRAFT of that gate reproduced the very defect it was written to fix.
//
//     before (v4390)   3/12 caught, 9 survived
//     after  (v4391)   9/12 caught, 3 survived
//
// *** THE "BEFORE" NUMBER HAD TO BE TAKEN FROM THE RIGHT RUN, AND THE FIRST ONE QUOTED WAS CONTAMINATED. ***
// An intermediate sweep read 6/12 and was nearly written down. It was taken while lockstepConstants-selfcheck
// already existed on disk in a half-built state, so three of its six catches were the new gate's, not the old
// tree's. The honest baseline is the sweep from BEFORE the gate file existed at all: 3 of 12. A before/after
// is only a measurement if the "before" was measured before.
//
// ALL FOUR OF v4390'S NAMED SURVIVORS ARE NOW CAUGHT. The three that remain are every COUNT's off-by-one --
// maxCatchup 16 -> 17, redundancy 4 -> 5, the history offset 2 -> 3 -- and each of those is a LEGITIMATE
// WIDENING of a margin or a budget. That is the correct end state rather than a remaining hole: a margin
// should be checkable in direction (zero is a defect) and not in value (larger is somebody's judgement).
// ================================================================================================================

export const SWEEP_AFTER_FIX = Object.freeze({
    version: "v4390",
    commit: "b5eeda9",
    files: Object.freeze(["physics/box3dLockstepNet.js", "physics/box3dLockstep.js"]),
    rows: Object.freeze([
        { file: "physics/box3dLockstepNet.js", line: 18, was: "3", kind: "zero", before: "SURVIVED", state: "CAUGHT" },
        { file: "physics/box3dLockstepNet.js", line: 18, was: "3", kind: "offByOne", before: "SURVIVED", state: "CAUGHT" },
        { file: "physics/box3dLockstepNet.js", line: 19, was: "30", kind: "nudge", before: "SURVIVED", state: "CAUGHT" },
        { file: "physics/box3dLockstepNet.js", line: 20, was: "16", kind: "zero", before: "CAUGHT", state: "CAUGHT" },
        { file: "physics/box3dLockstepNet.js", line: 20, was: "16", kind: "offByOne", before: "SURVIVED", state: "SURVIVED" },
        { file: "physics/box3dLockstepNet.js", line: 38, was: "4", kind: "zero", before: "CAUGHT", state: "CAUGHT" },
        { file: "physics/box3dLockstepNet.js", line: 38, was: "4", kind: "offByOne", before: "SURVIVED", state: "SURVIVED" },
        { file: "physics/box3dLockstepNet.js", line: 110, was: "2", kind: "zero", before: "SURVIVED", state: "CAUGHT" },
        { file: "physics/box3dLockstepNet.js", line: 110, was: "2", kind: "offByOne", before: "SURVIVED", state: "SURVIVED" },
        { file: "physics/box3dLockstep.js", line: 21, was: "30", kind: "zero", before: "SURVIVED", state: "CAUGHT" },
        { file: "physics/box3dLockstep.js", line: 21, was: "30", kind: "offByOne", before: "SURVIVED", state: "CAUGHT" },
        { file: "physics/box3dLockstep.js", line: 71, was: "30", kind: "nudge", before: "CAUGHT", state: "CAUGHT" },
    ]),
    note: "every remaining survivor is an off-by-one that WIDENS a margin, which is legitimate",
});

/** What the round moved, derived from the rows. No count is carried beside them. */
export function fixComparison(rows = SWEEP_AFTER_FIX.rows) {
    const caught = (v) => v === "CAUGHT";
    return {
        total: rows.length,
        before: rows.filter((r) => caught(r.before)).length,
        after: rows.filter((r) => caught(r.state)).length,
        newlyCaught: rows.filter((r) => !caught(r.before) && caught(r.state)),
        stillSurviving: rows.filter((r) => !caught(r.state)),
    };
}
