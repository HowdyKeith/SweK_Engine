// WebGLEngine/brain/pilotRotorMlp-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotRotorMlp-selfcheck.mjs      (~6 s)
//
// THE SIBLING GATE OF brain/pilotRotorMlp.mjs: the GPU Brain's plain multilayer perceptron (20 -> 32 -> 32 -> 4) as a helicopter pilot, whose hand weights are the hand pilot written through eight relu channels of each layer. As for the fruit fly (brain/pilotRotorPolicy-selfcheck.mjs),
// the claim worth a gate is "the weights ARE the hand pilot", and the network is held to an independent restatement written here (brain/pilotFlightMlp-selfcheck.mjs is the aeroplane's):
//
//   1  SHAPE          20 -> 32 -> 32 -> 4, 1,860 weights, the offsets of the five blocks, the features and outputs are the fruit fly's own (the same senses, the same four controls)
//   2  THE FORWARD PASS   random weights and random features: the CPU twin against an independent restatement (1e-9) and against mlpLayerCpu, the f32 mirror of the GPU kernel (1e-4); the clamps; a NaN feature is a 0; layersOf are VIEWS onto the weights
//   3  THE HAND WEIGHTS   36 non-zero weights in the layout the header gives, the first-layer coefficients the fruit fly's own, the second layer an identity on neurons 0..7; over 2,000 random states the four controls are the hand pilot's to 2e-7; the other 24 neurons of each layer are zero (the room a search grows into)
//   4  THE SAME FLIGHT    the hand-weights MLP flies the hand pilot's flight over the reserve: the same fingerprints
//   5  THE TRAINING FUNCTIONS   a sparse mutation moves 1..maxK of the 1,860 weights; a search never ends lower than it started and is deterministic; prune restores a weight that does not matter and keeps one that does
//
// NOT IN THIS GATE: a GPU row. The GPU Brain's batched kernel (brain/mlp.js's BatchedMLP, brain/pilotFlightGpu.mjs's way of running a fleet in one dispatch per layer) is held to mlpLayerCpu for the aeroplane pilot in brain/pilotFlightGpu-selfcheck.mjs on a WebGPU adapter; this
// network has the same layer shape and is held here to the same mirror, and its own GPU run is for the page that needs it (Heli 6).
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import * as MR from "./pilotRotorMlp.mjs";
import * as PP from "./pilotRotorPolicy.mjs";
import * as AR from "./autopilotRotor.mjs";
import * as RT from "./rotorTask.mjs";
import * as H from "../physics/mechanics/rotorcraftModel6dof.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const model = AR.defaultModel();
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KEYS = ["collective", "pitch", "roll", "yaw"];
const hand = (s, t, w, c) => AR.pilot(s, t, w, c);
const W = 32, FE = 20, OUT = 4, O1 = 0, B1 = FE * W, O2 = B1 + W, B2 = O2 + W * W, O3 = B2 + W, B3 = O3 + OUT * W;

// ---- an independent restatement: dense layers, from the layout in the header alone ----------------------------------------------------------------------------------------------------------------------------
function refForward(w, x) {
    const relu = (v) => (v > 0 ? v : 0);
    const h1 = Array.from({ length: W }, (_, j) => { let s = w[B1 + j]; for (let q = 0; q < FE; q++) s += w[O1 + j * FE + q] * x[q]; return relu(s); });
    const h2 = Array.from({ length: W }, (_, j) => { let s = w[B2 + j]; for (let k = 0; k < W; k++) s += w[O2 + j * W + k] * h1[k]; return relu(s); });
    const y = Array.from({ length: OUT }, (_, o) => { let s = w[B3 + o]; for (let k = 0; k < W; k++) s += w[O3 + o * W + k] * h2[k]; return s; });
    const c = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    return { collective: c(y[0], 0, 1), pitch: c(y[1], -1, 1), roll: c(y[2], -1, 1), yaw: c(y[3], -1, 1) };
}

console.log("pilotRotorMlp-selfcheck -- the GPU Brain's MLP as a helicopter pilot\n");

