// WebGLEngine/brain/pilotFlightMlp-selfcheck.mjs
//
// Run: node brain/pilotFlightMlp-selfcheck.mjs      (~3 s)
//
// THE SIBLING GATE OF brain/pilotFlightMlp.mjs (v4870): the GPU Brain's pilot for real flight -- a plain MLP, 18 features -> 32 relu -> 32 relu -> 4, 1,796 weights -- whose hand weights are the PD autopilot written through
// eight relu channels of each layer. The CPU twin is held to an independent restatement written HERE and to render/brainTsl.mjs's f32 mirror of the GPU kernel; the hand weights to the autopilot and to the fruit fly's hand
// weights; and the training functions to what a (1+1)-ES from the autopilot must do. brain/pilotFlightGpu-selfcheck.mjs holds the GPU itself to this file's CPU twin.
//
//   1  shape: 18 -> 32 -> 32 -> 4, 1,796 weights = 576 + 32 + 1024 + 32 + 128 + 4, the layer views are views onto the weights, named features and outputs are the fruit fly's
//   2  THE FORWARD PASS: random weights and random features, the CPU twin against an independent restatement (1e-9) and against mlpLayerCpu, the f32 mirror of the GPU kernel (1e-4); the clamps; a NaN feature is a 0
//   3  THE HAND WEIGHTS ARE THE AUTOPILOT: 38 non-zero weights in the layout the header gives; over 300 random states the four controls are the autopilot's to 2e-6 and the fruit fly's hand weights' to 1e-9; the same flight
//      over the 18 baseline scenarios, the same score (-0.3577) and fingerprints as the fruit fly's
//   4  zero, noise: the zero weights output nothing and the aircraft falls; noise is deterministic for a seed and a noisy pilot still flies at 0.05
//   5  the training functions exist and answer for the autopilot (what they DO is held by brain/pilotFlightTrain-selfcheck.mjs, for this network and the fruit fly's)
//   6  the brain file round-trips through peerBrain and is refused by name by the other brain's importer (and refuses theirs); the front door
//
// SABOTAGE LOG (v4870) -- SIXTEEN, each applied to brain/pilotFlightMlp.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   A1 layer 1 has no relu 2 | A2 layer 2 has no relu 3 | A3 layer 3 gets a relu, outputs cannot be negative 6 | A4 layer 2's bias ignored 2 | A5 throttle clamped to [-1, 1] 3 | A6 pitch not clamped 3 | A7 a NaN feature not read as 0 1 |
//   A8 the readout layer given a relu in the GPU twin's layers 2 | A9 the second layer's view one short 2 | A10 the second layer passes seven of the eight channels 3 | A11 the readout's second channel not negated 4 |
//   A12 handWeights ignores its gains 1 | A13 the pilot ignores the wind 2 | A14 perturb spread doubled 1 | A15 the features are not the fruit fly's (feature 11 zeroed) 3 | A16 layer width 31 4.
//   mutate, train and prune of this network are the same functions as the fruit fly's and are held, for both, by brain/pilotFlightTrain-selfcheck.mjs.
"use strict";
import * as M from "./pilotFlightMlp.mjs";
import * as PF from "./pilotFlightPolicy.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as T from "./flightTask.mjs";
import * as PB from "./peerBrain.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const KEYS = ["pitch", "roll", "yaw", "throttle"];
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const model = AF.defaultModel(), LEVEL = Object.freeze({ altitude: 300, heading: 0, airspeed: 45 });
const TRIM_AT = (V, extra = {}) => F.createState({ speed: V, pitch: F.trim(model, V).pitchAttitude, ...extra });
const mix = (hw, seed) => { const r = mulberry(seed), w = M.zeroWeights(); for (let i = 0; i < w.length; i++) w[i] = (r() * 2 - 1) * 0.5; return w; };

