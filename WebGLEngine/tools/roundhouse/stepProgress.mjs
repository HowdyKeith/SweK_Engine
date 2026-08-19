// WebGLEngine/tools/roundhouse/stepProgress.mjs -- v3007
//
// DID EACH ESCALATION ACTUALLY HELP?
//
// The idea is TRM's (SamsungSAILMontreal/TinyRecursiveModels): a 7M-parameter network reaching 45% on ARC-AGI-1
// by RECURSIVELY IMPROVING ITS ANSWER and being supervised AT EVERY REFINEMENT STEP, rather than being graded
// once at the end. The model does not port -- there is no PyTorch here, no training loop, and the repo was
// archived read-only in April 2026. THE SUPERVISION TARGET DOES.
//
// The roundhouse runs up to six rounds of propose -> measure -> verdict -> critique, and grades the FINAL claim.
// Every round already records its own verdict. NOTHING COMPARES ROUND N TO ROUND N-1.
//
// SO A RUN THAT CRYSTALLISED IN FOUR ROUNDS AND A RUN THAT GOT STEADILY WORSE FOR THREE AND LUCKED INTO IT ON
// THE FOURTH ARE INDISTINGUISHABLE IN THE RECORD. Both read as "crystallized: true, rounds: 4". The escalation
// machinery is the expensive part of this system and nothing has ever measured whether it works.
//
// THE MEASURE: a normalised SHORTFALL per round -- how far the measurement is from satisfying its own claim,
// with <= 0 meaning satisfied. That is defined for every claim shape the verdict supports, so the trajectory is
// comparable across devices.
//
// WHAT IT WILL NOT DO: score the model, or call a worsening step a failure. A proposer exploring a range may get
// worse before it gets better, and that is legitimate search. What was never visible is whether it happens, and
// how often -- so this reports the shape and refuses to grade it.
"use strict";

/**
 * How far short of its own claim a measurement fell. <= 0 means the claim is satisfied.
 * Returns null where no gradient exists (an equals-claim is a boolean, not a distance).
 */
export function shortfall(verdict, claim) {
    if (!verdict || !claim) return null;
    const m = verdict.measured;
    if (typeof m !== "number" || !Number.isFinite(m)) return null;
    const scale = (x) => (Math.abs(x) > 1e-12 ? Math.abs(x) : 1);
    if ("max" in claim) return (m - claim.max) / scale(claim.max);
    if ("min" in claim) return (claim.min - m) / scale(claim.min);
    if ("target" in claim) {
        const d = typeof verdict.delta === "number" ? verdict.delta : Math.abs(m - claim.target);
        return (d - (claim.tol ?? 0)) / scale(claim.target);
    }
    return null;   // equals: no gradient. Saying so beats inventing one.
}

export const TRAJECTORY = {
    MONOTONE: "monotone-improving",
    IMPROVED: "improved-overall",
    WORSENED: "worsened-overall",
    FLAT: "flat",
    UNGRADED: "no-gradient",
};

/**
 * Grade a roundhouse history STEP BY STEP.
 * @param {Array} history entries of { round, hyp, observable, verdict }
 */
export function stepProgress(history) {
    const rows = [];
    for (const h of history || []) {
        const claim = h && h.hyp && h.hyp.claim;
        const s = shortfall(h.verdict, claim);
        rows.push({ round: h.round, shortfall: s, measured: h.verdict && h.verdict.measured, done: !!(h.verdict && h.verdict.done) });
    }
    const graded = rows.filter((r) => typeof r.shortfall === "number");
    if (graded.length < 2) {
        return { trajectory: TRAJECTORY.UNGRADED, rows, graded: graded.length,
                 why: graded.length ? "only one round carried a gradient, so there is nothing to compare it to"
                                    : "no round carried a numeric gradient -- an equals-claim is a boolean, and inventing a distance for it would be worse than reporting none" };
    }

    // Step deltas: NEGATIVE is an improvement, because shortfall is a distance to satisfying the claim.
    const steps = [];
    for (let i = 1; i < graded.length; i++) {
        const d = graded[i].shortfall - graded[i - 1].shortfall;
        steps.push({ from: graded[i - 1].round, to: graded[i].round, delta: d,
                     helped: d < 0, hurt: d > 0 });
    }
    const helped = steps.filter((s) => s.helped).length;
    const hurt = steps.filter((s) => s.hurt).length;
    const net = graded[graded.length - 1].shortfall - graded[0].shortfall;

    let trajectory;
    if (steps.every((s) => s.helped)) trajectory = TRAJECTORY.MONOTONE;
    else if (net < 0) trajectory = TRAJECTORY.IMPROVED;
    else if (net > 0) trajectory = TRAJECTORY.WORSENED;
    else trajectory = TRAJECTORY.FLAT;

    return {
        trajectory, rows, steps, graded: graded.length,
        helped, hurt, netImprovement: -net,
        helpedFraction: steps.length ? helped / steps.length : null,
        // The sentence the record could never previously produce.
        why: trajectory === TRAJECTORY.MONOTONE
            ? "every escalation improved the answer"
            : trajectory === TRAJECTORY.IMPROVED
                ? helped + " of " + steps.length + " escalations helped; it ended better than it started, but NOT every step was progress -- a final verdict alone would have hidden that"
                : trajectory === TRAJECTORY.WORSENED
                    ? "IT ENDED WORSE THAN IT STARTED. If this run also crystallised, it crystallised on a claim the proposer weakened its way into, which is a different event from solving it"
                    : "the answer did not move across rounds -- the escalations cost time and changed nothing measurable",
    };
}
