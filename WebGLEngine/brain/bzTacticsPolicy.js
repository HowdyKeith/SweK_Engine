// WebGLEngine/brain/bzTacticsPolicy.js — the producer side of BZFlag tank tactics.
//
// bz/bzPilot.js SCORES an enemy tank with a weight vector. This learns that vector from what actually
// happened: the pilot died (the target it chose over the runner-up was the wrong one), or the target died
// (it was the right one).
//
// It is the same learner as Endless Sky's -- brain/linearPolicy.js -- and NOT the same policy. Four
// features, none of which mean anything to a spaceship, and a hand policy that starts where bz/bzPilot.js
// starts. Feeding a tank's `exposed` to a model trained on a ship's `weakness` would corrupt a working
// policy with a number that is not about anything. `isFeat` is the wall, and it is checked from both
// sides in bz/tools/bz-tactics-selfcheck.mjs.
//
// The features, and why they are the ones:
//
//   near      1 at zero range, 0 at `_shotRange`. The only one a hand policy could get right alone.
//   ahead     1 dead ahead, 0 directly behind. A tank turns at 45 deg/s; a target behind you is a target
//             you spend two seconds not shooting.
//   exposed   1 if the muzzle has a clear line to it. A tank that cannot be shot cannot be killed, and a
//             pilot that scores it highly is a pilot that stares at a wall.
//   airborne  1 if the target is jumping. A jumping tank is a hard target and, briefly, a helpless one.
//             Which of those matters more is exactly the sort of thing a policy should learn rather than
//             a person guess -- the hand weight says "avoid", and it may well be wrong.
//
// wBias is the baseline desire before any feature speaks. Its "feature" is constant 1.
//
// CJS, like the ES policy, because a bridge requires it and a bridge must never fail to start.

"use strict";

const { makePolicy } = require("./linearPolicy.js");

const W_KEYS = ["wBias", "wNear", "wAhead", "wExposed", "wAirborne"];
const F_KEYS = ["near", "ahead", "exposed", "airborne"];

function featVector(f) {
    return [1, f.near || 0, f.ahead || 0, f.exposed || 0, f.airborne || 0];
}

// The hand policy. These are bz/bzPilot.js's own DEFAULT_W, and they must stay in step with it: the pilot
// runs the hand weights until the bridge has enough data to serve better ones.
function defaultWeights() {
    return { wBias: 0.0, wNear: 1.00, wAhead: 0.60, wExposed: 0.40, wAirborne: -0.30 };
}

// No gate. A ship's `reach` multiplies everything because a target out of range is not a target at all; a
// tank's `near` is a preference, not a veto, and `_shotRange` is 350 metres in a 400-metre world.
function score(weights, f) {
    const w = weights;
    return w.wBias + w.wNear * (f.near || 0) + w.wAhead * (f.ahead || 0)
        + w.wExposed * (f.exposed || 0) + w.wAirborne * (f.airborne || 0);
}

const bz = makePolicy({
    name: "bz",
    W_KEYS, F_KEYS, featVector, defaultWeights, score,
    W_MIN: -2, W_MAX: 4,
    GAIN: 2.0,
});

module.exports = {
    W_KEYS, F_KEYS, defaultWeights, featVector, score,
    update: bz.update, trainAll: bz.trainAll, isTrained: bz.isTrained,
    isFeat: bz.isFeat, toArray: bz.toArray, toObject: bz.toObject,
};