// ---- an independent restatement of the network, from the layer sizes alone -------------------------------------------------------------------------------------------------------------------------
function refRaw(w, x) {
    const sizes = [18, 32, 32, 4]; let o = 0, h = Array.from(x, (v) => (Number.isFinite(v) ? v : 0));
    for (let l = 0; l < 3; l++) {
        const nIn = sizes[l], nOut = sizes[l + 1], W = w.subarray(o, o += nOut * nIn), b = w.subarray(o, o += nOut), y = [];
        for (let j = 0; j < nOut; j++) { let s = b[j]; for (let k = 0; k < nIn; k++) s += W[j * nIn + k] * h[k]; y.push(l < 2 ? Math.max(0, s) : s); }
        h = y;
    }
    return h;
}
const clampC = (v) => ({ pitch: Math.max(-1, Math.min(1, v[0])), roll: Math.max(-1, Math.min(1, v[1])), yaw: Math.max(-1, Math.min(1, v[2])), throttle: Math.max(0, Math.min(1, v[3])) });

console.log("pilotFlightMlp-selfcheck -- the GPU Brain's pilot for real flight\n");

console.log("1. SHAPE");
{
    ok("!! 18 features -> 32 -> 32 -> 4 and 1,796 weights (18*32 + 32 + 32*32 + 32 + 32*4 + 4)", M.FEATURES === 18 && M.WIDTH === 32 && M.OUTPUTS === 4 && M.WEIGHT_COUNT === 1796 && M.WEIGHT_COUNT === 18 * 32 + 32 + 32 * 32 + 32 + 32 * 4 + 4 && M.LAYER_SIZES.join() === "18,32,32,4" && Object.isFrozen(M.LAYER_SIZES) && M.HIDDEN === 32);
    ok("the features and the outputs are the FRUIT FLY'S (the same senses, the same four controls): the same names, in the same order", M.FEATURE_NAMES === PF.FEATURE_NAMES && M.OUTPUT_NAMES === PF.OUTPUT_NAMES && M.features === PF.features && M.featuresFrom === PF.featuresFrom);
    ok("the zero weights are all zero (and a fresh array each time)", M.zeroWeights().length === 1796 && M.zeroWeights().every((v) => v === 0) && M.zeroWeights() !== M.zeroWeights());
    const w = mix(null, 3), L = M.layersOf(w);
    ok("!! layersOf() is three brain/mlp.js layers (relu, relu, none) of the right shapes whose W and b are VIEWS onto the weights (a vector a trainer edits in place is the one the GPU is given): 576 + 32, 1024 + 32, 128 + 4", L.length === 3 && L.map((l) => `${l.nIn}x${l.nOut}:${l.W.length}+${l.b.length}:${l.act}`).join() === "18x32:576+32:relu,32x32:1024+32:relu,32x4:128+4:none" && L.every((l) => l.W.buffer === w.buffer && l.b.buffer === w.buffer) && L[0].W[0] === w[0] && L[2].b[3] === w[1795]);
}

