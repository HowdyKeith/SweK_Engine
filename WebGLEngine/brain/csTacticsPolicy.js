// WebGLEngine/brain/csTacticsPolicy.js — the GPU Brain's COUNTER-STRIKE tactics producer.
//
// cs/csEnv.js puts the agent in a round facing several visible enemies. This is the weight vector it
// scores them with, learned from what actually happened: the enemy it shot first over the runner-up
// either traded out the round (right pick, reward +1) or got it killed (wrong pick, reward -1).
//
// It is the SAME learner as Endless Sky's and BZFlag's -- brain/linearPolicy.js -- and NOT the same
// policy. Seven features, none of which mean anything to a ship or a tank, and a hand policy that starts
// where a decent CS player starts. Feeding a ship's `weakness` to this model would corrupt a working
// policy with a number that is not about anything, so `isFeat` is the wall and cs/tools/cs-selfcheck.mjs
// checks it from both sides.
//
// The features, and why they are the ones:
//
//   reach     THE GATE. 1 when you have a clear line of fire AND the enemy is inside your weapon's
//             effective range; 0 when it is fully behind cover or too far to hit. An enemy you cannot
//             shoot is not a target, so like Endless Sky's `reach` it MULTIPLIES the whole desire --
//             a policy that scores an unhittable enemy highly is a policy that stares at a wall.
//   near      1 at point-blank, 0 at the edge of effective range. Closer is a faster kill and a bigger
//             threat both; which matters more is exactly what a policy should learn.
//   crosshair 1 dead on your current aim, 0 if you would have to swing 90+ degrees. The enemy already
//             under your crosshair dies before the one you have to flick to.
//   exposed   1 if the whole body is out of cover, 0 if only a sliver peeks. A slivered enemy is a
//             slow, low-percentage kill.
//   lowHp     1 nearly dead, 0 at full health. Finishing the wounded stops them trading back.
//   threat    1 if the enemy is aimed at YOU or holds a high-threat weapon (an AWP), 0 if looking away
//             with a pistol. Kill the one who kills you first.
//   objective 1 if the enemy is the planter / defuser / bomb carrier, 0 for a passive one. The bomb
//             decides the round, so the player on it is worth more than a kill elsewhere.
//
// wBias is the baseline desire before any feature speaks; its "feature" is the constant 1.
//
// CJS, like the ES and BZ policies, because a bridge requires it and a bridge must never fail to start.

"use strict";

const { makePolicy } = require("./linearPolicy.js");

const W_KEYS = ["wBias", "wNear", "wCross", "wExposed", "wLowHp", "wThreat", "wObjective"];
const F_KEYS = ["reach", "near", "crosshair", "exposed", "lowHp", "threat", "objective"];

// reach is the gate (F_KEYS[0]); it does not get a learned weight of its own -- it multiplies the desire
// in score(). featVector's first slot is the constant 1 (the bias), pairing with wBias. This is the same
// gate/bias arrangement as brain/tacticsPolicy.js.
function featVector(f) {
    return [1, f.near || 0, f.crosshair || 0, f.exposed || 0, f.lowHp || 0, f.threat || 0, f.objective || 0];
}

// The hand policy -- where a competent player starts before any game is played. cs/csEnv.js's agent runs
// these until the bridge has enough data to serve better ones, so they must stay in step with it.
function defaultWeights() {
    return { wBias: 0.0, wNear: 0.55, wCross: 0.95, wExposed: 0.85, wLowHp: 0.65, wThreat: 0.60, wObjective: 0.45 };
}

// reach gates everything (see the header): an enemy behind full cover or out of range scores 0 no matter
// how tempting the rest of it looks.
function score(weights, f) {
    const w = weights;
    const desire = w.wBias + w.wNear * (f.near || 0) + w.wCross * (f.crosshair || 0)
                 + w.wExposed * (f.exposed || 0) + w.wLowHp * (f.lowHp || 0)
                 + w.wThreat * (f.threat || 0) + w.wObjective * (f.objective || 0);
    return (f.reach || 0) * desire;
}

const cs = makePolicy({
    name: "cs",
    W_KEYS, F_KEYS, featVector, defaultWeights, score,
    W_MIN: -2, W_MAX: 4,
    GAIN: 2.0,
});

module.exports = {
    W_KEYS, F_KEYS, defaultWeights, featVector, score,
    update: cs.update, trainAll: cs.trainAll, isTrained: cs.isTrained,
    isFeat: cs.isFeat, toArray: cs.toArray, toObject: cs.toObject,
};
