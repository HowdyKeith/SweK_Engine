// brain/rl/imitation.js -- learn from the behaviors we already have. recordDemos() runs a scripted expert (like the
// hand-coded controllers driving our demos) in an env and logs every (observation, action) pair; cloneFromDemos()
// trains a FlightPolicy to REPRODUCE those actions by supervised backprop (behavioral cloning) -- no reward, no RL,
// it just imitates the demonstrations. The clone drops onto the same GPU-Brain policy and can then be RL-fine-tuned
// on the steppable trainer. This is usually the fastest path to a good policy: the demos are the curriculum, so the
// brain skips the cold-start flailing and starts from competent behavior.
"use strict";

import { FlightPolicy } from "./dockPolicy.js";
import { encodeFlightObs } from "./sharedEncoder.js";

// a scripted pursuit expert on the shared obs [relF, relR, velF, velR, dist, tVelF, tVelR]: aim a little ahead of the
// target (lead it by its velocity), turn to face that point, thrust when it's ahead. Stands in for a demo behavior.
function huntExpert(obs) {
    const relF = obs[0], relR = obs[1], tVelF = obs[5], tVelR = obs[6];
    const aimF = relF + tVelF * 0.5, aimR = relR + tVelR * 0.5;
    const ang = Math.atan2(aimR, aimF);
    const turn = Math.max(-1, Math.min(1, ang * 1.6));
    const thrust = aimF > 0 ? 1 : -0.2;
    return [turn, thrust];
}

// run an expert in an env, recording (obs, action) pairs
function recordDemos(expert, envFactory, opts = {}) {
    const episodes = opts.episodes || 30, obs = [], act = [];
    for (let e = 0; e < episodes; e++) { const env = envFactory({ maxSteps: opts.maxSteps || 220 }); let o = env.reset(1000 + e);
        for (let t = 0; t < env.maxSteps; t++) { const a = expert(o); obs.push(Float32Array.from(o)); act.push(Float32Array.from(a)); const r = env.step(a); o = r.obs; if (r.done) break; }
    }
    return { obs, act };
}

// behavioral cloning: SGD backprop so the policy's action matches the demo action (MSE). Returns FlightPolicy params.
function cloneFromDemos(demos, opts = {}) {
    const obsDim = opts.obsDim || demos.obs[0].length, actDim = opts.actDim || demos.act[0].length, hidden = opts.hidden || [16, 16];
    const p = new FlightPolicy({ obsDim, actDim, hidden, seed: opts.seed || 1 }), layers = p.layers;
    const N = demos.obs.length, epochs = opts.epochs || 260, lr = opts.lr || 0.05;
    let lastLoss = 0;
    for (let ep = 0; ep < epochs; ep++) {
        let loss = 0;
        for (let s = 0; s < N; s++) {
            const acts = [demos.obs[s]];
            for (const L of layers) { const inp = acts[acts.length - 1], out = new Float32Array(L.nOut); for (let o = 0; o < L.nOut; o++) { let acc = L.b[o]; const base = o * L.nIn; for (let i = 0; i < L.nIn; i++) acc += L.W[base + i] * inp[i]; out[o] = Math.tanh(acc); } acts.push(out); }
            const outp = acts[acts.length - 1], tgt = demos.act[s];
            let delta = new Float32Array(outp.length);
            for (let o = 0; o < outp.length; o++) { const e = outp[o] - Math.max(-1, Math.min(1, tgt[o])); loss += e * e; delta[o] = 2 * e * (1 - outp[o] * outp[o]); }
            for (let li = layers.length - 1; li >= 0; li--) { const L = layers[li], inp = acts[li], nd = new Float32Array(L.nIn);
                for (let o = 0; o < L.nOut; o++) { const base = o * L.nIn, d = delta[o]; L.b[o] -= lr * d; for (let i = 0; i < L.nIn; i++) { nd[i] += L.W[base + i] * d; L.W[base + i] -= lr * d * inp[i]; } }
                if (li > 0) { const prev = acts[li]; for (let i = 0; i < L.nIn; i++) nd[i] *= (1 - prev[i] * prev[i]); }
                delta = nd;
            }
        }
        lastLoss = loss / (N * actDim);
    }
    return { params: p.getParams(), loss: lastLoss };
}

export { huntExpert, recordDemos, cloneFromDemos };
if (typeof module !== "undefined" && module.exports) module.exports = { huntExpert, recordDemos, cloneFromDemos };
