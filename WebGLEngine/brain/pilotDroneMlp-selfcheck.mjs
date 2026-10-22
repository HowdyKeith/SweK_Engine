// WebGLEngine/brain/pilotDroneMlp-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotDroneMlp-selfcheck.mjs      (~60 s)
//
// THE SIBLING GATE OF brain/pilotDroneMlp.mjs: the GPU Brain's plain multilayer perceptron (20 -> 32 -> 32 -> 4) as a quadrotor pilot, whose hand weights are the hand pilot written through eight relu channels of each layer. As for the fruit fly (brain/pilotDronePolicy-selfcheck.mjs),
// the claim worth a gate is "the weights ARE the hand pilot", and the network is held to an independent restatement written here (brain/pilotRotorMlp-selfcheck.mjs is the helicopter's, and the discipline is the same):
//
//   1  SHAPE          20 -> 32 -> 32 -> 4, 1,860 weights, the offsets of the five blocks, the features and outputs are the fruit fly's own (the same senses, the same four controls)
//   2  THE FORWARD PASS   random weights and random features: the CPU twin against an independent restatement (1e-9) and against mlpLayerCpu, the f32 mirror of the GPU kernel (1e-4); the clamps; a NaN feature is a 0; layersOf are VIEWS onto the weights
//   3  THE HAND WEIGHTS   30 non-zero weights in the layout the header gives, the first-layer coefficients the fruit fly's own, the second layer an identity on neurons 0..7; over 2,000 random states the four controls are the hand pilot's to 2e-7; the other 24 neurons of each layer are zero (the room a search grows into)
//   4  THE SAME FLIGHT    the hand-weights MLP flies the hand pilot's flight over the reserve: the same fingerprints on the hover, recovery and goto flights, the same outcome on the motor flights (tumbles)
//   5  THE TRAINING FUNCTIONS   a sparse mutation moves 1..maxK of the 1,860 weights; a search never ends lower than it started and is deterministic; prune restores a weight that does not matter and keeps one that does
//   12 THE NAMED PIECES   raw, the clamp, reportLines
//
// NOT IN THIS GATE: a GPU row. The GPU Brain's batched kernel (brain/mlp.js's BatchedMLP) is held to mlpLayerCpu for the aeroplane pilot in brain/pilotFlightGpu-selfcheck.mjs on a WebGPU adapter; this network has the same layer shape and is held here to the same mirror.
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import * as MR from "./pilotDroneMlp.mjs";
import * as PP from "./pilotDronePolicy.mjs";
import * as AD from "./autopilotDrone.mjs";
import * as DT from "./droneTask.mjs";
import * as Q from "../physics/mechanics/multirotorModel6dof.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const model = AD.defaultModel();
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KEYS = ["thrust", "pitch", "roll", "yaw"];
const hand = (s, t, w, c) => AD.pilot(s, t, w, c);
const W = 32, FE = 20, OUT = 4, O1 = 0, B1 = FE * W, O2 = B1 + W, B2 = O2 + W * W, O3 = B2 + W, B3 = O3 + OUT * W;

// ---- an independent restatement: dense layers, from the layout in the header alone ----------------------------------------------------------------------------------------------------------------------------
function refForward(w, x) {
    const relu = (v) => (v > 0 ? v : 0);
    const h1 = Array.from({ length: W }, (_, j) => { let s = w[B1 + j]; for (let q = 0; q < FE; q++) s += w[O1 + j * FE + q] * x[q]; return relu(s); });
    const h2 = Array.from({ length: W }, (_, j) => { let s = w[B2 + j]; for (let k = 0; k < W; k++) s += w[O2 + j * W + k] * h1[k]; return relu(s); });
    const y = Array.from({ length: OUT }, (_, o) => { let s = w[B3 + o]; for (let k = 0; k < W; k++) s += w[O3 + o * W + k] * h2[k]; return s; });
    const c = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    return { thrust: c(y[0], 0, 1), pitch: c(y[1], -1, 1), roll: c(y[2], -1, 1), yaw: c(y[3], -1, 1) };
}