console.log("1. SHAPE");
{
    ok("!! 20 -> 32 -> 32 -> 4: 640 + 32 + 1024 + 32 + 128 + 4 = 1,860 weights", MR.FEATURES === 20 && MR.OUTPUTS === 4 && MR.WIDTH === 32 && MR.HIDDEN === 32 && MR.WEIGHT_COUNT === 1860 && JSON.stringify(MR.LAYER_SIZES) === "[20,32,32,4]" && MR.zeroWeights().length === 1860);
    ok("the features and outputs are the fruit fly's own (the same senses, the same controls, imported not restated), the zero weights are zero and a fresh array each time", MR.FEATURE_NAMES === PP.FEATURE_NAMES && MR.OUTPUT_NAMES === PP.OUTPUT_NAMES && MR.features === PP.features && MR.featuresFrom === PP.featuresFrom && MR.zeroWeights().every((v) => v === 0) && MR.zeroWeights() !== MR.zeroWeights());
    const w = Float32Array.from({ length: 1860 }, (_, i) => i), L = MR.layersOf(w);
    ok("!! layersOf is brain/mlp.js's shape -- three layers { nIn, nOut, W, b, act }: 20 -> 32 relu, 32 -> 32 relu, 32 -> 4 linear -- and the arrays are VIEWS onto the weights at the offsets the header gives (a write to w shows in the layer)", L.length === 3 && L[0].nIn === 20 && L[0].nOut === 32 && L[0].act === "relu" && L[1].nIn === 32 && L[1].nOut === 32 && L[1].act === "relu" && L[2].nIn === 32 && L[2].nOut === 4 && L[2].act === "none" && L[0].W[0] === 0 && L[0].W.length === 640 && L[0].b[0] === 640 && L[1].W[0] === 672 && L[1].W.length === 1024 && L[1].b[0] === 1696 && L[2].W[0] === 1728 && L[2].W.length === 128 && L[2].b[0] === 1856 && L[2].b.length === 4 && (() => { w[10] = -5; return L[0].W[10] === -5; })());
}

console.log("\n2. THE FORWARD PASS -- against an independent restatement");
{
    const rnd = mulberry(77), w = MR.zeroWeights(); for (let i = 0; i < w.length; i++) w[i] = (rnd() * 2 - 1) * 0.15; w[B3] = 0.5;
    let worst = 0, mirror = 0, nonTrivial = 0;
    for (let n = 0; n < 40; n++) {
        const x = Array.from({ length: 20 }, () => (rnd() * 2 - 1) * 2), a = MR.forward(w, x), b = refForward(w, x);
        for (const k of KEYS) worst = Math.max(worst, Math.abs(a[k] - b[k]));
        const L = MR.layersOf(w); let h = Float32Array.from(x); h = mlpLayerCpu(L[0], h, 1); h = mlpLayerCpu(L[1], h, 1); const y = mlpLayerCpu(L[2], h, 1), c = MR.controlsOf(Array.from(y));
        for (const k of KEYS) mirror = Math.max(mirror, Math.abs(a[k] - c[k]));
        if (Math.abs(a.pitch) < 0.99 && Math.abs(a.roll) < 0.99) nonTrivial++;
    }
    ok("!! the CPU twin is the independent restatement's to 1e-9 over 40 random weight-and-feature draws, and the f32 mirror of the GPU kernel's (mlpLayerCpu) to 1e-4 -- with answers that are not all at a clamp", worst < 1e-9 && mirror < 1e-4 && nonTrivial > 10, `worst ${worst.toExponential(1)}, mirror ${mirror.toExponential(1)}, ${nonTrivial} of 40 unsaturated`);
    const x = Array.from({ length: 20 }, () => rnd()), nanX = [...x]; nanX[3] = NaN; const zeroX = [...x]; zeroX[3] = 0;
    ok("!! a NaN in one feature reads as 0 and no more, and a vector of NaN or Infinity gives finite controls in range", KEYS.every((k) => MR.forward(w, nanX)[k] === MR.forward(w, zeroX)[k]) && KEYS.every((k) => Number.isFinite(MR.forward(w, x.map(() => NaN))[k]) && Number.isFinite(MR.forward(w, x.map(() => Infinity))[k])));
    const c = MR.controlsOf([50, 50, 50, 50]), c0 = MR.controlsOf([-50, -50, -50, -50]);
    ok("!! the outputs are clamped to each control's range (collective [0, 1]; cyclics and pedal [-1, 1]) and a non-finite output reads 0", c.collective === 1 && c.pitch === 1 && c.roll === 1 && c.yaw === 1 && c0.collective === 0 && c0.pitch === -1 && c0.roll === -1 && c0.yaw === -1 && KEYS.every((k) => MR.controlsOf([NaN, NaN, NaN, NaN])[k] === 0));
    const live = Float32Array.from(w), x2 = Array.from({ length: 20 }, () => rnd()), before = MR.forward(live, x2); live[O3 + 0 * W + 3] += 0.5; live[O2 + 5 * W + 7] -= 0.4;
    ok("!! the network re-reads a weight changed in place (a trainer that mutates a vector it has run is never run stale)", KEYS.some((k) => MR.forward(live, x2)[k] !== before[k]) && KEYS.every((k) => near(MR.forward(live, x2)[k], refForward(live, x2)[k], 1e-9)));
}