console.log("\n2. THE FORWARD PASS");
{
    const rnd = mulberry(11); let worst = 0, worstF32 = 0;
    for (let i = 0; i < 60; i++) {
        const w = mix(null, 100 + i), x = Array.from({ length: 18 }, () => (rnd() * 2 - 1) * 3), y = M.raw(w, x), r = refRaw(w, x);
        worst = Math.max(worst, ...y.map((v, k) => Math.abs(v - r[k])));
        let h = Float32Array.from(x); for (const l of M.layersOf(w)) h = mlpLayerCpu(l, h, 1);
        worstF32 = Math.max(worstF32, ...Array.from(h).map((v, k) => Math.abs(v - y[k])));
    }
    ok("!! over 60 random networks and random features the CPU twin is an independent restatement of the three layers to 1e-9", worst < 1e-9, `worst ${worst.toExponential(2)}`);
    ok("!! ...and agrees with render/brainTsl.mjs's mlpLayerCpu chain, the f32 mirror of the GPU kernel, to 1e-4 (float32 accumulation against double)", worstF32 < 1e-4, `worst ${worstF32.toExponential(2)}`);
    const xf = PF.features(TRIM_AT(45), LEVEL), hw = M.handWeights();
    const nanIn = [...xf]; nanIn[11] = NaN; const zeroIn = [...xf]; zeroIn[11] = 0;
    ok("!! a NaN in ONE feature reads as 0 and no more: the output is exactly the one with that feature at 0", KEYS.every((q) => M.forward(hw, nanIn)[q] === M.forward(hw, zeroIn)[q]) && M.forward(hw, nanIn).throttle > 0.1);
    const big = M.zeroWeights(); big.set([5, -5, 5, -5], 1792);   // the output biases
    const wild = M.forward(hw, [NaN, Infinity, -Infinity, 1e30, -1e30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    ok("!! the outputs are CLAMPED: pitch, roll and yaw to [-1, 1] and the throttle to [0, 1] (output biases of +5, -5, +5, -5 give 1, -1, 1, 0), and a feature vector of NaN, infinity and 1e30 gives finite controls in range", JSON.stringify(M.forward(big, xf)) === JSON.stringify({ pitch: 1, roll: -1, yaw: 1, throttle: 0 }) && KEYS.every((k) => Number.isFinite(wild[k])) && Math.abs(wild.pitch) <= 1 && wild.throttle >= 0 && wild.throttle <= 1);
    ok("controlsOf() applies the same clamp to a raw output the GPU twin hands back, and reads a non-finite output as 0", JSON.stringify(M.controlsOf([9, -9, 0.25, 7])) === JSON.stringify({ pitch: 1, roll: -1, yaw: 0.25, throttle: 1 }) && JSON.stringify(M.controlsOf([NaN, Infinity, -Infinity, NaN])) === JSON.stringify({ pitch: 0, roll: 0, yaw: 0, throttle: 0 }) && JSON.stringify(clampC([9, -9, 0.25, -7])) === JSON.stringify(M.controlsOf([9, -9, 0.25, -7])));
    const live = Float32Array.from(hw), a1 = M.forward(live, xf); live[1792 + 3] += 0.2;
    ok("the network re-reads a weight changed IN PLACE after a forward pass (a trainer that mutates a vector it has already run does not fly a stale network), and the forward pass does not mutate the weights", M.forward(live, xf).throttle !== a1.throttle && hw.every((v, i) => v === M.handWeights()[i]));
}

console.log("\n3. THE HAND WEIGHTS ARE THE AUTOPILOT");
{
    const w = M.handWeights(), K = AF.AUTOPILOT_FLIGHT, nz = []; w.forEach((v, i) => { if (v !== 0) nz.push(i); });
    const O_W2 = 576 + 32, O_B2 = O_W2 + 1024, O_W3 = O_B2 + 32, O_B3 = O_W3 + 128;
    ok("!! 38 non-zero weights: 22 in the first layer (the fruit fly's pairs of channels, on neurons 0..7), 8 passing them through the second (an identity on neurons 0..7) and 8 reading them out; every bias is zero", nz.length === 38 && nz.filter((i) => i < 576).length === 22 && nz.filter((i) => i >= O_W2 && i < O_B2).length === 8 && nz.filter((i) => i >= O_W3 && i < O_B3).length === 8 && nz.filter((i) => i < 576).every((i) => Math.floor(i / 18) < 8) &&
        nz.every((i) => (i < 576) || (i >= O_W2 && i < O_B2) || (i >= O_W3 && i < O_B3)) && Array.from({ length: 8 }, (_, h) => w[O_W2 + h * 32 + h]).every((v) => v === 1));
    ok("!! the readout is +1 on the first neuron of each pair and -1 on the second (relu(z) - relu(-z) = z), and the first layer's coefficients are the fruit fly's own: pitch 1, 0.55, 0.35, -0.175 on features 1, 3, 4, 5; roll 1.1, -0.28 on 6, 7", [0, 1, 2, 3].every((o) => w[O_W3 + o * 32 + 2 * o] === 1 && w[O_W3 + o * 32 + 2 * o + 1] === -1) &&
        near(w[0 * 18 + 1], 1, 1e-6) && near(w[0 * 18 + 3], K.kBankInv, 1e-6) && near(w[0 * 18 + 4], K.kVsPitch, 1e-6) && near(w[0 * 18 + 5], -0.5 * K.kQ, 1e-6) && near(w[2 * 18 + 6], 0.5 * K.kBank, 1e-6) && near(w[2 * 18 + 7], -K.kP, 1e-6) && near(w[1 * 18 + 1], -1, 1e-6));
    ok("handWeights(gains) reaches the weights: kBank 3 puts 1.5 on the roll channel, and the default is the autopilot's own gains", near(M.handWeights({ kBank: 3 })[2 * 18 + 6], 1.5, 1e-6) && JSON.stringify(Array.from(M.handWeights())) === JSON.stringify(Array.from(M.handWeights({}))));
    const hand = M.pilotFor(w), pf = PF.pilotFor(PF.handWeights()), rnd = mulberry(4242); let worst = 0, worstPf = 0;
    for (let i = 0; i < 300; i++) {
        const st = F.createState({ speed: 30 + rnd() * 30, heading: rnd() * 6 - 3, pitch: rnd() - 0.5, bank: rnd() * 6 - 3, gamma: (rnd() - 0.5) * 0.5, w: [rnd() * 2 - 1, rnd() - 0.5, rnd() - 0.5] });
        const tg = { altitude: 300 + rnd() * 200 - 100, heading: rnd() * 6 - 3, airspeed: 38 + rnd() * 14 }, wv = [rnd() * 10 - 5, rnd() * 10 - 5, rnd() * 2 - 1];
        const a = AF.pilot(st, tg, wv), b = hand(st, tg, wv), c = pf(st, tg, wv);
        for (const k of KEYS) { worst = Math.max(worst, Math.abs(a[k] - b[k])); worstPf = Math.max(worstPf, Math.abs(c[k] - b[k])); }
    }
    ok("!! over 300 random states (any attitude, 30-60 m/s, spinning, in a wind, any target) the MLP's four controls are the autopilot's to 2e-6 (float32 weights) and the fruit fly's hand weights' to 1e-9: the two brains start from the same laws", worst < 2e-6 && worstPf < 1e-9, `vs the autopilot ${worst.toExponential(2)}, vs the fruit fly ${worstPf.toExponential(2)}`);
    let sum = 0, n = 0, crashed = 0, fp = 0;
    for (const sc of T.BASELINE_SET) { const a = T.fly(hand, sc), b = T.fly(pf, sc); sum += a.score; n++; if (a.status !== "airborne") crashed++; if (a.fingerprint === b.fingerprint) fp++; }
    ok("!! on the 18 BASELINE scenarios the hand MLP scores -0.3577 (the autopilot's pinned number), none ending early, and every flight has the fruit fly's hand weights' fingerprint", near(sum / n, -0.3577, 6e-5) && crashed === 0 && fp === 18, `${(sum / n).toFixed(4)}, ${fp} of 18 fingerprints`);
}

console.log("\n4. ZERO, NOISE");
{
    const c = M.pilotFor(M.zeroWeights())(TRIM_AT(45), LEVEL);
    ok("!! the zero weights output NOTHING: all four controls are exactly 0 and the aircraft falls (all 18 baseline scenarios end early)", KEYS.every((k) => c[k] === 0) && T.evaluate(M.pilotFor(M.zeroWeights()), T.BASELINE_SET).crashed === 18);
    const hw = M.handWeights(), p1 = M.perturb(hw, 0.05, mulberry(5)), p2 = M.perturb(hw, 0.05, mulberry(5)), p3 = M.perturb(hw, 0.05, mulberry(6)), big = M.perturb(hw, 0.5, mulberry(5));
    const sd = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
    ok("!! perturb() is deterministic for a seed, different for another, copies rather than edits, and its spread is sigma (0.05 -> within 15%; 0.5 -> 10x)", JSON.stringify(Array.from(p1)) === JSON.stringify(Array.from(p2)) && JSON.stringify(Array.from(p1)) !== JSON.stringify(Array.from(p3)) && hw.every((v, i) => v === M.handWeights()[i]) && near(sd(p1, hw), 0.05, 0.0075) && near(sd(big, hw), 0.5, 0.075));
    const noisy = T.evaluate(M.pilotFor(p1), T.BASELINE_SET), hand = T.evaluate(M.pilotFor(hw), T.BASELINE_SET);
    ok("!! a pilot with noise 0.05 on every weight STILL FLIES (no flight ends early) and scores worse than the hand pilot", noisy.crashed === 0 && noisy.score < hand.score - 0.05, `${noisy.score.toFixed(4)} vs ${hand.score.toFixed(4)}`);
}

console.log("\n5. THE TRAINING FUNCTIONS EXIST AND ANSWER FOR THE AUTOPILOT (brain/pilotFlightTrain-selfcheck.mjs holds what they do, for this network and the fruit fly's)");
{
    const hw = M.handWeights(), two = T.TRAIN_SET.slice(0, 2), t0 = M.train({ seed: 1, iters: 0, trainSet: two }), p0 = M.prune(hw, { trainSet: two });
    ok("!! train() with no iterations returns the hand weights untouched, scored on the scenarios it was given, and prune() of the hand weights moves and keeps nothing: the autopilot is where both start and where a prune ends", t0.weights.every((v, i) => v === hw[i]) && t0.improved === 0 && t0.neutral === 0 && t0.trainScore === M.evaluate(hw, two).score && p0.moved === 0 && p0.kept === 0 && p0.trainScore === t0.trainScore && typeof M.mutate === "function" && typeof M.perturb === "function");
}

console.log("\n6. THE BRAIN FILE AND THE FRONT DOOR");
{
    const DESC = PB.describePolicy("pilotFlightMlp", M), hw = M.handWeights();
    ok("the policy descriptor is { id, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT } = { pilotFlightMlp, 18, 32, 4, 1796 }", DESC.id === "pilotFlightMlp" && DESC.FEATURES === 18 && DESC.HIDDEN === 32 && DESC.OUTPUTS === 4 && DESC.WEIGHT_COUNT === 1796);
    const blob = PB.exportBrain(DESC, hw, { score: -0.3577, by: "the gate" }), back = PB.importBrain(DESC, JSON.parse(JSON.stringify(blob)));
    ok("!! exportBrain -> JSON -> importBrain gives back the same weights, bit for bit, and the score", back.ok && back.weights.length === 1796 && back.weights.every((v, i) => v === hw[i]) && back.meta.score === -0.3577);
    const fly = PB.exportBrain(PB.describePolicy("pilotFlightPolicy", PF), PF.handWeights(), { score: 0 });
    const a = PB.importBrain(DESC, fly), b = PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), blob);
    ok("!! a brain file for the FRUIT FLY is refused by this importer by name, and this brain's file is refused by the fruit fly's (a blob of one policy cannot be taken for another)", !a.ok && /pilotFlightPolicy/.test(a.reason) && /pilotFlightMlp/.test(a.reason) && !b.ok && /pilotFlightMlp/.test(b.reason), `${a.reason} | ${b.reason}`);
    const L = M.reportLines();
    ok("the front door names the module, the layer sizes and the 1,796 weights, says how many the hand weights use, and no line says NaN or undefined", L.some((l) => /pilotFlightMlp/.test(l) && /18 -> 32 -> 32 -> 4/.test(l) && /1796 weights/.test(l)) && L.some((l) => /38 of 1796 non-zero/.test(l)) && L.every((l) => !/NaN|undefined/.test(l)));
}

console.log(fails ? `\npilotFlightMlp-selfcheck: ${fails} FAILED` : "\npilotFlightMlp-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