console.log("pilotDroneMlp-selfcheck -- the GPU Brain's MLP as a quadrotor pilot\n");

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
    ok("!! the outputs are clamped to each control's range (thrust [0, 1]; cyclics and pedal [-1, 1]) and a non-finite output reads 0", c.thrust === 1 && c.pitch === 1 && c.roll === 1 && c.yaw === 1 && c0.thrust === 0 && c0.pitch === -1 && c0.roll === -1 && c0.yaw === -1 && KEYS.every((k) => MR.controlsOf([NaN, NaN, NaN, NaN])[k] === 0));
    const live = Float32Array.from(w), x2 = Array.from({ length: 20 }, () => rnd()), before = MR.forward(live, x2); live[O3 + 0 * W + 3] += 0.5; live[O2 + 5 * W + 7] -= 0.4;
    ok("!! the network re-reads a weight changed in place (a trainer that mutates a vector it has run is never run stale)", KEYS.some((k) => MR.forward(live, x2)[k] !== before[k]) && KEYS.every((k) => near(MR.forward(live, x2)[k], refForward(live, x2)[k], 1e-9)));
}

console.log("\n3. THE HAND WEIGHTS ARE THE HAND PILOT");
{
    const hw = MR.handWeights(), pw = PP.handWeights(), nz = []; hw.forEach((v, i) => { if (v !== 0) nz.push(i); });
    ok("!! 30 non-zero weights: 14 in the first layer (neurons 0..7, the fruit fly's pairs of channels: thrust 2 x 2, pitch 2 x 2, roll 2 x 2, yaw 2 x 1), 8 in the second (an identity on neurons 0..7), 8 in the readout, and not one in a bias", nz.length === 30 && nz.filter((i) => i < B1).length === 14 && nz.filter((i) => i >= O2 && i < B2).length === 8 && nz.filter((i) => i >= O3 && i < B3).length === 8 && nz.every((i) => (i < B1 || (i >= O2 && i < B2) || (i >= O3 && i < B3))), `${nz.length}`);
    let sameIn = true; for (let h = 0; h < 8; h++) for (let q = 0; q < 20; q++) if (hw[O1 + h * 20 + q] !== pw[h * 20 + q]) sameIn = false;
    ok("!! the first-layer coefficients are the FRUIT FLY'S (PP.handWeights): the two brains start from the same laws, to the bit", sameIn);
    ok("the second layer is an identity on neurons 0..7 (relu of a relu is itself) and the readout reads the pairs back as +1 and -1", [0, 1, 2, 3, 4, 5, 6, 7].every((h) => hw[O2 + h * W + h] === 1) && [0, 1, 2, 3].every((o) => hw[O3 + o * W + 2 * o] === 1 && hw[O3 + o * W + 2 * o + 1] === -1));
    ok("the other 24 neurons of each layer have zero weights (the room a search has to grow into): the input rows of neurons 8..31, the second layer's rows and columns past 8, the readout's columns past 8", (() => { for (let h = 8; h < W; h++) { for (let q = 0; q < FE; q++) if (hw[O1 + h * FE + q] !== 0) return false; } for (let h = 0; h < W; h++) for (let k = 0; k < W; k++) if ((h >= 8 || k >= 8) && hw[O2 + h * W + k] !== 0) return false; for (let o = 0; o < OUT; o++) for (let k = 8; k < W; k++) if (hw[O3 + o * W + k] !== 0) return false; return true; })());
    const r = mulberry(13), u = (lo, hi) => lo + (hi - lo) * r(), pil = MR.pilotFor(hw);
    let worst = 0, outN = 0, lowB = 0;
    for (let i = 0; i < 2000; i++) {
        const dead = r() < 0.2, health = [1, 1, 1, 1]; if (dead) health[Math.floor(r() * 4)] = 0;
        const s = Q.createState(model, { pos: [u(-50, 50), u(-50, 50), u(0.5, 200)], pitch: u(-1.2, 1.2), bank: u(-3, 3), heading: u(-3, 3), velocity: [u(-15, 15), u(-15, 15), u(-8, 8)], w: [u(-4, 4), u(-4, 4), u(-3, 3)], health, charge: u(0.05, 1) });
        const k = r(), tg = k < 0.4 ? { pos: [u(-100, 100), u(-100, 100)], altitude: u(5, 100), heading: u(-3, 3) } : k < 0.7 ? { velocity: [u(-8, 8), u(-8, 8)], altitude: u(5, 100) } : k < 0.85 ? { altitude: s.pos[2], land: true } : { altitude: u(5, 100), speed: u(2, 12), pos: [u(-50, 50), u(-50, 50)] };
        const a = AD.pilot(s, tg, [0, 0, 0], {}), b = pil(s, tg, [0, 0, 0], {});
        for (const q of KEYS) worst = Math.max(worst, Math.abs(a[q] - b[q]));
        if (dead) outN++; if (s.energy < 0.5 * 8e4) lowB++;
    }
    ok("!! OVER 2,000 RANDOM STATES THE MLP'S FOUR CONTROLS ARE THE HAND PILOT'S to 2e-7 (float32 weights): any attitude to 170 degrees of bank, spin to 4 rad/s, climb and fall, a motor out in a fifth of them, a battery of any charge, four kinds of target", worst < 2e-7 && outN > 300 && lowB > 600, `worst ${worst.toExponential(2)} (${outN} with a motor out, ${lowB} under half charge)`);
    const so = Q.createState(model, { pos: [0, 0, 40], velocity: [3, -2, 0] }), to = { pos: [60, 30], altitude: 40, heading: 0.4 }, oo = { maxTilt: 0.1, tiltLow: 0.05 };
    const pa = AD.pilot(so, to, [0, 0, 0], oo), pb = pil(so, to, [0, 0, 0], oo), pc = pil(so, to, [0, 0, 0], {});
    ok("!! THE PILOT'S OPTIONS REACH THE FEATURES: with the tilt limits tightened to 0.1 and 0.05 rad the network's controls are the hand pilot's with the same options (to 2e-7), and are NOT what it flies without them (a pitch of -0.18 against -0.80 for a point 60 m away)", KEYS.every((k) => near(pa[k], pb[k], 2e-7)) && Math.abs(pb.pitch - pc.pitch) > 0.3, `${pb.pitch.toFixed(4)} vs ${pc.pitch.toFixed(4)}`);
    ok("a gain override reaches the weights (the fruit fly's coefficient, carried through): handWeights({ wn: 7 }) quarters the pitch channel's pitch-error coefficient (kTheta ~ wn^2) and halves its rate coefficient (kQ ~ wn)", near(MR.handWeights({ wn: 7 })[2 * 20 + 1], 0.25 * hw[2 * 20 + 1], 1e-6) && near(MR.handWeights({ wn: 7 })[2 * 20 + 2], 0.5 * hw[2 * 20 + 2], 1e-6) && near(MR.handWeights({ wn: 7 })[3 * 20 + 1], -0.25 * hw[2 * 20 + 1], 1e-6));
}

