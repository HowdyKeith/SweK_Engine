// brain/rl/bptt.js -- Backprop-Through-Time for the recurrent MemoryPolicy. ES treats the policy as a black box and
// only nudges weights by reward -- a weak signal for a recurrent net, which is why ES couldn't train the memory
// policy to beat a reflex policy on the occlusion tasks. BPTT unrolls the policy over the whole episode and computes
// the EXACT gradient of the loss w.r.t. every weight, flowing back THROUGH the leaky memory writes, then does
// gradient descent. That is the right tool for training memory. Used for supervised targets: a differentiable
// per-step target (the recall task) or expert actions to imitate (behavioral cloning of a recurrent policy).
//
// memory update (matches memoryPolicy.js): memory[m] = tanh( LEAK*memory[m] + WGAIN*content[m] ),  content = tanh(Wc h + bc).
"use strict";

// one BPTT pass over a single episode. inputs[t] (inDim), targets[t] (outDim or null), mask[t] (1 = contributes to loss).
// Accumulates gradients into g; returns the episode loss.
function bpttEpisode(P, inputs, targets, mask, g) {
    const T = inputs.length, H = P.hidden, M = P.mem, xDim = P.xDim, O = P.outDim, IN = P.inDim, LEAK = P.LEAK, WG = P.WGAIN;
    const xs = [], hs = [], outs = [], conts = [], memBefore = [], memAfter = [];
    const memory = new Float32Array(M);
    for (let t = 0; t < T; t++) {
        const x = new Float32Array(xDim); x.set(inputs[t], 0); x.set(memory, IN); xs.push(x); memBefore.push(memory.slice());
        const h = new Float32Array(H); for (let o = 0; o < H; o++) { let a = P.b1[o]; const b = o * xDim; for (let i = 0; i < xDim; i++) a += P.W1[b + i] * x[i]; h[o] = Math.tanh(a); } hs.push(h);
        const out = new Float32Array(O); for (let o = 0; o < O; o++) { let a = P.bout[o]; const b = o * H; for (let i = 0; i < H; i++) a += P.Wout[b + i] * h[i]; out[o] = Math.tanh(a); } outs.push(out);
        const cont = new Float32Array(M), ma = new Float32Array(M);
        for (let m = 0; m < M; m++) { let cp = P.bc[m]; const b = m * H; for (let i = 0; i < H; i++) cp += P.Wc[b + i] * h[i]; cont[m] = Math.tanh(cp); ma[m] = Math.tanh(LEAK * memory[m] + WG * cont[m]); }
        conts.push(cont); memAfter.push(ma.slice()); memory.set(ma);
    }
    let loss = 0; const dMemAfter = new Float32Array(M);
    for (let t = T - 1; t >= 0; t--) {
        const h = hs[t], out = outs[t], cont = conts[t], mb = memBefore[t], ma = memAfter[t], x = xs[t];
        const dh = new Float32Array(H);
        if (mask[t] && targets[t]) { for (let o = 0; o < O; o++) { const e = out[o] - Math.max(-1, Math.min(1, targets[t][o])); loss += e * e; const dpre = 2 * e * (1 - out[o] * out[o]); const b = o * H; for (let i = 0; i < H; i++) { dh[i] += P.Wout[b + i] * dpre; g.Wout[b + i] += dpre * h[i]; } g.bout[o] += dpre; } }
        const dMemBefore = new Float32Array(M);
        for (let m = 0; m < M; m++) {
            const dz = dMemAfter[m] * (1 - ma[m] * ma[m]);        // through the memory tanh
            dMemBefore[m] += dz * LEAK;                            // leak passthrough
            const dcpre = (dz * WG) * (1 - cont[m] * cont[m]);    // through content tanh
            const b = m * H; for (let i = 0; i < H; i++) { dh[i] += P.Wc[b + i] * dcpre; g.Wc[b + i] += dcpre * h[i]; } g.bc[m] += dcpre;
        }
        const dx = new Float32Array(xDim);
        for (let o = 0; o < H; o++) { const dpre = dh[o] * (1 - h[o] * h[o]); const b = o * xDim; for (let i = 0; i < xDim; i++) { dx[i] += P.W1[b + i] * dpre; g.W1[b + i] += dpre * x[i]; } g.b1[o] += dpre; }
        for (let m = 0; m < M; m++) dMemAfter[m] = dMemBefore[m] + dx[IN + m];
    }
    return loss;
}

function zeroGrad(P) { return { W1: new Float32Array(P.W1.length), b1: new Float32Array(P.b1.length), Wout: new Float32Array(P.Wout.length), bout: new Float32Array(P.bout.length), Wc: new Float32Array(P.Wc.length), bc: new Float32Array(P.bc.length) }; }

function bpttTrain(P, episodes, opts = {}) {
    const epochs = opts.epochs || 200, lr = opts.lr || 0.08, clip = opts.clip || 4;
    let last = 0;
    for (let ep = 0; ep < epochs; ep++) {
        const g = zeroGrad(P); let loss = 0, nT = 0;
        for (const e of episodes) { loss += bpttEpisode(P, e.inputs, e.targets, e.mask, g); nT += e.mask.reduce((s, m) => s + m, 0); }
        const scale = 1 / Math.max(1, episodes.length);
        for (const k of ["W1", "b1", "Wout", "bout", "Wc", "bc"]) { const arr = P[k], gr = g[k]; for (let i = 0; i < arr.length; i++) { let d = gr[i] * scale; if (d > clip) d = clip; else if (d < -clip) d = -clip; arr[i] -= lr * d; } }
        last = loss / Math.max(1, nT);
    }
    return last;
}

export { bpttTrain, bpttEpisode, zeroGrad };
if (typeof module !== "undefined" && module.exports) module.exports = { bpttTrain, bpttEpisode, zeroGrad };