console.log("\n3. THE HAND WEIGHTS ARE THE HAND PILOT");
{
    const hw = MR.handWeights(), pw = PP.handWeights(), nz = []; hw.forEach((v, i) => { if (v !== 0) nz.push(i); });
    ok("!! 36 non-zero weights: 20 in the first layer (neurons 0..7, the fruit fly's pairs of channels), 8 in the second (an identity on neurons 0..7), 8 in the readout, and not one in a bias", nz.length === 36 && nz.filter((i) => i < B1).length === 20 && nz.filter((i) => i >= O2 && i < B2).length === 8 && nz.filter((i) => i >= O3 && i < B3).length === 8 && nz.every((i) => (i < B1 || (i >= O2 && i < B2) || (i >= O3 && i < B3))), `${nz.length}`);
    let sameIn = true; for (let h = 0; h < 8; h++) for (let q = 0; q < 20; q++) if (hw[O1 + h * 20 + q] !== pw[h * 20 + q]) sameIn = false;
    ok("!! the first-layer coefficients are the FRUIT FLY'S (PP.handWeights): the two brains start from the same laws, to the bit", sameIn);
    ok("the second layer is an identity on neurons 0..7 (relu of a relu is itself) and the readout reads the pairs back as +1 and -1", [0, 1, 2, 3, 4, 5, 6, 7].every((h) => hw[O2 + h * W + h] === 1) && [0, 1, 2, 3].every((o) => hw[O3 + o * W + 2 * o] === 1 && hw[O3 + o * W + 2 * o + 1] === -1));
    ok("the other 24 neurons of each layer have zero weights (the room a search has to grow into): the input rows of neurons 8..31, the second layer's rows and columns past 8, the readout's columns past 8", (() => { for (let h = 8; h < W; h++) { for (let q = 0; q < FE; q++) if (hw[O1 + h * FE + q] !== 0) return false; } for (let h = 0; h < W; h++) for (let k = 0; k < W; k++) if ((h >= 8 || k >= 8) && hw[O2 + h * W + k] !== 0) return false; for (let o = 0; o < OUT; o++) for (let k = 8; k < W; k++) if (hw[O3 + o * W + k] !== 0) return false; return true; })());
    const r = mulberry(13), u = (lo, hi) => lo + (hi - lo) * r(), pil = MR.pilotFor(hw);
    let worst = 0, outN = 0, terr = 0;
    for (let i = 0; i < 2000; i++) {
        const out = r() < 0.2, withT = r() < 0.5;
        const s = H.createState(model, { pos: [u(-50, 50), u(-50, 50), u(20, 400)], pitch: u(-0.6, 0.6), bank: u(-1.4, 1.4), heading: u(-3, 3), velocity: [u(-20, 20), u(-20, 20), u(-10, 10)], w: [u(-1, 1), u(-1, 1), u(-1, 1)], omega: u(24, 34), engine: out ? "out" : "running" });
        const k = r(), tg = k < 0.4 ? { pos: [u(-300, 300), u(-300, 300)], altitude: u(50, 300), heading: u(-3, 3) } : k < 0.7 ? { velocity: [u(-15, 15), u(-15, 15)], agl: u(10, 100) } : k < 0.85 ? { altitude: s.pos[2], land: true } : { pos: [u(-100, 100), u(-100, 100)], agl: u(5, 50), speed: u(5, 20) };
        const opts = withT ? { terrain: (x, y) => 30 * Math.sin(x / 80) + 20 * Math.cos(y / 60) } : {};
        const a = AR.pilot(s, tg, [0, 0, 0], opts), b = pil(s, tg, [0, 0, 0], opts);
        for (const q of KEYS) worst = Math.max(worst, Math.abs(a[q] - b[q]));
        if (out) outN++; if (withT) terr++;
    }
    ok("!! OVER 2,000 RANDOM STATES THE MLP'S FOUR CONTROLS ARE THE HAND PILOT'S to 2e-7 (any attitude to 80 degrees of bank, spin, climb and fall, rotor speed 24..34, the engine out in a fifth, four kinds of target, a terrain in half)", worst < 2e-7 && outN > 300 && terr > 900, `worst ${worst.toExponential(2)}`);
    ok("a gain override reaches the weights (the fruit fly's coefficient, carried through): handWeights({ kTheta: 3 }) has 0.3 in the pitch channel's pitch-error weight and -0.3 in its pair", near(MR.handWeights({ kTheta: 3 })[2 * 20 + 2], 0.3, 1e-6) && near(MR.handWeights({ kTheta: 3 })[3 * 20 + 2], -0.3, 1e-6));
}