console.log("\n4. THE SAME FLIGHT");
{
    const a = DT.evaluate(hand, DT.BASELINE_SET), b = DT.evaluate(MR.pilotFor(MR.handWeights()), DT.BASELINE_SET);
    const steady = a.runs.map((r, i) => [r, b.runs[i]]).filter(([r]) => r.kind !== "motor"), tumbles = a.runs.map((r, i) => [r, b.runs[i]]).filter(([r]) => r.kind === "motor");
    ok("!! OVER THE RESERVE THE HAND-WEIGHTS MLP FLIES THE HAND PILOT'S FLIGHT: on the 12 hover, recovery and goto flights the same fingerprint of the states, the same tick count and the score to 1e-6 (float32 weights) on every one -- not a similar score, the same flight", steady.length === 12 && steady.every(([r, s]) => r.fingerprint === s.fingerprint && r.ticks === s.ticks && near(r.score, s.score, 1e-6)), `${steady.filter(([r, s]) => r.fingerprint === s.fingerprint).length} of ${steady.length} fingerprints equal`);
    ok("...and on the 8 motor flights, which are tumbles (a spinning quadrotor amplifies the 1e-7 of float32 weights into a different tumble, said plainly), the same OUTCOME: every one is a crash for both pilots, with a cost within 0.8 of the other's", tumbles.length === 8 && tumbles.every(([r, s]) => r.status === s.status && r.settled === s.settled && Math.abs(r.score - s.score) < 0.8), tumbles.map(([r, s]) => `${r.score.toFixed(2)}/${s.score.toFixed(2)}`).join(" "));
    const zeroPilot = MR.pilotFor(MR.zeroWeights()), zero = DT.fly(zeroPilot, DT.scenario(1, "hover"));
    ok("the zero weights output nothing and the quadrotor falls", KEYS.every((k) => zeroPilot(Q.createState(model, { pos: [0, 0, 100] }), { altitude: 100 })[k] === 0) && zero.status !== "airborne");
}

