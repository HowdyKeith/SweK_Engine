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
