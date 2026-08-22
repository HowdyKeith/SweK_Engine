// fx/raycast/policyBrain.js -- a tiny in-browser policy brain so the away-mission flies with a NEURAL pilot automatically,
// with no rig wiring. It maps the 8-feature raycast state to [turn, forward]. It's a single-layer policy (a perceptron)
// seeded to navigate -- steer toward the objective, turn toward the open side near walls -- so it works out of the box,
// and the weights are plain arrays so it is trivially learnable online from the salvage reward. The big WebGPU GPU Brain
// overrides it on-rig (it registers window.__swekBrainInfer first); this is the always-present floor, not a ceiling.
"use strict";
// state = [ray-0.8, ray-0.4, ray0, ray+0.4, ray+0.8, fwd, side, dist]
function defaultWeights() {
    return {
        // turn: steer toward target (side), and toward the more-open side near walls (left rays push left, right rays push right)
        turn: [-0.7, -0.35, 0, 0.35, 0.7, 0, 1.6, 0, 0],
        // forward: go when the path ahead is open (center + near rays) and we're facing the target; ease off otherwise
        forward: [0, 0.35, 1.3, 0.35, 0, 0.5, 0, 0, -0.15]
    };
}
function makePolicy(weights) {
    const W = weights || defaultWeights();
    return function (state) {
        let turn = W.turn[8], forward = W.forward[8];
        for (let i = 0; i < 8; i++) { turn += W.turn[i] * state[i]; forward += W.forward[i] * state[i]; }
        return [Math.tanh(turn), Math.tanh(forward)];
    };
}
// Register as the default brain unless the rig already put a (WebGPU) brain there.
function installDefaultPolicy() { if (typeof window !== "undefined" && typeof window.__swekBrainInfer !== "function") { const p = makePolicy(); window.__swekBrainInfer = (state) => p(state); return true; } return false; }
export { makePolicy, defaultWeights, installDefaultPolicy };
if (typeof module !== "undefined" && module.exports) module.exports = { makePolicy, defaultWeights, installDefaultPolicy };