// ---- a score whose interactions the gate controls, for prune's logic (prune takes `score` for it): eight weights with random pairwise and cubic interactions, from a seed -----------------------------------------------------
const SYN_IDX = [100, 150, 200, 250, 300, 350, 400, 450];
function synth(seed, hw) {
    const r = mulberry(seed), Q = SYN_IDX.map(() => SYN_IDX.map(() => (r() - 0.5) * 6)), g = SYN_IDX.map(() => (r() - 0.5) * 3);
    const T3 = Array.from({ length: 6 }, () => [Math.floor(r() * 8), Math.floor(r() * 8), Math.floor(r() * 8), (r() - 0.5) * 40]);
    const d0 = SYN_IDX.map(() => [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3][Math.floor(r() * 6)]);
    const w = Float32Array.from(hw); SYN_IDX.forEach((i, k) => { w[i] += d0[k]; });
    let calls = 0;
    const score = (x) => {
        calls++; const d = SYN_IDX.map((i) => x[i] - hw[i]); let s = 0;
        for (let a = 0; a < 8; a++) { s += g[a] * d[a]; for (let b = 0; b < 8; b++) s -= Q[a][b] * d[a] * d[b] * (a === b ? 1 : 0.5); }
        for (let c = 0; c < 6; c++) s += T3[c][3] * d[T3[c][0]] * d[T3[c][1]] * d[T3[c][2]];
        return s;
    };
    return { w, score, calls: () => calls };
}