console.log("\n4. THE SAME FLIGHT");
{
    const a = RT.evaluate(hand, RT.BASELINE_SET), b = RT.evaluate(MR.pilotFor(MR.handWeights()), RT.BASELINE_SET);
    ok("!! OVER THE RESERVE THE HAND-WEIGHTS MLP FLIES THE HAND PILOT'S FLIGHT: the same fingerprint of the states, the same tick count, the score to 1e-6 on every one of the 20 flights", a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint && r.ticks === b.runs[i].ticks && near(r.score, b.runs[i].score, 1e-6)), `${a.score.toFixed(6)} / ${b.score.toFixed(6)}`);
    const zeroPilot = MR.pilotFor(MR.zeroWeights()), zero = RT.fly(zeroPilot, RT.scenario(1, "hover"));
    ok("the zero weights output nothing and the helicopter falls", KEYS.every((k) => zeroPilot(H.createState(model, { pos: [0, 0, 100] }), { altitude: 100 })[k] === 0) && zero.status !== "airborne");
}

console.log("\n5. THE TRAINING FUNCTIONS");
{
    const hw = MR.handWeights(), rng = mulberry(3);
    const moved = Array.from({ length: 200 }, () => { const k = MR.mutate(hw, 0.3, rng, 4); let n = 0; for (let i = 0; i < k.length; i++) if (k[i] !== hw[i]) n++; return n; });
    ok("!! a sparse mutation moves 1 to maxK of the 1,860 weights: over 200 children with maxK 4 every child differs from its parent in 1..4 places, all four counts occur, and the parent is untouched; deterministic for a seed", moved.every((n) => n >= 1 && n <= 4) && [1, 2, 3, 4].every((n) => moved.includes(n)) && MR.handWeights().every((v, i) => v === hw[i]) && JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(9)))) === JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(9)))) && JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(9)))) !== JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(10)))));
    const one = [RT.scenario(2, "hover"), RT.scenario(2, "terrain")], t0 = MR.evaluate(hw, one).score, tr = MR.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one }), tr2 = MR.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one });
    ok("!! A SEARCH NEVER ENDS LOWER THAN IT STARTED ON ITS OWN SET, IS DETERMINISTIC FOR A SEED, AND COUNTS ITS MOVES (six iterations on two flights: at or above the hand score, the history opens at it, improved + neutral at most 6, a second run bit-identical)", tr.trainScore >= t0 - 1e-12 && near(tr.history[0].score, t0, 1e-12) && tr.improved + tr.neutral <= 6 && tr.weights.every((v, i) => v === tr2.weights[i]) && tr.trainScore === tr2.trainScore, `${t0.toFixed(4)} -> ${tr.trainScore.toFixed(4)}`);
    const seen = [], big = MR.train({ seed: 4, iters: 40, sigma: 3, trainSet: one, onIter: (i, s) => seen.push(s.score) });
    const increases = seen.reduce((n, s, i) => n + (s > (i ? seen[i - 1] : t0) + 1e-9 ? 1 : 0), 0);
    ok("!! THE SEARCH'S REPORT IS TRUE OF ITS WEIGHTS: forty iterations from the hand weights at sigma 3 return weights whose OWN score on the set is the trainScore it reports, never below the start, and `improved` is the number of times the score really rose (counted here from the per-iteration reports)", MR.evaluate(big.weights, one).score === big.trainScore && big.trainScore >= t0 - 1e-12 && big.improved === increases && big.improved > 0 && big.neutral > 0 && seen.length === 40, `${t0.toFixed(4)} -> ${big.trainScore.toFixed(4)}; ${big.improved} improved (${increases} seen), ${big.neutral} neutral`);
    const tr5 = MR.train({ seed: 5, iters: 6, sigma: 0.3, trainSet: one }), dflt = MR.evaluate(hw), tdz = MR.train({ seed: 1, iters: 0 });
    ok("!! the search's seed is its own (seed 5 and seed 4 end at different weights), and evaluate() AND train() DEFAULT TO THE TRAIN SET (28 scenarios: the hand MLP's -1.795278, the hand pilot's, pinned)", tr5.weights.some((v, i) => v !== tr.weights[i]) && near(dflt.score, -1.795278, 5e-6) && dflt.runs.length === 28 && near(tdz.trainScore, dflt.score, 1e-12), `${dflt.score.toFixed(6)}`);
    const pair = Float32Array.from(hw); pair[20 * 32 + 2] = 0.3; pair[2 * 20 + 0] = -0.1;
    const pp2 = MR.prune(pair, { trainSet: one });
    ok("!! PRUNE REPEATS UNTIL NOTHING MORE COMES BACK: a harmful bias on the pitch channel's first neuron (+0.3) and a weight that partly compensates it (-0.1, earlier in the vector) are not removable in one pass, and prune unwinds both (kept 0, the hand weights exactly, in more than one pass)", pp2.kept === 0 && pp2.moved === 2 && pp2.passes >= 2 && pp2.weights.every((v, i) => v === hw[i]), `kept ${pp2.kept} in ${pp2.passes} passes`);
    const dirty = Float32Array.from(hw); dirty[20 * 20 + 3] = 0.5; dirty[O2 + 12 * W + 13] = 0.3; dirty[O3 + 2 * W + 20] = -0.25;
    const pr = MR.prune(dirty, { trainSet: one });
    ok("!! PRUNE PUTS BACK EVERY WEIGHT THAT DOES NOT MATTER: the hand weights with three weights in the unused neurons (an input weight into neuron 20, a second-layer weight between two silent neurons, a readout weight from a silent neuron) come back as the hand weights exactly (moved 3, kept 0)", pr.moved === 3 && pr.kept === 0 && pr.weights.every((v, i) => v === hw[i]), `moved ${pr.moved} kept ${pr.kept}`);
    const needed = Float32Array.from(hw); needed[4 * 20 + 4] = 0.4;
    const pr2 = MR.prune(needed, { trainSet: one });
    ok("!! ...and KEEPS one that does: the roll channel's trim coefficient moved from 1 to 0.4 hurts, so prune leaves it (kept 1), at a score no worse than the input", pr2.kept === 1 && pr2.weights[84] === Float32Array.from([0.4])[0] && pr2.trainScore >= MR.evaluate(needed, one).score - 1e-12, `kept ${pr2.kept}`);
}

console.log(fails ? `\npilotRotorMlp-selfcheck: ${fails} FAILED` : "\npilotRotorMlp-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
