// WebGLEngine/brain/tacticsPolicy.js — the producer side of ES combat tactics.
//
// esTactics.js SCORES a target with a weight vector. This learns that vector from what actually
// happened. It is deliberately not a neural net: the policy is five numbers, the signal is sparse
// (a kill, a death), and a linear contextual bandit is the honest tool. The v2156 benchmark is why —
// the brain's value here is the policy, and a 5-dim dot product does not want a GPU.
//
// v2186 — the MATHS moved to brain/linearPolicy.js, unchanged, because there is a second policy now:
// BZFlag's, which scores a tank. They share every line of the learner and not one feature. What is left
// here is Endless Sky's SCHEMA: five weights, five features, a hand policy, and a score that gates on
// reach. The behaviour, the numbers and the exported API are exactly what they were; brain/tools/
// tactics-policy-selfcheck.mjs is the proof of that.
//
// The learning rule (contrastive update, averaged not summed) is documented where it lives, in
// linearPolicy.js. It was proved here first.
//
// CJS ONLY, deliberately. The bridge requires this file, and the bridge is the one process that must never
// fail to start. ESM callers get the whole api as the default import.

"use strict";

const { makePolicy } = require("./linearPolicy.js");

// Order matters: it is the contract between features() and the weight vector.
const W_KEYS = ["wClose", "wWeak", "wThreat", "wPlayer", "wFocus"];
const F_KEYS = ["reach", "weakness", "threat", "isPlayer", "focus"];

// wClose is the bias term: it multiplies nothing, it IS the baseline desire before any feature
// speaks. Its "feature" is therefore constant 1.
function featVector(f) {
    return [1, f.weakness || 0, f.threat || 0, f.isPlayer || 0, f.focus || 0];
}

function defaultWeights() {
    return { wClose: 1.00, wWeak: 0.80, wThreat: 0.55, wPlayer: 0.35, wFocus: 0.25 };
}

// Score exactly as esTactics does, so a caller can sanity-check the learned policy without importing
// the engine module. reach gates everything (see esTactics for why).
function score(weights, f) {
    const w = weights;
    const desire = w.wClose + w.wWeak * (f.weakness || 0) + w.wThreat * (f.threat || 0)
                 + w.wPlayer * (f.isPlayer || 0) + w.wFocus * (f.focus || 0);
    return (f.reach || 0) * desire;
}

const es = makePolicy({
    name: "es",
    W_KEYS, F_KEYS, featVector, defaultWeights, score,
    W_MIN: -2, W_MAX: 4,
    GAIN: 2.0,
});

module.exports = {
    W_KEYS, F_KEYS, defaultWeights, featVector, score,
    update: es.update, trainAll: es.trainAll, isTrained: es.isTrained,
    isFeat: es.isFeat, toArray: es.toArray, toObject: es.toObject,
};