console.log("\n5. THE TRAINING FUNCTIONS");
{
    const hw = MR.handWeights(), rng = mulberry(3);
    const moved = Array.from({ length: 200 }, () => { const k = MR.mutate(hw, 0.3, rng, 4); let n = 0; for (let i = 0; i < k.length; i++) if (k[i] !== hw[i]) n++; return n; });
    ok("!! a sparse mutation moves 1 to maxK of the 1,860 weights: over 200 children with maxK 4 every child differs from its parent in 1..4 places, all four counts occur, and the parent is untouched; deterministic for a seed", moved.every((n) => n >= 1 && n <= 4) && [1, 2, 3, 4].every((n) => moved.includes(n)) && MR.handWeights().every((v, i) => v === hw[i]) && JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(9)))) === JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(9)))) && JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(9)))) !== JSON.stringify(Array.from(MR.mutate(hw, 0.3, mulberry(10)))));
    const one = [DT.scenario(2, "hover"), DT.scenario(2, "goto")], t0 = MR.evaluate(hw, one).score, tr = MR.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one }), tr2 = MR.train({ seed: 4, iters: 6, sigma: 0.3, trainSet: one });
    ok("!! A SEARCH NEVER ENDS LOWER THAN IT STARTED ON ITS OWN SET, IS DETERMINISTIC FOR A SEED, AND COUNTS ITS MOVES (six iterations on two flights: at or above the hand score, the history opens at it, improved + neutral at most 6, a second run bit-identical)", tr.trainScore >= t0 - 1e-12 && near(tr.history[0].score, t0, 1e-12) && tr.improved + tr.neutral <= 6 && tr.weights.every((v, i) => v === tr2.weights[i]) && tr.trainScore === tr2.trainScore, `${t0.toFixed(4)} -> ${tr.trainScore.toFixed(4)}`);
    const start = MR.perturb(hw, 0.05, mulberry(8)), tz = MR.train({ seed: 4, iters: 0, start, trainSet: one });
    ok("a search with no iterations returns its start (the hand weights by default, a given `start` otherwise) at its own score", tz.weights.every((v, i) => v === start[i]) && MR.train({ seed: 1, iters: 0, trainSet: one }).weights.every((v, i) => v === hw[i]) && near(tz.trainScore, MR.evaluate(start, one).score, 1e-12));
    const na = MR.perturb(hw, 0.1, mulberry(5)), nb = MR.perturb(hw, 0.1, mulberry(5)), nc = MR.perturb(hw, 0.1, mulberry(6)), nz = MR.perturb(hw, 0, mulberry(5));
    const spread = (v) => { let s2 = 0; for (let i = 0; i < v.length; i++) s2 += (v[i] - hw[i]) ** 2; return Math.sqrt(s2 / v.length); };
    ok("!! noise is deterministic for a seed, different for another, absent at sigma 0, and scales with sigma: the spread of hand + noise about the hand weights is within 5% of sigma (0.1 and 0.3), and the copy is a new array", na.every((v, i) => v === nb[i]) && na.some((v, i) => v !== nc[i]) && nz.every((v, i) => v === hw[i]) && near(spread(na) / 0.1, 1, 0.05) && near(spread(MR.perturb(hw, 0.3, mulberry(5))) / 0.3, 1, 0.05) && na !== hw, `${(spread(na) / 0.1).toFixed(3)}`);
    const seen = [], big = MR.train({ seed: 4, iters: 40, sigma: 3, trainSet: one, onIter: (i, s) => seen.push(s.score) });
    const increases = seen.reduce((n, s, i) => n + (s > (i ? seen[i - 1] : t0) + 1e-9 ? 1 : 0), 0);
    ok("!! THE SEARCH'S REPORT IS TRUE OF ITS WEIGHTS: forty iterations from the hand weights at sigma 3 return weights whose OWN score on the set is the trainScore it reports, never below the start, and `improved` is the number of times the score really rose (counted here from the per-iteration reports)", MR.evaluate(big.weights, one).score === big.trainScore && big.trainScore >= t0 - 1e-12 && big.improved === increases && big.improved > 0 && big.neutral > 0 && seen.length === 40, `${t0.toFixed(4)} -> ${big.trainScore.toFixed(4)}; ${big.improved} improved (${increases} seen), ${big.neutral} neutral`);
    const tr5 = MR.train({ seed: 5, iters: 6, sigma: 0.3, trainSet: one }), dflt = MR.evaluate(hw), tdz = MR.train({ seed: 1, iters: 0 });
    ok("!! the search's seed is its own (seed 5 and seed 4 end at different weights), and evaluate() AND train() DEFAULT TO THE TRAIN SET (34 scenarios: the hand-weights MLP's -2.914164, pinned; the hand pilot's is -2.925885 -- the 12 motor flights are tumbles and 1e-7 of float32 makes a different tumble)", tr5.weights.some((v, i) => v !== tr.weights[i]) && near(dflt.score, -2.914164, 5e-6) && dflt.runs.length === 34 && near(tdz.trainScore, dflt.score, 1e-12), `${dflt.score.toFixed(6)}`);
    const sy = synth(1200, hw), spr = MR.prune(sy.w, { score: sy.score });
    const stillWorse = SYN_IDX.filter((i) => Math.abs(spr.weights[i] - hw[i]) > 1e-6).every((i) => { const x = Float32Array.from(spr.weights); x[i] = hw[i]; return sy.score(x) < spr.trainScore - 1e-9; });
    ok("!! PRUNE ENDS AT A FIXED POINT, AND GETS THERE IN MORE THAN ONE PASS WHEN IT HAS TO: on a score with interactions between eight weights (seed 1200: found by search, one the group test and a single one-at-a-time pass leave 3 weights on) prune ends with 2 kept in 3 passes, the score it reports is the weights' own, and putting back any ONE of the weights it kept lowers the score", spr.kept === 2 && spr.passes === 3 && spr.moved === 8 && stillWorse && spr.trainScore === sy.score(spr.weights), `kept ${spr.kept} of ${spr.moved} in ${spr.passes} passes`);
    const junk = Float32Array.from(hw); for (let k = 0; k < 300; k++) junk[600 + k] += 0.05 + 0.001 * k;
    const flat = { n: 0 }; const jr = MR.prune(junk, { score: (x) => { flat.n++; return 0; } });
    ok("!! PRUNE TESTS A BLOCK AT A TIME BEFORE IT TESTS A WEIGHT AT A TIME: 300 weights moved and none of them matters (a flat score) go back in THREE evaluations -- the starting score, the block, and the one-at-a-time loop's pass over what is left (nothing) -- not 300; the cost of a prune is what a flight over the set costs, and a search leaves a thousand weights moved", jr.kept === 0 && jr.moved >= 300 && flat.n <= 3 && jr.weights.every((v, i) => v === hw[i]), `${flat.n} evaluations for ${jr.moved} moved weights`);
    const half = Float32Array.from(hw); for (let k = 0; k < 300; k++) half[600 + k] += 0.05 + 0.001 * k; half[1100] += 1;
    const hcalls = { n: 0 }, hr = MR.prune(half, { score: (x) => { hcalls.n++; return 5 * (x[1100] - hw[1100]); } });
    ok("!! A BLOCK THAT FAILS IS HALVED, AND BOTH HALVES ARE TRIED: 300 weights that do not matter and one at the far end of the vector that does (a score of 5 x its deviation) -- the whole block fails, the first half (all harmless) goes back in ONE evaluation and the second is narrowed down to the one that matters in about two evaluations a level: under 30 evaluations in all, not 300, and the weights that matter stays", hr.kept === 1 && hr.moved === 301 && Math.abs(hr.weights[1100] - (hw[1100] + 1)) < 1e-6 && hr.weights.every((v, i) => i === 1100 || v === hw[i]) && hcalls.n <= 30, `${hcalls.n} evaluations`);
    const needed = Float32Array.from(hw); needed[4 * 20 + 3] = 2 * hw[4 * 20 + 3];
    const pr2 = MR.prune(needed, { trainSet: one });
    ok("!! ...and KEEPS one that does: the roll channel's bank-error coefficient doubled HELPS on these two flights (+0.0045), so prune leaves it (kept 1), at a score no worse than the input", pr2.kept === 1 && pr2.weights[83] === needed[83] && pr2.trainScore >= MR.evaluate(needed, one).score - 1e-12, `kept ${pr2.kept}`);
}

