// WebGLEngine/tools/roundhouse/routeContrast.mjs — v3527
// ---------------------------------------------------------------------------------------------------------------
// WHERE THE ROUTES DISAGREE IS THE SIGNAL — and here it comes with a label, which is what makes it usable.
//
// PROVENANCE. HKUDS/LightReasoner (MIT, ACL 2026 Oral): the disagreement between a strong and a weak model is
// itself the training signal, and it needs no ground-truth labels. No code is lifted -- that is a fine-tuning
// pipeline and this lab trains nothing. What transfers is the observation, which is amplifiedDiff's two-route
// discipline arriving from the other direction.
//
// *** AND THE THING IT NEEDS IS ALREADY BEING THROWN AWAY. *** routeBench runs an escalation chain: a cheap model
// attempts a task, THE SWEK GATE VERIFIES IT, and on failure the chain escalates to a stronger one. aggregate()
// records chosen, verified, escalations, cost -- outcomes per model. The CONTRAST is never recorded. Every
// escalation event is a task where the weak route was wrong and the strong route was right, and that is precisely
// the discriminating set LightReasoner goes looking for.
//
// *** THE CAUTION, WHICH IS THE REASON THIS IS ADOPTABLE AT ALL. *** An unlabelled signal is what this lab
// refuses everywhere else -- the whole objection to a soft-signal ensemble without a veto. LightReasoner's
// contrast is unlabelled by design and is trusted on the strength of the disagreement alone. HERE IT IS NOT: the
// SweK gate has already ruled on every attempt, so each disagreement carries a verdict. The contrast is a
// PARTITION OF LABELLED OUTCOMES, not a proxy for one.
//
// So the four cells below are not "agreement/disagreement" -- they are named by what the gate said, and two of
// them are the interesting ones:
//
//   BOTH-PASS      -- the task did not discriminate. Cheap and strong are equally right, so the cheap one should
//                     have been used, and if it was not the routing is leaving money on the table.
//   WEAK-FAILS     -- THE DISCRIMINATING SET. This is what escalation exists for and what a harder bench should
//                     be made of.
//   STRONG-FAILS   -- *** THE ONE WORTH LOOKING AT HARDEST. *** The cheap route passed the gate and the expensive
//                     one did not. Either the task is misleadingly easy, or the gate is weak enough that a wrong
//                     answer slipped through it, and BOTH of those are findings about the harness rather than
//                     about the models.
//   BOTH-FAIL      -- the task is beyond the chain, or the gate is broken. Not a model comparison at all.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/**
 * Build the contrast from per-task attempt records. Each record needs the outcome of EACH route on that task:
 *   { task, weak: { verified }, strong: { verified } }
 * The verdicts come from the gate, never from the models comparing themselves.
 */
export function contrast(records) {
    const cells = { bothPass: [], weakFails: [], strongFails: [], bothFail: [] };
    for (const r of records) {
        const w = !!(r.weak && r.weak.verified), s = !!(r.strong && r.strong.verified);
        if (w && s) cells.bothPass.push(r);
        else if (!w && s) cells.weakFails.push(r);
        else if (w && !s) cells.strongFails.push(r);
        else cells.bothFail.push(r);
    }
    const n = records.length;
    return {
        n, cells,
        counts: { bothPass: cells.bothPass.length, weakFails: cells.weakFails.length,
                  strongFails: cells.strongFails.length, bothFail: cells.bothFail.length },
        discriminating: cells.weakFails.length,
        // the fraction of tasks that told us anything about the models at all
        discriminationRate: n ? cells.weakFails.length / n : 0,
        // agreement is NOT the headline: two routes agreeing on an easy task is the common case and says nothing
        agreementRate: n ? (cells.bothPass.length + cells.bothFail.length) / n : 0,
        anomalies: cells.strongFails.length,
    };
}

/**
 * A bench made only of tasks that discriminate. LightReasoner's actual move, minus the trust: the tasks are
 * selected by where the routes disagreed, and each one still carries the gate verdict that put it there.
 */
export const discriminatingSet = (c) => c.cells.weakFails.map((r) => r.task);

/**
 * *** THE CHECK THAT KEEPS THIS HONEST. *** A contrast is only informative if the gate can actually fail. If
 * every attempt from every route passes, the partition is one cell and the disagreement signal is empty -- which
 * looks identical to two models that agree because both are excellent.
 */
export function contrastIsInformative(c) {
    const anyFail = c.counts.weakFails + c.counts.strongFails + c.counts.bothFail > 0;
    return {
        informative: anyFail && c.n > 0,
        why: !c.n ? "no records"
            : !anyFail ? "EVERY attempt from EVERY route passed the gate. The contrast is empty, and an empty contrast from a gate that never fails is indistinguishable from two excellent models -- so it is reported as uninformative rather than as agreement"
            : `${c.counts.weakFails} discriminating of ${c.n}, with ${c.counts.strongFails} anomalies`,
    };
}

/**
 * Anomaly report: cheap passed, expensive failed. Deliberately NOT summarised into a rate, because the useful
 * response to one of these is to go and read the task rather than to watch a number.
 */
export function anomalyReport(c) {
    if (!c.cells.strongFails.length) return { anomalies: 0, lines: ["no task where the cheap route passed and the strong one failed"] };
    return {
        anomalies: c.cells.strongFails.length,
        lines: c.cells.strongFails.map((r) => `${r.task}: cheap PASSED, strong FAILED -- read this one. Either the ` +
            `task is misleadingly easy or the gate let a wrong answer through, and both are findings about the harness`),
    };
}
