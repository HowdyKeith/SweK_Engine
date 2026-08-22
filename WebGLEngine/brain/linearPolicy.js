// WebGLEngine/brain/linearPolicy.js — one learner, many schemas.
//
// v2186. There are two policies now: Endless Sky's, which scores a hostile ship, and BZFlag's, which
// scores an enemy tank. They share every line of the maths and not one feature. Copying the learner would
// have been two files that drift; sharing the FEATURES would have poisoned a trained model with numbers
// that mean nothing to it. So the maths lives here and each game brings a SCHEMA.
//
// A schema is: the weight names, the feature names, how a feature object becomes a vector, the hand
// policy, the bounds, and how a score is computed from the two. Nothing else.
//
// The learning rule, unchanged from brain/tacticsPolicy.js where it was proved:
//
// CONTRASTIVE UPDATE. A reward alone cannot say WHICH feature made a choice good. So every decision
// records the runner-up -- the target it would otherwise have shot -- and the weights move along the
// DIFFERENCE:
//
//     w += lr * reward * (x_chosen - x_alternative)
//
// With no alternative there is no counterfactual and no information, so the update is skipped rather than
// invented.
//
// AND THE GRADIENT IS AVERAGED, NOT SUMMED. The first version of the ES policy summed, and its HTTP test
// caught the consequence at once: eighty identical samples drove one weight straight into its clamp. That
// is saturation by repetition. A policy should encode how CONSISTENT the evidence is, not how much of it
// there happens to be -- ten decisions that all agree carry the same lesson as a thousand.
//
//     w = hand + GAIN * mean_over_samples( reward * (x_chosen - x_alt) )
//
// Perfectly consistent evidence moves a weight by GAIN; evenly split evidence moves it by nothing; and the
// result no longer depends on how long the game was left running.
//
// CJS, deliberately. The bridges require this, and a bridge is the one process that must never fail to
// start.

"use strict";

function makePolicy(schema) {
    const { name, W_KEYS, F_KEYS, featVector, defaultWeights, W_MIN, W_MAX, GAIN, score } = schema;

    const toArray = (w) => W_KEYS.map((k) => Number(w[k]) || 0);
    const toObject = (a) => { const o = {}; W_KEYS.forEach((k, i) => { o[k] = a[i]; }); return o; };

    // Unbounded weights let one lucky streak produce a policy that only ever chases one kind of target.
    // Clamping is not timidity; it is the difference between a policy and a runaway.
    const clampW = (a) => a.map((v) => (v < W_MIN ? W_MIN : v > W_MAX ? W_MAX : v));

    // A feature object belongs to THIS schema, or it does not belong here at all. This is the wall between
    // the two games: an Endless Sky sample offered to the tank policy is rejected, and a tank sample
    // offered to the ship policy is rejected, and neither can quietly corrupt the other.
    function isFeat(f) {
        return !!f && typeof f === "object" && F_KEYS.every((k) => Number.isFinite(Number(f[k])));
    }

    function update(weights, chosen, alt, reward, lr = 0.05) {
        if (!chosen || !alt) return { weights, applied: false, reason: "no counterfactual" };
        if (!Number.isFinite(reward) || reward === 0) return { weights, applied: false, reason: "no reward" };
        const xc = featVector(chosen), xa = featVector(alt);
        const w = toArray(weights);
        let moved = 0;
        for (let i = 0; i < w.length; i++) {
            const d = xc[i] - xa[i];
            w[i] += lr * reward * d;
            moved += Math.abs(lr * reward * d);
        }
        return { weights: toObject(clampW(w)), applied: moved > 0, moved };
    }

    function trainAll(samples, weights = defaultWeights(), lr = 0.05) {
        const list = (samples || []).filter((s) => s && s.chosen && s.alt && Number.isFinite(Number(s.reward)) && Number(s.reward) !== 0);
        const base = toArray(weights);
        if (!list.length) return { weights: toObject(base), samples: (samples || []).length, applied: 0 };

        const acc = new Array(base.length).fill(0);
        let applied = 0;
        for (const s of list) {
            const xc = featVector(s.chosen), xa = featVector(s.alt);
            const r = Number(s.reward) > 0 ? 1 : -1;
            let moved = 0;
            for (let i = 0; i < acc.length; i++) { const d = xc[i] - xa[i]; acc[i] += r * d; moved += Math.abs(d); }
            if (moved > 0) applied++;
        }
        const w = base.map((v, i) => v + GAIN * (acc[i] / list.length));
        return { weights: toObject(clampW(w)), samples: (samples || []).length, applied };
    }

    // Only ship weights the caller can trust: finite, in band, and actually informed by data.
    function isTrained(weights, samples, minSamples = 8) {
        if ((samples | 0) < minSamples) return false;
        return W_KEYS.every((k) => Number.isFinite(weights[k]));
    }

    return { name, W_KEYS, F_KEYS, defaultWeights, update, trainAll, score, isTrained, isFeat, featVector, toArray, toObject, W_MIN, W_MAX, GAIN };
}

module.exports = { makePolicy };