console.log("\n12. THE NAMED PIECES (raw, reportLines)");
{
    const w = MR.handWeights(), x = Array.from({ length: FE }, (_, i) => Math.sin(i + 1)), y = MR.raw(w, x), c = MR.controlsOf(y), fwd = MR.forward(w, x);
    ok("!! raw(w, x) is the network's four outputs BEFORE the clamp, and forward(w, x) is controlsOf(raw(w, x)) exactly", y.length === 4 && y.every(Number.isFinite) && KEYS.every((k) => c[k] === fwd[k]));
    const bad = x.slice(); bad[3] = NaN; bad[7] = Infinity; const zeroed = x.slice(); zeroed[3] = 0; zeroed[7] = 0;
    ok("!! a non-finite feature is read as 0 by raw: the outputs with NaN and Infinity in two inputs equal the outputs with those inputs zero, bit for bit, and are finite", MR.raw(w, bad).every((v, i) => v === MR.raw(w, zeroed)[i]) && MR.raw(w, bad).every(Number.isFinite));
    ok("!! with every weight zero raw is four exact zeros whatever the features", MR.raw(new Float64Array(w.length), x).every((v) => v === 0));
    const L = MR.reportLines();
    ok("!! reportLines() is the module's printed report: an array of strings opening with its own name, naming 20 -> 32 -> 32 -> 4 and 1860 weights", Array.isArray(L) && L.length >= 2 && L.every((l) => typeof l === "string") && L[0].startsWith("[pilotDroneMlp]") && /20 -> 32 -> 32 -> 4/.test(L[0]) && /1860 weights/.test(L[0]));
}

console.log(fails ? `\npilotDroneMlp-selfcheck: ${fails} FAILED` : "\npilotDroneMlp-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
