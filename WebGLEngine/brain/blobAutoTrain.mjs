// brain/blobAutoTrain.mjs -- the brain trains itself, and knows when it has started fooling itself.
//
// Keith asked for the brain to live by itself. The piece that makes that safe was already built and I did not see
// it until he asked: THE STORE REFUSES WORSE POLICIES (v2488). That is a ratchet -- the door only opens one way --
// so a loop that trains while the machine is idle cannot make things worse. It can only improve.
//
// EXCEPT THAT IS NOT TRUE, AND I CHECKED BEFORE BUILDING ON IT.
//
// The held-out set is FOUR FIXED SCENARIOS. A loop that runs a thousand times and keeps whatever scores best on
// those same four is SELECTING ON THOSE FOUR. The held-out set stops being held out the moment you choose with it
// repeatedly -- that is overfitting wearing a ratchet costume, and it looks exactly like progress from the inside,
// because the number goes up every single time by construction.
//
// MEASURED, with a THIRD set that nothing was allowed to select on:
//
//     attempts kept     held-out (the store judges on this)     audit (never used to choose)
//          1                     1.91562                                1.94106
//          5                     1.98248                                2.12753
//         20                     2.15417                                2.23718
//         60                     2.20082                                2.33448
//        150                     2.25011                                2.32572     <- held-out UP, audit DOWN
//
// So the ratchet is REAL for roughly the first sixty attempts -- the audit does not merely follow, it LEADS. And
// then it detaches: the score keeps climbing while the policy stops improving, and the store, refusing everything
// "worse", locks that in and calls it progress.
//
// THE DESIGN THAT FOLLOWS FROM THE MEASUREMENT: you cannot prevent this by being clever about the selection --
// any fixed set you select on repeatedly becomes a training set. What you CAN do is WATCH it, with a set that
// never touches the decision. So this loop keeps an AUDIT SET that has no vote: it is evaluated, recorded, and
// reported, and it never influences whether a policy is offered or kept.
//
// AND THE INSTRUMENT MATTERS. My first attempt at the watchdog counted how many accepted policies in a row failed
// to improve the audit, and it never fired -- because acceptances are RARE (7 in 120 attempts; the ratchet gets
// harder to beat as it climbs), so "six in a row" needed thousands of runs. The counter was measuring my patience,
// not the brain.
//
// THE RIGHT INSTRUMENT IS SITTING IN THE DATA: REGRET. Track the best audit score ever SEEN, and compare it to the
// audit score of the policy the store is actually HOLDING. In the run above, attempt 64 scored 2.44801 on the
// audit; attempt 78 scored 2.25011 held-out (better, so the store took it) and 2.32572 on the audit (worse). The
// store is holding a policy that is 0.12 WORSE IN REALITY than one it already saw and threw away -- bought for
// 0.024 of score. That is the detachment, stated as a number, with no threshold invented by me.
//
// A brain that can say "I am currently holding something worse than what I discarded" is worth more than one that
// grinds a number upward forever.
"use strict";
import { train, evaluate, TEST_SET } from "./blobTrainer.mjs";

// Deliberately DIFFERENT scenarios from TRAIN_SET and TEST_SET, and deliberately more of them. This set has no
// vote. Nothing selects on it. The moment it influences a decision it stops being able to answer the question.
const AUDIT_SET = [
    { goal: 2.35, energy: 0.78 }, { goal: 2.65, energy: 0.62 }, { goal: 3.55, energy: 0.95 },
    { goal: 3.15, energy: 0.72 }, { goal: 2.90, energy: 0.50 }, { goal: 3.40, energy: 0.85 },
];

function createAutoTrainer({ iters = 300, onAttempt = null, seed0 = 1000 } = {}) {
    const history = [];
    let best = null, bestHeld = -Infinity, bestAudit = null;
    let bestAuditEver = -Infinity, bestAuditAt = null;

    async function attempt(i) {
        const r = train({ iters, seed: seed0 + i * 7919 });
        const held = evaluate(r.weights, TEST_SET, {});
        const audit = evaluate(r.weights, AUDIT_SET, {});     // measured, never consulted
        let kept = false;
        if (held > bestHeld) { bestHeld = held; best = r.weights; bestAudit = audit; kept = true; }
        // The audit has no vote in what is KEPT. It only gets a vote in whether we admit the keeping is working.
        // Note this tracks every attempt, not just accepted ones: a policy the store rejected can still be the
        // best thing we ever saw, and that is exactly the fact the regret number exists to surface.
        if (audit > bestAuditEver) { bestAuditEver = audit; bestAuditAt = i; }
        const row = { i, held, audit, kept, bestHeld, bestAudit, regret: bestAuditEver - (bestAudit ?? -Infinity) };
        history.push(row);
        if (onAttempt) onAttempt(row);
        return row;
    }

    return {
        attempt, history, AUDIT_SET,
        get best() { return best; },
        get bestHeld() { return bestHeld; },
        get bestAudit() { return bestAudit; },
        get bestAuditEver() { return bestAuditEver; },
        get bestAuditAt() { return bestAuditAt; },
        // REGRET: how much real performance the store is giving up to hold the highest-scoring policy. Zero means
        // the thing it kept IS the best thing it saw. Positive means it traded reality for score.
        regret() { return bestAudit === null ? 0 : Math.max(0, bestAuditEver - bestAudit); },
        // Honest summary. No invented thresholds: it reports the number and what the number means.
        verdict() {
            if (history.length < 3) return { state: "early", detail: "not enough attempts to say", regret: 0 };
            const g = this.regret();
            if (g <= 0) return { state: "clean", regret: 0,
                detail: "the policy on disk IS the best thing seen -- held-out " + bestHeld.toFixed(5) + ", audit " + bestAudit.toFixed(5) };
            return { state: "detached", regret: g,
                detail: "holding a policy that scores " + bestAudit.toFixed(5) + " on the audit, when attempt " + bestAuditAt +
                        " scored " + bestAuditEver.toFixed(5) + ". It gave up " + g.toFixed(5) + " of REAL performance to gain score. " +
                        "The store is doing exactly what it was told; what it was told is running out of road." };
        },
    };
}
export { createAutoTrainer, AUDIT_SET };
